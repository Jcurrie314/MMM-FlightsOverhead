const NodeHelper = require("node_helper");
const https = require("https");

module.exports = NodeHelper.create({

	start: function () {
		this.routeCache = {};         // icao24 -> { departure, arrival, fetchedAt }
		this.routeRateLimitUntil = 0; // epoch ms — skip route fetches until this time
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "GET_FLIGHTS") {
			this.fetchFlights(payload);
		}
	},

	fetchFlights: async function (config) {
		try {
			const states  = await this.fetchStates(config);
			let flights   = this.processStates(states, config);

			if (config.showRoute && flights.length > 0 && Date.now() >= this.routeRateLimitUntil) {
				flights = await this.enrichWithRoutes(flights, config);
			}

			this.sendSocketNotification("FLIGHTS_DATA", flights);
		} catch (err) {
			console.error("MMM-FlightsOverhead:", err.message);
			this.sendSocketNotification("FLIGHTS_ERROR", err.message || "Fetch failed");
		}
	},

	// ─── OpenSky states ──────────────────────────────────────────────────────

	fetchStates: function (config) {
		const { lat, lon, radius, username, password } = config;
		const deltaLat = radius / 111;
		const deltaLon = radius / (111 * Math.cos(lat * Math.PI / 180));

		const query = [
			`lamin=${(lat - deltaLat).toFixed(4)}`,
			`lomin=${(lon - deltaLon).toFixed(4)}`,
			`lamax=${(lat + deltaLat).toFixed(4)}`,
			`lomax=${(lon + deltaLon).toFixed(4)}`,
		].join("&");

		return this.apiGet(`https://opensky-network.org/api/states/all?${query}`, username, password);
	},

	processStates: function (data, config) {
		const { lat, lon, minAltitudeFt, maxFlights, flightType } = config;
		const minAltM    = minAltitudeFt * 0.3048;
		const typeFilter = (flightType || "all").toLowerCase();

		if (!data || !data.states) return [];

		return data.states
			.filter(s => !s[8])                          // airborne
			.filter(s => s[5] !== null && s[6] !== null) // has position
			.filter(s => {
				const alt = s[7] !== null ? s[7] : s[13];
				return alt !== null && alt >= minAltM;
			})
			.filter(s => s[1] && s[1].trim().length > 0) // has callsign
			.filter(s => {
				if (typeFilter === "all") return true;
				return this.classifyCallsign(s[1]) === typeFilter;
			})
			.map(s => {
				const alt    = s[7] !== null ? s[7] : s[13];
				const distKm = this.haversine(lat, lon, s[6], s[5]);
				return {
					icao24:     s[0],
					callsign:   s[1].trim(),
					country:    s[2],
					altitudeFt: Math.round(alt * 3.28084),
					speedKt:    Math.round((s[9] || 0) * 1.94384),
					heading:    Math.round(s[10] || 0),
					compass:    this.toCompass(s[10] || 0),
					distanceMi: parseFloat((distKm * 0.621371).toFixed(1)),
				};
			})
			.sort((a, b) => a.distanceMi - b.distanceMi)
			.slice(0, maxFlights || 5);
	},

	// ─── Route enrichment ────────────────────────────────────────────────────

	enrichWithRoutes: async function (flights, config) {
		const now        = Math.floor(Date.now() / 1000);
		const cacheMaxAge = 2 * 60 * 60; // 2 hours — a flight's route doesn't change mid-air
		let firstUncached = true;

		for (const flight of flights) {
			// OpenSky only has route data for commercial (IFR) flights.
			// GA aircraft fly VFR without filed flight plans, so skip them.
			if (this.classifyCallsign(flight.callsign) !== "commercial") {
				flight.departure = null;
				flight.arrival   = null;
				continue;
			}

			const cached = this.routeCache[flight.icao24];
			if (cached && (now - cached.fetchedAt) < cacheMaxAge) {
				flight.departure = cached.departure;
				flight.arrival   = cached.arrival;
				continue;
			}

			// Stagger uncached requests to stay within OpenSky rate limits
			if (!firstUncached) await this.sleep(5000);
			firstUncached = false;

			try {
				const begin = now - (12 * 60 * 60);
				const url   = `https://opensky-network.org/api/flights/aircraft?icao24=${flight.icao24}&begin=${begin}&end=${now}`;
				const data  = await this.apiGet(url, config.username, config.password);
				const legs  = Array.isArray(data) ? data : [];

				// Prefer a leg with both airports; fall back to departure-only
				const leg = legs.filter(f => f.estDepartureAirport && f.estArrivalAirport).pop()
					|| legs.filter(f => f.estDepartureAirport).pop()
					|| legs.pop();

				const departure = leg ? (leg.estDepartureAirport || null) : null;
				const arrival   = leg ? (leg.estArrivalAirport   || null) : null;

				this.routeCache[flight.icao24] = { departure, arrival, fetchedAt: now };
				flight.departure = departure;
				flight.arrival   = arrival;
			} catch (e) {
				if (e.message === "HTTP 429") {
					this.routeRateLimitUntil = Date.now() + (10 * 60 * 1000);
					console.warn("MMM-FlightsOverhead: rate limited by OpenSky — pausing route lookups for 10 min");
				} else {
					console.error(`MMM-FlightsOverhead: route fetch failed for ${flight.callsign}: ${e.message}`);
				}
				flight.departure = null;
				flight.arrival   = null;
			}
		}

		return flights;
	},

	// ─── Helpers ─────────────────────────────────────────────────────────────

	/**
	 * Classify a callsign as "commercial", "ga", or "unknown".
	 * Commercial: ICAO airline code (2-3 letters + digits, e.g. SWA3576, UAL123, BAW7)
	 * GA:         Registration number (e.g. N5150D, G-ABCD, C-GABC)
	 */
	classifyCallsign: function (callsign) {
		if (!callsign) return "unknown";
		const cs = callsign.trim().toUpperCase();
		if (/^[A-Z]{2,3}\d/.test(cs)) return "commercial";
		if (/^[A-Z]\d/.test(cs) || /^[A-Z]-/.test(cs)) return "ga";
		return "unknown";
	},

	haversine: function (lat1, lon1, lat2, lon2) {
		const R    = 6371;
		const dLat = (lat2 - lat1) * Math.PI / 180;
		const dLon = (lon2 - lon1) * Math.PI / 180;
		const a    = Math.sin(dLat / 2) ** 2 +
			Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
			Math.sin(dLon / 2) ** 2;
		return R * 2 * Math.asin(Math.sqrt(a));
	},

	toCompass: function (degrees) {
		const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
		return dirs[Math.round(degrees / 45) % 8];
	},

	sleep: function (ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	},

	apiGet: function (url, username, password) {
		return new Promise((resolve, reject) => {
			const u    = new URL(url);
			const auth = Buffer.from(`${username}:${password}`).toString("base64");

			const options = {
				hostname: u.hostname,
				path:     u.pathname + u.search,
				method:   "GET",
				headers:  { "Authorization": `Basic ${auth}` },
			};

			const req = https.request(options, (res) => {
				let body = "";
				res.on("data", chunk => body += chunk);
				res.on("end", () => {
					if (res.statusCode === 404) { resolve([]); return; }
					if (res.statusCode >= 400)  { reject(new Error(`HTTP ${res.statusCode}`)); return; }
					if (!body || !body.trim())  { resolve(null); return; }
					try {
						resolve(JSON.parse(body));
					} catch (e) {
						resolve(null);
					}
				});
			});

			req.setTimeout(15000, () => req.destroy(new Error("Request timed out")));
			req.on("error", reject);
			req.end();
		});
	},
});

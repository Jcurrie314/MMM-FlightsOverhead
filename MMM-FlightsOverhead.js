/* global Module, Log */

Module.register("MMM-FlightsOverhead", {

	defaults: {
		clientId: null,       // OpenSky Network OAuth2 client ID
		clientSecret: null,   // OpenSky Network OAuth2 client secret
		lat: null,            // Your latitude  (decimal degrees, e.g. 37.7749)
		lon: null,            // Your longitude (decimal degrees, e.g. -122.4194)
		radius: 50,           // Search radius in km (~31 miles)
		minAltitudeFt: 5000,  // Ignore aircraft below this altitude (feet)
		maxFlights: 5,        // Maximum number of flights to display
		updateInterval: 60,   // Seconds between data refreshes
		initialLoadDelay: 0,  // Seconds to wait before the first fetch
		animationSpeed: 0,    // DOM update animation speed (ms)
		fontSize: "small",    // Text size: "xsmall", "small", "medium", "large"
		showRoute: true,      // Show departure → arrival airports (commercial flights only)
		flightType: "all",    // Filter by type: "all", "commercial", or "ga"
	},

	requiresVersion: "2.2.1",

	start: function () {
		var self = this;
		self.flights = [];
		self.loaded = false;
		self.errorMessage = null;

		if (!self.config.clientId || !self.config.clientSecret ||
			self.config.lat === null || self.config.lon === null) {
			Log.error("MMM-FlightsOverhead: clientId, clientSecret, lat, and lon are required.");
			return;
		}

		setTimeout(function () {
			self.getData();
			setInterval(function () { self.getData(); }, self.config.updateInterval * 1000);
		}, self.config.initialLoadDelay * 1000);
	},

	getData: function () {
		this.sendSocketNotification("GET_FLIGHTS", this.config);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "FLIGHTS_DATA") {
			this.flights = payload;
			this.errorMessage = null;
			this.loaded = true;
			this.updateDom(this.config.animationSpeed);
		} else if (notification === "FLIGHTS_ERROR") {
			this.errorMessage = payload;
			this.loaded = true;
			this.updateDom(this.config.animationSpeed);
		}
	},

	getStyles: function () {
		return ["MMM-FlightsOverhead.css"];
	},

	// Top-down plane SVG pointing north (0°), rotated to actual heading
	makePlaneIcon: function (heading) {
		var wrapper = document.createElement("div");
		wrapper.className = "flight-icon-wrapper";
		wrapper.style.transform = "rotate(" + heading + "deg)";
		wrapper.innerHTML = [
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="18" height="18">',
			'  <ellipse cx="16" cy="16" rx="2.5" ry="13" fill="currentColor"/>',
			'  <ellipse cx="16" cy="14" rx="13"  ry="2.5" fill="currentColor"/>',
			'  <ellipse cx="16" cy="26" rx="5.5" ry="1.8" fill="currentColor"/>',
			'</svg>',
		].join("");
		return wrapper;
	},

	formatAlt: function (ft) {
		return ft.toLocaleString() + " ft";
	},

	getDom: function () {
		var self = this;
		var wrapper = document.createElement("div");
		wrapper.className = self.config.fontSize;
		wrapper.style.width = "100%";

		if (!self.config.lat || !self.config.lon) {
			wrapper.innerHTML = '<span class="dimmed">lat and lon required.</span>';
			return wrapper;
		}

		if (!self.loaded) {
			wrapper.innerHTML = '<span class="loading">Loading&hellip;</span>';
			return wrapper;
		}

		if (self.errorMessage) {
			var err = document.createElement("div");
			err.className = "loading";
			err.innerText = self.errorMessage;
			wrapper.appendChild(err);
			return wrapper;
		}

		if (self.flights.length === 0) {
			var empty = document.createElement("div");
			empty.className = "flights-empty secondary-text";
			empty.innerText = "No flights overhead";
			wrapper.appendChild(empty);
			return wrapper;
		}

		var table = document.createElement("table");
		table.className = "flights-table";

		self.flights.forEach(function (flight) {
			// Row 1: icon + callsign (left) | route (center) | distance (right)
			var tr1 = document.createElement("tr");
			tr1.className = "flight-row-header";

			var iconTd = document.createElement("td");
			iconTd.className = "flight-icon";
			iconTd.appendChild(self.makePlaneIcon(flight.heading));
			tr1.appendChild(iconTd);

			var callTd = document.createElement("td");
			callTd.className = "flight-callsign";
			callTd.innerText = flight.callsign;
			tr1.appendChild(callTd);

			var routeTd = document.createElement("td");
			routeTd.className = "flight-route secondary-text";
			if (self.config.showRoute && flight.departure) {
				routeTd.innerText = flight.departure + " \u2192 " + (flight.arrival || "?");
			}
			tr1.appendChild(routeTd);

			var distTd = document.createElement("td");
			distTd.className = "flight-dist secondary-text";
			distTd.innerText = flight.distanceMi + " mi";
			tr1.appendChild(distTd);

			table.appendChild(tr1);

			// Row 2: altitude · speed · heading
			var tr2 = document.createElement("tr");
			tr2.className = "flight-row-details";

			var spacerTd = document.createElement("td");
			tr2.appendChild(spacerTd);

			var detailTd = document.createElement("td");
			detailTd.className = "flight-details secondary-text";
			detailTd.colSpan = 3;
			detailTd.innerText = self.formatAlt(flight.altitudeFt) +
				"  \u00b7  " + flight.speedKt + " kt" +
				"  \u00b7  " + flight.compass;
			tr2.appendChild(detailTd);

			table.appendChild(tr2);
		});

		wrapper.appendChild(table);
		return wrapper;
	},
});

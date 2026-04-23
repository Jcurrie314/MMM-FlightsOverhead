# MMM-FlightsOverhead

A [MagicMirror²](https://github.com/MichMich/MagicMirror) module that shows aircraft currently flying overhead using the free [OpenSky Network](https://opensky-network.org) API.

Displays each flight's callsign, altitude, speed, heading, distance, and (for commercial flights) departure → arrival airports. A small plane icon rotates to show the aircraft's actual heading.

![MMM-FlightsOverhead screenshot](screenshot.png)

---

## Features

- Live ADS-B data via the OpenSky Network REST API
- Rotating plane icon showing real heading
- Departure → arrival route for commercial flights
- Filter by flight type: all, commercial only, or general aviation only
- Configurable search radius, altitude floor, and max results
- Route results cached for 2 hours to minimise API usage
- Automatic 10-minute back-off if rate limited

---

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/Jcurrie314/MMM-FlightsOverhead.git
```

No `npm install` needed — no external dependencies.

---

## OpenSky Credentials

This module uses the OpenSky Network OAuth2 API. You'll need a free account and an API client:

1. Register at [opensky-network.org](https://opensky-network.org/index.php?option=com_users&view=registration)
2. Go to **Account → My OpenSky → API Client Credentials**
3. Create a new client — download the `credentials.json` file
4. Use the `clientId` and `clientSecret` values in your config

---

## Configuration

Add the module to your `config/config.js`:

```javascript
{
    module: "MMM-FlightsOverhead",
    position: "top_right",
    header: "Flights",
    config: {
        clientId: "your-client-id",
        clientSecret: "your-client-secret",
        lat: 37.7749,     // Your latitude
        lon: -122.4194,   // Your longitude
        radius: 50,       // Search radius in km (~31 miles)
        maxFlights: 5,    // Max rows to show
    }
}
```

---

## Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `clientId` | `null` | **Required.** OpenSky Network OAuth2 client ID |
| `clientSecret` | `null` | **Required.** OpenSky Network OAuth2 client secret |
| `lat` | `null` | **Required.** Your latitude (decimal degrees) |
| `lon` | `null` | **Required.** Your longitude (decimal degrees) |
| `radius` | `50` | Search radius in **km** (≈ 31 miles) |
| `minAltitudeFt` | `5000` | Ignore aircraft below this altitude (feet) |
| `maxFlights` | `5` | Maximum number of flights to display |
| `updateInterval` | `60` | Seconds between data refreshes |
| `showRoute` | `true` | Show `DEP → ARR` airports (commercial flights only) |
| `flightType` | `"all"` | Filter: `"all"`, `"commercial"`, or `"ga"` |
| `fontSize` | `"small"` | Text size: `"xsmall"`, `"small"`, `"medium"`, `"large"` |
| `initialLoadDelay` | `0` | Seconds before the first fetch |
| `animationSpeed` | `0` | DOM update animation speed (ms) |

---

## Notes on Routes

- Route data (`DEP → ARR`) is sourced from the OpenSky `/flights/aircraft` endpoint.
- **Only commercial (IFR) flights** have route data — general aviation typically flies VFR without a filed flight plan.
- Routes are cached for **2 hours** per aircraft to avoid burning API credits.
- If a flight is still in progress, OpenSky may not yet have the arrival airport; in that case the module shows `DEP → ?`.

---

## License

MIT

const { fetchNearbyFuelStations, fetchDrivingRoute } = require("../services/mapService");
const Station = require("../models/Station");

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function attachBackendStationIds(stations) {
  const mapped = await Promise.all(
    (stations || []).map(async (station) => {
      const lat = Number(station?.latitude);
      const lon = Number(station?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return station;
      const sourceId = String(station?.id || "").trim();
      if (!sourceId) return station;

      const doc = await Station.findOneAndUpdate(
        { externalSource: "osm", externalSourceId: sourceId },
        {
          $set: {
            name: String(station?.name || "Fuel Station").trim(),
            address: String(station?.address || "Address not listed").trim(),
            contact: String(station?.contact || "").trim(),
            location: { type: "Point", coordinates: [lon, lat] },
            isActive: true
          },
          $setOnInsert: {
            fuelStatus: "partial"
          }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true
        }
      );

      return {
        ...station,
        stationId: String(doc?._id || "")
      };
    })
  );

  return mapped;
}

exports.getNearbyFuelStations = async (req, res) => {
  try {
    const lat = parseNumber(req.query.lat);
    const lon = parseNumber(req.query.lon);
    const radius = parseNumber(req.query.radius) || 12000;
    if (lat === null || lon === null) {
      return res.status(400).json({ message: "lat and lon are required numeric query params." });
    }

    const stations = await fetchNearbyFuelStations(lat, lon, radius);
    const withBackendIds = await attachBackendStationIds(stations);
    return res.json({ stations: withBackendIds });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load nearby fuel stations." });
  }
};

exports.getDrivingRoute = async (req, res) => {
  try {
    const fromLat = parseNumber(req.query.fromLat);
    const fromLon = parseNumber(req.query.fromLon);
    const toLat = parseNumber(req.query.toLat);
    const toLon = parseNumber(req.query.toLon);
    if (fromLat === null || fromLon === null || toLat === null || toLon === null) {
      return res.status(400).json({ message: "fromLat, fromLon, toLat, and toLon are required numeric query params." });
    }

    const route = await fetchDrivingRoute(fromLat, fromLon, toLat, toLon);
    return res.json(route);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load driving route." });
  }
};

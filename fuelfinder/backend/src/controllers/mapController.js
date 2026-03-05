const { fetchNearbyFuelStations, fetchDrivingRoute } = require("../services/mapService");
const Station = require("../models/Station");

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeStationName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function areLikelySameStation(sourceName, dbName) {
  const a = normalizeStationName(sourceName);
  const b = normalizeStationName(dbName);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

async function findNearbyCanonicalStation(station) {
  const lat = Number(station?.latitude);
  const lon = Number(station?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const nearby = await Station.find({
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lon, lat] },
        $maxDistance: 120
      }
    }
  })
    .select("_id name externalSource externalSourceId")
    .limit(10)
    .lean();

  return (
    nearby.find((item) => areLikelySameStation(station?.name, item?.name)) ||
    nearby[0] ||
    null
  );
}

async function attachBackendStationIds(stations) {
  const mapped = await Promise.all(
    (stations || []).map(async (station) => {
      const lat = Number(station?.latitude);
      const lon = Number(station?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return station;
      const sourceId = String(station?.id || "").trim();
      if (!sourceId) return station;

      let doc = await Station.findOne({
        externalSource: "osm",
        externalSourceId: sourceId
      });

      if (!doc) {
        const canonical = await findNearbyCanonicalStation(station);
        if (canonical) {
          doc = await Station.findById(canonical._id);
          if (doc && (!doc.externalSource || !doc.externalSourceId)) {
            doc.externalSource = "osm";
            doc.externalSourceId = sourceId;
          }
        }
      }

      if (!doc) {
        doc = await Station.create({
          name: String(station?.name || "Fuel Station").trim(),
          address: String(station?.address || "Address not listed").trim(),
          contact: String(station?.contact || "").trim(),
          externalSource: "osm",
          externalSourceId: sourceId,
          fuelStatus: "partial",
          isActive: true,
          location: { type: "Point", coordinates: [lon, lat] }
        });
      } else {
        doc.name = String(station?.name || doc.name || "Fuel Station").trim();
        doc.address = String(station?.address || doc.address || "Address not listed").trim();
        doc.contact = String(station?.contact || doc.contact || "").trim();
        doc.location = { type: "Point", coordinates: [lon, lat] };
        doc.isActive = true;
        await doc.save();
      }

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

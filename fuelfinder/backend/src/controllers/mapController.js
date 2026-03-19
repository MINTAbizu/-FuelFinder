const mongoose = require("mongoose");
const { fetchNearbyFuelStations, fetchDrivingRoute } = require("../services/mapService");
const Station = require("../models/Station");
const { normalizePaymentDetails } = require("../utils/stationPaymentDetails");

const STATION_SYNC_SELECT =
  "_id name address contact externalSource externalSourceId fuelStatus fuelInventory paymentDetails isActive location";
const NEARBY_RESPONSE_CACHE_TTL_MS = 1000 * 45;
const MAX_NEARBY_RESPONSE_CACHE_ENTRIES = 120;

const nearbyStationsResponseCache = new Map();

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function buildNearbyResponseCacheKey(lat, lon, radius) {
  return [Number(lat).toFixed(3), Number(lon).toFixed(3), Math.round(Number(radius) || 0)].join(":");
}

function getCachedNearbyResponse(cacheKey) {
  const entry = nearbyStationsResponseCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

function setCachedNearbyResponse(cacheKey, value) {
  nearbyStationsResponseCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + NEARBY_RESPONSE_CACHE_TTL_MS
  });

  if (nearbyStationsResponseCache.size > MAX_NEARBY_RESPONSE_CACHE_ENTRIES) {
    const oldestKey = nearbyStationsResponseCache.keys().next().value;
    if (oldestKey) {
      nearbyStationsResponseCache.delete(oldestKey);
    }
  }
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

function isPlaceholderAddress(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (text === "address not listed") return true;
  return text.startsWith("approx location");
}

function mapFuelStatusForClient(value) {
  const text = String(value || "").trim().toLowerCase();
  if (text === "full" || text === "available") return "available";
  if (text === "partial" || text === "limited") return "limited";
  return "empty";
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
    .select(STATION_SYNC_SELECT)
    .limit(10)
    .lean();

  return nearby.find((item) => areLikelySameStation(station?.name, item?.name)) || nearby[0] || null;
}

function buildClientStationPayload(doc, fallback = {}) {
  const docCoords = Array.isArray(doc?.location?.coordinates) ? doc.location.coordinates : [];
  const docLon = Number(docCoords[0]);
  const docLat = Number(docCoords[1]);
  const fallbackLat = Number(fallback?.latitude);
  const fallbackLon = Number(fallback?.longitude);

  return {
    ...fallback,
    name: String(doc?.name || fallback?.name || "Fuel Station"),
    address: String(doc?.address || fallback?.address || "Address not listed"),
    contact: String(doc?.contact || fallback?.contact || ""),
    fuel_status: mapFuelStatusForClient(doc?.fuelStatus || fallback?.fuel_status || "partial"),
    fuelInventory: {
      gasolineLiters: Number(doc?.fuelInventory?.gasolineLiters || fallback?.fuelInventory?.gasolineLiters || 0),
      dieselLiters: Number(doc?.fuelInventory?.dieselLiters || fallback?.fuelInventory?.dieselLiters || 0),
      otherLiters: Number(doc?.fuelInventory?.otherLiters || fallback?.fuelInventory?.otherLiters || 0),
      updatedAt: doc?.fuelInventory?.updatedAt || fallback?.fuelInventory?.updatedAt || null
    },
    paymentDetails: normalizePaymentDetails(doc?.paymentDetails),
    latitude: Number.isFinite(docLat) ? docLat : (Number.isFinite(fallbackLat) ? fallbackLat : null),
    longitude: Number.isFinite(docLon) ? docLon : (Number.isFinite(fallbackLon) ? fallbackLon : null),
    stationId: String(doc?._id || fallback?.stationId || "")
  };
}

function buildStationSyncPatch(doc, station, sourceId, lat, lon) {
  const patch = {};
  const nextName = String(station?.name || doc?.name || "Fuel Station").trim();
  const nextContact = String(station?.contact || doc?.contact || "").trim();
  const incomingAddress = String(station?.address || "").trim();
  const currentAddress = String(doc?.address || "").trim();
  const currentCoords = Array.isArray(doc?.location?.coordinates) ? doc.location.coordinates : [];
  const currentLon = Number(currentCoords[0]);
  const currentLat = Number(currentCoords[1]);

  if (nextName && nextName !== String(doc?.name || "").trim()) {
    patch.name = nextName;
  }

  if (!String(doc?.externalSource || "").trim() || !String(doc?.externalSourceId || "").trim()) {
    patch.externalSource = "osm";
    patch.externalSourceId = sourceId;
  }

  if (!isPlaceholderAddress(incomingAddress)) {
    if (incomingAddress !== currentAddress) {
      patch.address = incomingAddress;
    }
  } else if (!currentAddress) {
    patch.address = incomingAddress || "Address not listed";
  }

  if (nextContact !== String(doc?.contact || "").trim()) {
    patch.contact = nextContact;
  }

  if (!Number.isFinite(currentLat) || !Number.isFinite(currentLon) || currentLat !== lat || currentLon !== lon) {
    patch.location = { type: "Point", coordinates: [lon, lat] };
  }

  if (doc?.isActive !== true) {
    patch.isActive = true;
  }

  return Object.keys(patch).length ? patch : null;
}

async function attachBackendStationIds(stations) {
  const sourceIds = Array.from(
    new Set(
      (stations || [])
        .map((station) => String(station?.id || "").trim())
        .filter(Boolean)
    )
  );

  const existingDocs = sourceIds.length
    ? await Station.find({
        externalSource: "osm",
        externalSourceId: { $in: sourceIds }
      })
        .select(STATION_SYNC_SELECT)
        .lean()
    : [];

  const docsBySourceId = new Map(
    existingDocs.map((doc) => [String(doc?.externalSourceId || "").trim(), doc])
  );

  const mappedStations = await Promise.all(
    (stations || []).map(async (station) => {
      const lat = Number(station?.latitude);
      const lon = Number(station?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return station;

      const sourceId = String(station?.id || "").trim();
      if (!sourceId) return station;

      let doc = docsBySourceId.get(sourceId) || null;

      if (!doc) {
        doc = await findNearbyCanonicalStation(station);
      }

      if (!doc) {
        const incomingAddress = String(station?.address || "").trim();
        const createdDoc = await Station.create({
          name: String(station?.name || "Fuel Station").trim(),
          address: incomingAddress || "Address not listed",
          contact: String(station?.contact || "").trim(),
          externalSource: "osm",
          externalSourceId: sourceId,
          fuelStatus: "partial",
          isActive: true,
          location: { type: "Point", coordinates: [lon, lat] }
        });

        const normalizedCreatedDoc =
          typeof createdDoc?.toObject === "function" ? createdDoc.toObject() : createdDoc;
        docsBySourceId.set(sourceId, normalizedCreatedDoc);

        return buildClientStationPayload(normalizedCreatedDoc, {
          ...station,
          latitude: lat,
          longitude: lon
        });
      }

      const patch = buildStationSyncPatch(doc, station, sourceId, lat, lon);
      if (patch) {
        await Station.updateOne({ _id: doc._id }, { $set: patch });
        doc = { ...doc, ...patch };
      }

      docsBySourceId.set(sourceId, doc);

      return buildClientStationPayload(doc, {
        ...station,
        latitude: lat,
        longitude: lon
      });
    })
  );

  return mappedStations;
}

exports.getNearbyFuelStations = async (req, res) => {
  try {
    const lat = parseNumber(req.query.lat);
    const lon = parseNumber(req.query.lon);
    const radius = parseNumber(req.query.radius) || 12000;
    if (lat === null || lon === null) {
      return res.status(400).json({ message: "lat and lon are required numeric query params." });
    }

    const cacheKey = buildNearbyResponseCacheKey(lat, lon, radius);
    const cachedStations = getCachedNearbyResponse(cacheKey);
    if (cachedStations) {
      return res.json({ stations: cachedStations });
    }

    const stations = await fetchNearbyFuelStations(lat, lon, radius);
    const withBackendIds = await attachBackendStationIds(stations);
    setCachedNearbyResponse(cacheKey, withBackendIds);
    return res.json({ stations: withBackendIds });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load nearby fuel stations." });
  }
};

exports.getStationDetails = async (req, res) => {
  try {
    const stationId = String(req.params.stationId || "").trim();
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const station = await Station.findById(stationId).lean();
    if (!station) {
      return res.status(404).json({ message: "Station not found." });
    }

    return res.json({
      station: buildClientStationPayload(station)
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load station details." });
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

const mongoose = require("mongoose");
const { fetchNearbyFuelStations, fetchDrivingRoute } = require("../services/mapService");
const Station = require("../models/Station");
const QueueTicket = require("../models/QueueTicket");
const { normalizePaymentDetails } = require("../utils/stationPaymentDetails");

const STATION_SYNC_SELECT =
  "_id name address contact externalSource externalSourceId fuelStatus fuelInventory paymentDetails isActive location regionId cityId subcity woreda landmark locationCategories";
const NEARBY_RESPONSE_CACHE_TTL_MS = 1000 * 45;
const MAX_NEARBY_RESPONSE_CACHE_ENTRIES = 120;
const DEFAULT_NEARBY_RADIUS_METERS = 12000;
const MAX_NEARBY_RADIUS_METERS = 50000;
const MAX_NEARBY_RESULTS = 100;
const PUBLIC_QUEUE_STATUSES = ["waiting", "called"];

const nearbyStationsResponseCache = new Map();

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeNearbyRadius(value) {
  const parsed = parseNumber(value);
  if (parsed === null || parsed <= 0) {
    return DEFAULT_NEARBY_RADIUS_METERS;
  }
  return Math.min(Math.round(parsed), MAX_NEARBY_RADIUS_METERS);
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

function hasMeaningfulCoordinateChange(currentLat, currentLon, nextLat, nextLon) {
  if (!Number.isFinite(currentLat) || !Number.isFinite(currentLon)) return true;
  return Math.abs(currentLat - nextLat) > 0.00001 || Math.abs(currentLon - nextLon) > 0.00001;
}

function isDuplicateKeyBulkWriteError(error) {
  if (error?.code === 11000) return true;
  if (!Array.isArray(error?.writeErrors)) return false;
  return error.writeErrors.every((writeError) => writeError?.code === 11000);
}

function normalizeSupportedFuels(value) {
  const source = value && typeof value === "object" ? value : {};
  const gasoline = source.gasoline === true;
  const diesel = source.diesel === true;
  const other = source.other === true;
  const unknown = source.unknown === true || !(gasoline || diesel || other);

  return {
    gasoline,
    diesel,
    other,
    unknown
  };
}

function deriveSupportedFuels(doc, fallback = {}) {
  const gasoline = Number(doc?.fuelInventory?.gasolineLiters || 0) > 0;
  const diesel = Number(doc?.fuelInventory?.dieselLiters || 0) > 0;
  const other = Number(doc?.fuelInventory?.otherLiters || 0) > 0;

  if (gasoline || diesel || other) {
    return normalizeSupportedFuels({ gasoline, diesel, other, unknown: false });
  }

  return normalizeSupportedFuels(fallback?.supportedFuels);
}

function normalizeQueueLength(value) {
  const queueLength = Number(value);
  if (!Number.isFinite(queueLength) || queueLength < 0) return 0;
  return Math.round(queueLength);
}

function buildClientStationPayload(doc, fallback = {}) {
  const docCoords = Array.isArray(doc?.location?.coordinates) ? doc.location.coordinates : [];
  const docLon = Number(docCoords[0]);
  const docLat = Number(docCoords[1]);
  const fallbackLat = Number(fallback?.latitude);
  const fallbackLon = Number(fallback?.longitude);
  const stationId =
    String(doc?._id || fallback?.stationId || fallback?._id || fallback?.id || "").trim();
  const publicId = stationId || String(fallback?.id || "").trim();
  const distanceMeters = Number(doc?.distanceMeters ?? fallback?.distanceMeters);

  return {
    id: publicId,
    stationId,
    name: String(doc?.name || fallback?.name || "Fuel Station"),
    address: String(doc?.address || fallback?.address || "Address not listed"),
    contact: String(doc?.contact || fallback?.contact || ""),
    fuel_status: mapFuelStatusForClient(doc?.fuelStatus || fallback?.fuel_status || "partial"),
    fuelInventory: {
      gasolineLiters: Number(
        doc?.fuelInventory?.gasolineLiters || fallback?.fuelInventory?.gasolineLiters || 0
      ),
      dieselLiters: Number(
        doc?.fuelInventory?.dieselLiters || fallback?.fuelInventory?.dieselLiters || 0
      ),
      otherLiters: Number(doc?.fuelInventory?.otherLiters || fallback?.fuelInventory?.otherLiters || 0),
      updatedAt: doc?.fuelInventory?.updatedAt || fallback?.fuelInventory?.updatedAt || null
      },
      supportedFuels: deriveSupportedFuels(doc, fallback),
      paymentDetails: normalizePaymentDetails(doc?.paymentDetails || fallback?.paymentDetails),
      regionId: doc?.regionId ? String(doc.regionId) : null,
      cityId: doc?.cityId ? String(doc.cityId) : null,
      subcity: String(doc?.subcity || fallback?.subcity || ""),
      woreda: String(doc?.woreda || fallback?.woreda || ""),
      landmark: String(doc?.landmark || fallback?.landmark || ""),
      locationCategories: Array.isArray(doc?.locationCategories)
        ? doc.locationCategories
        : (Array.isArray(fallback?.locationCategories) ? fallback.locationCategories : []),
      latitude: Number.isFinite(docLat) ? docLat : (Number.isFinite(fallbackLat) ? fallbackLat : null),
      longitude: Number.isFinite(docLon) ? docLon : (Number.isFinite(fallbackLon) ? fallbackLon : null),
      queue_length: normalizeQueueLength(
        doc?.queue_length ?? doc?.queueLength ?? fallback?.queue_length ?? fallback?.queueLength
      ),
    distanceMeters: Number.isFinite(distanceMeters) ? Math.round(distanceMeters) : null,
    isActive:
      doc?.isActive !== undefined
        ? Boolean(doc.isActive)
        : fallback?.isActive !== undefined
          ? Boolean(fallback.isActive)
          : true
  };
}

function buildStationInsertPayload(station, sourceId, lat, lon) {
  const incomingAddress = String(station?.address || "").trim();

  return {
    name: String(station?.name || "Fuel Station").trim(),
    address: incomingAddress || "Address not listed",
    contact: String(station?.contact || "").trim(),
    externalSource: "osm",
    externalSourceId: sourceId,
    fuelStatus: "partial",
    isActive: true,
    location: { type: "Point", coordinates: [lon, lat] }
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

  if (hasMeaningfulCoordinateChange(currentLat, currentLon, lat, lon)) {
    patch.location = { type: "Point", coordinates: [lon, lat] };
  }

  return Object.keys(patch).length ? patch : null;
}

async function attachBackendStationIds(stations) {
  const normalizedStations = (stations || []).map((station) => {
    const sourceId = String(station?.id || "").trim();
    const lat = Number(station?.latitude);
    const lon = Number(station?.longitude);

    return {
      station,
      sourceId,
      lat,
      lon
    };
  });

  const sourceIds = Array.from(
    new Set(
      normalizedStations
        .map((entry) => entry.sourceId)
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

  const createOperations = [];
  const missingSourceIds = [];
  const missingSourceIdSet = new Set();

  normalizedStations.forEach(({ station, sourceId, lat, lon }) => {
    if (!sourceId || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (docsBySourceId.has(sourceId)) return;
    if (missingSourceIdSet.has(sourceId)) return;

    missingSourceIdSet.add(sourceId);
    missingSourceIds.push(sourceId);
    createOperations.push({
      updateOne: {
        filter: {
          externalSource: "osm",
          externalSourceId: sourceId
        },
        update: {
          $setOnInsert: buildStationInsertPayload(station, sourceId, lat, lon)
        },
        upsert: true
      }
    });
  });

  if (createOperations.length) {
    try {
      await Station.bulkWrite(createOperations, { ordered: false });
    } catch (error) {
      if (!isDuplicateKeyBulkWriteError(error)) {
        throw error;
      }
    }

    const createdDocs = await Station.find({
      externalSource: "osm",
      externalSourceId: { $in: missingSourceIds }
    })
      .select(STATION_SYNC_SELECT)
      .lean();

    createdDocs.forEach((doc) => {
      docsBySourceId.set(String(doc?.externalSourceId || "").trim(), doc);
    });
  }

  const updateOperations = [];
  normalizedStations.forEach(({ station, sourceId, lat, lon }) => {
    if (!sourceId || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const doc = docsBySourceId.get(sourceId);
    if (!doc) return;

    const patch = buildStationSyncPatch(doc, station, sourceId, lat, lon);
    if (!patch) return;

    updateOperations.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: patch }
      }
    });

    docsBySourceId.set(sourceId, { ...doc, ...patch });
  });

  if (updateOperations.length) {
    await Station.bulkWrite(updateOperations, { ordered: false });
  }

  return normalizedStations.map(({ station, sourceId, lat, lon }) => {
    const doc = docsBySourceId.get(sourceId);
    if (!doc) {
      return buildClientStationPayload(
        {},
        {
          ...station,
          latitude: Number.isFinite(lat) ? lat : station?.latitude,
          longitude: Number.isFinite(lon) ? lon : station?.longitude
        }
      );
    }

    return buildClientStationPayload(doc, {
      ...station,
      latitude: lat,
      longitude: lon
    });
  });
}

async function queryNearbyStationsFromDatabase(lat, lon, radius, limit = MAX_NEARBY_RESULTS) {
  const now = new Date();

  const stations = await Station.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [lon, lat]
        },
        distanceField: "distanceMeters",
        maxDistance: radius,
        spherical: true,
        query: { isActive: true }
      }
    },
    {
      $sort: {
        distanceMeters: 1,
        updatedAt: -1
      }
    },
    {
      $limit: limit
    },
    {
      $lookup: {
        from: QueueTicket.collection.name,
        let: { stationId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$stationId", "$$stationId"] },
                  { $in: ["$status", PUBLIC_QUEUE_STATUSES] },
                  {
                    $or: [
                      { $eq: [{ $ifNull: ["$expiresAt", null] }, null] },
                      { $gt: ["$expiresAt", now] }
                    ]
                  }
                ]
              }
            }
          },
          {
            $count: "count"
          }
        ],
        as: "queueStats"
      }
    },
    {
      $addFields: {
        queue_length: { $ifNull: [{ $first: "$queueStats.count" }, 0] }
      }
    },
    {
      $project: {
        queueStats: 0
      }
    }
  ]);

  return stations.map((station) =>
    buildClientStationPayload(station, {
      distanceMeters: station.distanceMeters,
      queue_length: station.queue_length
    })
  );
}

async function bootstrapNearbyStationsFromExternal(lat, lon, radius) {
  const stations = await fetchNearbyFuelStations(lat, lon, radius);
  return attachBackendStationIds(stations);
}

async function loadNearbyStations(lat, lon, radius) {
  const localStations = await queryNearbyStationsFromDatabase(lat, lon, radius);
  if (localStations.length) {
    return localStations;
  }

  const bootstrappedStations = await bootstrapNearbyStationsFromExternal(lat, lon, radius);
  const hydratedStations = await queryNearbyStationsFromDatabase(lat, lon, radius);
  return hydratedStations.length ? hydratedStations : bootstrappedStations;
}

exports.getNearbyFuelStations = async (req, res) => {
  try {
    const lat = parseNumber(req.query.lat);
    const lon = parseNumber(req.query.lon);
    const radius = normalizeNearbyRadius(req.query.radius);
    if (lat === null || lon === null) {
      return res.status(400).json({ message: "lat and lon are required numeric query params." });
    }

    const cacheKey = buildNearbyResponseCacheKey(lat, lon, radius);
    const cachedStations = getCachedNearbyResponse(cacheKey);
    if (cachedStations) {
      return res.json({ stations: cachedStations });
    }

    const stations = await loadNearbyStations(lat, lon, radius);
    setCachedNearbyResponse(cacheKey, stations);
    return res.json({ stations });
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
      return res.status(400).json({
        message: "fromLat, fromLon, toLat, and toLon are required numeric query params."
      });
    }

    const route = await fetchDrivingRoute(fromLat, fromLon, toLat, toLon);
    return res.json(route);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load driving route." });
  }
};

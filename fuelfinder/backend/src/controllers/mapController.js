const mongoose = require("mongoose");
const { fetchNearbyFuelStations, fetchDrivingRoute } = require("../services/mapService");
const Station = require("../models/Station");
const QueueTicket = require("../models/QueueTicket");
const City = require("../models/City");
const Region = require("../models/Region");
const Woreda = require("../models/Woreda");
const { normalizePaymentDetails } = require("../utils/stationPaymentDetails");

const STATION_SYNC_SELECT =
  "_id name address contact externalSource externalSourceId fuelStatus fuelInventory paymentDetails isActive location regionId cityId woredaId subcity woreda landmark locationCategories";
const NEARBY_RESPONSE_CACHE_TTL_MS = 1000 * 45;
const MAX_NEARBY_RESPONSE_CACHE_ENTRIES = 120;
const DEFAULT_NEARBY_RADIUS_METERS = 12000;
const MAX_NEARBY_RADIUS_METERS = 50000;
const MAX_NEARBY_RESULTS = 100;
const DEFAULT_DIRECTORY_LIMIT = 24;
const DEFAULT_DIRECTORY_STATION_LIMIT = 120;
const MAX_DIRECTORY_LIMIT = 250;
const PUBLIC_QUEUE_STATUSES = ["waiting", "called"];

const nearbyStationsResponseCache = new Map();

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeDirectoryLimit(value, fallback = DEFAULT_DIRECTORY_LIMIT) {
  const parsed = parseNumber(value);
  if (parsed === null || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.round(parsed), MAX_DIRECTORY_LIMIT);
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function deriveFuelStatusFromInventory(inventory) {
  const gasoline = Number(inventory?.gasolineLiters || 0);
  const diesel = Number(inventory?.dieselLiters || 0);
  const other = Number(inventory?.otherLiters || 0);
  const total = gasoline + diesel + other;
  if (total <= 0) return "empty";
  if (total <= 300) return "partial";
  return "full";
}

function hasManagedFuelInventory(inventory) {
  const gasoline = Number(inventory?.gasolineLiters || 0);
  const diesel = Number(inventory?.dieselLiters || 0);
  const other = Number(inventory?.otherLiters || 0);
  return Boolean(inventory?.updatedAt) || gasoline > 0 || diesel > 0 || other > 0;
}

function resolveFuelStatusForClient(doc, fallback = {}) {
  const inventory = doc?.fuelInventory || fallback?.fuelInventory || {};
  if (doc?._id && hasManagedFuelInventory(inventory)) {
    return mapFuelStatusForClient(deriveFuelStatusFromInventory(inventory));
  }

  return mapFuelStatusForClient(doc?.fuelStatus || fallback?.fuel_status || "partial");
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

function buildRegionDirectoryPayload(region) {
  if (!region?._id) return null;
  return {
    id: String(region._id),
    name: String(region.name || ""),
    slug: String(region.slug || ""),
    code: String(region.code || "")
  };
}

function buildPublicCityPayload(city) {
  if (!city?._id) return null;
  return {
    id: String(city._id),
    name: String(city.name || ""),
    slug: String(city.slug || ""),
    code: String(city.code || ""),
    regionId: city.regionId ? String(city.regionId) : null
  };
}

function buildPublicWoredaPayload(woreda) {
  if (!woreda?._id) return null;
  return {
    id: String(woreda._id),
    name: String(woreda.name || ""),
    slug: String(woreda.slug || ""),
    code: String(woreda.code || ""),
    category: String(woreda.category || "woreda"),
    regionId: woreda.regionId ? String(woreda.regionId) : null,
    cityId: woreda.cityId ? String(woreda.cityId) : null
  };
}

function resolveDirectoryRecord(value, directoryMap) {
  if (value && typeof value === "object" && value._id) return value;
  const key = String(value || "").trim();
  if (!key || !directoryMap) return null;
  return directoryMap.get(key) || null;
}

function normalizeAddressPart(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function pushUniqueAddressPart(parts, seen, value) {
  const text = normalizeAddressPart(value);
  if (!text) return;
  if (isPlaceholderAddress(text)) return;
  const key = text.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  parts.push(text);
}

function splitAddressParts(address) {
  return String(address || "")
    .split(",")
    .map((part) => normalizeAddressPart(part))
    .filter(Boolean);
}

function buildStationDisplayAddress(doc, fallback = {}, directory = {}) {
  const regionRecord = resolveDirectoryRecord(doc?.regionId || fallback?.regionId, directory.regions);
  const cityRecord = resolveDirectoryRecord(doc?.cityId || fallback?.cityId, directory.cities);
  const woredaRecord = resolveDirectoryRecord(doc?.woredaId || fallback?.woredaId, directory.woredas);
  const rawAddress = String(doc?.address || fallback?.address || "").trim();
  const parts = [];
  const seen = new Set();

  if (!isPlaceholderAddress(rawAddress)) {
    splitAddressParts(rawAddress).forEach((part) => pushUniqueAddressPart(parts, seen, part));
  }

  pushUniqueAddressPart(parts, seen, doc?.landmark || fallback?.landmark);
  pushUniqueAddressPart(parts, seen, doc?.subcity || fallback?.subcity);
  pushUniqueAddressPart(parts, seen, doc?.woreda || fallback?.woreda || woredaRecord?.name);
  pushUniqueAddressPart(parts, seen, cityRecord?.name);
  pushUniqueAddressPart(parts, seen, regionRecord?.name);

  if (parts.length) {
    return parts.join(", ");
  }

  if (rawAddress && !isPlaceholderAddress(rawAddress)) {
    return rawAddress;
  }

  return "Address not listed";
}

async function loadStationDirectoryMaps(stations = []) {
  const regionIds = new Set();
  const cityIds = new Set();
  const woredaIds = new Set();

  (Array.isArray(stations) ? stations : []).forEach((station) => {
    const regionId = String(station?.regionId || "").trim();
    const cityId = String(station?.cityId || "").trim();
    const woredaId = String(station?.woredaId || "").trim();
    if (regionId && mongoose.isValidObjectId(regionId)) regionIds.add(regionId);
    if (cityId && mongoose.isValidObjectId(cityId)) cityIds.add(cityId);
    if (woredaId && mongoose.isValidObjectId(woredaId)) woredaIds.add(woredaId);
  });

  const [regions, cities, woredas] = await Promise.all([
    regionIds.size
      ? Region.find({ _id: { $in: Array.from(regionIds) } })
          .select("_id name slug code")
          .lean()
      : [],
    cityIds.size
      ? City.find({ _id: { $in: Array.from(cityIds) } })
          .select("_id name slug code regionId")
          .lean()
      : [],
    woredaIds.size
      ? Woreda.find({ _id: { $in: Array.from(woredaIds) } })
          .select("_id name slug code category regionId cityId")
          .lean()
      : []
  ]);

  return {
    regions: new Map(regions.map((item) => [String(item._id), item])),
    cities: new Map(cities.map((item) => [String(item._id), item])),
    woredas: new Map(woredas.map((item) => [String(item._id), item]))
  };
}

function buildCityDirectoryPayload(city, stats = {}, region = null) {
  if (!city?._id) return null;
  const latitude = Number(stats.latitude);
  const longitude = Number(stats.longitude);
  return {
    id: String(city._id),
    name: String(city.name || ""),
    slug: String(city.slug || ""),
    code: String(city.code || ""),
    regionId: city.regionId ? String(city.regionId) : null,
    region: buildRegionDirectoryPayload(region),
    stationCount: Number(stats.stationCount || 0),
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null
  };
}

function buildClientStationPayload(doc, fallback = {}, directory = {}) {
  const docCoords = Array.isArray(doc?.location?.coordinates) ? doc.location.coordinates : [];
  const docLon = Number(docCoords[0]);
  const docLat = Number(docCoords[1]);
  const fallbackLat = Number(fallback?.latitude);
  const fallbackLon = Number(fallback?.longitude);
  const stationId =
    String(doc?._id || fallback?.stationId || fallback?._id || fallback?.id || "").trim();
  const publicId = stationId || String(fallback?.id || "").trim();
  const distanceMeters = Number(doc?.distanceMeters ?? fallback?.distanceMeters);
  const regionRecord = resolveDirectoryRecord(doc?.regionId || fallback?.regionId, directory.regions);
  const cityRecord = resolveDirectoryRecord(doc?.cityId || fallback?.cityId, directory.cities);
  const woredaRecord = resolveDirectoryRecord(doc?.woredaId || fallback?.woredaId, directory.woredas);
  const displayAddress = buildStationDisplayAddress(doc, fallback, directory);

  return {
    id: publicId,
    stationId,
    name: String(doc?.name || fallback?.name || "Fuel Station"),
    address: displayAddress,
    rawAddress: String(doc?.address || fallback?.address || "Address not listed"),
    contact: String(doc?.contact || fallback?.contact || ""),
    fuel_status: resolveFuelStatusForClient(doc, fallback),
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
      region: buildRegionDirectoryPayload(regionRecord),
      cityId: doc?.cityId ? String(doc.cityId) : null,
      city: buildPublicCityPayload(cityRecord),
      woredaId: doc?.woredaId ? String(doc.woredaId) : null,
      woredaDirectory: buildPublicWoredaPayload(woredaRecord),
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

  const directory = await loadStationDirectoryMaps(stations);

  return stations.map((station) =>
    buildClientStationPayload(station, {
      distanceMeters: station.distanceMeters,
      queue_length: station.queue_length
    }, directory)
  );
}

async function queryDirectoryStations(matchQuery, limit = DEFAULT_DIRECTORY_STATION_LIMIT) {
  const now = new Date();

  const stations = await Station.aggregate([
    {
      $match: matchQuery
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
    },
    {
      $sort: {
        name: 1,
        updatedAt: -1
      }
    },
    {
      $limit: limit
    }
  ]);

  const directory = await loadStationDirectoryMaps(stations);

  return stations.map((station) =>
    buildClientStationPayload(station, {
      queue_length: station.queue_length
    }, directory)
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

exports.listDirectoryCities = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const regionId = String(req.query.regionId || "").trim();
    const limit = normalizeDirectoryLimit(req.query.limit, DEFAULT_DIRECTORY_LIMIT);

    if (regionId && !mongoose.isValidObjectId(regionId)) {
      return res.status(400).json({ message: "regionId must be a valid ObjectId." });
    }

    const cityQuery = { isActive: true };
    if (regionId) {
      cityQuery.regionId = regionId;
    }
    if (q) {
      cityQuery.name = { $regex: escapeRegex(q), $options: "i" };
    }

    const cities = await City.find(cityQuery)
      .select("_id name slug code regionId")
      .sort({ name: 1 })
      .limit(limit * 4)
      .lean();

    if (!cities.length) {
      return res.json({ total: 0, cities: [] });
    }

    const cityIds = cities.map((city) => city._id);
    const regionIds = Array.from(
      new Set(cities.map((city) => String(city.regionId || "")).filter(Boolean))
    );

    const [stats, regions] = await Promise.all([
      Station.aggregate([
        {
          $match: {
            isActive: true,
            cityId: { $in: cityIds }
          }
        },
        {
          $group: {
            _id: "$cityId",
            stationCount: { $sum: 1 },
            longitude: { $avg: { $arrayElemAt: ["$location.coordinates", 0] } },
            latitude: { $avg: { $arrayElemAt: ["$location.coordinates", 1] } }
          }
        }
      ]),
      Region.find({ _id: { $in: regionIds } })
        .select("_id name slug code")
        .lean()
    ]);

    const statsByCityId = new Map(
      stats.map((item) => [String(item._id), item])
    );
    const regionsById = new Map(
      regions.map((region) => [String(region._id), region])
    );

    const payload = cities
      .map((city) => buildCityDirectoryPayload(city, statsByCityId.get(String(city._id)), regionsById.get(String(city.regionId))))
      .filter((city) => city && city.stationCount > 0)
      .sort((a, b) => {
        if (b.stationCount !== a.stationCount) {
          return b.stationCount - a.stationCount;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);

    return res.json({
      total: payload.length,
      cities: payload
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load city directory." });
  }
};

exports.listDirectoryStations = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const regionId = String(req.query.regionId || "").trim();
    const cityId = String(req.query.cityId || "").trim();
    const limit = normalizeDirectoryLimit(req.query.limit, DEFAULT_DIRECTORY_STATION_LIMIT);

    if (regionId && !mongoose.isValidObjectId(regionId)) {
      return res.status(400).json({ message: "regionId must be a valid ObjectId." });
    }
    if (cityId && !mongoose.isValidObjectId(cityId)) {
      return res.status(400).json({ message: "cityId must be a valid ObjectId." });
    }

    const matchQuery = { isActive: true };
    if (regionId) {
      matchQuery.regionId = new mongoose.Types.ObjectId(regionId);
    }
    if (cityId) {
      matchQuery.cityId = new mongoose.Types.ObjectId(cityId);
    }
    if (q) {
      const regex = new RegExp(escapeRegex(q), "i");
      matchQuery.$or = [
        { name: regex },
        { address: regex },
        { subcity: regex },
        { woreda: regex },
        { landmark: regex }
      ];
    }

    const stations = await queryDirectoryStations(matchQuery, limit);
    return res.json({
      total: stations.length,
      stations
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load station directory." });
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

    const directory = await loadStationDirectoryMaps([station]);

    return res.json({
      station: buildClientStationPayload(station, {}, directory)
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

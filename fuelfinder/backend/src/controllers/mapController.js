const mongoose = require("mongoose");
const {
  fetchNearbyFuelStations,
  fetchDrivingRoute,
  reverseGeocodeStationLocation
} = require("../services/mapService");
const { syncBundledStationsForCity } = require("../services/curatedCityStationService");
const Station = require("../models/Station");
const QueueTicket = require("../models/QueueTicket");
const City = require("../models/City");
const Region = require("../models/Region");
const Woreda = require("../models/Woreda");
const slugify = require("../utils/slugify");
const { buildFuelPricesResponse } = require("../utils/stationFuelPrices");
const { normalizePaymentDetails } = require("../utils/stationPaymentDetails");
const {
  applyStationTypeFilter,
  getStationTypeForResponse,
  normalizeStationType
} = require("../utils/stationType");
const {
  asLocationText,
  ensureRegionByName,
  ensureCityByName,
  ensureWoredaByName,
  normalizeLocationCategories,
  normalizeRegionName
} = require("../utils/locationDirectory");

const STATION_SYNC_SELECT =
  "_id name address contact stationType externalSource externalSourceId fuelStatus fuelInventory fuelPrices paymentDetails reservationCooldownDays isActive location regionId cityId woredaId subcity woreda landmark locationCategories";
const NEARBY_RESPONSE_CACHE_TTL_MS = 1000 * 45;
const MAX_NEARBY_RESPONSE_CACHE_ENTRIES = 120;
const DEFAULT_NEARBY_RADIUS_METERS = 12000;
const MAX_NEARBY_RADIUS_METERS = 50000;
const MAX_NEARBY_RESULTS = 100;
const DEFAULT_DIRECTORY_LIMIT = 24;
const DEFAULT_DIRECTORY_STATION_LIMIT = 120;
const MAX_DIRECTORY_LIMIT = 250;
const MAX_LIVE_ADDRESS_ENRICHMENTS = 20;
const PUBLIC_QUEUE_STATUSES = ["waiting", "called"];
const CITY_SLUG_ALIASES = new Map([
  ["addis-abeba", "addis-ababa"],
  ["awassa", "hawassa"],
  ["asela", "asella"],
  ["shashamane", "shashemene"],
  ["shashamene", "shashemene"],
  ["deberh-berhan", "debre-birhan"]
]);

const nearbyStationsResponseCache = new Map();

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function parseBooleanQuery(value, defaultValue = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
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

function normalizeCitySearchSlug(value) {
  const raw = slugify(asLocationText(value));
  return CITY_SLUG_ALIASES.get(raw) || raw;
}

function buildCityFallbackTerms(value) {
  const rawName = asLocationText(value);
  if (!rawName) return [];

  const normalized = normalizeCitySearchSlug(rawName);
  const aliasTerms = Array.from(CITY_SLUG_ALIASES.entries())
    .filter(([alias, canonical]) => alias === normalized || canonical === normalized)
    .flatMap(([alias, canonical]) => [alias, canonical])
    .map((item) => String(item || "").replace(/-/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set([rawName, ...aliasTerms]));
}

function normalizeNearbyRadius(value) {
  const parsed = parseNumber(value);
  if (parsed === null || parsed <= 0) {
    return DEFAULT_NEARBY_RADIUS_METERS;
  }
  return Math.min(Math.round(parsed), MAX_NEARBY_RADIUS_METERS);
}

function buildNearbyResponseCacheKey(lat, lon, radius, stationType = "", preferLive = false) {
  return [
    Number(lat).toFixed(3),
    Number(lon).toFixed(3),
    Math.round(Number(radius) || 0),
    normalizeStationType(stationType) || "all",
    preferLive ? "live" : "db"
  ].join(":");
}

function getCachedNearbyResponse(cacheKey) {
  const entry = nearbyStationsResponseCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    nearbyStationsResponseCache.delete(cacheKey);
    return null;
  }
  if (Array.isArray(entry.value) && entry.value.some((station) => hasWeakStationAddress(station))) {
    nearbyStationsResponseCache.delete(cacheKey);
    return null;
  }
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
  const electric = source.electric === true;
  const unknown = source.unknown === true || !(gasoline || diesel || other || electric);

  return {
    gasoline,
    diesel,
    other,
    electric,
    unknown
  };
}

function deriveSupportedFuels(doc, fallback = {}) {
  const stationType = getStationTypeForResponse(doc?.stationType || fallback?.stationType);
  if (stationType === "electric") {
    return normalizeSupportedFuels({ electric: true, unknown: false });
  }

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
  const stationName = String(doc?.name || fallback?.name || "").trim();
  const parts = [];
  const seen = new Set();

  if (
    rawAddress &&
    !isPlaceholderAddress(rawAddress) &&
    rawAddress.toLowerCase() !== stationName.toLowerCase()
  ) {
    splitAddressParts(rawAddress).forEach((part) => pushUniqueAddressPart(parts, seen, part));
  }

  pushUniqueAddressPart(parts, seen, doc?.landmark || fallback?.landmark);
  pushUniqueAddressPart(parts, seen, doc?.subcity || fallback?.subcity);
  pushUniqueAddressPart(parts, seen, doc?.woreda || fallback?.woreda || woredaRecord?.name);
  pushUniqueAddressPart(parts, seen, cityRecord?.name || fallback?.cityName);
  pushUniqueAddressPart(parts, seen, regionRecord?.name || fallback?.regionName);

  if (parts.length) {
    return parts.join(", ");
  }

  if (rawAddress && !isPlaceholderAddress(rawAddress)) {
    return rawAddress;
  }

  return "Address not listed";
}

function hasWeakStationAddress(station) {
  const rawAddress = String(station?.address || "").trim();
  const stationName = String(station?.name || "").trim().toLowerCase();
  if (!rawAddress) return true;
  if (isPlaceholderAddress(rawAddress)) return true;
  return Boolean(stationName) && rawAddress.toLowerCase() === stationName;
}

function normalizePlaceName(value) {
  const text = asLocationText(value);
  if (!text) return "";

  const parts = text
    .split("/")
    .map((item) => asLocationText(item))
    .filter(Boolean);
  const latinPart = parts.find((item) => /[A-Za-z]/.test(item));
  return latinPart || parts[0] || text;
}

function inferRegionCategory(name) {
  const normalized = normalizePlaceName(name).toLowerCase();
  return normalized === "addis ababa" || normalized === "dire dawa"
    ? "chartered_city"
    : "regional_state";
}

function inferWoredaCategory(value) {
  const normalized = normalizePlaceName(value).toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("district") || normalized.includes("kebele")) return "district";
  if (
    normalized.includes("subcity") ||
    ["arada", "bole", "yeka", "kirkos", "lideta", "gullele", "akaky kaliti"].includes(normalized)
  ) {
    return "subcity";
  }
  return "woreda";
}

async function resolveDirectoryLocationFromGeocode(geo) {
  const regionName = normalizePlaceName(geo?.regionName);
  const cityName = normalizePlaceName(geo?.cityName);
  const woredaName = normalizePlaceName(geo?.woredaName);

  if (!regionName || !cityName) {
    return {
      regionId: null,
      cityId: null,
      woredaId: null,
      woredaName
    };
  }

  const region = await ensureRegionByName(regionName, {
    category: inferRegionCategory(regionName)
  });

  const city = await ensureCityByName({
    name: cityName,
    regionId: region._id
  });

  let woredaId = null;
  let resolvedWoredaName = woredaName;
  if (woredaName) {
    const woreda = await ensureWoredaByName({
      name: woredaName,
      regionId: region._id,
      cityId: city._id,
      category: inferWoredaCategory(woredaName)
    });
    woredaId = String(woreda._id);
    resolvedWoredaName = woreda.name;
  }

  return {
    regionId: String(region._id),
    cityId: String(city._id),
    woredaId,
    woredaName: resolvedWoredaName
  };
}

async function findRegionByLooseName(name) {
  const slug = slugify(normalizeRegionName(name));
  if (!slug) return null;
  return Region.findOne({ slug })
    .select("_id name slug code")
    .lean();
}

async function findCityByLooseName(name, regionId = "") {
  const slug = normalizeCitySearchSlug(name);
  if (!slug) return null;

  const query = { slug };
  if (regionId) {
    query.regionId = regionId;
  }

  const matches = await City.find(query)
    .select("_id name slug code regionId")
    .sort({ name: 1 })
    .limit(2)
    .lean();

  return matches.length === 1 ? matches[0] : null;
}

async function resolveDirectoryLocationFromStationSeed(station = {}) {
  const regionName = normalizePlaceName(station?.regionName);
  const cityName = normalizePlaceName(station?.cityName);
  const woredaName = normalizePlaceName(station?.woredaName || station?.woreda);

  if (regionName && cityName) {
    return resolveDirectoryLocationFromGeocode({ regionName, cityName, woredaName });
  }

  if (cityName) {
    const matchedCity = await findCityByLooseName(cityName);
    if (matchedCity) {
      let woredaId = null;
      let resolvedWoredaName = woredaName;
      const matchedRegionId = String(matchedCity.regionId || "");

      if (woredaName && matchedRegionId) {
        const woreda = await ensureWoredaByName({
          name: woredaName,
          regionId: matchedRegionId,
          cityId: matchedCity._id,
          category: inferWoredaCategory(woredaName)
        });
        woredaId = String(woreda._id);
        resolvedWoredaName = woreda.name;
      }

      return {
        regionId: matchedRegionId || null,
        cityId: String(matchedCity._id),
        woredaId,
        woredaName: resolvedWoredaName
      };
    }
  }

  if (regionName) {
    const matchedRegion = await findRegionByLooseName(regionName);
    if (matchedRegion) {
      return {
        regionId: String(matchedRegion._id),
        cityId: null,
        woredaId: null,
        woredaName
      };
    }
  }

  return {
    regionId: null,
    cityId: null,
    woredaId: null,
    woredaName
  };
}

async function resolveLiveStationSyncContext(station = {}, lat, lon) {
  const fallbackAddress = asLocationText(station?.address);
  let nextAddress = fallbackAddress;
  let nextSubcity = normalizePlaceName(station?.subcity);
  let nextWoreda = normalizePlaceName(station?.woreda);
  let location = await resolveDirectoryLocationFromStationSeed({
    regionName: station?.regionName,
    cityName: station?.cityName,
    woredaName: nextWoreda
  });

  const needsGeocode =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    (!location?.cityId || !location?.regionId || isPlaceholderAddress(nextAddress) || !nextSubcity || !nextWoreda);

  if (needsGeocode) {
    try {
      const geo = await reverseGeocodeStationLocation(lat, lon);
      if (geo && (!geo.countryCode || geo.countryCode === "ET")) {
        const geocodedLocation = await resolveDirectoryLocationFromGeocode(geo);
        location = {
          regionId: location?.regionId || geocodedLocation.regionId,
          cityId: location?.cityId || geocodedLocation.cityId,
          woredaId: location?.woredaId || geocodedLocation.woredaId,
          woredaName: location?.woredaName || geocodedLocation.woredaName
        };

        if (isPlaceholderAddress(nextAddress)) {
          nextAddress = asLocationText(geo.address) || nextAddress;
        }
        if (!nextSubcity) {
          nextSubcity = normalizePlaceName(geo.subcity);
        }
        if (!nextWoreda) {
          nextWoreda = normalizePlaceName(geocodedLocation.woredaName || geo.woredaName);
        }
      }
    } catch (_error) {
      // Keep live station sync resilient even if reverse geocoding is unavailable.
    }
  }

  return {
    address: nextAddress || "Address not listed",
    subcity: nextSubcity,
    woreda: nextWoreda || normalizePlaceName(location?.woredaName),
    regionId: location?.regionId || null,
    cityId: location?.cityId || null,
    woredaId: location?.woredaId || null,
    locationCategories: normalizeLocationCategories(station?.locationCategories)
  };
}

function buildStationAddressPatchFromGeocode(station, geo, location = {}) {
  const patch = {};
  const nextAddress = asLocationText(geo?.address);
  const nextSubcity = normalizePlaceName(geo?.subcity);
  const nextWoreda = normalizePlaceName(location?.woredaName || geo?.woredaName);
  const currentAddress = String(station?.address || "").trim();

  if (
    nextAddress &&
    !isPlaceholderAddress(nextAddress) &&
    (hasWeakStationAddress(station) || currentAddress !== nextAddress)
  ) {
    patch.address = nextAddress;
  }

  if (nextSubcity && nextSubcity !== asLocationText(station?.subcity)) {
    patch.subcity = nextSubcity;
  }

  if (nextWoreda && nextWoreda !== asLocationText(station?.woreda)) {
    patch.woreda = nextWoreda;
  }

  if (location?.regionId && String(station?.regionId || "") !== location.regionId) {
    patch.regionId = location.regionId;
  }

  if (location?.cityId && String(station?.cityId || "") !== location.cityId) {
    patch.cityId = location.cityId;
  }

  if (location?.woredaId && String(station?.woredaId || "") !== location.woredaId) {
    patch.woredaId = location.woredaId;
  }

  return Object.keys(patch).length ? patch : null;
}

async function enrichStationsWithLiveAddress(stations = []) {
  const stationList = Array.isArray(stations) ? stations : [];
  const candidates = stationList
    .filter((station) => {
      if (!station?._id) return false;
      if (!hasWeakStationAddress(station)) return false;
      const coords = Array.isArray(station?.location?.coordinates) ? station.location.coordinates : [];
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      return Number.isFinite(lat) && Number.isFinite(lon);
    })
    .slice(0, MAX_LIVE_ADDRESS_ENRICHMENTS);

  if (!candidates.length) {
    return stationList;
  }

  const updatedStations = new Map();
  const operations = [];

  for (const station of candidates) {
    const coords = Array.isArray(station?.location?.coordinates) ? station.location.coordinates : [];
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);

    try {
      // eslint-disable-next-line no-await-in-loop
      const geo = await reverseGeocodeStationLocation(lat, lon);
      if (!geo || (geo.countryCode && geo.countryCode !== "ET")) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const location = await resolveDirectoryLocationFromGeocode(geo);
      const patch = buildStationAddressPatchFromGeocode(station, geo, location);
      if (!patch) continue;

      operations.push({
        updateOne: {
          filter: { _id: station._id },
          update: { $set: patch }
        }
      });
      updatedStations.set(String(station._id), { ...station, ...patch });
    } catch (_error) {
      // Keep the public station response working even if reverse geocoding fails.
    }
  }

  if (operations.length) {
    await Station.bulkWrite(operations, { ordered: false });
  }

  return stationList.map((station) => updatedStations.get(String(station?._id || "")) || station);
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
  const publicFuelPrices = buildFuelPricesResponse(doc?.fuelPrices || fallback);

  return {
    id: publicId,
    stationId,
    name: String(doc?.name || fallback?.name || "Fuel Station"),
    stationType: getStationTypeForResponse(doc?.stationType || fallback?.stationType),
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
    reservationCooldownDays: Number(
      doc?.reservationCooldownDays ?? fallback?.reservationCooldownDays ?? 0
    ),
    ...publicFuelPrices,
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

function buildStationInsertPayload(station, sourceId, lat, lon, context = {}) {
  const incomingAddress = String(context?.address || station?.address || "").trim();
  const nextLocationCategories = Array.isArray(context?.locationCategories)
    ? context.locationCategories
    : (Array.isArray(station?.locationCategories) ? station.locationCategories : []);

  return {
    name: String(station?.name || "Fuel Station").trim(),
    address: incomingAddress || "Address not listed",
    contact: String(station?.contact || "").trim(),
    regionId: context?.regionId || null,
    cityId: context?.cityId || null,
    woredaId: context?.woredaId || null,
    subcity: String(context?.subcity || station?.subcity || "").trim(),
    woreda: String(context?.woreda || station?.woreda || "").trim(),
    landmark: String(station?.landmark || "").trim(),
    locationCategories: nextLocationCategories,
    stationType: normalizeStationType(station?.stationType) || "fuel",
    externalSource: "osm",
    externalSourceId: sourceId,
    fuelStatus: "partial",
    isActive: true,
    location: { type: "Point", coordinates: [lon, lat] }
  };
}

function buildStationSyncPatch(doc, station, sourceId, lat, lon, context = {}) {
  const patch = {};
  const nextName = String(station?.name || doc?.name || "Fuel Station").trim();
  const nextContact = String(station?.contact || doc?.contact || "").trim();
  const incomingAddress = String(context?.address || station?.address || "").trim();
  const nextSubcity = String(context?.subcity || station?.subcity || "").trim();
  const nextWoreda = String(context?.woreda || station?.woreda || "").trim();
  const nextLandmark = String(station?.landmark || "").trim();
  const nextLocationCategories = Array.isArray(context?.locationCategories)
    ? context.locationCategories
    : (Array.isArray(station?.locationCategories) ? station.locationCategories : []);
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
  if (!normalizeStationType(doc?.stationType)) {
    patch.stationType = "fuel";
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

  if (context?.regionId && String(doc?.regionId || "") !== context.regionId) {
    patch.regionId = context.regionId;
  }

  if (context?.cityId && String(doc?.cityId || "") !== context.cityId) {
    patch.cityId = context.cityId;
  }

  if (context?.woredaId && String(doc?.woredaId || "") !== context.woredaId) {
    patch.woredaId = context.woredaId;
  }

  if (nextSubcity && nextSubcity !== String(doc?.subcity || "").trim()) {
    patch.subcity = nextSubcity;
  }

  if (nextWoreda && nextWoreda !== String(doc?.woreda || "").trim()) {
    patch.woreda = nextWoreda;
  }

  if (nextLandmark && nextLandmark !== String(doc?.landmark || "").trim()) {
    patch.landmark = nextLandmark;
  }

  if (nextLocationCategories.length) {
    const currentLocationCategories = Array.isArray(doc?.locationCategories) ? doc.locationCategories : [];
    const currentSerialized = JSON.stringify(currentLocationCategories);
    const nextSerialized = JSON.stringify(nextLocationCategories);
    if (currentSerialized !== nextSerialized) {
      patch.locationCategories = nextLocationCategories;
    }
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
  const stationContexts = new Map();

  for (const { station, sourceId, lat, lon } of normalizedStations) {
    if (!sourceId || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (stationContexts.has(sourceId)) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      const context = await resolveLiveStationSyncContext(station, lat, lon);
      stationContexts.set(sourceId, context);
    } catch (_error) {
      stationContexts.set(sourceId, {
        address: asLocationText(station?.address) || "Address not listed",
        subcity: normalizePlaceName(station?.subcity),
        woreda: normalizePlaceName(station?.woreda),
        regionId: null,
        cityId: null,
        woredaId: null,
        locationCategories: normalizeLocationCategories(station?.locationCategories)
      });
    }
  }

  const createOperations = [];
  const missingSourceIds = [];
  const missingSourceIdSet = new Set();

  normalizedStations.forEach(({ station, sourceId, lat, lon }) => {
    if (!sourceId || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (docsBySourceId.has(sourceId)) return;
    if (missingSourceIdSet.has(sourceId)) return;

    missingSourceIdSet.add(sourceId);
    missingSourceIds.push(sourceId);
    const context = stationContexts.get(sourceId) || {};
    createOperations.push({
      updateOne: {
        filter: {
          externalSource: "osm",
          externalSourceId: sourceId
        },
        update: {
          $setOnInsert: buildStationInsertPayload(station, sourceId, lat, lon, context)
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
    const context = stationContexts.get(sourceId) || {};

    const patch = buildStationSyncPatch(doc, station, sourceId, lat, lon, context);
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
    const context = stationContexts.get(sourceId) || {};
    if (!doc) {
      return buildClientStationPayload(
        {},
        {
          ...station,
          ...context,
          latitude: Number.isFinite(lat) ? lat : station?.latitude,
          longitude: Number.isFinite(lon) ? lon : station?.longitude
        }
      );
    }

    return buildClientStationPayload(doc, {
      ...station,
      ...context,
      latitude: lat,
      longitude: lon
    });
  });
}

async function queryNearbyStationsFromDatabase(lat, lon, radius, limit = MAX_NEARBY_RESULTS, stationType = "") {
  const now = new Date();
  const geoQuery = { isActive: true };
  applyStationTypeFilter(geoQuery, stationType);

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
        query: geoQuery
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

  const enrichedStations = await enrichStationsWithLiveAddress(stations);
  const directory = await loadStationDirectoryMaps(enrichedStations);

  return enrichedStations.map((station) =>
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

  const enrichedStations = await enrichStationsWithLiveAddress(stations);
  const directory = await loadStationDirectoryMaps(enrichedStations);

  return enrichedStations.map((station) =>
    buildClientStationPayload(station, {
      queue_length: station.queue_length
    }, directory)
  );
}

async function loadCityDirectoryPayloadById(cityId, stationType = "") {
  if (!cityId || !mongoose.isValidObjectId(cityId)) {
    return null;
  }

  const city = await City.findById(cityId)
    .select("_id name slug code regionId")
    .lean();
  if (!city) {
    return null;
  }

  const match = {
    isActive: true,
    cityId: city._id
  };
  applyStationTypeFilter(match, stationType);

  const [stats, region] = await Promise.all([
    Station.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$cityId",
          stationCount: { $sum: 1 },
          longitude: { $avg: { $arrayElemAt: ["$location.coordinates", 0] } },
          latitude: { $avg: { $arrayElemAt: ["$location.coordinates", 1] } }
        }
      }
    ]),
    city.regionId
      ? Region.findById(city.regionId)
          .select("_id name slug code")
          .lean()
      : null
  ]);

  return buildCityDirectoryPayload(city, stats[0] || {}, region);
}

async function resolveCurrentDirectoryCity(lat, lon, stationType = "", options = {}) {
  const preferLive = options?.preferLive === true;
  const radius = normalizeNearbyRadius(options?.radius);
  let matchedCity = null;
  let source = "";

  try {
    const geo = await reverseGeocodeStationLocation(lat, lon);
    if (geo && (!geo.countryCode || geo.countryCode === "ET")) {
      const regionName = normalizeRegionName(normalizePlaceName(geo?.regionName));
      const cityName = normalizePlaceName(geo?.cityName);
      const matchedRegion = regionName ? await findRegionByLooseName(regionName) : null;

      if (cityName) {
        matchedCity = await findCityByLooseName(cityName, String(matchedRegion?._id || ""));
        if (!matchedCity) {
          matchedCity = await findCityByLooseName(cityName);
        }
      }

      if (matchedCity?._id) {
        source = "reverse-geocode";
      }
    }
  } catch (_error) {
    // Fall back to nearby-station inference below.
  }

  if (!matchedCity?._id) {
    try {
      const nearbyStations = await loadNearbyStations(
        lat,
        lon,
        radius,
        stationType,
        { preferLive }
      );
      const rankedCities = new Map();

      (Array.isArray(nearbyStations) ? nearbyStations : []).forEach((station) => {
        const cityId = String(station?.cityId || station?.city?.id || "").trim();
        const cityName = String(station?.city?.name || "").trim();
        const key = cityId || normalizeCitySearchSlug(cityName);
        if (!key) return;

        const current = rankedCities.get(key) || {
          cityId,
          cityName,
          score: 0
        };
        const distanceMeters = Number(station?.distanceMeters);
        current.score += Number.isFinite(distanceMeters)
          ? Math.max(1, 50000 - Math.min(distanceMeters, 50000))
          : 1;
        rankedCities.set(key, current);
      });

      const topCity = Array.from(rankedCities.values())
        .sort((left, right) => right.score - left.score)[0] || null;

      if (topCity?.cityId && mongoose.isValidObjectId(topCity.cityId)) {
        matchedCity = await City.findById(topCity.cityId)
          .select("_id name slug code regionId")
          .lean();
      }
      if (!matchedCity && topCity?.cityName) {
        matchedCity = await findCityByLooseName(topCity.cityName);
      }
      if (matchedCity?._id) {
        source = "nearby";
      }
    } catch (_error) {
      matchedCity = null;
    }
  }

  if (!matchedCity?._id) {
    return null;
  }

  const city = await loadCityDirectoryPayloadById(matchedCity._id, stationType);
  if (!city?.id) {
    return null;
  }

  return {
    city,
    source
  };
}

async function bootstrapNearbyStationsFromExternal(lat, lon, radius, stationType = "") {
  if (normalizeStationType(stationType) === "electric") {
    return [];
  }
  const stations = await fetchNearbyFuelStations(lat, lon, radius);
  return attachBackendStationIds(stations);
}

async function loadNearbyStations(lat, lon, radius, stationType = "", options = {}) {
  const preferLive = options?.preferLive === true;
  const localStations = await queryNearbyStationsFromDatabase(
    lat,
    lon,
    radius,
    MAX_NEARBY_RESULTS,
    stationType
  );

  if (preferLive) {
    const bootstrappedStations = await bootstrapNearbyStationsFromExternal(lat, lon, radius, stationType);
    const hydratedStations = await queryNearbyStationsFromDatabase(
      lat,
      lon,
      radius,
      MAX_NEARBY_RESULTS,
      stationType
    );
    if (hydratedStations.length) {
      return hydratedStations;
    }
    if (bootstrappedStations.length) {
      return bootstrappedStations;
    }
    return localStations;
  }

  if (localStations.length) {
    return localStations;
  }

  const bootstrappedStations = await bootstrapNearbyStationsFromExternal(lat, lon, radius, stationType);
  const hydratedStations = await queryNearbyStationsFromDatabase(
    lat,
    lon,
    radius,
    MAX_NEARBY_RESULTS,
    stationType
  );
  return hydratedStations.length ? hydratedStations : bootstrappedStations;
}

async function loadCurrentCityStationsBundle(lat, lon, stationType = "", options = {}) {
  const limit = normalizeDirectoryLimit(options?.limit, DEFAULT_DIRECTORY_STATION_LIMIT);
  const radius = normalizeNearbyRadius(options?.radius);
  const preferLive =
    options?.preferLive === true && normalizeStationType(stationType) !== "electric";

  if (preferLive) {
    await loadNearbyStations(lat, lon, radius, stationType, { preferLive: true });
  }

  const resolved = await resolveCurrentDirectoryCity(lat, lon, stationType, {
    preferLive,
    radius
  });
  if (!resolved?.city?.id) {
    return {
      city: null,
      source: resolved?.source || "",
      stations: []
    };
  }

  if (normalizeStationType(stationType) !== "electric") {
    try {
      await syncBundledStationsForCity(resolved.city);
    } catch (_error) {
      // Keep current-city station responses available even if bundled sync fails.
    }
  }

  const refreshedCity = await loadCityDirectoryPayloadById(resolved.city.id, stationType);
  const matchQuery = {
    isActive: true,
    cityId: new mongoose.Types.ObjectId(String(resolved.city.id))
  };
  applyStationTypeFilter(matchQuery, stationType);

  const stations = await queryDirectoryStations(matchQuery, limit);
  return {
    city: refreshedCity || resolved.city,
    source: resolved.source,
    stations
  };
}

exports.getNearbyFuelStations = async (req, res) => {
  try {
    const lat = parseNumber(req.query.lat);
    const lon = parseNumber(req.query.lon);
    const radius = normalizeNearbyRadius(req.query.radius);
    const preferLive = parseBooleanQuery(req.query.preferLive, false);
    const stationTypeParam = req.query.stationType;
    const stationType = normalizeStationType(stationTypeParam);
    if (lat === null || lon === null) {
      return res.status(400).json({ message: "lat and lon are required numeric query params." });
    }
    if (stationTypeParam !== undefined && stationTypeParam !== null && !stationType) {
      return res.status(400).json({ message: "stationType must be one of: fuel, electric." });
    }

    const cacheKey = buildNearbyResponseCacheKey(lat, lon, radius, stationType, preferLive);
    const cachedStations = getCachedNearbyResponse(cacheKey);
    if (cachedStations) {
      return res.json({ stations: cachedStations });
    }

    const stations = await loadNearbyStations(lat, lon, radius, stationType, { preferLive });
    setCachedNearbyResponse(cacheKey, stations);
    return res.json({ stations });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load nearby fuel stations." });
  }
};

exports.resolveCurrentCity = async (req, res) => {
  try {
    const lat = parseNumber(req.query.lat);
    const lon = parseNumber(req.query.lon);
    const stationTypeParam = req.query.stationType;
    const stationType = normalizeStationType(stationTypeParam);

    if (lat === null || lon === null) {
      return res.status(400).json({ message: "lat and lon are required numeric query params." });
    }
    if (stationTypeParam !== undefined && stationTypeParam !== null && !stationType) {
      return res.status(400).json({ message: "stationType must be one of: fuel, electric." });
    }

    const result = await resolveCurrentDirectoryCity(lat, lon, stationType);
    return res.json({
      city: result?.city || null,
      source: result?.source || ""
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to resolve the current city." });
  }
};

exports.getCurrentCityStations = async (req, res) => {
  try {
    const lat = parseNumber(req.query.lat);
    const lon = parseNumber(req.query.lon);
    const radius = normalizeNearbyRadius(req.query.radius);
    const limit = normalizeDirectoryLimit(req.query.limit, DEFAULT_DIRECTORY_STATION_LIMIT);
    const stationTypeParam = req.query.stationType;
    const stationType = normalizeStationType(stationTypeParam);
    const preferLive = parseBooleanQuery(
      req.query.preferLive,
      normalizeStationType(stationType) !== "electric"
    );

    if (lat === null || lon === null) {
      return res.status(400).json({ message: "lat and lon are required numeric query params." });
    }
    if (stationTypeParam !== undefined && stationTypeParam !== null && !stationType) {
      return res.status(400).json({ message: "stationType must be one of: fuel, electric." });
    }

    const result = await loadCurrentCityStationsBundle(lat, lon, stationType, {
      preferLive,
      radius,
      limit
    });

    return res.json({
      city: result?.city || null,
      source: result?.source || "",
      stations: Array.isArray(result?.stations) ? result.stations : [],
      total: Array.isArray(result?.stations) ? result.stations.length : 0
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load current city stations." });
  }
};

exports.listDirectoryCities = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const regionId = String(req.query.regionId || "").trim();
    const limit = normalizeDirectoryLimit(req.query.limit, DEFAULT_DIRECTORY_LIMIT);
    const stationTypeParam = req.query.stationType;
    const stationType = normalizeStationType(stationTypeParam);

    if (regionId && !mongoose.isValidObjectId(regionId)) {
      return res.status(400).json({ message: "regionId must be a valid ObjectId." });
    }
    if (stationTypeParam !== undefined && stationTypeParam !== null && !stationType) {
      return res.status(400).json({ message: "stationType must be one of: fuel, electric." });
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
            ...(() => {
              const match = { isActive: true };
              applyStationTypeFilter(match, stationType);
              return match;
            })(),
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
    const strictCity = parseBooleanQuery(req.query.strictCity, false);
    const limit = normalizeDirectoryLimit(req.query.limit, DEFAULT_DIRECTORY_STATION_LIMIT);
    const stationTypeParam = req.query.stationType;
    const stationType = normalizeStationType(stationTypeParam);

    if (regionId && !mongoose.isValidObjectId(regionId)) {
      return res.status(400).json({ message: "regionId must be a valid ObjectId." });
    }
    if (cityId && !mongoose.isValidObjectId(cityId)) {
      return res.status(400).json({ message: "cityId must be a valid ObjectId." });
    }
    if (stationTypeParam !== undefined && stationTypeParam !== null && !stationType) {
      return res.status(400).json({ message: "stationType must be one of: fuel, electric." });
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
    applyStationTypeFilter(matchQuery, stationType);

    let stations = await queryDirectoryStations(matchQuery, limit);

    if (cityId && !stations.length && !strictCity) {
      const city = await City.findById(cityId).select("_id name").lean();
      const fallbackTerms = buildCityFallbackTerms(city?.name);
      if (fallbackTerms.length) {
        const fallbackRegex = new RegExp(fallbackTerms.map((term) => escapeRegex(term)).join("|"), "i");
        const fallbackQuery = {
          isActive: true,
          $or: [
            { name: fallbackRegex },
            { address: fallbackRegex },
            { subcity: fallbackRegex },
            { woreda: fallbackRegex },
            { landmark: fallbackRegex }
          ]
        };

        applyStationTypeFilter(fallbackQuery, stationType);
        stations = await queryDirectoryStations(fallbackQuery, limit);
      }
    }

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

    const [enrichedStation] = await enrichStationsWithLiveAddress([station]);
    const directory = await loadStationDirectoryMaps([enrichedStation]);

    return res.json({
      station: buildClientStationPayload(enrichedStation, {}, directory)
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

exports._attachBackendStationIds = attachBackendStationIds;

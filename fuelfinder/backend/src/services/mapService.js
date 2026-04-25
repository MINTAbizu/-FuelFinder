const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const ROUTE_ENDPOINTS = [
  (fromLon, fromLat, toLon, toLat) =>
    `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`,
  (fromLon, fromLat, toLon, toLat) =>
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`
];

const NEARBY_STATIONS_CACHE_TTL_MS = 1000 * 45;
const ROUTE_CACHE_TTL_MS = 1000 * 60 * 5;
const REVERSE_GEOCODE_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const MAX_CACHE_ENTRIES = 200;
const DEFAULT_NOMINATIM_BASE_URL =
  String(process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org")
    .trim()
    .replace(/\/+$/, "");
const DEFAULT_GEOCODER_USER_AGENT = String(
  process.env.GEOCODER_USER_AGENT ||
    "fuelfinder-map-service/1.0 (contact: admin@fuelfinder.local)"
).trim();
const DEFAULT_GEOCODER_EMAIL = String(process.env.GEOCODER_EMAIL || "").trim();
const DEFAULT_OVERPASS_USER_AGENT = String(
  process.env.OVERPASS_USER_AGENT ||
    process.env.GEOCODER_USER_AGENT ||
    "fuelfinder-overpass/1.0 (contact: admin@fuelfinder.local)"
).trim();

const nearbyStationsCache = new Map();
const routeCache = new Map();
const reverseGeocodeCache = new Map();
const nearbyStationsInflightRequests = new Map();
const reverseGeocodeInflightRequests = new Map();

function getValidCacheEntry(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) return null;
  return entry.value;
}

function getStaleCacheEntry(cache, key) {
  return cache.get(key)?.value || null;
}

function setCacheEntry(cache, key, value, ttlMs) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });

  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildNearbyCacheKey(lat, lon, radiusMeters) {
  return [
    Number(lat).toFixed(3),
    Number(lon).toFixed(3),
    Math.round(Number(radiusMeters) || 0)
  ].join(":");
}

function buildRouteCacheKey(fromLat, fromLon, toLat, toLon) {
  return [
    Number(fromLat).toFixed(4),
    Number(fromLon).toFixed(4),
    Number(toLat).toFixed(4),
    Number(toLon).toFixed(4)
  ].join(":");
}

function buildReverseGeocodeCacheKey(lat, lon) {
  return [Number(lat).toFixed(5), Number(lon).toFixed(5)].join(":");
}

function parseTagBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  if (["yes", "true", "1"].includes(normalized)) return true;
  if (["no", "false", "0"].includes(normalized)) return false;
  return null;
}

function resolveSupportedFuels(tags) {
  const gasoline =
    parseTagBoolean(tags["fuel:gasoline"]) ??
    parseTagBoolean(tags["fuel:petrol"]) ??
    parseTagBoolean(tags["fuel:octane_91"]) ??
    null;
  const diesel = parseTagBoolean(tags["fuel:diesel"]);
  const other =
    parseTagBoolean(tags["fuel:lpg"]) ??
    parseTagBoolean(tags["fuel:cng"]) ??
    parseTagBoolean(tags["fuel:electricity"]) ??
    null;
  const known = [gasoline, diesel, other].some((value) => value !== null);

  return {
    gasoline: gasoline === true,
    diesel: diesel === true,
    other: other === true,
    unknown: !known
  };
}

function normalizeAddressText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function pushUniqueAddressPart(parts, seen, value) {
  const text = normalizeAddressText(value);
  if (!text) return;
  const key = text.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  parts.push(text);
}

function pickFirstTag(tags = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeAddressText(tags?.[key]);
    if (value) return value;
  }
  return "";
}

function normalizePlaceName(value) {
  const text = normalizeAddressText(value);
  if (!text) return "";

  const parts = text
    .split("/")
    .map((part) => normalizeAddressText(part))
    .filter(Boolean);
  const latinPart = parts.find((part) => /[A-Za-z]/.test(part));
  return latinPart || parts[0] || text;
}

function buildAddress(tags, latitude, longitude) {
  const fullAddress = pickFirstTag(tags, ["addr:full", "address"]);
  if (fullAddress) return fullAddress;

  const house = normalizeAddressText(tags["addr:housenumber"]);
  const street = normalizeAddressText(tags["addr:street"]);
  const line1 = [house, street].filter(Boolean).join(" ");

  const district = pickFirstTag(tags, [
    "addr:neighbourhood",
    "addr:suburb",
    "addr:district",
    "addr:city_district"
  ]);
  const city = pickFirstTag(tags, [
    "addr:city",
    "addr:town",
    "addr:village",
    "addr:hamlet",
    "addr:place",
    "is_in:city"
  ]);
  const region = pickFirstTag(tags, ["addr:state", "addr:province", "is_in:state", "is_in:region"]);
  const country = pickFirstTag(tags, ["addr:country", "is_in:country"]);
  const postcode = normalizeAddressText(tags["addr:postcode"]);
  const genericArea = pickFirstTag(tags, ["is_in"]);

  const parts = [];
  const seen = new Set();
  [line1, district, city, region, country, postcode].forEach((part) =>
    pushUniqueAddressPart(parts, seen, part)
  );
  if (parts.length) return parts.join(", ");
  if (genericArea) return genericArea;

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `Approx location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
  }

  return "Address not listed";
}

function buildReverseGeocodeUrl(lat, lon, baseUrl = DEFAULT_NOMINATIM_BASE_URL, email = DEFAULT_GEOCODER_EMAIL) {
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    throw new Error("nominatimUrl is required.");
  }

  const emailPart = email ? `&email=${encodeURIComponent(email)}` : "";
  return (
    `${normalizedBaseUrl}/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&accept-language=en${emailPart}`
  );
}

function formatReverseGeocodeResult(data) {
  const addressObject = data?.address;
  if (!addressObject || typeof addressObject !== "object") {
    const displayName = normalizeAddressText(data?.display_name);
    return displayName
      ? {
          address: displayName,
          regionName: "",
          cityName: "",
          woredaName: "",
          subcity: "",
          countryCode: ""
        }
      : null;
  }

  const line1 = [addressObject.house_number, addressObject.road].filter(Boolean).join(" ");
  const locality =
    addressObject.neighbourhood ||
    addressObject.suburb ||
    addressObject.city_district ||
    addressObject.county ||
    addressObject.district ||
    "";
  const city =
    addressObject.city ||
    addressObject.town ||
    addressObject.village ||
    addressObject.municipality ||
    "";
  const region = addressObject.state || addressObject.region || "";
  const country = addressObject.country || "";

  const parts = [];
  const seen = new Set();
  [line1, locality, city, region, country].forEach((part) =>
    pushUniqueAddressPart(parts, seen, part)
  );

  return {
    address: parts.join(", ") || normalizeAddressText(data?.display_name),
    regionName: normalizePlaceName(region),
    cityName: normalizePlaceName(city),
    woredaName: normalizePlaceName(
      addressObject.city_district ||
        addressObject.county ||
        addressObject.district ||
        addressObject.suburb
    ),
    subcity: normalizePlaceName(
      addressObject.suburb ||
        addressObject.neighbourhood ||
        addressObject.city_district
    ),
    countryCode: normalizeAddressText(addressObject.country_code).toUpperCase()
  };
}

async function reverseGeocodeStationLocation(latitude, longitude, options = {}) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  if (typeof fetch !== "function") {
    return null;
  }

  const baseUrl = String(options.baseUrl || DEFAULT_NOMINATIM_BASE_URL).trim();
  if (!baseUrl) {
    return null;
  }

  const userAgent = String(options.userAgent || DEFAULT_GEOCODER_USER_AGENT).trim();
  const email = String(options.email || DEFAULT_GEOCODER_EMAIL).trim();
  const cacheKey = buildReverseGeocodeCacheKey(lat, lon);
  const cachedResult = getValidCacheEntry(reverseGeocodeCache, cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  if (reverseGeocodeInflightRequests.has(cacheKey)) {
    return reverseGeocodeInflightRequests.get(cacheKey);
  }

  const staleResult = getStaleCacheEntry(reverseGeocodeCache, cacheKey);

  const requestPromise = (async () => {
    try {
      const response = await fetch(buildReverseGeocodeUrl(lat, lon, baseUrl, email), {
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json"
        }
      });
      if (!response.ok) {
        throw new Error(`Reverse geocode failed: ${response.status}`);
      }

      const data = await response.json();
      const result = formatReverseGeocodeResult(data);
      if (!result?.address) {
        return staleResult || null;
      }

      return setCacheEntry(
        reverseGeocodeCache,
        cacheKey,
        result,
        REVERSE_GEOCODE_CACHE_TTL_MS
      );
    } catch (error) {
      if (staleResult) {
        return staleResult;
      }
      throw error;
    }
  })();

  reverseGeocodeInflightRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    reverseGeocodeInflightRequests.delete(cacheKey);
  }
}

async function fetchNearbyFuelStations(lat, lon, radiusMeters = 12000) {
  const cacheKey = buildNearbyCacheKey(lat, lon, radiusMeters);
  const cachedStations = getValidCacheEntry(nearbyStationsCache, cacheKey);
  if (cachedStations) {
    return cachedStations;
  }

  if (nearbyStationsInflightRequests.has(cacheKey)) {
    return nearbyStationsInflightRequests.get(cacheKey);
  }

  const staleStations = getStaleCacheEntry(nearbyStationsCache, cacheKey);
  const query = `
[out:json][timeout:25];
(
  node["amenity"="fuel"](around:${radiusMeters},${lat},${lon});
  way["amenity"="fuel"](around:${radiusMeters},${lat},${lon});
  relation["amenity"="fuel"](around:${radiusMeters},${lat},${lon});
);
out center tags;
`;

  const requestPromise = (async () => {
    let lastErr;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain",
            Accept: "application/json",
            "User-Agent": DEFAULT_OVERPASS_USER_AGENT
          },
          body: query
        });
        if (!response.ok) {
          if (response.status === 429) {
            const retryAfterSeconds = Number(response.headers.get("retry-after") || 0);
            if (retryAfterSeconds > 0) {
              await sleep(Math.min(retryAfterSeconds, 5) * 1000);
            } else {
              await sleep(1200);
            }
          }
          throw new Error(`Overpass request failed: ${response.status}`);
        }

        const data = await response.json();
        const elements = Array.isArray(data?.elements) ? data.elements : [];
        const stations = elements
          .map((element) => {
            const tags = element?.tags || {};
            const latitude = Number(element?.lat ?? element?.center?.lat);
            const longitude = Number(element?.lon ?? element?.center?.lon);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

            return {
              id: `${String(element.type || "node")}-${String(element.id || Math.random())}`,
              stationId: "",
              name: String(tags.name || tags.brand || "Fuel Station"),
              latitude,
              longitude,
              fuel_status: "available",
              queue_length: 0,
              supportedFuels: resolveSupportedFuels(tags),
              image: "",
              address: buildAddress(tags, latitude, longitude),
              subcity: pickFirstTag(tags, ["addr:suburb", "addr:neighbourhood"]),
              woreda: pickFirstTag(tags, ["addr:district", "addr:city_district"]),
              cityName: pickFirstTag(tags, [
                "addr:city",
                "addr:town",
                "addr:village",
                "addr:hamlet",
                "addr:place",
                "is_in:city"
              ]),
              regionName: pickFirstTag(tags, [
                "addr:state",
                "addr:province",
                "is_in:state",
                "is_in:region"
              ]),
              landmark: pickFirstTag(tags, ["operator", "brand"]),
              contact: tags.phone || tags["contact:phone"] || ""
            };
          })
          .filter(Boolean);

        return setCacheEntry(
          nearbyStationsCache,
          cacheKey,
          stations,
          NEARBY_STATIONS_CACHE_TTL_MS
        );
      } catch (err) {
        lastErr = err;
      }
    }

    if (staleStations) {
      return staleStations;
    }

    throw lastErr || new Error("Failed to load fuel stations.");
  })();

  nearbyStationsInflightRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    nearbyStationsInflightRequests.delete(cacheKey);
  }
}

async function fetchDrivingRoute(fromLat, fromLon, toLat, toLon) {
  const cacheKey = buildRouteCacheKey(fromLat, fromLon, toLat, toLon);
  const cachedRoute = getValidCacheEntry(routeCache, cacheKey);
  if (cachedRoute) {
    return cachedRoute;
  }

  const staleRoute = getStaleCacheEntry(routeCache, cacheKey);
  let lastErr;

  for (const buildUrl of ROUTE_ENDPOINTS) {
    try {
      const response = await fetch(buildUrl(fromLon, fromLat, toLon, toLat));
      if (!response.ok) throw new Error(`Route API failed: ${response.status}`);

      const data = await response.json();
      const route = data?.routes?.[0];
      const geometry = route?.geometry?.coordinates || [];
      const coordinates = geometry
        .map(([lon, lat]) => ({ latitude: Number(lat), longitude: Number(lon) }))
        .filter(
          (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
        );
      if (!coordinates.length) throw new Error("No drivable route found.");

      const normalizedRoute = {
        coordinates,
        distanceKm: Number(route.distance || 0) / 1000,
        durationMin: Number(route.duration || 0) / 60
      };

      return setCacheEntry(routeCache, cacheKey, normalizedRoute, ROUTE_CACHE_TTL_MS);
    } catch (err) {
      lastErr = err;
    }
  }

  if (staleRoute) {
    return staleRoute;
  }

  throw lastErr || new Error("Failed to load route.");
}

module.exports = {
  fetchNearbyFuelStations,
  fetchDrivingRoute,
  reverseGeocodeStationLocation
};

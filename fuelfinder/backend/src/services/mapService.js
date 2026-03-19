const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const ROUTE_ENDPOINTS = [
  (fromLon, fromLat, toLon, toLat) =>
    `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`,
  (fromLon, fromLat, toLon, toLat) =>
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`
];

const NEARBY_STATIONS_CACHE_TTL_MS = 1000 * 45;
const ROUTE_CACHE_TTL_MS = 1000 * 60 * 5;
const MAX_CACHE_ENTRIES = 200;

const nearbyStationsCache = new Map();
const routeCache = new Map();

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

function buildAddress(tags, latitude, longitude) {
  const house = String(tags["addr:housenumber"] || "").trim();
  const street = String(tags["addr:street"] || "").trim();
  const line1 = [house, street].filter(Boolean).join(" ");

  const locality = [
    tags["addr:neighbourhood"],
    tags["addr:suburb"],
    tags["addr:district"],
    tags["addr:city"],
    tags["addr:town"],
    tags["addr:village"],
    tags["addr:hamlet"],
    tags["addr:place"]
  ]
    .map((item) => String(item || "").trim())
    .find(Boolean);

  const region = [tags["addr:state"], tags["addr:province"], tags["is_in:state"]]
    .map((item) => String(item || "").trim())
    .find(Boolean);

  const country = String(tags["addr:country"] || tags["is_in:country"] || "").trim();
  const postcode = String(tags["addr:postcode"] || "").trim();

  const parts = [line1, locality, region, country, postcode].filter(Boolean);
  if (parts.length) return parts.join(", ");

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return `Approx location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
  }

  return "Address not listed";
}

async function fetchNearbyFuelStations(lat, lon, radiusMeters = 12000) {
  const cacheKey = buildNearbyCacheKey(lat, lon, radiusMeters);
  const cachedStations = getValidCacheEntry(nearbyStationsCache, cacheKey);
  if (cachedStations) {
    return cachedStations;
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

  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: query
      });
      if (!response.ok) throw new Error(`Overpass request failed: ${response.status}`);

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
  fetchDrivingRoute
};

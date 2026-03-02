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
  const known = [gasoline, diesel, other].some((v) => v !== null);
  return {
    gasoline: gasoline === true,
    diesel: diesel === true,
    other: other === true,
    unknown: !known
  };
}

function buildAddress(tags) {
  const parts = [tags["addr:street"], tags["addr:suburb"], tags["addr:city"], tags["addr:state"]].filter(
    Boolean
  );
  return parts.length ? parts.join(", ") : "Address not listed";
}

async function fetchNearbyFuelStations(lat, lon, radiusMeters = 12000) {
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
      return elements
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
            address: buildAddress(tags),
            contact: tags.phone || tags["contact:phone"] || ""
          };
        })
        .filter(Boolean);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("Failed to load fuel stations.");
}

async function fetchDrivingRoute(fromLat, fromLon, toLat, toLon) {
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
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
      if (!coordinates.length) throw new Error("No drivable route found.");

      return {
        coordinates,
        distanceKm: Number(route.distance || 0) / 1000,
        durationMin: Number(route.duration || 0) / 60
      };
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error("Failed to load route.");
}

module.exports = {
  fetchNearbyFuelStations,
  fetchDrivingRoute
};


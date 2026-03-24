/* eslint-disable no-console */
require("dotenv").config();
const fs = require("fs");
const path = require("path");

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

const DEFAULT_OUTPUT_PATH = "./exports/ethiopia-osm-stations.json";
const DEFAULT_USER_AGENT =
  process.env.GEOCODER_USER_AGENT ||
  "fuelfinder-ethiopia-osm-export/1.0 (contact: admin@fuelfinder.local)";
const DEFAULT_CONTACT_EMAIL = process.env.GEOCODER_EMAIL || "";

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => String(item || "").startsWith(prefix));
  return arg ? String(arg).slice(prefix.length).trim() : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asText(value) {
  return String(value || "").trim();
}

function slugify(value) {
  return asText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureParentDir(filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

function isAddisOrDireDawa(name) {
  const normalized = asText(name).toLowerCase();
  return normalized === "addis ababa" || normalized === "dire dawa";
}

function inferRegionCategory(name) {
  return isAddisOrDireDawa(name) ? "chartered_city" : "regional_state";
}

function inferWoredaCategory(value) {
  const normalized = asText(value).toLowerCase();
  if (!normalized) return "";
  if (
    normalized.includes("subcity") ||
    ["arada", "bole", "yeka", "kirkos", "lideta", "gullele", "akaky kaliti"].includes(normalized)
  ) {
    return "subcity";
  }
  if (normalized.includes("district") || normalized.includes("kebele")) {
    return "district";
  }
  return "woreda";
}

function buildAddressFromTags(tags, latitude, longitude) {
  const house = asText(tags["addr:housenumber"]);
  const street = asText(tags["addr:street"]);
  const line1 = [house, street].filter(Boolean).join(" ");

  const locality = [
    tags["addr:neighbourhood"],
    tags["addr:suburb"],
    tags["addr:district"],
    tags["addr:city"],
    tags["addr:town"],
    tags["addr:village"],
    tags["addr:place"]
  ]
    .map(asText)
    .find(Boolean);

  const region = [tags["addr:state"], tags["addr:province"], tags["is_in:state"]]
    .map(asText)
    .find(Boolean);

  const country = asText(tags["addr:country"] || tags["is_in:country"]);
  const parts = [line1, locality, region, country].filter(Boolean);
  if (parts.length) return parts.join(", ");

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `Approx location (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
  }

  return "";
}

function normalizeTags(tags = {}) {
  const regionName = asText(tags["addr:state"] || tags["addr:province"] || tags["is_in:state"]);
  const cityName = asText(
    tags["addr:city"] ||
      tags["addr:town"] ||
      tags["addr:village"] ||
      tags["addr:place"]
  );
  const districtName = asText(
    tags["addr:district"] || tags["addr:suburb"] || tags["addr:neighbourhood"]
  );
  const subcity = asText(tags["addr:suburb"] || tags["addr:neighbourhood"]);
  const brand = asText(tags.brand);
  const operator = asText(tags.operator);
  const openingHours = asText(tags.opening_hours);
  const phone = asText(tags.phone || tags["contact:phone"]);

  const locationCategories = [
    brand ? `brand-${slugify(brand)}` : "",
    operator ? `operator-${slugify(operator)}` : "",
    openingHours === "24/7" ? "24-7" : "",
    tags.car_wash === "yes" ? "car-wash" : "",
    tags.shop === "convenience" ? "mini-mart" : "",
    tags["payment:cards"] === "yes" ? "cards" : "",
    tags["payment:cash"] === "yes" ? "cash" : ""
  ].filter(Boolean);

  return {
    regionName,
    cityName,
    districtName,
    subcity,
    contact: phone,
    locationCategories
  };
}

async function fetchOverpassStations() {
  const query = `
[out:json][timeout:180];
area["ISO3166-1:alpha2"="ET"][admin_level=2]->.searchArea;
(
  node["amenity"="fuel"](area.searchArea);
  way["amenity"="fuel"](area.searchArea);
  relation["amenity"="fuel"](area.searchArea);
);
out center tags;
`;

  let lastError = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "User-Agent": DEFAULT_USER_AGENT
        },
        body: query
      });
      if (!response.ok) {
        throw new Error(`Overpass request failed (${response.status})`);
      }
      const data = await response.json();
      return Array.isArray(data?.elements) ? data.elements : [];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to fetch OSM fuel stations.");
}

function formatFromAddressObject(addr) {
  if (!addr || typeof addr !== "object") return {};

  return {
    address: [
      [addr.house_number, addr.road].filter(Boolean).join(" "),
      addr.neighbourhood || addr.suburb || "",
      addr.city || addr.town || addr.village || addr.municipality || "",
      addr.state || addr.region || "",
      addr.country || ""
    ]
      .map(asText)
      .filter(Boolean)
      .join(", "),
    regionName: asText(addr.state || addr.region),
    cityName: asText(addr.city || addr.town || addr.village || addr.municipality),
    districtName: asText(addr.city_district || addr.county || addr.district || addr.suburb),
    subcity: asText(addr.suburb || addr.neighbourhood || addr.city_district),
    countryCode: asText(addr.country_code).toUpperCase()
  };
}

async function reverseGeocode(lat, lon, userAgent, email) {
  const emailPart = email ? `&email=${encodeURIComponent(email)}` : "";
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&accept-language=en${emailPart}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Reverse geocode failed (${response.status})`);
  }
  const data = await response.json();
  return formatFromAddressObject(data?.address);
}

function buildStationRecord(element) {
  const tags = element?.tags || {};
  const latitude = Number(element?.lat ?? element?.center?.lat);
  const longitude = Number(element?.lon ?? element?.center?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const sourceId = `${asText(element?.type || "node")}-${asText(element?.id)}`;
  const normalized = normalizeTags(tags);
  const address = buildAddressFromTags(tags, latitude, longitude);
  const regionName = normalized.regionName;
  const cityName = normalized.cityName;
  const woredaName = normalized.districtName;

  return {
    name: asText(tags.name || tags.brand || tags.operator) || `Fuel Station ${sourceId}`,
    address,
    latitude,
    longitude,
    regionName,
    regionCategory: inferRegionCategory(regionName),
    cityName,
    woredaName,
    woredaCategory: inferWoredaCategory(woredaName),
    subcity: normalized.subcity,
    landmark: asText(tags.operator || tags.brand),
    locationCategories: normalized.locationCategories,
    contact: normalized.contact,
    fuelStatus: "partial",
    isActive: true,
    externalSource: "osm",
    externalSourceId: sourceId
  };
}

async function enrichMissingLocationFields(records, { userAgent, email }) {
  const cache = new Map();
  let resolved = 0;
  let failed = 0;

  for (const record of records) {
    const needsLocation =
      !asText(record.regionName) || !asText(record.cityName) || !asText(record.address);
    if (!needsLocation) continue;

    const lat = Number(record.latitude);
    const lon = Number(record.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (!cache.has(cacheKey)) {
      try {
        const geo = await reverseGeocode(lat, lon, userAgent, email);
        cache.set(cacheKey, geo);
        resolved += 1;
      } catch (_error) {
        cache.set(cacheKey, null);
        failed += 1;
      }
      await sleep(1100);
    }

    const geo = cache.get(cacheKey);
    if (!geo || geo.countryCode !== "ET") continue;

    if (!asText(record.address)) {
      record.address = asText(geo.address);
    }
    if (!asText(record.regionName)) {
      record.regionName = asText(geo.regionName);
      record.regionCategory = inferRegionCategory(record.regionName);
    }
    if (!asText(record.cityName)) {
      record.cityName = asText(geo.cityName);
    }
    if (!asText(record.woredaName)) {
      record.woredaName = asText(geo.districtName);
      record.woredaCategory = inferWoredaCategory(record.woredaName);
    }
    if (!asText(record.subcity)) {
      record.subcity = asText(geo.subcity);
    }
  }

  return { resolved, failed };
}

function dedupeRecords(records) {
  const map = new Map();

  records.forEach((record) => {
    const sourceId = asText(record.externalSourceId);
    if (!sourceId) return;
    if (!map.has(sourceId)) {
      map.set(sourceId, record);
      return;
    }

    const existing = map.get(sourceId);
    map.set(sourceId, {
      ...existing,
      ...record,
      address: asText(existing.address) || asText(record.address),
      regionName: asText(existing.regionName) || asText(record.regionName),
      cityName: asText(existing.cityName) || asText(record.cityName),
      woredaName: asText(existing.woredaName) || asText(record.woredaName),
      subcity: asText(existing.subcity) || asText(record.subcity),
      contact: asText(existing.contact) || asText(record.contact),
      landmark: asText(existing.landmark) || asText(record.landmark),
      locationCategories: Array.from(
        new Set([...(existing.locationCategories || []), ...(record.locationCategories || [])])
      )
    });
  });

  return Array.from(map.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this Node runtime. Use Node 18+.");
  }

  const outputFile = getArg("out", DEFAULT_OUTPUT_PATH);
  const doReverse = !hasFlag("no-reverse");
  const userAgent = getArg("userAgent", DEFAULT_USER_AGENT);
  const email = getArg("email", DEFAULT_CONTACT_EMAIL);

  console.log("Fetching Ethiopia fuel stations from OpenStreetMap (Overpass)...");
  const elements = await fetchOverpassStations();
  const baseRecords = elements.map(buildStationRecord).filter(Boolean);
  console.log(`Raw OSM features fetched: ${baseRecords.length}`);

  let reverseSummary = { resolved: 0, failed: 0 };
  if (doReverse) {
    console.log("Reverse geocoding missing location fields with Nominatim...");
    reverseSummary = await enrichMissingLocationFields(baseRecords, { userAgent, email });
  }

  const stations = dedupeRecords(baseRecords);
  const absolutePath = ensureParentDir(outputFile);
  const payload = {
    source: "OpenStreetMap",
    country: "Ethiopia",
    exportedAt: new Date().toISOString(),
    reverseGeocoded: doReverse,
    total: stations.length,
    stations
  };

  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const withRegion = stations.filter((item) => asText(item.regionName)).length;
  const withCity = stations.filter((item) => asText(item.cityName)).length;
  const withWoreda = stations.filter((item) => asText(item.woredaName)).length;

  console.log(`Export complete: ${absolutePath}`);
  console.log(`Stations exported: ${stations.length}`);
  console.log(`With region: ${withRegion}`);
  console.log(`With city: ${withCity}`);
  console.log(`With woreda/district: ${withWoreda}`);
  if (doReverse) {
    console.log(`Reverse geocode requests resolved: ${reverseSummary.resolved}`);
    console.log(`Reverse geocode requests failed: ${reverseSummary.failed}`);
  }
  console.log("Next step:");
  console.log(`npm run stations:import -- --file=${absolutePath}`);
}

main().catch((error) => {
  console.error("OSM export failed:", error?.message || error);
  process.exit(1);
});

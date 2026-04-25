const path = require("path");

const slugify = require("../utils/slugify");
const { asLocationText } = require("../utils/locationDirectory");
const {
  importStationRecords,
  loadStationImportRecords
} = require("./stationImportService");

const BACKEND_ROOT_DIR = path.resolve(__dirname, "../..");
const SYNC_CACHE_TTL_MS = 1000 * 60 * 5;
const CITY_SLUG_ALIASES = new Map([
  ["asela", "asella"]
]);
const BUNDLED_CITY_IMPORTS = new Map([
  ["asella", "examples/asella-curated-stations.import.json"]
]);
const bundledCitySyncCache = new Map();
const bundledCitySyncInflight = new Map();

function normalizeCitySlug(value) {
  const rawSlug = slugify(asLocationText(value));
  return CITY_SLUG_ALIASES.get(rawSlug) || rawSlug;
}

function resolveBundledImportFile(city = {}) {
  const citySlug = normalizeCitySlug(city?.slug || city?.name);
  if (!citySlug) return "";
  return BUNDLED_CITY_IMPORTS.get(citySlug) || "";
}

async function syncBundledStationsForCity(city = {}, options = {}) {
  const citySlug = normalizeCitySlug(city?.slug || city?.name);
  const importFile = resolveBundledImportFile(city);
  if (!citySlug || !importFile) {
    return null;
  }

  const force = options?.force === true;
  const cachedEntry = bundledCitySyncCache.get(citySlug);
  if (!force && cachedEntry && cachedEntry.expiresAt > Date.now()) {
    return cachedEntry.result;
  }

  if (!force && bundledCitySyncInflight.has(citySlug)) {
    return bundledCitySyncInflight.get(citySlug);
  }

  const requestPromise = (async () => {
    const records = loadStationImportRecords(importFile, { baseDir: BACKEND_ROOT_DIR });
    const summary = await importStationRecords(records);
    const result = {
      citySlug,
      importFile,
      ...summary
    };

    bundledCitySyncCache.set(citySlug, {
      result,
      expiresAt: Date.now() + SYNC_CACHE_TTL_MS
    });

    return result;
  })();

  bundledCitySyncInflight.set(citySlug, requestPromise);

  try {
    return await requestPromise;
  } finally {
    bundledCitySyncInflight.delete(citySlug);
  }
}

module.exports = {
  syncBundledStationsForCity
};

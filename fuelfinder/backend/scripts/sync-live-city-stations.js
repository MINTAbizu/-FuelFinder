/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../src/config/db");
const City = require("../src/models/City");
const Station = require("../src/models/Station");
const mapController = require("../src/controllers/mapController");
const { fetchNearbyFuelStations } = require("../src/services/mapService");
const { asLocationText } = require("../src/utils/locationDirectory");
const slugify = require("../src/utils/slugify");

const CITY_SLUG_ALIASES = new Map([
  ["addis-abeba", "addis-ababa"],
  ["awassa", "hawassa"],
  ["asela", "asella"],
  ["shashamane", "shashemene"],
  ["shashamene", "shashemene"],
  ["deberh-berhan", "debre-birhan"]
]);

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => String(item || "").startsWith(prefix));
  return arg ? String(arg).slice(prefix.length).trim() : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function asNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number.`);
  }
  return parsed;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCitySearchSlug(value) {
  const raw = slugify(asLocationText(value));
  return CITY_SLUG_ALIASES.get(raw) || raw;
}

function buildCitySearchTerms(value) {
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

function buildFuelStationMatch() {
  return {
    $or: [
      { stationType: "fuel" },
      { stationType: { $exists: false } },
      { stationType: null }
    ]
  };
}

async function resolveTargetCity(cityName, syncedStations) {
  const normalizedCityName = asLocationText(cityName);
  if (normalizedCityName) {
    const slug = normalizeCitySearchSlug(normalizedCityName);
    const matches = await City.find({ slug })
      .select("_id name slug regionId")
      .sort({ name: 1 })
      .limit(2)
      .lean();

    if (matches.length === 1) {
      return matches[0];
    }
  }

  const counts = new Map();
  (Array.isArray(syncedStations) ? syncedStations : []).forEach((station) => {
    const cityId = String(station?.cityId || station?.city?.id || "").trim();
    if (!cityId) return;
    counts.set(cityId, (counts.get(cityId) || 0) + 1);
  });

  const topCityId = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!topCityId) return null;

  return City.findById(topCityId)
    .select("_id name slug regionId")
    .lean();
}

function stationMatchesCity(station, cityRegex, targetCityId = "") {
  const normalizedTargetCityId = String(targetCityId || "").trim();
  const stationCityId = String(station?.cityId || station?.city?.id || "").trim();
  if (normalizedTargetCityId && stationCityId === normalizedTargetCityId) {
    return true;
  }
  if (!cityRegex) return false;

  return [
    station?.name,
    station?.address,
    station?.rawAddress,
    station?.subcity,
    station?.woreda,
    station?.city?.name
  ].some((value) => cityRegex.test(String(value || "")));
}

async function main() {
  const lat = asNumber(getArg("lat"), "lat");
  const lon = asNumber(getArg("lon"), "lon");
  const radius = Number(getArg("radius", "15000")) || 15000;
  const cityName = asLocationText(getArg("city"));
  const apply = hasFlag("apply");
  const keepStale = hasFlag("keep-stale");

  if (typeof mapController._attachBackendStationIds !== "function") {
    throw new Error("Live station sync helper is not exported from mapController.");
  }

  await connectDB();

  const liveStations = await fetchNearbyFuelStations(lat, lon, radius);
  const syncedStations = await mapController._attachBackendStationIds(liveStations);
  const targetCity = await resolveTargetCity(cityName, syncedStations);
  const cityTerms = buildCitySearchTerms(cityName || targetCity?.name);
  const cityRegex = cityTerms.length
    ? new RegExp(cityTerms.map((term) => escapeRegex(term)).join("|"), "i")
    : null;

  const matchedStations = syncedStations.filter((station) =>
    stationMatchesCity(station, cityRegex, targetCity?._id)
  );
  const keepIds = Array.from(
    new Set(
      matchedStations
        .map((station) => String(station?.stationId || station?.id || "").trim())
        .filter((id) => mongoose.isValidObjectId(id))
    )
  );

  console.log("Live city station sync scan complete.");
  console.log(`Fetched from live map: ${liveStations.length}`);
  console.log(`Synced into backend: ${syncedStations.length}`);
  console.log(`Matched target city stations: ${matchedStations.length}`);
  console.log(`Target city: ${targetCity?.name || cityName || "Unknown"}`);

  matchedStations.slice(0, 20).forEach((station, index) => {
    console.log(
      `${index + 1}. ${station.name} | ${station.address} | stationId=${station.stationId || "-"}`
    );
  });

  if (!keepIds.length) {
    console.log("No city-matched backend stations were found, so stale cleanup was skipped.");
    await mongoose.disconnect();
    return;
  }

  const staleOrConditions = [];
  if (targetCity?._id) {
    staleOrConditions.push({ cityId: new mongoose.Types.ObjectId(String(targetCity._id)) });
  }
  if (cityRegex) {
    staleOrConditions.push(
      { address: cityRegex },
      { name: cityRegex },
      { subcity: cityRegex },
      { woreda: cityRegex }
    );
  }

  const staleQuery = {
    isActive: true,
    _id: { $nin: keepIds.map((id) => new mongoose.Types.ObjectId(id)) },
    $and: [buildFuelStationMatch()],
    ...(staleOrConditions.length ? { $or: staleOrConditions } : {})
  };

  const staleStations = keepStale
    ? []
    : await Station.find(staleQuery)
        .select("_id name address cityId externalSource externalSourceId")
        .sort({ updatedAt: -1 })
        .lean();

  console.log(`Stale stations to deactivate: ${staleStations.length}`);
  staleStations.slice(0, 20).forEach((station, index) => {
    console.log(
      `${index + 1}. ${station.name} | ${station.address} | source=${station.externalSource || "manual"}`
    );
  });

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist the sync and stale cleanup.");
    await mongoose.disconnect();
    return;
  }

  let deactivatedCount = 0;
  if (!keepStale && staleStations.length) {
    const staleIds = staleStations.map((station) => station._id);
    const result = await Station.updateMany(
      { _id: { $in: staleIds } },
      { $set: { isActive: false } }
    );
    deactivatedCount = Number(result.modifiedCount || 0);
  }

  console.log("Live city station sync completed.");
  console.log(`Active live-backed city stations kept: ${keepIds.length}`);
  console.log(`Stale stations deactivated: ${deactivatedCount}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Live city station sync failed:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // no-op
  }
  process.exit(1);
});

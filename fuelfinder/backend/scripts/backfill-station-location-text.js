/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../src/config/db");
const Region = require("../src/models/Region");
const City = require("../src/models/City");
const Station = require("../src/models/Station");
const slugify = require("../src/utils/slugify");
const { asLocationText } = require("../src/utils/locationDirectory");

const CITY_SLUG_ALIASES = new Map([
  ["addis-abeba", "addis-ababa"],
  ["awassa", "hawassa"],
  ["asela", "asella"],
  ["shashamane", "shashemene"],
  ["shashamene", "shashemene"],
  ["deberh-berhan", "debre-birhan"]
]);

const STATION_KEYWORDS = new Set([
  "african",
  "baro",
  "bp",
  "calub",
  "dalol",
  "delta",
  "fuel",
  "gas",
  "gion",
  "global",
  "gomeju",
  "green",
  "jfm",
  "kobil",
  "mg",
  "mobil",
  "national",
  "nile",
  "noc",
  "odaa",
  "oil",
  "oilibya",
  "orbis",
  "petrol",
  "petroleum",
  "service",
  "shell",
  "sinkata",
  "station",
  "stop",
  "taf",
  "total",
  "totalenergies",
  "united",
  "was",
  "ybp",
  "yeshi",
  "yetebaberut",
  "zagol",
  "zemen"
]);

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => String(item || "").startsWith(prefix));
  return arg ? String(arg).slice(prefix.length).trim() : fallback;
}

function normalizeSearchSlug(value) {
  const raw = slugify(asLocationText(value));
  return CITY_SLUG_ALIASES.get(raw) || raw;
}

function isMissingAddress(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (text === "address not listed") return true;
  return text.startsWith("approx location");
}

function splitAddressParts(address) {
  if (isMissingAddress(address)) return [];
  return String(address || "")
    .split(",")
    .map((part) => String(part || "").trim())
    .filter(Boolean);
}

function hasStationKeyword(textSlug) {
  return String(textSlug || "")
    .split("-")
    .some((part) => STATION_KEYWORDS.has(part));
}

function collectStationTexts(station) {
  const texts = [];

  const pushText = (kind, value) => {
    const raw = asLocationText(value);
    const slug = normalizeSearchSlug(raw);
    if (!raw || !slug) return;
    texts.push({ kind, raw, slug });
  };

  pushText("name", station?.name);
  pushText("subcity", station?.subcity);
  pushText("woreda", station?.woreda);
  splitAddressParts(station?.address).forEach((part, index) => pushText(`address_part_${index + 1}`, part));

  return texts;
}

function buildCityIndexes(cities) {
  const exactMap = new Map();
  const suffixEntries = [];
  const aliasGroups = new Map();

  for (const [aliasSlug, canonicalSlug] of CITY_SLUG_ALIASES.entries()) {
    const bucket = aliasGroups.get(canonicalSlug) || [];
    bucket.push(aliasSlug);
    aliasGroups.set(canonicalSlug, bucket);
  }

  (Array.isArray(cities) ? cities : []).forEach((city) => {
    const canonicalSlug = normalizeSearchSlug(city?.name);
    if (!canonicalSlug) return;

    const searchSlugs = new Set([canonicalSlug, ...(aliasGroups.get(canonicalSlug) || [])]);
    searchSlugs.forEach((searchSlug) => {
      const matches = exactMap.get(searchSlug) || [];
      matches.push(city);
      exactMap.set(searchSlug, matches);
      suffixEntries.push({
        searchSlug,
        searchLength: searchSlug.length,
        city
      });
    });
  });

  suffixEntries.sort((a, b) => b.searchLength - a.searchLength);

  return { exactMap, suffixEntries };
}

function filterByRegion(cities, regionId) {
  const scopedRegionId = String(regionId || "").trim();
  if (!scopedRegionId) return Array.isArray(cities) ? cities : [];
  return (Array.isArray(cities) ? cities : []).filter(
    (city) => String(city?.regionId || "").trim() === scopedRegionId
  );
}

function resolveUniqueCity(cities) {
  const unique = new Map();
  (Array.isArray(cities) ? cities : []).forEach((city) => {
    const id = String(city?._id || "").trim();
    if (!id) return;
    unique.set(id, city);
  });

  if (unique.size === 1) {
    return { city: Array.from(unique.values())[0], ambiguous: false };
  }

  return { city: null, ambiguous: unique.size > 1 };
}

function matchExactCity(texts, exactMap, regionId = "") {
  for (const text of texts) {
    const candidates = filterByRegion(exactMap.get(text.slug) || [], regionId);
    const resolved = resolveUniqueCity(candidates);
    if (resolved.city) {
      return {
        city: resolved.city,
        reason: `exact-${text.kind}`,
        matchedText: text.raw
      };
    }
  }

  return null;
}

function matchCityFromNameSuffix(nameText, suffixEntries, regionId = "") {
  if (!nameText?.slug) return null;

  const matches = suffixEntries.filter((entry) => {
    if (regionId && String(entry.city?.regionId || "").trim() !== String(regionId || "").trim()) {
      return false;
    }
    return (
      nameText.slug === entry.searchSlug ||
      nameText.slug.endsWith(`-${entry.searchSlug}`)
    );
  });

  if (!matches.length) return null;

  const longestLength = matches[0].searchLength;
  const longestMatches = matches.filter((entry) => entry.searchLength === longestLength);
  const resolved = resolveUniqueCity(longestMatches.map((entry) => entry.city));
  if (!resolved.city) return null;

  if (nameText.slug === matches[0].searchSlug) {
    return {
      city: resolved.city,
      reason: "exact-name",
      matchedText: nameText.raw
    };
  }

  const suffix = matches[0].searchSlug;
  const prefixSlug = nameText.slug.slice(0, -(suffix.length + 1)).replace(/-+$/g, "");
  if (!prefixSlug || !hasStationKeyword(prefixSlug)) {
    return null;
  }

  return {
    city: resolved.city,
    reason: "name-suffix",
    matchedText: nameText.raw
  };
}

function buildQuery(source) {
  const query = {
    $or: [{ cityId: null }, { regionId: null }]
  };

  const normalizedSource = asLocationText(source).toLowerCase();
  if (normalizedSource && normalizedSource !== "all") {
    query.externalSource = normalizedSource;
  }

  return query;
}

async function main() {
  const apply = hasFlag("apply");
  const limit = Number(getArg("limit", "500"));
  const source = getArg("source", "osm");

  await connectDB();

  const [regions, cities, stations] = await Promise.all([
    Region.find({}).select("_id name slug").lean(),
    City.find({}).select("_id name slug regionId").lean(),
    Station.find(buildQuery(source))
      .select("_id name address regionId cityId subcity woreda externalSource externalSourceId")
      .limit(Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 500)
      .lean()
  ]);

  const regionById = new Map(
    regions.map((region) => [String(region?._id || "").trim(), region])
  );
  const { exactMap, suffixEntries } = buildCityIndexes(cities);

  console.log("Station text backfill scan complete.");
  console.log(`Candidates found: ${stations.length}`);

  const previews = [];
  const errors = [];
  let resolved = 0;
  let updated = 0;
  let unmatched = 0;

  for (const station of stations) {
    const currentRegionId = String(station?.regionId || "").trim();
    const texts = collectStationTexts(station);
    const exactMatch = matchExactCity(texts, exactMap, currentRegionId);
    const nameText = texts.find((text) => text.kind === "name") || null;
    const matched = exactMatch || matchCityFromNameSuffix(nameText, suffixEntries, currentRegionId);

    if (!matched?.city) {
      unmatched += 1;
      if (errors.length < 10) {
        errors.push(`${station.name} (${station._id}): no safe city match found`);
      }
      continue;
    }

    const cityId = String(matched.city._id);
    const regionId = String(matched.city.regionId || "");
    const region = regionById.get(regionId) || null;

    previews.push({
      name: station.name,
      cityName: matched.city.name,
      regionName: region?.name || "Unspecified region",
      reason: matched.reason,
      matchedText: matched.matchedText
    });

    if (apply) {
      // eslint-disable-next-line no-await-in-loop
      const result = await Station.updateOne(
        { _id: station._id },
        {
          $set: {
            cityId,
            regionId: regionId || null
          }
        }
      );
      updated += Number(result.modifiedCount || 0);
    }

    resolved += 1;
  }

  console.log("Sample matches (first 20):");
  previews.slice(0, 20).forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.name} -> ${item.cityName}, ${item.regionName} | ${item.reason} | "${item.matchedText}"`
    );
  });
  console.log(`Resolved: ${resolved}`);
  console.log(`Unmatched: ${unmatched}`);
  if (errors.length) {
    console.log("Sample unmatched:");
    errors.forEach((item, index) => console.log(`${index + 1}. ${item}`));
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist updates.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Text backfill completed. Stations updated: ${updated}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Station text backfill failed:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // no-op
  }
  process.exit(1);
});

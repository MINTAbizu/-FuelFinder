/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../src/config/db");
const Station = require("../src/models/Station");
const {
  asLocationText,
  ensureRegionByName,
  ensureCityByName,
  ensureWoredaByName
} = require("../src/utils/locationDirectory");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => String(item || "").startsWith(prefix));
  return arg ? String(arg).slice(prefix.length).trim() : fallback;
}

function isMissingAddress(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (text === "address not listed") return true;
  return text.startsWith("approx location");
}

function buildApproxAddress(station) {
  const coords = Array.isArray(station?.location?.coordinates) ? station.location.coordinates : [];
  if (coords.length < 2) return "";
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `Approx location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizePlaceName(value) {
  const text = asLocationText(value);
  if (!text) return "";
  const parts = text
    .split("/")
    .map((item) => asLocationText(item))
    .filter(Boolean);
  const latinPart = parts.find((item) => /[A-Za-z]/.test(item));
  if (latinPart) return latinPart;
  if (text === "አዲስ አበባ") return "Addis Ababa";
  return text;
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

function formatFromAddressObject(addr) {
  if (!addr || typeof addr !== "object") return null;
  return {
    address: [
      [addr.house_number, addr.road].filter(Boolean).join(" "),
      addr.neighbourhood || addr.suburb || "",
      addr.city || addr.town || addr.village || addr.municipality || "",
      addr.state || addr.region || "",
      addr.country || ""
    ]
      .map((item) => asLocationText(item))
      .filter(Boolean)
      .join(", "),
    regionName: normalizePlaceName(addr.state || addr.region),
    cityName: normalizePlaceName(addr.city || addr.town || addr.village || addr.municipality),
    woredaName: normalizePlaceName(addr.city_district || addr.county || addr.district || addr.suburb),
    subcity: normalizePlaceName(addr.suburb || addr.neighbourhood || addr.city_district),
    countryCode: asLocationText(addr.country_code).toUpperCase()
  };
}

async function reverseGeocode(lat, lon, baseUrl, userAgent, email) {
  const normalizedBaseUrl = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    throw new Error("nominatimUrl is required.");
  }

  const emailPart = email ? `&email=${encodeURIComponent(email)}` : "";
  const url =
    `${normalizedBaseUrl}/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}` +
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

async function resolveDirectoryLocation(geo) {
  if (!geo?.regionName || !geo?.cityName) {
    return { regionId: null, cityId: null, woredaId: null, woredaName: geo?.woredaName || "" };
  }

  const region = await ensureRegionByName(geo.regionName, {
    category: inferRegionCategory(geo.regionName)
  });

  const city = await ensureCityByName({
    name: geo.cityName,
    regionId: region._id
  });

  let woredaId = null;
  let woredaName = "";
  if (geo.woredaName) {
    const woreda = await ensureWoredaByName({
      name: geo.woredaName,
      regionId: region._id,
      cityId: city._id,
      category: inferWoredaCategory(geo.woredaName)
    });
    woredaId = String(woreda._id);
    woredaName = geo.woredaName;
  }

  return {
    regionId: String(region._id),
    cityId: String(city._id),
    woredaId,
    woredaName
  };
}

async function main() {
  const apply = hasFlag("apply");
  const limit = Number(getArg("limit", "200"));
  const source = getArg("source", "osm");
  const nominatimUrl = getArg("nominatimUrl", process.env.NOMINATIM_BASE_URL || "");
  const userAgent =
    getArg("userAgent") ||
    process.env.GEOCODER_USER_AGENT ||
    "fuelfinder-location-backfill/1.0 (contact: admin@fuelfinder.local)";
  const email = getArg("email", process.env.GEOCODER_EMAIL || "");

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available in this Node runtime. Use Node 18+.");
  }
  if (!nominatimUrl) {
    throw new Error("Provide --nominatimUrl=<your-nominatim-base-url>.");
  }

  await connectDB();

  const candidates = await Station.find({
    externalSource: source,
    $or: [
      { regionId: null },
      { cityId: null },
      { address: { $in: ["", "Address not listed"] } },
      { address: { $regex: /^Approx location/i } }
    ]
  })
    .select("_id name address regionId cityId woredaId subcity woreda location externalSource externalSourceId")
    .limit(Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200)
    .lean();

  console.log("Station location backfill scan complete.");
  console.log(`Candidates found: ${candidates.length}`);

  if (!candidates.length) {
    await mongoose.disconnect();
    return;
  }

  const previews = [];
  let resolved = 0;
  let failed = 0;
  let updated = 0;
  const errors = [];

  for (const station of candidates) {
    const coords = Array.isArray(station?.location?.coordinates) ? station.location.coordinates : [];
    if (coords.length < 2) {
      failed += 1;
      continue;
    }

    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      failed += 1;
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const geo = await reverseGeocode(lat, lon, nominatimUrl, userAgent, email);
      if (!geo || geo.countryCode !== "ET") {
        failed += 1;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const location = await resolveDirectoryLocation(geo);
      const nextAddress = asLocationText(geo.address) || buildApproxAddress(station);
      const patch = {
        address: nextAddress || buildApproxAddress(station),
        subcity: geo.subcity || asLocationText(station.subcity),
        woreda: location.woredaName || geo.woredaName || asLocationText(station.woreda),
        regionId: location.regionId || station.regionId || null,
        cityId: location.cityId || station.cityId || null,
        woredaId: location.woredaId || station.woredaId || null
      };

      previews.push({
        id: String(station._id),
        name: station.name,
        fromAddress: station.address,
        toAddress: patch.address,
        regionId: patch.regionId,
        cityId: patch.cityId,
        woredaId: patch.woredaId
      });

      if (apply) {
        // eslint-disable-next-line no-await-in-loop
        const result = await Station.updateOne({ _id: station._id }, { $set: patch });
        updated += Number(result.modifiedCount || 0);
      }

      resolved += 1;
    } catch (error) {
      failed += 1;
      if (errors.length < 10) {
        errors.push(`${station.name} (${station._id}): ${error.message}`);
      }
    }

    // Respect Nominatim-style geocoder rate limits.
    // eslint-disable-next-line no-await-in-loop
    await sleep(1100);
  }

  console.log("Sample updates (first 20):");
  previews.slice(0, 20).forEach((item, index) => {
    console.log(
      `${index + 1}. ${item.name} | "${item.fromAddress}" -> "${item.toAddress}" | region=${item.regionId || "-"} city=${item.cityId || "-"} woreda=${item.woredaId || "-"}`
    );
  });
  console.log(`Resolved: ${resolved}`);
  console.log(`Failed: ${failed}`);
  if (errors.length) {
    console.log("Sample errors:");
    errors.forEach((item, index) => console.log(`${index + 1}. ${item}`));
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist updates.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Backfill completed. Stations updated: ${updated}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Location backfill failed:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch (_error) {
    // no-op
  }
  process.exit(1);
});

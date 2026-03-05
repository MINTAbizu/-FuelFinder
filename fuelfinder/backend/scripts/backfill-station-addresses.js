/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../src/config/db");
const Station = require("../src/models/Station");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function isMissingAddress(value) {
  const text = normalizeAddress(value);
  if (!text) return true;
  if (text === "address not listed") return true;
  return text.startsWith("approx location");
}

function buildApproxAddress(station) {
  const coords = Array.isArray(station?.location?.coordinates)
    ? station.location.coordinates
    : [];
  if (coords.length < 2) return "";
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  return `Approx location (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
}

function formatFromAddressObject(addr) {
  if (!addr || typeof addr !== "object") return "";
  const line1 = [addr.house_number, addr.road].filter(Boolean).join(" ").trim();
  const locality =
    addr.neighbourhood ||
    addr.suburb ||
    addr.city_district ||
    addr.county ||
    "";
  const city = addr.city || addr.town || addr.village || addr.municipality || "";
  const region = addr.state || addr.region || "";
  const country = addr.country || "";
  const parts = [line1, locality, city, region, country]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const fromObject = formatFromAddressObject(data?.address);
  if (fromObject) return fromObject;
  return String(data?.display_name || "").trim();
}

async function main() {
  const apply = hasFlag("apply");
  const useReverse = !hasFlag("no-reverse");
  const userAgent =
    getArg("userAgent") ||
    process.env.GEOCODER_USER_AGENT ||
    "fuelfinder-address-backfill/1.0 (contact: admin@fuelfinder.local)";
  const contactEmail =
    getArg("email") ||
    process.env.GEOCODER_EMAIL ||
    "";

  if (typeof fetch !== "function" && useReverse) {
    throw new Error(
      "Global fetch is not available in this Node runtime. Use Node 18+ or run with --no-reverse."
    );
  }
  await connectDB();

  const stations = await Station.find({})
    .select("_id name address location")
    .lean();

  const candidates = stations
    .filter((item) => isMissingAddress(item.address))
    .map((item) => ({
      id: String(item._id),
      name: String(item.name || "Unnamed station"),
      currentAddress: String(item.address || "").trim() || "(empty)",
      nextAddress: buildApproxAddress(item),
      station: item
    }))
    .filter((item) => Boolean(item.nextAddress));

  console.log("Station address backfill scan complete.");
  console.log(`Stations scanned: ${stations.length}`);
  console.log(`Candidates with missing address: ${candidates.length}`);
  console.log(`Reverse geocoding: ${useReverse ? "enabled" : "disabled"}`);

  if (!candidates.length) {
    console.log("No address backfill needed.");
    await mongoose.disconnect();
    return;
  }

  const geoCache = new Map();
  let reverseOk = 0;
  let reverseFail = 0;
  const reverseErrors = [];

  if (useReverse) {
    for (const item of candidates) {
      const coords = Array.isArray(item.station?.location?.coordinates)
        ? item.station.location.coordinates
        : [];
      if (coords.length < 2) continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)}`;
      if (geoCache.has(cacheKey)) {
        const cached = String(geoCache.get(cacheKey) || "").trim();
        if (cached) item.nextAddress = cached;
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const resolved = await reverseGeocode(lat, lon, userAgent, contactEmail);
        if (resolved) {
          item.nextAddress = resolved;
          geoCache.set(cacheKey, resolved);
          reverseOk += 1;
        } else {
          reverseFail += 1;
        }
      } catch (err) {
        reverseFail += 1;
        if (reverseErrors.length < 5) {
          reverseErrors.push(
            `${cacheKey} -> ${String(err?.message || err)}`
          );
        }
      }
      // Respect Nominatim usage policy: max ~1 request/second.
      // eslint-disable-next-line no-await-in-loop
      await sleep(1100);
    }
  }

  console.log("Sample updates (first 20):");
  candidates.slice(0, 20).forEach((item, idx) => {
    console.log(
      `${idx + 1}. ${item.id} | ${item.name} | "${item.currentAddress}" -> "${item.nextAddress}"`
    );
  });
  if (useReverse) {
    console.log(`Reverse geocode resolved: ${reverseOk}`);
    console.log(`Reverse geocode fallback/failed: ${reverseFail}`);
    if (reverseErrors.length) {
      console.log("Sample reverse geocode errors:");
      reverseErrors.forEach((line, idx) => console.log(`${idx + 1}. ${line}`));
    }
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to persist updates.");
    await mongoose.disconnect();
    return;
  }

  let modified = 0;
  for (const item of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Station.updateOne(
      { _id: item.id },
      { $set: { address: item.nextAddress } }
    );
    modified += Number(result.modifiedCount || 0);
  }

  console.log(`Backfill completed. Stations updated: ${modified}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Backfill failed:", error?.message || error);
  try {
    await mongoose.disconnect();
  } catch (_err) {
    // no-op
  }
  process.exit(1);
});

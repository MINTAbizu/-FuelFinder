/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../src/config/db");
const Station = require("../src/models/Station");

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function normalizeAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function isMissingAddress(value) {
  const text = normalizeAddress(value);
  if (!text) return true;
  return text === "address not listed";
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

async function main() {
  const apply = hasFlag("apply");
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
      nextAddress: buildApproxAddress(item)
    }))
    .filter((item) => Boolean(item.nextAddress));

  console.log("Station address backfill scan complete.");
  console.log(`Stations scanned: ${stations.length}`);
  console.log(`Candidates with missing address: ${candidates.length}`);

  if (!candidates.length) {
    console.log("No address backfill needed.");
    await mongoose.disconnect();
    return;
  }

  console.log("Sample updates (first 20):");
  candidates.slice(0, 20).forEach((item, idx) => {
    console.log(
      `${idx + 1}. ${item.id} | ${item.name} | "${item.currentAddress}" -> "${item.nextAddress}"`
    );
  });

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


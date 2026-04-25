require("dotenv").config();
const mongoose = require("mongoose");

const connectDB = require("../src/config/db");
const { asLocationText } = require("../src/utils/locationDirectory");
const {
  importStationRecords,
  loadStationImportRecords
} = require("../src/services/stationImportService");

function parseArgs(argv) {
  const args = {};
  argv.forEach((item) => {
    const trimmed = String(item || "").trim();
    if (!trimmed.startsWith("--")) return;
    const [key, rawValue] = trimmed.slice(2).split("=");
    args[key] = rawValue === undefined ? "true" : rawValue;
  });
  return args;
}

function asBool(value, defaultValue = false) {
  const text = asLocationText(value).toLowerCase();
  if (!text) return defaultValue;
  if (["true", "1", "yes"].includes(text)) return true;
  if (["false", "0", "no"].includes(text)) return false;
  return defaultValue;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = asLocationText(args.file);
  if (!file) {
    throw new Error("Provide --file=<path-to-json>.");
  }

  const records = loadStationImportRecords(file);
  await connectDB();

  const summary = await importStationRecords(records);
  console.log("Station import complete.");
  console.log(JSON.stringify(summary, null, 2));

  if (summary.failed && asBool(args.failOnError, false)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Station import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

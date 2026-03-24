require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const { seedEthiopiaLocationDirectory } = require("../src/utils/locationDirectory");

function readFlag(name) {
  const argv = process.argv.slice(2);
  return argv.includes(`--${name}`) || argv.includes(`--${name}=true`);
}

function readArgValue(name) {
  const prefix = `--${name}=`;
  const argv = process.argv.slice(2);
  const match = argv.find((item) => String(item || "").startsWith(prefix));
  if (!match) return "";
  return String(match).slice(prefix.length).trim();
}

function loadSeedEntries(filePath) {
  if (!filePath) return null;
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.regions)) return parsed.regions;
  throw new Error("Location seed JSON must be an array or an object with a regions array.");
}

async function main() {
  await connectDB();
  const overwrite = readFlag("overwrite");
  const file = readArgValue("file");
  const entries = loadSeedEntries(file);
  const summary = await seedEthiopiaLocationDirectory({ overwrite, entries });
  console.log("Ethiopia locations seeded.");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("Location seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

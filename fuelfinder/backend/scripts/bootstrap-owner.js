require("dotenv").config();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const User = require("../src/models/User");
const Station = require("../src/models/Station");
const { resolveStationLocation } = require("../src/utils/locationDirectory");

function asText(value) {
  return String(value || "").trim();
}

function asBool(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function asNumber(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return num;
}

async function resolveStationId() {
  const stationId = asText(process.env.OWNER_STATION_ID);
  if (stationId) {
    if (!mongoose.isValidObjectId(stationId)) {
      throw new Error("OWNER_STATION_ID must be a valid ObjectId.");
    }
    return stationId;
  }

  if (!asBool(process.env.OWNER_CREATE_STATION)) {
    return "";
  }

  const name = asText(process.env.OWNER_STATION_NAME);
  const address = asText(process.env.OWNER_STATION_ADDRESS);
  const contact = asText(process.env.OWNER_STATION_CONTACT);
  const latitude = asNumber(process.env.OWNER_STATION_LAT, "OWNER_STATION_LAT");
  const longitude = asNumber(process.env.OWNER_STATION_LON, "OWNER_STATION_LON");
  if (!name || !address) {
    throw new Error("OWNER_STATION_NAME and OWNER_STATION_ADDRESS are required to create a station.");
  }

  const organizationId = asText(process.env.OWNER_ORG_ID);
  const regionId = asText(process.env.OWNER_REGION_ID);
  const cityId = asText(process.env.OWNER_CITY_ID);
  const branchId = asText(process.env.OWNER_BRANCH_ID);
  const resolvedLocation = await resolveStationLocation({ regionId, cityId });

  const station = await Station.create({
    name,
    address,
    contact,
    organizationId: mongoose.isValidObjectId(organizationId) ? organizationId : null,
    regionId: resolvedLocation.regionId,
    cityId: resolvedLocation.cityId,
    branchId: mongoose.isValidObjectId(branchId) ? branchId : null,
    fuelStatus: "partial",
    isActive: true,
    location: { type: "Point", coordinates: [longitude, latitude] }
  });

  return String(station._id);
}

async function main() {
  await connectDB();

  const email = asText(process.env.OWNER_EMAIL);
  const password = asText(process.env.OWNER_PASSWORD);
  const name = asText(process.env.OWNER_NAME) || "Station Owner";
  const phone = asText(process.env.OWNER_PHONE);
  const role = asText(process.env.OWNER_ROLE) || "station_manager";
  const updateExisting = asBool(process.env.OWNER_UPDATE_EXISTING || "true");

  if (!email || !password) {
    throw new Error("OWNER_EMAIL and OWNER_PASSWORD are required.");
  }

  const stationId = await resolveStationId();
  if (!stationId) {
    throw new Error("Provide OWNER_STATION_ID or set OWNER_CREATE_STATION=true with station details.");
  }

  const organizationId = asText(process.env.OWNER_ORG_ID);
  const regionId = asText(process.env.OWNER_REGION_ID);
  const cityId = asText(process.env.OWNER_CITY_ID);
  const branchId = asText(process.env.OWNER_BRANCH_ID);
  const resolvedLocation = await resolveStationLocation({ regionId, cityId });

  const existing = await User.findOne({ email });
  if (existing) {
    if (!updateExisting) {
      console.log("Owner already exists. Set OWNER_UPDATE_EXISTING=true to update.");
      return;
    }
    existing.name = name;
    existing.phone = phone;
    existing.role = role;
    existing.organizationId = mongoose.isValidObjectId(organizationId) ? organizationId : existing.organizationId;
    existing.cityIds = resolvedLocation.cityId ? [resolvedLocation.cityId] : existing.cityIds;
    existing.branchIds = mongoose.isValidObjectId(branchId) ? [branchId] : existing.branchIds;
    existing.stationIds = [stationId];
    existing.passwordHash = await bcrypt.hash(password, 12);
    await existing.save();
    console.log("Owner updated:", existing.email);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const owner = await User.create({
    name,
    phone,
    email,
    passwordHash,
    role,
    organizationId: mongoose.isValidObjectId(organizationId) ? organizationId : null,
    cityIds: resolvedLocation.cityId ? [resolvedLocation.cityId] : [],
    branchIds: mongoose.isValidObjectId(branchId) ? [branchId] : [],
    stationIds: [stationId]
  });

  console.log("Owner created:", owner.email);
}

main()
  .catch((error) => {
    console.error("Owner bootstrap failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.connection.close();
  });

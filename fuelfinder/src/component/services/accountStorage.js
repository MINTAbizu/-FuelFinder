import AsyncStorage from "@react-native-async-storage/async-storage";

const VEHICLES_KEY = "ff_profile_vehicles";
const SAVED_STATIONS_KEY = "ff_saved_stations";

function safeParseJson(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeFuelType(value) {
  const fuelType = normalizeText(value).toLowerCase();
  if (fuelType === "diesel" || fuelType === "electric" || fuelType === "other") {
    return fuelType;
  }
  return "gasoline";
}

function buildVehicleId() {
  return `veh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeVehicle(rawVehicle) {
  const tankCapacityLiters = Number(rawVehicle?.tankCapacityLiters || 0);
  return {
    id: normalizeText(rawVehicle?.id) || buildVehicleId(),
    nickname: normalizeText(rawVehicle?.nickname),
    plateNumber: normalizeText(rawVehicle?.plateNumber).toUpperCase(),
    fuelType: normalizeFuelType(rawVehicle?.fuelType),
    tankCapacityLiters:
      Number.isFinite(tankCapacityLiters) && tankCapacityLiters > 0
        ? Number(tankCapacityLiters.toFixed(1))
        : 0,
    isPrimary: Boolean(rawVehicle?.isPrimary),
    updatedAt: rawVehicle?.updatedAt || new Date().toISOString(),
  };
}

function ensurePrimaryVehicle(vehicles) {
  if (!vehicles.length) return vehicles;

  let hasPrimary = false;
  const normalized = vehicles.map((vehicle) => {
    const nextPrimary = Boolean(vehicle.isPrimary) && !hasPrimary;
    if (nextPrimary) hasPrimary = true;
    return { ...vehicle, isPrimary: nextPrimary };
  });

  if (hasPrimary) return normalized;
  normalized[0] = { ...normalized[0], isPrimary: true };
  return normalized;
}

export async function loadVehicles() {
  const raw = await AsyncStorage.getItem(VEHICLES_KEY);
  const parsed = safeParseJson(raw, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(normalizeVehicle)
    .filter((vehicle) => vehicle.nickname || vehicle.plateNumber);
}

export async function saveVehicles(vehicles) {
  const normalized = ensurePrimaryVehicle(
    (Array.isArray(vehicles) ? vehicles : [])
      .map(normalizeVehicle)
      .filter((vehicle) => vehicle.nickname || vehicle.plateNumber)
  );
  await AsyncStorage.setItem(VEHICLES_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function upsertVehicle(vehicle) {
  const currentVehicles = await loadVehicles();
  const nextVehicle = normalizeVehicle(vehicle);
  const existingIndex = currentVehicles.findIndex((item) => item.id === nextVehicle.id);
  const nextVehicles =
    existingIndex >= 0
      ? currentVehicles.map((item) => (item.id === nextVehicle.id ? nextVehicle : item))
      : [nextVehicle, ...currentVehicles];
  return saveVehicles(nextVehicles);
}

export async function removeVehicle(vehicleId) {
  const currentVehicles = await loadVehicles();
  const nextVehicles = currentVehicles.filter((vehicle) => vehicle.id !== String(vehicleId || ""));
  return saveVehicles(nextVehicles);
}

export function getStationSnapshotId(station) {
  return normalizeText(station?.stationId || station?._id || station?.id);
}

export function normalizeSavedStation(station) {
  const latitude = Number(station?.latitude);
  const longitude = Number(station?.longitude);
  const queueLength = Number(station?.queue_length ?? station?.queueLength ?? 0);

  return {
    id: getStationSnapshotId(station),
    name: normalizeText(station?.name) || "Fuel Station",
    address: normalizeText(station?.address),
    contact: normalizeText(station?.contact),
    fuelStatus: normalizeText(station?.fuel_status || station?.fuelStatus),
    queueLength: Number.isFinite(queueLength) && queueLength >= 0 ? queueLength : 0,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    savedAt: station?.savedAt || new Date().toISOString(),
  };
}

export async function loadSavedStations() {
  const raw = await AsyncStorage.getItem(SAVED_STATIONS_KEY);
  const parsed = safeParseJson(raw, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(normalizeSavedStation)
    .filter((station) => station.id);
}

export async function saveSavedStations(stations) {
  const normalized = (Array.isArray(stations) ? stations : [])
    .map(normalizeSavedStation)
    .filter((station) => station.id);
  await AsyncStorage.setItem(SAVED_STATIONS_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function toggleSavedStation(station) {
  const stationId = getStationSnapshotId(station);
  if (!stationId) return loadSavedStations();

  const currentStations = await loadSavedStations();
  const exists = currentStations.some((item) => item.id === stationId);
  if (exists) {
    return saveSavedStations(currentStations.filter((item) => item.id !== stationId));
  }

  const snapshot = normalizeSavedStation(station);
  return saveSavedStations([snapshot, ...currentStations]);
}

export async function removeSavedStation(stationId) {
  const currentStations = await loadSavedStations();
  const nextStations = currentStations.filter((station) => station.id !== String(stationId || ""));
  return saveSavedStations(nextStations);
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import api from "./api";

export const FUEL_ALERT_PREF_KEYS = {
  pushNotifications: "ff_pref_push_notifs",
  nearbyFuelAlerts: "ff_pref_nearby_fuel_alerts",
  locationSharing: "ff_pref_location_sharing",
  preferredFuel: "ff_pref_preferred_fuel",
};

export const FUEL_ALERT_RADIUS_METERS = 1800;

const ALERT_HISTORY_KEY = "ff_fuel_alert_history";
const ALERT_LEDGER_KEY = "ff_fuel_alert_ledger";
const ALERT_CHANNEL_ID = "fuel-alerts";
const ALERT_HISTORY_LIMIT = 60;
const ALERT_COOLDOWN_MS = 1000 * 60 * 90;

let notificationsConfigured = false;
const alertHistoryListeners = new Set();

function notifyAlertHistoryListeners(alerts) {
  alertHistoryListeners.forEach((listener) => {
    try {
      listener(Array.isArray(alerts) ? alerts : []);
    } catch (_error) {
      // Ignore listener failures so alert persistence stays reliable.
    }
  });
}

function safeParse(rawValue, fallback) {
  if (!rawValue) return fallback;
  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return fallback;
  }
}

function toBool(value, fallback) {
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

function toPreferredFuel(value) {
  const fuel = String(value || "").trim().toLowerCase();
  if (fuel === "diesel" || fuel === "electric") return fuel;
  return "gasoline";
}

function haversineDistanceKm(from, to) {
  if (!from || !to) return null;
  const lat1 = Number(from.latitude);
  const lon1 = Number(from.longitude);
  const lat2 = Number(to.latitude);
  const lon2 = Number(to.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getQueueLength(station) {
  const value = Number(station?.queue_length ?? station?.queueLength ?? 0);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function getInventoryAmount(station, fuelType) {
  const inventory = station?.fuelInventory || {};
  if (fuelType === "diesel") return Number(inventory?.dieselLiters || 0);
  if (fuelType === "electric") {
    return Number(inventory?.electricUnits || inventory?.electricCount || 0);
  }
  return Number(inventory?.gasolineLiters || 0);
}

function stationSupportsPreferredFuel(station, fuelType) {
  const supportedFuels = station?.supportedFuels || {};
  if (fuelType === "diesel") {
    return supportedFuels.diesel === true || getInventoryAmount(station, "diesel") > 0;
  }
  if (fuelType === "electric") {
    const electricInventory = Number(
      station?.fuelInventory?.electricUnits ||
        station?.fuelInventory?.electricCount ||
        (supportedFuels.electric === true ? station?.fuelInventory?.otherLiters || 0 : 0)
    );
    return supportedFuels.electric === true || electricInventory > 0;
  }
  return supportedFuels.gasoline === true || getInventoryAmount(station, "gasoline") > 0;
}

function stationHasAvailablePreferredFuel(station, fuelType) {
  const status = String(station?.fuel_status || station?.fuelStatus || "").trim().toLowerCase();
  const amount = getInventoryAmount(station, fuelType);
  if (fuelType === "electric") {
    return stationSupportsPreferredFuel(station, fuelType) && status !== "empty";
  }
  if (amount > 0) return true;
  return stationSupportsPreferredFuel(station, fuelType) && (status === "available" || status === "limited");
}

function getFuelLabel(preferredFuel) {
  if (preferredFuel === "diesel") return "Diesel";
  if (preferredFuel === "electric") return "Electric";
  return "Gasoline";
}

function getAvailabilityLabel(statusValue) {
  const status = String(statusValue || "").trim().toLowerCase();
  if (status === "available") return "Available now";
  if (status === "limited") return "Limited stock";
  if (status === "empty") return "Out of stock";
  return "Live update";
}

function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return "nearby";
  if (distanceKm < 1) return `${Math.max(100, Math.round(distanceKm * 1000))} m`;
  return `${distanceKm.toFixed(1)} km`;
}

function buildInventorySummary(station, preferredFuel) {
  const inventory = station?.fuelInventory || {};
  if (preferredFuel === "diesel") {
    const liters = Number(inventory?.dieselLiters || 0);
    return liters > 0 ? `~${Math.round(liters)} L remaining` : "";
  }
  if (preferredFuel === "electric") {
    const units = Number(
      inventory?.electricUnits ||
        inventory?.electricCount ||
        (station?.supportedFuels?.electric ? inventory?.otherLiters || 0 : 0)
    );
    return units > 0 ? `~${Math.round(units)} charging spots ready` : "";
  }
  const liters = Number(inventory?.gasolineLiters || 0);
  return liters > 0 ? `~${Math.round(liters)} L remaining` : "";
}

function buildQueueSummary(queueLength) {
  if (queueLength > 0) return `${queueLength}-car queue`;
  return "Queue looks light";
}

function buildAlertBody(station, preferredFuel, distanceKm) {
  const queueLength = getQueueLength(station);
  const distanceText = formatDistance(distanceKm);
  const queueText = buildQueueSummary(queueLength);
  const inventorySummary = buildInventorySummary(station, preferredFuel);
  const availabilityText = getAvailabilityLabel(station?.fuel_status || station?.fuelStatus);
  const address = String(station?.address || "").trim();
  const detailParts = [
    `${getFuelLabel(preferredFuel)} ${availabilityText.toLowerCase()}`,
    `${distanceText} away`,
    inventorySummary,
    queueText,
  ].filter(Boolean);
  return `${station?.name || "Nearby station"}: ${detailParts.join(" - ")}${address ? ` - ${address}` : ""}`;
}

function buildAlertCandidate(station, preferredFuel, currentLocation) {
  const stationLocation = {
    latitude: Number(station?.latitude),
    longitude: Number(station?.longitude),
  };
  const distanceKm = haversineDistanceKm(currentLocation, stationLocation);
  if (!Number.isFinite(distanceKm)) return null;
  if (distanceKm > FUEL_ALERT_RADIUS_METERS / 1000) return null;
  if (!stationHasAvailablePreferredFuel(station, preferredFuel)) return null;

  const availabilityRank =
    String(station?.fuel_status || station?.fuelStatus || "").trim().toLowerCase() === "available"
      ? 2
      : 1;

  return {
    station,
    preferredFuel,
    distanceKm,
    queueLength: getQueueLength(station),
    availabilityRank,
  };
}

function pickBestCandidate(stations, preferredFuel, currentLocation) {
  const candidates = (stations || [])
    .map((station) => buildAlertCandidate(station, preferredFuel, currentLocation))
    .filter(Boolean);

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.availabilityRank !== a.availabilityRank) {
      return b.availabilityRank - a.availabilityRank;
    }
    if (a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm;
    }
    return a.queueLength - b.queueLength;
  });

  return candidates[0];
}

function buildLedgerKey(candidate) {
  const stationId = String(
    candidate?.station?.stationId || candidate?.station?._id || candidate?.station?.id || ""
  );
  return `${candidate?.preferredFuel || "fuel"}:${stationId}`;
}

export async function configureFuelAlertNotificationsAsync() {
  if (!notificationsConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    notificationsConfigured = true;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
      name: "Fuel alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 150, 250],
      lightColor: "#0F766E",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function ensureFuelAlertNotificationPermissionsAsync() {
  await configureFuelAlertNotificationsAsync();
  const current = await Notifications.getPermissionsAsync();
  const alreadyGranted =
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (alreadyGranted) return true;

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  return (
    requested.granted ||
    requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function loadFuelAlertPreferences() {
  const entries = await AsyncStorage.multiGet(Object.values(FUEL_ALERT_PREF_KEYS));
  const byKey = Object.fromEntries(entries);
  return {
    pushNotifications: toBool(byKey[FUEL_ALERT_PREF_KEYS.pushNotifications], true),
    nearbyFuelAlerts: toBool(byKey[FUEL_ALERT_PREF_KEYS.nearbyFuelAlerts], true),
    locationSharing: toBool(byKey[FUEL_ALERT_PREF_KEYS.locationSharing], true),
    preferredFuel: toPreferredFuel(byKey[FUEL_ALERT_PREF_KEYS.preferredFuel]),
  };
}

export async function fetchStationsForFuelAlerts(currentLocation) {
  const lat = Number(currentLocation?.latitude);
  const lon = Number(currentLocation?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

  const { data } = await api.get("/map/nearby-fuel", {
    params: {
      lat,
      lon,
      radius: FUEL_ALERT_RADIUS_METERS,
    },
  });

  return Array.isArray(data?.stations) ? data.stations : [];
}

export async function loadFuelAlertHistory() {
  const raw = await AsyncStorage.getItem(ALERT_HISTORY_KEY);
  const alerts = safeParse(raw, []);
  return Array.isArray(alerts) ? alerts : [];
}

export async function loadUnreadFuelAlertCount() {
  const alerts = await loadFuelAlertHistory();
  return alerts.reduce((count, alert) => count + (alert?.readAt ? 0 : 1), 0);
}

export function subscribeToFuelAlertHistory(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  alertHistoryListeners.add(listener);
  return () => {
    alertHistoryListeners.delete(listener);
  };
}

export async function saveFuelAlertHistory(alerts) {
  const normalized = Array.isArray(alerts) ? alerts.slice(0, ALERT_HISTORY_LIMIT) : [];
  await AsyncStorage.setItem(ALERT_HISTORY_KEY, JSON.stringify(normalized));
  notifyAlertHistoryListeners(normalized);
  return normalized;
}

export async function clearFuelAlertHistory() {
  await AsyncStorage.removeItem(ALERT_HISTORY_KEY);
  notifyAlertHistoryListeners([]);
  return [];
}

export async function resetFuelAlertState() {
  await AsyncStorage.multiRemove([ALERT_HISTORY_KEY, ALERT_LEDGER_KEY]);
  notifyAlertHistoryListeners([]);
}

export async function markFuelAlertsRead() {
  const alerts = await loadFuelAlertHistory();
  const nextAlerts = alerts.map((alert) => ({ ...alert, readAt: alert.readAt || new Date().toISOString() }));
  await saveFuelAlertHistory(nextAlerts);
  return nextAlerts;
}

async function loadFuelAlertLedger() {
  const raw = await AsyncStorage.getItem(ALERT_LEDGER_KEY);
  const ledger = safeParse(raw, {});
  return ledger && typeof ledger === "object" ? ledger : {};
}

async function saveFuelAlertLedger(ledger) {
  await AsyncStorage.setItem(ALERT_LEDGER_KEY, JSON.stringify(ledger || {}));
}

export async function evaluatePreferredFuelAlert(currentLocation) {
  const preferences = await loadFuelAlertPreferences();
  if (
    !preferences.pushNotifications ||
    !preferences.nearbyFuelAlerts ||
    !preferences.locationSharing
  ) {
    return null;
  }

  const stations = await fetchStationsForFuelAlerts(currentLocation);
  return pickBestCandidate(stations, preferences.preferredFuel, currentLocation);
}

export async function triggerPreferredFuelAlert(candidate) {
  if (!candidate?.station) return null;

  const ledger = await loadFuelAlertLedger();
  const ledgerKey = buildLedgerKey(candidate);
  const lastTriggeredAt = Number(ledger[ledgerKey] || 0);
  if (lastTriggeredAt && Date.now() - lastTriggeredAt < ALERT_COOLDOWN_MS) {
    return null;
  }

  const title = `${getFuelLabel(candidate.preferredFuel)} nearby`;
  const body = buildAlertBody(candidate.station, candidate.preferredFuel, candidate.distanceKm);
  const queueSummary = buildQueueSummary(candidate.queueLength);
  const availabilityLabel = getAvailabilityLabel(
    candidate.station?.fuel_status || candidate.station?.fuelStatus
  );
  const event = {
    id: `fuel_alert_${Date.now()}`,
    type: "preferred_fuel_nearby",
    title,
    body,
    stationId: String(
      candidate.station?.stationId || candidate.station?._id || candidate.station?.id || ""
    ),
    stationName: String(candidate.station?.name || "Fuel Station"),
    preferredFuel: candidate.preferredFuel,
    distanceKm: Number(candidate.distanceKm.toFixed(2)),
    distanceLabel: formatDistance(candidate.distanceKm),
    queueLength: candidate.queueLength,
    queueSummary,
    availability: String(candidate.station?.fuel_status || candidate.station?.fuelStatus || ""),
    availabilityLabel,
    address: String(candidate.station?.address || ""),
    inventorySummary: buildInventorySummary(candidate.station, candidate.preferredFuel),
    triggeredAt: new Date().toISOString(),
    readAt: null,
  };

  const history = await loadFuelAlertHistory();
  await saveFuelAlertHistory([event, ...history]);

  await configureFuelAlertNotificationsAsync();
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "default",
        data: {
          type: event.type,
          stationId: event.stationId,
          preferredFuel: event.preferredFuel,
        },
      },
      trigger: null,
    });
  } catch (_error) {
    // Preserve the alert in-app even if the OS notification cannot be shown.
  }

  ledger[ledgerKey] = Date.now();
  await saveFuelAlertLedger(ledger);

  return event;
}

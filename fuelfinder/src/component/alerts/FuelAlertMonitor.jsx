import React from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";

import {
  configureFuelAlertNotificationsAsync,
  evaluatePreferredFuelAlert,
  loadFuelAlertPreferences,
  triggerPreferredFuelAlert,
} from "../services/fuelAlertService";

const LOCATION_WATCH_OPTIONS = {
  accuracy: Location.Accuracy.Balanced,
  timeInterval: 45000,
  distanceInterval: 350,
};

const PREF_SYNC_INTERVAL_MS = 30000;
const FORCE_LOCATION_RECHECK_MS = 1000 * 60 * 2;
const MIN_EVALUATION_GAP_MS = 25000;
const MIN_MOVEMENT_METERS = 200;

function distanceMeters(from, to) {
  if (!from || !to) return null;

  const lat1 = Number(from.latitude);
  const lon1 = Number(from.longitude);
  const lat2 = Number(to.latitude);
  const lon2 = Number(to.longitude);

  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

  const earthRadiusMeters = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function FuelAlertMonitor({ enabled }) {
  const watcherRef = React.useRef(null);
  const appStateRef = React.useRef(AppState.currentState);
  const syncInFlightRef = React.useRef(false);
  const lastEvaluationRef = React.useRef({
    timestamp: 0,
    coords: null,
  });

  const stopWatcher = React.useCallback(() => {
    watcherRef.current?.remove?.();
    watcherRef.current = null;
  }, []);

  const evaluateFromCoords = React.useCallback(
    async (coords, force = false) => {
      if (!enabled || !coords) return;

      const now = Date.now();
      const previous = lastEvaluationRef.current;
      const movedMeters = distanceMeters(previous.coords, coords);
      const checkedRecently = now - previous.timestamp < MIN_EVALUATION_GAP_MS;
      const movementTooSmall =
        Number.isFinite(movedMeters) && movedMeters < MIN_MOVEMENT_METERS;

      if (!force && previous.timestamp && checkedRecently && movementTooSmall) {
        return;
      }

      lastEvaluationRef.current = {
        timestamp: now,
        coords: {
          latitude: Number(coords.latitude),
          longitude: Number(coords.longitude),
        },
      };

      try {
        const candidate = await evaluatePreferredFuelAlert(coords);
        if (candidate) {
          await triggerPreferredFuelAlert(candidate);
        }
      } catch (_error) {
        // Keep the app usable even if a station lookup fails mid-drive.
      }
    },
    [enabled]
  );

  const syncMonitoring = React.useCallback(
    async (forceLocationCheck = false) => {
      if (!enabled) {
        stopWatcher();
        return;
      }
      if (syncInFlightRef.current) return;

      syncInFlightRef.current = true;
      try {
        const preferences = await loadFuelAlertPreferences();
        const shouldMonitor =
          preferences.pushNotifications &&
          preferences.nearbyFuelAlerts &&
          preferences.locationSharing;

        if (!shouldMonitor) {
          stopWatcher();
          return;
        }

        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          stopWatcher();
          return;
        }

        await configureFuelAlertNotificationsAsync();

        if (!watcherRef.current) {
          watcherRef.current = await Location.watchPositionAsync(
            LOCATION_WATCH_OPTIONS,
            (position) => {
              evaluateFromCoords(position?.coords);
            }
          );
        }

        const shouldForceCurrentPosition =
          forceLocationCheck ||
          !lastEvaluationRef.current.timestamp ||
          Date.now() - lastEvaluationRef.current.timestamp >= FORCE_LOCATION_RECHECK_MS;

        if (shouldForceCurrentPosition) {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          await evaluateFromCoords(current?.coords, true);
        }
      } catch (_error) {
        // Ignore transient monitor errors and retry on the next sync.
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [enabled, evaluateFromCoords, stopWatcher]
  );

  React.useEffect(() => {
    if (!enabled) {
      stopWatcher();
      lastEvaluationRef.current = { timestamp: 0, coords: null };
      return undefined;
    }

    syncMonitoring(true);
    const intervalId = setInterval(() => {
      syncMonitoring(false);
    }, PREF_SYNC_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      stopWatcher();
      lastEvaluationRef.current = { timestamp: 0, coords: null };
    };
  }, [enabled, stopWatcher, syncMonitoring]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        enabled &&
        (previousState === "background" || previousState === "inactive") &&
        nextState === "active"
      ) {
        syncMonitoring(true);
      }
    });

    return () => subscription.remove();
  }, [enabled, syncMonitoring]);

  return null;
}

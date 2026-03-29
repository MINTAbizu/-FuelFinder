import React from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";

import {
  configureFuelAlertNotificationsAsync,
  disableDevicePushTokenRegistrationAsync,
  loadFuelAlertPreferences,
  storeQueueApproachingAlert,
  storeQueueTurnAlert,
  syncDevicePushTokenRegistrationAsync,
} from "../services/fuelAlertService";

const PUSH_SYNC_INTERVAL_MS = 1000 * 60 * 3;

function normalizeText(value) {
  return String(value || "").trim();
}

async function persistNotificationEvent(notification) {
  const content = notification?.request?.content || notification?.notification?.request?.content;
  const data = content?.data && typeof content.data === "object" ? content.data : {};
  const type = normalizeText(data?.type).toLowerCase();
  const title = normalizeText(content?.title);
  const body = normalizeText(content?.body);

  if (type === "queue_turn_called") {
    await storeQueueTurnAlert(
      {
        ...data,
        title,
        body,
        message: body,
      },
      { showSystemNotification: false }
    );
    return true;
  }

  if (type === "queue_turn_approaching") {
    await storeQueueApproachingAlert(
      {
        ...data,
        title,
        body,
        message: body,
      },
      { showSystemNotification: false }
    );
    return true;
  }

  return false;
}

export default function PushNotificationMonitor({ enabled }) {
  const appStateRef = React.useRef(AppState.currentState);

  const syncPushRegistration = React.useCallback(async () => {
    if (!enabled) return;

    try {
      const preferences = await loadFuelAlertPreferences();
      if (!preferences.pushNotifications) {
        await disableDevicePushTokenRegistrationAsync();
        return;
      }

      await configureFuelAlertNotificationsAsync();
      await syncDevicePushTokenRegistrationAsync({ allowPermissionPrompt: false });
    } catch (_error) {
      // Ignore transient registration failures and retry later.
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return undefined;

    void syncPushRegistration();
    const intervalId = setInterval(() => {
      void syncPushRegistration();
    }, PUSH_SYNC_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [enabled, syncPushRegistration]);

  React.useEffect(() => {
    if (!enabled) return undefined;

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        (previousState === "background" || previousState === "inactive") &&
        nextState === "active"
      ) {
        void syncPushRegistration();
      }
    });

    const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      void persistNotificationEvent(notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      void persistNotificationEvent(response?.notification);
    });

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response?.notification) {
          return persistNotificationEvent(response.notification);
        }
        return null;
      })
      .catch(() => null);

    return () => {
      appStateSubscription.remove();
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [enabled, syncPushRegistration]);

  return null;
}

import React from "react";
import { Alert, AppState } from "react-native";

import { useAuth } from "../context/AuthContext";
import { subscribeQueueTurnAlerts } from "../services/realtimeSocket";
import {
  storeQueueApproachingAlert,
  storeQueueTurnAlert,
} from "../services/fuelAlertService";
import { getMyActiveTickets } from "../services/queueService";

const POLL_INTERVAL_MS = 15000;
const QUEUE_APPROACHING_PEOPLE_AHEAD_THRESHOLD = 3;
const AVERAGE_MINUTES_PER_CAR = 3;

function buildQueueTurnPayload(ticket) {
  const stationName = String(ticket?.stationName || "").trim() || "Fuel Station";
  const reservationCode = String(ticket?.reservationCode || "").trim();
  return {
    alertId: `queue_turn_${String(ticket?.ticketId || ticket?.reservationId || "").trim()}`,
    ticketId: String(ticket?.ticketId || ticket?.reservationId || "").trim(),
    reservationCode,
    stationId: String(ticket?.stationId || "").trim(),
    stationName,
    address: String(ticket?.address || "").trim(),
    title: "It's your turn",
    message: `FuelFinder: It's your turn at ${stationName}.${reservationCode ? ` Ticket ${reservationCode}.` : ""} Please go to the station now.`,
  };
}

function buildQueueApproachingPayload(ticket) {
  const ticketId = String(ticket?.ticketId || ticket?.reservationId || "").trim();
  const position = Number(ticket?.position || 0);
  const peopleAhead = Math.max(0, position - 1);
  if (!ticketId || peopleAhead <= 0 || peopleAhead > QUEUE_APPROACHING_PEOPLE_AHEAD_THRESHOLD) {
    return null;
  }

  const stationName = String(ticket?.stationName || "").trim() || "Fuel Station";
  const reservationCode = String(ticket?.reservationCode || "").trim();
  return {
    alertId: `queue_approaching_${ticketId}`,
    ticketId,
    reservationCode,
    stationId: String(ticket?.stationId || "").trim(),
    stationName,
    address: String(ticket?.address || "").trim(),
    title: "Please arrive soon",
    peopleAhead,
    etaMinutes: Math.max(1, peopleAhead * AVERAGE_MINUTES_PER_CAR),
  };
}

export default function QueueTurnAlertMonitor({ enabled }) {
  const { accessToken } = useAuth();
  const appStateRef = React.useRef(AppState.currentState);
  const lastPopupAlertIdRef = React.useRef("");

  const maybeShowAlert = React.useCallback(async (storeAlert, payload, showSystemNotification, fallbackTitle, fallbackBody) => {
    const event = await storeAlert(payload, {
      showSystemNotification,
    });
    if (!event?.created || showSystemNotification) {
      return;
    }

    if (lastPopupAlertIdRef.current === event.id) {
      return;
    }
    lastPopupAlertIdRef.current = event.id;

    Alert.alert(event.title || fallbackTitle, event.body || fallbackBody);
  }, []);

  const pollQueueTickets = React.useCallback(async () => {
    try {
      const tickets = await getMyActiveTickets();
      const activeCalledTickets = tickets.filter(
        (ticket) => String(ticket?.status || "").trim().toLowerCase() === "called"
      );
      const approachingTickets = tickets
        .filter((ticket) => String(ticket?.status || "").trim().toLowerCase() === "waiting")
        .map(buildQueueApproachingPayload)
        .filter(Boolean);

      const shouldShowPopup = appStateRef.current === "active";
      for (const ticket of activeCalledTickets) {
        await maybeShowAlert(
          storeQueueTurnAlert,
          buildQueueTurnPayload(ticket),
          !shouldShowPopup,
          "It's your turn",
          "Your turn has arrived."
        );
      }

      for (const payload of approachingTickets) {
        await maybeShowAlert(
          storeQueueApproachingAlert,
          payload,
          !shouldShowPopup,
          payload.title || "Please arrive soon",
          "Your turn is getting close. Please start heading to the station."
        );
      }
    } catch (_error) {
      // Ignore transient polling errors. Realtime and the next poll will retry.
    }
  }, [maybeShowAlert]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if ((previousState === "background" || previousState === "inactive") && nextState === "active") {
        void pollQueueTickets();
      }
    });

    return () => subscription.remove();
  }, [pollQueueTickets]);

  React.useEffect(() => {
    if (!enabled || !accessToken) {
      return undefined;
    }

    void pollQueueTickets();
    const pollIntervalId = setInterval(() => {
      void pollQueueTickets();
    }, POLL_INTERVAL_MS);

    const unsubscribe = subscribeQueueTurnAlerts({
      token: accessToken,
      onQueueTurnAlert: async (payload) => {
        const shouldShowPopup = appStateRef.current === "active";
        await maybeShowAlert(
          storeQueueTurnAlert,
          payload,
          !shouldShowPopup,
          "It's your turn",
          "Your turn has arrived."
        );
      },
    });

    return () => {
      clearInterval(pollIntervalId);
      unsubscribe?.();
    };
  }, [accessToken, enabled, maybeShowAlert, pollQueueTickets]);

  return null;
}

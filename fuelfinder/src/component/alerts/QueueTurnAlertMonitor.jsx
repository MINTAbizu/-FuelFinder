import React from "react";
import { Alert, AppState } from "react-native";

import { useAuth } from "../context/AuthContext";
import { subscribeQueueTurnAlerts } from "../services/realtimeSocket";
import { storeQueueTurnAlert } from "../services/fuelAlertService";
import { getMyActiveTickets } from "../services/queueService";

const POLL_INTERVAL_MS = 15000;

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

export default function QueueTurnAlertMonitor({ enabled }) {
  const { accessToken } = useAuth();
  const appStateRef = React.useRef(AppState.currentState);
  const lastPopupAlertIdRef = React.useRef("");

  const maybeShowAlert = React.useCallback(async (payload, showSystemNotification) => {
    const event = await storeQueueTurnAlert(payload, {
      showSystemNotification,
    });
    if (!event?.created || showSystemNotification) {
      return;
    }

    if (lastPopupAlertIdRef.current === event.id) {
      return;
    }
    lastPopupAlertIdRef.current = event.id;

    Alert.alert(event.title || "It's your turn", event.body || "Your turn has arrived.");
  }, []);

  const pollCalledTickets = React.useCallback(async () => {
    try {
      const tickets = await getMyActiveTickets();
      const activeCalledTickets = tickets.filter(
        (ticket) => String(ticket?.status || "").trim().toLowerCase() === "called"
      );
      if (!activeCalledTickets.length) {
        return;
      }

      const shouldShowPopup = appStateRef.current === "active";
      for (const ticket of activeCalledTickets) {
        await maybeShowAlert(buildQueueTurnPayload(ticket), !shouldShowPopup);
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
        void pollCalledTickets();
      }
    });

    return () => subscription.remove();
  }, [pollCalledTickets]);

  React.useEffect(() => {
    if (!enabled || !accessToken) {
      return undefined;
    }

    void pollCalledTickets();
    const pollIntervalId = setInterval(() => {
      void pollCalledTickets();
    }, POLL_INTERVAL_MS);

    const unsubscribe = subscribeQueueTurnAlerts({
      token: accessToken,
      onQueueTurnAlert: async (payload) => {
        const shouldShowPopup = appStateRef.current === "active";
        await maybeShowAlert(payload, !shouldShowPopup);
      },
    });

    return () => {
      clearInterval(pollIntervalId);
      unsubscribe?.();
    };
  }, [accessToken, enabled, maybeShowAlert, pollCalledTickets]);

  return null;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { useAuth } from "./AuthContext";
import api from "../services/api";
import {
  flushPendingOfflineActions,
  getCurrentOfflineState,
  getPendingOfflineActions,
  subscribeToOfflineStatus,
  subscribeToPendingOfflineActions,
} from "../services/offlineService";

const OfflineContext = createContext(null);
const OFFLINE_SYNC_INTERVAL_MS = 20000;

export function OfflineProvider({ children }) {
  const { user } = useAuth();
  const [isOffline, setIsOffline] = useState(getCurrentOfflineState());
  const [pendingActionsCount, setPendingActionsCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncPromiseRef = useRef(null);

  const refreshPendingActions = useCallback(async () => {
    const actions = await getPendingOfflineActions();
    setPendingActionsCount(actions.length);
    return actions;
  }, []);

  const syncPendingActions = useCallback(async () => {
    if (!user) {
      await refreshPendingActions();
      return { processed: 0, remaining: pendingActionsCount };
    }

    if (syncPromiseRef.current) {
      return syncPromiseRef.current;
    }

    syncPromiseRef.current = (async () => {
      setIsSyncing(true);
      try {
        return await flushPendingOfflineActions({
          "profile.update": async (action) => {
            await api.patch("/auth/me", action?.payload || {});
          },
          "queue.reserve": async (action) => {
            await api.post("/queue/reserve", action?.payload || {});
          },
          "queue.leave": async (action) => {
            const ticketId = String(action?.payload?.ticketId || "").trim();
            if (!ticketId) return;
            await api.post("/queue/leave", { ticketId });
          },
        });
      } finally {
        await refreshPendingActions();
        setIsSyncing(false);
        syncPromiseRef.current = null;
      }
    })();

    return syncPromiseRef.current;
  }, [pendingActionsCount, refreshPendingActions, user]);

  useEffect(() => {
    refreshPendingActions();

    const unsubscribeOffline = subscribeToOfflineStatus((nextValue) => {
      setIsOffline(Boolean(nextValue));
    });
    const unsubscribePending = subscribeToPendingOfflineActions((actions) => {
      setPendingActionsCount(Array.isArray(actions) ? actions.length : 0);
    });

    return () => {
      unsubscribeOffline();
      unsubscribePending();
    };
  }, [refreshPendingActions]);

  useEffect(() => {
    if (!pendingActionsCount) return undefined;

    const intervalId = setInterval(() => {
      void syncPendingActions();
    }, OFFLINE_SYNC_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [pendingActionsCount, syncPendingActions]);

  useEffect(() => {
    if (!pendingActionsCount || !user) return;
    void syncPendingActions();
  }, [pendingActionsCount, syncPendingActions, user]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncPendingActions();
      }
    });

    return () => subscription.remove();
  }, [syncPendingActions]);

  const value = useMemo(
    () => ({
      isOffline,
      isSyncing,
      pendingActionsCount,
      syncPendingActions,
    }),
    [isOffline, isSyncing, pendingActionsCount, syncPendingActions]
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) {
    throw new Error("useOffline must be used within OfflineProvider");
  }
  return ctx;
}

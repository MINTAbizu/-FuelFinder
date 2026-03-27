import api from "./api";
import {
  buildOfflineCacheKey,
  enqueueOfflineAction,
  isNetworkError,
  readCachedOfflineData,
  requestWithOfflineCache,
  writeCachedOfflineData,
} from "./offlineService";

export async function reserveQueueSlot(payload) {
  try {
    const { data } = await api.post("/queue/reserve", payload);
    return data;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    const queuedAction = await enqueueOfflineAction({
      type: "queue.reserve",
      payload,
    });

    return {
      offlineQueued: true,
      queueId: queuedAction.id,
      reservationId: queuedAction.id,
      reservationCode: "OFFLINE",
      message: "Queue request saved offline. It will sync when you reconnect.",
    };
  }
}

export async function startTelebirrCheckout(reservationId) {
  const { data } = await api.post("/queue/payments/telebirr/initiate", { reservationId });
  return data;
}
export async function startChapaCheckout(payload) {
  const { data } = await api.post("/payments/initialize", payload);
  return data;
}

export async function verifyChapaPayment(txRef) {
  const { data } = await api.get(`/payments/verify/${txRef}`);
  return data;
}

export async function exchangeTelebirrAuthToken(authToken) {
  const { data } = await api.post("/queue/payments/telebirr/auth-token", { authToken });
  return data;
}

export async function getReservationStatus(reservationId) {
  const { data } = await api.get(`/queue/reservation/${reservationId}`);
  return data;
}

export async function confirmQueuePayment(payload) {
  const { data } = await api.post("/queue/confirm-payment", payload);
  return data;
}

export async function getMyQueueTicket(stationId) {
  const cacheKey = buildOfflineCacheKey("queue.me", { stationId });
  const EMPTY_TICKET_CACHE = { __offlineEmpty: true };

  try {
    const { data } = await api.get(`/queue/me/${stationId}`);
    await writeCachedOfflineData(cacheKey, data);
    return data;
  } catch (error) {
    if (Number(error?.response?.status || 0) === 404) {
      await writeCachedOfflineData(cacheKey, EMPTY_TICKET_CACHE);
      throw error;
    }

    if (!isNetworkError(error)) {
      throw error;
    }

    const cached = await readCachedOfflineData(cacheKey, 1000 * 60 * 10);
    if (cached && cached.__offlineEmpty) {
      return null;
    }
    if (cached !== null) {
      return cached;
    }

    throw error;
  }
}

export async function getMyActiveTickets() {
  const { data } = await api.get("/queue/me");
  return Array.isArray(data?.tickets) ? data.tickets : [];
}

export async function leaveQueue(ticketId) {
  try {
    const { data } = await api.post("/queue/leave", { ticketId });
    return data;
  } catch (error) {
    if (!isNetworkError(error)) {
      throw error;
    }

    const queuedAction = await enqueueOfflineAction({
      type: "queue.leave",
      payload: { ticketId },
    });

    return {
      offlineQueued: true,
      queueId: queuedAction.id,
      message: "Leave-queue request saved offline. It will sync when you reconnect.",
    };
  }
}

export async function getStationQueue(stationId) {
  return requestWithOfflineCache({
    cacheKey: buildOfflineCacheKey("queue.station", { stationId }),
    maxAgeMs: 1000 * 60 * 10,
    request: async () => {
      const { data } = await api.get(`/queue/station/${stationId}`);
      return data;
    },
  });
}

export async function getPublicStationDetails(stationId) {
  return requestWithOfflineCache({
    cacheKey: buildOfflineCacheKey("station.details", { stationId }),
    maxAgeMs: 1000 * 60 * 60 * 24,
    request: async () => {
      const { data } = await api.get(`/map/stations/${stationId}`);
      return data?.station || data;
    },
  });
}

export async function startStationCheckIn(payload) {
  const { data } = await api.post("/queue/check-in/start", payload);
  return data;
}

export async function verifyStationCheckIn(payload) {
  const { data } = await api.post("/queue/check-in/verify", payload);
  return data;
}

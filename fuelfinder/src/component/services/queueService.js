import api from "./api";

export async function reserveQueueSlot(payload) {
  const { data } = await api.post("/queue/reserve", payload);
  return data;
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
  const { data } = await api.get(`/queue/me/${stationId}`);
  return data;
}

export async function leaveQueue(ticketId) {
  const { data } = await api.post("/queue/leave", { ticketId });
  return data;
}

export async function getStationQueue(stationId) {
  const { data } = await api.get(`/queue/station/${stationId}`);
  return data;
}

export async function startStationCheckIn(payload) {
  const { data } = await api.post("/queue/check-in/start", payload);
  return data;
}

export async function verifyStationCheckIn(payload) {
  const { data } = await api.post("/queue/check-in/verify", payload);
  return data;
}

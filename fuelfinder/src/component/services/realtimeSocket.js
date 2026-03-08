import { io } from "socket.io-client";
import { API_BASE_URL } from "./api";

const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, "");

let socket = null;
let socketToken = "";

function buildSocket(token) {
  return io(SOCKET_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    transports: ["websocket"],
    auth: { token },
  });
}

function getSocket(token) {
  const nextToken = String(token || "").trim();
  if (!nextToken) return null;

  if (socket && socketToken === nextToken) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  if (socket) {
    try {
      socket.disconnect();
    } catch (_error) {
      // no-op
    }
    socket = null;
  }

  socketToken = nextToken;
  socket = buildSocket(nextToken);
  return socket;
}

export function subscribeStationRealtime({
  token,
  stationId,
  onQueueUpdated,
  onFuelUpdated,
  onTicketCalled,
  onConnectionState,
  onError,
}) {
  const station = String(stationId || "").trim();
  const sock = getSocket(token);
  if (!sock || !station) {
    return () => {};
  }

  const handleConnect = () => {
    if (typeof onConnectionState === "function") onConnectionState(true);
    sock.emit("join_station_room", station, (ack) => {
      if (ack && ack.ok === false && typeof onError === "function") {
        onError(ack.message || "Failed to join station realtime room.");
      }
    });
  };
  const handleDisconnect = () => {
    if (typeof onConnectionState === "function") onConnectionState(false);
  };
  const handleQueueUpdated = (payload) => {
    if (String(payload?.stationId || "") !== station) return;
    if (typeof onQueueUpdated === "function") onQueueUpdated(payload);
  };
  const handleFuelUpdated = (payload) => {
    if (String(payload?.stationId || "") !== station) return;
    if (typeof onFuelUpdated === "function") onFuelUpdated(payload);
  };
  const handleTicketCalled = (payload) => {
    if (String(payload?.stationId || "") !== station) return;
    if (typeof onTicketCalled === "function") onTicketCalled(payload);
  };
  const handleConnectError = (err) => {
    if (typeof onError === "function") {
      onError(err?.message || "Realtime connection failed.");
    }
  };

  sock.on("connect", handleConnect);
  sock.on("disconnect", handleDisconnect);
  sock.on("queue_updated", handleQueueUpdated);
  sock.on("station_fuel_updated", handleFuelUpdated);
  sock.on("ticket_called", handleTicketCalled);
  sock.on("connect_error", handleConnectError);

  if (sock.connected) {
    handleConnect();
  } else if (!sock.active) {
    sock.connect();
  }

  return () => {
    try {
      sock.emit("leave_station_room", station);
    } catch (_error) {
      // no-op
    }
    sock.off("connect", handleConnect);
    sock.off("disconnect", handleDisconnect);
    sock.off("queue_updated", handleQueueUpdated);
    sock.off("station_fuel_updated", handleFuelUpdated);
    sock.off("ticket_called", handleTicketCalled);
    sock.off("connect_error", handleConnectError);
  };
}


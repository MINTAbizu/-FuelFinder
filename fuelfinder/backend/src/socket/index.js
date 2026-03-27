const { Server } = require("socket.io");
const { verifyAccessToken } = require("../utils/tokens");
const User = require("../models/User");
const { createCorsOriginHandler } = require("../config/corsOrigins");

let io = null;

function userRoom(userId) {
  return `user:${String(userId || "").trim()}`;
}

function initSocket(server) {
  const isProduction = process.env.NODE_ENV === "production";
  io = new Server(server, {
    cors: {
      origin: createCorsOriginHandler({ isProduction }),
      methods: ["GET", "POST", "PATCH"]
    }
  });

  io.use(async (socket, next) => {
    try {
      const authToken = String(socket.handshake?.auth?.token || "").trim();
      const headerAuth = String(socket.handshake?.headers?.authorization || "").trim();
      const bearerToken = headerAuth.startsWith("Bearer ") ? headerAuth.slice(7).trim() : "";
      const token = authToken || bearerToken;
      if (!token) {
        return next(new Error("Unauthorized socket connection."));
      }

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select(
        "_id role isBlocked stationIds organizationId cityIds branchIds"
      );
      if (!user) {
        return next(new Error("Unauthorized socket connection."));
      }
      if (user.isBlocked) {
        return next(new Error("Account blocked."));
      }

      socket.data.user = {
        id: String(user._id),
        role: String(user.role || ""),
        stationIds: Array.isArray(user.stationIds) ? user.stationIds.map((id) => String(id)) : [],
        organizationId: user.organizationId ? String(user.organizationId) : "",
        cityIds: Array.isArray(user.cityIds) ? user.cityIds.map((id) => String(id)) : [],
        branchIds: Array.isArray(user.branchIds) ? user.branchIds.map((id) => String(id)) : []
      };
      return next();
    } catch (_err) {
      return next(new Error("Unauthorized socket connection."));
    }
  });

  io.on("connection", (socket) => {
    const socketUserId = String(socket.data?.user?.id || "").trim();
    if (socketUserId) {
      socket.join(userRoom(socketUserId));
    }

    socket.on("join_station_room", (stationId, ack) => {
      const stationValue = String(stationId || "").trim();
      if (!stationValue) {
        if (typeof ack === "function") ack({ ok: false, message: "stationId is required." });
        return;
      }

      const role = String(socket.data?.user?.role || "");
      const allowedStationIds = Array.isArray(socket.data?.user?.stationIds)
        ? socket.data.user.stationIds
        : [];
      const canJoin =
        role === "super_admin" || !allowedStationIds.length || allowedStationIds.includes(stationValue);

      if (!canJoin) {
        if (typeof ack === "function") {
          ack({ ok: false, message: "Forbidden: station scope denied." });
        }
        return;
      }

      socket.join(`station:${stationValue}`);
      if (typeof ack === "function") ack({ ok: true, room: `station:${stationValue}` });
    });

    socket.on("leave_station_room", (stationId, ack) => {
      const stationValue = String(stationId || "").trim();
      if (!stationValue) {
        if (typeof ack === "function") ack({ ok: false, message: "stationId is required." });
        return;
      }

      socket.leave(`station:${stationValue}`);
      if (typeof ack === "function") ack({ ok: true, room: `station:${stationValue}` });
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO, userRoom };

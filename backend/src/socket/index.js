const { Server } = require("socket.io");

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "*",
      methods: ["GET", "POST", "PATCH"]
    }
  });

  io.on("connection", (socket) => {
    socket.on("join_station_room", (stationId) => {
      if (!stationId) return;
      socket.join(`station:${stationId}`);
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO };

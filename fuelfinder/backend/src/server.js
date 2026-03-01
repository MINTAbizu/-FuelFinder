require("dotenv").config();
const http = require("http");

const app = require("./app");
const connectDB = require("./config/db");
const { initSocket } = require("./socket");

const PORT = Number(process.env.PORT || 5000);
const HOST = process.env.HOST || "0.0.0.0";

async function start() {
  try {
    await connectDB();

    // connect to database before starting the server
    

    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, HOST, () => {
      console.log(`Server listening on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error.message);
    process.exit(1);
  }
}

start();

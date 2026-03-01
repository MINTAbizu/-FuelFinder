const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const queueRoutes = require("./routes/queueRoutes");

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "*"
  })
);
app.use(morgan("dev"));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "fuelfinder-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/queue", queueRoutes);
app.use("/auth", authRoutes);
app.use("/queue", queueRoutes);

module.exports = app;

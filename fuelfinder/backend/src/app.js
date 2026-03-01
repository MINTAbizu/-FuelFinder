const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const queueRoutes = require("./routes/queueRoutes");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const rawClientOrigin = String(process.env.CLIENT_ORIGIN || "").trim();
const allowedOrigins = rawClientOrigin
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAnyOrigin = allowedOrigins.includes("*");

app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowAnyOrigin && !isProduction) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin denied."));
    }
  })
);
app.use(morgan("dev"));
app.use(
  express.json({
    limit: "1mb",
    verify(req, _res, buf) {
      req.rawBody = buf.toString("utf8");
    }
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "fuelfinder-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/queue", queueRoutes);
app.use("/auth", authRoutes);
app.use("/queue", queueRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: "Route not found." });
});

app.use((err, _req, res, _next) => {
  if (err && err.message === "CORS origin denied.") {
    return res.status(403).json({ message: "CORS origin denied." });
  }

  const status = Number(err && err.status) || 500;
  return res.status(status).json({
    message: status >= 500 ? "Internal server error." : err.message || "Request failed."
  });
});

module.exports = app;

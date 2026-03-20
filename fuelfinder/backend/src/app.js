const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const queueRoutes = require("./routes/queueRoutes");
const mapRoutes = require("./routes/mapRoutes");
const adminRoutes = require("./routes/adminRoutes");
const chapaPaymentRoutes = require("./routes/chapapayment.routes");
const ownerRoutes = require("./routes/ownerRoutes");
const { createCorsOriginHandler } = require("./config/corsOrigins");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const corsOptions = {
  origin: createCorsOriginHandler({ isProduction }),
  optionsSuccessStatus: 204,
};

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
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

app.get("/payment-success", (_req, res) => {
  res.status(200).send("Payment completed. You may return to the app.");
});

app.use("/api/auth", authRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/map", mapRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/auth", authRoutes);
app.use("/queue", queueRoutes);
app.use("/map", mapRoutes);
app.use("/admin", adminRoutes);
app.use("/owner", ownerRoutes);
app.use("/api/payments", chapaPaymentRoutes);


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

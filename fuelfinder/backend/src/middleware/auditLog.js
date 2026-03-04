const AuditLog = require("../models/AuditLog");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "refreshToken",
  "refreshTokenHash",
  "adminRegistrationKey"
]);

function sanitize(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, raw] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : sanitize(raw);
    }
    return out;
  }
  return value;
}

function auditAction(action, options = {}) {
  const { targetType = "" } = options;

  return (req, res, next) => {
    if (!WRITE_METHODS.has(String(req.method || "").toUpperCase())) {
      return next();
    }

    const snapshot = {
      params: sanitize(req.params || {}),
      query: sanitize(req.query || {}),
      body: sanitize(req.body || {})
    };

    res.on("finish", () => {
      AuditLog.create({
        actorUserId: req.user?.id || null,
        actorRole: String(req.user?.role || ""),
        action,
        method: String(req.method || "").toUpperCase(),
        path: String(req.originalUrl || req.url || ""),
        statusCode: Number(res.statusCode || 0),
        ip: String(req.ip || ""),
        userAgent: String(req.get("user-agent") || ""),
        targetType,
        targetId:
          String(req.params?.id || req.body?.id || req.body?.userId || req.query?.id || "").trim() || "",
        request: snapshot
      }).catch(() => {
        // Fire-and-forget; audit must never break business requests.
      });
    });

    return next();
  };
}

module.exports = {
  auditAction
};


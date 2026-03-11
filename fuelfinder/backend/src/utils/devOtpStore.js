const isDev = String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production";

const store = new Map();

function setDevOtp(userId, otpCode, expiresAt) {
  if (!isDev) return;
  const id = String(userId || "").trim();
  if (!id) return;
  store.set(id, {
    otpCode: String(otpCode || ""),
    expiresAt: expiresAt ? new Date(expiresAt) : null
  });
}

function getDevOtp(userId) {
  if (!isDev) return null;
  const id = String(userId || "").trim();
  if (!id) return null;
  const entry = store.get(id);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= new Date()) {
    store.delete(id);
    return null;
  }
  return entry;
}

module.exports = {
  setDevOtp,
  getDevOtp
};

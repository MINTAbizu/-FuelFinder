const jwt = require("jsonwebtoken");

const ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

function getSecrets() {
  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  if (!accessSecret || !refreshSecret) {
    throw new Error("JWT secrets are missing. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.");
  }
  return { accessSecret, refreshSecret };
}

function signAccessToken(payload) {
  const { accessSecret } = getSecrets();
  return jwt.sign(payload, accessSecret, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function signRefreshToken(payload) {
  const { refreshSecret } = getSecrets();
  return jwt.sign(payload, refreshSecret, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

function verifyAccessToken(token) {
  const { accessSecret } = getSecrets();
  return jwt.verify(token, accessSecret);
}

function verifyRefreshToken(token) {
  const { refreshSecret } = getSecrets();
  return jwt.verify(token, refreshSecret);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};

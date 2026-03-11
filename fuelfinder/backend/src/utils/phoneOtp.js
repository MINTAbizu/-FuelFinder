const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const OTP_TTL_SECONDS = Number(process.env.PHONE_OTP_TTL_SECONDS || 300);
const OTP_TOKEN_EXPIRES_IN = process.env.PHONE_OTP_TOKEN_EXPIRES_IN || "15m";

function getOtpSecret() {
  const secret = process.env.PHONE_OTP_TOKEN_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error("Missing PHONE_OTP_TOKEN_SECRET or JWT_ACCESS_SECRET for phone OTP tokens.");
  }
  return secret;
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtpCode(code) {
  return crypto.createHash("sha256").update(String(code || ""), "utf8").digest("hex");
}

function verifyOtpHash(savedHash, code) {
  const incomingHash = hashOtpCode(code);
  const saved = String(savedHash || "");
  if (!saved || saved.length !== incomingHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(saved), Buffer.from(incomingHash));
}

function signPhoneOtpToken(payload) {
  return jwt.sign(payload, getOtpSecret(), { expiresIn: OTP_TOKEN_EXPIRES_IN });
}

function verifyPhoneOtpToken(token) {
  return jwt.verify(token, getOtpSecret());
}

module.exports = {
  OTP_TTL_SECONDS,
  OTP_TOKEN_EXPIRES_IN,
  generateOtpCode,
  hashOtpCode,
  verifyOtpHash,
  signPhoneOtpToken,
  verifyPhoneOtpToken
};

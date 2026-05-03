const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const { sendEmail } = require("../services/emailService");
const { sendSms } = require("../services/smsService");
const { getFirebaseAuth } = require("../services/firebaseAdmin");
const { setDevOtp, getDevOtp } = require("../utils/devOtpStore");
const {
  OTP_TTL_SECONDS,
  generateOtpCode,
  hashOtpCode,
  verifyOtpHash,
  signPhoneOtpToken,
  verifyPhoneOtpToken
} = require("../utils/phoneOtp");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require("../utils/tokens");
const { normalizeStationType } = require("../utils/stationType");

const PASSWORD_SALT_ROUNDS = Math.max(8, Number(process.env.PASSWORD_SALT_ROUNDS || 10));
const PHONE_OTP_MAX_ATTEMPTS = Number(process.env.PHONE_OTP_MAX_ATTEMPTS || 5);
const PHONE_OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.PHONE_OTP_RESEND_COOLDOWN_SECONDS || 60);
const EMAIL_VERIFICATION_TTL_SECONDS = Number(process.env.EMAIL_VERIFICATION_TTL_SECONDS || 60 * 60 * 24);
const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = Number(
  process.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS || 120
);
const OTP_SMS_RESPONSE_WAIT_MS = Math.max(
  0,
  Number(process.env.OTP_SMS_RESPONSE_WAIT_MS || 1500)
);
const PUBLIC_USER_SELECT =
  "_id name email emailVerified pendingEmail phone phoneVerified twoFactorEnabled authProvider isBlocked role vehicleRegistrationType plateNumber plateNumberKey preferredStationType organizationId cityIds stationIds branchIds createdAt";
const AUTH_FLOW_USER_SELECT = `${PUBLIC_USER_SELECT} passwordHash refreshTokenHash googleSub biometricDevices emailVerificationHash emailVerificationExpiresAt emailVerificationLastSentAt pendingEmailVerificationHash pendingEmailVerificationExpiresAt pendingEmailVerificationLastSentAt phoneVerificationHash phoneVerificationExpiresAt phoneVerificationAttempts phoneVerificationLastSentAt twoFactorOtpHash twoFactorOtpExpiresAt twoFactorOtpAttempts twoFactorOtpLastSentAt passwordResetHash passwordResetExpiresAt passwordResetAttempts passwordResetLastSentAt`;
const REFRESH_USER_SELECT = `${PUBLIC_USER_SELECT} refreshTokenHash`;
const BIOMETRIC_USER_SELECT = `${PUBLIC_USER_SELECT} biometricDevices`;
const BCRYPT_HASH_PREFIX = /^\$2[abxy]\$\d{2}\$/;
const LOCAL_PLATE_EMAIL_DOMAIN = "plate.fuelfinder.local";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildPlateNumberKey(value) {
  return String(value || "").trim().replace(/\D/g, "");
}

function normalizePhone(phone) {
  return String(phone || "").trim().replace(/[^\d+]/g, "");
}

function buildLocalPlateEmail(plateNumberKey) {
  return `${buildPlateNumberKey(plateNumberKey)}@${LOCAL_PLATE_EMAIL_DOMAIN}`;
}

function isLocalPlateEmail(email) {
  return normalizeEmail(email).endsWith(`@${LOCAL_PLATE_EMAIL_DOMAIN}`);
}

function normalizePushToken(value) {
  return String(value || "").trim();
}

function isValidExpoPushToken(value) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(normalizePushToken(value));
}

function buildAuthPayload(user) {
  return {
    sub: String(user._id),
    email: isLocalPlateEmail(user.email) ? "" : user.email,
    name: user.name,
    role: user.role || "customer",
    vehicleRegistrationType: user.vehicleRegistrationType || "",
    plateNumber: user.plateNumber || "",
    organizationId: user.organizationId ? String(user.organizationId) : "",
    authProvider: user.authProvider || "local"
  };
}

function buildUserResponse(user) {
  return {
    id: user._id,
    name: user.name,
    email: isLocalPlateEmail(user.email) ? "" : user.email,
    emailVerified: isLocalPlateEmail(user.email) ? false : Boolean(user.emailVerified),
    pendingEmail: String(user.pendingEmail || ""),
    pendingEmailMasked: maskEmailForDisplay(user.pendingEmail || ""),
    phone: user.phone || "",
    phoneVerified: Boolean(user.phoneVerified),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    authProvider: user.authProvider || "local",
    isBlocked: Boolean(user.isBlocked),
    role: user.role || "customer",
    vehicleRegistrationType: user.vehicleRegistrationType || "",
    plateNumber: user.plateNumber || "",
    preferredStationType: normalizeStationType(user.preferredStationType) || "",
    organizationId: user.organizationId || null,
    cityIds: user.cityIds || [],
    stationIds: user.stationIds || [],
    branchIds: user.branchIds || [],
    createdAt: user.createdAt
  };
}

function buildPhoneVerificationMessage(code) {
  const minutes = Math.max(1, Math.ceil(OTP_TTL_SECONDS / 60));
  return `Your FuelFinder verification code is ${code}. It expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function buildTwoFactorMessage(code) {
  const minutes = Math.max(1, Math.ceil(OTP_TTL_SECONDS / 60));
  return `Your FuelFinder security code is ${code}. It expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function buildPasswordResetMessage(code) {
  const minutes = Math.max(1, Math.ceil(OTP_TTL_SECONDS / 60));
  return `Your FuelFinder password reset code is ${code}. It expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hashStoredToken(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function verifyStoredTokenHash(savedHash, value) {
  const saved = String(savedHash || "").trim();
  const incoming = hashStoredToken(value);

  if (!saved || saved.length !== incoming.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(saved), Buffer.from(incoming));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(error, fallback = "Unknown error") {
  return String(error?.message || fallback);
}

function buildEmailVerificationUrl(token) {
  const explicitBase = String(process.env.EMAIL_VERIFICATION_BASE_URL || "").trim();
  const port = String(process.env.PORT || "5000").trim() || "5000";
  const baseUrl = explicitBase || `http://localhost:${port}/api/auth/email/verify`;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
}

function buildEmailVerificationMail(targetEmail, verifyUrl, { isEmailChange = false } = {}) {
  const escapedEmail = escapeHtml(targetEmail);
  const escapedUrl = escapeHtml(verifyUrl);
  const actionText = isEmailChange ? "confirm your new email address" : "verify your email address";
  const subject = isEmailChange
    ? "Confirm your new FuelFinder email"
    : "Verify your FuelFinder email";
  const text =
    `Finish setting up your FuelFinder account and ${actionText}.\n\n` +
    `Open this link:\n${verifyUrl}\n\n` +
    `This link expires in ${Math.max(1, Math.ceil(EMAIL_VERIFICATION_TTL_SECONDS / 3600))} hour(s).`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2 style="margin-bottom: 12px;">FuelFinder email verification</h2>
      <p>${isEmailChange ? "A change to your FuelFinder email was requested." : "Thanks for joining FuelFinder."}</p>
      <p>Please confirm <strong>${escapedEmail}</strong> to keep your account secure.</p>
      <p style="margin: 24px 0;">
        <a
          href="${escapedUrl}"
          style="display: inline-block; padding: 12px 18px; background: #0f766e; color: #ffffff; text-decoration: none; border-radius: 10px; font-weight: 700;"
        >
          ${escapeHtml(isEmailChange ? "Confirm new email" : "Verify email")}
        </a>
      </p>
      <p>If the button does not open, copy and paste this link into your browser:</p>
      <p><a href="${escapedUrl}">${escapedUrl}</a></p>
      <p>This link expires in ${Math.max(1, Math.ceil(EMAIL_VERIFICATION_TTL_SECONDS / 3600))} hour(s).</p>
    </div>
  `;

  return { subject, text, html };
}

function sendEmailVerificationPage(res, status, title, message) {
  return res.status(status).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; color: #0f172a; margin: 0; padding: 32px 16px; }
      .card { max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 24px; }
      h1 { margin: 0 0 12px; font-size: 26px; }
      p { margin: 0; line-height: 1.6; color: #475569; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  </body>
</html>`);
}

async function saveOtpChallengeAndDispatchSms(user, message) {
  await user.save();

  const sendPromise = sendSms(String(user.phone || ""), message).catch((error) => {
    console.error("[auth:sms] Failed to send OTP SMS:", error?.message || error);
    throw error;
  });

  if (!OTP_SMS_RESPONSE_WAIT_MS) {
    void sendPromise.catch(() => {});
    return { deliveredInResponseWindow: false };
  }

  const timeoutToken = Symbol("timeout");
  const result = await Promise.race([
    sendPromise,
    wait(OTP_SMS_RESPONSE_WAIT_MS).then(() => timeoutToken),
  ]);

  if (result === timeoutToken) {
    void sendPromise.catch(() => {});
    return { deliveredInResponseWindow: false };
  }

  return { deliveredInResponseWindow: true, provider: result?.provider || "" };
}

async function verifyRefreshTokenHash(savedHash, refreshToken) {
  const normalizedHash = String(savedHash || "").trim();
  if (!normalizedHash) return false;

  if (BCRYPT_HASH_PREFIX.test(normalizedHash)) {
    return bcrypt.compare(refreshToken, normalizedHash);
  }

  return verifyStoredTokenHash(normalizedHash, refreshToken);
}

function getPhoneOtpCooldownRemainingSeconds(user) {
  const lastSentAt = user.phoneVerificationLastSentAt;
  if (!lastSentAt) return 0;
  const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
  const remainingMs = PHONE_OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

function getTwoFactorOtpCooldownRemainingSeconds(user) {
  const lastSentAt = user.twoFactorOtpLastSentAt;
  if (!lastSentAt) return 0;
  const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
  const remainingMs = PHONE_OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

function getPasswordResetCooldownRemainingSeconds(user) {
  const lastSentAt = user.passwordResetLastSentAt;
  if (!lastSentAt) return 0;
  const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
  const remainingMs = PHONE_OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

function getEmailVerificationCooldownRemainingSeconds(user) {
  const lastSentAt = user.emailVerificationLastSentAt;
  if (!lastSentAt) return 0;
  const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
  const remainingMs = EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

function getPendingEmailVerificationCooldownRemainingSeconds(user) {
  const lastSentAt = user.pendingEmailVerificationLastSentAt;
  if (!lastSentAt) return 0;
  const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
  const remainingMs = EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
}

function clearEmailVerificationChallenge(user) {
  user.emailVerificationHash = "";
  user.emailVerificationExpiresAt = null;
  user.emailVerificationLastSentAt = null;
}

function clearTwoFactorChallenge(user) {
  user.twoFactorOtpHash = "";
  user.twoFactorOtpExpiresAt = null;
  user.twoFactorOtpAttempts = 0;
  user.twoFactorOtpLastSentAt = null;
}

function clearPendingEmailVerificationChallenge(user) {
  user.pendingEmail = "";
  user.pendingEmailVerificationHash = "";
  user.pendingEmailVerificationExpiresAt = null;
  user.pendingEmailVerificationLastSentAt = null;
}

function clearPasswordResetChallenge(user) {
  user.passwordResetHash = "";
  user.passwordResetExpiresAt = null;
  user.passwordResetAttempts = 0;
  user.passwordResetLastSentAt = null;
}

function maskPhoneForDisplay(phone) {
  const value = String(phone || "").trim();
  if (!value) return "";
  const lastDigits = value.slice(-4);
  return `***${lastDigits ? ` ${lastDigits}` : ""}`.trim();
}

function maskEmailForDisplay(email) {
  const value = normalizeEmail(email);
  if (!value || !value.includes("@")) return "";
  const [localPart, domain] = value.split("@");
  const safeLocal =
    localPart.length <= 2
      ? `${localPart.slice(0, 1)}*`
      : `${localPart.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(4, localPart.length - 2)))}`;
  return `${safeLocal}@${domain}`;
}

function upsertBiometricDevice(user, device) {
  const currentDevices = Array.isArray(user.biometricDevices) ? user.biometricDevices : [];
  const nextDevices = currentDevices.filter(
    (item) => String(item.deviceId || "") !== String(device.deviceId || "")
  );
  nextDevices.push(device);
  user.biometricDevices = nextDevices;
}

function findBiometricDevice(user, deviceId) {
  const devices = Array.isArray(user?.biometricDevices) ? user.biometricDevices : [];
  return devices.find((item) => String(item.deviceId || "") === String(deviceId || ""));
}

async function findConflictingEmailUser(email, excludeUserId = "") {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const query = {
    $or: [{ email: normalizedEmail }, { pendingEmail: normalizedEmail }],
  };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  return User.findOne(query).select("_id email pendingEmail");
}

async function issueEmailVerification(user, { enforceCooldown = false, persistUser = false } = {}) {
  const now = new Date();
  const cooldownRemaining = getEmailVerificationCooldownRemainingSeconds(user);
  const hasActiveChallenge =
    user.emailVerificationExpiresAt &&
    new Date(user.emailVerificationExpiresAt) > now &&
    String(user.emailVerificationHash || "");

  if (enforceCooldown && cooldownRemaining > 0) {
    const error = new Error("Please wait before requesting another email verification link.");
    error.status = 429;
    error.retryAfterSeconds = cooldownRemaining;
    throw error;
  }

  if (!enforceCooldown && cooldownRemaining > 0 && hasActiveChallenge) {
    if (persistUser) {
      await user.save();
    }
    return {
      expiresAt: user.emailVerificationExpiresAt,
      resendCooldownSeconds: cooldownRemaining,
      reused: true,
    };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const verifyUrl = buildEmailVerificationUrl(rawToken);
  const tokenHash = hashStoredToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000);
  const mail = buildEmailVerificationMail(user.email, verifyUrl);

  user.emailVerificationHash = tokenHash;
  user.emailVerificationExpiresAt = expiresAt;
  user.emailVerificationLastSentAt = now;
  await user.save();
  try {
    await sendEmail({
      to: user.email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } catch (error) {
    user.emailVerificationLastSentAt = null;
    await user.save();
    throw error;
  }

  return {
    expiresAt,
    resendCooldownSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    reused: false,
  };
}

async function issuePendingEmailVerification(user, { enforceCooldown = false, persistUser = false } = {}) {
  const now = new Date();
  const targetEmail = normalizeEmail(user.pendingEmail);
  if (!targetEmail) {
    const error = new Error("A pending email address is required.");
    error.status = 400;
    throw error;
  }

  const cooldownRemaining = getPendingEmailVerificationCooldownRemainingSeconds(user);
  const hasActiveChallenge =
    user.pendingEmailVerificationExpiresAt &&
    new Date(user.pendingEmailVerificationExpiresAt) > now &&
    String(user.pendingEmailVerificationHash || "");

  if (enforceCooldown && cooldownRemaining > 0) {
    const error = new Error("Please wait before requesting another email verification link.");
    error.status = 429;
    error.retryAfterSeconds = cooldownRemaining;
    throw error;
  }

  if (!enforceCooldown && cooldownRemaining > 0 && hasActiveChallenge) {
    if (persistUser) {
      await user.save();
    }
    return {
      expiresAt: user.pendingEmailVerificationExpiresAt,
      resendCooldownSeconds: cooldownRemaining,
      reused: true,
    };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const verifyUrl = buildEmailVerificationUrl(rawToken);
  const tokenHash = hashStoredToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_SECONDS * 1000);
  const mail = buildEmailVerificationMail(targetEmail, verifyUrl, { isEmailChange: true });

  user.pendingEmailVerificationHash = tokenHash;
  user.pendingEmailVerificationExpiresAt = expiresAt;
  user.pendingEmailVerificationLastSentAt = now;
  await user.save();
  try {
    await sendEmail({
      to: targetEmail,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } catch (error) {
    user.pendingEmailVerificationLastSentAt = null;
    await user.save();
    throw error;
  }

  return {
    expiresAt,
    resendCooldownSeconds: EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    reused: false,
  };
}

async function issuePhoneVerification(user, { enforceCooldown = false } = {}) {
  const now = new Date();
  const cooldownRemaining = getPhoneOtpCooldownRemainingSeconds(user);
  const hasActiveOtp =
    user.phoneVerificationExpiresAt &&
    new Date(user.phoneVerificationExpiresAt) > now &&
    String(user.phoneVerificationHash || "");

  if (enforceCooldown && cooldownRemaining > 0) {
    const error = new Error("Please wait before requesting another verification code.");
    error.status = 429;
    error.retryAfterSeconds = cooldownRemaining;
    throw error;
  }

  if (!enforceCooldown && cooldownRemaining > 0 && hasActiveOtp) {
    return {
      verificationToken: signPhoneOtpToken({
        sub: String(user._id),
        phone: String(user.phone || ""),
        purpose: "phone_verification"
      }),
      expiresAt: user.phoneVerificationExpiresAt,
      resendCooldownSeconds: cooldownRemaining,
      reused: true
    };
  }

  const otpCode = generateOtpCode();
  const otpHash = hashOtpCode(otpCode);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  user.phoneVerificationHash = otpHash;
  user.phoneVerificationExpiresAt = otpExpiresAt;
  user.phoneVerificationAttempts = 0;
  user.phoneVerificationLastSentAt = now;
  setDevOtp(user._id, otpCode, otpExpiresAt);
  await saveOtpChallengeAndDispatchSms(user, buildPhoneVerificationMessage(otpCode));

  return {
    verificationToken: signPhoneOtpToken({
      sub: String(user._id),
      phone: String(user.phone || ""),
      purpose: "phone_verification"
    }),
    expiresAt: otpExpiresAt,
    resendCooldownSeconds: PHONE_OTP_RESEND_COOLDOWN_SECONDS
  };
}

async function issueTwoFactorChallenge(user, { purpose = "two_factor_login", enforceCooldown = false } = {}) {
  const now = new Date();
  const cooldownRemaining = getTwoFactorOtpCooldownRemainingSeconds(user);
  const hasActiveOtp =
    user.twoFactorOtpExpiresAt &&
    new Date(user.twoFactorOtpExpiresAt) > now &&
    String(user.twoFactorOtpHash || "");

  if (!user.phone || !user.phoneVerified) {
    const error = new Error("A verified phone number is required for two-factor authentication.");
    error.status = 400;
    throw error;
  }

  if (enforceCooldown && cooldownRemaining > 0) {
    const error = new Error("Please wait before requesting another verification code.");
    error.status = 429;
    error.retryAfterSeconds = cooldownRemaining;
    throw error;
  }

  if (!enforceCooldown && cooldownRemaining > 0 && hasActiveOtp) {
    return {
      verificationToken: signPhoneOtpToken({
        sub: String(user._id),
        phone: String(user.phone || ""),
        purpose,
      }),
      expiresAt: user.twoFactorOtpExpiresAt,
      resendCooldownSeconds: cooldownRemaining,
      reused: true,
    };
  }

  const otpCode = generateOtpCode();
  const otpHash = hashOtpCode(otpCode);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  user.twoFactorOtpHash = otpHash;
  user.twoFactorOtpExpiresAt = otpExpiresAt;
  user.twoFactorOtpAttempts = 0;
  user.twoFactorOtpLastSentAt = now;
  setDevOtp(`${user._id}:${purpose}`, otpCode, otpExpiresAt);
  await saveOtpChallengeAndDispatchSms(user, buildTwoFactorMessage(otpCode));

  return {
    verificationToken: signPhoneOtpToken({
      sub: String(user._id),
      phone: String(user.phone || ""),
      purpose,
    }),
    expiresAt: otpExpiresAt,
    resendCooldownSeconds: PHONE_OTP_RESEND_COOLDOWN_SECONDS,
  };
}

async function issuePasswordResetChallenge(user, { enforceCooldown = false } = {}) {
  const now = new Date();
  const cooldownRemaining = getPasswordResetCooldownRemainingSeconds(user);
  const hasActiveOtp =
    user.passwordResetExpiresAt &&
    new Date(user.passwordResetExpiresAt) > now &&
    String(user.passwordResetHash || "");

  if (!user.phone || !user.phoneVerified) {
    const error = new Error("A verified phone number is required for password reset.");
    error.status = 400;
    throw error;
  }

  if (enforceCooldown && cooldownRemaining > 0) {
    const error = new Error("Please wait before requesting another reset code.");
    error.status = 429;
    error.retryAfterSeconds = cooldownRemaining;
    throw error;
  }

  if (!enforceCooldown && cooldownRemaining > 0 && hasActiveOtp) {
    return {
      verificationToken: signPhoneOtpToken({
        sub: String(user._id),
        phone: String(user.phone || ""),
        purpose: "password_reset",
      }),
      expiresAt: user.passwordResetExpiresAt,
      resendCooldownSeconds: cooldownRemaining,
      reused: true,
    };
  }

  const otpCode = generateOtpCode();
  const otpHash = hashOtpCode(otpCode);
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

  user.passwordResetHash = otpHash;
  user.passwordResetExpiresAt = otpExpiresAt;
  user.passwordResetAttempts = 0;
  user.passwordResetLastSentAt = now;
  setDevOtp(`${user._id}:password_reset`, otpCode, otpExpiresAt);
  await saveOtpChallengeAndDispatchSms(user, buildPasswordResetMessage(otpCode));

  return {
    verificationToken: signPhoneOtpToken({
      sub: String(user._id),
      phone: String(user.phone || ""),
      purpose: "password_reset",
    }),
    expiresAt: otpExpiresAt,
    resendCooldownSeconds: PHONE_OTP_RESEND_COOLDOWN_SECONDS,
  };
}

function pickGoogleProfileName(payload) {
  const givenName = String(payload.given_name || "").trim();
  const familyName = String(payload.family_name || "").trim();
  const fullName = String(payload.name || "").trim();
  if (fullName) return fullName;
  if (givenName && familyName) return `${givenName} ${familyName}`;
  return givenName || familyName || "FuelFinder User";
}

async function issueTokenPair(user) {
  const payload = buildAuthPayload(user);
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const refreshTokenHash = hashStoredToken(refreshToken);

  user.refreshTokenHash = refreshTokenHash;
  await User.updateOne({ _id: user._id }, { $set: { refreshTokenHash } });

  return { accessToken, refreshToken };
}

exports.register = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = normalizePhone(req.body.phone);
    const vehicleRegistrationType = String(req.body.vehicleRegistrationType || "").trim().toLowerCase();
    const plateNumberKey = buildPlateNumberKey(req.body.plateNumberKey || req.body.plateNumber);
    const email = buildLocalPlateEmail(plateNumberKey);
    const password = String(req.body.password || "");
    const role = String(req.body.role || "customer").trim().toLowerCase();

    if (role !== "customer") {
      return res.status(403).json({ message: "Public registration only supports customer role." });
    }
    const existingPlate = await User.findOne({
      role: "customer",
      $or: [{ plateNumberKey }, { plateNumber: plateNumberKey }]
    }).select("_id");
    if (existingPlate) {
      return res.status(409).json({ message: "Plate number already registered." });
    }
    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const user = await User.create({
      name,
      phone,
      email,
      emailVerified: true,
      vehicleRegistrationType,
      plateNumber: plateNumberKey,
      plateNumberKey,
      passwordHash,
      role: "customer",
      phoneVerified: false
    });

    let verification;
    try {
      verification = await issuePhoneVerification(user, { enforceCooldown: false });
    } catch (sendErr) {
      await User.deleteOne({ _id: user._id });
      throw sendErr;
    }

    return res.status(201).json({
      verificationRequired: true,
      verificationToken: verification.verificationToken,
      expiresAt: verification.expiresAt,
      resendCooldownSeconds: verification.resendCooldownSeconds,
      user: buildUserResponse(user)
    });
  } catch (error) {
    if (error?.code === 11000 && (error?.keyPattern?.plateNumberKey || error?.keyPattern?.plateNumber)) {
      return res.status(409).json({ message: "Plate number already registered." });
    }
    console.error("[auth:register] Registration failed:", describeError(error));
    return res.status(500).json({ message: "Registration failed." });
  }
};

exports.bootstrapSuperAdmin = async (req, res) => {
  try {
    const expectedBootstrapKey = String(process.env.BOOTSTRAP_ADMIN_KEY || "").trim();
    if (!expectedBootstrapKey) {
      return res.status(403).json({
        message: "Bootstrap is disabled. Missing BOOTSTRAP_ADMIN_KEY on server."
      });
    }

    const providedBootstrapKey = String(req.body.bootstrapKey || "").trim();
    if (providedBootstrapKey !== expectedBootstrapKey) {
      return res.status(403).json({ message: "Invalid bootstrap key." });
    }

    const existingSuperAdminCount = await User.countDocuments({ role: "super_admin" });
    if (existingSuperAdminCount > 1) {
      return res.status(409).json({ message: "Bootstrap already completed." });
    }

    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    const existing = await User.exists({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const user = await User.create({
      name,
      phone,
      email,
      emailVerified: true,
      passwordHash,
      role: "super_admin"
    });
    const { accessToken, refreshToken } = await issueTokenPair(user);

    return res.status(201).json({
      message: "Super admin bootstrapped successfully.",
      user: buildUserResponse(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (_error) {
    return res.status(500).json({ message: "Bootstrap failed." });
  }
};

exports.login = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const plateNumberKey = buildPlateNumberKey(req.body.plateNumberKey || req.body.identifier);
    const password = String(req.body.password || "");

    const user = email
      ? await User.findOne({ email }).select(AUTH_FLOW_USER_SELECT)
      : await User.findOne({ role: "customer", plateNumberKey }).select(AUTH_FLOW_USER_SELECT);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const requiresPhoneVerification =
      String(user.role || "customer") === "customer" && !user.phoneVerified && Boolean(user.phone);
    if (requiresPhoneVerification) {
      const verification = await issuePhoneVerification(user, { enforceCooldown: false });
      return res.json({
        verificationRequired: true,
        verificationToken: verification.verificationToken,
        expiresAt: verification.expiresAt,
        resendCooldownSeconds: verification.resendCooldownSeconds,
        user: buildUserResponse(user),
        message: "Phone number not verified."
      });
    }

    if (Boolean(user.twoFactorEnabled)) {
      const challenge = await issueTwoFactorChallenge(user, {
        purpose: "two_factor_login",
        enforceCooldown: false,
      });
      return res.json({
        twoFactorRequired: true,
        verificationToken: challenge.verificationToken,
        expiresAt: challenge.expiresAt,
        resendCooldownSeconds: challenge.resendCooldownSeconds,
        user: buildUserResponse(user),
        message: "Two-factor verification required."
      });
    }

    const { accessToken, refreshToken } = await issueTokenPair(user);

    return res.json({
      user: buildUserResponse(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed." });
  }
};

exports.refresh = async (req, res) => {
  try {
    const refreshToken = String(req.body.refreshToken || "");

    const payload = verifyRefreshToken(refreshToken);
    const user = await User.findById(payload.sub).select(REFRESH_USER_SELECT);
    if (!user || !user.refreshTokenHash) {
      return res.status(401).json({ message: "Invalid refresh token." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const tokenMatch = await verifyRefreshTokenHash(user.refreshTokenHash, refreshToken);
    if (!tokenMatch) {
      return res.status(401).json({ message: "Invalid refresh token." });
    }

    const tokens = await issueTokenPair(user);
    return res.json({
      user: buildUserResponse(user),
      tokens
    });
  } catch (error) {
    return res.status(401).json({ message: "Refresh token expired or invalid." });
  }
};

exports.logout = async (req, res) => {
  try {
    const result = await User.updateOne({ _id: req.user.id }, { $set: { refreshTokenHash: "" } });
    if (!result.matchedCount) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({ message: "Logged out successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Logout failed." });
  }
};

exports.biometricLogin = async (req, res) => {
  try {
    const deviceId = String(req.body.deviceId || "").trim();
    const biometricSecret = String(req.body.biometricSecret || "").trim();

    const user = await User.findOne({ "biometricDevices.deviceId": deviceId }).select(
      BIOMETRIC_USER_SELECT
    );
    if (!user) {
      return res.status(401).json({ message: "Biometric login is not available for this device." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const biometricDevice = findBiometricDevice(user, deviceId);
    if (!biometricDevice?.secretHash) {
      return res.status(401).json({ message: "Biometric login is not available for this device." });
    }

    const secretMatch = await bcrypt.compare(biometricSecret, biometricDevice.secretHash);
    if (!secretMatch) {
      return res.status(401).json({ message: "Biometric login failed." });
    }

    biometricDevice.lastUsedAt = new Date();
    user.markModified("biometricDevices");
    await user.save();

    const { accessToken, refreshToken } = await issueTokenPair(user);
    return res.json({
      user: buildUserResponse(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (_error) {
    return res.status(500).json({ message: "Biometric login failed." });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(PUBLIC_USER_SELECT).lean();
    if (!user) return res.status(404).json({ message: "User not found." });

    return res.json({
      user: buildUserResponse(user)
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load profile." });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const phone = normalizePhone(req.body.phone);
    const preferredStationTypeInput = req.body.preferredStationType;
    const preferredStationType = normalizeStationType(preferredStationTypeInput);

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const nextEmailChanged = email !== normalizeEmail(user.email);
    if (nextEmailChanged && String(user.authProvider || "local") === "google") {
      return res.status(400).json({ message: "Google accounts cannot change email from the app." });
    }

    if (nextEmailChanged) {
      const existingUser = await findConflictingEmailUser(email, user._id);
      if (existingUser) {
        return res.status(409).json({ message: "Email already registered." });
      }
    }

    const nextPhoneChanged = phone !== normalizePhone(user.phone);
    user.name = name;
    user.phone = phone;

    if (nextPhoneChanged) {
      user.phoneVerified = !phone;
      user.twoFactorEnabled = false;
      user.phoneVerificationHash = "";
      user.phoneVerificationExpiresAt = null;
      user.phoneVerificationAttempts = 0;
      user.phoneVerificationLastSentAt = null;
      clearTwoFactorChallenge(user);
    }
    if (preferredStationTypeInput !== undefined) {
      if (!preferredStationType) {
        return res.status(400).json({ message: "preferredStationType must be one of: fuel, electric." });
      }
      user.preferredStationType = preferredStationType;
    }

    let emailChange = null;
    if (nextEmailChanged) {
      const previousPendingEmail = normalizeEmail(user.pendingEmail);
      if (previousPendingEmail !== email) {
        user.pendingEmailVerificationHash = "";
        user.pendingEmailVerificationExpiresAt = null;
        user.pendingEmailVerificationLastSentAt = null;
      }
      user.pendingEmail = email;
      emailChange = await issuePendingEmailVerification(user, {
        enforceCooldown: false,
        persistUser: true,
      });
    } else {
      await user.save();
    }

    return res.json({
      user: buildUserResponse(user),
      emailChangePending: Boolean(nextEmailChanged),
      emailVerificationSent: Boolean(nextEmailChanged && !emailChange?.reused),
      message: nextEmailChanged
        ? "Profile updated. Verify the new email before it replaces your current one."
        : "Profile updated successfully."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to update profile." });
  }
};

exports.registerPushToken = async (req, res) => {
  try {
    const token = normalizePushToken(req.body.token);
    const platform = ["ios", "android", "web"].includes(String(req.body.platform || "").trim())
      ? String(req.body.platform || "").trim()
      : "unknown";

    if (!isValidExpoPushToken(token)) {
      return res.status(400).json({ message: "A valid Expo push token is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    await User.updateMany(
      { _id: { $ne: user._id } },
      {
        $pull: {
          pushTokens: { token },
        },
      }
    );

    const currentTokens = Array.isArray(user.pushTokens) ? user.pushTokens : [];
    const nextTokens = currentTokens
      .filter((item) => normalizePushToken(item?.token) !== token)
      .slice(-7);

    nextTokens.push({
      token,
      provider: "expo",
      platform,
      updatedAt: new Date(),
    });

    user.pushTokens = nextTokens;
    await user.save();

    return res.json({
      message: "Push token registered successfully.",
      registered: true,
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to register push token." });
  }
};

exports.unregisterPushToken = async (req, res) => {
  try {
    const token = normalizePushToken(req.body.token);
    if (!token) {
      return res.status(400).json({ message: "token is required." });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    user.pushTokens = (Array.isArray(user.pushTokens) ? user.pushTokens : []).filter(
      (item) => normalizePushToken(item?.token) !== token
    );
    await user.save();

    return res.json({
      message: "Push token removed successfully.",
      registered: false,
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to remove push token." });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const isGoogleAccount = String(user.authProvider || "local") === "google";
    if (!isGoogleAccount) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required." });
      }

      const currentPasswordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!currentPasswordMatch) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }
    } else if (currentPassword) {
      const currentPasswordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!currentPasswordMatch) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      return res.status(400).json({ message: "Choose a new password that is different from your current one." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
    await user.save();

    return res.json({
      message: isGoogleAccount ? "Password added successfully." : "Password changed successfully."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to change password." });
  }
};

exports.startPasswordReset = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const user = await User.findOne({ email }).select(AUTH_FLOW_USER_SELECT);

    if (!user) {
      return res.status(404).json({ message: "No account found for that email address." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const challenge = await issuePasswordResetChallenge(user, { enforceCooldown: false });
    return res.json({
      passwordResetRequired: true,
      verificationToken: challenge.verificationToken,
      expiresAt: challenge.expiresAt,
      resendCooldownSeconds: challenge.resendCooldownSeconds,
      maskedPhone: maskPhoneForDisplay(user.phone),
      email: user.email,
      message: "Password reset code sent."
    });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({
        message: String(error.message || "A verified phone number is required for password reset.")
      });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        message: String(error.message || "Please wait before requesting another reset code."),
        retryAfterSeconds: Number(error.retryAfterSeconds || 0)
      });
    }
    return res.status(500).json({ message: "Failed to start password reset." });
  }
};

exports.verifyPasswordResetOtp = async (req, res) => {
  try {
    const verificationToken = String(req.body.verificationToken || "").trim();
    const otpCode = String(req.body.otpCode || "").trim();
    let payload;

    try {
      payload = verifyPhoneOtpToken(verificationToken);
    } catch (_err) {
      return res.status(401).json({ message: "Invalid or expired verification token." });
    }

    if (String(payload?.purpose || "") !== "password_reset") {
      return res.status(401).json({ message: "Invalid verification purpose." });
    }

    const userId = String(payload?.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Invalid verification token payload." });
    }

    const user = await User.findById(userId).select(AUTH_FLOW_USER_SELECT);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (String(user.phone || "") !== String(payload.phone || "")) {
      return res.status(401).json({ message: "Verification token does not match phone." });
    }
    if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date()) {
      return res.status(410).json({ message: "Reset code expired. Request a new one." });
    }
    if (user.passwordResetAttempts >= PHONE_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: "Maximum OTP attempts reached. Request a new code." });
    }

    const isValid = verifyOtpHash(user.passwordResetHash, otpCode);
    if (!isValid) {
      user.passwordResetAttempts = Number(user.passwordResetAttempts || 0) + 1;
      await user.save();
      return res.status(401).json({ message: "Invalid verification code." });
    }

    clearPasswordResetChallenge(user);
    await user.save();

    return res.json({
      passwordResetVerified: true,
      resetToken: signPhoneOtpToken({
        sub: String(user._id),
        phone: String(user.phone || ""),
        purpose: "password_reset_complete",
      }),
      maskedPhone: maskPhoneForDisplay(user.phone),
      email: user.email,
      message: "Verification successful."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to verify reset code." });
  }
};

exports.resendPasswordResetOtp = async (req, res) => {
  try {
    const verificationToken = String(req.body.verificationToken || "").trim();
    let payload;

    try {
      payload = verifyPhoneOtpToken(verificationToken);
    } catch (_err) {
      return res.status(401).json({ message: "Invalid or expired verification token." });
    }

    if (String(payload?.purpose || "") !== "password_reset") {
      return res.status(401).json({ message: "Invalid verification purpose." });
    }

    const userId = String(payload?.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Invalid verification token payload." });
    }

    const user = await User.findById(userId).select(AUTH_FLOW_USER_SELECT);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (String(user.phone || "") !== String(payload.phone || "")) {
      return res.status(401).json({ message: "Verification token does not match phone." });
    }

    const challenge = await issuePasswordResetChallenge(user, { enforceCooldown: true });
    return res.json({
      verificationToken: challenge.verificationToken,
      expiresAt: challenge.expiresAt,
      resendCooldownSeconds: challenge.resendCooldownSeconds,
      maskedPhone: maskPhoneForDisplay(user.phone),
      email: user.email,
      message: "Password reset code sent."
    });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({
        message: String(error.message || "A verified phone number is required for password reset.")
      });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        message: String(error.message || "Please wait before requesting another reset code."),
        retryAfterSeconds: Number(error.retryAfterSeconds || 0)
      });
    }
    return res.status(500).json({ message: "Failed to resend reset code." });
  }
};

exports.completePasswordReset = async (req, res) => {
  try {
    const resetToken = String(req.body.resetToken || "").trim();
    const newPassword = String(req.body.newPassword || "");
    let payload;

    try {
      payload = verifyPhoneOtpToken(resetToken);
    } catch (_err) {
      return res.status(401).json({ message: "Invalid or expired reset token." });
    }

    if (String(payload?.purpose || "") !== "password_reset_complete") {
      return res.status(401).json({ message: "Invalid reset token purpose." });
    }

    const userId = String(payload?.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Invalid reset token payload." });
    }

    const user = await User.findById(userId).select(AUTH_FLOW_USER_SELECT);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (String(user.phone || "") !== String(payload.phone || "")) {
      return res.status(401).json({ message: "Reset token does not match phone." });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      return res.status(400).json({ message: "Choose a new password that is different from your current one." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
    user.refreshTokenHash = "";
    clearPasswordResetChallenge(user);
    await user.save();

    return res.json({ message: "Password reset successfully." });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to reset password." });
  }
};

exports.verifyEmailLink = async (req, res) => {
  const token = String(req.emailVerificationToken || req.body?.token || req.query?.token || "").trim();
  const respond = (status, title, message, extra = {}) => {
    if (req.method === "POST") {
      return res.status(status).json({ title, message, ...extra });
    }
    return sendEmailVerificationPage(res, status, title, message);
  };

  if (!token) {
    return respond(400, "Missing token", "This verification link is incomplete.");
  }

  try {
    const tokenHash = hashStoredToken(token);
    const user = await User.findOne({
      $or: [{ emailVerificationHash: tokenHash }, { pendingEmailVerificationHash: tokenHash }],
    }).select(AUTH_FLOW_USER_SELECT);

    if (!user) {
      return respond(404, "Verification link not found", "This verification link is invalid or has already been used.");
    }
    if (user.isBlocked) {
      return respond(403, "Account blocked", "This account is blocked. Contact support for help.");
    }

    if (String(user.emailVerificationHash || "") === tokenHash) {
      if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt <= new Date()) {
        return respond(410, "Verification link expired", "Request a new verification email and try again.");
      }

      user.emailVerified = true;
      clearEmailVerificationChallenge(user);
      await user.save();

      return respond(200, "Email verified", "Your FuelFinder email address is now verified.", {
        verified: true,
        user: buildUserResponse(user),
      });
    }

    if (String(user.pendingEmailVerificationHash || "") === tokenHash) {
      if (!user.pendingEmailVerificationExpiresAt || user.pendingEmailVerificationExpiresAt <= new Date()) {
        return respond(410, "Verification link expired", "Request a new verification email and try again.");
      }

      const nextEmail = normalizeEmail(user.pendingEmail);
      if (!nextEmail) {
        return respond(400, "Pending email missing", "This email-change request is no longer available.");
      }

      const conflict = await findConflictingEmailUser(nextEmail, user._id);
      if (conflict) {
        clearPendingEmailVerificationChallenge(user);
        await user.save();
        return respond(
          409,
          "Email unavailable",
          "That email address is already in use. Start the email change again with a different address."
        );
      }

      user.email = nextEmail;
      user.emailVerified = true;
      clearPendingEmailVerificationChallenge(user);
      await user.save();

      return respond(200, "Email updated", "Your new FuelFinder email address is now active.", {
        verified: true,
        user: buildUserResponse(user),
      });
    }

    return respond(404, "Verification link not found", "This verification link is invalid or has already been used.");
  } catch (_error) {
    return respond(500, "Verification failed", "FuelFinder could not verify this email link right now.");
  }
};

exports.resendEmailVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(AUTH_FLOW_USER_SELECT);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    let challenge = null;
    if (String(user.pendingEmail || "").trim()) {
      challenge = await issuePendingEmailVerification(user, { enforceCooldown: true });
      return res.json({
        user: buildUserResponse(user),
        pendingEmailVerification: true,
        resendCooldownSeconds: challenge.resendCooldownSeconds,
        message: "Verification email sent to your pending email address.",
      });
    }

    if (user.emailVerified) {
      return res.status(409).json({ message: "Email already verified." });
    }

    challenge = await issueEmailVerification(user, { enforceCooldown: true });
    return res.json({
      user: buildUserResponse(user),
      emailVerificationRequired: true,
      resendCooldownSeconds: challenge.resendCooldownSeconds,
      message: "Verification email sent.",
    });
  } catch (error) {
    console.error("[auth:email] Failed to resend verification email:", describeError(error));
    if (error?.status === 429) {
      return res.status(429).json({
        message: String(error.message || "Please wait before requesting another verification email."),
        retryAfterSeconds: Number(error.retryAfterSeconds || 0),
      });
    }
    return res.status(500).json({ message: "Failed to resend verification email." });
  }
};

exports.startEmailChange = async (req, res) => {
  try {
    const nextEmail = normalizeEmail(req.body.nextEmail);
    const user = await User.findById(req.user.id).select(AUTH_FLOW_USER_SELECT);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (String(user.authProvider || "local") === "google") {
      return res.status(400).json({ message: "Google accounts cannot change email from the app." });
    }
    if (!nextEmail || nextEmail === normalizeEmail(user.email)) {
      return res.status(400).json({ message: "Choose a different email address to continue." });
    }

    const existingUser = await findConflictingEmailUser(nextEmail, user._id);
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const previousPendingEmail = normalizeEmail(user.pendingEmail);
    if (previousPendingEmail !== nextEmail) {
      user.pendingEmailVerificationHash = "";
      user.pendingEmailVerificationExpiresAt = null;
      user.pendingEmailVerificationLastSentAt = null;
    }
    user.pendingEmail = nextEmail;
    const challenge = await issuePendingEmailVerification(user, {
      enforceCooldown: false,
      persistUser: true,
    });

    return res.json({
      user: buildUserResponse(user),
      resendCooldownSeconds: challenge.resendCooldownSeconds,
      emailChangePending: true,
      message: "Verification email sent. Confirm the new address before it replaces your current email.",
    });
  } catch (error) {
    if (error?.status === 429) {
      return res.status(429).json({
        message: String(error.message || "Please wait before requesting another verification email."),
        retryAfterSeconds: Number(error.retryAfterSeconds || 0),
      });
    }
    return res.status(500).json({ message: "Failed to start email change." });
  }
};

exports.registerBiometricDevice = async (req, res) => {
  try {
    const deviceId = String(req.body.deviceId || "").trim();
    const deviceLabel = String(req.body.deviceLabel || "").trim();

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const biometricSecret = crypto.randomBytes(32).toString("hex");
    const secretHash = await bcrypt.hash(biometricSecret, PASSWORD_SALT_ROUNDS);

    upsertBiometricDevice(user, {
      deviceId,
      label: deviceLabel,
      secretHash,
      createdAt: new Date(),
      lastUsedAt: null
    });

    await user.save();

    return res.json({
      deviceId,
      deviceLabel,
      biometricSecret,
      message: "Biometric login enabled for this device."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to enable biometric login." });
  }
};

exports.unregisterBiometricDevice = async (req, res) => {
  try {
    const deviceId = String(req.body.deviceId || "").trim();

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    user.biometricDevices = (Array.isArray(user.biometricDevices) ? user.biometricDevices : []).filter(
      (item) => String(item.deviceId || "") !== deviceId
    );
    await user.save();

    return res.json({
      message: "Biometric login removed from this device."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to disable biometric login." });
  }
};

exports.startTwoFactor = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const challenge = await issueTwoFactorChallenge(user, {
      purpose: "two_factor_setup",
      enforceCooldown: false,
    });

    return res.json({
      twoFactorSetupRequired: true,
      verificationToken: challenge.verificationToken,
      expiresAt: challenge.expiresAt,
      resendCooldownSeconds: challenge.resendCooldownSeconds,
      message: "Verification code sent."
    });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ message: String(error.message || "A verified phone number is required.") });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        message: String(error.message || "Please wait before requesting another verification code."),
        retryAfterSeconds: Number(error.retryAfterSeconds || 0)
      });
    }
    return res.status(500).json({ message: "Failed to start two-factor authentication." });
  }
};

exports.verifyTwoFactor = async (req, res) => {
  try {
    const verificationToken = String(req.body.verificationToken || "").trim();
    const otpCode = String(req.body.otpCode || "").trim();
    let payload;

    try {
      payload = verifyPhoneOtpToken(verificationToken);
    } catch (_err) {
      return res.status(401).json({ message: "Invalid or expired verification token." });
    }

    const purpose = String(payload?.purpose || "");
    if (purpose !== "two_factor_setup" && purpose !== "two_factor_login") {
      return res.status(401).json({ message: "Invalid verification purpose." });
    }

    const userId = String(payload?.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Invalid verification token payload." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (String(user.phone || "") !== String(payload.phone || "")) {
      return res.status(401).json({ message: "Verification token does not match phone." });
    }
    if (purpose === "two_factor_login" && !user.twoFactorEnabled) {
      return res.status(409).json({ message: "Two-factor authentication is no longer enabled for this account." });
    }
    if (!user.twoFactorOtpExpiresAt || user.twoFactorOtpExpiresAt <= new Date()) {
      return res.status(410).json({ message: "Verification code expired. Request a new one." });
    }
    if (user.twoFactorOtpAttempts >= PHONE_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: "Maximum OTP attempts reached. Request a new code." });
    }

    const isValid = verifyOtpHash(user.twoFactorOtpHash, otpCode);
    if (!isValid) {
      user.twoFactorOtpAttempts = Number(user.twoFactorOtpAttempts || 0) + 1;
      await user.save();
      return res.status(401).json({ message: "Invalid verification code." });
    }

    clearTwoFactorChallenge(user);
    if (purpose === "two_factor_setup") {
      user.twoFactorEnabled = true;
      await user.save();
      return res.json({
        user: buildUserResponse(user),
        message: "Two-factor authentication enabled."
      });
    }

    await user.save();
    const { accessToken, refreshToken } = await issueTokenPair(user);
    return res.json({
      user: buildUserResponse(user),
      tokens: { accessToken, refreshToken },
      message: "Two-factor verification successful."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to verify security code." });
  }
};

exports.resendTwoFactorOtp = async (req, res) => {
  try {
    const verificationToken = String(req.body.verificationToken || "").trim();
    let payload;

    try {
      payload = verifyPhoneOtpToken(verificationToken);
    } catch (_err) {
      return res.status(401).json({ message: "Invalid or expired verification token." });
    }

    const purpose = String(payload?.purpose || "");
    if (purpose !== "two_factor_setup" && purpose !== "two_factor_login") {
      return res.status(401).json({ message: "Invalid verification purpose." });
    }

    const userId = String(payload?.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Invalid verification token payload." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (String(user.phone || "") !== String(payload.phone || "")) {
      return res.status(401).json({ message: "Verification token does not match phone." });
    }
    if (purpose === "two_factor_login" && !user.twoFactorEnabled) {
      return res.status(409).json({ message: "Two-factor authentication is no longer enabled for this account." });
    }

    const challenge = await issueTwoFactorChallenge(user, {
      purpose,
      enforceCooldown: true,
    });

    return res.json({
      verificationToken: challenge.verificationToken,
      expiresAt: challenge.expiresAt,
      resendCooldownSeconds: challenge.resendCooldownSeconds,
      message: "Verification code sent."
    });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ message: String(error.message || "A verified phone number is required.") });
    }
    if (error?.status === 429) {
      return res.status(429).json({
        message: String(error.message || "Please wait before requesting another verification code."),
        retryAfterSeconds: Number(error.retryAfterSeconds || 0)
      });
    }
    return res.status(500).json({ message: "Failed to resend security code." });
  }
};

exports.disableTwoFactor = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    user.twoFactorEnabled = false;
    clearTwoFactorChallenge(user);
    await user.save();

    return res.json({
      user: buildUserResponse(user),
      message: "Two-factor authentication disabled."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to disable two-factor authentication." });
  }
};

exports.verifyPhone = async (req, res) => {
  try {
    const verificationToken = String(req.body.verificationToken || "").trim();
    const otpCode = String(req.body.otpCode || "").trim();
    let payload;

    try {
      payload = verifyPhoneOtpToken(verificationToken);
    } catch (_err) {
      return res.status(401).json({ message: "Invalid or expired verification token." });
    }

    if (String(payload?.purpose || "") !== "phone_verification") {
      return res.status(401).json({ message: "Invalid verification purpose." });
    }

    const userId = String(payload?.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Invalid verification token payload." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (String(user.phone || "") !== String(payload.phone || "")) {
      return res.status(401).json({ message: "Verification token does not match phone." });
    }
    if (user.phoneVerified) {
      const tokens = await issueTokenPair(user);
      return res.json({
        user: buildUserResponse(user),
        tokens
      });
    }

    if (!user.phoneVerificationExpiresAt || user.phoneVerificationExpiresAt <= new Date()) {
      return res.status(410).json({ message: "Verification code expired. Request a new one." });
    }
    if (user.phoneVerificationAttempts >= PHONE_OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ message: "Maximum OTP attempts reached. Request a new code." });
    }

    const isValid = verifyOtpHash(user.phoneVerificationHash, otpCode);
    if (!isValid) {
      user.phoneVerificationAttempts = Number(user.phoneVerificationAttempts || 0) + 1;
      await user.save();
      return res.status(401).json({ message: "Invalid verification code." });
    }

    user.phoneVerified = true;
    user.phoneVerificationHash = "";
    user.phoneVerificationExpiresAt = null;
    user.phoneVerificationAttempts = 0;
    user.phoneVerificationLastSentAt = null;
    await user.save();

    const { accessToken, refreshToken } = await issueTokenPair(user);
    return res.json({
      user: buildUserResponse(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to verify phone number." });
  }
};

exports.resendPhoneOtp = async (req, res) => {
  try {
    const verificationToken = String(req.body.verificationToken || "").trim();
    let payload;

    try {
      payload = verifyPhoneOtpToken(verificationToken);
    } catch (_err) {
      return res.status(401).json({ message: "Invalid or expired verification token." });
    }

    if (String(payload?.purpose || "") !== "phone_verification") {
      return res.status(401).json({ message: "Invalid verification purpose." });
    }

    const userId = String(payload?.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Invalid verification token payload." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (String(user.phone || "") !== String(payload.phone || "")) {
      return res.status(401).json({ message: "Verification token does not match phone." });
    }
    if (user.phoneVerified) {
      return res.status(409).json({ message: "Phone number already verified." });
    }

    const verification = await issuePhoneVerification(user, { enforceCooldown: true });
    return res.json({
      verificationRequired: true,
      verificationToken: verification.verificationToken,
      expiresAt: verification.expiresAt,
      resendCooldownSeconds: verification.resendCooldownSeconds,
      message: "Verification code sent."
    });
  } catch (error) {
    if (error?.status === 429) {
      return res.status(429).json({
        message: String(error.message || "Please wait before requesting another verification code."),
        retryAfterSeconds: Number(error.retryAfterSeconds || 0)
      });
    }
    return res.status(500).json({ message: "Failed to resend verification code." });
  }
};

exports.devGetPhoneOtp = async (req, res) => {
  const allowDevEndpoint =
    String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production" &&
    String(process.env.PHONE_OTP_DEV_ENDPOINT || "").trim().toLowerCase() === "true";

  if (!allowDevEndpoint) {
    return res.status(404).json({ message: "Not found." });
  }

  try {
    const verificationToken = String(req.body.verificationToken || "").trim();
    let payload;

    try {
      payload = verifyPhoneOtpToken(verificationToken);
    } catch (_err) {
      return res.status(401).json({ message: "Invalid or expired verification token." });
    }

    const userId = String(payload?.sub || "");
    if (!userId) {
      return res.status(401).json({ message: "Invalid verification token payload." });
    }

    const purpose = String(payload?.purpose || "");
    const storeKey =
      purpose === "two_factor_setup" ||
      purpose === "two_factor_login" ||
      purpose === "password_reset"
        ? `${userId}:${purpose}`
        : userId;

    const entry = getDevOtp(storeKey);
    if (!entry) {
      return res.status(404).json({ message: "No OTP available for this user." });
    }

    return res.json({
      otpCode: entry.otpCode,
      expiresAt: entry.expiresAt || null
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load dev OTP." });
  }
};

exports.linkGoogleAccount = async (req, res) => {
  try {
    const idToken = String(req.body.idToken || "").trim();
    const firebaseAuth = getFirebaseAuth();
    const payload = await firebaseAuth.verifyIdToken(idToken);
    const googleEmail = normalizeEmail(payload.email || "");
    const emailVerified = Boolean(payload.email_verified);
    const googleSub = String(payload.uid || "").trim();

    if (!googleEmail || !emailVerified || !googleSub) {
      return res.status(401).json({ message: "Google account not verified." });
    }

    const user = await User.findById(req.user.id).select(AUTH_FLOW_USER_SELECT);
    if (!user) return res.status(404).json({ message: "User not found." });
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }
    if (!user.emailVerified) {
      return res.status(409).json({ message: "Verify your current email before linking Google." });
    }
    if (normalizeEmail(user.email) !== googleEmail) {
      return res.status(409).json({ message: "Google email must match your verified FuelFinder email." });
    }

    const otherLinkedUser = await User.findOne({
      googleSub,
      _id: { $ne: user._id },
    }).select("_id");
    if (otherLinkedUser) {
      return res.status(409).json({ message: "That Google account is already linked to another FuelFinder user." });
    }

    if (user.googleSub && user.googleSub !== googleSub) {
      return res.status(409).json({ message: "A different Google account is already linked here." });
    }

    user.googleSub = googleSub;
    await user.save();

    return res.json({
      user: buildUserResponse(user),
      message: "Google account linked successfully.",
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to link Google account." });
  }
};

exports.googleAuth = async (req, res) => {
  try {
    const idToken = String(req.body.idToken || "").trim();
    const firebaseAuth = getFirebaseAuth();
    const payload = await firebaseAuth.verifyIdToken(idToken);
    const email = normalizeEmail(payload.email || "");
    const emailVerified = Boolean(payload.email_verified);
    const googleSub = String(payload.uid || "").trim();

    if (!email || !emailVerified || !googleSub) {
      return res.status(401).json({ message: "Google account not verified." });
    }

    let user = await User.findOne({ googleSub }).select(AUTH_FLOW_USER_SELECT);
    if (!user) {
      user = await User.findOne({ email }).select(AUTH_FLOW_USER_SELECT);
    }
    if (user && user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    if (!user) {
      const name = pickGoogleProfileName(payload);
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(randomPassword, PASSWORD_SALT_ROUNDS);
      user = await User.create({
        name,
        email,
        emailVerified: true,
        phone: "",
        phoneVerified: false,
        passwordHash,
        role: "customer",
        authProvider: "google",
        googleSub
      });
    } else {
      const normalizedUserEmail = normalizeEmail(user.email);
      const hasLinkedGoogle = Boolean(String(user.googleSub || "").trim());

      if (hasLinkedGoogle && String(user.googleSub || "") !== googleSub) {
        return res.status(409).json({ message: "This FuelFinder account is already linked to a different Google account." });
      }

      if (!hasLinkedGoogle && normalizedUserEmail === email) {
        return res.status(409).json({
          message: "Account already exists with this email. Sign in first, then link Google from Profile.",
        });
      }

      if (!user.emailVerified && normalizedUserEmail === email && String(user.authProvider || "local") === "google") {
        user.emailVerified = true;
        await user.save();
      }
    }

    const requiresPhoneVerification =
      String(user.role || "customer") === "customer" && !user.phoneVerified && Boolean(user.phone);
    if (requiresPhoneVerification) {
      const verification = await issuePhoneVerification(user, { enforceCooldown: false });
      return res.json({
        verificationRequired: true,
        verificationToken: verification.verificationToken,
        expiresAt: verification.expiresAt,
        resendCooldownSeconds: verification.resendCooldownSeconds,
        user: buildUserResponse(user),
        message: "Phone number not verified."
      });
    }

    if (Boolean(user.twoFactorEnabled)) {
      const challenge = await issueTwoFactorChallenge(user, {
        purpose: "two_factor_login",
        enforceCooldown: false,
      });
      return res.json({
        twoFactorRequired: true,
        verificationToken: challenge.verificationToken,
        expiresAt: challenge.expiresAt,
        resendCooldownSeconds: challenge.resendCooldownSeconds,
        user: buildUserResponse(user),
        message: "Two-factor verification required."
      });
    }

    const { accessToken, refreshToken } = await issueTokenPair(user);
    return res.json({
      user: buildUserResponse(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (error) {
    return res.status(500).json({ message: "Google authentication failed." });
  }
};

const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
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

const PASSWORD_SALT_ROUNDS = Math.max(8, Number(process.env.PASSWORD_SALT_ROUNDS || 10));
const PHONE_OTP_MAX_ATTEMPTS = Number(process.env.PHONE_OTP_MAX_ATTEMPTS || 5);
const PHONE_OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.PHONE_OTP_RESEND_COOLDOWN_SECONDS || 60);
const OTP_SMS_RESPONSE_WAIT_MS = Math.max(
  0,
  Number(process.env.OTP_SMS_RESPONSE_WAIT_MS || 1500)
);
const PUBLIC_USER_SELECT =
  "_id name email phone phoneVerified twoFactorEnabled authProvider isBlocked role organizationId cityIds stationIds branchIds createdAt";
const AUTH_FLOW_USER_SELECT = `${PUBLIC_USER_SELECT} passwordHash refreshTokenHash googleSub biometricDevices phoneVerificationHash phoneVerificationExpiresAt phoneVerificationAttempts phoneVerificationLastSentAt twoFactorOtpHash twoFactorOtpExpiresAt twoFactorOtpAttempts twoFactorOtpLastSentAt`;
const REFRESH_USER_SELECT = `${PUBLIC_USER_SELECT} refreshTokenHash`;
const BIOMETRIC_USER_SELECT = `${PUBLIC_USER_SELECT} biometricDevices`;
const BCRYPT_HASH_PREFIX = /^\$2[abxy]\$\d{2}\$/;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").trim().replace(/[^\d+]/g, "");
}

function buildAuthPayload(user) {
  return {
    sub: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role || "customer",
    organizationId: user.organizationId ? String(user.organizationId) : "",
    authProvider: user.authProvider || "local"
  };
}

function buildUserResponse(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    phoneVerified: Boolean(user.phoneVerified),
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    authProvider: user.authProvider || "local",
    isBlocked: Boolean(user.isBlocked),
    role: user.role || "customer",
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

function clearTwoFactorChallenge(user) {
  user.twoFactorOtpHash = "";
  user.twoFactorOtpExpiresAt = null;
  user.twoFactorOtpAttempts = 0;
  user.twoFactorOtpLastSentAt = null;
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
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = String(req.body.role || "customer").trim().toLowerCase();

    const existing = await User.exists({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }
    if (role !== "customer") {
      return res.status(403).json({ message: "Public registration only supports customer role." });
    }

    const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    const user = await User.create({
      name,
      phone,
      email,
      passwordHash,
      role: "customer",
      phoneVerified: false
    });

    try {
      const verification = await issuePhoneVerification(user, { enforceCooldown: false });
      return res.status(201).json({
        verificationRequired: true,
        verificationToken: verification.verificationToken,
        expiresAt: verification.expiresAt,
        resendCooldownSeconds: verification.resendCooldownSeconds,
        user: buildUserResponse(user)
      });
    } catch (sendErr) {
      await User.deleteOne({ _id: user._id });
      throw sendErr;
    }
  } catch (error) {
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
    const password = String(req.body.password || "");

    const user = await User.findOne({ email }).select(AUTH_FLOW_USER_SELECT);
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
      const existingUser = await User.findOne({ email, _id: { $ne: user._id } }).select("_id");
      if (existingUser) {
        return res.status(409).json({ message: "Email already registered." });
      }
      user.email = email;
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

    await user.save();

    return res.json({
      user: buildUserResponse(user),
      message: "Profile updated successfully."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to update profile." });
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
      purpose === "two_factor_setup" || purpose === "two_factor_login"
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

    let user = await User.findOne({ email }).select(AUTH_FLOW_USER_SELECT);
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
        phone: "",
        phoneVerified: false,
        passwordHash,
        role: "customer",
        authProvider: "google",
        googleSub
      });
    } else {
      let shouldSave = false;
      if (!user.googleSub || user.googleSub !== googleSub) {
        user.googleSub = googleSub;
        shouldSave = true;
      }
      if (!user.authProvider || user.authProvider === "local") {
        // Keep local users intact; only tag provider if unset.
        if (!user.authProvider) {
          user.authProvider = "local";
          shouldSave = true;
        }
      } else if (user.authProvider !== "google") {
        user.authProvider = "google";
        shouldSave = true;
      }
      if (shouldSave) await user.save();
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

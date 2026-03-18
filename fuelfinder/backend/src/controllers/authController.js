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

const SALT_ROUNDS = 12;
const PHONE_OTP_MAX_ATTEMPTS = Number(process.env.PHONE_OTP_MAX_ATTEMPTS || 5);
const PHONE_OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.PHONE_OTP_RESEND_COOLDOWN_SECONDS || 60);

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

function getPhoneOtpCooldownRemainingSeconds(user) {
  const lastSentAt = user.phoneVerificationLastSentAt;
  if (!lastSentAt) return 0;
  const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
  const remainingMs = PHONE_OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
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
  await sendSms(String(user.phone || ""), buildPhoneVerificationMessage(otpCode));
  setDevOtp(user._id, otpCode, otpExpiresAt);
  await user.save();

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
  const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);

  user.refreshTokenHash = refreshTokenHash;
  await user.save();

  return { accessToken, refreshToken };
}

exports.register = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = String(req.body.role || "customer").trim().toLowerCase();

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }
    if (role !== "customer") {
      return res.status(403).json({ message: "Public registration only supports customer role." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
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

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
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

    const user = await User.findOne({ email });
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
    const user = await User.findById(payload.sub);
    if (!user || !user.refreshTokenHash) {
      return res.status(401).json({ message: "Invalid refresh token." });
    }
    if (user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    const tokenMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!tokenMatch) {
      return res.status(401).json({ message: "Invalid refresh token." });
    }

    const tokens = await issueTokenPair(user);
    return res.json({ tokens });
  } catch (error) {
    return res.status(401).json({ message: "Refresh token expired or invalid." });
  }
};

exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    user.refreshTokenHash = "";
    await user.save();

    return res.json({ message: "Logged out successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Logout failed." });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "_id name email phone phoneVerified authProvider isBlocked role organizationId cityIds stationIds branchIds createdAt"
    );
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
      user.phoneVerificationHash = "";
      user.phoneVerificationExpiresAt = null;
      user.phoneVerificationAttempts = 0;
      user.phoneVerificationLastSentAt = null;
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

    user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await user.save();

    return res.json({
      message: isGoogleAccount ? "Password added successfully." : "Password changed successfully."
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to change password." });
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

    const entry = getDevOtp(userId);
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

    let user = await User.findOne({ email });
    if (user && user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact administrator." });
    }

    if (!user) {
      const name = pickGoogleProfileName(payload);
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(randomPassword, SALT_ROUNDS);
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

    const { accessToken, refreshToken } = await issueTokenPair(user);
    return res.json({
      user: buildUserResponse(user),
      tokens: { accessToken, refreshToken }
    });
  } catch (error) {
    return res.status(500).json({ message: "Google authentication failed." });
  }
};

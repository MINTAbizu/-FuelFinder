const bcrypt = require("bcryptjs");
const User = require("../models/User");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} = require("../utils/tokens");

const SALT_ROUNDS = 12;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildAuthPayload(user) {
  return {
    sub: String(user._id),
    email: user.email,
    name: user.name,
    role: user.role || "customer",
    organizationId: user.organizationId ? String(user.organizationId) : ""
  };
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

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ name, phone, email, passwordHash });
    const { accessToken, refreshToken } = await issueTokenPair(user);

    return res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role
      },
      tokens: { accessToken, refreshToken }
    });
  } catch (error) {
    return res.status(500).json({ message: "Registration failed." });
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

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const { accessToken, refreshToken } = await issueTokenPair(user);

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role
      },
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
      "_id name email phone role organizationId cityIds stationIds branchIds createdAt"
    );
    if (!user) return res.status(404).json({ message: "User not found." });

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        role: user.role || "customer",
        organizationId: user.organizationId || null,
        cityIds: user.cityIds || [],
        stationIds: user.stationIds || [],
        branchIds: user.branchIds || [],
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load profile." });
  }
};

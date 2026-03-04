const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");

const SALT_ROUNDS = 12;

function buildUserResponse(user) {
  return {
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
  };
}

exports.createAdminUser = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      password,
      role,
      organizationId,
      cityIds,
      stationIds,
      branchIds
    } = req.body;

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
      role,
      organizationId,
      cityIds,
      stationIds,
      branchIds
    });

    return res.status(201).json({
      message: "Admin/staff user created.",
      user: buildUserResponse(user)
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to create admin user." });
  }
};

exports.listOrganizationOptions = async (_req, res) => {
  try {
    const ids = await User.distinct("organizationId", { organizationId: { $ne: null } });
    const options = ids
      .map((id) => String(id || "").trim())
      .filter((id) => Boolean(id) && mongoose.isValidObjectId(id))
      .map((id) => ({
        id,
        label: `Org ${id.slice(-6).toUpperCase()}`
      }));

    return res.json({ organizations: options });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load organization options." });
  }
};

exports.listAdminUsers = async (_req, res) => {
  try {
    const users = await User.find({ role: { $ne: "customer" } })
      .select("_id name email phone role organizationId cityIds stationIds branchIds createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      total: users.length,
      users: users.map((user) => ({
        id: String(user._id),
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        role: user.role || "customer",
        organizationId: user.organizationId || null,
        cityIds: user.cityIds || [],
        stationIds: user.stationIds || [],
        branchIds: user.branchIds || [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }))
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load admin users." });
  }
};

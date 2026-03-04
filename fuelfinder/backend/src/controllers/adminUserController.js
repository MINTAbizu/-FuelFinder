const bcrypt = require("bcryptjs");
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


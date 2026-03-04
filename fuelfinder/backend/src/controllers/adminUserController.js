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
    isBlocked: Boolean(user.isBlocked),
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
        isBlocked: Boolean(user.isBlocked),
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

exports.updateAdminUser = async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found." });
    }
    if ((existingUser.role || "customer") === "customer") {
      return res.status(400).json({ message: "Customer users are not editable from this endpoint." });
    }

    const updates = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name || "").trim();
    if (req.body.phone !== undefined) updates.phone = String(req.body.phone || "").trim();
    if (req.body.email !== undefined) updates.email = String(req.body.email || "").trim().toLowerCase();
    if (req.body.role !== undefined) updates.role = String(req.body.role || "").trim().toLowerCase();
    if (req.body.organizationId !== undefined) {
      const organizationId = String(req.body.organizationId || "").trim();
      updates.organizationId = organizationId || null;
    }
    if (req.body.cityIds !== undefined) {
      updates.cityIds = Array.isArray(req.body.cityIds)
        ? req.body.cityIds.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    }
    if (req.body.stationIds !== undefined) {
      updates.stationIds = Array.isArray(req.body.stationIds)
        ? req.body.stationIds.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    }
    if (req.body.branchIds !== undefined) {
      updates.branchIds = Array.isArray(req.body.branchIds)
        ? req.body.branchIds.map((item) => String(item || "").trim()).filter(Boolean)
        : [];
    }

    if (updates.name !== undefined && !updates.name) {
      return res.status(400).json({ message: "name cannot be empty." });
    }
    if (updates.email !== undefined) {
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email);
      if (!validEmail) {
        return res.status(400).json({ message: "Invalid email format." });
      }
      const duplicate = await User.findOne({ email: updates.email, _id: { $ne: userId } });
      if (duplicate) {
        return res.status(409).json({ message: "Email already registered." });
      }
    }

    const allowedRoles = new Set(["staff", "station_manager", "city_manager", "org_admin", "super_admin"]);
    if (updates.role !== undefined && !allowedRoles.has(updates.role)) {
      return res.status(400).json({ message: "Invalid admin/staff role." });
    }
    if (updates.organizationId && !mongoose.isValidObjectId(updates.organizationId)) {
      return res.status(400).json({ message: "organizationId must be a valid ObjectId." });
    }

    const validateIdList = (ids, fieldName) => {
      if (!Array.isArray(ids)) return "";
      const hasInvalid = ids.some((id) => !mongoose.isValidObjectId(id));
      return hasInvalid ? `${fieldName} contains invalid ObjectId.` : "";
    };
    const cityError = validateIdList(updates.cityIds, "cityIds");
    if (cityError) return res.status(400).json({ message: cityError });
    const stationError = validateIdList(updates.stationIds, "stationIds");
    if (stationError) return res.status(400).json({ message: stationError });
    const branchError = validateIdList(updates.branchIds, "branchIds");
    if (branchError) return res.status(400).json({ message: branchError });

    Object.assign(existingUser, updates);
    await existingUser.save();

    return res.json({
      message: "Admin/staff user updated.",
      user: buildUserResponse(existingUser)
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to update admin user." });
  }
};

exports.setAdminUserBlocked = async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const isBlocked = Boolean(req.body?.isBlocked);
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if ((user.role || "customer") === "customer") {
      return res.status(400).json({ message: "Customer users are not editable from this endpoint." });
    }

    user.isBlocked = isBlocked;
    if (isBlocked) {
      user.refreshTokenHash = "";
    }
    await user.save();

    return res.json({
      message: isBlocked ? "User blocked successfully." : "User unblocked successfully.",
      user: buildUserResponse(user)
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to update block status." });
  }
};

exports.forceLogoutAdminUser = async (req, res) => {
  try {
    const userId = String(req.params.userId || "").trim();
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if ((user.role || "customer") === "customer") {
      return res.status(400).json({ message: "Customer users are not editable from this endpoint." });
    }

    user.refreshTokenHash = "";
    await user.save();

    return res.json({
      message: "User sessions revoked successfully.",
      user: buildUserResponse(user)
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to revoke user sessions." });
  }
};

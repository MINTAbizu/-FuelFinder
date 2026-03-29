const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Station = require("../models/Station");
const QueueTicket = require("../models/QueueTicket");
const User = require("../models/User");
const {
  getAssignedStationIds,
  hasAssignedStationAccess,
  isAssignedStationOnlyRole
} = require("../utils/stationScope");

const SALT_ROUNDS = 12;

function normalize(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return normalize(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(value) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(value || "");
}

function buildUserResponse(user) {
  return {
    id: String(user._id),
    name: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    isBlocked: Boolean(user.isBlocked),
    role: user.role || "customer",
    stationIds: (user.stationIds || []).map((id) => String(id)),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function buildEmptyVerificationSummary() {
  return {
    verifiedCustomers: 0,
    liters: 0,
    amount: 0,
    lastVerifiedAt: null,
    fuelBreakdown: []
  };
}

function normalizeVerificationSummary(summary) {
  const next = summary || buildEmptyVerificationSummary();
  return {
    verifiedCustomers: Number(next.verifiedCustomers || 0),
    liters: Number(Number(next.liters || 0).toFixed(2)),
    amount: Number(Number(next.amount || 0).toFixed(2)),
    lastVerifiedAt: next.lastVerifiedAt || null,
    fuelBreakdown: Array.isArray(next.fuelBreakdown)
      ? next.fuelBreakdown.map((item) => ({
          fuelType: String(item?.fuelType || "").trim().toLowerCase(),
          verifiedCustomers: Number(item?.verifiedCustomers || 0),
          liters: Number(Number(item?.liters || 0).toFixed(2)),
          amount: Number(Number(item?.amount || 0).toFixed(2)),
          averageUnitPrice: Number(Number(item?.averageUnitPrice || 0).toFixed(2))
        }))
      : []
  };
}

async function buildVerificationSummaryByUser(stationId, users = []) {
  const userIds = (Array.isArray(users) ? users : [])
    .map((user) => String(user?._id || "").trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  const summaryByUserId = new Map(userIds.map((userId) => [userId, buildEmptyVerificationSummary()]));

  if (!userIds.length) {
    return summaryByUserId;
  }

  const aggregates = await QueueTicket.aggregate([
    {
      $match: {
        stationId: new mongoose.Types.ObjectId(String(stationId)),
        verifiedByUserId: {
          $in: userIds.map((userId) => new mongoose.Types.ObjectId(userId))
        },
        checkInStatus: "verified"
      }
    },
    {
      $group: {
        _id: {
          userId: "$verifiedByUserId",
          fuelType: "$fuelType"
        },
        verifiedCustomers: { $sum: 1 },
        liters: { $sum: { $ifNull: ["$requestedLiters", 0] } },
        amount: { $sum: { $ifNull: ["$estimatedAmount", 0] } },
        unitPriceTotal: { $sum: { $ifNull: ["$unitPrice", 0] } },
        unitPriceCount: {
          $sum: {
            $cond: [{ $gt: [{ $ifNull: ["$unitPrice", 0] }, 0] }, 1, 0]
          }
        },
        lastVerifiedAt: { $max: "$checkInVerifiedAt" }
      }
    },
    {
      $sort: {
        "_id.userId": 1,
        "_id.fuelType": 1
      }
    }
  ]);

  aggregates.forEach((item) => {
    const userId = String(item?._id?.userId || "").trim();
    if (!userId) return;

    const current = summaryByUserId.get(userId) || buildEmptyVerificationSummary();
    const verifiedCustomers = Number(item?.verifiedCustomers || 0);
    const liters = Number(item?.liters || 0);
    const amount = Number(item?.amount || 0);
    const averageUnitPrice =
      Number(item?.unitPriceCount || 0) > 0
        ? Number(item?.unitPriceTotal || 0) / Number(item?.unitPriceCount || 1)
        : 0;

    summaryByUserId.set(userId, {
      verifiedCustomers: current.verifiedCustomers + verifiedCustomers,
      liters: Number((current.liters + liters).toFixed(2)),
      amount: Number((current.amount + amount).toFixed(2)),
      lastVerifiedAt:
        current.lastVerifiedAt && new Date(current.lastVerifiedAt) > new Date(item?.lastVerifiedAt || 0)
          ? current.lastVerifiedAt
          : item?.lastVerifiedAt || current.lastVerifiedAt,
      fuelBreakdown: [
        ...current.fuelBreakdown,
        {
          fuelType: String(item?._id?.fuelType || "").trim().toLowerCase(),
          verifiedCustomers,
          liters: Number(liters.toFixed(2)),
          amount: Number(amount.toFixed(2)),
          averageUnitPrice: Number(averageUnitPrice.toFixed(2))
        }
      ]
    });
  });

  return summaryByUserId;
}

async function canAccessStation(user, stationId) {
  if (!user) return false;
  if (String(user.role || "") === "super_admin") return true;

  const allowedStationIds = getAssignedStationIds(user);
  if (allowedStationIds.length) {
    return hasAssignedStationAccess(user, stationId);
  }

  if (isAssignedStationOnlyRole(user)) {
    return false;
  }

  const station = await Station.findById(stationId)
    .select("_id organizationId cityId branchId")
    .lean();
  if (!station) return false;

  const userOrganizationId = String(user.organizationId || "");
  const userCityIds = Array.isArray(user.cityIds) ? user.cityIds.map(String) : [];
  const userBranchIds = Array.isArray(user.branchIds) ? user.branchIds.map(String) : [];

  if (userOrganizationId && station.organizationId) {
    if (String(station.organizationId) !== userOrganizationId) return false;
  }
  if (userCityIds.length && station.cityId) {
    if (!userCityIds.includes(String(station.cityId))) return false;
  }
  if (userBranchIds.length && station.branchId) {
    if (!userBranchIds.includes(String(station.branchId))) return false;
  }

  return true;
}

function allowedCreateRoles(actorRole) {
  const role = String(actorRole || "");
  if (role === "super_admin" || role === "org_admin") return new Set(["staff", "station_manager"]);
  if (role === "station_manager") return new Set(["staff"]);
  return new Set();
}

function allowedEditRoles(actorRole) {
  const role = String(actorRole || "");
  if (role === "super_admin" || role === "org_admin") return new Set(["staff", "station_manager"]);
  if (role === "station_manager") return new Set(["staff"]);
  return new Set();
}

exports.listStationTeam = async (req, res) => {
  try {
    const stationId = normalize(req.params.stationId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const actor = req.user || null;
    if (!(await canAccessStation(actor, stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for team access." });
    }

    const users = await User.find({
      role: { $ne: "customer" },
      stationIds: stationId,
      isBlocked: { $in: [true, false] }
    })
      .select("_id name email phone isBlocked role stationIds createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean();

    const verificationSummaryByUserId = await buildVerificationSummaryByUser(stationId, users);

    return res.json({
      total: users.length,
      users: users.map((user) => ({
        ...buildUserResponse(user),
        verificationSummary: normalizeVerificationSummary(
          verificationSummaryByUserId.get(String(user._id)) || buildEmptyVerificationSummary()
        )
      }))
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to load team members." });
  }
};

exports.createStationTeamUser = async (req, res) => {
  try {
    const stationId = normalize(req.params.stationId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const actor = req.user || null;
    if (!(await canAccessStation(actor, stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for team creation." });
    }

    const name = normalize(req.body.name);
    const phone = normalize(req.body.phone);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const role = normalize(req.body.role || "staff").toLowerCase();

    if (!name || !email || !password) {
      return res.status(400).json({ message: "name, email, and password are required." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format." });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message: "Password must be 8+ chars and include upper, lower, number, and special character."
      });
    }

    const allowed = allowedCreateRoles(actor?.role);
    if (!allowed.has(role)) {
      return res.status(400).json({ message: "Invalid role for this action." });
    }

    const existing = await User.findOne({ email }).select("_id").lean();
    if (existing) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const station = await Station.findById(stationId)
      .select("_id organizationId cityId branchId")
      .lean();
    if (!station) {
      return res.status(404).json({ message: "Station not found." });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      name,
      phone,
      email,
      passwordHash,
      role,
      organizationId: station.organizationId || null,
      cityIds: station.cityId ? [station.cityId] : [],
      branchIds: station.branchId ? [station.branchId] : [],
      stationIds: [stationId]
    });

    return res.status(201).json({
      message: "Team member created.",
      user: buildUserResponse(user)
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to create team member." });
  }
};

exports.updateStationTeamUser = async (req, res) => {
  try {
    const stationId = normalize(req.params.stationId);
    const userId = normalize(req.params.userId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const actor = req.user || null;
    if (!(await canAccessStation(actor, stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for team update." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (String(user.role || "") === "super_admin") {
      return res.status(403).json({ message: "Forbidden: cannot modify super admin via station team endpoint." });
    }
    const userStationIds = Array.isArray(user.stationIds) ? user.stationIds.map(String) : [];
    if (!userStationIds.includes(String(stationId))) {
      return res.status(404).json({ message: "User not found for this station." });
    }

    const updates = {};
    if (req.body.name !== undefined) updates.name = normalize(req.body.name);
    if (req.body.phone !== undefined) updates.phone = normalize(req.body.phone);
    if (req.body.email !== undefined) updates.email = normalizeEmail(req.body.email);
    if (req.body.role !== undefined) updates.role = normalize(req.body.role).toLowerCase();

    if (updates.name !== undefined && !updates.name) {
      return res.status(400).json({ message: "name cannot be empty." });
    }
    if (updates.email !== undefined) {
      if (!updates.email) return res.status(400).json({ message: "email cannot be empty." });
      if (!isValidEmail(updates.email)) {
        return res.status(400).json({ message: "Invalid email format." });
      }
      const duplicate = await User.findOne({ email: updates.email, _id: { $ne: userId } }).select("_id").lean();
      if (duplicate) {
        return res.status(409).json({ message: "Email already registered." });
      }
    }

    if (updates.role !== undefined) {
      const allowed = allowedEditRoles(actor?.role);
      if (!allowed.has(updates.role)) {
        return res.status(400).json({ message: "Invalid role for this action." });
      }
    }

    Object.assign(user, updates);
    await user.save();

    return res.json({
      message: "Team member updated.",
      user: buildUserResponse(user)
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to update team member." });
  }
};

exports.setStationTeamUserBlocked = async (req, res) => {
  try {
    const stationId = normalize(req.params.stationId);
    const userId = normalize(req.params.userId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const actor = req.user || null;
    if (!(await canAccessStation(actor, stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for team block." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (String(user.role || "") === "super_admin") {
      return res.status(403).json({ message: "Forbidden: cannot modify super admin via station team endpoint." });
    }
    const userStationIds = Array.isArray(user.stationIds) ? user.stationIds.map(String) : [];
    if (!userStationIds.includes(String(stationId))) {
      return res.status(404).json({ message: "User not found for this station." });
    }

    const isBlocked = Boolean(req.body?.isBlocked);
    user.isBlocked = isBlocked;
    if (isBlocked) {
      user.refreshTokenHash = "";
    }
    await user.save();

    return res.json({
      message: isBlocked ? "User blocked successfully." : "User unblocked successfully.",
      user: buildUserResponse(user)
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to update block status." });
  }
};

exports.forceLogoutStationTeamUser = async (req, res) => {
  try {
    const stationId = normalize(req.params.stationId);
    const userId = normalize(req.params.userId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const actor = req.user || null;
    if (!(await canAccessStation(actor, stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for force logout." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    if (String(user.role || "") === "super_admin") {
      return res.status(403).json({ message: "Forbidden: cannot modify super admin via station team endpoint." });
    }
    const userStationIds = Array.isArray(user.stationIds) ? user.stationIds.map(String) : [];
    if (!userStationIds.includes(String(stationId))) {
      return res.status(404).json({ message: "User not found for this station." });
    }

    user.refreshTokenHash = "";
    await user.save();

    return res.json({
      message: "User sessions revoked successfully.",
      user: buildUserResponse(user)
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to revoke user sessions." });
  }
};

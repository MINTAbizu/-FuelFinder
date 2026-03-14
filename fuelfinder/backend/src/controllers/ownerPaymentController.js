const mongoose = require("mongoose");
const PaymentTransaction = require("../models/PaymentTransaction");
const Station = require("../models/Station");

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function canAccessStation(user, stationId) {
  if (!user) return false;
  if (String(user.role || "") === "super_admin") return true;

  const allowedStationIds = Array.isArray(user.stationIds) ? user.stationIds.map(String) : [];
  if (allowedStationIds.length) {
    return allowedStationIds.includes(String(stationId));
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

exports.listStationPayments = async (req, res) => {
  try {
    const stationId = asText(req.params.stationId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const actor = req.user || null;
    if (!(await canAccessStation(actor, stationId))) {
      return res.status(403).json({ message: "Forbidden: station scope denied for payments." });
    }

    const query = { stationId };

    const provider = asText(req.query.provider);
    const status = asText(req.query.status);
    if (provider) query.provider = provider;
    if (status) query.status = status;

    if (req.query.from || req.query.to) {
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;
      if (from && Number.isNaN(from.getTime())) {
        return res.status(400).json({ message: "from must be a valid date." });
      }
      if (to && Number.isNaN(to.getTime())) {
        return res.status(400).json({ message: "to must be a valid date." });
      }
      query.createdAt = {};
      if (from) query.createdAt.$gte = from;
      if (to) query.createdAt.$lte = to;
    }

    const limit = Math.min(200, Math.max(1, asNumber(req.query.limit, 50)));
    const page = Math.max(1, asNumber(req.query.page, 1));
    const skip = (page - 1) * limit;

    const stationObjectId = new mongoose.Types.ObjectId(stationId);
    const match = { stationId: stationObjectId };
    if (provider) match.provider = provider;
    if (status) match.status = status;
    if (query.createdAt) match.createdAt = query.createdAt;

    const [items, total, summaryAgg] = await Promise.all([
      PaymentTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PaymentTransaction.countDocuments(query),
      PaymentTransaction.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            amount: { $sum: { $ifNull: ["$amount", 0] } },
            platformFee: { $sum: { $ifNull: ["$platformFee", 0] } },
            stationPayout: { $sum: { $ifNull: ["$stationPayout", 0] } }
          }
        }
      ])
    ]);

    const summaryRow = Array.isArray(summaryAgg) && summaryAgg.length ? summaryAgg[0] : null;
    const summary = {
      amount: Number(summaryRow?.amount || 0),
      platformFee: Number(summaryRow?.platformFee || 0),
      stationPayout: Number(summaryRow?.stationPayout || 0)
    };

    return res.json({
      total,
      page,
      limit,
      stationId: String(stationId),
      summary,
      items: items.map((item) => ({
        id: String(item._id),
        provider: item.provider,
        txRef: item.txRef,
        reservationId: item.reservationId ? String(item.reservationId) : null,
        userId: item.userId ? String(item.userId) : null,
        amount: Number(item.amount || 0),
        currency: item.currency || "ETB",
        platformFee: Number(item.platformFee || 0),
        stationPayout: Number(item.stationPayout || 0),
        status: item.status,
        reference: item.reference || "",
        checkoutUrl: item.checkoutUrl || "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        verifiedAt: item.verifiedAt || null
      }))
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to load station payments." });
  }
};


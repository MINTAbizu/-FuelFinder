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

function isOrgAdmin(req) {
  return String(req?.user?.role || "") === "org_admin";
}

function getActorOrgId(req) {
  return String(req?.user?.organizationId || "").trim();
}

exports.listPayments = async (req, res) => {
  try {
    const query = {};
    const provider = asText(req.query.provider);
    const status = asText(req.query.status);
    const txRef = asText(req.query.txRef);
    const reservationId = asText(req.query.reservationId);
    const stationId = asText(req.query.stationId);
    const userId = asText(req.query.userId);

    if (provider) query.provider = provider;
    if (status) query.status = status;
    if (txRef) query.txRef = txRef;
    if (reservationId) {
      if (!mongoose.isValidObjectId(reservationId)) {
        return res.status(400).json({ message: "reservationId must be a valid ObjectId." });
      }
      query.reservationId = reservationId;
    }
    if (userId) {
      if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ message: "userId must be a valid ObjectId." });
      }
      query.userId = userId;
    }
    if (stationId) {
      if (!mongoose.isValidObjectId(stationId)) {
        return res.status(400).json({ message: "stationId must be a valid ObjectId." });
      }
      query.stationId = stationId;
    }

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

    if (isOrgAdmin(req)) {
      const actorOrgId = getActorOrgId(req);
      if (!actorOrgId) {
        return res.status(403).json({ message: "Forbidden: organization scope not configured." });
      }
      const stations = await Station.find({ organizationId: actorOrgId }).select("_id").lean();
      const stationIds = stations.map((s) => String(s._id));
      if (stationId && !stationIds.includes(String(stationId))) {
        return res.status(403).json({ message: "Forbidden: station outside your organization." });
      }
      query.stationId = stationIds.length ? { $in: stationIds } : "__none__";
    }

    const limit = Math.min(200, Math.max(1, asNumber(req.query.limit, 50)));
    const page = Math.max(1, asNumber(req.query.page, 1));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      PaymentTransaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PaymentTransaction.countDocuments(query)
    ]);

    return res.json({
      total,
      page,
      limit,
      items: items.map((item) => ({
        id: String(item._id),
        provider: item.provider,
        txRef: item.txRef,
        reservationId: item.reservationId ? String(item.reservationId) : null,
        userId: item.userId ? String(item.userId) : null,
        stationId: item.stationId ? String(item.stationId) : null,
        amount: Number(item.amount || 0),
        currency: item.currency || "ETB",
        platformFee: Number(item.platformFee || 0),
        stationPayout: Number(item.stationPayout || 0),
        splitType: item.splitType || "",
        splitValue: Number(item.splitValue || 0),
        subaccountId: item.subaccountId || "",
        status: item.status,
        reference: item.reference || "",
        checkoutUrl: item.checkoutUrl || "",
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        verifiedAt: item.verifiedAt || null
      }))
    });
  } catch (_err) {
    return res.status(500).json({ message: "Failed to load payment transactions." });
  }
};

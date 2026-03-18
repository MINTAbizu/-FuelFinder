const mongoose = require("mongoose");
const Promotion = require("../models/Promotion");
const Station = require("../models/Station");

function asText(value) {
  return String(value || "").trim();
}

function asNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function parseDateOrNull(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date.`);
  }
  return date;
}

function isStationScopedUser(user = {}) {
  return Array.isArray(user.stationIds) && user.stationIds.length > 0;
}

function hasStationAccess(user = {}, station) {
  if (!station) return false;
  if (String(user.role || "") === "super_admin") return true;

  if (isStationScopedUser(user)) {
    return user.stationIds.map((value) => String(value)).includes(String(station._id));
  }

  const actorOrgId = String(user.organizationId || "").trim();
  const stationOrgId = String(station.organizationId || "").trim();
  if (actorOrgId) {
    return Boolean(stationOrgId) && stationOrgId === actorOrgId;
  }

  return false;
}

function buildPublicPromotionResponse(promotion, station) {
  const mediaType = asText(promotion?.mediaType || "image").toLowerCase() === "video" ? "video" : "image";
  return {
    id: String(promotion?._id || ""),
    stationId: String(station?._id || promotion?.stationId || ""),
    stationName: asText(station?.name || ""),
    stationAddress: asText(station?.address || ""),
    title: asText(promotion?.title),
    description: asText(promotion?.description),
    mediaType,
    mediaUrl: asText(promotion?.mediaUrl),
    thumbnailUrl: asText(promotion?.thumbnailUrl),
    previewUrl: mediaType === "image" ? asText(promotion?.mediaUrl) : asText(promotion?.thumbnailUrl),
    ctaLabel: asText(promotion?.ctaLabel),
    ctaUrl: asText(promotion?.ctaUrl),
    startsAt: promotion?.startsAt || null,
    endsAt: promotion?.endsAt || null,
    sortOrder: Number(promotion?.sortOrder || 0),
    isActive: Boolean(promotion?.isActive),
    createdAt: promotion?.createdAt || null,
    updatedAt: promotion?.updatedAt || null
  };
}

function buildOwnerPromotionResponse(promotion, station) {
  return {
    ...buildPublicPromotionResponse(promotion, station),
    organizationId: station?.organizationId ? String(station.organizationId) : null,
    createdByUserId: promotion?.createdByUserId ? String(promotion.createdByUserId) : null,
    updatedByUserId: promotion?.updatedByUserId ? String(promotion.updatedByUserId) : null
  };
}

function buildActivePromotionQuery(query = {}, now = new Date()) {
  return {
    ...query,
    isActive: true,
    $and: [
      {
        $or: [
          { startsAt: null },
          { startsAt: { $exists: false } },
          { startsAt: { $lte: now } }
        ]
      },
      {
        $or: [
          { endsAt: null },
          { endsAt: { $exists: false } },
          { endsAt: { $gte: now } }
        ]
      }
    ]
  };
}

async function loadStationForActor(user, stationId) {
  const station = await Station.findById(stationId);
  if (!station) {
    return { station: null, error: { status: 404, message: "Station not found." } };
  }
  if (!hasStationAccess(user, station)) {
    return { station: null, error: { status: 403, message: "Forbidden: station scope denied." } };
  }
  return { station, error: null };
}

exports.listPublicPromotions = async (req, res) => {
  try {
    const stationIds = String(req.query.stationIds || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .filter((value) => mongoose.isValidObjectId(value));

    if (!stationIds.length) {
      return res.json({ total: 0, promotions: [] });
    }

    const limit = Math.min(12, Math.max(1, asNumber(req.query.limit, 6)));
    const activeStations = await Station.find({
      _id: { $in: stationIds },
      isActive: true
    })
      .select("_id name address")
      .lean();

    if (!activeStations.length) {
      return res.json({ total: 0, promotions: [] });
    }

    const stationMap = activeStations.reduce((accumulator, station) => {
      accumulator[String(station._id)] = station;
      return accumulator;
    }, {});

    const promotions = await Promotion.find(
      buildActivePromotionQuery({
        stationId: { $in: Object.keys(stationMap) }
      })
    )
      .sort({ sortOrder: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    const items = promotions
      .map((promotion) => buildPublicPromotionResponse(promotion, stationMap[String(promotion.stationId)]))
      .filter((promotion) => promotion.stationId && promotion.stationName);

    return res.json({
      total: items.length,
      promotions: items
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load promotions." });
  }
};

exports.listStationPromotions = async (req, res) => {
  try {
    const stationId = asText(req.params.stationId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const { station, error } = await loadStationForActor(req.user, stationId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const promotions = await Promotion.find({ stationId })
      .sort({ sortOrder: -1, createdAt: -1 })
      .lean();

    return res.json({
      total: promotions.length,
      promotions: promotions.map((promotion) => buildOwnerPromotionResponse(promotion, station))
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load promotions." });
  }
};

exports.createStationPromotion = async (req, res) => {
  try {
    const stationId = asText(req.params.stationId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const { station, error } = await loadStationForActor(req.user, stationId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const title = asText(req.body.title);
    const mediaUrl = asText(req.body.mediaUrl);
    const mediaType = asText(req.body.mediaType || "image").toLowerCase();
    const startsAt = parseDateOrNull(req.body.startsAt, "startsAt");
    const endsAt = parseDateOrNull(req.body.endsAt, "endsAt");

    if (!title) {
      return res.status(400).json({ message: "title is required." });
    }
    if (!mediaUrl) {
      return res.status(400).json({ message: "mediaUrl is required." });
    }
    if (!["image", "video"].includes(mediaType)) {
      return res.status(400).json({ message: "mediaType must be image or video." });
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      return res.status(400).json({ message: "startsAt must be before endsAt." });
    }

    const promotion = await Promotion.create({
      stationId,
      organizationId: station.organizationId || null,
      title,
      description: asText(req.body.description),
      mediaType,
      mediaUrl,
      thumbnailUrl: asText(req.body.thumbnailUrl),
      ctaLabel: asText(req.body.ctaLabel),
      ctaUrl: asText(req.body.ctaUrl),
      startsAt,
      endsAt,
      sortOrder: asNumber(req.body.sortOrder, 0),
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
      createdByUserId: req.user?.id || null,
      updatedByUserId: req.user?.id || null
    });

    return res.status(201).json({
      message: "Promotion created successfully.",
      promotion: buildOwnerPromotionResponse(promotion.toObject(), station)
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be a valid date")) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to create promotion." });
  }
};

exports.updateStationPromotion = async (req, res) => {
  try {
    const stationId = asText(req.params.stationId);
    const promotionId = asText(req.params.promotionId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }
    if (!mongoose.isValidObjectId(promotionId)) {
      return res.status(400).json({ message: "Invalid promotion id." });
    }

    const { station, error } = await loadStationForActor(req.user, stationId);
    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    const promotion = await Promotion.findOne({ _id: promotionId, stationId });
    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found." });
    }

    if (req.body.title !== undefined) {
      const title = asText(req.body.title);
      if (!title) {
        return res.status(400).json({ message: "title cannot be empty." });
      }
      promotion.title = title;
    }
    if (req.body.description !== undefined) {
      promotion.description = asText(req.body.description);
    }
    if (req.body.mediaType !== undefined) {
      const mediaType = asText(req.body.mediaType).toLowerCase();
      if (!["image", "video"].includes(mediaType)) {
        return res.status(400).json({ message: "mediaType must be image or video." });
      }
      promotion.mediaType = mediaType;
    }
    if (req.body.mediaUrl !== undefined) {
      const mediaUrl = asText(req.body.mediaUrl);
      if (!mediaUrl) {
        return res.status(400).json({ message: "mediaUrl cannot be empty." });
      }
      promotion.mediaUrl = mediaUrl;
    }
    if (req.body.thumbnailUrl !== undefined) {
      promotion.thumbnailUrl = asText(req.body.thumbnailUrl);
    }
    if (req.body.ctaLabel !== undefined) {
      promotion.ctaLabel = asText(req.body.ctaLabel);
    }
    if (req.body.ctaUrl !== undefined) {
      promotion.ctaUrl = asText(req.body.ctaUrl);
    }
    if (req.body.startsAt !== undefined) {
      promotion.startsAt = parseDateOrNull(req.body.startsAt, "startsAt");
    }
    if (req.body.endsAt !== undefined) {
      promotion.endsAt = parseDateOrNull(req.body.endsAt, "endsAt");
    }
    if (promotion.startsAt && promotion.endsAt && promotion.startsAt > promotion.endsAt) {
      return res.status(400).json({ message: "startsAt must be before endsAt." });
    }
    if (req.body.sortOrder !== undefined) {
      promotion.sortOrder = asNumber(req.body.sortOrder, 0);
    }
    if (req.body.isActive !== undefined) {
      promotion.isActive = Boolean(req.body.isActive);
    }

    promotion.updatedByUserId = req.user?.id || null;
    await promotion.save();

    return res.json({
      message: "Promotion updated successfully.",
      promotion: buildOwnerPromotionResponse(promotion.toObject(), station)
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("must be a valid date")) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to update promotion." });
  }
};

const mongoose = require("mongoose");
const QueueTicket = require("../models/QueueTicket");
const Station = require("../models/Station");
const StationFuelSnapshot = require("../models/StationFuelSnapshot");

const FUEL_TYPES = ["gasoline", "diesel", "other"];

function asText(value) {
  return String(value || "").trim();
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeFuelInventory(inventory = {}) {
  const gasolineLiters = Number(inventory.gasolineLiters || 0);
  const dieselLiters = Number(inventory.dieselLiters || 0);
  const otherLiters = Number(inventory.otherLiters || 0);

  return {
    gasolineLiters,
    dieselLiters,
    otherLiters,
    totalLiters: gasolineLiters + dieselLiters + otherLiters
  };
}

function buildEmptyBreakdown() {
  return FUEL_TYPES.map((fuelType) => ({
    fuelType,
    soldLiters: 0,
    soldAmount: 0,
    servedTickets: 0,
    leftLiters: null
  }));
}

function resolveRangeFromDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }

  const start = parseDate(`${dateKey}T00:00:00.000Z`);
  const end = parseDate(`${dateKey}T23:59:59.999Z`);
  if (!start || !end) return null;

  return { start, end };
}

function resolveSummaryRange(query = {}) {
  const dateKey = asText(query.date);
  const fromRaw = asText(query.from);
  const toRaw = asText(query.to);

  if (fromRaw || toRaw) {
    const from = parseDate(fromRaw);
    const to = parseDate(toRaw);
    if (!from || !to) return null;
    return { dateKey, from, to };
  }

  if (dateKey) {
    const range = resolveRangeFromDateKey(dateKey);
    if (!range) return null;
    return { dateKey, from: range.start, to: range.end };
  }

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const range = resolveRangeFromDateKey(todayKey);
  return range ? { dateKey: todayKey, from: range.start, to: range.end } : null;
}

exports.getStationFuelStockSummary = async (req, res) => {
  try {
    const stationId = asText(req.params.stationId);
    if (!mongoose.isValidObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid station id." });
    }

    const range = resolveSummaryRange(req.query || {});
    if (!range) {
      return res.status(400).json({ message: "Provide a valid date or from/to range." });
    }
    if (range.from > range.to) {
      return res.status(400).json({ message: "from must be before to." });
    }

    const now = new Date();
    if (range.from > now) {
      return res.status(400).json({ message: "Selected date cannot be in the future." });
    }

    const station = await Station.findById(stationId)
      .select("_id fuelStatus fuelInventory")
      .lean();
    if (!station) {
      return res.status(404).json({ message: "Station not found." });
    }

    const stationObjectId = new mongoose.Types.ObjectId(stationId);
    const soldAgg = await QueueTicket.aggregate([
      {
        $match: {
          stationId: stationObjectId,
          status: "served",
          servedAt: { $gte: range.from, $lte: range.to }
        }
      },
      {
        $group: {
          _id: "$fuelType",
          soldLiters: { $sum: { $ifNull: ["$requestedLiters", 0] } },
          soldAmount: { $sum: { $ifNull: ["$estimatedAmount", 0] } },
          servedTickets: { $sum: 1 }
        }
      }
    ]);

    const breakdown = buildEmptyBreakdown();
    const byFuelType = new Map(breakdown.map((item) => [item.fuelType, item]));

    soldAgg.forEach((row) => {
      const item = byFuelType.get(String(row?._id || ""));
      if (!item) return;
      item.soldLiters = Number(row?.soldLiters || 0);
      item.soldAmount = Number(row?.soldAmount || 0);
      item.servedTickets = Number(row?.servedTickets || 0);
    });

    let leftFuelSource = "unavailable";
    let leftFuelUpdatedAt = null;
    let leftFuelAvailable = false;
    let leftFuel = null;

    if (range.to >= now) {
      leftFuel = normalizeFuelInventory(station.fuelInventory || {});
      leftFuelSource = "current_station";
      leftFuelUpdatedAt = station?.fuelInventory?.updatedAt || null;
      leftFuelAvailable = true;
    } else {
      const latestSnapshot = await StationFuelSnapshot.findOne({
        stationId,
        recordedAt: { $lte: range.to }
      })
        .sort({ recordedAt: -1, createdAt: -1 })
        .lean();

      if (latestSnapshot) {
        leftFuel = normalizeFuelInventory(latestSnapshot.fuelInventory || {});
        leftFuelSource = "snapshot";
        leftFuelUpdatedAt = latestSnapshot.recordedAt || latestSnapshot.createdAt || null;
        leftFuelAvailable = true;
      }
    }

    if (leftFuelAvailable && leftFuel) {
      breakdown.forEach((item) => {
        item.leftLiters = Number(leftFuel[`${item.fuelType}Liters`] || 0);
      });
    }

    const totals = breakdown.reduce(
      (acc, item) => {
        acc.soldLiters += Number(item.soldLiters || 0);
        acc.soldAmount += Number(item.soldAmount || 0);
        acc.servedTickets += Number(item.servedTickets || 0);
        if (typeof item.leftLiters === "number") {
          acc.leftLiters += Number(item.leftLiters || 0);
        } else {
          acc.leftLiters = null;
        }
        return acc;
      },
      {
        soldLiters: 0,
        soldAmount: 0,
        servedTickets: 0,
        leftLiters: leftFuelAvailable && leftFuel ? 0 : null
      }
    );

    return res.json({
      stationId,
      date: range.dateKey || null,
      from: range.from,
      to: range.to,
      leftFuelAvailable,
      leftFuelSource,
      leftFuelUpdatedAt,
      totals,
      breakdown
    });
  } catch (_error) {
    return res.status(500).json({ message: "Failed to load station fuel summary." });
  }
};

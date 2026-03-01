const mongoose = require("mongoose");
const QueueTicket = require("../models/QueueTicket");
const { getIO } = require("../socket");

const ACTIVE_STATUSES = ["waiting", "called"];
const AVERAGE_MINUTES_PER_CAR = 3;

function stationRoom(stationId) {
  return `station:${stationId}`;
}

function emitQueueUpdated(stationId) {
  const io = getIO();
  if (!io) return;
  io.to(stationRoom(stationId)).emit("queue_updated", { stationId: String(stationId) });
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function recalculatePositions(stationId) {
  const waiting = await QueueTicket.find({
    stationId,
    status: "waiting"
  })
    .sort({ joinedAt: 1, _id: 1 })
    .select("_id position")
    .lean();

  const bulkOps = waiting
    .map((ticket, idx) => {
      const nextPosition = idx + 1;
      if (ticket.position === nextPosition) return null;
      return {
        updateOne: {
          filter: { _id: ticket._id },
          update: { $set: { position: nextPosition } }
        }
      };
    })
    .filter(Boolean);

  if (bulkOps.length > 0) {
    await QueueTicket.bulkWrite(bulkOps);
  }
}

exports.joinQueue = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stationId } = req.body;

    if (!isObjectId(userId) || !isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid userId or stationId." });
    }

    const existing = await QueueTicket.findOne({
      userId,
      stationId,
      status: { $in: ACTIVE_STATUSES }
    });
    if (existing) {
      return res.status(409).json({
        message: "You already have an active ticket for this station.",
        ticketId: existing._id,
        position: existing.position
      });
    }

    const queueCount = await QueueTicket.countDocuments({
      stationId,
      status: "waiting"
    });
    const position = queueCount + 1;

    const ticket = await QueueTicket.create({
      userId,
      stationId,
      status: "waiting",
      position
    });

    const etaMinutes = position * AVERAGE_MINUTES_PER_CAR;
    emitQueueUpdated(stationId);

    return res.status(201).json({
      ticketId: ticket._id,
      stationId,
      position,
      status: ticket.status,
      etaMinutes
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to join queue.", error: error.message });
  }
};

exports.getMyTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { stationId } = req.params;

    if (!isObjectId(userId) || !isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid userId or stationId." });
    }

    const ticket = await QueueTicket.findOne({
      userId,
      stationId,
      status: { $in: ACTIVE_STATUSES }
    }).sort({ joinedAt: -1 });

    if (!ticket) return res.status(404).json({ message: "No active ticket." });

    const etaMinutes = Math.max(0, ticket.position * AVERAGE_MINUTES_PER_CAR);
    return res.json({
      ticketId: ticket._id,
      stationId: ticket.stationId,
      status: ticket.status,
      position: ticket.position,
      etaMinutes
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load ticket.", error: error.message });
  }
};

exports.leaveQueue = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticketId } = req.body;

    if (!isObjectId(userId) || !isObjectId(ticketId)) {
      return res.status(400).json({ message: "Invalid userId or ticketId." });
    }

    const ticket = await QueueTicket.findOne({
      _id: ticketId,
      userId,
      status: { $in: ACTIVE_STATUSES }
    });
    if (!ticket) return res.status(404).json({ message: "Active ticket not found." });

    ticket.status = "cancelled";
    await ticket.save();

    await recalculatePositions(ticket.stationId);
    emitQueueUpdated(ticket.stationId);

    return res.json({ message: "Left queue successfully." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to leave queue.", error: error.message });
  }
};

exports.nextInQueue = async (req, res) => {
  try {
    const { stationId } = req.body;
    if (!isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid stationId." });
    }

    const currentCalled = await QueueTicket.findOne({
      stationId,
      status: "called"
    }).sort({ calledAt: 1 });

    if (currentCalled) {
      currentCalled.status = "served";
      currentCalled.servedAt = new Date();
      await currentCalled.save();
    }

    const next = await QueueTicket.findOne({
      stationId,
      status: "waiting"
    }).sort({ joinedAt: 1, _id: 1 });

    if (!next) {
      emitQueueUpdated(stationId);
      return res.json({ message: "Queue is empty.", nextTicket: null });
    }

    next.status = "called";
    next.calledAt = new Date();
    next.expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await next.save();

    await recalculatePositions(stationId);
    emitQueueUpdated(stationId);

    const io = getIO();
    if (io) {
      io.to(stationRoom(stationId)).emit("ticket_called", {
        stationId: String(stationId),
        ticketId: String(next._id),
        userId: String(next.userId)
      });
    }

    return res.json({
      message: "Next ticket called.",
      nextTicket: {
        ticketId: next._id,
        userId: next.userId,
        status: next.status
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to call next ticket.", error: error.message });
  }
};

exports.getStationQueue = async (req, res) => {
  try {
    const { stationId } = req.params;
    if (!isObjectId(stationId)) {
      return res.status(400).json({ message: "Invalid stationId." });
    }

    const waiting = await QueueTicket.find({
      stationId,
      status: "waiting"
    })
      .sort({ position: 1 })
      .select("userId position joinedAt")
      .lean();

    const called = await QueueTicket.findOne({
      stationId,
      status: "called"
    })
      .sort({ calledAt: -1 })
      .select("userId calledAt expiresAt")
      .lean();

    return res.json({
      stationId,
      waitingCount: waiting.length,
      called,
      waiting
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load station queue.", error: error.message });
  }
};

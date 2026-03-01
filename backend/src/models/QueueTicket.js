const mongoose = require("mongoose");

const queueTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Station",
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["waiting", "called", "served", "cancelled", "expired"],
      default: "waiting",
      index: true
    },
    position: { type: Number, required: true },
    joinedAt: { type: Date, default: Date.now, index: true },
    calledAt: { type: Date },
    servedAt: { type: Date },
    expiresAt: { type: Date }
  },
  { timestamps: true }
);

queueTicketSchema.index({ stationId: 1, status: 1, joinedAt: 1 });
queueTicketSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model("QueueTicket", queueTicketSchema);

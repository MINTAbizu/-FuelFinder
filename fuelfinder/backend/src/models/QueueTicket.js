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
      enum: ["pending_payment", "waiting", "called", "served", "cancelled", "expired"],
      default: "pending_payment",
      index: true
    },
    position: { type: Number, required: true },
    fuelType: {
      type: String,
      enum: ["gasoline", "diesel", "other"],
      default: "gasoline"
    },
    requestedLiters: { type: Number, default: 0 },
    unitPrice: { type: Number, default: 0 },
    estimatedAmount: { type: Number, default: 0 },
    requestedBand: {
      type: String,
      enum: ["10-20", "20-40", "40+"],
      default: "10-20"
    },
    depositAmount: { type: Number, default: 0 },
    depositCurrency: { type: String, default: "ETB" },
    depositStatus: {
      type: String,
      enum: ["pending", "authorized", "refunded", "forfeited", "not_required"],
      default: "pending",
      index: true
    },
    paymentReference: { type: String, default: "" },
    paymentProvider: {
      type: String,
      enum: ["", "telebirr"],
      default: ""
    },
    paymentSessionId: { type: String, default: "" },
    checkInStatus: {
      type: String,
      enum: ["pending", "arrived", "verified", "rejected"],
      default: "pending",
      index: true
    },
    checkInStartedAt: { type: Date },
    checkInVerifiedAt: { type: Date },
    checkInOtpHash: { type: String, default: "" },
    checkInOtpExpiresAt: { type: Date, index: true },
    checkInOtpAttempts: { type: Number, default: 0 },
    checkInQrNonce: { type: String, default: "" },
    checkInLocation: {
      lat: { type: Number },
      lon: { type: Number },
      accuracy: { type: Number }
    },
    verifiedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    joinedAt: { type: Date, default: Date.now, index: true },
    paymentExpiresAt: { type: Date, index: true },
    depositPaidAt: { type: Date },
    calledAt: { type: Date },
    servedAt: { type: Date },
    expiresAt: { type: Date }
  },
  { timestamps: true }
);

queueTicketSchema.index({ stationId: 1, status: 1, joinedAt: 1 });
queueTicketSchema.index({ userId: 1, status: 1 });
queueTicketSchema.index({ stationId: 1, paymentExpiresAt: 1, status: 1 });

module.exports = mongoose.model("QueueTicket", queueTicketSchema);

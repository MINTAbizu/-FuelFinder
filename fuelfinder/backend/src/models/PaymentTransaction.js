const mongoose = require("mongoose");

const paymentTransactionSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["chapa"], required: true, index: true },
    txRef: { type: String, required: true, trim: true, index: true },
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "QueueTicket", default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: "Station", default: null },
    amount: { type: Number, default: 0 },
    currency: { type: String, default: "ETB" },
    platformFee: { type: Number, default: 0 },
    stationPayout: { type: Number, default: 0 },
    splitType: { type: String, default: "" },
    splitValue: { type: Number, default: 0 },
    subaccountId: { type: String, default: "" },
    status: {
      type: String,
      enum: ["initialized", "pending", "success", "failed", "cancelled", "expired"],
      default: "initialized",
      index: true
    },
    reference: { type: String, default: "" },
    checkoutUrl: { type: String, default: "" },
    rawInitResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    rawVerifyResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    initializedAt: { type: Date, default: Date.now },
    verifiedAt: { type: Date, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

paymentTransactionSchema.index(
  { provider: 1, txRef: 1 },
  { unique: true }
);
paymentTransactionSchema.index({ reservationId: 1, createdAt: -1 });

module.exports = mongoose.model("PaymentTransaction", paymentTransactionSchema);

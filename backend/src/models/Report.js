const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Station",
      required: true,
      index: true
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fuelStatus: {
      type: String,
      enum: ["full", "partial", "empty"],
      default: "partial"
    },
    queueLength: { type: Number, default: 0 },
    note: { type: String, trim: true, maxlength: 300 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", reportSchema);

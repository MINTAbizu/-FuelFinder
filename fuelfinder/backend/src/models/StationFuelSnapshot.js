const mongoose = require("mongoose");

const stationFuelSnapshotSchema = new mongoose.Schema(
  {
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Station",
      required: true,
      index: true
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    source: {
      type: String,
      trim: true,
      default: "unknown"
    },
    fuelStatus: {
      type: String,
      enum: ["full", "partial", "empty"],
      default: "partial"
    },
    fuelInventory: {
      gasolineLiters: { type: Number, default: 0 },
      dieselLiters: { type: Number, default: 0 },
      otherLiters: { type: Number, default: 0 }
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

stationFuelSnapshotSchema.index({ stationId: 1, recordedAt: -1 });

module.exports = mongoose.model("StationFuelSnapshot", stationFuelSnapshotSchema);

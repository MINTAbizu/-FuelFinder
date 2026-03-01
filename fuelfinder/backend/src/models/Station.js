const mongoose = require("mongoose");

const stationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    contact: { type: String, trim: true },
    fuelStatus: {
      type: String,
      enum: ["full", "partial", "empty"],
      default: "partial"
    },
    isActive: { type: Boolean, default: true },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point"
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true
      }
    }
  },
  { timestamps: true }
);

stationSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Station", stationSchema);

const mongoose = require("mongoose");

const stationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    contact: { type: String, trim: true },
    externalSource: { type: String, trim: true },
    externalSourceId: { type: String, trim: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    regionId: { type: mongoose.Schema.Types.ObjectId, ref: "Region", default: null },
    cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City", default: null },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: "Woreda", default: null },
    branchId: { type: mongoose.Schema.Types.ObjectId, default: null },
    subcity: { type: String, trim: true, default: "" },
    woreda: { type: String, trim: true, default: "" },
    landmark: { type: String, trim: true, default: "" },
    locationCategories: {
      type: [{ type: String, trim: true, lowercase: true }],
      default: []
    },
    fuelStatus: {
      type: String,
      enum: ["full", "partial", "empty"],
      default: "partial"
    },
    fuelInventory: {
      gasolineLiters: { type: Number, default: 0 },
      dieselLiters: { type: Number, default: 0 },
      otherLiters: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
      updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
    },
    fuelPrices: {
      gasoline: { type: Number, default: null },
      diesel: { type: Number, default: null },
      other: { type: Number, default: null }
    },
    paymentDetails: {
      providerName: { type: String, trim: true, default: "" },
      accountName: { type: String, trim: true, default: "" },
      accountNumber: { type: String, trim: true, default: "" },
      phoneNumber: { type: String, trim: true, default: "" },
      instructions: { type: String, trim: true, default: "" }
    },
    chapaSubaccountId: { type: String, trim: true, default: "" },
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
stationSchema.index({ regionId: 1 });
stationSchema.index({ cityId: 1 });
stationSchema.index({ woredaId: 1 });
stationSchema.index({ locationCategories: 1 });
stationSchema.index({ externalSource: 1, externalSourceId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Station", stationSchema);

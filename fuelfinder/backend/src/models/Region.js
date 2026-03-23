const mongoose = require("mongoose");

const regionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    code: { type: String, trim: true, uppercase: true },
    category: {
      type: String,
      enum: ["regional_state", "chartered_city"],
      default: "regional_state"
    },
    countryCode: { type: String, trim: true, uppercase: true, default: "ET" },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

regionSchema.index({ slug: 1 }, { unique: true });
regionSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Region", regionSchema);

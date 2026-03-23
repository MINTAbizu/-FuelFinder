const mongoose = require("mongoose");

const woredaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    code: { type: String, trim: true, uppercase: true },
    category: {
      type: String,
      enum: ["woreda", "subcity", "district", "special_district", "other"],
      default: "woreda"
    },
    regionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Region",
      required: true,
      index: true
    },
    cityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "City",
      required: true,
      index: true
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

woredaSchema.index({ cityId: 1, slug: 1 }, { unique: true });
woredaSchema.index({ regionId: 1, cityId: 1 });
woredaSchema.index({ code: 1 }, { sparse: true });
woredaSchema.index({ name: 1 });

module.exports = mongoose.model("Woreda", woredaSchema);

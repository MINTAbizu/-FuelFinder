const mongoose = require("mongoose");

const citySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    code: { type: String, trim: true, uppercase: true, default: "" },
    regionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Region",
      required: true,
      index: true
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

citySchema.index({ regionId: 1, slug: 1 }, { unique: true });
citySchema.index({ code: 1 }, { sparse: true });
citySchema.index({ name: 1 });

module.exports = mongoose.model("City", citySchema);

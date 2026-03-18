const mongoose = require("mongoose");

const promotionSchema = new mongoose.Schema(
  {
    stationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Station",
      required: true,
      index: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true,
      default: ""
    },
    mediaType: {
      type: String,
      enum: ["image", "video"],
      default: "image"
    },
    mediaUrl: {
      type: String,
      required: true,
      trim: true
    },
    thumbnailUrl: {
      type: String,
      trim: true,
      default: ""
    },
    ctaLabel: {
      type: String,
      trim: true,
      default: ""
    },
    ctaUrl: {
      type: String,
      trim: true,
      default: ""
    },
    startsAt: {
      type: Date,
      default: null,
      index: true
    },
    endsAt: {
      type: Date,
      default: null,
      index: true
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    updatedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    }
  },
  { timestamps: true }
);

promotionSchema.index({
  stationId: 1,
  isActive: 1,
  startsAt: 1,
  endsAt: 1,
  sortOrder: -1,
  createdAt: -1
});

module.exports = mongoose.model("Promotion", promotionSchema);

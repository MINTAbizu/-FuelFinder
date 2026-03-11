const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    phoneVerified: { type: Boolean, default: false },
    phoneVerificationHash: { type: String, default: "" },
    phoneVerificationExpiresAt: { type: Date, default: null, index: true },
    phoneVerificationAttempts: { type: Number, default: 0 },
    phoneVerificationLastSentAt: { type: Date, default: null },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    refreshTokenHash: { type: String, default: "" },
    isBlocked: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ["customer", "staff", "station_manager", "city_manager", "org_admin", "super_admin"],
      default: "customer"
    },
    organizationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    cityIds: [{ type: mongoose.Schema.Types.ObjectId }],
    stationIds: [{ type: mongoose.Schema.Types.ObjectId }],
    branchIds: [{ type: mongoose.Schema.Types.ObjectId }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

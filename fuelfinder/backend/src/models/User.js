const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    phoneVerified: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    phoneVerificationHash: { type: String, default: "" },
    phoneVerificationExpiresAt: { type: Date, default: null, index: true },
    phoneVerificationAttempts: { type: Number, default: 0 },
    phoneVerificationLastSentAt: { type: Date, default: null },
    twoFactorOtpHash: { type: String, default: "" },
    twoFactorOtpExpiresAt: { type: Date, default: null, index: true },
    twoFactorOtpAttempts: { type: Number, default: 0 },
    twoFactorOtpLastSentAt: { type: Date, default: null },
    passwordResetHash: { type: String, default: "" },
    passwordResetExpiresAt: { type: Date, default: null, index: true },
    passwordResetAttempts: { type: Number, default: 0 },
    passwordResetLastSentAt: { type: Date, default: null },
    biometricDevices: [
      {
        deviceId: { type: String, required: true, trim: true },
        label: { type: String, trim: true, default: "" },
        secretHash: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        lastUsedAt: { type: Date, default: null }
      }
    ],
    pushTokens: [
      {
        token: { type: String, required: true, trim: true },
        provider: { type: String, enum: ["expo"], default: "expo" },
        platform: { type: String, enum: ["ios", "android", "web", "unknown"], default: "unknown" },
        updatedAt: { type: Date, default: Date.now }
      }
    ],
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    googleSub: { type: String, default: "" },
    passwordHash: { type: String, required: true },
    refreshTokenHash: { type: String, default: "" },
    isBlocked: { type: Boolean, default: false },
    role: {
      type: String,
      enum: ["customer", "staff", "station_manager", "city_manager", "org_admin", "super_admin"],
      default: "customer"
    },
    preferredStationType: {
      type: String,
      enum: ["fuel", "electric"],
      default: undefined
    },
    organizationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    cityIds: [{ type: mongoose.Schema.Types.ObjectId }],
    stationIds: [{ type: mongoose.Schema.Types.ObjectId }],
    branchIds: [{ type: mongoose.Schema.Types.ObjectId }]
  },
  { timestamps: true }
);

userSchema.index({ googleSub: 1 }, { sparse: true });
userSchema.index({ "biometricDevices.deviceId": 1 }, { sparse: true });
userSchema.index({ "pushTokens.token": 1 }, { sparse: true });

module.exports = mongoose.model("User", userSchema);

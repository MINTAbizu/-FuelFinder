const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorRole: { type: String, default: "" },
    action: { type: String, required: true, trim: true },
    method: { type: String, required: true, trim: true },
    path: { type: String, required: true, trim: true },
    statusCode: { type: Number, required: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    request: {
      params: { type: mongoose.Schema.Types.Mixed, default: {} },
      query: { type: mongoose.Schema.Types.Mixed, default: {} },
      body: { type: mongoose.Schema.Types.Mixed, default: {} }
    }
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);


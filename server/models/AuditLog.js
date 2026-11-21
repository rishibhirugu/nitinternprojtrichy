const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['Invoice', 'ProductionRun'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, default: 'UPDATE' },
    user: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      username: { type: String, required: true },
      role: { type: String, required: true }
    },
    timestamp: { type: Date, default: Date.now, required: true },
    before: { type: mongoose.Schema.Types.Mixed, required: true },
    after: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: false }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);

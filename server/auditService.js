const AuditLog = require('./models/AuditLog');

async function writeAuditLog({ entityType, entityId, user, before, after, action = 'UPDATE' }, Model = AuditLog) {
  if (!entityType || !entityId || !user || !before || !after) {
    throw new Error('entityType, entityId, user, before, and after are required for AuditLog');
  }
  return Model.create({
    entityType,
    entityId,
    action,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    },
    timestamp: new Date(),
    before,
    after
  });
}

module.exports = { writeAuditLog };

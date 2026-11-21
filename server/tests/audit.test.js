const { writeAuditLog } = require('../auditService');

describe('AuditLog Service', () => {
  test('writeAuditLog writes entity, user, timestamp, before, and after', async () => {
    const fakeModel = {
      create: jest.fn(async (doc) => ({ _id: 'log1', ...doc }))
    };

    const result = await writeAuditLog(
      {
        entityType: 'ProductionRun',
        entityId: 'run123',
        user: { id: 'u1', username: 'admin', role: 'ADMIN' },
        before: { notes: '' },
        after: { notes: 'QC verified' }
      },
      fakeModel
    );

    expect(fakeModel.create).toHaveBeenCalledTimes(1);
    const arg = fakeModel.create.mock.calls[0][0];
    expect(arg.entityType).toBe('ProductionRun');
    expect(arg.entityId).toBe('run123');
    expect(arg.user).toEqual({ id: 'u1', username: 'admin', role: 'ADMIN' });
    expect(arg.timestamp).toBeInstanceOf(Date);
    expect(arg.before).toEqual({ notes: '' });
    expect(arg.after).toEqual({ notes: 'QC verified' });
    expect(result._id).toBe('log1');
  });

  test('writeAuditLog throws if required fields are missing', async () => {
    const fakeModel = { create: jest.fn() };
    await expect(writeAuditLog({ entityType: 'Invoice' }, fakeModel)).rejects.toThrow();
    expect(fakeModel.create).not.toHaveBeenCalled();
  });
});

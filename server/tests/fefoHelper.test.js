const mongoose = require('mongoose');
const StockLedger = require('../models/StockLedger');
const { allocateFefoBatches } = require('../fefoHelper');

describe('allocateFefoBatches', () => {
  const validItemId = new mongoose.Types.ObjectId().toString();
  const asOfDate = new Date('2026-11-22T00:00:00.000Z');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockAggregateRows(rows) {
    const chain = {
      session: jest.fn().mockResolvedValue(rows),
      then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject)
    };
    jest.spyOn(StockLedger, 'aggregate').mockReturnValue(chain);
    return chain;
  }

  test('allocates non-expired batches in FEFO order and skips expired stock', async () => {
    mockAggregateRows([
      {
        _id: { batchNo: 'BATCH-EXP-OLD', expiryDate: new Date('2026-10-01T00:00:00.000Z') },
        availableBase: 500,
        firstSeenAt: new Date('2026-08-01T00:00:00.000Z')
      },
      {
        _id: { batchNo: 'BATCH-LATER', expiryDate: new Date('2026-12-31T00:00:00.000Z') },
        availableBase: 200,
        firstSeenAt: new Date('2026-09-10T00:00:00.000Z')
      },
      {
        _id: { batchNo: 'BATCH-SOONEST', expiryDate: new Date('2026-12-01T00:00:00.000Z') },
        availableBase: 150,
        firstSeenAt: new Date('2026-09-15T00:00:00.000Z')
      },
      {
        _id: { batchNo: 'BATCH-NO-EXP', expiryDate: null },
        availableBase: 300,
        firstSeenAt: new Date('2026-07-01T00:00:00.000Z')
      }
    ]);

    const allocations = await allocateFefoBatches({
      itemId: validItemId,
      requiredQtyBase: 400,
      asOfDate
    });

    expect(allocations).toEqual([
      {
        batchNo: 'BATCH-SOONEST',
        expiryDate: new Date('2026-12-01T00:00:00.000Z'),
        qtyBase: 150
      },
      {
        batchNo: 'BATCH-LATER',
        expiryDate: new Date('2026-12-31T00:00:00.000Z'),
        qtyBase: 200
      },
      {
        batchNo: 'BATCH-NO-EXP',
        expiryDate: null,
        qtyBase: 50
      }
    ]);
  });

  test('throws 409 shortfall error when only expired stock is available', async () => {
    mockAggregateRows([
      {
        _id: { batchNo: 'BATCH-EXPIRED-TODAY', expiryDate: asOfDate },
        availableBase: 1000,
        firstSeenAt: new Date('2026-09-01T00:00:00.000Z')
      }
    ]);

    await expect(
      allocateFefoBatches({
        itemId: validItemId,
        requiredQtyBase: 100,
        asOfDate
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      payload: {
        itemId: validItemId,
        requestedBase: 100,
        shortfallBase: 100
      }
    });
  });
});

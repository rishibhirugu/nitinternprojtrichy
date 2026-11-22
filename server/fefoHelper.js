const mongoose = require('mongoose');
const StockLedger = require('./models/StockLedger');

/**
 * Allocates requiredQtyBase from non-expired StockLedger batches using FEFO.
 * Does NOT write to StockLedger; returns planned batch slices so callers can
 * validate availability before creating DISPATCH or PRODUCTION_CONSUME entries.
 *
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.itemId
 * @param {number} params.requiredQtyBase - Positive integer in base units
 * @param {Date} [params.asOfDate=new Date()] - Reference time for expiry checks
 * @param {object|null} [params.session=null] - Optional Mongoose ClientSession
 * @returns {Promise<Array<{ batchNo: string|null, expiryDate: Date|null, qtyBase: number }>>}
 */
async function allocateFefoBatches({
  itemId,
  requiredQtyBase,
  asOfDate = new Date(),
  session = null
}) {
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    throw new Error(`Invalid item ID: ${itemId}`);
  }
  if (!Number.isInteger(requiredQtyBase) || requiredQtyBase <= 0) {
    throw new Error('requiredQtyBase must be a positive integer');
  }

  const cutoff = new Date(asOfDate);
  const objectId = new mongoose.Types.ObjectId(itemId);

  const agg = StockLedger.aggregate([
    { $match: { item: objectId } },
    {
      $group: {
        _id: {
          batchNo: { $ifNull: ['$batchNo', null] },
          expiryDate: { $ifNull: ['$expiryDate', null] }
        },
        availableBase: { $sum: '$qtyDelta' },
        firstSeenAt: { $min: '$createdAt' }
      }
    },
    { $match: { availableBase: { $gt: 0 } } }
  ]);

  if (session) agg.session(session);
  const rows = await agg;

  // Filter out expired batches and sort by FEFO:
  // 1) Earliest expiryDate first
  // 2) Batches with an expiryDate before batches with expiryDate === null
  // 3) Earliest firstSeenAt (FIFO tie-breaker), then batchNo
  const eligible = rows
    .filter((row) => {
      if (!row._id.expiryDate) return true;
      return new Date(row._id.expiryDate).getTime() > cutoff.getTime();
    })
    .sort((a, b) => {
      const expA = a._id.expiryDate ? new Date(a._id.expiryDate).getTime() : Infinity;
      const expB = b._id.expiryDate ? new Date(b._id.expiryDate).getTime() : Infinity;
      if (expA !== expB) return expA - expB;

      const timeA = a.firstSeenAt ? new Date(a.firstSeenAt).getTime() : 0;
      const timeB = b.firstSeenAt ? new Date(b.firstSeenAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;

      return String(a._id.batchNo || '').localeCompare(String(b._id.batchNo || ''));
    });

  let remaining = requiredQtyBase;
  const allocations = [];

  for (const row of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, row.availableBase);
    if (take > 0) {
      allocations.push({
        batchNo: row._id.batchNo,
        expiryDate: row._id.expiryDate ? new Date(row._id.expiryDate) : null,
        qtyBase: take
      });
      remaining -= take;
    }
  }

  if (remaining > 0) {
    const err = new Error(
      `Insufficient non-expired batch stock for item ${itemId}. Shortfall: ${remaining}`
    );
    err.statusCode = 409;
    err.payload = {
      itemId: String(itemId),
      requestedBase: requiredQtyBase,
      shortfallBase: remaining,
      allocatedBatches: allocations
    };
    throw err;
  }

  return allocations;
}

module.exports = { allocateFefoBatches };

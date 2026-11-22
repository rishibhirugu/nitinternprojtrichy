const mongoose = require('mongoose');
const BOM = require('./models/BOM');
const Item = require('./models/Item');
const StockLedger = require('./models/StockLedger');

function extractBatchAndExpiry(src = {}) {
  const rawBatch = src.batchNo ?? src.batch ?? null;
  const batchNo =
    rawBatch !== null && rawBatch !== undefined && String(rawBatch).trim() !== ""
      ? String(rawBatch).trim().toUpperCase()
      : null;
  const rawExpiry = src.expiryDate ?? src.expiry ?? null;
  let expiryDate = null;
  if (rawExpiry !== null && rawExpiry !== undefined && String(rawExpiry).trim() !== "") {
    const d = new Date(rawExpiry);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid expiryDate: ${rawExpiry}`);
    }
    expiryDate = d;
  }
  return { batchNo, expiryDate };
}

const ProductionRun = require('./models/ProductionRun');

async function postProductionRun(input) {
  const {
    bom: bomId,
    batches = 1,
    runDate,
    issues,
    goodOutputPcs,
    damagedPcs = 0,
    cartonsUsed = 0,
    createdBy = 'production@factory.test'
  } = input;

  if (!mongoose.Types.ObjectId.isValid(bomId)) {
    throw new Error(`Invalid BOM ID: ${bomId}`);
  }
  if (!Number.isInteger(batches) || batches <= 0) {
    throw new Error('batches must be a positive integer');
  }
  if (!Array.isArray(issues) || issues.length === 0) {
    throw new Error('issues must be a non-empty array');
  }
  if (!Number.isInteger(goodOutputPcs) || goodOutputPcs < 0) {
    throw new Error('goodOutputPcs must be a non-negative integer');
  }
  if (!Number.isInteger(damagedPcs) || damagedPcs < 0) {
    throw new Error('damagedPcs must be a non-negative integer');
  }
  if (!Number.isInteger(cartonsUsed) || cartonsUsed < 0) {
    throw new Error('cartonsUsed must be a non-negative integer');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Load BOM
    const bom = await BOM.findById(bomId).populate('lines.item').session(session);
    if (!bom) {
      throw new Error(`BOM not found: ${bomId}`);
    }

    // 2. Validate every issue item and qty BEFORE writing anything
    const validatedIssues = [];
    for (const line of issues) {
      if (!mongoose.Types.ObjectId.isValid(line.item)) {
        throw new Error(`Invalid item ID: ${line.item}`);
      }
      const item = await Item.findById(line.item).session(session);
      if (!item) {
        throw new Error(`Item not found: ${line.item}`);
      }
      if (!Number.isInteger(line.qtyBase) || line.qtyBase <= 0) {
        throw new Error(`qtyBase must be a positive integer for ${item.name}`);
      }
      validatedIssues.push({ item, qtyBase: line.qtyBase });
    }

    // Find packaging items from the BOM (pouch & carton)
    const pouchLine = bom.lines.find((l) => l.item.sku === 'PKG-POUCH');
    const cartonLine = bom.lines.find((l) => l.item.sku === 'PKG-CART');

    const runId = new mongoose.Types.ObjectId();

    // 3. Write PRODUCTION_ISSUE ledger rows for raw materials (negative qtyDelta)
    for (const { item, qtyBase } of validatedIssues) {
      await StockLedger.create([{
        item: item._id,
        qtyDelta: -qtyBase,
        eventType: 'PRODUCTION_ISSUE',
        sourceType: 'ProductionRun',
        sourceId: runId,
        note: `Production issue: ${item.name}`
      }], { session });
    }

    // 4. Write PRODUCTION_ISSUE rows for pouches (good + damaged) and cartons
    const totalPouches = goodOutputPcs + damagedPcs;
    if (pouchLine && totalPouches > 0) {
      await StockLedger.create([{
        item: pouchLine.item._id,
        qtyDelta: -totalPouches,
        eventType: 'PRODUCTION_ISSUE',
        sourceType: 'ProductionRun',
        sourceId: runId,
        note: `Pouches used (${goodOutputPcs} good + ${damagedPcs} damaged)`
      }], { session });
    }

    if (cartonLine && cartonsUsed > 0) {
      await StockLedger.create([{
        item: cartonLine.item._id,
        qtyDelta: -cartonsUsed,
        eventType: 'PRODUCTION_ISSUE',
        sourceType: 'ProductionRun',
        sourceId: runId,
        note: `Cartons used (${cartonsUsed})`
      }], { session });
    }

    // 5. Write PRODUCTION_OUTPUT row for finished good (positive qtyDelta)
    if (goodOutputPcs > 0) {
      await StockLedger.create([{
        item: bom.finishedGood,
        qtyDelta: goodOutputPcs,
        eventType: 'PRODUCTION_OUTPUT',
        sourceType: 'ProductionRun',
        sourceId: runId,
        note: `Production output (${goodOutputPcs} pcs)`
      }], { session });
    }

    // 6. Save ProductionRun document with the same _id as sourceId
    const [run] = await ProductionRun.create([{
      _id: runId,
      bom: bom._id,
      batches,
      runDate: runDate || new Date(),
      issues: validatedIssues.map(({ item, qtyBase }) => ({ item: item._id, qtyBase })),
      goodOutputPcs,
      damagedPcs,
      cartonsUsed,
      createdBy
    }], { session });

    // 7. Commit
    await session.commitTransaction();
    return run;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

module.exports = { postProductionRun };
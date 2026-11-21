require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Item = require('./models/Item');
const StockLedger = require('./models/StockLedger');
const BOM = require('./models/BOM');
const Purchase = require('./models/Purchase');

const app = express();
app.use(express.json());

// GET /items — list all master items
app.get('/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ category: 1, sku: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stock — current balances summed from StockLedger
app.get('/stock', async (req, res) => {
  try {
    const balances = await StockLedger.aggregate([
      { $group: { _id: '$item', balanceBase: { $sum: '$qtyDelta' } } },
      { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'item' } },
      { $unwind: '$item' },
      {
        $project: {
          _id: 0,
          itemId: '$item._id',
          sku: '$item.sku',
          name: '$item.name',
          category: '$item.category',
          balanceBase: 1,
          baseUnit: '$item.baseUnit',
          balanceDisplay: { $divide: ['$balanceBase', '$item.displayFactor'] },
          displayUnit: '$item.displayUnit'
        }
      },
      { $sort: { category: 1, sku: 1 } }
    ]);
    res.json(balances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /boms/:id — read recipe back with populated items
app.get('/boms/:id', async (req, res) => {
  try {
    const bom = await BOM.findById(req.params.id)
      .populate('finishedGood', 'sku name displayUnit')
      .populate('lines.item', 'sku name baseUnit displayUnit displayFactor');

    if (!bom) return res.status(404).json({ error: 'BOM not found' });
    res.json(bom);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /purchases — list all saved purchases
app.get('/purchases', async (req, res) => {
  try {
    const purchases = await Purchase.find().sort({ createdAt: -1 });
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /purchases — transactional purchase + PURCHASE stock ledger entries
app.post('/purchases', async (req, res) => {
  const { supplierName, purchaseDate, lines } = req.body;
  if (!supplierName || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'supplierName and non-empty lines are required' });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const purchaseId = new mongoose.Types.ObjectId();
    const computedLines = [];
    let totalPaisa = 0;

    for (const line of lines) {
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
      if (!Number.isInteger(line.ratePerDisplayUnitPaisa) || line.ratePerDisplayUnitPaisa < 0) {
        throw new Error(`ratePerDisplayUnitPaisa must be a non-negative integer for ${item.name}`);
      }

      // Rule: qtyBase * ratePerDisplayUnitPaisa / displayFactor, rounded half-up to nearest paisa
      const lineTotalPaisa = Math.round((line.qtyBase * line.ratePerDisplayUnitPaisa) / item.displayFactor);
      totalPaisa += lineTotalPaisa;

      computedLines.push({
        item: item._id,
        qtyBase: line.qtyBase,
        ratePerDisplayUnitPaisa: line.ratePerDisplayUnitPaisa,
        lineTotalPaisa
      });

      // Write ledger movement inside the transaction
      await StockLedger.create([{
        item: item._id,
        qtyDelta: line.qtyBase,
        eventType: 'PURCHASE',
        sourceType: 'Purchase',
        sourceId: purchaseId,
        note: `Purchase from ${supplierName}`
      }], { session });
    }

    const [purchase] = await Purchase.create([{
      _id: purchaseId,
      supplierName,
      purchaseDate: purchaseDate || new Date(),
      lines: computedLines,
      totalPaisa
    }], { session });

    await session.commitTransaction();
    res.status(201).json(purchase);
  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

const PORT = process.env.PORT || 4000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
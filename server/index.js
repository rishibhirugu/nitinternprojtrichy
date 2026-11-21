require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const connectDB = require('./db');
const Item = require('./models/Item');
const StockLedger = require('./models/StockLedger');
const BOM = require('./models/BOM');
const Purchase = require('./models/Purchase');
const ProductionRun = require('./models/ProductionRun');
const Customer = require('./models/Customer');
const { postProductionRun } = require('./productionService');
const { variancePct, flag } = require('./variance');
const {
  createOrder,
  approveOrder,
  invoiceOrder,
  dispatchOrder,
  createCreditNote
} = require('./orderService');
const {
  recordPayment,
  getInvoiceOutstanding,
  getCustomerOutstanding
} = require('./paymentService');
const { generateReport, toCsv } = require('./reportService');

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

// POST /production-runs — transactional production run + ledger entries
app.post('/production-runs', async (req, res) => {
  try {
    const run = await postProductionRun(req.body);
    res.status(201).json(run);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /production-runs/:id/variance — planned vs actual table with flags
app.get('/production-runs/:id/variance', async (req, res) => {
  try {
    const run = await ProductionRun.findById(req.params.id)
      .populate({
        path: 'bom',
        populate: [
          { path: 'finishedGood', select: 'sku name baseUnit displayUnit displayFactor' },
          { path: 'lines.item', select: 'sku name category baseUnit displayUnit displayFactor' }
        ]
      })
      .populate('issues.item', 'sku name baseUnit displayUnit displayFactor');

    if (!run) return res.status(404).json({ error: 'ProductionRun not found' });

    const plannedOutputPcs = run.bom.outputQtyPcs * run.batches;
    const yieldPct = variancePct(run.goodOutputPcs, plannedOutputPcs);

    const issueMap = new Map(
      run.issues.map((line) => [line.item._id.toString(), line.qtyBase])
    );

    const materials = [];
    let packaging = {};

    for (const bomLine of run.bom.lines) {
      const item = bomLine.item;
      const plannedQtyBase = bomLine.qtyBase * run.batches;

      if (item.sku === 'PKG-POUCH') {
        const totalUsed = run.goodOutputPcs + run.damagedPcs;
        packaging.pouches = {
          sku: item.sku,
          name: item.name,
          plannedQtyBase,
          goodUsed: run.goodOutputPcs,
          damagedPcs: run.damagedPcs,
          totalIssued: totalUsed,
          damageNote: `${run.damagedPcs} damaged pouches reported separately from yield loss`
        };
        continue;
      }

      if (item.sku === 'PKG-CART') {
        packaging.cartons = {
          sku: item.sku,
          name: item.name,
          plannedQtyBase,
          actualQtyBase: run.cartonsUsed
        };
        continue;
      }

      const actualQtyBase = issueMap.get(item._id.toString()) || 0;
      const pct = variancePct(actualQtyBase, plannedQtyBase);

      materials.push({
        sku: item.sku,
        name: item.name,
        baseUnit: item.baseUnit,
        plannedQtyBase,
        actualQtyBase,
        variancePct: Number(pct.toFixed(2)),
        flagged: flag(pct)
      });
    }

    res.json({
      productionRunId: run._id,
      finishedGood: run.bom.finishedGood.name,
      batches: run.batches,
      yield: {
        plannedOutputPcs,
        actualOutputPcs: run.goodOutputPcs,
        variancePct: Number(yieldPct.toFixed(2)),
        flagged: flag(yieldPct)
      },
      materials,
      packaging
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Day 4: Customers, Orders, GST Invoices, Dispatch, Credit Notes ---

app.post('/customers', async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    res.status(201).json(customer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.find().lean();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/orders', async (req, res) => {
  try {
    const order = await createOrder(req.body);
    res.status(201).json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/orders/:id/approve', async (req, res) => {
  try {
    const order = await approveOrder(req.params.id);
    res.json(order);
  } catch (err) {
    if (err.payload) {
      return res.status(err.statusCode || 409).json(err.payload);
    }
    res.status(400).json({ error: err.message });
  }
});

app.post('/orders/:id/invoice', async (req, res) => {
  try {
    const invoice = await invoiceOrder(req.params.id);
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/orders/:id/dispatch', async (req, res) => {
  try {
    const order = await dispatchOrder(req.params.id);
    res.json(order);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/invoices/:id/credit-note', async (req, res) => {
  try {
    const cn = await createCreditNote(req.params.id, req.body?.reason);
    res.status(201).json(cn);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Day 5: Payments & Outstanding ---

app.post('/payments', async (req, res) => {
  try {
    const payment = await recordPayment(req.body);
    res.status(201).json(payment);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.get('/invoices/:id/outstanding', async (req, res) => {
  try {
    const data = await getInvoiceOutstanding(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/customers/:id/outstanding', async (req, res) => {
  try {
    const data = await getCustomerOutstanding(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- Day 5: Reports & CSV Export ---

app.get('/reports/:name', async (req, res) => {
  try {
    const { headers, rows } = await generateReport(req.params.name, req.query);
    if (req.query.format === 'csv') {
      const csv = toCsv(headers, rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}.csv"`);
      return res.send(csv);
    }
    res.json({ report: req.params.name, count: rows.length, rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
const mongoose = require('mongoose');
const { Invoice } = require('./models/Invoice');
const CreditNote = require('./models/CreditNote');
const Payment = require('./models/Payment');
const Customer = require('./models/Customer');
const Item = require('./models/Item');
const StockLedger = require('./models/StockLedger');
const ProductionRun = require('./models/ProductionRun');
const { variancePct, flag } = require('./variance');

function buildDateFilter(from, to, field = 'createdAt') {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    if (to.length === 10) end.setUTCHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return Object.keys(range).length ? { [field]: range } : {};
}

function toCsv(headers, rows) {
  const escape = (val) => {
    const s = val === null || val === undefined ? '' : String(val);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))
  ];
  return '\uFEFF' + lines.join('\r\n'); // UTF-8 BOM + CRLF for Excel
}

async function getSalesRegister({ from, to }) {
  const filter = buildDateFilter(from, to, 'createdAt');
  const invoices = await Invoice.find(filter)
    .populate('customer', 'name state gstin')
    .sort({ createdAt: 1 })
    .lean();

  const headers = [
    'invoiceNo', 'date', 'customer', 'placeOfSupply', 'gstin',
    'taxablePaisa', 'cgstPaisa', 'sgstPaisa', 'igstPaisa', 'totalPaisa'
  ];
  const rows = invoices.map((inv) => ({
    invoiceNo: inv.invoiceNo,
    date: new Date(inv.createdAt).toISOString().slice(0, 10),
    customer: inv.customer?.name || '',
    placeOfSupply: inv.placeOfSupply,
    gstin: inv.customer?.gstin || '',
    taxablePaisa: inv.taxablePaisa,
    cgstPaisa: inv.cgstPaisa,
    sgstPaisa: inv.sgstPaisa,
    igstPaisa: inv.igstPaisa,
    totalPaisa: inv.totalPaisa
  }));
  return { headers, rows };
}

async function getStockSummary({ from, to }) {
  const match = buildDateFilter(from, to, 'createdAt');
  const pipeline = [];
  if (Object.keys(match).length) pipeline.push({ $match: match });
  pipeline.push(
    { $group: { _id: '$item', balanceBase: { $sum: '$qtyDelta' } } },
    { $lookup: { from: 'items', localField: '_id', foreignField: '_id', as: 'item' } },
    { $unwind: '$item' },
    { $sort: { 'item.category': 1, 'item.sku': 1 } }
  );

  const agg = await StockLedger.aggregate(pipeline);
  const headers = ['sku', 'name', 'category', 'balanceBase', 'baseUnit', 'balanceDisplay', 'displayUnit'];
  const rows = agg.map((r) => ({
    sku: r.item.sku,
    name: r.item.name,
    category: r.item.category,
    balanceBase: r.balanceBase,
    baseUnit: r.item.baseUnit,
    balanceDisplay: r.balanceBase / r.item.displayFactor,
    displayUnit: r.item.displayUnit
  }));
  return { headers, rows };
}

async function getStockLedger({ from, to, itemId, sku }) {
  const filter = buildDateFilter(from, to, 'createdAt');
  if (itemId && mongoose.Types.ObjectId.isValid(itemId)) {
    filter.item = new mongoose.Types.ObjectId(itemId);
  } else if (sku) {
    const item = await Item.findOne({ sku }).lean();
    if (!item) throw new Error(`Item not found for SKU: ${sku}`);
    filter.item = item._id;
  }

  const entries = await StockLedger.find(filter)
    .populate('item', 'sku name baseUnit')
    .sort({ createdAt: 1 })
    .lean();

  const headers = ['date', 'sku', 'itemName', 'eventType', 'qtyDelta', 'baseUnit', 'sourceType', 'note'];
  const rows = entries.map((e) => ({
    date: new Date(e.createdAt).toISOString(),
    sku: e.item?.sku || '',
    itemName: e.item?.name || '',
    eventType: e.eventType,
    qtyDelta: e.qtyDelta,
    baseUnit: e.item?.baseUnit || '',
    sourceType: e.sourceType || '',
    note: e.note || ''
  }));
  return { headers, rows };
}

async function getProductionVariance({ from, to }) {
  const filter = buildDateFilter(from, to, 'createdAt');
  const runs = await ProductionRun.find(filter)
    .populate({ path: 'bom', populate: { path: 'finishedGood', select: 'sku name' } })
    .sort({ createdAt: 1 })
    .lean();

  const headers = ['runId', 'date', 'finishedGood', 'batches', 'plannedOutputPcs', 'goodOutputPcs', 'damagedPcs', 'yieldVariancePct', 'flagged'];
  const rows = runs.map((run) => {
    const planned = run.bom.outputQtyPcs * run.batches;
    const pct = variancePct(run.goodOutputPcs, planned);
    return {
      runId: run._id.toString(),
      date: new Date(run.createdAt).toISOString().slice(0, 10),
      finishedGood: run.bom.finishedGood?.name || '',
      batches: run.batches,
      plannedOutputPcs: planned,
      goodOutputPcs: run.goodOutputPcs,
      damagedPcs: run.damagedPcs,
      yieldVariancePct: Number(pct.toFixed(2)),
      flagged: flag(pct)
    };
  });
  return { headers, rows };
}

async function getOutstandingReport({ from, to }) {
  const dateFilter = buildDateFilter(from, to, 'createdAt');
  const customers = await Customer.find().sort({ name: 1 }).lean();

  const headers = ['customerId', 'customerName', 'state', 'invoicedPaisa', 'creditNotesPaisa', 'paidPaisa', 'outstandingPaisa'];
  const rows = [];

  for (const c of customers) {
    const [inv] = await Invoice.aggregate([
      { $match: { customer: c._id, ...dateFilter } },
      { $group: { _id: null, total: { $sum: '$totalPaisa' } } }
    ]);
    const [cn] = await CreditNote.aggregate([
      { $match: { customer: c._id, ...dateFilter } },
      { $group: { _id: null, total: { $sum: '$totalPaisa' } } }
    ]);
    const [pay] = await Payment.aggregate([
      { $match: { customer: c._id, ...dateFilter } },
      { $group: { _id: null, total: { $sum: '$amountPaisa' } } }
    ]);

    const invoicedPaisa = inv ? inv.total : 0;
    const creditNotesPaisa = cn ? cn.total : 0;
    const paidPaisa = pay ? pay.total : 0;

    rows.push({
      customerId: c._id.toString(),
      customerName: c.name,
      state: c.state,
      invoicedPaisa,
      creditNotesPaisa,
      paidPaisa,
      outstandingPaisa: invoicedPaisa + creditNotesPaisa - paidPaisa
    });
  }
  return { headers, rows };
}

async function generateReport(name, query) {
  switch (name) {
    case 'sales-register':      return getSalesRegister(query);
    case 'stock-summary':       return getStockSummary(query);
    case 'stock-ledger':        return getStockLedger(query);
    case 'production-variance': return getProductionVariance(query);
    case 'outstanding':         return getOutstandingReport(query);
      case 'ageing': {
        const invoices = await Invoice.find().populate('customer').lean();
        const payments = await Payment.find().lean();
        const paidByInv = new Map();
        for (const pay of payments) {
          const k = String(pay.invoice);
          paidByInv.set(k, (paidByInv.get(k) || 0) + Number(pay.amountPaisa || 0));
        }
        const now = Date.now();
        const rows = invoices.map((inv) => {
          const total = Number(inv.grandTotalPaisa ?? inv.totalPaisa ?? 0);
          const paid = paidByInv.get(String(inv._id)) || 0;
          const duePaisa = Math.max(0, total - paid);
          const ageDays = Math.max(0, Math.floor((now - new Date(inv.createdAt || now).getTime()) / 86400000));
          let bucket = '0-30';
          if (ageDays > 90) bucket = '90+';
          else if (ageDays > 60) bucket = '61-90';
          else if (ageDays > 30) bucket = '31-60';
          return {
            invoiceId: inv._id,
            invoiceNumber: inv.invoiceNumber || inv.invoiceNo || inv.code || String(inv._id),
            customer: inv.customer?.name || String(inv.customer || ''),
            duePaisa,
            ageDays,
            bucket
          };
        });
        return { report: 'ageing', count: rows.length, rows };
      }
    default:
      throw new Error(`Unknown report: ${name}. Valid: sales-register, stock-summary, stock-ledger, production-variance, outstanding, ageing, margin, purchase-register`);
  }
}

module.exports = { generateReport, toCsv };
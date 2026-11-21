const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "INV-TN-2026-27"
  seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

const invoiceLineSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  qtyBase: { type: Number, required: true },
  ratePaisa: { type: Number, required: true },
  taxablePaisa: { type: Number, required: true },
  cgstPaisa: { type: Number, default: 0 },
  sgstPaisa: { type: Number, default: 0 },
  igstPaisa: { type: Number, default: 0 },
  lineTotalPaisa: { type: Number, required: true }
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true, unique: true },
  financialYear: { type: String, required: true },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  placeOfSupply: { type: String, required: true },
  lines: { type: [invoiceLineSchema], required: true },
  taxablePaisa: { type: Number, required: true },
  cgstPaisa: { type: Number, default: 0 },
  sgstPaisa: { type: Number, default: 0 },
  igstPaisa: { type: Number, default: 0 },
  totalPaisa: { type: Number, required: true }
}, { timestamps: true });

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = { Invoice, Counter };
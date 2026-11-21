const mongoose = require('mongoose');

const issueLineSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  qtyBase: { type: Number, required: true, min: 1 }
}, { _id: false });

const productionRunSchema = new mongoose.Schema({
  bom: { type: mongoose.Schema.Types.ObjectId, ref: 'BOM', required: true },
  batches: { type: Number, required: true, default: 1, min: 1 },
  runDate: { type: Date, default: Date.now },
  issues: { type: [issueLineSchema], required: true },
  goodOutputPcs: { type: Number, required: true, min: 0 },
  damagedPcs: { type: Number, required: true, default: 0, min: 0 },
  cartonsUsed: { type: Number, required: true, default: 0, min: 0 },
  createdBy: { type: String, default: 'production@factory.test' },
  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('ProductionRun', productionRunSchema);
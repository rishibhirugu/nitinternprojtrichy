const mongoose = require('mongoose');

const bomLineSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  qtyBase: { type: Number, required: true, min: 1 } // Integer in item's baseUnit
}, { _id: false });

const bomSchema = new mongoose.Schema({
  finishedGood: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, unique: true },
  outputQtyPcs: { type: Number, required: true, min: 1 }, // 200 packets per batch
  lines: [bomLineSchema]
}, { timestamps: true });

module.exports = mongoose.model('BOM', bomSchema);
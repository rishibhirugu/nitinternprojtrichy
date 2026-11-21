 const mongoose = require('mongoose');

const stockLedgerSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
  qtyDelta: { type: Number, required: true }, // Integer in item's baseUnit (+in, -out)
  eventType: {
    type: String,
    enum: ['OPENING_STOCK', 'PURCHASE', 'PRODUCTION_ISSUE', 'PRODUCTION_OUTPUT', 'DISPATCH', 'ADJUSTMENT'],
    required: true
  },
  sourceType: { type: String, default: null }, // e.g., 'Purchase', 'ProductionRun'
  sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  note: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('StockLedger', stockLedgerSchema);
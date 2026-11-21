const mongoose = require('mongoose');

const purchaseLineSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  qtyBase: { type: Number, required: true, min: 1 },                  // e.g., 60000 (60 kg)
  ratePerDisplayUnitPaisa: { type: Number, required: true, min: 0 },  // e.g., 4500 (₹45/kg)
  lineTotalPaisa: { type: Number, required: true, min: 0 }            // e.g., 270000 (₹2,700)
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
  supplierName: { type: String, required: true },
  purchaseDate: { type: Date, default: Date.now },
  lines: {
    type: [purchaseLineSchema],
    validate: [(arr) => arr.length > 0, 'Purchase must have at least one line']
  },
  totalPaisa: { type: Number, required: true, min: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Purchase', purchaseSchema);
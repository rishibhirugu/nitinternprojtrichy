const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  sku: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: {
    type: String,
    enum: ['RAW_MATERIAL', 'PACKAGING', 'FINISHED_GOOD'],
    required: true
  },
  baseUnit: {
    type: String,
    enum: ['g', 'ml', 'pcs'],
    required: true
  },
  displayUnit: { type: String, required: true },     // e.g., 'kg', 'L', 'pcs', 'packets'
  displayFactor: { type: Number, required: true }    // e.g., 1000 for kg->g, 1 for pcs
}, { timestamps: true });

module.exports = mongoose.model('Item', itemSchema);
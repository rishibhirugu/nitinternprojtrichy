const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  state: { type: String, required: true, trim: true },
  gstin: { type: String, required: true, trim: true, uppercase: true }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
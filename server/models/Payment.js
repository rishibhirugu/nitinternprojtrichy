const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  amountPaisa: {
    type: Number,
    required: true,
    validate: {
      validator: (v) => Number.isInteger(v) && v > 0,
      message: 'amountPaisa must be a positive integer'
    }
  },
  paymentDate: { type: Date, default: Date.now },
  mode: {
    type: String,
    enum: ['CASH', 'UPI', 'NEFT', 'RTGS', 'CHEQUE', 'BANK_TRANSFER'],
    required: true
  },
  referenceNo: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
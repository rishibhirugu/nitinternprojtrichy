const mongoose = require('mongoose');

const orderLineSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  qtyBase: { type: Number, required: true, min: 1 },
  ratePaisa: { type: Number, required: true, min: 0 },
  lineTotalPaisa: { type: Number, required: true, min: 0 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNo: { type: String, required: true, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  createdBy: { type: String, default: 'salesman@factory.test' },
  status: {
    type: String,
    enum: ['SUBMITTED', 'APPROVED', 'INVOICED', 'DISPATCHED', 'CANCELLED'],
    default: 'SUBMITTED'
  },
  lines: { type: [orderLineSchema], required: true },
  totalPaisa: { type: Number, required: true, min: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
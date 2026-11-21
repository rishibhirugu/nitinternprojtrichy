const mongoose = require('mongoose');

const creditNoteSchema = new mongoose.Schema({
  creditNoteNo: { type: String, required: true, unique: true },
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  reason: { type: String, default: 'Sales return / billing reversal' },
  taxablePaisa: { type: Number, required: true },
  cgstPaisa: { type: Number, default: 0 },
  sgstPaisa: { type: Number, default: 0 },
  igstPaisa: { type: Number, default: 0 },
  totalPaisa: { type: Number, required: true }
}, { timestamps: true });

module.exports = mongoose.model('CreditNote', creditNoteSchema);
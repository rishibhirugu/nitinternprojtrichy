const mongoose = require('mongoose');

const StockLedgerSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true
    },
    qtyDelta: {
      type: Number,
      required: true,
      validate: {
        validator: (val) => Number.isInteger(val) && val !== 0,
        message: 'qtyDelta must be a non-zero integer in base units'
      }
    },
    batchNo: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      validate: {
        validator: function (val) {
          if (val !== null && val !== undefined && String(val).trim() === '') {
            return false;
          }
          if (this.expiryDate && (!val || String(val).trim() === '')) {
            return false;
          }
          return true;
        },
        message: 'batchNo is required when expiryDate is set and cannot be blank'
      }
    },
    expiryDate: {
      type: Date,
      default: null,
      validate: {
        validator: (val) => val === null || val === undefined || !Number.isNaN(new Date(val).getTime()),
        message: 'expiryDate must be a valid date or null'
      }
    },
    eventType: {
      type: String,
      required: true
    },
    sourceType: {
      type: String,
      default: null
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    note: {
      type: String,
      default: ''
    }
  },
  { timestamps: true, strict: false }
);

StockLedgerSchema.index({ item: 1, expiryDate: 1, createdAt: 1 });

module.exports = mongoose.models.StockLedger || mongoose.model('StockLedger', StockLedgerSchema);

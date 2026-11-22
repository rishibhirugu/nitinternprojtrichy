const mongoose = require('mongoose');

const HSN_PATTERN = /^([0-9]{4}|[0-9]{6}|[0-9]{8})$/;

const ItemSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      trim: true,
      uppercase: true
    },
    name: {
      type: String,
      trim: true
    },
    baseUnit: {
      type: String,
      trim: true,
      default: 'pcs'
    },
    ratePaisa: {
      type: Number,
      default: 0
    },
    hsnCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
      validate: {
        validator: (val) => val === '' || HSN_PATTERN.test(val),
        message: 'hsnCode must be empty or a 4, 6, or 8 digit HSN/SAC code'
      }
    },
    trackBatchExpiry: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true, strict: false }
);

module.exports = mongoose.models.Item || mongoose.model('Item', ItemSchema);

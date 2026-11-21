require('dotenv').config();
const express = require('express');
const connectDB = require('./db');
const StockLedger = require('./models/StockLedger');

const app = express();
app.use(express.json());

app.get('/stock', async (req, res) => {
  try {
    const balances = await StockLedger.aggregate([
      {
        $group: {
          _id: '$item',
          balanceBase: { $sum: '$qtyDelta' }
        }
      },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: '_id',
          as: 'item'
        }
      },
      { $unwind: '$item' },
      {
        $project: {
          _id: 0,
          sku: '$item.sku',
          name: '$item.name',
          category: '$item.category',
          balanceBase: 1,
          baseUnit: '$item.baseUnit',
          balanceDisplay: { $divide: ['$balanceBase', '$item.displayFactor'] },
          displayUnit: '$item.displayUnit'
        }
      },
      { $sort: { category: 1, sku: 1 } }
    ]);

    res.json(balances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
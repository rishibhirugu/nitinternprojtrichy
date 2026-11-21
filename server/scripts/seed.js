require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../db');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');

const ITEMS = [
  { sku: 'RM-FLOUR',  name: 'Flour',              category: 'RAW_MATERIAL',  baseUnit: 'g',   displayUnit: 'kg',      displayFactor: 1000, openingQty: 100000 }, // 100 kg
  { sku: 'RM-OIL',    name: 'Cooking oil',        category: 'RAW_MATERIAL',  baseUnit: 'ml',  displayUnit: 'L',       displayFactor: 1000, openingQty: 30000  }, // 30 L
  { sku: 'RM-SPICE',  name: 'Salt and spice mix', category: 'RAW_MATERIAL',  baseUnit: 'g',   displayUnit: 'kg',      displayFactor: 1000, openingQty: 5000   }, // 5 kg
  { sku: 'PKG-POUCH', name: '200 g pouch',        category: 'PACKAGING',     baseUnit: 'pcs', displayUnit: 'pcs',     displayFactor: 1,    openingQty: 500    },
  { sku: 'PKG-CART',  name: 'Carton (20 packs)',  category: 'PACKAGING',     baseUnit: 'pcs', displayUnit: 'pcs',     displayFactor: 1,    openingQty: 30     },
  { sku: 'FG-MUR200', name: 'Murukku 200 g',      category: 'FINISHED_GOOD', baseUnit: 'pcs', displayUnit: 'packets', displayFactor: 1,    openingQty: 50     }
];

async function seed() {
  await connectDB();

  await StockLedger.deleteMany({});
  await Item.deleteMany({});

  for (const data of ITEMS) {
    const { openingQty, ...itemFields } = data;
    const item = await Item.create(itemFields);

    await StockLedger.create({
      item: item._id,
      qtyDelta: openingQty,
      eventType: 'OPENING_STOCK',
      note: 'Initial benchmark opening stock'
    });
  }

  console.log('Seeded 6 items and opening stock ledger entries.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
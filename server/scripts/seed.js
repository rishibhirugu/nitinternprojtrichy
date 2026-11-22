require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../db');
const Item = require('../models/Item');
const StockLedger = require('../models/StockLedger');
const BOM = require('../models/BOM');
const Purchase = require('../models/Purchase');
const ProductionRun = require('../models/ProductionRun');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { Invoice, Counter } = require('../models/Invoice');
const CreditNote = require('../models/CreditNote');

const ITEMS = [
  { sku: 'RM-FLOUR',  name: 'Flour',              category: 'RAW_MATERIAL',  baseUnit: 'g',   displayUnit: 'kg',      displayFactor: 1000, openingQty: 100000 },
  { sku: 'RM-OIL',    name: 'Cooking oil',        category: 'RAW_MATERIAL',  baseUnit: 'ml',  displayUnit: 'L',       displayFactor: 1000, openingQty: 30000  },
  { sku: 'RM-SPICE',  name: 'Salt and spice mix', category: 'RAW_MATERIAL',  baseUnit: 'g',   displayUnit: 'kg',      displayFactor: 1000, openingQty: 5000   },
  { sku: 'PKG-POUCH', name: '200 g pouch',        category: 'PACKAGING',     baseUnit: 'pcs', displayUnit: 'pcs',     displayFactor: 1,    openingQty: 500    },
  { sku: 'PKG-CART',  name: 'Carton (20 packs)',  category: 'PACKAGING',     baseUnit: 'pcs', displayUnit: 'pcs',     displayFactor: 1,    openingQty: 30     },
  { sku: 'FG-MUR200', name: 'Murukku 200 g',      category: 'FINISHED_GOOD', baseUnit: 'pcs', displayUnit: 'packets', displayFactor: 1,    openingQty: 50, hsnCode: '19059020' }
];

async function seed() {
  await connectDB();

  await Promise.all([
    StockLedger.deleteMany({}),
    Purchase.deleteMany({}),
    ProductionRun.deleteMany({}),
    BOM.deleteMany({}),
    Item.deleteMany({}),
    Customer.deleteMany({}),
    Order.deleteMany({}),
    Invoice.deleteMany({}),
    Counter.deleteMany({}),
    CreditNote.deleteMany({})
  ]);

  const itemMap = {};
  for (const data of ITEMS) {
    const { openingQty, ...itemFields } = data;
    const item = await Item.create(itemFields);
    itemMap[item.sku] = item;

    await StockLedger.create({
      item: item._id,
      qtyDelta: openingQty,
      eventType: 'OPENING_STOCK',
      note: 'Initial benchmark opening stock'
    });
  }

  const bom = await BOM.create({
    finishedGood: itemMap['FG-MUR200']._id,
    outputQtyPcs: 200,
    lines: [
      { item: itemMap['RM-FLOUR']._id,  qtyBase: 40000 }, // 40 kg
      { item: itemMap['RM-OIL']._id,    qtyBase: 10000 }, // 10 L
      { item: itemMap['RM-SPICE']._id,  qtyBase: 1200  }, // 1.2 kg
      { item: itemMap['PKG-POUCH']._id, qtyBase: 200   }, // 200 pcs
      { item: itemMap['PKG-CART']._id,  qtyBase: 10    }  // 10 pcs
    ]
  });

  console.log('Seeded 6 items, opening stock, and Murukku 200 g BOM.');
  console.log('Flour Item ID:', itemMap['RM-FLOUR']._id.toString());
  console.log('Murukku BOM ID:', bom._id.toString());
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
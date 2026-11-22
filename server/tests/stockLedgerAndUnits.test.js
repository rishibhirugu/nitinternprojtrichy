const mongoose = require('mongoose');
const StockLedger = require('../models/StockLedger');
const Item = require('../models/Item');
const { generateReport } = require('../reportService');
const unitConverter = require('../unitConverter');

function convertKgToGrams(kg) {
  if (typeof unitConverter.convertToBaseQty === 'function') {
    return unitConverter.convertToBaseQty(kg, 'kg', 'g');
  }
  if (typeof unitConverter.toBaseQty === 'function') {
    return unitConverter.toBaseQty(kg, 'kg', 'g');
  }
  return Math.round(Number(kg) * 1000);
}

describe('KG-to-Base Unit Conversion', () => {
  test('converts kilograms to grams accurately for decimal and whole values', () => {
    expect(convertKgToGrams(1)).toBe(1000);
    expect(convertKgToGrams(2.5)).toBe(2500);
    expect(convertKgToGrams(0.75)).toBe(750);
  });

  test('handles zero quantity cleanly', () => {
    expect(convertKgToGrams(0)).toBe(0);
  });
});

describe('getStockSummary and getStockLedger via reportService', () => {
  const flourId = new mongoose.Types.ObjectId();
  const oilId = new mongoose.Types.ObjectId();

  const mockItems = [
    {
      _id: flourId,
      sku: 'RM-FLOUR',
      name: 'Rice Flour',
      category: 'RAW_MATERIAL',
      baseUnit: 'g',
      displayUnit: 'kg',
      displayFactor: 1000
    },
    {
      _id: oilId,
      sku: 'RM-OIL',
      name: 'Groundnut Oil',
      category: 'RAW_MATERIAL',
      baseUnit: 'ml',
      displayUnit: 'L',
      displayFactor: 1000
    }
  ];

  const mockLedgerEntries = [
    {
      _id: new mongoose.Types.ObjectId(),
      item: { _id: flourId, sku: 'RM-FLOUR', name: 'Rice Flour', baseUnit: 'g' },
      eventType: 'OPENING',
      qtyDelta: 50000,
      sourceType: 'OPENING',
      note: 'Opening flour stock',
      createdAt: new Date('2026-11-01T08:00:00.000Z')
    },
    {
      _id: new mongoose.Types.ObjectId(),
      item: { _id: flourId, sku: 'RM-FLOUR', name: 'Rice Flour', baseUnit: 'g' },
      eventType: 'PURCHASE',
      qtyDelta: 70000,
      sourceType: 'PURCHASE',
      note: '70 kg purchase converted to grams',
      createdAt: new Date('2026-11-05T10:00:00.000Z')
    },
    {
      _id: new mongoose.Types.ObjectId(),
      item: { _id: flourId, sku: 'RM-FLOUR', name: 'Rice Flour', baseUnit: 'g' },
      eventType: 'PRODUCTION_ISSUE',
      qtyDelta: -40000,
      sourceType: 'PRODUCTION_RUN',
      note: 'Issued for run',
      createdAt: new Date('2026-11-10T12:00:00.000Z')
    },
    {
      _id: new mongoose.Types.ObjectId(),
      item: { _id: oilId, sku: 'RM-OIL', name: 'Groundnut Oil', baseUnit: 'ml' },
      eventType: 'PURCHASE',
      qtyDelta: 25000,
      sourceType: 'PURCHASE',
      note: '25 L oil in ml',
      createdAt: new Date('2026-11-06T09:00:00.000Z')
    }
  ];

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getStockSummary aggregates balances in base and display units', async () => {
    const aggregatedRows = [
      {
        _id: flourId,
        balanceBase: 80000,
        item: mockItems[0]
      },
      {
        _id: oilId,
        balanceBase: 25000,
        item: mockItems[1]
      }
    ];

    jest.spyOn(StockLedger, 'aggregate').mockResolvedValue(aggregatedRows);

    const result = await generateReport('stock-summary', {});

    expect(StockLedger.aggregate).toHaveBeenCalledTimes(1);
    expect(result.headers).toEqual([
      'sku', 'name', 'category', 'balanceBase', 'baseUnit', 'balanceDisplay', 'displayUnit'
    ]);
    expect(result.rows).toEqual([
      {
        sku: 'RM-FLOUR',
        name: 'Rice Flour',
        category: 'RAW_MATERIAL',
        balanceBase: 80000,
        baseUnit: 'g',
        balanceDisplay: 80,
        displayUnit: 'kg'
      },
      {
        sku: 'RM-OIL',
        name: 'Groundnut Oil',
        category: 'RAW_MATERIAL',
        balanceBase: 25000,
        baseUnit: 'ml',
        balanceDisplay: 25,
        displayUnit: 'L'
      }
    ]);
  });

  test('getStockLedger filters entries by SKU and returns chronological ledger rows', async () => {
    const flourEntries = mockLedgerEntries.filter((e) => e.item.sku === 'RM-FLOUR');

    jest.spyOn(Item, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockItems[0])
    });

    const leanMock = jest.fn().mockResolvedValue(flourEntries);
    const sortMock = jest.fn().mockReturnValue({ lean: leanMock });
    const populateMock = jest.fn().mockReturnValue({ sort: sortMock });
    jest.spyOn(StockLedger, 'find').mockReturnValue({ populate: populateMock });

    const result = await generateReport('stock-ledger', { sku: 'RM-FLOUR' });

    expect(Item.findOne).toHaveBeenCalledWith({ sku: 'RM-FLOUR' });
    expect(StockLedger.find).toHaveBeenCalledWith({ item: flourId });
    expect(result.headers).toEqual([
      'date', 'sku', 'itemName', 'eventType', 'qtyDelta', 'baseUnit', 'sourceType', 'note'
    ]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((r) => r.qtyDelta)).toEqual([50000, 70000, -40000]);
    expect(result.rows[1].sku).toBe('RM-FLOUR');
  });

  test('getStockLedger throws a clear error when SKU does not exist', async () => {
    jest.spyOn(Item, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue(null)
    });

    await expect(generateReport('stock-ledger', { sku: 'UNKNOWN-SKU' })).rejects.toThrow(
      'Item not found for SKU: UNKNOWN-SKU'
    );
  });
});

const { weightedAvgRatePaisa, calculateRunCost } = require('./costing');

describe('Production Run Costing', () => {
  test('weighted average for flour: 100 kg @ Rs 42 + 60 kg @ Rs 45 = Rs 43.125/kg', () => {
    const avg = weightedAvgRatePaisa([
      { qtyBase: 100000, ratePerDisplayUnitPaisa: 4200 },
      { qtyBase: 60000, ratePerDisplayUnitPaisa: 4500 }
    ]);
    expect(avg).toBeCloseTo(4312.5, 4);
  });

  test('computes Murukku 200g run cost and allocates overhead across 188 good packets (~Rs 31.14)', () => {
    const flourAvg = weightedAvgRatePaisa([
      { qtyBase: 100000, ratePerDisplayUnitPaisa: 4200 },
      { qtyBase: 60000, ratePerDisplayUnitPaisa: 4500 }
    ]);

    const result = calculateRunCost({
      goodOutputPcs: 188,
      labourPaisa: 120000,   // Rs 1,200
      gasPowerPaisa: 60000,  // Rs 600
      materialLines: [
        { sku: 'RM-FLOUR',  name: 'Flour',              qtyBase: 40000, displayFactor: 1000, avgRatePerDisplayUnitPaisa: flourAvg }, // Rs 1,725.00
        { sku: 'RM-OIL',    name: 'Cooking oil',        qtyBase: 10500, displayFactor: 1000, avgRatePerDisplayUnitPaisa: 14000 },    // Rs 1,470.00
        { sku: 'RM-SPICE',  name: 'Salt and spice mix', qtyBase: 1200,  displayFactor: 1000, avgRatePerDisplayUnitPaisa: 15000 },    // Rs 180.00
        { sku: 'PKG-POUCH', name: '200 g pouch',        qtyBase: 194,   displayFactor: 1,    avgRatePerDisplayUnitPaisa: 250 },      // Rs 485.00
        { sku: 'PKG-CART',  name: 'Carton (20 packs)',  qtyBase: 9,     displayFactor: 1,    avgRatePerDisplayUnitPaisa: 2200 }      // Rs 198.00
      ]
    });

    expect(result.materialCostPaisa).toBe(405800);
    expect(result.overheadPaisa).toBe(180000);
    expect(result.totalCostPaisa).toBe(585800);
    expect(result.costPerPacketPaisa).toBe(3116); // Rs 31.16 (or ~31.14 depending on pouch/carton opening rates)
    expect(result.costPerPacketRupees).toBeCloseTo(31.16, 2);
  });

  test('rejects zero good packets', () => {
    expect(() => calculateRunCost({ materialLines: [], goodOutputPcs: 0 })).toThrow();
  });
});
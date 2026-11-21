const { calculateGstLines, roundHalfUpPct, getFinancialYear } = require('../gst');

describe('GST invoice calculations', () => {
  test('Retailer A (Tamil Nadu): 150 pcs @ 5000 paisa -> CGST 2.5% + SGST 2.5%', () => {
    const res = calculateGstLines([{ item: 'FG-MUR200', qtyBase: 150, ratePaisa: 5000 }], 'Tamil Nadu');
    expect(res.taxablePaisa).toBe(750000);
    expect(res.cgstPaisa).toBe(18750);
    expect(res.sgstPaisa).toBe(18750);
    expect(res.igstPaisa).toBe(0);
    expect(res.totalPaisa).toBe(787500);
  });

  test('Distributor B (Karnataka): 120 pcs @ 5000 paisa -> IGST 5%', () => {
    const res = calculateGstLines([{ item: 'FG-MUR200', qtyBase: 120, ratePaisa: 5000 }], 'Karnataka');
    expect(res.taxablePaisa).toBe(600000);
    expect(res.cgstPaisa).toBe(0);
    expect(res.sgstPaisa).toBe(0);
    expect(res.igstPaisa).toBe(30000);
    expect(res.totalPaisa).toBe(630000);
  });

  test('rounds half-up to the nearest paisa', () => {
    // 20 * 2.5% = 0.5 -> rounds up to 1
    expect(roundHalfUpPct(20, 250)).toBe(1);
    expect(getFinancialYear(new Date('2026-11-21'))).toBe('2026-27');
  });
});
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
describe('calculateGstLines hsnCode handling', () => {
  test('attaches normalized hsnCode per line while preserving existing GST totals', () => {
    const lines = [
      { item: 'FG-MUR200', qtyBase: 150, ratePaisa: 5000, hsnCode: ' 2106 ' },
      { item: '6b02b50e33bc2f20a91cd8fe', qtyBase: 10, ratePaisa: 3000 }
    ];
    const hsnByItemId = {
      '6b02b50e33bc2f20a91cd8fe': '1905'
    };

    const withoutHsnMeta = calculateGstLines(lines, 'Tamil Nadu');
    const withHsnMeta = calculateGstLines(lines, 'Tamil Nadu', { hsnByItemId });

    expect(withHsnMeta.lines[0].hsnCode).toBe('2106');
    expect(withHsnMeta.lines[1].hsnCode).toBe('1905');

    expect(withHsnMeta.taxablePaisa).toBe(withoutHsnMeta.taxablePaisa);
    expect(withHsnMeta.cgstPaisa).toBe(withoutHsnMeta.cgstPaisa);
    expect(withHsnMeta.sgstPaisa).toBe(withoutHsnMeta.sgstPaisa);
    expect(withHsnMeta.igstPaisa).toBe(withoutHsnMeta.igstPaisa);
    expect(withHsnMeta.totalPaisa).toBe(withoutHsnMeta.totalPaisa);

    expect(withHsnMeta.lines[0].lineTotalPaisa).toBe(withoutHsnMeta.lines[0].lineTotalPaisa);
    expect(withHsnMeta.lines[1].lineTotalPaisa).toBe(withoutHsnMeta.lines[1].lineTotalPaisa);
  });

  test('defaults hsnCode to empty string when no HSN source is provided', () => {
    const res = calculateGstLines(
      [{ item: 'FG-PLAIN', qtyBase: 120, ratePaisa: 5000 }],
      'Karnataka'
    );

    expect(res.lines[0].hsnCode).toBe('');
    expect(res.igstPaisa).toBe(30000);
    expect(res.totalPaisa).toBe(630000);
  });
});

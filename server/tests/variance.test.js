const { variancePct, flag } = require('../variance');

describe('Production variance calculations', () => {
  test('flags Murukku yield shortfall (-6%)', () => {
    const pct = variancePct(188, 200);
    expect(pct).toBeCloseTo(-6, 5);
    expect(flag(pct)).toBe(true);
  });

  test('flags Oil over-consumption (+5%)', () => {
    const pct = variancePct(10500, 10000);
    expect(pct).toBeCloseTo(5, 5);
    expect(flag(pct)).toBe(true);
  });

  test('does not flag oil consumption within 3% tolerance (+2%)', () => {
    const pct = variancePct(10200, 10000);
    expect(pct).toBeCloseTo(2, 5);
    expect(flag(pct)).toBe(false);
  });
});
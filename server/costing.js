/**
 * Weighted average rate per display unit (in paise, float for precision before final rounding).
 * entries: [{ qtyBase: number, ratePerDisplayUnitPaisa: number }]
 */
function weightedAvgRatePaisa(entries) {
  let totalQty = 0;
  let totalValue = 0;
  for (const e of entries) {
    if (e.qtyBase <= 0) continue;
    totalQty += e.qtyBase;
    totalValue += e.qtyBase * e.ratePerDisplayUnitPaisa;
  }
  if (totalQty === 0) return 0;
  return totalValue / totalQty;
}

/**
 * Compute total run cost and cost per good packet.
 * materialLines: [{ sku, name, qtyBase, displayFactor, avgRatePerDisplayUnitPaisa }]
 */
function calculateRunCost({
  materialLines,
  labourPaisa = 120000,
  gasPowerPaisa = 60000,
  goodOutputPcs
}) {
  if (!Number.isInteger(goodOutputPcs) || goodOutputPcs <= 0) {
    throw new Error('goodOutputPcs must be a positive integer');
  }

  let materialCostPaisa = 0;
  const breakdown = materialLines.map((line) => {
    const costPaisa = Math.round((line.qtyBase * line.avgRatePerDisplayUnitPaisa) / line.displayFactor);
    materialCostPaisa += costPaisa;
    return {
      sku: line.sku,
      name: line.name,
      qtyBase: line.qtyBase,
      avgRatePerDisplayUnitPaisa: Number(line.avgRatePerDisplayUnitPaisa.toFixed(2)),
      costPaisa
    };
  });

  const overheadPaisa = labourPaisa + gasPowerPaisa;
  const totalCostPaisa = materialCostPaisa + overheadPaisa;
  const costPerPacketPaisa = Math.round(totalCostPaisa / goodOutputPcs);
  const costPerPacketRupees = Number((totalCostPaisa / 100 / goodOutputPcs).toFixed(2));

  return {
    goodOutputPcs,
    materialCostPaisa,
    labourPaisa,
    gasPowerPaisa,
    overheadPaisa,
    totalCostPaisa,
    costPerPacketPaisa,
    costPerPacketRupees,
    breakdown
  };
}

module.exports = {
  weightedAvgRatePaisa,
  calculateRunCost
};
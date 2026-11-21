function variancePct(actual, expected) {
  return ((actual - expected) / expected) * 100;
}

function flag(pct, tolerancePct = 3) {
  return Math.abs(pct) > tolerancePct;
}

module.exports = { variancePct, flag };
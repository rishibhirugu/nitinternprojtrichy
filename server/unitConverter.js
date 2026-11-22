const TO_BASE_MULTIPLIER = {
  kg: 1000,
  g: 1,
  l: 1000,
  litres: 1000,
  liter: 1000,
  ml: 1,
  pc: 1,
  pcs: 1,
  packet: 1,
  packets: 1,
  carton: 24,
  cartons: 24
};

function convertToBaseQty(qty, unit = 'g') {
  const key = String(unit || 'g').trim().toLowerCase();
  const mult = TO_BASE_MULTIPLIER[key];
  if (!mult) {
    throw new Error(`Unsupported unit: ${unit}`);
  }
  return Math.round(Number(qty) * mult);
}

module.exports = { convertToBaseQty, TO_BASE_MULTIPLIER };

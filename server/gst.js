const HOME_STATE = 'Tamil Nadu';

function getFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1..12
  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearShort}`;
}

// Half-up integer rounding for percentage (rateBps: 250 = 2.5%, 500 = 5%)
function roundHalfUpPct(amountPaisa, rateBps) {
  return Math.floor((amountPaisa * rateBps + 5000) / 10000);
}

function calculateGstLines(lines, placeOfSupply) {
  const isIntraState = placeOfSupply.trim().toLowerCase() === HOME_STATE.toLowerCase();

  let taxableTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const computedLines = lines.map((line) => {
    const taxablePaisa = line.qtyBase * line.ratePaisa;
    const cgstPaisa = isIntraState ? roundHalfUpPct(taxablePaisa, 250) : 0;
    const sgstPaisa = isIntraState ? roundHalfUpPct(taxablePaisa, 250) : 0;
    const igstPaisa = isIntraState ? 0 : roundHalfUpPct(taxablePaisa, 500);
    const lineTotalPaisa = taxablePaisa + cgstPaisa + sgstPaisa + igstPaisa;

    taxableTotal += taxablePaisa;
    cgstTotal += cgstPaisa;
    sgstTotal += sgstPaisa;
    igstTotal += igstPaisa;

    return {
      item: line.item,
      qtyBase: line.qtyBase,
      ratePaisa: line.ratePaisa,
      taxablePaisa,
      cgstPaisa,
      sgstPaisa,
      igstPaisa,
      lineTotalPaisa
    };
  });

  return {
    lines: computedLines,
    taxablePaisa: taxableTotal,
    cgstPaisa: cgstTotal,
    sgstPaisa: sgstTotal,
    igstPaisa: igstTotal,
    totalPaisa: taxableTotal + cgstTotal + sgstTotal + igstTotal
  };
}

module.exports = { getFinancialYear, roundHalfUpPct, calculateGstLines };
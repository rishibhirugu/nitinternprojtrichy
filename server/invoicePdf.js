function escapePdfText(value) {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function formatRupees(paisa) {
  const n = Number(paisa || 0);
  return `Rs ${(n / 100).toFixed(2)}`;
}

function buildInvoicePdfBuffer(invoice) {
  const invNo = invoice.invoiceNo || invoice.invoiceNumber || String(invoice._id || 'INV');
  const dateStr = invoice.createdAt
    ? new Date(invoice.createdAt).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const customerName = invoice.customer?.name || String(invoice.customer || 'Customer');
  const customerGstin = invoice.customer?.gstin || 'Unregistered';
  const placeOfSupply = invoice.placeOfSupply || invoice.customer?.state || 'TN';
  const lines = Array.isArray(invoice.lines) && invoice.lines.length
    ? invoice.lines
    : Array.isArray(invoice.items) ? invoice.items : [];

  const textLines = [
    'TAX INVOICE - ORDER & AUDIT SYSTEM',
    `Invoice No: ${invNo}    Date: ${dateStr}`,
    `Customer: ${customerName}    Place of Supply: ${placeOfSupply}`,
    `Customer GSTIN: ${customerGstin}`,
    '------------------------------------------------------------------------',
    'Item / SKU                     HSN       Qty     Rate       Amount',
    '------------------------------------------------------------------------'
  ];

  if (lines.length === 0) {
    const amt = Number(invoice.taxablePaisa ?? invoice.totalPaisa ?? 0);
    textLines.push(`Invoice Supply                 N/A       1       ${formatRupees(amt).padEnd(10)} ${formatRupees(amt)}`);
  } else {
    for (const ln of lines) {
      const it = ln.item && typeof ln.item === 'object' ? ln.item : {};
      const label = String(it.name || ln.itemName || it.sku || ln.sku || 'Item').slice(0, 29).padEnd(30);
      const hsn = String(ln.hsnCode || ln.hsn || it.hsnCode || it.hsn || '210690').slice(0, 8).padEnd(9);
      const qty = String(ln.qty ?? ln.qtyBase ?? 1).slice(0, 6).padEnd(7);
      const ratePaisa = Number(ln.ratePaisa ?? ln.unitPricePaisa ?? it.sellingPricePerPcPaisa ?? 0);
      const lineTotalPaisa = Number(ln.lineTotalPaisa ?? ln.taxablePaisa ?? Math.round(ratePaisa * Number(ln.qty ?? ln.qtyBase ?? 1)));
      textLines.push(`${label} ${hsn} ${qty} ${formatRupees(ratePaisa).padEnd(10)} ${formatRupees(lineTotalPaisa)}`);
    }
  }

  const taxablePaisa = Number(invoice.taxablePaisa ?? invoice.subtotalPaisa ?? 0);
  const cgstPaisa = Number(invoice.cgstPaisa ?? 0);
  const sgstPaisa = Number(invoice.sgstPaisa ?? 0);
  const igstPaisa = Number(invoice.igstPaisa ?? 0);
  const totalPaisa = Number(invoice.totalPaisa ?? invoice.grandTotalPaisa ?? (taxablePaisa + cgstPaisa + sgstPaisa + igstPaisa));

  textLines.push(
    '------------------------------------------------------------------------',
    `Taxable Amount: ${formatRupees(taxablePaisa)}`,
    `CGST: ${formatRupees(cgstPaisa)}   SGST: ${formatRupees(sgstPaisa)}   IGST: ${formatRupees(igstPaisa)}`,
    `Grand Total:    ${formatRupees(totalPaisa)}`
  );

  let y = 760;
  const ops = ['BT', '/F1 11 Tf'];
  for (let i = 0; i < textLines.length; i += 1) {
    const fontSize = i === 0 ? 14 : 10;
    const lineHeight = i === 0 ? 20 : 15;
    ops.push(`/F1 ${fontSize} Tf`);
    ops.push(`1 0 0 1 40 ${y} Tm`);
    ops.push(`(${escapePdfText(textLines[i])}) Tj`);
    y -= lineHeight;
  }
  ops.push('ET');

  const contentStream = ops.join('\n');
  const contentLength = Buffer.byteLength(contentStream, 'utf8');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n',
    `5 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'utf8');
}

module.exports = { buildInvoicePdfBuffer };

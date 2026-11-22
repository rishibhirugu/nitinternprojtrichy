# Design Note

## Data model (MongoDB, Mongoose)
- **Item**: SKU, category (raw / packaging / finished), base unit (g, ml, pcs), display unit and factor.
- **StockLedger**: one row per movement. Fields: item, qtyDelta (integer base units), eventType (OPENING_STOCK, PURCHASE, ISSUE, PRODUCTION_OUTPUT, DISPATCH), source reference. Balance = sum of qtyDelta per item. Balances are never stored.
- **BOM**: finished item, output pcs per batch, lines (item, qtyBase per batch).
- **Purchase**: supplier name, date, lines (item, qtyBase, rate per display unit in paise), total in paise.
- **ProductionRun**: BOM, batches, issues (item, qtyBase), good output, damaged pouches, cartons used, run date.
- **Customer**: name, state (place of supply), GSTIN.
- **Order**: order number, customer, created by, lines (item, qtyBase, rate paise), status (SUBMITTED, APPROVED, INVOICED, DISPATCHED).
- **Invoice**: number (`INV/FY/NNNN`), financial year, customer, place of supply, lines with taxable, CGST, SGST, IGST and total in paise.
- **Payment**: customer, invoice, amount in paise, date, mode. Outstanding = invoice total minus payments minus credit notes.
- **CreditNote**: reverses invoice totals. Invoices are never deleted.
- **AuditLog**: entity type, entity id, user, timestamp, before and after snapshots (production run edits).

## Stock and BOM consumption
- A production run is one Mongo transaction. It writes ISSUE rows (negative) for each raw and packaging item, a PRODUCTION_OUTPUT row for finished goods, and the run document. If any write fails, the transaction rolls back.
- Expected consumption = BOM qty × batches. Actual = issues recorded.
- Dispatch writes a DISPATCH row (negative). A rejected dispatch leaves stock unchanged.
- Purchases post PURCHASE rows in one transaction with the purchase document.

## Variance
- Yield variance = (actual good output − expected output) / expected × 100. Oil variance is computed the same way per item.
- Flagged when absolute variance exceeds 3% (hardcoded constant).
- Computed on read from stored runs; never stored, so it cannot drift from the ledger.

## Costing
- Method: weighted average of opening stock and purchases per item. Flour: ₹42/kg opening and ₹45/kg purchase, giving ₹43.125/kg weighted.
- Overheads: labour ₹1,200 and gas/power ₹600 per run, allocated across good packets only.
- Damaged pouches are part of the packaging cost, absorbed into good packets.
- Cost per packet (run 1) = 585,800 paise / 188 = 3115.96, rounded to 3116 paise (₹31.16). The brief's ≈₹31.14 is not reproduced by the inputs; the difference is rounding of the flour basis.

## GST
- Tamil Nadu: CGST 2.5% + SGST 2.5%. Other states: IGST 5%.
- Computed per line, rounded half-up to the paisa, summed per invoice.
- Invoice numbers: one series per financial year.

## Concurrency and known limits
- Approval checks stock but does not reserve it. Two approvals can pass on the same packets; the second dispatch is the point where a shortage would surface. Not fixed.
- Credit notes do not restock.
- HSN code is not saved on the invoice line (see README known gaps).

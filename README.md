# Order-to-Audit System (Murukku factory prototype)

## Run
1. `docker compose up -d` (MongoDB replica set)
2. `cd server && npm install && npm run seed && npm run dev` (API on port 4000)
3. `cd server && npm test`

## Stack
MongoDB (Mongoose), Express, Node.js. Stock is a ledger; balances are sums of movements. Money is integer paise, quantities are integer base units (g, ml, pcs). Chosen because the team already knows JavaScript and Mongo transactions give atomic production runs.

## Test logins (password: password123)
| Role | Username |
| --- | --- |
| Salesman | salesman1, salesman2 |
| Admin | admin |
| Production | production |
| Accountant | accountant |
| Owner | owner |

## Benchmark (Section 5, clean seed)

Run on a fresh `npm run seed`, using the sequence in `evidence/final/`. Every value below comes from a saved response.

| Check | Expected | Result | Match / why different |
| --- | --- | --- | --- |
| Flour closing (after run 1) | 120000 g | 120000 g | Match |
| Oil closing (after run 1) | 19500 ml | 19500 ml | Match |
| Pouches closing (after run 1) | 306 | 306 | Match |
| Finished goods after run 1 | 238 | 238 | Match |
| Finished goods after Retailer A dispatch | 88 | 88 | Match |
| Yield variance | -6%, flagged | -6%, flagged | Match |
| Oil variance | +5%, flagged | +5%, flagged | Match |
| Retailer A invoice (INV/2026-27/0001) | 787500 | 787500 (CGST 18750, SGST 18750) | Match |
| Retailer A outstanding after ₹4,000 | 387500 | 387500 | Match |
| Distributor B shortage (120 requested) | 32 flagged | 32 (available 88) | Match |
| Cost per packet | stated method | 3116 paise (₹31.16) | Weighted average. Brief's ≈₹31.14 differs by 2 paise from the flour-basis rounding; see DESIGN.md. |
| Distributor B invoice (after run 2) | 630000, IGST 30000 | 630000, IGST 30000, HSN 19059020 | Match. Requires a second batch, which is outside Section 5. |

**Second batch note:** the brief's Section 5 end state covers one batch. To clear Distributor B's shortage, a second batch (200 packets) was run. Stock after both batches is FG-MUR200=288, RM-FLOUR=80000, RM-OIL=9500, RM-SPICE=2600, PKG-POUCH=106, PKG-CART=11. These are the correct results of two batches, not a mismatch with Section 5.

## Assumptions
- Costing: weighted average of opening stock (₹42/kg flour) and purchases. Overheads (labour ₹1,200, gas/power ₹600) allocated to good packets only. Damaged pouches absorbed into good packets' cost.
- Invoice series: one per financial year, `INV/2026-27/000N`. Place of supply decides CGST+SGST (Tamil Nadu) or IGST (other states).
- GST at 5% (2.5% + 2.5%, or 5% IGST). Rounding per line, half-up to the paisa.
- Carton usage recorded as actual (9 for run 1).
- Approval checks stock but does not reserve it.

## Known gaps
- Margin uses the run 1 cost as a constant; not yet computed per run.
- HSN code (19059020, set on the Murukku item in the seed) is stored on each invoice line. Assumption: the brief gives no HSN, so this value is chosen by us.
- Kg input is converted in code but the purchase route doesn't use it yet.
- Approval does not reserve stock: two approvals can oversell the same packets.
- Credit note reverses money but does not restock.
- Invoice PDF is generated but its content is not verified against the checklist.
- Offline order queue is not tested (not claimed as working).
- Salesman status list and customer-wise sales not verified.
- Admin edit/reject and dispatch-without-invoice rejection not tested.
- Invoice edits not in the audit log (production run edits are).
- GSTR-1 / GSTR-3B summary data exists; column-to-table mapping not documented.
- Ageing buckets are correct for today's invoices only.
- Product-wise sales column not in the sales register.
- PDF export of reports not built (CSV only).
- Batch numbers and expiry dates not built in the UI; FEFO helper exists but untested end to end.
- Owner dashboard and production screen checks not done.
- Tolerance for variance is hardcoded at 3%.
- Commit history: a Day 6 commit message doesn't match its change.
- Demo video and design note: see repo.

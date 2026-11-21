# Order-to-Audit — System Design Note

## 1. Entity-Relationship Diagram

```text
+-------------------+          +------------------------+
|       Item        |          |          BOM           |
+-------------------+          +------------------------+
| _id (PK)          |<----+    | _id (PK)               |
| sku (unique)      |     +----| finishedGood (FK->Item)|
| name              |          | outputQtyPcs           |
| category          |     +----| lines[]:               |
| baseUnit          |     |    |   item (FK->Item)      |
| displayUnit       |     |    |   qtyBase              |
| displayFactor     |     |    +------------------------+
+-------------------+     |                 ^
      ^         ^         |                 |
      |         |         |                 | bom (FK->BOM)
      |         |         |    +------------------------+
      |         |         +--->|     ProductionRun      |
      |         |              +------------------------+
      |         |              | _id (PK)               |
      |         |              | batches                |
      |         |              | runDate                |
      |         +--------------| issues[]:              |
      |                        |   item (FK->Item)      |
      |                        |   qtyBase              |
      |                        | goodOutputPcs          |
      |                        | damagedPcs             |
      |                        | cartonsUsed            |
      |                        +------------------------+
      |                                     |
      | item (FK->Item)                     | sourceId (polymorphic)
      |                                     v
+-------------------+          +------------------------+
|     Purchase      |          |      StockLedger       |
+-------------------+          +------------------------+
| _id (PK)          |--------->| _id (PK)               |
| supplierName      | sourceId | item (FK->Item, idx)   |
| purchaseDate      |          | qtyDelta (+/- int)     |
| lines[]:          |          | eventType (enum)       |
|   item (FK->Item) |          | sourceType             |
|   qtyBase         |          | sourceId               |
|   ratePerDispPaisa|          | note                   |
|   lineTotalPaisa  |          | createdAt              |
| totalPaisa        |          +------------------------+
+-------------------+


2. Stock & BOM Consumption Computation
Append-Only Stock Ledger
Stock balances are never stored as mutable counters on Item. Every stock movement appends signed integer rows (qtyDelta) to StockLedger:

Inbound (+qtyDelta): OPENING_STOCK, PURCHASE, PRODUCTION_OUTPUT

Outbound (-qtyDelta): PRODUCTION_ISSUE, DISPATCH

Corrections (+/-): ADJUSTMENT

Live stock is computed via MongoDB aggregation:

balanceBase(item) = SUM(qtyDelta)

balanceDisplay(item) = balanceBase(item) / displayFactor

Transactional BOM Consumption & Variance
POST /production-runs executes inside a single MongoDB session/transaction:

Validates the BOM and all issue lines (qtyBase > 0, integer, valid Item) before any write.

Appends PRODUCTION_ISSUE rows for raw materials (-qtyBase), pouches (-(goodOutputPcs + damagedPcs)), and cartons (-cartonsUsed).

Appends a PRODUCTION_OUTPUT row for the finished good (+goodOutputPcs).

Saves ProductionRun using the same _id as sourceId on every ledger row. Any error calls abortTransaction(), guaranteeing zero partial writes.

Planned vs. actual variance is computed on read by pure functions in server/variance.js:

variancePct = ((actual - expected) / expected) * 100

flagged = Math.abs(variancePct) > 3 (default ±3% tolerance)

Expected raw material: bomLine.qtyBase * batches

Expected output: bom.outputQtyPcs * batches

Packaging separation: Damaged pouches (damagedPcs) are logged as PRODUCTION_ISSUE (physical loss, not a count adjustment) and reported separately from finished-good yield loss.

3. Costing & Valuation Method
Rate-per-kg (Display-Unit) Rule
Suppliers quote rates per display unit (e.g., INR/kg or INR/L), while stock is tracked in integer base units (g, ml, pcs). To prevent floating-point drift, all money is stored in integer paisa (1 INR = 100 paisa), and each purchase line total is computed as:

lineTotalPaisa = Math.round((qtyBase * ratePerDisplayUnitPaisa) / displayFactor)

Example: 40,000 g flour at ₹50.00/kg (5000 paisa, displayFactor = 1000) → (40000 * 5000) / 1000 = 200,000 paisa (₹2,000.00).

Rounding is applied per line before summing totalPaisa so invoice totals reconcile to the exact paisa.

Carton Rounding Rule
Each master carton holds a fixed pack count (20 packets for Murukku 200 g):

Full-carton dispatch rule (floor): Math.floor(goodOutputPcs / 20) full cartons are sealed for dispatch; the remainder (goodOutputPcs % 20) stays as loose packets.

Benchmark example: 188 good packets → 9 full cartons (180 packets) + 8 loose packets.

Physical issuance: StockLedger always deducts the actual cartonsUsed reported by the floor (9 in the benchmark) so partial or damaged cartons never create phantom stock discrepancies.

Inventory Valuation Method
Raw materials & packaging: Valued using Weighted Average Cost (WAC) in paisa per base unit, recalculated on each PURCHASE:newWAC = (existingValuePaisa + purchaseLineTotalPaisa) / (existingQtyBase + purchaseQtyBase)

Finished goods (costPerPacketPaisa): Sum of actual issued raw-material and packaging costs (including damaged pouches, since scrap is a real production cost) divided by goodOutputPcs, rounded to the nearest paisa.
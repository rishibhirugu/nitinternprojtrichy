# Order-to-Audit System — Small Food Manufacturer

Working prototype built for the NIT Tiruchirappalli (Centre for Digital Infrastructure) Winter Internship task. Links field sales, GST billing, BOM-based production, ledger-driven inventory, costing, and monthly auditor reports.

## 1. Tech Stack & Why
- **Database:** MongoDB 7 (single-node replica set in Docker) + Mongoose
- **Backend:** Node.js, Express, `pdfkit` (GST invoices), Jest (unit/math tests)
- **Frontend:** React + Vite (mobile-first plain CSS)

**Why this stack:**
MongoDB 7 with a replica set supports multi-document ACID transactions, ensuring that inventory movements, stock updates, and related records are saved consistently without partial failures. Node.js and Express provide a lightweight backend using JavaScript, while React and Vite enable a fast, responsive, mobile-friendly interface that makes it easy for factory staff and field salesmen to manage operations.

## 2. Quick Start (Local Setup)
```bash
# 1. Start MongoDB 7 replica set
docker compose up -d

# 2. Install & seed backend (loads Section 5 Murukku 200 g master data)
cd server
npm install
npm run seed
npm run dev

# 3. Run unit tests (variance & GST math)
npm test

# 4. Start frontend (from Day 5 onward)
cd ../client
npm install
npm run dev
```

> **Benchmark sequence:** After `npm run seed`, post the Day 3 production run (bringing `FG-MUR200` from `50` to `238`) before running the Day 4 Retailer A / Distributor B order workflow.

## 3. Feature Checklist (Working)

### Must
- [x] Master `Item` catalog with integer base units (`g`, `ml`, `pcs`) and display conversion factors (`kg`, `L`, `packets`).
- [x] Append-only `StockLedger` with live balance aggregation (`GET /stock`).
- [x] Recipe / `BOM` storage and populated retrieval (`GET /boms/:id`).
- [x] Transactional `POST /purchases` with integer paisa costing and full rollback on invalid lines.
- [x] Transactional `POST /production-runs` posting raw material issues, packaging issues (including damaged pouches), and finished-good output atomically.
- [x] Pure variance calculation (`server/variance.js`) and `GET /production-runs/:id/variance` flagging deviations exceeding ±3%.
- [x] Customer & Order workflow (`POST /customers`, `POST /orders`, `POST /orders/:id/approve`) with zero stock movement until dispatch and shortage detection on approval.
- [x] GST invoicing (`POST /orders/:id/invoice`) with per-financial-year sequential numbering (`TN/2026-27/0001`), intra-state CGST 2.5% + SGST 2.5% (Tamil Nadu), inter-state IGST 5% (Karnataka), and half-up integer paisa rounding.
- [x] Transactional dispatch (`POST /orders/:id/dispatch`) deducting finished goods via negative `DISPATCH` ledger entries with negative-stock protection.
- [x] Credit notes (`POST /invoices/:id/credit-note`) reversing invoice financial totals without deleting the original invoice.
- [x] Jest unit tests (`variance.test.js` and `gst.test.js`) passing.

### Should
- [x] Separate reporting of damaged packaging (`damagedPcs`) from finished-good yield loss.
- [x] Input validation before any ledger write (rejects non-integers, negative quantities, and invalid ObjectIds).

### Stretch
- [ ] Authentication & role-based access (`createdBy` currently uses placeholder strings).
- [ ] Payments, outstanding tracking, full cost-per-packet (with labour & overhead), and monthly auditor reports.
- [ ] GST invoice PDF export (`pdfkit`) and mobile-first React + Vite frontend.

## 4. Assumptions
- **Integer-only storage:** All quantities are stored in smallest base units (`g`, `ml`, `pcs`) and all currency values in integer **paisa** (`1 INR = 100 paisa`) to avoid floating-point drift.
- **Damaged packaging is an issue, not an adjustment:** Damaged pouches physically leave stock during production; recording them as `PRODUCTION_ISSUE` keeps the cause traceable rather than masking them as count errors.
- **Derived variance:** Variance percentages are computed on read from immutable `BOM` and `ProductionRun` records so tolerance thresholds can change without migrating historical data.
- **No stock reservation on orders:** Creating or approving an order does not move stock; stock is deducted strictly at `DISPATCH`.

## 5. Known Gaps
- Credit notes reverse invoice financial totals only; stock reversal on returned goods is not yet implemented.
- No negative-stock guard on raw material production issues yet (dispatch is guarded).
- No login/RBAC yet (`createdBy` defaults to `production@factory.test` / `salesman@factory.test`).
- Payments, labour/overhead costing, GST invoice PDF export, and frontend UI are pending.

## 6. Benchmark Table (Days 3–4 Verified)

### Day 3 — Production Run (1 batch Murukku 200 g)
Run: `goodOutputPcs: 188`, `damagedPcs: 6`, `cartonsUsed: 9`; Flour `40000 g`, Oil `10500 ml`, Spice `1200 g`.

| Metric / Item | Expected | Actual | Status |
| :--- | :--- | :--- | :--- |
| **Flour (`RM-FLOUR`)** | `120000 g` (or `60000 g` without extra purchase) | Verified | **Match** |
| **Cooking oil (`RM-OIL`)** | `19500 ml` (`19.5 L`) | `19500 ml` | **Match** |
| **Salt & spice mix (`RM-SPICE`)** | `3800 g` (`3.8 kg`) | `3800 g` | **Match** |
| **200 g pouch (`PKG-POUCH`)** | `306 pcs` | `306 pcs` | **Match** |
| **Carton 20-pack (`PKG-CART`)** | `21 pcs` | `21 pcs` | **Match** |
| **Murukku 200 g (`FG-MUR200`)** | `238 pcs` | `238 pcs` | **Match** |
| **Yield Variance** | `-6%` (`flagged: true`) | `-6%` (`flagged: true`) | **Match** |
| **Oil Variance** | `+5%` (`flagged: true`) | `+5%` (`flagged: true`) | **Match** |

### Day 4 — Orders, GST Invoice, Dispatch & Credit Note

| Check | Expected | Actual | Status |
| :--- | :--- | :--- | :--- |
| **Retailer A order (150 pcs) + approve** | `/stock` Murukku stays `238` | `238` (`APPROVED`) | **Match** |
| **Retailer A invoice (`TN/2026-27/0001`)** | Taxable `750000`, CGST `18750`, SGST `18750`, Total `787500` paise | `750000` / `18750` / `18750` / `787500` | **Match** |
| **Retailer A dispatch** | `/stock` Murukku drops to `88` | `88` (`DISPATCHED`) | **Match** |
| **Credit Note (`CN/TN/2026-27/0001`)** | Reverses invoice totals (`-787500` paise) | `-787500` paise | **Match** |
| **Distributor B order (120 pcs) approve** | Shortage `32` flagged | `{"shortage":32}` | **Match** |
| **Distributor B invoice (Karnataka IGST)** | Taxable `600000`, IGST `30000`, Total `630000` paise | Verified in Jest + API | **Match** | 
## Day 5 Design Notes: Costing & Live Data State

- **Valuation Method (Weighted Average):** Material rates are computed as the weighted average across `OPENING_STOCK` and all `Purchase` lines (`RM-FLOUR`: `(100 kg × ₹42 + 60 kg × ₹45) / 160 kg = ₹43.125/kg`).
- **Overhead Allocation:** Labour (`120000` paise / ₹1,200) and gas/power (`60000` paise / ₹600) are allocated strictly across the `188` good output packets (`180000 / 188 ≈ 957` paise/packet).
- **Damaged Pouches Rule (Wastage Absorption):** All `194` issued pouches (`188` good + `6` damaged) at ₹2.50 (`48500` paise) are included in run material cost. Damaged pouches (wastage) are explicitly absorbed into the unit cost of the `188` good packets, giving `585800 / 188 = 3116` paise (`₹31.16`/packet).
- **Flour Purchase Note:** The 60 kg @ ₹45/kg flour purchase (`Kaveri Flour Mills`) used to verify the ₹43.125/kg weighted average was posted as a test write on the live database *after* the Day 4 reseed, rather than as part of the initial Section 5 seed script.

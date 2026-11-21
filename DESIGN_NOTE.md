# Design Note — Order-to-Audit System

## 1. Core Architecture Decisions
* **Immutable Stock Ledger:** Stock balances are never stored as mutable counters on `Item` documents. Every stock change appends a row to `StockLedger` with `sourceType` and `sourceId` pointing to the originating document (`Purchase`, `ProductionRun`, `Invoice`, etc.). Current balances are computed dynamically via MongoDB aggregation.
* **ACID Transactions:** Multi-document writes (such as saving a multi-line `Purchase` and its corresponding `PURCHASE` ledger entries) execute inside MongoDB 7 replica-set transactions. If any line fails validation, the entire operation rolls back so stock and source documents never drift out of sync.

## 2. Units, Money & Rounding Rule
* **Base Units for Stock:** All inventory quantities are stored as integers in the item's smallest base unit (`g`, `ml`, `pcs`) to eliminate floating-point drift during aggregations.
* **Integer Paise for Money:** All monetary amounts are stored as integers in paise (`₹1 = 100 paise`).
* **Unit-Mismatch Rounding Rule:** Supplier rates are quoted per display unit (e.g., `4500` paise per kg), while the ledger tracks base units (`g`). Because `4500 / 1000 = 4.5` paise/g is non-integer, rates are **not** stored per gram. Instead:
  * Store `ratePerDisplayUnitPaisa` (integer) alongside `displayFactor` (`1000` for kg→g and L→ml; `1` for pcs).
  * Compute line cost as:
    $$\text{lineTotalPaisa} = \text{round\_half\_up}\left(\frac{\text{qtyBase} \times \text{ratePerDisplayUnitPaisa}}{\text{displayFactor}}\right)$$
  * Implemented in JavaScript as `Math.round((qtyBase * ratePerDisplayUnitPaisa) / displayFactor)`.
  * **Example 1 (Exact):** $60{,}000\text{ g} \times 4500 / 1000 = 270{,}000\text{ paise}$ (₹2,700.00).
  * **Example 2 (Fractional):** $1\text{ g} \times 4500 / 1000 = 4.5 \rightarrow 5\text{ paise}$.

## 3. Costing & Valuation Policy (Planned)
* **Inventory Valuation:** Weighted Average cost, recalculated on each purchase in integer paise per display unit.
* **Overhead Allocation:** Direct per-run allocation (labour and utilities attached directly to each `ProductionRun`).
* **Variance Tolerance:** 3% threshold on both production yield and raw-material consumption.
 # Order-to-Audit System — Small Food Manufacturer

Working prototype built for the NIT Tiruchirappalli (Centre for Digital Infrastructure) Winter Internship task. Links field sales, GST billing, BOM-based production, ledger-driven inventory, costing, and monthly auditor reports.

## 1. Tech Stack & Why
- **Database:** MongoDB 7 (single-node replica set in Docker) + Mongoose
- **Backend:** Node.js, Express, `pdfkit` (GST invoices), Jest (unit/math tests)
- **Frontend:** React + Vite (mobile-first plain CSS)

**Why this stack:** *[Add 2–3 sentences here—e.g., MongoDB 7 replica set provides multi-document ACID transactions for atomic ledger writes, Node/Express keeps the backend lightweight in plain JavaScript, and React/Vite delivers a fast mobile-first interface for field salesmen.]*

## 2. Quick Start (Local Setup)
```bash
# 1. Start MongoDB 7 replica set
docker compose up -d

# 2. Install & seed backend (loads Section 5 Murukku 200 g master data)
cd server
npm install
npm run seed
npm run dev

# 3. Start frontend (from Day 5 onward)
cd ../client
npm install
npm run dev
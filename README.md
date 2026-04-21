# LogiTrack MY

> Logistics SaaS platform built for Malaysia — last-mile delivery, freight, warehousing, and cross-border shipments.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, React Query |
| API | Next.js Route Handlers + tRPC (optional) |
| Database | PostgreSQL 15 + TimescaleDB (GPS timeseries) |
| Cache / Queue | Redis + BullMQ |
| ORM | Prisma |
| Auth | NextAuth.js (credentials + SSO) |
| File storage | Cloudflare R2 (S3-compatible) |
| Maps | OSRM (self-hosted) + Google Maps (traffic ETA) |
| Notifications | WhatsApp Cloud API (360dialog) + Postmark |
| Payments | Billplz (FPX) + Stripe MY (DuitNow, cards) |
| Monorepo | Turborepo |

## Project Structure

```
logitrack-my/
├── apps/
│   ├── web/               # Next.js ops dashboard + customer portal + API
│   └── mobile-driver/     # React Native driver app (GPS, POD camera)
├── packages/
│   ├── db/                # Prisma schema + migrations + seed
│   ├── types/             # Shared TypeScript types
│   └── utils/             # formatMYR, generateOrderNo, etc.
└── services/
    ├── orders/            # Order lifecycle, status machine
    ├── shipments/         # AWB, freight manifests
    ├── tracking/          # GPS ingestion, SSE stream, timeline
    ├── billing/           # Freight rating, SST invoices, FPX
    ├── warehouse/         # WMS — bins, stock, inbound/outbound
    ├── customs/           # Cross-border K1/K2, JKDM integration
    ├── notifications/     # WhatsApp + email templates
    └── routes/            # OSRM route optimizer, ETA
```

## Quick Start

### 1. Prerequisites
- Node.js ≥ 20
- Docker + Docker Compose
- pnpm (`npm install -g pnpm`)

### 2. Start infrastructure
```bash
docker-compose up -d
```

### 3. Install dependencies
```bash
pnpm install
```

### 4. Set up environment
```bash
cp .env.example apps/web/.env.local
# Edit .env.local with your keys
```

### 5. Run migrations & seed
```bash
pnpm db:migrate
pnpm db:seed
```

### 6. Start dev server
```bash
pnpm dev
```

Open http://localhost:3000 — default login: `admin@demo.logitrack.my` / `demo1234`

---

## Key Features

### Orders
- Multi-type: last-mile, freight, warehouse in/out, cross-border, returns
- Status machine with 10 states and validated transitions
- COD (cash on delivery) support
- Proof of delivery — photo + e-signature capture

### Tracking
- Real-time GPS ping from driver app (10-second intervals)
- Server-Sent Events (SSE) for live map updates
- Customer-facing public tracking page (`/track/:orderNo`)
- Full event timeline with milestone photos

### Billing
- Volumetric weight calculation (DIM factor 5000)
- Malaysia SST (8%) auto-applied
- FPX payment via Billplz
- DuitNow QR support
- Net-30 invoice with PDF generation

### Warehousing
- Multi-warehouse, zone, and bin management
- Stock tracking with SKU, batch, and expiry
- Inbound and outbound workflows

### Cross-border
- K1 (import) and K2 (export) customs declaration
- HS code duty rate lookup
- JKDM uCustoms API integration
- Duty-free threshold logic (RM 500)

### Notifications
- WhatsApp first (Malaysia preference), email fallback
- Malaysian phone number normalisation (+60)
- Bilingual templates (EN + BM)

---

## Malaysia-Specific Considerations

| Topic | Implementation |
|---|---|
| SST | 8% on taxable services, auto-calculated in invoice |
| Currency | MYR, formatted as `RM 1,234.56` |
| States | All 16 states/territories as enum |
| Phone | +60 normalisation for WhatsApp |
| Customs | JKDM uCustoms API, K1/K2/K8/K9 forms |
| Payment | FPX (online banking), DuitNow QR, cards |
| Routing | Malaysia OSM data via OSRM |
| Postcode | Remote area detection (Sabah/Sarawak surcharge) |

---

## Roadmap (post-MVP)

- [ ] Driver mobile app (React Native) with offline support
- [ ] Route optimization with time windows (VRP solver)
- [ ] ePOD (electronic proof of delivery) with legal e-signature
- [ ] MyInvois / e-Invoice (LHDN mandate 2025)
- [ ] Multi-carrier integration (Pos Malaysia, J&T, DHL)
- [ ] Customer self-service portal with booking widget
- [ ] Analytics dashboard (SLA, OTP, cost per kg)
- [ ] AI-powered demand forecasting

---

## Environment Variables

See `.env.example` for the full list of required variables.

## License

Proprietary — LogiTrack MY Sdn Bhd

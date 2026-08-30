# SafeRo — Part 1: Foundation Implementation Plan

## Goal
Establish a clean, scalable monorepo foundation for SafeRo (AI Risk Intelligence for Merchants) targeting the Razorpay Buildathon. This part creates the project structure, frontend shell, backend API scaffold, database schema, ML project structure, and documentation — without any fake ML results or fabricated metrics.

## Environment
- **Node.js**: v22.23.2 | **npm**: 10.9.8 | **Python**: 3.13.5 | **Git**: 2.55.0
- **OS**: Windows | **Workspace**: `c:\Users\burid\SafeRo` (empty)

---

## Proposed Changes

### Phase 1: Monorepo Scaffold & Root Config

#### [NEW] Root configuration files
- `package.json` — npm workspace root (`apps/*`, `packages/*`)
- `tsconfig.base.json` — shared TypeScript config
- `.gitignore` — Node, Python, IDE, env files
- `.env.example` — template for all env vars (no secrets)
- `README.md` — project overview, setup instructions, architecture summary

---

### Phase 2: Database (`/database`)

#### [NEW] `database/schema.sql`
Full PostgreSQL schema with 17 tables and relationships:

| Table | Purpose |
|-------|---------|
| `users` | Platform users (login, roles) |
| `merchants` | Merchant profiles, Razorpay merchant IDs |
| `customers` | Customer profiles linked to merchants |
| `accounts` | Customer payment accounts |
| `transactions` | Core transaction records |
| `devices` | Device fingerprints |
| `ip_addresses` | IP address records |
| `payment_methods` | Payment method records |
| `transaction_events` | Event log per transaction |
| `risk_scores` | ML-generated risk scores |
| `risk_signals` | Individual risk signals/features |
| `risk_cases` | Aggregated risk cases for review |
| `graph_relationships` | Entity relationship edges for graph analysis |
| `abuse_clusters` | Detected abuse ring clusters |
| `model_versions` | ML model version registry |
| `predictions` | Model prediction log |
| `investigations` | AI investigation sessions |

All tables use UUIDs, timestamps, proper foreign keys, and indexes.

#### [NEW] `database/migrations/001_initial_schema.sql`
Same schema as migration file for version tracking.

#### [NEW] `database/seed.sql`
Empty seed template (no fake data).

#### [NEW] `database/README.md`
Setup instructions for PostgreSQL.

---

### Phase 3: Shared Package (`/packages/shared`)

#### [NEW] `packages/shared/src/types/`
Shared TypeScript types mirroring the database schema — merchants, transactions, risk, cases, graphs, etc.

#### [NEW] `packages/shared/src/constants/`
Shared enums and constants (risk levels, transaction statuses, case statuses).

#### [NEW] `packages/shared/src/validation/`
Zod schemas for API request/response validation.

---

### Phase 4: Backend API (`/apps/api`)

#### [NEW] Fastify-based API server with:

| Module | Endpoints |
|--------|-----------|
| Health | `GET /health`, `GET /health/ready` |
| Auth | `POST /auth/login`, `POST /auth/register`, `POST /auth/logout` |
| Merchants | CRUD merchant profiles |
| Customers | CRUD customer profiles |
| Transactions | CRUD + list with filters |
| Risk | Risk scores, signals |
| Cases | Risk cases CRUD + status updates |
| Graph | Graph relationships, clusters |
| Analytics | Aggregation endpoints |
| Investigation | AI investigation sessions |

**Cross-cutting:**
- Centralized error handler with structured JSON errors
- Request validation via Zod
- Structured JSON logging (pino)
- Configuration management (env-based)
- Security middleware (helmet, CORS, rate limiting)
- Razorpay webhook endpoint (stub, no live credentials required)

---

### Phase 5: Frontend (`/apps/web`)

#### [NEW] React + TypeScript + Vite + Tailwind CSS app with:

**Layout:**
- Collapsible sidebar navigation
- Top header bar with search, notifications, user menu
- Responsive design (mobile-friendly)

**Pages (7 routes):**
1. **Dashboard** — Key metric cards (empty state), activity feed placeholder
2. **Transactions** — Table with filters, search, pagination (empty state)
3. **Risk Cases** — Case list with status filters (empty state)
4. **Abuse Rings** — Graph visualization placeholder (empty state)
5. **Analytics** — Chart containers (empty state)
6. **AI Investigation** — Investigation interface (empty state)
7. **Settings** — Configuration panels (empty state)

**Design:**
- Professional fintech dark theme with accent colors
- All empty states show "No data yet" or "Connect data source" messaging
- No fake ML scores, no fabricated metrics
- Reusable component library (Card, Table, Badge, Button, Modal, etc.)

---

### Phase 6: ML Service (`/ml`)

#### [NEW] Python project structure only:

```
ml/
├── pyproject.toml
├── requirements.txt
├── config/
│   └── config.yaml
├── src/
│   ├── data/           # Data loading, synthetic generators
│   ├── features/       # Feature engineering
│   ├── anomaly_detection/  # Anomaly detection models
│   ├── graph/          # Graph analysis (NetworkX)
│   ├── models/         # Model training pipelines
│   ├── calibration/    # Score calibration
│   ├── evaluation/     # Metrics, held-out test evaluation
│   └── inference/      # Prediction serving
├── tests/
│   └── test_config.py
└── README.md
```

**Includes:**
- `__init__.py` files with module docstrings
- Configuration loader (YAML-based)
- Synthetic data generator stub (structure only)
- pytest configuration

**Does NOT include:**
- Trained models
- Fake accuracy metrics
- Hardcoded risk scores

---

### Phase 7: Documentation (`/docs`)

| Document | Contents |
|----------|----------|
| `PRD.md` | Product Requirements Document — problem, users, capabilities |
| `TRD.md` | Technical Requirements Document — stack, architecture, constraints |
| `ARCHITECTURE.md` | System architecture diagram, component relationships |
| `DATA_STRATEGY.md` | Data sourcing plan (synthetic + open-source only) |
| `ML_EVALUATION.md` | Evaluation methodology (held-out test, honest metrics) |
| `SECURITY.md` | Security posture, defense-only constraints |

All documents describe **planned** architecture — no fabricated results.

---

### Phase 8: Tests (`/tests` + per-module)

| Area | Tests |
|------|-------|
| Frontend | Vitest — component rendering, route checks |
| Backend | Vitest — health endpoint, error handling, validation |
| Python | pytest — config loading, module imports |
| Integration | API health check script |

---

### Phase 9: Scripts (`/scripts`)

| Script | Purpose |
|--------|---------|
| `setup.sh` / `setup.ps1` | One-command project setup |
| `dev.sh` / `dev.ps1` | Start all services for development |

---

## Verification Plan

### Automated Tests
- `npm run test` in `apps/web` (Vitest)
- `npm run test` in `apps/api` (Vitest)
- `py -m pytest` in `ml/`
- TypeScript type checking: `npx tsc --noEmit` in both apps

### Manual Verification
- Frontend dev server starts and renders all routes
- Backend dev server starts and `/health` returns 200
- Database schema applies cleanly to PostgreSQL (if available)
- All empty states render correctly (no fake data)

---

## Open Questions

> [!IMPORTANT]
> **Tailwind CSS**: You specified Tailwind CSS in the tech stack. The default web dev guidelines say to avoid Tailwind unless explicitly requested — since you've explicitly listed it, I'll proceed with **Tailwind CSS v4** (latest). Please confirm if you prefer v3 instead.

> [!NOTE]
> **PostgreSQL availability**: Do you have PostgreSQL installed locally, or should I set up the schema to be applied manually later? I'll create the SQL files either way.

> [!NOTE]
> **Authentication**: For Part 1, auth routes will be stubs. Should I use JWT-based auth or session-based auth for the foundation? I'll default to **JWT** (standard for SaaS APIs).

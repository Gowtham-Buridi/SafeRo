# SafeRo — System Architecture

## Overview

SafeRo is a three-tier application: React frontend, Fastify API backend, and Python ML service, all backed by PostgreSQL.

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│              (Vite + Tailwind CSS v4)                    │
│                                                          │
│  Dashboard │ Transactions │ Risk Cases │ Abuse Rings     │
│  Analytics │ Investigation │ Settings                    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────▼──────────────────────────────────┐
│                   Fastify API Server                     │
│                                                          │
│  ┌─────────┐ ┌──────────┐ ┌───────┐ ┌──────────────┐   │
│  │  Auth   │ │Merchants │ │ Risk  │ │  Analytics   │   │
│  │ (JWT)   │ │Customers │ │ Cases │ │ Investigation│   │
│  └────┬────┘ └────┬─────┘ └───┬───┘ └──────┬───────┘   │
│       │           │           │             │            │
│  ┌────▼───────────▼───────────▼─────────────▼────────┐  │
│  │          PostgreSQL Connection Pool               │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │                                │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │           Razorpay Webhook Handler                │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────┘
                       │ SQL
┌──────────────────────▼──────────────────────────────────┐
│                    PostgreSQL 16                          │
│                                                          │
│  users ─ merchants ─ customers ─ accounts                │
│  transactions ─ devices ─ ip_addresses                   │
│  payment_methods ─ transaction_events                    │
│  risk_scores ─ risk_signals ─ risk_cases                │
│  graph_relationships ─ abuse_clusters                    │
│  model_versions ─ predictions ─ investigations           │
└──────────────────────▲──────────────────────────────────┘
                       │ SQL
┌──────────────────────┴──────────────────────────────────┐
│                  Python ML Service                        │
│                                                          │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────────┐  │
│  │  Data   │  │ Features │  │  Anomaly Detection    │  │
│  │ Loading │→ │  Engine  │→ │  (Isolation Forest,   │  │
│  │         │  │          │  │   LOF)                │  │
│  └─────────┘  └──────────┘  └───────────┬───────────┘  │
│                                         │               │
│  ┌──────────────┐  ┌───────────┐  ┌─────▼─────┐       │
│  │  Calibration │← │ Evaluation│← │   Graph   │       │
│  │  (Isotonic)  │  │ (Held-out)│  │  Analysis │       │
│  └──────┬───────┘  └───────────┘  │ (NetworkX)│       │
│         │                         └───────────┘       │
│  ┌──────▼───────┐                                      │
│  │  Inference   │                                      │
│  │  (Scoring)   │                                      │
│  └──────────────┘                                      │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

### Transaction Ingestion
1. Razorpay webhook → API `/webhooks/razorpay` endpoint
2. API validates and stores transaction in PostgreSQL
3. Transaction events logged for audit trail

### Risk Analysis Pipeline
1. ML service reads transactions from PostgreSQL
2. Feature engineering computes velocity, behavioral, and linkage features
3. Anomaly detection flags individual transactions
4. Graph analysis builds entity relationship network
5. Community detection identifies abuse clusters
6. Results written back to PostgreSQL (risk_scores, abuse_clusters)

### Case Management
1. High-risk detections auto-generate risk cases
2. Analysts review via web dashboard
3. Cases tracked through lifecycle (open → investigating → resolved)

## Key Design Decisions

1. **No ORM** — Direct SQL gives full control over queries and schema
2. **JSONB metadata** — Flexible extension points without schema changes
3. **Hashed PII** — Customer PII stored as hashes, never plaintext
4. **UUID primary keys** — No sequential IDs to prevent enumeration
5. **Graph in PostgreSQL** — Entity relationships stored relationally, loaded into NetworkX for analysis
6. **Defense-only** — No functionality that could be repurposed for attacks

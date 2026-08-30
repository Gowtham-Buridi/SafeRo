# SafeRo Database

## PostgreSQL Setup

### Using Docker Compose (recommended)

```bash
# From the project root:
docker compose up -d postgres

# Verify it's running:
docker compose ps

# Connect to the database:
docker compose exec postgres psql -U safero -d safero
```

The initial migration (`migrations/001_initial_schema.sql`) runs automatically on first start.

### Manual PostgreSQL Setup

1. Create a database:
   ```sql
   CREATE DATABASE safero;
   CREATE USER safero WITH PASSWORD 'safero_dev';
   GRANT ALL PRIVILEGES ON DATABASE safero TO safero;
   ```

2. Apply migrations:
   ```bash
   psql -U safero -d safero -f database/migrations/001_initial_schema.sql
   ```

3. (Optional) Apply seed data:
   ```bash
   psql -U safero -d safero -f database/seed.sql
   ```

## Schema

See `migrations/001_initial_schema.sql` for the complete schema definition.

### Tables

| Table | Description |
|-------|-------------|
| `users` | Platform users (authentication, roles) |
| `merchants` | Merchant profiles |
| `customers` | Customer profiles (hashed PII) |
| `accounts` | Customer payment accounts |
| `transactions` | Core transaction records |
| `devices` | Device fingerprints |
| `ip_addresses` | IP address metadata |
| `payment_methods` | Payment method records |
| `transaction_events` | Per-transaction event log |
| `risk_scores` | ML-generated risk scores |
| `risk_signals` | Individual risk signals |
| `risk_cases` | Aggregated risk cases |
| `graph_relationships` | Entity relationship graph edges |
| `abuse_clusters` | Detected abuse ring clusters |
| `model_versions` | ML model version registry |
| `predictions` | Model prediction log |
| `investigations` | AI investigation sessions |

## Migrations

Migrations are numbered sequentially: `001_`, `002_`, etc.
Each migration is a plain SQL file — no ORM dependency.

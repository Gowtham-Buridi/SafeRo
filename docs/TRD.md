# SafeRo — Technical Requirements Document

## Technology Stack

| Layer | Technology | Version | Justification |
|-------|-----------|---------|---------------|
| Frontend | React + TypeScript | 19.x | Modern SPA framework |
| Build | Vite | 6.x | Fast dev server, ESM-native |
| Styling | Tailwind CSS | 4.x | Utility-first, v4 with CSS-native config |
| Backend | Fastify + TypeScript | 5.x | High-performance Node.js framework |
| Database | PostgreSQL | 16.x | Robust relational DB with JSONB |
| ML | Python + scikit-learn | 3.13 / 1.5+ | Standard ML stack |
| Graph | NetworkX | 3.3+ | Graph analysis library |
| Validation | Zod (TS) / Pydantic (Python) | 3.x / 2.x | Schema validation |
| Testing | Vitest (TS) / pytest (Python) | 3.x / 8.x | Modern test runners |
| Container | Docker Compose | 3.8 | Local PostgreSQL |

## Architecture Constraints

1. **Monorepo** — Single repository with npm workspaces
2. **No microservices** — Keep it simple for a hackathon
3. **No paid services** — All free/open-source
4. **No ORM** — Direct SQL for transparency and control
5. **Defense-only** — No offense-capable functionality

## API Design

- RESTful JSON API
- Versioned routes (`/api/v1/`)
- Zod request validation
- Structured error responses (`{ success, error: { code, message } }`)
- Pagination with `page` and `page_size` query parameters
- JWT authentication (access + refresh tokens)

## Database Design

- 17 tables with proper foreign keys and indexes
- UUIDs for all primary keys
- JSONB for flexible metadata fields
- CHECK constraints for enum-like fields
- Auto-updating `updated_at` trigger
- Plain SQL migrations (no ORM)

## ML Pipeline Design

- YAML-based configuration
- Strict train/test separation
- Module structure: data → features → models → calibration → evaluation → inference
- Model versioning via `model_versions` table
- Prediction logging via `predictions` table

## Security Requirements

- Environment-based configuration (no hardcoded secrets)
- Helmet security headers
- CORS configuration
- Rate limiting (100 req/min)
- Input validation on all endpoints
- Password hashing (bcrypt)
- PII hashing in database
- Safe logging (redact auth headers)

## Performance Requirements

- API response time < 500ms for CRUD operations
- Frontend initial load < 3s
- ML inference batch processing support

## Testing Strategy

- Unit tests for frontend components (Vitest + Testing Library)
- API tests for route handlers (Vitest)
- ML tests for config and pipeline (pytest)
- Type checking via TypeScript strict mode

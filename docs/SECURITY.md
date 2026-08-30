# SafeRo — Security Posture

## Core Principle: Defense-Only

SafeRo is built exclusively for merchant protection. The system:
- **DOES** detect coordinated abuse patterns
- **DOES NOT** provide offense-capable functionality
- **DOES NOT** enable automated blocking/banning without human review
- **DOES NOT** store or expose raw PII

## Authentication & Authorization

### JWT Architecture
- **Access tokens**: Short-lived (15 minutes), carry user role
- **Refresh tokens**: Longer-lived (7 days), used to obtain new access tokens
- **Password hashing**: bcrypt with salt rounds = 10
- **Role-based access**: admin, analyst, viewer

### Production Hardening (Planned)
- Token revocation list
- Refresh token rotation
- Account lockout after failed attempts
- Multi-factor authentication

## Data Protection

### PII Handling
- All PII fields stored as SHA-256 hashes
- No plaintext email, phone, name, or IP addresses in the database
- Card numbers: only BIN (first 6-8 digits) and last 4 digits stored
- Full card numbers are never stored

### Secrets Management
- All secrets via environment variables
- `.env.example` provided as template (no real secrets)
- `.env` files excluded from version control via `.gitignore`
- No hardcoded API keys, passwords, or tokens in source code

## API Security

### Middleware Stack
1. **Helmet** — Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
2. **CORS** — Configured origin whitelist
3. **Rate Limiting** — 100 requests per minute per IP
4. **Input Validation** — Zod schemas on all request bodies and query parameters

### Safe Logging
- Authorization headers redacted from logs
- Cookie headers redacted from logs
- No PII in log output
- Structured JSON logging via pino

## Infrastructure

### Database
- PostgreSQL with parameterized queries (no SQL injection)
- Connection pooling with limits
- UUID primary keys (no sequential enumeration)

### Network
- API server binds to configurable port
- CORS restricts cross-origin requests
- Razorpay webhooks will verify signatures in production

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| SQL injection | Parameterized queries throughout |
| XSS | Helmet headers, React DOM escaping |
| CSRF | CORS + token-based auth (no cookies) |
| Credential stuffing | Rate limiting, bcrypt hashing |
| Data leakage | PII hashing, safe logging |
| Secret exposure | Environment variables, .gitignore |
| Enumeration | UUID keys, rate limiting |

## Compliance Notes

- No real personal data is used in development
- All training data is synthetic or from open-source datasets
- System is designed for defense only
- No automated punitive actions without human review

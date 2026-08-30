# SafeRo — Data Strategy

## Principles

1. **No real personal or payment data** — All data used in development and evaluation is synthetic or from legally usable public sources.
2. **Defense-only** — Data is used exclusively for merchant protection.
3. **Honest evaluation** — Metrics are computed on held-out test sets and reported truthfully.

## Data Sources

### Synthetic Data (Primary)
SafeRo generates its own synthetic dataset that simulates:
- Normal merchant transaction patterns
- Coordinated abuse rings with shared attributes
- Various payment methods (card, UPI, netbanking, wallet)
- Device fingerprints and IP addresses
- Temporal patterns (time-of-day, day-of-week)

The synthetic generator is configurable (see `ml/src/data/synthetic.py`).

### Open-Source Datasets (Supplementary)
Potential datasets for benchmarking (all free/open-source):
- **IEEE-CIS Fraud Detection** — Kaggle competition dataset
- **Synthetic Financial Datasets** — Generated using PaySim
- **Credit Card Fraud Detection** — Kaggle dataset (anonymized)

These will only be used if they are legally available and suitable for our use case.

### Razorpay Test Mode
- SafeRo integrates with Razorpay's test mode API
- Test transactions can flow through the webhook endpoint
- No live payment credentials are required

## Data Handling

### PII Protection
All personally identifiable information is hashed before storage:
- `email_hash` — SHA-256 hash of email
- `phone_hash` — SHA-256 hash of phone number
- `name_hash` — SHA-256 hash of name
- `fingerprint_hash` — Hash of device fingerprint
- `ip_hash` — Hash of IP address
- `method_hash` — Hash of payment method identifier

### Data Splits
- **Training set**: 80% of data, used for model development
- **Test set**: 20% of data, strictly held out, used only for final evaluation
- Splits are stratified to maintain class balance
- Test set is never used during training or hyperparameter tuning

## Status

| Component | Status |
|-----------|--------|
| Synthetic data generator | Structure created, implementation pending |
| Data loading pipeline | Structure created, implementation pending |
| Razorpay webhook handler | Stub created |
| PII hashing | Schema designed, implementation pending |

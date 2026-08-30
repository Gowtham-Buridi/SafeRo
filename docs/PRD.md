# SafeRo — Product Requirements Document

## Problem Statement

Merchants face significant financial losses from coordinated abuse rings — groups of fraudulent actors who share devices, IP addresses, and payment methods to exploit return policies, commit refund fraud, and conduct chargeback abuse. Traditional rule-based fraud detection often fails to identify these coordinated patterns because each individual transaction may appear legitimate in isolation.

## Product Vision

SafeRo provides **AI-powered risk intelligence** that helps merchants detect and respond to coordinated abuse rings by analyzing transaction behavior, identifying anomalies, and mapping entity relationships through graph analysis.

## Core Principle

**Defense-only.** SafeRo is built exclusively for merchant protection. It does not create offense-capable functionality.

## Target Users

1. **Risk Analysts** — Investigate flagged cases, review risk signals
2. **Merchant Owners** — Monitor business risk exposure
3. **Platform Operators** — Configure detection policies, manage integrations

## Primary Capability

### Coordinated Abuse-Ring Detection

Detect clusters of accounts/entities that exhibit coordinated behavior:

- **Device fingerprint sharing** — Multiple accounts using the same device
- **IP address overlap** — Unusual clustering on shared IPs (VPN/proxy detection)
- **Payment method reuse** — Same cards/wallets across seemingly unrelated accounts
- **Behavioral similarity** — Coordinated timing, amounts, and transaction patterns
- **Graph community detection** — Network analysis to find connected components

## Supporting Capabilities (Planned)

1. **Fraud-spike detection** — Alert on sudden increases in transaction failures or suspicious patterns
2. **Chargeback intelligence** — Predict and manage chargeback risk
3. **Return/RTO risk intelligence** — Identify return abuse patterns

## Key Requirements

### Razorpay Integration
- Test-mode webhook processing
- Transaction data ingestion
- Must work fully with synthetic/test data (no live credentials required)

### ML/AI
- Use only open-source ML tools (scikit-learn, NetworkX)
- Evaluate on strictly held-out test sets
- Report honest precision, recall, and false-positive cost
- Do not fabricate AI results or metrics
- Do not use an LLM as the risk detector

### Data
- Use only synthetic or legally usable public datasets
- No real personal or payment information
- Hash all PII fields

### Security
- Defense-only architecture
- No secrets in source code
- Input validation on all endpoints
- Safe logging (no PII in logs)

## Success Criteria

1. Working abuse-ring detector with honest evaluation metrics
2. Clear documentation of approach and limitations
3. Functional web interface for risk case management
4. Clean, maintainable codebase suitable for a hackathon demo

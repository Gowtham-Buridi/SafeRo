-- ============================================================
-- SafeRo — Initial Database Schema
-- PostgreSQL 16+
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ───────────────────────────────────────────────────
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    role            VARCHAR(50)  NOT NULL DEFAULT 'analyst'
                    CHECK (role IN ('admin', 'analyst', 'viewer')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ─── MERCHANTS ───────────────────────────────────────────────
CREATE TABLE merchants (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razorpay_merchant_id VARCHAR(255) UNIQUE,
    name                VARCHAR(255) NOT NULL,
    business_type       VARCHAR(100),
    category            VARCHAR(100),
    website             VARCHAR(255),
    risk_level          VARCHAR(20)  DEFAULT 'unknown'
                        CHECK (risk_level IN ('low', 'medium', 'high', 'critical', 'unknown')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_merchants_razorpay_id ON merchants(razorpay_merchant_id);
CREATE INDEX idx_merchants_risk_level ON merchants(risk_level);

-- ─── CUSTOMERS ───────────────────────────────────────────────
CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    external_id     VARCHAR(255),
    email_hash      VARCHAR(255),
    phone_hash      VARCHAR(255),
    name_hash       VARCHAR(255),
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_count INTEGER NOT NULL DEFAULT 0,
    total_amount    NUMERIC(15, 2) NOT NULL DEFAULT 0,
    risk_level      VARCHAR(20) DEFAULT 'unknown'
                    CHECK (risk_level IN ('low', 'medium', 'high', 'critical', 'unknown')),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_merchant ON customers(merchant_id);
CREATE INDEX idx_customers_email_hash ON customers(email_hash);
CREATE INDEX idx_customers_risk_level ON customers(risk_level);

-- ─── ACCOUNTS ────────────────────────────────────────────────
CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    account_type    VARCHAR(50) NOT NULL
                    CHECK (account_type IN ('bank', 'wallet', 'card', 'upi', 'other')),
    account_hash    VARCHAR(255),
    provider        VARCHAR(100),
    is_verified     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accounts_customer ON accounts(customer_id);
CREATE INDEX idx_accounts_hash ON accounts(account_hash);

-- ─── DEVICES ─────────────────────────────────────────────────
CREATE TABLE devices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fingerprint_hash    VARCHAR(255) NOT NULL,
    device_type         VARCHAR(50),
    os                  VARCHAR(100),
    browser             VARCHAR(100),
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_count   INTEGER NOT NULL DEFAULT 0,
    unique_customer_count INTEGER NOT NULL DEFAULT 0,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_devices_fingerprint ON devices(fingerprint_hash);

-- ─── IP ADDRESSES ────────────────────────────────────────────
CREATE TABLE ip_addresses (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_hash             VARCHAR(255) NOT NULL,
    geo_country         VARCHAR(10),
    geo_region          VARCHAR(100),
    geo_city            VARCHAR(100),
    is_vpn              BOOLEAN DEFAULT FALSE,
    is_tor              BOOLEAN DEFAULT FALSE,
    is_proxy            BOOLEAN DEFAULT FALSE,
    is_datacenter       BOOLEAN DEFAULT FALSE,
    first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_count   INTEGER NOT NULL DEFAULT 0,
    unique_customer_count INTEGER NOT NULL DEFAULT 0,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ip_hash ON ip_addresses(ip_hash);

-- ─── PAYMENT METHODS ─────────────────────────────────────────
CREATE TABLE payment_methods (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    method_type         VARCHAR(50) NOT NULL
                        CHECK (method_type IN ('card', 'upi', 'netbanking', 'wallet', 'emi', 'other')),
    method_hash         VARCHAR(255),
    card_bin            VARCHAR(8),
    card_last4          VARCHAR(4),
    card_network        VARCHAR(50),
    card_issuer         VARCHAR(100),
    is_international    BOOLEAN DEFAULT FALSE,
    first_used_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_count   INTEGER NOT NULL DEFAULT 0,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_customer ON payment_methods(customer_id);
CREATE INDEX idx_payment_methods_hash ON payment_methods(method_hash);
CREATE INDEX idx_payment_methods_bin ON payment_methods(card_bin);

-- ─── TRANSACTIONS ────────────────────────────────────────────
CREATE TABLE transactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id         UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    customer_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
    payment_method_id   UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    device_id           UUID REFERENCES devices(id) ON DELETE SET NULL,
    ip_address_id       UUID REFERENCES ip_addresses(id) ON DELETE SET NULL,
    razorpay_payment_id VARCHAR(255),
    razorpay_order_id   VARCHAR(255),
    amount              NUMERIC(15, 2) NOT NULL,
    currency            VARCHAR(3) NOT NULL DEFAULT 'INR',
    status              VARCHAR(50) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'disputed')),
    payment_method_type VARCHAR(50),
    description         TEXT,
    error_code          VARCHAR(100),
    error_description   TEXT,
    is_international    BOOLEAN DEFAULT FALSE,
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_merchant ON transactions(merchant_id);
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at);
CREATE INDEX idx_transactions_amount ON transactions(amount);
CREATE INDEX idx_transactions_razorpay_payment ON transactions(razorpay_payment_id);

-- ─── TRANSACTION EVENTS ──────────────────────────────────────
CREATE TABLE transaction_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    event_type      VARCHAR(100) NOT NULL,
    event_data      JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_txn_events_transaction ON transaction_events(transaction_id);
CREATE INDEX idx_txn_events_type ON transaction_events(event_type);
CREATE INDEX idx_txn_events_created ON transaction_events(created_at);

-- ─── RISK SCORES ─────────────────────────────────────────────
CREATE TABLE risk_scores (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     VARCHAR(50) NOT NULL
                    CHECK (entity_type IN ('transaction', 'customer', 'merchant', 'device', 'ip_address', 'payment_method')),
    entity_id       UUID NOT NULL,
    model_version_id UUID,
    score           NUMERIC(5, 4) NOT NULL CHECK (score >= 0 AND score <= 1),
    risk_level      VARCHAR(20) NOT NULL
                    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
    confidence      NUMERIC(5, 4) CHECK (confidence >= 0 AND confidence <= 1),
    factors         JSONB DEFAULT '[]',
    metadata        JSONB DEFAULT '{}',
    scored_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_scores_entity ON risk_scores(entity_type, entity_id);
CREATE INDEX idx_risk_scores_level ON risk_scores(risk_level);
CREATE INDEX idx_risk_scores_scored ON risk_scores(scored_at);

-- ─── RISK SIGNALS ────────────────────────────────────────────
CREATE TABLE risk_signals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type     VARCHAR(50) NOT NULL
                    CHECK (entity_type IN ('transaction', 'customer', 'merchant', 'device', 'ip_address', 'payment_method')),
    entity_id       UUID NOT NULL,
    signal_type     VARCHAR(100) NOT NULL,
    signal_value    NUMERIC(10, 4),
    severity        VARCHAR(20) NOT NULL
                    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    description     TEXT,
    evidence        JSONB DEFAULT '{}',
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_signals_entity ON risk_signals(entity_type, entity_id);
CREATE INDEX idx_risk_signals_type ON risk_signals(signal_type);
CREATE INDEX idx_risk_signals_severity ON risk_signals(severity);

-- ─── RISK CASES ──────────────────────────────────────────────
CREATE TABLE risk_cases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id     UUID REFERENCES merchants(id) ON DELETE SET NULL,
    case_type       VARCHAR(50) NOT NULL
                    CHECK (case_type IN ('abuse_ring', 'fraud', 'chargeback', 'return_abuse', 'other')),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(50) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'investigating', 'confirmed', 'resolved', 'false_positive', 'escalated')),
    severity        VARCHAR(20) NOT NULL DEFAULT 'medium'
                    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    assigned_to     UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_count    INTEGER NOT NULL DEFAULT 0,
    total_amount    NUMERIC(15, 2) DEFAULT 0,
    evidence        JSONB DEFAULT '{}',
    resolution      TEXT,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_cases_merchant ON risk_cases(merchant_id);
CREATE INDEX idx_risk_cases_type ON risk_cases(case_type);
CREATE INDEX idx_risk_cases_status ON risk_cases(status);
CREATE INDEX idx_risk_cases_severity ON risk_cases(severity);

-- ─── GRAPH RELATIONSHIPS ─────────────────────────────────────
CREATE TABLE graph_relationships (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_type     VARCHAR(50) NOT NULL
                    CHECK (source_type IN ('customer', 'device', 'ip_address', 'payment_method', 'account', 'merchant')),
    source_id       UUID NOT NULL,
    target_type     VARCHAR(50) NOT NULL
                    CHECK (target_type IN ('customer', 'device', 'ip_address', 'payment_method', 'account', 'merchant')),
    target_id       UUID NOT NULL,
    relationship    VARCHAR(100) NOT NULL,
    weight          NUMERIC(10, 4) DEFAULT 1.0,
    properties      JSONB DEFAULT '{}',
    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_graph_source ON graph_relationships(source_type, source_id);
CREATE INDEX idx_graph_target ON graph_relationships(target_type, target_id);
CREATE INDEX idx_graph_relationship ON graph_relationships(relationship);

-- ─── ABUSE CLUSTERS ──────────────────────────────────────────
CREATE TABLE abuse_clusters (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id         UUID REFERENCES risk_cases(id) ON DELETE SET NULL,
    cluster_type    VARCHAR(50) NOT NULL
                    CHECK (cluster_type IN ('device_sharing', 'ip_sharing', 'payment_reuse', 'behavioral', 'mixed')),
    detection_method VARCHAR(100) NOT NULL,
    confidence      NUMERIC(5, 4) CHECK (confidence >= 0 AND confidence <= 1),
    member_count    INTEGER NOT NULL DEFAULT 0,
    member_ids      JSONB NOT NULL DEFAULT '[]',
    shared_attributes JSONB DEFAULT '{}',
    total_amount    NUMERIC(15, 2) DEFAULT 0,
    risk_level      VARCHAR(20) DEFAULT 'unknown'
                    CHECK (risk_level IN ('low', 'medium', 'high', 'critical', 'unknown')),
    metadata        JSONB DEFAULT '{}',
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_abuse_clusters_case ON abuse_clusters(case_id);
CREATE INDEX idx_abuse_clusters_type ON abuse_clusters(cluster_type);
CREATE INDEX idx_abuse_clusters_risk ON abuse_clusters(risk_level);

-- ─── MODEL VERSIONS ──────────────────────────────────────────
CREATE TABLE model_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_name      VARCHAR(100) NOT NULL,
    version         VARCHAR(50) NOT NULL,
    model_type      VARCHAR(100) NOT NULL,
    description     TEXT,
    hyperparameters JSONB DEFAULT '{}',
    metrics         JSONB DEFAULT '{}',
    training_data_info JSONB DEFAULT '{}',
    artifact_path   VARCHAR(500),
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    promoted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(model_name, version)
);

CREATE INDEX idx_model_versions_name ON model_versions(model_name);
CREATE INDEX idx_model_versions_active ON model_versions(is_active);

-- ─── PREDICTIONS ─────────────────────────────────────────────
CREATE TABLE predictions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_version_id UUID NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID NOT NULL,
    prediction      JSONB NOT NULL,
    probability     NUMERIC(5, 4),
    latency_ms      INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_predictions_model ON predictions(model_version_id);
CREATE INDEX idx_predictions_entity ON predictions(entity_type, entity_id);
CREATE INDEX idx_predictions_created ON predictions(created_at);

-- ─── INVESTIGATIONS ──────────────────────────────────────────
CREATE TABLE investigations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id         UUID REFERENCES risk_cases(id) ON DELETE SET NULL,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    status          VARCHAR(50) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'archived')),
    query           TEXT,
    findings        JSONB DEFAULT '{}',
    entities_examined JSONB DEFAULT '[]',
    timeline        JSONB DEFAULT '[]',
    conclusion      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_investigations_case ON investigations(case_id);
CREATE INDEX idx_investigations_user ON investigations(user_id);
CREATE INDEX idx_investigations_status ON investigations(status);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name FROM information_schema.columns
        WHERE column_name = 'updated_at'
        AND table_schema = 'public'
    LOOP
        EXECUTE format('
            CREATE TRIGGER set_updated_at
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()',
            t
        );
    END LOOP;
END;
$$;

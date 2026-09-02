-- ============================================================
-- SafeRo — Migration 003: Webhook Delivery Log Table
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_delivery_log (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    gateway                     VARCHAR(50) NOT NULL,
    url_path                    VARCHAR(255) NOT NULL,
    resolved_merchant_id        VARCHAR(255) NOT NULL,
    merchant_resolution_source  VARCHAR(50) NOT NULL,
    signature_verified          BOOLEAN NOT NULL DEFAULT FALSE,
    signature_failure_reason    VARCHAR(255),
    outcome                     VARCHAR(50) NOT NULL,
    reason                      TEXT NOT NULL,
    status_code                 INTEGER NOT NULL,
    payment_id                  VARCHAR(255),
    amount                      NUMERIC(15, 2),
    currency                    VARCHAR(10),
    payload_preview             TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wh_delivery_merchant ON webhook_delivery_log(resolved_merchant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wh_delivery_timestamp ON webhook_delivery_log(timestamp DESC);

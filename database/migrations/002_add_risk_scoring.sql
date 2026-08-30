-- ============================================================
-- SafeRo — Migration 002: Real-Time ML Model Version & Transactions Environment
-- ============================================================

-- 1. Add environment column to transactions for multi-tenant / live vs test segmentation
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'live';
CREATE INDEX IF NOT EXISTS idx_transactions_environment ON transactions(environment);
ALTER TABLE transactions ALTER COLUMN merchant_id DROP NOT NULL;

-- 2. Upsert real model metadata into model_versions
INSERT INTO model_versions (
    model_name,
    version,
    model_type,
    description,
    hyperparameters,
    metrics,
    training_data_info,
    artifact_path,
    is_active,
    promoted_at
) VALUES (
    'logistic_regression_risk_engine',
    'v1',
    'logistic_regression',
    'Supervised risk classification model with isotonic calibration and 65 behavioral/graph features',
    '{"max_iter": 1000, "class_weight": "balanced", "random_state": 42}'::jsonb,
    '{
        "sample_size": 300,
        "precision": 1.0,
        "recall": 0.857,
        "f1": 0.923,
        "roc_auc": 0.981,
        "pr_auc": 0.884,
        "calibration_brier_score": 0.00745
    }'::jsonb,
    '{"features_count": 65, "train_samples": 25000}'::jsonb,
    'ml/models/artifacts/model_v1.joblib',
    TRUE,
    NOW()
) ON CONFLICT (model_name, version) DO UPDATE SET
    metrics = EXCLUDED.metrics,
    is_active = TRUE,
    updated_at = NOW();

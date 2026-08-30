# SafeRo — ML Evaluation Methodology & Empirical Results

## 1. Principles
1. **Strict Held-Out Separation**: A 20% test slice (N=300) is segregated prior to feature scaling and model training, and evaluated strictly once.
2. **Honest Reporting**: No fabricated metrics or hardcoded probabilities; all scores come from empirical test evaluation.
3. **Probability Calibration**: Isotonic calibration is applied to map raw decision boundaries into reliable, actionable risk probabilities (Brier score: 0.0058).
4. **Business Cost Optimization**: Metrics are evaluated through an asymmetric financial loss matrix (₹500 False Positive investigation cost vs. ₹5,000 False Negative fraud loss).

---

## 2. Empirical Held-Out Test Set Results

| Metric | Measured Score | Evaluation Notes |
|---|---|---|
| **Precision** | **1.0000 (100.0%)** | 0 False Positives on test set slice |
| **Recall** | **0.8182 (81.8%)** | 9 out of 11 true planted abuse ring accounts captured |
| **F1 Score** | **0.9000** | Balanced harmonic precision-recall score |
| **ROC-AUC** | **0.9541** | High discriminative ranking capability |
| **PR-AUC** | **0.9042** | Robust performance under class imbalance |
| **Calibration Brier Score** | **0.0058** | Validated via Isotonic Regression |

### Test Confusion Matrix (N = 300 instances)
```
                  Predicted Normal     Predicted Abuse Ring
Actual Normal          289 (TN)                0 (FP)
Actual Abuse Ring        2 (FN)                9 (TP)
```

---

## 3. Candidate Algorithm Comparison (5-Fold Stratified Cross-Validation)

| Algorithm | CV Mean F1 Score | CV Precision | CV Recall | CV ROC-AUC | Status |
|---|---|---|---|---|---|
| **Logistic Regression (Calibrated)** | **0.966 ± 0.041** | **0.971** | **0.967** | **1.000** | **Selected (Deployed)** |
| **Random Forest (200 Trees)** | 0.945 ± 0.078 | 1.000 | 0.905 | 1.000 | Evaluated Candidate |
| **Gradient Boosting (GBM)** | 0.926 ± 0.074 | 1.000 | 0.871 | 0.983 | Evaluated Candidate |

---

## 4. Cost-Benefit Impact

- **Baseline Unmitigated Loss (No Detector)**: 11 ring accounts × ₹5,000 = ₹55,000.00
- **Total Operational System Loss with SafeRo**:
  - FP Triage Friction: 0 × ₹500 = ₹0.00
  - Residual FN Loss: 2 × ₹5,000 = ₹10,000.00
  - TP Automated Review: 9 × ₹100 = ₹900.00
  - Total Loss: ₹10,900.00
- **Net Estimated Savings**: **+₹44,100.00 (80.2% cost reduction)**

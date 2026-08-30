"""
Feature engineering for risk detection.

Computes transaction, account, relationship, graph, and temporal features.
All features are derived from observable data — no target leakage.
"""

import numpy as np
import pandas as pd


def compute_transaction_features(transactions: pd.DataFrame) -> pd.DataFrame:
    """
    Compute per-transaction behavioral features.

    Features:
    - amount_log: log-transformed amount
    - amount_zscore: z-score of amount within customer
    - hour_of_day: transaction hour (0-23)
    - is_night: transaction between 11pm-5am
    - is_weekend: Saturday/Sunday
    - status_failed: binary indicator
    - status_disputed: binary indicator
    - status_refunded: binary indicator
    """
    df = transactions.copy()
    df["created_at"] = pd.to_datetime(df["created_at"])

    # Amount features
    df["amount_log"] = np.log1p(df["amount"])
    cust_stats = df.groupby("customer_id")["amount"].agg(["mean", "std"]).reset_index()
    cust_stats.columns = ["customer_id", "cust_amount_mean", "cust_amount_std"]
    df = df.merge(cust_stats, on="customer_id", how="left")
    df["cust_amount_std"] = df["cust_amount_std"].fillna(1.0)
    df["amount_zscore"] = (df["amount"] - df["cust_amount_mean"]) / df["cust_amount_std"].clip(lower=1.0)

    # Temporal features
    df["hour_of_day"] = df["created_at"].dt.hour
    df["is_night"] = ((df["hour_of_day"] >= 23) | (df["hour_of_day"] <= 4)).astype(int)
    df["day_of_week"] = df["created_at"].dt.dayofweek
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)

    # Status features
    df["status_failed"] = (df["status"] == "failed").astype(int)
    df["status_disputed"] = (df["status"] == "disputed").astype(int)
    df["status_refunded"] = (df["status"] == "refunded").astype(int)

    # Payment method type encoding
    pm_dummies = pd.get_dummies(df["payment_method_type"], prefix="pm")
    df = pd.concat([df, pm_dummies], axis=1)

    # Drop intermediate columns
    df = df.drop(columns=["cust_amount_mean", "cust_amount_std"], errors="ignore")

    return df


def compute_account_features(transactions: pd.DataFrame) -> pd.DataFrame:
    """
    Compute per-customer account-level features aggregated from transactions.

    Features:
    - account_age_days: days since first transaction
    - transaction_count: total transactions
    - total_amount: sum of all transaction amounts
    - avg_amount: mean transaction amount
    - std_amount: standard deviation of amounts
    - fail_rate: fraction of failed transactions
    - dispute_rate: fraction of disputed transactions
    - refund_rate: fraction of refunded transactions
    - unique_merchants: number of distinct merchants
    - unique_devices: number of distinct devices
    - unique_ips: number of distinct IPs
    - unique_pms: number of distinct payment methods
    """
    df = transactions.copy()
    df["created_at"] = pd.to_datetime(df["created_at"])

    agg = df.groupby("customer_id").agg(
        first_txn=("created_at", "min"),
        last_txn=("created_at", "max"),
        transaction_count=("transaction_id", "count"),
        total_amount=("amount", "sum"),
        avg_amount=("amount", "mean"),
        std_amount=("amount", "std"),
        fail_count=("status", lambda x: (x == "failed").sum()),
        dispute_count=("status", lambda x: (x == "disputed").sum()),
        refund_count=("status", lambda x: (x == "refunded").sum()),
        unique_merchants=("merchant_id", "nunique"),
        unique_devices=("device_id", "nunique"),
        unique_ips=("ip_id", "nunique"),
        unique_pms=("pm_id", "nunique"),
    ).reset_index()

    agg["account_age_days"] = (agg["last_txn"] - agg["first_txn"]).dt.days.clip(lower=1)
    agg["fail_rate"] = agg["fail_count"] / agg["transaction_count"]
    agg["dispute_rate"] = agg["dispute_count"] / agg["transaction_count"]
    agg["refund_rate"] = agg["refund_count"] / agg["transaction_count"]
    agg["std_amount"] = agg["std_amount"].fillna(0)

    # Velocity: transactions per day
    agg["txn_per_day"] = agg["transaction_count"] / agg["account_age_days"]

    agg = agg.drop(columns=["first_txn", "last_txn", "fail_count",
                              "dispute_count", "refund_count"])

    return agg


def compute_velocity_features(transactions: pd.DataFrame,
                               windows_hours: list[int] | None = None) -> pd.DataFrame:
    """
    Compute transaction velocity features over sliding time windows.

    For each transaction, computes counts and amounts within
    the preceding N hours for that customer.
    """
    if windows_hours is None:
        windows_hours = [1, 6, 24, 72, 168]

    df = transactions.copy()
    df["created_at"] = pd.to_datetime(df["created_at"])
    df = df.sort_values(["customer_id", "created_at"])

    for w in windows_hours:
        col_count = f"velocity_count_{w}h"
        col_amount = f"velocity_amount_{w}h"
        df[col_count] = 0
        df[col_amount] = 0.0

    # Compute velocity per customer
    for cust_id, group in df.groupby("customer_id"):
        times = group["created_at"].values
        amounts = group["amount"].values
        indices = group.index.values

        for i in range(len(times)):
            for w in windows_hours:
                window_start = times[i] - np.timedelta64(w, "h")
                mask = (times[:i] >= window_start) & (times[:i] < times[i])
                df.loc[indices[i], f"velocity_count_{w}h"] = int(mask.sum())
                df.loc[indices[i], f"velocity_amount_{w}h"] = float(amounts[:i][mask].sum())

    return df


def compute_relationship_features(transactions: pd.DataFrame) -> pd.DataFrame:
    """
    Compute relationship/sharing features for each customer.

    Features measure how many OTHER customers share the same
    devices, IPs, and payment methods — signals for coordinated abuse.
    """
    df = transactions.copy()

    # For each entity type, count unique customers per entity
    device_sharing = df.groupby("device_id")["customer_id"].nunique().reset_index()
    device_sharing.columns = ["device_id", "device_customer_count"]

    ip_sharing = df.groupby("ip_id")["customer_id"].nunique().reset_index()
    ip_sharing.columns = ["ip_id", "ip_customer_count"]

    pm_sharing = df.groupby("pm_id")["customer_id"].nunique().reset_index()
    pm_sharing.columns = ["pm_id", "pm_customer_count"]

    # Per-customer: max sharing counts across their entities
    cust_devices = df[["customer_id", "device_id"]].drop_duplicates()
    cust_devices = cust_devices.merge(device_sharing, on="device_id")
    cust_device_agg = cust_devices.groupby("customer_id").agg(
        max_device_sharing=("device_customer_count", "max"),
        avg_device_sharing=("device_customer_count", "mean"),
    ).reset_index()

    cust_ips = df[["customer_id", "ip_id"]].drop_duplicates()
    cust_ips = cust_ips.merge(ip_sharing, on="ip_id")
    cust_ip_agg = cust_ips.groupby("customer_id").agg(
        max_ip_sharing=("ip_customer_count", "max"),
        avg_ip_sharing=("ip_customer_count", "mean"),
    ).reset_index()

    cust_pms = df[["customer_id", "pm_id"]].drop_duplicates()
    cust_pms = cust_pms.merge(pm_sharing, on="pm_id")
    cust_pm_agg = cust_pms.groupby("customer_id").agg(
        max_pm_sharing=("pm_customer_count", "max"),
        avg_pm_sharing=("pm_customer_count", "mean"),
    ).reset_index()

    # Merge all
    result = cust_device_agg.merge(cust_ip_agg, on="customer_id", how="outer")
    result = result.merge(cust_pm_agg, on="customer_id", how="outer")
    result = result.fillna(1.0)

    # Combined sharing score
    result["total_sharing_score"] = (
        result["max_device_sharing"] +
        result["max_ip_sharing"] +
        result["max_pm_sharing"]
    )

    return result


def build_feature_matrix(
    transactions: pd.DataFrame,
    compute_velocity: bool = True,
) -> pd.DataFrame:
    """
    Build the complete feature matrix for model training.

    Merges transaction, account, velocity, and relationship features
    into a single customer-level feature matrix with ground-truth labels.

    Returns DataFrame with customer_id, feature columns, and labels.
    """
    # Transaction features (per-transaction, then aggregate to customer)
    txn_feats = compute_transaction_features(transactions)

    # Account features (already per-customer)
    acct_feats = compute_account_features(transactions)

    # Relationship features (per-customer)
    rel_feats = compute_relationship_features(transactions)

    # Aggregate transaction features to customer level
    txn_agg_cols = ["amount_log", "amount_zscore", "is_night", "is_weekend",
                    "status_failed", "status_disputed", "status_refunded"]

    # Add velocity features if computed
    if compute_velocity:
        txn_feats = compute_velocity_features(txn_feats, [1, 6, 24])
        txn_agg_cols.extend([f"velocity_count_{w}h" for w in [1, 6, 24]])
        txn_agg_cols.extend([f"velocity_amount_{w}h" for w in [1, 6, 24]])

    # Ensure columns exist before aggregating
    existing_cols = [c for c in txn_agg_cols if c in txn_feats.columns]

    txn_customer_agg = txn_feats.groupby("customer_id")[existing_cols].agg(
        ["mean", "max", "sum"]
    )
    txn_customer_agg.columns = ["_".join(col) for col in txn_customer_agg.columns]
    txn_customer_agg = txn_customer_agg.reset_index()

    # Get ground truth labels (customer level)
    labels = transactions.groupby("customer_id").agg(
        is_abuse_ring=("is_abuse_ring", "max"),
        ring_id=("ring_id", "max"),
    ).reset_index()

    # Merge everything
    features = labels.merge(acct_feats, on="customer_id", how="left")
    features = features.merge(rel_feats, on="customer_id", how="left")
    features = features.merge(txn_customer_agg, on="customer_id", how="left")

    # Fill NaN
    features = features.fillna(0)

    return features


def get_feature_columns(feature_matrix: pd.DataFrame) -> list[str]:
    """Get the list of feature column names (excluding ID and label columns)."""
    exclude = {"customer_id", "is_abuse_ring", "ring_id", "is_fraudulent"}
    return [c for c in feature_matrix.columns if c not in exclude]

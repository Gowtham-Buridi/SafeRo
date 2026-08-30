"""
Synthetic transaction and entity data generator for SafeRo.

Generates realistic-looking but entirely synthetic data including:
- Legitimate merchants, customers, transactions
- Coordinated abuse rings with shared devices/IPs/payment methods
- Behavioral anomalies and temporal patterns
- Ground-truth labels for supervised learning

All data is synthetic. No real personal or payment information is used.
"""

import hashlib
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd


@dataclass
class GeneratorConfig:
    """Configuration for synthetic data generation."""
    num_merchants: int = 10
    num_customers: int = 2000
    num_transactions: int = 50000
    abuse_ring_count: int = 8
    abuse_ring_size_range: tuple[int, int] = (3, 15)
    date_range_days: int = 90
    random_seed: int = 42
    # Split ratios (must sum to 1.0)
    train_ratio: float = 0.6
    val_ratio: float = 0.2
    test_ratio: float = 0.2
    # Fraud parameters
    fraud_rate: float = 0.05  # 5% of non-ring transactions are individually fraudulent
    output_dir: str = "data/generated"


def _hash(value: str) -> str:
    """SHA-256 hash for PII simulation."""
    return hashlib.sha256(value.encode()).hexdigest()[:16]


def _uuid() -> str:
    return str(uuid.uuid4())


def generate_synthetic_dataset(config: GeneratorConfig | None = None) -> dict[str, pd.DataFrame]:
    """
    Generate a complete synthetic dataset with ground-truth labels.

    Returns dict of DataFrames: merchants, customers, devices, ip_addresses,
    payment_methods, transactions, graph_relationships, abuse_rings_truth.
    Also saves CSVs to config.output_dir.
    """
    if config is None:
        config = GeneratorConfig()

    rng = np.random.default_rng(config.random_seed)

    # ── Merchants ──────────────────────────────────────────
    merchant_types = ["ecommerce", "retail", "food", "travel", "digital", "services"]
    merchants = pd.DataFrame({
        "merchant_id": [_uuid() for _ in range(config.num_merchants)],
        "name": [f"Merchant_{i:03d}" for i in range(config.num_merchants)],
        "business_type": rng.choice(merchant_types, config.num_merchants),
        "category": rng.choice(["electronics", "fashion", "grocery", "entertainment",
                                 "utilities", "education"], config.num_merchants),
    })

    # ── Devices ────────────────────────────────────────────
    num_devices = config.num_customers + config.num_customers // 5  # some shared
    device_types = ["mobile", "desktop", "tablet"]
    os_types = ["Android", "iOS", "Windows", "macOS", "Linux"]
    browsers = ["Chrome", "Safari", "Firefox", "Edge", "App"]
    devices = pd.DataFrame({
        "device_id": [_uuid() for _ in range(num_devices)],
        "fingerprint_hash": [_hash(f"device_{i}") for i in range(num_devices)],
        "device_type": rng.choice(device_types, num_devices),
        "os": rng.choice(os_types, num_devices),
        "browser": rng.choice(browsers, num_devices),
    })

    # ── IP Addresses ───────────────────────────────────────
    num_ips = config.num_customers + config.num_customers // 4
    ip_addresses = pd.DataFrame({
        "ip_id": [_uuid() for _ in range(num_ips)],
        "ip_hash": [_hash(f"ip_{i}") for i in range(num_ips)],
        "geo_country": rng.choice(["IN", "IN", "IN", "US", "GB", "SG"], num_ips),
        "is_vpn": rng.random(num_ips) < 0.05,
        "is_tor": rng.random(num_ips) < 0.01,
        "is_proxy": rng.random(num_ips) < 0.03,
        "is_datacenter": rng.random(num_ips) < 0.02,
    })

    # ── Payment Methods ────────────────────────────────────
    num_pms = config.num_customers + config.num_customers // 3
    pm_types = ["card", "upi", "netbanking", "wallet"]
    networks = ["Visa", "Mastercard", "RuPay", "Amex"]
    payment_methods = pd.DataFrame({
        "pm_id": [_uuid() for _ in range(num_pms)],
        "method_type": rng.choice(pm_types, num_pms, p=[0.4, 0.35, 0.15, 0.1]),
        "method_hash": [_hash(f"pm_{i}") for i in range(num_pms)],
        "card_network": rng.choice(networks, num_pms),
    })

    # ── Customers ──────────────────────────────────────────
    customer_ids = [_uuid() for _ in range(config.num_customers)]
    merchant_assignments = rng.choice(merchants["merchant_id"].values, config.num_customers)

    # Each customer gets a primary device, IP, and payment method
    primary_devices = rng.choice(range(num_devices), config.num_customers)
    primary_ips = rng.choice(range(num_ips), config.num_customers)
    primary_pms = rng.choice(range(num_pms), config.num_customers)

    # Organic sharing noise: 5% of non-ring customers share primary devices, IPs, or PMs (household/office/family sharing)
    noise_shared_devices = rng.choice(range(num_devices // 4), config.num_customers)
    noise_shared_ips = rng.choice(range(num_ips // 4), config.num_customers)
    
    # 5% chance of organic sharing for legitimate users
    use_shared_dev = rng.random(config.num_customers) < 0.05
    use_shared_ip = rng.random(config.num_customers) < 0.08
    
    primary_devices[use_shared_dev] = noise_shared_devices[use_shared_dev]
    primary_ips[use_shared_ip] = noise_shared_ips[use_shared_ip]

    customers = pd.DataFrame({
        "customer_id": customer_ids,
        "merchant_id": merchant_assignments,
        "email_hash": [_hash(f"email_{i}@example.com") for i in range(config.num_customers)],
        "phone_hash": [_hash(f"phone_{i}") for i in range(config.num_customers)],
        "primary_device_idx": primary_devices,
        "primary_ip_idx": primary_ips,
        "primary_pm_idx": primary_pms,
        "is_abuse_ring": False,
        "ring_id": -1,
    })

    # ── Abuse Rings ────────────────────────────────────────
    # Create coordinated abuse rings with shared attributes
    abuse_ring_truth = []
    ring_customer_indices = []

    for ring_idx in range(config.abuse_ring_count):
        ring_size = rng.integers(config.abuse_ring_size_range[0],
                                  config.abuse_ring_size_range[1] + 1)
        # Pick customers for this ring (from non-ring customers)
        available = [i for i in range(config.num_customers)
                     if not customers.loc[i, "is_abuse_ring"]]
        if len(available) < ring_size:
            break
        ring_members = rng.choice(available, ring_size, replace=False)
        ring_customer_indices.extend(ring_members)

        # Shared attributes: 1-2 shared devices, 1-2 shared IPs, 1 shared PM
        shared_device_idx = rng.integers(0, num_devices)
        shared_ip_idx = rng.integers(0, num_ips)
        shared_pm_idx = rng.integers(0, num_pms)
        # Some members share a second device/IP
        shared_device2_idx = rng.integers(0, num_devices)
        shared_ip2_idx = rng.integers(0, num_ips)

        for member_idx in ring_members:
            customers.loc[member_idx, "is_abuse_ring"] = True
            customers.loc[member_idx, "ring_id"] = ring_idx

            # 15% of ring members operate on clean independent infrastructure (stealth accounts)
            is_stealth_member = rng.random() < 0.15

            if not is_stealth_member:
                # 65% of ring members use primary shared device, 20% use secondary shared device
                dev_rand = rng.random()
                if dev_rand < 0.65:
                    customers.loc[member_idx, "primary_device_idx"] = shared_device_idx
                elif dev_rand < 0.85:
                    customers.loc[member_idx, "primary_device_idx"] = shared_device2_idx

                # 55% share primary IP, 20% share secondary IP
                ip_rand = rng.random()
                if ip_rand < 0.55:
                    customers.loc[member_idx, "primary_ip_idx"] = shared_ip_idx
                elif ip_rand < 0.75:
                    customers.loc[member_idx, "primary_ip_idx"] = shared_ip2_idx

                # 45% share payment method
                if rng.random() < 0.45:
                    customers.loc[member_idx, "primary_pm_idx"] = shared_pm_idx

        abuse_ring_truth.append({
            "ring_id": ring_idx,
            "member_count": int(ring_size),
            "member_customer_ids": [customer_ids[int(m)] for m in ring_members],
            "shared_device_id": devices.loc[shared_device_idx, "device_id"],
            "shared_ip_id": ip_addresses.loc[shared_ip_idx, "ip_id"],
            "shared_pm_id": payment_methods.loc[shared_pm_idx, "pm_id"],
        })

    # Mark IP addresses used by abuse rings as more likely VPN/proxy
    for ring in abuse_ring_truth:
        ip_idx_in_df = ip_addresses[ip_addresses["ip_id"] == ring["shared_ip_id"]].index
        if len(ip_idx_in_df) > 0:
            idx = ip_idx_in_df[0]
            if rng.random() < 0.4:
                ip_addresses.loc[idx, "is_vpn"] = True

    # ── Transactions ───────────────────────────────────────
    start_date = pd.Timestamp("2026-05-01")
    transactions = []

    for txn_idx in range(config.num_transactions):
        cust_idx = rng.integers(0, config.num_customers)
        cust = customers.iloc[cust_idx]
        is_ring_member = bool(cust["is_abuse_ring"])

        # Transaction timing
        day_offset = rng.integers(0, config.date_range_days)
        if is_ring_member and rng.random() < 0.25:
            # Abuse ring members sometimes transact in bursts
            hour = rng.choice([2, 3, 4, 23, 0, 1])  # unusual hours
        elif rng.random() < 0.08:
            # Normal night-owl shoppers
            hour = rng.choice([2, 3, 4, 23, 0, 1])
        else:
            # Normal: business hours weighted
            hour = int(rng.choice(
                range(24),
                p=[0.01, 0.01, 0.01, 0.01, 0.02, 0.03, 0.05, 0.07, 0.08,
                   0.09, 0.09, 0.08, 0.07, 0.06, 0.06, 0.05, 0.04, 0.04,
                   0.03, 0.03, 0.03, 0.02, 0.01, 0.01]
            ))
        minute = rng.integers(0, 60)
        txn_time = start_date + pd.Timedelta(days=int(day_offset), hours=hour, minutes=int(minute))

        # Amount distribution
        if is_ring_member and rng.random() < 0.45:
            # Ring members: uniform/fixed amounts 45% of time
            base_amount = rng.choice([499, 999, 1499, 1999, 2499, 4999])
            amount = float(base_amount + rng.integers(-50, 50))
        elif not is_ring_member and rng.random() < 0.10:
            # Normal shoppers also buy items priced at round figures ₹499/₹999 10% of time
            base_amount = rng.choice([499, 999, 1499, 1999])
            amount = float(base_amount + rng.integers(-10, 10))
        else:
            # Standard log-normal distribution
            amount = float(np.clip(rng.lognormal(6.5, 1.2), 10, 100000))

        # Device/IP/PM: 70% primary, 30% alternate for ring members; 85% primary for normal
        dev_prob = 0.70 if is_ring_member else 0.85
        ip_prob = 0.65 if is_ring_member else 0.80
        pm_prob = 0.75 if is_ring_member else 0.90

        if rng.random() < dev_prob:
            device_idx = int(cust["primary_device_idx"])
        else:
            device_idx = rng.integers(0, num_devices)

        if rng.random() < ip_prob:
            ip_idx = int(cust["primary_ip_idx"])
        else:
            ip_idx = rng.integers(0, num_ips)

        if rng.random() < pm_prob:
            pm_idx = int(cust["primary_pm_idx"])
        else:
            pm_idx = rng.integers(0, num_pms)

        # Status
        if is_ring_member and rng.random() < 0.15:
            status = rng.choice(["failed", "disputed", "refunded"])
        elif rng.random() < 0.03:
            status = rng.choice(["failed", "refunded"])
        else:
            status = "captured"

        # Individual fraud label (separate from ring membership)
        is_fraudulent = is_ring_member or (rng.random() < config.fraud_rate)

        transactions.append({
            "transaction_id": _uuid(),
            "merchant_id": cust["merchant_id"],
            "customer_id": cust["customer_id"],
            "device_id": devices.loc[device_idx, "device_id"],
            "ip_id": ip_addresses.loc[ip_idx, "ip_id"],
            "pm_id": payment_methods.loc[pm_idx, "pm_id"],
            "amount": round(amount, 2),
            "currency": "INR",
            "status": status,
            "payment_method_type": payment_methods.loc[pm_idx, "method_type"],
            "created_at": txn_time,
            "is_abuse_ring": is_ring_member,
            "ring_id": int(cust["ring_id"]),
            "is_fraudulent": is_fraudulent,
        })

    transactions_df = pd.DataFrame(transactions)

    # ── Graph Relationships ────────────────────────────────
    graph_rels = []
    # Customer → Device relationships
    for _, row in transactions_df[["customer_id", "device_id"]].drop_duplicates().iterrows():
        graph_rels.append({
            "source_type": "customer", "source_id": row["customer_id"],
            "target_type": "device", "target_id": row["device_id"],
            "relationship": "uses_device", "weight": 1.0,
        })
    # Customer → IP relationships
    for _, row in transactions_df[["customer_id", "ip_id"]].drop_duplicates().iterrows():
        graph_rels.append({
            "source_type": "customer", "source_id": row["customer_id"],
            "target_type": "ip_address", "target_id": row["ip_id"],
            "relationship": "uses_ip", "weight": 1.0,
        })
    # Customer → Payment Method relationships
    for _, row in transactions_df[["customer_id", "pm_id"]].drop_duplicates().iterrows():
        graph_rels.append({
            "source_type": "customer", "source_id": row["customer_id"],
            "target_type": "payment_method", "target_id": row["pm_id"],
            "relationship": "uses_payment", "weight": 1.0,
        })

    graph_relationships_df = pd.DataFrame(graph_rels)

    # Update edge weights based on occurrence count
    weight_cols = ["source_type", "source_id", "target_type", "target_id", "relationship"]
    graph_relationships_df = (
        graph_relationships_df.groupby(weight_cols, as_index=False)
        .agg(weight=("weight", "sum"))
    )

    abuse_rings_df = pd.DataFrame(abuse_ring_truth)

    # ── Save to disk ───────────────────────────────────────
    output_path = Path(config.output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    cust_export_cols = ["customer_id", "merchant_id", "email_hash", "phone_hash", "is_abuse_ring", "ring_id"]
    cust_df: pd.DataFrame = pd.DataFrame(customers[cust_export_cols])

    result: dict[str, pd.DataFrame] = {
        "merchants": merchants,
        "customers": cust_df,
        "devices": devices,
        "ip_addresses": ip_addresses,
        "payment_methods": payment_methods,
        "transactions": transactions_df,
        "graph_relationships": graph_relationships_df,
        "abuse_rings_truth": abuse_rings_df,
    }

    for name, df in result.items():
        df.to_csv(output_path / f"{name}.csv", index=False)

    # Print summary
    n_ring_customers = customers["is_abuse_ring"].sum()
    n_ring_txns = transactions_df["is_abuse_ring"].sum()
    print(f"Generated synthetic dataset:")
    print(f"  Merchants:      {len(merchants)}")
    print(f"  Customers:      {len(customers)} ({n_ring_customers} in abuse rings)")
    print(f"  Transactions:   {len(transactions_df)} ({n_ring_txns} from ring members)")
    print(f"  Devices:        {len(devices)}")
    print(f"  IPs:            {len(ip_addresses)}")
    print(f"  Payment Methods:{len(payment_methods)}")
    print(f"  Abuse Rings:    {len(abuse_rings_df)}")
    print(f"  Graph Edges:    {len(graph_relationships_df)}")
    print(f"  Saved to:       {output_path}")

    return result


if __name__ == "__main__":
    generate_synthetic_dataset()

"""
SafeRo — Periodic Graph Re-Clustering Module

ARCHITECTURAL PRINCIPLE & INHERENT SYSTEM BOUNDARY:
--------------------------------------------------
Live per-transaction scoring evaluates incoming webhooks in real-time (<100ms)
by matching device/IP hardware signatures against ALREADY-KNOWN abuse rings and
local velocity counters.

However, detecting a BRAND NEW coordinated syndicate as it forms across multiple
seemingly distinct accounts requires global graph topology analysis (Louvain
community detection, PageRank, betweenness centrality) over all historical edges.
Global graph algorithms are inherently batch/periodic operations that cannot be
computed synchronously per webhook.

This module provides the periodic / on-demand re-clustering capability:
1. Queries recent transactions from PostgreSQL.
2. Constructs the bipartite entity graph (Customer <-> Device / IP / Payment Method).
3. Executes Louvain community detection (via NetworkX).
4. Identifies newly-formed abuse clusters (min 2 accounts sharing hardware/IP/cards).
5. Updates the PostgreSQL database (`abuse_clusters` and transaction metadata flags).
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any, Optional

import networkx as nx
import pandas as pd
import psycopg2
import psycopg2.extras

from ml.src.graph.analysis import detect_communities, find_suspicious_clusters

log = logging.getLogger("safero.reclustering")


def _get_db_conn(database_url: str):
    return psycopg2.connect(database_url, sslmode="require", cursor_factory=psycopg2.extras.RealDictCursor)


def run_graph_reclustering(
    database_url: str,
    lookback_days: int = 30,
    min_customers_per_ring: int = 2,
    min_shared_entities: int = 1,
) -> dict[str, Any]:
    """
    Execute full graph community detection over recent live transaction data.

    Returns:
        Summary dict containing execution metrics, graph size, and detected clusters.
    """
    t0 = time.perf_counter()
    log.info(f"🔄 Starting periodic graph re-clustering (lookback={lookback_days}d)...")

    # ── 1. Fetch live transactions from Postgres ─────────────────────────────
    conn = _get_db_conn(database_url)
    transactions = []
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        razorpay_payment_id AS transaction_id,
                        amount,
                        currency,
                        status,
                        payment_method_type,
                        created_at,
                        metadata->>'customer_id' AS customer_id,
                        metadata->>'device_id' AS device_id,
                        metadata->>'ip_address' AS ip_address,
                        metadata->>'pm_id' AS pm_id
                    FROM transactions
                    WHERE created_at > NOW() - INTERVAL '%s days'
                    ORDER BY created_at ASC
                """, (lookback_days,))
                transactions = cur.fetchall()
    except Exception as e:
        conn.close()
        log.error(f"Failed to fetch transactions for re-clustering: {e}")
        return {
            "status": "error",
            "message": str(e),
            "clusters_detected": 0,
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }

    if not transactions:
        conn.close()
        log.info("No live transactions found in lookback window. Re-clustering complete (0 clusters).")
        return {
            "status": "completed",
            "message": "Zero live transactions in lookback window",
            "transactions_analyzed": 0,
            "nodes_count": 0,
            "edges_count": 0,
            "clusters_detected": 0,
            "detected_rings": [],
            "latency_ms": round((time.perf_counter() - t0) * 1000, 1),
        }

    # ── 2. Build Bipartite Entity Graph in NetworkX ──────────────────────────
    G = nx.Graph()

    for row in transactions:
        cust_id = row.get("customer_id") or "cust_unknown"
        dev_id = row.get("device_id")
        ip_addr = row.get("ip_address")
        pm_id = row.get("pm_id")

        cust_node = f"customer:{cust_id}"
        G.add_node(cust_node, entity_type="customer")

        if dev_id and dev_id != "dev_unknown":
            dev_node = f"device:{dev_id}"
            G.add_node(dev_node, entity_type="device")
            weight = G.get_edge_data(cust_node, dev_node, {}).get("weight", 0.0) + 1.0
            G.add_edge(cust_node, dev_node, relationship="uses_device", weight=weight)

        if ip_addr and ip_addr != "0.0.0.0":
            ip_node = f"ip_address:{ip_addr}"
            G.add_node(ip_node, entity_type="ip_address")
            weight = G.get_edge_data(cust_node, ip_node, {}).get("weight", 0.0) + 1.0
            G.add_edge(cust_node, ip_node, relationship="uses_ip", weight=weight)

        if pm_id:
            pm_node = f"payment_method:{pm_id}"
            G.add_node(pm_node, entity_type="payment_method")
            weight = G.get_edge_data(cust_node, pm_node, {}).get("weight", 0.0) + 1.0
            G.add_edge(cust_node, pm_node, relationship="uses_payment", weight=weight)

    # ── 3. Run Louvain Community Detection ───────────────────────────────────
    detected_rings = []
    if len(G.nodes) > 1 and len(G.edges) > 0:
        try:
            communities = detect_communities(G)
            suspicious = find_suspicious_clusters(
                G,
                communities,
                min_customers=min_customers_per_ring,
                min_shared_entities=min_shared_entities,
            )

            # ── 4. Tag Member Transactions in Database ───────────────────────
            for idx, cluster in enumerate(suspicious):
                member_custs = cluster["customer_ids"]
                cluster_id = f"ring_live_{idx + 1}"

                # Update transaction metadata in Postgres
                with conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            UPDATE transactions
                            SET metadata = jsonb_set(
                                jsonb_set(metadata, '{is_abuse_ring}', 'true'::jsonb),
                                '{ring_id}', %s::jsonb
                            )
                            WHERE metadata->>'customer_id' = ANY(%s)
                        """, (f'"{cluster_id}"', member_custs))

                detected_rings.append({
                    "cluster_id": cluster_id,
                    "customer_count": cluster["customer_count"],
                    "customer_ids": member_custs,
                    "shared_device_count": cluster["shared_device_count"],
                    "shared_ip_count": cluster["shared_ip_count"],
                    "density": cluster["density"],
                })

        except Exception as e:
            log.warning(f"Community detection step encountered issue: {e}")

    conn.close()
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)

    log.info(
        f"✅ Graph re-clustering completed in {elapsed_ms}ms "
        f"| nodes={len(G.nodes)} edges={len(G.edges)} "
        f"| new_rings_detected={len(detected_rings)}"
    )

    return {
        "status": "completed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "transactions_analyzed": len(transactions),
        "nodes_count": len(G.nodes),
        "edges_count": len(G.edges),
        "clusters_detected": len(detected_rings),
        "detected_rings": detected_rings,
        "latency_ms": elapsed_ms,
        "note": "Live scoring matches known ring signatures; periodic re-clustering discovers new topologies.",
    }

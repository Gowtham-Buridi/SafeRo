"""
Graph analysis for abuse-ring detection using NetworkX.

Builds entity relationship graphs and detects communities/clusters
that may indicate coordinated abuse. Relationships are treated as
signals combined with other evidence — shared device ≠ automatic fraud.
"""

import networkx as nx
import numpy as np
import pandas as pd


def build_entity_graph(graph_relationships: pd.DataFrame) -> nx.Graph:
    """
    Build a NetworkX graph from entity relationships.

    Nodes are entities (customer, device, ip, payment_method).
    Edges are relationships (uses_device, uses_ip, uses_payment).
    Edge weights indicate relationship strength.
    """
    G = nx.Graph()

    for _, row in graph_relationships.iterrows():
        source = f"{row['source_type']}:{row['source_id']}"
        target = f"{row['target_type']}:{row['target_id']}"
        G.add_node(source, entity_type=row["source_type"])
        G.add_node(target, entity_type=row["target_type"])
        G.add_edge(source, target,
                    relationship=row["relationship"],
                    weight=row.get("weight", 1.0))

    return G


def detect_communities(G: nx.Graph, resolution: float = 1.0) -> dict[str, int]:
    """
    Detect communities using the Louvain method.

    Returns dict mapping node_id → community_id.
    """
    communities = nx.community.louvain_communities(
        G, weight="weight", resolution=resolution, seed=42
    )
    node_to_community = {}
    for comm_id, members in enumerate(communities):
        for node in members:
            node_to_community[node] = comm_id
    return node_to_community


def find_suspicious_clusters(
    G: nx.Graph,
    communities: dict[str, int],
    min_customers: int = 3,
    min_shared_entities: int = 2,
) -> list[dict]:
    """
    Identify suspicious clusters from community detection results.

    A cluster is suspicious if it contains multiple customers sharing
    non-customer entities (devices, IPs, payment methods).

    This is a SIGNAL, not a verdict. Shared entities are combined
    with other evidence in the risk model.
    """
    # Group nodes by community
    community_members: dict[int, list[str]] = {}
    for node, comm_id in communities.items():
        community_members.setdefault(comm_id, []).append(node)

    suspicious_clusters = []

    for comm_id, members in community_members.items():
        customers = [n for n in members if n.startswith("customer:")]
        devices = [n for n in members if n.startswith("device:")]
        ips = [n for n in members if n.startswith("ip_address:")]
        pms = [n for n in members if n.startswith("payment_method:")]

        if len(customers) < min_customers:
            continue

        shared_entities = len(devices) + len(ips) + len(pms)
        if shared_entities < min_shared_entities:
            continue

        # Calculate cluster metrics
        subgraph = G.subgraph(members)
        density = nx.density(subgraph) if len(members) > 1 else 0

        # Sharing ratios
        device_ratio = len(customers) / max(len(devices), 1)
        ip_ratio = len(customers) / max(len(ips), 1)
        pm_ratio = len(customers) / max(len(pms), 1)

        suspicious_clusters.append({
            "community_id": comm_id,
            "customer_count": len(customers),
            "customer_ids": [c.split(":")[1] for c in customers],
            "shared_device_count": len(devices),
            "shared_ip_count": len(ips),
            "shared_pm_count": len(pms),
            "device_sharing_ratio": round(device_ratio, 2),
            "ip_sharing_ratio": round(ip_ratio, 2),
            "pm_sharing_ratio": round(pm_ratio, 2),
            "density": round(density, 4),
            "total_members": len(members),
        })

    # Sort by customer count descending
    suspicious_clusters.sort(key=lambda x: x["customer_count"], reverse=True)
    return suspicious_clusters


def compute_graph_features(
    G: nx.Graph,
    communities: dict[str, int],
    customer_ids: list[str],
) -> pd.DataFrame:
    """
    Compute graph-derived features for each customer.

    Features:
    - degree: number of connected entities
    - clustering_coeff: local clustering coefficient
    - pagerank: PageRank centrality
    - community_size: size of the customer's community
    - community_customer_count: customers in same community
    - betweenness: betweenness centrality (sampled for performance)
    """
    features = []

    # Precompute centralities
    pagerank = nx.pagerank(G, weight="weight")
    # Sample betweenness for performance
    betweenness = nx.betweenness_centrality(G, k=min(100, len(G)), seed=42)

    # Community sizes
    community_sizes: dict[int, int] = {}
    community_customer_counts: dict[int, int] = {}
    for node, comm_id in communities.items():
        community_sizes[comm_id] = community_sizes.get(comm_id, 0) + 1
        if node.startswith("customer:"):
            community_customer_counts[comm_id] = \
                community_customer_counts.get(comm_id, 0) + 1

    for cust_id in customer_ids:
        node_key = f"customer:{cust_id}"
        if node_key not in G:
            features.append({
                "customer_id": cust_id,
                "graph_degree": 0,
                "graph_clustering_coeff": 0,
                "graph_pagerank": 0,
                "graph_community_size": 1,
                "graph_community_customer_count": 1,
                "graph_betweenness": 0,
            })
            continue

        comm_id = communities.get(node_key, -1)

        features.append({
            "customer_id": cust_id,
            "graph_degree": G.degree(node_key),
            "graph_clustering_coeff": nx.clustering(G, node_key),
            "graph_pagerank": pagerank.get(node_key, 0),
            "graph_community_size": community_sizes.get(comm_id, 1),
            "graph_community_customer_count": community_customer_counts.get(comm_id, 1),
            "graph_betweenness": betweenness.get(node_key, 0),
        })

    return pd.DataFrame(features)

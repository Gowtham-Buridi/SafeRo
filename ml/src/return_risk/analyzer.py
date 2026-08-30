"""
Return & RTO (Return to Origin) Risk Intelligence Module.

Identifies repeat refund abuse, abusive wardrobing/serial returns,
and abnormal RTO patterns across merchants.
"""

import pandas as pd


class ReturnRiskAnalyzer:
    """Evaluates return, refund, and RTO risk on customer and merchant levels."""

    def analyze_customer_return_risk(self, customer_id: str, transactions: pd.DataFrame) -> dict:
        """
        Assess customer-level return/refund risk.
        """
        cust_txns = transactions[transactions["customer_id"] == customer_id]
        if cust_txns.empty:
            return {"customer_id": customer_id, "risk_category": "insufficient_data"}

        total_orders = len(cust_txns)
        refunded_orders = (cust_txns["status"] == "refunded").sum()
        refund_rate = refunded_orders / total_orders

        total_spent = cust_txns["amount"].sum()
        refunded_amount = cust_txns[cust_txns["status"] == "refunded"]["amount"].sum()
        refund_value_ratio = refunded_amount / total_spent if total_spent > 0 else 0.0

        if refund_rate > 0.4 and refunded_orders >= 3:
            category = "serial_returner"
            risk_level = "high"
            recommendation = "Require manual approval for post-delivery returns; restrict instant refunds."
        elif refund_rate > 0.25 and refunded_orders >= 2:
            category = "moderate_return_risk"
            risk_level = "medium"
            recommendation = "Standard return policy with standard verification."
        else:
            category = "low_return_risk"
            risk_level = "low"
            recommendation = "Eligible for fast-track 1-click refund."

        return {
            "customer_id": customer_id,
            "total_orders": int(total_orders),
            "refunded_orders": int(refunded_orders),
            "refund_rate": float(refund_rate),
            "total_spent": float(total_spent),
            "refunded_amount": float(refunded_amount),
            "refund_value_ratio": float(refund_value_ratio),
            "risk_category": category,
            "risk_level": risk_level,
            "policy_recommendation": recommendation,
        }

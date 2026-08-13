"""Feature engineering and transparent risk scoring for Signal.

Importable functions (used by generate_data.py to keep the baseline rule
consistent with the shipped dataset) plus a __main__ entrypoint:

    python data-pipeline/features.py

Reads  data-pipeline/output/raw_orders.parquet and raw_contacts.parquet
Writes web/public/data/orders.parquet, contacts.parquet, meta.json

The risk score is deliberately NOT a trained model. It is a weighted
logistic-style score with hand-set, documented weights so every score is
explainable feature-by-feature. See WEIGHTS below and the pipeline README.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
RAW_DIR = ROOT / "output"
WEB_DATA = ROOT.parent / "web" / "public" / "data"

SEED = 42

# Baseline production rule (also the simulator's default slider positions).
# An order is blocked when ANY of these fire:
#   risk_score >= risk_threshold
#   orders_24h >= velocity_threshold
#   amount >= amount_threshold AND account_age_days <= 30
BASELINE = {"risk_threshold": 60, "velocity_threshold": 6, "amount_threshold": 500}

# Logistic-style weights. Each feature is scaled to [0, 1] before weighting;
# score = 100 * sigmoid(intercept + sum(w_i * f_i)).
WEIGHTS = {
    "f_velocity": 3.4,        # orders on this account in trailing 24h (capped at 11)
    "f_device_declines": 2.8,  # declined auths on this device in trailing 24h (capped at 8)
    "f_ato_signature": 2.9,    # aged account suddenly on a new device or new country
    "f_shared_device": 2.3,    # distinct accounts sharing this device (capped at 6)
    "f_payment_entropy": 1.9,  # entropy of payment instruments seen on this device
    "f_refund_history": 2.2,   # customer's prior refunded orders (capped at 5)
    "f_promo_ring": 1.7,       # promo on a fresh account whose device hosts 3+ accounts
    "f_micro_amount": 1.6,     # sub-$5 card purchase (card-testing signature)
    "f_geo_mismatch": 1.5,     # IP country != account country
    "f_giftcard_high": 1.3,    # gift card at $100 or more
    "f_new_account": 1.1,      # account is 7 days old or younger
    "f_prepaid": 0.9,          # prepaid card payment
}
INTERCEPT = -4.9


def _trailing_24h_counts(ts_ns: np.ndarray, flags: np.ndarray | None = None) -> np.ndarray:
    """Count events (optionally only flagged ones) in the trailing 24h window,
    inclusive of the current row. `ts_ns` must be sorted int64 nanoseconds."""
    span = np.int64(24 * 3600 * 1_000_000_000)
    n = len(ts_ns)
    out = np.empty(n, dtype=np.int32)
    flagged_prefix = np.concatenate([[0], np.cumsum(flags if flags is not None else np.ones(n))])
    lo = 0
    for i in range(n):
        while ts_ns[i] - ts_ns[lo] > span:
            lo += 1
        out[i] = flagged_prefix[i + 1] - flagged_prefix[lo]
    return out


def _entropy(counts: np.ndarray) -> float:
    p = counts / counts.sum()
    return float(-(p * np.log2(p)).sum())


def add_features(orders: pd.DataFrame) -> pd.DataFrame:
    """Append engineered feature columns. Order of rows is preserved."""
    df = orders.copy()
    df["_row"] = np.arange(len(df))
    df = df.sort_values(["order_ts", "_row"], kind="mergesort")

    # Velocity: orders per account, trailing 24h.
    vel = np.empty(len(df), dtype=np.int32)
    for _, idx in df.groupby("customer_id", sort=False).groups.items():
        ts = df.loc[idx, "order_ts"].values.astype("datetime64[ns]").astype(np.int64)
        vel[df.loc[idx, "_row"].values] = _trailing_24h_counts(ts)
    # Device features: declined auths trailing 24h, shared accounts, payment entropy.
    dev_declines = np.empty(len(df), dtype=np.int32)
    for _, idx in df.groupby("device_hash", sort=False).groups.items():
        ts = df.loc[idx, "order_ts"].values.astype("datetime64[ns]").astype(np.int64)
        declined = (df.loc[idx, "auth_result"] == "declined").values.astype(np.int64)
        dev_declines[df.loc[idx, "_row"].values] = _trailing_24h_counts(ts, declined)

    out = orders.reset_index(drop=True).copy()
    out["orders_24h"] = vel
    out["device_declines_24h"] = dev_declines

    dev_accounts = out.groupby("device_hash")["customer_id"].transform("nunique")
    out["accounts_per_device"] = dev_accounts.astype(np.int32)

    ent = (
        out.groupby("device_hash")["payment_instrument"]
        .agg(lambda s: _entropy(s.value_counts().values))
        .rename("payment_entropy_device")
    )
    out = out.merge(ent, left_on="device_hash", right_index=True, how="left")

    # Per-segment amount z-score (segment = product type).
    grp = out.groupby("product_type")["amount"]
    out["amount_z"] = ((out["amount"] - grp.transform("mean")) / grp.transform("std")).round(3)

    # Prior refunded orders per customer (strictly before this order).
    tmp = out.sort_values(["customer_id", "order_ts"], kind="mergesort")
    prior = tmp.groupby("customer_id")["refunded"].cumsum() - tmp["refunded"].astype(int)
    out["prior_refunds"] = prior.reindex(out.index).astype(np.int32)

    # New device for the account (never seen on any earlier order).
    first_seen = ~tmp.duplicated(subset=["customer_id", "device_hash"], keep="first")
    had_prior_orders = tmp.groupby("customer_id").cumcount() > 0
    new_dev = (first_seen & had_prior_orders).reindex(out.index)
    out["new_device"] = new_dev.fillna(False)

    out["geo_mismatch"] = out["ip_country"] != out["account_country"]
    return out


def risk_score(df: pd.DataFrame) -> pd.Series:
    """Transparent weighted score in [0, 100]. See WEIGHTS."""
    f = pd.DataFrame(index=df.index)
    f["f_velocity"] = np.minimum(df["orders_24h"] - 1, 11) / 11
    f["f_device_declines"] = np.minimum(df["device_declines_24h"], 8) / 8
    f["f_ato_signature"] = (
        (df["account_age_days"] > 180) & (df["new_device"] | df["geo_mismatch"])
    ).astype(float)
    f["f_promo_ring"] = (
        df["promo_code"].notna() & (df["accounts_per_device"] >= 3) & (df["account_age_days"] <= 7)
    ).astype(float)
    f["f_shared_device"] = np.minimum(df["accounts_per_device"] - 1, 6) / 6
    f["f_payment_entropy"] = np.minimum(df["payment_entropy_device"], 3) / 3
    f["f_refund_history"] = np.minimum(df["prior_refunds"], 5) / 5
    f["f_micro_amount"] = (
        (df["amount"] < 5) & df["payment_method"].isin(["credit_card", "debit_card", "prepaid_card"])
    ).astype(float)
    f["f_geo_mismatch"] = df["geo_mismatch"].astype(float)
    f["f_giftcard_high"] = ((df["product_type"] == "gift_card") & (df["amount"] >= 100)).astype(float)
    f["f_new_account"] = (df["account_age_days"] <= 7).astype(float)
    f["f_prepaid"] = (df["payment_method"] == "prepaid_card").astype(float)

    z = INTERCEPT + sum(WEIGHTS[k] * f[k] for k in WEIGHTS)
    return (100 / (1 + np.exp(-z))).round(1)


def apply_baseline_rule(df: pd.DataFrame) -> pd.Series:
    """The current production rule; must stay in sync with the app's defaults."""
    b = BASELINE
    return (
        (df["risk_score"] >= b["risk_threshold"])
        | (df["orders_24h"] >= b["velocity_threshold"])
        | ((df["amount"] >= b["amount_threshold"]) & (df["account_age_days"] <= 30))
    )


def score_orders(raw: pd.DataFrame) -> pd.DataFrame:
    df = add_features(raw)
    df["risk_score"] = risk_score(df)
    df["baseline_blocked"] = apply_baseline_rule(df)
    return df


def main() -> None:
    raw_orders = pd.read_parquet(RAW_DIR / "raw_orders.parquet")
    contacts = pd.read_parquet(RAW_DIR / "raw_contacts.parquet")

    orders = score_orders(raw_orders)

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    orders.to_parquet(WEB_DATA / "orders.parquet", index=False)
    contacts.to_parquet(WEB_DATA / "contacts.parquet", index=False)

    blocked = orders["baseline_blocked"]
    fraud = orders["is_fraud"]
    meta = {
        "seed": SEED,
        "window": [str(orders["order_ts"].min()), str(orders["order_ts"].max())],
        "orders": len(orders),
        "contacts": len(contacts),
        "fraud_orders": int(fraud.sum()),
        "baseline": BASELINE,
        "weights": WEIGHTS,
        "intercept": INTERCEPT,
        "baseline_confusion": {
            "true_positives": int((blocked & fraud).sum()),
            "false_positives": int((blocked & ~fraud).sum()),
            "false_negatives": int((~blocked & fraud).sum()),
            "true_negatives": int((~blocked & ~fraud).sum()),
        },
    }
    (WEB_DATA / "meta.json").write_text(json.dumps(meta, indent=2))

    print(f"orders: {len(orders):,}  contacts: {len(contacts):,}")
    print(f"fraud rate: {fraud.mean():.2%}")
    cm = meta["baseline_confusion"]
    prec = cm["true_positives"] / max(1, cm["true_positives"] + cm["false_positives"])
    rec = cm["true_positives"] / max(1, cm["true_positives"] + cm["false_negatives"])
    print(f"baseline rule: precision {prec:.2%}  recall {rec:.2%}  FPs {cm['false_positives']}")
    print(f"wrote {WEB_DATA}/orders.parquet, contacts.parquet, meta.json")


if __name__ == "__main__":
    main()

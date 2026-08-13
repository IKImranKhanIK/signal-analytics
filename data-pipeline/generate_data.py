"""Synthetic order + support-contact generator for Signal.

    python data-pipeline/generate_data.py

Produces 25,000 digital-goods orders over a 12-month window and 8,000 linked
support contacts, written to data-pipeline/output/ as raw parquet. Six fraud
archetypes are injected with statistically distinct signatures (see README.md
in this folder for the reasoning behind every distribution choice).

Everything is driven by one seeded numpy Generator, so output is byte-for-byte
reproducible. The baseline fraud rule (imported from features.py) is applied
here so that lockout support contacts are generated from the *actual* set of
legitimately blocked orders — that is what ties the fraud module and the
contact module to the same numbers.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from features import BASELINE, SEED, score_orders

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"

rng = np.random.default_rng(SEED)

START = pd.Timestamp("2025-08-01")
END = pd.Timestamp("2026-07-31 23:59:59")
N_DAYS = (END.normalize() - START).days + 1  # 365

TOTAL_ORDERS = 25_000
TOTAL_CONTACTS = 8_000

COUNTRIES = ["US", "GB", "CA", "DE", "AU", "FR", "BR", "IN", "JP", "NL"]
COUNTRY_W = np.array([0.52, 0.10, 0.08, 0.06, 0.05, 0.05, 0.04, 0.04, 0.03, 0.03])

PAY_METHODS = ["credit_card", "debit_card", "wallet", "prepaid_card", "gift_card_balance"]
PAY_W = np.array([0.50, 0.17, 0.21, 0.05, 0.07])

SUB_TIERS = [4.99, 9.99, 14.99, 29.99]
GC_DENOMS = np.array([10, 25, 50, 100, 200, 500])
LEGIT_PROMOS = ["WELCOME15", "SPRING50", "SUMMER10", "LOYAL20"]

# ---------------------------------------------------------------- helpers

def _hex_ids(prefix: str, n: int, width: int = 12) -> list[str]:
    chars = np.array(list("0123456789abcdef"))
    picks = rng.integers(0, 16, size=(n, width))
    return [prefix + "".join(chars[row]) for row in picks]


def _seasonal_day_weights() -> np.ndarray:
    """Daily order-volume weights: mild growth trend, weekend bump, holiday peak."""
    days = np.arange(N_DAYS)
    trend = 1.0 + 0.25 * days / N_DAYS
    dow = (pd.date_range(START, periods=N_DAYS).dayofweek).values
    weekend = np.where(dow >= 5, 1.18, 1.0)
    dates = pd.date_range(START, periods=N_DAYS)
    holiday = np.where((dates.month == 12) & (dates.day <= 26), 1.5, 1.0)
    holiday = holiday * np.where((dates.month == 11) & (dates.day >= 24), 1.35, 1.0)
    w = trend * weekend * holiday
    return w / w.sum()


DAY_W = _seasonal_day_weights()


def _sample_ts(n: int) -> pd.Series:
    """Timestamps with realistic evening-heavy time of day."""
    day_idx = rng.choice(N_DAYS, size=n, p=DAY_W)
    # Mixture: 65% evening peak (~20:00), 35% flat daytime.
    evening = rng.normal(20.0, 2.5, size=n) % 24
    flat = rng.uniform(8, 23, size=n)
    hours = np.where(rng.random(n) < 0.65, evening, flat)
    secs = (hours * 3600 + rng.uniform(0, 60, n) * 60).astype(int) % 86_400
    return pd.Series(START + pd.to_timedelta(day_idx, "D") + pd.to_timedelta(secs, "s"))


def _amount_for(product: str, n: int) -> np.ndarray:
    if product == "subscription":
        return rng.choice(SUB_TIERS, size=n, p=[0.35, 0.35, 0.2, 0.1])
    if product == "gift_card":
        return rng.choice(GC_DENOMS, size=n, p=[0.18, 0.32, 0.28, 0.14, 0.06, 0.02]).astype(float)
    if product == "iap":
        return np.clip(np.round(np.exp(rng.normal(1.9, 0.9, n)) - 0.01, 2), 0.99, 199.99)
    # downloadable content
    return np.clip(np.round(np.exp(rng.normal(2.6, 0.7, n)) - 0.01, 2), 2.99, 89.99)


class Pool:
    """Accumulates order rows from every generator below."""

    def __init__(self) -> None:
        self.rows: list[dict] = []

    def add(self, **kw) -> None:
        self.rows.append(kw)


pool = Pool()

# ------------------------------------------------------- legitimate customers

N_CUSTOMERS = 8_600
customer_ids = _hex_ids("cust_", N_CUSTOMERS, 10)
cust_created = pd.Series(START - pd.to_timedelta(rng.integers(0, 4 * 365, N_CUSTOMERS), "D"))
cust_country = rng.choice(COUNTRIES, size=N_CUSTOMERS, p=COUNTRY_W)
cust_devices = [_hex_ids("dev_", int(k)) for k in rng.choice([1, 1, 1, 2, 2, 3], N_CUSTOMERS)]
cust_instruments = [_hex_ids("pi_", int(k), 10) for k in rng.choice([1, 1, 2, 2, 3], N_CUSTOMERS)]
cust_paymethod = [PAY_METHODS[i] for i in rng.choice(len(PAY_METHODS), N_CUSTOMERS, p=PAY_W)]
# Households: groups of 2-4 customers sharing one device (family computer,
# shared tablet). These are the honest negatives for device-linkage rules.
for _ in range(260):
    shared_dev = _hex_ids("dev_", 1)[0]
    for ci in rng.choice(N_CUSTOMERS, int(rng.integers(2, 5)), replace=False):
        cust_devices[int(ci)].append(shared_dev)
# Heavy-tailed activity propensity for one-off purchases.
cust_weight = rng.gamma(0.9, 1.0, N_CUSTOMERS)
cust_weight /= cust_weight.sum()


def _legit_order(ci: int, ts: pd.Timestamp, product: str, amount: float,
                 promo: str | None = None) -> None:
    created = cust_created[ci]
    if created > ts:  # safety: account can't be younger than its first order
        created = ts - pd.Timedelta(days=int(rng.integers(1, 30)))
        cust_created[ci] = created
    declined = rng.random() < 0.035
    refunded = (not declined) and rng.random() < 0.045
    chargeback = (not declined) and (not refunded) and rng.random() < 0.0015
    pool.add(
        customer_id=customer_ids[ci],
        order_ts=ts,
        product_type=product,
        amount=amount,
        payment_method=cust_paymethod[ci],
        payment_instrument=str(rng.choice(cust_instruments[ci])),
        device_hash=str(rng.choice(cust_devices[ci])),
        ip_country=cust_country[ci] if rng.random() < 0.97 else str(rng.choice(COUNTRIES)),
        account_country=cust_country[ci],
        account_age_days=max(0, (ts - created).days),
        promo_code=promo,
        auth_result="declined" if declined else "approved",
        refunded=refunded,
        chargeback=chargeback,
        fraud_archetype="none",
        is_fraud=False,
    )


# Subscriptions: monthly recurring charges per subscriber until churn.
N_SUBSCRIBERS = 1_650
sub_custs = rng.choice(N_CUSTOMERS, N_SUBSCRIBERS, replace=False, p=None)
for ci in sub_custs:
    tier = float(rng.choice(SUB_TIERS, p=[0.35, 0.35, 0.2, 0.1]))
    first = START + pd.Timedelta(days=int(rng.integers(0, N_DAYS - 30)))
    months = min(int(rng.geometric(0.16)), 12)
    for m in range(months):
        ts = first + pd.Timedelta(days=int(30 * m + rng.integers(-2, 3)),
                                  seconds=int(rng.integers(0, 86_400)))
        if ts < START:
            ts = START + pd.Timedelta(seconds=int(rng.integers(0, 86_400)))
        if ts > END:
            break
        _legit_order(int(ci), ts, "subscription", tier,
                     promo="LOYAL20" if (m == 0 and rng.random() < 0.08) else None)

n_sub_charges = len(pool.rows)

# ------------------------------------------------------------ fraud actors
# Each archetype gets its own statistically distinct signature.

def gen_card_testing() -> None:
    """Stolen-card testing: brand-new accounts, micro-amount bursts, one device
    cycling through many stolen instruments, very high decline rate."""
    for _ in range(28):
        acct = _hex_ids("cust_", 1, 10)[0]
        device = _hex_ids("dev_", 1)[0]
        country = str(rng.choice(COUNTRIES, p=COUNTRY_W))
        ip = country if rng.random() < 0.6 else str(rng.choice(COUNTRIES))
        burst_start = START + pd.Timedelta(days=int(rng.integers(3, N_DAYS - 1)),
                                           seconds=int(rng.integers(0, 80_000)))
        n = int(rng.integers(15, 34))
        instruments = _hex_ids("pi_", max(3, n // 2), 10)
        t = burst_start
        for i in range(n):
            t = t + pd.Timedelta(seconds=int(rng.exponential(240)) + 20)
            declined = rng.random() < 0.62
            pool.add(
                customer_id=acct,
                order_ts=t,
                product_type=str(rng.choice(["iap", "download"], p=[0.75, 0.25])),
                amount=float(rng.choice([0.99, 1.99, 2.99, 4.99], p=[0.45, 0.3, 0.15, 0.1])),
                payment_method=str(rng.choice(["credit_card", "debit_card"], p=[0.8, 0.2])),
                payment_instrument=instruments[i % len(instruments)],
                device_hash=device,
                ip_country=ip,
                account_country=country,
                account_age_days=int(rng.integers(0, 3)),
                promo_code=None,
                auth_result="declined" if declined else "approved",
                refunded=False,
                chargeback=(not declined) and rng.random() < 0.5,
                fraud_archetype="card_testing",
                is_fraud=True,
            )


def gen_refund_abuse() -> None:
    """Serial refunders: aged accounts, ordinary purchases, ~88% refund rate."""
    for _ in range(110):
        ci = int(rng.integers(0, N_CUSTOMERS))
        n = int(rng.integers(2, 6))
        base_day = int(rng.integers(0, N_DAYS - 120))
        for k in range(n):
            ts = START + pd.Timedelta(days=base_day + int(rng.integers(0, 110)),
                                      seconds=int(rng.integers(30_000, 82_000)))
            product = str(rng.choice(["download", "iap"], p=[0.6, 0.4]))
            pool.add(
                customer_id=customer_ids[ci],
                order_ts=ts,
                product_type=product,
                amount=float(_amount_for(product, 1)[0]),
                payment_method=cust_paymethod[ci],
                payment_instrument=str(rng.choice(cust_instruments[ci])),
                device_hash=str(rng.choice(cust_devices[ci])),
                ip_country=cust_country[ci],
                account_country=cust_country[ci],
                account_age_days=max(30, (ts - cust_created[ci]).days),
                promo_code=None,
                auth_result="approved",
                refunded=rng.random() < 0.88,
                chargeback=False,
                fraud_archetype="refund_abuse",
                is_fraud=True,
            )


def gen_giftcard_laundering() -> None:
    """Rings of fresh accounts on shared devices converting stolen cards into
    high-denomination gift cards."""
    for _ in range(22):
        devices = _hex_ids("dev_", int(rng.choice([1, 1, 2])))
        n_accts = int(rng.integers(4, 8))
        accts = _hex_ids("cust_", n_accts, 10)
        country = str(rng.choice(COUNTRIES, p=COUNTRY_W))
        instruments = _hex_ids("pi_", int(rng.integers(4, 9)), 10)
        ring_start = int(rng.integers(0, N_DAYS - 45))
        for acct in accts:
            for _k in range(int(rng.integers(2, 5))):
                ts = START + pd.Timedelta(days=ring_start + int(rng.integers(0, 40)),
                                          seconds=int(rng.integers(0, 86_000)))
                approved = rng.random() < 0.85
                pool.add(
                    customer_id=acct,
                    order_ts=ts,
                    product_type="gift_card",
                    amount=float(rng.choice(GC_DENOMS, p=[0.02, 0.06, 0.17, 0.35, 0.28, 0.12])),
                    payment_method=str(rng.choice(["credit_card", "prepaid_card"], p=[0.55, 0.45])),
                    payment_instrument=str(rng.choice(instruments)),
                    device_hash=str(rng.choice(devices)),
                    ip_country=country if rng.random() < 0.75 else str(rng.choice(COUNTRIES)),
                    account_country=country,
                    account_age_days=int(rng.integers(0, 14)),
                    promo_code=None,
                    auth_result="approved" if approved else "declined",
                    refunded=False,
                    chargeback=approved and rng.random() < 0.4,
                    fraud_archetype="giftcard_laundering",
                    is_fraud=True,
                )


def gen_account_takeover() -> None:
    """ATO: aged legitimate accounts suddenly purchasing high-value goods from
    a never-seen device in a different country."""
    aged = np.where((START - cust_created).dt.days > 300)[0]
    victims = rng.choice(aged, 170, replace=False)
    for ci in victims:
        device = _hex_ids("dev_", 1)[0]
        ip = str(rng.choice([c for c in COUNTRIES if c != cust_country[ci]]))
        t0 = START + pd.Timedelta(days=int(rng.integers(20, N_DAYS - 2)),
                                  seconds=int(rng.integers(0, 86_000)))
        for _k in range(int(rng.integers(1, 4))):
            t0 = t0 + pd.Timedelta(seconds=int(rng.exponential(3_600)) + 60)
            product = str(rng.choice(["gift_card", "iap"], p=[0.7, 0.3]))
            amount = (float(rng.choice(GC_DENOMS[2:], p=[0.3, 0.35, 0.25, 0.1]))
                      if product == "gift_card" else round(float(rng.uniform(50, 200)), 2))
            pool.add(
                customer_id=customer_ids[ci],
                order_ts=t0,
                product_type=product,
                amount=amount,
                payment_method=cust_paymethod[ci],
                payment_instrument=str(rng.choice(cust_instruments[ci])),
                device_hash=device,
                ip_country=ip,
                account_country=cust_country[ci],
                account_age_days=max(300, (t0 - cust_created[ci]).days),
                promo_code=None,
                auth_result="approved" if rng.random() < 0.92 else "declined",
                refunded=False,
                chargeback=rng.random() < 0.85,
                fraud_archetype="account_takeover",
                is_fraud=True,
            )


def gen_promo_abuse() -> None:
    """One actor, many fresh accounts on the same device, each burning the
    same first-purchase promo once."""
    for _ in range(28):
        device = _hex_ids("dev_", 1)[0]
        country = str(rng.choice(COUNTRIES, p=COUNTRY_W))
        n_accts = int(rng.integers(6, 15))
        base_day = int(rng.integers(0, N_DAYS - 30))
        instrument = _hex_ids("pi_", 2, 10)
        for acct in _hex_ids("cust_", n_accts, 10):
            ts = START + pd.Timedelta(days=base_day + int(rng.integers(0, 25)),
                                      seconds=int(rng.integers(0, 86_000)))
            pool.add(
                customer_id=acct,
                order_ts=ts,
                product_type=str(rng.choice(["subscription", "iap"], p=[0.6, 0.4])),
                amount=float(rng.choice([4.99, 9.99], p=[0.7, 0.3])),
                payment_method="wallet",
                payment_instrument=str(rng.choice(instrument)),
                device_hash=device,
                ip_country=country,
                account_country=country,
                account_age_days=0,
                promo_code=str(rng.choice(["WELCOME15", "SPRING50"], p=[0.8, 0.2])),
                auth_result="approved",
                refunded=False,
                chargeback=False,
                fraud_archetype="promo_abuse",
                is_fraud=True,
            )


def gen_friendly_fraud() -> None:
    """Ordinary-looking purchases by real customers who later dispute the
    charge. Almost no upfront signal — deliberately hard to catch."""
    for _ in range(210):
        ci = int(rng.integers(0, N_CUSTOMERS))
        ts = _sample_ts(1)[0]
        product = str(rng.choice(["subscription", "iap", "download"], p=[0.4, 0.35, 0.25]))
        _legit = None  # noqa: F841  (explicitly not using the legit helper: outcome differs)
        created = cust_created[ci]
        if created > ts:
            created = ts - pd.Timedelta(days=int(rng.integers(60, 400)))
            cust_created[ci] = created
        pool.add(
            customer_id=customer_ids[ci],
            order_ts=ts,
            product_type=product,
            amount=float(_amount_for(product, 1)[0]),
            payment_method=str(rng.choice(["credit_card", "debit_card"], p=[0.75, 0.25])),
            payment_instrument=str(rng.choice(cust_instruments[ci])),
            device_hash=str(rng.choice(cust_devices[ci])),
            ip_country=cust_country[ci],
            account_country=cust_country[ci],
            account_age_days=max(0, (ts - created).days),
            promo_code=None,
            auth_result="approved",
            refunded=False,
            chargeback=True,
            fraud_archetype="friendly_fraud",
            is_fraud=True,
        )


gen_card_testing()
gen_refund_abuse()
gen_giftcard_laundering()
gen_account_takeover()
gen_promo_abuse()
gen_friendly_fraud()

# --------------------------------------------- legit edge-case populations
# These exist so the baseline rule has *realistic* false positives: heavy
# spenders tripping the velocity rule and gift-card shoppers tripping the
# amount rule. They are what the lockout contacts in Module 2 are made of.

# In-app-purchase "whales": binge sessions of 4-9 purchases within hours.
for _ in range(180):
    ci = int(rng.integers(0, N_CUSTOMERS))
    t = _sample_ts(1)[0]
    for _k in range(int(rng.integers(4, 9))):
        t = t + pd.Timedelta(seconds=int(rng.exponential(4_500)) + 120)
        _legit_order(int(ci), min(t, END), "iap",
                     round(float(np.clip(np.exp(rng.normal(3.2, 0.7)), 4.99, 149.99)), 2))

# Gift-card shoppers: several cards in one sitting, occasionally big ones,
# sometimes on a brand-new account (a real customer buying team gifts).
for _ in range(140):
    if rng.random() < 0.35:  # brand-new account
        ci = int(rng.integers(0, N_CUSTOMERS))
        cust_created[ci] = START + pd.Timedelta(days=int(rng.integers(0, N_DAYS - 10)))
    else:
        ci = int(rng.integers(0, N_CUSTOMERS))
    t = _sample_ts(1)[0]
    if t < cust_created[ci]:
        t = cust_created[ci] + pd.Timedelta(days=int(rng.integers(0, 5)), hours=12)
    for _k in range(int(rng.integers(2, 5))):
        t = t + pd.Timedelta(seconds=int(rng.exponential(1_800)) + 60)
        _legit_order(int(ci), min(t, END), "gift_card",
                     float(rng.choice(GC_DENOMS, p=[0.08, 0.22, 0.3, 0.22, 0.12, 0.06])))

# ------------------------------------------------- fill remainder with legit
remaining = TOTAL_ORDERS - len(pool.rows)
one_off_custs = rng.choice(N_CUSTOMERS, remaining, p=cust_weight)
one_off_ts = _sample_ts(remaining)
one_off_products = rng.choice(["iap", "download", "gift_card"], remaining, p=[0.52, 0.32, 0.16])
for ci, ts, product in zip(one_off_custs, one_off_ts, one_off_products):
    promo = str(rng.choice(LEGIT_PROMOS)) if rng.random() < 0.11 else None
    _legit_order(int(ci), ts, str(product), float(_amount_for(str(product), 1)[0]), promo)

orders = pd.DataFrame(pool.rows)
orders = orders.sort_values("order_ts", kind="mergesort").reset_index(drop=True)
orders.insert(0, "order_id", [f"ord_{i:06d}" for i in range(1, len(orders) + 1)])
orders["order_ts"] = pd.to_datetime(orders["order_ts"])

# Score with the SAME code the app's dataset uses, so lockout contacts below
# are generated from the exact set of orders the baseline rule blocks.
scored = score_orders(orders)

# ------------------------------------------------------------------ contacts

REASONS = {
    # reason: (journey_stage, base_weight, automation_rate, channel_bias, repeat_rate)
    "how_to_download":    ("post_purchase", 16, 0.72, "chat", 0.10),
    "refund_status":      ("refund",        14, 0.44, "chat", 0.30),
    "payment_declined":   ("checkout",      12, 0.35, "chat", 0.18),
    "subscription_cancel":("post_purchase", 11, 0.62, "chat", 0.12),
    "billing_question":   ("post_purchase",  9, 0.48, "email", 0.15),
    "pre_sales_question": ("discovery",      8, 0.55, "chat", 0.08),
    "promo_not_applied":  ("checkout",       6, 0.30, "chat", 0.14),
    "gift_card_redemption":("post_purchase", 6, 0.40, "chat", 0.16),
    "password_reset":     ("discovery",      5, 0.78, "chat", 0.06),
    "checkout_error":     ("checkout",       4, 0.22, "chat", 0.22),
    "chargeback_dispute": ("refund",         3, 0.05, "phone", 0.35),
}

SUMMARIES = {
    "how_to_download": ["Can't find my download link", "Purchased item missing from library",
                        "License key not delivered"],
    "refund_status": ["Where is my refund?", "Refund not showing on statement",
                      "Requested refund a week ago, no update"],
    "payment_declined": ["Card keeps getting declined", "Payment failed but bank shows a hold",
                        "Can't complete purchase, payment error"],
    "subscription_cancel": ["How do I cancel my plan?", "Cancel before next billing date",
                            "Downgrade my subscription"],
    "billing_question": ["Charged twice this month?", "Don't recognize this charge",
                         "Need an invoice for my records"],
    "pre_sales_question": ["Does the pro plan include X?", "Gift card usable on subscriptions?",
                           "Question before I buy"],
    "promo_not_applied": ["Promo code not working", "Discount missing at checkout",
                          "SPRING50 gives an error"],
    "gift_card_redemption": ["Gift card code invalid", "Balance not showing after redeem",
                             "How do I redeem a gift card?"],
    "password_reset": ["Reset email never arrived", "Locked out after password change",
                       "Can't sign in on new phone"],
    "checkout_error": ["Error 500 at checkout", "Checkout page freezes at payment step",
                       "Order fails at the last step"],
    "chargeback_dispute": ["Dispute filed with my bank", "Responding to chargeback notice",
                           "Bank reversed my payment"],
    "account_locked": ["Account suspended after purchase", "Order cancelled and account locked",
                       "Why was my order blocked?"],
}

contact_rows: list[dict] = []


def _handle_time(automated: bool, channel: str) -> int:
    if automated:
        return int(np.clip(rng.lognormal(4.9, 0.4), 45, 900))
    mu = {"chat": 6.05, "phone": 6.35, "email": 5.95}[channel]
    return int(np.clip(rng.lognormal(mu, 0.5), 120, 3_600))


def _channel(bias: str) -> str:
    if bias == "chat":
        return str(rng.choice(["chat", "email", "phone"], p=[0.62, 0.22, 0.16]))
    if bias == "email":
        return str(rng.choice(["chat", "email", "phone"], p=[0.3, 0.55, 0.15]))
    return str(rng.choice(["chat", "email", "phone"], p=[0.2, 0.2, 0.6]))


def _add_contact(reason: str, stage: str, ts: pd.Timestamp, customer_id: str,
                 order_id: str | None, automated: bool, channel: str, repeat: bool,
                 summary: str | None = None) -> None:
    contact_rows.append(dict(
        customer_id=customer_id,
        order_id=order_id,
        contact_ts=ts,
        channel=channel,
        journey_stage=stage,
        contact_reason=reason,
        contact_summary=summary or str(rng.choice(SUMMARIES[reason])),
        automated_resolution=automated,
        handle_time_sec=_handle_time(automated, channel),
        repeat_contact=repeat,
    ))


# 1) Lockout contacts — the cross-module link. Generated from the orders the
#    baseline rule actually blocks: 55% of blocked-legit customers get in
#    touch; a token 4% of blocked fraudsters also probe support.
blocked_legit = scored[scored["baseline_blocked"] & ~scored["is_fraud"]]
blocked_fraud = scored[scored["baseline_blocked"] & scored["is_fraud"]]
lockout_sources = pd.concat([
    blocked_legit[rng.random(len(blocked_legit)) < 0.55],
    blocked_fraud[rng.random(len(blocked_fraud)) < 0.03],
])
for _, o in lockout_sources.iterrows():
    ts = o["order_ts"] + pd.Timedelta(minutes=int(np.clip(rng.lognormal(4.3, 1.0), 4, 2_800)))
    automated = rng.random() < 0.12  # lockouts almost always need a human
    _add_contact("account_locked", "post_purchase", ts, o["customer_id"], o["order_id"],
                 automated, _channel("chat"), rng.random() < 0.28)

n_lockout = len(contact_rows)

# 2) Seeded incident: the SPRING50 promo misfires 2026-03-10 → 2026-03-14,
#    spiking checkout errors (and some promo complaints) well above baseline.
INCIDENT_START = pd.Timestamp("2026-03-10")
incident_extra = [("checkout_error", 330), ("promo_not_applied", 150)]
for reason, n in incident_extra:
    stage = REASONS[reason][0]
    for _ in range(n):
        ts = INCIDENT_START + pd.Timedelta(days=int(rng.integers(0, 5)),
                                           seconds=int(rng.integers(25_000, 84_000)))
        summary = str(rng.choice([
            "SPRING50 code throws an error at payment",
            "Checkout fails whenever I apply SPRING50",
            "Error 500 after entering promo code",
        ]))
        _add_contact(reason, stage, ts, str(rng.choice(customer_ids)), None,
                     rng.random() < 0.15, _channel("chat"), rng.random() < 0.2, summary)

# 3) Everything else, scaled so the grand total lands exactly on 8,000.
n_left = TOTAL_CONTACTS - len(contact_rows)
weights = np.array([v[1] for v in REASONS.values()], dtype=float)
counts = np.floor(weights / weights.sum() * n_left).astype(int)
counts[0] += n_left - counts.sum()  # absorb rounding remainder

approved = scored[(scored["auth_result"] == "approved") & ~scored["is_fraud"]]
refunded_orders = approved[approved["refunded"]]
declined_orders = scored[(scored["auth_result"] == "declined") & ~scored["is_fraud"]]
gift_orders = approved[approved["product_type"] == "gift_card"]
sub_orders = approved[approved["product_type"] == "subscription"]

LINK_SOURCE = {
    "refund_status": refunded_orders,
    "payment_declined": declined_orders,
    "gift_card_redemption": gift_orders,
    "subscription_cancel": sub_orders,
    "how_to_download": approved,
    "billing_question": approved,
    "chargeback_dispute": approved,
}

for (reason, (stage, _w, auto_rate, chan_bias, repeat_rate)), n in zip(REASONS.items(), counts):
    src = LINK_SOURCE.get(reason)
    linked = src.sample(n=min(n, len(src)), random_state=int(rng.integers(0, 2**31)),
                        replace=len(src) < n) if src is not None else None
    for k in range(n):
        if linked is not None:
            o = linked.iloc[k % len(linked)]
            cust, oid = o["customer_id"], o["order_id"]
            lag_h = float(np.clip(rng.lognormal(3.2, 1.2), 0.2, 24 * 21))
            ts = o["order_ts"] + pd.Timedelta(hours=lag_h)
        else:
            cust, oid = str(rng.choice(customer_ids)), None
            ts = _sample_ts(1)[0]
        _add_contact(reason, stage, min(ts, END), cust, oid,
                     rng.random() < auto_rate, _channel(chan_bias), rng.random() < repeat_rate)

contacts = pd.DataFrame(contact_rows)
contacts = contacts.sort_values("contact_ts", kind="mergesort").reset_index(drop=True)
contacts.insert(0, "contact_id", [f"ct_{i:05d}" for i in range(1, len(contacts) + 1)])
contacts["contact_ts"] = pd.to_datetime(contacts["contact_ts"])

# ------------------------------------------------------------------ write

OUT.mkdir(exist_ok=True)
orders.to_parquet(OUT / "raw_orders.parquet", index=False)
contacts.to_parquet(OUT / "raw_contacts.parquet", index=False)

print(f"orders: {len(orders):,} ({orders['is_fraud'].mean():.2%} fraud)")
print(orders[orders["is_fraud"]]["fraud_archetype"].value_counts().to_string())
print(f"contacts: {len(contacts):,} (lockout contacts: {n_lockout})")
print(f"baseline rule {BASELINE} blocked {int(scored['baseline_blocked'].sum())} orders "
      f"({int((scored['baseline_blocked'] & ~scored['is_fraud']).sum())} legit)")
print(f"wrote {OUT}/raw_orders.parquet, raw_contacts.parquet")

# Signal data pipeline

Two scripts, pandas + numpy only, everything seeded (`SEED = 42`):

```bash
python data-pipeline/generate_data.py   # 25,000 orders + 8,000 contacts → output/*.parquet
python data-pipeline/features.py        # engineered features + risk score → web/public/data/
```

Output is byte-for-byte reproducible — run it twice and the parquet checksums match.

## Why each distribution looks the way it does

**Order volume.** Daily weights combine a +25% linear growth trend (a store that is
doing okay), a 1.18× weekend bump (digital goods are leisure purchases), and holiday
multipliers in late November and December (gift cards peak). Time of day is a mixture:
65% of purchases cluster around an evening peak (normal, μ=20:00, σ=2.5h), the rest are
flat across the day — matching consumer entertainment traffic rather than B2B.

**Customers.** 8,600 accounts with creation dates up to 4 years back. One-off purchase
propensity is gamma-distributed (shape 0.9), giving the usual heavy tail: most customers
buy once or twice, a few buy constantly. Subscribers (1,650) churn geometrically
(p=0.16 per month), so tenure has the familiar exponential-ish decay.

**Prices.** Subscriptions sit on four fixed tiers. In-app purchases and downloads are
lognormal (multiplicative pricing psychology; long right tail, floor at $0.99/$2.99).
Gift cards use fixed denominations with mass concentrated at $25–$50.

**Legit noise.** 3.5% auth declines, 4.5% refunds, 0.15% chargebacks, 3% IP/account
country mismatch (travel), and two deliberate edge populations: IAP "whales" who binge
4–8 purchases in an evening, and gift-card shoppers who buy several cards in one
sitting, occasionally on a brand-new account. These exist so the fraud rules have
*realistic* false positives — they are the customers the lockout contacts in the
contact-attribution module come from.

## The six fraud archetypes

| Archetype | Signature injected |
|---|---|
| Card testing | Brand-new account, one device cycling many stolen instruments, $0.99–$4.99 amounts seconds-to-minutes apart, 62% decline rate |
| Refund abuse | Aged accounts, ordinary purchases, 88% refund rate accumulating over months |
| Gift-card laundering | Rings: 4–7 fresh accounts on 1–2 shared devices converting stolen/prepaid cards into $100–$500 gift cards over a few weeks |
| Account takeover | Aged (300+ day) accounts suddenly buying high-value gift cards from a never-seen device in a different country, 85% chargeback |
| Promo abuse | One device, 6–14 fresh accounts, each burning a first-purchase promo exactly once |
| Friendly fraud | Statistically indistinguishable from legit at order time — the only signal is the later chargeback. Deliberately hard: no scorer should catch it, and ours doesn't |

Fraud is ~8.9% of orders — high for a real store, deliberate here so patterns are
discoverable in a 25k-row demo dataset.

## Features and the risk score (`features.py`)

Engineered features: trailing-24h order velocity per account (two-pointer window
count), trailing-24h declined auths per device, distinct accounts per device, Shannon
entropy of payment instruments per device, per-product-type amount z-scores, prior
refund count per customer, and a new-device flag.

The risk score is **not a trained model**. It is a weighted logistic-style score:
each feature is scaled to [0,1], multiplied by a hand-set weight (documented in
`WEIGHTS`), summed with an intercept, and squashed through a sigmoid ×100. Every score
is decomposable feature-by-feature, which is the point — this project is about
explainable decisioning, not model fitting.

**Baseline production rule** (also the simulator defaults in the app): block when
`risk_score ≥ 60` OR `orders_24h ≥ 6` OR (`amount ≥ $500` AND account ≤ 30 days old).
Against ground truth it runs ~73% precision / ~59% recall with 486 false positives.

## Contacts

8,000 contacts across 12 reasons with per-reason journey stage, automation resolution
rate, channel mix, repeat-contact rate, and lognormal handle times (bot sessions
short, phone longest). Two engineered populations:

- **Lockout contacts** are generated *from the actual orders the baseline rule
  blocks*: 55% of legitimately-blocked customers contact support (plus 3% of blocked
  fraudsters probing the wall). This is what ties the two modules together — the
  simulator's false-positive count at default thresholds and the lockout-contact
  analysis in the app are the same underlying rows.
- **A seeded incident**: the SPRING50 promo misfires 2026-03-10 → 03-14, spiking
  checkout-error contacts ~4× above baseline for five days. The anomaly-watch page
  can find it with a rolling mean + z-score.

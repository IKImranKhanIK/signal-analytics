/**
 * Every chart in the app runs one of these queries verbatim against DuckDB-WASM.
 * The "View SQL" toggle on each chart card shows the exact string that produced
 * the chart, and each runs unmodified in the SQL Workbench.
 */

// ------------------------------------------------------------- fraud module

export const KPI_SUMMARY = `SELECT
  count(*)                                       AS total_orders,
  round(100.0 * avg(is_fraud::INT), 2)           AS fraud_rate_pct,
  round(100.0 * count(*) FILTER (WHERE chargeback)
    / count(*) FILTER (WHERE auth_result = 'approved'), 2)   AS chargeback_rate_pct,
  round(sum(amount) FILTER (WHERE is_fraud AND auth_result = 'approved')) AS fraud_exposure_usd,
  round(100.0 * count(*) FILTER (WHERE baseline_blocked AND is_fraud)
    / count(*) FILTER (WHERE baseline_blocked), 1)           AS rule_precision_pct,
  round(100.0 * count(*) FILTER (WHERE baseline_blocked AND is_fraud)
    / count(*) FILTER (WHERE is_fraud), 1)                   AS rule_recall_pct
FROM orders`

export const MONTHLY_TREND = `SELECT
  strftime(date_trunc('month', order_ts), '%Y-%m')  AS month,
  count(*)                                          AS orders,
  round(100.0 * avg(is_fraud::INT), 2)              AS fraud_rate_pct,
  round(100.0 * count(*) FILTER (WHERE chargeback)
    / count(*) FILTER (WHERE auth_result = 'approved'), 2) AS chargeback_rate_pct
FROM orders
GROUP BY 1
ORDER BY 1`

export const MONTHLY_VOLUME = `SELECT
  strftime(date_trunc('month', order_ts), '%Y-%m') AS month,
  count(*)                                         AS orders,
  round(sum(amount) FILTER (WHERE auth_result = 'approved')) AS gross_usd
FROM orders
GROUP BY 1
ORDER BY 1`

export const ARCHETYPE_MIX = `SELECT
  fraud_archetype,
  count(*)                                                    AS orders,
  round(sum(amount) FILTER (WHERE auth_result = 'approved'))  AS exposure_usd,
  round(100.0 * avg((auth_result = 'declined')::INT), 1)      AS decline_rate_pct,
  round(100.0 * avg(baseline_blocked::INT), 1)                AS caught_by_rules_pct
FROM orders
WHERE is_fraud
GROUP BY 1
ORDER BY orders DESC`

/** Scatter sample: all fraud orders plus a reproducible 3k sample of legit. */
export const PATTERN_SCATTER = `SELECT order_id, risk_score, amount, fraud_archetype,
       payment_method, product_type, orders_24h, account_age_days
FROM orders
WHERE is_fraud
UNION ALL
SELECT order_id, risk_score, amount, fraud_archetype,
       payment_method, product_type, orders_24h, account_age_days
FROM (
  SELECT * FROM orders
  WHERE NOT is_fraud
  USING SAMPLE 3000 ROWS (reservoir, 42)
)`

export const ARCHETYPE_PROFILE = `SELECT
  fraud_archetype,
  count(*)                                                   AS orders,
  round(avg(risk_score), 1)                                  AS avg_risk_score,
  round(median(amount), 2)                                   AS median_amount,
  round(avg(orders_24h), 1)                                  AS avg_orders_24h,
  round(100.0 * avg((auth_result = 'declined')::INT), 1)     AS decline_rate_pct,
  round(100.0 * avg(geo_mismatch::INT), 1)                   AS geo_mismatch_pct,
  round(avg(account_age_days))                               AS avg_account_age_days,
  round(sum(amount) FILTER (WHERE auth_result = 'approved')) AS exposure_usd,
  round(100.0 * avg(baseline_blocked::INT), 1)               AS caught_by_rules_pct
FROM orders
WHERE is_fraud
GROUP BY 1`

/** Self-join: pairs of accounts that transact from the same device. */
export const RING_EDGES = `SELECT
  a.device_hash,
  a.customer_id                                   AS account_a,
  b.customer_id                                   AS account_b,
  count(*)                                        AS co_occurrences,
  round(sum(a.amount))                            AS gross_a_usd
FROM orders a
JOIN orders b
  ON a.device_hash = b.device_hash
 AND a.customer_id < b.customer_id
GROUP BY 1, 2, 3
ORDER BY co_occurrences DESC
LIMIT 200`

export const RING_DEVICES = `SELECT
  device_hash,
  count(DISTINCT customer_id)                                AS accounts,
  count(DISTINCT payment_instrument)                         AS instruments,
  count(*)                                                   AS orders,
  round(sum(amount) FILTER (WHERE auth_result = 'approved')) AS gross_usd,
  round(100.0 * avg(is_fraud::INT), 1)                       AS fraud_pct,
  round(avg(risk_score), 1)                                  AS avg_risk_score
FROM orders
GROUP BY 1
HAVING count(DISTINCT customer_id) >= 3
ORDER BY accounts DESC, gross_usd DESC
LIMIT 25`

export const RING_MEMBERS = `SELECT
  o.device_hash,
  o.customer_id,
  count(*)                 AS orders,
  round(sum(o.amount))     AS gross_usd,
  max(o.is_fraud::INT)     AS is_fraud
FROM orders o
WHERE o.device_hash IN (
  SELECT device_hash FROM orders
  GROUP BY 1
  HAVING count(DISTINCT customer_id) >= 4
  ORDER BY count(DISTINCT customer_id) DESC, sum(amount) DESC
  LIMIT 6)
GROUP BY 1, 2
ORDER BY 1, orders DESC`

export const simulatorQuery = (risk: number, velocity: number, amount: number): string =>
  `WITH decisions AS (
  SELECT is_fraud, amount,
         (risk_score >= ${risk}
          OR orders_24h >= ${velocity}
          OR (amount >= ${amount} AND account_age_days <= 30)) AS blocked
  FROM orders
)
SELECT
  count(*) FILTER (WHERE blocked AND is_fraud)          AS fraud_caught,
  count(*) FILTER (WHERE NOT blocked AND is_fraud)      AS fraud_missed,
  count(*) FILTER (WHERE blocked AND NOT is_fraud)      AS good_blocked,
  count(*) FILTER (WHERE NOT blocked AND NOT is_fraud)  AS good_approved,
  round(sum(amount) FILTER (WHERE NOT blocked AND is_fraud)) AS missed_exposure_usd,
  round(sum(amount) FILTER (WHERE blocked AND NOT is_fraud)) AS blocked_good_revenue_usd
FROM decisions`

/** Observed lockout-contact rate per 1,000 blocked orders (used to project CX cost). */
export const LOCKOUT_RATE = `WITH blocked AS (
  SELECT * FROM orders WHERE baseline_blocked
), lockouts AS (
  SELECT c.*, o.is_fraud
  FROM contacts c
  JOIN orders o USING (order_id)
  WHERE c.contact_reason = 'account_locked'
)
SELECT
  (SELECT count(*) FROM blocked)                          AS blocked_orders,
  (SELECT count(*) FROM blocked WHERE NOT is_fraud)       AS false_positives,
  (SELECT count(*) FROM lockouts)                         AS lockout_contacts,
  (SELECT count(*) FROM lockouts WHERE NOT is_fraud)      AS lockouts_from_good_customers,
  round(1000.0 * (SELECT count(*) FROM lockouts)
    / (SELECT count(*) FROM blocked))                     AS contacts_per_1000_blocked,
  round(1000.0 * (SELECT count(*) FROM lockouts WHERE NOT is_fraud)
    / (SELECT count(*) FROM blocked WHERE NOT is_fraud))  AS contacts_per_1000_false_positives
FROM (SELECT 1)`

// ----------------------------------------------------------- contact module

export const JOURNEY_STAGES = `SELECT
  journey_stage,
  count(*)                                        AS contacts,
  round(100.0 * avg(automated_resolution::INT), 1) AS automation_rate_pct,
  round(avg(handle_time_sec))                     AS avg_handle_sec,
  round(100.0 * avg(repeat_contact::INT), 1)      AS repeat_rate_pct
FROM contacts
GROUP BY 1
ORDER BY CASE journey_stage
  WHEN 'discovery' THEN 1 WHEN 'checkout' THEN 2
  WHEN 'post_purchase' THEN 3 ELSE 4 END`

export const JOURNEY_REASONS = `SELECT
  journey_stage,
  contact_reason,
  count(*)                                         AS contacts,
  round(100.0 * avg(automated_resolution::INT), 1) AS automation_rate_pct
FROM contacts
GROUP BY 1, 2
ORDER BY 1, contacts DESC`

export const PARETO = `SELECT
  contact_reason,
  count(*)                                                   AS contacts,
  round(100.0 * count(*) / sum(count(*)) OVER (), 1)         AS share_pct,
  round(100.0 * sum(count(*)) OVER (ORDER BY count(*) DESC)
    / sum(count(*)) OVER (), 1)                              AS cumulative_pct
FROM contacts
GROUP BY 1
ORDER BY contacts DESC`

export const AUTOMATION_CANDIDATES = `SELECT
  contact_reason,
  count(*)                                          AS contacts,
  round(100.0 * avg(automated_resolution::INT), 1)  AS automation_rate_pct,
  round(avg(handle_time_sec))                       AS avg_handle_sec,
  round(100.0 * avg(repeat_contact::INT), 1)        AS repeat_rate_pct,
  count(*) FILTER (WHERE NOT automated_resolution)  AS manual_contacts
FROM contacts
GROUP BY 1
ORDER BY manual_contacts DESC`

/** Deflection quality: does a bot resolution stick as well as a human one? */
export const DEFLECTION_QUALITY = `SELECT
  contact_reason,
  count(*) FILTER (WHERE automated_resolution)            AS bot_contacts,
  round(100.0 * avg(repeat_contact::INT)
    FILTER (WHERE automated_resolution), 1)               AS repeat_after_bot_pct,
  round(100.0 * avg(repeat_contact::INT)
    FILTER (WHERE NOT automated_resolution), 1)           AS repeat_after_agent_pct,
  round(100.0 * avg(repeat_contact::INT) FILTER (WHERE automated_resolution)
      - 100.0 * avg(repeat_contact::INT) FILTER (WHERE NOT automated_resolution), 1) AS delta_pts
FROM contacts
GROUP BY 1
HAVING count(*) FILTER (WHERE automated_resolution) >= 50
ORDER BY delta_pts DESC`

export const WEEKLY_ANOMALY = `WITH weekly AS (
  SELECT date_trunc('week', contact_ts) AS week, count(*) AS contacts
  FROM contacts
  GROUP BY 1
), stats AS (
  SELECT week, contacts,
    avg(contacts)         OVER w AS rolling_mean,
    stddev_samp(contacts) OVER w AS rolling_sd
  FROM weekly
  WINDOW w AS (ORDER BY week ROWS BETWEEN 8 PRECEDING AND 1 PRECEDING)
)
SELECT
  strftime(week, '%Y-%m-%d')                              AS week_start,
  contacts,
  round(rolling_mean, 1)                                  AS rolling_mean,
  round((contacts - rolling_mean) / nullif(rolling_sd, 0), 2) AS z_score
FROM stats
ORDER BY week`

export const weekDetailQuery = (weekStart: string): string =>
  `WITH spike AS (
  SELECT contact_reason, count(*) AS contacts_this_week
  FROM contacts
  WHERE date_trunc('week', contact_ts) = DATE '${weekStart}'
  GROUP BY 1
), baseline AS (
  SELECT contact_reason, count(*) / 8.0 AS weekly_avg_prior_8w
  FROM contacts
  WHERE contact_ts >= DATE '${weekStart}' - INTERVAL 56 DAY
    AND contact_ts <  DATE '${weekStart}'
  GROUP BY 1
)
SELECT s.contact_reason,
       s.contacts_this_week,
       round(coalesce(b.weekly_avg_prior_8w, 0), 1) AS weekly_avg_prior_8w,
       round(s.contacts_this_week - coalesce(b.weekly_avg_prior_8w, 0), 1) AS excess
FROM spike s
LEFT JOIN baseline b USING (contact_reason)
ORDER BY excess DESC`

// ------------------------------------------------------- workbench examples

export const WORKBENCH_EXAMPLES: { title: string; description: string; sql: string }[] = [
  {
    title: 'Fraud rate by product type',
    description: 'Warm-up aggregate: which products attract fraud.',
    sql: `SELECT product_type,
  count(*)                              AS orders,
  round(100.0 * avg(is_fraud::INT), 2) AS fraud_rate_pct,
  round(avg(amount), 2)                AS avg_amount
FROM orders
GROUP BY 1
ORDER BY fraud_rate_pct DESC`,
  },
  {
    title: 'Velocity bursts via window function',
    description: 'Recompute trailing-24h order velocity from raw timestamps — no precomputed column needed.',
    sql: `SELECT order_id, customer_id, order_ts, amount, fraud_archetype,
  count(*) OVER (
    PARTITION BY customer_id ORDER BY order_ts
    RANGE BETWEEN INTERVAL 24 HOURS PRECEDING AND CURRENT ROW
  ) AS orders_trailing_24h
FROM orders
QUALIFY orders_trailing_24h >= 6
ORDER BY orders_trailing_24h DESC, order_ts
LIMIT 100`,
  },
  {
    title: 'Card-testing signature',
    description: 'Micro-amounts + decline bursts per device, the classic BIN-testing fingerprint.',
    sql: `SELECT device_hash,
  count(*)                                               AS attempts,
  round(100.0 * avg((auth_result = 'declined')::INT), 1) AS decline_rate_pct,
  round(avg(amount), 2)                                  AS avg_amount,
  count(DISTINCT payment_instrument)                     AS distinct_instruments,
  min(order_ts)                                          AS first_seen,
  max(order_ts)                                          AS last_seen
FROM orders
WHERE amount < 5
GROUP BY 1
HAVING count(*) >= 8 AND avg((auth_result = 'declined')::INT) > 0.3
ORDER BY attempts DESC`,
  },
  {
    title: 'Subscriber cohort retention',
    description: 'Classic cohort grid: months since first charge, distinct active subscribers.',
    sql: `WITH firsts AS (
  SELECT customer_id, date_trunc('month', min(order_ts)) AS cohort_month
  FROM orders
  WHERE product_type = 'subscription'
  GROUP BY 1
)
SELECT strftime(f.cohort_month, '%Y-%m')                          AS cohort,
       datediff('month', f.cohort_month, date_trunc('month', o.order_ts)) AS months_since_first,
       count(DISTINCT o.customer_id)                              AS active_subscribers
FROM orders o
JOIN firsts f USING (customer_id)
WHERE o.product_type = 'subscription'
GROUP BY 1, 2
ORDER BY 1, 2`,
  },
  {
    title: 'Shared-device account pairs (self-join)',
    description: 'Ring detection: every pair of accounts transacting from the same device.',
    sql: RING_EDGES,
  },
  {
    title: 'The cost of a false positive',
    description: 'Cross-module: blocked orders joined to the lockout contacts they generate.',
    sql: LOCKOUT_RATE,
  },
]

export const SCHEMA_DOC = [
  {
    table: 'orders',
    rows: '25,000',
    columns: [
      ['order_id', 'unique id, ord_000001…'],
      ['customer_id', 'account id (shared across orders)'],
      ['order_ts', 'timestamp'],
      ['product_type', 'subscription · iap · download · gift_card'],
      ['amount', 'USD'],
      ['payment_method', 'credit_card · debit_card · wallet · prepaid_card · gift_card_balance'],
      ['payment_instrument', 'hashed instrument id'],
      ['device_hash', 'hashed device fingerprint'],
      ['ip_country / account_country', 'ISO country'],
      ['account_age_days', 'account tenure at order time'],
      ['promo_code', 'nullable'],
      ['auth_result', 'approved · declined'],
      ['refunded / chargeback', 'booleans'],
      ['fraud_archetype', 'ground truth: none + 6 archetypes'],
      ['is_fraud', 'ground-truth boolean'],
      ['orders_24h', 'trailing-24h orders on the account (engineered)'],
      ['device_declines_24h', 'trailing-24h declines on the device (engineered)'],
      ['accounts_per_device', 'distinct accounts on this device (engineered)'],
      ['payment_entropy_device', 'Shannon entropy of instruments per device (engineered)'],
      ['amount_z', 'z-score within product type (engineered)'],
      ['prior_refunds', 'customer refunds before this order (engineered)'],
      ['new_device / geo_mismatch', 'booleans (engineered)'],
      ['risk_score', '0–100 transparent weighted score'],
      ['baseline_blocked', 'blocked by the current production rule'],
    ],
  },
  {
    table: 'contacts',
    rows: '8,000',
    columns: [
      ['contact_id', 'unique id, ct_00001…'],
      ['customer_id', 'links to orders.customer_id'],
      ['order_id', 'nullable link to a specific order'],
      ['contact_ts', 'timestamp'],
      ['channel', 'chat · email · phone'],
      ['journey_stage', 'discovery · checkout · post_purchase · refund'],
      ['contact_reason', '12 categories, e.g. account_locked'],
      ['contact_summary', 'one-line free text'],
      ['automated_resolution', 'true when the bot resolved it'],
      ['handle_time_sec', 'seconds'],
      ['repeat_contact', 'true when a follow-up on the same issue'],
    ],
  },
]

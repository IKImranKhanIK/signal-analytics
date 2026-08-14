import type { CaseFile } from './types'

/**
 * Case file #2: device-linkage analysis. Harder than the March spike because
 * the answer isn't a single event — it's a judgment call: the same "shared
 * device" signal describes both fraud rings and innocent households, and the
 * work is building features that separate them BEFORE peeking at labels.
 */
export const THE_RING: CaseFile = {
  id: 'the-ring',
  title: 'The ring',
  tagline:
    'Some devices place orders for four, five, seven different accounts. Some are fraud rings. Some are families sharing a tablet. Build the features that tell them apart — then check yourself against ground truth.',
  difficulty: 'intermediate',
  minutes: 40,
  intro:
    'Linkage analysis is the highest-leverage move in fraud work: fraudsters can fake identities cheaply, but sharing infrastructure — a device, a card — is what makes their economics work, and it leaves a join key. The trap is that innocent people share infrastructure too. This case walks the full arc: find the shared devices, enumerate the linked account pairs with a self-join, engineer suspicion features, draw a decision line without looking at labels, and only then use the synthetic ground truth to grade yourself. That last step is a luxury real analysts never get — use it to learn how your intuition performs.',
  steps: [
    {
      id: 'shared',
      title: 'How common is device sharing?',
      brief:
        'Before hunting rings, establish the base rate. If thousands of devices are shared, "shared device" is a useless signal; if almost none are, every one deserves a look.',
      task: 'Count devices used by 2 or more distinct customer accounts. Return column: shared_devices.',
      starter:
        'SELECT count(*) AS shared_devices\nFROM (\n  -- your turn: one row per device with 2+ distinct accounts\n)',
      hints: [
        'Inner query: GROUP BY device_hash HAVING count(DISTINCT customer_id) >= 2.',
        'SELECT count(*) AS shared_devices FROM (SELECT device_hash FROM orders GROUP BY 1 HAVING count(DISTINCT customer_id) >= 2)',
      ],
      solution:
        'SELECT count(*) AS shared_devices\nFROM (\n  SELECT device_hash\n  FROM orders\n  GROUP BY 1\n  HAVING count(DISTINCT customer_id) >= 2\n)',
      check: { type: 'rows', columns: ['shared_devices'] },
      debrief:
        '188 shared devices out of 8,724 — about 2%. Rare enough to investigate every one, common enough that "shared = fraud" would be a terrible rule. Hold that thought; it becomes the whole case.',
      teaches: 'HAVING + subqueries',
    },
    {
      id: 'pairs',
      title: 'Enumerate the linked pairs (self-join)',
      brief:
        'A ring is a graph: accounts are nodes, shared infrastructure is edges. The SQL move for edges is joining a table to itself. Count the distinct account pairs connected by a common device.',
      task: 'Using a self-join on orders, count distinct pairs of accounts that transact from the same device (each pair counted once — use a.customer_id < b.customer_id). Return column: account_pairs.',
      starter:
        'SELECT count(*) AS account_pairs\nFROM (\n  SELECT DISTINCT a.customer_id AS acct_a, b.customer_id AS acct_b\n  FROM orders a\n  JOIN orders b\n    ON  -- your turn: same device, no double-counting\n)',
      hints: [
        'The join condition needs two parts: a.device_hash = b.device_hash AND a.customer_id < b.customer_id. The < is what stops (x,y) and (y,x) from both appearing.',
        'Without DISTINCT inside, you count co-occurring ORDERS, not account pairs — a busy ring would be counted hundreds of times.',
        'SELECT count(*) AS account_pairs FROM (SELECT DISTINCT a.customer_id AS acct_a, b.customer_id AS acct_b FROM orders a JOIN orders b ON a.device_hash = b.device_hash AND a.customer_id < b.customer_id)',
      ],
      solution:
        'SELECT count(*) AS account_pairs\nFROM (\n  SELECT DISTINCT a.customer_id AS acct_a, b.customer_id AS acct_b\n  FROM orders a\n  JOIN orders b\n    ON a.device_hash = b.device_hash\n   AND a.customer_id < b.customer_id\n)',
      check: { type: 'rows', columns: ['account_pairs'] },
      debrief:
        '2,105 linked pairs from just 188 shared devices — pair counts grow quadratically with cluster size (a 14-account device alone contributes 91 pairs). That asymmetry is why one promo-abuse device lights up an entire linkage graph, and why graph-shaped thinking beats row-shaped thinking for rings.',
      teaches: 'self-joins + DISTINCT',
    },
    {
      id: 'concentrate',
      title: 'Where is the concentration?',
      brief:
        'Two accounts on one device is a couple. Four or more starts to look organized. Narrow the 188 down to the heavy clusters before spending feature-engineering effort.',
      task: 'Count devices used by 4 or more distinct accounts. Return column: heavy_devices.',
      starter: '-- Same shape as step 1, different threshold.',
      hints: [
        'SELECT count(*) AS heavy_devices FROM (SELECT device_hash FROM orders GROUP BY 1 HAVING count(DISTINCT customer_id) >= 4)',
      ],
      solution:
        'SELECT count(*) AS heavy_devices\nFROM (\n  SELECT device_hash\n  FROM orders\n  GROUP BY 1\n  HAVING count(DISTINCT customer_id) >= 4\n)',
      check: { type: 'rows', columns: ['heavy_devices'] },
      debrief:
        '60 devices carry 4+ accounts. But be careful with the threshold instinct — some 4-person households are real, and some 3-account rings are fraud. Account count alone is a volume feature, not a suspicion feature. The next step builds the ones that actually discriminate.',
      teaches: 'threshold skepticism',
    },
    {
      id: 'features',
      title: 'Engineer suspicion features — no labels allowed',
      brief:
        'What separates a ring from a household? Households share a device but not payment instruments, and their accounts are years old. Rings cycle many instruments through fresh accounts. Turn that reasoning into columns, then draw your line.',
      task: 'For devices with 3+ distinct accounts, compute distinct payment instruments and median account age. How many devices have 4+ instruments AND median account age ≤ 14 days? Return column: suspects.',
      starter:
        'WITH shared AS (\n  SELECT device_hash,\n         count(DISTINCT customer_id)        AS accounts,\n         count(DISTINCT payment_instrument) AS instruments,\n         median(account_age_days)           AS median_age\n  FROM orders\n  GROUP BY 1\n  HAVING count(DISTINCT customer_id) >= 3\n)\n-- your turn: count the rows past your decision line',
      hints: [
        'The CTE is already built — SELECT count(*) FROM shared WHERE instruments >= 4 AND median_age <= 14.',
        'WITH shared AS (SELECT device_hash, count(DISTINCT customer_id) AS accounts, count(DISTINCT payment_instrument) AS instruments, median(account_age_days) AS median_age FROM orders GROUP BY 1 HAVING count(DISTINCT customer_id) >= 3) SELECT count(*) AS suspects FROM shared WHERE instruments >= 4 AND median_age <= 14',
      ],
      solution:
        'WITH shared AS (\n  SELECT device_hash,\n         count(DISTINCT customer_id)        AS accounts,\n         count(DISTINCT payment_instrument) AS instruments,\n         median(account_age_days)           AS median_age\n  FROM orders\n  GROUP BY 1\n  HAVING count(DISTINCT customer_id) >= 3\n)\nSELECT count(*) AS suspects\nFROM shared\nWHERE instruments >= 4 AND median_age <= 14',
      check: { type: 'rows', columns: ['suspects'] },
      debrief:
        '25 suspect devices out of 98 shared-by-3+. Notice what the two features encode: instrument cycling is the fraud *economics* (many stolen cards need laundering), and fresh accounts are the fraud *logistics* (rings mint accounts; families do not). Features built from how the crime has to work beat features built from what happened to correlate last month.',
      teaches: 'feature engineering',
    },
    {
      id: 'grade',
      title: 'Now — and only now — peek at the labels',
      brief:
        'This dataset is synthetic, so it has something production never has: ground truth. Grade your decision line. What share of the orders on your 25 suspect devices are actually fraudulent?',
      task: 'For the suspect devices from step 4, compute the percentage of their orders with is_fraud = true. Return column: fraud_pct (0–100 scale).',
      starter:
        'WITH shared AS (\n  SELECT device_hash,\n         count(DISTINCT payment_instrument) AS instruments,\n         median(account_age_days)           AS median_age\n  FROM orders\n  GROUP BY 1\n  HAVING count(DISTINCT customer_id) >= 3\n),\nsuspects AS (\n  SELECT device_hash FROM shared\n  WHERE instruments >= 4 AND median_age <= 14\n)\n-- your turn: fraud rate across all orders on suspect devices',
      hints: [
        'Join orders back to the suspects CTE on device_hash, then avg(is_fraud::INT).',
        'WITH shared AS (SELECT device_hash, count(DISTINCT payment_instrument) AS instruments, median(account_age_days) AS median_age FROM orders GROUP BY 1 HAVING count(DISTINCT customer_id) >= 3), suspects AS (SELECT device_hash FROM shared WHERE instruments >= 4 AND median_age <= 14) SELECT round(100.0 * avg(o.is_fraud::INT), 1) AS fraud_pct FROM orders o JOIN suspects s USING (device_hash)',
      ],
      solution:
        'WITH shared AS (\n  SELECT device_hash,\n         count(DISTINCT payment_instrument) AS instruments,\n         median(account_age_days)           AS median_age\n  FROM orders\n  GROUP BY 1\n  HAVING count(DISTINCT customer_id) >= 3\n),\nsuspects AS (\n  SELECT device_hash FROM shared\n  WHERE instruments >= 4 AND median_age <= 14\n)\nSELECT round(100.0 * avg(o.is_fraud::INT), 1) AS fraud_pct\nFROM orders o\nJOIN suspects s USING (device_hash)',
      check: { type: 'value-range', column: 'fraud_pct', min: 95, max: 100 },
      debrief:
        '100% — every order on all 25 suspect devices is labeled fraud, and the 41 household devices in the same shared-3+ pool were untouched. Do not let that flatter you: synthetic data is cleaner than life. In production this heuristic might run 85% precision, and the remaining 15% would be real families locked out of their accounts — which is exactly why linkage features should feed a score and a review queue, not an automatic ban wave.',
      teaches: 'validating against labels',
    },
    {
      id: 'size',
      title: 'Size the problem for the memo',
      brief:
        'The finding needs a dollar figure. How much approved gross volume flowed through the suspect devices? That number is what gets the hold-and-verify flow onto a roadmap.',
      task: 'Sum the approved order amounts on the 25 suspect devices. Return column: gross_usd.',
      starter: '-- Same CTEs as step 5; change the final SELECT.',
      hints: [
        "sum(amount) FILTER (WHERE auth_result = 'approved') over the joined orders.",
        "WITH shared AS (SELECT device_hash, count(DISTINCT payment_instrument) AS instruments, median(account_age_days) AS median_age FROM orders GROUP BY 1 HAVING count(DISTINCT customer_id) >= 3), suspects AS (SELECT device_hash FROM shared WHERE instruments >= 4 AND median_age <= 14) SELECT round(sum(o.amount) FILTER (WHERE o.auth_result = 'approved')) AS gross_usd FROM orders o JOIN suspects s USING (device_hash)",
      ],
      solution:
        "WITH shared AS (\n  SELECT device_hash,\n         count(DISTINCT payment_instrument) AS instruments,\n         median(account_age_days)           AS median_age\n  FROM orders\n  GROUP BY 1\n  HAVING count(DISTINCT customer_id) >= 3\n),\nsuspects AS (\n  SELECT device_hash FROM shared\n  WHERE instruments >= 4 AND median_age <= 14\n)\nSELECT round(sum(o.amount) FILTER (WHERE o.auth_result = 'approved')) AS gross_usd\nFROM orders o\nJOIN suspects s USING (device_hash)",
      check: { type: 'value-range', column: 'gross_usd', min: 40000, max: 50000 },
      debrief:
        'About $45k in approved volume — over 40% of the store\'s entire fraud exposure — concentrated on 25 devices you can name. That concentration is the good news hiding inside every ring analysis: organized abuse is efficient, and efficiency means chokepoints.',
      teaches: 'impact sizing',
    },
  ],
  memo: {
    title: 'Finding: high-denomination laundering rings on 25 linked devices',
    body: [
      'Finding: 188 of 8,724 devices (~2%) are shared by multiple accounts, linking 2,105 account pairs. Within the 98 devices shared by 3+ accounts, two label-free features — 4+ distinct payment instruments and median account age ≤ 14 days — isolate 25 devices. Against ground truth, orders on these devices are 100% fraudulent (gift-card laundering and promo-abuse rings), while none of the 41 household-pattern devices are flagged.',
      'Impact: ~$45k of approved gross volume — over 40% of total fraud exposure — flows through these 25 chokepoints. Because rings depend on shared infrastructure to scale, device-level intervention is disproportionately efficient: acting on 25 devices addresses hundreds of accounts.',
      'Recommended actions: (P0) add instrument-count and account-age linkage features to the blocking path for gift-card orders ≥ $100 — the decisioning simulator shows the good-customer cost is minimal; (P1) route new accounts appearing on flagged devices to step-up verification rather than hard blocks, protecting the household false-positive case; (P2) re-run this linkage weekly — rings rotate devices, and the query is one GROUP BY away from being a monitor.',
    ],
  },
}

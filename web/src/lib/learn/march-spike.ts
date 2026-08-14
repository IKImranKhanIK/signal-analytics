import type { CaseFile } from './types'

/**
 * Case file #1: a real investigation, start to finish — from "the volume looks
 * weird" to a documented root cause and a written finding. Every answer is
 * checked against the live dataset.
 */
export const MARCH_SPIKE: CaseFile = {
  id: 'march-spike',
  title: 'The March spike',
  tagline:
    'Support volume exploded in one week of March 2026. Nobody knows why yet. You have two tables and a SQL engine — find out.',
  difficulty: 'beginner',
  minutes: 30,
  intro:
    'This is how contact-volume incidents actually arrive: not as a tidy alert, but as a manager asking "why was last week so bad?" You will work it the way an analyst does — establish the baseline, isolate the anomaly, make it statistically honest, drill to the category, find the smoking gun in free text, quantify the damage, and write the finding. Each step checks your SQL against the dataset. Hints cost nothing but pride.',
  steps: [
    {
      id: 'scope',
      title: 'Scope the data before touching anything',
      brief:
        'Every investigation starts the same way: know what you have. How much data, covering what period? Skipping this step is how analysts end up "discovering" that data simply stopped loading in June.',
      task: 'Count all support contacts and find the time range. Return columns: total_contacts, first_contact, last_contact.',
      starter: 'SELECT\n  count(*) AS total_contacts,\n  -- your turn: earliest and latest contact_ts\nFROM contacts',
      hints: [
        'min() and max() work on timestamps just like on numbers.',
        'SELECT count(*) AS total_contacts, min(contact_ts) AS first_contact, max(contact_ts) AS last_contact FROM contacts',
      ],
      solution:
        'SELECT\n  count(*)        AS total_contacts,\n  min(contact_ts) AS first_contact,\n  max(contact_ts) AS last_contact\nFROM contacts',
      check: { type: 'rows', columns: ['total_contacts'] },
      debrief:
        '8,000 contacts across exactly twelve months (2025-08 through 2026-07). Now you know the denominator for everything that follows — and that a "weekly average" means roughly 150, not 15 or 1,500.',
      teaches: 'aggregates',
    },
    {
      id: 'find-spike',
      title: 'Find the loudest week',
      brief:
        'The complaint was "last week was crazy" — but memory is a terrible instrument. Bucket contacts by week and let the data say which week was actually the outlier.',
      task: "Count contacts per calendar week (weeks start Monday — DuckDB's date_trunc('week', …) does this). Which week has the most? Return columns: week_start, contacts — just the single biggest week.",
      starter:
        "SELECT\n  date_trunc('week', contact_ts) AS week_start,\n  count(*) AS contacts\nFROM contacts\nGROUP BY 1\n-- your turn: surface the biggest week only",
      hints: [
        'ORDER BY contacts DESC will put the biggest week first; LIMIT 1 keeps only it.',
        "SELECT date_trunc('week', contact_ts) AS week_start, count(*) AS contacts FROM contacts GROUP BY 1 ORDER BY contacts DESC LIMIT 1",
      ],
      solution:
        "SELECT\n  date_trunc('week', contact_ts) AS week_start,\n  count(*) AS contacts\nFROM contacts\nGROUP BY 1\nORDER BY contacts DESC\nLIMIT 1",
      check: { type: 'rows', columns: ['week_start', 'contacts'] },
      debrief:
        'The week of 2026-03-09: 659 contacts. The next-busiest week all year is 183. That gap is your first real evidence — this is not seasonality, it is an event.',
      teaches: 'GROUP BY + date_trunc',
    },
    {
      id: 'zscore',
      title: 'Make it statistically honest',
      brief:
        '"That looks high" is an opinion. "That is thirty standard deviations above its trailing baseline" is a finding. Compare the spike week against the mean and standard deviation of the 8 weeks before it.',
      task: 'Compute a z-score for the week of 2026-03-09 against the 8 prior weeks: (spike − avg) / stddev of weekly counts from 2026-01-12 through 2026-03-08. Return a column named z_score (first row is checked; any reasonable window arithmetic is accepted).',
      starter:
        "WITH weekly AS (\n  SELECT date_trunc('week', contact_ts) AS week, count(*) AS contacts\n  FROM contacts\n  GROUP BY 1\n)\n-- your turn: baseline stats over the 8 weeks before 2026-03-09,\n-- then (spike - mean) / stddev",
      hints: [
        "Two CTEs work nicely: one for the baseline (WHERE week >= DATE '2026-01-12' AND week < DATE '2026-03-09'), one for the spike week, then combine.",
        'avg(contacts) and stddev_samp(contacts) over the baseline rows give you the two numbers you need.',
        "WITH weekly AS (SELECT date_trunc('week', contact_ts) AS week, count(*) AS contacts FROM contacts GROUP BY 1),\nbase AS (SELECT avg(contacts) AS mu, stddev_samp(contacts) AS sd FROM weekly WHERE week >= DATE '2026-01-12' AND week < DATE '2026-03-09'),\nspike AS (SELECT contacts FROM weekly WHERE week = DATE '2026-03-09')\nSELECT round((spike.contacts - base.mu) / base.sd, 1) AS z_score FROM base, spike",
      ],
      solution:
        "WITH weekly AS (\n  SELECT date_trunc('week', contact_ts) AS week, count(*) AS contacts\n  FROM contacts\n  GROUP BY 1\n),\nbase AS (\n  SELECT avg(contacts) AS mu, stddev_samp(contacts) AS sd\n  FROM weekly\n  WHERE week >= DATE '2026-01-12' AND week < DATE '2026-03-09'\n),\nspike AS (\n  SELECT contacts FROM weekly WHERE week = DATE '2026-03-09'\n)\nSELECT round((spike.contacts - base.mu) / base.sd, 1) AS z_score\nFROM base, spike",
      check: { type: 'value-range', column: 'z_score', min: 15, max: 60 },
      debrief:
        'Around z ≈ 32 depending on your exact window — anything past 3 is alarm territory, so 32 is a five-alarm fire. Note what you just did: you turned "looks high" into a number a skeptical leader cannot argue with. The Anomaly Watch page runs this same logic as a rolling window across all 52 weeks.',
      teaches: 'CTEs + z-scores',
    },
    {
      id: 'drilldown',
      title: 'Drill down: what kind of contacts?',
      brief:
        'A volume spike is never "everything went up a bit" — it is almost always one or two categories carrying the excess. Compare each contact reason in the spike week against its own weekly average from the prior 8 weeks.',
      task: "For the week of 2026-03-09, find the two contact reasons with the largest excess over their prior-8-week weekly average. Return column: contact_reason — exactly two rows, biggest excess first or in any order.",
      starter:
        "-- Compare each reason's spike-week count vs its prior-8-week weekly average.\n-- The weekDetail pattern: one aggregate for the spike week, one for the baseline, joined.",
      hints: [
        'Aggregate the spike week per reason; aggregate the 8 prior weeks per reason divided by 8.0; LEFT JOIN and subtract.',
        "Filter the spike week with: contact_ts >= DATE '2026-03-09' AND contact_ts < DATE '2026-03-16'.",
        "WITH spike AS (SELECT contact_reason, count(*) AS n FROM contacts WHERE contact_ts >= DATE '2026-03-09' AND contact_ts < DATE '2026-03-16' GROUP BY 1),\nbase AS (SELECT contact_reason, count(*)/8.0 AS avg_n FROM contacts WHERE contact_ts >= DATE '2026-01-12' AND contact_ts < DATE '2026-03-09' GROUP BY 1)\nSELECT s.contact_reason FROM spike s LEFT JOIN base b USING (contact_reason)\nORDER BY s.n - coalesce(b.avg_n, 0) DESC LIMIT 2",
      ],
      solution:
        "WITH spike AS (\n  SELECT contact_reason, count(*) AS n\n  FROM contacts\n  WHERE contact_ts >= DATE '2026-03-09' AND contact_ts < DATE '2026-03-16'\n  GROUP BY 1\n),\nbase AS (\n  SELECT contact_reason, count(*) / 8.0 AS avg_n\n  FROM contacts\n  WHERE contact_ts >= DATE '2026-01-12' AND contact_ts < DATE '2026-03-09'\n  GROUP BY 1\n)\nSELECT s.contact_reason\nFROM spike s\nLEFT JOIN base b USING (contact_reason)\nORDER BY s.n - coalesce(b.avg_n, 0) DESC\nLIMIT 2",
      check: { type: 'rows', columns: ['contact_reason'] },
      debrief:
        'Checkout errors (+330 over baseline) and promo complaints (+150). Two categories, one obvious hypothesis: something at checkout is broken, and it involves a promotion. Notice the method — compare each category against ITS OWN baseline, never against other categories.',
      teaches: 'JOINs + baselining',
    },
    {
      id: 'smoking-gun',
      title: 'Find the smoking gun',
      brief:
        'Aggregates tell you where to look; the evidence itself lives in the raw rows. Customers tell you exactly what is broken if you read what they wrote. Query the checkout-error contact summaries from the spike week.',
      task: 'Read the contact_summary texts for checkout_error contacts in the spike week. A specific promo code keeps appearing — type it below.',
      starter:
        "SELECT contact_summary, count(*) AS n\nFROM contacts\nWHERE contact_reason = 'checkout_error'\n  AND contact_ts >= DATE '2026-03-09' AND contact_ts < DATE '2026-03-16'\nGROUP BY 1\nORDER BY n DESC",
      hints: [
        'Run the starter query as-is — then just read the top rows.',
        'The code is in the most frequent summary lines. It is a spring promotion.',
      ],
      solution:
        "SELECT contact_summary, count(*) AS n\nFROM contacts\nWHERE contact_reason = 'checkout_error'\n  AND contact_ts >= DATE '2026-03-09' AND contact_ts < DATE '2026-03-16'\nGROUP BY 1\nORDER BY n DESC",
      check: { type: 'text', answers: ['SPRING50', 'spring50', 'spring 50'], placeholder: 'The promo code is…' },
      debrief:
        '"SPRING50 code throws an error at payment." One misconfigured promo, live for five days. This is the step dashboards cannot do for you — the aggregate said "checkout is broken," but the free text said exactly which lever to pull. Always read the raw rows before writing the finding.',
      teaches: 'reading raw evidence',
    },
    {
      id: 'quantify',
      title: 'Quantify the damage',
      brief:
        'A finding without a size gets ignored. "SPRING50 broke checkout" is a bug report; "SPRING50 generated roughly five hundred excess support contacts in five days" is a priority. Estimate the total excess contacts in the spike week.',
      task: 'Estimate the excess: spike-week total contacts minus the average weekly total of the prior 8 weeks. Return a column named excess_contacts (any defensible baseline is accepted).',
      starter:
        "WITH weekly AS (\n  SELECT date_trunc('week', contact_ts) AS week, count(*) AS contacts\n  FROM contacts\n  GROUP BY 1\n)\n-- your turn: spike week minus prior-8-week average",
      hints: [
        'You already built both numbers in the z-score step — this is the same CTE with a different final SELECT.',
        "WITH weekly AS (SELECT date_trunc('week', contact_ts) AS week, count(*) AS contacts FROM contacts GROUP BY 1)\nSELECT round((SELECT contacts FROM weekly WHERE week = DATE '2026-03-09')\n     - (SELECT avg(contacts) FROM weekly WHERE week >= DATE '2026-01-12' AND week < DATE '2026-03-09')) AS excess_contacts",
      ],
      solution:
        "WITH weekly AS (\n  SELECT date_trunc('week', contact_ts) AS week, count(*) AS contacts\n  FROM contacts\n  GROUP BY 1\n)\nSELECT round(\n  (SELECT contacts FROM weekly WHERE week = DATE '2026-03-09')\n  - (SELECT avg(contacts) FROM weekly WHERE week >= DATE '2026-01-12' AND week < DATE '2026-03-09')\n) AS excess_contacts",
      check: { type: 'value-range', column: 'excess_contacts', min: 400, max: 600 },
      debrief:
        'About 510 excess contacts — three and a half normal weeks of support load, compressed into five days, from one promo config error. At the ~8-minute average handle time you can now put an hours figure on it, which is what turns this from an anecdote into a business case for promo-config validation.',
      teaches: 'impact quantification',
    },
  ],
  memo: {
    title: 'Incident finding: SPRING50 promo misconfiguration',
    body: [
      'Finding: Support contact volume for the week of 2026-03-09 reached 659 contacts, ~32 standard deviations above the trailing 8-week baseline of ~146/week. The excess is concentrated in two categories: checkout errors (+330 vs baseline) and promo complaints (+150). Contact summaries identify the cause: the SPRING50 promo code threw errors at the payment step from 2026-03-10 to 2026-03-14.',
      'Impact: ~510 excess contacts in five days — ≈3.5 normal weeks of support load — at the lowest automation-resolution rate of any category that week (16%), meaning nearly all of it landed on agents. Unmeasured but real: checkout abandonment by customers who never contacted us.',
      'Recommended actions: (P0) add promo-code configuration validation to the release checklist — this failure mode is cheap to test and expensive to ship; (P1) add a checkout-error-rate alert with a per-category z-score threshold of 3, which would have caught this on day one rather than in the weekly review; (P2) backfill goodwill credits to the ~330 customers who hit the error and completed a support contact.',
    ],
  },
}

export const CASE_FILES: CaseFile[] = [MARCH_SPIKE]

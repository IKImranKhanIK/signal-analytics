import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { PageHeader } from '../components/Layout'
import { ARCHETYPE_COLOR, ARCHETYPE_LABEL, AXIS_PROPS, TooltipShell } from '../components/charts'
import { useRows } from '../hooks/useQuery'
import { fmtInt, fmtPct, fmtUsd } from '../lib/format'
import { ARCHETYPE_PROFILE, PATTERN_SCATTER } from '../lib/queries'

type Point = {
  order_id: string
  risk_score: number
  amount: number
  fraud_archetype: string
  payment_method: string
  product_type: string
  orders_24h: number
  account_age_days: number
}

type Profile = {
  fraud_archetype: string
  orders: number
  avg_risk_score: number
  median_amount: number
  avg_orders_24h: number
  decline_rate_pct: number
  geo_mismatch_pct: number
  avg_account_age_days: number
  exposure_usd: number
  caught_by_rules_pct: number
}

/** Investigation memos, one per archetype — the storytelling artifact. */
const MEMOS: Record<string, { pattern: string; detection: string; action: string }> = {
  card_testing: {
    pattern:
      'Tight vertical stripes at the bottom of the plot: dozens of sub-$5 orders per device within minutes, cycling through stolen card numbers to find live ones. 62% of attempts decline — the fraudster doesn’t care, the approvals are the product.',
    detection:
      'device_declines_24h (trailing-24h declines per device, two-pointer window count) plus payment_entropy_device — one device presenting 10+ distinct instruments is not a household. See the “Card-testing signature” workbench example.',
    action:
      'Already 95% caught. The remaining risk is downstream: the cards validated here get used elsewhere. Recommend sharing device hashes with the gift-card rule set, and rate-limiting instrument changes per device rather than raising the risk threshold.',
  },
  refund_abuse: {
    pattern:
      'Indistinguishable from legitimate buyers on this plot — mid scores, ordinary amounts. The pattern only exists longitudinally: the same accounts refunding 88% of everything they buy, month after month.',
    detection:
      'prior_refunds (cumulative refunded orders per customer, strictly before the current order). The score rises on an account’s 3rd+ refund, which is why only 1% is caught at checkout — the first orders are genuinely clean.',
    action:
      'Blocking at checkout is the wrong tool. Move to a policy control: refund-velocity caps per account with manual review after the second refund in 90 days.',
  },
  giftcard_laundering: {
    pattern:
      'A band of high-value points ($100–$500 gift cards) at mid-to-high scores. Rings of 4–7 fresh accounts share 1–2 devices and a small pool of cards, converting stolen credit into resalable balance over a few weeks.',
    detection:
      'accounts_per_device ≥ 3 combined with high-denomination gift-card purchases; the ring-detection self-join lists every cluster with its gross volume.',
    action:
      'Highest-exposure archetype (~$50k). Recommend a hold-and-verify flow for gift cards ≥ $100 from devices hosting 3+ accounts — the simulator shows this adds almost no good-customer friction.',
  },
  account_takeover: {
    pattern:
      'High-value points from accounts that are years old — the opposite corner from card testing. A 400-day-old account suddenly buys $200 gift cards from a device it has never used, in a country it has never logged in from.',
    detection:
      'The ATO signature feature: account_age_days > 180 AND (new_device OR geo_mismatch). 85% of these orders end in chargebacks, the most expensive possible outcome.',
    action:
      'At 65% caught, the gap is sessions where the attacker keeps the victim’s country via proxy. Recommend step-up authentication on new_device alone for accounts older than 6 months buying gift cards.',
  },
  promo_abuse: {
    pattern:
      'A flat shelf of identical small orders — the same first-purchase promo burned once per fresh account, 6–14 accounts per device, all through wallet payments.',
    detection:
      'promo_ring feature: promo code on an account ≤ 7 days old whose device hosts ≥ 3 accounts. Cheap to catch because the economics force the pattern: the discount only pays on the first order.',
    action:
      'Fully caught by rules, but each blocked order is a trivially recreated account. Recommend fixing the incentive instead: device-scoped promo redemption limits kill the economics without any blocking.',
  },
  friendly_fraud: {
    pattern:
      'Invisible. These points sit exactly in the legitimate cloud — real customers, real devices, ordinary purchases — who later dispute the charge with their bank. The only label that separates them arrives weeks later as a chargeback.',
    detection:
      'Nothing at order time, by construction — and that is the honest finding. Post-hoc, first-chargeback-with-no-support-contact is the tell: legitimate disputes almost always contact support first.',
    action:
      'Fight at the dispute stage, not checkout: auto-compile delivery evidence (download logs, license activations) for representment, and flag repeat disputers for prepayment review.',
  },
}

export function Patterns() {
  const { rows: points } = useRows<Point>(PATTERN_SCATTER)
  const { rows: profiles } = useRows<Profile>(ARCHETYPE_PROFILE)
  const [selected, setSelected] = useState('giftcard_laundering')

  const legit = useMemo(() => points.filter((p) => p.fraud_archetype === 'none'), [points])
  const focus = useMemo(() => points.filter((p) => p.fraud_archetype === selected), [points, selected])
  const profile = profiles.find((p) => p.fraud_archetype === selected)
  const memo = MEMOS[selected]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pattern explorer"
        lede="Each fraud archetype occupies a different region of the risk-score × order-value plane. Pick one to isolate it against a reproducible sample of legitimate traffic and read the investigation memo."
      />

      <div className="flex flex-wrap gap-1.5">
        {Object.keys(MEMOS).map((a) => (
          <button
            key={a}
            onClick={() => setSelected(a)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${
              selected === a
                ? 'border-transparent text-white'
                : 'border-line bg-surface text-ink-2 hover:text-ink'
            }`}
            style={selected === a ? { background: ARCHETYPE_COLOR[a] } : undefined}
          >
            {ARCHETYPE_LABEL[a]}
          </button>
        ))}
      </div>

      <ChartCard
        title={`${ARCHETYPE_LABEL[selected]} vs legitimate traffic`}
        subtitle="Risk score (x) against order value (y, log scale). Gray points are a seeded 3,000-row reservoir sample of legitimate orders; colored points are every order of the selected archetype."
        sql={PATTERN_SCATTER}
      >
        <ResponsiveContainer width="100%" height={340}>
          <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid />
            <XAxis
              type="number"
              dataKey="risk_score"
              name="Risk score"
              domain={[0, 100]}
              {...AXIS_PROPS}
              label={{ value: 'risk score', position: 'insideBottomRight', offset: -2, fill: 'var(--muted)', fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="amount"
              name="Amount"
              scale="log"
              domain={[0.5, 600]}
              {...AXIS_PROPS}
              tickFormatter={(v: number) => `$${v}`}
              ticks={[1, 5, 25, 100, 500]}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as Point
                return (
                  <TooltipShell
                    title={p.order_id}
                    rows={[
                      { name: 'Type', value: ARCHETYPE_LABEL[p.fraud_archetype] },
                      { name: 'Amount', value: fmtUsd(p.amount) },
                      { name: 'Risk score', value: p.risk_score },
                      { name: 'Orders 24h', value: p.orders_24h },
                      { name: 'Account age', value: `${p.account_age_days}d` },
                    ]}
                  />
                )
              }}
            />
            <Scatter data={legit} fill="var(--muted)" fillOpacity={0.25} shape="circle" isAnimationActive={false} />
            <Scatter data={focus} fill={ARCHETYPE_COLOR[selected]} fillOpacity={0.8} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      {memo && profile && (
        <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-muted">Analyst finding</p>
          <h3 className="mt-1 text-[17px] font-semibold text-ink">{ARCHETYPE_LABEL[selected]}</h3>
          <div className="mt-3 grid gap-x-8 gap-y-1 text-[13px] text-ink-2 sm:grid-cols-3">
            <p>
              <span className="tnum font-semibold text-ink">{fmtInt(profile.orders)}</span> orders ·{' '}
              <span className="tnum font-semibold text-ink">{fmtUsd(profile.exposure_usd)}</span> exposure
            </p>
            <p>
              median <span className="tnum font-semibold text-ink">{fmtUsd(profile.median_amount)}</span> · avg score{' '}
              <span className="tnum font-semibold text-ink">{profile.avg_risk_score}</span>
            </p>
            <p>
              caught by rules:{' '}
              <span className="tnum font-semibold text-ink">{fmtPct(profile.caught_by_rules_pct)}</span>
            </p>
          </div>
          <dl className="mt-4 space-y-3 text-[13.5px] leading-relaxed">
            <div>
              <dt className="font-semibold text-ink">What the pattern is</dt>
              <dd className="mt-0.5 text-ink-2">{memo.pattern}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">How it was detected</dt>
              <dd className="mt-0.5 text-ink-2">{memo.detection}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Recommended action</dt>
              <dd className="mt-0.5 text-ink-2">{memo.action}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  )
}

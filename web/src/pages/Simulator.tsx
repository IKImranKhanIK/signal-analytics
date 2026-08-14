import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartCard } from '../components/ChartCard'
import { PageHeader } from '../components/Layout'
import { useRows } from '../hooks/useQuery'
import { fmtInt, fmtPct, fmtUsd } from '../lib/format'
import { LOCKOUT_RATE, simulatorQuery } from '../lib/queries'

const DEFAULTS = { risk: 60, velocity: 6, amount: 500 }

type Confusion = {
  fraud_caught: number
  fraud_missed: number
  good_blocked: number
  good_approved: number
  missed_exposure_usd: number
  blocked_good_revenue_usd: number
}

type LockoutRate = {
  blocked_orders: number
  false_positives: number
  lockout_contacts: number
  lockouts_from_good_customers: number
  contacts_per_1000_blocked: number
  contacts_per_1000_false_positives: number
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function Slider({
  label, value, min, max, step, onChange, format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink">{label}</span>
        <span className="tnum text-[13px] font-semibold text-[var(--s1)]">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[var(--s1)]"
      />
    </label>
  )
}

function Quad({ label, n, tone, sub }: { label: string; n: number; tone: string; sub?: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)` }}>
      <p className="text-[12px] font-medium" style={{ color: tone }}>{label}</p>
      <p className="tnum mt-0.5 text-[22px] font-bold leading-none text-ink">{fmtInt(n)}</p>
      {sub && <p className="mt-1 text-[11.5px] text-ink-2">{sub}</p>}
    </div>
  )
}

export function Simulator() {
  const [risk, setRisk] = useState(DEFAULTS.risk)
  const [velocity, setVelocity] = useState(DEFAULTS.velocity)
  const [amount, setAmount] = useState(DEFAULTS.amount)

  const dRisk = useDebounced(risk, 150)
  const dVel = useDebounced(velocity, 150)
  const dAmt = useDebounced(amount, 150)

  const sql = simulatorQuery(dRisk, dVel, dAmt)
  const cm = useRows<Confusion>(sql).rows[0]
  const rate = useRows<LockoutRate>(LOCKOUT_RATE).rows[0]

  const isDefault = dRisk === DEFAULTS.risk && dVel === DEFAULTS.velocity && dAmt === DEFAULTS.amount
  const precision = cm ? (100 * cm.fraud_caught) / Math.max(1, cm.fraud_caught + cm.good_blocked) : 0
  const recall = cm ? (100 * cm.fraud_caught) / Math.max(1, cm.fraud_caught + cm.fraud_missed) : 0
  const projectedLockouts =
    cm && rate ? Math.round((cm.good_blocked * rate.contacts_per_1000_false_positives) / 1000) : 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mass decisioning simulator"
        kicker="Module 01 · Fraud intelligence"
        accent="var(--s1)"
        question="If we tighten the rules, what do we gain in caught fraud — and what do we pay in blocked customers and support load?"
        lede="The whole trade-off on three sliders. Every change re-runs a live SQL query over all 25,000 orders and scores the rule against ground truth — including the support contacts the false positives will generate. Try dragging risk down to 40 and watch all four numbers move against each other."
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <section className="h-fit space-y-5 rounded-xl border border-line bg-surface p-5">
          <Slider label="Risk score ≥" value={risk} min={20} max={95} step={5} onChange={setRisk} format={(v) => String(v)} />
          <Slider label="Orders per 24h ≥" value={velocity} min={2} max={12} step={1} onChange={setVelocity} format={(v) => String(v)} />
          <Slider
            label="Amount ≥ (accounts ≤ 30d old)"
            value={amount}
            min={100}
            max={1000}
            step={50}
            onChange={setAmount}
            format={(v) => `$${v}`}
          />
          <div className="flex items-center justify-between border-t border-line pt-3">
            <p className="text-[12px] text-muted">
              {isDefault ? 'Current production rule' : 'Modified rule'}
            </p>
            {!isDefault && (
              <button
                onClick={() => {
                  setRisk(DEFAULTS.risk)
                  setVelocity(DEFAULTS.velocity)
                  setAmount(DEFAULTS.amount)
                }}
                className="rounded-md border border-line px-2 py-1 text-[12px] text-ink-2 hover:text-ink"
              >
                Reset to baseline
              </button>
            )}
          </div>
        </section>

        <ChartCard
          title="Confusion matrix vs ground truth"
          subtitle={`Blocking when risk ≥ ${dRisk}, or trailing-24h orders ≥ ${dVel}, or amount ≥ $${dAmt} on a new account.`}
          sql={sql}
        >
          {cm && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <Quad label="Fraud caught" n={cm.fraud_caught} tone="var(--good)" sub="blocked, truly fraud" />
                <Quad
                  label="Good customers blocked"
                  n={cm.good_blocked}
                  tone="var(--serious)"
                  sub={`${fmtUsd(cm.blocked_good_revenue_usd ?? 0)} revenue turned away`}
                />
                <Quad
                  label="Fraud missed"
                  n={cm.fraud_missed}
                  tone="var(--critical)"
                  sub={`${fmtUsd(cm.missed_exposure_usd ?? 0)} exposure let through`}
                />
                <Quad label="Good approved" n={cm.good_approved} tone="var(--s1)" sub="clean approvals" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <div className="rounded-lg border border-line px-3 py-2">
                  <p className="text-[11.5px] text-muted">Precision</p>
                  <p className="tnum text-[17px] font-semibold text-ink">{fmtPct(precision)}</p>
                </div>
                <div className="rounded-lg border border-line px-3 py-2">
                  <p className="text-[11.5px] text-muted">Recall</p>
                  <p className="tnum text-[17px] font-semibold text-ink">{fmtPct(recall)}</p>
                </div>
                <div className="col-span-2 rounded-lg border border-line px-3 py-2 sm:col-span-1">
                  <p className="text-[11.5px] text-muted">Projected lockout contacts</p>
                  <p className="tnum text-[17px] font-semibold text-ink">≈ {fmtInt(projectedLockouts)}</p>
                </div>
              </div>
            </>
          )}
        </ChartCard>
      </div>

      <section className="rounded-xl border border-line bg-surface p-5 text-[13.5px] leading-relaxed text-ink-2">
        <h3 className="text-[14.5px] font-semibold text-ink">The customer-experience cost, made concrete</h3>
        <p className="mt-2">
          The lockout projection above is not a made-up multiplier. In the contact dataset,{' '}
          {rate ? (
            <>
              <span className="tnum font-semibold text-ink">{fmtInt(rate.lockouts_from_good_customers)}</span>{' '}
              “account locked” contacts trace back to the{' '}
              <span className="tnum font-semibold text-ink">{fmtInt(rate.false_positives)}</span> legitimate orders
              the baseline rule blocks — a rate of{' '}
              <span className="tnum font-semibold text-ink">{fmtInt(rate.contacts_per_1000_false_positives)}</span>{' '}
              contacts per 1,000 false positives (
              <span className="tnum font-semibold text-ink">{fmtInt(rate.contacts_per_1000_blocked)}</span> per 1,000
              blocked orders overall).
            </>
          ) : (
            '…'
          )}{' '}
          At the baseline sliders, the projection reproduces that observed figure exactly; move a slider and it scales
          with your new false-positive count. The attribution analysis lives in{' '}
          <Link to="/root-cause" className="font-medium text-[var(--s1)] hover:underline">
            Contact attribution → Root cause
          </Link>
          , SQL included.
        </p>
      </section>
    </div>
  )
}

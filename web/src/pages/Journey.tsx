import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { PageHeader } from '../components/Layout'
import { AXIS_PROPS, defaultTooltip } from '../components/charts'
import { useRows } from '../hooks/useQuery'
import { fmtDuration, fmtInt, fmtPct, titleCase } from '../lib/format'
import { JOURNEY_REASONS, JOURNEY_STAGES } from '../lib/queries'

type Stage = {
  journey_stage: string
  contacts: number
  automation_rate_pct: number
  avg_handle_sec: number
  repeat_rate_pct: number
}

type Reason = {
  journey_stage: string
  contact_reason: string
  contacts: number
  automation_rate_pct: number
}

const STAGE_ORDER = ['discovery', 'checkout', 'post_purchase', 'refund']
const STAGE_LABEL: Record<string, string> = {
  discovery: 'Discovery',
  checkout: 'Checkout',
  post_purchase: 'Post-purchase',
  refund: 'Refund',
}

export function Journey() {
  const { rows: stages } = useRows<Stage>(JOURNEY_STAGES)
  const { rows: reasons } = useRows<Reason>(JOURNEY_REASONS)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Journey map"
        lede="Where 8,000 support contacts land across the purchase journey, and how well automation holds at each stage. Volume alone is a bad prioritization signal — pair it with automation rate and handle time."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STAGE_ORDER.map((key) => {
          const s = stages.find((x) => x.journey_stage === key)
          return (
            <div key={key} className="rounded-xl border border-line bg-surface px-4 py-3.5">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted">{STAGE_LABEL[key]}</p>
              <p className="tnum mt-1 text-[24px] font-semibold leading-none text-ink">
                {s ? fmtInt(s.contacts) : '—'}
              </p>
              {s && (
                <dl className="mt-2 space-y-0.5 text-[12px] text-ink-2">
                  <div className="flex justify-between"><dt>Automated</dt><dd className="tnum">{fmtPct(s.automation_rate_pct)}</dd></div>
                  <div className="flex justify-between"><dt>Avg handle</dt><dd className="tnum">{fmtDuration(s.avg_handle_sec)}</dd></div>
                  <div className="flex justify-between"><dt>Repeat rate</dt><dd className="tnum">{fmtPct(s.repeat_rate_pct)}</dd></div>
                </dl>
              )}
            </div>
          )
        })}
      </div>

      <ChartCard
        title="Stage volume and automation coverage"
        subtitle="Contacts per journey stage; bar shade shows how much automation currently absorbs."
        sql={JOURNEY_STAGES}
        footnote="Checkout and refund are where automation is weakest — and both are dominated by reasons the store causes itself: payment declines, promo errors, and fraud-rule lockouts. See Root cause."
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stages} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="journey_stage" {...AXIS_PROPS} tickFormatter={(s: string) => STAGE_LABEL[s] ?? s} />
            <YAxis {...AXIS_PROPS} />
            <Tooltip content={defaultTooltip((_k, v) => fmtInt(v))} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
            <Bar dataKey="contacts" name="Contacts" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {stages.map((s) => (
                <Cell
                  key={s.journey_stage}
                  fill={`color-mix(in srgb, var(--s1) ${Math.round(30 + s.automation_rate_pct)}%, var(--grid))`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Contact reasons within each stage"
        subtitle="The reason mix explains the automation gap: high-automation stages are dominated by informational asks; low-automation stages by broken flows."
        sql={JOURNEY_REASONS}
      >
        <div className="grid gap-5 md:grid-cols-2">
          {STAGE_ORDER.map((stage) => {
            const rs = reasons.filter((r) => r.journey_stage === stage)
            const max = Math.max(...rs.map((r) => r.contacts), 1)
            return (
              <div key={stage}>
                <p className="mb-2 text-[13px] font-semibold text-ink">{STAGE_LABEL[stage]}</p>
                <ul className="space-y-1.5">
                  {rs.map((r) => (
                    <li key={r.contact_reason} className="text-[12.5px]">
                      <div className="flex justify-between text-ink-2">
                        <span>{titleCase(r.contact_reason)}</span>
                        <span className="tnum">
                          {fmtInt(r.contacts)} · {fmtPct(r.automation_rate_pct, 0)} auto
                        </span>
                      </div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-[var(--grid)]">
                        <div
                          className="h-1.5 rounded-full bg-[var(--s1)]"
                          style={{ width: `${(100 * r.contacts) / max}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </ChartCard>
    </div>
  )
}

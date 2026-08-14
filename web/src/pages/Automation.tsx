import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { PageHeader } from '../components/Layout'
import { Memo } from '../components/Memo'
import { AXIS_PROPS, defaultTooltip } from '../components/charts'
import { useRows } from '../hooks/useQuery'
import { fmtDuration, fmtInt, fmtPct, titleCase } from '../lib/format'
import { AUTOMATION_CANDIDATES, DEFLECTION_QUALITY } from '../lib/queries'

type Quality = {
  contact_reason: string
  bot_contacts: number
  repeat_after_bot_pct: number
  repeat_after_agent_pct: number
  delta_pts: number
}

type Candidate = {
  contact_reason: string
  contacts: number
  automation_rate_pct: number
  avg_handle_sec: number
  repeat_rate_pct: number
  manual_contacts: number
}

/**
 * Deflection scoring, in the open: volume that is currently manual, discounted
 * by complexity (handle time as proxy) and by repeat rate (a repeat-prone
 * reason deflected badly just creates second contacts).
 */
function deflectionScore(c: Candidate): number {
  const complexity = Math.min(c.avg_handle_sec, 900) / 900
  const repeat = c.repeat_rate_pct / 100
  return Math.round(c.manual_contacts * (1 - 0.6 * complexity) * (1 - repeat))
}

/** Reasons where deflection is the wrong fix (fix the cause instead). */
const FIX_THE_CAUSE = new Set(['account_locked', 'checkout_error', 'promo_not_applied'])

export function Automation() {
  const { rows } = useRows<Candidate>(AUTOMATION_CANDIDATES)
  const { rows: quality } = useRows<Quality>(DEFLECTION_QUALITY)

  const ranked = useMemo(
    () =>
      rows
        .map((c) => ({ ...c, score: deflectionScore(c) }))
        .sort((a, b) => b.score - a.score),
    [rows],
  )
  const deflectable = ranked.filter((c) => !FIX_THE_CAUSE.has(c.contact_reason))
  const target = deflectable.slice(0, 4)
  const estReduction = target.reduce((sum, c) => sum + Math.round(0.55 * c.score), 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Automation impact"
        lede="Which contact reasons are genuinely good deflection candidates? Volume alone over-ranks broken flows that should be fixed, not deflected. The scoring here is transparent: manual volume, discounted by handle-time complexity and repeat-contact risk."
      />

      <ChartCard
        title="Deflection candidates, ranked"
        subtitle="All twelve reasons scored. Grayed rows are excluded on principle: their volume is a symptom of a defect (a fraud rule, a broken promo) — deflecting them hides the cost instead of removing it."
        sql={AUTOMATION_CANDIDATES}
        footnote="Score = manual contacts × (1 − 0.6·min(handle,15m)/15m) × (1 − repeat rate). The weights are judgment calls, stated so they can be argued with — that is what makes the ranking defensible."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[12.5px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1.5 font-medium">Reason</th>
                <th className="py-1.5 text-right font-medium">Contacts</th>
                <th className="py-1.5 text-right font-medium">Automated today</th>
                <th className="py-1.5 text-right font-medium">Avg handle</th>
                <th className="py-1.5 text-right font-medium">Repeat rate</th>
                <th className="py-1.5 text-right font-medium">Deflection score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => {
                const excluded = FIX_THE_CAUSE.has(c.contact_reason)
                return (
                  <tr
                    key={c.contact_reason}
                    className={`border-t border-line ${excluded ? 'text-muted' : 'text-ink-2'}`}
                  >
                    <td className="py-1.5">
                      {titleCase(c.contact_reason)}
                      {excluded && <span className="ml-2 text-[11px]">fix the cause →</span>}
                    </td>
                    <td className="tnum py-1.5 text-right">{fmtInt(c.contacts)}</td>
                    <td className="tnum py-1.5 text-right">{fmtPct(c.automation_rate_pct, 0)}</td>
                    <td className="tnum py-1.5 text-right">{fmtDuration(c.avg_handle_sec)}</td>
                    <td className="tnum py-1.5 text-right">{fmtPct(c.repeat_rate_pct, 0)}</td>
                    <td className="tnum py-1.5 text-right font-semibold text-ink">
                      {excluded ? '—' : fmtInt(c.score)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <ChartCard
        title="Deflection quality: does a bot resolution stick?"
        subtitle="Repeat-contact rate after an automated resolution vs after a human one, per reason (reasons with 50+ bot contacts). A deflection that generates a second contact isn't a deflection — it's a delay."
        sql={DEFLECTION_QUALITY}
        footnote="Two findings hide in here: the refund-status bot “resolves” without giving a definitive date, so nearly half its customers come back (48% vs 30% after an agent) — while the download bot genuinely fixes the problem and beats humans (6% vs 10%). Deflection rate alone would call both bots successful."
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={quality} margin={{ top: 8, right: 8, bottom: 44, left: -14 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="contact_reason"
              {...AXIS_PROPS}
              interval={0}
              angle={-38}
              textAnchor="end"
              height={70}
              tick={{ fontSize: 10.5 }}
              tickFormatter={(r: string) => titleCase(r)}
            />
            <YAxis {...AXIS_PROPS} unit="%" />
            <Tooltip content={defaultTooltip((_k, v) => fmtPct(v))} cursor={{ fill: 'var(--grid)', opacity: 0.4 }} />
            <Bar dataKey="repeat_after_bot_pct" name="Repeat after bot" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            <Bar dataKey="repeat_after_agent_pct" name="Repeat after agent" fill="var(--s2)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-1 flex gap-4 text-[12px] text-ink-2">
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--s1)]" />Repeat after bot</span>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--s2)]" />Repeat after agent</span>
        </div>
      </ChartCard>

      <Memo
        title="Where automation should go next"
        intro={`Assuming a well-built flow converts ~55% of a reason's deflectable manual volume (industry-plausible, stated as an assumption), the top ${target.length} candidates below are worth ≈ ${fmtInt(estReduction)} avoided agent contacts per year. The equally important output is the do-not-automate list.`}
        findings={[
          {
            title: 'Automate the resolvable middle: refunds, downloads, cancellations',
            evidence:
              'Refund status (1,071 contacts, 41% automated, 37% repeat), how-to-download (1,227, 72%), and subscription cancel (841, 57%) are high-volume, low-complexity, and mostly informational. Refund status repeats because the bot answers without a definitive date, not because the question is hard — the deflection-quality chart above shows 48% of its bot resolutions bounce back vs 30% of agent ones.',
            impact: `≈ ${fmtInt(estReduction)} agent contacts avoided per year across the top candidates, at current volumes.`,
            action:
              'Ship order-linked status answers (refund ETA from the actual refund record, signed download re-delivery, self-serve cancellation with confirmation) rather than generic FAQ responses. Measure repeat-contact rate as the success metric, not deflection rate.',
            priority: 'P0',
          },
          {
            title: 'Do not automate the self-inflicted categories — delete them',
            evidence:
              'Account-locked (328 contacts, 10% automated, longest handle times) and the checkout-error/promo cluster are downstream of defects: fraud-rule false positives and a misconfigured promo. A better bot here would only make failure cheaper to ignore.',
            impact:
              'Fixing the fraud-rule false-positive rate at the source (see the simulator) removes ~285 contacts/year outright; the promo incident alone produced ~480 excess contacts in five days.',
            action:
              'Route these reasons to root-cause owners with an SLA instead of a deflection flow. Track “contacts per 1,000 blocked orders” as a shared fraud+CX metric.',
            priority: 'P0',
          },
          {
            title: 'Leave disputes and lockout appeals with humans',
            evidence:
              'Chargeback disputes: 8% automation, ~37% repeat rate, longest handle times — high-stakes, adversarial, evidence-driven. Automation attempts here historically raise repeat contacts and dispute losses.',
            impact:
              'Small volume (~230/year) but disproportionate revenue and trust impact per contact.',
            action:
              'Invest in agent tooling (auto-compiled evidence packets from order + delivery data) instead of customer-facing automation.',
            priority: 'P2',
          },
        ]}
      />
    </div>
  )
}

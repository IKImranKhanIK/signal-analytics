import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV: { group: string; items: { to: string; label: string }[] }[] = [
  {
    group: 'Fraud intelligence',
    items: [
      { to: '/', label: 'Overview' },
      { to: '/patterns', label: 'Pattern explorer' },
      { to: '/rings', label: 'Ring detection' },
      { to: '/simulator', label: 'Decisioning simulator' },
    ],
  },
  {
    group: 'Contact attribution',
    items: [
      { to: '/journey', label: 'Journey map' },
      { to: '/root-cause', label: 'Root cause' },
      { to: '/automation', label: 'Automation impact' },
      { to: '/anomalies', label: 'Anomaly watch' },
    ],
  },
  {
    group: 'Learn',
    items: [{ to: '/learn', label: 'Investigations' }],
  },
  {
    group: 'Workbench',
    items: [
      { to: '/sql', label: 'SQL workbench' },
      { to: '/methods', label: 'How this was built' },
    ],
  },
]

function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('signal-theme') ?? 'system')
  useEffect(() => {
    if (theme === 'system') {
      delete document.documentElement.dataset.theme
      localStorage.removeItem('signal-theme')
    } else {
      document.documentElement.dataset.theme = theme
      localStorage.setItem('signal-theme', theme)
    }
  }, [theme])
  const next = theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system'
  const icon = theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐'
  return (
    <button
      onClick={() => setTheme(next)}
      title={`Theme: ${theme} (click for ${next})`}
      className="rounded-md border border-line px-2 py-1 text-[13px] text-ink-2 hover:text-ink"
    >
      {icon}
    </button>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="min-h-screen lg:flex">
      {/* mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-page px-4 py-3 lg:hidden">
        <button onClick={() => setOpen((v) => !v)} className="text-[14px] font-semibold text-ink">
          ☰ Signal
        </button>
        <ThemeToggle />
      </div>

      <aside
        className={`${open ? 'block' : 'hidden'} border-b border-line bg-page px-4 pb-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:pt-6`}
      >
        <div className="hidden items-center justify-between lg:flex">
          <div>
            <p className="text-[17px] font-bold tracking-tight text-ink">Signal</p>
            <p className="text-[11.5px] text-muted">Trust &amp; experience analytics</p>
          </div>
          <ThemeToggle />
        </div>
        <nav className="mt-4 space-y-5 lg:mt-8">
          {NAV.map((g) => (
            <div key={g.group}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                {g.group}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((it) => (
                  <li key={it.to}>
                    <NavLink
                      to={it.to}
                      end={it.to === '/'}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        `block rounded-md px-2.5 py-1.5 text-[13.5px] transition-colors ${
                          isActive
                            ? 'bg-surface font-semibold text-ink shadow-[inset_0_0_0_1px_var(--border)]'
                            : 'text-ink-2 hover:text-ink'
                        }`
                      }
                    >
                      {it.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="mt-8 hidden text-[11.5px] leading-relaxed text-muted lg:block">
          Synthetic dataset · 25k orders · 8k contacts.
          <br />
          Every chart is a real DuckDB query.
        </p>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export function PageHeader({
  title,
  lede,
  kicker,
  accent = 'var(--axis)',
  question,
}: {
  title: string
  lede: string
  /** Module label, e.g. "Module 01 · Fraud intelligence". */
  kicker?: string
  /** Module accent color — gives each section a visual identity. */
  accent?: string
  /** The question this page exists to answer, stated outright. */
  question?: string
}) {
  return (
    <header className="mb-6 border-l-[3px] pl-4" style={{ borderColor: accent }}>
      {kicker && (
        <p className="text-[11.5px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>
          {kicker}
        </p>
      )}
      <h2 className="mt-0.5 text-[24px] font-bold tracking-tight text-ink">{title}</h2>
      {question && (
        <p className="mt-1.5 text-[14px] font-medium text-ink">
          The question: <span className="italic">{question}</span>
        </p>
      )}
      <p className="mt-1.5 max-w-prose text-[13.5px] leading-relaxed text-ink-2">{lede}</p>
    </header>
  )
}

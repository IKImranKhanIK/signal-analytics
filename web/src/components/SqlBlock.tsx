import { Highlight, themes } from 'prism-react-renderer'
import { useEffect, useState } from 'react'

function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches))
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      const t = document.documentElement.dataset.theme
      setDark(t === 'dark' || (!t && mq.matches))
    }
    mq.addEventListener('change', update)
    const obs = new MutationObserver(update)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', update)
      obs.disconnect()
    }
  }, [])
  return dark
}

export function SqlBlock({ sql }: { sql: string }) {
  const dark = useIsDark()
  return (
    <Highlight code={sql.trim()} language="sql" theme={dark ? themes.nightOwl : themes.github}>
      {({ style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className="overflow-x-auto rounded-lg p-4 text-[12.5px] leading-relaxed"
          style={{ ...style, background: dark ? '#111110' : '#f4f4f1' }}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  )
}

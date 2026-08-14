// Capture README screenshots from the built app (vite preview must be running).
//   node scripts/screenshots.mjs [baseUrl]
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const OUT = new URL('../../docs/screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const SHOTS = [
  { route: '#/', name: 'overview', theme: 'light' },
  { route: '#/patterns', name: 'patterns', theme: 'dark' },
  { route: '#/simulator', name: 'simulator', theme: 'dark' },
  { route: '#/sql', name: 'workbench', theme: 'light' },
  { route: '#/learn/march-spike', name: 'investigation', theme: 'light' },
]

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'shell',
})
const page = await browser.newPage()
await page.setViewport({ width: 1360, height: 850, deviceScaleFactor: 2 })

for (const shot of SHOTS) {
  await page.evaluateOnNewDocument((t) => localStorage.setItem('signal-theme', t), shot.theme)
  await page.goto(`${BASE}/?shot=${shot.name}${shot.route}`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => !document.body.innerText.includes('Loading Signal'), { timeout: 60_000 })
  await new Promise((r) => setTimeout(r, 2500)) // let chart animations finish
  await page.screenshot({ path: `${OUT}${shot.name}.png` })
  console.log(`captured ${shot.name}.png`)
}

await browser.close()

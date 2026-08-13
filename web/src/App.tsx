import { HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DbGate } from './components/Loading'
import { AnomalyWatch } from './pages/AnomalyWatch'
import { Automation } from './pages/Automation'
import { Journey } from './pages/Journey'
import { Methods } from './pages/Methods'
import { Overview } from './pages/Overview'
import { Patterns } from './pages/Patterns'
import { Rings } from './pages/Rings'
import { RootCause } from './pages/RootCause'
import { Simulator } from './pages/Simulator'
import { Workbench } from './pages/Workbench'

export default function App() {
  return (
    <DbGate>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="patterns" element={<Patterns />} />
            <Route path="rings" element={<Rings />} />
            <Route path="simulator" element={<Simulator />} />
            <Route path="journey" element={<Journey />} />
            <Route path="root-cause" element={<RootCause />} />
            <Route path="automation" element={<Automation />} />
            <Route path="anomalies" element={<AnomalyWatch />} />
            <Route path="sql" element={<Workbench />} />
            <Route path="methods" element={<Methods />} />
            <Route path="*" element={<Overview />} />
          </Route>
        </Routes>
      </HashRouter>
    </DbGate>
  )
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Appliances from './pages/Appliances'
import BillOptimizer from './pages/BillOptimizer'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/appliances" element={<Appliances />} />
          <Route path="/optimizer" element={<BillOptimizer />} />
          {/* MORE PAGES... /dashboard, /optimizer, /history, /profile, /settings */}
        </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
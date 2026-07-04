import { NavLink } from 'react-router-dom'
import { LayoutGrid, Plug, SlidersHorizontal, History, User, Settings, Zap } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/appliances', label: 'Appliances', icon: Plug },
  { to: '/optimizer', label: 'Bill Optimizer', icon: SlidersHorizontal },
  { to: '/history', label: 'Monthly History', icon: History },
]

const ACCOUNT_ITEMS = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
      isActive
        ? 'bg-blue-50 text-primary font-semibold'
        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
    }`

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-gray-100 px-4 py-6 flex flex-col">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
          <Zap className="text-white" size={18} fill="white" />
        </div>
        <span className="text-lg font-extrabold text-gray-900">Kuryentipid</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-8">
        <p className="text-xs font-semibold text-gray-400 tracking-wide px-4 mb-2">ACCOUNT</p>
        <nav className="flex flex-col gap-1">
          {ACCOUNT_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  )
}
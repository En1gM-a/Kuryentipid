import { NavLink } from 'react-router-dom'
import { LayoutGrid, Plug, SlidersHorizontal, History, User, Zap, Moon, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { to: '/appliances', label: 'Appliances', icon: Plug },
  { to: '/optimizer', label: 'Bill Optimizer', icon: SlidersHorizontal },
  { to: '/history', label: 'Monthly History', icon: History },
]

const ACCOUNT_ITEMS = [
  { to: '/profile', label: 'Profile', icon: User },
]

export default function Sidebar() {
  const [isDark, setIsDark] = useTheme()

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
      isActive
        ? 'bg-blue-50 dark:bg-blue-500/10 text-primary font-semibold'
        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
    }`

  return (
    <aside className="w-64 min-h-screen bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 px-4 py-6 flex flex-col">
      <div className="flex items-center justify-between px-2 mb-8">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="text-white" size={18} fill="white" />
          </div>
          <span className="text-lg font-extrabold text-gray-900 dark:text-white">Kuryentipid</span>
        </div>
        <button
          onClick={() => setIsDark((d) => !d)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-white transition"
          aria-label="Toggle dark mode"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
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
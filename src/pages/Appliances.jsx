import { useState } from 'react'
import {
  Search, ChevronDown, Plus, Pencil, Trash2,
  Snowflake, Refrigerator, Lightbulb, Tv, Fan,
  Zap, Leaf, TriangleAlert
} from 'lucide-react'

const APPLIANCES = [
  {
    id: 1, name: 'Air Conditioner', category: 'Cooling', icon: Snowflake,
    iconBg: 'bg-blue-50', iconColor: 'text-blue-500',
    badgeBg: 'bg-blue-50', badgeColor: 'text-blue-600',
    quantity: 1, watts: 1200, hours: 8, cost: 2400,
  },
  {
    id: 2, name: 'Refrigerator', category: 'Kitchen', icon: Refrigerator,
    iconBg: 'bg-orange-50', iconColor: 'text-orange-500',
    badgeBg: 'bg-orange-50', badgeColor: 'text-orange-600',
    quantity: 1, watts: 150, hours: 24, cost: 900,
  },
  {
    id: 3, name: 'LED Bulb (Living Room)', category: 'Lighting', icon: Lightbulb,
    iconBg: 'bg-amber-50', iconColor: 'text-amber-500',
    badgeBg: 'bg-amber-50', badgeColor: 'text-amber-600',
    quantity: 5, watts: 9, hours: 6, cost: 80,
  },
  {
    id: 4, name: 'Smart TV 55"', category: 'Entertainment', icon: Tv,
    iconBg: 'bg-purple-50', iconColor: 'text-purple-500',
    badgeBg: 'bg-purple-50', badgeColor: 'text-purple-600',
    quantity: 1, watts: 120, hours: 5, cost: 180,
  },
  {
    id: 5, name: 'Stand Fan', category: 'Cooling', icon: Fan,
    iconBg: 'bg-green-50', iconColor: 'text-green-500',
    badgeBg: 'bg-blue-50', badgeColor: 'text-blue-600',
    quantity: 2, watts: 60, hours: 12, cost: 430,
  },
]

const CATEGORIES = ['All Categories', 'Cooling', 'Kitchen', 'Lighting', 'Entertainment']

export default function Appliances() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All Categories')

  const filtered = APPLIANCES.filter((a) => {
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'All Categories' || a.category === category
    return matchesSearch && matchesCategory
  })

  return (
    <div className="relative px-8 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Appliance Management</h1>
          <p className="text-gray-500 mt-1">
            Manage and track the energy consumption of your individual devices.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <img
            src="https://i.pravatar.cc/40?img=12"
            alt="User avatar"
            className="w-10 h-10 rounded-full object-cover"
          />
          <div>
            <div className="font-semibold text-gray-900 text-sm">Juan Dela Cruz</div>
            <div className="text-primary text-xs font-medium">Meralco User</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search appliance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
          />
        </div>

        <div className="relative">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:ring-2 focus:ring-primary/30 outline-none cursor-pointer"
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>

        <div className="flex-1" />

        <button className="flex items-center gap-2 bg-primary text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:bg-blue-700 transition">
          <Plus size={18} />
          Add Appliance
        </button>
      </div>

      {/* Table */}
      <div className="border border-gray-100 rounded-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs font-semibold tracking-wide">
              <th className="text-left px-6 py-4">APPLIANCE NAME</th>
              <th className="text-left px-6 py-4">CATEGORY</th>
              <th className="text-center px-6 py-4">QUANTITY</th>
              <th className="text-center px-6 py-4">POWER (WATTS)</th>
              <th className="text-center px-6 py-4">USAGE (HRS/DAY)</th>
              <th className="text-right px-6 py-4">EST. MONTHLY COST</th>
              <th className="text-center px-6 py-4">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const Icon = a.icon
              return (
                <tr key={a.id} className="border-t border-gray-100 hover:bg-gray-50/50 transition">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${a.iconBg}`}>
                        <Icon size={18} className={a.iconColor} />
                      </div>
                      <span className="font-semibold text-gray-900">{a.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase ${a.badgeBg} ${a.badgeColor}`}>
                      {a.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-gray-700">{a.quantity}</td>
                  <td className="px-6 py-4 text-center text-gray-700">{a.watts}W</td>
                  <td className="px-6 py-4 text-center text-gray-700">{a.hours}h</td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900">
                    ₱{a.cost.toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-primary hover:border-primary transition">
                        <Pencil size={14} />
                      </button>
                      <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-danger hover:border-danger transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-5">
        <p className="text-sm text-gray-500">
          Showing <span className="font-semibold text-gray-900">{filtered.length}</span> of{' '}
          <span className="font-semibold text-gray-900">12</span> appliances
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-400 cursor-not-allowed">
            Previous
          </button>
          <button className="px-4 py-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
            Next
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-6 mt-10 pt-8 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Zap size={18} className="text-primary" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium tracking-wide">ACTIVE LOAD</div>
            <div className="text-lg font-extrabold text-gray-900">
              1,539 <span className="text-sm font-medium text-gray-500">TOTAL WATTS</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <Leaf size={18} className="text-success" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium tracking-wide">ENERGY EFFICIENCY</div>
            <div className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
              Good
              <span className="text-xs font-semibold text-success bg-green-50 px-2 py-0.5 rounded-full">
                +4% vs Avg
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <TriangleAlert size={18} className="text-warning" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium tracking-wide">OPTIMIZATION TIP</div>
            <div className="text-sm font-semibold text-gray-900">Aircon usage is 2h above target</div>
          </div>
        </div>
      </div>
      {/*add button*/}
      <button className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:bg-blue-700 transition flex items-center justify-center">
        <Plus size={24} />
      </button>
    </div>
  )
}
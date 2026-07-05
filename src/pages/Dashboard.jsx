import { useState } from 'react'
import {
  Bell, Receipt, Home, PiggyBank, Plus, RotateCw, SlidersHorizontal,
  Calculator, ChevronRight, Snowflake, Refrigerator as RefrigeratorIcon,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'

// replace with real values once appliances/calculations are wired to Supabase.
const appliances = []
const recentCalculations = []
const usageTrend = []

export default function Dashboard() {
  const [range, setRange] = useState('Weekly')

  const hasAppliances = appliances.length > 0
  const hasCalculations = recentCalculations.length > 0
  const hasTrendData = usageTrend.length > 0

  const estimatedBill = hasCalculations ? '₱4,250' : '₱0'
  const totalKwh = hasCalculations ? '380' : '0'
  const applianceCount = appliances.length
  const potentialSavings = hasCalculations ? '₱520' : '₱0'

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-500 mt-1">
            Welcome back, Juan! Here's your energy summary for this month. 
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition">
            <Bell size={18} />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-danger" />
          </button>
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
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="border border-gray-100 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Receipt size={18} className="text-primary" />
            </div>
            {hasCalculations && (
              <span className="text-xs font-semibold text-primary bg-blue-50 px-2.5 py-1 rounded-full">
                ESTIMATED
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-1">Estimated Monthly Bill</p>
          <p className="text-3xl font-extrabold text-gray-900">{estimatedBill}</p>
          <p className="text-xs text-gray-400 mt-2">
            {hasCalculations ? '+12% from last month' : 'No calculations yet'}
          </p>
        </div>

        <div className="border border-gray-100 rounded-card p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
            <Home size={18} className="text-purple-400" />
          </div>
          <p className="text-sm text-gray-500 mb-1">Total Monthly kWh</p>
          <p className="text-3xl font-extrabold text-gray-900">
            {totalKwh} <span className="text-base font-medium text-gray-400">kWh</span>
          </p>
          <p className="text-xs text-gray-400 mt-2">
            {hasCalculations ? 'Target: 350 kWh' : 'No data yet'}
          </p>
        </div>

        <div className="border border-gray-100 rounded-card p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
            <Home size={18} className="text-orange-500" />
          </div>
          <p className="text-sm text-gray-500 mb-1">Number of Appliances</p>
          <p className="text-3xl font-extrabold text-gray-900">{applianceCount}</p>
          <p className="text-xs text-gray-400 mt-2">
            {hasAppliances ? '+ 2 added this week' : 'Add your first appliance'}
          </p>
        </div>

        <div className="border border-gray-100 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <PiggyBank size={18} className="text-success" />
            </div>
            {hasCalculations && (
              <span className="text-xs font-semibold text-success bg-green-50 px-2.5 py-1 rounded-full">
                POTENTIAL
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-1">Potential Savings</p>
          <p className="text-3xl font-extrabold text-gray-900">{potentialSavings}</p>
          <p className="text-xs text-gray-400 mt-2">
            {hasCalculations ? 'Try "ECO" mode settings' : 'N/A'}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-3 mb-6">
        <button className="flex items-center gap-2 bg-primary text-white font-semibold px-5 py-3 rounded-xl shadow-sm hover:bg-blue-700 transition">
          <Plus size={18} />
          Add Appliance
        </button>
        <button className="flex items-center gap-2 border border-gray-200 font-semibold text-gray-700 px-5 py-3 rounded-xl hover:bg-gray-50 transition">
          <RotateCw size={16} />
          Recalculate
        </button>
        <button className="flex items-center gap-2 border border-gray-200 font-semibold text-gray-700 px-5 py-3 rounded-xl hover:bg-gray-50 transition">
          <SlidersHorizontal size={16} />
          Optimize Bill
        </button>
      </div>

      {/* Trend + Recent calculations */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 border border-gray-100 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Energy Usage Trend</h2>
            <div className="flex bg-gray-50 rounded-xl p-1">
              {['Daily', 'Weekly', 'Monthly'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                    range === r ? 'bg-primary text-white shadow-sm' : 'text-gray-500'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {hasTrendData ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={usageTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} />
                <Line type="monotone" dataKey="usage" stroke="#2563EB" strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="target" stroke="#D1D5DB" strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <Receipt size={24} className="text-primary" />
              </div>
              <p className="font-semibold text-gray-900 mb-1">No usage data yet</p>
              <p className="text-sm text-gray-500 max-w-xs">
                Add your appliances and run a calculation to see your usage trend here.
              </p>
            </div>
          )}
        </div>

        <div className="border border-gray-100 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">Recent Calculations</h2>
            {hasCalculations && (
              <button className="text-sm font-semibold text-primary hover:underline">View All</button>
            )}
          </div>

          {hasCalculations ? (
            <div className="flex flex-col gap-4">
              {recentCalculations.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">
                    <Calculator size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{c.title}</p>
                    <p className="text-xs text-gray-400">{c.date}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900 text-sm">{c.amount}</p>
                    <p className={`text-xs font-medium ${c.positive ? 'text-danger' : 'text-success'}`}>
                      {c.delta}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-10">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                <Calculator size={20} className="text-gray-300" />
              </div>
              <p className="font-semibold text-gray-900 text-sm mb-1">No calculations yet</p>
              <p className="text-xs text-gray-500">Run your first bill estimate to see history here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Top energy consumers */}
      <div className="border border-gray-100 rounded-card p-6 shadow-sm mt-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Top Energy Consumers</h2>
          {hasAppliances && (
            <button className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Manage All Appliances <ChevronRight size={16} />
            </button>
          )}
        </div>

        {hasAppliances ? (
          <div className="grid grid-cols-4 gap-4">
            {appliances.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Snowflake size={18} className="text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{a.name}</p>
                  <p className="text-xs text-gray-400">₱{a.cost} / month</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-10">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
              <RefrigeratorIcon size={20} className="text-gray-300" />
            </div>
            <p className="font-semibold text-gray-900 text-sm mb-1">No appliances added yet</p>
            <p className="text-xs text-gray-500 mb-4">
              Add appliances to see which ones consume the most energy.
            </p>
            <button className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 transition">
              <Plus size={16} />
              Add Appliance
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
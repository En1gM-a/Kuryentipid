import { useState, useEffect, useMemo } from 'react'
import {
  Search, ChevronDown, TrendingUp, TrendingDown, FileText, History as HistoryIcon,
  Receipt, Zap, PiggyBank, Hash,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useElectricityRate } from '../hooks/useElectricityRate'
import MonthlyReportModal from '../components/MonthlyReportModal'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'highest_bill', label: 'Highest Bill' },
  { value: 'lowest_bill', label: 'Lowest Bill' },
  { value: 'highest_consumption', label: 'Highest Consumption' },
  { value: 'lowest_consumption', label: 'Lowest Consumption' },
  { value: 'most_savings', label: 'Most Savings' },
]

// ============================================================
// monthly_bills now gets a NEW ROW EVERY DAY rather than one row per calendar month. 
// So before this page can show "one row per month" like the design calls for, we first have
// to group all the daily rows by calendar month and sum their kwh/cost.
//
// CHANGED: each bucket now also carries `appliancesSnapshot` — the real
// `appliances_snapshot` jsonb captured by the pg_cron job on the most
// recent day within that month — instead of relying on the live
// `appliances` table for every month, including old ones.
//
// `dayCount` (how many daily snapshots fed into this month) is kept
// around for transparency — a month with only 3 days logged so far
// isn't really comparable to a month with a full 30, even though both
// just show as "one row" in the table.
// ============================================================
function groupByMonth(dailyRows) {
  const buckets = new Map()

  dailyRows.forEach((row) => {
    const date = new Date(row.created_at)
    const key = `${date.getFullYear()}-${date.getMonth()}`

    if (!buckets.has(key)) {
      buckets.set(key, {
        id: key,
        year: date.getFullYear(),
        month: date.getMonth(),
        actual_kwh: 0,
        actual_cost: 0,
        appliancesSnapshot: [], // CHANGED: real per-day snapshot, not a live-count approximation
        dayCount: 0,
        created_at: row.created_at, // will end up as the last row's date per month, fine for sorting
      })
    }

    const bucket = buckets.get(key)
    if (new Date(row.created_at) >= new Date(bucket.created_at)) {
      bucket.actual_kwh = Number(row.actual_kwh)
      bucket.actual_cost = Number(row.actual_cost)
      bucket.appliancesSnapshot = row.appliances_snapshot || [] // CHANGED: keep the snapshot from the latest day in this month
    }
    bucket.dayCount += 1
    // Keep created_at as the latest timestamp seen in this month, so
    // "most recent month" detection further down stays accurate.
    if (new Date(row.created_at) > new Date(bucket.created_at)) {
      bucket.created_at = row.created_at
    }
  })

  return Array.from(buckets.values()).sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  )
}

export default function MonthlyHistory() {
  const [profile, setProfile] = useState(null)
  const [dailyRows, setDailyRows] = useState([])
  const [appliances, setAppliances] = useState([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortBy, setSortBy] = useState('newest')

  const [selectedBill, setSelectedBill] = useState(null)

  const { rate: ratePerKwh } = useElectricityRate(profile?.provider_id)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, provider_id')
        .eq('id', user.id)
        .single()
      setProfile(profileData)

      // CHANGED: now selects appliances_snapshot alongside the existing
      // columns, so each daily row carries the appliances that were
      // active on the day it was generated.
      const { data: billData, error: billError } = await supabase
        .from('monthly_bills')
        .select('id, actual_kwh, actual_cost, appliances_snapshot, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (billError) {
        console.error('Failed to load monthly bills:', billError)
      } else {
        setDailyRows(billData || [])
      }

      // Still fetched — used as a fallback for old rows recorded before
      // the appliances_snapshot column existed (see enrichedMonths below).
      const { data: applianceData, error: applianceError } = await supabase
        .from('appliances')
        .select('*')
        .eq('user_id', user.id)

      if (applianceError) {
        console.error('Failed to load appliances:', applianceError)
      } else {
        setAppliances(applianceData || [])
      }

      setLoading(false)
    }

    load()
  }, [])

  // Step 1: collapse daily rows into monthly totals.
  const monthlyBuckets = useMemo(() => groupByMonth(dailyRows), [dailyRows])

  // Step 2: enrich each MONTH (not each day) with savingsVsPrevious and
  // status, same as before — just operating one level up now.
  const enrichedMonths = useMemo(() => {
    const mostRecentId = monthlyBuckets.length > 0
      ? monthlyBuckets[monthlyBuckets.length - 1].id
      : null

    return monthlyBuckets.map((bucket, index) => {
      const previous = index > 0 ? monthlyBuckets[index - 1] : null
      const savingsVsPrevious = previous
        ? previous.actual_cost - bucket.actual_cost
        : null

      const monthLabel = new Date(bucket.year, bucket.month, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })

      return {
        ...bucket,
        monthLabel,
        savingsVsPrevious,
        status: bucket.id === mostRecentId ? 'Current' : 'Archived',
        // CHANGED: exact count from that month's real snapshot instead of
        // the live appliances.length approximation.
        applianceCount: bucket.appliancesSnapshot.length,
      }
    })
  }, [monthlyBuckets])

  const availableYears = useMemo(() => {
    const years = new Set(enrichedMonths.map((b) => b.year))
    return Array.from(years).sort((a, b) => b - a)
  }, [enrichedMonths])

  const filteredMonths = useMemo(() => {
    return enrichedMonths.filter((b) => {
      const matchesSearch = b.monthLabel.toLowerCase().includes(search.toLowerCase())
      const matchesYear = yearFilter === 'ALL' || b.year === Number(yearFilter)

      const monthDate = new Date(b.year, b.month, 1)
      const matchesFrom = !dateFrom || monthDate >= new Date(dateFrom)
      const matchesTo = !dateTo || monthDate <= new Date(dateTo)

      return matchesSearch && matchesYear && matchesFrom && matchesTo
    })
  }, [enrichedMonths, search, yearFilter, dateFrom, dateTo])

  const sortedMonths = useMemo(() => {
    const list = [...filteredMonths]
    switch (sortBy) {
      case 'oldest':
        return list.sort((a, b) => new Date(a.year, a.month) - new Date(b.year, b.month))
      case 'highest_bill':
        return list.sort((a, b) => b.actual_cost - a.actual_cost)
      case 'lowest_bill':
        return list.sort((a, b) => a.actual_cost - b.actual_cost)
      case 'highest_consumption':
        return list.sort((a, b) => b.actual_kwh - a.actual_kwh)
      case 'lowest_consumption':
        return list.sort((a, b) => a.actual_kwh - b.actual_kwh)
      case 'most_savings':
        return list.sort((a, b) => (b.savingsVsPrevious ?? -Infinity) - (a.savingsVsPrevious ?? -Infinity))
      case 'newest':
      default:
        return list.sort((a, b) => new Date(b.year, b.month) - new Date(a.year, a.month))
    }
  }, [filteredMonths, sortBy])

  const totalRecords = enrichedMonths.length
  const avgBill = totalRecords > 0
    ? enrichedMonths.reduce((sum, b) => sum + b.actual_cost, 0) / totalRecords
    : null
  const avgKwh = totalRecords > 0
    ? enrichedMonths.reduce((sum, b) => sum + b.actual_kwh, 0) / totalRecords
    : null

  const bestSavingsMonth = useMemo(() => {
    const withSavings = enrichedMonths.filter((b) => b.savingsVsPrevious != null && b.savingsVsPrevious > 0)
    if (withSavings.length === 0) return null
    return withSavings.reduce((best, b) => (b.savingsVsPrevious > best.savingsVsPrevious ? b : best))
  }, [enrichedMonths])

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Monthly History</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Review your previous electricity calculations, monitor spending trends, and compare
          your household energy usage over time.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-4">
            <Hash size={18} className="text-primary" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Records</p>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
            {loading ? '...' : totalRecords}
          </p>
        </div>

        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center mb-4">
            <Receipt size={18} className="text-purple-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Average Monthly Bill</p>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
            {loading ? '...' : avgBill !== null ? `₱${avgBill.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : 'N/A'}
          </p>
        </div>

        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center mb-4">
            <Zap size={18} className="text-orange-500" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Average Monthly Consumption</p>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
            {loading ? '...' : avgKwh !== null ? (
              <>{avgKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })} <span className="text-base font-medium text-gray-400 dark:text-gray-500">kWh</span></>
            ) : 'N/A'}
          </p>
        </div>

        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center mb-4">
            <PiggyBank size={18} className="text-success" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Best Savings Month</p>
          {bestSavingsMonth ? (
            <>
              <p className="text-lg font-extrabold text-gray-900 dark:text-white">{bestSavingsMonth.monthLabel}</p>
              <p className="text-xs text-success font-semibold mt-0.5">
                ₱{bestSavingsMonth.savingsVsPrevious.toLocaleString(undefined, { maximumFractionDigits: 0 })} saved
              </p>
            </>
          ) : (
            <p className="text-lg font-extrabold text-gray-900 dark:text-white">{loading ? '...' : 'N/A'}</p>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search month..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
          />
        </div>

        <div className="relative">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-primary/30 outline-none cursor-pointer"
          >
            <option value="ALL">All Years</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-primary/30 outline-none"
          />
          <span className="text-gray-400 dark:text-gray-500 text-sm">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-primary/30 outline-none"
          />
        </div>

        <div className="flex-1" />

        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-primary/30 outline-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>
      </div>

      {/* Table */}
      <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card overflow-hidden shadow-sm">
        {loading ? (
          <p className="text-gray-400 dark:text-gray-500 text-sm p-8">Loading your history…</p>
        ) : sortedMonths.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Month</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Estimated Bill</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Energy Consumption</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Savings vs Previous Month</th>
                {/* CHANGED: dropped the "approximated" tooltip — this count now
                    comes straight from that month's real appliances_snapshot. */}
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">
                  Number of Appliances
                </th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-6 py-4 text-right font-semibold text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedMonths.map((bill, index) => (
                <tr
                  key={bill.id}
                  className={`transition hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    index % 2 === 1 ? 'bg-gray-50/50 dark:bg-gray-800/20' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {bill.monthLabel}
                    </div>
                    {bill.dayCount < 28 && (
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {bill.dayCount} {bill.dayCount === 1 ? 'day' : 'days'} logged so far
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                    ₱{bill.actual_cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                    {bill.actual_kwh.toLocaleString(undefined, { maximumFractionDigits: 1 })} kWh
                  </td>
                  <td className="px-6 py-4">
                    {bill.savingsVsPrevious == null ? (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    ) : bill.savingsVsPrevious >= 0 ? (
                      <span className="flex items-center gap-1 text-success font-semibold">
                        <TrendingUp size={14} />
                        ₱{bill.savingsVsPrevious.toLocaleString(undefined, { maximumFractionDigits: 0 })} Saved
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-danger font-semibold">
                        <TrendingDown size={14} />
                        ₱{Math.abs(bill.savingsVsPrevious).toLocaleString(undefined, { maximumFractionDigits: 0 })} Higher
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                    {bill.applianceCount} Appliances
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                      bill.status === 'Current'
                        ? 'bg-blue-50 dark:bg-blue-500/10 text-primary'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                    }`}>
                      {bill.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedBill(bill)}
                      className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition"
                    >
                      <FileText size={13} />
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4">
              <HistoryIcon size={24} className="text-gray-300 dark:text-gray-600" />
            </div>
            <p className="font-semibold text-gray-900 dark:text-white mb-1">
              {dailyRows.length === 0 ? 'No history yet' : 'No matching records'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">
              {dailyRows.length === 0
                ? "Your daily snapshots will start appearing here once they're logged."
                : 'Try a different search, year, or date range.'}
            </p>
          </div>
        )}
      </div>

      {selectedBill && (
        <MonthlyReportModal
          bill={selectedBill}
          // CHANGED: pass that month's real snapshot; only fall back to the
          // live `appliances` list for old rows recorded before the
          // appliances_snapshot column existed (empty snapshot array).
          appliances={selectedBill.appliancesSnapshot?.length ? selectedBill.appliancesSnapshot : appliances}
          ratePerKwh={ratePerKwh}
          onClose={() => setSelectedBill(null)}
        />
      )}
    </div>
  )
}
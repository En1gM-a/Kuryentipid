import { useState, useEffect } from 'react'
import {
  Bell, Receipt, Home, PiggyBank, Plus, RotateCw, SlidersHorizontal,
  Calculator, ChevronRight, Snowflake, Refrigerator as RefrigeratorIcon,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { supabase } from '../lib/supabaseClient'

// ============================================================
// FALLBACK_RATE_PER_KWH
// Used only if a user's provider has no row in `electricity_rates` yet
// (e.g. a brand-new/rare provider PRESYO hasn't published a rate for this
// month). The real rate now comes from the database — see `providerRate`
// state below, fetched from `electricity_rates`.
// ============================================================
const FALLBACK_RATE_PER_KWH = 11.5 // ₱ per kWh

export default function Dashboard() {
  // Controls which time range button is highlighted in "Energy Usage Trend".
  // NOTE: this doesn't currently re-fetch or re-filter data — it's just UI
  // state for now. If we want Daily/Weekly/Monthly to actually change the
  // chart, we'll need to filter `monthlyBills` (or query Supabase again)
  // based on this value.
  const [range, setRange] = useState('Weekly')

  // --- Data straight from Supabase, loaded in the useEffect below ---
  const [profile, setProfile] = useState(null)               // row from `profiles` table
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [applianceList, setApplianceList] = useState([])     //appliance list
  const [loadingAppliances, setLoadingAppliances] = useState(true)
  const [monthlyBills, setMonthlyBills] = useState([])       // rows from `monthly_bills` table
  const [loadingBills, setLoadingBills] = useState(true)     // Bills
  const [providerName, setProviderName] = useState('')       // name of the provider
  const [providerRate, setProviderRate] = useState(null)     // provider's current rate (₱/kWh) from `electricity_rates` table
  const [loadingRate, setLoadingRate] = useState(true)

  // ============================================================
  // Runs once when the Dashboard mounts. Fetches everything the page
  // needs in three separate Supabase queries (profile, appliances, bills).
  // All three are scoped to the logged-in user via `.eq('user_id', user.id)`
  // — Supabase RLS policies also enforce this server-side, so even if we
  // forgot the `.eq()` here, a user could never see someone else's data.
  // ============================================================
  useEffect(() => {
    async function loadDashboardData() {
      // Get the currently logged-in user from Supabase Auth.
      const { data: { user } } = await supabase.auth.getUser()

      // If nobody's logged in, bounce to the login page immediately.
      if (!user) {
        window.location.href = '/login'
        return
      }

      // --- 1. Profile: get the user's name + which electricity provider they picked ---
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, provider_id')
        .eq('id', user.id)
        .single() // we expect exactly one row (profiles.id is the PK, tied 1:1 to auth.users)

      if (profileError) {
        console.error('Failed to load profile:', profileError)
      } else {
        setProfile(profileData)
      }
      setLoadingProfile(false)

      // --- 1b. Provider name + current rate, looked up from provider_id ---
      // Runs only once we know provider_id from the profile above.
      if (profileData?.provider_id) {
        setLoadingRate(true)

        const { data: providerData, error: providerError } = await supabase
          .from('providers')
          .select('name')
          .eq('id', profileData.provider_id)
          .single()

        if (providerError) {
          console.error('Failed to load provider:', providerError)
        } else {
          setProviderName(providerData?.name || 'Unknown Provider')
        }

        // Latest known rate for this provider — sorted by created_at so we
        // always get the most recently imported month, regardless of how
        // `month`/`year` are stored (month is a name like "June", not
        // reliably sortable as a string).
        const { data: rateData, error: rateError } = await supabase
          .from('electricity_rates')
          .select('residential_rate, month, year')
          .eq('provider_id', profileData.provider_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

          

        if (rateError) {
          console.error('Failed to load electricity rate:', rateError)
        } else if (rateData?.residential_rate) {
          setProviderRate(rateData.residential_rate)
        }
        // If no rate row exists yet, providerRate stays null and we fall
        // back to FALLBACK_RATE_PER_KWH further down.
        setLoadingRate(false)
      } else {
        setLoadingRate(false)
      }

      

      // --- 2. Appliances: every appliance this user has added (used for cost estimates) ---
      const { data: applianceData, error: applianceError } = await supabase
        .from('appliances')
        .select('id, name, category, wattage, quantity, hours_per_day')
        .eq('user_id', user.id)
        .eq('is_active', true) // skip appliances the user has "removed" (soft delete)

      if (applianceError) {
        console.error('Failed to load appliances:', applianceError)
      } else {
        setApplianceList(applianceData || [])
      }
      setLoadingAppliances(false)

      // --- 3. Monthly bills: actual logged bills, used for the trend chart ---
      const { data: billData, error: billError } = await supabase
        .from('monthly_bills')
        .select('created_at, actual_kwh, actual_cost')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }) // oldest -> newest, so the chart reads left to right

      if (billError) {
        console.error('Failed to load monthly bills:', billError)
      } else {
        setMonthlyBills(billData || [])
      }
      setLoadingBills(false)
    }

    loadDashboardData()
  }, []) // empty deps = run once on mount, not on every re-render

  // ============================================================
  // DERIVED / COMPUTED VALUES
  // Everything below is calculated from the Supabase data above — nothing
  // here is hardcoded. If a KPI card looks wrong, check the raw Supabase
  // data first (via Supabase Table Editor), then check the math here.
  // ============================================================

  // Real rate for this provider if we found one, otherwise the flat fallback.
  const effectiveRate = providerRate ?? FALLBACK_RATE_PER_KWH

  // Monthly ₱ cost for a single appliance:
  // watts * how many of that appliance * hours used per day * 30 days
  // ÷ 1000 (convert watt-hours to kWh) * price per kWh
  const applianceCost = (a) =>
    (a.wattage * a.quantity * a.hours_per_day * 30) / 1000 * effectiveRate

  // Same formula but stops before multiplying by the ₱/kWh rate —
  // gives us kWh instead of pesos.
  const applianceKwh = (a) =>
    (a.wattage * a.quantity * a.hours_per_day * 30) / 1000

  const hasAppliances = applianceList.length > 0
  const hasTrendData = monthlyBills.length > 0
  // Single "is anything still loading" flag so the UI can show placeholders
  // instead of flashing 0/₱0 before real data arrives.
  const loading = loadingProfile || loadingAppliances || loadingBills || loadingRate

  // Sum up estimated cost/kWh across every appliance the user owns.
  const totalEstimatedCost = applianceList.reduce((sum, a) => sum + applianceCost(a), 0)
  const totalEstimatedKwh = applianceList.reduce((sum, a) => sum + applianceKwh(a), 0)

  // Which number do we show on the "Estimated Monthly Bill" card?
  // Priority: if the user has actually logged a real bill (monthly_bills),
  // trust that over our appliance-based math guess. Otherwise fall back to
  // the estimate. If they have neither, show ₱0.
  const latestBill = hasTrendData ? monthlyBills[monthlyBills.length - 1] : null
  const estimatedBill = latestBill
    ? `₱${latestBill.actual_cost?.toLocaleString() ?? '0'}`
    : hasAppliances
      ? `₱${totalEstimatedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : '₱0'

  const totalKwh = latestBill
    ? latestBill.actual_kwh?.toLocaleString() ?? '0'
    : hasAppliances
      ? totalEstimatedKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : '0'

  const applianceCount = applianceList.length

  

  // ⚠️ PLACEHOLDER LOGIC — not a real savings calculation yet.
  // Currently just assumes "12% of your total estimated cost" as a generic
  // number so the card isn't empty. Replace this once we design real
  // "Optimize Bill" logic (e.g. comparing against efficient-appliance
  // benchmarks, or flagging appliances that run more hours than average).
  const potentialSavings = hasAppliances
    ? `₱${(totalEstimatedCost * 0.12).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : '₱0'

  // Sort appliances by estimated monthly cost (highest first), take top 4,
  // for the "Top Energy Consumers" card.
  const topConsumers = [...applianceList]
    .map((a) => ({ ...a, cost: applianceCost(a) }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 4)

  // Reshape monthly_bills rows into the {date, usage} format Recharts expects.
  const usageTrend = monthlyBills.map((b) => ({
    date: b.bill_month,
    usage: b.actual_kwh,
  }))

  // Friendly display name. Provider name + rate now come straight from the
  // `providers` / `electricity_rates` tables (fetched above), not a
  // hardcoded array, so this can never drift out of sync with the DB.
  const displayName = profile?.full_name || '....'
  const firstName = displayName.split(' ')[0] || '....'

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto">
      {/* Header: greeting + user avatar/provider name */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Dashboard Overview</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Welcome back, {firstName}! Here's your energy summary for this month.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button className="relative w-10 h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            <Bell size={18} />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-danger" />
          </button>
          <div className="flex items-center gap-3">
            {/* TODO: this avatar is a static placeholder (pravatar.cc), not
                the real user's photo. Hook up real avatar storage later. */}
            <img
              src="https://i.pravatar.cc/40?img=12"
              alt="User avatar"
              className="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <div className="font-semibold text-gray-900 dark:text-white text-sm">{displayName}</div>
              <div className="text-primary text-xs font-medium">
                {loadingProfile ? '' : providerName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards row — the 4 summary numbers at the top of the dashboard */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        {/* Card 1: Estimated Monthly Bill (real bill if logged, else computed estimate) */}
        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <Receipt size={18} className="text-primary" />
            </div>
            {hasAppliances && (
              <span className="text-xs font-semibold text-primary bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-full">
                ESTIMATED
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Estimated Monthly Bill</p>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
            {loading ? '...' : estimatedBill}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {hasAppliances ? 'Based on your appliances' : 'No calculations yet'}
          </p>
        </div>

        {/* Card 2: Total Monthly kWh (same source logic as the bill above) */}
        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center mb-4">
            <Home size={18} className="text-purple-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Monthly kWh</p>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
            {loading ? '...' : totalKwh} <span className="text-base font-medium text-gray-400 dark:text-gray-500">kWh</span>
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {hasAppliances ? 'Estimated from usage' : 'No data yet'}
          </p>
        </div>

        {/* Card 3: how many appliances the user has added (simple count) */}
        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center mb-4">
            <Home size={18} className="text-orange-500" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Number of Appliances</p>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
            {loading ? '...' : applianceCount}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {hasAppliances ? 'Synced from your account' : 'Add your first appliance'}
          </p>
        </div>

        {/* Card 4: Potential Savings — see the ⚠️ placeholder note above */}
        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-500/10 flex items-center justify-center">
              <PiggyBank size={18} className="text-success" />
            </div>
            {hasAppliances && (
              <span className="text-xs font-semibold text-success bg-green-50 dark:bg-green-500/10 px-2.5 py-1 rounded-full">
                POTENTIAL
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Potential Savings</p>
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white">
            {loading ? '...' : potentialSavings}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {hasAppliances ? 'Try "ECO" mode settings' : 'N/A'}
          </p>
        </div>
      </div>

      {/* Quick action buttons — none of these are wired up to real
          behavior yet (no onClick handlers). Placeholder UI for now. */}
      <div className="flex items-center gap-3 mb-6">
        <button className="flex items-center gap-2 bg-primary text-white font-semibold px-5 py-3 rounded-xl shadow-sm hover:bg-blue-700 transition">
          <Plus size={18} />
          Add Appliance
        </button>
        <button className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 px-5 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          <RotateCw size={16} />
          Recalculate
        </button>
        <button className="flex items-center gap-2 border border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 px-5 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition">
          <SlidersHorizontal size={16} />
          Optimize Bill
        </button>
      </div>

      {/* Main content row: usage trend chart (left, 2/3 width)
          + top energy consumers list (right, 1/3 width) */}
      <div className="grid grid-cols-3 gap-6">
        {/* Usage trend chart, built from monthly_bills rows */}
        <div className="col-span-2 border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Energy Usage Trend</h2>
            {/* Daily/Weekly/Monthly toggle — currently just changes which
                button looks "active"; doesn't actually re-query or filter
                data yet (see `range` state comment above). */}
            <div className="flex bg-gray-50 dark:bg-gray-800 rounded-xl p-1">
              {['Daily', 'Weekly', 'Monthly'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                    range === r ? 'bg-primary text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'
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
              </LineChart>
            </ResponsiveContainer>
          ) : (
            // Empty state: shown until the user logs at least one monthly_bills row
            <div className="h-[280px] flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-4">
                <Receipt size={24} className="text-primary" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white mb-1">No usage data yet</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                Log a monthly bill to start seeing your usage trend here.
              </p>
            </div>
          )}
        </div>

        {/* Top 4 most expensive appliances (by estimated monthly cost) */}
        <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Top Energy Consumers</h2>
          </div>

          {hasAppliances ? (
            <div className="flex flex-col gap-4">
              {topConsumers.map((a) => (
                <div key={a.id} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    <Calculator size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{a.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{a.category}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-gray-900 dark:text-white text-sm">
                      ₱{a.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Empty state: shown until the user adds at least one appliance
            <div className="flex flex-col items-center justify-center text-center py-10">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-3">
                <Calculator size={20} className="text-gray-300 dark:text-gray-600" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm mb-1">No appliances yet</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Add appliances to see top consumers here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom section: quick preview of appliances (first 4 only).
          Full CRUD management happens on the separate Appliances page —
          this is just a dashboard-level glance. */}
      <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm mt-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">All Appliances</h2>
          {hasAppliances && (
            <button className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              Manage All Appliances <ChevronRight size={16} />
            </button>
          )}
        </div>

        {hasAppliances ? (
          <div className="grid grid-cols-4 gap-4">
            {/* .slice(0, 4): only preview the first 4 — this is NOT sorted
                by cost like `topConsumers` above, just insertion order from
                the Supabase query. */}
            {applianceList.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Snowflake size={18} className="text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{a.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    ₱{applianceCost(a).toLocaleString(undefined, { maximumFractionDigits: 0 })} / month
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Empty state: shown until the user adds at least one appliance
          <div className="flex flex-col items-center justify-center text-center py-10">
            <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-3">
              <RefrigeratorIcon size={20} className="text-gray-300 dark:text-gray-600" />
            </div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm mb-1">No appliances added yet</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
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
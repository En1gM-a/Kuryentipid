import { useState, useEffect } from 'react'
import {
  Search, ChevronDown, Plus, Pencil, Trash2,
  Snowflake, Refrigerator, Lightbulb, Tv, Fan,
  Zap, Leaf, TriangleAlert, Plug
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import AddApplianceModal from '../components/AddApplianceModal'
import { getCategoryStyle } from '../lib/applianceStyles'
import { useElectricityRate } from '../hooks/useElectricityRate'
import { calculateMonthlyCost } from '../lib/calculations'


// NOTE: the live `energyEfficiency` hook is no longer used directly.
// Its logic (calling the Gemini edge function) is reused below inside
// `generateAndSaveEfficiency`, which now only runs once per Philippine
// calendar day per user, driven by `fetchStoredEfficiency`.

// ============================================================
// Returns a "YYYY-MM-DD" string representing what the date is in the
// Philippines (UTC+8, no DST) for a given JS Date. Used to compare
// "today" vs. the day the last AI suggestion was generated, so we only
// ever call Gemini once per PH calendar day. Also reused by
// `fetchTodaySnapshot` below to check the automatic daily bill snapshot.
//
// Trick: shift the timestamp by +8 hours, then read the UTC date parts
// off of it. Because we've already shifted the clock forward by the PH
// offset, the UTC Y/M/D of the shifted instant equals the PH-local Y/M/D
// of the original instant.
// ============================================================
function getPHDateString(date = new Date()) {
  const PH_OFFSET_MS = 8 * 60 * 60 * 1000
  const shifted = new Date(date.getTime() + PH_OFFSET_MS)
  return shifted.toISOString().slice(0, 10) // "YYYY-MM-DD"
}

const MIN_APPLIANCES_FOR_AI = 3

export default function Appliances() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL CATEGORIES')
  const [categories, setCategories] = useState(['ALL CATEGORIES'])
  const [profile, setProfile] = useState(null)
  const [providerName, setProviderName] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingAppliance, setEditingAppliance] = useState(null)
  const { rate: ratePerKwh, loading: rateLoading } = useElectricityRate(profile?.provider_id)

  // NOTE: despite the name, this state currently holds rows from
  // `appliance_choices` (the shared catalog), NOT the user's own
  // `appliances` table rows. See the FETCH APPLIANCE CATALOG block below.

  const [appliances, setAppliances] = useState([])
  const [userAppliances, setUserAppliances] = useState([]) // <-- holds the user's own appliances

  // --- AI EFFICIENCY SUGGESTION STATE ---
  // Populated by `fetchStoredEfficiency()` below. That function decides,
  // based on the PH-time date of `energy_ai_suggestions.updated_at`,
  // whether to just show the stored row or regenerate it via Gemini
  // first (see `generateAndSaveEfficiency`).
  const [efficiency, setEfficiency] = useState(null)
  const [efficiencyLoading, setEfficiencyLoading] = useState(false)

  // --- TODAY'S AUTOMATIC BILL SNAPSHOT STATE ---
  // Populated by `fetchTodaySnapshot()` below. Purely a status check for
  // the banner rendered under the page header — it reflects whether the
  // scheduled `create_daily_bill_snapshots()` Postgres job (pg_cron, runs
  // at 12:00 AM Philippine time) has already inserted today's row into
  // `monthly_bills`. It never triggers a snapshot itself.
  const [todaySnapshot, setTodaySnapshot] = useState(null)
  const [todaySnapshotLoading, setTodaySnapshotLoading] = useState(true)

  // --- DELETE CONFIRMATION STATE ---
  // Instead of window.confirm, we track which appliance (if any) is
  // pending deletion. The custom banner below renders conditionally
  // based on this value.
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  // ============================================================
  // Calls the Gemini-powered `energy-efficiency` edge function, then
  // upserts the result into `energy_ai_suggestions` keyed by user_id.
  // Because of `onConflict: 'user_id'` (and the UNIQUE constraint on
  // that column), this UPDATES the user's existing row in place instead
  // of inserting a new one every time it runs.
  //
  // Called from two places:
  //   1. `fetchStoredEfficiency`, automatically, only when there's no
  //      stored row yet or the stored row is from a previous PH day.
  //   2. A future manual "Refresh" button, if/when one gets built —
  //      just call this directly with the same three args.
  // ============================================================
  async function generateAndSaveEfficiency(userId, appliancesForGeneration, householdType) {
    setEfficiencyLoading(true)

    const { data: result, error: fnError } = await supabase.functions.invoke(
      'energy-efficiency',
      { body: { appliances: appliancesForGeneration, householdType } }
    )

    if (fnError) {
      console.error('Failed to generate efficiency suggestion:', fnError)
      setEfficiencyLoading(false)
      return
    }

    // Derive a simple tone tag once, at generation time, so the JSX
    // below never has to recompute it from percentVsAverage.
    const tone = result.percentVsAverage <= 0 ? 'positive' : 'warning'
    const nowIso = new Date().toISOString()

    const { error: upsertError } = await supabase
      .from('energy_ai_suggestions')
      .upsert(
        {
          user_id: userId,
          label: result.rating,
          comparison: result.percentVsAverage,
          tone,
          summary: result.reasoning,
          updated_at: nowIso,
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      console.error('Failed to save efficiency suggestion:', upsertError)
    }

    setEfficiency({
      rating: result.rating,
      percentVsAverage: result.percentVsAverage,
      tone,
      reasoning: result.reasoning,
      updatedAt: nowIso,
    })
    setEfficiencyLoading(false)
  }

  // ============================================================
  // Loads the most recently saved AI efficiency suggestion for this user
  // from `energy_ai_suggestions` (one row per user_id, `.maybeSingle()`
  // since a brand-new user won't have a row yet).
  //
  // Then decides whether that stored row is "fresh enough":
  //   - If a row exists AND its `updated_at`, converted to Philippine
  //     time, falls on today's PH date -> just display it. No Gemini call.
  //   - If there's no row yet, OR the row's PH-date is from a previous
  //     day -> call `generateAndSaveEfficiency` to regenerate it once and
  //     save the fresh result (updating the same row, not adding a new one).
  //
  // This means Gemini only ever gets called at most once per user per PH
  // calendar day (effectively "resets" at 12:00 AM Philippine time),
  // regardless of how many times the user visits this page that day.
  // ============================================================
  async function fetchStoredEfficiency(userId, appliancesForGeneration, householdType) {

    if (appliancesForGeneration.length < MIN_APPLIANCES_FOR_AI) {
    setEfficiency(null)
    setEfficiencyLoading(false)
    return
   }

    setEfficiencyLoading(true)

    const { data, error } = await supabase
      .from('energy_ai_suggestions')
      .select('label, comparison, tone, summary, updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to load stored efficiency suggestion:', error)
      setEfficiency(null)
      setEfficiencyLoading(false)
      return
    }

    const todayPH = getPHDateString()
    const lastUpdatedPH = data?.updated_at ? getPHDateString(new Date(data.updated_at)) : null

    if (data && lastUpdatedPH === todayPH) {
      // Already generated today (Philippine time) — just show it, no
      // Gemini call needed.
      setEfficiency({
        rating: data.label,
        percentVsAverage: data.comparison,
        tone: data.tone,
        reasoning: data.summary,
        updatedAt: data.updated_at,
      })
      setEfficiencyLoading(false)
      return
    }

    // No row yet, or the stored suggestion is from a previous PH day —
    // regenerate via Gemini and upsert (updates the same row).
    await generateAndSaveEfficiency(userId, appliancesForGeneration, householdType)
  }

  // ============================================================
  // Checks whether the automatic daily snapshot (see the
  // `create_daily_bill_snapshots()` Postgres function, scheduled via
  // pg_cron at 12:00 AM PH time) has already run for *today*. Queries
  // `monthly_bills` for a row whose `created_at` falls within today's
  // Philippine calendar day, converting that PH day into the equivalent
  // UTC range for the query (PH midnight = UTC 16:00 the previous day).
  //
  // This is purely a status check for the banner rendered below the
  // page header — it does NOT trigger a snapshot itself. If nothing is
  // found yet, the banner just falls back to its default/muted state.
  // ============================================================
  async function fetchTodaySnapshot(userId) {
    setTodaySnapshotLoading(true)

    const todayPH = getPHDateString()
    const startUtc = new Date(`${todayPH}T00:00:00+08:00`)
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000)

    const { data, error } = await supabase
      .from('monthly_bills')
      .select('id, actual_kwh, actual_cost, appliances_snapshot, created_at')
      .eq('user_id', userId)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("Failed to load today's snapshot:", error)
      setTodaySnapshot(null)
    } else {
      setTodaySnapshot(data || null)
    }

    setTodaySnapshotLoading(false)
  }

  // ============================================================
  // Central data-loading function for this page. Pulled out of useEffect
  // so it can be re-run on demand — specifically after the Add Appliance
  // modal successfully inserts a new row (see handleApplianceAdded below),
  // not just once when the page first mounts.
  //
  // Fires several separate Supabase calls, in this order:
  //   1. auth.getUser()               -> confirm session, else redirect
  //   2. appliance_choices  (select)  -> shared catalog for dropdown/table
  //   3. profiles           (select)  -> current user's name + provider_id
  //   4. providers          (select)  -> human-readable provider name
  //   5. appliances         (select)  -> the user's own appliance rows
  //   6. rpc get_appliance_categories -> distinct category list for filters
  //   7. energy_ai_suggestions (select, maybe regenerate) -> AI efficiency
  //   8. monthly_bills (today's row, if any) -> today's snapshot banner
  // ============================================================
  async function loadAppliancePageData() {
    // --- AUTH CHECK ---
    // Confirms there's an active Supabase session before doing anything
    // else. If nobody's logged in, bounce straight to /login — no point
    // running the rest of the queries (RLS would just reject them anyway).
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    // Kick off the today's-snapshot status check independently — it
    // doesn't depend on anything else fetched below.
    fetchTodaySnapshot(user.id)

    // --- FETCH APPLIANCE CATALOG ---
    // `appliance_choices` is a shared reference table (brand, model,
    // typical wattage, typical hours/day, energy rating, notes) that all
    // users pick from — intentionally unfiltered, not per-user, no
    // `.eq('user_id', ...)` needed here since every logged-in user should
    // see the same catalog rows.
    const { data: applianceData, error: applianceError } = await supabase
      .from('appliance_choices')
      .select('*')

    if (applianceError) {
      console.error('Failed to load appliance data:', applianceError)
    } else {
      setAppliances(applianceData)
    }

    // --- FETCH USER PROFILE ---
    // Need full_name (header greeting), provider_id (provider lookup
    // next), and household_type (fed into the AI efficiency generation).
    // `.single()` is safe here because `profiles.id` is the PK and is
    // 1:1 with auth.users.id.
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('full_name, provider_id, household_type')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('Failed to load profile:', profileError)
    } else {
      setProfile(profileData)
    }

    // --- FETCH PROVIDER NAME ---
    // Only runs if the profile actually has a provider_id set (a user
    // could theoretically not have picked one yet). Turns the FK into a
    // human-readable name for display in the header.
    if (profileData?.provider_id) {
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
    }

    // --- FETCH USER'S OWN APPLIANCES ---
    const { data: userApplianceData, error: userApplianceError } = await supabase
      .from('appliances')
      .select('*')
      .eq('user_id', user.id)

    if (userApplianceError) {
      console.error('Failed to load user appliances:', userApplianceError)
    } else {
      setUserAppliances(userApplianceData || [])
    }

    // --- FETCH CATEGORY LIST ---
    // Calls a Postgres function (`get_appliance_categories`) rather than
    // querying a table directly — likely because categories come from an
    // enum/lookup table or need de-duplication server-side. Prepending
    // 'ALL CATEGORIES' gives the filter dropdown its default "show
    // everything" option. This list is also passed down as a prop to
    // AddApplianceModal so both dropdowns always stay in sync.
    const { data: categoryData, error: categoryError } = await supabase
      .rpc('get_appliance_categories')

    if (categoryError) {
      console.error('Failed to load categories:', categoryError)
      return
    }

    setCategories(['ALL CATEGORIES', ...categoryData.map((row) => row.value)])

    // --- LOAD (AND POSSIBLY REGENERATE) AI EFFICIENCY SUGGESTION ---
    // Passes the just-fetched appliances + household_type along, in case
    // `fetchStoredEfficiency` decides today's suggestion needs to be
    // (re)generated via Gemini.
    fetchStoredEfficiency(user.id, userApplianceData || [], profileData?.household_type)
  }

  // --- DELETE FLOW ---
  // Step 1: user clicks the trash icon on a row -> just opens the
  // confirmation banner, no DB call happens yet.
  function handleDeleteAppliance(applianceId) {
    setPendingDeleteId(applianceId)
  }

  // Step 2a: user clicks "Cancel" on the banner -> close it, nothing changes.
  function cancelDelete() {
    setPendingDeleteId(null)
  }

  // Step 2b: user clicks "Confirm Delete" on the banner -> actually delete
  // from Supabase, then update local state directly (no full re-fetch)
  // so the row disappears instantly.
  async function confirmDelete() {
    const applianceId = pendingDeleteId
    setPendingDeleteId(null) // close the banner immediately for snappy UX

    const { error } = await supabase
      .from('appliances')
      .delete()
      .eq('id', applianceId)

    if (error) {
      console.error('Error deleting appliance:', error)
      alert('Failed to delete appliance. Please try again.')
      return
    }

    setUserAppliances((prev) => prev.filter((a) => a.id !== applianceId))
  }

  // Run once on mount. Empty dependency array means this won't re-fire on
  // every re-render — subsequent refreshes only happen via the explicit
  // handleApplianceAdded() call below.
  useEffect(() => {
    loadAppliancePageData()
  }, [])

  const displayName = profile?.full_name || '....'
  const totalWattage = userAppliances.reduce((total, appliance) => {
    return total + Number(appliance.wattage || 0)
  }, 0)
  const totalMonthlyCost = ratePerKwh
    ? userAppliances.reduce((sum, a) => sum + calculateMonthlyCost(a, ratePerKwh), 0)
    : null

  const filteredUserAppliances = userAppliances.filter((a) => {
    const matchesSearch = (a.name || a.model_name || '').toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'ALL CATEGORIES' || a.category === category

    return matchesSearch && matchesCategory
  })

  // Called by AddApplianceModal via its onApplianceAdded prop, right after
  // it successfully inserts a new row into `appliances`. Re-runs the full
  // page load rather than doing a targeted local update, so everything
  // (list, categories, counts) stays guaranteed-consistent with the DB —
  // at the cost of a few extra round-trips. Note this will NOT trigger an
  // extra Gemini call unless today's PH-date suggestion doesn't exist yet,
  // since `fetchStoredEfficiency` still does the same freshness check.
  function handleApplianceAdded() {
    loadAppliancePageData()
  }

  function handleOpenAddModal() {
    setEditingAppliance(null)
    setIsModalOpen(true)
  }

  function handleOpenEditModal(appliance) {
    setEditingAppliance(appliance)
    setIsModalOpen(true)
  }

  function handleCloseModal() {
    setIsModalOpen(false)
    setEditingAppliance(null)
  }

  // --- CLIENT-SIDE FILTERING ---
  // Search + category filtering both happen in the browser against the
  // already-fetched `appliances` array — no re-querying Supabase per
  // keystroke. Fine while the catalog stays small; would want a real
  // server-side/query-based filter (`.ilike()`, `.eq()`) if this table
  // grows large enough that shipping the whole table to the client stops
  // being practical.
  const filtered = appliances.filter((a) => {
    const matchesSearch = a.model_name?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = category === 'ALL CATEGORIES' || a.category === category

    return matchesSearch && matchesCategory
  })

  return (
    <div className="relative px-8 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Appliance Management</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage and track the energy consumption of your individual devices.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div>
            <div className="font-semibold text-gray-900 dark:text-white text-sm">{displayName}</div>
            <div className="text-primary text-xs font-medium">{providerName}</div>
          </div>
        </div>
      </div>

      {/* --- TODAY'S SNAPSHOT STATUS --- */}
      {/* Reflects whether the automatic daily job (create_daily_bill_snapshots,
          pg_cron at 12:00 AM PH time) has saved today's row yet. Falls back
          to the same muted/default styling as the empty-state below instead
          of showing anything stale or misleading when it hasn't run yet. */}
      <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
        todaySnapshot
          ? 'border-green-100 dark:border-green-500/20 bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400'
          : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 text-gray-500 dark:text-gray-400'
      }`}>
        {todaySnapshotLoading ? (
          "Checking today's snapshot…"
        ) : todaySnapshot ? (
          <>
            <span className="font-semibold">Today's snapshot saved</span> — {todaySnapshot.appliances_snapshot?.length ?? 0} appliances,{' '}
            ₱{Number(todaySnapshot.actual_cost).toLocaleString(undefined, { maximumFractionDigits: 0 })} estimated
          </>
        ) : (
          "No snapshot yet today — it saves automatically at 12:00 AM (Philippine time)."
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          {/* Purely client-side text filter — see `filtered` above. Matches
              against `model_name` only, not brand/category/notes. */}
          <input
            type="text"
            placeholder="Search appliance..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
          />
        </div>

        <div className="relative">
          {/* Category filter — options come from the RPC-backed
              `categories` state fetched above, so it's driven by the DB,
              not hardcoded. */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-primary/30 outline-none cursor-pointer"
          >
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>

        <div className="flex-1" />

        <button
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 bg-primary text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:bg-blue-700 transition"
        >
          <Plus size={18} />
          Add Appliance
        </button>
      </div>

      {/* Table */}
      <div className="border border-gray-100 dark:border-gray-800 rounded-card overflow-hidden shadow-sm bg-white dark:bg-gray-900">
        {filteredUserAppliances.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
              <tr>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Appliance</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Category</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Wattage</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Hours / Day</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Monthly Use</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500 dark:text-gray-400">Monthly Cost</th>
                <th className="px-6 py-4 text-right font-semibold text-gray-500 dark:text-gray-400">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredUserAppliances.map((appliance) => {
                const wattage = Number(appliance.wattage || 0)
                const hoursPerDay = Number(appliance.hours_per_day || 0)
                const monthlyKwh = ((wattage * hoursPerDay * 30) / 1000).toFixed(1)

                return (
                  <tr key={appliance.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {appliance.name || appliance.model_name || 'Unnamed Appliance'}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {(() => {
                        const style = getCategoryStyle(appliance.category)
                        const Icon = style.icon
                        return (
                          <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                            <Icon size={16} className={style.iconColor} />
                            <span className="font-semibold">{appliance.category || 'Uncategorized'}</span>
                          </div>
                        )
                      })()}
                    </td>

                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                      {wattage.toLocaleString()} W
                    </td>

                    <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {hoursPerDay} hrs
                    </td>

                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                      {monthlyKwh} kWh
                    </td>

                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                      {ratePerKwh
                        ? `₱${calculateMonthlyCost(appliance, ratePerKwh).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : rateLoading ? '…' : 'N/A'}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(appliance)}
                          className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteAppliance(appliance.id)}
                          className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center text-danger hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4">
              <Plug size={24} className="text-gray-300 dark:text-gray-600" />
            </div>

            <p className="font-semibold text-gray-900 dark:text-white mb-1">
              {userAppliances.length === 0 ? 'No appliances yet' : 'No matching appliances'}
            </p>

            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-5">
              {userAppliances.length === 0
                ? 'Add your first appliance to start tracking your electricity usage.'
                : 'Try a different search term or category.'}
            </p>

            {userAppliances.length === 0 && (
              <button
                onClick={handleOpenAddModal}
                className="flex items-center gap-2 bg-primary text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:bg-blue-700 transition"
              >
                <Plus size={18} />
                Add Appliance
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {/* UI-only for now — Previous/Next buttons aren't wired to real
          paging logic yet. `filtered`/`appliances` counts are real, but
          the whole result set is always shown (no slicing), so "Next" has
          nothing to advance to. Would need offset/limit state plus
          `.range()` on the Supabase query (or client-side slicing) once
          the catalog grows large enough to need real pagination. */}
      <div className="flex items-center justify-between mt-5">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing <span className="font-semibold text-gray-900 dark:text-white">{filteredUserAppliances.length}</span> of{' '}
          <span className="font-semibold text-gray-900 dark:text-white">{userAppliances.length}</span> appliances
        </p>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-400 dark:text-gray-600 cursor-not-allowed">
            Previous
          </button>
          <button className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
            Next
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-6 mt-10 pt-8 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
            <Zap size={18} className="text-primary" />
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide">ACTIVE LOAD</div>
            <div className="text-lg font-extrabold text-gray-900 dark:text-white">
              {totalWattage.toLocaleString()} <span className="text-sm font-medium text-gray-500 dark:text-gray-400">TOTAL WATTS</span>
            </div>
          </div>
        </div>

        {/* ENERGY EFFICIENCY — only computed once the user has tracked at least
    MIN_APPLIANCES_FOR_AI appliances; below that, a real average-usage
    comparison isn't meaningful, so we show a nudge instead of calling
    Gemini or displaying stale/misleading data. */}

<div>
  <div className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide">ENERGY EFFICIENCY</div>
  {userAppliances.length < MIN_APPLIANCES_FOR_AI ? (
    <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
      Add {MIN_APPLIANCES_FOR_AI - userAppliances.length} more appliance
      {MIN_APPLIANCES_FOR_AI - userAppliances.length === 1 ? '' : 's'} for an AI insight
    </div>
  ) : (
    <>
      <div className="text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
        {efficiencyLoading ? 'Loading…' : efficiency?.rating || 'N/A'}
        {efficiency && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              efficiency.tone === 'positive'
                ? 'text-success bg-green-50 dark:bg-green-500/10'
                : 'text-warning bg-orange-50 dark:bg-orange-500/10'
            }`}
          >
            {efficiency.percentVsAverage > 0 ? '+' : ''}
            {efficiency.percentVsAverage}% vs Avg
          </span>
        )}
      </div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
        Updates daily at 12:00 AM (PH time)
      </p>
    </>
  )}
</div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
            <TriangleAlert size={18} className="text-warning" />
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide">EST. MONTHLY COST</div>
            <div className="text-lg font-extrabold text-gray-900 dark:text-white">
              {totalMonthlyCost !== null
                ? `₱${totalMonthlyCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : rateLoading ? 'Loading…' : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Floating add button — duplicate entry point to the same modal as
          the toolbar's "Add Appliance" button above, just fixed-position
          for reachability while scrolled. */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:bg-blue-700 transition flex items-center justify-center"
      >
        <Plus size={24} />
      </button>

      {/* `categories` filtered to drop 'ALL CATEGORIES' since that's a
          page-level filter option, not a real category the DB stores —
          shouldn't be selectable as an appliance's category in the form.
          `applianceChoices={appliances}` passes the (confusingly-named)
          catalog data down so the modal's "Choose from catalog" dropdown
          can autofill brand/model/wattage/hours from a known appliance. */}
      <AddApplianceModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        categories={categories.filter((c) => c !== 'ALL CATEGORIES')}
        applianceChoices={appliances}
        editingAppliance={editingAppliance}
        onSaved={handleApplianceAdded}
      />

      {/* --- CUSTOM DELETE CONFIRMATION BANNER --- */}
      {/* Renders only when pendingDeleteId is set (i.e. the user clicked a
          trash icon). Replaces window.confirm with a styled in-app modal.
          "Cancel" just clears pendingDeleteId with no DB call. "Confirm
          Delete" runs confirmDelete(), which deletes from Supabase and
          removes the row from local state directly — no re-fetch needed. */}
      {pendingDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-danger" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">Delete appliance?</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              This will permanently remove this appliance from your list. This action can't be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-danger text-white text-sm font-semibold hover:bg-red-600 transition"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
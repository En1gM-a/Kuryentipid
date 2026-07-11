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

// NOTE: the live `energyEfficiency` hook is intentionally NOT imported
// anymore. It called the Gemini edge function automatically whenever
// `userAppliances`/`household_type` changed, which is exactly the
// "runs on every load" behavior we're moving away from. The hook's logic
// still exists at '../hooks/energyEfficiency' and gets reused (not via
// the hook itself, but a direct `supabase.functions.invoke` call) inside
// the commented-out `handleRefreshEfficiency` function below, which is
// ready to wire up to a button once one exists.

export default function Appliances() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('ALL CATEGORIES')
  const [categories, setCategories] = useState(['ALL CATEGORIES'])
  const [profile, setProfile] = useState(null)
  const [providerName, setProviderName] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { rate: ratePerKwh, loading: rateLoading } = useElectricityRate(profile?.provider_id)

  // NOTE: despite the name, this state currently holds rows from
  // `appliance_choices` (the shared catalog), NOT the user's own
  // `appliances` table rows. See the FETCH APPLIANCE CATALOG block below.

  const [appliances, setAppliances] = useState([])
  const [userAppliances, setUserAppliances] = useState([]) // <-- holds the user's own appliances

  // --- AI EFFICIENCY SUGGESTION STATE ---
  // This used to come live from the `energyEfficiency` hook on every
  // render where its inputs changed. Now it's just local state, populated
  // by `fetchStoredEfficiency()` below (reads the last-saved row from
  // `energy_ai_suggestions`). It will only change again once a "Refresh"
  // button (not built yet) calls `handleRefreshEfficiency()`.
  const [efficiency, setEfficiency] = useState(null)
  const [efficiencyLoading, setEfficiencyLoading] = useState(false)

  // --- DELETE CONFIRMATION STATE ---
  // Instead of window.confirm, we track which appliance (if any) is
  // pending deletion. The custom banner below renders conditionally
  // based on this value.
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  // ============================================================
  // Fetches the most recently saved AI efficiency suggestion for this
  // user from `energy_ai_suggestions` (one row per user_id). This is a
  // read of stored/cached data — it does NOT call the Gemini edge
  // function. That only happens from `handleRefreshEfficiency()` once a
  // button triggers it.
  //
  // `.maybeSingle()` (not `.single()`) because a brand-new user won't
  // have a row yet, and that's a valid "nothing to show" state, not an
  // error.
  // ============================================================
  async function fetchStoredEfficiency(userId) {
    setEfficiencyLoading(true)

    const { data, error } = await supabase
      .from('energy_ai_suggestions')
      .select('label, comparison, tone, summary, updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to load stored efficiency suggestion:', error)
      setEfficiency(null)
    } else if (data) {
      setEfficiency({
        rating: data.label,
        percentVsAverage: data.comparison,
        tone: data.tone,
        reasoning: data.summary,
        updatedAt: data.updated_at,
      })
    } else {
      setEfficiency(null) // no suggestion generated yet for this user
    }

    setEfficiencyLoading(false)
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
  //   7. energy_ai_suggestions (select) -> last-saved AI efficiency read
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
    // Only need full_name (for the header greeting) and provider_id (to
    // look up the provider's display name next). `.single()` is safe here
    // because `profiles.id` is the PK and is 1:1 with auth.users.id.
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

    // --- FETCH STORED AI EFFICIENCY SUGGESTION ---
    // Read-only load of whatever was last generated & saved. No Gemini
    // call happens here.
    fetchStoredEfficiency(user.id)
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

  // ============================================================
  // TODO: WIRE UP TO A "Refresh AI Suggestion" BUTTON LATER
  // ------------------------------------------------------------
  // Currently disconnected on purpose — nothing calls this yet. Once a
  // button exists (e.g. next to the "ENERGY EFFICIENCY" summary card),
  // just call handleRefreshEfficiency from its onClick and uncomment
  // this block.
  //
  // What it does when wired up:
  //   1. Calls the Gemini-powered `energy-efficiency` edge function
  //      directly (the same call the old `energyEfficiency` hook made
  //      internally under the hood)
  //   2. Upserts the result into `energy_ai_suggestions`, keyed by
  //      user_id, so it's persisted and doesn't need regenerating on
  //      every page load
  //   3. Updates local `efficiency` state immediately so the UI reflects
  //      the new suggestion without needing a re-fetch
  //
  // NOTE: `.upsert(..., { onConflict: 'user_id' })` requires a UNIQUE
  // constraint on `energy_ai_suggestions.user_id` in Supabase — add one
  // if it doesn't already exist, or every click will just insert a new
  // row instead of replacing the old one.
  //
  // async function handleRefreshEfficiency() {
  //   const { data: { user } } = await supabase.auth.getUser()
  //   if (!user) return
  //
  //   setEfficiencyLoading(true)
  //
  //   const { data: result, error: fnError } = await supabase.functions.invoke(
  //     'energy-efficiency',
  //     { body: { appliances: userAppliances, householdType: profile?.household_type } }
  //   )
  //
  //   if (fnError) {
  //     console.error('Failed to generate efficiency suggestion:', fnError)
  //     setEfficiencyLoading(false)
  //     return
  //   }
  //
  //   // Derive a simple tone tag once, at generation time, so the JSX
  //   // below never has to recompute it from percentVsAverage.
  //   const tone = result.percentVsAverage <= 0 ? 'positive' : 'warning'
  //
  //   const { error: upsertError } = await supabase
  //     .from('energy_ai_suggestions')
  //     .upsert(
  //       {
  //         user_id: user.id,
  //         label: result.rating,
  //         comparison: result.percentVsAverage,
  //         tone,
  //         summary: result.reasoning,
  //         updated_at: new Date().toISOString(),
  //       },
  //       { onConflict: 'user_id' }
  //     )
  //
  //   if (upsertError) {
  //     console.error('Failed to save efficiency suggestion:', upsertError)
  //   }
  //
  //   setEfficiency({
  //     rating: result.rating,
  //     percentVsAverage: result.percentVsAverage,
  //     tone,
  //     reasoning: result.reasoning,
  //     updatedAt: new Date().toISOString(),
  //   })
  //   setEfficiencyLoading(false)
  // }
  // ============================================================

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
  // at the cost of a few extra round-trips.
  function handleApplianceAdded() {
    loadAppliancePageData()
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
          <h1 className="text-3xl font-extrabold text-gray-900">Appliance Management</h1>
          <p className="text-gray-500 mt-1">
            Manage and track the energy consumption of your individual devices.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* TODO: static placeholder avatar (pravatar.cc), not the real
              user's photo — same as Dashboard.jsx. Hook up real avatar
              storage later. */}
          <img
            src="https://i.pravatar.cc/40?img=12"
            alt="User avatar"
            className="w-10 h-10 rounded-full object-cover"
          />
          <div>
            <div className="font-semibold text-gray-900 text-sm">{displayName}</div>
            <div className="text-primary text-xs font-medium">{providerName}</div>
          </div>
        </div>
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
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
          />
        </div>

        <div className="relative">
          {/* Category filter — options come from the RPC-backed
              `categories` state fetched above, so it's driven by the DB,
              not hardcoded. */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="appearance-none pl-4 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 focus:ring-2 focus:ring-primary/30 outline-none cursor-pointer"
          >
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:bg-blue-700 transition"
        >
          <Plus size={18} />
          Add Appliance
        </button>
      </div>

      {/* Table */}
      <div className="border border-gray-100 rounded-card overflow-hidden shadow-sm">
        {filteredUserAppliances.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-left font-semibold text-gray-500">Appliance</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500">Category</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500">Wattage</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500">Hours / Day</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500">Monthly Use</th>
                <th className="px-6 py-4 text-left font-semibold text-gray-500">Monthly Cost</th>
                <th className="px-6 py-4 text-right font-semibold text-gray-500">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filteredUserAppliances.map((appliance) => {
                const wattage = Number(appliance.wattage || 0)
                const hoursPerDay = Number(appliance.hours_per_day || 0)
                const monthlyKwh = ((wattage * hoursPerDay * 30) / 1000).toFixed(1)

                return (
                  <tr key={appliance.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">
                        {appliance.name || appliance.model_name || 'Unnamed Appliance'}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {(() => {
                        const style = getCategoryStyle(appliance.category)
                        const Icon = style.icon
                        return (
                          <div className="flex items-center gap-2 text-gray-700">
                            <Icon size={16} className={style.iconColor} />
                            <span className="font-semibold">{appliance.category || 'Uncategorized'}</span>
                          </div>
                        )
                      })()}
                    </td>

                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {wattage.toLocaleString()} W
                    </td>

                    <td className="px-6 py-4 text-gray-600">
                      {hoursPerDay} hrs
                    </td>

                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {monthlyKwh} kWh
                    </td>

                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {ratePerKwh
                        ? `₱${calculateMonthlyCost(appliance, ratePerKwh).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                        : rateLoading ? '…' : 'N/A'}
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50">
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteAppliance(appliance.id)}
                          className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-danger hover:bg-red-50"
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
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <Plug size={24} className="text-gray-300" />
            </div>

            <p className="font-semibold text-gray-900 mb-1">
              {userAppliances.length === 0 ? 'No appliances yet' : 'No matching appliances'}
            </p>

            <p className="text-sm text-gray-500 max-w-xs mb-5">
              {userAppliances.length === 0
                ? 'Add your first appliance to start tracking your electricity usage.'
                : 'Try a different search term or category.'}
            </p>

            {userAppliances.length === 0 && (
              <button
                onClick={() => setIsModalOpen(true)}
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
        <p className="text-sm text-gray-500">
          Showing <span className="font-semibold text-gray-900">{filteredUserAppliances.length}</span> of{' '}
          <span className="font-semibold text-gray-900">{userAppliances.length}</span> appliances
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
              {totalWattage.toLocaleString()} <span className="text-sm font-medium text-gray-500">TOTAL WATTS</span>
            </div>
          </div>
        </div>

        {/* ENERGY EFFICIENCY — now reads from local `efficiency` state,
            which is populated by fetchStoredEfficiency() (a read of
            `energy_ai_suggestions`), NOT a live Gemini call. It will stay
            exactly as-is until a "Refresh" button (not built yet) calls
            handleRefreshEfficiency() above.
            TODO: add that button here once ready — e.g. a small refresh
            icon next to the label that calls handleRefreshEfficiency. */}
        <div>
          <div className="text-xs text-gray-500 font-medium tracking-wide">ENERGY EFFICIENCY</div>
          <div className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
            {efficiencyLoading ? 'Loading…' : efficiency?.rating || 'N/A'}
            {efficiency && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  efficiency.tone === 'positive'
                    ? 'text-success bg-green-50'
                    : 'text-warning bg-orange-50'
                }`}
              >
                {efficiency.percentVsAverage > 0 ? '+' : ''}
                {efficiency.percentVsAverage}% vs Avg
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <TriangleAlert size={18} className="text-warning" />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium tracking-wide">EST. MONTHLY COST</div>
            <div className="text-lg font-extrabold text-gray-900">
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
        onClose={() => setIsModalOpen(false)}
        categories={categories.filter((c) => c !== 'ALL CATEGORIES')}
        applianceChoices={appliances}
        onApplianceAdded={handleApplianceAdded}
      />

      {/* --- CUSTOM DELETE CONFIRMATION BANNER --- */}
      {/* Renders only when pendingDeleteId is set (i.e. the user clicked a
          trash icon). Replaces window.confirm with a styled in-app modal.
          "Cancel" just clears pendingDeleteId with no DB call. "Confirm
          Delete" runs confirmDelete(), which deletes from Supabase and
          removes the row from local state directly — no re-fetch needed. */}
      {pendingDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-danger" />
              </div>
              <h3 className="font-bold text-gray-900 text-lg">Delete appliance?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently remove this appliance from your list. This action can't be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
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
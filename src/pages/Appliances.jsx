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
  const[userAppliances, setUserAppliances] = useState([]) // <-- added state for user's own appliances
  // ============================================================
  // Central data-loading function for this page. Pulled out of useEffect
  // so it can be re-run on demand — specifically after the Add Appliance
  // modal successfully inserts a new row (see handleApplianceAdded below),
  // not just once when the page first mounts.
  //
  // Fires four separate Supabase calls, in this order:
  //   1. auth.getUser()              -> confirm session, else redirect
  //   2. appliance_choices  (select) -> shared catalog for dropdown/table
  //   3. profiles           (select) -> current user's name + provider_id
  //   4. providers          (select) -> human-readable provider name
  //   5. rpc get_appliance_categories -> distinct category list for filters
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
      .select('full_name, provider_id')
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
                  <button className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-danger hover:bg-red-50">
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
      {/* ⚠️ ENERGY EFFICIENCY IS A HARDCODED PLACEHOLDER — compute an actual 
          efficiency comparison and usage-vs-target check server-side or client-side. */}
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
    </div>
  )
}
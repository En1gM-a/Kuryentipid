import { useState, useEffect } from 'react'
import {
  Search, ChevronDown, Plus, Pencil, Trash2,
  Snowflake, Refrigerator, Lightbulb, Tv, Fan,
  Zap, Leaf, TriangleAlert, Plug
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'


const APPLIANCES = []

export default function Appliances() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All Categories')
  const [categories, setCategories] = useState(['All Categories'])
  const [profile, setProfile] = useState(null)
  const [providerName, setProviderName] = useState('')

  useEffect(() => {
    async function loadAppliancePageData() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

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

      // Provider name now comes from the `providers` table instead of the
      // old hardcoded PROVIDERS array in Login.jsx (which no longer exists).
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

      const { data: categoryData, error: categoryError } = await supabase
        .rpc('get_appliance_categories')

      if (categoryError) {
        console.error('Failed to load categories:', categoryError)
        return
      }

      setCategories(['All Categories', ...categoryData.map((row) => row.value)])
    }

    loadAppliancePageData()
  }, [])

  const displayName = profile?.full_name || '....'

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
            <div className="font-semibold text-gray-900 text-sm">{displayName}</div>
            <div className="text-primary text-xs font-medium">{providerName}</div>
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
            {categories.map((c) => <option key={c}>{c}</option>)}
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
        {filtered.length > 0 ? (
          <table className="w-full text-sm">
            {/* ...unchanged thead/tbody... */}
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <Plug size={24} className="text-gray-300" />
            </div>
            <p className="font-semibold text-gray-900 mb-1">
              {APPLIANCES.length === 0 ? 'No appliances yet' : 'No matching appliances'}
            </p>
            <p className="text-sm text-gray-500 max-w-xs mb-5">
              {APPLIANCES.length === 0
                ? 'Add your first appliance to start tracking your electricity usage.'
                : 'Try a different search term or category.'}
            </p>
            {APPLIANCES.length === 0 && (
              <button className="flex items-center gap-2 bg-primary text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:bg-blue-700 transition">
                <Plus size={18} />
                Add Appliance
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-5">
        <p className="text-sm text-gray-500">
          Showing <span className="font-semibold text-gray-900">{filtered.length}</span> of{' '}
          <span className="font-semibold text-gray-900">{APPLIANCES.length}</span> appliances
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
import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// `categories` should be the same list already fetched in Appliances.jsx
// via supabase.rpc('get_appliance_categories') — pass it in as a prop so
// this dropdown always matches the filter dropdown on the main page.
export default function AddApplianceModal({ isOpen, onClose, categories, onApplianceAdded }) {
  const [form, setForm] = useState({
    category: '',
    name: '',
    watts: '',
    quantity: 1,
    hoursPerDay: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    // BACKEND
    // replace with real insert into the `appliances` table like:
    //
    //   const { data: { user } } = await supabase.auth.getUser()
    //   const { error } = await supabase.from('appliances').insert({
    //     user_id: user.id,
    //     category: form.category,
    //     name: form.name,
    //     watts: Number(form.watts),
    //     quantity: Number(form.quantity),
    //     hours_per_day: Number(form.hoursPerDay),
    //   })
    //
    // - `category` is a plain text value right now (from the same
    //   get_appliance_categories() RPC used on the main Appliances page).
    //   if categories become their own table with IDs later, swap this
    //   for a category_id foreign key instead, same as provider_id/region_id
    //   in profiles.
    // - this modal is manual-entry rn. should add
    //   a searchable "pick from known appliances" flow like meralco's
    //   calculator once we have a real appliances reference table
    //   with pre-filled wattages
    // - after a successful insert, call onApplianceAdded() so the parent
    //   page can refetch the list instead of relying on a manual refresh.

    console.log('New appliance (placeholder, not yet saved to Supabase):', form)

    setSaving(false)
    onApplianceAdded?.(form)
    onClose()
    setForm({ category: '', name: '', watts: '', quantity: 1, hoursPerDay: '' })
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-card shadow-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-gray-900">Add Appliance</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Category
            </label>
            <select
              required
              value={form.category}
              onChange={update('category')}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
            >
              <option value="" disabled>Select a category</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Appliance Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Air Conditioner"
              value={form.name}
              onChange={update('name')}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Wattage (W)
              </label>
              <input
                type="number"
                required
                min="1"
                placeholder="1200"
                value={form.watts}
                onChange={update('watts')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Quantity
              </label>
              <input
                type="number"
                required
                min="1"
                value={form.quantity}
                onChange={update('quantity')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Usage (hours/day)
            </label>
            <input
              type="number"
              required
              min="0"
              max="24"
              step="0.5"
              placeholder="8"
              value={form.hoursPerDay}
              onChange={update('hoursPerDay')}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold shadow-sm hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Add Appliance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
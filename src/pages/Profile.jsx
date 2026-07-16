import { useState, useEffect } from 'react'
import { User, Mail, Check } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { REGIONS, HOUSEHOLD_TYPES } from './Login'

export default function Profile() {
  const [userId, setUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')

  const [providers, setProviders] = useState([])

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    providerId: '',
    region: '',
    householdType: HOUSEHOLD_TYPES[0],
  })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      setUserId(user.id)

      const { data: providerData } = await supabase
        .from('providers')
        .select('id, name')
        .order('name')
      setProviders(providerData || [])

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, user_email, provider_id, region_id, household_type')
        .eq('id', user.id)
        .single()

      if (profileError) {
        console.error('Failed to load profile:', profileError)
      } else if (profileData) {
        setForm({
          fullName: profileData.full_name || '',
          email: profileData.user_email || user.email || '',
          providerId: profileData.provider_id || '',
          region: profileData.region_id || '',
          householdType: profileData.household_type || HOUSEHOLD_TYPES[0],
        })
      }

      setLoading(false)
    }

    load()
  }, [])

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
    setSaveSuccess(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaveSuccess(false)

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        full_name: form.fullName,
        provider_id: form.providerId,
        region_id: form.region,
        household_type: form.householdType,
      })
      .eq('id', userId)

    setSaving(false)

    if (updateError) {
      console.error('Failed to update profile:', updateError)
      setError('Something went wrong saving your changes. Please try again.')
      return
    }

    setSaveSuccess(true)
  }

  if (loading) {
    return (
      <div className="px-8 py-10 max-w-3xl mx-auto">
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading your profile…</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">Profile</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          View and update your account details.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm space-y-5"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Full Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              required
              value={form.fullName}
              onChange={update('fullName')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="email"
              value={form.email}
              disabled
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-500 cursor-not-allowed"
            />
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            Email can't be changed here yet.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Electricity Provider
          </label>
          <select
            value={form.providerId}
            onChange={update('providerId')}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 outline-none"
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Region / City
          </label>
          <select
            value={form.region}
            onChange={update('region')}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 outline-none"
          >
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Household Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            {HOUSEHOLD_TYPES.map((h) => (
              <button
                type="button"
                key={h}
                onClick={() => setForm((f) => ({ ...f, householdType: h }))}
                className={`py-3 rounded-xl border text-sm font-medium transition ${
                  form.householdType === h
                    ? 'border-primary text-primary bg-blue-50 dark:bg-blue-500/10'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-white font-semibold px-6 py-2.5 rounded-xl shadow-sm hover:bg-blue-700 transition disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-sm text-success font-medium">
              <Check size={16} /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
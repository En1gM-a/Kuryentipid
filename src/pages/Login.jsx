import { useState, useEffect } from 'react'
import { Zap, Mail, Lock, Eye, EyeOff, ChevronDown, User } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Must match the `regions` table exactly (id + name)
export const REGIONS = [
  { id: 1,  name: 'National Capital Region' },
  { id: 2,  name: 'Cordillera Administrative Region' },
  { id: 3,  name: 'Ilocos Region' },
  { id: 4,  name: 'Cagayan Valley' },
  { id: 5,  name: 'Central Luzon' },
  { id: 6,  name: 'Calabarzon' },
  { id: 7,  name: 'Mimaropa' },
  { id: 8,  name: 'Bicol Region' },
  { id: 9,  name: 'Western Visayas' },
  { id: 10, name: 'Central Visayas' },
  { id: 11, name: 'Eastern Visayas' },
  { id: 12, name: 'Zamboanga Peninsula' },
  { id: 13, name: 'Northern Mindanao' },
  { id: 14, name: 'Davao Region' },
  { id: 15, name: 'Soccsksargen' },
  { id: 16, name: 'Caraga' },
  { id: 17, name: 'Bangsamoro Autonomous Region in Muslim Mindanao' },
];

// Frontend-only, never touches the database — no ids needed unless you want them
export const HOUSEHOLD_TYPES = [
  'Studio / 1BR',
  '2 Bedroom',
  '3 Bedroom+',
  'Bungalow/House',
];

export default function Login() {
  const [mode, setMode] = useState('signin') // 'signin' | 'register'
  const [step, setStep] = useState('credentials') // 'credentials' | 'onboarding'
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Providers now come from the database instead of a hardcoded array
  const [providers, setProviders] = useState([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [providersError, setProvidersError] = useState('')

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    remember: false,
    providerId: '',
    region: REGIONS[0],
    householdType: HOUSEHOLD_TYPES[0],
  })

  // Fetch providers once we reach onboarding (or eagerly on mount — either works,
  // this fetches on mount so the dropdown is ready by the time the user gets there)
  useEffect(() => {
    let cancelled = false

    async function loadProviders() {
      setProvidersLoading(true)
      setProvidersError('')
      const { data, error } = await supabase
        .from('providers')
        .select('id, name')
        .order('name')

      if (cancelled) return

      if (error) {
        setProvidersError('Could not load providers. Please try again.')
        console.error('Failed to load providers:', error)
      } else {
        setProviders(data || [])
        // Default the form to the first provider once loaded
        if (data && data.length > 0) {
          setForm((f) => (f.providerId ? f : { ...f, providerId: data[0].id }))
        }
      }
      setProvidersLoading(false)
    }

    loadProviders()
    return () => { cancelled = true }
  }, [])

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })
    setLoading(false)
    if (error) setError(error.message)
    else window.location.href = '/dashboard'
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.fullName },
      },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep('onboarding')
  }

  async function handleCompleteOnboarding(e) {
    e.preventDefault()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Only provider_id is stored — never the provider name — so rate lookups
      // and any future provider renames stay consistent.
      const { data, error } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: form.fullName,
        provider_id: form.providerId,
        region_id: form.region,
        household_type: form.householdType,
        user_email: form.email,
      })
      if (error) console.error('Upsert result error:', error)
    }
    setLoading(false)
    window.location.href = '/dashboard'
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-50 to-blue-100 flex-col justify-center items-center px-16 relative">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="text-white" size={22} fill="white" />
            </div>
            <span className="text-2xl font-extrabold text-gray-900">Kuryentipid</span>
          </div>

          <div className="bg-white rounded-card shadow-lg p-8 mb-8 flex justify-center">
            <div className="text-7xl">🏠</div>
          </div>

          <h2 className="text-3xl font-extrabold text-gray-900 mb-3">
            Master your energy costs
          </h2>
          <p className="text-gray-500 mb-8">
            Join thousands of Filipinos saving on their electricity bills with
            smart analytics and real-time rate tracking.
          </p>

          <div className="bg-white/70 rounded-card p-5 flex justify-around text-center shadow-sm">
            <div>
              <div className="text-xl font-bold text-primary">10k+</div>
              <div className="text-xs text-gray-500 tracking-wide">USERS</div>
            </div>
            <div className="border-l border-gray-200" />
            <div>
              <div className="text-xl font-bold text-primary">12%</div>
              <div className="text-xs text-gray-500 tracking-wide">AVG SAVINGS</div>
            </div>
            <div className="border-l border-gray-200" />
            <div>
              <div className="text-xl font-bold text-primary">4.9/5</div>
              <div className="text-xs text-gray-500 tracking-wide">RATING</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 h-full overflow-y-auto flex flex-col justify-center items-center px-6 py-12 bg-white">
        <div className="w-full max-w-md">

          {step === 'credentials' && (
            <>
              <h1 className="text-3xl font-extrabold text-gray-900 mb-1">
                {mode === 'signin' ? 'Welcome Back' : 'Create your account'}
              </h1>
              <p className="text-gray-500 mb-8">
                {mode === 'signin'
                  ? 'Start managing your consumption today.'
                  : 'Start estimating your electricity bill in minutes.'}
              </p>

              {/* Tabs */}
              <div className="flex border-b border-gray-200 mb-8">
                <button
                  onClick={() => setMode('signin')}
                  className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition ${
                    mode === 'signin'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-400'
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setMode('register')}
                  className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition ${
                    mode === 'register'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-400'
                  }`}
                >
                  Register
                </button>
              </div>

              <form onSubmit={mode === 'signin' ? handleSignIn : handleRegister} className="space-y-5">
                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type="text"
                        required
                        placeholder="Juan Dela Cruz"
                        value={form.fullName}
                        onChange={update('fullName')}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      required
                      placeholder="juan.delacruz@gmail.com"
                      value={form.email}
                      onChange={update('email')}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    {mode === 'signin' && (
                      <a href="#" className="text-sm font-medium text-primary hover:underline">
                        Forgot password?
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={form.password}
                      onChange={update('password')}
                      className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={form.confirmPassword}
                        onChange={update('confirmPassword')}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition"
                      />
                    </div>
                  </div>
                )}

                {mode === 'signin' && (
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={form.remember}
                      onChange={update('remember')}
                      className="rounded border-gray-300 text-primary focus:ring-primary/30"
                    />
                    Remember me for 30 days
                  </label>
                )}

                {error && (
                  <p className="text-sm text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-primary text-white font-semibold shadow-sm hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </form>
            </>
          )}

          {step === 'onboarding' && (
            <>
              <h1 className="text-2xl font-extrabold text-gray-900 mb-1 text-center">
                Registration & Onboarding
              </h1>
              <p className="text-gray-500 mb-8 text-center">
                Tell us about your household for accurate estimates.
              </p>

              <form onSubmit={handleCompleteOnboarding} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Electricity Provider
                  </label>
                  <div className="relative">
                    <select
                      value={form.providerId}
                      onChange={update('providerId')}
                      disabled={providersLoading || providers.length === 0}
                      className="w-full appearance-none px-4 pr-10 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 outline-none disabled:opacity-60"
                    >
                      {providersLoading && <option value="">Loading providers…</option>}
                      {!providersLoading && providers.length === 0 && (
                        <option value="">No providers available</option>
                      )}
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                  </div>
                  {providersError && (
                    <p className="text-sm text-danger mt-1.5">{providersError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Region / City
                  </label>
                  <div className="relative">
                    <select
                      value={form.region}
                      onChange={update('region')}
                      className="w-full appearance-none px-4 pr-10 py-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary/30 outline-none"
                    >
                      {REGIONS.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                            ? 'border-primary text-primary bg-blue-50'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !form.providerId}
                  className="w-full py-3 rounded-xl bg-primary text-white font-semibold shadow-sm hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {loading ? 'Saving…' : 'Complete Registration'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
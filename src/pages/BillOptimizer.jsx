import { useState, useEffect, useMemo } from 'react'
import { SlidersHorizontal, RotateCcw, Check } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell,
} from 'recharts'
import { supabase } from '../lib/supabaseClient'
import { getCategoryStyle } from '../lib/applianceStyles' // maps category -> icon + colors for UI badges
import { calculateMonthlyCost } from '../lib/calculations' // shared cost formula, reused for both current + projected bill
import { useElectricityRate } from '../hooks/useElectricityRate' // custom hook, fetches ₱/kWh rate for a given provider_id
import { Sparkles, Check as CheckIcon } from 'lucide-react'
import { useBillRecommendations } from '../hooks/useBillRecommendations'

const MIN_APPLIANCES_FOR_AI = 3

export default function BillOptimizer() {
  // Logged-in user's profile row (need provider_id to know which rate to use)
  const [profile, setProfile] = useState(null)
  // Human-readable provider name (e.g. "Meralco"), fetched separately since profiles only stores provider_id
  const [providerName, setProviderName] = useState('')
  // All appliances belonging to this user, pulled straight from the appliances table
  const [appliances, setAppliances] = useState([])
  // Local-only "what if" hours per appliance, keyed by appliance id — NOT saved to DB until Save Configuration is implemented
  const [simulatedHours, setSimulatedHours] = useState({}) // { [applianceId]: hours }
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)
  // Custom hook: looks up the ₱/kWh rate once we know the user's provider_id
  const { rate: ratePerKwh, loading: rateLoading } = useElectricityRate(profile?.provider_id)
  const {
    recommendations,
    loading: recsLoading,
    error: recsError,
    remaining: recsRemaining,
    dailyLimit,
    generate: generateRecommendations,
  } = useBillRecommendations(appliances, ratePerKwh)
  const [acceptedRecIds, setAcceptedRecIds] = useState(new Set())

  useEffect(() => {
    async function load() {
      // Step 1: confirm someone is actually logged in before fetching anything
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      // Step 2: get this user's profile (need provider_id + full_name)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, provider_id')
        .eq('id', user.id)
        .single()
      setProfile(profileData)

      // Step 3: convert provider_id -> readable provider name via a second query
      // (this is a separate lookup because provider names live in their own table, not hardcoded here)
      if (profileData?.provider_id) {
        const { data: providerData } = await supabase
          .from('providers')
          .select('name')
          .eq('id', profileData.provider_id)
          .single()
        setProviderName(providerData?.name || 'Unknown Provider')
      }

      // Step 4: fetch every appliance owned by this user (RLS ensures only their own rows come back)
      const { data: applianceData, error } = await supabase
        .from('appliances')
        .select('*')
        .eq('user_id', user.id)

      if (error) {
        console.error('Failed to load appliances:', error)
      } else {
        setAppliances(applianceData || [])
        // Seed the slider state from each appliance's saved hours/day.
        const initialHours = {}
        ;(applianceData || []).forEach((a) => {
          initialHours[a.id] = Number(a.hours_per_day ?? 0)
        })
        setSimulatedHours(initialHours)
      }

      setLoading(false)
    }

    load()
  }, []) // empty array = run once on mount only

  // Fallback text while profile is still loading or missing
  const displayName = profile?.full_name || '....'

  // Recalculates only when appliances or ratePerKwh change — avoids recomputing on every render
  const currentBill = useMemo(
    () => ratePerKwh
        ? appliances.reduce((sum, a) => sum + calculateMonthlyCost(a, ratePerKwh), 0)
        : 0,
    [appliances, ratePerKwh]
    )

  // Same as currentBill, but uses the user's simulated (slider-adjusted) hours instead of the saved hours_per_day
  const projectedBill = useMemo(
    () => ratePerKwh
        ? appliances.reduce(
            (sum, a) => sum + calculateMonthlyCost(a, ratePerKwh, simulatedHours[a.id]),
            0
        )
        : 0,
    [appliances, simulatedHours, ratePerKwh]
    )

  // Positive = saving money, negative = simulated usage actually costs more than current
  const savings = currentBill - projectedBill
  // Guard against divide-by-zero if currentBill is 0 (e.g. no appliances yet)
  const percentReduction = currentBill > 0 ? (savings / currentBill) * 100 : 0

  // Updates only the local simulated state — does NOT touch the database
  function handleSliderChange(applianceId, value) {
    setSimulatedHours((prev) => ({ ...prev, [applianceId]: Number(value) }))
  }

  function handleAcceptRecommendation(rec, index) {
    if (rec.appliance_id && rec.suggested_hours_per_day != null) {
      handleSliderChange(rec.appliance_id, rec.suggested_hours_per_day)
    }
    setAcceptedRecIds((prev) => new Set(prev).add(index))
  }

  // Reverts all sliders back to each appliance's actual saved hours_per_day
  function handleReset() {
    const resetHours = {}
    appliances.forEach((a) => {
      resetHours[a.id] = Number(a.hours_per_day ?? 0)
    })
    setSimulatedHours(resetHours)
  }

  async function handleSaveConfiguration() {
  setSaving(true)

  try {
    const updates = appliances.map((a) =>
      supabase
        .from('appliances')
        .update({ hours_per_day: simulatedHours[a.id] })
        .eq('id', a.id)
    )

    const results = await Promise.all(updates)

    const failed = results.filter((r) => r.error)
    if (failed.length > 0) {
      console.error('Some appliances failed to save:', failed.map((f) => f.error))
      setSaveError('Some changes could not be saved. Please try again.')
    } else {
      // Keep local `appliances` state in sync with what's now in the DB,
      // so currentBill (which reads a.hours_per_day) reflects the save
      // immediately instead of only updating after a full page refresh.
      setAppliances((prev) =>
        prev.map((a) => ({ ...a, hours_per_day: simulatedHours[a.id] }))
      )
      setSaveError('')
    }
  } catch (err) {
    console.error('Failed to save configuration:', err)
    setSaveError('Something went wrong. Please try again.')
  } finally {
    setSaving(false)
  }
}

  // Feeds the two-bar comparison chart (Current vs Projected)
  const chartData = [
    { label: 'Current', value: currentBill },
    { label: 'Projected', value: projectedBill },
  ]

  const dataReady = !loading && !rateLoading && appliances.length >= MIN_APPLIANCES_FOR_AI && ratePerKwh

  return (
    <div className="px-8 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Bill Optimizer</h1>
          <p className="text-gray-500 mt-1">
            Simulate changes to your appliance usage and see real-time impact on your bill.
          </p>
        </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
            {/* Placeholder avatar — not tied to any real user upload yet */}
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
      </div>

      {/* Three-way conditional render: loading -> empty state -> missing rate -> actual content */}
      {loading || rateLoading ? (
        <p className="text-gray-400 text-sm">Loading your appliances…</p>
        ) : appliances.length === 0 ? (
        // User hasn't added any appliances yet — nothing to optimize
        <div className="border border-gray-100 rounded-card p-16 text-center shadow-sm">
            <p className="font-semibold text-gray-900 mb-1">No appliances to optimize yet</p>
            <p className="text-sm text-gray-500">
            Add appliances first from the Appliances page, then come back here to simulate changes.
            </p>
        </div>
        ) : !ratePerKwh ? (
        // Rate lookup failed or provider has no matching rate — can't calculate costs without it
        <div className="border border-gray-100 rounded-card p-16 text-center shadow-sm">
            <p className="font-semibold text-gray-900 mb-1">No electricity rate found</p>
            <p className="text-sm text-gray-500">
            We couldn't find a rate for your selected provider. Please check your Profile settings.
            </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Adjust Daily Usage */}
          <div className="col-span-2 border border-gray-100 rounded-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-gray-400" />
                <h2 className="text-lg font-bold text-gray-900">Adjust Daily Usage</h2>
              </div>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              >
                <RotateCcw size={14} />
                Reset to Default
              </button>
            </div>

            {/* One row + slider per appliance, each independently adjustable */}
            <div className="flex flex-col divide-y divide-gray-100">
              {appliances.map((a) => {
                // Look up icon/colors for this appliance's category (COOLING, KITCHEN, etc.)
                const style = getCategoryStyle(a.category)
                const Icon = style.icon
                // Current slider value for this specific appliance, falling back to 0 if unset
                const hours = simulatedHours[a.id] ?? 0

                return (
                  <div key={a.id} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${style.badgeBg}`}>
                          <Icon size={18} className={style.iconColor} />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">
                            {a.name || 'Unnamed Appliance'}
                          </p>
                          <p className="text-xs text-gray-400">
                            {a.category} • Qty {a.quantity ?? 1}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-extrabold text-gray-900">
                          {hours.toFixed(1)}
                        </span>
                        <span className="text-sm text-gray-400 ml-1">hrs/day</span>
                      </div>
                    </div>

                    {/* Range slider drives handleSliderChange on every drag — updates local state only */}
                    <input
                      type="range"
                      min="0"
                      max="24"
                      step="0.5"
                      value={hours}
                      onChange={(e) => handleSliderChange(a.id, e.target.value)}
                      className="w-full accent-primary cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0h</span>
                      <span>12h</span>
                      <span>24h</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Results sidebar */}
          <div className="flex flex-col gap-6">
            <div className="bg-gray-900 rounded-card p-6 text-white">
              <p className="text-xs font-semibold text-gray-400 tracking-wide mb-4">
                OPTIMIZATION RESULTS
              </p>

              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-300">Current Bill</span>
                <span className="font-bold">
                  ₱{currentBill.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-700">
                <span className="text-sm text-gray-300">Projected Bill</span>
                <span className="font-bold text-primary">
                  ₱{projectedBill.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <p className="text-xs font-semibold text-gray-400 tracking-wide mb-1">
                ESTIMATED MONTHLY SAVINGS
              </p>
              {/* Color and sign flip depending on whether savings is positive or negative */}
              <p className={`text-3xl font-extrabold mb-2 ${savings >= 0 ? 'text-success' : 'text-danger'}`}>
                ₱{Math.abs(savings).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span className="text-sm font-medium text-gray-400"> / mo</span>
              </p>
              <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full mb-6 ${
                savings >= 0 ? 'text-success bg-green-500/10' : 'text-danger bg-red-500/10'
              }`}>
                {percentReduction >= 0 ? '' : '+'}{Math.abs(percentReduction).toFixed(1)}%{' '}
                {savings >= 0 ? 'Cost Reduction' : 'Cost Increase'}
              </span>

              {/* Currently just logs to console — see BACKEND TODO above handleSaveConfiguration */}
              <button
              onClick={handleSaveConfiguration}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Configuration'}
              <Check size={18} />
            </button>

            {saveError && (
              <p className="text-xs text-danger mt-2">{saveError}</p>
            )}
            </div>

            {/* Simple 2-bar comparison: Current vs Projected bill */}
            <div className="border border-gray-100 rounded-card p-6 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-4">Bill Impact Breakdown</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {/* Cell order must match chartData order: [0]=Current (gray), [1]=Projected (blue) */}
                    <Cell fill="#E5E7EB" />
                    <Cell fill="#2563EB" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-xs text-gray-400 mt-2">
                Based on current kWh rates and simulated usage patterns.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Smart AI Recommendations */}
      {!loading && !rateLoading && ratePerKwh && appliances.length > 0 && appliances.length < MIN_APPLIANCES_FOR_AI && (
      <div className="border border-gray-100 rounded-card p-6 shadow-sm mt-6 text-center">
        <Sparkles size={20} className="text-gray-300 mx-auto mb-2" />
        <p className="font-semibold text-gray-900 mb-1">Add a few more appliances</p>
        <p className="text-sm text-gray-500">
          Track at least {MIN_APPLIANCES_FOR_AI} appliances to unlock personalized AI recommendations
          ({MIN_APPLIANCES_FOR_AI - appliances.length} more to go).
        </p>
      </div>
      )}
      {dataReady && (
        <div className="border border-gray-100 rounded-card p-6 shadow-sm mt-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <h2 className="text-lg font-bold text-gray-900">Smart AI Recommendations</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {recsRemaining} of {dailyLimit} left today (Resets at midnight PH time)
              </span>
              <button
                onClick={generateRecommendations}
                disabled={recsLoading || recsRemaining === 0}
                className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recsLoading ? 'Thinking…' : 'Get AI Recommendations'}
              </button>
            </div>
          </div>

          {recsError && (
            <p className="text-sm text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
              {recsError.message || 'Something went wrong getting recommendations.'}
            </p>
          )}

          {recommendations.length === 0 && !recsLoading && !recsError && (
            <p className="text-sm text-gray-400">
              Click "Get AI Recommendations" for personalized ways to lower your bill.
            </p>
          )}

          <div className="grid grid-cols-3 gap-5">
            {recommendations.map((rec, index) => {
              const isAccepted = acceptedRecIds.has(index)
              return (
                <div key={index} className="border border-gray-100 rounded-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-success bg-green-50 px-2.5 py-1 rounded-full uppercase">
                      {rec.difficulty}
                    </span>
                  </div>
                  <p className="font-bold text-gray-900 mb-1">{rec.title}</p>
                  <p className="text-sm text-gray-500 mb-4">{rec.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-success font-bold">
                      ₱{Number(rec.estimated_monthly_savings).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      <span className="text-xs text-gray-400 font-normal">/mo</span>
                    </span>
                    <button
                      onClick={() => handleAcceptRecommendation(rec, index)}
                      disabled={isAccepted}
                      className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl transition ${
                        isAccepted
                          ? 'bg-green-50 text-success cursor-default'
                          : 'bg-primary text-white hover:bg-blue-700'
                      }`}
                    >
                      {isAccepted ? (
                        <>
                          <Check size={14} /> Applied
                        </>
                      ) : (
                        'Accept'
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
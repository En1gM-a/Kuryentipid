// src/hooks/EnergyEfficiency.js
//
// Calls the `energy-efficiency` Supabase Edge Function, which in turn
// calls Gemini server-side (API key never reaches the browser).
//
// Usage:
//   const { efficiency, loading, error } = useEnergyEfficiency(userAppliances, profile?.household_type)
//   efficiency?.rating            -> "Good" | "Excellent" | "Average" | "Needs Improvement" | "Poor"
//   efficiency?.percentVsAverage  -> signed number, e.g. -4 or 8
//   efficiency?.averageKwhEstimate
//   efficiency?.reasoning
//   efficiency?.totalMonthlyKwh

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export function energyEfficiency(userAppliances, householdType) {
  const [efficiency, setEfficiency] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!userAppliances || userAppliances.length === 0) {
      setEfficiency(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    supabase.functions
      .invoke('energy-efficiency', {
        body: { appliances: userAppliances, householdType },
      })
      .then(({ data, error: fnError }) => {
        if (cancelled) return
        if (fnError || data?.error) {
          console.error('energy-efficiency error:', fnError || data?.error)
          setError(fnError || data?.error)
          setEfficiency(null)
        } else {
          setEfficiency(data)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('energy-efficiency invoke failed:', err)
          setError(err)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // Re-run when the appliance list changes length/content or household type changes.
    // JSON.stringify keeps this from re-firing on every render due to array identity changes.
  }, [JSON.stringify(userAppliances), householdType])

  return { efficiency, loading, error }
}
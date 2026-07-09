import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

// Looks up the residential rate (₱/kWh) for a given provider_id from the
// `electricity_rates` table. Returns { rate, loading, error }.
export function useElectricityRate(providerId) {
  const [rate, setRate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!providerId) {
      setLoading(false)
      return
    }

    async function loadRate() {
      setLoading(true)
      const { data, error: fetchError } = await supabase
        .from('electricity_rates')
        .select('residential_rate')
        .eq('provider_id', providerId)
        .single()

      if (fetchError) {
        console.error('Failed to load electricity rate:', fetchError)
        setError(fetchError)
      } else {
        setRate(Number(data?.residential_rate))
      }
      setLoading(false)
    }

    loadRate()
  }, [providerId])

  return { rate, loading, error }
}
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const DAILY_LIMIT = 3

// `usage_date` is a plain `date` column (no time component), and your
// token-reset logic is based on the Philippines calendar day. This builds
// a "YYYY-MM-DD" string in PH time (UTC+8) so we can compare it against
// what's stored in the DB.
function getPhilippineDateString() {
  const now = new Date()
  const phTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return phTime.toISOString().slice(0, 10)
}

export function useBillRecommendations(appliances, ratePerKwh) {
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [remaining, setRemaining] = useState(DAILY_LIMIT)
  // True once the initial DB read (below) has finished — lets the UI tell
  // "we haven't checked yet" apart from "we checked, there's nothing".
  const [initialized, setInitialized] = useState(false)

  // ============================================================
  // On mount: read whatever is already stored in `ai_recommendation_usage`
  // for this user, instead of always starting from a blank local state.
  // This means refreshing the page keeps today's saved recommendations
  // and the correct remaining token count, rather than resetting both.
  // ============================================================
  useEffect(() => {
    async function loadUsage() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setInitialized(true)
        return
      }

      const { data, error: fetchError } = await supabase
        .from('ai_recommendation_usage')
        .select('tokens_used, usage_date, recommendations')
        .eq('user_id', user.id)
        .maybeSingle() // no row yet for a brand-new user is expected, not an error

      if (fetchError) {
        console.error('Failed to load AI recommendation usage:', fetchError)
        setInitialized(true)
        return
      }

      const today = getPhilippineDateString()

      if (data && data.usage_date === today) {
        // Same PH day as their last visit — restore saved recommendations
        // and how many tokens they've already used today.
        setRecommendations(data.recommendations || [])
        setRemaining(Math.max(DAILY_LIMIT - (data.tokens_used || 0), 0))
      } else {
        // Either no row yet, or the stored row is from a previous day —
        // fresh daily allowance, nothing to show until they click Generate.
        setRecommendations([])
        setRemaining(DAILY_LIMIT)
      }

      setInitialized(true)
    }

    loadUsage()
  }, [])

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError({ message: 'You need to be signed in.' })
      setLoading(false)
      return
    }

    // Atomically check + reset(if new PH day) + increment tokens_used,
    // server-side — this is the "minus 1 token" step.
    const { data: tokenRows, error: tokenError } = await supabase.rpc(
      'consume_ai_recommendation_token',
      { p_daily_limit: DAILY_LIMIT }
    )

    if (tokenError) {
      console.error('Token check failed:', tokenError)
      setError(tokenError)
      setLoading(false)
      return
    }

    const { allowed } = tokenRows[0]

    if (!allowed) {
      setError({ message: `You've used all ${DAILY_LIMIT} AI recommendations for today. Try again tomorrow.` })
      // Even when blocked, re-read the row so `remaining` reflects the
      // real DB value rather than trusting local state.
      const { data: blockedRow } = await supabase
        .from('ai_recommendation_usage')
        .select('tokens_used')
        .eq('user_id', user.id)
        .maybeSingle()
      setRemaining(Math.max(DAILY_LIMIT - (blockedRow?.tokens_used || 0), 0))
      setLoading(false)
      return
    }

    const { data, error: fnError } = await supabase.functions.invoke('bill-recommendations', {
      body: { appliances, ratePerKwh },
    })

    if (fnError || data?.error) {
      console.error('bill-recommendations error:', fnError || data?.error)
      setError(fnError || data?.error)
      setLoading(false)
      return
    }

    const newRecommendations = data.recommendations || []

    // Save into the SAME row the token RPC just touched — updates in
    // place (user_id is the primary key), never inserts a new row.
    const { error: saveError } = await supabase
      .from('ai_recommendation_usage')
      .update({ recommendations: newRecommendations, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)

    if (saveError) {
      console.error('Failed to save recommendations:', saveError)
    }

    // ============================================================
    // Re-query the table rather than trusting local/edge-function state.
    // Pulls back what's actually persisted (recommendations + tokens_used)
    // so both the recommendation list and the token counter always reflect
    // the source of truth in Supabase, not just what just happened in memory.
    // ============================================================
    const { data: freshRow, error: refetchError } = await supabase
      .from('ai_recommendation_usage')
      .select('tokens_used, recommendations')
      .eq('user_id', user.id)
      .maybeSingle()

    if (refetchError) {
      console.error('Failed to re-fetch usage after save:', refetchError)
      // Fall back to what we already have locally rather than leaving the UI blank
      setRecommendations(newRecommendations)
    } else {
      setRecommendations(freshRow?.recommendations || newRecommendations)
      setRemaining(Math.max(DAILY_LIMIT - (freshRow?.tokens_used || 0), 0))
    }

    setLoading(false)
  }, [appliances, ratePerKwh])

  return {
    recommendations,
    loading,
    error,
    remaining,
    dailyLimit: DAILY_LIMIT,
    initialized,
    generate,
  }
}
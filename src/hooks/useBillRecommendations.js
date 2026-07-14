import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const DAILY_LIMIT = 3
const STORAGE_KEY = 'ai_recs_usage'

function todayString() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD, local calendar not accounted for, fine for MVP
}

// NOTE: this limit is enforced client-side only, via localStorage.
// Easy to bypass (clearing browser storage, using another device/browser
// resets it) — acceptable for a personal usage cap on a free Gemini key,
// not meant as a hard security boundary.
// Should be moved server-side (e.g. a `ai_usage` table checked inside the edge function itself).
function readUsage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { date: todayString(), count: 0 }
    const parsed = JSON.parse(raw)
    if (parsed.date !== todayString()) return { date: todayString(), count: 0 }
    return parsed
  } catch {
    return { date: todayString(), count: 0 }
  }
}

function writeUsage(usage) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage))
}

export function useBillRecommendations(appliances, ratePerKwh) {
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [usageCount, setUsageCount] = useState(() => readUsage().count)

  const remaining = Math.max(0, DAILY_LIMIT - usageCount)

  const generate = useCallback(async () => {
    const usage = readUsage()
    if (usage.count >= DAILY_LIMIT) {
      setError({ message: `You've used all ${DAILY_LIMIT} AI recommendations for today. Try again tomorrow.` })
      return
    }

    setLoading(true)
    setError(null)

    const { data, error: fnError } = await supabase.functions.invoke('bill-recommendations', {
      body: { appliances, ratePerKwh },
    })

    setLoading(false)

    if (fnError || data?.error) {
      console.error('bill-recommendations error:', fnError || data?.error)
      setError(fnError || data?.error)
      return
    }

    setRecommendations(data.recommendations || [])

    const newUsage = { date: usage.date, count: usage.count + 1 }
    writeUsage(newUsage)
    setUsageCount(newUsage.count)
  }, [appliances, ratePerKwh])

  // Keep the displayed remaining-count correct if the day rolls over
  // while the tab stays open.
  useEffect(() => {
    setUsageCount(readUsage().count)
  }, [])

  return { recommendations, loading, error, remaining, dailyLimit: DAILY_LIMIT, generate }
}
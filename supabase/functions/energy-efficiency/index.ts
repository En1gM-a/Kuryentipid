// supabase/functions/energy-efficiency/index.ts
//
// Deploy with:
//   supabase functions deploy energy-efficiency
//
// Set the secret once (Gemini API key lives ONLY in Supabase, never in
// frontend code or .env):
//   supabase secrets set GEMINI_API_KEY=your-key-here
//
// Get a free Gemini API key at https://aistudio.google.com/apikey

import { serve } from "https://deno.land/std@0.203.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`

serve(async (req) => {
  // Browser preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set")
      return new Response(
        JSON.stringify({ error: "Server misconfiguration: missing Gemini API key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { appliances, householdType } = await req.json()

    if (!Array.isArray(appliances)) {
      return new Response(
        JSON.stringify({ error: "appliances must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Compute total monthly kWh server-side (don't trust client-sent totals)
    const totalMonthlyKwh = appliances.reduce((sum: number, a: any) => {
      const watts = Number(a.wattage || 0) * Number(a.quantity || 1)
      const hours = Number(a.hours_per_day || 0)
      return sum + (watts * hours * 30) / 1000
    }, 0)

    const applianceSummary = appliances.map((a: any) => ({
      category: a.category,
      wattage: a.wattage,
      quantity: a.quantity || 1,
      hours_per_day: a.hours_per_day,
    }))

    const prompt = `You are an energy analyst for a Filipino household electricity-monitoring app.

Household type: ${householdType || "Unknown"}
Total estimated monthly electricity usage: ${totalMonthlyKwh.toFixed(1)} kWh
Number of appliances tracked: ${appliances.length}
Appliance breakdown (category, wattage in W, quantity, hours/day): ${JSON.stringify(applianceSummary)}

Compare this household's monthly kWh usage against typical average residential
electricity consumption for a similar household type in the Philippines
(Meralco/DOE published residential averages generally fall around 200-300
kWh/month depending on household size, aircon use, and appliance count).

Return your assessment in the exact JSON schema provided. percentVsAverage
should be signed: negative means this household uses LESS than average
(more efficient/better), positive means MORE than average (less efficient).`

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            rating: {
              type: "STRING",
              enum: ["Excellent", "Good", "Average", "Needs Improvement", "Poor"],
            },
            percentVsAverage: {
              type: "NUMBER",
              description:
                "Signed percent difference vs PH household average, e.g. -12 means 12% below average (better), 8 means 8% above average (worse)",
            },
            averageKwhEstimate: {
              type: "NUMBER",
              description: "The PH household average kWh/month used for the comparison",
            },
            reasoning: {
              type: "STRING",
              description: "One short sentence explaining the comparison",
            },
          },
          required: ["rating", "percentVsAverage", "averageKwhEstimate"],
        },
      },
    }

    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error("Gemini API error:", errText)
      return new Response(
        JSON.stringify({ error: "Gemini API request failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const geminiData = await geminiRes.json()
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) {
      console.error("Unexpected Gemini response shape:", JSON.stringify(geminiData))
      return new Response(
        JSON.stringify({ error: "No response from Gemini" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const parsed = JSON.parse(rawText)

    return new Response(
      JSON.stringify({
        ...parsed,
        totalMonthlyKwh: Number(totalMonthlyKwh.toFixed(1)),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err) {
    console.error("energy-efficiency function error:", err)
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
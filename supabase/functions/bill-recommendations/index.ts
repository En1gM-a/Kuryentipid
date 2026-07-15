// supabase/functions/bill-recommendations/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const { appliances, ratePerKwh } = await req.json()

    if (!Array.isArray(appliances) || appliances.length === 0) {
      return new Response(
        JSON.stringify({ error: "No appliances provided." }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }

    // Compute monthly kWh/cost per appliance server-side — never trust
    // the client's math, same principle as the energy-efficiency function.
    const applianceSummary = appliances.map((a) => {
      const wattage = Number(a.wattage) || 0
      const quantity = Number(a.quantity) || 1
      const hoursPerDay = Number(a.hours_per_day) || 0
      const monthlyKwh = (wattage * quantity * hoursPerDay * 30) / 1000
      const monthlyCost = ratePerKwh ? monthlyKwh * Number(ratePerKwh) : null

      return {
        id: a.id,
        name: a.name || "Unnamed appliance",
        category: a.category,
        wattage,
        quantity,
        hours_per_day: hoursPerDay,
        monthly_kwh: Math.round(monthlyKwh * 10) / 10,
        monthly_cost: monthlyCost != null ? Math.round(monthlyCost) : null,
      }
    })

    const prompt = `You are an energy-efficiency advisor for a Filipino household electricity app.
Here is the user's appliance list with estimated monthly usage and cost (₱), at a rate of ₱${ratePerKwh}/kWh:

${JSON.stringify(applianceSummary, null, 2)}

Give exactly 3 practical, cost-effective recommendations to reduce this household's electricity bill.
Rules:
- Be specific to THEIR actual appliances (reference the highest-cost/highest-usage ones by name where relevant).
- Each recommendation must be straight to the point — no fluff, no generic "turn off lights" filler unless it's genuinely their biggest opportunity.
- If a recommendation involves reducing a specific appliance's daily hours, include that appliance's id and a realistic suggested_hours_per_day.
- estimated_monthly_savings must be a realistic ₱ number based on the data given, not a guess.
- difficulty must be one of: "Easy", "Medium", "Hard".`

    const geminiRes = await fetch(`${GEMINI_URL}?key=${Deno.env.get("GEMINI_API_KEY")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                description: { type: "STRING" },
                difficulty: { type: "STRING", enum: ["Easy", "Medium", "Hard"] },
                estimated_monthly_savings: { type: "NUMBER" },
                appliance_id: { type: "STRING", nullable: true },
                suggested_hours_per_day: { type: "NUMBER", nullable: true },
              },
              required: ["title", "description", "difficulty", "estimated_monthly_savings"],
            },
          },
        },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error("Gemini error:", geminiRes.status, errText)
      return new Response(
        JSON.stringify({ error: "AI request failed." }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }

    const geminiData = await geminiRes.json()
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) {
      console.error("No text in Gemini response:", JSON.stringify(geminiData))
      return new Response(
        JSON.stringify({ error: "AI returned no content." }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      )
    }

    const recommendations = JSON.parse(rawText)

    return new Response(
      JSON.stringify({ recommendations }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("bill-recommendations error:", err)
    return new Response(
      JSON.stringify({ error: "Something went wrong generating recommendations." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }
})
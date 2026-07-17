// supabase/functions/presyo-proxy/index.ts
Deno.serve(async (req) => {
  const url = new URL(req.url)
  const month = url.searchParams.get('month')
  const year = url.searchParams.get('year')

  const res = await fetch(`https://presyo.icsc.ngo/api/national?month=${month}&year=${year}`)
  const data = await res.json()

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})
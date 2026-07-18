import { useState, useEffect, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import { Download, RotateCw, MapPin } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

// ============================================================
// PRESYO-PH National Rate Map
// ------------------------------------------------------------
// Pulls the current month's residential electricity rate for every
// Philippine distribution utility from the public PRESYO-PH API
// (maintained by the Institute for Climate and Sustainable Cities)
// and plots each one as a colored dot on a map — same idea as the
// map on https://presyo.icsc.ngo, just re-built natively with
// react-leaflet instead of their deck.gl/plotly bundle.
//
// Data source note: this is a public but *unofficial/undocumented*
// API. Attribute ICSC/PRESYO-PH somewhere near the map (done below
// in the footer), and keep an eye out for CORS or rate-limit issues
// since nothing here is guaranteed stable long-term.
//
// Install once in your project:
//   npm install react-leaflet leaflet
// ============================================================

    const API_URL = (month, year) =>
  `https://bujqqyzclohzwoyqzidk.supabase.co/functions/v1/presyo-proxy?month=${month}&year=${year}`

// Center roughly over the PH archipelago
const PH_CENTER = [12.8797, 121.774]
const PH_ZOOM = 5.4

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ------------------------------------------------------------
// Color scale: green (cheap) -> yellow -> red (expensive), matching
// the legend gradient in the reference design. We compute min/max
// from whatever data actually comes back, so the scale always fits
// the current month's real spread instead of a hardcoded range.
// ------------------------------------------------------------
function rateToColor(rate, min, max) {
  if (max === min) return '#facc15' // flat fallback (shouldn't normally happen)
  const t = Math.min(1, Math.max(0, (rate - min) / (max - min)))
  // 0   -> green  (34, 197, 94)
  // 0.5 -> yellow (234, 179, 8)
  // 1   -> red    (220, 38, 38)
  const stops = [
    [0, [34, 197, 94]],
    [0.5, [234, 179, 8]],
    [1, [220, 38, 38]],
  ]
  let [c0, c1] = [stops[0], stops[1]]
  if (t > 0.5) [c0, c1] = [stops[1], stops[2]]
  const localT = (t - c0[0]) / (c1[0] - c0[0])
  const rgb = c0[1].map((v, i) => Math.round(v + (c1[1][i] - v) * localT))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

export default function ProviderRateMap() {
  const now = new Date()
  const [month, setMonth] = useState(MONTHS[now.getMonth()])
  const [year, setYear] = useState(now.getFullYear())

  const [points, setPoints] = useState([])
  const [meta, setMeta] = useState(null) // { coverage_note, selected_month_year, ... }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async (m, y) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(API_URL(m, y), {
  headers: {
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  },
})
if (!res.ok) throw new Error(`Request failed (${res.status})`)
      const json = await res.json()

      const layerData = json?.chart_specs?.map?.layers?.[0]?.data || []

      const cleaned = layerData
        .filter((d) => typeof d.latitude === 'number' && typeof d.longitude === 'number' && typeof d.rate_value === 'number')
        .map((d) => ({
          id: d.du_name,
          name: d.du_name,
          fullName: d.du_full_name,
          grid: d.grid_classification,
          rate: d.rate_value,
          lat: d.latitude,
          lng: d.longitude,
          period: d.selected_month_year,
        }))

      setPoints(cleaned)
      setMeta({
        coverageNote: json.coverage_note,
        selectedMonthYear: json.selected_month_year || json?.filters?.selected_month + ' ' + json?.filters?.selected_year,
        stats: json.stats,
      })
    } catch (err) {
      console.error('Failed to load PRESYO-PH rate data:', err)
      setError('Could not load rate data right now. Please try again shortly.')
      setPoints([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(month, year)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { min, max } = useMemo(() => {
    if (points.length === 0) return { min: 0, max: 0 }
    const rates = points.map((p) => p.rate)
    return { min: Math.min(...rates), max: Math.max(...rates) }
  }, [points])

  const handleRefresh = () => loadData(month, year)

  // Simple CSV export of what's currently plotted — closest equivalent
  // to the download icon in the reference screenshot, without needing
  // a headless-browser/image-export dependency.
  const handleDownload = () => {
    const header = 'Utility,Full Name,Grid Classification,Rate (PHP/kWh),Period\n'
    const rows = points
      .map((p) => `${p.name},"${p.fullName}",${p.grid},${p.rate},${p.period}`)
      .join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `presyo-ph-rates-${month}-${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-card p-6 shadow-sm mt-6">
      {/* Header row: title + month/year selectors + action icons */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Electricity Rates Across the Philippines
          </h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {meta?.selectedMonthYear
              ? `Residential rates for ${meta.selectedMonthYear}`
              : 'Loading current rates…'}
            {meta?.coverageNote ? ` · ${meta.coverageNote}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => { setMonth(e.target.value); loadData(e.target.value, year) }}
            className="text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5"
          >
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); loadData(month, Number(e.target.value)) }}
            className="text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg px-2 py-1.5"
          >
            {[year, year - 1, year - 2, year - 3].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>

          <button
            onClick={handleDownload}
            disabled={points.length === 0}
            title="Download plotted data as CSV"
            className="w-9 h-9 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-40"
          >
            <Download size={16} />
          </button>
          <button
            onClick={handleRefresh}
            title="Refresh"
            className="w-9 h-9 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            <RotateCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error ? (
        <div className="h-[430px] flex flex-col items-center justify-center text-center">
          <MapPin size={24} className="text-gray-300 dark:text-gray-600 mb-3" />
          <p className="font-semibold text-gray-900 dark:text-white mb-1">Couldn't load the map</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{error}</p>
        </div>
      ) : (
        <div className="relative">
          {/* Legend, positioned like the reference design (top-left) */}
          <div className="absolute z-[1000] top-3 left-3 bg-white/90 dark:bg-gray-900/90 backdrop-blur rounded-xl px-3 py-3 shadow-sm flex flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Higher rate</span>
            <div
              className="w-2 h-24 rounded-full"
              style={{ background: 'linear-gradient(to bottom, #dc2626, #eab308, #22c55e)' }}
            />
            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Lower rate</span>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ height: 430 }}>
            <MapContainer
              center={PH_CENTER}
              zoom={PH_ZOOM}
              style={{ height: '100%', width: '100%', background: '#eef3f8' }}
              scrollWheelZoom={true}
            >
              {/* CartoDB Positron: light, low-clutter basemap that matches the
                  clean look of the reference screenshot better than default OSM tiles. */}
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />

              {points.map((p) => (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={7}
                  pathOptions={{
                    fillColor: rateToColor(p.rate, min, max),
                    fillOpacity: 0.85,
                    color: '#fff',
                    weight: 1,
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <p className="font-bold text-gray-900 mb-0.5">{p.name}</p>
                      <p className="text-gray-600 mb-2">{p.fullName}</p>
                      <p className="text-gray-500 text-xs mb-1">
                        Grid classification: <span className="font-medium text-gray-700">{p.grid}</span>
                      </p>
                      <p className="text-lg font-extrabold text-gray-900">
                        {p.rate.toFixed(2)} <span className="text-xs font-medium text-gray-500">PHP/kWh</span>
                      </p>
                      <p className="text-gray-400 text-xs mt-1">Coverage period: {p.period}</p>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          {loading && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/60 dark:bg-gray-900/60 rounded-xl">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading rates…</p>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3">
        Map data: PRESYO-PH, Institute for Climate and Sustainable Cities (ICSC) — presyo.icsc.ngo
      </p>
    </div>
  )
}
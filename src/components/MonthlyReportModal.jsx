import { X, Zap, Receipt, Calendar } from 'lucide-react'
import { getCategoryStyle } from '../lib/applianceStyles'
import { calculateMonthlyCost } from '../lib/calculations'

// Shows a detailed breakdown for one previously-logged monthly bill.
//
// IMPORTANT LIMITATION: `monthly_bills` only stores { actual_kwh,
// actual_cost, created_at } — it does NOT snapshot which appliances or
// costs were true at that time. So the "Appliance Breakdown" below uses
// the user's CURRENT appliances + CURRENT rate as an approximation, not
// a historical record. This is flagged directly in the UI (see the note
// under the section heading) rather than hidden, so it's never mistaken
// for real historical data. If a real per-month snapshot table gets
// added later (e.g. `monthly_bill_appliances`), swap this section to
// read from that instead.
export default function MonthlyReportModal({ bill, appliances, ratePerKwh, onClose }) {
  if (!bill) return null

  const monthLabel = new Date(bill.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const totalBill = Number(bill.actual_cost || 0)
  const totalKwh = Number(bill.actual_kwh || 0)
  const avgCostPerDay = totalBill / 30

  const applianceCosts = ratePerKwh
    ? appliances
        .map((a) => ({ ...a, cost: calculateMonthlyCost(a, ratePerKwh) }))
        .sort((a, b) => b.cost - a.cost)
    : []

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-card shadow-lg w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-primary" />
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">{monthLabel}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="border border-gray-100 dark:border-gray-800 rounded-card p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide mb-1">TOTAL BILL</div>
            <div className="text-2xl font-extrabold text-gray-900 dark:text-white">
              ₱{totalBill.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="border border-gray-100 dark:border-gray-800 rounded-card p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide mb-1">TOTAL kWh</div>
            <div className="text-2xl font-extrabold text-gray-900 dark:text-white">
              {totalKwh.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            </div>
          </div>
          <div className="border border-gray-100 dark:border-gray-800 rounded-card p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide mb-1">AVG COST / DAY</div>
            <div className="text-2xl font-extrabold text-gray-900 dark:text-white">
              ₱{avgCostPerDay.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Appliance breakdown */}
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white mb-1">Appliance Breakdown</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            Based on your current appliances and rate — this month's actual per-appliance
            costs weren't individually recorded, so this is an approximation, not historical data.
          </p>

          {applianceCosts.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              No appliances to show a breakdown for.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {applianceCosts.map((a) => {
                const style = getCategoryStyle(a.category)
                const Icon = style.icon
                const percentOfBill = totalBill > 0 ? Math.min(100, (a.cost / totalBill) * 100) : 0

                return (
                  <div key={a.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className={style.iconColor} />
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">
                          {a.name || 'Unnamed Appliance'}
                        </span>
                      </div>
                      <div className="text-right text-sm">
                        <span className="font-bold text-gray-900 dark:text-white">
                          ₱{a.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500 ml-2">
                          {percentOfBill.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${percentOfBill}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
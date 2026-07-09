export const DAYS_PER_MONTH = 30

// `ratePerKwh` is now a required argument — it comes from the
// `electricity_rates` table (column: residential_rate), looked up via
// the user's profile.provider_id.
export function calculateMonthlyKwh(appliance, hoursOverride) {
  const watts = Number(appliance.wattage ?? appliance.watts ?? 0)
  const quantity = Number(appliance.quantity ?? 1)
  const hoursPerDay = Number(
    hoursOverride ?? appliance.hours_per_day ?? appliance.hoursPerDay ?? 0
  )
  return (watts * quantity * hoursPerDay * DAYS_PER_MONTH) / 1000
}

export function calculateMonthlyCost(appliance, ratePerKwh, hoursOverride) {
  return calculateMonthlyKwh(appliance, hoursOverride) * ratePerKwh
}
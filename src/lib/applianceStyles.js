import {
  Snowflake, Refrigerator, Lightbulb, Tv, Fan,
  WashingMachine, Flame, Cpu, Plug,
} from 'lucide-react'

// Keys must exactly match the category values stored in Supabase
// (currently all uppercase: COOLING, KITCHEN, LIGHTING, ENTERTAINMENT,
// LAUNDRY, HEATING, ELECTRONICS, OTHER). Falls back to a generic plug
// icon for anything not listed here.
const CATEGORY_STYLES = {
  COOLING: { icon: Snowflake, iconColor: 'text-blue-500', badgeBg: 'bg-blue-50', badgeColor: 'text-blue-600' },
  KITCHEN: { icon: Refrigerator, iconColor: 'text-orange-500', badgeBg: 'bg-orange-50', badgeColor: 'text-orange-600' },
  LIGHTING: { icon: Lightbulb, iconColor: 'text-amber-500', badgeBg: 'bg-amber-50', badgeColor: 'text-amber-600' },
  ENTERTAINMENT: { icon: Tv, iconColor: 'text-purple-500', badgeBg: 'bg-purple-50', badgeColor: 'text-purple-600' },
  LAUNDRY: { icon: WashingMachine, iconColor: 'text-cyan-500', badgeBg: 'bg-cyan-50', badgeColor: 'text-cyan-600' },
  HEATING: { icon: Flame, iconColor: 'text-red-500', badgeBg: 'bg-red-50', badgeColor: 'text-red-600' },
  ELECTRONICS: { icon: Cpu, iconColor: 'text-indigo-500', badgeBg: 'bg-indigo-50', badgeColor: 'text-indigo-600' },
  OTHER: { icon: Plug, iconColor: 'text-gray-400', badgeBg: 'bg-gray-50', badgeColor: 'text-gray-600' },
}

const DEFAULT_STYLE = {
  icon: Plug,
  iconColor: 'text-gray-400',
  badgeBg: 'bg-gray-50',
  badgeColor: 'text-gray-600',
}

export function getCategoryStyle(category) {
  return CATEGORY_STYLES[category] || DEFAULT_STYLE
}
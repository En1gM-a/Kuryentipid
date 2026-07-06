import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const apiUrlElectricityProv = import.meta.env.API_URL_ELECTRICITY_PROV

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

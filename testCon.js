import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  const { data, error } = await supabase.from('providers').select('*');

  if (error) {
    console.error('Connection failed:', error.message);
  } else {
    console.log('✅ Connected! Providers table:', data);
  }
}

testConnection();
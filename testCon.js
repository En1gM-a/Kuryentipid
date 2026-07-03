import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

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
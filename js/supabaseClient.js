// supabaseClient.js

const SUPABASE_URL = 'https://ekzpbpoadiktlflcrrwm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9wfISELg1l53KvwhNlZ6Iw_BeGy7QS5';

// Initialize the Supabase client attached to the global window
window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

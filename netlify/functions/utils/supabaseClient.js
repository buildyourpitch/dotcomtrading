// Shared server-side Supabase client. Uses the SERVICE ROLE key (bypasses RLS),
// so this must only ever run in Netlify Functions — never sent to the browser.
const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = { getSupabaseClient };

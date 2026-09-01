// =====================================================
// SUPABASE CONFIG
// =====================================================

// Vai su:
// Supabase Dashboard
// → Project Settings
// → API

const SUPABASE_URL = "https://supabase.com/dashboard/project/rtiyttysuvsdrvccepoe";

const SUPABASE_KEY = "sb_publishable_s27T8o8yE490SQoxmHon7w_BKWMl9uL";


// NON inserire MAI qui:
// service_role key
//
// La service_role è una chiave privata e non deve essere
// esposta nel browser.

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

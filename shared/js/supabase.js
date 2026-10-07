// ============================================
// shared/js/supabase.js
// Cliente único e persistente da autenticação da Intranet
// ============================================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://qgkjnzcqjhhqdgxmvtew.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gbXPIpkbYvf3YKITplkjpg_eKrPHhYw";

// A storageKey explícita garante que todas as páginas da Intranet, inclusive
// módulos em subpastas, leiam exatamente a mesma sessão persistida.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "pitangueiras-intranet-auth",
  },
});

export const SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
};

export default supabase;

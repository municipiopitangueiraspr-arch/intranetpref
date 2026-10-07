// ============================================
// shared/js/supabase.js
// Configuração do Supabase - Centralizada
// ============================================

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Configuração do Supabase
const SUPABASE_URL = "https://qgkjnzcqjhhqdgxmvtew.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gbXPIpkbYvf3YKITplkjpg_eKrPHhYw";

// Criar e exportar o cliente Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exportar também as configurações para uso em outros lugares
export const SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
};

export default supabase;

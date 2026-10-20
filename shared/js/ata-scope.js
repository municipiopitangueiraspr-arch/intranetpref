const GLOBAL_PROFILES = new Set(["ADMIN", "PREFEITO"]);

export const isGlobalProfile = (usuario) =>
  GLOBAL_PROFILES.has(String(usuario?.perfil || "").toUpperCase());

/**
 * Retorna null para visão municipal global (ADMIN/PREFEITO); para os demais,
 * retorna exclusivamente atas com consumo registrado em unidades acessíveis.
 * O conjunto é calculado no backend; favoritos não ampliam o escopo analítico.
 */
export async function getAnalyticAtaIds(supabase, usuario) {
  if (isGlobalProfile(usuario)) return null;
  const { data, error } = await supabase.rpc("get_analytic_ata_ids");
  if (error) throw error;
  return [...new Set((data || []).map((row) => Number(row.ata_id)).filter(Number.isFinite))];
}

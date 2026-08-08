import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase/PostgREST plafonne une requête à 1000 lignes. La table `operations`
// dépasse ce seuil → on pagine pour tout récupérer (Bilan, dédup d'import…).
export async function toutesLesOperations<T = unknown>(
  supabase: SupabaseClient,
  columns: string,
): Promise<T[]> {
  const taille = 1000;
  let debut = 0;
  const tout: T[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("operations")
      .select(columns)
      .order("id", { ascending: true }) // clé UNIQUE → pagination stable (pas de chevauchement)
      .range(debut, debut + taille - 1);
    if (error) break;
    const lot = (data ?? []) as unknown as T[];
    tout.push(...lot);
    if (lot.length < taille) break;
    debut += taille;
  }
  return tout;
}

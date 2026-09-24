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

// Une ligne bancaire ventilée reste en base (indicateur `est_ventilee`) à côté
// de ses sous-écritures : pour tout total, on ne garde que les sous-écritures,
// sinon le montant est compté deux fois. Une ligne qui a des filles est écartée
// même sans l'indicateur — la présence de filles fait foi.
export function sansLignesVentilees<T extends { id: string; parent_id: string | null; est_ventilee: boolean }>(
  operations: T[],
): T[] {
  const meres = new Set(operations.map((o) => o.parent_id).filter(Boolean) as string[]);
  return operations.filter((o) => !meres.has(o.id) && !o.est_ventilee);
}

// Chargement des données d'une classe pour une période (côté navigateur ; la base filtre selon le profil).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Absence, Appel } from "@/lib/absences";
import type { Bulletin, Classe, ContexteClasse, EleveBulletin, Enseignant, Evaluation, Groupe, Ligne, Matiere, Note, Periode } from "@/lib/bulletins";

export type Referentiel = { periodes: Periode[]; classes: Classe[]; enseignants: Enseignant[] };

export async function chargerReferentiel(sb: SupabaseClient): Promise<Referentiel> {
  const [p, c, e] = await Promise.all([
    sb.from("periodes").select("*").order("annee_scolaire").order("ordre"),
    sb.from("classes").select("*").order("annee_scolaire").order("ordre"),
    sb.from("enseignants").select("*").order("nom"),
  ]);
  return { periodes: (p.data ?? []) as Periode[], classes: (c.data ?? []) as Classe[], enseignants: (e.data ?? []) as Enseignant[] };
}

/** Données d'une classe et d'une période ; crée au passage les bulletins manquants. */
export async function chargerClasse(sb: SupabaseClient, classe: Classe, periode: Periode): Promise<ContexteClasse> {
  await sb.rpc("bulletins_preparer", { p_periode: periode.id, p_classe: classe.id });
  const [g, m, ce, el, ev, b] = await Promise.all([
    sb.from("matieres_groupes").select("*").eq("classe_id", classe.id).order("ordre"),
    sb.from("matieres").select("*").eq("classe_id", classe.id).order("ordre"),
    sb.from("classe_eleves").select("eleve_id").eq("classe_id", classe.id),
    sb.rpc("eleves_bulletins", { p_annee: classe.annee_scolaire }),
    sb.from("evaluations").select("*").eq("classe_id", classe.id).eq("periode_id", periode.id).order("date").order("created_at"),
    sb.from("bulletins").select("*").eq("classe_id", classe.id).eq("periode_id", periode.id),
  ]);
  const membres = new Set(((ce.data ?? []) as { eleve_id: string }[]).map((x) => x.eleve_id));
  const evaluations = (ev.data ?? []) as Evaluation[];
  const bulletins = (b.data ?? []) as Bulletin[];
  const ids = [...membres];
  const [n, l, a, ap] = await Promise.all([
    evaluations.length
      ? sb.from("evaluation_notes").select("*").in("evaluation_id", evaluations.map((x) => x.id))
      : Promise.resolve({ data: [] as Note[] }),
    bulletins.length
      ? sb.from("bulletin_lignes").select("*").in("bulletin_id", bulletins.map((x) => x.id))
      : Promise.resolve({ data: [] as Ligne[] }),
    ids.length
      ? sb.from("absences").select("*").in("eleve_id", ids).gte("date", periode.debut).lte("date", periode.fin)
      : Promise.resolve({ data: [] as Absence[] }),
    classe.presentiel_bulletin
      ? sb.from("appels").select("date, demi_journee").eq("classe_id", classe.id).gte("date", periode.debut).lte("date", periode.fin)
      : Promise.resolve({ data: null }),
  ]);
  return {
    classe,
    periode,
    groupes: (g.data ?? []) as Groupe[],
    matieres: (m.data ?? []) as Matiere[],
    eleves: ((el.data ?? []) as EleveBulletin[]).filter((e) => membres.has(e.id)),
    evaluations,
    notes: (n.data ?? []) as Note[],
    bulletins,
    lignes: (l.data ?? []) as Ligne[],
    absences: (a.data ?? []) as Absence[],
    ...(ap.data ? { appels: ap.data as Pick<Appel, "date" | "demi_journee">[] } : {}),
  };
}

/** Période en cours (ou la dernière commencée) d'une année. */
export function periodeCourante(periodes: Periode[], aujourdhui: string): Periode | undefined {
  const commencees = periodes.filter((p) => p.debut <= aujourdhui);
  return commencees.find((p) => p.fin >= aujourdhui) ?? commencees.at(-1) ?? periodes[0];
}

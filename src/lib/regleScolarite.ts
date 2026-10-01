/**
 * Réglé d'une famille pour une année scolaire — calcul UNIQUE, partagé par
 * l'onglet Frais de scolarité, l'Espace famille, l'accueil et le bilan.
 *
 * Chaque année a UNE source (table `scolarite_annees`) :
 *  - « compta » : les écritures de la Comptabilité rattachées à la famille
 *    (mensualités et dons d'association fléchés). La grille du classeur est
 *    ignorée ;
 *  - « classeur » : les dix mois saisis à la main. Les rattachements de la
 *    Comptabilité ne comptent pas (sinon un même paiement compterait deux fois).
 *
 * Dans les deux cas s'ajoute le REPORT (colonne `avance`) : crédit, ou dette
 * s'il est négatif, reporté de l'année précédente et saisi à la main.
 *
 * Le MOIS D'AVANCE (dépôt) n'entre jamais dans le réglé : il est suivi à part,
 * depuis la Comptabilité (voir `scolariteDepots`).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NatureAffectation } from "@/lib/scolariteDepots";

export type SourceScolarite = "compta" | "classeur";
export type SourcesScolarite = Record<string, SourceScolarite>;

/** Source d'une année : le classeur tant que l'année n'a pas été basculée. */
export function sourceDe(annee: string, sources: SourcesScolarite | null | undefined): SourceScolarite {
  return sources?.[annee] === "compta" ? "compta" : "classeur";
}

export const MOIS_CLASSEUR = [
  { k: "m_sept", l: "Septembre" },
  { k: "m_oct", l: "Octobre" },
  { k: "m_nov", l: "Novembre" },
  { k: "m_dec", l: "Décembre" },
  { k: "m_jan", l: "Janvier" },
  { k: "m_fev", l: "Février" },
  { k: "m_mars", l: "Mars" },
  { k: "m_avr", l: "Avril" },
  { k: "m_mai", l: "Mai" },
  { k: "m_juin", l: "Juin" },
] as const;

export type InscriptionRegle = {
  id: string;
  /** Report de l'année précédente (nom historique de la colonne). */
  avance?: number | string | null;
} & Partial<Record<(typeof MOIS_CLASSEUR)[number]["k"], number | string | null>>;

/** Écriture de la Comptabilité rattachée à une inscription. */
export type VersementRegle = {
  inscription_id: string;
  nature: NatureAffectation;
  montant: number | string;
  type?: "recette" | "depense";
  date?: string | null;
  libelle?: string;
  origine?: string;
  mode?: string | null;
};

export type LigneRegle = {
  date: string | null;
  libelle: string;
  montant: number;
  nature: "mensualite" | "don_association" | "classeur" | "report";
  origine?: string;
  mode?: string | null;
};

/** Ce qui compte dans le réglé de l'inscription, ligne par ligne. */
export function lignesRegle(
  insc: InscriptionRegle,
  source: SourceScolarite,
  versements: VersementRegle[],
): LigneRegle[] {
  const lignes: LigneRegle[] = [];
  const report = Number(insc.avance) || 0;
  if (report !== 0) {
    lignes.push({ date: null, libelle: "Report de l'année précédente", montant: report, nature: "report" });
  }
  if (source === "classeur") {
    for (const m of MOIS_CLASSEUR) {
      const v = Number(insc[m.k]) || 0;
      if (v) lignes.push({ date: null, libelle: `${m.l} (classeur)`, montant: v, nature: "classeur" });
    }
  } else {
    for (const v of versements) {
      if (v.inscription_id !== insc.id || (v.nature !== "mensualite" && v.nature !== "don_association")) continue;
      lignes.push({
        date: v.date ?? null,
        libelle: v.libelle ?? "Frais de scolarité",
        montant: v.type === "depense" ? -Number(v.montant) : Number(v.montant),
        nature: v.nature,
        origine: v.origine,
        mode: v.mode ?? null,
      });
    }
  }
  return lignes;
}

export function totalRegle(insc: InscriptionRegle, source: SourceScolarite, versements: VersementRegle[]): number {
  return lignesRegle(insc, source, versements).reduce((s, l) => s + l.montant, 0);
}

/**
 * Dû et réglé de chaque famille d'une année, lus en base (accueil, bilan).
 * Le dû reste « mensuel × 10 » : la part de juin des enfants de CM2 n'est
 * déduite que dans l'onglet Frais de scolarité.
 */
export async function regleDesFamilles(
  supabase: SupabaseClient,
  annee: string,
): Promise<{ id: string; famille_nom: string; du: number; regle: number }[]> {
  const [inscRes, srcRes] = await Promise.all([
    supabase
      .from("scolarite_inscriptions")
      .select("id, famille_nom, montant_mensuel, avance, m_sept, m_oct, m_nov, m_dec, m_jan, m_fev, m_mars, m_avr, m_mai, m_juin")
      .eq("annee_scolaire", annee),
    supabase.from("scolarite_annees").select("source").eq("annee_scolaire", annee).maybeSingle(),
  ]);
  const inscriptions = (inscRes.data ?? []) as (InscriptionRegle & { famille_nom: string; montant_mensuel: number })[];
  const source = sourceDe(annee, srcRes.data ? { [annee]: srcRes.data.source as SourceScolarite } : null);
  let versements: VersementRegle[] = [];
  if (source === "compta" && inscriptions.length > 0) {
    const { data } = await supabase
      .from("affectations_scolarite")
      .select("inscription_id, nature, montant, operations(type)")
      .in("inscription_id", inscriptions.map((i) => i.id));
    versements = ((data ?? []) as unknown as {
      inscription_id: string;
      nature: NatureAffectation;
      montant: number;
      operations: { type: "recette" | "depense" } | null;
    }[]).map((a) => ({ inscription_id: a.inscription_id, nature: a.nature, montant: a.montant, type: a.operations?.type }));
  }
  return inscriptions.map((i) => ({
    id: i.id,
    famille_nom: i.famille_nom,
    du: (Number(i.montant_mensuel) || 0) * 10,
    regle: totalRegle(i, source, versements),
  }));
}

/** Réglé selon chacune des deux sources : contrôle pendant la bascule. */
export function regleParSource(insc: InscriptionRegle, versements: VersementRegle[]): Record<SourceScolarite, number> {
  return { compta: totalRegle(insc, "compta", versements), classeur: totalRegle(insc, "classeur", versements) };
}

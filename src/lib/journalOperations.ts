// Journal des modifications de la comptabilité, et annulation du dernier geste.
//
// Principe : un geste de l'utilisateur (modifier une ligne, la ventiler, ajouter
// une sous-écriture) forme un LOT. Chaque ligne touchée est consignée avec son
// état avant et après. Annuler = rejouer le lot à l'envers.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionJournal = "creation" | "modification" | "suppression";

export type EntreeJournal = {
  id: string;
  lot: string;
  operation_id: string;
  action: ActionJournal;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
  libelle_lot: string | null;
  fait_le: string;
  annule_le: string | null;
};

/** Colonnes d'une opération conservées dans le journal. */
const CHAMPS = [
  "id", "date_operation", "libelle", "libelle_origine", "montant", "type",
  "categorie_id", "compte_id", "exercice_id", "mode_paiement", "reference",
  "notes", "parent_id", "est_ventilee",
] as const;

export type OperationJournalisable = Record<string, unknown> & { id: string };

/** Ne retient que les colonnes utiles, pour un journal lisible et stable. */
export function extraire(op: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in op) out[c] = op[c];
  return out;
}

/** Identifiant de lot : un geste utilisateur, même s'il touche plusieurs lignes. */
export function nouveauLot(): string {
  return crypto.randomUUID();
}

/** Consigne les mouvements d'un lot. Sans effet sur les opérations elles-mêmes. */
export async function journaliser(
  supabase: SupabaseClient,
  lot: string,
  libelleLot: string,
  entrees: {
    operation_id: string;
    action: ActionJournal;
    avant?: Record<string, unknown> | null;
    apres?: Record<string, unknown> | null;
  }[],
): Promise<void> {
  if (entrees.length === 0) return;
  const { error } = await supabase.from("journal_operations").insert(
    entrees.map((e) => ({
      lot,
      libelle_lot: libelleLot,
      operation_id: e.operation_id,
      action: e.action,
      avant: e.avant ?? null,
      apres: e.apres ?? null,
    })),
  );
  // Le journal ne doit jamais faire échouer l'opération métier : on trace.
  if (error) console.error("Journalisation impossible :", error.message);
}

export type DernierLot = {
  lot: string;
  libelle: string;
  fait_le: string;
  entrees: EntreeJournal[];
};

/** Dernier lot non encore annulé, ou null. */
export async function dernierLot(supabase: SupabaseClient): Promise<DernierLot | null> {
  const { data } = await supabase
    .from("journal_operations")
    .select("*")
    .is("annule_le", null)
    .order("fait_le", { ascending: false })
    .limit(1);

  const tete = (data ?? [])[0] as EntreeJournal | undefined;
  if (!tete) return null;

  const { data: toutes } = await supabase
    .from("journal_operations")
    .select("*")
    .eq("lot", tete.lot)
    .is("annule_le", null);

  const entrees = (toutes ?? []) as EntreeJournal[];
  return {
    lot: tete.lot,
    libelle: tete.libelle_lot ?? "Modification",
    fait_le: tete.fait_le,
    entrees,
  };
}

export type ResultatAnnulation = {
  ok: boolean;
  message: string;
  /** Opérations remises en état, à mettre en surbrillance. */
  restaurees: string[];
};

/**
 * Annule le dernier lot : une création est supprimée, une suppression
 * réinsérée, une modification ramenée à son état antérieur.
 *
 * L'ordre compte : on supprime les créations en dernier, pour ne pas rompre
 * une référence parent/fille encore utilisée.
 */
export async function annulerDernierLot(supabase: SupabaseClient): Promise<ResultatAnnulation> {
  const lot = await dernierLot(supabase);
  if (!lot) return { ok: false, message: "Aucune modification à annuler.", restaurees: [] };

  const restaurees: string[] = [];

  // 1. Réinsertions (suppressions annulées) et restaurations (modifications).
  for (const e of lot.entrees) {
    if (e.action === "suppression" && e.avant) {
      const { error } = await supabase.from("operations").insert(e.avant);
      if (error) return { ok: false, message: "Restauration impossible : " + error.message, restaurees };
      restaurees.push(e.operation_id);
    } else if (e.action === "modification" && e.avant) {
      // L'identifiant ne se réécrit pas : on restaure les autres colonnes.
      const champs = Object.fromEntries(
        Object.entries(e.avant).filter(([k]) => k !== "id"),
      );
      const { error } = await supabase.from("operations").update(champs).eq("id", e.operation_id);
      if (error) return { ok: false, message: "Restauration impossible : " + error.message, restaurees };
      restaurees.push(e.operation_id);
    }
  }

  // 2. Suppressions des lignes créées par le lot.
  const creees = lot.entrees.filter((e) => e.action === "creation").map((e) => e.operation_id);
  if (creees.length > 0) {
    const { error } = await supabase.from("operations").delete().in("id", creees);
    if (error) return { ok: false, message: "Suppression impossible : " + error.message, restaurees };
  }

  // 3. Le lot est marqué annulé : il ne sera pas repris une seconde fois.
  await supabase
    .from("journal_operations")
    .update({ annule_le: new Date().toISOString() })
    .eq("lot", lot.lot);

  return {
    ok: true,
    message: `« ${lot.libelle} » annulé.`,
    restaurees,
  };
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import { champsImportantsManquants, nomDonateur, sansRecu } from "@/lib/statutDon";
import type { Rapprochement } from "@/lib/rapprochementDons";

/** Don tel que la Comptabilité en a besoin (PII déchiffré si le coffre est ouvert). */
export type DonCompta = {
  id: string;
  operation_id: string | null;
  exercice_id: string | null;
  montant: number;
  date_don: string;
  est_personne_morale: boolean;
  donateur_titre: string | null;
  donateur_nom: string | null;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
  pii_chiffre: string | null;
};

export type EtatDon = "complet" | "incomplet" | "relie_verrouille" | "probable" | "absent";

/**
 * État d'une écriture « Don » vis-à-vis de l'onglet Dons.
 *  - complet : don relié, fiche du donateur complète (nom, adresse, CP/ville,
 *    courriel ; le nom seul suffit quand aucun reçu n'est demandé) ;
 *  - incomplet : don relié, fiche à compléter ;
 *  - relie_verrouille : don relié, coffre fermé — complétude invérifiable ;
 *  - probable : un don de même montant à ±15 jours, ou dont le nom figure dans l'intitulé bancaire, pas encore relié ;
 *  - absent : aucun don.
 */
export function etatDon(
  r: Rapprochement | undefined,
  don: DonCompta | undefined,
  verrou: boolean,
): { etat: EtatDon; manquants: string[] } {
  if (!r || !don) return { etat: "absent", manquants: [] };
  if (r.lien === "probable") return { etat: "probable", manquants: [] };
  if (verrou && don.pii_chiffre) return { etat: "relie_verrouille", manquants: [] };
  const sans = sansRecu(don);
  const manquants = champsImportantsManquants(don).filter((c) => !sans || c === "nom" || c === "nom de l'organisme");
  return { etat: manquants.length ? "incomplet" : "complet", manquants };
}

/** Pastille affichée à côté d'une écriture « Don » dans la Comptabilité. */
export default function PastilleDon({
  operationId,
  exerciceId,
  rapprochement,
  don,
  verrou,
  onFiche,
  onCreer,
  lectureSeule = false,
}: {
  operationId: string;
  exerciceId: string | null;
  rapprochement: Rapprochement | undefined;
  don: DonCompta | undefined;
  verrou: boolean;
  /** Ouvre la fiche du don relié ; `signaler` met en évidence ce qui manque. */
  onFiche?: (donId: string, signaler: boolean) => void;
  /** Ouvre la création d'un don à partir de cette écriture (aucun don trouvé). */
  onCreer?: (operationId: string) => void;
  /** Consultation seule : l'état du don est montré, sans action (lier, compléter). */
  lectureSeule?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const { etat, manquants } = etatDon(rapprochement, don, verrou);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  /** Confirme le rapprochement : le don est relié à cette opération. */
  async function lier(e: React.MouseEvent) {
    e.stopPropagation();
    if (!don) return;
    setBusy(true);
    setErreur(null);
    const maj: { operation_id: string; exercice_id?: string } = { operation_id: operationId };
    if (!don.exercice_id && exerciceId) maj.exercice_id = exerciceId;
    const { error } = await createClient().from("dons").update(maj).eq("id", don.id);
    setBusy(false);
    if (error) return setErreur(error.message);
    router.refresh();
  }

  const qui = don && !(verrou && don.pii_chiffre) ? nomDonateur(don) : "";

  switch (etat) {
    case "complet":
      return (
        <span className="ml-2 inline-flex items-center gap-1.5">
          <span className="text-positive" title={`Dans l'onglet Dons, fiche complète${qui ? ` — ${qui}` : ""}`}>
            ✓
          </span>
          {onFiche && don && (
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                onFiche(don.id, false);
              }}
              className="rounded px-1 text-[11px] font-medium text-accent hover:bg-accent-soft"
              title={`Ouvrir la fiche du donateur${qui ? ` (${qui})` : ""}`}
            >
              Fiche
            </button>
          )}
        </span>
      );
    case "incomplet":
      return (
        <span className="ml-2 inline-flex items-center gap-1.5">
          <span className="font-semibold text-gold" title={`Dans l'onglet Dons${qui ? ` (${qui})` : ""}, mais fiche à compléter : ${manquants.join(", ")}`}>
            ✓
          </span>
          {onFiche && don ? (
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                onFiche(don.id, true);
              }}
              className="rounded bg-gold-soft px-1.5 text-[11px] font-medium text-gold hover:opacity-90"
              title={`Fiche à compléter : ${manquants.join(", ")}`}
            >
              Compléter la fiche
            </button>
          ) : lectureSeule ? (
            <span className="text-[11px] text-gold">fiche à compléter</span>
          ) : (
            <Link href="/dons" onClick={stop} className="text-[11px] text-gold">
              fiche à compléter
            </Link>
          )}
        </span>
      );
    case "relie_verrouille":
      return (
        <span className="ml-2 text-muted" title="Relié à un don ; coffre verrouillé : la complétude de la fiche n'est pas vérifiable">
          ✓🔒
        </span>
      );
    case "probable":
      return (
        <span className="ml-2 inline-flex items-center gap-1">
          <span
            className="rounded-full border border-dashed border-gold px-1.5 text-[11px] text-gold"
            title={
              don
                ? `Don de ${formatEuros(Number(don.montant))} du ${formatDate(don.date_don)}${qui ? ` (${qui})` : ""} trouvé ${rapprochement?.motif === "nom" ? "par le nom du donateur dans l'intitulé bancaire" : "par montant exact (±15 jours)"}, pas encore relié`
                : undefined
            }
          >
            ≈ don trouvé
          </span>
          {onFiche && don && (
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                onFiche(don.id, false);
              }}
              className="rounded px-1 text-[11px] font-medium text-accent hover:bg-accent-soft"
              title="Modifier ou compléter les informations de ce don avant de le lier"
            >
              Modifier
            </button>
          )}
          {!lectureSeule && <button
            type="button"
            onClick={lier}
            disabled={busy}
            className="rounded px-1 text-[11px] font-medium text-accent hover:bg-accent-soft disabled:opacity-50"
            title="Confirmer : relier ce don à l'opération"
          >
            {busy ? "…" : "Lier"}
          </button>}
          {erreur && <span className="text-[11px] text-negative">{erreur}</span>}
        </span>
      );
    default:
      return onCreer ? (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onCreer(operationId);
          }}
          className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold hover:opacity-90"
          title="Ce don n'est pas encore dans l'onglet Dons : créer le don et sa fiche, reliés à cette écriture"
        >
          + Créer le don
        </button>
      ) : (
        <Link
          href="/dons/depuis-compta"
          onClick={stop}
          className="ml-2 rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold hover:opacity-90"
          title="Ce don n'est pas encore dans l'onglet Dons"
        >
          + Ajouter aux dons
        </Link>
      );
  }
}

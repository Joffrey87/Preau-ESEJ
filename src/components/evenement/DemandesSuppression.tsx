"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_FACTURES } from "@/lib/evenement";

export type DemandeSuppression = {
  id: string;
  cible: "facture" | "evenement" | "recette";
  cible_id: string;
  libelle: string;
  operations: string[];
  motif: string | null;
  demande_par_libelle: string | null;
  demande_le: string;
};

/** Demandes de suppression de l'Événementiel en attente du Trésorier (Comptabilité) : accepter ou refuser. */
export default function DemandesSuppression({ demandes, lectureSeule = false }: { demandes: DemandeSuppression[]; lectureSeule?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  if (demandes.length === 0) return null;

  async function traiter(d: DemandeSuppression, accepter: boolean) {
    const quoi = `${d.cible === "facture" ? "la dépense" : d.cible === "recette" ? "la recette" : "l'événement"} « ${d.libelle} »`;
    const texte = accepter
      ? `Supprimer définitivement ${quoi}${d.cible === "evenement" ? " (avec ses dépenses et recettes)" : ""} ?\nLes opérations bancaires sont conservées ; seul le lien disparaît.`
      : `Refuser la demande de suppression de ${quoi} ?`;
    if (!window.confirm(`${texte}\n\nLa réponse sera envoyée à l'Événementiel dans Communication interne.`)) return;
    setOccupe(d.id);
    setErreur(null);
    const { data, error } = await supabase.rpc("traiter_demande_suppression", { p_id: d.id, p_accepter: accepter });
    if (error) {
      setOccupe(null);
      setErreur(error.message);
      return;
    }
    const fichiers = ((data as { fichiers?: unknown } | null)?.fichiers ?? []) as string[];
    if (Array.isArray(fichiers) && fichiers.length) await supabase.storage.from(BUCKET_FACTURES).remove(fichiers);
    setOccupe(null);
    router.refresh();
  }

  return (
    <section className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <h2 className="mb-2 font-semibold">⚠ Demandes de suppression de l&apos;Événementiel ({demandes.length})</h2>
      {erreur && <p className="mb-2 rounded bg-negative/10 px-2 py-1 text-negative">{erreur}</p>}
      <ul className="space-y-2">
        {demandes.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {d.demande_par_libelle ?? "?"} demande la suppression {d.cible === "facture" ? "de la dépense" : d.cible === "recette" ? "de la recette" : "de l'événement"} « {d.libelle} »
              {d.operations.length > 0 && " · liée à une opération bancaire (en ambre ci-dessous)"}
              {d.motif && ` · motif : ${d.motif}`}
            </span>
            {!lectureSeule && (
              <span className="space-x-3 whitespace-nowrap">
                <button type="button" disabled={occupe === d.id} onClick={() => traiter(d, true)} className="text-negative hover:underline">
                  Supprimer
                </button>
                <button type="button" disabled={occupe === d.id} onClick={() => traiter(d, false)} className="text-muted hover:underline">
                  Refuser
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

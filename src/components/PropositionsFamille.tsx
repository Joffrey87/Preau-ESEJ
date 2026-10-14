"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LIBELLE_CHAMP, type PropositionFamille } from "./CarnetFamilles";

/** Espace famille : modifications de coordonnées proposées par la Directrice, que la famille accepte ou refuse. */
export default function PropositionsFamille({ propositions, lectureSeule }: { propositions: PropositionFamille[]; lectureSeule: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  if (!propositions.length) return null;

  async function decider(ids: string[], accepter: boolean) {
    setOccupe(ids.length > 1 ? "tout" : ids[0]);
    setErreur(null);
    for (const id of ids) {
      const { error } = await sb.rpc("famille_proposition_decider", { p_id: id, p_accepter: accepter });
      if (error) {
        setErreur(error.message);
        break;
      }
    }
    setOccupe(null);
    router.refresh();
  }

  return (
    <section className="rounded-xl border-2 border-gold/50 bg-gold-soft/40 p-4">
      <h2 className="text-sm font-semibold">La Directrice propose de mettre à jour vos coordonnées</h2>
      <p className="mb-2 text-[12.5px] text-muted">Vérifiez chaque changement : il ne s&apos;applique qu&apos;une fois accepté.</p>
      <ul className="space-y-1.5 text-sm">
        {propositions.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-3 py-2">
            <span className="text-muted">{LIBELLE_CHAMP[p.champ] ?? p.champ} :</span>
            <span className="line-through opacity-60">{p.ancien || "—"}</span>
            <span>→</span>
            <strong>{p.nouveau || "(vide)"}</strong>
            {!lectureSeule && (
              <span className="ml-auto flex gap-2">
                <button type="button" disabled={!!occupe} onClick={() => decider([p.id], true)} className="rounded-lg bg-positive px-3 py-1 text-[13px] font-medium text-white disabled:opacity-50">
                  Accepter
                </button>
                <button type="button" disabled={!!occupe} onClick={() => decider([p.id], false)} className="rounded-lg border border-border px-3 py-1 text-[13px] hover:bg-surface-2 disabled:opacity-50">
                  Refuser
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!lectureSeule && propositions.length > 1 && (
        <button type="button" disabled={!!occupe} onClick={() => decider(propositions.map((p) => p.id), true)} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg disabled:opacity-50">
          Tout accepter
        </button>
      )}
      {lectureSeule && <p className="mt-2 text-[12px] text-gold">Aperçu : seule la famille peut accepter ou refuser.</p>}
      {erreur && <p className="mt-2 text-[12.5px] text-negative">{erreur}</p>}
    </section>
  );
}

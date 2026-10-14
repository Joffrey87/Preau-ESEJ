"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { titrePeriode, type Synthese } from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import VueBulletin from "./VueBulletin";

export type DocFamille = { id: string; doc: "releve" | "trimestre"; synthese: Synthese; luLe: string | null; tri: string };

/** Espace famille : relevés de notes et bulletins trimestriels publiés. L'ouverture vaut accusé de lecture. */
export default function DocumentsFamille({ docs, apercu, titre }: { docs: DocFamille[]; apercu: boolean; titre: string }) {
  const sb = useMemo(() => createClient(), []);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [lus, setLus] = useState<Set<string>>(new Set(docs.filter((d) => d.luLe).map((d) => d.id)));
  if (!docs.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{titre}</h2>
      {docs.map((d) => (
        <div key={d.id} className="rounded-xl border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium">{d.synthese.eleve.prenom}</span>
            <span className="text-muted">{titrePeriode(d.synthese.periode)} · {d.synthese.periode.annee}</span>
            {!lus.has(d.id) && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] text-gold">Nouveau</span>}
            <div className="ml-auto flex gap-3">
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => {
                  setOuvert(ouvert === d.id ? null : d.id);
                  if (!apercu && !lus.has(d.id)) sb.rpc("releve_lu", { p_doc: d.doc, p_id: d.id }).then(() => setLus((s) => new Set(s).add(d.id)));
                }}
              >
                {ouvert === d.id ? "Fermer" : "Lire"}
              </button>
              <button type="button" className="text-accent hover:underline" onClick={() => telechargerBulletins([d.synthese])}>
                PDF
              </button>
            </div>
          </div>
          {ouvert === d.id && (
            <div className="mt-3 border-t border-border pt-3">
              <VueBulletin s={d.synthese} />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

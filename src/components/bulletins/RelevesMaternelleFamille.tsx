"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { resumeAbsences, texteAbsences, type Absence } from "@/lib/absences";
import { NIVEAUX_ACQUIS, libelleTrimestre, type NiveauAcquis } from "@/lib/releveMaternelle";
import { telechargerRelevesMaternelle, type ReleveImprimable } from "@/lib/releveMaternellePdf";

type ReleveFamille = {
  id: string;
  eleve_id: string;
  prenom: string;
  nom: string;
  classe: string;
  titulaire: string | null;
  annee: string;
  trimestre: number | null;
  periode: { ordre: number; debut: string; fin: string; libelle: string | null } | null;
  debut: string | null;
  fin: string | null;
  appreciation: string | null;
  matieres: { nom: string; niveau: NiveauAcquis | null; commentaire: string | null }[];
};

const titre = (r: ReleveFamille) =>
  r.periode ? `Période ${r.periode.ordre}${r.trimestre ? ` · ${libelleTrimestre(r.trimestre)}` : ""}` : r.trimestre ? libelleTrimestre(r.trimestre) : "Relevé";

/** Espace famille : relevés d'appréciations de maternelle validés par la Directrice. */
export default function RelevesMaternelleFamille() {
  const sb = useMemo(() => createClient(), []);
  const [releves, setReleves] = useState<ReleveFamille[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    sb.rpc("releves_maternelle_famille").then(async ({ data }) => {
      const liste = (data ?? []) as ReleveFamille[];
      setReleves(liste);
      const ids = [...new Set(liste.map((r) => r.eleve_id))];
      if (ids.length) {
        const a = await sb.from("absences").select("*").in("eleve_id", ids);
        setAbsences((a.data ?? []) as Absence[]);
      }
    });
  }, [sb]);

  if (!releves.length) return null;
  const resume = (r: ReleveFamille) =>
    resumeAbsences(absences.filter((a) => a.eleve_id === r.eleve_id && (!r.debut || a.date >= r.debut) && (!r.fin || a.date <= r.fin)));
  const imprimable = (r: ReleveFamille): ReleveImprimable => ({
    eleve: { prenom: r.prenom, nom: r.nom, niveau: null },
    classe: { nom: r.classe, titulaire: r.titulaire },
    annee: r.annee,
    titre: titre(r),
    matieres: r.matieres,
    appreciation: r.appreciation,
    absences: resume(r),
  });

  return (
    <div className="space-y-2">
      <h2 className="text-center text-[15px] font-semibold">Relevés d&apos;appréciations (maternelle)</h2>
      {releves.map((r) => (
        <div key={r.id} className="rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <span className="font-medium">{r.prenom}</span>
            <span className="text-[13px] text-muted">
              {r.classe} · {titre(r)} · {r.annee}
            </span>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setOuvert(ouvert === r.id ? null : r.id)} className="rounded-lg border border-border px-3 py-1 text-[12.5px] hover:bg-surface-2">
                {ouvert === r.id ? "Fermer" : "Lire"}
              </button>
              <button
                type="button"
                onClick={() => telechargerRelevesMaternelle([imprimable(r)], `Relevé ${r.prenom} ${r.nom} — ${titre(r)} ${r.annee}`)}
                className="rounded-lg bg-accent px-3 py-1 text-[12.5px] font-medium text-accent-fg"
              >
                PDF
              </button>
            </div>
          </div>
          {ouvert === r.id && (
            <div className="space-y-2 border-t border-border px-4 py-3 text-[13px]">
              {r.matieres.map((m) => {
                const n = NIVEAUX_ACQUIS.find((x) => x.v === m.niveau);
                return (
                  <div key={m.nom}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.nom}</span>
                      {n && <span className={`rounded border px-1.5 py-0.5 text-[11px] ${n.classe}`}>{n.label}</span>}
                    </div>
                    {m.commentaire && <p className="text-muted">{m.commentaire}</p>}
                  </div>
                );
              })}
              <p>
                <span className="text-muted">Absences : </span>
                {texteAbsences(resume(r))}
              </p>
              {r.appreciation && (
                <div className="rounded-lg border border-gold/40 bg-gold-soft/40 p-3">
                  <p className="font-medium">Appréciation générale</p>
                  <p>{r.appreciation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

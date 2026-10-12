"use client";

import { useMemo, useState } from "react";
import { anneeScolaireDe, dateLongue, libelleDemiJournee, resumeAbsences, texteAbsences, typeAbsence, type Absence } from "@/lib/absences";

/** Espace famille : un onglet par enfant ; par année scolaire, le total puis le détail, du plus récent au plus ancien. */
export default function AbsencesFamille({ absences, prenoms }: { absences: Absence[]; prenoms: Record<string, string> }) {
  const enfants = useMemo(
    () => [...new Set(absences.map((a) => a.eleve_id))].map((id) => [id, prenoms[id] ?? "Enfant"] as const).sort((a, b) => a[1].localeCompare(b[1], "fr")),
    [absences, prenoms],
  );
  const [enfant, setEnfant] = useState(enfants[0]?.[0] ?? null);

  if (!absences.length) {
    return <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">Aucune absence ni aucun retard enregistré.</div>;
  }

  const siennes = absences.filter((a) => a.eleve_id === enfant);
  const annees = [...new Set(siennes.map((a) => anneeScolaireDe(a.date)))].sort().reverse();

  return (
    <div className="space-y-3">
      {enfants.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1">
          {enfants.map(([id, prenom]) => (
            <button
              key={id}
              type="button"
              onClick={() => setEnfant(id)}
              className={`rounded-full px-3 py-1 text-[13px] font-medium ${enfant === id ? "bg-accent text-accent-fg" : "border border-border hover:bg-surface-2"}`}
            >
              {prenom}
            </button>
          ))}
        </div>
      )}
      {annees.map((annee) => {
        const liste = siennes.filter((a) => anneeScolaireDe(a.date) === annee);
        return (
          <div key={annee} className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
              <span className="font-semibold">Année {annee}</span>
              <span className="text-[13px] text-muted">{texteAbsences(resumeAbsences(liste))}</span>
            </div>
            <ul className="divide-y divide-border/60">
              {liste.map((a) => {
                const t = typeAbsence(a.type);
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-[13px]">
                    <span className="first-letter:uppercase">{dateLongue(a.date)}</span>
                    <span className="text-muted">{libelleDemiJournee(a.demi_journee)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
                        t.retard ? "bg-gold-soft text-gold" : t.justifiee ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"
                      }`}
                    >
                      {t.label}
                    </span>
                    {a.remarque && <span className="text-muted">{a.remarque}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

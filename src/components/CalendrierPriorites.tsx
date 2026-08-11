"use client";

// EN PAUSE (repris plus tard) : placeholder pour que /priorites compile.
// Vues 4 semaines / trimestre / année + événements partagés à construire.

import { formatDate } from "@/lib/format";
import type { Tache } from "@/lib/taches";
import type { Evenement } from "@/lib/evenements";
import { GROUPE_COURT } from "@/lib/evenements";

type EvPatch = Pick<Evenement, "titre" | "description" | "groupe" | "date_debut" | "date_fin" | "heure" | "lieu">;

export default function CalendrierPriorites({
  taches,
  evenements,
}: {
  roleSlug: string;
  taches: Tache[];
  evenements: Evenement[];
  onSaveEvenement: (patch: EvPatch, id: string | null) => void | Promise<void>;
  onDeleteEvenement: (id: string) => void | Promise<void>;
}) {
  const echeances = taches.filter((t) => t.date_echeance && !t.fait);
  const items = [
    ...echeances.map((t) => ({ date: t.date_echeance as string, label: t.titre, tag: "Tâche" })),
    ...evenements.map((e) => ({ date: e.date_debut, label: e.titre, tag: GROUPE_COURT[e.groupe] ?? "Événement" })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-3 text-sm text-muted">
        Calendrier en préparation (vues 4 semaines / trimestre / année). En attendant, voici les prochaines échéances et événements.
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Aucune échéance ni événement à venir.</p>
        ) : (
          items.map((it, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border px-4 py-2 text-sm last:border-0">
              <span>{it.label}</span>
              <span className="flex items-center gap-3 text-xs text-muted">
                <span className="rounded-full bg-surface-2 px-2 py-0.5">{it.tag}</span>
                <span className="tabular-nums">{formatDate(it.date)}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

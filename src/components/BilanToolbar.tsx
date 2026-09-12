"use client";

import { useRouter } from "next/navigation";
import type { Periode } from "@/lib/bilan";

const ONGLETS: { key: Periode; label: string }[] = [
  { key: "mois", label: "Mensuel" },
  { key: "trimestre", label: "Trimestriel" },
  { key: "annee", label: "Exercice" },
];

export default function BilanToolbar({
  periode,
  refMois,
  exercices,
  exerciceId,
}: {
  periode: Periode;
  refMois: string; // YYYY-MM
  exercices: { id: string; libelle: string }[];
  exerciceId: string | null;
}) {
  const router = useRouter();

  function maj(patch: { periode?: Periode; ref?: string; exercice?: string }) {
    const sp = new URLSearchParams(window.location.search);
    if (patch.periode) sp.set("periode", patch.periode);
    if (patch.ref) sp.set("ref", patch.ref);
    if (patch.exercice) sp.set("exercice", patch.exercice);
    router.push(`?${sp.toString()}`);
  }

  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border border-border p-0.5">
        {ONGLETS.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => maj({ periode: o.key })}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              periode === o.key ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Le bilan d'exercice se choisit par exercice ; les autres par date de référence. */}
      {periode === "annee" ? (
        <label className="flex items-center gap-2 text-sm text-muted">
          Exercice :
          <select
            value={exerciceId ?? ""}
            onChange={(e) => e.target.value && maj({ exercice: e.target.value })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
          >
            {exercices.length === 0 && <option value="">Aucun exercice</option>}
            {exercices.map((e) => (
              <option key={e.id} value={e.id}>
                {e.libelle}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="flex items-center gap-2 text-sm text-muted">
          {periode === "mois" ? "Mois" : "Trimestre de"} :
          <input
            type="month"
            value={refMois}
            onChange={(e) => e.target.value && maj({ ref: `${e.target.value}-01` })}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </label>
      )}

      <button
        type="button"
        onClick={() => window.print()}
        className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
      >
        Export PDF
      </button>
    </div>
  );
}

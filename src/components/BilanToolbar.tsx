"use client";

import { useRouter } from "next/navigation";
import type { Periode } from "@/lib/bilan";

const ONGLETS: { key: Periode; label: string }[] = [
  { key: "mois", label: "Mois" },
  { key: "trimestre", label: "Trimestre" },
  { key: "annee", label: "Année (exercice)" },
];

export default function BilanToolbar({
  periode,
  refMois,
}: {
  periode: Periode;
  refMois: string; // YYYY-MM
}) {
  const router = useRouter();

  function maj(patch: { periode?: Periode; ref?: string }) {
    const sp = new URLSearchParams(window.location.search);
    if (patch.periode) sp.set("periode", patch.periode);
    if (patch.ref) sp.set("ref", patch.ref);
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

      <label className="flex items-center gap-2 text-sm text-muted">
        Référence :
        <input
          type="month"
          value={refMois}
          onChange={(e) => e.target.value && maj({ ref: `${e.target.value}-01` })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </label>

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

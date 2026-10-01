"use client";

import { useState } from "react";
import GestionPipeline from "@/components/GestionPipeline";
import DonateursPipeline from "@/components/DonateursPipeline";
import type { Prospect } from "@/lib/pipeline";
import type { Don } from "@/components/GestionDons";

type Volet = "fichier" | "prospections" | "campagnes";

const VOLETS: { v: Volet; l: string }[] = [
  { v: "fichier", l: "Fichier donateurs" },
  { v: "prospections", l: "Prospections" },
  { v: "campagnes", l: "Campagnes de collecte" },
];

/**
 * Relations donateurs, en trois volets : le fichier des donateurs (qualifiés
 * depuis les dons, filtres), les prospections (suivi relationnel) et les
 * campagnes de collecte (objectif, relances, actions suggérées).
 */
export default function PipelineTabs({ prospects, dons }: { prospects: Prospect[]; dons: Don[] }) {
  const [vue, setVue] = useState<Volet>("fichier");

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5">
        {VOLETS.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setVue(o.v)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              vue === o.v ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>

      {vue === "prospections" ? (
        <GestionPipeline prospects={prospects} />
      ) : (
        <DonateursPipeline donsInit={dons} volet={vue} />
      )}
    </div>
  );
}

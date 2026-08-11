"use client";

import { useState } from "react";
import GestionPipeline from "@/components/GestionPipeline";
import DonateursPipeline from "@/components/DonateursPipeline";
import type { Prospect } from "@/lib/pipeline";
import type { Don } from "@/components/GestionDons";

export default function PipelineTabs({
  prospects,
  dons,
}: {
  prospects: Prospect[];
  dons: Don[];
}) {
  const [vue, setVue] = useState<"donateurs" | "suivi">("donateurs");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        <button
          type="button"
          onClick={() => setVue("donateurs")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            vue === "donateurs" ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
          }`}
        >
          Donateurs (depuis les dons)
        </button>
        <button
          type="button"
          onClick={() => setVue("suivi")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            vue === "suivi" ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
          }`}
        >
          Suivi manuel
        </button>
      </div>

      {vue === "donateurs" ? <DonateursPipeline donsInit={dons} /> : <GestionPipeline prospects={prospects} />}
    </div>
  );
}

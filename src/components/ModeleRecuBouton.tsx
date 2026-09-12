"use client";

import { useState } from "react";
import ModeleRecuDialog from "./ModeleRecuDialog";
import type { ModeleRecuRow } from "@/lib/modeleRecu";

export default function ModeleRecuBouton({
  initial,
  className,
}: {
  initial: ModeleRecuRow | null;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={className ?? "rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"}
      >
        Modèle de reçu
      </button>
      {ouvert && <ModeleRecuDialog initial={initial} onFermer={() => setOuvert(false)} />}
    </>
  );
}

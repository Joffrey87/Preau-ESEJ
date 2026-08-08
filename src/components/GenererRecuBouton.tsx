"use client";

import { useState } from "react";
import { genererRecuDocx, type DonPourRecu } from "@/lib/recu";

export default function GenererRecuBouton({ don }: { don: DonPourRecu }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function generer() {
    setErreur(null);
    setBusy(true);
    try {
      await genererRecuDocx(don);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Génération impossible.");
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={generer}
        disabled={busy}
        className="text-accent hover:underline disabled:opacity-50"
      >
        {busy ? "…" : "Générer le reçu"}
      </button>
      {erreur && <span className="text-xs text-negative">{erreur}</span>}
    </span>
  );
}

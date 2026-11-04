"use client";

import { useEffect } from "react";

/** Erreur inattendue dans une page : message en français et bouton « Recharger » (au lieu de la page générique). */
export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Cette page n&apos;a pas pu s&apos;afficher</h1>
      <p className="text-sm text-muted">
        Un incident passager est survenu (connexion interrompue ou mise à jour du site). Rechargez la page ; si le problème persiste,
        prévenez le webmestre{error.digest ? ` en indiquant le code ${error.digest}` : ""}.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            reset();
            window.location.reload();
          }}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Recharger
        </button>
        <button type="button" onClick={() => window.history.back()} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">
          Retour
        </button>
      </div>
    </div>
  );
}

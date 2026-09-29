"use client";

import { useState } from "react";
import { useCoffre } from "@/components/CoffreProvider";

/**
 * Déverrouillage du coffre « en place » : un bouton qui se transforme en champ
 * de saisie du code, sans passer par la page Paramètres. À poser sur toute page
 * touchant aux données chiffrées (dons, donateurs, reçus).
 */
export default function DeverrouillerCoffre({ label = "🔓 Déverrouiller" }: { label?: string }) {
  const { ouvrir } = useCoffre();
  const [champOuvert, setChampOuvert] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setErr(null);
    setBusy(true);
    try {
      await ouvrir(code);
      // Succès : le coffre est ouvert → le composant parent se recompose et
      // masque en général ce bloc. On nettoie par sécurité.
      setCode("");
      setChampOuvert(false);
    } catch {
      setErr("Code incorrect.");
    } finally {
      setBusy(false);
    }
  }

  if (!champOuvert) {
    return (
      <button
        type="button"
        onClick={() => setChampOuvert(true)}
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
      >
        {label}
      </button>
    );
  }

  return (
    <form onSubmit={valider} className="flex flex-wrap items-center gap-2">
      <input
        type="password"
        autoFocus
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setErr(null);
        }}
        placeholder="Code du coffre"
        className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "…" : "Ouvrir"}
      </button>
      <button
        type="button"
        onClick={() => {
          setChampOuvert(false);
          setErr(null);
          setCode("");
        }}
        className="text-muted hover:text-foreground"
        aria-label="Annuler"
      >
        ✕
      </button>
      {err && <span className="text-xs text-negative">{err}</span>}
    </form>
  );
}

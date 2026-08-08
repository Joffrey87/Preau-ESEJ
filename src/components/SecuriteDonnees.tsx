"use client";

import { useState } from "react";
import { useCoffre } from "@/components/CoffreProvider";
import { inputCls } from "@/components/GestionComptes";

export default function SecuriteDonnees() {
  const coffre = useCoffre();
  const [phrase, setPhrase] = useState("");
  const [phrase2, setPhrase2] = useState("");
  const [secret, setSecret] = useState("");
  const [codeAffiche, setCodeAffiche] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function configurer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (phrase.length < 8) return setError("Choisissez une phrase d'au moins 8 caractères.");
    if (phrase !== phrase2) return setError("Les deux phrases ne correspondent pas.");
    setBusy(true);
    try {
      const code = await coffre.configurer(phrase);
      setCodeAffiche(code);
      setPhrase("");
      setPhrase2("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de la configuration.");
    } finally {
      setBusy(false);
    }
  }

  async function ouvrir(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await coffre.ouvrir(secret.trim());
      setSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ouverture impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Sécurité des données donateurs</h2>
        <EtatBadge charge={coffre.charge} configure={coffre.estConfigure} ouvert={coffre.estOuvert} />
      </div>
      <p className="mt-1 text-xs text-muted">
        Chiffre les informations personnelles des donateurs (nom, adresse…) avec une phrase secrète que
        vous seul connaissez. Sans elle, la base ne contient que des données illisibles.
      </p>

      {/* Code de secours à noter (affiché une seule fois) */}
      {codeAffiche && (
        <div className="mt-4 rounded-lg border border-gold bg-gold-soft/50 p-4">
          <p className="text-sm font-semibold text-gold">Notez votre code de secours maintenant</p>
          <p className="mt-1 text-xs text-muted">
            Il ne sera <strong>plus jamais affiché</strong>. Rangez-le en lieu sûr (gestionnaire de mots de
            passe, coffre). Il permet de récupérer l&apos;accès si vous perdez la phrase secrète.
          </p>
          <div className="mt-3 select-all rounded-md border border-border bg-background px-4 py-3 text-center font-mono text-lg tracking-widest">
            {codeAffiche}
          </div>
          <button
            type="button"
            onClick={() => setCodeAffiche(null)}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            J&apos;ai noté le code
          </button>
        </div>
      )}

      {!coffre.charge ? (
        <p className="mt-4 text-sm text-muted">Chargement…</p>
      ) : !coffre.estConfigure && !codeAffiche ? (
        // --- Première configuration ---
        <form onSubmit={configurer} className="mt-4 max-w-sm space-y-3">
          <div className="rounded-lg bg-negative/5 px-3 py-2 text-xs text-muted">
            ⚠️ Si vous perdez <strong>à la fois</strong> la phrase et le code de secours, les données
            donateurs seront définitivement illisibles — personne ne pourra les récupérer.
          </div>
          <input type="password" autoComplete="new-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} className={inputCls} placeholder="Phrase secrète (8 caractères min.)" />
          <input type="password" autoComplete="new-password" value={phrase2} onChange={(e) => setPhrase2(e.target.value)} className={inputCls} placeholder="Confirmer la phrase secrète" />
          {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? "Configuration…" : "Activer le chiffrement"}
          </button>
        </form>
      ) : coffre.estOuvert ? (
        // --- Coffre ouvert ---
        <div className="mt-4 flex items-center gap-3">
          <p className="text-sm text-positive">Coffre déverrouillé — les données donateurs sont lisibles sur cet appareil.</p>
          <button type="button" onClick={coffre.verrouiller} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
            Verrouiller
          </button>
        </div>
      ) : (
        // --- Coffre configuré mais verrouillé ---
        <form onSubmit={ouvrir} className="mt-4 max-w-sm space-y-3">
          <input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} className={inputCls} placeholder="Phrase secrète ou code de secours" />
          {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? "Ouverture…" : "Déverrouiller"}
          </button>
        </form>
      )}
    </section>
  );
}

function EtatBadge({ charge, configure, ouvert }: { charge: boolean; configure: boolean; ouvert: boolean }) {
  if (!charge) return null;
  const [txt, cls] = !configure
    ? ["Non configuré", "bg-surface-2 text-muted"]
    : ouvert
      ? ["Déverrouillé", "bg-positive/10 text-positive"]
      : ["Verrouillé", "bg-gold-soft text-gold"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{txt}</span>;
}

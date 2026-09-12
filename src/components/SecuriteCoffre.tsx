"use client";

import { useState } from "react";
import type { CoffreCtx } from "@/lib/coffreContexte";
import { inputCls } from "@/components/GestionComptes";

/**
 * Panneau de gestion d'un coffre : première configuration, déverrouillage,
 * changement de phrase et régénération du code de secours. Générique — il sert
 * au coffre des dons comme à celui du carnet d'adresses.
 */
export default function SecuriteCoffre({
  coffre,
  titre,
  description,
  perte,
  placeholderPhrase = "Phrase secrète (8 caractères min.)",
}: {
  coffre: CoffreCtx;
  titre: string;
  description: string;
  perte: string;
  placeholderPhrase?: string;
}) {
  const [phrase, setPhrase] = useState("");
  const [phrase2, setPhrase2] = useState("");
  const [secret, setSecret] = useState("");
  const [codeAffiche, setCodeAffiche] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [panneau, setPanneau] = useState<"phrase" | "code" | "verif" | null>(null);
  const [confirmeCode, setConfirmeCode] = useState(false);
  const [aVerifier, setAVerifier] = useState("");
  const [verdict, setVerdict] = useState<null | boolean>(null);

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

  async function changerLaPhrase(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (phrase.length < 8) return setError("Choisissez une phrase d'au moins 8 caractères.");
    if (phrase !== phrase2) return setError("Les deux phrases ne correspondent pas.");
    setBusy(true);
    try {
      await coffre.changerPhrase(phrase);
      setPhrase("");
      setPhrase2("");
      setPanneau(null);
      setInfo("Phrase secrète modifiée. Votre code de secours reste valable.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Changement impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function verifierLeSecret(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      setVerdict(await coffre.verifier(aVerifier.trim()));
    } finally {
      setBusy(false);
    }
  }

  async function regenerer() {
    setError(null);
    setBusy(true);
    try {
      const code = await coffre.regenererCodeSecours();
      setCodeAffiche(code);
      setPanneau(null);
      setConfirmeCode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Régénération impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{titre}</h2>
        <EtatBadge charge={coffre.charge} configure={coffre.estConfigure} ouvert={coffre.estOuvert} />
      </div>
      <p className="mt-1 text-xs text-muted">{description}</p>

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
          <div className="rounded-lg bg-negative/5 px-3 py-2 text-xs text-muted">⚠️ {perte}</div>
          <input type="password" autoComplete="new-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} className={inputCls} placeholder={placeholderPhrase} />
          <input type="password" autoComplete="new-password" value={phrase2} onChange={(e) => setPhrase2(e.target.value)} className={inputCls} placeholder="Confirmer la phrase secrète" />
          {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? "Configuration…" : "Activer le chiffrement"}
          </button>
        </form>
      ) : coffre.estOuvert ? (
        // --- Coffre ouvert : état + actions de maintenance des secrets ---
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-positive">Coffre déverrouillé — les données sont lisibles sur cet appareil.</p>
            <button type="button" onClick={coffre.verrouiller} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
              Verrouiller
            </button>
          </div>

          {info && <p className="rounded-lg bg-positive/10 px-3 py-2 text-sm text-positive">{info}</p>}

          <div className="rounded-lg border border-border bg-surface-2/40 p-4">
            <h3 className="text-sm font-semibold">Gérer les secrets d&apos;accès</h3>
            <p className="mt-1 text-xs text-muted">
              Ces opérations ré-emballent la clé du coffre : les données chiffrées ne sont pas réécrites,
              et les deux secrets sont indépendants l&apos;un de l&apos;autre.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setPanneau(panneau === "phrase" ? null : "phrase"); setError(null); setInfo(null); }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Changer la phrase secrète
              </button>
              <button
                type="button"
                onClick={() => { setPanneau(panneau === "code" ? null : "code"); setError(null); setInfo(null); setConfirmeCode(false); }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Régénérer le code de secours
              </button>
              <button
                type="button"
                onClick={() => { setPanneau(panneau === "verif" ? null : "verif"); setError(null); setInfo(null); setVerdict(null); setAVerifier(""); }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Vérifier mon code de secours
              </button>
            </div>

            {panneau === "verif" && (
              <form onSubmit={verifierLeSecret} className="mt-4 max-w-sm space-y-3">
                <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                  Test à blanc : le code n&apos;est <strong>ni consommé, ni modifié</strong>, et rien
                  n&apos;est écrit. Le vrai risque n&apos;est pas qu&apos;un code fuite, c&apos;est de
                  découvrir trop tard qu&apos;il ne fonctionne plus.
                </div>
                <input
                  type="text"
                  autoComplete="off"
                  value={aVerifier}
                  onChange={(e) => { setAVerifier(e.target.value); setVerdict(null); }}
                  className={`${inputCls} font-mono tracking-wider`}
                  placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
                />
                {verdict === true && (
                  <p className="rounded-lg bg-positive/10 px-3 py-2 text-sm text-positive">
                    ✓ Ce secret ouvre bien le coffre. Rangez-le en lieu sûr.
                  </p>
                )}
                {verdict === false && (
                  <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
                    ✕ Ce secret n&apos;ouvre pas le coffre. Vérifiez la saisie, ou régénérez un code
                    tant que le coffre est ouvert.
                  </p>
                )}
                <button type="submit" disabled={busy || !aVerifier.trim()} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
                  {busy ? "Vérification…" : "Vérifier"}
                </button>
              </form>
            )}

            {panneau === "phrase" && (
              <form onSubmit={changerLaPhrase} className="mt-4 max-w-sm space-y-3">
                <div className="rounded-lg bg-positive/5 px-3 py-2 text-xs text-muted">
                  Votre <strong>code de secours actuel restera valable</strong> : seule la phrase est remplacée.
                </div>
                <input type="password" autoComplete="new-password" value={phrase} onChange={(e) => setPhrase(e.target.value)} className={inputCls} placeholder="Nouvelle phrase secrète (8 caractères min.)" />
                <input type="password" autoComplete="new-password" value={phrase2} onChange={(e) => setPhrase2(e.target.value)} className={inputCls} placeholder="Confirmer la nouvelle phrase" />
                {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
                <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
                  {busy ? "Modification…" : "Changer la phrase"}
                </button>
              </form>
            )}

            {panneau === "code" && (
              <div className="mt-4 max-w-sm space-y-3">
                <div className="rounded-lg bg-negative/5 px-3 py-2 text-xs text-muted">
                  ⚠️ Le code de secours actuel sera <strong>définitivement invalidé</strong> et remplacé par
                  un nouveau, affiché une seule fois. Votre phrase secrète n&apos;est pas modifiée.
                </div>
                <label className="flex items-start gap-2 text-xs text-muted">
                  <input type="checkbox" checked={confirmeCode} onChange={(e) => setConfirmeCode(e.target.checked)} className="mt-0.5" />
                  <span>Je comprends que mon code de secours actuel cessera de fonctionner.</span>
                </label>
                {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>}
                <button type="button" onClick={regenerer} disabled={busy || !confirmeCode} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
                  {busy ? "Génération…" : "Générer un nouveau code"}
                </button>
              </div>
            )}
          </div>
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

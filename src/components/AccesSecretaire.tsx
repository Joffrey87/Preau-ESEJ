"use client";

import { useState } from "react";
import { useCoffre } from "@/components/CoffreProvider";

/**
 * Accès du secrétaire aux données donateurs, pour la page « Courriers à confirmer » : un code qui lui est propre
 * ouvre le coffre (la clé est emballée une troisième fois). Il ne connaît ni la phrase ni le code de secours,
 * et la base ne lui montre que les reçus à poster qui lui ont été remis. Se génère et se retire ici.
 */
export default function AccesSecretaire() {
  const coffre = useCoffre();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!coffre.estConfigure) return null;

  async function generer() {
    if (coffre.aCodeSecretaire && !window.confirm("Un code existe déjà : en générer un nouveau invalide l'ancien. Continuer ?")) return;
    setBusy(true);
    setErreur(null);
    try {
      setCode(await coffre.definirCodeSecretaire());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec.");
    } finally {
      setBusy(false);
    }
  }

  async function retirer() {
    if (!window.confirm("Retirer l'accès du secrétaire aux données donateurs ? Son code ne fonctionnera plus.")) return;
    setBusy(true);
    setErreur(null);
    try {
      await coffre.retirerCodeSecretaire();
      setCode(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Échec.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Accès du secrétaire (courriers à confirmer)</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${coffre.aCodeSecretaire ? "bg-positive/15 text-positive" : "bg-surface-2 text-muted"}`}>
          {coffre.aCodeSecretaire ? "Code actif" : "Aucun code"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Le secrétaire ouvre le coffre avec son propre code et ne voit que les reçus à poster qui lui ont été remis (nom, adresse, reçu avec lettre). Il ne connaît
        ni la phrase secrète ni le code de secours. Le coffre doit être ouvert pour générer ou retirer ce code.
      </p>
      {code && (
        <div className="mt-3 rounded-lg border border-gold bg-gold-soft/50 p-4">
          <p className="text-sm font-semibold text-gold">Transmettez ce code au secrétaire maintenant</p>
          <p className="mt-1 text-xs text-muted">Il ne sera plus jamais affiché. En générer un autre invalide celui-ci.</p>
          <div className="mt-3 select-all rounded-md border border-border bg-background px-4 py-3 text-center font-mono text-lg tracking-widest">{code}</div>
          <button type="button" onClick={() => setCode(null)} className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
            J&apos;ai transmis le code
          </button>
        </div>
      )}
      {erreur && <p className="mt-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={generer}
          disabled={busy || !coffre.estOuvert}
          title={coffre.estOuvert ? undefined : "Déverrouillez le coffre d'abord"}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          {coffre.aCodeSecretaire ? "Générer un nouveau code" : "Générer le code du secrétaire"}
        </button>
        {coffre.aCodeSecretaire && (
          <button type="button" onClick={retirer} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-negative hover:bg-negative/10 disabled:opacity-50">
            Retirer l&apos;accès
          </button>
        )}
      </div>
    </section>
  );
}

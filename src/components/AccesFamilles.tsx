"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";

type Acces = {
  id: string;
  nom: string;
  identifiant: string;
  courriel1: string | null;
  courriel2: string | null;
  compte: boolean;
  derniere_connexion: string | null;
  demande_raz: boolean;
};

/**
 * Accès des familles à leur espace (trésorier, administrateur). Chaque famille se connecte avec son nom de famille et
 * un mot de passe (le même pour Monsieur et Madame). Ici, le bureau génère le lien d'invitation (ou de réinitialisation)
 * à transmettre par sa messagerie : la famille y choisit son mot de passe.
 */
export default function AccesFamilles() {
  const [liste, setListe] = useState<Acces[] | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [lien, setLien] = useState<{ nom: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const charger = useCallback(async () => {
    const { data, error } = await createClient().rpc("acces_familles");
    // Réservé au trésorier et aux administrateurs : pour les autres profils, le panneau n'apparaît pas.
    setListe(error ? null : ((data as Acces[]) ?? []));
  }, []);

  useEffect(() => {
    // Lecture initiale (système externe : la base).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
  }, [charger]);

  async function inviter(f: Acces) {
    setBusy(f.id);
    setErreur(null);
    setCopie(false);
    const { data, error } = await createClient().rpc("inviter_famille", { p_famille: f.id });
    setBusy(null);
    if (error) return setErreur(error.message);
    setLien({ nom: f.nom, url: `${window.location.origin}/auth/invitation?code=${encodeURIComponent(data as string)}` });
    void charger();
  }

  async function copier() {
    if (!lien) return;
    try {
      await navigator.clipboard.writeText(lien.url);
      setCopie(true);
    } catch {
      setCopie(false);
    }
  }

  if (!liste) return null;
  const demandes = liste.filter((f) => f.demande_raz).length;
  const avecCompte = liste.filter((f) => f.compte).length;
  const tri = [...liste].sort((a, b) => Number(b.demande_raz) - Number(a.demande_raz) || a.nom.localeCompare(b.nom, "fr"));

  return (
    <section className={`mb-5 rounded-xl border p-4 ${demandes > 0 ? "border-gold/50 bg-gold/15" : "border-border bg-surface"}`}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="flex w-full items-center justify-between text-left">
        <h2 className="text-sm font-semibold">
          Accès des familles à leur espace — {avecCompte} / {liste.length} comptes
          {demandes > 0 && (
            <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs font-medium text-white">
              {demandes} demande{demandes > 1 ? "s" : ""} de réinitialisation
            </span>
          )}
        </h2>
        <span className="text-xs text-muted">{ouvert ? "Masquer" : "Afficher"}</span>
      </button>
      {ouvert && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">
            Connexion : nom de famille + mot de passe (commun à Monsieur et Madame). « Inviter » génère un lien personnel, valable 14 jours, à leur
            transmettre : ils y vérifient leurs adresses et choisissent leur mot de passe. Même chose pour réinitialiser un mot de passe oublié.
          </p>
          {lien && (
            <div className="rounded-lg border border-accent/40 bg-accent-soft/40 p-3 text-xs">
              <div className="mb-1 font-medium">Lien pour la famille {lien.nom} (affiché une seule fois) :</div>
              <input readOnly value={lien.url} onFocus={(e) => e.currentTarget.select()} className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-[11px]" />
              <div className="mt-2 flex items-center gap-3">
                <button type="button" onClick={() => void copier()} className="rounded bg-accent px-2.5 py-1 font-medium text-accent-fg hover:opacity-90">
                  {copie ? "Copié ✓" : "Copier le lien"}
                </button>
                <button type="button" onClick={() => setLien(null)} className="text-muted underline hover:text-foreground">
                  Fermer
                </button>
              </div>
            </div>
          )}
          {erreur && <p className="text-xs text-negative">{erreur}</p>}
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {tri.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="w-32 shrink-0 font-medium">{f.nom}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${f.compte ? "bg-positive/15 text-positive" : "bg-surface-2 text-muted"}`}>
                  {f.compte ? "compte créé" : "pas de compte"}
                </span>
                {f.demande_raz && <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-medium text-white">à réinitialiser</span>}
                <span className="min-w-0 flex-1 truncate text-xs text-muted">
                  {[f.courriel1, f.courriel2].filter(Boolean).join(" · ") || "aucune adresse connue"}
                  {f.derniere_connexion && ` · dernière connexion ${formatDate(f.derniere_connexion.slice(0, 10))}`}
                </span>
                <button
                  type="button"
                  onClick={() => void inviter(f)}
                  disabled={busy !== null}
                  className="rounded border border-border px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50"
                >
                  {busy === f.id ? "…" : f.compte ? "Nouveau lien" : "Inviter"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Personne enregistrée côté Webmestre (acces_personnes), avec ses rattachements aux sources réelles. */
export type PersonneAcces = {
  id: string;
  nom: string;
  note: string | null;
  prenom: string | null;
  famille_id: string | null;
  contact_id: string | null;
  enseignant_id: string | null;
  evenement_membre_id: string | null;
  prenom_recherche: string | null;
};

export type MembreReel = { ref: string; prenom: string | null; nom: string | null; libelle?: string; famille?: string | null; compte?: boolean; actif?: boolean; identifiant?: string };
export type Annuaire = { evenement: MembreReel[]; recherche: MembreReel[]; professeur: MembreReel[] };

type Resultat = { source: string; ref: string; prenom: string | null; nom: string | null; detail: string };

const SOURCES: Record<string, string> = {
  famille: "Famille",
  contact: "Carnet d’adresses",
  enseignant: "Professeur",
  evenement: "Événement",
  recherche: "Recherche de fonds",
};

/** Dialogue d'attribution d'un rôle Administration : recherche (familles d'abord), ou création de la personne. */
export function DialogueAttribution({
  roleLabel,
  titulaireActuel,
  onChoisir,
  onFermer,
}: {
  roleLabel: string;
  titulaireActuel: string | null;
  onChoisir: (choix: { source: string; ref: string | null; prenom: string | null; nom: string | null }) => Promise<boolean>;
  onFermer: () => void;
}) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<Resultat[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  // Famille choisie sans prénom connu : on demande le prénom de la personne précise.
  const [famille, setFamille] = useState<Resultat | null>(null);
  const [prenomFamille, setPrenomFamille] = useState("");
  const [creation, setCreation] = useState<{ prenom: string; nom: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    const terme = q.trim();
    if (terme.length < 2) return;
    let annule = false;
    const t = setTimeout(async () => {
      setChargement(true);
      const { data, error } = await createClient().rpc("acces_rechercher", { p_q: terme });
      if (annule) return;
      setChargement(false);
      if (error) setErreur(error.message);
      else setResultats((data ?? []) as Resultat[]);
    }, 250);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [q]);

  async function choisir(source: string, ref: string | null, prenom: string | null, nom: string | null) {
    setEnvoi(true);
    setErreur("");
    const ok = await onChoisir({ source, ref, prenom, nom });
    setEnvoi(false);
    if (ok) onFermer();
  }

  const visibles = q.trim().length >= 2 ? resultats : [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onFermer}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">{roleLabel}</h3>
            <p className="text-xs text-muted">
              Titulaire actuel : {titulaireActuel ?? "personne"} · un seul titulaire par rôle, le précédent est remplacé.
            </p>
          </div>
          <button type="button" onClick={onFermer} className="text-sm text-muted hover:text-foreground" aria-label="Fermer">✕</button>
        </div>

        {famille ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void choisir("famille", famille.ref, prenomFamille.trim() || null, famille.nom);
            }}
          >
            <p className="text-sm">
              Quelle personne de la <strong>{famille.detail}</strong> ?
            </p>
            <input autoFocus value={prenomFamille} onChange={(e) => setPrenomFamille(e.target.value)} placeholder="Prénom" className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm" />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFamille(null)} className="rounded px-3 py-1 text-sm text-muted">Retour</button>
              <button type="submit" disabled={envoi} className="rounded bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-50">Attribuer</button>
            </div>
          </form>
        ) : creation ? (
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void choisir("nouveau", null, creation.prenom.trim() || null, creation.nom.trim() || null);
            }}
          >
            <p className="text-sm">Nouvelle personne : sa fiche sera aussi créée dans le Carnet d’adresses.</p>
            <div className="flex gap-2">
              <input autoFocus value={creation.prenom} onChange={(e) => setCreation({ ...creation, prenom: e.target.value })} placeholder="Prénom" className="flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm" />
              <input value={creation.nom} onChange={(e) => setCreation({ ...creation, nom: e.target.value })} placeholder="Nom" className="flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCreation(null)} className="rounded px-3 py-1 text-sm text-muted">Retour</button>
              <button type="submit" disabled={envoi || !(creation.prenom.trim() || creation.nom.trim())} className="rounded bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-50">
                Créer et attribuer
              </button>
            </div>
          </form>
        ) : (
          <>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un nom ou un prénom…"
              className="mt-4 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
            <ul className="mt-2 max-h-80 divide-y divide-border overflow-y-auto">
              {visibles.map((r, i) => (
                <li key={`${r.source}-${r.ref}-${r.prenom ?? ""}-${i}`}>
                  <button
                    type="button"
                    disabled={envoi}
                    onClick={() => {
                      if (r.source === "famille" && !r.prenom) {
                        setPrenomFamille("");
                        setFamille(r);
                      } else void choisir(r.source, r.ref, r.prenom, r.nom);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  >
                    <span>{[r.prenom, r.nom].filter(Boolean).join(" ") || r.detail}</span>
                    <span className="text-[11px] text-muted">{r.source === "famille" ? r.detail : SOURCES[r.source] ?? r.detail}</span>
                  </button>
                </li>
              ))}
              {q.trim().length >= 2 && !chargement && visibles.length === 0 && <li className="px-2 py-2 text-xs text-muted">Personne ne correspond.</li>}
            </ul>
            {q.trim().length >= 2 && !chargement && (
              <button
                type="button"
                onClick={() => {
                  const mots = q.trim().split(/\s+/);
                  setCreation({ prenom: mots.length > 1 ? mots[0] : "", nom: mots.length > 1 ? mots.slice(1).join(" ") : mots[0] });
                }}
                className="mt-2 text-sm text-accent hover:underline"
              >
                + Créer « {q.trim()} » (et sa fiche dans le Carnet d’adresses)
              </button>
            )}
          </>
        )}
        {erreur && <p className="mt-3 text-sm text-red-600">{erreur}</p>}
      </div>
    </div>
  );
}

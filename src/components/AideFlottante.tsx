"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import FenetreFicheActivee from "@/components/FenetreFicheActivee";
import {
  COLONNES_ACTIVEE,
  COLONNES_FICHE,
  PERIODICITES,
  activeSurOnglet,
  ficheDepuisBase,
  ongletDe,
  pourProfil,
  rechercherFiches,
  type FicheActivee,
  type FicheAide,
} from "@/lib/fichesAide";

/** Ampoule éclairée : globe teinté et rayons, dessinée comme les autres icônes de Préau. */
export function IconeAmpoule({ className = "h-6 w-6" }: { className?: string }) {
  const globe = "M12 6.5a5 5 0 0 0-3.2 8.8c.5.4.8 1.1.8 1.8v.4h4.8v-.4c0-.7.3-1.4.8-1.8A5 5 0 0 0 12 6.5Z";
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={globe} fill="currentColor" fillOpacity={0.25} />
      <path d="M9.6 20h4.8M10.6 22.3h2.8" />
      <path d="M12 1.6v2.1M4.7 4.6l1.5 1.5M19.3 4.6l-1.5 1.5M2.2 11.7h2.1M19.7 11.7h2.1" />
    </svg>
  );
}

const CLE_FENETRES = "aide.fenetres";

/**
 * Bouton « Aide Processus » flottant en bas à droite de chaque page. Il ouvre
 * la recherche dans les fiches d'aide de l'onglet (et celles qu'il partage avec
 * d'autres onglets), montre les fiches activées — pastille ambre — et rappelle
 * leurs fenêtres d'étapes à cocher.
 */
export default function AideFlottante({
  profil,
  peutGerer = false,
  familleId = null,
}: {
  /** Slug du profil connecté (tresorier, president…, famille). */
  profil: string;
  /** Bureau : lien vers l'onglet Processus (toutes les fiches, édition). */
  peutGerer?: boolean;
  /** Compte famille : permet de suggérer une fiche. */
  familleId?: string | null;
}) {
  const pathname = usePathname();
  const onglet = ongletDe(pathname);
  const [ouvert, setOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [vue, setVue] = useState<FicheAide | null>(null);
  const [fiches, setFiches] = useState<FicheAide[]>([]);
  const [activees, setActivees] = useState<FicheActivee[]>([]);
  const [fenetres, setFenetres] = useState<string[]>([]);
  const [suggestion, setSuggestion] = useState<{ titre: string; texte: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toutes, setToutes] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  const charger = useCallback(async () => {
    const supabase = createClient();
    const [f, a] = await Promise.all([
      supabase.from("fiches_aide").select(COLONNES_FICHE).eq("statut", "publiee").is("supprime_le", null),
      supabase.from("fiches_aide_activees").select(COLONNES_ACTIVEE).is("terminee_le", null).is("archivee_le", null),
    ]);
    setFiches(((f.data ?? []) as Record<string, unknown>[]).map(ficheDepuisBase));
    setActivees((a.data ?? []) as FicheActivee[]);
  }, []);

  useEffect(() => {
    // Chargement initial depuis la base et des fenêtres ouvertes (session).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void charger();
    try {
      const v = JSON.parse(sessionStorage.getItem(CLE_FENETRES) ?? "[]");
      if (Array.isArray(v)) setFenetres(v);
    } catch {}
  }, [charger]);

  const memoriserFenetres = (ids: string[]) => {
    setFenetres(ids);
    try {
      sessionStorage.setItem(CLE_FENETRES, JSON.stringify(ids));
    } catch {}
  };
  const ouvrirFenetre = (id: string) => memoriserFenetres([...new Set([...fenetres, id])]);
  const fermerFenetre = (id: string) => memoriserFenetres(fenetres.filter((x) => x !== id));

  useEffect(() => {
    if (ouvert && !vue) champ.current?.focus();
  }, [ouvert, vue]);

  // Fiches de l'onglet (y compris celles partagées avec d'autres onglets).
  const duProfil = useMemo(() => fiches.filter((f) => pourProfil(f, profil)), [fiches, profil]);
  const deLOnglet = useMemo(() => duProfil.filter((f) => f.onglets.includes(onglet)), [duProfil, onglet]);
  // Sans mots-clés : trois suggestions (échéance la plus proche d'abord, puis
  // les fiches périodiques), ou toutes les fiches de l'onglet sur demande.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const parPertinence = [...deLOnglet].sort((a, b) => {
    const ea = a.date_echeance && a.date_echeance >= aujourdhui ? a.date_echeance : "9999";
    const eb = b.date_echeance && b.date_echeance >= aujourdhui ? b.date_echeance : "9999";
    const pa = a.periodicite && a.periodicite !== "ponctuelle" ? 0 : 1;
    const pb = b.periodicite && b.periodicite !== "ponctuelle" ? 0 : 1;
    return ea.localeCompare(eb) || pa - pb || a.titre.localeCompare(b.titre, "fr");
  });
  const resultats = recherche.trim()
    ? rechercherFiches(deLOnglet, recherche)
    : toutes
      ? [...deLOnglet].sort((a, b) => a.titre.localeCompare(b.titre, "fr"))
      : parPertinence.slice(0, 3);
  const ailleurs = recherche.trim() ? rechercherFiches(duProfil.filter((f) => !f.onglets.includes(onglet)), recherche) : [];
  const activeesIci = activees.filter((a) => activeSurOnglet(a, onglet));

  async function activer(f: FicheAide) {
    setOccupe(true);
    const { data, error } = await createClient()
      .from("fiches_aide_activees")
      .insert({
        fiche_id: f.id,
        titre: f.titre,
        etapes: f.etapes.map((texte) => ({ texte, fait: false, fait_le: null })),
        onglet,
        onglets: f.onglets,
      })
      .select(COLONNES_ACTIVEE)
      .single();
    setOccupe(false);
    if (error || !data) return setMessage("Activation impossible : " + (error?.message ?? "erreur inconnue"));
    setActivees((p) => [...p, data as FicheActivee]);
    ouvrirFenetre((data as FicheActivee).id);
    setVue(null);
    setOuvert(false);
  }

  async function envoyerSuggestion() {
    if (!suggestion || !familleId) return;
    if (!suggestion.titre.trim()) return setMessage("Indiquez un titre.");
    setOccupe(true);
    const { error } = await createClient()
      .from("fiches_aide")
      .insert({
        titre: suggestion.titre.trim(),
        etapes: suggestion.texte.split("\n").map((l) => l.trim()).filter(Boolean),
        onglets: [onglet],
        profils: ["famille"],
        statut: "suggeree",
        suggere_famille: familleId,
      });
    setOccupe(false);
    if (error) return setMessage("Envoi impossible : " + error.message);
    setSuggestion(null);
    setMessage("Merci : votre suggestion sera relue par l'école avant publication.");
  }

  const majActivee = (a: FicheActivee) => setActivees((p) => p.map((x) => (x.id === a.id ? a : x)));
  const retirerActivee = (id: string) => {
    setActivees((p) => p.filter((x) => x.id !== id));
    fermerFenetre(id);
  };

  return (
    <>
      {/* Fenêtres des fiches activées, sur les onglets qu'elles concernent. */}
      {activeesIci
        .filter((a) => fenetres.includes(a.id))
        .map((a, k) => (
          <FenetreFicheActivee
            key={a.id}
            fiche={a}
            rang={k}
            onChange={majActivee}
            onFermer={() => fermerFenetre(a.id)}
            onRetirer={() => retirerActivee(a.id)}
          />
        ))}

      {ouvert && (
        <div
          role="dialog"
          aria-label="Fiches d'aide"
          className="fixed bottom-24 right-5 z-50 flex max-h-[70vh] w-[min(26rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-xl shadow-black/20"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <IconeAmpoule className="h-5 w-5 text-[#c8952f]" />
              Fiches d&apos;aide
            </div>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="rounded p-1 text-muted hover:bg-surface-2">
              ✕
            </button>
          </div>

          {vue ? (
            <DetailFiche fiche={vue} onRetour={() => setVue(null)} onActiver={() => activer(vue)} occupe={occupe} peutGerer={peutGerer} />
          ) : suggestion ? (
            <div className="space-y-2 overflow-y-auto p-4 text-sm">
              <p className="text-muted">Proposez une fiche d&apos;aide : l&apos;école la relira avant de la publier.</p>
              <input
                value={suggestion.titre}
                onChange={(e) => setSuggestion({ ...suggestion, titre: e.target.value })}
                placeholder="Titre de la fiche"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
              />
              <textarea
                value={suggestion.texte}
                onChange={(e) => setSuggestion({ ...suggestion, texte: e.target.value })}
                rows={6}
                placeholder="Une étape par ligne"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSuggestion(null)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">
                  Annuler
                </button>
                <button type="button" disabled={occupe} onClick={envoyerSuggestion} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg disabled:opacity-50">
                  Envoyer
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-col">
              <div className="px-4 pt-3">
                <input
                  id="aide-recherche"
                  ref={champ}
                  type="search"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && (recherche ? setRecherche("") : setOuvert(false))}
                  placeholder="Tapez des mots-clés"
                  aria-label="Tapez des mots-clés"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 text-sm">
                {activeesIci.length > 0 && (
                  <div className="mb-2 rounded-xl border border-amber-500/40 bg-amber-50 p-2 dark:bg-amber-900/20">
                    <div className="px-1 pb-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Fiches activées ({activeesIci.length})
                    </div>
                    {activeesIci.map((a) => {
                      const faites = a.etapes.filter((e) => e.fait).length;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            ouvrirFenetre(a.id);
                            setOuvert(false);
                          }}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-amber-100/70 dark:hover:bg-amber-900/30"
                        >
                          <span className="truncate">{a.titre}</span>
                          <span className="shrink-0 text-xs tabular-nums text-amber-700 dark:text-amber-300">
                            {faites}/{a.etapes.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!recherche.trim() && !toutes && resultats.length > 0 && (
                  <div className="px-2 pb-1 text-xs text-muted">Suggestions :</div>
                )}
                {resultats.length === 0 ? (
                  recherche.trim() ? <p className="px-2 py-3 text-muted">Aucune fiche de cet onglet ne correspond.</p> : null
                ) : (
                  <ul>
                    {resultats.map((f) => (
                      <LigneFiche key={f.id} fiche={f} onClick={() => setVue(f)} />
                    ))}
                  </ul>
                )}

                {ailleurs.length > 0 && (
                  <>
                    <div className="mt-2 border-t border-border px-2 pb-1 pt-2 text-xs text-muted">Dans d&apos;autres onglets</div>
                    <ul>
                      {ailleurs.slice(0, 5).map((f) => (
                        <LigneFiche key={f.id} fiche={f} onClick={() => setVue(f)} />
                      ))}
                    </ul>
                  </>
                )}
                {message && <p className="px-2 py-2 text-xs text-muted">{message}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs">
                {deLOnglet.length > 3 && !recherche.trim() ? (
                  <button type="button" onClick={() => setToutes((v) => !v)} className="rounded-lg border border-border px-2.5 py-1 font-medium hover:bg-surface-2">
                    {toutes ? "Afficher les suggestions" : `Afficher toutes (${deLOnglet.length})`}
                  </button>
                ) : (
                  <span />
                )}
                {peutGerer ? (
                  <Link
                    href={`/processus?onglet=${encodeURIComponent(onglet)}`}
                    onClick={() => setOuvert(false)}
                    className="rounded-lg border border-border px-2.5 py-1 font-medium hover:bg-surface-2"
                  >
                    Modifier les fiches
                  </Link>
                ) : familleId ? (
                  <button type="button" onClick={() => setSuggestion({ titre: "", texte: "" })} className="rounded-lg border border-border px-2.5 py-1 font-medium hover:bg-surface-2">
                    Suggérer une fiche d&apos;aide
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOuvert((v) => !v);
          setVue(null);
          setMessage(null);
          setToutes(false);
        }}
        title="Fiches d'aide"
        aria-label="Fiches d'aide"
        aria-expanded={ouvert}
        className="no-print fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#c8952f] bg-surface text-[#c8952f] shadow-md shadow-black/15 transition-transform hover:scale-105"
      >
        <IconeAmpoule className="h-7 w-7" />
        {activeesIci.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-amber-600 px-1 text-[11px] font-semibold text-white">
            {activeesIci.length}
          </span>
        )}
      </button>
    </>
  );
}

function LigneFiche({ fiche, onClick }: { fiche: FicheAide; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
        <div className="font-medium">{fiche.titre}</div>
      </button>
    </li>
  );
}

/** Lecture d'une fiche : déclencheur, étapes, points d'attention, liens. */
export function DetailFiche({
  fiche,
  onRetour,
  onActiver,
  occupe,
  peutGerer,
}: {
  fiche: FicheAide;
  onRetour?: () => void;
  onActiver?: () => void;
  occupe?: boolean;
  peutGerer?: boolean;
}) {
  const periodicite = PERIODICITES.find((p) => p.v === fiche.periodicite)?.l;
  return (
    <div className="min-h-0 space-y-3 overflow-y-auto p-4 text-sm">
      {onRetour && (
        <button type="button" onClick={onRetour} className="text-xs text-accent hover:underline">
          ← Retour aux fiches
        </button>
      )}
      <h3 className="text-base font-semibold">{fiche.titre}</h3>
      {(periodicite || fiche.date_echeance) && (
        <p className="text-xs text-muted">
          {periodicite}
          {periodicite && fiche.date_echeance ? " · " : ""}
          {fiche.date_echeance ? `Échéance : ${formatDate(fiche.date_echeance)}` : ""}
        </p>
      )}
      {fiche.declencheur && (
        <p>
          <span className="font-medium">Quand : </span>
          {fiche.declencheur}
        </p>
      )}
      {fiche.etapes.length > 0 && (
        <ol className="list-decimal space-y-1 pl-5">
          {fiche.etapes.map((e, k) => (
            <li key={k}>{e}</li>
          ))}
        </ol>
      )}
      {fiche.points_attention && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="font-medium">Attention : </span>
          {fiche.points_attention}
        </div>
      )}
      {fiche.liens.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fiche.liens.map((l, k) => (
            <Link key={k} href={l.href} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-2">
              {l.libelle} →
            </Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {onActiver && (
          <button type="button" disabled={occupe} onClick={onActiver} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Activer cette fiche
          </button>
        )}
        {peutGerer && (
          <Link href={`/processus?fiche=${fiche.id}`} className="text-xs text-accent hover:underline">
            Modifier dans Processus
          </Link>
        )}
      </div>
    </div>
  );
}

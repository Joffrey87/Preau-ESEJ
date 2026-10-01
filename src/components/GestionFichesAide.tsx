"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { Field, FormFooter, inputCls } from "./GestionComptes";
import { DetailFiche } from "@/components/AideFlottante";
import {
  COLONNES_ACTIVEE,
  ONGLETS,
  PERIODICITES,
  PROFILS,
  libelleOnglet,
  libelleProfil,
  rechercherFiches,
  type FicheActivee,
  type FicheAide,
  type Periodicite,
} from "@/lib/fichesAide";

type Version = { id: string; action: string; contenu: FicheAide; par_role: string | null; le: string };

type Form = {
  titre: string;
  onglets: string[];
  profils: string[];
  tags: string;
  declencheur: string;
  etapes: string;
  points_attention: string;
  liens: string;
  periodicite: "" | Periodicite;
  date_echeance: string;
};

const formVide = (): Form => ({
  titre: "",
  onglets: [],
  profils: [],
  tags: "",
  declencheur: "",
  etapes: "",
  points_attention: "",
  liens: "",
  periodicite: "",
  date_echeance: "",
});

const formDepuis = (f: FicheAide): Form => ({
  titre: f.titre,
  onglets: f.onglets,
  profils: f.profils,
  tags: f.tags.join(", "),
  declencheur: f.declencheur ?? "",
  etapes: f.etapes.join("\n"),
  points_attention: f.points_attention ?? "",
  liens: f.liens.map((l) => `${l.libelle} | ${l.href}`).join("\n"),
  periodicite: f.periodicite ?? "",
  date_echeance: f.date_echeance ?? "",
});

/** Champs d'une fiche tels qu'enregistrés (formulaire ou version antérieure). */
function champsDepuisForm(f: Form) {
  return {
    titre: f.titre.trim(),
    onglets: f.onglets,
    profils: f.profils,
    tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
    declencheur: f.declencheur.trim() || null,
    etapes: f.etapes.split("\n").map((t) => t.trim()).filter(Boolean),
    points_attention: f.points_attention.trim() || null,
    liens: f.liens
      .split("\n")
      .map((l) => l.split("|").map((x) => x.trim()))
      .filter(([libelle, href]) => libelle && href)
      .map(([libelle, href]) => ({ libelle, href })),
    periodicite: f.periodicite || null,
    date_echeance: f.date_echeance || null,
  };
}

const ACTIONS: Record<string, string> = {
  creation: "Création",
  modification: "Modification",
  suppression: "Mise à la corbeille",
  restauration: "Restauration",
  publiee: "Publication",
  suggeree: "Suggestion",
  refusee: "Refus",
};

const dateHeure = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));

export default function GestionFichesAide({
  fiches,
  activees,
  familles,
  profil,
  rechercheInitiale,
  ficheInitiale,
}: {
  fiches: FicheAide[];
  activees: FicheActivee[];
  familles: { id: string; nom: string }[];
  profil: string;
  rechercheInitiale: string;
  ficheInitiale: string | null;
}) {
  const router = useRouter();
  const [recherche, setRecherche] = useState(rechercheInitiale);
  const [filtreOnglet, setFiltreOnglet] = useState("");
  const [filtreProfil, setFiltreProfil] = useState("");
  const [filtrePeriodicite, setFiltrePeriodicite] = useState("");
  const [corbeille, setCorbeille] = useState(false);
  const [ouverte, setOuverte] = useState<string | null>(ficheInitiale);
  const [edit, setEdit] = useState<FicheAide | "nouvelle" | null>(null);
  const [f, setF] = useState<Form>(formVide());
  const [historique, setHistorique] = useState<{ fiche: FicheAide; versions: Version[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [annulable, setAnnulable] = useState<{ id: string; titre: string } | null>(null);

  // Lien « Modifier dans Processus » : la fiche est dépliée et mise en vue.
  useEffect(() => {
    if (ficheInitiale) document.getElementById(`fiche-${ficheInitiale}`)?.scrollIntoView({ block: "center" });
  }, [ficheInitiale]);

  const publiees = fiches.filter((x) => x.statut === "publiee" && !x.supprime_le);
  const suggestions = fiches.filter((x) => x.statut === "suggeree" && !x.supprime_le);
  const supprimees = fiches.filter((x) => x.supprime_le);

  const affichees = useMemo(() => {
    const base = (corbeille ? supprimees : publiees).filter(
      (x) =>
        (!filtreOnglet || x.onglets.includes(filtreOnglet)) &&
        (!filtreProfil || (filtreProfil === "bureau" ? x.profils.length === 0 : x.profils.includes(filtreProfil))) &&
        (!filtrePeriodicite || x.periodicite === filtrePeriodicite),
    );
    return recherche.trim() ? rechercherFiches(base, recherche) : base;
  }, [corbeille, supprimees, publiees, filtreOnglet, filtreProfil, filtrePeriodicite, recherche]);

  const mesActivees = activees.filter((a) => !a.terminee_le && !a.archivee_le);

  function ouvrirEditeur(x: FicheAide | "nouvelle") {
    setError(null);
    setF(x === "nouvelle" ? formVide() : formDepuis(x));
    setEdit(x);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const champs = champsDepuisForm(f);
    if (!champs.titre) return setError("Le titre est obligatoire.");
    if (champs.onglets.length === 0) return setError("Choisissez au moins un onglet.");
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: err } =
      edit === "nouvelle"
        ? await supabase.from("fiches_aide").insert({ ...champs, statut: "publiee" })
        : await supabase.from("fiches_aide").update(champs).eq("id", (edit as FicheAide).id);
    setSaving(false);
    if (err) return setError("Enregistrement impossible : " + err.message);
    setEdit(null);
    router.refresh();
  }

  async function maj(id: string, patch: Record<string, unknown>) {
    const { error: err } = await createClient().from("fiches_aide").update(patch).eq("id", id);
    if (err) {
      window.alert("Opération impossible : " + err.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function supprimer(x: FicheAide) {
    if (await maj(x.id, { supprime_le: new Date().toISOString(), supprime_par_role: profil || null })) {
      setAnnulable({ id: x.id, titre: x.titre });
      setTimeout(() => setAnnulable((a) => (a?.id === x.id ? null : a)), 8000);
    }
  }
  const restaurer = (id: string) => maj(id, { supprime_le: null, supprime_par_role: null });

  async function voirHistorique(x: FicheAide) {
    const { data } = await createClient()
      .from("fiches_aide_versions")
      .select("id, action, contenu, par_role, le")
      .eq("fiche_id", x.id)
      .order("le", { ascending: false });
    setHistorique({ fiche: x, versions: (data ?? []) as Version[] });
  }

  async function revenirA(v: Version) {
    if (!historique) return;
    if (!window.confirm(`Rétablir la fiche telle qu'elle était le ${dateHeure(v.le)} ?`)) return;
    const c = v.contenu;
    const ok = await maj(historique.fiche.id, {
      titre: c.titre,
      onglets: c.onglets ?? [],
      profils: c.profils ?? [],
      tags: c.tags ?? [],
      declencheur: c.declencheur,
      etapes: c.etapes ?? [],
      points_attention: c.points_attention,
      liens: c.liens ?? [],
      periodicite: c.periodicite,
      date_echeance: c.date_echeance,
    });
    if (ok) setHistorique(null);
  }

  async function activer(x: FicheAide) {
    const { error: err } = await createClient()
      .from("fiches_aide_activees")
      .insert({
        fiche_id: x.id,
        titre: x.titre,
        etapes: x.etapes.map((texte) => ({ texte, fait: false, fait_le: null })),
        onglet: x.onglets[0] ?? "/processus",
        onglets: x.onglets,
      })
      .select(COLONNES_ACTIVEE)
      .single();
    if (err) return window.alert("Activation impossible : " + err.message);
    window.alert(`Fiche activée : retrouvez-la avec l'ampoule sur l'onglet ${libelleOnglet(x.onglets[0] ?? "/processus")}.`);
    router.refresh();
  }

  const chip = (actif: boolean) =>
    `rounded-full px-2.5 py-0.5 text-xs font-medium ${actif ? "bg-accent text-accent-fg" : "border border-border text-muted hover:bg-surface-2"}`;
  const basculer = (liste: string[], v: string) => (liste.includes(v) ? liste.filter((x) => x !== v) : [...liste, v]);
  const nomFamille = (id: string | null) => familles.find((x) => x.id === id)?.nom ?? "famille";

  return (
    <>
      {/* Barre de recherche et filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Tapez des mots-clés pour retrouver une fiche d'aide"
          className={`${inputCls} max-w-sm`}
        />
        <select value={filtreOnglet} onChange={(e) => setFiltreOnglet(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Tous les onglets</option>
          {ONGLETS.map((o) => (
            <option key={o.href} value={o.href}>{o.label}</option>
          ))}
        </select>
        <select value={filtreProfil} onChange={(e) => setFiltreProfil(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Tous les profils</option>
          <option value="bureau">Tout le bureau</option>
          {PROFILS.map((p) => (
            <option key={p.slug} value={p.slug}>{p.label}</option>
          ))}
        </select>
        <select value={filtrePeriodicite} onChange={(e) => setFiltrePeriodicite(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">Toutes périodicités</option>
          {PERIODICITES.map((p) => (
            <option key={p.v} value={p.v}>{p.l}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setCorbeille((v) => !v)} className={`rounded-lg border px-3 py-2 text-sm ${corbeille ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2"}`}>
            🗑 Corbeille ({supprimees.length})
          </button>
          <button type="button" onClick={() => ouvrirEditeur("nouvelle")} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
            + Nouvelle fiche
          </button>
        </div>
      </div>

      {/* Suggestions des familles, à valider par le bureau */}
      {suggestions.length > 0 && !corbeille && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
          <div className="mb-2 font-semibold text-amber-800 dark:text-amber-200">
            Suggestions des familles à valider ({suggestions.length})
          </div>
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{s.titre}</div>
                    <div className="text-xs text-muted">
                      Proposée par la famille {nomFamille(s.suggere_famille)} le {formatDate(s.cree_le.slice(0, 10))} · {s.onglets.map(libelleOnglet).join(", ")}
                    </div>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button type="button" onClick={() => ouvrirEditeur(s)} className="rounded-lg border border-border px-2.5 py-1 hover:bg-surface-2">Relire et modifier</button>
                    <button
                      type="button"
                      onClick={() => maj(s.id, { statut: "publiee", valide_par_role: profil || null, valide_le: new Date().toISOString() })}
                      className="rounded-lg bg-accent px-2.5 py-1 font-medium text-accent-fg"
                    >
                      Valider et publier
                    </button>
                    <button type="button" onClick={() => maj(s.id, { statut: "refusee" })} className="rounded-lg border border-border px-2.5 py-1 text-muted hover:text-negative">
                      Refuser
                    </button>
                  </div>
                </div>
                {s.etapes.length > 0 && (
                  <ol className="mt-2 list-decimal pl-5 text-xs text-muted">
                    {s.etapes.map((e, k) => <li key={k}>{e}</li>)}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mes fiches activées */}
      {mesActivees.length > 0 && !corbeille && (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-surface p-3 text-sm">
          <div className="mb-1 font-semibold text-amber-700 dark:text-amber-300">Mes fiches activées ({mesActivees.length})</div>
          <ul className="space-y-1">
            {mesActivees.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{a.titre}</span>
                <span className="text-xs text-muted">
                  {a.etapes.filter((e) => e.fait).length}/{a.etapes.length} étapes · activée le {formatDate(a.active_le.slice(0, 10))} ·{" "}
                  <Link href={a.onglet} className="text-accent hover:underline">{libelleOnglet(a.onglet)} →</Link>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">Sur l&apos;onglet concerné, l&apos;ampoule rappelle la fenêtre des étapes à cocher.</p>
        </div>
      )}

      {/* Liste des fiches */}
      <div className="rounded-xl border border-border bg-surface">
        {affichees.length === 0 ? (
          <p className="px-4 py-12 text-center text-muted">
            {corbeille ? "La corbeille est vide." : recherche.trim() ? `Aucune fiche ne correspond à « ${recherche.trim()} ».` : "Aucune fiche pour ces filtres."}
          </p>
        ) : (
          <ul>
            {affichees.map((x) => {
              const deroulee = ouverte === x.id;
              return (
                <Fragment key={x.id}>
                  <li id={`fiche-${x.id}`} className={`border-b border-border last:border-0 ${deroulee ? "bg-surface-2/50" : ""}`}>
                    <button type="button" onClick={() => setOuverte(deroulee ? null : x.id)} className="flex w-full flex-wrap items-start justify-between gap-2 px-4 py-3 text-left hover:bg-surface-2">
                      <div className="min-w-0">
                        <div className="font-medium">
                          <span className={`mr-1.5 inline-block text-muted transition-transform ${deroulee ? "rotate-90" : ""}`}>›</span>
                          {x.titre}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-1 pl-4">
                          {x.onglets.map((o) => (
                            <span key={o} className="rounded bg-accent-soft px-1.5 py-px text-[11px] text-accent">{libelleOnglet(o)}</span>
                          ))}
                          {x.tags.map((t) => (
                            <span key={t} className="rounded bg-surface-2 px-1.5 py-px text-[11px] text-muted">{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted">
                        <div>{x.profils.length === 0 ? "Tout le bureau" : x.profils.map(libelleProfil).join(", ")}</div>
                        <div>
                          {PERIODICITES.find((p) => p.v === x.periodicite)?.l ?? ""}
                          {x.date_echeance ? ` · ${formatDate(x.date_echeance)}` : ""}
                        </div>
                      </div>
                    </button>
                    {deroulee && (
                      <div className="border-t border-border px-2 pb-3">
                        <DetailFiche fiche={x} onActiver={corbeille ? undefined : () => activer(x)} />
                        <div className="flex flex-wrap items-center gap-2 px-4 text-xs">
                          {corbeille ? (
                            <button type="button" onClick={() => restaurer(x.id)} className="rounded-lg bg-accent px-3 py-1 font-medium text-accent-fg">
                              Restaurer
                            </button>
                          ) : (
                            <>
                              <button type="button" onClick={() => ouvrirEditeur(x)} className="rounded-lg border border-border px-3 py-1 hover:bg-surface-2">Modifier</button>
                              <button type="button" onClick={() => voirHistorique(x)} className="rounded-lg border border-border px-3 py-1 hover:bg-surface-2">Historique</button>
                              <button type="button" onClick={() => supprimer(x)} className="rounded-lg border border-border px-3 py-1 text-muted hover:text-negative">Supprimer</button>
                            </>
                          )}
                          <span className="ml-auto text-muted">
                            Mise à jour le {dateHeure(x.modifie_le)} par {libelleProfil(x.modifie_par_role)}
                            {x.valide_le ? ` · validée par ${libelleProfil(x.valide_par_role)}` : ""}
                          </span>
                        </div>
                      </div>
                    )}
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>

      {annulable && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-lg">
          « {annulable.titre} » mise à la corbeille.
          <button
            type="button"
            onClick={() => {
              void restaurer(annulable.id);
              setAnnulable(null);
            }}
            className="font-medium text-accent hover:underline"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Historique : chaque état enregistré, avec retour arrière */}
      {historique && (
        <Fenetre titre={`Historique · ${historique.fiche.titre}`} onClose={() => setHistorique(null)}>
          {historique.versions.length === 0 ? (
            <p className="text-sm text-muted">Aucune version enregistrée.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {historique.versions.map((v, k) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-medium">{ACTIONS[v.action] ?? v.action}</span>
                    <span className="text-muted"> · {dateHeure(v.le)} · {libelleProfil(v.par_role)}</span>
                    <div className="text-xs text-muted">
                      {v.contenu.titre} — {(v.contenu.etapes ?? []).length} étape(s)
                    </div>
                  </div>
                  {k > 0 && (
                    <button type="button" onClick={() => revenirA(v)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-2">
                      Revenir à cette version
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Fenetre>
      )}

      {/* Création / modification */}
      {edit && (
        <Fenetre titre={edit === "nouvelle" ? "Nouvelle fiche d'aide" : `Modifier · ${(edit as FicheAide).titre}`} onClose={() => setEdit(null)}>
          <form onSubmit={enregistrer} className="space-y-4">
            <Field label="Titre">
              <input value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} className={inputCls} required />
            </Field>
            <div>
              <div className="mb-1 text-sm font-medium">Onglets concernés</div>
              <div className="flex flex-wrap gap-1">
                {ONGLETS.map((o) => (
                  <button key={o.href} type="button" onClick={() => setF({ ...f, onglets: basculer(f.onglets, o.href) })} className={chip(f.onglets.includes(o.href))}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">Profils concernés <span className="font-normal text-muted">(aucun = tout le bureau)</span></div>
              <div className="flex flex-wrap gap-1">
                {PROFILS.map((p) => (
                  <button key={p.slug} type="button" onClick={() => setF({ ...f, profils: basculer(f.profils, p.slug) })} className={chip(f.profils.includes(p.slug))}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Mots-clés (séparés par des virgules ; ils servent aussi de synonymes)">
              <input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} className={inputCls} placeholder="relevé, banque, import" />
            </Field>
            <Field label="Quand l'utiliser (déclencheur)">
              <input value={f.declencheur} onChange={(e) => setF({ ...f, declencheur: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Étapes (une par ligne)">
              <textarea value={f.etapes} onChange={(e) => setF({ ...f, etapes: e.target.value })} rows={7} className={inputCls} />
            </Field>
            <Field label="Points d'attention">
              <textarea value={f.points_attention} onChange={(e) => setF({ ...f, points_attention: e.target.value })} rows={3} className={inputCls} />
            </Field>
            <Field label="Liens (un par ligne : libellé | /chemin)">
              <textarea value={f.liens} onChange={(e) => setF({ ...f, liens: e.target.value })} rows={2} className={inputCls} placeholder="Comptabilité | /comptabilite" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Périodicité">
                <select value={f.periodicite} onChange={(e) => setF({ ...f, periodicite: e.target.value as Form["periodicite"] })} className={inputCls}>
                  <option value="">—</option>
                  {PERIODICITES.map((p) => (
                    <option key={p.v} value={p.v}>{p.l}</option>
                  ))}
                </select>
              </Field>
              <Field label="Échéance (facultative)">
                <input type="date" value={f.date_echeance} onChange={(e) => setF({ ...f, date_echeance: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Fenetre>
      )}
    </>
  );
}

function Fenetre({ titre, onClose, children }: { titre: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <h2 className="text-base font-semibold">{titre}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded p-1 text-muted hover:bg-surface-2">✕</button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

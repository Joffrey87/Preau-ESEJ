"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/roles";
import { NIVEAUX, type Niveau } from "@/lib/acces";

export type DonneesWebmestre = {
  pages: { cle: string; libelle: string; section: string; ordre: number }[];
  droits: { profil: string; page: string; niveau: Niveau }[];
  personnes: { id: string; nom: string; note: string | null }[];
  liens: { personne: string; profil: string; note: string | null }[];
  exceptions: { personne: string; profil: string; page: string; niveau: Niveau }[];
  historique: { id: number; quand: string; auteur: string; action: string; profil: string | null; page: string | null; ancien: string | null; nouveau: string | null; detail: string | null }[];
  webmestre: { profil: string; depuis: string };
};

/** Profils Administration (le Webmestre ne peut être que l'un d'eux). */
const ADMINISTRATION = ["president", "tresorier", "secretaire", "administrateur", "directrice", "directeur-spirituel", "resp-mecenat"];
const label = (slug: string | null) => ROLES.find((r) => r.slug === slug)?.label ?? slug ?? "";
const libNiveau = (n: string | null) => NIVEAUX.find((x) => x.v === n)?.label ?? (n === "profil" ? "Selon le profil" : (n ?? ""));
const couleur: Record<Niveau, string> = {
  masque: "text-muted",
  lecture: "text-accent",
  modification: "text-positive font-medium",
};

function Titre({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">{children}</h2>;
}

export default function GestionWebmestre({ donnees }: { donnees: DonneesWebmestre }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const { pages, droits, personnes, liens, exceptions, historique, webmestre } = donnees;

  async function appel(fn: string, args: Record<string, unknown>) {
    setErreur("");
    const { error } = await createClient().rpc(fn, args);
    if (error) {
      setErreur(error.message);
      return false;
    }
    demarrer(() => router.refresh());
    return true;
  }

  const niveau = (profil: string, page: string): Niveau => droits.find((d) => d.profil === profil && d.page === page)?.niveau ?? "masque";
  const sections = [...new Set(pages.map((p) => p.section))];

  // Personnes
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouvelleNote, setNouvelleNote] = useState("");
  const [ouverte, setOuverte] = useState<string | null>(null);
  // Passation
  const [successeur, setSuccesseur] = useState("");

  return (
    <div className={enCours ? "opacity-70" : ""}>
      {erreur && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</div>}

      <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        Webmestre actuel : <strong>{label(webmestre.profil)}</strong>
        {webmestre.depuis && <span className="text-muted"> · depuis le {new Date(webmestre.depuis).toLocaleDateString("fr-FR")}</span>}
        <span className="text-muted"> — rattaché à l’Administration, non affiché dans sa liste.</span>
      </div>

      <Titre>Profils et personnes</Titre>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => {
          const membres = liens.filter((l) => l.profil === r.slug);
          return (
            <div key={r.slug} className="rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="flex items-center justify-between text-sm font-semibold">
                {r.label}
                {r.slug === webmestre.profil && <span className="rounded bg-accent-soft px-1.5 py-px text-[10px] text-accent">Webmestre</span>}
              </div>
              <div className="text-[11px] text-muted">{ADMINISTRATION.includes(r.slug) ? "Administration" : "Recherche de fonds"}</div>
              <ul className="mt-1.5 space-y-0.5 text-[13px]">
                {membres.map((m) => (
                  <li key={m.personne}>
                    {personnes.find((p) => p.id === m.personne)?.nom}
                    {m.note && <span className="text-muted"> ({m.note})</span>}
                  </li>
                ))}
                {membres.length === 0 && <li className="text-xs text-muted">Aucune personne indiquée.</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        Espace famille (comptes des familles) et Professeurs (Bulletins) gardent leurs accès propres, hors de cette grille.
      </p>

      <Titre>Droits par profil et par onglet</Titre>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted">
              <th className="px-3 py-2">Onglet</th>
              {ROLES.map((r) => (
                <th key={r.slug} className="px-2 py-2 text-center">{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <SectionLignes key={s || "accueil"} titre={s}>
                {pages.filter((p) => p.section === s).map((p) => (
                  <tr key={p.cle} className="border-b border-border/60">
                    <td className="px-3 py-1.5">{p.libelle}</td>
                    {ROLES.map((r) => {
                      const n = niveau(r.slug, p.cle);
                      return (
                        <td key={r.slug} className="px-1 py-1 text-center">
                          <select
                            value={n}
                            disabled={enCours}
                            onChange={(e) => appel("acces_definir", { p_profil: r.slug, p_page: p.cle, p_niveau: e.target.value })}
                            className={`rounded border border-border bg-surface px-1 py-0.5 text-[12px] ${couleur[n]}`}
                          >
                            {NIVEAUX.map((x) => (
                              <option key={x.v} value={x.v}>{x.label}</option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </SectionLignes>
            ))}
          </tbody>
        </table>
      </div>

      <Titre>Personnes</Titre>
      <div className="rounded-xl border border-border bg-surface p-3">
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!nouveauNom.trim()) return;
            if (await appel("acces_personne_enregistrer", { p_id: null, p_nom: nouveauNom, p_note: nouvelleNote })) {
              setNouveauNom("");
              setNouvelleNote("");
            }
          }}
        >
          <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} placeholder="Nom (ex. Marie Warnan)" className="rounded border border-border bg-surface px-2 py-1 text-sm" />
          <input value={nouvelleNote} onChange={(e) => setNouvelleNote(e.target.value)} placeholder="Note (facultative)" className="min-w-64 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm" />
          <button type="submit" disabled={enCours} className="rounded bg-accent px-3 py-1 text-sm font-medium text-white">+ Ajouter</button>
        </form>
        <ul className="mt-3 divide-y divide-border">
          {personnes.map((p) => {
            const sesProfils = liens.filter((l) => l.personne === p.id);
            return (
              <li key={p.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setOuverte(ouverte === p.id ? null : p.id)} className="text-sm font-medium hover:underline">
                    {p.nom}
                  </button>
                  {p.note && <span className="text-xs text-muted">{p.note}</span>}
                  <span className="flex flex-wrap gap-1">
                    {sesProfils.map((l) => (
                      <span key={l.profil} className="rounded bg-accent-soft px-1.5 py-px text-[11px] text-accent">{label(l.profil)}</span>
                    ))}
                  </span>
                  <button
                    type="button"
                    onClick={() => confirm(`Retirer ${p.nom} ?`) && appel("acces_personne_supprimer", { p_id: p.id })}
                    className="ml-auto text-xs text-muted hover:text-red-600"
                  >
                    Retirer
                  </button>
                </div>
                {ouverte === p.id && (
                  <div className="mt-2 space-y-3 rounded-lg bg-surface-2 p-3">
                    <div>
                      <div className="mb-1 text-[11px] text-muted">Profils auxquels {p.nom} a accès (avec une note éventuelle)</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {ROLES.map((r) => {
                          const lien = sesProfils.find((l) => l.profil === r.slug);
                          return (
                            <label key={r.slug} className="flex items-center gap-2 text-[13px]">
                              <input
                                type="checkbox"
                                checked={!!lien}
                                onChange={(e) => appel("acces_personne_profil", { p_personne: p.id, p_profil: r.slug, p_lie: e.target.checked, p_note: null })}
                              />
                              <span className="w-36">{r.label}</span>
                              {lien && (
                                <input
                                  defaultValue={lien.note ?? ""}
                                  placeholder="Note (ex. car Baptiste son mari y a accès)"
                                  onBlur={(e) =>
                                    e.target.value !== (lien.note ?? "") &&
                                    appel("acces_personne_profil", { p_personne: p.id, p_profil: r.slug, p_lie: true, p_note: e.target.value })
                                  }
                                  className="flex-1 rounded border border-border bg-surface px-2 py-0.5 text-[12px]"
                                />
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    {sesProfils.map((l) => (
                      <div key={l.profil}>
                        <div className="mb-1 text-[11px] text-muted">Exceptions pour {p.nom} — profil {label(l.profil)}</div>
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                          {pages.map((pg) => {
                            const ex = exceptions.find((x) => x.personne === p.id && x.profil === l.profil && x.page === pg.cle);
                            return (
                              <label key={pg.cle} className="flex items-center justify-between gap-2 text-[12px]">
                                <span className="truncate">{pg.libelle}</span>
                                <select
                                  value={ex?.niveau ?? ""}
                                  onChange={(e) =>
                                    appel("acces_personne_definir", { p_personne: p.id, p_profil: l.profil, p_page: pg.cle, p_niveau: e.target.value || null })
                                  }
                                  className={`rounded border border-border bg-surface px-1 py-0.5 ${ex ? couleur[ex.niveau] : "text-muted"}`}
                                >
                                  <option value="">Selon le profil ({libNiveau(niveau(l.profil, pg.cle))})</option>
                                  {NIVEAUX.map((x) => (
                                    <option key={x.v} value={x.v}>{x.label}</option>
                                  ))}
                                </select>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
          {personnes.length === 0 && <li className="py-2 text-xs text-muted">Aucune personne enregistrée.</li>}
        </ul>
        <p className="mt-2 text-[11px] text-muted">
          Les profils sont des comptes partagés : une exception par personne s’applique quand Préau sait qui est connecté (prénom choisi en Recherche de fonds).
        </p>
      </div>

      <Titre>Passation du rôle Webmestre</Titre>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
        <span>Transmettre le rôle à</span>
        <select value={successeur} onChange={(e) => setSuccesseur(e.target.value)} className="rounded border border-border bg-surface px-2 py-1">
          <option value="">— choisir un profil Administration —</option>
          {ADMINISTRATION.filter((s) => s !== webmestre.profil).map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={!successeur || enCours}
          onClick={async () => {
            if (!confirm(`Transmettre le rôle Webmestre à ${label(successeur)} ? Vous perdrez l’accès à cette page.`)) return;
            if (await appel("webmestre_transmettre", { p_profil: successeur })) {
              router.push("/");
              router.refresh();
            }
          }}
          className="rounded bg-accent px-3 py-1 font-medium text-white disabled:opacity-50"
        >
          Transmettre
        </button>
        <span className="text-xs text-muted">Opération unique : il y a toujours exactement un Webmestre.</span>
      </div>

      <Titre>Historique</Titre>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-muted">
              <th className="px-3 py-2">Quand</th>
              <th className="px-3 py-2">Par</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Profil</th>
              <th className="px-3 py-2">Onglet</th>
              <th className="px-3 py-2">Avant → après</th>
              <th className="px-3 py-2">Détail</th>
            </tr>
          </thead>
          <tbody>
            {historique.map((h) => (
              <tr key={h.id} className="border-b border-border/60">
                <td className="whitespace-nowrap px-3 py-1.5">{new Date(h.quand).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="px-3 py-1.5">{label(h.auteur)}</td>
                <td className="px-3 py-1.5">{h.action}</td>
                <td className="px-3 py-1.5">{label(h.profil)}</td>
                <td className="px-3 py-1.5">{pages.find((p) => p.cle === h.page)?.libelle ?? h.page ?? ""}</td>
                <td className="px-3 py-1.5">
                  {h.ancien || h.nouveau ? `${h.action === "passation Webmestre" ? label(h.ancien) : libNiveau(h.ancien)} → ${h.action === "passation Webmestre" ? label(h.nouveau) : libNiveau(h.nouveau)}` : ""}
                </td>
                <td className="px-3 py-1.5 text-muted">{h.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionLignes({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <>
      {titre && (
        <tr className="bg-surface-2">
          <td colSpan={ROLES.length + 1} className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{titre}</td>
        </tr>
      )}
      {children}
    </>
  );
}
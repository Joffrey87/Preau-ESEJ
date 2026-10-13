"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/roles";
import { NIVEAUX, type Niveau } from "@/lib/acces";
import { DialogueAttribution, type Annuaire, type MembreReel, type PersonneAcces } from "./AttributionWebmestre";

export type DonneesWebmestre = {
  pages: { cle: string; libelle: string; section: string; ordre: number }[];
  droits: { profil: string; page: string; niveau: Niveau }[];
  personnes: PersonneAcces[];
  titulaires: { profil: string; personne: string; depuis: string }[];
  annuaire: Annuaire;
  liens: { personne: string; profil: string; note: string | null }[];
  exceptions: { personne: string; profil: string; page: string; niveau: Niveau }[];
  historique: { id: number; quand: string; auteur: string; action: string; profil: string | null; page: string | null; ancien: string | null; nouveau: string | null; detail: string | null }[];
  webmestre: { profil: string; depuis: string };
};

/** Profils Administration (le Webmestre ne peut être que l'un d'eux). */
const ADMINISTRATION = ["president", "tresorier", "secretaire", "administrateur", "directrice", "directeur-spirituel", "resp-mecenat"];
/** Profils montrés dans la vue d'ensemble : ceux du bureau et Recherche de fonds, plus Événement (comptes nominatifs, accès propres). */
const PROFILS_APERCU: { slug: string; label: string }[] = [...ROLES.map((r) => ({ slug: r.slug, label: r.label })), { slug: "evenement", label: "Événement" }];
/** Espaces à plusieurs membres : chacun peut ouvrir les autres (ex. un professeur dans Événement). */
const ESPACES_MEMBRES = [
  { slug: "recherche-fonds", label: "Recherche de fonds", court: "Rech. de fonds", annuaire: "recherche", source: "recherche" },
  { slug: "evenement", label: "Événement", court: "Événement", annuaire: "evenement", source: "evenement" },
  { slug: "professeur", label: "Professeurs", court: "Professeurs", annuaire: "professeur", source: "enseignant" },
] as const;
const label = (slug: string | null) => (slug === "professeur" ? "Professeurs" : undefined) ?? PROFILS_APERCU.find((r) => r.slug === slug)?.label ?? slug ?? "";
const libNiveau = (n: string | null) => NIVEAUX.find((x) => x.v === n)?.label ?? (n === "profil" ? "Selon le profil" : (n ?? ""));
const couleur: Record<Niveau, string> = {
  masque: "text-muted",
  lecture: "text-accent",
  modification: "text-positive font-medium",
};

/** Changement en attente de validation (brouillon local, appliqué par « Valider »). */
type Changement = {
  cle: string;
  fn: string;
  args: Record<string, unknown>;
  libelle: string;
  /** Changement sensible, mis en évidence dans le récapitulatif. */
  sensible?: string;
  /** Message affiché une fois le changement appliqué. */
  apres?: string;
  /** Valeur affichée tant que le changement n'est pas validé (ex. nom du nouveau titulaire). */
  affiche?: string;
};
const JAUNE = "bg-yellow-100 ring-1 ring-yellow-400 dark:bg-yellow-500/20";
const sansAccents = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

function Titre({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">{children}</h2>;
}

export default function GestionWebmestre({ donnees }: { donnees: DonneesWebmestre }) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState("");
  const { pages, droits, personnes, liens, exceptions, historique, webmestre, titulaires, annuaire } = donnees;
  const [roleOuvert, setRoleOuvert] = useState<string | null>(null);
  const [info, setInfo] = useState("");
  const personneDe = (source: keyof Annuaire, m: MembreReel) =>
    personnes.find((p) =>
      source === "evenement" ? p.evenement_membre_id === m.ref : source === "professeur" ? p.enseignant_id === m.ref : p.prenom_recherche?.toLowerCase() === m.ref.toLowerCase(),
    );

  // ─── Brouillon : rien n'est enregistré avant « Valider » ───
  const [brouillon, setBrouillon] = useState<Changement[]>([]);
  const [resume, setResume] = useState(false);
  const [erreursChg, setErreursChg] = useState<Record<string, string>>({});
  const [application, setApplication] = useState(false);
  const enAttente = (cle: string) => brouillon.find((c) => c.cle === cle);
  /** Met un changement en attente ; revenir à la valeur d'origine le retire du brouillon. */
  function preparer(c: Changement, estOriginal = false) {
    setBrouillon((b) => {
      const reste = b.filter((x) => x.cle !== c.cle);
      return estOriginal ? reste : [...reste, c];
    });
    setErreursChg((e) => {
      const { [c.cle]: _ignore, ...r } = e;
      void _ignore;
      return r;
    });
  }
  async function valider() {
    setApplication(true);
    setErreur("");
    const sb = createClient();
    const erreurs: Record<string, string> = {};
    const restants: Changement[] = [];
    const messages: string[] = [];
    // Dans l'ordre de saisie (ex. ajout d'un profil puis sa note).
    for (const c of brouillon) {
      const { error } = await sb.rpc(c.fn, c.args);
      if (error) {
        erreurs[c.cle] = error.message;
        restants.push(c);
      } else if (c.apres) messages.push(c.apres);
    }
    setBrouillon(restants);
    setErreursChg(erreurs);
    setApplication(false);
    setInfo(messages.join(" "));
    if (restants.length === 0) setResume(false);
    demarrer(() => router.refresh());
  }
  const sale = brouillon.length > 0;
  const saleRef = useRef(false);
  useEffect(() => {
    saleRef.current = sale;
  }, [sale]);
  // Alerte en quittant la page (fermeture, rechargement, bascule d'espace par le logo).
  useEffect(() => {
    const avant = (e: BeforeUnloadEvent) => {
      if (!saleRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    // Navigation interne : liens et boutons du menu (hors bouton qui ouvre le menu du logo).
    const clic = (e: MouseEvent) => {
      if (!saleRef.current) return;
      const cible = (e.target as HTMLElement | null)?.closest("a[href], aside button:not([aria-haspopup])");
      if (!cible || cible.closest("[data-webmestre]")) return;
      if (!confirm(`${brouillon.length || "Des"} changement(s) non validé(s) seront perdus. Quitter quand même ?`)) {
        e.preventDefault();
        e.stopPropagation();
      } else saleRef.current = false;
    };
    window.addEventListener("beforeunload", avant);
    document.addEventListener("click", clic, true);
    return () => {
      window.removeEventListener("beforeunload", avant);
      document.removeEventListener("click", clic, true);
    };
  }, [brouillon.length]);

  // Passation : confirmation renforcée (nom du destinataire à retaper).
  const [confirmationNom, setConfirmationNom] = useState("");

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
    <div data-webmestre className={`pb-20 ${enCours ? "opacity-70" : ""}`}>
      {erreur && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</div>}

      <div className="mt-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
        Webmestre actuel : <strong>{label(webmestre.profil)}</strong>
        {webmestre.depuis && <span className="text-muted"> · depuis le {new Date(webmestre.depuis).toLocaleDateString("fr-FR")}</span>}
        <span className="text-muted"> — rattaché à l’Administration, non affiché dans sa liste.</span>
      </div>

      <Titre>Rôles Administration</Titre>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ADMINISTRATION.map((slug) => {
          const t = titulaires.find((x) => x.profil === slug);
          const p = t ? personnes.find((x) => x.id === t.personne) : undefined;
          const d = enAttente(`titulaire:${slug}`);
          return (
            <button
              key={slug}
              type="button"
              onClick={() => setRoleOuvert(slug)}
              className={`rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-accent/60 ${d ? JAUNE : "bg-surface hover:bg-surface-2"}`}
            >
              <div className="flex items-center justify-between text-sm font-semibold">
                {label(slug)}
                {slug === webmestre.profil && <span className="rounded bg-accent-soft px-1.5 py-px text-[10px] text-accent">Webmestre</span>}
              </div>
              <div className="mt-1 text-[13px]">
                {d ? (
                  <>
                    {p && <span className="text-muted line-through">{p.nom}</span>} {d.affiche} <span className="text-[11px] text-muted">(à valider)</span>
                  </>
                ) : p ? (
                  p.nom
                ) : (
                  <span className="text-xs text-muted">Aucun titulaire · cliquer pour attribuer</span>
                )}
              </div>
              {t && <div className="text-[11px] text-muted">depuis le {new Date(t.depuis).toLocaleDateString("fr-FR")}</div>}
            </button>
          );
        })}
      </div>
      {roleOuvert && (
        <DialogueAttribution
          roleLabel={label(roleOuvert)}
          titulaireActuel={personnes.find((x) => x.id === titulaires.find((t) => t.profil === roleOuvert)?.personne)?.nom ?? null}
          onChoisir={async (c) => {
            const ancien = personnes.find((x) => x.id === titulaires.find((t) => t.profil === roleOuvert)?.personne)?.nom ?? "personne";
            const nouveau = [c.prenom, c.nom].filter(Boolean).join(" ") || "?";
            preparer({
              cle: `titulaire:${roleOuvert}`,
              fn: "acces_titulaire_attribuer",
              args: { p_profil: roleOuvert, p_source: c.source, p_ref: c.ref, p_prenom: c.prenom, p_nom: c.nom },
              libelle: `${label(roleOuvert)} : ${ancien} → ${nouveau}${c.source === "nouveau" ? " (nouvelle personne, fiche créée dans le Carnet)" : ""}`,
              sensible: "Changement de titulaire",
              affiche: nouveau,
            });
            return true;
          }}
          onFermer={() => setRoleOuvert(null)}
        />
      )}

      <Titre>Membres des espaces et leurs accès</Titre>
      <p className="-mt-1 mb-3 text-xs text-muted">
        Chaque personne garde sa propre connexion ; les accès cochés ici lui ouvrent les autres espaces par le logo Préau.
      </p>
      {info && <div className="mb-3 rounded-lg border border-positive/40 bg-surface px-3 py-2 text-sm">{info}</div>}
      <div className="grid gap-3 lg:grid-cols-3">
        {ESPACES_MEMBRES.map((esp) => {
          const reels = annuaire[esp.annuaire];
          const parMain = liens
            .filter((l) => l.profil === esp.slug)
            .map((l) => personnes.find((p) => p.id === l.personne))
            .filter((p): p is PersonneAcces => !!p && !reels.some((m) => personneDe(esp.annuaire, m)?.id === p.id));
          return (
            <div key={esp.slug} className="rounded-xl border border-border bg-surface px-3 py-2.5">
              <div className="text-sm font-semibold">{esp.label}</div>
              <ul className="mt-1.5 divide-y divide-border/60">
                {reels.map((m) => {
                  const p = personneDe(esp.annuaire, m);
                  const nomAffiche = esp.annuaire === "professeur" ? [m.prenom, m.nom].filter(Boolean).join(" ") : m.libelle ?? m.prenom ?? "";
                  return (
                    <li key={m.ref} className="py-1.5">
                      <div className="text-[13px]">
                        {nomAffiche}
                        {m.famille && <span className="text-[11px] text-muted"> · Famille {m.famille}</span>}
                        {m.compte === false && <span className="text-[11px] text-muted"> · sans compte</span>}
                        {m.identifiant && <span className="text-[11px] text-muted"> · identifiant {m.identifiant}</span>}
                        {m.actif === false && <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] text-muted">désactivé</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        {ESPACES_MEMBRES.map((cible) => {
                          const base = cible.slug === esp.slug;
                          const origine = !!p && liens.some((l) => l.personne === p.id && l.profil === cible.slug);
                          const cleM = `membre:${esp.source}:${m.ref}:${cible.slug}`;
                          const d = enAttente(cleM);
                          const coche = base || (d ? d.args.p_lie === true : origine);
                          return (
                            <label key={cible.slug} className={`flex items-center gap-1 rounded px-0.5 text-[11.5px] ${base ? "text-muted" : ""} ${d ? JAUNE : ""}`}>
                              <input
                                type="checkbox"
                                checked={coche}
                                disabled={base || enCours}
                                onChange={(e) => {
                                  const lie = e.target.checked;
                                  const compte = cible.slug === "evenement" && esp.slug !== "evenement";
                                  preparer(
                                    {
                                      cle: cleM,
                                      fn: "acces_membre_profil",
                                      args: { p_source: esp.source, p_ref: m.ref, p_prenom: m.prenom, p_nom: m.nom, p_profil: cible.slug, p_lie: lie },
                                      libelle: `${nomAffiche} : accès ${cible.label} ${lie ? "ajouté" : "retiré"}`,
                                      sensible: compte ? (lie ? "Création (ou réactivation) du compte Événement" : "Désactivation du compte Événement") : undefined,
                                      apres: compte
                                        ? lie
                                          ? `Compte Événement de ${nomAffiche} prêt : son identifiant apparaît dans la colonne Événement, mot de passe = son prénom (sans accents ni majuscules).`
                                          : `Compte Événement de ${nomAffiche} désactivé (non supprimé) : recocher le réactive.`
                                        : undefined,
                                    },
                                    lie === origine,
                                  );
                                }}
                              />
                              {cible.court}
                            </label>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
                {parMain.map((p) => (
                  <li key={p.id} className="py-1.5 text-[13px]">
                    {p.nom} <span className="text-[11px] text-muted">· accès donné par le Webmestre</span>
                  </li>
                ))}
                {reels.length + parMain.length === 0 && <li className="py-1 text-xs text-muted">Aucun membre.</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        Espace famille garde ses accès propres. Un accès coché ouvre l’espace par le logo quand la personne y a un compte
        (membre Événement, professeur avec identifiant, prénom de la Recherche de fonds).
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
                      const origine = niveau(r.slug, p.cle);
                      const cleD = `droit:${r.slug}:${p.cle}`;
                      const d = enAttente(cleD);
                      const n = (d?.args.p_niveau as Niveau | undefined) ?? origine;
                      return (
                        <td key={r.slug} className="px-1 py-1 text-center">
                          <select
                            value={n}
                            disabled={enCours}
                            onChange={(e) =>
                              preparer(
                                {
                                  cle: cleD,
                                  fn: "acces_definir",
                                  args: { p_profil: r.slug, p_page: p.cle, p_niveau: e.target.value },
                                  libelle: `${r.label} · ${p.libelle} : ${libNiveau(origine)} → ${libNiveau(e.target.value)}`,
                                },
                                e.target.value === origine,
                              )
                            }
                            className={`rounded border border-border px-1 py-0.5 text-[12px] ${couleur[n]} ${d ? JAUNE : "bg-surface"}`}
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
            preparer({
              cle: `ajout:${Date.now()}`,
              fn: "acces_personne_enregistrer",
              args: { p_id: null, p_nom: nouveauNom, p_note: nouvelleNote },
              libelle: `Nouvelle personne : ${nouveauNom.trim()}${nouvelleNote.trim() ? ` (${nouvelleNote.trim()})` : ""}`,
            });
            setNouveauNom("");
            setNouvelleNote("");
          }}
        >
          <input value={nouveauNom} onChange={(e) => setNouveauNom(e.target.value)} placeholder="Nom (ex. Marie Warnan)" className="rounded border border-border bg-surface px-2 py-1 text-sm" />
          <input value={nouvelleNote} onChange={(e) => setNouvelleNote(e.target.value)} placeholder="Note (facultative)" className="min-w-64 flex-1 rounded border border-border bg-surface px-2 py-1 text-sm" />
          <button type="submit" disabled={enCours} className="rounded bg-accent px-3 py-1 text-sm font-medium text-white">+ Ajouter</button>
          {brouillon.filter((c) => c.cle.startsWith("ajout:")).map((c) => (
            <span key={c.cle} className={`rounded px-2 py-0.5 text-xs ${JAUNE}`}>{String(c.args.p_nom)} (à valider)</span>
          ))}
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
                    onClick={() =>
                      preparer(
                        { cle: `retrait:${p.id}`, fn: "acces_personne_supprimer", args: { p_id: p.id }, libelle: `Retirer ${p.nom}`, sensible: "Suppression d'une personne" },
                        !!enAttente(`retrait:${p.id}`),
                      )
                    }
                    className={`ml-auto rounded px-1 text-xs text-muted hover:text-red-600 ${enAttente(`retrait:${p.id}`) ? JAUNE : ""}`}
                  >
                    {enAttente(`retrait:${p.id}`) ? "Retrait à valider · annuler" : "Retirer"}
                  </button>
                </div>
                {ouverte === p.id && (
                  <div className="mt-2 space-y-3 rounded-lg bg-surface-2 p-3">
                    <div>
                      <div className="mb-1 text-[11px] text-muted">Profils auxquels {p.nom} a accès (avec une note éventuelle)</div>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {[...PROFILS_APERCU.filter((r) => !ADMINISTRATION.includes(r.slug)), { slug: "professeur", label: "Professeurs" }].map((r) => {
                          const lien = sesProfils.find((l) => l.profil === r.slug);
                          const cleP = `pp:${p.id}:${r.slug}`;
                          const dP = enAttente(cleP);
                          const cleN = `note:${p.id}:${r.slug}`;
                          const dN = enAttente(cleN);
                          const lie = dP ? dP.args.p_lie === true : !!lien;
                          return (
                            <label key={r.slug} className={`flex items-center gap-2 rounded px-1 text-[13px] ${dP ? JAUNE : ""}`}>
                              <input
                                type="checkbox"
                                checked={lie}
                                onChange={(e) =>
                                  preparer(
                                    {
                                      cle: cleP,
                                      fn: "acces_personne_profil",
                                      args: { p_personne: p.id, p_profil: r.slug, p_lie: e.target.checked, p_note: null },
                                      libelle: `${p.nom} : profil ${r.label} ${e.target.checked ? "ajouté" : "retiré"}`,
                                    },
                                    e.target.checked === !!lien,
                                  )
                                }
                              />
                              <span className="w-36">{r.label}</span>
                              {lien && lie && (
                                <input
                                  defaultValue={(dN?.args.p_note as string | undefined) ?? lien.note ?? ""}
                                  placeholder="Note (ex. car Baptiste son mari y a accès)"
                                  onBlur={(e) =>
                                    preparer(
                                      {
                                        cle: cleN,
                                        fn: "acces_personne_profil",
                                        args: { p_personne: p.id, p_profil: r.slug, p_lie: true, p_note: e.target.value },
                                        libelle: `${p.nom} · ${r.label} : note « ${e.target.value} »`,
                                      },
                                      e.target.value === (lien.note ?? ""),
                                    )
                                  }
                                  className={`flex-1 rounded border border-border px-2 py-0.5 text-[12px] ${dN ? JAUNE : "bg-surface"}`}
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
                            const cleE = `ex:${p.id}:${l.profil}:${pg.cle}`;
                            const dE = enAttente(cleE);
                            const valE = dE ? ((dE.args.p_niveau as string | null) ?? "") : (ex?.niveau ?? "");
                            return (
                              <label key={pg.cle} className="flex items-center justify-between gap-2 text-[12px]">
                                <span className="truncate">{pg.libelle}</span>
                                <select
                                  value={valE}
                                  onChange={(e) =>
                                    preparer(
                                      {
                                        cle: cleE,
                                        fn: "acces_personne_definir",
                                        args: { p_personne: p.id, p_profil: l.profil, p_page: pg.cle, p_niveau: e.target.value || null },
                                        libelle: `${p.nom} · ${label(l.profil)} · ${pg.libelle} : exception ${libNiveau(ex?.niveau ?? "profil")} → ${libNiveau(e.target.value || "profil")}`,
                                      },
                                      e.target.value === (ex?.niveau ?? ""),
                                    )
                                  }
                                  className={`rounded border border-border px-1 py-0.5 ${valE ? couleur[valE as Niveau] : "text-muted"} ${dE ? JAUNE : "bg-surface"}`}
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
        <select
          value={successeur}
          onChange={(e) => {
            setSuccesseur(e.target.value);
            setConfirmationNom("");
          }}
          className="rounded border border-border bg-surface px-2 py-1"
        >
          <option value="">— choisir un profil Administration —</option>
          {ADMINISTRATION.filter((s) => s !== webmestre.profil).map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        {successeur && (
          <label className="flex items-center gap-1 text-xs">
            Retapez « {label(successeur)} » pour confirmer :
            <input value={confirmationNom} onChange={(e) => setConfirmationNom(e.target.value)} className="rounded border border-border bg-surface px-2 py-1 text-sm" />
          </label>
        )}
        <button
          type="button"
          disabled={!successeur || enCours || sale || sansAccents(confirmationNom) !== sansAccents(label(successeur))}
          title={sale ? "Validez ou annulez d’abord les changements en attente." : undefined}
          onClick={async () => {
            if (!confirm(`Dernière confirmation : transmettre le rôle Webmestre à ${label(successeur)} ? Vous perdrez l’accès à cette page.`)) return;
            if (await appel("webmestre_transmettre", { p_profil: successeur })) {
              router.push("/");
              router.refresh();
            }
          }}
          className="rounded bg-accent px-3 py-1 font-medium text-white disabled:opacity-50"
        >
          Transmettre
        </button>
        <span className="text-xs text-muted">
          Opération unique, appliquée tout de suite (hors brouillon) : il y a toujours exactement un Webmestre.
          {sale && " Validez ou annulez d’abord les changements en attente."}
        </span>
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
                  {h.ancien || h.nouveau ? `${h.action === "passation Webmestre" ? label(h.ancien) : h.action === "titulaire attribué" ? (h.ancien ?? "personne") : libNiveau(h.ancien)} → ${h.action === "passation Webmestre" ? label(h.nouveau) : h.action === "titulaire attribué" ? h.nouveau : libNiveau(h.nouveau)}` : ""}
                </td>
                <td className="px-3 py-1.5 text-muted">{h.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sale && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-yellow-400 bg-yellow-50 px-5 py-2.5 shadow-lg dark:bg-yellow-950 md:left-56">
          <div className="mx-auto flex max-w-7xl items-center gap-3 text-sm">
            <span className="font-medium">
              {brouillon.length} changement{brouillon.length > 1 ? "s" : ""} en attente
            </span>
            {Object.keys(erreursChg).length > 0 && <span className="text-red-600">{Object.keys(erreursChg).length} en erreur</span>}
            <button
              type="button"
              onClick={() => {
                if (!confirm("Annuler tous les changements en attente ?")) return;
                setBrouillon([]);
                setErreursChg({});
                setResume(false);
              }}
              className="ml-auto rounded px-3 py-1 text-muted hover:text-foreground"
            >
              Annuler
            </button>
            <button type="button" onClick={() => setResume(true)} className="rounded bg-accent px-3 py-1 font-medium text-white">
              Valider
            </button>
          </div>
        </div>
      )}
      {resume && sale && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => !application && setResume(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold">Valider {brouillon.length} changement{brouillon.length > 1 ? "s" : ""}</h3>
            <p className="text-xs text-muted">Ils seront appliqués dans cet ordre et inscrits dans l’historique. Les changements sensibles sont signalés en rouge.</p>
            <ol className="mt-3 space-y-1.5 text-[13px]">
              {brouillon.map((c, i) => (
                <li key={c.cle} className={`rounded-lg border px-3 py-1.5 ${c.sensible ? "border-red-300 bg-red-50 dark:bg-red-950/40" : "border-border"}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-muted">{i + 1}.</span>
                    <span className="flex-1">
                      {c.sensible && <span className="mr-1 rounded bg-red-600 px-1.5 py-px text-[10px] font-semibold uppercase text-white">{c.sensible}</span>}
                      {c.libelle}
                    </span>
                    <button type="button" disabled={application} onClick={() => preparer(c, true)} className="text-xs text-muted hover:text-red-600">
                      Retirer
                    </button>
                  </div>
                  {erreursChg[c.cle] && <div className="mt-1 text-xs text-red-600">Erreur : {erreursChg[c.cle]}</div>}
                </li>
              ))}
            </ol>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={application} onClick={() => setResume(false)} className="rounded px-3 py-1 text-sm text-muted">
                Revenir
              </button>
              <button type="button" disabled={application} onClick={valider} className="rounded bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-50">
                {application ? "Application…" : "Confirmer et appliquer"}
              </button>
            </div>
          </div>
        </div>
      )}
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
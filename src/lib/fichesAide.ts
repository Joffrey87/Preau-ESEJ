/**
 * Fiches d'aide (onglet Processus) : fiches réflexes rattachées à des onglets et
 * à des profils. Recherche instantanée, insensible aux accents et à la casse :
 * titre et mots-clés d'abord, contenu ensuite.
 */

import { ROLES } from "@/lib/roles";

export type LienFiche = { libelle: string; href: string };
export type Periodicite = "ponctuelle" | "mensuelle" | "trimestrielle" | "annuelle";

export type FicheAide = {
  id: string;
  titre: string;
  onglets: string[];
  profils: string[];
  tags: string[];
  declencheur: string | null;
  etapes: string[];
  points_attention: string | null;
  liens: LienFiche[];
  periodicite: Periodicite | null;
  date_echeance: string | null;
  statut: "publiee" | "suggeree" | "refusee";
  suggere_famille: string | null;
  valide_par_role: string | null;
  valide_le: string | null;
  cree_par_role: string | null;
  cree_le: string;
  modifie_par_role: string | null;
  modifie_le: string;
  supprime_le: string | null;
  supprime_par_role: string | null;
};

export const COLONNES_FICHE =
  "id, titre, onglets, profils, tags, declencheur, etapes, points_attention, liens, periodicite, date_echeance, statut, suggere_famille, valide_par_role, valide_le, cree_par_role, cree_le, modifie_par_role, modifie_le, supprime_le, supprime_par_role";

export type EtapeActivee = { texte: string; fait: boolean; fait_le: string | null };

export type FicheActivee = {
  id: string;
  fiche_id: string | null;
  titre: string;
  etapes: EtapeActivee[];
  onglet: string;
  onglets: string[];
  role: string | null;
  active_le: string;
  terminee_le: string | null;
  archivee_le: string | null;
};

export const COLONNES_ACTIVEE = "id, fiche_id, titre, etapes, onglet, onglets, role, active_le, terminee_le, archivee_le";

/** Onglets et sous-pages pouvant porter des fiches (chemin → libellé). */
export const ONGLETS: { href: string; label: string; famille?: boolean }[] = [
  { href: "/", label: "Tableau de bord" },
  { href: "/comptabilite", label: "Comptabilité" },
  { href: "/comptabilite/import", label: "Comptabilité · Import du relevé" },
  { href: "/comptabilite/bilan", label: "Comptabilité · Bilan" },
  { href: "/comptabilite/correspondances", label: "Comptabilité · Correspondances" },
  { href: "/en-cours", label: "En cours" },
  { href: "/budget", label: "Budget" },
  { href: "/scolarite", label: "Frais de scolarité" },
  { href: "/scolarite/eleves", label: "Frais de scolarité · Élèves" },
  { href: "/scolarite/activites", label: "Frais de scolarité · Activités" },
  { href: "/financement", label: "Financement" },
  { href: "/dons", label: "Dons" },
  { href: "/dons/import", label: "Dons · Import" },
  { href: "/dons/depuis-compta", label: "Dons · Depuis la Comptabilité" },
  { href: "/mecenat", label: "Mécénat" },
  { href: "/mecenat/pipeline", label: "Relations donateurs" },
  { href: "/recus-fiscaux", label: "Reçus fiscaux" },
  { href: "/recherche/axes", label: "Axes de recherche" },
  { href: "/recherche/suivi", label: "Suivi des actions" },
  { href: "/mails", label: "Mails" },
  { href: "/carnet", label: "Carnet d'adresses" },
  { href: "/ca", label: "Conseil d'administration" },
  { href: "/parametres", label: "Paramètres" },
  { href: "/processus", label: "Processus" },
  { href: "/espace", label: "Espace famille · Tableau de bord", famille: true },
  { href: "/espace/paiements", label: "Espace famille · Paiements", famille: true },
  { href: "/espace/famille", label: "Espace famille · Ma famille", famille: true },
];

export const PROFILS: { slug: string; label: string }[] = [
  ...ROLES.map((r) => ({ slug: r.slug, label: r.label })),
  { slug: "famille", label: "Famille" },
];

export const libelleOnglet = (href: string) => ONGLETS.find((o) => o.href === href)?.label ?? href;
export const libelleProfil = (slug: string | null | undefined) =>
  slug ? (PROFILS.find((p) => p.slug === slug)?.label ?? slug) : "Préau";

export const PERIODICITES: { v: Periodicite; l: string }[] = [
  { v: "ponctuelle", l: "Ponctuelle" },
  { v: "mensuelle", l: "Mensuelle" },
  { v: "trimestrielle", l: "Trimestrielle" },
  { v: "annuelle", l: "Annuelle" },
];

/** Onglet courant : le plus précis des onglets connus qui contient le chemin. */
export function ongletDe(pathname: string): string {
  let meilleur = "/";
  for (const o of ONGLETS) {
    const ok = o.href === "/" ? pathname === "/" : pathname === o.href || pathname.startsWith(o.href + "/");
    if (ok && o.href.length >= meilleur.length) meilleur = o.href;
  }
  return meilleur;
}

/** La fiche concerne-t-elle ce profil ? (aucun profil coché = tout le bureau) */
export function pourProfil(f: Pick<FicheAide, "profils">, profil: string): boolean {
  if (f.profils.length === 0) return profil !== "famille";
  return f.profils.includes(profil);
}

export const normaliser = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Score d'une fiche pour une recherche : chaque mot doit apparaître quelque
 * part ; un mot trouvé dans le titre ou les mots-clés pèse bien plus qu'un mot
 * trouvé dans le seul contenu. Null : la fiche ne correspond pas.
 */
export function scoreFiche(f: FicheAide, recherche: string): number | null {
  const mots = normaliser(recherche).split(/[\s,;]+/).filter((m) => m.length > 0);
  if (mots.length === 0) return 0;
  const titre = normaliser(f.titre);
  const tags = normaliser(f.tags.join(" "));
  const onglets = normaliser(f.onglets.map(libelleOnglet).join(" "));
  const contenu = normaliser(
    [f.declencheur, ...f.etapes, f.points_attention, ...f.liens.map((l) => l.libelle)].filter(Boolean).join(" "),
  );
  let score = 0;
  for (const m of mots) {
    if (titre.includes(m)) score += 10;
    else if (tags.includes(m)) score += 8;
    else if (onglets.includes(m)) score += 3;
    else if (contenu.includes(m)) score += 1;
    else return null;
  }
  return score;
}

/** Fiches correspondant à la recherche, les plus pertinentes d'abord. */
export function rechercherFiches(fiches: FicheAide[], recherche: string): FicheAide[] {
  return fiches
    .map((f) => ({ f, s: scoreFiche(f, recherche) }))
    .filter((x): x is { f: FicheAide; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.f.titre.localeCompare(b.f.titre, "fr"))
    .map((x) => x.f);
}

/** Fiche activée en cours (ni terminée ni abandonnée) qui concerne cet onglet. */
export function activeSurOnglet(a: FicheActivee, onglet: string): boolean {
  return !a.terminee_le && !a.archivee_le && (a.onglet === onglet || a.onglets.includes(onglet));
}

/** Normalise les colonnes jsonb lues en base. */
export function ficheDepuisBase(r: Record<string, unknown>): FicheAide {
  const f = r as unknown as FicheAide;
  return {
    ...f,
    onglets: f.onglets ?? [],
    profils: f.profils ?? [],
    tags: f.tags ?? [],
    etapes: Array.isArray(f.etapes) ? f.etapes : [],
    liens: Array.isArray(f.liens) ? f.liens : [],
  };
}

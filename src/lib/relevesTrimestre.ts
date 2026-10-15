// Relevés de notes (par période) et bulletins trimestriels (demande de la Directrice, 23/10/2026).
//
// Relevé de notes : les notes de la période, matière par matière, sans aucune moyenne, et une appréciation générale.
// Bulletin trimestriel : pour chaque matière, la moyenne simple (sur 20) de toutes ses notes du trimestre, toutes
// périodes comprises ; la moyenne de chaque ensemble (Français, Mathématiques, Matières complémentaires) est la moyenne
// simple de ses matières notées ; la moyenne générale, la moyenne simple des ensembles notés. Aucun coefficient.
// Une période sans évaluation saisie dans Préau mais avec une moyenne reprise d'École Futée (bulletin_lignes) compte
// cette moyenne comme une note.
// Catéchisme (15/10/2026) : une appréciation seule, sans note ni moyenne, sur le relevé comme sur le bulletin ; il
// n'entre dans aucune moyenne. Le bulletin ne reprend pas les appréciations des relevés : il a la sienne, celle du trimestre.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  arrondi,
  estAppreciationSeule,
  matiereConcerne,
  niveauDe,
  nomEnseignant,
  type Bulletin,
  type Classe,
  type EleveBulletin,
  type Enseignant,
  type Evaluation,
  type Groupe,
  type Ligne,
  type Matiere,
  type Note,
  type Periode,
  type Statut,
  type Synthese,
} from "@/lib/bulletins";

export type DocReleve = {
  id: string;
  periode_id: string;
  classe_id: string;
  eleve_id: string;
  statut: Statut;
  appreciation: string | null;
  synthese: Synthese | null;
  publie_le: string | null;
  lu_le: string | null;
};
export type DocTrimestre = Omit<DocReleve, "periode_id"> & { annee_scolaire: string; trimestre: number };
/** bulletin_id : le bulletin trimestriel, ou le relevé de la période (appréciation du Catéchisme). */
export type AppreciationIntervenant = { bulletin_id: string; matiere_id: string; texte: string | null };

export type ContexteDocs = {
  classe: Classe;
  /** Période choisie (relevé) ; pour le trimestre, toutes ses périodes. */
  periodes: Periode[];
  trimestre: number;
  groupes: Groupe[];
  matieres: Matiere[];
  eleves: EleveBulletin[];
  evaluations: Evaluation[];
  notes: Note[];
  /** Bulletins de période (pour les moyennes reprises d'École Futée) et leurs lignes. */
  bulletinsPeriode: Pick<Bulletin, "id" | "periode_id" | "eleve_id">[];
  lignes: Ligne[];
  releves: DocReleve[];
  trimestriels: DocTrimestre[];
  appreciations: AppreciationIntervenant[];
};

export const titreTrimestre = (t: number) => `${t === 1 ? "1er" : `${t}e`} trimestre`;

const ETATS: Record<string, string> = { absent: "Abs.", dispense: "Disp.", non_rendu: "Non rendu" };
const nombre = (n: number) => String(arrondi(n)).replace(".", ",");

/** Charge tout ce qu'il faut pour une classe : relevés de la période choisie et bulletins de son trimestre. */
export async function chargerDocs(sb: SupabaseClient, classe: Classe, periode: Periode, toutes: Periode[]): Promise<ContexteDocs> {
  const trimestre = periode.trimestre ?? 1;
  const periodes = toutes.filter((p) => p.annee_scolaire === classe.annee_scolaire && p.trimestre === trimestre).sort((a, b) => a.ordre - b.ordre);
  const ids = periodes.map((p) => p.id);
  await Promise.all([
    sb.rpc("releves_preparer", { p_periode: periode.id, p_classe: classe.id }),
    sb.rpc("bulletins_trimestre_preparer", { p_annee: classe.annee_scolaire, p_trimestre: trimestre, p_classe: classe.id }),
  ]);
  const [g, m, ce, el, ev, bp, rl, bt] = await Promise.all([
    sb.from("matieres_groupes").select("*").eq("classe_id", classe.id).order("ordre"),
    sb.from("matieres").select("*").eq("classe_id", classe.id).order("ordre"),
    sb.from("classe_eleves").select("eleve_id").eq("classe_id", classe.id),
    sb.rpc("eleves_bulletins", { p_annee: classe.annee_scolaire }),
    ids.length ? sb.from("evaluations").select("*").eq("classe_id", classe.id).in("periode_id", ids).order("date") : Promise.resolve({ data: [] }),
    ids.length ? sb.from("bulletins").select("id, periode_id, eleve_id").eq("classe_id", classe.id).in("periode_id", ids) : Promise.resolve({ data: [] }),
    sb.from("releves_notes").select("*").eq("classe_id", classe.id).eq("periode_id", periode.id),
    sb.from("bulletins_trimestre").select("*").eq("classe_id", classe.id).eq("annee_scolaire", classe.annee_scolaire).eq("trimestre", trimestre),
  ]);
  if (rl.error) throw new Error(rl.error.message);
  if (bt.error) throw new Error(bt.error.message);
  const membres = new Set(((ce.data ?? []) as { eleve_id: string }[]).map((x) => x.eleve_id));
  const evaluations = (ev.data ?? []) as Evaluation[];
  const bulletinsPeriode = (bp.data ?? []) as ContexteDocs["bulletinsPeriode"];
  const trimestriels = (bt.data ?? []) as DocTrimestre[];
  const releves = (rl.data ?? []) as DocReleve[];
  const [n, l, ap, ar] = await Promise.all([
    evaluations.length ? sb.from("evaluation_notes").select("*").in("evaluation_id", evaluations.map((x) => x.id)) : Promise.resolve({ data: [] }),
    bulletinsPeriode.length ? sb.from("bulletin_lignes").select("*").in("bulletin_id", bulletinsPeriode.map((x) => x.id)) : Promise.resolve({ data: [] }),
    trimestriels.length
      ? sb.from("bulletins_trimestre_appreciations").select("bulletin_id, matiere_id, texte").in("bulletin_id", trimestriels.map((x) => x.id))
      : Promise.resolve({ data: [] }),
    releves.length
      ? sb.from("releves_notes_appreciations").select("releve_id, matiere_id, texte").in("releve_id", releves.map((x) => x.id))
      : Promise.resolve({ data: [] }),
  ]);
  return {
    classe,
    periodes,
    trimestre,
    groupes: (g.data ?? []) as Groupe[],
    matieres: (m.data ?? []) as Matiere[],
    eleves: ((el.data ?? []) as EleveBulletin[]).filter((e) => membres.has(e.id)),
    evaluations,
    notes: (n.data ?? []) as Note[],
    bulletinsPeriode,
    lignes: (l.data ?? []) as Ligne[],
    releves,
    trimestriels,
    // Les identifiants (uuid) des relevés et des bulletins trimestriels ne se recouvrent pas : une seule liste.
    appreciations: [
      ...((ap.data ?? []) as AppreciationIntervenant[]),
      ...((ar.data ?? []) as { releve_id: string; matiere_id: string; texte: string | null }[]).map((x) => ({ bulletin_id: x.releve_id, matiere_id: x.matiere_id, texte: x.texte })),
    ],
  };
}

type Outils = { titulaire: string | null; enseignants: Map<string, Enseignant> };

function groupesDe(ctx: ContexteDocs, eleve: EleveBulletin) {
  const niveau = niveauDe(eleve, ctx.classe.annee_scolaire);
  return {
    niveau,
    groupes: [...ctx.groupes]
      .sort((a, b) => a.ordre - b.ordre)
      .map((g) => ({ groupe: g, matieres: ctx.matieres.filter((m) => m.groupe_id === g.id && matiereConcerne(m, niveau)).sort((a, b) => a.ordre - b.ordre) }))
      .filter((g) => g.matieres.length > 0),
  };
}

const profs = (m: Matiere, o: Outils) =>
  m.enseignants.map((id) => o.enseignants.get(id)).filter((e): e is Enseignant => !!e).map(nomEnseignant).join(", ");

/** Notes d'un élève dans une matière pour une période (textes affichables) et valeurs sur 20. */
function notesPeriode(ctx: ContexteDocs, eleveId: string, m: Matiere, p: Periode) {
  const textes: string[] = [];
  const valeurs: number[] = [];
  const notes = new Map(ctx.notes.map((n) => [`${n.evaluation_id}:${n.eleve_id}`, n]));
  const evals = ctx.evaluations.filter((e) => e.matiere_id === m.id && e.periode_id === p.id);
  for (const ev of evals) {
    const n = notes.get(`${ev.id}:${eleveId}`);
    if (!n) continue;
    if (n.etat) {
      textes.push(`${ev.titre} : ${ETATS[n.etat] ?? n.etat}`);
      continue;
    }
    if (n.note === null || n.note === undefined) continue;
    textes.push(`${ev.titre} : ${nombre(Number(n.note))}/${nombre(Number(ev.bareme))}`);
    valeurs.push((Number(n.note) / Number(ev.bareme)) * 20);
  }
  if (!evals.length) {
    // Repris d'École Futée : la note de période saisie.
    const b = ctx.bulletinsPeriode.find((x) => x.periode_id === p.id && x.eleve_id === eleveId);
    const l = b ? ctx.lignes.find((x) => x.bulletin_id === b.id && x.matiere_id === m.id) : undefined;
    if (l?.moyenne_saisie !== null && l?.moyenne_saisie !== undefined) {
      textes.push(`${nombre(Number(l.moyenne_saisie))}/20`);
      valeurs.push(Number(l.moyenne_saisie));
    }
  }
  return { textes, valeurs };
}

const moyenne = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);
const vide = { moy: null, moyClasse: null, rang: null };

/** Relevé de notes d'un élève pour la période choisie (aucune moyenne). */
export function syntheseReleve(ctx: ContexteDocs, periode: Periode, eleve: EleveBulletin, doc: DocReleve | undefined, o: Outils): Synthese {
  const { niveau, groupes } = groupesDe(ctx, eleve);
  return {
    v: 1,
    mode: "releve",
    eleve: { prenom: eleve.prenom ?? "", nom: eleve.nom, niveau },
    classe: { nom: ctx.classe.nom, titulaire: o.titulaire },
    periode: {
      libelle: `Du ${periode.debut.split("-").reverse().join("/")} au ${periode.fin.split("-").reverse().join("/")}`,
      annee: ctx.classe.annee_scolaire,
      trimestre: periode.trimestre,
      numero: periode.ordre,
    },
    afficherRang: false,
    general: vide,
    groupes: groupes.map((g) => ({
      nom: g.groupe.nom,
      chiffre: vide,
      matieres: g.matieres.map((m) => {
        if (estAppreciationSeule(m.nom)) {
          const a = ctx.appreciations.find((x) => x.bulletin_id === doc?.id && x.matiere_id === m.id);
          return { nom: m.nom, enseignants: profs(m, o), chiffre: vide, commentaire: a?.texte?.trim() || null, appreciationSeule: true };
        }
        const { textes } = notesPeriode(ctx, eleve.id, m, periode);
        return { nom: m.nom, enseignants: profs(m, o), chiffre: vide, commentaire: textes.join(" · ") || null };
      }),
    })),
    mention: null,
    appreciation: doc?.appreciation?.trim() || null,
    publieLe: new Date().toISOString(),
  };
}

/**
 * Matières qui ont leur propre appréciation sur le bulletin : celles d'un professeur intervenant (un enseignant autre
 * que la titulaire) et le Catéchisme (appréciation seule).
 */
export const matieresIntervenants = (ctx: ContexteDocs) =>
  ctx.matieres.filter((m) => m.actif && (estAppreciationSeule(m.nom) || m.enseignants.some((id) => id !== ctx.classe.titulaire_id)));

/** Bulletin trimestriel d'un élève : moyennes simples sur 20 ; appréciations des intervenants dans leur matière. */
export function syntheseTrimestre(ctx: ContexteDocs, eleve: EleveBulletin, doc: DocTrimestre | undefined, o: Outils): Synthese {
  const { niveau, groupes } = groupesDe(ctx, eleve);
  const intervenants = new Set(matieresIntervenants(ctx).map((m) => m.id));
  const app = new Map(ctx.appreciations.filter((a) => a.bulletin_id === doc?.id).map((a) => [a.matiere_id, a.texte?.trim() || null]));
  const gs = groupes.map((g) => {
    const matieres = g.matieres.map((m) => {
      // Catéchisme : appréciation seule, hors des moyennes.
      if (estAppreciationSeule(m.nom))
        return { nom: m.nom, enseignants: profs(m, o), chiffre: vide, commentaire: app.get(m.id) ?? null, brut: null, appreciationSeule: true as const };
      const valeurs = ctx.periodes.flatMap((p) => notesPeriode(ctx, eleve.id, m, p).valeurs);
      const moy = moyenne(valeurs);
      return { nom: m.nom, enseignants: profs(m, o), chiffre: { ...vide, moy: arrondi(moy) }, commentaire: intervenants.has(m.id) ? (app.get(m.id) ?? null) : null, brut: moy, appreciationSeule: undefined };
    });
    const moy = moyenne(matieres.map((m) => m.brut).filter((x): x is number => x !== null));
    return { nom: g.groupe.nom, chiffre: { ...vide, moy: arrondi(moy) }, matieres: matieres.map((x) => ({ nom: x.nom, enseignants: x.enseignants, chiffre: x.chiffre, commentaire: x.commentaire, ...(x.appreciationSeule ? { appreciationSeule: true } : {}) })), brut: moy };
  });
  const general = moyenne(gs.map((g) => g.brut).filter((x): x is number => x !== null));
  return {
    v: 1,
    mode: "trimestre",
    eleve: { prenom: eleve.prenom ?? "", nom: eleve.nom, niveau, naissance: eleve.date_naissance ?? null },
    classe: { nom: ctx.classe.nom, titulaire: o.titulaire },
    periode: { libelle: "", annee: ctx.classe.annee_scolaire, trimestre: ctx.trimestre },
    afficherRang: false,
    general: { ...vide, moy: arrondi(general) },
    groupes: gs.map((x) => ({ nom: x.nom, chiffre: x.chiffre, matieres: x.matieres })),
    mention: null,
    appreciation: doc?.appreciation?.trim() || null,
    publieLe: new Date().toISOString(),
  };
}

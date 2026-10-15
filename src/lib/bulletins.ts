// Bulletins scolaires : types, calcul des moyennes et des rangs, synthèse figée à la publication.
//
// Règles (reprises d'École Futée, 13/10/2026) :
//  - moyenne d'une matière = moyenne des évaluations de la période, ramenées sur 20 et pondérées par leur coefficient ;
//    une moyenne saisie directement (ou reprise d'École Futée) prime sur le calcul ;
//  - moyenne d'un groupe (Français, Mathématiques…) = moyenne des matières notées, pondérée par leur coefficient ;
//  - moyenne générale = moyenne des groupes notés, pondérée par leur coefficient ;
//  - classe multi-niveaux : rang et moyenne de la classe se calculent parmi les élèves du même niveau (réglage de la classe) ;
//  - une matière peut ne concerner que certains niveaux (la GS n'a pas les matières du CP).
// Les bulletins repris d'École Futée portent ses chiffres (`synthese.chiffres`), qui priment sur le calcul.

import { classeEn, type Eleve } from "@/lib/eleves";
import { resumeAbsences, type Absence, type Appel, type ResumeAbsences } from "@/lib/absences";
import { presentiel } from "@/lib/calendrier";

export type Statut = "nouveau" | "en_cours" | "pret" | "valide" | "publie";
export type Mention = "avertissement" | "encouragements" | "compliments" | "felicitations";

export const STATUTS: { v: Statut; label: string; classe: string }[] = [
  { v: "nouveau", label: "Nouveau", classe: "bg-surface-2 text-muted" },
  { v: "en_cours", label: "En cours", classe: "bg-gold-soft text-gold" },
  { v: "pret", label: "Prêt", classe: "bg-accent-soft text-accent" },
  { v: "valide", label: "Validé", classe: "bg-positive/10 text-positive" },
  // Vert doux et liseré plutôt qu'un aplat : le vert du thème sombre est trop vif en fond plein.
  { v: "publie", label: "Publié", classe: "bg-positive/20 text-positive font-semibold ring-1 ring-inset ring-positive/40" },
];
export const statutDe = (s: Statut) => STATUTS.find((x) => x.v === s) ?? STATUTS[0];

export const MENTIONS: { v: Mention; label: string }[] = [
  { v: "avertissement", label: "Avertissement" },
  { v: "encouragements", label: "Encouragements" },
  { v: "compliments", label: "Compliments" },
  { v: "felicitations", label: "Félicitations" },
];
export const mentionLabel = (m: Mention | null | undefined) => MENTIONS.find((x) => x.v === m)?.label ?? null;

export type Periode = { id: string; annee_scolaire: string; libelle: string | null; debut: string; fin: string; trimestre: number | null; ordre: number };
export type Enseignant = {
  id: string;
  civilite: string | null;
  prenom: string;
  nom: string;
  user_id: string | null;
  identifiant: string | null;
  actif: boolean;
  /** Masqué de la liste de l'écran de connexion (compte et droits conservés). */
  masque_connexion: boolean;
};
export type Classe = {
  id: string;
  annee_scolaire: string;
  nom: string;
  niveaux: string[];
  titulaire_id: string | null;
  notation: "notes" | "competences";
  afficher_rang: boolean;
  rang_par_niveau: boolean;
  /** Option de la Directrice : taux de présentiel imprimé sur les bulletins de la classe. */
  presentiel_bulletin?: boolean;
  ordre: number;
};
export type Groupe = { id: string; classe_id: string; nom: string; coef: number; ordre: number };
export type Matiere = {
  id: string;
  classe_id: string;
  groupe_id: string;
  nom: string;
  coef: number;
  enseignants: string[];
  niveaux: string[];
  ordre: number;
  actif: boolean;
};
/** niveaux : niveaux concernés dans une classe à plusieurs niveaux (vide = toute la classe). */
export type Evaluation = { id: string; classe_id: string; matiere_id: string; periode_id: string; titre: string; date: string; coef: number; bareme: number; niveaux?: string[] };

/** L'évaluation concerne-t-elle un élève de ce niveau ? */
export const evaluationConcerne = (ev: Pick<Evaluation, "niveaux">, niveau: string | null) => !ev.niveaux?.length || (!!niveau && ev.niveaux.includes(niveau));
export type Note = { evaluation_id: string; eleve_id: string; note: number | null; etat: "absent" | "dispense" | "non_rendu" | null };
export type Chiffre = { moy: number | null; moyClasse: number | null; rang: number | null };
export type Bulletin = {
  id: string;
  periode_id: string;
  classe_id: string;
  eleve_id: string;
  statut: Statut;
  mention: Mention | null;
  appreciation: string | null;
  synthese: Synthese | { source: "ecole-futee"; chiffres: Record<string, Chiffre> } | null;
  valide_le: string | null;
  publie_le: string | null;
  lu_le: string | null;
  envoye_courrier_le: string | null;
  source: string | null;
  updated_at: string;
};
export type Ligne = { bulletin_id: string; matiere_id: string; commentaire: string | null; afficher: boolean; moyenne_saisie: number | null };
export type EleveBulletin = Eleve & { id: string; prenom: string | null; nom: string; famille_id: string; date_naissance?: string | null };

/** Synthèse figée : ce que lisent la famille et le PDF. */
export type Synthese = {
  v: 1;
  /** Relevé de notes (période : notes seules, sans moyenne) ou bulletin trimestriel (moyennes simples, sans classe ni rang). Absent : bulletin de période historique. */
  mode?: "releve" | "trimestre";
  source?: string | null;
  /** naissance : date ISO, imprimée sur le bulletin trimestriel. */
  eleve: { prenom: string; nom: string; niveau: string | null; naissance?: string | null };
  classe: { nom: string; titulaire: string | null };
  periode: { libelle: string; annee: string; trimestre: number | null; numero?: number };
  afficherRang: boolean;
  general: Chiffre;
  groupes: { nom: string; chiffre: Chiffre; matieres: { nom: string; enseignants: string; chiffre: Chiffre; commentaire: string | null; appreciationSeule?: boolean }[] }[];
  mention: Mention | null;
  appreciation: string | null;
  publieLe?: string | null;
  /** Absences et retards de la période (bulletins publiés depuis Préau). */
  absences?: ResumeAbsences;
  /** Taux de présentiel de la période (0–1), si la classe l'affiche. */
  presentiel?: number | null;
  /** Commentaires par rubrique (Catéchisme, Travail…), repris d'École Futée. */
  rubriques?: { titre: string; texte: string }[];
  /** Bulletins repris d'École Futée : ses chiffres, conservés pour un éventuel retour en arrière. */
  chiffres?: Record<string, Chiffre>;
};

export const arrondi = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
export const note20 = (n: number | null | undefined) => (n === null || n === undefined ? "–" : n.toFixed(2).replace(".", ","));
export const rangTexte = (r: number | null) => (r === null ? "–" : r === 1 ? "1er" : `${r}e`);

const dateCourte = (iso: string) => {
  const [a, m, j] = iso.split("-");
  return `${Number(j)}.${m}.${a}`;
};
export const libellePeriode = (p: Pick<Periode, "libelle" | "debut" | "fin">) => p.libelle?.trim() || `Du ${dateCourte(p.debut)} au ${dateCourte(p.fin)}`;
export const nomEnseignant = (e: Pick<Enseignant, "civilite" | "prenom" | "nom">) => [e.civilite, e.prenom, e.nom].filter(Boolean).join(" ");
export const nomEleve = (e: Pick<EleveBulletin, "prenom" | "nom">) => `${e.prenom ?? ""} ${e.nom}`.trim();

/** Niveau de l'élève cette année-là (PS … CM2). */
export const niveauDe = (e: EleveBulletin, annee: string) => classeEn(e, annee);

/** La matière concerne-t-elle ce niveau ? */
export const matiereConcerne = (m: Matiere, niveau: string | null) => m.actif && (m.niveaux.length === 0 || (!!niveau && m.niveaux.includes(niveau)));

/** Moyenne pondérée de couples [valeur, poids] ; null si rien. */
function moyennePonderee(couples: [number, number][]): number | null {
  const p = couples.reduce((s, [, w]) => s + w, 0);
  return p > 0 ? couples.reduce((s, [v, w]) => s + v * w, 0) / p : null;
}

/** Moyenne d'un élève dans une matière à partir des évaluations (sur 20). */
export function moyenneEvaluations(evals: Evaluation[], notes: Map<string, Note>, eleveId: string): { moy: number | null; nb: number } {
  const couples: [number, number][] = [];
  for (const ev of evals) {
    const n = notes.get(`${ev.id}:${eleveId}`);
    if (!n || n.etat || n.note === null || n.note === undefined) continue;
    couples.push([(Number(n.note) / Number(ev.bareme)) * 20, Number(ev.coef)]);
  }
  return { moy: moyennePonderee(couples), nb: couples.length };
}

/** Rang « compétition » (1, 2, 2, 4) : valeurs arrondies au centième, de la plus haute à la plus basse. */
function rangs(valeurs: Map<string, number | null>): Map<string, number> {
  const notees = [...valeurs].filter((x): x is [string, number] => x[1] !== null).map(([k, v]) => [k, arrondi(v) as number] as const);
  const r = new Map<string, number>();
  for (const [k, v] of notees) r.set(k, 1 + notees.filter(([, w]) => w > v).length);
  return r;
}
const moyenneSimple = (vals: (number | null)[]) => {
  const v = vals.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

export type ResultatMatiere = { matiere: Matiere; chiffre: Chiffre; calculee: number | null; nbNotes: number; ligne: Ligne | null };
export type ResultatEleve = {
  eleve: EleveBulletin;
  niveau: string | null;
  bulletin: Bulletin | null;
  general: Chiffre;
  groupes: { groupe: Groupe; chiffre: Chiffre; matieres: ResultatMatiere[] }[];
  absences: ResumeAbsences;
  presentiel: number | null;
};

export type ContexteClasse = {
  classe: Classe;
  periode: Periode;
  groupes: Groupe[];
  matieres: Matiere[];
  eleves: EleveBulletin[];
  evaluations: Evaluation[];
  notes: Note[];
  bulletins: Bulletin[];
  lignes: Ligne[];
  /** Absences des élèves de la classe pendant la période. */
  absences: Absence[];
  /** Appels de la classe pendant la période (si le taux de présentiel figure sur les bulletins). */
  appels?: Pick<Appel, "date" | "demi_journee">[];
};

/** Calcule moyennes, moyennes de classe et rangs de tous les élèves d'une classe pour une période. */
export function calculerClasse(ctx: ContexteClasse): ResultatEleve[] {
  const annee = ctx.classe.annee_scolaire;
  const notes = new Map(ctx.notes.map((n) => [`${n.evaluation_id}:${n.eleve_id}`, n]));
  const bulletinDe = new Map(ctx.bulletins.map((b) => [b.eleve_id, b]));
  const lignes = new Map(ctx.lignes.map((l) => [`${l.bulletin_id}:${l.matiere_id}`, l]));
  const groupes = [...ctx.groupes].sort((a, b) => a.ordre - b.ordre);
  const matieresDe = (g: Groupe) => ctx.matieres.filter((m) => m.groupe_id === g.id).sort((a, b) => a.ordre - b.ordre);
  const evalsDe = (m: Matiere) => ctx.evaluations.filter((e) => e.matiere_id === m.id && e.periode_id === ctx.periode.id);

  // 1. Moyennes de chaque élève.
  const res: ResultatEleve[] = ctx.eleves.map((eleve) => {
    const niveau = niveauDe(eleve, annee);
    const bulletin = bulletinDe.get(eleve.id) ?? null;
    const gs = groupes
      .map((groupe) => {
        const matieres = matieresDe(groupe)
          .filter((m) => matiereConcerne(m, niveau))
          .map((matiere): ResultatMatiere => {
            const ligne = bulletin ? (lignes.get(`${bulletin.id}:${matiere.id}`) ?? null) : null;
            const { moy, nb } = moyenneEvaluations(evalsDe(matiere), notes, eleve.id);
            const saisie = ligne?.moyenne_saisie ?? null;
            return { matiere, calculee: moy, nbNotes: nb, ligne, chiffre: { moy: saisie !== null ? Number(saisie) : moy, moyClasse: null, rang: null } };
          });
        const moy = moyennePonderee(matieres.filter((m) => m.chiffre.moy !== null).map((m) => [m.chiffre.moy as number, Number(m.matiere.coef)]));
        return { groupe, matieres, chiffre: { moy, moyClasse: null, rang: null } as Chiffre };
      })
      .filter((g) => g.matieres.length > 0);
    const general = moyennePonderee(gs.filter((g) => g.chiffre.moy !== null).map((g) => [g.chiffre.moy as number, Number(g.groupe.coef)]));
    const absences = resumeAbsences((ctx.absences ?? []).filter((a) => a.eleve_id === eleve.id && a.date >= ctx.periode.debut && a.date <= ctx.periode.fin));
    const dePeriode = (ctx.absences ?? []).filter((a) => a.eleve_id === eleve.id && a.date >= ctx.periode.debut && a.date <= ctx.periode.fin);
    const taux = ctx.classe.presentiel_bulletin && ctx.appels ? presentiel(ctx.appels, dePeriode, eleve.sorti_le).taux : null;
    return { eleve, niveau, bulletin, groupes: gs, general: { moy: general, moyClasse: null, rang: null }, absences, presentiel: taux };
  });

  // 2. Moyennes de classe et rangs, parmi les élèves comparables (même niveau si la classe le demande).
  const comparables = (r: ResultatEleve) => (ctx.classe.rang_par_niveau ? res.filter((x) => x.niveau === r.niveau) : res);
  const parNiveau = new Map<string, ResultatEleve[]>();
  for (const r of res) {
    const k = ctx.classe.rang_par_niveau ? (r.niveau ?? "") : "";
    if (!parNiveau.has(k)) parNiveau.set(k, comparables(r));
  }
  for (const lot of parNiveau.values()) {
    const general = new Map(lot.map((r) => [r.eleve.id, r.general.moy]));
    const rg = rangs(general);
    const mc = moyenneSimple([...general.values()]);
    for (const r of lot) Object.assign(r.general, { rang: rg.get(r.eleve.id) ?? null, moyClasse: mc });
    for (const g of groupes) {
      const vals = new Map(lot.map((r) => [r.eleve.id, r.groupes.find((x) => x.groupe.id === g.id)?.chiffre.moy ?? null]));
      const rgG = rangs(vals);
      const mcG = moyenneSimple([...vals.values()]);
      for (const r of lot) {
        const x = r.groupes.find((y) => y.groupe.id === g.id);
        if (x) Object.assign(x.chiffre, { rang: rgG.get(r.eleve.id) ?? null, moyClasse: mcG });
      }
    }
    for (const m of ctx.matieres) {
      const vals = new Map<string, number | null>();
      for (const r of lot) {
        const x = r.groupes.flatMap((g) => g.matieres).find((y) => y.matiere.id === m.id);
        if (x) vals.set(r.eleve.id, x.chiffre.moy);
      }
      const rgM = rangs(vals);
      const mcM = moyenneSimple([...vals.values()]);
      for (const r of lot) {
        const x = r.groupes.flatMap((g) => g.matieres).find((y) => y.matiere.id === m.id);
        if (x) Object.assign(x.chiffre, { rang: rgM.get(r.eleve.id) ?? null, moyClasse: mcM });
      }
    }
  }

  // 3. Bulletins repris d'École Futée : ses chiffres priment.
  for (const r of res) {
    const s = r.bulletin?.synthese as { chiffres?: Record<string, Chiffre> } | null | undefined;
    const ch = s?.chiffres;
    if (!ch) continue;
    const appliquer = (c: Chiffre, nom: string) => {
      const x = ch[nom];
      if (x) Object.assign(c, { moy: x.moy ?? null, moyClasse: x.moyClasse ?? null, rang: x.rang ?? null });
    };
    appliquer(r.general, "Moyenne générale");
    for (const g of r.groupes) {
      appliquer(g.chiffre, g.groupe.nom);
      for (const m of g.matieres) {
        if (ch[m.matiere.nom]) appliquer(m.chiffre, m.matiere.nom);
        else Object.assign(m.chiffre, { moyClasse: null, rang: null });
      }
    }
  }
  return res;
}

/** Commentaires remplis / matières concernées. */
export function avancement(r: ResultatEleve) {
  const ms = r.groupes.flatMap((g) => g.matieres);
  return { commentaires: ms.filter((m) => m.ligne?.commentaire?.trim()).length, notees: ms.filter((m) => m.chiffre.moy !== null).length, total: ms.length };
}

/** Synthèse à figer à la publication. */
export function construireSynthese(r: ResultatEleve, ctx: { classe: Classe; periode: Periode; titulaire: string | null; enseignants: Map<string, Enseignant> }): Synthese {
  const b = r.bulletin;
  return {
    v: 1,
    source: b?.source ?? null,
    eleve: { prenom: r.eleve.prenom ?? "", nom: r.eleve.nom, niveau: r.niveau },
    classe: { nom: ctx.classe.nom, titulaire: ctx.titulaire },
    periode: { libelle: libellePeriode(ctx.periode), annee: ctx.classe.annee_scolaire, trimestre: ctx.periode.trimestre, numero: ctx.periode.ordre },
    afficherRang: ctx.classe.afficher_rang,
    general: { ...r.general, moy: arrondi(r.general.moy), moyClasse: arrondi(r.general.moyClasse) },
    groupes: r.groupes.map((g) => ({
      nom: g.groupe.nom,
      chiffre: { ...g.chiffre, moy: arrondi(g.chiffre.moy), moyClasse: arrondi(g.chiffre.moyClasse) },
      matieres: g.matieres
        .filter((m) => m.ligne?.afficher !== false)
        .map((m) => ({
          nom: m.matiere.nom,
          enseignants: m.matiere.enseignants.filter((id) => id !== ctx.classe.titulaire_id).map((id) => ctx.enseignants.get(id)).filter((e): e is Enseignant => !!e).map(nomEnseignant).join(", "),
          chiffre: { ...m.chiffre, moy: arrondi(m.chiffre.moy), moyClasse: arrondi(m.chiffre.moyClasse) },
          commentaire: m.ligne?.commentaire?.trim() || null,
        })),
    })),
    mention: b?.mention ?? null,
    appreciation: b?.appreciation?.trim() || null,
    absences: r.absences,
    ...(r.presentiel !== null ? { presentiel: r.presentiel } : {}),
    publieLe: new Date().toISOString(),
    ...((b?.synthese as { chiffres?: Record<string, Chiffre> } | null)?.chiffres ? { chiffres: (b?.synthese as { chiffres: Record<string, Chiffre> }).chiffres } : {}),
  };
}

/** Une synthèse complète (publiée) ou seulement des chiffres repris ? */
export const estSynthese = (s: Bulletin["synthese"]): s is Synthese => !!s && (s as Synthese).v === 1;

/** « Période 2 · 1er trimestre » : le titre lisible ; les dates viennent en second. */
export const titrePeriode = (p: Synthese["periode"]) =>
  [p.numero ? `Période ${p.numero}` : p.libelle, p.trimestre ? `${p.trimestre === 1 ? "1er" : `${p.trimestre}e`} trimestre` : null].filter(Boolean).join(" · ");

/** « Premier Trimestre », « Deuxième Trimestre »… (bulletins trimestriels). */
export const trimestreEnLettres = (t: number) => `${["Premier", "Deuxième", "Troisième"][t - 1] ?? `${t}e`} Trimestre`;

/**
 * Titre d'un document : relevé de notes, les dates de la période seules ; bulletin trimestriel, « Premier Trimestre » ;
 * bulletin de période historique, « Période 2 · 1er trimestre ».
 */
export const titreDocument = (s: Pick<Synthese, "mode" | "periode">) =>
  s.mode === "releve" ? s.periode.libelle : s.mode === "trimestre" && s.periode.trimestre ? trimestreEnLettres(s.periode.trimestre) : titrePeriode(s.periode);

/** Matière notée par une appréciation seule, sans note ni moyenne (Catéchisme). */
export const estAppreciationSeule = (nom: string) => nom.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase() === "catechisme";

/** Classe affichée pour un élève : sa section (« Classe : CE1 »), jamais le regroupement de classes (CE1 CE2 CM1). */
export const classeEleve = (s: Pick<Synthese, "eleve"> | null | undefined) => (s?.eleve.niveau ? `Classe : ${s.eleve.niveau}` : "");

/** Date ISO (aaaa-mm-jj) en jj/mm/aaaa. */
export const dateJJMMAAAA = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export const nomFichierBulletin = (s: Synthese) =>
  `${s.mode === "releve" ? "Relevé de notes" : "Bulletin"} ${s.eleve.prenom} ${s.eleve.nom} - ${s.mode ? titreDocument(s) : s.periode.numero ? `Période ${s.periode.numero}` : s.periode.libelle}`.replace(
    /[\\/:*?"<>|]/g,
    "-",
  ) + ".pdf";

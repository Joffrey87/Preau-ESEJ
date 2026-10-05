// Foyers : un même couple saisi en plusieurs fiches (une par conjoint, nom écrit de plusieurs façons).
//
// Rapprochement par les PRÉNOMS, jamais par le seul nom de famille (plusieurs donateurs de la même
// famille sont fréquents). Deux fiches forment un couple quand :
//  - une écriture bancaire (ou une fiche « Monsieur & Madame ») contient les DEUX prénoms et un nom de
//    famille commun aux deux fiches ;
//  - ou, pour une même personne écrite autrement, quand le prénom est identique et que le nom de l'une
//    est contenu dans celui de l'autre (« D AUBREBY » ⊂ « d'Aubreby Delacour »).
// Rien n'est écrit ici : on propose, pour chaque foyer, la fiche fusionnée (modifiable avant d'appliquer).

import { normaliser } from "@/lib/reconciliation";
import { VERROU } from "@/lib/donsChiffre";
import { PARTICULES, cleFloue, construireGroupe, type ChampFiche, type GroupeAHarmoniser } from "@/lib/fichesDoublons";
import { TITRE_COUPLE, composerCourrielsCouple, composerPrenomsCouple, courrielsDuCouple, estCouple, prenomsDuCouple } from "@/lib/couple";
import { formatDate } from "@/lib/format";
import type { Don } from "@/components/GestionDons";

export type TexteOperation = { date: string; texte: string };

const LONGUEUR_MIN_NOM = 4;

const mots = (s: string | null | undefined): string[] => normaliser(s ?? "").split(" ").filter(Boolean);

/** « daubreby » ≈ « d'aubreby » : un mot long qui commence par « d » est aussi lu sans son « d ». */
const avecVariantes = (m: string): string[] => (m.length >= 6 && m.startsWith("d") ? [m, m.slice(1)] : [m]);

/** Mots significatifs d'un nom de famille, sans particules, avec leurs variantes (« d » collé). */
export function jetonsNom(nom: string | null | undefined): Set<string> {
  const res = new Set<string>();
  for (const m of mots(nom)) if (m.length >= 2 && !PARTICULES.has(m)) avecVariantes(m).forEach((v) => res.add(v));
  return res;
}

/** Mots d'un prénom (« Anne-Sophie » → anne, sophie), triés pour comparer. */
function jetonsPrenom(prenom: string | null | undefined): string[] {
  return [...new Set(mots(prenom).filter((m) => m.length >= 2 && !PARTICULES.has(m)))].sort();
}

type Fiche = {
  cle: string;
  dons: Don[];
  /** Un tableau de prénoms par personne : un particulier en a un, une fiche « couple » en a deux. */
  personnes: string[][];
  nom: Set<string>;
  couple: boolean;
};

const memeListe = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function nomsCompatibles(a: Fiche, b: Fiche): boolean {
  for (const t of a.nom) if (t.length >= LONGUEUR_MIN_NOM && b.nom.has(t)) return true;
  return false;
}
const inclus = (a: Set<string>, b: Set<string>) => [...a].every((t) => b.has(t));
const nomContenuDansL_Autre = (a: Fiche, b: Fiche) => inclus(a.nom, b.nom) || inclus(b.nom, a.nom);

function fiches(dons: Don[]): Fiche[] {
  const parCle = new Map<string, Don[]>();
  for (const d of dons) {
    if (d.supprime_le || d.est_personne_morale || d.donateur_nom === VERROU || !d.donateur_nom) continue;
    const cle = cleFloue(d);
    if (!cle) continue;
    (parCle.get(cle) ?? parCle.set(cle, []).get(cle)!).push(d);
  }
  const res: Fiche[] = [];
  for (const [cle, liste] of parCle) {
    const recent = [...liste].sort((a, b) => b.date_don.localeCompare(a.date_don))[0];
    const couple = estCouple(recent.donateur_titre);
    const personnes = couple
      ? Object.values(prenomsDuCouple(recent.donateur_prenom)).map(jetonsPrenom).filter((p) => p.length > 0)
      : [jetonsPrenom(recent.donateur_prenom)].filter((p) => p.length > 0);
    if (personnes.length === 0) continue;
    res.push({ cle, dons: liste, personnes, nom: jetonsNom(recent.donateur_nom), couple });
  }
  return res;
}

const recent = (f: Fiche): Don => [...f.dons].sort((a, b) => b.date_don.localeCompare(a.date_don))[0];

/** Fiches et ensembles de personnes reliés par une preuve. */
export function foyersARegrouper(dons: Don[], operations: TexteOperation[]): { groupes: GroupeAHarmoniser[]; ignores: number } {
  const liste = fiches(dons);
  const parent = liste.map((_, i) => i);
  const racine = (i: number): number => (parent[i] === i ? i : (parent[i] = racine(parent[i])));
  const unir = (a: number, b: number) => void (parent[racine(a)] = racine(b));
  const preuves = new Map<number, Set<string>>(); // par fiche : indices retenus
  const noter = (i: number, j: number, t: string) => {
    for (const k of [i, j]) (preuves.get(k) ?? preuves.set(k, new Set()).get(k)!).add(t);
  };

  // 1. Même personne, nom écrit autrement : prénom identique, nom de l'une contenu dans celui de l'autre.
  for (let i = 0; i < liste.length; i++) {
    for (let j = i + 1; j < liste.length; j++) {
      const a = liste[i];
      const b = liste[j];
      if (a.couple || b.couple || !memeListe(a.personnes[0], b.personnes[0])) continue;
      if (nomsCompatibles(a, b) && nomContenuDansL_Autre(a, b)) {
        unir(i, j);
        noter(i, j, `Même prénom et nom écrit autrement : « ${nomAffiche(a)} » / « ${nomAffiche(b)} »`);
      }
    }
  }

  // 2. Fiche « Monsieur & Madame » et fiche d'un conjoint (même prénom, nom compatible).
  liste.forEach((c, i) => {
    if (!c.couple) return;
    liste.forEach((s, j) => {
      if (i === j || s.couple) return;
      if (c.personnes.some((p) => memeListe(p, s.personnes[0])) && nomsCompatibles(c, s)) {
        unir(i, j);
        noter(i, j, `Fiche couple « ${nomAffiche(c)} » et fiche de « ${nomAffiche(s)} »`);
      }
    });
  });

  // 3. Écritures qui nomment les deux prénoms et le nom de famille.
  const parPrenom = new Map<string, number[]>();
  liste.forEach((f, i) => {
    if (f.couple) return;
    for (const p of f.personnes[0]) (parPrenom.get(p) ?? parPrenom.set(p, []).get(p)!).push(i);
  });
  for (const op of operations) {
    const m = new Set(mots(op.texte).flatMap(avecVariantes));
    if (m.size < 3) continue;
    const candidats = new Set<number>();
    for (const w of m) for (const i of parPrenom.get(w) ?? []) candidats.add(i);
    const presents = [...candidats].filter((i) => {
      const f = liste[i];
      return f.personnes[0].every((p) => m.has(p)) && [...f.nom].some((t) => t.length >= LONGUEUR_MIN_NOM && m.has(t));
    });
    for (let x = 0; x < presents.length; x++) {
      for (let y = x + 1; y < presents.length; y++) {
        const a = liste[presents[x]];
        const b = liste[presents[y]];
        if (memeListe(a.personnes[0], b.personnes[0]) || !nomsCompatibles(a, b)) continue;
        unir(presents[x], presents[y]);
        noter(presents[x], presents[y], `Écriture du ${formatDate(op.date)} : « ${op.texte.trim().slice(0, 90)} »`);
      }
    }
  }

  // 4. Un groupe par ensemble de fiches reliées.
  const composantes = new Map<number, number[]>();
  liste.forEach((_, i) => (composantes.get(racine(i)) ?? composantes.set(racine(i), []).get(racine(i))!).push(i));
  const groupes: GroupeAHarmoniser[] = [];
  let ignores = 0;
  for (const idx of composantes.values()) {
    if (idx.length < 2) continue;
    const membres = idx.map((i) => liste[i]);
    const personnes = new Map<string, string[]>();
    for (const f of membres) for (const p of f.personnes) personnes.set(p.join(" "), p);
    if (personnes.size > 2) {
      ignores += 1; // plus de deux personnes : une famille, pas un couple — à traiter à la main
      continue;
    }
    const g = proposer(membres, [...personnes.values()], [...new Set(idx.flatMap((i) => [...(preuves.get(i) ?? [])]))].slice(0, 4));
    if (g) groupes.push(g);
  }
  return { groupes: groupes.sort((a, b) => a.nom.localeCompare(b.nom, "fr")), ignores };
}

const nomAffiche = (f: Fiche): string => {
  const d = recent(f);
  return [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ");
};

const TITRES_MONSIEUR = new Set(["monsieur", "m", "mr"]);
const TITRES_MADAME = new Set(["madame", "mme", "mademoiselle", "mlle"]);

/** Fiche fusionnée proposée pour un ensemble de fiches (un couple ou une seule personne). */
function proposer(membres: Fiche[], personnes: string[][], preuves: string[]): GroupeAHarmoniser | null {
  const dons = membres.flatMap((f) => f.dons);
  // Nom retenu : l'écriture la plus complète (le plus de mots, puis la plus longue).
  const noms = membres.map((f) => (recent(f).donateur_nom ?? "").trim()).filter(Boolean);
  const nom = [...noms].sort((a, b) => jetonsNom(b).size - jetonsNom(a).size || b.length - a.length)[0] ?? "";
  const surcharge: Partial<Record<ChampFiche, string>> = { donateur_nom: nom };

  if (personnes.length === 2) {
    // Prénom tel qu'écrit, par personne ; civilité pour placer monsieur avant madame.
    const couple = membres.find((f) => f.couple);
    let prM = "";
    let prF = "";
    let emailM = "";
    let emailF = "";
    if (couple) {
      const d = recent(couple);
      ({ monsieur: prM, madame: prF } = prenomsDuCouple(d.donateur_prenom));
      ({ monsieur: emailM, madame: emailF } = courrielsDuCouple(d.courriel));
    }
    const singles = membres.filter((f) => !f.couple);
    const parPersonne = (p: string[]) => singles.find((f) => memeListe(f.personnes[0], p));
    const placer = (p: string[]) => {
      const f = parPersonne(p);
      if (!f) return;
      const d = recent(f);
      const t = normaliser(d.donateur_titre ?? "");
      const prenom = (d.donateur_prenom ?? "").trim();
      const email = (f.dons.map((x) => (x.courriel ?? "").trim()).find(Boolean) ?? "").split(/\s*[,;]\s*/)[0];
      // Madame va en second ; monsieur (ou titre inconnu) prend la première place libre.
      if (TITRES_MADAME.has(t) || prM) {
        if (!prF) {
          prF = prenom;
          emailF = emailF || email;
        }
      } else {
        prM = prenom;
        emailM = emailM || email;
      }
    };
    if (!couple) {
      // Titres connus d'abord, pour que « Monsieur » passe avant « Madame » même si l'ordre des fiches est inverse.
      const ordre = [...personnes].sort((a, b) => {
        const rang = (p: string[]) => {
          const t = normaliser(recent(parPersonne(p) ?? singles[0]).donateur_titre ?? "");
          return TITRES_MONSIEUR.has(t) ? 0 : TITRES_MADAME.has(t) ? 2 : 1;
        };
        return rang(a) - rang(b);
      });
      ordre.forEach(placer);
    }
    if (!prM || !prF) return null;
    surcharge.donateur_titre = TITRE_COUPLE;
    surcharge.donateur_prenom = composerPrenomsCouple(prM, prF);
    surcharge.courriel = composerCourrielsCouple(emailM, emailF && emailF !== emailM ? emailF : "");
  }
  return construireGroupe(`foyer|${membres.map((f) => f.cle).sort().join("|")}`, dons, surcharge, preuves);
}

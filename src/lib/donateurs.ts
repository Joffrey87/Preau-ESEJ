// Qualification des donateurs à partir de l'historique réel des dons.
// Règles issues du plan de financement (voir lib/segments.ts : PARAMS, SEGMENTS,
// PICS_ANNEE). L'agrégation se fait CÔTÉ NAVIGATEUR car les noms sont chiffrés.

import { PARAMS, SEGMENTS, PICS_ANNEE } from "@/lib/segments";
import { cleDonateur, nomDonateur, type Tone } from "@/lib/statutDon";

export type DonAgg = {
  est_personne_morale: boolean;
  donateur_nom: string | null;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  courriel: string | null;
  montant: number;
  date_don: string;
  origine: string | null;
};

export type EtatDonateur = "actif" | "sommeil" | "perdu";

export type ProfilDonateur = {
  cle: string;
  nom: string;
  estMorale: boolean;
  courriel: string | null;
  cumul: number; // total tous dons
  cumulAnnee: number; // année civile courante
  meilleureAnnee: number; // meilleur cumul sur une année civile
  nbDons: number;
  nbAnnees: number; // années civiles distinctes
  premier: string; // ISO
  dernier: string; // ISO
  moisDepuisDernier: number;
  moyenne: number;
  etat: EtatDonateur;
  estGrand: boolean;
  estFidele: boolean;
  estNouveau: boolean;
  estPonctuel: boolean;
  origine: string | null; // « qui a amené ce don » = relation (dernier don renseigné)
};

/** Nombre de mois entiers écoulés entre deux dates ISO (b ≥ a). */
export function moisEntre(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  let m = (by - ay) * 12 + (bm - am);
  if (bd < ad) m -= 1;
  return m;
}

/** Agrège les dons par donateur et calcule le profil de chacun. */
export function agregerDonateurs(dons: DonAgg[], todayISO: string): ProfilDonateur[] {
  const anneeCourante = Number(todayISO.slice(0, 4));
  const groupes = new Map<string, DonAgg[]>();
  for (const d of dons) {
    if (!d.date_don) continue;
    const cle = cleDonateur(d);
    if (!cle) continue;
    (groupes.get(cle) ?? groupes.set(cle, []).get(cle)!).push(d);
  }

  const profils: ProfilDonateur[] = [];
  for (const [cle, liste] of groupes) {
    liste.sort((a, b) => a.date_don.localeCompare(b.date_don));
    const cumul = liste.reduce((s, d) => s + Number(d.montant || 0), 0);
    const parAnnee = new Map<number, number>();
    for (const d of liste) {
      const y = Number(d.date_don.slice(0, 4));
      parAnnee.set(y, (parAnnee.get(y) ?? 0) + Number(d.montant || 0));
    }
    const premier = liste[0].date_don;
    const dernier = liste[liste.length - 1].date_don;
    // Relation = origine du don le plus récent qui en porte une.
    const origine = [...liste].reverse().map((d) => d.origine).find((o) => o && o.trim()) ?? null;
    const moisDepuisDernier = moisEntre(dernier, todayISO);
    const meilleureAnnee = Math.max(0, ...parAnnee.values());
    const cumulAnnee = parAnnee.get(anneeCourante) ?? 0;

    const etat: EtatDonateur =
      moisDepuisDernier >= PARAMS.perduMois ? "perdu" : moisDepuisDernier >= PARAMS.sommeilMois ? "sommeil" : "actif";

    profils.push({
      cle,
      nom: nomDonateur(liste[0]) || "—",
      estMorale: liste[0].est_personne_morale,
      courriel: liste.map((d) => d.courriel).find(Boolean) ?? null,
      cumul,
      cumulAnnee,
      meilleureAnnee,
      nbDons: liste.length,
      nbAnnees: parAnnee.size,
      premier,
      dernier,
      moisDepuisDernier,
      moyenne: cumul / liste.length,
      etat,
      estGrand: meilleureAnnee >= PARAMS.seuilGrandDonateur,
      estFidele: parAnnee.size >= PARAMS.fideleAnnees,
      estNouveau: moisEntre(premier, todayISO) < PARAMS.nouveauMois,
      estPonctuel: liste.length === 1 && cumul >= PARAMS.seuilGrandDonateur,
      origine,
    });
  }

  // Plus gros donateurs d'abord.
  return profils.sort((a, b) => b.cumul - a.cumul);
}

// ————— Badges de segment (affichage) —————

export type Badge = { key: string; label: string; tone: Tone };

const ETAT_BADGE: Record<EtatDonateur, Badge> = {
  actif: { key: "actif", label: "Actif", tone: "green" },
  sommeil: { key: "sommeil", label: "En sommeil", tone: "amber" },
  perdu: { key: "perdu", label: "Perdu", tone: "red" },
};

/** Badges d'un profil : état + qualifications (grand, fidèle, nouveau, ponctuel). */
export function badgesDe(p: ProfilDonateur): Badge[] {
  const b: Badge[] = [ETAT_BADGE[p.etat]];
  if (p.estGrand) b.push({ key: "grand", label: "Grand donateur", tone: "violet" });
  if (p.estFidele) b.push({ key: "fidele", label: "Fidèle", tone: "blue" });
  if (p.estNouveau) b.push({ key: "nouveau", label: "Nouveau", tone: "green" });
  if (p.estPonctuel) b.push({ key: "ponctuel", label: "Ponctuel élevé", tone: "gray" });
  return b;
}

// ————— Suggestions d'actions (prochaines actions à mener) —————

export type Suggestion = {
  cle: string;
  nom: string;
  action: string;
  motif: string;
  tone: Tone;
  score: number;
};

const actionSegment = (key: string) => SEGMENTS.find((s) => s.key === key)?.action ?? "";

/** Le mois courant est-il un pic de générosité (avr/juil/oct/déc + voisins) ? */
export function moisEstPic(todayISO: string): boolean {
  const m = Number(todayISO.slice(5, 7));
  return [4, 5, 7, 10, 12].includes(m);
}

/** Motif du pic courant (pour l'afficher), sinon null. */
export function picCourant(todayISO: string): string | null {
  const m = Number(todayISO.slice(5, 7));
  if (m === 4 || m === 5) return PICS_ANNEE[0].motif;
  if (m === 7) return PICS_ANNEE[1].motif;
  if (m === 10) return PICS_ANNEE[2].motif;
  if (m === 12) return PICS_ANNEE[3].motif;
  return null;
}

/**
 * Prochaines actions suggérées, triées par priorité. On privilégie les grands
 * donateurs et les situations à risque (endormis, à réactiver), pondérées par
 * le montant et la période (pics de dons).
 */
export function suggestionsDonateurs(profils: ProfilDonateur[], todayISO: string): Suggestion[] {
  const enPic = moisEstPic(todayISO);
  const out: Suggestion[] = [];

  for (const p of profils) {
    let action = "";
    let motif = "";
    let tone: Tone = "blue";
    let base = 0;

    if (p.estGrand && (p.etat === "sommeil" || p.etat === "perdu")) {
      action = "Relancer en priorité (grand donateur endormi)";
      motif = `${p.moisDepuisDernier} mois sans don · cumul ${Math.round(p.cumul)} €`;
      tone = "red";
      base = 100;
    } else if (p.estGrand && p.etat === "actif") {
      action = "Programmer le rendez-vous annuel";
      motif = actionSegment("grand");
      tone = "violet";
      base = 80;
    } else if (p.etat === "perdu") {
      action = "Dernière relance personnalisée";
      motif = actionSegment("perdu");
      tone = "red";
      base = 40;
    } else if (p.etat === "sommeil") {
      action = "Campagne de réactivation";
      motif = actionSegment("sommeil");
      tone = "amber";
      base = 55;
    } else if (p.estNouveau) {
      action = "Accueillir (remerciement sous 7 jours)";
      motif = actionSegment("nouveau");
      tone = "green";
      base = 60;
    } else if (p.estPonctuel) {
      action = "Proposer un don mensuel régulier";
      motif = actionSegment("ponctuel");
      tone = "blue";
      base = 50;
    } else if (p.estFidele) {
      action = "Proposer le club de dons mensuels";
      motif = actionSegment("fidele");
      tone = "blue";
      base = 45;
    } else {
      continue; // pas d'action prioritaire
    }

    // Pondération : montant (grands donateurs remontent) + pic de dons pour l'accueil/relance.
    const poidsMontant = Math.min(30, p.cumul / 200);
    const bonusPic = enPic && (p.estNouveau || p.etat !== "actif") ? 10 : 0;
    out.push({ cle: p.cle, nom: p.nom, action, motif, tone, score: base + poidsMontant + bonusPic });
  }

  return out.sort((a, b) => b.score - a.score);
}

// ————— Campagne « objectif » (trouver X € avant une échéance) —————
// Répond à : « quels donateurs solliciter pour réunir N € d'ici telle date ? »
// On classe par collecte espérée = montant à demander × probabilité de redon,
// puis on cumule jusqu'à atteindre l'objectif.

export type Temperature = "chaud" | "tiede" | "froid";

const TEMP_BADGE: Record<Temperature, Badge> = {
  chaud: { key: "chaud", label: "Chaud", tone: "green" },
  tiede: { key: "tiede", label: "Tiède", tone: "amber" },
  froid: { key: "froid", label: "Froid", tone: "blue" },
};

/** Température d'un donateur : chaleur de la relation selon la récence du dernier don. */
export function temperatureDe(p: ProfilDonateur): Temperature {
  if (p.cumulAnnee > 0 || p.moisDepuisDernier <= 6) return "chaud";
  if (p.moisDepuisDernier <= 18) return "tiede";
  return "froid";
}

export const badgeTemperature = (t: Temperature): Badge => TEMP_BADGE[t];

/** Arrondit un montant à un palier « propre » de sollicitation (50, 100, 500…). */
export function arrondiSollicitation(n: number): number {
  if (n <= 0) return 0;
  if (n < 100) return Math.round(n / 10) * 10;
  if (n < 500) return Math.round(n / 50) * 50;
  if (n < 2000) return Math.round(n / 100) * 100;
  return Math.round(n / 500) * 500;
}

/** Montant à demander : le don habituel du donateur, arrondi (plancher 50 €). */
export function montantDemande(p: ProfilDonateur): number {
  return Math.max(50, arrondiSollicitation(p.moyenne));
}

/**
 * Probabilité (grossière, indicative) qu'un donateur réponde à une sollicitation
 * maintenant. Fonction de son état et de sa fidélité. Bornée à 0,7.
 */
export function probaRedon(p: ProfilDonateur): number {
  const aDonneCetteAnnee = p.cumulAnnee > 0;
  let base: number;
  if (p.etat === "perdu") base = 0.12;
  else if (p.etat === "sommeil") base = 0.3;
  else base = aDonneCetteAnnee ? 0.15 : 0.45; // actif : marge plus grande s'il n'a pas encore donné
  if (p.estFidele) base += 0.1;
  return Math.min(0.7, base);
}

/** Explique, en clair, comment la probabilité de redon a été obtenue. */
export function expliquerProba(p: ProfilDonateur): string {
  const aDonneCetteAnnee = p.cumulAnnee > 0;
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  let base: number;
  let motif: string;
  if (p.etat === "perdu") {
    base = 0.12;
    motif = `perdu (${p.moisDepuisDernier} mois sans don)`;
  } else if (p.etat === "sommeil") {
    base = 0.3;
    motif = `en sommeil (${p.moisDepuisDernier} mois sans don)`;
  } else if (aDonneCetteAnnee) {
    base = 0.15;
    motif = "actif, a déjà donné cette année";
  } else {
    base = 0.45;
    motif = "actif, pas encore de don cette année";
  }
  const parts = [`base ${pct(base)} (${motif})`];
  if (p.estFidele) parts.push(`+10 % (fidèle, ${p.nbAnnees} ans)`);
  const brut = base + (p.estFidele ? 0.1 : 0);
  const plafonne = brut > 0.7;
  return `${parts.join(" ")} = ${pct(Math.min(0.7, brut))}${plafonne ? " (plafonné à 70 %)" : ""}`;
}

export type CibleCampagne = {
  cle: string;
  nom: string;
  temperature: Temperature;
  proba: number;
  demande: number; // montant à demander (€)
  capacite: number; // meilleure année observée (€) — plafond « prouvé »
  espere: number; // demande × proba
  probaDetail: string; // explication du calcul de la probabilité
  cumulEspereAvant: number; // espérance cumulée AVANT cette cible
  cumulEspere: number; // espérance cumulée EN INCLUANT cette cible
  dansObjectif: boolean; // nécessaire pour atteindre l'objectif
  moisDepuisDernier: number;
  cumulAnnee: number;
  dernier: string;
  estGrand: boolean;
  estFidele: boolean;
  // Profil synthétique (« qui est ce donateur »).
  cumul: number; // total historique donné
  nbDons: number;
  nbAnnees: number; // années civiles distinctes
  meilleureAnnee: number;
  origine: string | null; // relation (« qui a amené le don »)
};

export type PlanCampagne = {
  cibles: CibleCampagne[];
  totalEspere: number; // espérance de l'ensemble des cibles retenues
  nbPourObjectif: number; // nb de donateurs à solliciter pour couvrir l'objectif (0 = hors d'atteinte)
  objectif: number;
};

/**
 * Construit le plan de campagne : donateurs classés par collecte espérée,
 * cumulés jusqu'à l'objectif. `seuilMin` écarte les petits donateurs pour qui
 * une sollicitation nominative n'a pas de sens (défaut 200 € de don habituel).
 */
export function planCampagne(
  profils: ProfilDonateur[],
  objectif: number,
  options?: { seuilMin?: number; delaiMinMois?: number; demandes?: Record<string, number> },
): PlanCampagne {
  const seuil = options?.seuilMin ?? 200;
  const delaiMin = options?.delaiMinMois ?? 6;
  const manuels = options?.demandes ?? {};

  const cibles: CibleCampagne[] = profils
    // On sollicite ceux qui en valent la peine (seuil, selon le don habituel) ET
    // qui n'ont pas donné récemment : redemander à un donateur frais est contre-productif.
    .filter((p) => montantDemande(p) >= seuil && p.moisDepuisDernier >= delaiMin)
    .map((p) => {
      // Montant à demander : ajustement manuel s'il existe, sinon le don habituel.
      const demande = manuels[p.cle] ?? montantDemande(p);
      const proba = probaRedon(p);
      return {
        cle: p.cle,
        nom: p.nom,
        temperature: temperatureDe(p),
        proba,
        demande,
        capacite: p.meilleureAnnee,
        espere: Math.round(demande * proba),
        probaDetail: expliquerProba(p),
        cumulEspereAvant: 0,
        cumulEspere: 0,
        dansObjectif: false,
        moisDepuisDernier: p.moisDepuisDernier,
        cumulAnnee: p.cumulAnnee,
        dernier: p.dernier,
        estGrand: p.estGrand,
        estFidele: p.estFidele,
        cumul: p.cumul,
        nbDons: p.nbDons,
        nbAnnees: p.nbAnnees,
        meilleureAnnee: p.meilleureAnnee,
        origine: p.origine,
      };
    })
    .sort((a, b) => b.espere - a.espere);

  let cumul = 0;
  for (const c of cibles) {
    c.cumulEspereAvant = cumul;
    cumul += c.espere;
    c.cumulEspere = cumul;
    c.dansObjectif = c.cumulEspereAvant < objectif;
  }

  const idx = cibles.findIndex((c) => c.cumulEspere >= objectif);
  return {
    cibles,
    totalEspere: cumul,
    nbPourObjectif: idx >= 0 ? idx + 1 : 0,
    objectif,
  };
}

// ————— Relances complémentaires (donateurs récents, mais sous leur niveau) —————
// Resolliciter quelqu'un qui vient de donner n'est pertinent que s'il a donné
// EN-DESSOUS de son niveau habituel : on lui propose alors de compléter pour
// retrouver sa meilleure année, ce qui reste légitime. On les présente à part,
// triés par probabilité, à l'appréciation de l'utilisateur.

export type RelanceComplementaire = {
  cle: string;
  nom: string;
  cumulAnnee: number;
  meilleureAnnee: number;
  complement: number; // montant à demander pour retrouver le niveau habituel
  proba: number;
  argument: string;
  moisDepuisDernier: number;
  dernier: string;
  nbAnnees: number;
  estGrand: boolean;
  estFidele: boolean;
};

export function relancesComplementaires(
  profils: ProfilDonateur[],
  options?: { delaiMinMois?: number; seuilComplement?: number },
): RelanceComplementaire[] {
  const delaiMin = options?.delaiMinMois ?? 6;
  const seuilComplement = options?.seuilComplement ?? 200;
  const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

  const out: RelanceComplementaire[] = [];
  for (const p of profils) {
    if (p.moisDepuisDernier >= delaiMin) continue; // les « froids » sont dans la campagne principale
    const complement = arrondiSollicitation(p.meilleureAnnee - p.cumulAnnee);
    if (complement < seuilComplement) continue; // pas de marge réelle → on ne resollicite pas

    let proba = 0.3; // donateur « chaud » (vient de donner) → réceptif
    if (p.estFidele) proba += 0.15;
    if (p.estGrand) proba += 0.05;
    proba = Math.min(0.6, proba);

    const bouts = [
      `Déjà ${eur(p.cumulAnnee)} donnés cette année, mais donnait jusqu'à ${eur(p.meilleureAnnee)}/an`,
      `marge d'environ ${eur(complement)} pour retrouver son niveau habituel`,
    ];
    if (p.estFidele) bouts.push(`fidèle depuis ${p.nbAnnees} ans, donc réceptif à un complément fléché sur un projet précis`);
    const argument = bouts.join(" ; ") + ".";

    out.push({
      cle: p.cle,
      nom: p.nom,
      cumulAnnee: p.cumulAnnee,
      meilleureAnnee: p.meilleureAnnee,
      complement,
      proba,
      argument,
      moisDepuisDernier: p.moisDepuisDernier,
      dernier: p.dernier,
      nbAnnees: p.nbAnnees,
      estGrand: p.estGrand,
      estFidele: p.estFidele,
    });
  }
  return out.sort((a, b) => b.proba - a.proba || b.complement - a.complement);
}

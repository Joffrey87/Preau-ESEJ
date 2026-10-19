// Ventes diverses : sous-catégories (École / Événement), dus et paiements.

export type DomaineVente = "ecole" | "evenement";
export type ModeAttendu = "virement" | "cheque" | "liquide";
export type StatutVente = "a_payer" | "paye" | "trop_percu";

export type SousCategorie = {
  id: string;
  nom: string;
  domaine: DomaineVente;
  /** Mots-clés reconnus dans le libellé d'une recette à l'import (après le nom complet). */
  alias?: string[] | null;
  archive: boolean;
};

export type VenteDue = {
  id: string;
  exercice_id: string;
  sous_categorie_id: string;
  domaine: DomaineVente;
  famille_id: string | null;
  contact_id: string | null;
  libelle_payeur: string | null;
  montant_attendu: number;
  mode_attendu: ModeAttendu;
  notes: string | null;
  created_at: string;
};

export type VentePaiement = {
  id: string;
  vente_due_id: string;
  montant: number;
  type: "operation" | "caisse";
  operation_id: string | null;
  caisse_mouvement_id: string | null;
  created_at: string;
};

export type Payeur = { kind: "famille" | "contact"; id: string; libelle: string };

export const DOMAINES: { v: DomaineVente; label: string }[] = [
  { v: "ecole", label: "École" },
  { v: "evenement", label: "Événement" },
];

export const MODES: { v: ModeAttendu; label: string }[] = [
  { v: "virement", label: "Virement attendu" },
  { v: "cheque", label: "Chèque attendu" },
  { v: "liquide", label: "Liquide attendu / payé" },
];

export const STATUTS: { v: StatutVente; label: string; cls: string }[] = [
  { v: "a_payer", label: "À payer", cls: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" },
  { v: "paye", label: "Payé", cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" },
  { v: "trop_percu", label: "Trop-perçu", cls: "bg-sky-50 text-sky-800 dark:bg-sky-900/20 dark:text-sky-300" },
];

export function statutVente(attendu: number, paye: number): StatutVente {
  if (paye > attendu + 0.005) return "trop_percu";
  if (paye >= attendu - 0.005) return "paye";
  return "a_payer";
}

export function libellePayeur(d: VenteDue, familles: { id: string; nom: string }[], contacts: { id: string; libelle: string }[]): string {
  if (d.libelle_payeur?.trim()) return d.libelle_payeur.trim();
  if (d.famille_id) return familles.find((f) => f.id === d.famille_id)?.nom ?? "Famille";
  if (d.contact_id) return contacts.find((c) => c.id === d.contact_id)?.libelle ?? "Contact";
  return "—";
}

/** Catégories comptables « Ventes diverses » (mère). */
export function estCategorieVentes(nom: string | null | undefined): boolean {
  if (!nom) return false;
  const n = nom.toLowerCase();
  return n.includes("ventes diverses");
}

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Objet de vente reconnu dans le titre d'une opération bancaire : tous les mots (4 lettres et plus) du nom
 * de l'objet figurent dans le titre. En cas de plusieurs objets, le plus précis (nom le plus long) l'emporte.
 */
export function objetVenteDansTitre(titre: string, objets: SousCategorie[]): SousCategorie | null {
  const t = ` ${sansAccents(titre).replace(/[^a-z0-9]+/g, " ")} `;
  let meilleur: { o: SousCategorie; score: number } | null = null;
  for (const o of objets) {
    const mots = sansAccents(o.nom).replace(/[^a-z0-9]+/g, " ").split(" ").filter((m) => m.length >= 4);
    if (!mots.length || !mots.every((m) => t.includes(m))) continue;
    const score = mots.reduce((s, m) => s + m.length, 0);
    if (!meilleur || score > meilleur.score) meilleur = { o, score };
  }
  return meilleur?.o ?? null;
}

const MOTS_VIDES = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "a", "au", "aux", "pour"]);
/** Mots significatifs, sans accents ni pluriel simple (« Photos de classe » → photo, classe). */
function motsVente(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((m) => m && !MOTS_VIDES.has(m))
    .map((m) => (m.length > 3 && /[sx]$/.test(m) ? m.slice(0, -1) : m));
}

const contient = (mots: string[], cibles: string[]) => {
  if (!cibles.length) return false;
  let k = 0;
  for (const m of mots) if (k < cibles.length && m === cibles[k]) k++;
  return k === cibles.length;
};

/**
 * Objet de Ventes diverses cité dans le libellé d'une recette : tous les mots significatifs de son nom présents, dans
 * l'ordre (« VIR … PHOTOS CLASSE ARMAND » → « Photos de classe »). À défaut, l'un de ses mots-clés (alias,
 * « photo »). Le nom complet l'emporte sur un alias ; entre plusieurs, le plus long.
 */
export function objetVenteDansLibelle<T extends { nom: string; alias?: string[] | null }>(libelle: string, objets: T[]): T | null {
  const mots = motsVente(libelle);
  let meilleur: T | null = null;
  for (const o of objets) if (contient(mots, motsVente(o.nom)) && (!meilleur || o.nom.length > meilleur.nom.length)) meilleur = o;
  if (meilleur) return meilleur;
  let long = 0;
  for (const o of objets)
    for (const a of o.alias ?? [])
      if (contient(mots, motsVente(a)) && a.length > long) {
        meilleur = o;
        long = a.length;
      }
  return meilleur;
}

/** Famille dont le nom (sans parenthèses) figure dans le libellé ; le nom le plus long l'emporte, null si ambigu. */
export function familleDansLibelle<T extends { id: string; nom: string }>(libelle: string, familles: T[]): T | null {
  const norm = (t: string) => " " + t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
  const texte = norm(libelle);
  const trouves = familles
    .map((f) => ({ f, n: norm(f.nom.replace(/\([^)]*\)/g, "")) }))
    .filter((x) => x.n.trim().length >= 3 && texte.includes(x.n));
  if (trouves.length === 0) return null;
  const max = Math.max(...trouves.map((x) => x.n.length));
  const meilleurs = trouves.filter((x) => x.n.length === max);
  return new Set(meilleurs.map((x) => x.n)).size === 1 && meilleurs.length === 1 ? meilleurs[0].f : null;
}

// ─── Reconnaissance du payeur d'une vente dans le libellé bancaire ───────────
export type FamillePayeur = {
  id: string; nom: string;
  parent1_prenom: string | null; parent1_nom: string | null;
  parent2_prenom: string | null; parent2_nom: string | null;
};
export type ContactPayeur = {
  id: string; nom: string; prenom: string | null; raison_sociale: string | null;
  est_personne_morale: boolean; famille_id: string | null;
};
/** Choix proposé : « f:<id> » famille, « c:<id> » contact. */
export type SuggestionPayeur = { cle: string; libelle: string; score: number };
export type ReconnaissancePayeur = {
  /** Meilleure suggestion (présélectionnée), null si personne. */
  meilleur: SuggestionPayeur | null;
  /** Toutes les suggestions, la meilleure en tête (plusieurs = ambiguïté à lever). */
  choix: SuggestionPayeur[];
  /** Nom lu dans le libellé, pour proposer un nouveau contact si personne n'est reconnu. */
  propose: { nom: string; prenom: string };
};

const BRUIT_LIBELLE = new Set([
  "mme", "mlle", "m", "mr", "mrs", "monsieur", "madame", "ou", "et", "vir", "virement", "inst", "instantane",
  "sepa", "recu", "de", "du", "la", "le", "des", "ref", "refer", "reference", "prm", "emis", "cb", "chq", "cheque",
  "rem", "remise", "photo", "photos", "classe", "pour", "par", "famille", "fam",
]);

export function normaliserLibelle(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
const motsNom = (t: string | null | undefined) =>
  normaliserLibelle((t ?? "").replace(/\([^)]*\)/g, " ")).split(" ").filter((m) => m.length >= 2);
/** Le nom (suite de mots, particules comprises) figure-t-il dans le texte, mots entiers ? */
const contientNom = (texte: string, nom: string | null | undefined) => {
  const n = motsNom(nom).join(" ");
  return n.length >= 3 && (" " + texte + " ").includes(" " + n + " ");
};
const contientMot = (texte: string, mot: string | null | undefined) => {
  const m = normaliserLibelle(mot ?? "");
  return m.length >= 2 && (" " + texte + " ").includes(" " + m + " ");
};
const titre = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

/**
 * Familles d'abord (nom de famille, noms des parents ; prénoms des parents pour départager),
 * puis contacts du Carnet (hors parents déjà rattachés à une famille).
 */
export function reconnaitrePayeur(libelle: string, familles: FamillePayeur[], contacts: ContactPayeur[]): ReconnaissancePayeur {
  const texte = normaliserLibelle(libelle);
  const choix: SuggestionPayeur[] = [];
  for (const f of familles) {
    const noms = [f.nom, f.parent1_nom, f.parent2_nom].filter(Boolean) as string[];
    const nomTrouve = noms.filter((n) => contientNom(texte, n));
    if (nomTrouve.length === 0) continue;
    let score = Math.max(...nomTrouve.map((n) => motsNom(n).join(" ").length));
    for (const p of [f.parent1_prenom, f.parent2_prenom]) for (const m of motsNom(p)) if (contientMot(texte, m)) score += 20;
    choix.push({ cle: `f:${f.id}`, libelle: f.nom, score: score + 1000 });
  }
  if (choix.length === 0) {
    for (const c of contacts) {
      if (c.famille_id) continue;
      const nom = c.est_personne_morale ? c.raison_sociale ?? c.nom : c.nom;
      if (!contientNom(texte, nom)) continue;
      let score = motsNom(nom).join(" ").length;
      if (!c.est_personne_morale) for (const m of motsNom(c.prenom)) if (contientMot(texte, m)) score += 20;
      const lib = c.est_personne_morale ? nom : [c.prenom, c.nom].filter(Boolean).join(" ");
      choix.push({ cle: `c:${c.id}`, libelle: lib, score });
    }
  }
  choix.sort((a, b) => b.score - a.score);
  // Nom proposé : premiers mots utiles du libellé (hors bruit bancaire et références chiffrées).
  const utiles: string[] = [];
  for (const m of texte.split(" ")) {
    if (/\d/.test(m)) { if (utiles.length) break; continue; }
    if (BRUIT_LIBELLE.has(m) || m.length < 2) continue;
    utiles.push(m);
    if (utiles.length === 2) break;
  }
  return {
    meilleur: choix[0] ?? null,
    choix,
    propose: { nom: utiles[0] ? utiles[0].toUpperCase() : "", prenom: utiles[1] ? titre(utiles[1]) : "" },
  };
}

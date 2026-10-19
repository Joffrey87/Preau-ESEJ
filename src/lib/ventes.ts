// Ventes diverses : sous-catégories (École / Événement), dus et paiements.

export type DomaineVente = "ecole" | "evenement";
export type ModeAttendu = "virement" | "cheque" | "liquide";
export type StatutVente = "a_payer" | "paye" | "trop_percu";

export type SousCategorie = {
  id: string;
  nom: string;
  domaine: DomaineVente;
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

export function domaineDepuisCategorie(nom: string | null | undefined): DomaineVente | null {
  if (!nom) return null;
  if (/au profit de l['']école/i.test(nom)) return "ecole";
  if (/ventes diverses/i.test(nom)) return "evenement";
  return null;
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

/**
 * Objet de Ventes diverses cité dans le libellé d'une recette : tous ses mots significatifs présents, dans l'ordre
 * (« VIR … PHOTOS CLASSE ARMAND » → « Photos de classe »). Plusieurs objets : le nom le plus long l'emporte.
 */
export function objetVenteDansLibelle<T extends { nom: string }>(libelle: string, objets: T[]): T | null {
  const mots = motsVente(libelle);
  let meilleur: T | null = null;
  for (const o of objets) {
    const cibles = motsVente(o.nom);
    if (!cibles.length) continue;
    let k = 0;
    for (const m of mots) if (k < cibles.length && m === cibles[k]) k++;
    if (k === cibles.length && (!meilleur || o.nom.length > meilleur.nom.length)) meilleur = o;
  }
  return meilleur;
}

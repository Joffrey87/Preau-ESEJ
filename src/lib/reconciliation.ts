// Rapprochement des opérations « Don » de la comptabilité avec les dons enregistrés.
// Objectif : repérer les dons de la compta pas encore saisis dans l'onglet Dons,
// deviner le donateur d'après le libellé brut bancaire, et éviter les doublons.

import { cleDonateur, nomDonateur } from "@/lib/statutDon";
import type { Don } from "@/components/GestionDons";

export type OpDon = {
  id: string;
  date_operation: string;
  montant: number;
  libelle: string;
  libelle_origine: string | null;
  mode_paiement: string | null;
  exercice_id: string | null;
};

// Mots « techniques » d'un libellé bancaire à retirer pour isoler un nom.
const BRUIT =
  /\b(vir|inst|virement|de|du|prlv|prelevement|prélèvement|cb|chq|cheque|chèque|paiement|par|carte|ref|mandat|sepa|recu|reçu|don|dons|mr|mme|m|association|asso)\b/gi;

/** Extrait un nom candidat depuis le libellé brut bancaire ("" si rien d'exploitable). */
export function extraireNom(libelleOrigine: string | null): string {
  if (!libelleOrigine) return "";
  const s = libelleOrigine
    .replace(/\d+/g, " ") // références / numéros
    .replace(/[^\p{L}\s'-]/gu, " ") // garde lettres, espaces, apostrophes, tirets
    .replace(BRUIT, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Dédoublonne les répétitions fréquentes (« JOFFREY LENOBLE … JOFFREY LENOBLE »).
  const vus = new Set<string>();
  const out: string[] = [];
  for (const mot of s.split(" ")) {
    if (mot.length < 2) continue;
    const k = mot.toLowerCase();
    if (!vus.has(k)) {
      vus.add(k);
      out.push(mot);
    }
  }
  // Mise en forme « Titre » (Joffrey Lenoble) plutôt que tout en capitales.
  return out
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())
    .join(" ");
}

/** Normalise une chaîne pour comparaison (minuscule, sans accents/ponctuation). */
export function normaliser(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jours (absolus) entre deux dates ISO AAAA-MM-JJ. */
export function joursEcart(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.abs(Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000));
}

/** Dons existants dont le montant colle et la date est à ±`jours` de l'opération. */
export function donsProbables(op: OpDon, dons: Don[], jours = 3): Don[] {
  return dons.filter(
    (d) =>
      Number(d.montant) === Number(op.montant) &&
      d.date_don &&
      joursEcart(d.date_don, op.date_operation) <= jours,
  );
}

export type IdentiteDonateur = { cle: string; nom: string; exemple: Don };

/** Identités distinctes des donateurs existants (pour rapprocher un nom extrait). */
export function identitesDonateurs(dons: Don[]): IdentiteDonateur[] {
  const map = new Map<string, IdentiteDonateur>();
  for (const d of dons) {
    const cle = cleDonateur(d);
    if (!cle || map.has(cle)) continue;
    map.set(cle, { cle, nom: nomDonateur(d) || "—", exemple: d });
  }
  return [...map.values()];
}

/** Identités existantes qui ressemblent au nom extrait, triées par recoupement de mots. */
export function donateursRessemblants(nomExtrait: string, identites: IdentiteDonateur[]): IdentiteDonateur[] {
  const tokens = new Set(normaliser(nomExtrait).split(" ").filter((t) => t.length > 1));
  if (tokens.size === 0) return [];
  const notes = identites
    .map((id) => {
      const its = normaliser(id.nom).split(" ").filter((t) => t.length > 1);
      const score = its.filter((t) => tokens.has(t)).length;
      return { id, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return notes.map((x) => x.id);
}

const PARTICULES_NOM = new Set(["de", "du", "des", "d", "le", "la", "l", "van", "von", "et"]);
const MOTS_GENERIQUES = new Set(["association", "asso", "sas", "sarl", "sa", "sci", "eurl", "societe", "ste", "cie", "entreprise"]);

/** Mots significatifs d'un nom (sans particules, sans initiales). */
function motsNom(s: string | null | undefined): string[] {
  return normaliser(s ?? "")
    .split(" ")
    .filter((m) => m.length > 1 && !PARTICULES_NOM.has(m) && !MOTS_GENERIQUES.has(m));
}

export type DonateurReconnu = {
  /** Donateurs retenus (clés), le meilleur d'abord. */
  candidats: IdentiteDonateur[];
  /** Un seul donateur, nom ET prénom (ou raison sociale) lus dans le libellé. */
  certain: boolean;
};

/**
 * Reconnaît un donateur connu dans les libellés d'une opération (brut bancaire
 * et libellé saisi dans Préau). Nom + prénom présents : certain ; nom seul :
 * doute (alerte ambre). Plusieurs donateurs au même niveau : à valider.
 */
export function reconnaitreDonateur(textes: (string | null)[], identites: IdentiteDonateur[]): DonateurReconnu | null {
  const presents = new Set(textes.flatMap((t) => normaliser(t ?? "").split(" ")));
  let meilleurs: IdentiteDonateur[] = [];
  let niveau = 0;
  for (const id of identites) {
    const d = id.exemple;
    let n = 0;
    if (d.est_personne_morale) {
      const r = motsNom(d.raison_sociale);
      if (r.length > 0 && r.every((m) => m.length >= 3 && presents.has(m))) n = 2;
    } else {
      const nom = motsNom(d.donateur_nom);
      const prenom = motsNom(d.donateur_prenom);
      if (nom.length > 0 && nom.every((m) => presents.has(m))) {
        n = prenom.length > 0 && prenom.every((m) => presents.has(m)) ? 2 : 1;
      }
    }
    if (n === 0) continue;
    if (n > niveau) {
      niveau = n;
      meilleurs = [id];
    } else if (n === niveau) {
      meilleurs.push(id);
    }
  }
  if (meilleurs.length === 0) return null;
  return { candidats: meilleurs, certain: niveau === 2 && meilleurs.length === 1 };
}

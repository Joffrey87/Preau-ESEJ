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

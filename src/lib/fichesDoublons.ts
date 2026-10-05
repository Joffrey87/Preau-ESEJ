// Fiches donateur « quasi identiques » : Préau n'a pas de table de donateurs, chaque don
// porte sa propre copie de la fiche. Quand un même donateur a été saisi plusieurs fois,
// ses copies divergent (adresse présente sur l'une, absente sur l'autre, accent ou ordre
// du nom différent…) et les reçus, les liens à la compta ou les fiches se retrouvent
// dispersés. Ce module repère ces groupes et calcule la fiche « fusionnée » à réécrire
// sur tous leurs dons. Rien n'est écrit ici : l'application se fait à la demande.

import { normaliser } from "@/lib/reconciliation";
import { nomDonateur } from "@/lib/statutDon";
import { VERROU } from "@/lib/donsChiffre";
import type { Don } from "@/components/GestionDons";

export const PARTICULES = new Set(["de", "du", "des", "la", "le", "les", "van", "von", "et", "mme", "mr", "m", "monsieur", "madame"]);

/** Clé tolérante : sans accents, ponctuation, particules ni ordre (« Picard Alizée » = « Alizee PICARD »). */
export function cleFloue(d: Don): string {
  if (d.est_personne_morale) {
    const mots = normaliser(d.raison_sociale ?? d.donateur_nom ?? "").split(" ").filter((m) => m.length > 1);
    return mots.length ? [...new Set(mots)].sort().join(" ") : "";
  }
  const mots = normaliser(`${d.donateur_nom ?? ""} ${d.donateur_prenom ?? ""}`)
    .split(" ")
    .filter((m) => m.length > 1 && !PARTICULES.has(m));
  return mots.length ? [...new Set(mots)].sort().join(" ") : "";
}

const CHAMPS = [
  ["donateur_titre", "civilité"],
  ["donateur_nom", "nom"],
  ["donateur_prenom", "prénom"],
  ["raison_sociale", "organisme"],
  ["adresse", "adresse"],
  ["cp_ville", "code postal et ville"],
  ["courriel", "courriel"],
  ["categorie_donateur", "catégorie"],
  ["envoi_prefere", "mode d'envoi des reçus"],
  ["a_transmettre", "à transmettre à"],
] as const;
export type ChampFiche = (typeof CHAMPS)[number][0];

const vide = (v: unknown) => v == null || String(v).trim() === "";
const texte = (v: unknown) => (vide(v) ? "" : String(v).trim());

export type Modification = {
  champ: ChampFiche;
  libelle: string;
  /** Valeur retenue. */
  vers: string;
  /** Nombre de dons dont ce champ change. */
  nbDons: number;
  /** Valeurs actuelles différentes (vides exclues). */
  avant: string[];
  /** Le champ était vide sur ces dons : on le complète. */
  completion: boolean;
};

export type GroupeAHarmoniser = {
  cle: string;
  nom: string;
  dons: Don[];
  /** Fiche retenue, appliquée à tous les dons. */
  cible: Record<ChampFiche, string> & { est_personne_morale: boolean };
  modifications: Modification[];
  /** Champs qui portent deux valeurs renseignées et différentes (adresse, courriel…) : à vérifier. */
  conflits: string[];
  aChanger: Don[];
  /** Foyers : les indices qui font conclure à un même foyer (écritures, fiches). */
  preuves: string[];
};

/** Groupes de dons dont les copies de la fiche donateur ne sont pas identiques. */
export function groupesAHarmoniser(dons: Don[]): GroupeAHarmoniser[] {
  const parCle = new Map<string, Don[]>();
  for (const d of dons) {
    if (d.supprime_le || d.donateur_nom === VERROU || d.raison_sociale === VERROU) continue;
    const cle = cleFloue(d);
    if (!cle) continue;
    (parCle.get(cle) ?? parCle.set(cle, []).get(cle)!).push(d);
  }

  const res: GroupeAHarmoniser[] = [];
  for (const [cle, liste] of parCle) {
    if (liste.length < 2) continue;
    const g = construireGroupe(cle, liste);
    if (g) res.push(g);
  }
  return res.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/**
 * Fiche fusionnée d'un ensemble de dons et modifications à écrire. `surcharge` impose certains champs
 * (ex. un couple : titre, prénoms et courriels réunis). Null si rien ne change.
 */
export function construireGroupe(
  cle: string,
  liste: Don[],
  surcharge: Partial<Record<ChampFiche, string>> = {},
  preuves: string[] = [],
): GroupeAHarmoniser | null {
  // Le don le plus récent fait foi ; ses champs vides sont complétés par les autres copies.
  // Si une copie est celle d'un organisme (« Oeuvre Salésienne »), les copies saisies comme un particulier
  // s'alignent sur elle : la copie organisme fait foi, puis le don le plus récent.
  const tries = [...liste].sort(
    (a, b) => Number(b.est_personne_morale) - Number(a.est_personne_morale) || b.date_don.localeCompare(a.date_don),
  );
  const base = tries[0];
  const cible = { est_personne_morale: base.est_personne_morale } as GroupeAHarmoniser["cible"];
  for (const [champ] of CHAMPS) {
    const source = tries.find((d) => !vide(d[champ]));
    cible[champ] = source ? texte(source[champ]) : "";
  }
  Object.assign(cible, surcharge);
  // Un particulier n'a pas de raison sociale, une personne morale en garde une.
  if (!cible.est_personne_morale) cible.raison_sociale = "";

  const modifications: Modification[] = [];
  const aChanger = new Set<Don>();
  for (const [champ, libelle] of CHAMPS) {
    const touches = liste.filter((d) => texte(d[champ]) !== cible[champ]);
    if (touches.length === 0) continue;
    touches.forEach((d) => aChanger.add(d));
    const avant = [...new Set(touches.map((d) => texte(d[champ])).filter(Boolean))];
    modifications.push({ champ, libelle, vers: cible[champ], nbDons: touches.length, avant, completion: avant.length === 0 });
  }
  for (const d of liste) if (d.est_personne_morale !== cible.est_personne_morale) aChanger.add(d);
  if (aChanger.size === 0) return null;

  const conflits = (["adresse", "cp_ville", "courriel"] as const)
    .filter((c) => new Set(liste.map((d) => normaliser(texte(d[c]))).filter(Boolean)).size > 1)
    .map((c) => CHAMPS.find(([k]) => k === c)![1]);

  return { cle, nom: nomDonateur(base) || "—", dons: tries, cible, modifications, conflits, aChanger: [...aChanger], preuves };
}

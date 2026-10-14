// Réinscription et préinscription (première version, 23/10/2026).
import { classeEn, prenomEleve, type Eleve } from "./eleves";

export type DonneesInscription = {
  enfant_prenom: string;
  enfant_nom: string;
  date_naissance: string;
  lieu_naissance: string;
  classe_demandee: string;
  ecole_actuelle: string;
  parent1_prenom: string;
  parent1_nom: string;
  parent1_telephone: string;
  parent1_courriel: string;
  parent2_prenom: string;
  parent2_nom: string;
  parent2_telephone: string;
  parent2_courriel: string;
  adresse: string;
  cp_ville: string;
  remarques: string;
};

export const DONNEES_VIDES: DonneesInscription = {
  enfant_prenom: "",
  enfant_nom: "",
  date_naissance: "",
  lieu_naissance: "",
  classe_demandee: "",
  ecole_actuelle: "",
  parent1_prenom: "",
  parent1_nom: "",
  parent1_telephone: "",
  parent1_courriel: "",
  parent2_prenom: "",
  parent2_nom: "",
  parent2_telephone: "",
  parent2_courriel: "",
  adresse: "",
  cp_ville: "",
  remarques: "",
};

export type StatutDossier = "recu" | "valide" | "attente" | "refuse";
export const STATUTS_DOSSIER: { v: StatutDossier; label: string; classe: string }[] = [
  { v: "recu", label: "Reçu", classe: "bg-accent-soft text-accent" },
  { v: "attente", label: "En attente", classe: "bg-gold-soft text-gold" },
  { v: "valide", label: "Validé", classe: "bg-positive/15 text-positive" },
  { v: "refuse", label: "Refusé", classe: "bg-negative/10 text-negative" },
];

export type Dossier = {
  id: string;
  type: "preinscription" | "reinscription";
  annee_scolaire: string;
  famille_id: string | null;
  eleve_id: string | null;
  statut: StatutDossier;
  donnees: Partial<DonneesInscription> & Record<string, string | undefined>;
  photo_path: string | null;
  note_directrice: string | null;
  traite_le: string | null;
  created_at: string;
};

/** Année scolaire visée par les inscriptions : l'année suivante (dès septembre, on prépare la rentrée d'après). */
export function anneeInscriptions(aujourdhui = new Date()): string {
  const a = aujourdhui.getFullYear();
  const debut = aujourdhui.getMonth() >= 8 ? a + 1 : a;
  return `${debut}-${debut + 1}`;
}

export const CLASSES_DEMANDEES = ["PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2"];

type FamillePrerempli = {
  nom: string;
  adresse: string | null;
  cp_ville: string | null;
} & Record<`parent${1 | 2}_${"prenom" | "nom" | "telephone" | "courriel"}`, string | null>;

/** Enfants à réinscrire et leur dossier pré-rempli (Espace famille, et aperçu de la Directrice pour une famille choisie). */
export function enfantsAReinscrire(f: FamillePrerempli, eleves: Eleve[], annee: string, statutDe: Map<string | null, StatutDossier> = new Map()) {
  return eleves
    .filter((e) => !e.sorti_le && e.id && classeEn(e, annee) !== null)
    .map((e) => ({
      id: e.id,
      prenom: prenomEleve(e),
      classeSuivante: classeEn(e, annee),
      statut: statutDe.get(e.id) ?? null,
      donnees: {
        ...DONNEES_VIDES,
        enfant_prenom: prenomEleve(e),
        enfant_nom: f.nom,
        classe_demandee: classeEn(e, annee) ?? "",
        ecole_actuelle: "École du Saint-Enfant-Jésus",
        parent1_prenom: f.parent1_prenom ?? "",
        parent1_nom: f.parent1_nom ?? "",
        parent1_telephone: f.parent1_telephone ?? "",
        parent1_courriel: f.parent1_courriel ?? "",
        parent2_prenom: f.parent2_prenom ?? "",
        parent2_nom: f.parent2_nom ?? "",
        parent2_telephone: f.parent2_telephone ?? "",
        parent2_courriel: f.parent2_courriel ?? "",
        adresse: f.adresse ?? "",
        cp_ville: f.cp_ville ?? "",
      },
    }));
}

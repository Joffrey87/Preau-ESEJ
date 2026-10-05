// Fiches d'entreprises, d'associations… saisies « comme des particuliers » : la catégorie
// dit « Entreprise » (ou Association…) mais le don est enregistré comme particulier, avec le
// nom de l'organisme dans le champ « titre » ou « nom ». Le reçu ne porte alors ni la raison
// sociale ni la bonne mention légale (article 238 bis du CGI au lieu de l'article 200).
// Ce module propose, fiche par fiche, la correction : organisme + contact.

import { estCategoriePersonneMorale } from "@/lib/categoriesDonateur";
import { normaliser } from "@/lib/reconciliation";
import { VERROU } from "@/lib/donsChiffre";
import type { Don } from "@/components/GestionDons";

const CIVILITES = /^(m|mr|monsieur|mme|madame|mlle|mademoiselle|dr|docteur|me|maitre|pere|abbe|soeur|chanoine|sr)$/;
const MOTS_ORGANISME =
  /\b(societe|ste|sarl|sas|sasu|eurl|sci|scp|selarl|ets|etablissements?|association|fondation|fonds|groupe|cabinet|entreprise|compagnie|cie|communaute|paroisse|diocese|congregation|mairie|commune|institut|ecole|assurances?|banque|garage|boulangerie|pressoirs?)\b/;

/** Ce « titre » est-il en réalité le nom d'un organisme (et non « Monsieur », « Dr »…) ? */
export function titreEstUnOrganisme(titre: string | null | undefined): boolean {
  const t = normaliser(titre ?? "");
  if (!t) return false;
  if (CIVILITES.test(t)) return false;
  return t.length > 15 || t.split(" ").length > 2 || MOTS_ORGANISME.test(t);
}

export type Correction = {
  cle: string;
  dons: Don[];
  /** Catégorie actuelle de la fiche (« Particulier », vide, ou une catégorie d'organisme). */
  categorieActuelle: string;
  /** Catégorie d'organisme proposée (modifiable). */
  categorie: string;
  /** Organisme proposé (peut être vide : à saisir). */
  organisme: string;
  contact: { titre: string; prenom: string; nom: string };
  /** D'où vient l'organisme proposé. */
  origine: "titre" | "nom" | "fiche" | "a_saisir";
  /** Ce qui ne va pas dans la fiche. */
  motif: "categorie_organisme_saisie_particulier" | "organisme_categorie_particulier" | "nom_d_organisme_en_particulier";
};

const t = (v: string | null | undefined) => (v ?? "").trim();

/** Mots qui trahissent un organisme dans un nom saisi comme celui d'un particulier. */
const MOTS_NOM_ORGANISME =
  /\b(oeuvres?|salesien(?:ne)?s?|fraternite|abbaye|monastere|couvent|prieure|seminaire|congregation|communaute|paroisse|diocese|fondation|association|societe|ste|sarl|sas|eurl|sci|ets|etablissements?|groupe|cabinet|institut|ecole|mairie|commune|fonds)\b/;

const ressembleAUnOrganisme = (d: Don) => MOTS_NOM_ORGANISME.test(normaliser(`${d.donateur_titre ?? ""} ${d.donateur_nom ?? ""} ${d.donateur_prenom ?? ""}`));

/**
 * Fiches d'organismes mal saisies, regroupées par fiche :
 *  - catégorie d'organisme (Entreprise, Association…) mais don enregistré comme particulier ;
 *  - enregistré comme personne morale mais catégorie « Particulier » (ou vide) ;
 *  - catégorie « Particulier » (ou vide) avec un nom qui est celui d'un organisme (« Oeuvre Salésienne »).
 */
export function correctionsEntreprises(dons: Don[]): Correction[] {
  const groupes = new Map<string, { motif: Correction["motif"]; liste: Don[] }>();
  for (const d of dons) {
    if (d.supprime_le || d.donateur_nom === VERROU || d.raison_sociale === VERROU) continue;
    const categoriePm = estCategoriePersonneMorale(d.categorie_donateur);
    const motif: Correction["motif"] | null = categoriePm && !d.est_personne_morale
      ? "categorie_organisme_saisie_particulier"
      : d.est_personne_morale && !categoriePm
        ? "organisme_categorie_particulier"
        : !categoriePm && !d.est_personne_morale && ressembleAUnOrganisme(d)
          ? "nom_d_organisme_en_particulier"
          : null;
    if (!motif) continue;
    const cle = [motif, d.categorie_donateur, d.donateur_titre, d.donateur_nom, d.donateur_prenom, d.raison_sociale, d.adresse, d.cp_ville].map((x) => normaliser(x ?? "")).join("|");
    const g = groupes.get(cle) ?? { motif, liste: [] };
    g.liste.push(d);
    groupes.set(cle, g);
  }
  return [...groupes].map(([cle, { motif, liste }]) => {
    const d = [...liste].sort((a, b) => b.date_don.localeCompare(a.date_don))[0];
    let organisme = "";
    let origine: Correction["origine"] = "a_saisir";
    let contact = { titre: t(d.donateur_titre), prenom: t(d.donateur_prenom), nom: t(d.donateur_nom) };
    if (d.est_personne_morale && t(d.raison_sociale)) {
      organisme = t(d.raison_sociale);
      origine = "fiche";
    } else if (titreEstUnOrganisme(d.donateur_titre)) {
      organisme = t(d.donateur_titre);
      origine = "titre";
      contact = { titre: "", prenom: t(d.donateur_prenom), nom: t(d.donateur_nom) };
    } else if (t(d.donateur_nom) && !t(d.donateur_prenom)) {
      organisme = t(d.donateur_nom);
      origine = "nom";
      contact = { titre: "", prenom: "", nom: "" };
    }
    const actuelle = t(d.categorie_donateur);
    return {
      cle,
      dons: liste,
      categorieActuelle: actuelle,
      categorie: estCategoriePersonneMorale(actuelle) ? actuelle : "Association",
      organisme,
      contact,
      origine,
      motif,
    };
  });
}

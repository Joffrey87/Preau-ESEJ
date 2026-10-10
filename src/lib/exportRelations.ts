// Export de « Relations donateurs » pour un publipostage : sélection des donateurs (états, profils), exclusions
// d'office, une ligne par foyer (un couple « Monsieur & Madame » = une ligne), puis fichier Excel.
//
// Les noms et adresses sont chiffrés : tout se fait côté navigateur, coffre ouvert.

import type { Don } from "@/components/GestionDons";
import type { EtatDonateur, ProfilDonateur } from "@/lib/donateurs";
import { courrielsDuCouple, estCouple, nomComplet } from "@/lib/couple";
import { estAmitieSainteAnne } from "@/lib/importEnrichi";
import { formatDate, formatEuros } from "@/lib/format";

export type CriteresExport = {
  etats: EtatDonateur[];
  grands: boolean;
  fideles: boolean;
  /** Option : inclure les « Donateurs Bourse » (exclus par défaut). */
  inclureBourse: boolean;
};

export const aucunCritere = (c: CriteresExport) => c.etats.length === 0 && !c.grands && !c.fideles;

export type Exclusions = { nePasSolliciter: number; famille: number; asa: number; bourse: number };

/** Donateurs retenus (critères en OU, comme les filtres de l'écran) et nombre d'exclus par motif. */
export function selectionnerExport(
  profils: ProfilDonateur[],
  donsParCle: Map<string, Don[]>,
  c: CriteresExport,
): { retenus: ProfilDonateur[]; exclus: Exclusions } {
  const exclus: Exclusions = { nePasSolliciter: 0, famille: 0, asa: 0, bourse: 0 };
  if (aucunCritere(c)) return { retenus: [], exclus };
  const retenus: ProfilDonateur[] = [];
  for (const p of profils) {
    const conforme = c.etats.includes(p.etat) || (c.grands && p.estGrand) || (c.fideles && p.estFidele);
    if (!conforme) continue;
    if (p.nePasSolliciter) exclus.nePasSolliciter++;
    else if (p.famille !== null) exclus.famille++;
    else if (estAmitieSainteAnne([p.nom, ...(donsParCle.get(p.cle) ?? []).map((d) => d.raison_sociale ?? "")].join(" "))) exclus.asa++;
    else if (p.boursier && !c.inclureBourse) exclus.bourse++;
    else retenus.push(p);
  }
  return { retenus, exclus };
}

const ETAT_LIBELLE: Record<EtatDonateur, string> = { actif: "Actif", sommeil: "En sommeil", perdu: "Perdu" };

export const COLONNES_EXPORT = [
  "Destinataire",
  "Civilité",
  "Prénom",
  "Nom",
  "Raison sociale",
  "Contact (organisme)",
  "Foyer",
  "Adresse",
  "Code postal",
  "Ville",
  "Courriel 1",
  "Courriel 2",
  "Dernier don (date)",
  "Dernier don (montant)",
  "État",
  "Mois sans don",
  "Nombre de dons",
  "Total donné",
  "Donateur Bourse",
] as const;

export type LigneExport = Record<(typeof COLONNES_EXPORT)[number], string>;

/** Dernière valeur renseignée d'un champ, du don le plus récent au plus ancien. */
const dernierRenseigne = (dons: Don[], champ: (d: Don) => string | null | undefined): string =>
  dons.map((d) => champ(d)?.trim()).find((v): v is string => !!v) ?? "";

/** Ligne du fichier pour un foyer ou un donateur : coordonnées les plus récentes, dernier don. */
export function ligneExport(p: ProfilDonateur, dons: Don[]): { ligne: LigneExport; adressePostale: boolean; courriel: boolean } {
  const recents = [...dons].sort((a, b) => (b.date_don ?? "").localeCompare(a.date_don ?? ""));
  const dernier = recents.find((d) => !d.don_boursier) ?? recents[0];
  const modele = recents[0];
  const couple = !p.estMorale && estCouple(modele?.donateur_titre);
  const adresse = dernierRenseigne(recents, (d) => d.adresse);
  const cpVille = dernierRenseigne(recents, (d) => d.cp_ville);
  const m = cpVille.match(/^(\d{5})\s*(.*)$/);
  const mails = courrielsDuCouple(dernierRenseigne(recents, (d) => d.courriel));
  const titre = couple ? "Monsieur et Madame" : (modele?.donateur_titre ?? "").trim();

  const ligne: LigneExport = {
    Destinataire: p.estMorale ? (modele?.raison_sociale ?? p.nom) : nomComplet(modele),
    Civilité: p.estMorale ? "" : titre,
    Prénom: p.estMorale ? "" : (modele?.donateur_prenom ?? "").trim(),
    Nom: p.estMorale ? "" : (modele?.donateur_nom ?? "").trim(),
    "Raison sociale": p.estMorale ? (modele?.raison_sociale ?? "") : "",
    "Contact (organisme)": p.estMorale ? [modele?.donateur_prenom, modele?.donateur_nom].filter(Boolean).join(" ") : "",
    Foyer: couple ? "Couple" : "",
    Adresse: adresse,
    "Code postal": m ? m[1] : "",
    Ville: m ? m[2] : cpVille,
    "Courriel 1": mails.monsieur,
    "Courriel 2": mails.madame,
    "Dernier don (date)": dernier?.date_don ? formatDate(dernier.date_don) : "",
    "Dernier don (montant)": dernier ? formatEuros(Number(dernier.montant)) : "",
    État: ETAT_LIBELLE[p.etat],
    "Mois sans don": String(p.moisDepuisDernier),
    "Nombre de dons": String(p.nbDons),
    "Total donné": formatEuros(p.cumul),
    "Donateur Bourse": p.boursier ? "Oui" : "",
  };
  return { ligne, adressePostale: !!(adresse || cpVille), courriel: !!(mails.monsieur || mails.madame) };
}

export type FichierExport = {
  publipostage: LigneExport[];
  /** Ni adresse postale ni courriel : injoignables, listés à part. */
  sansCoordonnees: LigneExport[];
  /** Dans « publipostage » mais sans adresse postale (courriel seulement). */
  courrielSeulement: number;
};

export function construireExport(retenus: ProfilDonateur[], donsParCle: Map<string, Don[]>): FichierExport {
  const publipostage: LigneExport[] = [];
  const sansCoordonnees: LigneExport[] = [];
  let courrielSeulement = 0;
  for (const p of retenus) {
    const { ligne, adressePostale, courriel } = ligneExport(p, donsParCle.get(p.cle) ?? []);
    if (!adressePostale && !courriel) sansCoordonnees.push(ligne);
    else {
      if (!adressePostale) courrielSeulement++;
      publipostage.push(ligne);
    }
  }
  const parNom = (a: LigneExport, b: LigneExport) => a.Destinataire.localeCompare(b.Destinataire, "fr");
  return { publipostage: publipostage.sort(parNom), sansCoordonnees: sansCoordonnees.sort(parNom), courrielSeulement };
}

/** Écrit le classeur Excel (onglets « Publipostage » et, s'il y en a, « Sans coordonnées ») et le télécharge. */
export async function telechargerExport(f: FichierExport, aujourdhui: string): Promise<string> {
  const XLSX = await import("xlsx");
  const classeur = XLSX.utils.book_new();
  const feuille = (lignes: LigneExport[]) => {
    const ws = XLSX.utils.json_to_sheet(lignes, { header: [...COLONNES_EXPORT] });
    ws["!cols"] = COLONNES_EXPORT.map((c) => ({ wch: Math.min(40, Math.max(c.length + 2, ...lignes.map((l) => l[c].length + 1))) }));
    return ws;
  };
  XLSX.utils.book_append_sheet(classeur, feuille(f.publipostage), "Publipostage");
  if (f.sansCoordonnees.length > 0) XLSX.utils.book_append_sheet(classeur, feuille(f.sansCoordonnees), "Sans coordonnées");
  const octets = XLSX.write(classeur, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const nom = `Relations donateurs - export - ${aujourdhui}.xlsx`;
  const url = URL.createObjectURL(new Blob([octets], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return nom;
}

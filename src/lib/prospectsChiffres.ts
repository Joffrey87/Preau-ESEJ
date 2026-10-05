// Prospects : coordonnées personnelles chiffrées par le coffre (comme les fiches donateur).
// Quand `pii_chiffre` est présent, la colonne `nom` ne porte qu'un libellé neutre.

import { useEffect, useState } from "react";
import { useCoffre } from "@/components/CoffreProvider";
import type { Prospect } from "@/lib/pipeline";
import { normaliser } from "@/lib/reconciliation";

export const NOM_NEUTRE = "Fiche chiffrée";

/** Seuls les prospects de cette liste ont leurs coordonnées chiffrées ; les autres restent en clair. */
export const LISTE_CHIFFREE = "liste axel";
export const estListeChiffree = (liste: string | null | undefined): boolean => (liste ?? "").trim().toLowerCase() === LISTE_CHIFFREE;

export type PiiProspect = {
  titre: string | null;
  nom: string | null;
  prenom: string | null;
  adresse: string | null;
  cp_ville: string | null;
};

/** Prospect prêt à afficher : champs personnels lus (ou 🔒 coffre fermé). */
export type ProspectLisible = Prospect & {
  titre: string | null;
  prenom: string | null;
  adresse: string | null;
  cp_ville: string | null;
  /** « Prénom Nom » (ou le nom en clair d'un organisme). */
  affiche: string;
  chiffre: boolean;
  verrouille: boolean;
};

/** Civilités des prospects en abrégé : « Monsieur & Madame » → « M. & Mme », « Monsieur » → « M. », « Madame » → « Mme ». */
export function abregerCivilite(titre: string | null | undefined): string {
  const t = normaliser(titre ?? "");
  if (/^(monsieur|mr|m) (et )?(madame|mme)$/.test(t)) return "M. & Mme";
  if (t === "monsieur" || t === "m" || t === "mr") return "M.";
  if (t === "madame" || t === "mme") return "Mme";
  return (titre ?? "").trim();
}

/** Titre, prénom et nom réunis : « Monsieur & Madame Maxime Andrivaux ». */
export const nomComplet = (p: Pick<PiiProspect, "titre" | "prenom" | "nom">): string =>
  [abregerCivilite(p.titre), p.prenom, p.nom].filter(Boolean).join(" ");

/** Hydrate les prospects : coffre ouvert → coordonnées lues ; fermé → « 🔒 » ; en clair → inchangés. */
export function useProspectsDechiffres(prospects: Prospect[]) {
  const { estOuvert, estConfigure, dechiffrer } = useCoffre();
  const [resultat, setResultat] = useState<ProspectLisible[]>(() => prospects.map(enClair));

  useEffect(() => {
    let annule = false;
    (async () => {
      const out = await Promise.all(
        prospects.map(async (p): Promise<ProspectLisible> => {
          if (!p.pii_chiffre) return enClair(p);
          if (!estOuvert) return { ...enClair(p), affiche: "🔒 verrouillé", chiffre: true, verrouille: true };
          try {
            const pii = JSON.parse(await dechiffrer(p.pii_chiffre)) as PiiProspect;
            return {
              ...p,
              nom: pii.nom ?? p.nom,
              titre: pii.titre,
              prenom: pii.prenom,
              adresse: pii.adresse,
              cp_ville: pii.cp_ville,
              affiche: nomComplet({ titre: null, prenom: pii.prenom, nom: pii.nom }) || p.nom,
              chiffre: true,
              verrouille: false,
            };
          } catch {
            return { ...enClair(p), affiche: "🔒 illisible", chiffre: true, verrouille: true };
          }
        }),
      );
      if (!annule) setResultat(out);
    })();
    return () => {
      annule = true;
    };
  }, [prospects, estOuvert, dechiffrer]);

  const verrou = estConfigure && !estOuvert && prospects.some((p) => p.pii_chiffre);
  return { prospects: resultat, verrou };
}

function enClair(p: Prospect): ProspectLisible {
  return {
    ...p,
    titre: p.civilite ?? null,
    prenom: p.prenom ?? null,
    adresse: p.adresse ?? null,
    cp_ville: p.cp_ville ?? null,
    affiche: nomComplet({ titre: null, prenom: p.prenom ?? null, nom: p.nom }),
    chiffre: false,
    verrouille: false,
  };
}

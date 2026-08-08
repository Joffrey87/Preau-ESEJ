// Déchiffrement des données donateurs pour l'affichage. Centralisé ici pour
// être partagé par la page Dons et la page Reçus fiscaux.

import { useEffect, useState } from "react";
import { useCoffre } from "@/components/CoffreProvider";

// Champs PII d'un don, potentiellement chiffrés dans pii_chiffre.
export type DonChiffrable = {
  est_personne_morale: boolean;
  donateur_titre: string | null;
  donateur_nom: string | null;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  pii_chiffre: string | null;
};

export type PiiDonateur = {
  titre: string | null;
  nom: string | null;
  prenom: string | null;
  raison: string | null;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
};

/** Extrait le PII (en clair) d'un don, pour chiffrement. */
export function piiDepuis(d: DonChiffrable): PiiDonateur {
  return {
    titre: d.donateur_titre,
    nom: d.donateur_nom,
    prenom: d.donateur_prenom,
    raison: d.raison_sociale,
    adresse: d.adresse,
    cp_ville: d.cp_ville,
    courriel: d.courriel,
  };
}

export const VERROU = "🔒 verrouillé";

function verrouiller<T extends DonChiffrable>(d: T): T {
  return {
    ...d,
    donateur_titre: null,
    donateur_nom: VERROU,
    donateur_prenom: null,
    raison_sociale: d.est_personne_morale ? VERROU : null,
    adresse: null,
    cp_ville: null,
    courriel: null,
  };
}

function appliquer<T extends DonChiffrable>(d: T, p: PiiDonateur): T {
  return {
    ...d,
    donateur_titre: p.titre,
    donateur_nom: p.nom,
    donateur_prenom: p.prenom,
    raison_sociale: p.raison,
    adresse: p.adresse,
    cp_ville: p.cp_ville,
    courriel: p.courriel,
  };
}

/**
 * Hydrate une liste de dons : si un don a un pii_chiffre et que le coffre est
 * ouvert → PII déchiffré ; coffre fermé → 🔒 ; dons « legacy » (encore en clair,
 * pas de pii_chiffre) → laissés tels quels.
 */
export function useDonsDechiffres<T extends DonChiffrable>(dons: T[]) {
  const { estOuvert, estConfigure, charge, dechiffrer } = useCoffre();
  const [resultat, setResultat] = useState<T[]>(dons);

  useEffect(() => {
    let annule = false;
    (async () => {
      const out = await Promise.all(
        dons.map(async (d) => {
          if (!d.pii_chiffre) return d; // en clair (pas encore chiffré)
          if (!estOuvert) return verrouiller(d);
          try {
            return appliquer(d, JSON.parse(await dechiffrer(d.pii_chiffre)) as PiiDonateur);
          } catch {
            return verrouiller(d);
          }
        }),
      );
      if (!annule) setResultat(out);
    })();
    return () => {
      annule = true;
    };
  }, [dons, estOuvert, dechiffrer]);

  const verrou = estConfigure && !estOuvert && dons.some((d) => d.pii_chiffre);
  return { dons: resultat, verrou, charge };
}

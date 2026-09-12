// Chiffrement / déchiffrement des coordonnées du carnet d'adresses.
// Même principe que `donsChiffre` pour les dons, mais avec le coffre du carnet
// (phrase commune au bureau). Les colonnes en clair restent utilisées pour les
// fiches pas encore reprises ; une fois chiffrées, elles sont vidées.

import { useEffect, useState } from "react";
import { useCarnet } from "@/components/CarnetProvider";

export type ContactChiffrable = {
  est_personne_morale: boolean;
  civilite: string | null;
  nom: string | null;
  prenom: string | null;
  raison_sociale: string | null;
  courriel: string | null;
  telephone: string | null;
  adresse: string | null;
  cp_ville: string | null;
  iban: string | null;
  notes: string | null;
  relation: string | null;
  pii_chiffre: string | null;
};

export type PiiContact = {
  civilite: string | null;
  nom: string | null;
  prenom: string | null;
  raison_sociale: string | null;
  courriel: string | null;
  telephone: string | null;
  adresse: string | null;
  cp_ville: string | null;
  iban: string | null;
  notes: string | null;
  relation: string | null;
};

/** Extrait le bloc PII (en clair) d'un contact, pour chiffrement. */
export function piiDepuisContact(c: ContactChiffrable): PiiContact {
  return {
    civilite: c.civilite,
    nom: c.nom,
    prenom: c.prenom,
    raison_sociale: c.raison_sociale,
    courriel: c.courriel,
    telephone: c.telephone,
    adresse: c.adresse,
    cp_ville: c.cp_ville,
    iban: c.iban,
    notes: c.notes,
    relation: c.relation,
  };
}

/** Colonnes en clair à vider une fois le contact chiffré. */
export const PII_VIDE = {
  civilite: null,
  nom: null,
  prenom: null,
  raison_sociale: null,
  courriel: null,
  telephone: null,
  adresse: null,
  cp_ville: null,
  iban: null,
  notes: null,
  relation: null,
} as const;

export const VERROU = "🔒 verrouillé";

function verrouiller<T extends ContactChiffrable>(c: T): T {
  return {
    ...c,
    ...PII_VIDE,
    nom: c.est_personne_morale ? null : VERROU,
    raison_sociale: c.est_personne_morale ? VERROU : null,
  };
}

function appliquer<T extends ContactChiffrable>(c: T, p: PiiContact): T {
  return { ...c, ...p };
}

/**
 * Hydrate une liste de contacts : chiffré + coffre ouvert → en clair ;
 * chiffré + coffre fermé → 🔒 ; pas encore chiffré → tel quel.
 */
export function useContactsDechiffres<T extends ContactChiffrable>(contacts: T[]) {
  const { estOuvert, estConfigure, charge, dechiffrer } = useCarnet();
  const [resultat, setResultat] = useState<T[]>(contacts);

  useEffect(() => {
    let annule = false;
    (async () => {
      const out = await Promise.all(
        contacts.map(async (c) => {
          if (!c.pii_chiffre) return c; // pas encore repris
          if (!estOuvert) return verrouiller(c);
          try {
            return appliquer(c, JSON.parse(await dechiffrer(c.pii_chiffre)) as PiiContact);
          } catch {
            return verrouiller(c);
          }
        }),
      );
      if (!annule) setResultat(out);
    })();
    return () => {
      annule = true;
    };
  }, [contacts, estOuvert, dechiffrer]);

  const verrou = estConfigure && !estOuvert && contacts.some((c) => c.pii_chiffre);
  return { contacts: resultat, verrou, charge };
}

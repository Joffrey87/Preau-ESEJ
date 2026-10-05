"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  chargerMeta,
  changerPhrase as changerPhraseCoffre,
  configurerCoffre,
  ouvrirCoffre,
  regenererCodeSecours as regenererCodeCoffre,
  definirCodeSecretaire as definirCodeSecretaireCoffre,
  retirerCodeSecretaire as retirerCodeSecretaireCoffre,
  verifierSecret,
  type CoffreMeta,
} from "@/lib/coffre";
import { chiffrer as chiffrerCrypto, dechiffrer as dechiffrerCrypto } from "@/lib/crypto";

export type CoffreCtx = {
  charge: boolean; // métadonnées chargées ?
  estConfigure: boolean; // le coffre existe ?
  estOuvert: boolean; // DEK en mémoire ?
  configurer: (phrase: string) => Promise<string>; // crée le coffre, renvoie le code de secours
  ouvrir: (secret: string) => Promise<void>;
  verrouiller: () => void;
  changerPhrase: (nouvellePhrase: string) => Promise<void>; // le code de secours reste valable
  regenererCodeSecours: () => Promise<string>; // invalide l'ancien code, renvoie le nouveau
  verifier: (secret: string) => Promise<boolean>; // teste un secret sans rien changer
  aCodeSecretaire: boolean; // un code d'accès délégué au secrétaire existe-t-il ?
  definirCodeSecretaire: () => Promise<string>; // génère (ou remplace) le code du secrétaire, renvoyé une seule fois
  retirerCodeSecretaire: () => Promise<void>;
  chiffrer: (texte: string) => Promise<string>;
  dechiffrer: (blob: string) => Promise<string>;
};

/**
 * Fabrique un contexte React pour un coffre donné (1 = dons, 2 = carnet).
 * Les deux coffres partagent tout le mécanisme mais rien de leurs secrets :
 * chacun a sa phrase, son code de secours et sa clé de données.
 */
export function creerContexteCoffre(coffreId: number, nomAffiche: string) {
  const Ctx = createContext<CoffreCtx | null>(null);

  function useCoffreCtx(): CoffreCtx {
    const c = useContext(Ctx);
    if (!c) throw new Error(`Le contexte « ${nomAffiche} » doit être utilisé dans son fournisseur.`);
    return c;
  }

  function Provider({ children }: { children: React.ReactNode }) {
    const [meta, setMeta] = useState<CoffreMeta | null>(null);
    const [charge, setCharge] = useState(false);
    const [dek, setDek] = useState<CryptoKey | null>(null); // clé de données, en mémoire seulement

    useEffect(() => {
      chargerMeta(createClient(), coffreId)
        .then((m) => setMeta(m))
        .finally(() => setCharge(true));
    }, []);

    const configurer = useCallback(async (phrase: string) => {
      const supabase = createClient();
      const { code, dek: nouvelleDek } = await configurerCoffre(supabase, phrase, coffreId);
      setDek(nouvelleDek);
      setMeta(await chargerMeta(supabase, coffreId));
      return code;
    }, []);

    const ouvrir = useCallback(
      async (secret: string) => {
        if (!meta) throw new Error("Le coffre n'est pas encore configuré.");
        setDek(await ouvrirCoffre(meta, secret));
      },
      [meta],
    );

    const verrouiller = useCallback(() => setDek(null), []);

    // Ré-emballage de la DEK : ne touche ni aux données chiffrées ni à l'autre secret.
    const changerPhrase = useCallback(
      async (nouvellePhrase: string) => {
        if (!dek) throw new Error("Coffre verrouillé.");
        const supabase = createClient();
        await changerPhraseCoffre(supabase, dek, nouvellePhrase, coffreId);
        setMeta(await chargerMeta(supabase, coffreId));
      },
      [dek],
    );

    const regenererCodeSecours = useCallback(async () => {
      if (!dek) throw new Error("Coffre verrouillé.");
      const supabase = createClient();
      const code = await regenererCodeCoffre(supabase, dek, coffreId);
      setMeta(await chargerMeta(supabase, coffreId));
      return code;
    }, [dek]);

    const definirCodeSecretaire = useCallback(async () => {
      if (!dek) throw new Error("Coffre verrouillé.");
      const supabase = createClient();
      const code = await definirCodeSecretaireCoffre(supabase, dek, coffreId);
      setMeta(await chargerMeta(supabase, coffreId));
      return code;
    }, [dek]);

    const retirerCodeSecretaire = useCallback(async () => {
      const supabase = createClient();
      await retirerCodeSecretaireCoffre(supabase, coffreId);
      setMeta(await chargerMeta(supabase, coffreId));
    }, []);

    const verifier = useCallback(
      async (secret: string) => {
        if (!meta) return false;
        return verifierSecret(meta, secret);
      },
      [meta],
    );

    const chiffrer = useCallback(
      async (texte: string) => {
        if (!dek) throw new Error("Coffre verrouillé.");
        return chiffrerCrypto(dek, texte);
      },
      [dek],
    );
    const dechiffrer = useCallback(
      async (blob: string) => {
        if (!dek) throw new Error("Coffre verrouillé.");
        return dechiffrerCrypto(dek, blob);
      },
      [dek],
    );

    return (
      <Ctx.Provider
        value={{
          charge,
          estConfigure: !!meta,
          estOuvert: !!dek,
          configurer,
          ouvrir,
          verrouiller,
          changerPhrase,
          regenererCodeSecours,
          verifier,
          aCodeSecretaire: !!meta?.dek_secretaire,
          definirCodeSecretaire,
          retirerCodeSecretaire,
          chiffrer,
          dechiffrer,
        }}
      >
        {children}
      </Ctx.Provider>
    );
  }

  return { Provider, useCoffreCtx };
}

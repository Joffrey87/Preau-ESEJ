"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { chargerMeta, configurerCoffre, ouvrirCoffre, type CoffreMeta } from "@/lib/coffre";
import { chiffrer as chiffrerCrypto, dechiffrer as dechiffrerCrypto } from "@/lib/crypto";

type CoffreCtx = {
  charge: boolean; // métadonnées chargées ?
  estConfigure: boolean; // le coffre existe ?
  estOuvert: boolean; // DEK en mémoire ?
  configurer: (phrase: string) => Promise<string>; // crée le coffre, renvoie le code de secours
  ouvrir: (secret: string) => Promise<void>;
  verrouiller: () => void;
  chiffrer: (texte: string) => Promise<string>;
  dechiffrer: (blob: string) => Promise<string>;
};

const Ctx = createContext<CoffreCtx | null>(null);

export function useCoffre(): CoffreCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCoffre doit être utilisé dans <CoffreProvider>.");
  return c;
}

export default function CoffreProvider({ children }: { children: React.ReactNode }) {
  const [meta, setMeta] = useState<CoffreMeta | null>(null);
  const [charge, setCharge] = useState(false);
  const [dek, setDek] = useState<CryptoKey | null>(null); // clé de données, en mémoire seulement

  useEffect(() => {
    chargerMeta(createClient())
      .then((m) => setMeta(m))
      .finally(() => setCharge(true));
  }, []);

  const configurer = useCallback(async (phrase: string) => {
    const supabase = createClient();
    const { code, dek: nouvelleDek } = await configurerCoffre(supabase, phrase);
    setDek(nouvelleDek);
    setMeta(await chargerMeta(supabase));
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
        chiffrer,
        dechiffrer,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

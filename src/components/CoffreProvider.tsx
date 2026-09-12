"use client";

// Coffre des données donateurs (id 1). Le mécanisme est mutualisé dans
// `coffreContexte` et partagé avec le coffre du carnet d'adresses.

import { creerContexteCoffre } from "@/lib/coffreContexte";
import { COFFRE_DONS } from "@/lib/coffre";
export type { CoffreCtx } from "@/lib/coffreContexte";

const { Provider, useCoffreCtx } = creerContexteCoffre(COFFRE_DONS, "coffre des dons");

export const useCoffre = useCoffreCtx;
export default Provider;

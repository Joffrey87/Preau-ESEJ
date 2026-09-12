"use client";

// Coffre du carnet d'adresses (id 2). Secrets distincts de ceux du coffre des
// dons : phrase commune aux utilisateurs du bureau, et son propre code de secours.

import { creerContexteCoffre } from "@/lib/coffreContexte";
import { COFFRE_CARNET } from "@/lib/coffre";

const { Provider, useCoffreCtx } = creerContexteCoffre(COFFRE_CARNET, "coffre du carnet");

export const useCarnet = useCoffreCtx;
export default Provider;

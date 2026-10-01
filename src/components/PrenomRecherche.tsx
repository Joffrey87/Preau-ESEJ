"use client";

import { createContext, useContext } from "react";

type Contexte = { prenom: string | null; partage: boolean };
const Ctx = createContext<Contexte>({ prenom: null, partage: false });

/** Prénom sous lequel on agit dans les onglets de recherche de fonds. */
export const usePrenom = () => useContext(Ctx);

/**
 * Profil partagé « Recherche de fonds » : le prénom est choisi sur l'écran
 * d'accueil et ne se change pas en cours de visite. Président et Trésorier
 * agissent sous le prénom de leur profil.
 */
export function PrenomProvider({
  partage,
  prenomProfil,
  children,
}: {
  partage: boolean;
  prenomProfil: string | null;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={{ prenom: prenomProfil, partage }}>{children}</Ctx.Provider>;
}

/** « Vous : Alexis » */
export function BadgePrenom() {
  const { prenom } = usePrenom();
  if (!prenom) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
      Vous : <span className="font-medium text-foreground">{prenom}</span>
    </span>
  );
}

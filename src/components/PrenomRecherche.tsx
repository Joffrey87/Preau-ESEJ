"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { MEMBRES } from "@/lib/rechercheFonds";

const CLE = "recherche.prenom";

type Contexte = { prenom: string | null; partage: boolean; changer: () => void };
const Ctx = createContext<Contexte>({ prenom: null, partage: false, changer: () => {} });

/** Prénom sous lequel on agit dans les onglets de recherche de fonds. */
export const usePrenom = () => useContext(Ctx);

/**
 * Profil partagé « Recherche de fonds » : chacun choisit son prénom (retenu sur
 * l'appareil, modifiable). Président et Trésorier agissent sous le prénom de
 * leur profil.
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
  const [prenom, setPrenom] = useState<string | null>(partage ? null : prenomProfil);
  const [choix, setChoix] = useState(false);

  useEffect(() => {
    if (!partage) return;
    let p: string | null = null;
    try {
      p = localStorage.getItem(CLE);
    } catch {}
    // Prénom retenu sur l'appareil, sinon on le demande.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (p && MEMBRES.includes(p)) setPrenom(p);
    else setChoix(true);
  }, [partage]);

  function choisir(p: string) {
    setPrenom(p);
    setChoix(false);
    try {
      localStorage.setItem(CLE, p);
    } catch {}
  }

  return (
    <Ctx.Provider value={{ prenom, partage, changer: () => setChoix(true) }}>
      {children}
      {choix && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <h2 className="mb-1 text-base font-semibold">Qui êtes-vous ?</h2>
            <p className="mb-4 text-sm text-muted">Vos avis, choix et notes seront signés de votre prénom.</p>
            <div className="grid gap-2">
              {MEMBRES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => choisir(m)}
                  className={`rounded-lg border px-4 py-2 text-left text-sm font-medium hover:bg-surface-2 ${
                    m === prenom ? "border-accent bg-accent-soft text-accent" : "border-border"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {prenom && (
              <button type="button" onClick={() => setChoix(false)} className="mt-3 text-xs text-muted hover:underline">
                Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** « Vous agissez en tant que : Alexis · Changer » */
export function BadgePrenom() {
  const { prenom, partage, changer } = usePrenom();
  if (!prenom) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
      Vous : <span className="font-medium text-foreground">{prenom}</span>
      {partage && (
        <button type="button" onClick={changer} className="text-accent hover:underline">
          changer
        </button>
      )}
    </span>
  );
}

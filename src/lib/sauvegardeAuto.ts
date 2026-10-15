"use client";

// Enregistrement automatique des saisies (notes, appréciations) : chaque champ enregistre peu après la dernière frappe
// (800 ms), en le quittant, et à son démontage (changement de matière, retour du navigateur dans l'application). Les
// saisies pas encore parties sont aussi envoyées quand l'onglet passe en arrière-plan ; une fermeture ou un
// rechargement de la page pendant un envoi en attente demande confirmation. `enregistrerTout` (bouton « Enregistrer »)
// envoie tout ce qui attend, sans délai.

import { useCallback, useEffect, useRef, useState } from "react";

type Envoi = () => Promise<void>;
const enAttente = new Map<number, Envoi>();
let derniereCle = 0;
let ecoute = false;

function ecouter() {
  if (ecoute || typeof window === "undefined") return;
  ecoute = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void enregistrerTout();
  });
  window.addEventListener("beforeunload", (e) => {
    if (!enAttente.size) return;
    void enregistrerTout();
    e.preventDefault();
    e.returnValue = "";
  });
}

/** Envoie tout ce qui attend d'être enregistré et attend la fin des envois. */
export async function enregistrerTout() {
  await Promise.all([...enAttente.values()].map((f) => f()));
}

export type EtatSauvegarde = "" | "attente" | "envoi" | "ok" | "erreur";

/**
 * Valeur d'un champ enregistrée automatiquement. `enregistrer` renvoie un message d'erreur (ou rien si tout va bien).
 * Renvoie la valeur, le changement à brancher sur onChange, l'envoi immédiat (onBlur) et l'état de l'enregistrement.
 */
export function useSauvegardeAuto(initial: string, enregistrer: (v: string) => Promise<string | null | void> | void, delai = 800) {
  const [valeur, setValeur] = useState(initial);
  const [etat, setEtat] = useState<EtatSauvegarde>("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [cle] = useState(() => ++derniereCle);
  const enregistre = useRef(initial.trim());
  const courant = useRef(initial);
  const minuteur = useRef<number | null>(null);
  const fn = useRef(enregistrer);
  useEffect(() => {
    fn.current = enregistrer;
  }, [enregistrer]);

  const envoyer = useCallback(async () => {
    if (minuteur.current) window.clearTimeout(minuteur.current);
    minuteur.current = null;
    enAttente.delete(cle);
    const v = courant.current;
    if (v.trim() === enregistre.current) return setEtat((e) => (e === "attente" ? "" : e));
    const avant = enregistre.current;
    enregistre.current = v.trim();
    setEtat("envoi");
    const err = await fn.current(v);
    if (err) {
      enregistre.current = avant;
      setErreur(err);
      setEtat("erreur");
      return;
    }
    setErreur(null);
    setEtat("ok");
  }, [cle]);

  const changer = (v: string) => {
    setValeur(v);
    courant.current = v;
    setEtat("attente");
    ecouter();
    enAttente.set(cle, envoyer);
    if (minuteur.current) window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => void envoyer(), delai);
  };

  // Démontage (autre matière, autre élève, retour du navigateur) : ce qui attend part aussitôt.
  useEffect(() => () => void envoyer(), [envoyer]);

  return { valeur, changer, envoyer, etat, erreur };
}

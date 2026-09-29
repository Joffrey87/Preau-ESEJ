"use client";

import { useLayoutEffect } from "react";
import { abonnerTheme, lireTheme, poserTheme } from "@/lib/theme";

/**
 * Garde le thème choisi sur <html> : le script de <head> le pose au
 * chargement, mais React peut effacer l'attribut (remontage en développement).
 * Suit aussi un changement fait dans un autre onglet.
 */
export default function ThemeApplique() {
  useLayoutEffect(() => {
    poserTheme(lireTheme());
    return abonnerTheme(() => {});
  }, []);
  return null;
}

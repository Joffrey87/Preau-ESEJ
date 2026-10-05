"use client";

import { useSyncExternalStore } from "react";
import Icon from "@/components/Icon";
import { abonnerTheme, choisirTheme, lireTheme } from "@/lib/theme";

/** Thème effectivement affiché : le choix de l'appareil, ou à défaut le réglage du système. */
function themeAffiche(): "clair" | "sombre" {
  const t = lireTheme();
  if (t !== "auto") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "sombre" : "clair";
}

/** Icône qui bascule entre le thème clair et le thème sombre (choix mémorisé sur cet appareil). */
export default function BasculeTheme({ className = "" }: { className?: string }) {
  // Côté serveur : « clair » ; le thème réel est lu dès l'hydratation.
  const theme = useSyncExternalStore(abonnerTheme, themeAffiche, () => "clair" as const);
  const versSombre = theme === "clair";
  return (
    <button
      type="button"
      onClick={() => choisirTheme(versSombre ? "sombre" : "clair")}
      title={versSombre ? "Passer au thème sombre" : "Passer au thème clair"}
      aria-label={versSombre ? "Passer au thème sombre" : "Passer au thème clair"}
      className={`inline-flex shrink-0 items-center justify-center rounded-md p-2 text-foreground hover:bg-surface-2 ${className}`}
    >
      <Icon name={versSombre ? "lune" : "soleil"} className="h-4 w-4" />
    </button>
  );
}

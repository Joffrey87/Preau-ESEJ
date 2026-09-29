/**
 * Thème d'affichage, propre à chaque appareil (localStorage) :
 * « auto » suit le réglage du système, « clair » / « sombre » l'imposent.
 */
export type Theme = "auto" | "clair" | "sombre";

export const CLE_THEME = "preau-theme";

const EVENEMENT = "preau-theme";

/**
 * Script exécuté dans <head>, avant le premier affichage : il applique le
 * thème enregistré sans éclair de l'autre thème au chargement.
 */
export const SCRIPT_THEME = `(function(){try{var t=localStorage.getItem("${CLE_THEME}");if(t==="clair")document.documentElement.dataset.theme="light";else if(t==="sombre")document.documentElement.dataset.theme="dark";}catch(e){}})()`;

export function lireTheme(): Theme {
  try {
    const t = localStorage.getItem(CLE_THEME);
    return t === "clair" || t === "sombre" ? t : "auto";
  } catch {
    return "auto";
  }
}

/** Pose (ou retire) l'attribut data-theme sur <html>. */
export function poserTheme(t: Theme) {
  const el = document.documentElement;
  if (t === "clair") el.dataset.theme = "light";
  else if (t === "sombre") el.dataset.theme = "dark";
  else delete el.dataset.theme;
}

/** Enregistre le choix pour cet appareil et l'applique immédiatement. */
export function choisirTheme(t: Theme) {
  try {
    if (t === "auto") localStorage.removeItem(CLE_THEME);
    else localStorage.setItem(CLE_THEME, t);
  } catch {
    // Stockage indisponible : le choix ne vaut que pour la page ouverte.
  }
  poserTheme(t);
  window.dispatchEvent(new Event(EVENEMENT));
}

/** Abonnement aux changements de thème (cet onglet et les autres onglets). */
export function abonnerTheme(rappel: () => void): () => void {
  const surStockage = (e: StorageEvent) => {
    if (e.key !== CLE_THEME) return;
    poserTheme(lireTheme());
    rappel();
  };
  window.addEventListener(EVENEMENT, rappel);
  window.addEventListener("storage", surStockage);
  return () => {
    window.removeEventListener(EVENEMENT, rappel);
    window.removeEventListener("storage", surStockage);
  };
}

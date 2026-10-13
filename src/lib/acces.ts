// Droits d'accès réglés par le Webmestre (tables acces_* : masqué, lecture seule, modification).
// Les pages absentes du catalogue gardent les règles du code (roles.ts).

export type Niveau = "masque" | "lecture" | "modification";
export const NIVEAUX: { v: Niveau; label: string }[] = [
  { v: "masque", label: "Masqué" },
  { v: "lecture", label: "Lecture seule" },
  { v: "modification", label: "Modification" },
];

export type ContexteAcces = {
  webmestre: boolean;
  profil_webmestre: string | null;
  profil: string;
  niveaux: Record<string, Niveau>;
};

export const PAGE_WEBMESTRE = "/webmestre";

/** Niveau de la page du catalogue qui couvre ce chemin (préfixe le plus long) ; null = page hors catalogue. */
export function niveauDuChemin(niveaux: Record<string, Niveau>, chemin: string): Niveau | null {
  let meilleure: string | null = null;
  for (const cle of Object.keys(niveaux)) {
    const couvre = cle === "/" ? chemin === "/" : chemin === cle || chemin.startsWith(cle + "/");
    if (couvre && (!meilleure || cle.length > meilleure.length)) meilleure = cle;
  }
  return meilleure ? niveaux[meilleure] : null;
}

/** Première page visible (page d'arrivée) ; aucune = page d'attente. */
export function premierePage(niveaux: Record<string, Niveau>): string {
  if (niveaux["/"] && niveaux["/"] !== "masque") return "/";
  return Object.keys(niveaux).find((k) => niveaux[k] !== "masque") ?? "/en-attente";
}
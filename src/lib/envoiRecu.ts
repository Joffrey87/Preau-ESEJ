// Envoi des reçus fiscaux : préférence du donateur (portée par sa fiche) et
// moyen réellement utilisé à l'envoi (enregistré sur le reçu).

/** Préférence de la fiche donateur : le courriel est la valeur par défaut. */
export const PREFERENCES_ENVOI = [
  { v: "courriel", l: "Courriel" },
  { v: "courrier", l: "Courrier postal" },
  { v: "aucun", l: "Ne demande pas de reçu fiscal" },
] as const;

/** Valeur écrite en base : « courriel » (défaut) reste vide. */
export const prefereEnBase = (v: string | null | undefined) => (v === "courrier" || v === "aucun" ? v : null);

/** Moyens d'envoi possibles, enregistrés sur le reçu au moment de l'envoi. */
export const MOYENS_ENVOI = [
  { v: "courriel", l: "Courriel" },
  { v: "courrier", l: "Courrier postal" },
  { v: "main_propre", l: "Remis en main propre" },
  { v: "autre", l: "Autre" },
] as const;

export type MoyenEnvoi = (typeof MOYENS_ENVOI)[number]["v"];

export const libelleMoyen = (v: string | null | undefined) => MOYENS_ENVOI.find((m) => m.v === v)?.l ?? null;

/** Le donateur reçoit-il ses reçus par courrier postal ? (sinon : courriel) */
export const prefereCourrier = (d: { envoi_prefere?: string | null }) => d.envoi_prefere === "courrier";

/** Texte résumé inscrit dans « Reçu – état » du don : « Envoyé le 23/07/2026 - Courrier postal ». */
export const etatEnvoye = (dateFr: string, moyen: string | null | undefined) =>
  `Envoyé le ${dateFr}${libelleMoyen(moyen) ? ` - ${libelleMoyen(moyen)}` : ""}`;

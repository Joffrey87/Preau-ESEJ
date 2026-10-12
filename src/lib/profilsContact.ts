import { MEMBRES } from "@/lib/rechercheFonds";
import { ROLES } from "@/lib/roles";

/** Profils auxquels on peut réserver le contact d'un donateur : membres de la Recherche de fonds, puis profils du bureau. */
export const PROFILS_RECHERCHE_FONDS: string[] = MEMBRES;
export const PROFILS_BUREAU: string[] = ROLES.filter((r) => !["recherche-fonds", "resp-mecenat"].includes(r.slug)).map((r) => r.label);

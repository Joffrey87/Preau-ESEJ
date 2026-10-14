import { ROLES, roleByEmail } from "@/lib/roles";

// « Vue en tant que » : le Webmestre bascule sur un autre profil ; la base (webmestre_vue, mon_role)
// profil (menu, pages accessibles, accueil). C'est une simple vue : les droits
// réels, côté base, restent ceux du Trésorier — aucune écriture n'est faite
// sous l'identité du profil simulé.

export const COOKIE_VUE = "vue_en_tant_que";

/** Seul le Trésorier dispose de la vue « en tant que ». */
export function peutChangerDeVue(emailReel?: string | null, webmestre?: boolean): boolean {
  // Le Webmestre (base) ; à défaut d'information, le Trésorier comme avant.
  return webmestre ?? roleByEmail(emailReel)?.slug === "tresorier";
}

/**
 * Adresse « effective » : celle du profil simulé si le Trésorier en a choisi un,
 * sinon l'adresse réelle. Tout contrôle d'affichage (menu, pages) s'appuie dessus.
 */
export function emailEffectif(emailReel: string | null | undefined, slugVue?: string | null, webmestre?: boolean): string | undefined {
  if (!emailReel) return undefined;
  if (!slugVue || !peutChangerDeVue(emailReel, webmestre)) return emailReel;
  return ROLES.find((r) => r.slug === slugVue)?.email ?? emailReel;
}

/** Profils proposés dans « voir en tant que » (le profil Resp. Mécénat n'y figure plus). */
export const PROFILS_VUE = ROLES.filter((r) => r.slug !== "resp-mecenat");

/** Icône de chaque profil (menu « changer de profil »). */
export const ICONES_ROLES: Record<string, string> = {
  president: "couronne",
  tresorier: "portefeuille",
  secretaire: "sceau",
  administrateur: "bouclier",
  directrice: "graduation",
  "directeur-spirituel": "croix",
  "resp-mecenat": "gift",
  "recherche-fonds": "billets",
};

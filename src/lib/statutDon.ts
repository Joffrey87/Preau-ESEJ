// Statut d'un don, sur deux axes indépendants :
//  - complétude des informations (pour un reçu fiscal CERFA valide + envoi)
//  - avancement du reçu (à établir → à envoyer / annuel en attente → envoyé)
// Un don peut cumuler plusieurs pastilles (ex. « Reçu envoyé » + « Courriel manquant »).

export type Don = {
  est_personne_morale: boolean;
  donateur_nom: string | null;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  date_don: string;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
  /** Préférence d'envoi des reçus : « courrier » (postal) ou, par défaut, courriel. */
  envoi_prefere?: string | null;
};

export type Tone = "red" | "amber" | "green" | "blue" | "violet" | "gray";
export type StatutKey =
  | "important"
  | "mineur"
  | "envoye"
  | "annuel"
  | "envoyer"
  | "etablir"
  | "sans";

export type Chip = { key: StatutKey; label: string; tone: Tone; detail?: string };

const vide = (s: string | null | undefined) => !s || !s.trim();

// Champs suffisant pour identifier/nommer un donateur (sous-ensemble de Don).
export type IdentiteDon = Pick<
  Don,
  "est_personne_morale" | "donateur_nom" | "donateur_prenom" | "raison_sociale"
>;

/** Nom lisible du donateur (personne morale = raison sociale ; sinon Prénom Nom). */
export function nomDonateur(d: IdentiteDon): string {
  return d.est_personne_morale
    ? d.raison_sociale ?? d.donateur_nom ?? ""
    : [d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ");
}

/** Clé d'identité pour repérer les donateurs récurrents. */
export function cleDonateur(d: IdentiteDon): string {
  const base = d.est_personne_morale
    ? d.raison_sociale ?? d.donateur_nom ?? ""
    : `${d.donateur_nom ?? ""}|${d.donateur_prenom ?? ""}`;
  return base.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Ensemble des clés de donateurs apparaissant au moins deux fois. */
export function donateursRecurrents(dons: Don[]): Set<string> {
  const compte = new Map<string, number>();
  for (const d of dons) {
    const c = cleDonateur(d);
    compte.set(c, (compte.get(c) ?? 0) + 1);
  }
  return new Set([...compte].filter(([, n]) => n > 1).map(([c]) => c));
}

/** Le reçu a-t-il été envoyé ? (texte libre commençant par « Envoy… ») */
export function recuEnvoye(d: Don): boolean {
  return (d.recu_etat ?? "").trim().toLowerCase().startsWith("envoy");
}

/**
 * Le donateur ne demande pas de reçu fiscal. Noté en texte libre dans
 * « Reçu – état » (« Pas de reçu demandé »…) ; l'ancien usage qui l'écrivait
 * à la place du numéro (« ne veut pas de reçu fiscal ») est aussi reconnu.
 */
export function sansRecu(d: Pick<Don, "recu_etat" | "recu_numero" | "envoi_prefere">): boolean {
  const t = `${d.recu_etat ?? ""} ${d.recu_numero ?? ""}`.toLowerCase();
  if (/pas de re[çc]u|sans re[çc]u|ne veut pas|non demand/.test(t)) return true;
  // Préférence de la fiche donateur : ne concerne que les dons sans reçu établi.
  return d.envoi_prefere === "aucun" && !/^RE_\d/.test(d.recu_numero ?? "");
}

/** Champs importants manquants : bloquent un reçu CERFA valide ou son envoi. */
export function champsImportantsManquants(d: Don): string[] {
  const m: string[] = [];
  if (vide(nomDonateur(d))) m.push(d.est_personne_morale ? "raison sociale" : "nom");
  if (vide(d.adresse)) m.push("adresse");
  if (vide(d.cp_ville)) m.push("CP/ville");
  // Le courriel n'est exigé que si le donateur reçoit ses reçus par courriel.
  if (d.envoi_prefere !== "courrier" && vide(d.courriel)) m.push("courriel");
  return m;
}

/** Champs mineurs manquants : utiles mais non bloquants. */
export function champsMineursManquants(d: Don): string[] {
  const m: string[] = [];
  if (vide(d.mode_paiement)) m.push("mode de paiement");
  if (vide(d.date_don)) m.push("date");
  if (!d.est_personne_morale && vide(d.donateur_prenom)) m.push("prénom");
  return m;
}

/** Liste des pastilles à afficher pour un don. */
export function statutsDon(d: Don, recurrents: Set<string>): Chip[] {
  const chips: Chip[] = [];

  // Axe workflow du reçu (une seule pastille).
  const sans = sansRecu(d);
  if (sans) {
    chips.push({ key: "sans", label: "Sans reçu fiscal", tone: "gray", detail: "Le donateur ne demande pas de reçu" });
  } else if (recuEnvoye(d)) {
    chips.push({ key: "envoye", label: "Reçu envoyé", tone: "green" });
  } else if (vide(d.recu_numero)) {
    chips.push({ key: "etablir", label: "Reçu à établir", tone: "amber" });
  } else if (recurrents.has(cleDonateur(d))) {
    chips.push({ key: "annuel", label: "Reçu annuel en attente", tone: "violet" });
  } else {
    chips.push({ key: "envoyer", label: "Reçu à envoyer", tone: "blue" });
  }

  // Axe complétude (au plus une pastille : important > mineur). Sans reçu,
  // seule l'identité du donateur reste importante : l'adresse et le courriel
  // ne servent qu'au reçu.
  const importants = champsImportantsManquants(d).filter(
    (c) => !sans || c === "nom" || c === "raison sociale",
  );
  const mineurs = champsMineursManquants(d);
  if (importants.length) {
    chips.push({
      key: "important",
      label: "Info importante manquante",
      tone: "red",
      detail: "Manque : " + importants.join(", "),
    });
  } else if (mineurs.length) {
    chips.push({
      key: "mineur",
      label: "À compléter",
      tone: "amber",
      detail: "Manque : " + mineurs.join(", "),
    });
  }

  return chips;
}

// Métadonnées d'affichage (pastilles + légende + filtres).
export const TONE_CLASSES: Record<Tone, string> = {
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

/** Ordre et libellés des filtres / légende. */
export const FILTRES: { key: StatutKey; label: string; tone: Tone }[] = [
  { key: "important", label: "Info importante manquante", tone: "red" },
  { key: "mineur", label: "À compléter", tone: "amber" },
  { key: "etablir", label: "Reçu à établir", tone: "amber" },
  { key: "annuel", label: "Reçu annuel en attente", tone: "violet" },
  { key: "envoyer", label: "Reçu à envoyer", tone: "blue" },
  { key: "envoye", label: "Reçu envoyé", tone: "green" },
  { key: "sans", label: "Sans reçu fiscal", tone: "gray" },
];

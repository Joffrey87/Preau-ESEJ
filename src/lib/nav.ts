export type NavItem = {
  href: string;
  label: string;
  icon: string;
  ready: boolean;
  /** Réservé à ces rôles (slugs) ; absent = tout le bureau. */
  roles?: string[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

// Navigation par modules. `ready: false` = module prévu mais pas encore construit
// (affiché grisé avec un badge « Bientôt »). V1 = Tableau de bord, Comptabilité, Budget.
export const NAV: NavSection[] = [
  // Tableau de bord : toujours tout en haut, hors section (page d'accueil de chaque profil).
  { title: "", items: [{ href: "/", label: "Tableau de bord", icon: "dashboard", ready: true }] },
  {
    title: "Comptabilité",
    items: [
      { href: "/comptabilite", label: "Comptabilité", icon: "ledger", ready: true },
      { href: "/budget", label: "Budget", icon: "chart", ready: true },
      { href: "/scolarite", label: "Frais de scolarité", icon: "graduation", ready: true },
    ],
  },
  {
    title: "École",
    items: [
      // Directrice, Directeur spirituel (catéchisme) et Professeurs ; aucun autre profil du bureau (données d'élèves).
      { href: "/bulletins", label: "Bulletins", icon: "book", ready: true, roles: ["directrice", "directeur-spirituel"] },
    ],
  },
  {
    title: "Financement",
    items: [
      { href: "/dons", label: "Dons", icon: "gift", ready: true },
      { href: "/mecenat/pipeline", label: "Relations donateurs", icon: "funnel", ready: true },
      { href: "/recus-fiscaux", label: "Reçus fiscaux", icon: "receipt", ready: true },
    ],
  },
  {
    // Profil rattaché à une famille (familles.profil_lie) : ses pages d'Espace famille, dans son menu.
    title: "Espace famille",
    items: [
      { href: "/ma-famille/paiements", label: "Paiements", icon: "invoice", ready: true, roles: ["president"] },
      { href: "/ma-famille/fiche", label: "Ma famille", icon: "maison", ready: true, roles: ["president"] },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/acces-familles", label: "Accès des familles", icon: "users", ready: true, roles: ["tresorier", "administrateur"] },
      { href: "/mails", label: "Mails", icon: "mail", ready: true },
      { href: "/courriers", label: "Courriers à confirmer", icon: "receipt", ready: true, roles: ["secretaire", "tresorier", "president", "administrateur"] },
    ],
  },
  {
    title: "Vie associative",
    items: [
      { href: "/carnet", label: "Carnet d'adresses", icon: "contact", ready: true },
      { href: "/taches", label: "Tâches", icon: "check", ready: false },
      { href: "/ca", label: "Conseil d'administration", icon: "users", ready: true },
      { href: "/evenements", label: "Événements", icon: "calendar", ready: false },
    ],
  },
  {
    title: "Recherche de fonds",
    items: [
      { href: "/recherche/axes", label: "Axes de recherche", icon: "target", ready: true, roles: ["president", "tresorier", "recherche-fonds"] },
      { href: "/recherche/suivi", label: "Suivi des actions", icon: "check", ready: true, roles: ["president", "tresorier", "recherche-fonds"] },
    ],
  },
  {
    title: "Support",
    items: [
      { href: "/parametres", label: "Paramètres", icon: "settings", ready: true },
      { href: "/processus", label: "Processus", icon: "ampoule", ready: true },
    ],
  },
];

/**
 * Onglets mis de côté (retirés du menu, pages et code conservés : les URL restent atteignables).
 * Pour les remettre, les replacer dans NAV (En cours : « Comptabilité » ; Financement et Mécénat : « Financement »).
 */
export const ONGLETS_DE_COTE: NavItem[] = [
  { href: "/en-cours", label: "En cours", icon: "clock", ready: true },
  { href: "/financement", label: "Financement", icon: "chart", ready: true },
  { href: "/mecenat", label: "Mécénat", icon: "target", ready: true },
];

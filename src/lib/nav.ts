export type NavItem = {
  href: string;
  label: string;
  icon: string;
  ready: boolean;
  /** Réservé à ces rôles (slugs) ; absent = tout le bureau. */
  roles?: string[];
  /** Masqué pour ces rôles (même page proposée ailleurs dans leur menu). */
  sauf?: string[];
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
    title: "École",
    items: [
      // Directrice, Directeur spirituel (catéchisme) et Professeurs ; aucun autre profil du bureau (données d'élèves).
      { href: "/bulletins", label: "Bulletins", icon: "bulletin", ready: true, roles: ["directrice", "directeur-spirituel"] },
    ],
  },
  {
    title: "Comptabilité",
    items: [
      { href: "/comptabilite", label: "Comptabilité", icon: "ledger", ready: true },
      { href: "/budget", label: "Budget", icon: "chart", ready: true },
      { href: "/scolarite", label: "Frais de scolarité", icon: "graduation", ready: true },
      // Photo d'une remise de chèques, saisie des chèques et lien avec la comptabilité.
      { href: "/cheques", label: "Dépôt de chèques", icon: "billets", ready: true, roles: ["tresorier", "president", "directrice"] },
      { href: "/ventes-diverses", label: "Ventes diverses", icon: "invoice", ready: true, roles: ["tresorier", "directrice"] },
      { href: "/caisses", label: "Caisses", icon: "billets", ready: true, roles: ["tresorier", "directrice"] },
    ],
  },
  {
    // Libellé de section seulement (anciennement « Financement »).
    title: "Donateurs",
    items: [
      { href: "/dons", label: "Dons", icon: "gift", ready: true },
      { href: "/mecenat/pipeline", label: "Relations donateurs", icon: "funnel", ready: true },
      // Vue Recherche de fonds : ses « Dons » juste sous « Relations donateurs ».
      { href: "/recherche/dons", label: "Dons", icon: "gift", ready: true, roles: ["recherche-fonds"], sauf: ["president", "tresorier"] },
      { href: "/recus-fiscaux", label: "Reçus fiscaux", icon: "receipt", ready: true },
      // Lettres du Président pour les dons de 500 € et plus.
      { href: "/remerciements", label: "Remerciements", icon: "mail", ready: true, roles: ["president", "tresorier", "administrateur"] },
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
    ],
  },
  {
    // Profil Événement (et lecture : Président, Directrice ; Trésorier).
    title: "Événements",
    items: [
      { href: "/evenement", label: "Événements", icon: "calendar", ready: true, roles: ["tresorier", "president", "directrice"] },
      { href: "/evenement/facturation", label: "Facturation", icon: "receipt", ready: true, roles: ["tresorier", "president", "directrice"] },
      { href: "/evenement/carnet", label: "Carnet d'adresses", icon: "contact", ready: true, roles: ["tresorier", "president", "directrice"] },
    ],
  },
  {
    // Sous le menu Événement : bénévoles, séparés comme « Financement » des autres sections.
    title: "Organisation",
    items: [
      { href: "/evenement/membres", label: "Bénévoles", icon: "users", ready: true, roles: ["tresorier", "president", "directrice"] },
    ],
  },
  {
    // Libellé de section seulement (anciennement « Recherche de fonds » ; le profil garde son nom).
    title: "Autres axes",
    items: [
      { href: "/recherche/axes", label: "Axes de recherche", icon: "target", ready: true, roles: ["president", "tresorier", "recherche-fonds"] },
      { href: "/recherche/suivi", label: "Suivi des actions", icon: "check", ready: true, roles: ["president", "tresorier", "recherche-fonds"] },
      { href: "/recherche/dons", label: "Dons", icon: "gift", ready: true, roles: ["president", "tresorier", "recherche-fonds"], sauf: ["recherche-fonds"] },
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
  // Ancien agenda partagé (jamais construit) : remplacé dans le menu par la section « Événements ».
  { href: "/evenements", label: "Agenda des événements", icon: "calendar", ready: false },
  { href: "/en-cours", label: "En cours", icon: "clock", ready: true },
  { href: "/financement", label: "Financement", icon: "chart", ready: true },
  { href: "/mecenat", label: "Mécénat", icon: "target", ready: true },
];

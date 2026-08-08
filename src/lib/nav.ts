export type NavItem = {
  href: string;
  label: string;
  icon: string;
  ready: boolean;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

// Navigation par modules. `ready: false` = module prévu mais pas encore construit
// (affiché grisé avec un badge « Bientôt »). V1 = Tableau de bord, Comptabilité, Budget.
export const NAV: NavSection[] = [
  {
    title: "Finances",
    items: [
      { href: "/", label: "Tableau de bord", icon: "dashboard", ready: true },
      { href: "/comptabilite", label: "Comptabilité", icon: "ledger", ready: true },
      { href: "/en-cours", label: "En cours", icon: "clock", ready: true },
      { href: "/budget", label: "Budget", icon: "chart", ready: true },
      { href: "/scolarite", label: "Frais de scolarité", icon: "graduation", ready: true },
    ],
  },
  {
    title: "Dons & fiscalité",
    items: [
      { href: "/dons", label: "Dons", icon: "gift", ready: true },
      { href: "/mecenat", label: "Mécénat", icon: "target", ready: true },
      { href: "/mecenat/pipeline", label: "Pipeline donateurs", icon: "funnel", ready: true },
      { href: "/recus-fiscaux", label: "Reçus fiscaux", icon: "receipt", ready: true },
    ],
  },
  {
    title: "Flux",
    items: [
      { href: "/virements", label: "Virements", icon: "transfer", ready: false },
      { href: "/mails", label: "Mails", icon: "mail", ready: false },
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
    title: "Support",
    items: [
      { href: "/parametres", label: "Paramètres", icon: "settings", ready: true },
      { href: "/documentation", label: "Documentation", icon: "book", ready: false },
    ],
  },
];

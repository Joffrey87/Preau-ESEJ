// Module Mails — pour l'instant alimenté par des exemples (Gmail pas encore
// connecté). La logique de catégorisation et de détection de factures est
// DÉTERMINISTE et réelle : elle resservira telle quelle sur les vrais mails.

export type CategorieMail =
  | "facture" | "don" | "scolarite" | "partenaire" | "administratif" | "autre";

export type Mail = {
  id: string;
  expediteur: string;
  email: string;
  objet: string;
  extrait: string;
  date: string; // ISO
  categorie: CategorieMail;
  montant: number | null; // montant détecté si facture
  facture_statut: "payee" | "impayee" | null; // recoupé avec la compta
  traite: boolean;
  piece_jointe: boolean;
};

export const CATEGORIE_LABEL: Record<CategorieMail, string> = {
  facture: "Facture",
  don: "Don",
  scolarite: "Scolarité",
  partenaire: "Partenaire / mécénat",
  administratif: "Administratif",
  autre: "Autre",
};

// Couleur d'accent par catégorie (classes Tailwind du thème).
export const CATEGORIE_STYLE: Record<CategorieMail, string> = {
  facture: "bg-negative/10 text-negative",
  don: "bg-gold-soft text-gold",
  scolarite: "bg-accent-soft text-accent",
  partenaire: "bg-positive/10 text-positive",
  administratif: "bg-surface-2 text-muted",
  autre: "bg-surface-2 text-muted",
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Catégorise un mail d'après l'expéditeur et l'objet (règles par mots-clés). */
export function categoriseMail(objet: string, email: string, extrait = ""): CategorieMail {
  const s = norm(`${objet} ${email} ${extrait}`);
  if (/don|soutien|generosite|helloasso|recu fiscal|mecene/.test(s)) return "don";
  if (/scolarite|inscription|rentree|frais de scolarite|reinscription/.test(s)) return "scolarite";
  if (/partenariat|mecenat|fondation|convention/.test(s)) return "partenaire";
  if (/facture|devis|echeance|reglement|a regler|avoir|relance|impaye/.test(s)) return "facture";
  if (/edf|engie|free|generali|fides|fidem|urssaf|humanis|assurance|banque|credit mutuel/.test(s))
    return "facture";
  if (/prefecture|association|assemblee|statuts|declaration|greffe|cotisation/.test(s))
    return "administratif";
  return "autre";
}

/** Détecte un montant en euros dans un texte (ex. « 51,18 € », « 1 800 EUR »). */
export function detecteMontant(texte: string): number | null {
  const m = texte.match(/(\d[\d\s.]*[,.]?\d{0,2})\s*(?:€|eur|euros)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// --- Données d'exemple (fictives) pour la maquette, en attendant Gmail ---
export const MAILS_EXEMPLE: Mail[] = [
  {
    id: "1", expediteur: "Free", email: "factures@free.fr",
    objet: "Votre facture Freebox de juillet — 39,99 €",
    extrait: "Bonjour, votre facture d'un montant de 39,99 € est disponible…",
    date: "2026-08-05", categorie: "facture", montant: 39.99, facture_statut: "payee",
    traite: false, piece_jointe: true,
  },
  {
    id: "2", expediteur: "GENERALI Assurances", email: "contact@generali.fr",
    objet: "Échéance de votre contrat multirisque — 51,18 € à régler",
    extrait: "Nous vous informons que l'échéance de votre contrat…",
    date: "2026-08-05", categorie: "facture", montant: 51.18, facture_statut: "payee",
    traite: false, piece_jointe: true,
  },
  {
    id: "3", expediteur: "Imprimerie du Centre", email: "devis@imprimerie-centre.fr",
    objet: "Facture n°2026-418 — impression plaquettes (rappel)",
    extrait: "Sauf erreur de notre part, la facture de 340,00 € reste en attente…",
    date: "2026-07-29", categorie: "facture", montant: 340, facture_statut: "impayee",
    traite: false, piece_jointe: true,
  },
  {
    id: "4", expediteur: "Fournitures Scolaires Pro", email: "compta@fournitures-pro.fr",
    objet: "Facture matériel de rentrée — 612,50 €",
    extrait: "Veuillez trouver ci-joint votre facture pour la commande de rentrée…",
    date: "2026-07-24", categorie: "facture", montant: 612.5, facture_statut: "impayee",
    traite: false, piece_jointe: true,
  },
  {
    id: "5", expediteur: "HelloAsso", email: "notifications@helloasso.com",
    objet: "Nouveau don de 40 € pour votre association",
    extrait: "Bonne nouvelle ! Vous avez reçu un don de 40 € via votre page…",
    date: "2026-08-06", categorie: "don", montant: 40, facture_statut: null,
    traite: false, piece_jointe: false,
  },
  {
    id: "6", expediteur: "Fondation pour l'École", email: "appels@fondation-ecole.org",
    objet: "Appel à projets 2026 — soutien aux écoles indépendantes",
    extrait: "Nous avons le plaisir de vous informer de l'ouverture de notre appel…",
    date: "2026-08-03", categorie: "partenaire", montant: null, facture_statut: null,
    traite: false, piece_jointe: false,
  },
  {
    id: "7", expediteur: "Famille (parent d'élève)", email: "parent.exemple@email.fr",
    objet: "Question sur les frais de scolarité de septembre",
    extrait: "Bonjour, pourriez-vous me confirmer le montant à régler pour…",
    date: "2026-08-04", categorie: "scolarite", montant: null, facture_statut: null,
    traite: true, piece_jointe: false,
  },
  {
    id: "8", expediteur: "Préfecture de la Marne", email: "associations@marne.gouv.fr",
    objet: "Accusé de réception — déclaration modificative",
    extrait: "Votre déclaration a bien été enregistrée sous le récépissé…",
    date: "2026-07-30", categorie: "administratif", montant: null, facture_statut: null,
    traite: true, piece_jointe: true,
  },
];

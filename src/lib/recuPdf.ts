// Génération d'un reçu fiscal en PDF, côté navigateur, sur une seule page A4.
//
// La mise en page reproduit le modèle ESEJ au point près : chaque élément est
// posé à des coordonnées mesurées sur le reçu de référence. Les textes fixes
// (lettre, mentions légales) sont ici ; seuls les champs du don varient.
//
// Les polices (Montserrat, allégées), le logo et la salutation sont servis
// depuis /public/recu et chargés à la première génération seulement. Les
// signatures, elles, ne sont jamais publiées : elles viennent du bucket privé
// (voir `modeleRecu.ts`) et le reçu s'imprime sans si elles manquent.

import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import type { DonPourRecu } from "@/lib/recu";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { montantEnLettres } from "@/lib/lettres";
import { MODELE_DEFAUT, modeleRecuEnCache, type ModeleRecu } from "@/lib/modeleRecu";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Identité et textes fixes — à modifier ici si le modèle évolue.
// ---------------------------------------------------------------------------

const ASSOCIATION_NOM = "ARIL - Association Rémoise pour l'Instruction Libre";

const LETTRE_INTRO =
  "Vous avez fait confiance à l'Ecole du Saint Enfant Jésus. Grâce à vous, l'École du Saint-Enfant-Jésus va pouvoir remplir sa démarche pédagogique et son choix éducatif :";

type Segment = { t: string; i?: boolean };

const LETTRE_PUCES: Segment[][] = [
  [{ t: "Favoriser un rythme naturel pour l'enfant," }],
  [{ t: "Veiller au bien-être et à la concentration de l'élève dans un climat de confiance," }],
  [{ t: "Utiliser des méthodes pédagogiques ayant fait leurs preuves," }],
  [{ t: "Garantir un suivi personnalisé en s'appuyant sur des classes à petits effectifs," }],
  [
    { t: "Instaurer des relations charitables entre les enfants" },
    {
      t: "(amitié, mise en pratique des vertus chrétiennes, modestie favorisée par l'uniforme, interdiction des téléphones portables, …),",
      i: true,
    },
  ],
  [{ t: "Opter pour des activités visant à développer le goût du Vrai, du Beau et du Bien," }],
  [
    {
      t: "Offrir aux enfants, au sein de l'école, une assistance spirituelle selon l'esprit de saint François de Sales et de saint Jean Bosco, assurée par un chanoine de l'Institut du Christ Roi Souverain Prêtre implanté dans l'archidiocèse.",
    },
  ],
];

const LETTRE_FIN =
  "Nous vous remercions pour votre don. Vous trouverez ci-dessous le reçu fiscal correspondant à votre don.";

const ATTESTATION =
  "L'Association Rémoise pour l'Instruction Libre, organisme d'intérêt général, reconnaît avoir reçu au titre des versements ouvrant droit à réduction d'impôt la somme de ;";

const MENTION_LEGALE =
  "Le bénéficiaire certifie sur l'honneur que les dons et versements qu'il reçoit ouvrent droit à la réduction d'impôt prévue aux articles : 200 du CGI (pour l'impôt sur le revenu des particuliers) et 238bis du CGI (pour l'impôt sur les sociétés ou l'impôt sur le revenu des entreprises).";

// ---------------------------------------------------------------------------
// Ressources (polices, images), chargées une fois par session.
// ---------------------------------------------------------------------------

const FICHIERS = {
  regular: "/recu/Montserrat-Regular.ttf",
  semi: "/recu/Montserrat-SemiBold.ttf",
  italic: "/recu/Montserrat-Italic.ttf",
  logo: "/recu/ecole.png",
  salutation: "/recu/salutation.png",
} as const;

type Ressources = Record<keyof typeof FICHIERS, ArrayBuffer>;
let cache: Promise<Ressources> | null = null;

function chargerRessources(): Promise<Ressources> {
  if (!cache) {
    cache = (async () => {
      const entrees = await Promise.all(
        (Object.keys(FICHIERS) as (keyof typeof FICHIERS)[]).map(async (k) => {
          const r = await fetch(FICHIERS[k]);
          if (!r.ok) throw new Error(`Ressource introuvable : ${FICHIERS[k]}`);
          return [k, await r.arrayBuffer()] as const;
        }),
      );
      return Object.fromEntries(entrees) as Ressources;
    })().catch((e) => {
      cache = null; // un échec réseau ne doit pas empoisonner la session
      throw e;
    });
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Petits outils de composition. Les ordonnées sont exprimées depuis le HAUT
// de la page (comme mesurées sur le modèle) et converties à l'affichage.
// ---------------------------------------------------------------------------

const A4 = { w: 595.28, h: 841.89 };
const depuisLeHaut = (top: number) => A4.h - top;

type Mot = { t: string; font: PDFFont };

/** Découpe des segments (droit/italique) en mots, chacun portant sa police. */
function enMots(segments: Segment[], regular: PDFFont, italic: PDFFont): Mot[] {
  const mots: Mot[] = [];
  for (const s of segments) {
    const font = s.i ? italic : regular;
    for (const t of s.t.split(/\s+/)) if (t) mots.push({ t, font });
  }
  return mots;
}

/** Répartit les mots en lignes n'excédant pas la largeur donnée. */
function enLignes(mots: Mot[], size: number, largeur: number, espace: number): Mot[][] {
  const lignes: Mot[][] = [];
  let courante: Mot[] = [];
  let occupe = 0;
  for (const m of mots) {
    const lm = m.font.widthOfTextAtSize(m.t, size);
    const ajout = courante.length ? espace + lm : lm;
    if (courante.length && occupe + ajout > largeur) {
      lignes.push(courante);
      courante = [m];
      occupe = lm;
    } else {
      courante.push(m);
      occupe += ajout;
    }
  }
  if (courante.length) lignes.push(courante);
  return lignes;
}

type Style = { size: number; color: RGB; interligne: number; justifier?: boolean };

/**
 * Compose un paragraphe à partir d'une ligne de base et retourne le nombre de
 * lignes écrites. Justifié : les espaces s'élargissent, sauf en dernière ligne.
 */
function paragraphe(
  page: PDFPage,
  segments: Segment[],
  fonts: { regular: PDFFont; italic: PDFFont },
  x: number,
  base: number,
  largeur: number,
  st: Style,
): number {
  const espace = fonts.regular.widthOfTextAtSize(" ", st.size);
  const lignes = enLignes(enMots(segments, fonts.regular, fonts.italic), st.size, largeur, espace);
  lignes.forEach((ligne, i) => {
    const y = depuisLeHaut(base + i * st.interligne);
    const derniere = i === lignes.length - 1;
    const encre = ligne.reduce((s, m) => s + m.font.widthOfTextAtSize(m.t, st.size), 0);
    const ecart =
      st.justifier && !derniere && ligne.length > 1
        ? (largeur - encre) / (ligne.length - 1)
        : espace;
    let cx = x;
    for (const m of ligne) {
      page.drawText(m.t, { x: cx, y, size: st.size, font: m.font, color: st.color });
      cx += m.font.widthOfTextAtSize(m.t, st.size) + ecart;
    }
  });
  return lignes.length;
}

const capitaliser = (s: string) => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

/** Retire ce que la police allégée ne saurait pas dessiner. */
function assainir(s: string): string {
  return s
    .replace(/[\u00a0\u202f\u2009\r\n\t]/g, " ")
    .replace(/[^\u0020-\u017f\u20ac\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u2116\u2022]/g, "");
}

// ---------------------------------------------------------------------------
// Le reçu.
// ---------------------------------------------------------------------------

export type OptionsRecu = {
  /** Année portée dans le bandeau ; par défaut celle du don. */
  annee?: number;
  /** Date d'édition (ISO) ; par défaut aujourd'hui. */
  dateEdition?: string;
  /** Signataires, adresse, contact ; par défaut le modèle ESEJ livré. */
  modele?: ModeleRecu;
};

export async function construireRecuPdf(don: DonPourRecu, options: OptionsRecu = {}): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, { default: fontkit }, res] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    chargerRessources(),
  ]);

  const modele = options.modele ?? MODELE_DEFAUT;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semi, italic] = await Promise.all([
    doc.embedFont(res.regular, { subset: true }),
    doc.embedFont(res.semi, { subset: true }),
    doc.embedFont(res.italic, { subset: true }),
  ]);
  // Les signatures fournies par l'utilisateur peuvent être en PNG ou en JPEG.
  const embedImage = (octets: ArrayBuffer) => {
    const [b0, b1] = new Uint8Array(octets.slice(0, 2));
    return b0 === 0xff && b1 === 0xd8 ? doc.embedJpg(octets) : doc.embedPng(octets);
  };
  const [logo, salutation, signPresident, signTresorier] = await Promise.all([
    doc.embedPng(res.logo),
    doc.embedPng(res.salutation),
    modele.signaturePresident ? embedImage(modele.signaturePresident) : null,
    modele.signatureTresorier ? embedImage(modele.signatureTresorier) : null,
  ]);

  const page = doc.addPage([A4.w, A4.h]);
  const NAVY = rgb(0.12, 0.11, 0.31);
  const OR = rgb(0.863, 0.686, 0.353);
  const NOIR = rgb(0.04, 0.03, 0.2);

  const texte = (
    s: string,
    x: number,
    base: number,
    font: PDFFont,
    size: number,
    color: RGB = NAVY,
  ) => page.drawText(assainir(s), { x, y: depuisLeHaut(base), size, font, color });
  const largeur = (s: string, font: PDFFont, size: number) => font.widthOfTextAtSize(assainir(s), size);
  const rect = (x: number, top: number, w: number, h: number) =>
    page.drawRectangle({ x, y: depuisLeHaut(top + h), width: w, height: h, color: OR });
  const image = (img: (typeof logo), x: number, top: number, w: number, h: number) =>
    page.drawImage(img, { x, y: depuisLeHaut(top + h), width: w, height: h });

  // ---- Valeurs du don ------------------------------------------------------
  const montant = Number(don.montant);
  const annee = options.annee ?? new Date(don.date_don).getFullYear();
  const numero = (don.recu_numero ?? "").replace(/^RE_/, "");
  const nomComplet = don.est_personne_morale
    ? ""
    : [don.donateur_titre, don.donateur_nom, don.donateur_prenom].filter(Boolean).join(" ");
  const raison = don.est_personne_morale ? (don.raison_sociale ?? don.donateur_nom) : "";
  const sommeLettresCap = capitaliser(montantEnLettres(montant));
  const dateVersement = don.date_affichee ?? formatDate(don.date_don);
  const dateEdition = formatDate(options.dateEdition ?? todayISO());

  // ---- En-tête -------------------------------------------------------------
  image(logo, 78.5, 31.5, 100, 99);

  rect(241.5, 32, 287.5, 21.5);
  const titre = `REÇU FISCAL ${annee}`;
  texte(titre, 241.5 + (287.5 - largeur(titre, regular, 13.5)) / 2, 47.4, regular, 13.5, NOIR);

  texte(ASSOCIATION_NOM, 242.5, 78.7, regular, 10.5);
  texte(modele.adresseRue, 242.5, 93.6, regular, 10.5);
  texte(modele.adresseCpVille, 242.5, 108.5, regular, 10.5);
  texte(`Contact donateurs : ${modele.courrielContact}`, 242.5, 132.8, regular, 10.5);

  rect(67, 150.5, 469, 2.5);

  // ---- Lettre --------------------------------------------------------------
  const fonts = { regular, italic };
  const corps: Style = { size: 8.8, color: NAVY, interligne: 12.22, justifier: true };

  image(salutation, 73.5, 168, 85, 11.5);

  let base = 194.3;
  base += corps.interligne * paragraphe(page, [{ t: LETTRE_INTRO }], fonts, 67, base, 468.5, corps);

  for (const puce of LETTRE_PUCES) {
    // Puce dessinée : celle de Montserrat est trop menue face au modèle.
    page.drawCircle({ x: 75.6, y: depuisLeHaut(base - 2.4), size: 1.35, color: NAVY });
    base += corps.interligne * paragraphe(page, puce, fonts, 82, base, 453.5, corps);
  }

  base += corps.interligne; // ligne blanche
  texte(LETTRE_FIN, 67.5, base, regular, 8.8);

  const president = `${modele.presidentNom}, Président de l'ARIL`;
  texte(
    president,
    533.5 - largeur(president, regular, 9.3),
    378,
    regular,
    9.3,
  );
  if (signPresident) image(signPresident, 366, 381, 67.5, 31);

  page.drawLine({
    start: { x: 66, y: depuisLeHaut(421.25) },
    end: { x: 536.5, y: depuisLeHaut(421.25) },
    thickness: 2.5,
    color: OR,
    dashArray: [16, 3.75],
  });

  // ---- Bloc reçu -----------------------------------------------------------
  texte("REÇU FISCAL", 54, 446.5, semi, 13.5, NOIR);
  texte("N°RE_", 368, 446.5, semi, 13.5, NOIR);
  texte(numero, 417.5, 446.5, regular, 13.5, NOIR);

  const pas = 11.85;
  const LBL = 8.7;
  const VAL = 9;

  // Colonne gauche : le bénéficiaire.
  let g = 471;
  texte("Bénéficiaire du versement :", 54.5, g, semi, LBL);
  texte(ASSOCIATION_NOM, 54.5, (g += pas), regular, VAL);
  texte(modele.adresseRue, 54.5, (g += pas), regular, VAL);
  texte(modele.adresseCpVille, 54.5, (g += pas), regular, VAL);
  texte("Loi Association 1901.", 54.5, (g += 2 * pas), regular, VAL);

  // Colonne droite : le donateur. Valeur à la suite de l'étiquette.
  const champ = (etiquette: string, valeur: string, top: number) => {
    texte(etiquette, 314.5, top, regular, LBL);
    if (valeur) texte(valeur, 314.5 + largeur(etiquette, regular, LBL) + 3, top, regular, VAL, NOIR);
  };
  let d = 471.5;
  texte("Donateur :", 314.5, d, semi, LBL);
  champ("Nom/Prénom :", nomComplet, (d += pas));
  champ("ou Raison Sociale :", raison, (d += pas));
  champ("Adresse :", don.adresse ?? "", (d += 2 * pas));
  champ("CP/ Ville :", don.cp_ville ?? "", (d += pas));

  // ---- Cases or ------------------------------------------------------------
  rect(52.5, 540.5, 243.5, 66.5);
  rect(300, 540.5, 239.5, 66.5);
  rect(53.5, 611, 242.5, 32.5);
  rect(300, 611, 239.5, 32.5);
  rect(53.5, 647.5, 242.5, 32.5);
  rect(300, 647.5, 239.5, 32.5);

  paragraphe(page, [{ t: ATTESTATION }], fonts, 56, 553.2, 235, {
    size: LBL,
    color: NOIR,
    interligne: 11.83,
    justifier: true,
  });

  const somme = (etiquette: string, valeur: string, top: number) => {
    texte(etiquette, 317, top, regular, LBL, NOIR);
    texte(valeur, 317 + largeur(etiquette, regular, LBL) + 4, top, regular, VAL, NOIR);
  };
  somme("Somme en € :", formatEuros(montant), 563.6);
  somme("Somme en lettres :", sommeLettresCap, 588.2);

  texte("Date du versement :", 57.5, 630.6, regular, LBL, NOIR);
  texte(dateVersement, 323.5, 627.8, regular, VAL, NOIR);

  texte("Mode de versement :", 57.5, 666.6, regular, LBL, NOIR);
  texte(capitaliser(don.mode_paiement ?? ""), 323.5, 665.8, regular, VAL, NOIR);

  // ---- Pied ----------------------------------------------------------------
  const tresorier = `${modele.tresorierNom}, Trésorier de l'ARIL`;
  texte(tresorier, 450 - largeur(tresorier, regular, 8.3), 704, regular, 8.3, NOIR);
  if (signTresorier) image(signTresorier, 348.5, 711.5, 109, 37.5);

  const etiqDate = "Date d'édition et signature :";
  texte(etiqDate, 82, 734, semi, 7.8);
  texte(dateEdition, 82 + largeur(etiqDate, semi, 7.8) + 6, 734, regular, VAL, NOIR);

  paragraphe(page, [{ t: MENTION_LEGALE }], fonts, 81.5, 766.5, 434, {
    size: 7,
    color: NAVY,
    interligne: 9.5,
    justifier: true,
  });

  doc.setTitle(`Reçu fiscal ${numero || ""}`.trim());
  doc.setAuthor("ARIL");
  doc.setProducer("Préau");

  return doc.save();
}

/**
 * Numéro court d'un reçu : les quatre derniers chiffres de la séquence.
 * « RE_000228_20260604 » → « 0228 » ; « RE_00025_20241114 » → « 0025 ».
 */
export function numeroCourt(recuNumero: string | null): string | null {
  const m = (recuNumero ?? "").match(/^RE_(\d+)/);
  return m ? m[1].slice(-4).padStart(4, "0") : null;
}

/** Nom de fichier : « Reçu fiscal N°0228 - Nom Prénom.pdf » (raison sociale pour une entreprise). */
export function nomFichierRecu(don: DonPourRecu): string {
  const propre = (s: string | null | undefined) =>
    (s ?? "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  const qui = don.est_personne_morale
    ? propre(don.raison_sociale ?? don.donateur_nom)
    : propre(`${don.donateur_nom ?? ""} ${don.donateur_prenom ?? ""}`);
  const num = numeroCourt(don.recu_numero);
  return `Reçu fiscal ${num ? `N°${num}` : "sans numéro"} - ${qui || "donateur"}.pdf`;
}

/** Construit le PDF et déclenche son téléchargement. */
export async function genererRecuPdf(don: DonPourRecu, options: OptionsRecu = {}): Promise<void> {
  const modele = options.modele ?? (await modeleRecuEnCache(createClient()));
  const octets = await construireRecuPdf(don, { ...options, modele });
  const blob = new Blob([octets as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichierRecu(don);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

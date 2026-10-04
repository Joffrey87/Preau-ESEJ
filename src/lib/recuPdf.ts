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
import { syntheseVersements } from "@/lib/recuVersements";
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

// Mention légale adaptée au donateur : article 200 du CGI pour un particulier,
// article 238 bis pour une personne morale (entreprise, association…).
const MENTION_PARTICULIER =
  "Le bénéficiaire certifie sur l'honneur que les dons et versements qu'il reçoit ouvrent droit à la réduction d'impôt prévue à l'article 200 du CGI (impôt sur le revenu des particuliers).";
const MENTION_PERSONNE_MORALE =
  "Le bénéficiaire certifie sur l'honneur que les dons et versements qu'il reçoit ouvrent droit à la réduction d'impôt prévue à l'article 238 bis du CGI (impôt sur les sociétés ou impôt sur le revenu des entreprises).";

/** Forme et nature du don, mentions du modèle CERFA n° 11580. */
const FORME_NATURE = "Forme du don : déclaration de don manuel · Nature du don : numéraire";

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

export function chargerRessources(): Promise<Ressources> {
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
export function assainir(s: string): string {
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
  /** Ouvrir le PDF dans un nouvel onglet du navigateur au lieu de le télécharger. */
  ouvrir?: boolean;
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
  // « Reçu fiscal AAAA » ne couvre que les dons de l'année AAAA.
  const anneesDons = [...new Set((don.versements?.length ? don.versements.map((v) => v.date) : [don.date_don]).map((d) => d.slice(0, 4)))];
  if (anneesDons.length > 1) {
    throw new Error(`Un reçu fiscal ne peut couvrir qu'une seule année civile (ici ${anneesDons.sort().join(" et ")}) : scindez-le.`);
  }
  const annee = options.annee ?? Number(anneesDons[0]);
  const numero = (don.recu_numero ?? "").replace(/^RE_/, "");
  const pm = don.est_personne_morale;
  const identite = [don.donateur_titre, don.donateur_nom, don.donateur_prenom].filter(Boolean).join(" ");
  const raison = pm ? (don.raison_sociale ?? don.donateur_nom) : "";
  const sommeLettresCap = capitaliser(montantEnLettres(montant));
  const dateEdition = formatDate(options.dateEdition ?? don.date_edition ?? todayISO());
  // Détail des dons couverts : chaque don, les dons réguliers synthétisés.
  const lignesVersements = syntheseVersements(
    don.versements && don.versements.length > 0
      ? don.versements
      : [{ date: don.date_don, montant, mode: don.mode_paiement }],
  );

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
  texte("Bénéficiaire du versement", 54.5, g, semi, LBL);
  texte(ASSOCIATION_NOM, 54.5, (g += pas), regular, VAL);
  texte(modele.adresseRue, 54.5, (g += pas), regular, VAL);
  texte(modele.adresseCpVille, 54.5, (g += pas), regular, VAL);
  texte("Loi Association 1901.", 54.5, (g += 2 * pas), regular, VAL);

  // Colonne droite : le donateur, sans intitulés de rubriques (seulement le contenu).
  // Particulier : nom et prénom. Personne morale : raison sociale, puis le contact
  // à qui le reçu est adressé.
  const ligne = (valeur: string, top: number) => {
    if (valeur) texte(valeur, 314.5, top, regular, VAL, NOIR);
  };
  let d = 471.5;
  texte("Donateur", 314.5, d, semi, LBL);
  if (pm) {
    ligne(raison ?? "", (d += pas));
    // Le contact n'est mentionné que s'il est renseigné et distinct de la raison sociale.
    // Il se lit « À l'attention de Prénom Nom » ; un titre qui répète l'organisme (donnée
    // mal saisie) ou qui n'est pas une civilité courte est écarté.
    const plat = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const titreContact = don.donateur_titre && don.donateur_titre.trim().length <= 15 && plat(don.donateur_titre) !== plat(raison ?? "") ? don.donateur_titre.trim() : "";
    const contact = [titreContact, don.donateur_prenom, don.donateur_nom].filter((x) => x && x.trim()).join(" ");
    const contactDistinct = plat(don.donateur_nom ?? "") !== "" && plat(don.donateur_nom ?? "") !== plat(raison ?? "") && plat(contact) !== plat(raison ?? "");
    if (contactDistinct) ligne(`À l'attention de ${contact}`, (d += pas));
  } else {
    ligne(identite, (d += pas));
  }
  ligne(don.adresse ?? "", (d += pas));
  ligne(don.cp_ville ?? "", (d += pas));

  // ---- Cases or ------------------------------------------------------------
  rect(52.5, 540.5, 243.5, 66.5);
  rect(300, 540.5, 239.5, 66.5);

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

  // ---- Détail des versements ------------------------------------------------
  // Un cadre pleine largeur remplace « date » et « mode » : un reçu peut couvrir
  // plusieurs dons. Au-delà de ce que la page contient, le détail passe en annexe.
  const LIGNE = 11;
  const MAX_LIGNES = 7;
  const avecTotal = lignesVersements.length > 1;
  const nbAffichables = lignesVersements.length + (avecTotal ? 1 : 0);
  const enAnnexe = nbAffichables > MAX_LIGNES;
  const lignesCadre = enAnnexe ? lignesVersements.slice(0, MAX_LIGNES - 2) : lignesVersements;
  const nbLignesCadre = lignesCadre.length + (enAnnexe ? 1 : 0) + (avecTotal ? 1 : 0);
  // Une ligne de plus en pied de cadre : forme et nature du don.
  const hauteurCadre = 20 + nbLignesCadre * LIGNE + 4 + (LIGNE + 4);
  rect(53.5, 611, 486, hauteurCadre);

  texte(lignesVersements.length > 1 ? "Versements :" : "Versement :", 57.5, 623.6, semi, LBL, NOIR);
  let v = 623.6;
  for (const l of lignesCadre) {
    v += LIGNE;
    texte(l.libelle, 64, v, regular, VAL, NOIR);
    const m = formatEuros(l.montant);
    texte(m, 532 - largeur(m, regular, VAL), v, regular, VAL, NOIR);
  }
  if (enAnnexe) {
    v += LIGNE;
    const reste = lignesVersements.length - lignesCadre.length;
    texte(`… et ${reste} autre${reste > 1 ? "s" : ""} versement${reste > 1 ? "s" : ""} : détail en annexe`, 64, v, italic, VAL, NOIR);
  }
  if (avecTotal) {
    v += LIGNE;
    const t = formatEuros(montant);
    texte("Total", 64, v, semi, VAL, NOIR);
    texte(t, 532 - largeur(t, semi, VAL), v, semi, VAL, NOIR);
  }
  // Pied du cadre : un filet fin puis forme et nature du don, à la taille des valeurs.
  v += 4;
  page.drawLine({
    start: { x: 57.5, y: depuisLeHaut(v) },
    end: { x: 535.5, y: depuisLeHaut(v) },
    thickness: 0.5,
    color: NAVY,
    opacity: 0.35,
  });
  v += LIGNE;
  texte(FORME_NATURE, 64, v, regular, VAL, NOIR);

  // Le pied descend d'autant que le cadre dépasse la hauteur du modèle (69 pt).
  const decalage = Math.max(0, 611 + hauteurCadre - 680);

  // ---- Pied ----------------------------------------------------------------
  const tresorier = `${modele.tresorierNom}, Trésorier de l'ARIL`;
  texte(tresorier, 450 - largeur(tresorier, regular, 8.3), 704 + decalage, regular, 8.3, NOIR);
  if (signTresorier) image(signTresorier, 348.5, 711.5 + decalage, 109, 37.5);

  const etiqDate = "Date d'édition et signature :";
  texte(etiqDate, 82, 734 + decalage, semi, 7.8);
  texte(dateEdition, 82 + largeur(etiqDate, semi, 7.8) + 6, 734 + decalage, regular, VAL, NOIR);

  paragraphe(page, [{ t: pm ? MENTION_PERSONNE_MORALE : MENTION_PARTICULIER }], fonts, 81.5, 766.5 + decalage, 434, {
    size: 7,
    color: NAVY,
    interligne: 9.5,
    justifier: true,
  });

  // ---- Annexe : détail complet quand il ne tient pas sur la page ------------
  if (enAnnexe) {
    const annexe = doc.addPage([A4.w, A4.h]);
    const t2 = (s2: string, x: number, top: number, font: PDFFont, size: number) =>
      annexe.drawText(assainir(s2), { x, y: depuisLeHaut(top), size, font, color: NOIR });
    t2(`Annexe au reçu fiscal N°RE_${numero} — détail des versements`, 54, 60, semi, 11);
    t2(pm ? `Donateur : ${raison ?? ""}` : `Donateur : ${identite}`, 54, 80, regular, VAL);
    let y = 110;
    for (const l of lignesVersements) {
      if (y > 800) break;
      t2(l.libelle, 60, y, regular, VAL);
      const m = formatEuros(l.montant);
      t2(m, 535 - semi.widthOfTextAtSize(assainir(m), VAL), y, regular, VAL);
      y += 13;
    }
    y += 6;
    const tt = formatEuros(montant);
    t2("Total", 60, y, semi, VAL);
    t2(tt, 535 - semi.widthOfTextAtSize(assainir(tt), VAL), y, semi, VAL);
  }

  doc.setTitle(titreRecu(don));
  doc.setAuthor("ARIL");
  doc.setProducer("Préau");

  return doc.save();
}

/**
 * Numéro court d'un reçu : les quatre derniers chiffres de la séquence.
 * « RE_000228_20260604 » → « 0228 » ; « RE_00025_20241114 » → « 0025 ».
 */
export function numeroCourt(recuNumero: string | null): string | null {
  const m = (recuNumero ?? "").match(/^RE_(\d+)(?:_|$)/);
  if (m) return m[1].slice(-4).padStart(4, "0");
  // Numéro saisi à la main hors format (ex. « RE_20260324-0604 ») : repris tel quel.
  return recuNumero?.startsWith("RE_") ? recuNumero.slice(3) : null;
}

/**
 * Nom du reçu : « Reçu fiscal 2026 - N°0207 - EXEMPLE Marie » (avec « .pdf » pour le fichier).
 * L'année est celle des dons, le numéro est abrégé (quatre derniers chiffres de la séquence),
 * le donateur est écrit NOM Prénom, ou sa raison sociale pour une entreprise.
 */
export function titreRecu(don: DonPourRecu): string {
  const propre = (t: string | null | undefined) =>
    (t ?? "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  // Certaines fiches ont le nom de la structure dans le champ « titre » (nom et prénom vides) :
  // on s'en sert plutôt que d'écrire « donateur ».
  const nomPropre = propre(`${(don.donateur_nom ?? "").toLocaleUpperCase("fr-FR")} ${don.donateur_prenom ?? ""}`);
  const qui = don.est_personne_morale
    ? propre(don.raison_sociale) || propre(don.donateur_nom) || propre(don.donateur_titre)
    : nomPropre || propre(don.raison_sociale) || propre(don.donateur_titre);
  const dates = don.versements?.length ? don.versements.map((v) => v.date) : [don.date_don];
  const annee = dates.map((d) => d.slice(0, 4)).sort()[0];
  const num = numeroCourt(don.recu_numero);
  return `Reçu fiscal ${annee} - ${num ? `N°${num}` : "sans numéro"} - ${qui || "donateur"}`;
}

/** Nom du fichier PDF d'un reçu. */
export function nomFichierRecu(don: DonPourRecu): string {
  return `${titreRecu(don)}.pdf`;
}

/**
 * Adresse locale portant le nom du fichier (servie par `public/recu-sw.js` depuis le cache du
 * navigateur) : « Enregistrer » dans l'onglet propose alors le bon nom. Retourne null si le
 * navigateur ne le permet pas (on retombe sur une adresse anonyme).
 */
async function adresseNommee(octets: Uint8Array, nom: string): Promise<string | null> {
  try {
    if (!("serviceWorker" in navigator) || !("caches" in window)) return null;
    // Ancienne inscription à portée réduite : remplacée par une inscription couvrant le site (le
    // script ne répond qu'aux adresses /recu-local/), pour que cette page puisse vérifier le service.
    for (const r of await navigator.serviceWorker.getRegistrations()) {
      if (r.scope.endsWith("/recu-local/")) await r.unregister();
    }
    const reg = await navigator.serviceWorker.register("/recu-sw.js");
    const sw = reg.active ?? reg.waiting ?? reg.installing;
    if (!sw) return null;
    if (sw.state !== "activated") {
      await new Promise<void>((ok, ko) => {
        const t = setTimeout(() => ko(new Error("service worker trop long")), 5000);
        sw.addEventListener("statechange", () => {
          if (sw.state === "activated") {
            clearTimeout(t);
            ok();
          }
        });
      });
    }
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((ok) => {
        const t = setTimeout(ok, 3000);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          clearTimeout(t);
          ok();
        }, { once: true });
      });
    }
    const cache = await caches.open("recu-local");
    // Les reçus contiennent des données personnelles : on ne garde que le dernier, et pas longtemps.
    for (const k of await cache.keys()) await cache.delete(k);
    const chemin = `/recu-local/${crypto.randomUUID()}/${encodeURIComponent(nom)}`;
    await cache.put(
      chemin,
      new Response(octets as BlobPart, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nom)}`,
        },
      }),
    );
    // Vérification : l'adresse doit bien renvoyer le PDF (sinon l'onglet recevrait une page web).
    const essai = await fetch(chemin);
    if (!essai.ok || !(essai.headers.get("content-type") ?? "").includes("pdf")) {
      await cache.delete(chemin);
      return null;
    }
    setTimeout(() => void cache.delete(chemin), 10 * 60_000);
    return `${location.origin}${chemin}`;
  } catch {
    return null;
  }
}

/**
 * Construit le PDF puis le télécharge — ou, avec `ouvrir`, l'affiche dans un
 * nouvel onglet. L'onglet est ouvert tout de suite (dans le geste de l'utilisateur,
 * sinon le navigateur bloque la fenêtre) puis dirigé vers le PDF une fois prêt ;
 * s'il est bloqué, on retombe sur le téléchargement.
 */
export async function genererRecuPdf(don: DonPourRecu, options: OptionsRecu = {}): Promise<void> {
  const onglet = options.ouvrir ? window.open("", "_blank") : null;
  let url: string;
  let nommee: string | null = null;
  try {
    const modele = options.modele ?? (await modeleRecuEnCache(createClient()));
    const octets = await construireRecuPdf(don, { ...options, modele });
    if (onglet) nommee = await adresseNommee(octets, nomFichierRecu(don));
    url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
  } catch (e) {
    onglet?.close();
    throw e;
  }
  if (onglet) {
    onglet.location.href = nommee ?? url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichierRecu(don);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

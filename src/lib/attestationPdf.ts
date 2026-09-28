// Attestation de paiement : une par versement (mensualité, frais de dossier,
// mois d'avance, activité), que le versement vienne de la famille ou d'un
// tiers qui prend en charge sa scolarité (Amitié Sainte-Anne…). Ce n'est pas
// un reçu fiscal : les frais de scolarité n'ouvrent pas droit à réduction.
//
// Même charte que le reçu fiscal (Montserrat, logo, or et marine), une page A4.

import type { PDFFont } from "pdf-lib";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { montantEnLettres } from "@/lib/lettres";
import { chargerRessources, assainir } from "@/lib/recuPdf";

export type NatureAttestee = "mensualite" | "frais_dossier" | "mois_avance" | "don_association" | "activite";

export type Attestation = {
  famille: string;
  annee_scolaire: string;
  nature: NatureAttestee;
  /** Pour une activité : son titre. */
  intitule?: string | null;
  montant: number;
  date: string;
  mode?: string | null;
  /** « Famille », « Amitié Sainte-Anne », « Association »… */
  origine: string;
  /** Enfant concerné (initiale ou prénom), pour une activité. */
  enfant?: string | null;
};

export type EnteteAttestation = {
  adresseRue: string;
  adresseCpVille: string;
  tresorierNom: string;
  courrielContact: string;
  signatureTresorier?: ArrayBuffer | null;
};

const OBJET: Record<NatureAttestee, string> = {
  mensualite: "des frais de scolarité",
  don_association: "des frais de scolarité",
  frais_dossier: "des frais de dossier (inscription)",
  mois_avance: "du mois d'avance (dépôt de garantie)",
  activite: "de l'activité",
};

const MODES: Record<string, string> = {
  virement: "virement", prelevement: "prélèvement", cheque: "chèque", carte: "carte bancaire", especes: "espèces",
};

export async function construireAttestationPdf(a: Attestation, entete: EnteteAttestation): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, { default: fontkit }, res] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    chargerRessources(),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semi] = await Promise.all([
    doc.embedFont(res.regular, { subset: true }),
    doc.embedFont(res.semi, { subset: true }),
  ]);
  const logo = await doc.embedPng(res.logo);
  const signature = entete.signatureTresorier
    ? await (new Uint8Array(entete.signatureTresorier.slice(0, 2))[0] === 0xff
        ? doc.embedJpg(entete.signatureTresorier)
        : doc.embedPng(entete.signatureTresorier))
    : null;

  const W = 595.28, H = 841.89;
  const page = doc.addPage([W, H]);
  const NAVY = rgb(0.12, 0.11, 0.31), OR = rgb(0.863, 0.686, 0.353), NOIR = rgb(0.04, 0.03, 0.2);
  const y = (top: number) => H - top;
  const texte = (s: string, x: number, top: number, font: PDFFont, size: number, color = NAVY) =>
    page.drawText(assainir(s), { x, y: y(top), size, font, color });
  const largeur = (s: string, font: PDFFont, size: number) => font.widthOfTextAtSize(assainir(s), size);

  /** Paragraphe justifié à gauche, retour à la ligne automatique ; renvoie la hauteur. */
  const paragraphe = (s: string, x: number, top: number, w: number, font: PDFFont, size: number, pas = size * 1.45) => {
    const mots = assainir(s).split(/\s+/);
    let ligne = "", t = top;
    for (const m of mots) {
      const essai = ligne ? `${ligne} ${m}` : m;
      if (font.widthOfTextAtSize(essai, size) > w && ligne) {
        page.drawText(ligne, { x, y: y(t), size, font, color: NOIR });
        t += pas;
        ligne = m;
      } else ligne = essai;
    }
    if (ligne) page.drawText(ligne, { x, y: y(t), size, font, color: NOIR });
    return t - top + pas;
  };

  // En-tête
  page.drawImage(logo, { x: 70, y: y(40 + 90), width: 91, height: 90 });
  page.drawRectangle({ x: 230, y: y(40 + 22), width: 300, height: 22, color: OR });
  const titre = "ATTESTATION DE PAIEMENT";
  texte(titre, 230 + (300 - largeur(titre, regular, 13)) / 2, 56, regular, 13, NOIR);
  texte("ARIL - Association Rémoise pour l'Instruction Libre", 231, 86, regular, 10);
  texte("École du Saint-Enfant-Jésus", 231, 100, regular, 10);
  texte(entete.adresseRue, 231, 114, regular, 10);
  texte(entete.adresseCpVille, 231, 128, regular, 10);
  texte(`Contact : ${entete.courrielContact}`, 231, 146, regular, 9.5);
  page.drawRectangle({ x: 67, y: y(165 + 2.5), width: 469, height: 2.5, color: OR });

  // Corps
  const mode = a.mode ? MODES[a.mode] ?? a.mode : null;
  const objet =
    a.nature === "activite"
      ? `de l'activité « ${a.intitule ?? ""} »${a.enfant ? ` (${a.enfant})` : ""}`
      : `${OBJET[a.nature]} de l'année scolaire ${a.annee_scolaire}`;
  let top = 210;
  top += paragraphe(
    `L'Association Rémoise pour l'Instruction Libre (ARIL), qui gère l'École du Saint-Enfant-Jésus, atteste avoir reçu la somme de ${formatEuros(a.montant)} (${montantEnLettres(a.montant)}), le ${formatDate(a.date)}${mode ? `, par ${mode}` : ""}, au titre ${objet}, pour la famille ${a.famille}.`,
    70, top, 455, regular, 11,
  );
  if (a.origine && a.origine !== "Famille") {
    top += 6;
    top += paragraphe(
      `Ce versement a été effectué par ${a.origine === "Amitié Sainte-Anne" ? "l'Amitié Sainte-Anne" : "une association"}, qui prend en charge tout ou partie des frais de scolarité de la famille.`,
      70, top, 455, regular, 11,
    );
  }

  // Cadre récapitulatif
  top += 18;
  page.drawRectangle({ x: 67, y: y(top + 74), width: 469, height: 74, color: rgb(0.97, 0.95, 0.9), borderColor: OR, borderWidth: 1 });
  const lignes: [string, string][] = [
    ["Famille", a.famille],
    ["Objet", a.nature === "activite" ? `Activité « ${a.intitule ?? ""} »` : `${OBJET[a.nature].replace(/^de[s]? (l')?/, "")} ${a.annee_scolaire}`],
    ["Montant", `${formatEuros(a.montant)} — versé le ${formatDate(a.date)}${mode ? ` par ${mode}` : ""}`],
    ["Payé par", a.origine === "Famille" ? "la famille" : a.origine],
  ];
  lignes.forEach(([l, v], k) => {
    texte(`${l} :`, 80, top + 18 + k * 15, semi, 9.5, NOIR);
    texte(v, 160, top + 18 + k * 15, regular, 9.5, NOIR);
  });
  top += 74 + 34;

  texte(`Fait à Reims, le ${formatDate(todayISO())}.`, 70, top, regular, 10.5, NOIR);
  const sign = `${entete.tresorierNom}, Trésorier de l'ARIL`;
  texte(sign, 525 - largeur(sign, regular, 10), top + 30, regular, 10, NOIR);
  if (signature) page.drawImage(signature, { x: 395, y: y(top + 40 + 40), width: 110, height: 38 });

  page.drawText(
    assainir("Cette attestation justifie un paiement ; elle ne constitue pas un reçu fiscal (les frais de scolarité n'ouvrent pas droit à réduction d'impôt)."),
    { x: 70, y: y(790), size: 7.5, font: regular, color: NAVY, maxWidth: 455, lineHeight: 10 },
  );

  doc.setTitle(`Attestation de paiement — ${a.famille}`);
  doc.setAuthor("ARIL");
  doc.setProducer("Préau");
  return doc.save();
}

/** Construit l'attestation et déclenche son téléchargement. */
export async function telechargerAttestation(a: Attestation, entete: EnteteAttestation): Promise<void> {
  const octets = await construireAttestationPdf(a, entete);
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `Attestation de paiement - ${a.famille} - ${a.date}.pdf`.replace(/[\\/:*?"<>|]/g, "");
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

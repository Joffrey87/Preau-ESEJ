// Facture de frais de scolarité : une par paiement reçu (écriture de Comptabilité), éditée par la famille ou le bureau.
// Numéro AAAAMMJJ-n attribué par la base à la première édition (fonction `facture_operation`) ; ce fichier ne fait que la
// mise en page. Le mois d'avance est un dépôt de garantie : listé à part, hors prestations.
//
// Même charte que le reçu fiscal (Montserrat, logo, or et marine), une page A4.

import type { PDFFont } from "pdf-lib";
import { formatEuros, formatDate } from "@/lib/format";
import { chargerRessources, assainir } from "@/lib/recuPdf";

export type LigneFacture = {
  nature: "mensualite" | "don_association" | "frais_dossier" | "mois_avance";
  montant: number;
  annee: string;
};

export type Facture = {
  numero: string;
  date_edition: string;
  date_paiement: string;
  mode: string | null;
  numero_operation: number | null;
  annee_scolaire: string | null;
  total: number;
  lignes: LigneFacture[];
  famille: { nom: string; parent1: string | null; parent2: string | null; adresse: string | null; cp_ville: string | null };
  association: { adresse_rue: string; adresse_cp_ville: string; tresorier_nom: string; courriel_contact: string; siret?: string | null } | null;
};

const MODES: Record<string, string> = {
  virement: "virement", prelevement: "prélèvement", cheque: "chèque", carte: "carte bancaire", especes: "espèces",
};

const estDepot = (l: LigneFacture) => l.nature === "mois_avance";

const designation = (l: LigneFacture) =>
  l.nature === "frais_dossier"
    ? `Frais de dossier (inscription) — année scolaire ${l.annee}`
    : l.nature === "mois_avance"
      ? `Dépôt de garantie (mois d'avance) — année scolaire ${l.annee}. Somme encaissée en garantie, imputée sur le dernier mois de scolarité ou restituée : hors prestation.`
      : `Frais de scolarité — année scolaire ${l.annee}`;

export async function construireFacturePdf(f: Facture): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, { default: fontkit }, res] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
    chargerRessources(),
  ]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semi] = await Promise.all([doc.embedFont(res.regular, { subset: true }), doc.embedFont(res.semi, { subset: true })]);
  const logo = await doc.embedPng(res.logo);

  const W = 595.28, H = 841.89;
  const page = doc.addPage([W, H]);
  const NAVY = rgb(0.12, 0.11, 0.31), OR = rgb(0.863, 0.686, 0.353), NOIR = rgb(0.04, 0.03, 0.2);
  const y = (top: number) => H - top;
  const texte = (s: string, x: number, top: number, font: PDFFont, size: number, color = NAVY) =>
    page.drawText(assainir(s), { x, y: y(top), size, font, color });
  const largeur = (s: string, font: PDFFont, size: number) => font.widthOfTextAtSize(assainir(s), size);
  const droite = (s: string, xDroite: number, top: number, font: PDFFont, size: number, color = NOIR) =>
    texte(s, xDroite - largeur(s, font, size), top, font, size, color);
  const paragraphe = (s: string, x: number, top: number, w: number, font: PDFFont, size: number, color = NOIR, pas = size * 1.4) => {
    const mots = assainir(s).split(/\s+/);
    let ligne = "", t = top;
    for (const m of mots) {
      const essai = ligne ? `${ligne} ${m}` : m;
      if (font.widthOfTextAtSize(essai, size) > w && ligne) {
        page.drawText(ligne, { x, y: y(t), size, font, color });
        t += pas;
        ligne = m;
      } else ligne = essai;
    }
    if (ligne) page.drawText(ligne, { x, y: y(t), size, font, color });
    return t - top + pas;
  };

  const a = f.association;
  // En-tête
  page.drawImage(logo, { x: 70, y: y(40 + 90), width: 91, height: 90 });
  page.drawRectangle({ x: 230, y: y(40 + 22), width: 300, height: 22, color: OR });
  const titre = "FACTURE";
  texte(titre, 230 + (300 - largeur(titre, regular, 13)) / 2, 56, regular, 13, NOIR);
  texte("ARIL - Association Rémoise pour l'Instruction Libre", 231, 86, regular, 10);
  texte("École du Saint-Enfant-Jésus", 231, 100, regular, 10);
  texte(a?.adresse_rue ?? "", 231, 114, regular, 10);
  texte(a?.adresse_cp_ville ?? "", 231, 128, regular, 10);
  texte(`Contact : ${a?.courriel_contact ?? ""}${a?.siret ? ` · SIRET ${a.siret}` : ""}`, 231, 146, regular, 9.5);
  page.drawRectangle({ x: 67, y: y(165 + 2.5), width: 469, height: 2.5, color: OR });

  // Références et destinataire
  texte(`Facture n° ${f.numero}`, 70, 200, semi, 12, NOIR);
  texte(`Date d'édition : ${formatDate(f.date_edition)}`, 70, 218, regular, 10, NOIR);
  texte(`Date du paiement : ${formatDate(f.date_paiement)}`, 70, 232, regular, 10, NOIR);
  if (f.numero_operation != null) texte(`Opération comptable n° ${f.numero_operation}`, 70, 246, regular, 10, NOIR);

  const parents = [f.famille.parent1, f.famille.parent2].filter(Boolean).join(" et ");
  page.drawRectangle({ x: 315, y: y(196 + 88), width: 221, height: 88, borderColor: OR, borderWidth: 1 });
  texte("Facturé à", 325, 212, semi, 9, NAVY);
  texte(`Famille ${f.famille.nom}`, 325, 227, semi, 10.5, NOIR);
  let ligneClient = 241;
  if (parents) {
    texte(parents, 325, ligneClient, regular, 9.5, NOIR);
    ligneClient += 13;
  }
  if (f.famille.adresse) {
    texte(f.famille.adresse, 325, ligneClient, regular, 9.5, NOIR);
    ligneClient += 13;
  }
  if (f.famille.cp_ville) texte(f.famille.cp_ville, 325, ligneClient, regular, 9.5, NOIR);

  // Détail
  let top = 300;
  page.drawRectangle({ x: 67, y: y(top + 18), width: 469, height: 18, color: rgb(0.97, 0.95, 0.9) });
  texte("Désignation", 72, top + 12.5, semi, 9.5, NOIR);
  droite("Montant", 531, top + 12.5, semi, 9.5);
  top += 30;
  for (const l of f.lignes) {
    const h = paragraphe(designation(l), 72, top, 370, regular, 9.5);
    droite(formatEuros(l.montant), 531, top, regular, 9.5);
    top += Math.max(h, 16) + 4;
    page.drawRectangle({ x: 67, y: y(top - 2), width: 469, height: 0.5, color: rgb(0.85, 0.82, 0.75) });
    top += 6;
  }

  // Totaux
  const prestations = f.lignes.filter((l) => !estDepot(l)).reduce((s, l) => s + Number(l.montant), 0);
  const depot = f.lignes.filter(estDepot).reduce((s, l) => s + Number(l.montant), 0);
  top += 8;
  if (depot > 0 && prestations > 0) {
    texte("Prestations facturées", 290, top, regular, 10, NOIR);
    droite(formatEuros(prestations), 531, top, regular, 10);
    top += 16;
    texte("Dépôt de garantie (hors prestation)", 290, top, regular, 10, NOIR);
    droite(formatEuros(depot), 531, top, regular, 10);
    top += 16;
  }
  page.drawRectangle({ x: 320, y: y(top + 24), width: 216, height: 24, color: OR });
  texte("TOTAL PAYÉ", 330, top + 16, semi, 10.5, NOIR);
  droite(formatEuros(f.total), 531, top + 16, semi, 10.5);
  top += 44;

  const mode = f.mode ? (MODES[f.mode] ?? f.mode) : null;
  top += paragraphe(
    `Facture acquittée : paiement de ${formatEuros(f.total)} reçu le ${formatDate(f.date_paiement)}${mode ? ` par ${mode}` : ""}. Reste à payer : ${formatEuros(0)}.`,
    70, top, 455, regular, 10.5,
  );

  // Mentions
  page.drawText(
    assainir(
      "TVA non applicable — article 261-4-4° du CGI (enseignement). Le dépôt de garantie n'est pas une prestation de services : il n'entre pas dans le chiffre d'affaires de l'association. Facture à conserver ; une réédition porte le même numéro.",
    ),
    { x: 70, y: y(780), size: 7.5, font: regular, color: NAVY, maxWidth: 455, lineHeight: 10 },
  );

  doc.setTitle(`Facture ${f.numero} — famille ${f.famille.nom}`);
  doc.setAuthor("ARIL");
  doc.setProducer("Préau");
  return doc.save();
}

/** Construit la facture et déclenche son téléchargement. */
export async function telechargerFacture(f: Facture): Promise<void> {
  const octets = await construireFacturePdf(f);
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `Facture ${f.numero} - famille ${f.famille.nom}.pdf`.replace(/[\\/:*?"<>|]/g, "");
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}

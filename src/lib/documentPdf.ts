// Outils communs aux documents scolaires en PDF (taux de présentiel, relevé maternelle) : même charte que les
// bulletins, reçus et factures — Montserrat, logo de l'école, marine et or.

import type { PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from "pdf-lib";
import { chargerRessources, assainir } from "@/lib/recuPdf";

export const W = 595.28, H = 841.89, M = 40;

export type Plume = {
  doc: PDFDocument;
  regular: PDFFont;
  semi: PDFFont;
  italic: PDFFont;
  logo: PDFImage;
  c: { NAVY: RGB; OR: RGB; OR_DOUX: RGB; GRIS: RGB; TRAIT: RGB; BLANC: RGB; CREME: RGB };
  page: PDFPage;
  top: number;
  nouvellePage: () => void;
  texte: (str: string, x: number, t: number, font: PDFFont, size: number, color?: RGB) => void;
  largeur: (str: string, font: PDFFont, size: number) => number;
  centre: (str: string, xc: number, t: number, font: PDFFont, size: number, color?: RGB) => void;
  coupe: (str: string, font: PDFFont, size: number, w: number) => string[];
  rect: (x: number, t: number, w: number, h: number, color: RGB) => void;
  cadre: (x: number, t: number, w: number, h: number, bord: RGB, fond?: RGB) => void;
  trait: (t: number) => void;
  /** Saute de page si `h` ne tient plus ; renvoie vrai si une page a été ajoutée. */
  place: (h: number) => boolean;
  /** En-tête de document : logo, école, titre, sous-titre (or). */
  entete: (titre: string, sousTitre?: string) => void;
  /** Pied de page sur toutes les pages, puis octets du PDF. */
  terminer: (pied: string) => Promise<Uint8Array>;
};

export async function creerPlume(): Promise<Plume> {
  const [{ PDFDocument, rgb }, { default: fontkit }, res] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit"), chargerRessources()]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semi, italic] = await Promise.all([
    doc.embedFont(res.regular, { subset: true }),
    doc.embedFont(res.semi, { subset: true }),
    doc.embedFont(res.italic, { subset: true }),
  ]);
  const logo = await doc.embedPng(res.logo);
  const c = {
    NAVY: rgb(0.008, 0.114, 0.318),
    OR: rgb(0.784, 0.584, 0.184),
    OR_DOUX: rgb(0.953, 0.902, 0.788),
    GRIS: rgb(0.42, 0.45, 0.5),
    TRAIT: rgb(0.9, 0.875, 0.808),
    BLANC: rgb(1, 1, 1),
    CREME: rgb(0.969, 0.953, 0.918),
  };
  const p: Plume = {
    doc, regular, semi, italic, logo, c,
    page: doc.addPage([W, H]),
    top: M,
    nouvellePage() {
      p.page = doc.addPage([W, H]);
      p.top = M;
    },
    texte(str, x, t, font, size, color = c.NAVY) {
      p.page.drawText(assainir(str), { x, y: H - t, size, font, color });
    },
    largeur: (str, font, size) => font.widthOfTextAtSize(assainir(str), size),
    centre(str, xc, t, font, size, color = c.NAVY) {
      p.texte(str, xc - p.largeur(str, font, size) / 2, t, font, size, color);
    },
    coupe(str, font, size, w) {
      const sortie: string[] = [];
      for (const para of str.split(/\n+/)) {
        let ligne = "";
        for (const mot of assainir(para).split(/\s+/).filter(Boolean)) {
          const essai = ligne ? `${ligne} ${mot}` : mot;
          if (font.widthOfTextAtSize(essai, size) > w && ligne) {
            sortie.push(ligne);
            ligne = mot;
          } else ligne = essai;
        }
        if (ligne) sortie.push(ligne);
      }
      return sortie;
    },
    rect(x, t, w, h, color) {
      p.page.drawRectangle({ x, y: H - t - h, width: w, height: h, color });
    },
    cadre(x, t, w, h, bord, fond) {
      p.page.drawRectangle({ x, y: H - t - h, width: w, height: h, borderColor: bord, borderWidth: 0.8, color: fond });
    },
    trait(t) {
      p.page.drawLine({ start: { x: M, y: H - t }, end: { x: W - M, y: H - t }, thickness: 0.5, color: c.TRAIT });
    },
    place(h) {
      if (p.top + h <= H - M - 10) return false;
      p.nouvellePage();
      return true;
    },
    entete(titre, sousTitre) {
      p.page.drawImage(logo, { x: M, y: H - (p.top + 62), width: 63, height: 62 });
      const gx = M + 76;
      p.texte("École du Saint-Enfant-Jésus", gx, p.top + 16, semi, 13);
      p.texte(titre, gx, p.top + 33, regular, 10, c.GRIS);
      if (sousTitre) p.texte(sousTitre, gx, p.top + 50, semi, 10.5, c.OR);
      p.top += 76;
    },
    async terminer(pied) {
      const pages = doc.getPages();
      pages.forEach((pg, i) => {
        const t = `${pied}${pages.length > 1 ? ` — page ${i + 1}/${pages.length}` : ""}`;
        pg.drawText(assainir(t), { x: M, y: 22, size: 7, font: regular, color: c.GRIS });
      });
      return doc.save();
    },
  };
  return p;
}

/** Télécharge des octets PDF sous un nom de fichier. */
export function telechargerPdf(octets: Uint8Array, nom: string) {
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nom.replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

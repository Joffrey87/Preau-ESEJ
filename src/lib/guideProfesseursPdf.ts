// Guide Professeurs en PDF (A4) : même charte que les bulletins (Montserrat, logo de l'école, marine et or).

import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { chargerRessources, assainir } from "@/lib/recuPdf";
import { GUIDE_PROFESSEURS } from "@/lib/guideProfesseurs";

const W = 595.28, H = 841.89, M = 46;

/**
 * `images` : schémas déjà convertis en PNG (clé = chemin du SVG), voir `schemasEnPng` ; sans eux (hors navigateur), le
 * PDF reste complet, sans les schémas.
 */
export async function construireGuidePdf(images: Record<string, Uint8Array> = {}): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, { default: fontkit }, res] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit"), chargerRessources()]);
  const NAVY = rgb(0.008, 0.114, 0.318), OR = rgb(0.784, 0.584, 0.184), GRIS = rgb(0.42, 0.45, 0.5);
  const CREME = rgb(0.969, 0.953, 0.918), OR_DOUX = rgb(0.953, 0.902, 0.788), BLANC = rgb(1, 1, 1);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semi, italic] = await Promise.all([
    doc.embedFont(res.regular, { subset: true }),
    doc.embedFont(res.semi, { subset: true }),
    doc.embedFont(res.italic, { subset: true }),
  ]);
  const logo = await doc.embedPng(res.logo);

  let page: PDFPage = doc.addPage([W, H]);
  let top = M;
  const y = (t: number) => H - t;
  const texte = (s: string, x: number, t: number, font: PDFFont, size: number, color: RGB = NAVY) => page.drawText(assainir(s), { x, y: y(t), size, font, color });
  const coupe = (s: string, font: PDFFont, size: number, w: number) => {
    const lignes: string[] = [];
    let ligne = "";
    for (const mot of assainir(s).split(/\s+/).filter(Boolean)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (font.widthOfTextAtSize(essai, size) > w && ligne) {
        lignes.push(ligne);
        ligne = mot;
      } else ligne = essai;
    }
    if (ligne) lignes.push(ligne);
    return lignes;
  };
  const place = (h: number) => {
    if (top + h > H - M - 20) {
      page = doc.addPage([W, H]);
      top = M;
    }
  };

  // En-tête.
  page.drawImage(logo, { x: M, y: y(top + 58), width: 59, height: 58 });
  texte("École du Saint-Enfant-Jésus", M + 74, top + 16, semi, 13);
  texte("Guide d'utilisation de Préau · Professeurs", M + 74, top + 33, regular, 10, GRIS);
  texte("Notes, relevés, bulletins, appel", M + 74, top + 50, semi, 10, OR);
  top += 74;
  page.drawLine({ start: { x: M, y: y(top) }, end: { x: W - M, y: y(top) }, thickness: 1.2, color: OR });
  top += 18;

  const larg = W - 2 * M;
  for (const [i, s] of GUIDE_PROFESSEURS.entries()) {
    const resume = coupe(s.resume, italic, 9, larg - 24);
    const etapes = s.etapes.map((e) => coupe(e, regular, 9, larg - 44));
    const astuce = s.astuce ? coupe(`Bon à savoir · ${s.astuce}`, regular, 8.5, larg - 44) : [];
    const png = s.schema && images[s.schema.src] ? await doc.embedPng(images[s.schema.src]) : null;
    const h = 26 + resume.length * 12 + etapes.reduce((n, l) => n + l.length * 12 + 3, 0) + (astuce.length ? 12 + astuce.length * 11.5 : 0) + 10;
    place(h);
    // Bandeau de section : numéro dans une pastille or, titre sur fond marine.
    page.drawRectangle({ x: M, y: y(top + 22), width: larg, height: 22, color: NAVY });
    page.drawCircle({ x: M + 13, y: y(top + 11), size: 8, color: OR });
    const n = String(i + 1);
    texte(n, M + 13 - semi.widthOfTextAtSize(n, 9) / 2, top + 14.2, semi, 9, BLANC);
    texte(s.titre, M + 28, top + 15, semi, 10.5, BLANC);
    top += 22;
    page.drawRectangle({ x: M, y: y(top + h - 22), width: larg, height: h - 22, color: CREME });
    top += 13;
    resume.forEach((l) => {
      texte(l, M + 12, top, italic, 9, GRIS);
      top += 12;
    });
    top += 2;
    etapes.forEach((lignes) => {
      page.drawCircle({ x: M + 17, y: y(top - 3), size: 1.8, color: OR });
      lignes.forEach((l) => {
        texte(l, M + 26, top, regular, 9);
        top += 12;
      });
      top += 3;
    });
    if (astuce.length) {
      const hA = 6 + astuce.length * 11.5;
      page.drawRectangle({ x: M + 12, y: y(top + hA - 6), width: larg - 24, height: hA, color: OR_DOUX });
      page.drawRectangle({ x: M + 12, y: y(top + hA - 6), width: 2.5, height: hA, color: OR });
      top += 4;
      astuce.forEach((l) => {
        texte(l, M + 22, top + 4, regular, 8.5);
        top += 11.5;
      });
    }
    // Schéma annoté et sa légende, sous l'encadré de la section (nouvelle page au besoin).
    if (png && s.schema) {
      const wImg = larg - 60, hImg = (wImg * s.schema.hauteur) / s.schema.largeur;
      const legende = s.schema.legende.map((l) => coupe(l, regular, 8.5, larg - 90));
      const hLeg = legende.reduce((n, l) => n + l.length * 11 + 3, 0);
      place(18 + hImg + 10 + hLeg);
      texte(s.schema.titre, M + 30, top + 4, semi, 9.5, OR);
      top += 12;
      page.drawImage(png, { x: M + 30, y: y(top + hImg), width: wImg, height: hImg });
      top += hImg + 12;
      legende.forEach((lignes, k) => {
        page.drawCircle({ x: M + 37, y: y(top - 3), size: 6, color: OR });
        const n = String(k + 1);
        texte(n, M + 37 - semi.widthOfTextAtSize(n, 7.5) / 2, top - 0.5, semi, 7.5, BLANC);
        lignes.forEach((l) => {
          texte(l, M + 50, top, regular, 8.5);
          top += 11;
        });
        top += 3;
      });
      top += 8;
    }
    top += 18;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(assainir(`ARIL · École du Saint-Enfant-Jésus — guide Préau pour les Professeurs — page ${i + 1}/${pages.length}`), {
      x: M,
      y: 16,
      size: 6.5,
      font: regular,
      color: GRIS,
    });
  });
  return doc.save();
}

/** Navigateur : convertit les schémas SVG du guide en PNG (2×, net à l'impression). */
async function schemasEnPng(): Promise<Record<string, Uint8Array>> {
  const sortie: Record<string, Uint8Array> = {};
  for (const s of GUIDE_PROFESSEURS) {
    if (!s.schema) continue;
    const { src, largeur, hauteur } = s.schema;
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = largeur * 2;
      canvas.height = hauteur * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/png"));
      if (blob) sortie[src] = new Uint8Array(await blob.arrayBuffer());
    } catch {
      // Schéma indisponible : le guide part sans lui.
    }
  }
  return sortie;
}

export async function telechargerGuide() {
  const octets = await construireGuidePdf(await schemasEnPng());
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "Guide Préau - Professeurs.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

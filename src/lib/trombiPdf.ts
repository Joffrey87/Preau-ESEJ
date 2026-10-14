// Trombinoscope et liste d'élèves d'une classe en PDF (même charte que les bulletins : Montserrat, logo, marine et or).

import type { PDFFont, PDFImage, PDFPage } from "pdf-lib";
import { chargerRessources, assainir } from "@/lib/recuPdf";

export type EleveTrombi = {
  id: string;
  prenom: string;
  nom: string;
  niveau: string | null;
  date_naissance: string | null;
  /** Photo déjà ramenée en JPEG (octets), ou null. */
  photo: Uint8Array | null;
  parents: string[];
  adresse: string | null;
};

const W = 595.28, H = 841.89, M = 36;
const dateFr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

export async function construireTrombiPdf(classe: string, annee: string, eleves: EleveTrombi[], type: "trombi" | "liste"): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, { default: fontkit }, res] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit"), chargerRessources()]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semi] = await Promise.all([doc.embedFont(res.regular, { subset: true }), doc.embedFont(res.semi, { subset: true })]);
  const logo = await doc.embedPng(res.logo);
  const NAVY = rgb(0.008, 0.114, 0.318), OR = rgb(0.784, 0.584, 0.184), GRIS = rgb(0.42, 0.45, 0.5), TRAIT = rgb(0.9, 0.875, 0.808), CREME = rgb(0.969, 0.953, 0.918);
  let page: PDFPage = doc.addPage([W, H]);
  const t = (s: string, x: number, top: number, f: PDFFont, size: number, color = NAVY) => page.drawText(assainir(s), { x, y: H - top, size, font: f, color });
  const coupe = (s: string, f: PDFFont, size: number, w: number) => {
    let x = assainir(s);
    while (x.length > 1 && f.widthOfTextAtSize(x, size) > w) x = x.slice(0, -2) + "…";
    return x;
  };
  const entete = () => {
    page.drawImage(logo, { x: M, y: H - M - 44, width: 45, height: 44 });
    t("École du Saint-Enfant-Jésus", M + 56, M + 14, semi, 12);
    t(`${type === "trombi" ? "Trombinoscope" : "Liste des élèves"} · ${classe}`, M + 56, M + 30, semi, 10, OR);
    t(`Année ${annee} · ${eleves.length} élève${eleves.length > 1 ? "s" : ""}`, M + 56, M + 43, regular, 8.5, GRIS);
    return M + 64;
  };
  let top = entete();

  if (type === "trombi") {
    const cols = 4, gap = 12, cw = (W - 2 * M - gap * (cols - 1)) / cols, ph = cw * 1.25, ch = ph + 34;
    const images = new Map<string, PDFImage>();
    for (const e of eleves) if (e.photo) images.set(e.id, await doc.embedJpg(e.photo).catch(() => null as unknown as PDFImage));
    eleves.forEach((e, i) => {
      const col = i % cols;
      if (col === 0 && i > 0) top += ch + gap;
      if (top + ch > H - M) {
        page = doc.addPage([W, H]);
        top = entete();
      }
      const x = M + col * (cw + gap);
      const img = images.get(e.id);
      if (img) {
        const r = Math.min(cw / img.width, ph / img.height);
        const w = img.width * r, h = img.height * r;
        // Photo entière, centrée dans la vignette.
        page.drawImage(img, { x: x + (cw - w) / 2, y: H - top - ph + (ph - h) / 2, width: w, height: h });
        page.drawRectangle({ x: x - 1, y: H - top - ph - 1, width: cw + 2, height: ph + 2, borderColor: TRAIT, borderWidth: 2 });
      } else {
        page.drawRectangle({ x, y: H - top - ph, width: cw, height: ph, color: CREME, borderColor: TRAIT, borderWidth: 0.8 });
        const ini = `${e.prenom[0] ?? ""}${e.nom[0] ?? ""}`.toUpperCase();
        t(ini, x + cw / 2 - semi.widthOfTextAtSize(ini, 22) / 2, top + ph / 2 + 8, semi, 22, GRIS);
      }
      const p = coupe(e.prenom, semi, 9.5, cw);
      const n = coupe(e.nom.toUpperCase(), regular, 8, cw);
      t(p, x + cw / 2 - semi.widthOfTextAtSize(p, 9.5) / 2, top + ph + 13, semi, 9.5);
      t(n, x + cw / 2 - regular.widthOfTextAtSize(n, 8) / 2, top + ph + 24, regular, 8, GRIS);
    });
  } else {
    const c = { nom: M, niv: M + 150, nais: M + 185, par: M + 255 };
    const enteteTableau = () => {
      page.drawRectangle({ x: M, y: H - top - 16, width: W - 2 * M, height: 16, color: NAVY });
      const B = rgb(1, 1, 1);
      t("Élève", c.nom + 4, top + 11, semi, 8, B);
      t("Niveau", c.niv, top + 11, semi, 8, B);
      t("Naissance", c.nais, top + 11, semi, 8, B);
      t("Parents (téléphone, courriel) · adresse", c.par, top + 11, semi, 8, B);
      top += 16;
    };
    enteteTableau();
    for (const e of eleves) {
      const lignes = [...e.parents, ...(e.adresse ? [e.adresse] : [])];
      const h = Math.max(18, 8 + lignes.length * 10);
      if (top + h > H - M) {
        page = doc.addPage([W, H]);
        top = entete();
        enteteTableau();
      }
      t(coupe(`${e.nom.toUpperCase()} ${e.prenom}`, semi, 8.5, 145), c.nom + 4, top + 12, semi, 8.5);
      t(e.niveau ?? "", c.niv, top + 12, regular, 8.5);
      t(dateFr(e.date_naissance), c.nais, top + 12, regular, 8.5);
      lignes.forEach((l, i) => t(coupe(l, regular, 7.5, W - M - c.par), c.par, top + 12 + i * 10, regular, 7.5, i < e.parents.length ? NAVY : GRIS));
      page.drawLine({ start: { x: M, y: H - top - h }, end: { x: W - M, y: H - top - h }, thickness: 0.5, color: TRAIT });
      top += h;
    }
  }
  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(assainir(`École du Saint-Enfant-Jésus — document interne, édité avec Préau${pages.length > 1 ? ` — page ${i + 1}/${pages.length}` : ""}`), { x: M, y: 20, size: 7, font: regular, color: GRIS }),
  );
  return doc.save();
}

export function telechargerPdf(octets: Uint8Array, nom: string) {
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom.replace(/[\\/:*?"<>|]/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Ramène une image (fichier ou blob) en JPEG, au plus `max` pixels de côté. */
export async function versJpeg(source: Blob, max = 700): Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Image illisible (format non pris en charge par ce navigateur)."));
      i.src = url;
    });
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * r);
    canvas.height = Math.round(img.naturalHeight * r);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Conversion impossible.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Conversion impossible."))), "image/jpeg", 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

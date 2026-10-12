// Bulletin scolaire en PDF : une page A4 par élève (suite sur une seconde page si les commentaires débordent).
// Même charte que les reçus et factures : Montserrat, logo de l'école, marine et or. Construit à partir de la
// synthèse (celle figée à la publication, ou calculée pour un aperçu).

import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { chargerRessources, assainir } from "@/lib/recuPdf";
import { mentionLabel, nomFichierBulletin, note20, rangTexte, type Synthese } from "@/lib/bulletins";

const W = 595.28, H = 841.89, M = 40;

export async function construireBulletinsPdf(syntheses: Synthese[]): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, { default: fontkit }, res] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit"), chargerRessources()]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regular, semi, italic] = await Promise.all([
    doc.embedFont(res.regular, { subset: true }),
    doc.embedFont(res.semi, { subset: true }),
    doc.embedFont(res.italic, { subset: true }),
  ]);
  const logo = await doc.embedPng(res.logo);
  const NAVY = rgb(0.008, 0.114, 0.318), OR = rgb(0.784, 0.584, 0.184), OR_DOUX = rgb(0.953, 0.902, 0.788);
  const GRIS = rgb(0.42, 0.45, 0.5), TRAIT = rgb(0.9, 0.875, 0.808), BLANC = rgb(1, 1, 1), CREME = rgb(0.969, 0.953, 0.918);

  for (const s of syntheses) {
    let page: PDFPage = doc.addPage([W, H]);
    let top = M;
    const y = (t: number) => H - t;
    const texte = (str: string, x: number, t: number, font: PDFFont, size: number, color: RGB = NAVY) =>
      page.drawText(assainir(str), { x, y: y(t), size, font, color });
    const largeur = (str: string, font: PDFFont, size: number) => font.widthOfTextAtSize(assainir(str), size);
    const coupe = (str: string, font: PDFFont, size: number, w: number): string[] => {
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
    };
    const rect = (x: number, t: number, w: number, h: number, color: RGB) => page.drawRectangle({ x, y: y(t + h), width: w, height: h, color });
    const centre = (str: string, xc: number, t: number, font: PDFFont, size: number, color: RGB = NAVY) =>
      texte(str, xc - largeur(str, font, size) / 2, t, font, size, color);
    const nouvellePage = () => {
      page = doc.addPage([W, H]);
      top = M;
      texte(`${s.eleve.prenom} ${s.eleve.nom} — ${s.periode.libelle} (suite)`, M, top + 8, italic, 8.5, GRIS);
      top += 22;
    };
    const place = (h: number) => {
      if (top + h > H - M - 30) nouvellePage();
    };

    // En-tête : logo, école, période ; cartouche de l'élève à droite.
    page.drawImage(logo, { x: M, y: y(top + 62), width: 63, height: 62 });
    texte("École du Saint-Enfant-Jésus", M + 76, top + 18, semi, 13);
    texte(`Bulletin scolaire · Année ${s.periode.annee}`, M + 76, top + 35, regular, 9.5, GRIS);
    texte(s.periode.libelle + (s.periode.trimestre ? ` · ${["", "1er", "2e", "3e"][s.periode.trimestre]} trimestre` : ""), M + 76, top + 51, semi, 9.5, OR);
    const bx = W - M - 190;
    rect(bx, top, 190, 62, CREME);
    page.drawRectangle({ x: bx, y: y(top + 62), width: 2.5, height: 62, color: OR });
    texte(`${s.eleve.prenom} ${s.eleve.nom.toUpperCase()}`, bx + 12, top + 19, semi, 11.5);
    texte(`${s.classe.nom}${s.eleve.niveau ? ` · ${s.eleve.niveau}` : ""}`, bx + 12, top + 35, regular, 9);
    if (s.classe.titulaire) texte(`Titulaire : ${s.classe.titulaire}`, bx + 12, top + 50, regular, 8.5, GRIS);
    top += 80;

    // Tableau.
    const avecRang = s.afficherRang;
    const cols = { matiere: M, moy: M + 168, classe: M + 213, rang: M + 258, com: avecRang ? M + 292 : M + 262 };
    const wCom = W - M - cols.com - 6;
    const entete = () => {
      rect(M, top, W - 2 * M, 18, NAVY);
      texte("Matière", cols.matiere + 6, top + 12, semi, 8, BLANC);
      centre("Moyenne", cols.moy + 20, top + 12, semi, 8, BLANC);
      centre("Classe", cols.classe + 20, top + 12, semi, 8, BLANC);
      if (avecRang) centre("Rang", cols.rang + 15, top + 12, semi, 8, BLANC);
      texte("Commentaire", cols.com + 6, top + 12, semi, 8, BLANC);
      top += 18;
    };
    const chiffres = (c: Synthese["general"], t: number, font: PDFFont, color: RGB) => {
      centre(note20(c.moy), cols.moy + 20, t, font, 8.5, color);
      centre(note20(c.moyClasse), cols.classe + 20, t, regular, 8, color === BLANC ? BLANC : GRIS);
      if (avecRang) centre(rangTexte(c.rang), cols.rang + 15, t, regular, 8, color);
    };
    entete();
    for (const g of s.groupes) {
      place(18 + 22);
      rect(M, top, W - 2 * M, 17, OR_DOUX);
      texte(g.nom, cols.matiere + 6, top + 11.5, semi, 8.5);
      chiffres(g.chiffre, top + 11.5, semi, NAVY);
      top += 17;
      for (const m of g.matieres) {
        const com = m.commentaire ? coupe(m.commentaire, regular, 7.8, wCom) : [];
        const h = Math.max(m.enseignants ? 24 : 16, 8 + com.length * 10);
        place(h);
        texte(m.nom, cols.matiere + 12, top + 11, regular, 8.5);
        if (m.enseignants) texte(m.enseignants, cols.matiere + 12, top + 20, regular, 6.5, GRIS);
        chiffres(m.chiffre, top + 11, semi, NAVY);
        com.forEach((l, i) => texte(l, cols.com + 6, top + 11 + i * 10, regular, 7.8));
        page.drawLine({ start: { x: M, y: y(top + h) }, end: { x: W - M, y: y(top + h) }, thickness: 0.5, color: TRAIT });
        top += h;
      }
    }
    place(22);
    rect(M, top, W - 2 * M, 20, NAVY);
    texte("Moyenne générale", cols.matiere + 6, top + 13.5, semi, 9, BLANC);
    chiffres(s.general, top + 13.5, semi, BLANC);
    top += 30;

    // Mention et appréciation générale.
    const mention = mentionLabel(s.mention);
    if (mention) {
      place(20);
      texte("Mention :", M, top + 10, regular, 9.5, GRIS);
      texte(mention, M + 50, top + 10, semi, 10, OR);
      top += 22;
    }
    const app = s.appreciation ? coupe(s.appreciation, regular, 9, W - 2 * M - 24) : [];
    const hApp = 28 + Math.max(1, app.length) * 12.5;
    place(hApp);
    page.drawRectangle({ x: M, y: y(top + hApp), width: W - 2 * M, height: hApp, borderColor: OR, borderWidth: 0.8, color: CREME });
    texte("Appréciation générale", M + 12, top + 16, semi, 9.5);
    app.forEach((l, i) => texte(l, M + 12, top + 32 + i * 12.5, regular, 9));
    if (!app.length) texte("—", M + 12, top + 32, regular, 9, GRIS);
    top += hApp + 18;

    // Signatures.
    place(40);
    texte("La Directrice", W - M - 160, top + 10, semi, 9);
    if (s.classe.titulaire) texte(s.classe.titulaire, M, top + 10, semi, 9);
    texte(s.classe.titulaire ? "Titulaire de la classe" : "", M, top + 22, regular, 8, GRIS);
    // Pied de page sur chaque page.
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const pied = `ARIL · École du Saint-Enfant-Jésus — bulletin édité avec Préau${pages.length > 1 ? ` — page ${i + 1}/${pages.length}` : ""}`;
    p.drawText(assainir(pied), { x: M, y: 22, size: 7, font: regular, color: GRIS });
  });
  return doc.save();
}

/** Construit puis télécharge (un bulletin : son nom ; plusieurs : un fichier unique). */
export async function telechargerBulletins(syntheses: Synthese[], nomLot?: string) {
  if (!syntheses.length) return;
  const octets = await construireBulletinsPdf(syntheses);
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = syntheses.length === 1 ? nomFichierBulletin(syntheses[0]) : `${(nomLot ?? "Bulletins").replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

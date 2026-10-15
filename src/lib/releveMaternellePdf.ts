// Relevé d'appréciations de maternelle en PDF : une page par élève (suite si besoin), charte Préau / ESEJ.

import { creerPlume, telechargerPdf, M, W } from "@/lib/documentPdf";
import { niveauLabel, type NiveauAcquis } from "@/lib/releveMaternelle";
import { texteAbsences, type ResumeAbsences } from "@/lib/absences";

export type ReleveImprimable = {
  eleve: { prenom: string; nom: string; niveau: string | null };
  classe: { nom: string; titulaire: string | null };
  annee: string;
  /** « 1er trimestre » ou « Période 3 — Du … au … ». */
  titre: string;
  matieres: { nom: string; niveau: NiveauAcquis | null; commentaire: string | null }[];
  appreciation: string | null;
  absences: ResumeAbsences;
};

export async function telechargerRelevesMaternelle(releves: ReleveImprimable[], nom: string) {
  if (!releves.length) return;
  const p = await creerPlume();
  const { NAVY, OR, OR_DOUX, GRIS, BLANC, CREME, TRAIT } = p.c;
  releves.forEach((r, i) => {
    if (i) p.nouvellePage();
    p.entete(`Relevé d'appréciations · Année ${r.annee}`, r.titre);
    // Cartouche de l'élève.
    p.rect(M, p.top, W - 2 * M, 34, CREME);
    p.rect(M, p.top, 2.5, 34, OR);
    p.texte(`${r.eleve.prenom} ${r.eleve.nom.toUpperCase()}`, M + 14, p.top + 15, p.semi, 11.5);
    p.texte([r.eleve.niveau && `Classe : ${r.eleve.niveau}`, r.classe.titulaire].filter(Boolean).join(" · "), M + 14, p.top + 28, p.regular, 8.5, GRIS);
    p.top += 46;

    const cols = { nom: M + 6, niveau: M + 150, com: M + 262 };
    const wCom = W - M - cols.com - 6;
    const entete = () => {
      p.rect(M, p.top, W - 2 * M, 18, NAVY);
      p.texte("Domaine", cols.nom, p.top + 12, p.semi, 8, BLANC);
      p.texte("Niveau", cols.niveau, p.top + 12, p.semi, 8, BLANC);
      p.texte("Commentaire", cols.com, p.top + 12, p.semi, 8, BLANC);
      p.top += 18;
    };
    entete();
    for (const m of r.matieres) {
      const com = m.commentaire ? p.coupe(m.commentaire, p.regular, 8, wCom) : [];
      const nomL = p.coupe(m.nom, p.semi, 8.5, cols.niveau - cols.nom - 8);
      const h = Math.max(20, 8 + Math.max(com.length, nomL.length) * 10.5);
      if (p.place(h)) entete();
      nomL.forEach((l, k) => p.texte(l, cols.nom, p.top + 13 + k * 10.5, p.semi, 8.5));
      const nv = niveauLabel(m.niveau);
      if (nv) {
        const w = p.largeur(nv, p.semi, 7.5) + 10;
        p.rect(cols.niveau - 3, p.top + 5, w, 12, m.niveau === "acquis" ? OR_DOUX : CREME);
        p.texte(nv, cols.niveau + 2, p.top + 14, p.semi, 7.5, m.niveau === "non_acquis" ? GRIS : NAVY);
      } else p.texte("–", cols.niveau, p.top + 13, p.regular, 8.5, GRIS);
      com.forEach((l, k) => p.texte(l, cols.com, p.top + 13 + k * 10.5, p.regular, 8));
      p.page.drawLine({ start: { x: M, y: 841.89 - (p.top + h) }, end: { x: W - M, y: 841.89 - (p.top + h) }, thickness: 0.5, color: TRAIT });
      p.top += h;
    }
    p.top += 12;
    p.place(20);
    p.texte("Absences :", M, p.top + 10, p.regular, 9.5, GRIS);
    p.texte(texteAbsences(r.absences), M + 54, p.top + 10, p.regular, 9.5);
    p.top += 22;

    const app = r.appreciation ? p.coupe(r.appreciation, p.regular, 9, W - 2 * M - 24) : [];
    const hApp = 28 + Math.max(1, app.length) * 12.5;
    p.place(hApp);
    p.cadre(M, p.top, W - 2 * M, hApp, OR, CREME);
    p.texte("Appréciation générale", M + 12, p.top + 16, p.semi, 9.5);
    app.forEach((l, k) => p.texte(l, M + 12, p.top + 32 + k * 12.5, p.regular, 9));
    if (!app.length) p.texte("—", M + 12, p.top + 32, p.regular, 9, GRIS);
    p.top += hApp + 18;

    p.place(40);
    p.texte("La Directrice", W - M - 160, p.top + 10, p.semi, 9);
    if (r.classe.titulaire) {
      p.texte(r.classe.titulaire, M, p.top + 10, p.semi, 9);
      p.texte("Titulaire de la classe", M, p.top + 22, p.regular, 8, GRIS);
    }
  });
  const octets = await p.terminer("ARIL · École du Saint-Enfant-Jésus — relevé édité avec Préau");
  telechargerPdf(octets, nom);
}

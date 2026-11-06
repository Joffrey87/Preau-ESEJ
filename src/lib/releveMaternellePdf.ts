// Relevé d'appréciations de maternelle en PDF : une page par élève (suite si besoin), charte Préau / ESEJ.

import { creerPlume, telechargerPdf, M, W } from "@/lib/documentPdf";
import type { NiveauAcquis } from "@/lib/releveMaternelle";
import { developperCiviliteNom, roleTitulaireDepuisNom } from "@/lib/bulletins";

export type ReleveImprimable = {
  eleve: { prenom: string; nom: string; niveau: string | null };
  classe: { nom: string; titulaire: string | null };
  annee: string;
  /** « 1er trimestre » ou « Période 3 — Du … au … ». */
  titre: string;
  matieres: { nom: string; niveau: NiveauAcquis | null; commentaire: string | null }[];
  appreciation: string | null;
};

export async function telechargerRelevesMaternelle(releves: ReleveImprimable[], nom: string) {
  if (!releves.length) return;
  const p = await creerPlume();
  const { NAVY, OR, GRIS, BLANC, CREME, TRAIT } = p.c;
  releves.forEach((r, i) => {
    if (i) p.nouvellePage();
    p.entete(`Relevé d'appréciations · Année ${r.annee}`, r.titre);
    // Cartouche de l'élève (titre enseignant en toutes lettres, sans prénom ; retour à la ligne si besoin).
    const titulaireNom = developperCiviliteNom(r.classe.titulaire);
    const ligneInfos = [r.eleve.niveau && `Classe : ${r.eleve.niveau}`, titulaireNom].filter(Boolean).join(" · ");
    const wCart = W - 2 * M - 28;
    const infosL = ligneInfos ? p.coupe(ligneInfos, p.regular, 8.5, wCart) : [];
    const hCart = Math.max(34, 22 + Math.max(1, infosL.length) * 12);
    p.rect(M, p.top, W - 2 * M, hCart, CREME);
    p.rect(M, p.top, 2.5, hCart, OR);
    p.texte(`${r.eleve.prenom} ${r.eleve.nom.toUpperCase()}`, M + 14, p.top + 15, p.semi, 11.5);
    infosL.forEach((l, i) => p.texte(l, M + 14, p.top + 28 + i * 12, p.regular, 8.5, GRIS));
    p.top += hCart + 12;

    // Relevé : Domaine + Commentaire seulement (la colonne Niveau reste réservée aux bulletins).
    const cols = { nom: M + 6, com: M + 168 };
    const wCom = W - M - cols.com - 6;
    const entete = () => {
      p.rect(M, p.top, W - 2 * M, 18, NAVY);
      p.texte("Domaine", cols.nom, p.top + 12, p.semi, 8, BLANC);
      p.texte("Commentaire", cols.com, p.top + 12, p.semi, 8, BLANC);
      p.top += 18;
    };
    entete();
    for (const m of r.matieres) {
      const com = m.commentaire ? p.coupe(m.commentaire, p.regular, 8, wCom) : [];
      const nomL = p.coupe(m.nom, p.semi, 8.5, cols.com - cols.nom - 8);
      const h = Math.max(20, 8 + Math.max(com.length, nomL.length) * 10.5);
      if (p.place(h)) entete();
      nomL.forEach((l, k) => p.texte(l, cols.nom, p.top + 13 + k * 10.5, p.semi, 8.5));
      com.forEach((l, k) => p.texte(l, cols.com, p.top + 13 + k * 10.5, p.regular, 8));
      p.page.drawLine({ start: { x: M, y: 841.89 - (p.top + h) }, end: { x: W - M, y: 841.89 - (p.top + h) }, thickness: 0.5, color: TRAIT });
      p.top += h;
    }
    p.top += 12;

    const app = r.appreciation ? p.coupe(r.appreciation, p.regular, 9, W - 2 * M - 24) : [];
    const hApp = 28 + Math.max(1, app.length) * 12.5;
    p.place(hApp);
    p.cadre(M, p.top, W - 2 * M, hApp, OR, CREME);
    p.texte("Appréciation générale", M + 12, p.top + 16, p.semi, 9.5);
    app.forEach((l, k) => p.texte(l, M + 12, p.top + 32 + k * 12.5, p.regular, 9));
    if (!app.length) p.texte("—", M + 12, p.top + 32, p.regular, 9, GRIS);
    p.top += hApp + 18;

    // Comme le relevé primaire : encart Enseignante/Enseignant (titre + nom) + encart parents, sans Directrice.
    const wSig = 200, wNomSig = wSig - 20;
    const lignesSig = titulaireNom ? p.coupe(titulaireNom, p.regular, 8.5, wNomSig) : [];
    const hSig = Math.max(62, 40 + Math.max(1, lignesSig.length) * 11);
    p.place(hSig);
    const role = roleTitulaireDepuisNom(titulaireNom || r.classe.titulaire);
    p.cadre(M, p.top, wSig, hSig, TRAIT);
    p.texte(`Signature de l'${role.toLowerCase()}`, M + 10, p.top + 13, p.semi, 8.5);
    lignesSig.forEach((l, i) => p.texte(l, M + 10, p.top + 26 + i * 11, p.regular, 8.5));
    p.cadre(W - M - wSig, p.top, wSig, hSig, TRAIT);
    p.texte("Signature des parents", W - M - wSig + 10, p.top + 13, p.semi, 8.5);
    p.top += hSig;
  });
  const octets = await p.terminer("");
  telechargerPdf(octets, nom);
}

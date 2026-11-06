// Bulletin scolaire en PDF : une page A4 par élève, réduite au besoin pour tenir sur une page (voir ECHELLE_MIN).
// Même charte que les reçus et factures : Montserrat, logo de l'école, marine et or. Construit à partir de la
// synthèse (celle figée à la publication, ou calculée pour un aperçu).

import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { chargerRessources, assainir } from "@/lib/recuPdf";
import { classeEleve, dateJJMMAAAA, developperCiviliteNom, mentionLabel, nomFichierBulletin, note20, rangTexte, normaliserRoleTitulaire, titreDocument, type Synthese } from "@/lib/bulletins";
import { texteAbsences } from "@/lib/absences";
import { tauxTexte } from "@/lib/calendrier";

const W = 595.28, H = 841.89, M = 40;
/** Réduction maximale (0,8) : le corps du texte (8,5–9 pt) ne descend pas sous 7 pt environ. */
export const ECHELLE_MIN = 0.8;

type Rendu = { octets: Uint8Array; pages: number };

/**
 * Bulletin sur UNE page A4 : on le compose sur une page virtuelle agrandie (A4 / k), puis on la pose sur l'A4 à
 * l'échelle k. k part de 1 et diminue par pas de 0,02 jusqu'à ECHELLE_MIN, tant que le contenu déborde. Rien n'est
 * tronqué : si le contenu dépasse encore à l'échelle minimale, la suite va sur une seconde page (signalé dans `debordements`).
 */
export async function construireBulletinsPdf(syntheses: Synthese[], infos?: { echelles: number[]; debordements: number[] }): Promise<Uint8Array> {
  const [{ PDFDocument, rgb }, { default: fontkit }, res] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit"), chargerRessources()]);
  const NAVY = rgb(0.008, 0.114, 0.318), OR = rgb(0.784, 0.584, 0.184), OR_DOUX = rgb(0.953, 0.902, 0.788);
  const GRIS = rgb(0.42, 0.45, 0.5), TRAIT = rgb(0.9, 0.875, 0.808), BLANC = rgb(1, 1, 1), CREME = rgb(0.969, 0.953, 0.918);

  async function rendre(s: Synthese, k: number): Promise<Rendu> {
    const brouillon = await PDFDocument.create();
    brouillon.registerFontkit(fontkit);
    const [regular, semi, italic] = await Promise.all([
      brouillon.embedFont(res.regular, { subset: true }),
      brouillon.embedFont(res.semi, { subset: true }),
      brouillon.embedFont(res.italic, { subset: true }),
    ]);
    const logo = await brouillon.embedPng(res.logo);
    const Wp = W / k, Hp = H / k;
    let page: PDFPage = brouillon.addPage([Wp, Hp]);
    let top = M;
    const y = (t: number) => Hp - t;
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
      page = brouillon.addPage([Wp, Hp]);
      top = M;
      texte(`${s.eleve.prenom} ${s.eleve.nom} — ${titreDocument(s)} (suite)`, M, top + 8, italic, 8.5, GRIS);
      top += 22;
    };
    const place = (h: number) => {
      if (top + h > Hp - M - 30) nouvellePage();
    };

    // Taille de police qui fait tenir `str` dans `w` (sans descendre sous `min`).
    const ajuste = (str: string, font: PDFFont, size: number, w: number, min: number) => {
      let t = size;
      while (t > min && largeur(str, font, t) > w) t -= 0.25;
      return t;
    };

    // En-tête : logo, école, période (dates sur leur propre ligne) ; cartouche de l'élève à droite, séparé du
    // bloc de gauche par une gouttière, et dont la hauteur suit le nom (prénom au-dessus, nom réduit puis coupé
    // s'il est long : jamais de débordement).
    // Logo un peu plus grand ; cartouche 196 pt : les infos (classe / enseignante) reviennent à la ligne si besoin.
    const CW = 196, bx = Wp - M - CW, gx = M + 84, gw = bx - 18 - gx, iw = CW - 24;
    page.drawImage(logo, { x: M, y: y(top + 71), width: 72, height: 71 });
    texte("École du Saint-Enfant-Jésus", gx, top + 16, semi, ajuste("École du Saint-Enfant-Jésus", semi, 13, gw, 10));
    const sousTitre = `${s.mode === "releve" ? "Relevé de notes" : "Bulletin scolaire"} · Année ${s.periode.annee}`;
    texte(sousTitre, gx, top + 31, regular, ajuste(sousTitre, regular, 9.5, gw, 8), GRIS);
    // Relevé : les dates de la période seules ; bulletin trimestriel : « Premier Trimestre » ; ni l'un ni l'autre
    // ne porte de numéro de période.
    const titre = titreDocument(s);
    texte(titre, gx, top + 47, semi, ajuste(titre, semi, 10, gw, 8), OR);
    if (!s.mode && s.periode.numero && s.periode.libelle) texte(s.periode.libelle, gx, top + 60, regular, ajuste(s.periode.libelle, regular, 8.5, gw, 7), GRIS);

    // Nom : réduit jusqu'à 10,5 pt ; au-delà, coupé aux espaces et aux traits d'union (le trait reste en fin
    // de ligne), puis chaque ligne encore trop large réduit l'ensemble.
    const nom = s.eleve.nom.toUpperCase();
    let tNom = ajuste(nom, semi, 13, iw, 10.5);
    let lignesNom = [nom];
    if (largeur(nom, semi, tNom) > iw) {
      lignesNom = [];
      let ligne = "";
      for (const morceau of nom.match(/[^\s-]+(?:-|\s+|$)/g) ?? [nom]) {
        const essai = ligne + morceau;
        if (ligne && largeur(essai.trimEnd(), semi, tNom) > iw) {
          lignesNom.push(ligne.trimEnd());
          ligne = morceau;
        } else ligne = essai;
      }
      if (ligne.trim()) lignesNom.push(ligne.trimEnd());
      tNom = Math.min(...lignesNom.map((l) => ajuste(l, semi, tNom, iw, 7)));
    }
    // La classe de l'élève seule (son niveau), jamais le regroupement de classes ; bulletin trimestriel : la date de
    // naissance en plus.
    const ligneClasse = classeEleve(s);
    const naissance = s.mode === "trimestre" && s.eleve.naissance ? `Né(e) le ${dateJJMMAAAA(s.eleve.naissance)}` : "";
    const titulaireNom = developperCiviliteNom(s.classe.titulaire);
    const role = normaliserRoleTitulaire(s.classe.roleTitulaire, titulaireNom || s.classe.titulaire);
    const infos = [ligneClasse && { t: ligneClasse, gris: false }, naissance && { t: naissance, gris: true }, titulaireNom && { t: `${role} : ${titulaireNom}`, gris: true }].filter(
      (x): x is { t: string; gris: boolean } => !!x,
    );
    // Classe / Enseignante : d'abord retour à la ligne dans le cartouche (hauteur qui suit) ;
    // préfère couper après « Rôle : » ; police réduite seulement si un mot isolé dépasse encore.
    const coupeInfo = (str: string, font: PDFFont, size: number, w: number) => {
      if (largeur(str, font, size) <= w) return [str];
      const m = str.match(/^([^:]+:\s*)([\s\S]+)$/);
      if (m && largeur(m[1], font, size) <= w) {
        const reste = coupe(m[2], font, size, w);
        if (reste.length && largeur(m[1] + reste[0], font, size) <= w) return [m[1] + reste[0], ...reste.slice(1)];
        return [m[1].trimEnd(), ...reste];
      }
      return coupe(str, font, size, w);
    };
    const infosRendues = infos.map((x) => {
      let taille = x.gris ? 8.5 : 9;
      let lignes = coupeInfo(x.t, regular, taille, iw);
      while (lignes.some((l) => largeur(l, regular, taille) > iw + 0.01) && taille > 7) {
        taille -= 0.25;
        lignes = coupeInfo(x.t, regular, taille, iw);
      }
      return { lignes, taille, gris: x.gris };
    });
    // Lignes de base : prénom à 16, nom(s) tous les tNom + 3, première info +15, suivantes +13, wraps +11 ; marge basse 12.
    let hInfos = 0;
    infosRendues.forEach((x, i) => {
      hInfos += (i === 0 ? 15 : 13) + Math.max(0, x.lignes.length - 1) * 11;
    });
    const hCart = 16 + lignesNom.length * (tNom + 3) + hInfos + 12;
    rect(bx, top, CW, hCart, CREME);
    page.drawRectangle({ x: bx, y: y(top + hCart), width: 2.5, height: hCart, color: OR });
    let tc = top + 16;
    texte(s.eleve.prenom, bx + 14, tc, regular, ajuste(s.eleve.prenom, regular, 10.5, iw, 8.5));
    for (const l of lignesNom) {
      tc += tNom + 3;
      texte(l, bx + 14, tc, semi, tNom);
    }
    infosRendues.forEach((x, i) => {
      tc += i === 0 ? 15 : 13;
      x.lignes.forEach((l, j) => {
        if (j) tc += 11;
        texte(l, bx + 14, tc, regular, x.taille, x.gris ? GRIS : NAVY);
      });
    });
    top += Math.max(71, hCart) + 18;

    // Tableau.
    // Relevé : aucune colonne chiffrée (les notes vont dans la dernière colonne) ; trimestre : moyenne seule.
    const releve = s.mode === "releve", trimestre = s.mode === "trimestre";
    const avecRang = s.afficherRang && !releve && !trimestre;
    const avecClasse = !releve && !trimestre;
    const cols = { matiere: M, moy: M + 168, classe: M + 213, rang: M + 258, com: releve ? M + 168 : trimestre ? M + 216 : avecRang ? M + 292 : M + 262 };
    const wCom = Wp - M - cols.com - 6;
    const entete = () => {
      rect(M, top, Wp - 2 * M, 18, NAVY);
      texte("Matière", cols.matiere + 6, top + 12, semi, 8, BLANC);
      if (!releve) centre("Moyenne", cols.moy + 20, top + 12, semi, 8, BLANC);
      if (avecClasse) centre("Classe", cols.classe + 20, top + 12, semi, 8, BLANC);
      if (avecRang) centre("Rang", cols.rang + 15, top + 12, semi, 8, BLANC);
      texte(releve ? "Notes de la période" : "Appréciation", cols.com + 6, top + 12, semi, 8, BLANC);
      top += 18;
    };
    const chiffres = (c: Synthese["general"], t: number, font: PDFFont, color: RGB) => {
      if (releve) return;
      centre(note20(c.moy), cols.moy + 20, t, font, 8.5, color);
      if (avecClasse) centre(note20(c.moyClasse), cols.classe + 20, t, regular, 8, color === BLANC ? BLANC : GRIS);
      if (avecRang) centre(rangTexte(c.rang), cols.rang + 15, t, regular, 8, color);
    };
    // Sans notes (grande section) : ni tableau ni moyenne générale, seulement les appréciations.
    if (s.groupes.length) entete();
    for (const g of s.groupes) {
      place(18 + 22);
      rect(M, top, Wp - 2 * M, 17, OR_DOUX);
      texte(g.nom, cols.matiere + 6, top + 11.5, semi, 8.5);
      if (!g.matieres.every((m) => m.appreciationSeule)) chiffres(g.chiffre, top + 11.5, semi, NAVY);
      top += 17;
      for (const m of g.matieres) {
        const com = m.commentaire ? coupe(m.commentaire, regular, 7.8, wCom) : [];
        // Intitulé long (« Systèmes de poids et mesures ») : coupé sur deux lignes dans sa colonne, jamais tronqué.
        const wNom = (releve ? cols.com : cols.moy) - cols.matiere - 18;
        const noms = coupe(m.nom, regular, 8.5, wNom);
        // Intervenants sous la matière (style discret) ; le titulaire du cartouche n'est pas répété.
        const ensLib = (m.enseignants ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x && x !== (s.classe.titulaire ?? "").trim())
          .join(", ");
        const ens = ensLib ? coupe(ensLib, regular, 7, wNom) : [];
        // Catéchisme : Directeur (texte seul) puis enseignante (nom + commentaire si présent).
        // Autres matières : contenu seul. Pas de 2e ligne vide si l'enseignante n'a pas commenté.
        const apps = (m.appreciations ?? [])
          .map((x) => ({ titre: (x.titre ?? "").trim(), lignes: coupe(x.texte, italic, 7.8, wCom) }))
          .filter((x) => x.lignes.length);
        // Écart entre deux appréciations (Directeur / enseignante) pour les distinguer clairement.
        const ecartApps = apps.length > 1 ? 5 : 0;
        const hTitreApp = 9.5;
        const hCom =
          com.length * 10 +
          (com.length && apps.length ? 2 : 0) +
          apps.reduce((t, x) => t + (x.titre ? hTitreApp : 0) + x.lignes.length * 10, 0) +
          Math.max(0, apps.length - 1) * ecartApps;
        const h = Math.max(8 + noms.length * 10.5 + ens.length * 9, 8 + hCom);
        place(h);
        noms.forEach((l, i) => texte(l, cols.matiere + 12, top + 11 + i * 10.5, regular, 8.5));
        ens.forEach((l, i) => texte(l, cols.matiere + 12, top + 11 + noms.length * 10.5 - 1.5 + i * 9, regular, 7, GRIS));
        if (!m.appreciationSeule) chiffres(m.chiffre, top + 11, semi, NAVY);
        // Notes du relevé : séparées par un point médian « · » (couleur du texte ; doré seulement à l’écran).
        com.forEach((l, i) => {
          let x = cols.com + 6;
          l.split(" | ").forEach((morceau, j) => {
            if (j) {
              texte("·", x + 3, top + 11 + i * 10, regular, 7.8);
              x += largeur("·", regular, 7.8) + 6;
            }
            texte(morceau, x, top + 11 + i * 10, regular, 7.8);
            x += largeur(morceau, regular, 7.8);
          });
        });
        let tA = top + 11 + com.length * 10 + (com.length ? 2 : 0);
        apps.forEach((x, iApp) => {
          if (iApp) tA += ecartApps;
          if (x.titre) {
            // Nom de l'enseignante de classe (étiquette) avant son commentaire Catéchisme.
            texte(x.titre, cols.com + 6, tA - 1, semi, 7.2, OR);
            tA += hTitreApp;
          }
          x.lignes.forEach((l) => {
            texte(l, cols.com + 6, tA, italic, 7.8);
            tA += 10;
          });
        });
        page.drawLine({ start: { x: M, y: y(top + h) }, end: { x: Wp - M, y: y(top + h) }, thickness: 0.5, color: TRAIT });
        top += h;
      }
    }
    if (s.groupes.length && !releve) {
      place(22);
      rect(M, top, Wp - 2 * M, 20, NAVY);
      texte("Moyenne générale", cols.matiere + 6, top + 13.5, semi, 9, BLANC);
      chiffres(s.general, top + 13.5, semi, BLANC);
      top += 30;
    } else if (s.groupes.length) top += 12;

    // Absences : bulletins seulement (pas les relevés de notes).
    if (!releve && s.absences) {
      place(20);
      texte("Absences :", M, top + 10, regular, 9.5, GRIS);
      texte(texteAbsences(s.absences), M + 54, top + 10, regular, 9.5);
      top += 20;
    }
    if (s.presentiel !== undefined && s.presentiel !== null) {
      place(20);
      texte("Taux de présentiel :", M, top + 10, regular, 9.5, GRIS);
      texte(tauxTexte(s.presentiel), M + 92, top + 10, semi, 9.5);
      top += 20;
    }

    // Mention et appréciation générale.
    const mention = mentionLabel(s.mention);
    if (mention) {
      place(20);
      texte("Mention :", M, top + 10, regular, 9.5, GRIS);
      texte(mention, M + 50, top + 10, semi, 10, OR);
      top += 22;
    }
    // Commentaires par rubrique (Catéchisme, Travail…), repris d'École Futée.
    for (const x of s.rubriques ?? []) {
      const lignes = coupe(x.texte, regular, 9, Wp - 2 * M - 24);
      const h = 24 + lignes.length * 12.5;
      place(h);
      page.drawRectangle({ x: M, y: y(top + h), width: Wp - 2 * M, height: h, borderColor: TRAIT, borderWidth: 0.8 });
      texte(x.titre, M + 12, top + 15, semi, 9);
      lignes.forEach((l, i) => texte(l, M + 12, top + 29 + i * 12.5, regular, 9));
      top += h + 8;
    }

    const app = s.appreciation ? coupe(s.appreciation, regular, 9, Wp - 2 * M - 24) : [];
    const hApp = 28 + Math.max(1, app.length) * 12.5;
    place(hApp);
    page.drawRectangle({ x: M, y: y(top + hApp), width: Wp - 2 * M, height: hApp, borderColor: OR, borderWidth: 0.8, color: CREME });
    texte(s.mode === "trimestre" ? "Appréciation du trimestre" : "Appréciation générale", M + 12, top + 16, semi, 9.5);
    app.forEach((l, i) => texte(l, M + 12, top + 32 + i * 12.5, regular, 9));
    if (!app.length) texte("—", M + 12, top + 32, regular, 9, GRIS);
    top += hApp + 18;

    // Signatures. Relevé / trimestre : encart Enseignante/Enseignant (titre + nom) + encart parents — pas de Directrice.
    if (s.mode) {
      const wSig = 200, wNomSig = wSig - 20;
      let tSig = 8.5;
      let lignesSig = titulaireNom ? coupe(titulaireNom, regular, tSig, wNomSig) : [];
      while (lignesSig.some((l) => largeur(l, regular, tSig) > wNomSig + 0.01) && tSig > 7) {
        tSig -= 0.25;
        lignesSig = coupe(titulaireNom!, regular, tSig, wNomSig);
      }
      const hSig = Math.max(62, 40 + Math.max(1, lignesSig.length) * 11);
      place(hSig);
      page.drawRectangle({ x: M, y: y(top + hSig), width: wSig, height: hSig, borderColor: TRAIT, borderWidth: 0.8 });
      texte(`Signature de l'${role.toLowerCase()}`, M + 10, top + 13, semi, 8.5);
      lignesSig.forEach((l, i) => texte(l, M + 10, top + 26 + i * 11, regular, tSig));
      page.drawRectangle({ x: Wp - M - wSig, y: y(top + hSig), width: wSig, height: hSig, borderColor: TRAIT, borderWidth: 0.8 });
      texte("Signature des parents", Wp - M - wSig + 10, top + 13, semi, 8.5);
      top += hSig;
    } else {
      // Bulletin de période historique : Directrice + titulaire.
      place(40);
      texte("La Directrice", Wp - M - 160, top + 10, semi, 9);
      if (titulaireNom) {
        const wHist = 200;
        const tHist = ajuste(titulaireNom, semi, 9, wHist, 7);
        texte(titulaireNom, M, top + 10, semi, tHist);
      }
      texte(titulaireNom ? `${role} de la classe` : "", M, top + 22, regular, 8, GRIS);
    }

    return { octets: await brouillon.save(), pages: brouillon.getPageCount() };
  }

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(res.regular, { subset: true });
  for (const [n, s] of syntheses.entries()) {
    let k = 1;
    let r = await rendre(s, k);
    while (r.pages > 1 && k > ECHELLE_MIN + 1e-9) {
      k = Math.max(ECHELLE_MIN, Math.round((k - 0.02) * 100) / 100);
      r = await rendre(s, k);
    }
    infos?.echelles.push(k);
    if (r.pages > 1) infos?.debordements.push(n);
    const poses = await doc.embedPdf(r.octets, [...Array(r.pages).keys()]);
    for (const p of poses) doc.addPage([W, H]).drawPage(p, { x: 0, y: 0, xScale: k, yScale: k });
  }
  // Pas de pied de page (ni ARIL / Préau, ni numérotation).
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

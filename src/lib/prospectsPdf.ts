// Liste des prospects en PDF (charte Préau/ESEJ) : coordonnées et suivi de chaque prospect filtré.

import { creerPlume, telechargerPdf, M, W } from "@/lib/documentPdf";

export type LignePdfProspect = {
  nom: string;
  adresse: string;
  courriel: string;
  telephone: string;
  segment: string;
  etape: string;
  relation: string;
  reserve: string;
  derniereAction: string;
  commentaire: string;
};

export async function telechargerListeProspects(lignes: LignePdfProspect[], filtres: string) {
  const p = await creerPlume();
  const { regular, semi, c } = p;
  const jour = new Date().toLocaleDateString("fr-FR");
  p.entete("Recherche de fonds — Liste des prospects", `${lignes.length} prospect${lignes.length > 1 ? "s" : ""} · ${filtres}`);
  const w = W - 2 * M;
  for (const l of lignes) {
    const infos = [
      `Type : ${l.segment} · État : ${l.etape}${l.relation ? ` · Relation : ${l.relation}` : ""}${l.reserve ? ` · Réservé à : ${l.reserve}` : ""}`,
      `Adresse : ${l.adresse || "—"}`,
      `Courriel : ${l.courriel || "—"} · Téléphone : ${l.telephone || "—"}`,
      `Dernière action : ${l.derniereAction || "—"}`,
      ...(l.commentaire ? [`Commentaire : ${l.commentaire}`] : []),
    ].flatMap((t) => p.coupe(t, regular, 8.5, w - 16));
    const h = 22 + infos.length * 11;
    p.place(h + 6);
    p.cadre(M, p.top, w, h, c.TRAIT, c.CREME);
    p.texte(l.nom || "—", M + 8, p.top + 14, semi, 10.5);
    infos.forEach((t, i) => p.texte(t, M + 8, p.top + 27 + i * 11, regular, 8.5, c.NAVY));
    p.top += h + 6;
  }
  if (lignes.length === 0) p.texte("Aucun prospect pour ces filtres.", M, p.top + 12, regular, 10, c.GRIS);
  const octets = await p.terminer(`Préau — Liste des prospects — éditée le ${jour}`);
  telechargerPdf(octets, `Prospects ${jour.replace(/\//g, "-")}`);
}

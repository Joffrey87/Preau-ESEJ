// Export PDF des ventes diverses (totaux par sous-catégorie + détail dus/payés), charte Préau/ESEJ.

import { creerPlume, telechargerPdf, M, W } from "@/lib/documentPdf";
import { DOMAINES, STATUTS, statutVente, type DomaineVente, type SousCategorie, type VenteDue, type VentePaiement } from "@/lib/ventes";
import { formatEuros } from "@/lib/format";

export async function telechargerVentesPdf(opts: {
  exercice: string;
  domaine: DomaineVente | "tous";
  sousCats: SousCategorie[];
  dues: VenteDue[];
  paiements: VentePaiement[];
  payeurDe: (d: VenteDue) => string;
}) {
  const { exercice, domaine, sousCats, dues, paiements, payeurDe } = opts;
  const domaines = domaine === "tous" ? (["ecole", "evenement"] as DomaineVente[]) : [domaine];
  const p = await creerPlume();
  const { NAVY, OR_DOUX, GRIS, BLANC, TRAIT } = p.c;
  const sousTitre = domaine === "tous" ? "Tous domaines" : DOMAINES.find((d) => d.v === domaine)?.label ?? "";
  p.entete(`Ventes diverses · ${exercice}`, sousTitre);
  p.texte(`Édité le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`, M, p.top, p.italic, 8.5, GRIS);
  p.top += 16;

  for (const dom of domaines) {
    const cats = sousCats.filter((s) => s.domaine === dom && !s.archive);
    const duesDom = dues.filter((d) => d.domaine === dom);
    p.place(40);
    p.rect(M, p.top, W - 2 * M, 22, OR_DOUX);
    p.texte(DOMAINES.find((d) => d.v === dom)?.label ?? dom, M + 6, p.top + 15, p.semi, 11);
    p.top += 28;

    if (!cats.length && !duesDom.length) {
      p.texte("Aucune vente pour ce domaine.", M + 4, p.top + 10, p.italic, 9, GRIS);
      p.top += 20;
      continue;
    }

    // Totaux par sous-catégorie
    p.texte("Totaux par sous-catégorie", M + 4, p.top + 10, p.semi, 9);
    p.top += 16;
    p.rect(M, p.top, W - 2 * M, 16, NAVY);
    p.texte("Sous-catégorie", M + 6, p.top + 11, p.semi, 8, BLANC);
    p.texte("Attendu", M + 280, p.top + 11, p.semi, 8, BLANC);
    p.texte("Payé", M + 360, p.top + 11, p.semi, 8, BLANC);
    p.texte("Reste", M + 440, p.top + 11, p.semi, 8, BLANC);
    p.top += 16;

    let totalAtt = 0, totalPay = 0;
    for (const cat of cats) {
      const lignes = duesDom.filter((d) => d.sous_categorie_id === cat.id);
      const att = lignes.reduce((s, d) => s + Number(d.montant_attendu), 0);
      const pay = lignes.reduce(
        (s, d) => s + paiements.filter((x) => x.vente_due_id === d.id).reduce((a, x) => a + Number(x.montant), 0),
        0,
      );
      totalAtt += att;
      totalPay += pay;
      if (p.place(14)) {
        p.rect(M, p.top, W - 2 * M, 16, NAVY);
        p.texte("Sous-catégorie", M + 6, p.top + 11, p.semi, 8, BLANC);
        p.top += 16;
      }
      p.texte(cat.nom, M + 6, p.top + 11, p.regular, 8.5);
      p.texte(formatEuros(att), M + 280, p.top + 11, p.regular, 8.5);
      p.texte(formatEuros(pay), M + 360, p.top + 11, p.regular, 8.5);
      p.texte(formatEuros(att - pay), M + 440, p.top + 11, p.regular, 8.5);
      p.top += 14;
    }
    p.page.drawLine({ start: { x: M, y: 841.89 - p.top }, end: { x: W - M, y: 841.89 - p.top }, thickness: 0.5, color: TRAIT });
    p.top += 4;
    p.texte("Total", M + 6, p.top + 11, p.semi, 9);
    p.texte(formatEuros(totalAtt), M + 280, p.top + 11, p.semi, 9);
    p.texte(formatEuros(totalPay), M + 360, p.top + 11, p.semi, 9);
    p.texte(formatEuros(totalAtt - totalPay), M + 440, p.top + 11, p.semi, 9);
    p.top += 20;

    // Détail
    p.texte("Détail des ventes", M + 4, p.top + 10, p.semi, 9);
    p.top += 16;
    for (const d of duesDom) {
      const pay = paiements.filter((x) => x.vente_due_id === d.id).reduce((a, x) => a + Number(x.montant), 0);
      const st = STATUTS.find((s) => s.v === statutVente(Number(d.montant_attendu), pay))!;
      const cat = sousCats.find((s) => s.id === d.sous_categorie_id)?.nom ?? "—";
      if (p.place(18)) { /* nouvelle page */ }
      p.texte(`${payeurDe(d)} · ${cat}`, M + 4, p.top + 11, p.regular, 8.5);
      p.texte(`${formatEuros(Number(d.montant_attendu))} → ${formatEuros(pay)} · ${st.label}`, M + 320, p.top + 11, p.regular, 8, GRIS);
      p.top += 14;
    }
    p.top += 10;
  }

  const octets = await p.terminer("Préau · École du Saint-Enfant-Jésus · Ventes diverses");
  await telechargerPdf(octets, `Ventes_diverses_${exercice}`);
}

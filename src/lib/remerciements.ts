// Remerciements (Président) : chaque don de 500 € et plus (hors dons boursiers) appelle une lettre de remerciement
// signée du Président, cochée « Remerciement envoyé » une fois postée.
//
// Le texte ci-dessous est un modèle provisoire (13/10/2026) : le Président fournira le sien.

import { construireRecuPdf } from "@/lib/recuPdf";
import { modeleRecuEnCache } from "@/lib/modeleRecu";
import { createClient } from "@/lib/supabase/client";
import { formatEuros } from "@/lib/format";
import type { DonPourRecu } from "@/lib/recu";

export { SEUIL_REMERCIEMENT } from "@/lib/seuilRemerciement";

/** Donnée minimale d'un don pour sa lettre (PII déjà déchiffré). */
export type DonRemerciement = Omit<DonPourRecu, "recu_numero" | "donateur_nom"> & { id: string; donateur_nom: string | null };

const dateLongue = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }).replace(/^1 /, "1er ");

/** Paragraphes de la lettre (modèle provisoire). */
export function texteRemerciement(d: Pick<DonRemerciement, "montant" | "date_don">): { paragraphes: string[]; fin: string } {
  return {
    paragraphes: [
      `Au nom de l'ARIL et de toute l'équipe de l'École du Saint-Enfant-Jésus, je tiens à vous remercier très chaleureusement pour le don de ${formatEuros(Number(d.montant))} que vous nous avez adressé le ${dateLongue(d.date_don)}.`,
      "Votre générosité nous touche profondément. Elle permet à l'école de poursuivre sa mission auprès des enfants : les instruire avec exigence, dans des classes à petits effectifs, et élever leur cœur vers le beau, le bien et le vrai.",
      "C'est grâce à des bienfaiteurs tels que vous que l'école peut accueillir chaque année de nouvelles familles et offrir à leurs enfants une éducation fidèle à ses convictions.",
      "Croyez à notre profonde reconnaissance et à nos prières.",
    ],
    fin: "Je vous prie d'agréer l'expression de mes sentiments dévoués et reconnaissants.",
  };
}

const pourRecu = (d: DonRemerciement): DonPourRecu => ({ ...d, recu_numero: null, donateur_nom: d.donateur_nom ?? "" });

/** Nom lisible du donateur (fichier, liste). */
export const nomDonateur = (d: Pick<DonRemerciement, "est_personne_morale" | "raison_sociale" | "donateur_nom" | "donateur_prenom">) =>
  (d.est_personne_morale ? d.raison_sociale || d.donateur_nom : [d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ")) || "Donateur";

/** Lettres de remerciement (une par don, mises bout à bout), téléchargées en un seul PDF. */
export async function telechargerRemerciements(dons: DonRemerciement[]): Promise<void> {
  if (!dons.length) return;
  const [{ PDFDocument }, modele] = await Promise.all([import("pdf-lib"), modeleRecuEnCache(createClient())]);
  const lettres = await Promise.all(dons.map((d) => construireRecuPdf(pourRecu(d), { modele, remerciement: texteRemerciement(d) })));
  let octets = lettres[0];
  if (lettres.length > 1) {
    const doc = await PDFDocument.create();
    for (const l of lettres) {
      const src = await PDFDocument.load(l);
      for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p);
    }
    doc.setTitle("Lettres de remerciement");
    octets = await doc.save();
  }
  const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = (dons.length === 1 ? `Remerciements ${nomDonateur(dons[0])} ${dons[0].date_don}` : `Lettres de remerciement (${dons.length})`).replace(/[\/:*?"<>|]/g, "-") + ".pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

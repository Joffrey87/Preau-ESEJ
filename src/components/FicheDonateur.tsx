"use client";

import { Modal } from "./GestionComptes";
import { formatEuros, formatDate } from "@/lib/format";
import { TONE_CLASSES } from "@/lib/statutDon";
import { badgesDe, badgeTemperature, temperatureDe, type ProfilDonateur } from "@/lib/donateurs";
import type { Don } from "@/components/GestionDons";

/** Recommandation d'action en une phrase, selon le profil. */
function recommandation(p: ProfilDonateur): string {
  if (p.estGrand && (p.etat === "sommeil" || p.etat === "perdu"))
    return "À relancer en priorité : grand donateur qui s'éloigne.";
  if (p.estGrand) return "Entretenir la relation : rendez-vous annuel, projet nominatif.";
  if (p.etat === "perdu") return "Dernière relance personnalisée, sinon archivage.";
  if (p.etat === "sommeil") return "Campagne de réactivation (« vous nous avez soutenus en… »).";
  if (p.estNouveau) return "Accueillir : remerciement rapide et présentation de l'école.";
  if (p.estPonctuel) return "Proposer de s'inscrire dans la durée (don mensuel).";
  if (p.estFidele) return "Fidéliser : proposer le club de dons mensuels.";
  return "Maintenir le lien.";
}

export default function FicheDonateur({
  profil,
  dons,
  onClose,
}: {
  profil: ProfilDonateur;
  dons: Don[];
  onClose: () => void;
}) {
  const temp = badgeTemperature(temperatureDe(profil));
  const historique = [...dons].sort((a, b) => (b.date_don ?? "").localeCompare(a.date_don ?? ""));
  const recent = historique[0]; // don le plus récent (pour l'adresse / contact à jour)

  // Répartition par année civile.
  const parAnnee = new Map<number, number>();
  for (const d of dons) {
    if (!d.date_don) continue;
    const y = Number(d.date_don.slice(0, 4));
    parAnnee.set(y, (parAnnee.get(y) ?? 0) + Number(d.montant || 0));
  }
  const annees = [...parAnnee.entries()].sort((a, b) => a[0] - b[0]);
  const maxAnnee = Math.max(1, ...annees.map(([, v]) => v));

  // Tendance sur la dernière année vs la précédente.
  let tendance: string | null = null;
  if (annees.length >= 2) {
    const dernier = annees[annees.length - 1][1];
    const precedent = annees[annees.length - 2][1];
    tendance = dernier > precedent * 1.15 ? "en hausse" : dernier < precedent * 0.85 ? "en repli" : "stable";
  }

  const contactMorale =
    profil.estMorale && recent
      ? [recent.donateur_titre, recent.donateur_nom, recent.donateur_prenom].filter(Boolean).join(" ").trim()
      : "";

  const tuiles: { label: string; valeur: string }[] = [
    { label: "Total donné", valeur: formatEuros(profil.cumul) },
    { label: "Dons", valeur: String(profil.nbDons) },
    { label: "Années", valeur: String(profil.nbAnnees) },
    { label: "Don moyen", valeur: formatEuros(profil.moyenne) },
    { label: "Meilleure année", valeur: formatEuros(profil.meilleureAnnee) },
    { label: "Cette année", valeur: profil.cumulAnnee ? formatEuros(profil.cumulAnnee) : "—" },
  ];

  return (
    <Modal title="Fiche donateur" onClose={onClose}>
      <div className="max-h-[74vh] space-y-4 overflow-y-auto pr-1">
        {/* Identité + badges */}
        <div>
          <div className="text-lg font-semibold">{profil.nom}</div>
          <div className="mt-1 space-y-0.5 text-sm text-muted">
            {profil.courriel && <div>{profil.courriel}</div>}
            {recent?.cp_ville && <div>{[recent.adresse, recent.cp_ville].filter(Boolean).join(" · ")}</div>}
            {contactMorale && <div>Contact : {contactMorale}</div>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {badgesDe(profil).map((b) => (
              <span key={b.key} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[b.tone]}`}>
                {b.label}
              </span>
            ))}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[temp.tone]}`}>
              {temp.label}
            </span>
          </div>
        </div>

        {/* Chiffres clés */}
        <div className="grid grid-cols-3 gap-2">
          {tuiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-border bg-surface px-3 py-2">
              <div className="text-xs text-muted">{t.label}</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">{t.valeur}</div>
            </div>
          ))}
        </div>

        {/* Lecture / interprétation */}
        <div className="rounded-lg border border-accent/40 bg-accent-soft/30 p-3 text-sm">
          <div className="mb-1 font-medium">Lecture</div>
          <p className="text-muted">
            Premier don le {formatDate(profil.premier)}, dernier le {formatDate(profil.dernier)}
            {profil.moisDepuisDernier > 0 ? ` (il y a ${profil.moisDepuisDernier} mois)` : " (ce mois-ci)"}.
            {tendance && ` Générosité ${tendance} sur la dernière année.`} Don moyen de {formatEuros(profil.moyenne)}
            {profil.nbAnnees > 1 ? `, régulier sur ${profil.nbAnnees} années` : ""}.
          </p>
          <p className="mt-1.5 font-medium text-foreground">→ {recommandation(profil)}</p>
        </div>

        {/* Répartition par année */}
        {annees.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Par année</h3>
            <div className="space-y-1">
              {annees
                .slice()
                .reverse()
                .map(([an, montant]) => (
                  <div key={an} className="flex items-center gap-2 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-muted">{an}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((montant / maxAnnee) * 100)}%` }} />
                    </div>
                    <span className="w-20 shrink-0 text-right tabular-nums">{formatEuros(montant)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Historique détaillé */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">Historique des dons</h3>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-muted">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Montant</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Catégorie</th>
                </tr>
              </thead>
              <tbody>
                {historique.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDate(d.date_don)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatEuros(Number(d.montant))}</td>
                    <td className="px-3 py-2 text-muted">{d.mode_paiement ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{d.categorie_donateur ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

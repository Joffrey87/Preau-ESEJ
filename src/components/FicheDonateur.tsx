"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./GestionComptes";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate } from "@/lib/format";
import { TONE_CLASSES } from "@/lib/statutDon";
import { badgesDe, badgeTemperature, temperatureDe, type ProfilDonateur } from "@/lib/donateurs";
import type { Don } from "@/components/GestionDons";
import ModifierDonateur from "@/components/ModifierDonateur";
import { HistoriqueSuivi } from "@/components/SuiviDonateur";
import type { SuiviAction } from "@/lib/suiviDonateurs";
import { PROFILS_BUREAU, PROFILS_RECHERCHE_FONDS } from "@/lib/profilsContact";

/** Recommandation d'action en une phrase, selon le profil. */
function recommandation(p: ProfilDonateur): string {
  if (p.estGrand && (p.etat === "sommeil" || p.etat === "perdu"))
    return "À relancer en priorité : grand donateur qui s'éloigne.";
  if (p.estGrand) return "Entretenir la relation : rendez-vous annuel, projet nominatif.";
  if (p.etat === "perdu") return "Dernière relance personnalisée, sinon archivage.";
  if (p.etat === "sommeil") return "Campagne de réactivation (« vous nous avez soutenus en… »).";
  if (p.estNouveau) return "Accueillir : remerciement rapide et présentation de l'école.";
  if (p.estFidele) return "Fidéliser : proposer le club de dons mensuels.";
  return "Maintenir le lien.";
}

export default function FicheDonateur({
  profil,
  dons,
  onClose,
  suivi = [],
}: {
  profil: ProfilDonateur;
  dons: Don[];
  /** Historique des actions de suivi, du plus récent au plus ancien. */
  suivi?: SuiviAction[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const temp = badgeTemperature(temperatureDe(profil));

  /** Fonction réservée (Recherche de fonds, bureau) : ne modifie que les deux indicateurs « bourse ». */
  async function definir(ids: string[], donateur: boolean | null, don: boolean | null) {
    setBusy(true);
    setErreur(null);
    const { error } = await createClient().rpc("definir_boursier", { p_ids: ids, p_donateur_bourse: donateur, p_don_boursier: don });
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    router.refresh();
  }
  async function definirFamille(statut: "actuelle" | "ancienne" | null) {
    setBusy(true);
    setErreur(null);
    const { error } = await createClient().rpc("definir_famille", { p_ids: dons.map((d) => d.id), p_statut: statut });
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    router.refresh();
  }
  // Cocher « Donateur Bourse » ne marque aucun don d'office : on coche ensuite les dons boursiers un à un.
  // Décocher remet tous ses dons en dons ordinaires.
  const basculerDonateur = (actif: boolean) => {
    if (
      !actif &&
      profil.nbDonsBourse > 0 &&
      !window.confirm(`Retirer ce donateur des « Donateurs Bourse » ? Ses ${profil.nbDonsBourse} don(s) boursier(s) redeviendront des dons ordinaires.`)
    ) {
      return;
    }
    void definir(dons.map((d) => d.id), actif, actif ? null : false);
  };
  async function definirNePasSolliciter(actif: boolean) {
    setBusy(true);
    setErreur(null);
    const { error } = await createClient().rpc("definir_ne_pas_solliciter", { p_ids: dons.map((d) => d.id), p_valeur: actif });
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    router.refresh();
  }
  async function definirContactReserve(valeur: string) {
    setBusy(true);
    setErreur(null);
    const { error } = await createClient().rpc("definir_contact_reserve", { p_ids: dons.map((d) => d.id), p_valeur: valeur });
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    router.refresh();
  }
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
      ? [recent.donateur_titre, recent.donateur_prenom, recent.donateur_nom].filter(Boolean).join(" ").trim()
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
    <Modal title="Fiche donateur" onClose={onClose} fermerAuClicExterieur enregistrerEnFermant large>
      <div className="space-y-4">
        {/* Identité + badges */}
        <div>
          <div className="text-lg font-semibold">{profil.nom}</div>
          <div className="mt-1 space-y-0.5 text-sm text-muted">
            {profil.courriel && <div>{profil.courriel}</div>}
            {recent?.cp_ville && <div>{[recent.adresse, recent.cp_ville].filter(Boolean).join(" · ")}</div>}
            {contactMorale && <div>Contact : {contactMorale}</div>}
          </div>
          <div className="mt-2">
            <ModifierDonateur key={recent?.id} dons={dons} />
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
            {profil.boursier && (
              <span className="inline-flex items-center rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">Donateur Bourse</span>
            )}
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <input type="checkbox" checked={profil.boursier} disabled={busy} onChange={(e) => basculerDonateur(e.target.checked)} className="h-4 w-4" />
            <span>
              <strong>Donateur Bourse</strong>
              <span className="ml-1 text-xs text-muted">— donne pour payer des bourses de frais de scolarité</span>
            </span>
          </label>
          <label className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <strong>Famille de l&apos;école</strong>
            <select
              value={profil.famille ?? ""}
              disabled={busy}
              onChange={(e) => void definirFamille((e.target.value || null) as "actuelle" | "ancienne" | null)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">Non</option>
              <option value="actuelle">Famille actuelle</option>
              <option value="ancienne">Ancienne famille</option>
            </select>
          </label>
          <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <input type="checkbox" checked={profil.nePasSolliciter} disabled={busy} onChange={(e) => void definirNePasSolliciter(e.target.checked)} className="h-4 w-4" />
            <span>
              <strong>Ne souhaite pas être sollicité</strong>
              <span className="ml-1 text-xs text-muted">— exclu des exports, des campagnes et des actions suggérées</span>
            </span>
          </label>
          <label className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <strong>Contact réservé à</strong>
            <select
              value={profil.contactReserveA ?? ""}
              disabled={busy}
              onChange={(e) => void definirContactReserve(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">Personne en particulier</option>
              {profil.contactReserveA && ![...PROFILS_RECHERCHE_FONDS, ...PROFILS_BUREAU].includes(profil.contactReserveA) && (
                <option value={profil.contactReserveA}>{profil.contactReserveA}</option>
              )}
              <optgroup label="Recherche de fonds">
                {PROFILS_RECHERCHE_FONDS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Bureau">
                {PROFILS_BUREAU.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="text-xs text-muted">— lui seul contacte ce donateur</span>
          </label>
          {erreur && <p className="mt-1 text-xs text-negative">{erreur}</p>}
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

        {/* Derniers dons (les plus anciens sont résumés par année ci-dessus). */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {profil.boursier ? "Dons (cochez les dons boursiers)" : historique.length > 5 ? "5 derniers dons" : "Détail des dons"}
            </h3>
            {profil.boursier && historique.length > 0 && (
              <span className="flex gap-1.5 text-xs">
                <button
                  type="button"
                  disabled={busy || profil.nbDonsBourse === historique.length}
                  onClick={() => void definir(historique.map((d) => d.id), null, true)}
                  className="rounded-md border border-border px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
                >
                  Tout cocher
                </button>
                <button
                  type="button"
                  disabled={busy || profil.nbDonsBourse === 0}
                  onClick={() => void definir(historique.map((d) => d.id), null, false)}
                  className="rounded-md border border-border px-2 py-1 hover:bg-surface-2 disabled:opacity-40"
                >
                  Tout décocher
                </button>
              </span>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-left text-muted">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Montant</th>
                  <th className="px-3 py-2 font-medium">Mode</th>
                  <th className="px-3 py-2 font-medium">Catégorie</th>
                  {profil.boursier && <th className="px-3 py-2 text-center font-medium">Don boursier</th>}
                </tr>
              </thead>
              <tbody>
                {(profil.boursier ? historique : historique.slice(0, 5)).map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDate(d.date_don)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatEuros(Number(d.montant))}</td>
                    <td className="px-3 py-2 text-muted">{d.mode_paiement ?? "—"}</td>
                    <td className="px-3 py-2 text-muted">{d.categorie_donateur ?? "—"}</td>
                    {profil.boursier && (
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!d.don_boursier}
                          disabled={busy}
                          onChange={(e) => void definir([d.id], null, e.target.checked)}
                          aria-label="Don boursier"
                          className="h-4 w-4"
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!profil.boursier && historique.length > 5 && (
            <p className="mt-1 text-xs text-muted">
              + {historique.length - 5} don{historique.length - 5 > 1 ? "s" : ""} antérieur
              {historique.length - 5 > 1 ? "s" : ""} — total repris dans « Par année » ci-dessus.
            </p>
          )}
        </div>

        <HistoriqueSuivi historique={suivi} />

        {/* Lecture / interprétation (en bas) */}
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
      </div>
    </Modal>
  );
}

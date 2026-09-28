"use client";

import { Fragment, useState } from "react";
import JaugeScolarite, { etatJauge } from "@/components/JaugeScolarite";
import { BoutonAttestation } from "@/components/EspaceClient";
import { formatEurosCourt as formatEuros, formatDate } from "@/lib/format";
import type { Association, Situation } from "@/lib/espaceFamille";
import type { NatureAttestee } from "@/lib/attestationPdf";

const MODES: Record<string, string> = { virement: "Virement", prelevement: "Prélèvement", cheque: "Chèque", carte: "Carte", especes: "Espèces" };

const COULEURS: Record<string, string> = {
  vert: "bg-positive/10 text-positive",
  jaune: "bg-gold-soft text-gold",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  bleu: "bg-accent-soft text-accent",
  gris: "bg-surface-2 text-muted",
};

export type AnneeFamille = { annee: string; nbEnfants: number | null; s: Situation };

/**
 * Frais de scolarité d'une famille, présentés comme dans l'onglet du bureau :
 * une ligne par année (total dû « mensuel ×10 », mois d'avance, frais de
 * dossier, avancement, réglé avec retard, reste), détail au clic avec les
 * attestations de paiement.
 */
export default function FraisScolariteFamille({
  famille,
  annees,
  association,
  anneeOuverte,
}: {
  famille: string;
  annees: AnneeFamille[];
  association: Association;
  anneeOuverte: string | null;
}) {
  const [ouverte, setOuverte] = useState<string | null>(anneeOuverte);

  const attestation = (annee: string, nature: NatureAttestee, montant: number, date: string, origine: string, mode: string | null) => ({
    famille, annee_scolaire: annee, nature, montant, date, origine, mode,
  });

  return (
    <div className="rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="px-3 py-3 font-medium">Année</th>
            <th className="px-3 py-3 text-center font-medium">Enf.</th>
            <th className="px-3 py-3 text-right font-medium">Total dû</th>
            <th className="px-3 py-3 text-center font-medium" title="Dépôt versé une fois par enfant ; il couvre son dernier mois à l'école.">
              Mois d&apos;avance
            </th>
            <th className="px-3 py-3 text-center font-medium">Frais de dossier</th>
            <th className="hidden px-3 py-3 font-medium lg:table-cell">Avancement</th>
            <th className="px-3 py-3 text-right font-medium">Réglé</th>
            <th className="px-3 py-3 text-right font-medium">Reste</th>
          </tr>
        </thead>
        <tbody>
          {annees.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-muted">Aucune inscription enregistrée.</td>
            </tr>
          )}
          {annees.map(({ annee, nbEnfants, s }) => {
            const deroulee = ouverte === annee;
            const depot = s.depot;
            const fraisOk = s.frais.couleur !== "jaune";
            return (
              <Fragment key={annee}>
                <tr
                  onClick={() => setOuverte(deroulee ? null : annee)}
                  title="Afficher le détail des versements"
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${deroulee ? "bg-surface-2" : ""}`}
                >
                  <td className="px-3 py-3">
                    <span className={`mr-1.5 inline-block text-muted transition-transform ${deroulee ? "rotate-90" : ""}`}>›</span>
                    {annee}
                  </td>
                  <td className="px-3 py-3 text-center tabular-nums">{nbEnfants ?? "—"}</td>
                  <td
                    className="px-3 py-3 text-right tabular-nums whitespace-nowrap"
                    title={`Total dû : ${formatEuros(s.du)}${s.partJuin.montant > 0 ? ` (juin non dû : −${formatEuros(s.partJuin.montant)})` : ""}`}
                  >
                    {formatEuros(s.mensuel)}×10
                    {s.partJuin.montant > 0 && <span className="block text-[11px] text-muted">−{formatEuros(s.partJuin.montant)} juin</span>}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${COULEURS[depot.couleur] ?? COULEURS.gris}`}
                      title={`Attendu ${formatEuros(depot.du)} · versé ${formatEuros(depot.detenu)}`}
                    >
                      {depot.couleur === "vert" ? "Versé" : depot.couleur === "gris" ? "—" : "Incomplet"}
                      {depot.couleur !== "gris" && (
                        <span className="opacity-80">
                          {formatEuros(depot.detenu)}/{formatEuros(depot.du)}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`text-base font-semibold ${fraisOk ? "text-positive" : "text-gold"}`}
                      title={
                        s.frais.nouveaux > 0
                          ? `${formatEuros(s.frais.du)} attendus, ${formatEuros(s.frais.paye)} réglés`
                          : "Rien à régler cette année"
                      }
                    >
                      {fraisOk ? "✓" : "!"}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3 lg:table-cell">
                    <JaugeScolarite etat={etatJauge(s.mensuel, s.regle, annee)} anneeScolaire={annee} compacte />
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${
                      s.retard > 0 ? "font-medium text-negative" : s.aReglerFinDeMois > 0 ? "font-medium text-orange-500" : "text-positive"
                    }`}
                    title={
                      s.retard > 0
                        ? `En retard de ${formatEuros(s.retard)} (réglé : ${formatEuros(s.regle)})`
                        : s.aReglerFinDeMois > 0
                          ? `À régler avant la fin du mois (réglé : ${formatEuros(s.regle)})`
                          : undefined
                    }
                  >
                    {s.retard > 0
                      ? `−${formatEuros(s.retard)}`
                      : s.aReglerFinDeMois > 0
                        ? `−${formatEuros(s.aReglerFinDeMois)}`
                        : formatEuros(s.regle)}
                  </td>
                  <td
                    className={`px-3 py-3 text-right tabular-nums whitespace-nowrap ${
                      s.retard > 0 ? "text-negative" : s.reste < -0.005 ? "text-positive" : ""
                    }`}
                    title={s.reste < -0.005 ? "Trop-perçu" : undefined}
                  >
                    {formatEuros(s.reste)}
                  </td>
                </tr>

                {deroulee && (
                  <tr className="border-b border-border bg-surface-2/40">
                    <td colSpan={8} className="px-4 pb-3">
                      <div className="grid gap-4 py-2 lg:grid-cols-3">
                        <section className="rounded-lg border border-border bg-surface p-3 lg:col-span-2">
                          <h3 className="mb-1 text-sm font-semibold">Frais de scolarité · {annee}</h3>
                          {s.partJuin.montant > 0 && (
                            <p className="mb-2 rounded bg-gold-soft px-2 py-1 text-xs text-gold">
                              Dernière année à l&apos;école pour {s.partJuin.enfants.length} enfant(s) en CM2 :{" "}
                              {formatEuros(s.partJuin.montant)} de juin non dus, couverts par le mois d&apos;avance.
                            </p>
                          )}
                          <table className="w-full text-xs">
                            <tbody>
                              {s.lignes.length === 0 && (
                                <tr><td className="py-2 text-muted">Aucun versement enregistré.</td></tr>
                              )}
                              {s.lignes.map((l, k) => (
                                <tr key={k} className="border-b border-border/40 last:border-0">
                                  <td className="w-20 py-1 pr-2 tabular-nums text-muted">{l.date ? formatDate(l.date) : "—"}</td>
                                  <td className="py-1 pr-2">
                                    {l.libelle}
                                    {l.mode ? <span className="ml-1 text-muted">({MODES[l.mode] ?? l.mode})</span> : null}
                                  </td>
                                  <td className="py-1 pr-2 text-muted">{l.origine}</td>
                                  <td className={`py-1 text-right tabular-nums ${l.montant < 0 ? "text-negative" : ""}`}>{formatEuros(l.montant)}</td>
                                  <td className="w-20 py-1 text-right">
                                    {l.date && l.montant > 0 && l.nature !== "classeur" && (
                                      <BoutonAttestation association={association} attestation={attestation(annee, l.nature, l.montant, l.date, l.origine, l.mode)} />
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {s.lignes.length > 1 && (
                                <tr>
                                  <td />
                                  <td className="pt-1 font-semibold">Total réglé</td>
                                  <td />
                                  <td className="pt-1 text-right font-semibold tabular-nums">{formatEuros(s.regle)}</td>
                                  <td />
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </section>
                        <div className="space-y-4">
                          <section className="rounded-lg border border-border bg-surface p-3">
                            <h3 className="mb-1 text-sm font-semibold">Frais de dossier</h3>
                            <p className="mb-1 text-xs text-muted">
                              {s.frais.nouveaux > 0
                                ? `${s.frais.nouveaux} enfant(s) entrant(s) : ${formatEuros(s.frais.du)} attendus, ${formatEuros(s.frais.paye)} réglés.`
                                : "Aucun enfant entrant cette année."}
                            </p>
                            {s.frais.details.filter((d) => d.type === "recette").map((d, k) => (
                              <div key={k} className="flex justify-between text-xs">
                                <span>{formatDate(d.date_operation)} · {formatEuros(Number(d.montant))}</span>
                                <BoutonAttestation association={association} attestation={attestation(annee, "frais_dossier", Number(d.montant), d.date_operation, d.origine ?? "Famille", null)} />
                              </div>
                            ))}
                          </section>
                          <section className="rounded-lg border border-border bg-surface p-3">
                            <h3 className="mb-1 text-sm font-semibold">Mois d&apos;avance (dépôt)</h3>
                            <p className="mb-1 text-xs text-muted">Attendu {formatEuros(depot.du)} · versé {formatEuros(depot.detenu)}</p>
                            {depot.details.filter((d) => d.type === "recette").map((d, k) => (
                              <div key={k} className="flex justify-between text-xs">
                                <span>{formatDate(d.date_operation)} · {formatEuros(Number(d.montant))}</span>
                                <BoutonAttestation association={association} attestation={attestation(annee, "mois_avance", Number(d.montant), d.date_operation, d.origine ?? "Famille", null)} />
                              </div>
                            ))}
                          </section>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

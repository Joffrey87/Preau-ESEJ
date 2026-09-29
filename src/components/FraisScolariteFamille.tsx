"use client";

import { Fragment, useState } from "react";
import JaugeScolarite, { AideReglement, etatJauge } from "@/components/JaugeScolarite";
import { BoutonAttestation } from "@/components/EspaceClient";
import { formatEurosCourt as formatEuros, formatDate } from "@/lib/format";
import type { Association, Situation } from "@/lib/espaceFamille";
import type { NatureAttestee } from "@/lib/attestationPdf";

const MODES: Record<string, string> = { virement: "Virement", prelevement: "Prélèvement", cheque: "Chèque", carte: "Carte", especes: "Espèces" };

type Nature = "scolarite" | "dossier" | "depot";

const NATURES: Record<Nature, { l: string; c: string }> = {
  scolarite: { l: "Frais de scolarité", c: "bg-accent-soft text-accent" },
  dossier: { l: "Frais de dossier", c: "bg-surface-2 text-foreground" },
  depot: { l: "Mois d'avance", c: "bg-gold-soft text-gold" },
};

type Paiement = {
  annee: string;
  date: string | null;
  nature: Nature;
  libelle: string | null;
  montant: number;
  origine: string;
  mode: string | null;
  /** Nature attestable ; absente pour une saisie du classeur (non datée). */
  attestee: NatureAttestee | null;
};

export type AnneeFamille = { annee: string; nbEnfants: number | null; s: Situation };

/** Coche verte si en règle, « ! » ambre sinon : même lecture que dans l'onglet du bureau. */
function Etat({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span title={title} className={`cursor-help text-base font-semibold ${ok ? "text-positive" : "text-gold"}`}>
      {ok ? "✓" : "!"}
    </span>
  );
}

/** Les paiements d'une année scolaire (et d'elle seule), du plus récent au plus ancien. */
function paiements(s: Situation): Paiement[] {
  const dates: Paiement[] = [];
  const classeur: Paiement[] = [];
  for (const l of s.lignes) {
    const p: Paiement = {
      annee: s.annee,
      date: l.date,
      nature: "scolarite",
      libelle: l.nature === "classeur" ? l.libelle : null,
      montant: l.montant,
      origine: l.origine,
      mode: l.mode,
      attestee: l.nature === "classeur" ? null : l.nature,
    };
    (l.date ? dates : classeur).push(p);
  }
  const depuis = (nature: Nature, attestee: NatureAttestee) => (d: Situation["depot"]["details"][number]): Paiement => ({
    annee: s.annee,
    date: d.date_operation,
    nature,
    libelle: d.type === "depense" ? "Restitution" : null,
    montant: d.type === "depense" ? -Number(d.montant) : Number(d.montant),
    origine: d.origine ?? "Famille",
    mode: null,
    attestee: d.type === "recette" ? attestee : null,
  });
  // Le dépôt suit la famille d'année en année : on ne garde que les versements de celle-ci.
  const deLAnnee = (d: { inscription_id: string }) => d.inscription_id === s.inscriptionId;
  dates.push(
    ...s.frais.details.filter(deLAnnee).map(depuis("dossier", "frais_dossier")),
    ...s.depot.details.filter(deLAnnee).map(depuis("depot", "mois_avance")),
  );
  dates.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  // Les saisies du classeur, sans date, ferment la liste (juin → septembre, puis le report).
  return [...dates, ...classeur.reverse()];
}

function TablePaiements({ lignes, famille, association }: { lignes: Paiement[]; famille: string; association: Association }) {
  if (lignes.length === 0) return <p className="py-1 text-muted">Aucun paiement enregistré.</p>;
  return (
    <table className="w-full">
      <thead>
        <tr className="text-left text-[11px] text-muted">
          <th className="border-b border-border pb-1 pr-2 font-medium">Date</th>
          <th className="border-b border-border pb-1 pr-2 font-medium">Nature</th>
          <th className="border-b border-border pb-1 pr-2 font-medium">Détail</th>
          <th className="border-b border-border pb-1 text-right font-medium">Montant</th>
          <th className="border-b border-border pb-1 text-right font-medium">Attestation</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((p, k) => {
          return (
            <Fragment key={k}>
              <tr className="border-b border-border/40 last:border-0">
                <td className="w-[4.5rem] py-1 pr-2 tabular-nums text-muted">{p.date ? formatDate(p.date) : "—"}</td>
                <td className="w-32 py-1 pr-2">
                  <span className={`inline-block whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium ${NATURES[p.nature].c}`}>
                    {NATURES[p.nature].l}
                  </span>
                </td>
                <td className="py-1 pr-2 text-muted">
                  {p.libelle ?? p.origine}
                  {p.mode ? ` · ${MODES[p.mode] ?? p.mode}` : ""}
                </td>
                <td className={`py-1 text-right tabular-nums whitespace-nowrap ${p.montant < 0 ? "text-negative" : ""}`}>
                  {formatEuros(p.montant)}
                </td>
                <td className="w-20 py-1 text-right">
                  {p.date && p.attestee && p.montant > 0 && (
                    <BoutonAttestation
                      association={association}
                      attestation={{
                        famille,
                        annee_scolaire: p.annee,
                        nature: p.attestee,
                        montant: p.montant,
                        date: p.date,
                        origine: p.origine,
                        mode: p.mode,
                      }}
                    />
                  )}
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Frais de scolarité d'une famille, présentés comme dans l'onglet du bureau :
 * une ligne par année (total dû « mensuel ×10 », mois d'avance, frais de
 * dossier, avancement, réglé avec retard, reste) et, au clic, ses paiements
 * avec les attestations.
 */
export default function FraisScolariteFamille({
  famille,
  annees,
  association,
}: {
  famille: string;
  annees: AnneeFamille[];
  association: Association;
}) {
  // Replié par défaut : l'indication « Détails » invite à ouvrir.
  const [ouverte, setOuverte] = useState<string | null>(null);
  const basculer = (annee: string) => setOuverte((o) => (o === annee ? null : annee));

  return (
    <>
      <div className="rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-3 font-medium">Année scolaire</th>
              <th className="px-2 py-3 text-center font-medium">Enfants</th>
              <th className="px-3 py-3 text-right font-medium">Total dû</th>
              <th
                className="w-px px-2 py-3 text-center font-medium leading-tight"
                title="Dépôt versé une fois par enfant ; il couvre son dernier mois à l'école."
              >
                Mois
                <br />
                d&apos;avance
              </th>
              <th className="w-px px-2 py-3 text-center font-medium leading-tight">
                Frais de
                <br />
                dossier
              </th>
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
              const lignes = deroulee ? paiements(s) : [];
              return (
                <Fragment key={annee}>
                  <tr
                    onClick={() => basculer(annee)}
                    title="Afficher les paiements"
                    className={`cursor-pointer hover:bg-surface-2 ${deroulee ? "bg-surface-2" : ""}`}
                  >
                    <td className="px-3 py-3">
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
                    <td className="px-2 py-3 text-center">
                      <Etat ok={depot.couleur !== "jaune"} title={`Attendu ${formatEuros(depot.du)} · versé ${formatEuros(depot.detenu)}`} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Etat
                        ok={s.frais.couleur !== "jaune"}
                        title={
                          s.frais.nouveaux > 0
                            ? `${formatEuros(s.frais.du)} attendus, ${formatEuros(s.frais.paye)} réglés`
                            : "Rien à régler cette année"
                        }
                      />
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
                      <AideReglement retard={s.retard > 0} finDeMois={s.aReglerFinDeMois > 0} />
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
                  <tr className={deroulee ? "bg-surface-2" : "border-b border-border last:border-0"}>
                    <td colSpan={8} className="px-3 pb-2 text-center">
                      <button
                        type="button"
                        onClick={() => basculer(annee)}
                        aria-expanded={deroulee}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gold hover:underline"
                      >
                        {deroulee ? "Masquer" : "Détails"}
                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={`h-4 w-4 transition-transform ${deroulee ? "rotate-180" : ""}`}>
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </td>
                  </tr>

                  {deroulee && (
                    <tr className="border-b border-border bg-surface-2/40">
                      <td colSpan={8} className="px-4 py-2 text-left text-xs">
                        <h3 className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted">Détails des paiements</h3>
                        <TablePaiements lignes={lignes} famille={famille} association={association} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Dossier de la famille pour les années précédentes : pour chacune, un
 * bandeau (dû, réglé, reste) puis ses paiements, avec les attestations.
 */
export function DossierAnneesPrecedentes({
  famille,
  annees,
  association,
}: {
  famille: string;
  annees: AnneeFamille[];
  association: Association;
}) {
  const triees = [...annees].sort((a, b) => b.annee.localeCompare(a.annee));
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">
        Dossier famille <span className="font-normal text-muted">· années précédentes</span>
      </h2>
      <div className="rounded-xl border border-border bg-surface p-4">
        {triees.length === 0 ? (
          <p className="text-sm text-muted">Aucune année précédente à l&apos;école.</p>
        ) : (
          <div className="space-y-5">
            {triees.map(({ annee, nbEnfants, s }) => (
              <div key={annee}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-fg">{annee}</span>
                  {nbEnfants != null && (
                    <span className="text-muted">
                      {nbEnfants} enfant{nbEnfants > 1 ? "s" : ""}
                    </span>
                  )}
                  <span className="text-muted">
                    Dû <span className="tabular-nums text-foreground">{formatEuros(s.du)}</span>
                  </span>
                  <span className="text-muted">
                    Réglé <span className="tabular-nums text-foreground">{formatEuros(s.regle)}</span>
                  </span>
                  <span className="ml-auto text-muted">
                    Reste{" "}
                    <span className={`font-medium tabular-nums ${s.reste > 0.005 ? "text-negative" : s.reste < -0.005 ? "text-positive" : "text-foreground"}`}>
                      {formatEuros(s.reste)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 px-1 text-xs">
                  <TablePaiements lignes={paiements(s)} famille={famille} association={association} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

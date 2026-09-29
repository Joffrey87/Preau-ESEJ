"use client";

import { Fragment, useState } from "react";
import JaugeScolarite, { etatJauge } from "@/components/JaugeScolarite";
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

function TablePaiements({
  lignes,
  famille,
  association,
  avecAnnee = false,
}: {
  lignes: Paiement[];
  famille: string;
  association: Association;
  avecAnnee?: boolean;
}) {
  if (lignes.length === 0) return <p className="py-1 text-muted">Aucun paiement enregistré.</p>;
  return (
    <table className="w-full">
      <tbody>
        {lignes.map((p, k) => {
          const nouvelleAnnee = avecAnnee && (k === 0 || lignes[k - 1].annee !== p.annee);
          return (
            <Fragment key={k}>
              {nouvelleAnnee && (
                <tr>
                  <td colSpan={5} className={`pb-0.5 font-semibold ${k > 0 ? "pt-3" : ""}`}>
                    Année scolaire {p.annee}
                    <span className="ml-2 font-normal tabular-nums text-muted">
                      {formatEuros(lignes.filter((x) => x.annee === p.annee).reduce((t, x) => t + x.montant, 0))}
                    </span>
                  </td>
                </tr>
              )}
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

/** Détail d'une année scolaire, et le dossier complet de la famille à la demande. */
function DetailAnnee({
  lignes,
  annees,
  famille,
  association,
}: {
  lignes: Paiement[];
  annees: AnneeFamille[];
  famille: string;
  association: Association;
}) {
  const [complet, setComplet] = useState(false);
  return (
    <>
      <TablePaiements lignes={lignes} famille={famille} association={association} />
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setComplet((v) => !v)}
          aria-expanded={complet}
          className={`rounded-lg border px-2.5 py-1 font-medium ${
            complet ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface hover:bg-surface-2"
          }`}
        >
          Dossier famille complet
        </button>
      </div>
      {complet && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Dossier complet · frais de scolarité, toutes années scolaires
          </h4>
          <TablePaiements
            lignes={[...annees].sort((a, b) => b.annee.localeCompare(a.annee)).flatMap((a) => paiements(a.s))}
            famille={famille}
            association={association}
            avecAnnee
          />
        </div>
      )}
    </>
  );
}

/**
 * Frais de scolarité d'une famille, présentés comme dans l'onglet du bureau :
 * la jauge d'avancement et la synthèse de l'année, puis une ligne par année
 * (total dû « mensuel ×10 », mois d'avance, frais de dossier, avancement,
 * réglé avec retard, reste) et, au clic, ses paiements avec les attestations.
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
  // La jauge suit l'année dépliée ; à défaut, l'année en cours.
  const [anneeJauge, setAnneeJauge] = useState<string | null>(anneeOuverte);
  const enTete = annees.find((a) => a.annee === anneeJauge) ?? annees[0];

  const basculer = (annee: string) => {
    const deroulee = ouverte === annee;
    setOuverte(deroulee ? null : annee);
    if (!deroulee) setAnneeJauge(annee);
  };

  return (
    <>
      {enTete && (
        <>
          <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Avancement des règlements · {enTete.annee}</h2>
              <span className="text-xs text-muted">
                Une graduation par mensualité, de septembre à juin. Le repère marque ce qui devrait être réglé à ce jour.
              </span>
            </div>
            <JaugeScolarite etat={etatJauge(enTete.s.mensuel, enTete.s.regle, enTete.annee)} anneeScolaire={enTete.annee} />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { l: "Total attendu", v: enTete.s.du, c: "" },
              { l: "Total réglé", v: enTete.s.regle, c: "text-positive" },
              { l: "Reste à régler", v: enTete.s.reste, c: enTete.s.retard > 0 ? "text-negative" : enTete.s.reste < -0.005 ? "text-positive" : "" },
            ].map((t) => (
              <div key={t.l} className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-muted">{t.l}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${t.c}`}>{formatEuros(t.v)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-3 font-medium">Année scolaire</th>
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
              const lignes = deroulee ? paiements(s) : [];
              return (
                <Fragment key={annee}>
                  <tr
                    onClick={() => basculer(annee)}
                    title="Afficher les paiements"
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
                      <Etat ok={depot.couleur !== "jaune"} title={`Attendu ${formatEuros(depot.du)} · versé ${formatEuros(depot.detenu)}`} />
                    </td>
                    <td className="px-3 py-3 text-center">
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
                      <td colSpan={8} className="px-4 py-2 text-xs">
                        <DetailAnnee lignes={lignes} annees={annees} famille={famille} association={association} />
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

"use client";

import { useMemo, useState } from "react";
import { formatEuros, formatDate } from "@/lib/format";
import { TONE_CLASSES } from "@/lib/statutDon";
import {
  planCampagne,
  relancesComplementaires,
  badgeTemperature,
  type CibleCampagne,
  type ProfilDonateur,
} from "@/lib/donateurs";

/** Dernier jour du mois de `iso` (défaut d'échéance : « fin de ce mois »). */
function finDuMois(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const dernier = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(dernier).padStart(2, "0")}`;
}

/** Texte d'analyse d'une cible (infobulle « ? »). */
function analyseCible(c: CibleCampagne): string {
  const anciennete =
    c.moisDepuisDernier <= 0 ? "ce mois-ci" : `il y a ${c.moisDepuisDernier} mois`;
  const tempLabel = badgeTemperature(c.temperature).label.toLowerCase();
  return [
    `Profil : ${formatEuros(c.cumul)} donnés au total, sur ${c.nbAnnees} an${c.nbAnnees > 1 ? "s" : ""} (${c.nbDons} don${c.nbDons > 1 ? "s" : ""}).`,
    `Meilleure année : ${formatEuros(c.meilleureAnnee)}. Don habituel : ${formatEuros(Math.round(c.cumul / Math.max(1, c.nbDons)))}.`,
    `Dernier don ${anciennete} → relation « ${tempLabel} ».`,
    `Probabilité de redon : ${c.probaDetail}.`,
    `Montant à demander : ${formatEuros(c.demande)} (don habituel arrondi).`,
    `Collecte espérée = ${formatEuros(c.demande)} × ${Math.round(c.proba * 100)} % = ${formatEuros(c.espere)}.`,
  ].join("\n");
}

export default function CampagneCollecte({
  profils,
  today,
  onOuvrirFiche,
}: {
  profils: ProfilDonateur[];
  today: string;
  onOuvrirFiche?: (cle: string) => void;
}) {
  const [objectif, setObjectif] = useState(10000);
  const [echeance, setEcheance] = useState(finDuMois(today));
  const [delaiMin, setDelaiMin] = useState(6);
  const [toutVoir, setToutVoir] = useState(false);

  const plan = useMemo(
    () => planCampagne(profils, objectif, { delaiMinMois: delaiMin }),
    [profils, objectif, delaiMin],
  );
  const relances = useMemo(
    () => relancesComplementaires(profils, { delaiMinMois: delaiMin }),
    [profils, delaiMin],
  );

  const atteignable = plan.nbPourObjectif > 0;
  const cumulObjectif = atteignable
    ? plan.cibles[plan.nbPourObjectif - 1].cumulEspere
    : plan.totalEspere;
  const progression = Math.min(100, Math.round((cumulObjectif / objectif) * 100));

  // Par défaut on montre les cibles nécessaires + 5 de marge ; sinon tout.
  const limite = toutVoir ? plan.cibles.length : Math.max(plan.nbPourObjectif + 5, 8);
  const affichees = plan.cibles.slice(0, limite);

  return (
    <section className="rounded-xl border border-accent/40 bg-accent-soft/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">🎯 Campagne collecte</h2>
          <p className="text-xs text-muted">
            Quels donateurs solliciter pour réunir un objectif avant une échéance.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">
            <span className="mb-1 block">Objectif</span>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1">
              <input
                type="number"
                min={0}
                step={500}
                value={objectif}
                onChange={(e) => setObjectif(Math.max(0, Number(e.target.value)))}
                className="w-24 bg-transparent text-right text-sm font-medium tabular-nums outline-none"
              />
              <span className="text-sm text-muted">€</span>
            </div>
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Échéance</span>
            <input
              type="date"
              value={echeance}
              onChange={(e) => setEcheance(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none"
            />
          </label>
          <label className="text-xs text-muted">
            <span className="mb-1 block">Sans don depuis ≥</span>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1">
              <input
                type="number"
                min={0}
                max={60}
                step={1}
                value={delaiMin}
                onChange={(e) => setDelaiMin(Math.max(0, Number(e.target.value)))}
                className="w-12 bg-transparent text-right text-sm font-medium tabular-nums outline-none"
              />
              <span className="text-sm text-muted">mois</span>
            </div>
          </label>
        </div>
      </div>

      {/* Verdict + progression */}
      <div className="rounded-lg border border-border bg-surface p-3">
        {atteignable ? (
          <p className="text-sm">
            En sollicitant les <strong>{plan.nbPourObjectif}</strong> premiers donateurs ci-dessous, la collecte
            espérée atteint <strong>{formatEuros(cumulObjectif)}</strong> — objectif de{" "}
            <strong>{formatEuros(objectif)}</strong> jouable d&apos;ici le {formatDate(echeance)}.
          </p>
        ) : (
          <p className="text-sm text-gold">
            L&apos;espérance totale sur les donateurs ciblés est de{" "}
            <strong>{formatEuros(plan.totalEspere)}</strong>, en-dessous de l&apos;objectif. Élargir la cible
            (réduire le délai), relever les montants, ou compléter par d&apos;autres axes que les dons.
          </p>
        )}
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progression}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted tabular-nums">
          <span>Espérance cumulée {formatEuros(cumulObjectif)}</span>
          <span>{formatEuros(objectif)}</span>
        </div>
      </div>

      {/* Table des cibles */}
      {plan.cibles.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Aucun donateur ne correspond (seuil de sollicitation ou délai). Réduisez le délai « sans don depuis »
          ou importez davantage de dons.
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Donateur</th>
                  <th className="px-3 py-2 text-right font-medium">Déjà donné</th>
                  <th className="px-3 py-2 font-medium">Dernier don</th>
                  <th className="px-3 py-2 text-right font-medium">Demander</th>
                  <th className="px-3 py-2 text-right font-medium">Proba</th>
                  <th className="px-3 py-2 text-right font-medium">Espérée</th>
                  <th className="px-3 py-2 text-right font-medium">Cumul esp.</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {affichees.map((c, i) => {
                  const b = badgeTemperature(c.temperature);
                  return (
                    <tr
                      key={c.cle}
                      className={`border-b border-border last:border-0 ${c.dansObjectif ? "bg-accent-soft/20" : ""}`}
                    >
                      <td className="px-3 py-2 text-muted tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">
                        {onOuvrirFiche ? (
                          <button
                            type="button"
                            onClick={() => onOuvrirFiche(c.cle)}
                            className="text-left font-medium text-accent hover:underline"
                          >
                            {c.nom}
                          </button>
                        ) : (
                          <div className="font-medium">{c.nom}</div>
                        )}
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[b.tone]}`}>
                            {b.label}
                          </span>
                          {c.estGrand && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES.violet}`}>
                              Grand
                            </span>
                          )}
                          {c.estFidele && (
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES.blue}`}>
                              Fidèle
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="font-semibold tabular-nums">{formatEuros(c.cumul)}</div>
                        <div className="text-xs text-muted tabular-nums">
                          {c.nbDons} don{c.nbDons > 1 ? "s" : ""} · {c.nbAnnees} an{c.nbAnnees > 1 ? "s" : ""} · max {formatEuros(c.meilleureAnnee)}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="tabular-nums">{formatDate(c.dernier)}</div>
                        <div className="text-xs text-muted">
                          {c.moisDepuisDernier === 0 ? "ce mois-ci" : `il y a ${c.moisDepuisDernier} mois`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEuros(c.demande)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{Math.round(c.proba * 100)} %</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEuros(c.espere)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{formatEuros(c.cumulEspere)}</td>
                      <td className="px-2 py-2 text-center">
                        <span
                          title={analyseCible(c)}
                          className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-border text-xs text-muted hover:border-accent hover:text-accent"
                          aria-label="Détail de l'analyse"
                        >
                          ?
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {plan.cibles.length > affichees.length && !toutVoir && (
            <button
              type="button"
              onClick={() => setToutVoir(true)}
              className="mt-2 text-sm text-accent hover:underline"
            >
              Voir les {plan.cibles.length - affichees.length} autres donateurs
            </button>
          )}
          <p className="mt-3 text-xs text-muted">
            Survolez le « ? » de chaque ligne pour le détail du calcul. « Demander » = don habituel arrondi ;
            « proba » et « espérée » sont des repères de priorisation (récence &amp; fidélité), pas une promesse.
          </p>
        </>
      )}

      {/* Relances complémentaires : donateurs récents mais sous leur niveau habituel */}
      {relances.length > 0 && (
        <div className="mt-5 rounded-lg border border-gold/40 bg-gold-soft/20 p-3">
          <h3 className="text-sm font-semibold">Relances complémentaires — à votre appréciation</h3>
          <p className="mt-0.5 text-xs text-muted">
            Ils ont donné <strong>récemment</strong> (donc exclus de la campagne ci-dessus), mais <strong>en-dessous
            de leur niveau habituel</strong> : leur proposer un complément fléché sur un projet précis peut être
            pertinent. Classés par probabilité — à vous de trancher.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-3 py-2 font-medium">Donateur</th>
                  <th className="px-3 py-2 text-right font-medium">Cette année</th>
                  <th className="px-3 py-2 text-right font-medium">Habituel</th>
                  <th className="px-3 py-2 text-right font-medium">Complément</th>
                  <th className="px-3 py-2 text-right font-medium">Proba</th>
                  <th className="px-3 py-2 font-medium">Argument</th>
                </tr>
              </thead>
              <tbody>
                {relances.map((r) => (
                  <tr key={r.cle} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2">
                      {onOuvrirFiche ? (
                        <button
                          type="button"
                          onClick={() => onOuvrirFiche(r.cle)}
                          className="text-left font-medium text-accent hover:underline"
                        >
                          {r.nom}
                        </button>
                      ) : (
                        <span className="font-medium">{r.nom}</span>
                      )}
                      <div className="text-xs text-muted">
                        il y a {r.moisDepuisDernier} mois
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{formatEuros(r.cumulAnnee)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatEuros(r.meilleureAnnee)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatEuros(r.complement)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">{Math.round(r.proba * 100)} %</td>
                    <td className="px-3 py-2 text-xs text-muted">{r.argument}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

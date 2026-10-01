"use client";

import { useState } from "react";
import { formatDate, formatEuros } from "@/lib/format";

/**
 * Jauge des dons de l'exercice (Relations donateurs) : blocs de 10 000 €, 7 au départ
 * (70 000 €), puis 3 de plus à chaque dépassement (100 000, 130 000…).
 *
 * La « trace » garde la mémoire de l'année : chaque don remplit la jauge dans la
 * couleur de la MOYENNE ANNUELLE (dons cumulés ÷ mois écoulés) au jour où il
 * arrive, et la partie déjà tracée ne change plus. La couleur ne change qu'au
 * passage d'une tranche à l'autre, avec un fondu :
 *   rouge < 4 000 €/mois · orange < 5 000 · jaune < 6 000 (5 800 = équilibre budgétaire) · vert ≥ 6 000.
 * Gris pendant les 15 premiers jours de l'exercice (moyenne pas encore parlante).
 * Le chevron marque où il faudrait en être au rythme de 5 800 €/mois.
 */

/** Échelle de départ ; au-delà, on ajoute 3 blocs de 10 000 € (100 000, 130 000…). */
const ECHELLE_INITIALE = 70000;
const PAS_ECHELLE = 30000;
/** Objectif annuel : atteint = 🏆 ; puis une médaille 🥉 à 70 000 €, une autre à 100 000 €, etc. */
const OBJECTIF_ANNUEL = 60000;
const MINIMUM_VITAL = 5800;

const echelleDe = (total: number) =>
  total <= ECHELLE_INITIALE ? ECHELLE_INITIALE : ECHELLE_INITIALE + Math.ceil((total - ECHELLE_INITIALE) / PAS_ECHELLE) * PAS_ECHELLE;
const medaillesDe = (total: number) =>
  total < ECHELLE_INITIALE ? 0 : 1 + Math.floor((total - ECHELLE_INITIALE) / PAS_ECHELLE);
const GRIS = "#B4B2A9";
const TRANCHES: { min: number; couleur: string; nom: string }[] = [
  { min: 0, couleur: "#E24B4A", nom: "rouge" },
  { min: 4000, couleur: "#EF7E27", nom: "orange" },
  { min: 5000, couleur: "#EFC327", nom: "jaune" },
  { min: 6000, couleur: "#639922", nom: "vert" },
];
const tranche = (moy: number) => [...TRANCHES].reverse().find((t) => moy >= t.min) ?? TRANCHES[0];

export type DonsExercice = {
  exercice: string;
  debut: string;
  fin: string;
  dons: { date: string; montant: number }[];
} | null;

const JOUR = 86400000;
const MOIS_MOYEN = 365.25 / 12;
const jours = (de: string, a: string) => (new Date(a + "T12:00:00").getTime() - new Date(de + "T12:00:00").getTime()) / JOUR + 1;

const moisEcoules = (debut: string, d: string) => Math.max(jours(debut, d), 1) / MOIS_MOYEN;
const enRodage = (debut: string, d: string) => jours(debut, d) <= 15;

type Segment = { a0: number; a1: number; date: string; moy: number; couleur: string };

/** Segments de la trace : un par don, coloré selon la moyenne annuelle à sa date. */
function trace(dons: { date: string; montant: number }[], debut: string): Segment[] {
  const out: Segment[] = [];
  let cumul = 0;
  for (const d of dons) {
    const m = Number(d.montant);
    if (!(m > 0)) continue;
    const a0 = cumul;
    cumul += m;
    const moy = cumul / moisEcoules(debut, d.date);
    out.push({ a0, a1: cumul, date: d.date, moy, couleur: enRodage(debut, d.date) ? GRIS : tranche(moy).couleur });
  }
  return out;
}

export default function JaugeDons({ donnees, aujourdhui }: { donnees: DonsExercice; aujourdhui: string }) {
  const [graphe, setGraphe] = useState(false);
  if (!donnees) return null;

  const segments = trace(donnees.dons, donnees.debut);
  const total = segments.at(-1)?.a1 ?? 0;
  const moisJ = moisEcoules(donnees.debut, aujourdhui);
  const moyJ = total / moisJ;
  const trJ = enRodage(donnees.debut, aujourdhui) ? null : tranche(moyJ);
  const echelle = echelleDe(total);
  const nbBlocs = echelle / 10000;
  const attendu = Math.min(MINIMUM_VITAL * moisJ, echelle);
  const medailles = medaillesDe(total);

  // Dégradé de la trace : couleur franche, fondu court au changement de couleur.
  const pct = (v: number) => (Math.min(v, echelle) / echelle) * 100;
  const arrets: string[] = [];
  segments.forEach((s, k) => {
    const prec = segments[k - 1];
    const fondu = prec && prec.couleur !== s.couleur ? Math.min(1.5, (pct(s.a1) - pct(s.a0)) / 2) : 0;
    if (fondu) arrets.push(`${s.couleur} ${(pct(s.a0) + fondu).toFixed(2)}%`);
    else arrets.push(`${s.couleur} ${pct(s.a0).toFixed(2)}%`);
    arrets.push(`${s.couleur} ${pct(s.a1).toFixed(2)}%`);
  });
  const degrade = arrets.length ? `linear-gradient(90deg, ${arrets.join(", ")})` : "none";

  return (
    <section className="mb-5 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
        <div>
          <div className="text-xs text-muted">Dons reçus · {donnees.exercice.replace("Exercice ", "")}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">{formatEuros(total)}</span>
            {total >= OBJECTIF_ANNUEL && (
              <span className="text-xl" title={`Objectif de ${formatEuros(OBJECTIF_ANNUEL)} atteint`} aria-label="Objectif atteint">🏆</span>
            )}
            {medailles > 0 && (
              <span
                className="text-xl"
                title={`${medailles} palier${medailles > 1 ? "s" : ""} franchi${medailles > 1 ? "s" : ""} au-delà de l'objectif (70 000 €${medailles > 1 ? ", puis tous les 30 000 €" : ""})`}
                aria-label={`${medailles} médaille${medailles > 1 ? "s" : ""}`}
              >
                {"🥉".repeat(medailles)}
              </span>
            )}
          </div>
        </div>
        <div className="min-w-[260px] flex-1">
          {/* Chevron : où en être au rythme de 5 800 €/mois */}
          <div className="relative h-3">
            <span
              className="absolute -translate-x-1/2 text-[11px] leading-none text-muted"
              style={{ left: `${pct(attendu)}%` }}
              title={`Au rythme de l'équilibre budgétaire (${formatEuros(MINIMUM_VITAL)}/mois) : ${formatEuros(attendu)} attendus au ${formatDate(aujourdhui)}`}
            >
              ▼
            </span>
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${nbBlocs}, minmax(0, 1fr))` }}>
            {Array.from({ length: nbBlocs }, (_, k) => {
              const part = Math.max(0, Math.min(1, (total - k * 10000) / 10000));
              return (
                <div key={k} className="relative h-5 overflow-hidden rounded border border-border bg-surface-2">
                  <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${part * 100}%` }}>
                    <div className="absolute inset-y-0" style={{ left: `-${k * 100}%`, width: `${nbBlocs * 100}%`, background: degrade }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-0.5 grid gap-1 text-[10px] text-muted" style={{ gridTemplateColumns: `repeat(${nbBlocs}, minmax(0, 1fr))` }}>
            {Array.from({ length: nbBlocs }, (_, k) => (
              <span key={k} className="text-right">
                {(k + 1) * 10 === OBJECTIF_ANNUEL / 1000 && <span title="Objectif annuel">🏆 </span>}
                {(k + 1) * 10} k
              </span>
            ))}
          </div>
          {graphe && (
            <GrapheMoyenne segments={segments} debut={donnees.debut} fin={donnees.fin} aujourdhui={aujourdhui} moyJ={moyJ} echelle={echelle} />
          )}
        </div>
      </div>
      <p className="mt-1 text-center text-[11px] text-muted">
        <span aria-hidden="true">▼</span> <span aria-hidden="true">┄</span> Équilibre budgétaire · {formatEuros(MINIMUM_VITAL)}/mois
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          Moyenne annuelle :{" "}
          {trJ ? (
            <span className="font-semibold tabular-nums" style={{ color: trJ.couleur }}>{formatEuros(moyJ)}/mois</span>
          ) : (
            <span className="text-muted">trop tôt pour la calculer (15 premiers jours)</span>
          )}
        </span>
        <button type="button" onClick={() => setGraphe((v) => !v)} className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-2">
          {graphe ? "Masquer le graphe" : "Graphe"}
        </button>
      </div>
    </section>
  );
}

const MOIS_COURTS = ["Sept", "Oct", "Nov", "Déc", "Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août"];

/**
 * Vitesse de croisière : moyenne mensuelle des dons au fil des 12 mois de
 * l'exercice, alignée sous la jauge. Bandes de couleur pâles (tranches),
 * équilibre budgétaire en pointillé ; l'échelle verticale suit le palier de la
 * jauge (palier ÷ 12 × 1,3). Pas d'axe chiffré : valeur au survol.
 */
function GrapheMoyenne({
  segments,
  debut,
  fin,
  aujourdhui,
  moyJ,
  echelle,
}: {
  segments: { date: string; moy: number; couleur: string }[];
  debut: string;
  fin: string;
  aujourdhui: string;
  moyJ: number;
  echelle: number;
}) {
  const W = 1000;
  const H = 100;
  const ymax = Math.max((echelle / 12) * 1.3, ...segments.map((s) => s.moy), moyJ) * 1.02;
  const duree = jours(debut, fin);
  const xPct = (d: string) => ((jours(debut, d) - 0.5) / duree) * 100;
  const yPct = (v: number) => 100 - (Math.min(v, ymax) / ymax) * 96 - 2;
  const points = [...segments.map((s) => ({ d: s.date, v: s.moy, c: s.couleur })), { d: aujourdhui, v: moyJ, c: tranche(moyJ).couleur }];
  const dernier = points[points.length - 1];
  return (
    <div className="mt-1.5">
      <div className="relative h-12 overflow-hidden rounded-sm" title={`Moyenne au ${formatDate(aujourdhui)} : ${formatEuros(moyJ)}/mois`}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full text-foreground" aria-hidden="true">
          {TRANCHES.map((t, k) => {
            const haut = Math.min(TRANCHES[k + 1]?.min ?? ymax, ymax);
            return <rect key={t.nom} x={0} width={W} y={yPct(haut)} height={Math.max(0, yPct(t.min) - yPct(haut))} fill={t.couleur} opacity={0.14} />;
          })}
          <line x1={0} x2={W} y1={yPct(MINIMUM_VITAL)} y2={yPct(MINIMUM_VITAL)} stroke="currentColor" strokeDasharray="6 5" opacity={0.5} vectorEffect="non-scaling-stroke" />
          <polyline
            points={points.map((p) => `${(xPct(p.d) / 100) * W},${yPct(p.v)}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            opacity={0.7}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Point du jour, dans la couleur de sa tranche (hors du SVG étiré : reste rond). */}
        <span
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{ left: `${xPct(dernier.d)}%`, top: `${yPct(dernier.v)}%`, background: dernier.c }}
        />
      </div>
      <div className="mt-0.5 grid grid-cols-12 text-center text-[9px] leading-tight text-muted">
        {MOIS_COURTS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </div>
  );
}

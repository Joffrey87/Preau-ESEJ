"use client";

import { useId, useState, type CSSProperties } from "react";
import styles from "./JaugeDons.module.css";
import {
  BLOC,
  CONFORT_MENSUEL,
  EQUILIBRE_MENSUEL,
  LIBELLES_TRANCHES,
  MOIS,
  SEUILS,
  echelleDe,
  recompensesDe,
  tranche,
  type SegmentTrace,
  type Tranche,
} from "./config";

export type JaugeDonsProps = {
  /** Libellé de l'exercice, ex. "2026-2027". */
  exercice: string;
  /** Total des dons reçus sur l'exercice, en euros. */
  total: number;
  /** Moyenne annuelle, en €/mois. */
  moyenne: number;
  /** 12 valeurs de septembre à août ; null pour les mois à venir. */
  moyennesMensuelles: (number | null)[];
  /** Remplissage de la jauge, en euros cumulés. */
  trace: SegmentTrace[];
  /** Cumul attendu aujourd'hui au rythme de l'équilibre précaire (chevron du jour). */
  attendu: number;
  className?: string;
};

const NBSP = "\u00A0";
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
/** Même rendu côté serveur et navigateur (espace fine insécable entre milliers). */
const nombre = (v: number) => nf.format(Math.round(v)).replace(/\s/g, "\u202F");
const borner = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
/** « 5,3k » : montant en milliers, une décimale. */
const kilo = (v: number) => `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k`;
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

function Chevron({
  className,
  width = 9,
  height = 6,
  style,
}: {
  className?: string;
  width?: number;
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 10 7"
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 0h10L5 7z" fill="currentColor" />
    </svg>
  );
}

/* ---------- Micro-échelle des tranches, repérée par le chevron ---------- */
const LARGEUR_SEG = 15; // doit correspondre à .echelleSeg dans le CSS
const ESPACE_SEG = 2;

function EchelleTranches({ moyenne }: { moyenne: number }) {
  const bornes: [Tranche, number, number][] = [
    ["rouge", 0, SEUILS.orange],
    ["orange", SEUILS.orange, SEUILS.jaune],
    ["jaune", SEUILS.jaune, SEUILS.vert],
    ["vert", SEUILS.vert, SEUILS.vert + (SEUILS.vert - SEUILS.jaune)],
  ];
  const k = bornes.findIndex(([t]) => t === tranche(moyenne));
  const [, bas, haut] = bornes[k];
  const p = borner((moyenne - bas) / (haut - bas), 0, 1);
  const largeur = 4 * LARGEUR_SEG + 3 * ESPACE_SEG;
  const x = borner(k * (LARGEUR_SEG + ESPACE_SEG) + p * LARGEUR_SEG, 4, largeur - 4);

  return (
    <span className={styles.echelle} aria-hidden="true">
      <Chevron className={styles.echelleChevron} width={8} height={5.6} style={{ left: x }} />
      {bornes.map(([t], i) => (
        <i key={t} className={cx(styles.echelleSeg, styles[t], i === k && styles.echelleSegActif)} />
      ))}
    </span>
  );
}

/* ---------- Jauge : blocs de 10 000 € (8 au départ, puis 10, 12…) ---------- */
function Jauge({ total, trace, attendu }: { total: number; trace: SegmentTrace[]; attendu: number }) {
  const nbBlocs = echelleDe(total) / BLOC;
  // Chevron du jour : où il faudrait en être aujourd'hui, avec la somme en k€ à sa droite.
  const echelle = nbBlocs * BLOC;
  const jour = Math.min(Math.max(attendu, 0), echelle);
  const iJour = Math.min(nbBlocs - 1, Math.floor(jour / BLOC));
  const posJour = ((jour - iJour * BLOC) / BLOC) * 100;
  const finJauge = jour / echelle > 0.92;
  const dernier = trace.length - 1;

  return (
    <div
      className={styles.jauge}
      style={{ "--nb": nbBlocs } as CSSProperties}
      role="img"
      aria-label={`${nombre(total)} € reçus `}
    >
      <div className={cx(styles.rangee, styles.reperes)} aria-hidden="true">
        {Array.from({ length: nbBlocs }, (_, i) => (
          <span key={i} className={styles.cellule}>
            {i === iJour && (
              <>
                <Chevron className={cx(styles.chevronJour, styles.jaune)} style={{ left: `${posJour}%` }} />
                <span
                  className={cx(styles.etiquetteJour, styles.jaune, finJauge && styles.etiquetteJourGauche)}
                  style={{ left: `${posJour}%` }}
                >
                  {kilo(jour)}
                </span>
              </>
            )}
          </span>
        ))}
      </div>

      <div className={styles.rangee} aria-hidden="true">
        {Array.from({ length: nbBlocs }, (_, b) => {
          const s0 = b * BLOC;
          const e0 = s0 + BLOC;
          return (
            <span key={b} className={styles.bloc}>
              {trace.map((seg, i) => {
                const a = Math.max(seg.de, s0);
                const z = Math.min(seg.a, e0);
                if (z <= a) return null;
                const gauche = ((a - s0) / BLOC) * 100;
                const largeur = ((z - a) / BLOC) * 100;
                const pointe = i === dernier && seg.a <= e0;
                return (
                  <span
                    key={i}
                    className={cx(styles.remplissage, styles[seg.tranche], pointe && styles.pointe)}
                    style={{
                      left: `${gauche}%`,
                      width: pointe ? `${largeur}%` : `calc(${largeur}% + 0.6px)`,
                    }}
                  />
                );
              })}
            </span>
          );
        })}
      </div>

      <div className={cx(styles.rangee, styles.graduations)} aria-hidden="true">
        {Array.from({ length: nbBlocs }, (_, i) => {
          const v = (i + 1) * BLOC;
          return (
            <span key={i} className={total >= v ? styles.atteint : undefined}>
              {v / 1000}
              {NBSP}k
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Graphe des 12 mois (bouton « Détails ») ---------- */
function Graphe({ moyennesMensuelles }: { moyennesMensuelles: (number | null)[] }) {
  const points = moyennesMensuelles.flatMap((v, i) => (v == null ? [] : [{ i, v }]));
  const max = Math.max(0, ...points.map((p) => p.v));
  const vmax = Math.max(8000, Math.ceil((max * 1.04) / 1000) * 1000);
  const Y = (v: number) => (1 - borner(v, 0, vmax) / vmax) * 100;
  const X = (i: number) => ((i + 0.5) / 12) * 100;

  const bandes: [number, number, Tranche][] = [
    [0, SEUILS.orange, "rouge"],
    [SEUILS.orange, SEUILS.jaune, "orange"],
    [SEUILS.jaune, SEUILS.vert, "jaune"],
    [SEUILS.vert, vmax, "vert"],
  ];
  const description = points.map((p) => `${MOIS[p.i]} ${nombre(p.v)} €`).join(", ");

  return (
    <>
      <div
        className={styles.zone}
        role="img"
        aria-label={`Moyenne mensuelle sur l’exercice : ${description}. Pointillé : équilibre précaire à ${nombre(EQUILIBRE_MENSUEL)} € par mois.`}
      >
        <div className={styles.bandes}>
          {bandes.map(([bas, haut, t]) => (
            <span
              key={t}
              className={cx(styles.bande, styles[t])}
              style={{ top: `${Y(haut)}%`, height: `${Y(bas) - Y(haut)}%` }}
            />
          ))}
        </div>
        <span className={styles.equilibre} style={{ top: `${Y(EQUILIBRE_MENSUEL)}%` }} />
        <span className={styles.equilibreLibelle} style={{ top: `${Y(EQUILIBRE_MENSUEL)}%` }} aria-hidden="true">
          {nombre(EQUILIBRE_MENSUEL)}
        </span>
        {points.length > 1 && (
          <svg className={styles.courbe} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={points.map((p) => `${X(p.i).toFixed(3)},${Y(p.v).toFixed(3)}`).join(" ")} />
          </svg>
        )}
        {points.map((p, n) => (
          <span
            key={p.i}
            className={cx(styles.point, styles[tranche(p.v)], n === points.length - 1 && styles.pointDernier)}
            style={{ left: `${X(p.i)}%`, top: `${Y(p.v)}%` }}
            title={`${MOIS[p.i]} : ${nombre(p.v)} €/mois`}
          />
        ))}
      </div>
      <div className={styles.mois} aria-hidden="true">
        {MOIS.map((m, i) => (
          <span key={m} className={moyennesMensuelles[i] != null ? styles.moisEcoule : undefined}>
            {m}
          </span>
        ))}
      </div>
    </>
  );
}

/* ---------- Composant ---------- */
export default function JaugeDons({
  exercice,
  total,
  moyenne,
  moyennesMensuelles,
  trace,
  attendu,
  className,
}: JaugeDonsProps) {
  const [ouvert, setOuvert] = useState(false);
  const idDetails = useId();
  const t = tranche(moyenne);
  const recompenses = recompensesDe(total);

  return (
    <section className={cx(styles.racine, className)} aria-label={`Dons ${exercice}`}>
      {/* 1. Ligne de tête */}
      <div className={styles.tete}>
        <div className={styles.libelle}>
          Dons <span className={styles.insecable}>{exercice}</span>
        </div>
        <div className={styles.centre}>
          <div className={styles.total}>
            {nombre(total)}
            {NBSP}€
            {recompenses.length > 0 && (
              <span className={styles.recompenses}>
                {recompenses.map((p, i) => (
                  <span key={i} role="img" aria-label={p.libelle} title={p.libelle}>
                    {p.emoji}
                  </span>
                ))}
              </span>
            )}
          </div>
          <div className={styles.moyenne}>
            <span>
              Moyenne{NBSP}:{" "}
              <span className={cx(styles.valeur, styles[t])} title={LIBELLES_TRANCHES[t]}>
                {nombre(moyenne)}
                {NBSP}€/mois
              </span>
            </span>
            <EchelleTranches moyenne={moyenne} />
          </div>
        </div>
        <div className={styles.colonneFantome} aria-hidden="true" />
      </div>

      {/* 2. Jauge */}
      <Jauge total={total} trace={trace} attendu={attendu} />

      {/* 3. Ligne fixe : légende + Détails */}
      <div className={styles.pied}>
        <p className={styles.legende}>
          <span className={styles.item}>
            Cible : <Chevron className={cx(styles.legendeChevron, styles.jaune)} />
            Équilibre précaire{" "}
            <span className={cx(styles.valeur, styles.jaune)}>
              {nombre(EQUILIBRE_MENSUEL)}
              {NBSP}€/mois
            </span>{" "}
            (soit {nombre(attendu)}
            {NBSP}€ à ce jour)
          </span>
          <span className={styles.separateur} aria-hidden="true">
            ·
          </span>
          <span className={styles.item}>
            Confort ·{" "}
            <span className={cx(styles.valeur, styles.vert)}>
              {nombre(CONFORT_MENSUEL)}
              {NBSP}€/mois
            </span>
          </span>
        </p>
        <button
          type="button"
          className={styles.bouton}
          aria-expanded={ouvert}
          aria-controls={idDetails}
          onClick={() => setOuvert((o) => !o)}
        >
          Détails
          <svg className={styles.caret} viewBox="0 0 10 6" width="10" height="6" aria-hidden="true" focusable="false">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* 4. Graphe, sous tout le reste */}
      <div id={idDetails} className={cx(styles.details, ouvert && styles.ouvert)} aria-hidden={!ouvert}>
        <div>
          <div className={styles.graphe}>
            <Graphe moyennesMensuelles={moyennesMensuelles} />
          </div>
        </div>
      </div>
    </section>
  );
}

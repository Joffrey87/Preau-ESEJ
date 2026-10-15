"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { classeEleve, note20, titrePeriode, type Synthese } from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import { anneeScolaireDe } from "@/lib/absences";
import { todayISO } from "@/lib/format";
import VueBulletin from "./VueBulletin";

export type BulletinFamille = { id: string; eleveId: string; synthese: Synthese; publieLe: string | null; luLe: string | null; ordre: number };

const NIVEAUX = ["CM2", "CM1", "CE2", "CE1", "CP", "GS", "MS", "PS"];
const rangNiveau = (n: string | null | undefined) => {
  const i = NIVEAUX.indexOf(n ?? "");
  return i < 0 ? NIVEAUX.length : i;
};
/** Enfants, l'aîné (classe la plus haute, d'après son bulletin le plus récent) d'abord, puis par prénom. */
const parPrenom = (bs: BulletinFamille[]) => {
  const m = new Map<string, { prenom: string; niveau: string | null; annee: string; ordre: number }>();
  for (const b of bs) {
    const x = m.get(b.eleveId);
    const p = b.synthese.periode;
    if (!x || p.annee > x.annee || (p.annee === x.annee && b.ordre > x.ordre))
      m.set(b.eleveId, { prenom: b.synthese.eleve.prenom, niveau: b.synthese.eleve.niveau, annee: p.annee, ordre: b.ordre });
  }
  return [...m]
    .sort((a, b) => rangNiveau(a[1].niveau) - rangNiveau(b[1].niveau) || a[1].prenom.localeCompare(b[1].prenom, "fr"))
    .map(([id, x]) => [id, x.prenom] as [string, string]);
};
const recentsDabord = (a: BulletinFamille, b: BulletinFamille) => b.synthese.periode.annee.localeCompare(a.synthese.periode.annee) || b.ordre - a.ordre;

/**
 * Espace famille : en haut, les bulletins de l'année en cours (une pastille par enfant, l'aîné d'abord, ses bulletins dessous) ;
 * dessous, repliée, la section « Années précédentes » (par année, puis par enfant, avec la classe de l'année). Un
 * enfant qui a quitté l'école n'apparaît que là. L'ouverture d'un bulletin vaut accusé de lecture.
 */
export default function BulletinsFamille({ bulletins, apercu }: { bulletins: BulletinFamille[]; apercu: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const annee = anneeScolaireDe(todayISO());
  const courants = useMemo(() => bulletins.filter((b) => b.synthese.periode.annee === annee), [bulletins, annee]);
  const anciens = useMemo(() => bulletins.filter((b) => b.synthese.periode.annee !== annee), [bulletins, annee]);
  const enfants = useMemo(() => parPrenom(courants), [courants]);
  // Années précédentes : année (plus récente d'abord) -> enfants (l'aîné d'abord) -> bulletins.
  const historique = useMemo(
    () =>
      [...new Set(anciens.map((b) => b.synthese.periode.annee))]
        .sort((x, y) => y.localeCompare(x))
        .map((a) => {
          const deLAnnee = anciens.filter((b) => b.synthese.periode.annee === a);
          return { annee: a, enfants: parPrenom(deLAnnee).map(([id, prenom]) => ({ id, prenom, lot: deLAnnee.filter((b) => b.eleveId === id) })) };
        }),
    [anciens],
  );
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [anciensOuverts, setAnciensOuverts] = useState(false);
  const [lus, setLus] = useState<Set<string>>(new Set(bulletins.filter((b) => b.luLe).map((b) => b.id)));
  const [erreur, setErreur] = useState<string | null>(null);

  if (!bulletins.length) {
    return <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">Aucun bulletin publié pour le moment.</div>;
  }

  // Un trimestre = un bulletin : l'ouvrir vaut lecture de toutes ses périodes.
  const ouvrir = (cle: string, bs: BulletinFamille[]) => {
    setOuvert(ouvert === cle ? null : cle);
    if (apercu) return;
    for (const b of bs)
      if (!lus.has(b.id)) sb.rpc("bulletin_lu", { p_id: b.id }).then(() => setLus((s) => new Set(s).add(b.id)));
  };
  const nonLusAnciens = anciens.filter((b) => !lus.has(b.id)).length;
  const nomPeriode = (b: BulletinFamille) => (b.synthese.periode.numero ? `Période ${b.synthese.periode.numero}` : b.synthese.periode.libelle);
  const titreTrimestre = (b: BulletinFamille) => {
    const t = b.synthese.periode.trimestre;
    return t ? `${t === 1 ? "1er" : `${t}e`} trimestre` : titrePeriode(b.synthese.periode);
  };

  /**
   * Bulletin d'un trimestre : toutes ses périodes (periodes.trimestre), dans l'ordre chronologique. La tuile montre la
   * moyenne de la période la plus récente ; « Lire » les affiche toutes l'une sous l'autre ; le PDF les met bout à bout.
   */
  const tuile = (cle: string, bs: BulletinFamille[]) => {
    const chrono = [...bs].sort((a, b) => a.ordre - b.ordre);
    const dernier = chrono[chrono.length - 1];
    const plusieurs = chrono.length > 1;
    const nouveau = chrono.some((b) => !lus.has(b.id));
    const pdf = `Bulletin ${dernier.synthese.eleve.prenom} ${dernier.synthese.eleve.nom} - ${titreTrimestre(dernier)} ${dernier.synthese.periode.annee}`;
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => ouvrir(cle, chrono)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-left">
            <span className="text-[13px] tabular-nums">
              Moyenne <strong>{note20(dernier.synthese.general.moy)}</strong>
              {plusieurs && <span className="ml-1 text-[12px] text-muted">({nomPeriode(dernier)})</span>}
            </span>
            {plusieurs && <span className="text-[12px] text-muted">{chrono.map(nomPeriode).join(" · ")}</span>}
            {nouveau && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold">Nouveau</span>}
          </button>
          <button
            type="button"
            onClick={() => telechargerBulletins(chrono.map((b) => b.synthese), pdf).catch((e) => setErreur(`PDF impossible : ${e instanceof Error ? e.message : e}`))}
            title="Télécharger"
            aria-label="Télécharger"
            className="rounded-lg border border-border p-1.5 text-foreground hover:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </button>
          <button type="button" onClick={() => ouvrir(cle, chrono)} className="rounded-lg px-3 py-1.5 text-[13px] text-accent hover:bg-accent-soft">
            {ouvert === cle ? "Fermer" : "Lire"}
          </button>
        </div>
        {ouvert === cle && (
          <div className="divide-y divide-border border-t border-border">
            {chrono.map((b) => (
              <div key={b.id} className="space-y-2 p-4">
                {plusieurs && <h4 className="text-sm font-semibold">{nomPeriode(b)}</h4>}
                <VueBulletin s={b.synthese} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Une année d'un enfant : un titre par trimestre et un seul bulletin par trimestre.
  const blocAnnee = (lot: BulletinFamille[]) => {
    const parTrimestre = new Map<string, BulletinFamille[]>();
    for (const b of [...lot].sort(recentsDabord)) {
      const t = b.synthese.periode.trimestre;
      const cle = `${b.eleveId}|${b.synthese.periode.annee}|${t ? `t${t}` : `p${b.id}`}`;
      parTrimestre.set(cle, [...(parTrimestre.get(cle) ?? []), b]);
    }
    return [...parTrimestre].map(([cle, bs]) => (
      <div key={cle} className="space-y-1.5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">{titreTrimestre(bs[0])}</h3>
        {tuile(cle, bs)}
      </div>
    ));
  };
  const pastille = (prenom: string, nonLus: number) => (
    <div className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-[13px] font-medium text-accent-fg">
      {prenom}
      {nonLus > 0 && <span className="ml-1.5 rounded-full bg-gold px-1.5 text-[10.5px] text-white">{nonLus}</span>}
    </div>
  );

  return (
    <div className="space-y-3">
      {erreur && <p className="text-center text-sm text-negative">{erreur}</p>}
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">{annee}</h2>
      {courants.length ? (
        enfants.map(([id, prenom]) => {
          const siens = courants.filter((b) => b.eleveId === id);
          return (
            <div key={id} className="space-y-2">
              <div className="flex items-center gap-2">
                {pastille(prenom, siens.filter((b) => !lus.has(b.id)).length)}
                <span className="text-[12px] text-positive">{classeEleve([...siens].sort(recentsDabord)[0]?.synthese)}</span>
              </div>
              <div className="space-y-2 border-l-2 border-border pl-3">{blocAnnee(siens)}</div>
            </div>
          );
        })
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">Aucun bulletin publié pour l&apos;année {annee}.</div>
      )}

      {historique.length > 0 && (
        <section className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => setAnciensOuverts((o) => !o)}
            aria-expanded={anciensOuverts}
            className="flex w-full items-center gap-2 border-t border-border pt-4 text-left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 text-muted transition-transform ${anciensOuverts ? "rotate-90" : ""}`} aria-hidden="true">
              <path d="m9 6 6 6-6 6" />
            </svg>
            <span className="text-sm font-semibold uppercase tracking-wider text-muted">Années précédentes</span>
            <span className="text-[12px] text-muted">
              {anciens.length} bulletin{anciens.length > 1 ? "s" : ""}
            </span>
            {nonLusAnciens > 0 && <span className="rounded-full bg-gold px-1.5 text-[10.5px] text-white">{nonLusAnciens}</span>}
          </button>
          {anciensOuverts && (
            <div className="space-y-5">
              {historique.map((y) => (
                <div key={y.annee} className="space-y-3">
                  <h3 className="mb-3 flex items-center justify-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted">{y.annee}</h3>
                  {y.enfants.map((e) => (
                    <div key={e.id} className="space-y-2">
                      <div className="flex items-center gap-2">
                        {pastille(e.prenom, e.lot.filter((b) => !lus.has(b.id)).length)}
                        <span className="text-[12px] text-positive">{classeEleve([...e.lot].sort(recentsDabord)[0]?.synthese)}</span>
                      </div>
                      <div className="space-y-2 border-l-2 border-border pl-3">{blocAnnee(e.lot)}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

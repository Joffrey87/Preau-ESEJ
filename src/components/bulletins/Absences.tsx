"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";
import { libellePeriode, nomEleve, type Classe, type EleveBulletin, type Periode } from "@/lib/bulletins";
import {
  DEMI_JOURNEES,
  TYPES_ABSENCE,
  dateLongue,
  demiJourneeCourante,
  estRetard,
  libelleDemiJournee,
  resumeAbsences,
  typeAbsence,
  type Absence,
  type Appel,
  type DemiJournee,
  type TypeAbsence,
} from "@/lib/absences";
import { presentiel, tauxTexte } from "@/lib/calendrier";
import CalendrierAppel from "./CalendrierAppel";

type Etat = "present" | "absent" | "retard";
type Ligne = { etat: Etat; type: TypeAbsence; remarque: string };
const champ = "rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-accent";

/**
 * Onglet « Absences » des bulletins : l'appel d'une demi-journée (titulaire, Directrice), puis le récapitulatif de la
 * période choisie, élève par élève, avec le détail modifiable (justification par la Directrice).
 */
export default function Absences({
  classe,
  periode,
  eleves,
  peutSaisir,
  directrice = false,
  onOptionChangee,
}: {
  classe: Classe;
  periode: Periode;
  eleves: EleveBulletin[];
  /** Titulaire de la classe ou Directrice (la base le garantit aussi). */
  peutSaisir: boolean;
  /** La Directrice modifie aussi le calendrier des jours sans école. */
  directrice?: boolean;
  /** Après changement de l'option « taux de présentiel sur les bulletins ». */
  onOptionChangee?: () => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const [date, setDate] = useState(todayISO());
  const [demi, setDemi] = useState<DemiJournee>(demiJourneeCourante());
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [appel, setAppel] = useState<Appel | null>(null);
  // Par défaut l'appel vaut pour la journée entière (matin et après-midi) ; option pour préciser par demi-journée.
  const [parDemi, setParDemi] = useState(false);
  const [appelsPeriode, setAppelsPeriode] = useState<Appel[]>([]);
  const [majCalendrier, setMajCalendrier] = useState(0);
  const [lignes, setLignes] = useState<Record<string, Ligne>>({});
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const tries = useMemo(() => [...eleves].sort((a, b) => nomEleve(a).localeCompare(nomEleve(b), "fr")), [eleves]);
  const ids = useMemo(() => eleves.map((e) => e.id), [eleves]);

  // Absences de la période et du jour de l'appel (qui peut sortir de la période), appel du jour.
  const charger = useCallback(async () => {
    if (!ids.length) return;
    const debut = date < periode.debut ? date : periode.debut;
    const fin = date > periode.fin ? date : periode.fin;
    const [a, ap] = await Promise.all([
      sb.from("absences").select("*").in("eleve_id", ids).gte("date", debut).lte("date", fin).order("date"),
      sb.from("appels").select("*").eq("classe_id", classe.id).gte("date", debut).lte("date", fin),
    ]);
    const liste = (a.data ?? []) as Absence[];
    const appels = (ap.data ?? []) as Appel[];
    setAbsences(liste);
    setAppelsPeriode(appels);
    const duJour = appels.filter((x) => x.date === date);
    // Journée entière : l'appel du matin fait foi ; il n'est « fait » que si les deux demi-journées le sont.
    const cible: DemiJournee = parDemi ? demi : "matin";
    setAppel(parDemi ? (duJour.find((x) => x.demi_journee === demi) ?? null) : duJour.length === 2 ? (duJour.find((x) => x.demi_journee === "matin") ?? null) : null);
    const du = new Map(liste.filter((x) => x.date === date && x.demi_journee === cible).map((x) => [x.eleve_id, x]));
    setLignes(
      Object.fromEntries(
        ids.map((id) => {
          const x = du.get(id);
          return [id, x ? { etat: estRetard(x.type) ? "retard" : "absent", type: x.type, remarque: x.remarque ?? "" } : { etat: "present", type: "absence_injustifiee", remarque: "" }];
        }),
      ) as Record<string, Ligne>,
    );
  }, [sb, ids, classe.id, periode.debut, periode.fin, date, demi, parDemi]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des absences de la classe
    charger();
  }, [charger]);

  function changerEtat(id: string, etat: Etat) {
    setLignes((l) => {
      const actuel = l[id];
      // Le type suit l'état : une absence par défaut non justifiée, un retard par défaut simple.
      const type: TypeAbsence = etat === "retard" ? (estRetard(actuel.type) ? actuel.type : "retard") : estRetard(actuel.type) ? "absence_injustifiee" : actuel.type;
      return { ...l, [id]: { ...actuel, etat, type } };
    });
  }

  async function enregistrerAppel() {
    setEnvoi(true);
    setMessage(null);
    const demis: DemiJournee[] = parDemi ? [demi] : ["matin", "apres_midi"];
    const presents = ids.filter((id) => lignes[id]?.etat === "present");
    const absentsIds = ids.filter((id) => lignes[id] && lignes[id].etat !== "present");
    // Journée entière : un retard ne vaut que pour le matin (l'après-midi, l'élève est présent).
    const manquants = demis.flatMap((dj) =>
      absentsIds
        .filter((id) => dj === "matin" || parDemi || lignes[id].etat !== "retard")
        .map((id) => ({ eleve_id: id, date, demi_journee: dj, type: lignes[id].type, remarque: lignes[id].remarque.trim() || null })),
    );
    const effacer = demis.flatMap((dj) => {
      const qui = dj === "apres_midi" && !parDemi ? [...presents, ...absentsIds.filter((id) => lignes[id].etat === "retard")] : presents;
      return qui.length ? [sb.from("absences").delete().in("eleve_id", qui).eq("date", date).eq("demi_journee", dj)] : [];
    });
    const ops = [
      sb.from("appels").upsert(demis.map((dj) => ({ classe_id: classe.id, date, demi_journee: dj, fait_le: new Date().toISOString() })), { onConflict: "classe_id,date,demi_journee" }),
      ...effacer,
      manquants.length ? sb.from("absences").upsert(manquants, { onConflict: "eleve_id,date,demi_journee" }) : null,
    ].filter(Boolean);
    const res = await Promise.all(ops);
    const erreur = res.find((r) => r && r.error)?.error;
    setEnvoi(false);
    if (erreur) return setMessage(`Échec : ${erreur.message}`);
    setMajCalendrier((n) => n + 1);
    setMessage(`Appel enregistré${parDemi ? "" : " (journée entière)"} : ${absentsIds.length ? `${absentsIds.length} absence${absentsIds.length > 1 ? "s" : ""} ou retard${absentsIds.length > 1 ? "s" : ""}` : "tous présents"}.`);
    await charger();
  }

  async function modifier(a: Absence, p: Partial<Pick<Absence, "type" | "remarque">>) {
    const { error } = await sb.from("absences").update(p).eq("id", a.id);
    if (error) return setMessage(`Échec : ${error.message}`);
    await charger();
  }
  async function supprimer(a: Absence) {
    if (!window.confirm(`Supprimer cette ${estRetard(a.type) ? "mention de retard" : "absence"} du ${dateLongue(a.date)} (${libelleDemiJournee(a.demi_journee)}) ?`)) return;
    const { error } = await sb.from("absences").delete().eq("id", a.id);
    if (error) return setMessage(`Échec : ${error.message}`);
    await charger();
  }

  async function basculerPresentiel(v: boolean) {
    const { error } = await sb.from("classes").update({ presentiel_bulletin: v }).eq("id", classe.id);
    if (error) return setMessage(`Échec : ${error.message}`);
    onOptionChangee?.();
  }

  const dePeriode = absences.filter((a) => a.date >= periode.debut && a.date <= periode.fin);
  const nbManquants = Object.values(lignes).filter((l) => l.etat !== "present").length;

  return (
    <div className="space-y-4">
      {/* Appel d'une demi-journée. */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h3 className="mr-2 text-[14px] font-semibold">Appel</h3>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={champ} aria-label="Date de l'appel" />
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <input type="checkbox" checked={parDemi} onChange={(e) => setParDemi(e.target.checked)} />
            Préciser par demi-journée
          </label>
          {parDemi && <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
            {DEMI_JOURNEES.map((d) => (
              <button
                key={d.v}
                type="button"
                onClick={() => setDemi(d.v)}
                className={`rounded-md px-3 py-1 text-[13px] font-medium ${demi === d.v ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground"}`}
              >
                {d.label}
              </button>
            ))}
          </div>}
          <span className={`text-[12px] ${appel ? "text-positive" : "text-muted"}`}>
            {appel ? `Appel fait le ${new Date(appel.fait_le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "Appel non fait"}
          </span>
        </div>
        <ul className="divide-y divide-border/60">
          {tries.map((e) => {
            const l = lignes[e.id];
            if (!l) return null;
            const types = TYPES_ABSENCE.filter((t) => t.retard === (l.etat === "retard"));
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-[13px]">
                <span className="w-48 truncate font-medium">{nomEleve(e)}</span>
                <div className="flex gap-1">
                  {(["present", "absent", "retard"] as Etat[]).map((et) => (
                    <button
                      key={et}
                      type="button"
                      disabled={!peutSaisir}
                      onClick={() => changerEtat(e.id, et)}
                      className={`rounded-md border px-2.5 py-1 text-[12.5px] disabled:cursor-default ${
                        l.etat === et
                          ? et === "present"
                            ? "border-positive/40 bg-positive/10 text-positive"
                            : et === "absent"
                              ? "border-negative/40 bg-negative/10 text-negative"
                              : "border-gold/50 bg-gold-soft text-gold"
                          : "border-border text-muted hover:bg-surface-2"
                      }`}
                    >
                      {et === "present" ? "Présent" : et === "absent" ? "Absent" : "Retard"}
                    </button>
                  ))}
                </div>
                {l.etat !== "present" && (
                  <>
                    <select
                      value={l.type}
                      disabled={!peutSaisir}
                      onChange={(ev) => setLignes((x) => ({ ...x, [e.id]: { ...l, type: ev.target.value as TypeAbsence } }))}
                      className={champ}
                    >
                      {types.map((t) => (
                        <option key={t.v} value={t.v}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={l.remarque}
                      disabled={!peutSaisir}
                      onChange={(ev) => setLignes((x) => ({ ...x, [e.id]: { ...l, remarque: ev.target.value } }))}
                      placeholder="Remarque (motif…)"
                      className={`${champ} min-w-0 flex-1`}
                    />
                  </>
                )}
              </li>
            );
          })}
          {!tries.length && <li className="px-4 py-3 text-[13px] text-muted">Aucun élève dans cette classe.</li>}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
          {peutSaisir ? (
            <button
              type="button"
              onClick={enregistrerAppel}
              disabled={envoi || !tries.length}
              className="rounded-lg bg-accent px-4 py-1.5 text-[13px] font-medium text-accent-fg disabled:opacity-50"
            >
              {appel ? "Mettre à jour l'appel" : "Enregistrer l'appel"}
            </button>
          ) : (
            <span className="text-[12px] text-muted">Lecture seule : l&apos;appel est fait par la titulaire de la classe ou la Directrice.</span>
          )}
          <span className="text-[12px] text-muted">
            {nbManquants ? `${nbManquants} absent${nbManquants > 1 ? "s" : ""} ou en retard` : "Tous présents"}
          </span>
          {message && <span className={`text-[12px] ${message.startsWith("Échec") ? "text-negative" : "text-positive"}`}>{message}</span>}
        </div>
      </div>

      <CalendrierAppel classeId={classe.id} annee={classe.annee_scolaire} date={date} onChoisir={setDate} directrice={directrice} maj={majCalendrier} />

      {/* Récapitulatif de la période : ce qui figurera sur le bulletin. */}
      <div className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-[14px] font-semibold">Récapitulatif de la période</h3>
          <p className="text-[12px] text-muted">{libellePeriode(periode)} — total repris sur le bulletin à sa publication.</p>
          {directrice && (
            <label className="mt-1 flex items-center gap-1.5 text-[12.5px]">
              <input type="checkbox" checked={!!classe.presentiel_bulletin} onChange={(e) => basculerPresentiel(e.target.checked)} />
              Afficher le taux de présentiel sur les bulletins de cette classe
            </label>
          )}
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">Élève</th>
              <th className="px-2 py-2 text-center font-medium">Demi-journées</th>
              <th className="px-2 py-2 text-center font-medium">dont justifiées</th>
              <th className="px-2 py-2 text-center font-medium">Retards</th>
              <th className="px-2 py-2 text-center font-medium" title="Demi-journées de présence sur les demi-journées où l'appel a été fait">Présentiel</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tries.map((e) => {
              const siennes = dePeriode.filter((a) => a.eleve_id === e.id);
              const r = resumeAbsences(siennes);
              const taux = presentiel(appelsPeriode.filter((x) => x.date >= periode.debut && x.date <= periode.fin), siennes, e.sorti_le).taux;
              return (
                <FragmentEleve
                  key={e.id}
                  nom={nomEleve(e)}
                  r={r}
                  taux={taux}
                  absences={siennes}
                  ouvert={ouvert === e.id}
                  onBasculer={() => setOuvert(ouvert === e.id ? null : e.id)}
                  peutSaisir={peutSaisir}
                  onModifier={modifier}
                  onSupprimer={supprimer}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentEleve({
  nom,
  r,
  taux,
  absences,
  ouvert,
  onBasculer,
  peutSaisir,
  onModifier,
  onSupprimer,
}: {
  nom: string;
  r: ReturnType<typeof resumeAbsences>;
  taux: number | null;
  absences: Absence[];
  ouvert: boolean;
  onBasculer: () => void;
  peutSaisir: boolean;
  onModifier: (a: Absence, p: Partial<Pick<Absence, "type" | "remarque">>) => void;
  onSupprimer: (a: Absence) => void;
}) {
  const vide = !absences.length;
  return (
    <>
      <tr className="border-t border-border/60">
        <td className="px-4 py-1.5 font-medium">{nom}</td>
        <td className="px-2 py-1.5 text-center tabular-nums">{r.demiJournees || "–"}</td>
        <td className="px-2 py-1.5 text-center tabular-nums text-muted">{r.demiJournees ? r.justifiees : "–"}</td>
        <td className="px-2 py-1.5 text-center tabular-nums">{r.retards || "–"}</td>
        <td className="px-2 py-1.5 text-center tabular-nums">{tauxTexte(taux)}</td>
        <td className="px-4 py-1.5 text-right">
          {!vide && (
            <button type="button" onClick={onBasculer} className="text-[12px] text-accent hover:underline">
              {ouvert ? "Masquer" : "Détail"}
            </button>
          )}
        </td>
      </tr>
      {ouvert &&
        absences.map((a) => (
          <tr key={a.id} className="bg-surface-2/40 text-[12.5px]">
            <td className="px-4 py-1 pl-8 text-muted" colSpan={1}>
              {dateLongue(a.date)} · {libelleDemiJournee(a.demi_journee)}
            </td>
            <td className="px-2 py-1" colSpan={2}>
              {peutSaisir ? (
                <select value={a.type} onChange={(e) => onModifier(a, { type: e.target.value as TypeAbsence })} className={champ}>
                  {TYPES_ABSENCE.filter((t) => t.retard === estRetard(a.type)).map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.label}
                    </option>
                  ))}
                </select>
              ) : (
                typeAbsence(a.type).label
              )}
            </td>
            <td className="px-2 py-1 text-muted" colSpan={2}>{a.remarque}</td>
            <td className="px-4 py-1 text-right">
              {peutSaisir && (
                <button type="button" onClick={() => onSupprimer(a)} className="text-muted hover:text-negative" aria-label="Supprimer">
                  ✕
                </button>
              )}
            </td>
          </tr>
        ))}
    </>
  );
}

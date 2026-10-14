"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  arrondi,
  estSynthese,
  matiereConcerne,
  niveauDe,
  nomEleve,
  type ContexteClasse,
  type EleveBulletin,
  type Enseignant,
  type Matiere,
  type Periode,
  type ResultatEleve,
  type Statut,
  type Synthese,
} from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import { syntheseReleve, type ContexteDocs, type DocReleve } from "@/lib/relevesTrimestre";
import type { Droits } from "./Bulletins";
import SaisieNotes from "./SaisieNotes";
import { BoutonLot, PastilleStatut } from "./outils";

const OUVERTS: Statut[] = ["nouveau", "en_cours", "pret"];
const ETAT_COURT: Record<string, string> = { absent: "abs", dispense: "disp", non_rendu: "nr" };
const nombre = (n: number) => String(arrondi(n)).replace(".", ",");

/**
 * Relevés de notes d'une période, en tableau de classe compact (comme le Conseil de classe) : une ligne par élève, les
 * notes de la période dans chaque matière (aucune moyenne), l'appréciation générale et l'état du relevé. Un clic sur
 * une matière ou une case ouvre la saisie de cette matière (évaluations, notes, + Évaluation) ; un clic sur l'élève
 * ouvre son appréciation générale. Relevé publié : notes de l'élève verrouillées (aussi en base).
 */
export default function ReleveClasse({
  ctx,
  resultats,
  droits,
  enseignants,
  onMaj,
  docs,
  periode,
  nomTitulaire,
  onRecharger,
}: {
  ctx: ContexteClasse;
  resultats: ResultatEleve[];
  droits: Droits;
  enseignants: Map<string, Enseignant>;
  onMaj: (f: (c: ContexteClasse | null) => ContexteClasse | null) => void;
  docs: ContexteDocs;
  periode: Periode;
  nomTitulaire: string | null;
  onRecharger: () => Promise<void>;
}) {
  const sb = useMemo(() => createClient(), []);
  const { directrice, titulaire } = droits;
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [matiereOuverte, setMatiereOuverte] = useState<string | null>(null);
  const [eleveOuvert, setEleveOuvert] = useState<string | null>(null);
  const defilementRef = useRef<HTMLDivElement>(null);

  // Molette : défilement horizontal du tableau (plus large que l'écran) ; aux bords, la page reprend la main.
  // Les gestes horizontaux (pavé tactile) et Maj+molette gardent leur comportement natif.
  useEffect(() => {
    const el = defilementRef.current;
    if (!el) return;
    const surMolette = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
      el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", surMolette, { passive: false });
    return () => el.removeEventListener("wheel", surMolette);
  }, []);

  // Les notes saisies ici mettent à jour le contexte de la classe : le relevé suit aussitôt, sans rechargement.
  const vue: ContexteDocs = useMemo(() => {
    const ids = new Set(ctx.evaluations.map((e) => e.id));
    return {
      ...docs,
      evaluations: [...docs.evaluations.filter((e) => e.periode_id !== periode.id), ...ctx.evaluations],
      notes: [...docs.notes.filter((n) => !ids.has(n.evaluation_id) && !docs.evaluations.some((e) => e.id === n.evaluation_id && e.periode_id === periode.id)), ...ctx.notes],
    };
  }, [docs, ctx.evaluations, ctx.notes, periode.id]);

  const colonnes = useMemo(
    () =>
      [...vue.groupes]
        .sort((a, b) => a.ordre - b.ordre)
        .map((g) => ({ g, ms: vue.matieres.filter((m) => m.groupe_id === g.id && m.actif).sort((a, b) => a.ordre - b.ordre) }))
        .filter((x) => x.ms.length),
    [vue],
  );
  const notesDe = useMemo(() => new Map(vue.notes.map((n) => [`${n.evaluation_id}:${n.eleve_id}`, n])), [vue.notes]);
  const evalsDe = (m: Matiere) => vue.evaluations.filter((e) => e.matiere_id === m.id && e.periode_id === periode.id).sort((a, b) => a.date.localeCompare(b.date) || a.titre.localeCompare(b.titre));

  /** Notes d'un élève dans une matière, en abrégé : « 14 · 7/10 · abs » ; reprise École Futée : la moyenne saisie. */
  const notesCourtes = (e: EleveBulletin, m: Matiere): string[] => {
    const evals = evalsDe(m);
    if (!evals.length) {
      const b = vue.bulletinsPeriode.find((x) => x.periode_id === periode.id && x.eleve_id === e.id);
      const l = b ? vue.lignes.find((x) => x.bulletin_id === b.id && x.matiere_id === m.id) : undefined;
      return l?.moyenne_saisie != null ? [nombre(Number(l.moyenne_saisie))] : [];
    }
    return evals.flatMap((ev) => {
      const n = notesDe.get(`${ev.id}:${e.id}`);
      if (!n) return [];
      if (n.etat) return [ETAT_COURT[n.etat] ?? n.etat];
      if (n.note == null) return [];
      return [Number(ev.bareme) === 20 ? nombre(Number(n.note)) : `${nombre(Number(n.note))}/${nombre(Number(ev.bareme))}`];
    });
  };

  const docDe = (eleveId: string) => vue.releves.find((d) => d.eleve_id === eleveId);
  const verrou = (eleveId: string) => docDe(eleveId)?.statut === "publie";
  const peutEditer = (d: DocReleve | undefined) => !!d && (directrice || (titulaire && OUVERTS.includes(d.statut)));
  const outils = { titulaire: nomTitulaire, enseignants };
  const synthese = (e: EleveBulletin): Synthese => {
    const d = docDe(e.id);
    if (d?.statut === "publie" && estSynthese(d.synthese)) return d.synthese;
    return syntheseReleve(vue, periode, e, d, outils);
  };

  async function agir(p: PromiseLike<{ error: { message: string } | null }>) {
    setOccupe(true);
    const { error } = await p;
    setOccupe(false);
    setMessage(error ? `Échec : ${error.message}` : null);
    if (!error) await onRecharger();
  }

  const docs_ = vue.releves;
  const selection = docs_.filter((d) => choix.has(d.id));
  const cible = selection.length ? selection : docs_;
  const n = (s: Statut) => cible.filter((d) => d.statut === s).length;
  const eleves = [...vue.eleves].sort((a, b) => nomEleve(a).localeCompare(nomEleve(b), "fr"));
  const eleveDe = (id: string) => vue.eleves.find((x) => x.id === id);
  const changer = (statut: Statut) => agir(sb.rpc("releves_changer_statut", { p_doc: "releve", p_ids: cible.map((d) => d.id), p_statut: statut }));
  const publier = () => {
    const items = cible.filter((d) => d.statut === "valide").flatMap((d) => {
      const e = eleveDe(d.eleve_id);
      return e ? [{ id: d.id, synthese: synthese(e) }] : [];
    });
    return agir(sb.rpc("releves_publier", { p_doc: "releve", p_items: items }));
  };
  const pdf = async () => {
    const ss = (selection.length ? selection : docs_).flatMap((d) => {
      const e = eleveDe(d.eleve_id);
      return e ? [synthese(e)] : [];
    });
    await telechargerBulletins(ss, `Relevés de notes ${vue.classe.nom} - Période ${periode.ordre}`);
  };
  const matiere = vue.matieres.find((m) => m.id === matiereOuverte);
  const nbColonnes = 1 + colonnes.reduce((s, c) => s + c.ms.length, 0) + 3;

  return (
    <div className="space-y-3">
      {/* Barre d'actions sur une ligne. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 text-[13px]">
        <span className="font-semibold">Période {periode.ordre}</span>
        <span className="text-[12px] text-muted">Notes de la période, sans moyenne · cliquez une matière ou une case pour saisir les notes, un élève pour son appréciation</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {(directrice || titulaire) && (
            <BoutonLot n={n("nouveau") + n("en_cours")} onClick={() => changer("pret")} disabled={occupe}>
              Marquer prêt
            </BoutonLot>
          )}
          {directrice && (
            <>
              <BoutonLot n={n("nouveau") + n("en_cours") + n("pret")} onClick={() => changer("valide")} disabled={occupe}>
                Valider
              </BoutonLot>
              <BoutonLot n={n("valide")} onClick={publier} fort disabled={occupe}>
                Publier aux familles
              </BoutonLot>
            </>
          )}
          {(directrice || titulaire) && (
            <BoutonLot n={directrice ? n("pret") + n("valide") + n("publie") : n("pret")} onClick={() => changer("en_cours")} disabled={occupe}>
              Repasser en cours
            </BoutonLot>
          )}
          <BoutonLot onClick={pdf}>PDF{selection.length ? ` (${selection.length})` : " de la classe"}</BoutonLot>
        </div>
        {message && <p className="w-full text-[12px] text-negative">{message}</p>}
      </div>

      {/* Saisie de la matière ouverte, juste au-dessus du tableau. */}
      {matiere && (
        <div className="rounded-xl border-2 border-accent/40 bg-accent-soft/20 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-accent">Saisie des notes</span>
            <button type="button" onClick={() => setMatiereOuverte(null)} className="ml-auto rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-accent hover:bg-accent-soft">
              ← Retour Relevés de notes
            </button>
          </div>
          <SaisieNotes ctx={ctx} resultats={resultats} droits={droits} enseignants={enseignants} onMaj={onMaj} matiereImposee={matiere.id} verrouEleve={verrou} />
        </div>
      )}

      {!eleves.length && <p className="text-sm text-muted">Aucun élève dans cette classe.</p>}
      <div ref={defilementRef} className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="text-[12.5px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wide text-muted">
              <th rowSpan={2} className="sticky left-0 z-10 min-w-44 border-b border-border bg-surface px-3 py-2 text-left font-medium">
                Élève
              </th>
              {colonnes.map(({ g, ms }) => (
                <th key={g.id} colSpan={ms.length} className="border-b border-l border-border bg-gold-soft/50 px-2 py-1 font-semibold text-foreground">
                  {g.nom}
                </th>
              ))}
              <th rowSpan={2} className="border-b border-l border-border px-2 py-1 text-left font-medium">
                Appréciation générale
              </th>
              <th rowSpan={2} className="border-b border-border px-2 py-1 font-medium">
                État
              </th>
              <th rowSpan={2} className="border-b border-border px-2 py-1" />
            </tr>
            <tr className="text-[10.5px] text-muted">
              {colonnes.map(({ g, ms }) => (
                <Fragment key={g.id}>
                  {ms.map((m, i) => {
                    const nb = evalsDe(m).length;
                    return (
                      <th key={m.id} className={`max-w-24 border-b border-border p-0 font-normal ${i === 0 ? "border-l" : ""}`}>
                        <button
                          type="button"
                          onClick={() => setMatiereOuverte(matiereOuverte === m.id ? null : m.id)}
                          className={`h-full w-full px-1.5 py-1 hover:bg-accent-soft/60 ${matiereOuverte === m.id ? "bg-accent text-accent-fg" : ""}`}
                          title={`Saisir les notes · ${m.nom}${m.niveaux.length ? ` (${m.niveaux.join(", ")})` : ""}`}
                        >
                          <span className="line-clamp-2">{m.nom}</span>
                          <span className="text-[9.5px] opacity-80">{nb ? `${nb} éval.` : "+ éval."}</span>
                        </button>
                      </th>
                    );
                  })}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {eleves.map((e) => {
              const d = docDe(e.id);
              const niveau = niveauDe(e, vue.classe.annee_scolaire);
              const actif = eleveOuvert === e.id;
              return (
                <Fragment key={e.id}>
                  <tr className={`border-t border-border/60 ${actif ? "bg-accent-soft/50" : "hover:bg-surface-2/60"}`}>
                    <td className={`sticky left-0 z-10 px-2 py-0.5 ${actif ? "bg-accent-soft" : "bg-surface"}`}>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        {d && (
                          <input
                            type="checkbox"
                            checked={choix.has(d.id)}
                            onChange={(ev) =>
                              setChoix((c) => {
                                const x = new Set(c);
                                if (ev.target.checked) x.add(d.id);
                                else x.delete(d.id);
                                return x;
                              })
                            }
                            aria-label={`Choisir ${nomEleve(e)}`}
                          />
                        )}
                        <button type="button" onClick={() => setEleveOuvert(actif ? null : e.id)} className="text-left font-medium hover:text-accent hover:underline" title="Appréciation générale">
                          {nomEleve(e)}
                        </button>
                        {niveau && vue.classe.niveaux.length > 1 && <span className="rounded bg-surface-2 px-1 text-[10px] text-muted">{niveau}</span>}
                        {verrou(e.id) && <span className="text-[10px]" title="Relevé publié : notes verrouillées">🔒</span>}
                      </div>
                    </td>
                    {colonnes.map(({ g, ms }) => (
                      <Fragment key={g.id}>
                        {ms.map((m, i) => {
                          const concerne = matiereConcerne(m, niveau);
                          const t = concerne ? notesCourtes(e, m) : [];
                          return (
                            <td
                              key={m.id}
                              onClick={() => concerne && setMatiereOuverte(m.id)}
                              className={`px-1.5 py-0.5 text-center tabular-nums ${i === 0 ? "border-l border-border" : ""} ${
                                concerne ? `cursor-pointer hover:bg-accent-soft/50 ${matiereOuverte === m.id ? "bg-accent-soft/40" : ""}` : "bg-surface-2/50"
                              }`}
                            >
                              <span className="whitespace-nowrap text-[12px]">{t.join(" · ")}</span>
                            </td>
                          );
                        })}
                      </Fragment>
                    ))}
                    <td className="max-w-64 cursor-pointer border-l border-border px-2 py-0.5" onClick={() => setEleveOuvert(actif ? null : e.id)}>
                      {d?.appreciation?.trim() ? <span className="line-clamp-1 text-[12px]">{d.appreciation}</span> : d ? <span className="text-[11px] text-gold">✎ à rédiger</span> : null}
                    </td>
                    <td className="px-2 py-0.5 text-center">{d && <PastilleStatut statut={d.statut} />}</td>
                    <td className="px-2 py-0.5 text-right">
                      <button type="button" onClick={() => telechargerBulletins([synthese(e)])} className="text-[12px] text-accent hover:underline">
                        PDF
                      </button>
                    </td>
                  </tr>
                  {actif && d && (
                    <tr className="bg-accent-soft/20">
                      <td colSpan={nbColonnes} className="px-3 py-2">
                        <div className="sticky left-3 flex max-w-3xl items-start gap-2">
                          <span className="w-[9rem] shrink-0 pt-1 text-[12px] font-semibold">Appréciation générale</span>
                          <textarea
                            key={`${d.id}:${d.appreciation ?? ""}`}
                            autoFocus
                            defaultValue={d.appreciation ?? ""}
                            readOnly={!peutEditer(d)}
                            rows={3}
                            onBlur={(ev) => {
                              const v = ev.target.value.trim();
                              if (!peutEditer(d) || v === (d.appreciation ?? "").trim()) return;
                              agir(sb.from("releves_notes").update({ appreciation: v || null }).eq("id", d.id));
                            }}
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] outline-none focus:border-accent read-only:border-transparent read-only:bg-transparent"
                          />
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
      <p className="text-[11.5px] text-muted">« abs » absent, « disp » dispensé, « nr » non rendu ; une note sur un autre barème que 20 est suivie de « /barème ». Cases grisées : matière hors du niveau de l&apos;élève.</p>
    </div>
  );
}

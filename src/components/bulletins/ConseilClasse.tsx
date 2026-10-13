"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MENTIONS, mentionLabel, nomEleve, note20, rangTexte, type Bulletin, type Chiffre, type ContexteClasse, type Mention, type ResultatEleve } from "@/lib/bulletins";
import type { Droits } from "./Bulletins";
import { ChampTexte } from "./FicheBulletin";
import { PastilleStatut } from "./outils";

/** Couleur d'une moyenne : en difficulté (< 10), très bien (≥ 16). */
const ton = (v: number | null) => (v === null ? "" : v < 10 ? "text-negative" : v >= 16 ? "text-positive" : "");

/**
 * Conseil de classe : toute la classe sur une page (élèves × matières, moyennes de groupe et générale, rang), par
 * niveau, avec la moyenne du niveau en pied. Un clic sur un élève ouvre sa mention et son appréciation pour les
 * rédiger à la suite, sans quitter le tableau.
 */
export default function ConseilClasse({
  ctx,
  resultats,
  droits,
  onMaj,
  onOuvrir,
}: {
  ctx: ContexteClasse;
  resultats: ResultatEleve[];
  droits: Droits;
  onMaj: (f: (c: ContexteClasse | null) => ContexteClasse | null) => void;
  onOuvrir: (bulletinId: string) => void;
}) {
  const sb = useMemo(() => createClient(), []);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  const defilementRef = useRef<HTMLDivElement>(null);

  // Molette : défilement horizontal du tableau quand il ne défile qu'horizontalement. Aux bords, la page défile
  // normalement ; les gestes horizontaux (pavé tactile) et Maj+molette gardent leur comportement natif.
  useEffect(() => {
    const el = defilementRef.current;
    if (!el) return;
    const surMolette = (e: WheelEvent) => {
      if (e.shiftKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth || el.scrollHeight > el.clientHeight) return;
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
      // deltaMode 1 = lignes (certaines souris) : environ 16 px par ligne.
      el.scrollLeft += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", surMolette, { passive: false });
    return () => el.removeEventListener("wheel", surMolette);
  }, [ctx, resultats]);

  // Colonnes : chaque groupe, ses matières (toutes celles de la classe, quel que soit le niveau), puis sa moyenne.
  const colonnes = useMemo(
    () =>
      [...ctx.groupes]
        .sort((a, b) => a.ordre - b.ordre)
        .map((g) => ({ g, ms: ctx.matieres.filter((m) => m.groupe_id === g.id && m.actif).sort((a, b) => a.ordre - b.ordre) }))
        .filter((x) => x.ms.length),
    [ctx],
  );
  const niveaux = useMemo(() => {
    const parNiveau = new Map<string, ResultatEleve[]>();
    for (const r of [...resultats].sort((a, b) => nomEleve(a.eleve).localeCompare(nomEleve(b.eleve), "fr"))) {
      const k = ctx.classe.rang_par_niveau ? (r.niveau ?? "—") : "Classe";
      parNiveau.set(k, [...(parNiveau.get(k) ?? []), r]);
    }
    const ordre = ctx.classe.niveaux;
    return [...parNiveau].sort((a, b) => ordre.indexOf(a[0]) - ordre.indexOf(b[0]));
  }, [resultats, ctx.classe]);
  const nbColonnes = 1 + colonnes.reduce((n, c) => n + c.ms.length + 1, 0) + 4;

  const chiffreMatiere = (r: ResultatEleve, id: string) => r.groupes.flatMap((g) => g.matieres).find((m) => m.matiere.id === id)?.chiffre ?? null;
  const chiffreGroupe = (r: ResultatEleve, id: string) => r.groupes.find((g) => g.groupe.id === id)?.chiffre ?? null;
  // Moyenne de classe d'un lot (identique pour tous ses élèves) : celle du premier élève qui en a une.
  const moyLot = (lot: ResultatEleve[], f: (r: ResultatEleve) => Chiffre | null) => lot.map(f).find((c) => c?.moyClasse != null)?.moyClasse ?? null;

  async function enregistrer(b: Bulletin, patch: { mention?: Mention | null; appreciation?: string | null }) {
    const { data, error } = await sb.from("bulletins").update(patch).eq("id", b.id).select().single();
    if (error) return setEtat(`Échec : ${error.message}`);
    onMaj((c) => c && { ...c, bulletins: c.bulletins.map((x) => (x.id === b.id ? (data as Bulletin) : x)) });
    setEtat("Enregistré");
    window.setTimeout(() => setEtat(null), 2000);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
        <span>Cliquez sur un élève pour rédiger sa mention et son appréciation.</span>
        <span className="text-negative">● moins de 10</span>
        <span className="text-positive">● 16 et plus</span>
        {etat && <span className="ml-auto">{etat}</span>}
      </div>
      <div ref={defilementRef} className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="text-[12.5px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wide text-muted">
              <th rowSpan={2} className="sticky left-0 z-10 min-w-44 border-b border-border bg-surface px-3 py-2 text-left font-medium">
                Élève
              </th>
              {colonnes.map(({ g, ms }) => (
                <th key={g.id} colSpan={ms.length + 1} className="border-b border-l border-border bg-gold-soft/50 px-2 py-1 font-semibold text-foreground">
                  {g.nom}
                </th>
              ))}
              <th rowSpan={2} className="border-b border-l border-border bg-accent-soft px-2 py-1 font-semibold text-accent">
                Générale
              </th>
              {ctx.classe.afficher_rang && (
                <th rowSpan={2} className="border-b border-border px-2 py-1 font-medium">
                  Rang
                </th>
              )}
              <th rowSpan={2} className="border-b border-l border-border px-2 py-1 font-medium">
                Mention
              </th>
              <th rowSpan={2} className="border-b border-border px-2 py-1 font-medium">
                État
              </th>
            </tr>
            <tr className="text-[10.5px] text-muted">
              {colonnes.map(({ g, ms }) => (
                <Fragment key={g.id}>
                  {ms.map((m, i) => (
                    <th key={m.id} className={`max-w-20 border-b border-border px-1.5 py-1 font-normal ${i === 0 ? "border-l" : ""}`} title={m.niveaux.length ? `Niveaux : ${m.niveaux.join(", ")}` : undefined}>
                      <span className="line-clamp-2">{m.nom}</span>
                    </th>
                  ))}
                  <th className="border-b border-border bg-gold-soft/40 px-1.5 py-1 font-semibold text-foreground">Moy.</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {niveaux.map(([niveau, lot]) => (
              <Fragment key={niveau}>
                {ctx.classe.rang_par_niveau && ctx.classe.niveaux.length > 1 && (
                  <tr>
                    <td colSpan={nbColonnes} className="sticky left-0 border-t border-border bg-surface-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {niveau} · {lot.length} élève{lot.length > 1 ? "s" : ""}
                    </td>
                  </tr>
                )}
                {lot.map((r) => {
                  const b = r.bulletin;
                  const actif = ouvert === b?.id;
                  return (
                    <Fragment key={r.eleve.id}>
                      <tr onClick={() => b && setOuvert(actif ? null : b.id)} className={`cursor-pointer border-t border-border/60 ${actif ? "bg-accent-soft/50" : "hover:bg-surface-2/60"}`}>
                        <td className={`sticky left-0 z-10 px-3 py-1 font-medium ${actif ? "bg-accent-soft" : "bg-surface"}`}>
                          {b ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOuvrir(b.id);
                              }}
                              className="text-left hover:text-accent hover:underline"
                              title="Ouvrir le bulletin"
                            >
                              {nomEleve(r.eleve)}
                            </button>
                          ) : (
                            nomEleve(r.eleve)
                          )}
                        </td>
                        {colonnes.map(({ g, ms }) => (
                          <Fragment key={g.id}>
                            {ms.map((m) => (
                              <Cellule key={m.id} c={chiffreMatiere(r, m.id)} />
                            ))}
                            <Cellule c={chiffreGroupe(r, g.id)} fort />
                          </Fragment>
                        ))}
                        <td className={`border-l border-border bg-accent-soft/40 px-2 py-1 text-center font-semibold tabular-nums ${ton(r.general.moy)}`}>{note20(r.general.moy)}</td>
                        {ctx.classe.afficher_rang && <td className="px-2 py-1 text-center tabular-nums text-muted">{rangTexte(r.general.rang)}</td>}
                        <td className="border-l border-border px-2 py-1 text-[11.5px] text-gold">{mentionLabel(b?.mention) ?? ""}</td>
                        <td className="px-2 py-1">
                          {b && <PastilleStatut statut={b.statut} />}
                          {b && !b.appreciation?.trim() && <div className="text-[10px] text-gold">Appréciation à rédiger</div>}
                        </td>
                      </tr>
                      {actif && b && (
                        <tr className="bg-accent-soft/20">
                          <td colSpan={nbColonnes} className="px-3 py-3">
                            <div className="sticky left-3 flex max-w-4xl flex-wrap gap-4">
                              <div className="flex flex-col gap-0.5 text-[12.5px]">
                                <span className="mb-0.5 text-[11px] font-semibold">Mention</span>
                                {[{ v: null, label: "Aucune mention" }, ...MENTIONS].map((x) => (
                                  <label key={x.label} className="flex items-center gap-1.5">
                                    <input type="radio" name={`conseil-${b.id}`} checked={b.mention === x.v} disabled={!droits.peutEditer(b)} onChange={() => enregistrer(b, { mention: x.v })} />
                                    {x.label}
                                  </label>
                                ))}
                              </div>
                              <div className="min-w-72 flex-1">
                                <div className="mb-0.5 flex items-baseline justify-between text-[11px]">
                                  <span className="font-semibold">Appréciation générale</span>
                                  <button type="button" onClick={() => onOuvrir(b.id)} className="text-accent hover:underline">
                                    Ouvrir le bulletin →
                                  </button>
                                </div>
                                <div className="rounded-md border border-border bg-surface">
                                  <ChampTexte
                                    key={`conseil:${b.id}`}
                                    valeur={b.appreciation ?? ""}
                                    disabled={!droits.peutEditer(b)}
                                    lignes={4}
                                    compteur
                                    placeholder="Appréciation générale de la période…"
                                    onEnregistrer={(v) => enregistrer(b, { appreciation: v || null })}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="border-t border-border bg-surface-2/60 text-[11.5px] text-muted">
                  <td className="sticky left-0 z-10 bg-surface-2 px-3 py-1 font-medium">Moyenne {ctx.classe.rang_par_niveau && ctx.classe.niveaux.length > 1 ? `des ${niveau}` : "de la classe"}</td>
                  {colonnes.map(({ g, ms }) => (
                    <Fragment key={g.id}>
                      {ms.map((m) => (
                        <td key={m.id} className="px-1.5 py-1 text-center tabular-nums">
                          {note20(moyLot(lot, (r) => chiffreMatiere(r, m.id)))}
                        </td>
                      ))}
                      <td className="bg-gold-soft/40 px-1.5 py-1 text-center font-semibold tabular-nums">{note20(moyLot(lot, (r) => chiffreGroupe(r, g.id)))}</td>
                    </Fragment>
                  ))}
                  <td className="border-l border-border px-2 py-1 text-center font-semibold tabular-nums">{note20(moyLot(lot, (r) => r.general))}</td>
                  <td colSpan={ctx.classe.afficher_rang ? 3 : 2} />
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Case d'une moyenne ; grisée si la matière ne concerne pas le niveau de l'élève. */
function Cellule({ c, fort = false }: { c: Chiffre | null; fort?: boolean }) {
  return (
    <td className={`px-1.5 py-1 text-center tabular-nums ${fort ? "bg-gold-soft/40 font-semibold" : ""} ${c ? ton(c.moy) : "bg-surface-2/50"}`}>
      {c ? note20(c.moy) : ""}
    </td>
  );
}

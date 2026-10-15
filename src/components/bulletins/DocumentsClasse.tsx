"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { estSynthese, nomEleve, note20, trimestreEnLettres, type Enseignant, type Matiere, type Periode, type Statut, type Synthese, niveauDe, type EleveBulletin } from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import {
  matieresAvecAppreciation,
  syntheseReleve,
  syntheseTrimestre,
  titreTrimestre,
  type ContexteDocs,
  type DocReleve,
  type DocTrimestre,
} from "@/lib/relevesTrimestre";
import { BoutonEnregistrer, BoutonLot, PastilleStatut, ZoneAppreciation } from "./outils";
import { enregistrerTout } from "@/lib/sauvegardeAuto";

const OUVERTS: Statut[] = ["nouveau", "en_cours", "pret"];

/**
 * Relevés de notes (une période : notes seules, appréciation générale) ou bulletins trimestriels (moyennes simples,
 * une appréciation par matière (son professeur ou la titulaire), appréciation du trimestre de la titulaire). Même circuit
 * que les bulletins : Prêt (titulaire), Validé puis Publié (Directrice) ; la famille lit les documents publiés.
 */
export default function DocumentsClasse({
  mode,
  ctx,
  periode,
  directrice,
  titulaire,
  enseignantId,
  peutApprecier,
  nomTitulaire,
  enseignants,
  onRecharger,
}: {
  mode: "releve" | "trimestre";
  ctx: ContexteDocs;
  periode: Periode;
  directrice: boolean;
  titulaire: boolean;
  enseignantId: string | null;
  /** Appréciation d'une matière (le Catéchisme est réservé au Directeur spirituel). */
  peutApprecier?: (m: Matiere) => boolean;
  nomTitulaire: string | null;
  enseignants: Map<string, Enseignant>;
  onRecharger: () => Promise<void>;
}) {
  const sb = useMemo(() => createClient(), []);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const table = mode === "releve" ? "releves_notes" : "bulletins_trimestre";
  const docs: (DocReleve | DocTrimestre)[] = mode === "releve" ? ctx.releves : ctx.trimestriels;
  const docDe = (eleveId: string) => docs.find((d) => d.eleve_id === eleveId);
  const outils = { titulaire: nomTitulaire, enseignants };
  const avecAppreciation = mode === "trimestre" ? matieresAvecAppreciation(ctx) : [];
  const peutNoter = (m: Matiere) => directrice || titulaire || (!!enseignantId && m.enseignants.includes(enseignantId));
  const peutEditer = (d: { statut: Statut } | undefined) => !!d && (directrice || (titulaire && OUVERTS.includes(d.statut)));

  const synthese = (eleveId: string): Synthese | null => {
    const e = ctx.eleves.find((x) => x.id === eleveId);
    const d = docDe(eleveId);
    if (!e) return null;
    if (d?.statut === "publie" && estSynthese(d.synthese)) return d.synthese;
    return mode === "releve" ? syntheseReleve(ctx, periode, e, d as DocReleve | undefined, outils) : syntheseTrimestre(ctx, e, d as DocTrimestre | undefined, outils);
  };

  async function agir(p: PromiseLike<{ error: { message: string } | null }>) {
    setOccupe(true);
    const { error } = await p;
    setOccupe(false);
    setMessage(error ? `Échec : ${error.message}` : null);
    if (!error) await onRecharger();
  }

  // Appréciations enregistrées d'elles-mêmes (sans recharger à chaque frappe) ; le bouton du bas relit tout.
  const ecrire = async (p: PromiseLike<{ error: { message: string } | null }>) => (await p).error?.message ?? null;
  const haut = useRef<HTMLDivElement>(null);

  const selection = docs.filter((d) => choix.has(d.id));
  const cible = selection.length ? selection : docs;
  const changer = (statut: Statut) => agir(sb.rpc("releves_changer_statut", { p_doc: mode, p_ids: cible.map((d) => d.id), p_statut: statut }));
  const publier = () => {
    const items = cible.filter((d) => d.statut === "valide").map((d) => ({ id: d.id, synthese: synthese(d.eleve_id) }));
    return agir(sb.rpc("releves_publier", { p_doc: mode, p_items: items }));
  };
  const pdf = async () => {
    const ss = (selection.length ? selection : docs).map((d) => synthese(d.eleve_id)).filter((s): s is Synthese => !!s);
    await telechargerBulletins(ss, `${mode === "releve" ? "Relevés de notes" : "Bulletins"} ${ctx.classe.nom} - ${mode === "releve" ? `Période ${periode.ordre}` : titreTrimestre(ctx.trimestre)}`);
  };

  // Classe à plusieurs niveaux : élèves regroupés par niveau (CE1, puis CE2…), puis par nom.
  const multiNiveaux = ctx.classe.niveaux.length > 1;
  const niveauEleve = (e: EleveBulletin) => niveauDe(e, ctx.classe.annee_scolaire) ?? "";
  const eleves = [...ctx.eleves].sort((a, b) => (multiNiveaux ? niveauEleve(a).localeCompare(niveauEleve(b)) : 0) || nomEleve(a).localeCompare(nomEleve(b), "fr"));
  const n = (s: Statut) => cible.filter((d) => d.statut === s).length;
  // Vue compacte : un élève à la fois, choisi dans une barre horizontale (« Tous » : la liste complète).
  const [tous, setTous] = useState(false);
  const [courant, setCourant] = useState<string | null>(null);
  const idCourant = eleves.some((e) => e.id === courant) ? courant : (eleves[0]?.id ?? null);
  const rang = eleves.findIndex((e) => e.id === idCourant);
  const affiches = tous ? eleves : eleves.filter((e) => e.id === idCourant);
  // Navigation circulaire : avant le premier élève vient le dernier, après le dernier revient le premier.
  const nbEleves = eleves.length;
  const precedent = nbEleves > 1 && rang >= 0 ? eleves[(rang - 1 + nbEleves) % nbEleves] : undefined;
  const suivant = nbEleves > 1 && rang >= 0 ? eleves[(rang + 1) % nbEleves] : undefined;
  // Changer d'élève : les saisies en attente partent d'abord, puis l'en-tête de l'élève revient en vue.
  const allerA = (id: string) => {
    void enregistrerTout();
    setTous(false);
    setCourant(id);
    // Remonter seulement jusqu'au prénom de l'élève (en-tête du bulletin), pas en haut de la page.
    window.requestAnimationFrame(() => document.getElementById("bulletin-eleve")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const groupesNiveau = eleves.reduce<{ niveau: string; eleves: EleveBulletin[] }[]>((acc, e) => {
    const nv = multiNiveaux ? niveauEleve(e) : "";
    const g = acc.find((x) => x.niveau === nv);
    if (g) g.eleves.push(e);
    else acc.push({ niveau: nv, eleves: [e] });
    return acc;
  }, []);
  const POINT: Record<Statut, string> = { nouveau: "bg-muted/50", en_cours: "bg-gold", pret: "bg-accent", valide: "bg-positive", publie: "bg-positive" };

  return (
    <div ref={haut} className="scroll-mt-4 space-y-3">
      <div className="rounded-xl border border-border bg-surface p-3 text-[13px]">
        <div className="font-semibold">
          {mode === "releve" ? `Relevés de notes · Période ${periode.ordre}` : `Bulletins · ${trimestreEnLettres(ctx.trimestre)}`}
        </div>
        {mode === "releve" && <p className="text-[12px] text-muted">Les notes de la période uniquement, sans moyenne, avec une appréciation générale.</p>}
        <div className="mt-2 flex flex-wrap gap-2">
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
        {message && <p className="mt-2 text-[12px] text-negative">{message}</p>}
      </div>

      {!eleves.length && <p className="text-sm text-muted">Aucun élève dans cette classe.</p>}
      {eleves.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-2">
          <div className="flex items-center gap-2">
            <button type="button" disabled={tous || !precedent} onClick={() => precedent && allerA(precedent.id)} className="shrink-0 rounded-md px-2 py-1 text-[13px] text-accent hover:bg-accent-soft disabled:opacity-30" aria-label="Élève précédent">
              ‹
            </button>
            {/* Un bouton par élève. Classe à plusieurs niveaux : un bloc horizontal par niveau (élèves à la suite), blocs
                empilés ; sinon, les élèves à la suite. */}
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
              {groupesNiveau.map((g) => (
                <div
                  key={g.niveau}
                  className={multiNiveaux ? "flex flex-wrap items-center gap-1 rounded-lg border border-gold/50 bg-gold-soft/30 p-1.5" : "flex flex-wrap items-center gap-1"}
                >
                  {multiNiveaux && <span className="mr-1 w-10 shrink-0 rounded bg-gold-soft px-1.5 py-0.5 text-center text-[11px] font-bold text-gold">{g.niveau || "?"}</span>}
                  {g.eleves.map((e) => {
                    const d = docDe(e.id);
                    const choisi = !tous && e.id === idCourant;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setTous(false);
                          setCourant(e.id);
                        }}
                        title={`${nomEleve(e)}${g.niveau ? ` · ${g.niveau}` : ""}`}
                        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-left text-[12.5px] ${
                          choisi ? "border-accent bg-accent text-accent-fg" : "border-border bg-background hover:bg-accent-soft"
                        }`}
                      >
                        {d && <span className={`h-2 w-2 rounded-full ${POINT[d.statut]}`} aria-hidden />}
                        {e.prenom ?? nomEleve(e)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <button type="button" disabled={tous || !suivant} onClick={() => suivant && allerA(suivant.id)} className="shrink-0 rounded-md px-2 py-1 text-[13px] text-accent hover:bg-accent-soft disabled:opacity-30" aria-label="Élève suivant">
              ›
            </button>
            <button
              type="button"
              onClick={() => setTous((t) => !t)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[12px] ${tous ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:bg-surface-2"}`}
            >
              Tous
            </button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {affiches.map((e, k) => {
          const nouveauNiveau = tous && multiNiveaux && (k === 0 || niveauEleve(affiches[k - 1]) !== niveauEleve(e));
          const d = docDe(e.id);
          const s = synthese(e.id);
          const champ = "w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-foreground outline-none focus:border-accent read-only:border-transparent read-only:bg-transparent";
          return (
            <Fragment key={e.id}>
            {nouveauNiveau && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border-l-4 border-gold bg-gold-soft/50 px-3 py-1 text-[12.5px] font-semibold text-gold">
                {niveauEleve(e) || "Niveau non renseigné"} · {eleves.filter((x) => niveauEleve(x) === niveauEleve(e)).length} élève(s)
              </div>
            )}
            <div id={!tous ? "bulletin-eleve" : undefined} className="scroll-mt-[70px] rounded-xl border border-border bg-surface p-2.5 md:scroll-mt-2">
              {/* En-tête de l'élève : reste affiché au défilement (un élève à la fois), avec la navigation ‹ › . */}
              <div className={`mb-1.5 flex flex-wrap items-center gap-2 ${!tous ? "sticky top-[62px] z-10 -mx-2.5 -mt-2.5 md:top-0 rounded-t-xl border-b border-border bg-surface px-2.5 py-2 shadow-sm" : ""}`}>
                {d && (
                  <input
                    type="checkbox"
                    checked={choix.has(d.id)}
                    onChange={(ev) => setChoix((c) => {
                      const x = new Set(c);
                      if (ev.target.checked) x.add(d.id);
                      else x.delete(d.id);
                      return x;
                    })}
                    aria-label={`Choisir ${nomEleve(e)}`}
                  />
                )}
                <span className="font-medium">{nomEleve(e)}</span>
                {multiNiveaux && niveauEleve(e) && <span className="rounded bg-gold-soft px-1.5 py-0.5 text-[11px] font-bold text-gold">{niveauEleve(e)}</span>}
                {d && <PastilleStatut statut={d.statut} />}
                {mode === "trimestre" && s?.general.moy != null && (
                  <span className="text-[12px] text-muted">
                    Moyenne générale <strong className="text-accent">{note20(s.general.moy)}</strong>
                  </span>
                )}
                {s && (
                  <button type="button" onClick={() => telechargerBulletins([s])} className="ml-auto text-[12px] text-accent hover:underline">
                    PDF
                  </button>
                )}
                {!tous && eleves.length > 1 && (
                  <span className="flex items-center gap-1">
                    {[precedent, suivant].map((cible, i) => {
                      const changeNiveau = !!cible && multiNiveaux && niveauEleve(cible) !== niveauEleve(e);
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={!cible}
                          onClick={() => cible && allerA(cible.id)}
                          title={cible ? `${i ? "Élève suivant" : "Élève précédent"} : ${nomEleve(cible)}${changeNiveau ? ` (passage en ${niveauEleve(cible)})` : ""}` : undefined}
                          className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[12px] disabled:opacity-30 ${changeNiveau ? "border-gold/50 bg-gold-soft/40 text-gold hover:bg-gold-soft" : "border-border bg-background text-accent hover:bg-accent-soft"}`}
                        >
                          {i ? null : "‹"}
                          <span className="max-w-24 truncate">{cible ? (cible.prenom ?? nomEleve(cible)) : i ? "Fin" : "Début"}</span>
                          {changeNiveau && <span className="text-[10px] font-bold">{niveauEleve(cible!)}</span>}
                          {i ? "›" : null}
                        </button>
                      );
                    })}
                  </span>
                )}
              </div>

              {/* Le document, ligne par ligne : l'appréciation de chaque matière face à sa moyenne. */}
              {s && s.groupes.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-[12.5px]">
                    <tbody>
                      {s.groupes.map((g) => (
                        <Fragment key={g.nom}>
                          <tr className="bg-gold-soft/50 font-semibold">
                            <td className="px-2 py-1">{g.nom}</td>
                            <td className="px-2 py-1 text-center tabular-nums">{mode === "trimestre" && !g.matieres.every((m) => m.appreciationSeule) ? note20(g.chiffre.moy) : ""}</td>
                            <td />
                          </tr>
                          {g.matieres.map((m) => {
                            const mat = avecAppreciation.find((x) => x.nom === m.nom);
                            const a = mat && d ? ctx.appreciations.find((x) => x.bulletin_id === d.id && x.matiere_id === mat.id) : undefined;
                            const modifiable = !!mat && !!d && (peutApprecier ?? peutNoter)(mat) && (directrice || OUVERTS.includes(d.statut));
                            return (
                              <tr key={m.nom} className="border-t border-border/60 align-middle">
                                <td className="w-[9rem] px-2 py-0.5 pl-4">{m.nom}</td>
                                <td className={`px-2 py-0.5 ${mode === "trimestre" ? "w-[4.5rem] text-center tabular-nums" : "text-muted"}`}>
                                  {m.appreciationSeule ? "" : mode === "trimestre" ? note20(m.chiffre.moy) : m.commentaire ?? "–"}
                                </td>
                                <td className="px-1 py-0.5">
                                  {mat && d ? (
                                    <div className="max-w-[36rem]">
                                    <ZoneAppreciation
                                      key={`${d.id}:${mat.id}`}
                                      valeur={a?.texte ?? ""}
                                      readOnly={!modifiable}
                                      rows={1}
                                      placeholder={modifiable ? `Appréciation · ${m.nom}` : ""}
                                      onEnregistrer={(v) => ecrire(sb.from("bulletins_trimestre_appreciations").upsert({ bulletin_id: d.id, matiere_id: mat.id, texte: v.trim() || null }))}
                                      className={`${champ} min-h-[1.9rem] resize-y`}
                                    />
                                    </div>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {d && (
                <div className="mt-1.5 flex items-start gap-2 border-t border-border pt-1.5">
                  <span className="w-[9rem] shrink-0 px-2 pt-1 text-[12px] font-semibold">{mode === "trimestre" ? "Appréciation du trimestre" : "Appréciation générale"}</span>
                  <div className="w-full max-w-[36rem]">
                  <ZoneAppreciation
                    key={d.id}
                    valeur={d.appreciation ?? ""}
                    readOnly={!peutEditer(d)}
                    rows={2}
                    onEnregistrer={(v) => ecrire(sb.from(table).update({ appreciation: v.trim() || null }).eq("id", d.id))}
                    className={champ}
                  />
                  </div>
                </div>
              )}
            </div>
            </Fragment>
          );
        })}
      </div>
      {/* Navigation d'un élève à l'autre, en bas du bulletin (le passage à un autre niveau est signalé). */}
      {!tous && eleves.length > 1 && (
        <div className="flex flex-wrap items-stretch justify-center gap-2">
          {[precedent, suivant].map((cible, i) => {
            const suivant = i === 1;
            const changeNiveau = !!cible && multiNiveaux && niveauEleve(cible) !== niveauEleve(eleves[rang]);
            return (
              <button
                key={suivant ? "suivant" : "precedent"}
                type="button"
                disabled={!cible}
                onClick={() => cible && allerA(cible.id)}
                className={`flex w-56 max-w-[45%] items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-colors disabled:opacity-30 ${suivant ? "flex-row-reverse text-right" : ""} ${
                  changeNiveau ? "border-gold/50 bg-gold-soft/30 hover:bg-gold-soft/60" : "border-border bg-surface hover:bg-accent-soft/50"
                }`}
              >
                <span className="text-lg leading-none text-accent">{suivant ? "›" : "‹"}</span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide text-muted">{suivant ? "Élève suivant" : "Élève précédent"}</span>
                  {cible ? (
                    <span className="block truncate text-[12.5px] font-semibold">
                      {nomEleve(cible)}
                      {multiNiveaux && niveauEleve(cible) ? <span className="ml-1.5 text-[11px] font-normal text-muted">{niveauEleve(cible)}</span> : null}
                    </span>
                  ) : (
                    <span className="block text-[13px] text-muted">{suivant ? "Dernier élève" : "Premier élève"}</span>
                  )}
                  {changeNiveau && <span className="mt-0.5 inline-block rounded bg-gold-soft px-1.5 text-[10.5px] font-bold text-gold">Passage en {niveauEleve(cible!) || "?"}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <BoutonEnregistrer
        onFini={() => {
          void onRecharger();
          haut.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
    </div>
  );
}

"use client";

import { createPortal } from "react-dom";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  arrondi,
  estAppreciationSeule,
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
import { BoutonLot, CommutateurPret, PastilleStatut, ZoneAppreciation } from "./outils";
import { enregistrerTout } from "@/lib/sauvegardeAuto";

const OUVERTS: Statut[] = ["nouveau", "en_cours", "pret"];
const ETAT_COURT: Record<string, string> = { absent: "abs", dispense: "disp", non_rendu: "nr" };
const nombre = (n: number) => String(arrondi(n)).replace(".", ",");

/**
 * Relevés de notes d'une période, en tableau de classe compact (comme le Conseil de classe) : une ligne par élève, les
 * notes de la période dans chaque matière (aucune moyenne), l'appréciation générale et l'état du relevé. Un clic sur
 * une matière ou une case ouvre la saisie de cette matière (évaluations, notes, + Évaluation) ; un clic sur l'élève
 * ouvre son appréciation générale. Relevé publié : notes de l'élève verrouillées (aussi en base).
 * Catéchisme : une appréciation seule, sans note ; sa case ouvre la ligne de l'élève, où elle se rédige.
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
  emplacement,
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
  /** Barre de la page où se placent les boutons d'état (une seule tuile en haut). */
  emplacement?: HTMLElement | null;
}) {
  const sb = useMemo(() => createClient(), []);
  const { directrice, titulaire } = droits;
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
      // Tableau plus haut que sa zone : la molette le fait défiler verticalement (les en-têtes restent en haut).
      if (el.scrollHeight > el.clientHeight + 1) return;
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
  const cible = docs_;
  const n = (s: Statut) => cible.filter((d) => d.statut === s).length;
  // Classe à plusieurs niveaux : élèves regroupés par niveau (CE1, puis CE2…), puis par nom.
  const multiNiveaux = vue.classe.niveaux.length > 1;
  const niveauEleve = (e: EleveBulletin) => niveauDe(e, vue.classe.annee_scolaire) ?? "";
  const eleves = [...vue.eleves].sort((a, b) => (multiNiveaux ? niveauEleve(a).localeCompare(niveauEleve(b)) : 0) || nomEleve(a).localeCompare(nomEleve(b), "fr"));
  const eleveDe = (id: string) => vue.eleves.find((x) => x.id === id);
  // Navigation circulaire entre élèves (comme dans Bulletins) : après le dernier revient le premier.
  const rangOuvert = eleves.findIndex((x) => x.id === eleveOuvert);
  const precedent = eleves.length > 1 && rangOuvert >= 0 ? eleves[(rangOuvert - 1 + eleves.length) % eleves.length] : undefined;
  const suivant = eleves.length > 1 && rangOuvert >= 0 ? eleves[(rangOuvert + 1) % eleves.length] : undefined;
  const changer = (statut: Statut) => agir(sb.rpc("releves_changer_statut", { p_doc: "releve", p_ids: cible.map((d) => d.id), p_statut: statut }));
  const publier = () => {
    const items = cible.filter((d) => d.statut === "valide").flatMap((d) => {
      const e = eleveDe(d.eleve_id);
      return e ? [{ id: d.id, synthese: synthese(e) }] : [];
    });
    return agir(sb.rpc("releves_publier", { p_doc: "releve", p_items: items }));
  };
  const pdf = async () => {
    const ss = docs_.flatMap((d) => {
      const e = eleveDe(d.eleve_id);
      return e ? [synthese(e)] : [];
    });
    await telechargerBulletins(ss, `Relevés de notes ${vue.classe.nom} - Période ${periode.ordre}`);
  };
  const matiere = vue.matieres.find((m) => m.id === matiereOuverte);
  // Ligne d'un élève : en la quittant, les appréciations en attente partent, puis le relevé est relu (résumé, état).
  const basculerEleve = (id: string | null) => {
    if (eleveOuvert) void enregistrerTout().then(onRecharger);
    setEleveOuvert(id);
  };
  // Bouton « Retour » du navigateur : referme la saisie d'une matière (ou le panneau d'un élève) au lieu de quitter le relevé.
  // L'état de Next est conservé dans l'entrée d'historique ajoutée (sans lui, Next rechargerait la page).
  const panneauAjoute = useRef(false);
  const panneauOuvert = !!(matiereOuverte || eleveOuvert);
  useEffect(() => {
    if (panneauOuvert && !panneauAjoute.current) {
      window.history.pushState({ ...(window.history.state ?? {}), panneauReleve: true }, "", window.location.href);
      panneauAjoute.current = true;
    }
    if (!panneauOuvert) {
      if (panneauAjoute.current) {
        panneauAjoute.current = false;
        if ((window.history.state as { panneauReleve?: boolean } | null)?.panneauReleve) window.history.back();
      }
      return;
    }
    const retour = () => {
      panneauAjoute.current = false;
      if (eleveOuvert) void enregistrerTout().then(onRecharger);
      setEleveOuvert(null);
      setMatiereOuverte(null);
    };
    window.addEventListener("popstate", retour);
    return () => window.removeEventListener("popstate", retour);
  }, [panneauOuvert, eleveOuvert, onRecharger]);
  // Au moins une appréciation saisie pour l'élève (générale ou d'une matière en appréciation seule).
  const aAppreciation = (eleveId: string) => {
    const d = docDe(eleveId);
    return !!d && (!!d.appreciation?.trim() || vue.appreciations.some((x) => x.bulletin_id === d.id && !!x.texte?.trim()));
  };
  const ecrire = async (p: PromiseLike<{ error: { message: string } | null }>) => (await p).error?.message ?? null;
  const haut = useRef<HTMLDivElement>(null);
  const appreciationDe = (d: DocReleve | undefined, m: Matiere) => (d ? vue.appreciations.find((x) => x.bulletin_id === d.id && x.matiere_id === m.id) : undefined);
  const peutApprecier = (d: DocReleve | undefined, m: Matiere) => !!d && droits.peutApprecier(m) && (directrice || OUVERTS.includes(d.statut));
  const champ = "w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] outline-none focus:border-accent read-only:border-transparent read-only:bg-transparent";
  // Colonnes d'élèves regroupées par niveau (classe à plusieurs niveaux) ; un trait doré ouvre chaque niveau.
  const groupesNiveau = eleves.reduce<{ niveau: string; eleves: EleveBulletin[] }[]>((acc, e) => {
    const nv = multiNiveaux ? niveauEleve(e) : "";
    const g = acc.find((x) => x.niveau === nv);
    if (g) g.eleves.push(e);
    else acc.push({ niveau: nv, eleves: [e] });
    return acc;
  }, []);
  // Trait doré entre niveaux : seulement quand tous les niveaux sont affichés.
  const debutNiveau = (e: EleveBulletin) => multiNiveaux && tousNiveaux && groupesNiveau.some((g) => g.eleves[0]?.id === e.id);
  // Affichage de tous les niveaux par défaut, ou d'un seul bloc de niveau.
  const [niveauChoisi, setNiveauChoisi] = useState<string | null>("*");
  const tousNiveaux = !multiNiveaux || niveauChoisi === "*";
  const niveauAffiche = groupesNiveau.some((g) => g.niveau === niveauChoisi) ? niveauChoisi : (groupesNiveau[0]?.niveau ?? "");
  const visibles = tousNiveaux ? eleves : eleves.filter((e) => niveauEleve(e) === niveauAffiche);

  const boutons = (
    <div className="ml-auto flex flex-wrap gap-2">
            {(directrice || titulaire) && (
          <CommutateurPret
            publie={docs_.length > 0 && docs_.every((d) => d.statut === "publie")}
            pret={docs_.length > 0 && docs_.every((d) => ["pret", "valide", "publie"].includes(d.statut))}
            onChange={(v) => changer(v ? "pret" : "en_cours")}
            disabled={occupe || !docs_.length}
            titre="Relevés : En cours / Prêt"
          />
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
            {directrice && <BoutonLot onClick={pdf}>PDF de la classe</BoutonLot>}
          </div>
  );

  return (
    <div ref={haut} className="mx-auto scroll-mt-4 space-y-3">
      {/* Barre d'actions sur une ligne. */}
      {emplacement && createPortal(boutons, emplacement)}
      {(!emplacement || message) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1 text-[13px]">
        {!emplacement && boutons}
        {message && <p className="w-full text-[12.5px] text-negative">{message}</p>}
        </div>
      )}

      {/* Saisie de la matière ouverte, juste au-dessus du tableau. */}
      {matiere && (
        <div className="rounded-xl border-2 border-accent/40 bg-accent-soft/20 p-3">
          {/* Bouton de retour au centre ; le libellé à gauche, la colonne de droite l'équilibre. */}
          <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span className="text-[12.5px] font-semibold uppercase tracking-wide text-accent">Saisie des notes</span>
            <button type="button" onClick={() => setMatiereOuverte(null)} className="px-4 py-1.5 text-[13px] font-semibold text-gold hover:underline">
              ← Retour Relevés de notes
            </button>
            <span />
          </div>
          <SaisieNotes ctx={ctx} resultats={resultats} droits={droits} enseignants={enseignants} onMaj={onMaj} matiereImposee={matiere.id} verrouEleve={verrou} niveauSeul={tousNiveaux ? null : niveauAffiche} />
        </div>
      )}

      {/* Appréciations de l'élève ouvert (Catéchisme, appréciation générale), juste au-dessus du tableau. */}
      {eleveOuvert &&
        (() => {
          const e = eleveDe(eleveOuvert);
          const d = docDe(eleveOuvert);
          if (!e || !d) return null;
          const niveau = niveauDe(e, vue.classe.annee_scolaire);
          return (
            <div className="rounded-xl border-2 border-accent/40 bg-accent-soft/20 p-3">
              <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <span className="flex items-center gap-1 text-[12.5px] font-semibold uppercase tracking-wide text-accent">
                  <button type="button" disabled={!precedent} onClick={() => precedent && basculerEleve(precedent.id)} className="shrink-0 rounded-md px-2 py-1 text-[13px] hover:bg-accent-soft disabled:opacity-30" aria-label="Élève précédent">
                    ‹
                  </button>
                  <span>
                    Appréciations · {nomEleve(e)}
                    {niveau && multiNiveaux ? ` (${niveau})` : ""}
                  </span>
                  <button type="button" disabled={!suivant} onClick={() => suivant && basculerEleve(suivant.id)} className="shrink-0 rounded-md px-2 py-1 text-[13px] hover:bg-accent-soft disabled:opacity-30" aria-label="Élève suivant">
                    ›
                  </button>
                </span>
                <button type="button" onClick={() => basculerEleve(null)} className="px-4 py-1.5 text-[13px] font-semibold text-gold hover:underline">
                  ← Retour Relevés de notes
                </button>
                <span />
              </div>
              <div className="space-y-1.5">
                {vue.matieres
                  .filter((m) => estAppreciationSeule(m.nom) && matiereConcerne(m, niveau))
                  .map((m) => {
                    const a = appreciationDe(d, m);
                    const modifiable = peutApprecier(d, m);
                    return (
                      <div key={m.id} className="flex max-w-3xl items-start gap-2">
                        <span className="w-[9rem] shrink-0 pt-1 text-[12.5px] font-semibold">{m.nom}</span>
                        <ZoneAppreciation
                          key={`${d.id}:${m.id}`}
                          valeur={a?.texte ?? ""}
                          readOnly={!modifiable}
                          rows={2}
                          placeholder={modifiable ? `Appréciation · ${m.nom}` : ""}
                          onEnregistrer={(v) => ecrire(sb.from("releves_notes_appreciations").upsert({ releve_id: d.id, matiere_id: m.id, texte: v.trim() || null }))}
                          className={champ}
                        />
                      </div>
                    );
                  })}
                <div className="flex max-w-3xl items-start gap-2">
                  <span className="w-[9rem] shrink-0 pt-1 text-[12.5px] font-semibold">Appréciation générale</span>
                  <ZoneAppreciation
                    key={d.id}
                    autoFocus
                    valeur={d.appreciation ?? ""}
                    readOnly={!peutEditer(d)}
                    rows={3}
                    onEnregistrer={(v) => ecrire(sb.from("releves_notes").update({ appreciation: v.trim() || null }).eq("id", d.id))}
                    className={champ}
                  />
                </div>
              </div>
            </div>
          );
        })()}

      {!eleves.length && <p className="text-sm text-muted">Aucun élève dans cette classe.</p>}
      {multiNiveaux && eleves.length > 0 && !matiere && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span className="text-[12.5px] text-muted">Afficher :</span>
          {groupesNiveau.map((g) => (
            <button
              key={g.niveau}
              type="button"
              onClick={() => setNiveauChoisi(g.niveau)}
              className={`rounded-lg border px-3 py-1 text-[12.5px] font-semibold ${!tousNiveaux && niveauAffiche === g.niveau ? "border-gold/50 bg-gold-soft text-gold" : "border-border bg-surface text-muted hover:bg-surface-2"}`}
            >
              {g.niveau || "?"} <span className="font-normal opacity-80">· {g.eleves.length}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setNiveauChoisi("*")}
            className={`rounded-lg border px-3 py-1 text-[12.5px] font-semibold ${tousNiveaux ? "border-gold/50 bg-gold-soft text-gold" : "border-border bg-surface text-muted hover:bg-surface-2"}`}
          >
            Tous les niveaux
          </button>
        </div>
      )}
      {/* Tableau transposé : une ligne par matière (par ensemble : Français, Mathématiques…), une colonne par élève
          (par niveau). Un clic sur une matière ou une case ouvre la saisie ; un clic sur un élève, ses appréciations. */}
      <div ref={defilementRef} className={`mx-auto max-h-[calc(100vh-8rem)] w-fit max-w-full overflow-auto rounded-xl border border-border bg-surface ${matiere ? "hidden" : ""}`}>
        <table className="text-[12.5px]">
          <thead className="sticky top-0 z-20 bg-surface">
            {multiNiveaux && tousNiveaux && (
              <tr className="text-[11px]">
                <th className="sticky left-0 z-10 border-b border-border bg-surface" />
                {groupesNiveau.filter((g) => tousNiveaux || g.niveau === niveauAffiche).map((g) => (
                  <th key={g.niveau} colSpan={g.eleves.length} className="border-b border-l-2 border-gold/50 bg-gold-soft/50 px-2 py-1 font-bold text-gold">
                    {g.niveau || "Niveau non renseigné"} · {g.eleves.length} élève(s)
                  </th>
                ))}
              </tr>
            )}
            <tr className="text-[11px] text-muted">
              <th className="sticky left-0 z-10 min-w-40 border-b border-border bg-surface px-3 py-2 text-left font-medium uppercase tracking-wide">Matière</th>
              {visibles.map((e) => {
                const actif = eleveOuvert === e.id;
                return (
                  <th
                    key={e.id}
                    className={`min-w-20 max-w-28 border-b border-border px-1.5 py-1.5 align-middle font-normal ${debutNiveau(e) ? "border-l-2 border-l-gold/50" : "border-l border-l-border/60"} ${actif ? "bg-accent-soft" : ""}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => basculerEleve(actif ? null : e.id)}
                        className="text-center text-[12.5px] font-semibold leading-tight text-foreground hover:text-accent hover:underline"
                        title={`Appréciations · ${nomEleve(e)}`}
                      >
                        {e.prenom ?? ""}
                        <span className="block text-[12.5px] font-semibold">{e.nom}</span>
                        {aAppreciation(e.id) && (
                          <span title="Appréciation renseignée" aria-label="Appréciation renseignée" className="mt-0.5 inline-flex text-positive">
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
                              <path d="m8.5 12 2.5 2.5 4.5-5" />
                            </svg>
                          </span>
                        )}
                      </button>
                      {verrou(e.id) && (
                        <span className="text-[10px]" title="Relevé publié : notes verrouillées">
                          🔒
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {colonnes.map(({ g, ms }) => (
              <Fragment key={g.id}>
                <tr className="border-t border-border bg-gold-soft/40">
                  <td className="sticky left-0 z-10 bg-gold-soft px-3 py-1.5 text-[12.5px] font-semibold">{g.nom}</td>
                  {/* Une case par élève (et non une seule case sur toute la ligne) : les traits de niveau restent continus. */}
                  {visibles.map((e) => (
                    <td key={e.id} className={debutNiveau(e) ? "border-l-2 border-l-gold/50" : ""} />
                  ))}
                </tr>
                {ms.map((m) => {
                  const seule = estAppreciationSeule(m.nom);
                  const nb = evalsDe(m).length;
                  // Responsable de la matière (profil connecté) : sinon la ligne est grisée et sans « + ».
                  const responsable = seule ? droits.peutApprecier(m) : droits.enseignantId ? m.enseignants.includes(droits.enseignantId) : droits.peutNoter(m);
                  return (
                    <tr key={m.id} className={`border-t border-border/60 ${responsable ? "" : "text-muted opacity-60"} ${matiereOuverte === m.id ? "bg-accent-soft/30" : "hover:bg-surface-2/40"}`}>
                      <td className="sticky left-0 z-10 bg-surface p-0">
                        {seule || !droits.peutSaisirNotes(m) ? (
                          <div className="px-3 py-2" title={seule ? `${m.nom} : une appréciation, sans note` : m.nom}>
                            {m.nom}
                            {seule && <span className="ml-1.5 text-[10px] text-muted">appréciation</span>}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMatiereOuverte(matiereOuverte === m.id ? null : m.id)}
                            className={`flex w-full items-baseline gap-1.5 px-3 py-2 text-left hover:bg-accent-soft/60 ${matiereOuverte === m.id ? "bg-accent text-accent-fg" : ""}`}
                            title={`Saisir les notes · ${m.nom}${m.niveaux.length ? ` (${m.niveaux.join(", ")})` : ""}`}
                          >
                            {m.nom}
                            {nb > 0 && <span className="text-[10px] opacity-70">{nb} éval.</span>}
                          </button>
                        )}
                      </td>
                      {visibles.map((e) => {
                        const d = docDe(e.id);
                        const niveau = niveauDe(e, vue.classe.annee_scolaire);
                        const concerne = matiereConcerne(m, niveau);
                        const bord = debutNiveau(e) ? "border-l-2 border-l-gold/50" : "border-l border-l-border/40";
                        if (seule) {
                          const a = concerne ? appreciationDe(d, m)?.texte?.trim() : null;
                          const droit = concerne && droits.peutApprecier(m);
                          return (
                            <td
                              key={e.id}
                              onClick={() => droit && basculerEleve(e.id)}
                              title={droit ? `Rédiger l'appréciation · ${m.nom} · ${nomEleve(e)}` : undefined}
                              className={`max-w-28 px-1.5 py-2 text-center ${a ? "bg-positive/10" : ""} ${bord} ${droit ? "cursor-pointer hover:bg-accent-soft/50" : concerne ? "" : "bg-surface-2/50"}`}
                            >
                              {a ? (
                                <span className="line-clamp-1 text-[11.5px]" title="Appréciation saisie">
                                  <span aria-hidden className="mr-0.5 font-bold text-positive">✓</span>
                                  {a}
                                </span>
                              ) : droit && d ? <span className="text-[11px] text-gold">✎</span> : null}
                            </td>
                          );
                        }
                        const t = concerne ? notesCourtes(e, m) : [];
                        const droit = concerne && droits.peutSaisirNotes(m);
                        return (
                          <td
                            key={e.id}
                            onClick={() => droit && setMatiereOuverte(m.id)}
                            title={droit ? `Ajouter une évaluation ou une note · ${m.nom} · ${nomEleve(e)}` : undefined}
                            className={`group px-1.5 py-2 text-center tabular-nums ${bord} ${droit ? "cursor-pointer hover:bg-accent-soft/50" : concerne ? "" : "bg-surface-2/50"}`}
                          >
                            <span className="whitespace-nowrap text-[12.5px]">{t.join(" · ")}</span>
                            {concerne && appreciationDe(d, m)?.texte?.trim() && (
                              <span title="Appréciation renseignée" aria-label="Appréciation renseignée" className="ml-1 inline-flex align-middle text-positive">
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
                                  <path d="m8.5 12 2.5 2.5 4.5-5" />
                                </svg>
                              </span>
                            )}
                            {/* Au survol : « + » pour ajouter une évaluation ou une note. */}
                            {droit && responsable && (
                              <span
                                className={`inline-grid h-4 w-4 place-items-center rounded-full border border-gold/50 bg-gold-soft align-middle text-[11px] font-bold leading-none text-gold opacity-0 transition-opacity group-hover:opacity-100 ${t.length ? "ml-1" : ""}`}
                                aria-hidden
                              >
                                +
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
            {/* Pied : appréciation générale, état et PDF de chaque élève. */}
            <tr className="border-t-2 border-border">
              <td className="sticky left-0 z-10 bg-surface px-3 py-1 text-[12.5px] font-semibold">Appréciation générale</td>
              {visibles.map((e) => {
                const d = docDe(e.id);
                return (
                  <td
                    key={e.id}
                    onClick={() => basculerEleve(e.id)}
                    title={`Appréciations · ${nomEleve(e)}`}
                    className={`max-w-28 cursor-pointer px-1.5 py-1 text-center hover:bg-accent-soft/50 ${d?.appreciation?.trim() ? "bg-positive/10" : ""} ${debutNiveau(e) ? "border-l-2 border-l-gold/50" : "border-l border-l-border/40"}`}
                  >
                    {d?.appreciation?.trim() ? (
                      <span className="line-clamp-2 text-[11.5px]" title="Appréciation saisie">
                        <span aria-hidden className="mr-0.5 font-bold text-positive">✓</span>
                        {d.appreciation}
                      </span>
                    ) : d ? <span className="text-[11px] text-gold">✎ à rédiger</span> : null}
                  </td>
                );
              })}
            </tr>
            <tr className="border-t border-border/60">
              <td className="sticky left-0 z-10 bg-surface px-3 py-1 text-[12.5px] font-semibold">État</td>
              {visibles.map((e) => {
                const d = docDe(e.id);
                return (
                  <td key={e.id} className={`px-1.5 py-1 text-center ${debutNiveau(e) ? "border-l-2 border-l-gold/50" : "border-l border-l-border/40"}`}>
                    {d && <PastilleStatut statut={d.statut} />}
                  </td>
                );
              })}
            </tr>
            <tr className="border-t border-border/60">
              <td className="sticky left-0 z-10 bg-surface px-3 py-1 text-[12.5px] font-semibold">Relevé</td>
              {visibles.map((e) => (
                <td key={e.id} className={`px-1.5 py-1 text-center ${debutNiveau(e) ? "border-l-2 border-l-gold/50" : "border-l border-l-border/40"}`}>
                  {directrice && (
                    <button type="button" onClick={() => telechargerBulletins([synthese(e)])} className="text-[12.5px] text-accent hover:underline">
                      PDF
                    </button>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className={`text-[11.5px] text-muted ${matiere ? "hidden" : ""}`}>« abs » absent, « disp » dispensé, « nr » non rendu ; une note sur un autre barème que 20 est suivie de « /barème ». Cases grisées : matière hors du niveau de l&apos;élève.</p>
    </div>
  );
}

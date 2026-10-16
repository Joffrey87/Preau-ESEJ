"use client";

import { useSauvegardeAuto } from "@/lib/sauvegardeAuto";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";
import {
  matiereConcerne,
  nomEleve,
  nomProfesseur,
  note20,
  type ContexteClasse,
  type Enseignant,
  type Evaluation,
  type Note,
  type ResultatEleve,
  evaluationConcerne,
} from "@/lib/bulletins";
import type { Droits } from "./Bulletins";
import { AppreciationsEleveParEleve, ChampAppreciation, enregistrerAppreciation, raisonVerrou } from "./Appreciations";

const ETATS: Record<string, Note["etat"]> = { abs: "absent", a: "absent", disp: "dispense", d: "dispense", nr: "non_rendu" };
const ETAT_COURT: Record<string, string> = { absent: "abs", dispense: "disp", non_rendu: "nr" };

/**
 * Saisie des notes en grille, comme un tableur : une colonne par évaluation, une ligne par élève, Entrée ou ↓ pour
 * descendre. Chaque note est enregistrée en quittant la case ; la moyenne de la matière se met à jour aussitôt.
 */
export default function SaisieNotes({
  ctx,
  resultats,
  droits,
  enseignants,
  onMaj,
  matiereImposee,
  verrouEleve,
  niveauSeul,
  barreNiveaux,
  creerAuto = false,
  onCreerAutoFait,
  onChoisirNiveaux,
  eleveCible,
  matieresChoix,
  onChoisirMatiere,
}: {
  /** Case du relevé cliquée : la note de cet élève est ouverte à la saisie. */
  eleveCible?: string | null;
  /** Relevé : liste de matières pour changer de matière sans revenir au tableau. */
  matieresChoix?: { id: string; nom: string }[];
  onChoisirMatiere?: (id: string) => void;
  /** Niveaux cochés dans « + Évaluation » : le relevé aligne dessus son choix de bloc de niveau. */
  onChoisirNiveaux?: (niveaux: string[]) => void;
  /** Ouvre aussitôt le formulaire « + Évaluation » (lien du relevé ou du menu). */
  creerAuto?: boolean;
  onCreerAutoFait?: () => void;
  /** Filtre « Afficher : CE1 · 4 … » du relevé, repris au-dessus de « + Évaluation ». */
  barreNiveaux?: React.ReactNode;
  ctx: ContexteClasse;
  resultats: ResultatEleve[];
  droits: Droits;
  enseignants: Map<string, Enseignant>;
  onMaj: (f: (c: ContexteClasse | null) => ContexteClasse | null) => void;
  /** Ouverte depuis les Relevés de notes : la matière est choisie là-bas (pas de sélecteur ici). */
  matiereImposee?: string;
  /** Relevé publié : les notes de l'élève ne se modifient plus (la base le refuse aussi). */
  verrouEleve?: (eleveId: string) => boolean;
  /** Niveau affiché dans le relevé (CE1…) : seuls ses élèves et ses évaluations ; null = tous les niveaux. */
  niveauSeul?: string | null;
}) {
  const sb = useMemo(() => createClient(), []);
  const matieres = useMemo(() => {
    const ordreGroupe = new Map(ctx.groupes.map((g) => [g.id, g.ordre]));
    return ctx.matieres
      .filter((m) => m.actif)
      .sort((a, b) => (ordreGroupe.get(a.groupe_id) ?? 0) - (ordreGroupe.get(b.groupe_id) ?? 0) || a.ordre - b.ordre);
  }, [ctx]);
  const [matiereId, setMatiereId] = useState<string>(() => (matieres.find((m) => droits.peutNoter(m) && !droits.directrice && !droits.titulaire) ?? matieres[0])?.id ?? "");
  const matiere = matieres.find((m) => m.id === (matiereImposee ?? matiereId)) ?? matieres[0];
  const [nouvelle, setNouvelle] = useState<Partial<Evaluation> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Notes saisies dans le formulaire de création, enregistrées avec l'évaluation (élève → saisie).
  const [notesNouvelle, setNotesNouvelle] = useState<Record<string, string>>({});
  // Grille (notes + appréciations) ou saisie des appréciations élève par élève.
  // Grille seule : le choix « Élève par élève » n'est plus proposé.
  const [vue] = useState<"grille" | "eleve">("grille");

  useEffect(() => {
    if (!creerAuto || !matiere) return;
    const possibles = (matiere.niveaux.length ? matiere.niveaux : ctx.classe.niveaux).filter((n) => ctx.classe.niveaux.includes(n));
    const deja = ctx.evaluations.filter((e) => e.matiere_id === matiere.id && (!niveauSeul || evaluationConcerne(e, niveauSeul))).length;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ouverture demandée par le relevé
    setNouvelle({ titre: `Évaluation ${deja + 1}`, date: todayISO() <= ctx.periode.fin ? todayISO() : ctx.periode.fin, coef: 1, bareme: 20, niveaux: niveauSeul && possibles.includes(niveauSeul) ? [niveauSeul] : possibles });
    onCreerAutoFait?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creerAuto]);

  // Case du relevé cliquée : défilement jusqu'à l'élève et curseur dans sa première note.
  useEffect(() => {
    if (!eleveCible) return;
    const t = window.setTimeout(() => {
      const ligne = [...document.querySelectorAll<HTMLElement>(`[data-eleve="${eleveCible}"]`)].find((el) => el.offsetParent !== null);
      const champ = ligne?.querySelector<HTMLInputElement>("input[data-case]:not(:disabled)");
      ligne?.scrollIntoView({ block: "center", behavior: "smooth" });
      champ?.focus({ preventScroll: true });
    }, 50);
    return () => window.clearTimeout(t);
  }, [eleveCible]);
  // Blocs de niveau du relevé et cases « Niveau(x) concerné(s) » de « + Évaluation » : liés dans les deux sens.
  const viaCases = useRef(false);
  useEffect(() => {
    if (viaCases.current) {
      viaCases.current = false;
      return;
    }
    if (!nouvelle || !matiere) return;
    const possibles = (matiere.niveaux.length ? matiere.niveaux : ctx.classe.niveaux).filter((n) => ctx.classe.niveaux.includes(n));
    if (possibles.length < 2) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- le bloc de niveau choisi coche les niveaux
    setNouvelle((cur) => (cur ? { ...cur, niveaux: niveauSeul && possibles.includes(niveauSeul) ? [niveauSeul] : possibles } : cur));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [niveauSeul]);
  const changerNiveauxCoches = (n: string[]) => {
    setNouvelle((cur) => (cur ? { ...cur, niveaux: n } : cur));
    const cible = n.length === 1 ? n[0] : null;
    if (cible !== (niveauSeul ?? null)) viaCases.current = true;
    onChoisirNiveaux?.(n);
  };

  if (!matiere) return <p className="text-sm text-muted">Aucune matière dans cette classe.</p>;
  const peutNoter = droits.peutSaisirNotes(matiere);
  const evals = ctx.evaluations
    .filter((e) => e.matiere_id === matiere.id && (!niveauSeul || evaluationConcerne(e, niveauSeul)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.titre.localeCompare(b.titre));
  const lignes = resultats
    .filter((r) => matiereConcerne(matiere, r.niveau) && (!niveauSeul || r.niveau === niveauSeul))
    .sort((a, b) => (a.niveau ?? "").localeCompare(b.niveau ?? "") || nomEleve(a.eleve).localeCompare(nomEleve(b.eleve), "fr"));
  const notes = new Map(ctx.notes.map((n) => [`${n.evaluation_id}:${n.eleve_id}`, n]));
  // Niveaux proposés pour une évaluation (classe à plusieurs niveaux) : ceux de la matière, sinon ceux de la classe.
  const niveauxPossibles = (matiere.niveaux.length ? matiere.niveaux : ctx.classe.niveaux).filter((n) => ctx.classe.niveaux.includes(n));
  const multiNiveaux = niveauxPossibles.length > 1;
  // Tous les niveaux cochés = toute la classe (enregistré vide).
  const niveauxEnregistres = (choix: string[]) => (choix.length >= niveauxPossibles.length ? [] : niveauxPossibles.filter((n) => choix.includes(n)));

  // Élèves qui suivent l'évaluation en cours de création : ceux des niveaux cochés.
  const elevesNouvelle = lignes.filter((r) => !multiNiveaux || (nouvelle?.niveaux ?? []).includes(r.niveau ?? ""));
  const niveauxListe = new Set(elevesNouvelle.map((r) => r.niveau));

  async function enregistrerNote(ev: Evaluation, eleveId: string, saisie: string) {
    const t = saisie.trim().toLowerCase().replace(",", ".");
    const cle = `${ev.id}:${eleveId}`;
    if (t === "") {
      if (!notes.has(cle)) return;
      const { error } = await sb.from("evaluation_notes").delete().eq("evaluation_id", ev.id).eq("eleve_id", eleveId);
      if (error) return setMessage(`Échec : ${error.message}`);
      onMaj((c) => c && { ...c, notes: c.notes.filter((n) => `${n.evaluation_id}:${n.eleve_id}` !== cle) });
      return;
    }
    const etat = ETATS[t] ?? null;
    const valeur = etat ? null : Number(t);
    if (!etat && (Number.isNaN(valeur) || (valeur as number) < 0 || (valeur as number) > Number(ev.bareme))) {
      return setMessage(`Note invalide « ${saisie} » : un nombre entre 0 et ${ev.bareme}, ou abs, disp, nr.`);
    }
    const note: Note = { evaluation_id: ev.id, eleve_id: eleveId, note: valeur, etat };
    const { error } = await sb.from("evaluation_notes").upsert(note, { onConflict: "evaluation_id,eleve_id" });
    if (error) return setMessage(`Échec : ${error.message}`);
    setMessage(null);
    onMaj((c) => c && { ...c, notes: [...c.notes.filter((n) => `${n.evaluation_id}:${n.eleve_id}` !== cle), note] });
  }

  async function creerEvaluation() {
    if (!nouvelle?.titre?.trim()) return setMessage("Donnez un titre à l'évaluation.");
    if (multiNiveaux && !nouvelle.niveaux?.length) return setMessage("Cochez le ou les niveaux concernés par l'évaluation.");
    const ligne = {
      classe_id: ctx.classe.id,
      matiere_id: matiere.id,
      periode_id: ctx.periode.id,
      titre: nouvelle.titre.trim(),
      date: nouvelle.date || todayISO(),
      coef: Number(nouvelle.coef) || 1,
      bareme: Number(nouvelle.bareme) || 20,
      niveaux: multiNiveaux ? niveauxEnregistres(nouvelle.niveaux ?? []) : [],
    };
    const { data, error } = await sb.from("evaluations").insert(ligne).select().single();
    if (error) return setMessage(`Échec : ${error.message}`);
    onMaj((c) => c && { ...c, evaluations: [...c.evaluations, data as Evaluation] });
    // Notes déjà saisies pour les élèves concernés.
    for (const [eleveId, saisie] of Object.entries(notesNouvelle)) {
      if (saisie.trim() && elevesNouvelle.some((r) => r.eleve.id === eleveId)) await enregistrerNote(data as Evaluation, eleveId, saisie);
    }
    setNotesNouvelle({});
    setNouvelle(null);
  }

  async function modifierEvaluation(ev: Evaluation, patch: Partial<Evaluation>) {
    const { data, error } = await sb.from("evaluations").update(patch).eq("id", ev.id).select().single();
    if (error) return setMessage(`Échec : ${error.message}`);
    onMaj((c) => c && { ...c, evaluations: c.evaluations.map((x) => (x.id === ev.id ? (data as Evaluation) : x)) });
  }

  async function supprimerEvaluation(ev: Evaluation) {
    if (!window.confirm(`Supprimer l'évaluation « ${ev.titre} » et ses notes ?`)) return;
    const { error } = await sb.from("evaluations").delete().eq("id", ev.id);
    if (error) return setMessage(`Échec : ${error.message}`);
    onMaj((c) => c && { ...c, evaluations: c.evaluations.filter((x) => x.id !== ev.id), notes: c.notes.filter((n) => n.evaluation_id !== ev.id) });
  }

  // Déplacement au clavier dans la grille (Entrée / ↓ / ↑ ; Tab passe à la colonne suivante).
  const bouger = (e: React.KeyboardEvent<HTMLInputElement>, ligne: number, col: number) => {
    const d = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    (document.querySelector(`[data-case="${ligne + d}:${col}"]`) as HTMLInputElement | null)?.focus();
  };

  const parGroupe = ctx.groupes
    .slice()
    .sort((a, b) => a.ordre - b.ordre)
    .map((g) => ({ g, ms: matieres.filter((m) => m.groupe_id === g.id) }))
    .filter((x) => x.ms.length);

  return (
    <div className="space-y-3">
      {/* Choix de la matière : les miennes d'abord mises en valeur, le nombre d'évaluations en pastille. */}
      {!matiereImposee && <div className="space-y-1.5 rounded-xl border border-border bg-surface p-3">
        {parGroupe.map(({ g, ms }) => (
          <div key={g.id} className="flex flex-wrap items-center gap-1">
            <span className="w-40 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.nom}</span>
            {ms.map((m) => {
              const n = ctx.evaluations.filter((e) => e.matiere_id === m.id).length;
              const mienne = droits.peutNoter(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMatiereId(m.id)}
                  className={`rounded-full px-2.5 py-0.5 text-[12.5px] ${
                    m.id === matiere.id ? "bg-accent text-accent-fg" : mienne ? "border border-border hover:bg-surface-2" : "text-muted hover:bg-surface-2"
                  }`}
                >
                  {m.nom}
                  {m.niveaux.length > 0 && <span className="ml-1 text-[10px] opacity-70">{m.niveaux.join("·")}</span>}
                  {n > 0 && <span className="ml-1 text-[10.5px] opacity-80">({n})</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>}

      {barreNiveaux}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{matiere.nom}</h3>
        <span className="text-[12px] text-muted">
          {matiere.enseignants
            .filter((id) => id !== ctx.classe.titulaire_id)
            .map((id) => enseignants.get(id))
            .filter((e): e is Enseignant => !!e)
            .map(nomProfesseur)
            .join(", ") || "—"}{" "}
          · coef {String(matiere.coef).replace(".", ",")}
        </span>
        </div>
        {peutNoter && !nouvelle ? (
          <button
            type="button"
            onClick={() => setNouvelle({ titre: `Évaluation ${evals.length + 1}`, date: todayISO() <= ctx.periode.fin ? todayISO() : ctx.periode.fin, coef: 1, bareme: 20, niveaux: niveauSeul && niveauxPossibles.includes(niveauSeul) ? [niveauSeul] : niveauxPossibles })}
            className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:opacity-90"
          >
            + Évaluation
          </button>
        ) : (
          <span />
        )}
        {!peutNoter ? <span className="text-right text-[12px] text-muted">Consultation seule : cette matière ne vous est pas attribuée.</span> : <span />}
      </div>

      {nouvelle && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-[13px]">
          <Champ label="Titre" large>
            <input autoFocus value={nouvelle.titre ?? ""} onChange={(e) => setNouvelle({ ...nouvelle, titre: e.target.value })} className={classeChamp} />
          </Champ>
          {matieresChoix && matieresChoix.length > 1 && onChoisirMatiere && (
            <Champ label="Matière">
            <select
              value={matiere.id}
              onChange={(e) => onChoisirMatiere(e.target.value)}
              className="cursor-pointer rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg outline-none hover:opacity-90 focus:ring-2 focus:ring-accent/40"
              aria-label="Matière"
              title="Changer de matière"
            >
              {matieresChoix.map((m) => (
                <option key={m.id} value={m.id} className="bg-background text-foreground">
                  {m.nom}
                </option>
              ))}
            </select>
            </Champ>
          )}
          <Champ label="Date">
            <input type="date" value={nouvelle.date ?? ""} min={ctx.periode.debut} max={ctx.periode.fin} onChange={(e) => setNouvelle({ ...nouvelle, date: e.target.value })} className={classeChamp} />
          </Champ>
          <Champ label="Coefficient">
            <input inputMode="decimal" value={String(nouvelle.coef ?? "")} onChange={(e) => setNouvelle({ ...nouvelle, coef: e.target.value.replace(",", ".") as unknown as number })} className={`${classeChamp} w-16`} />
          </Champ>
          <Champ label="Noté sur">
            <input inputMode="decimal" value={String(nouvelle.bareme ?? "")} onChange={(e) => setNouvelle({ ...nouvelle, bareme: e.target.value.replace(",", ".") as unknown as number })} className={`${classeChamp} w-16`} />
          </Champ>
          {multiNiveaux && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted">Niveau(x) concerné(s)</span>
              <ChoixNiveaux possibles={niveauxPossibles} choix={nouvelle.niveaux ?? []} onChange={changerNiveauxCoches} />
            </div>
          )}
        </div>
      )}

      {/* Téléphone, notes existantes : par élève, une ligne de nom, les notes, puis la moyenne et l'appréciation. */}
      {!nouvelle && vue === "grille" && (
        <div className="space-y-2 md:hidden">
          {lignes.map((r, k) => {
            const m = r.groupes.flatMap((g) => g.matieres).find((x) => x.matiere.id === matiere.id);
            const siens = evals.filter((ev) => evaluationConcerne(ev, r.niveau));
            return (
              <Fragment key={r.eleve.id}>
              {multiNiveaux && !niveauSeul && (k === 0 || lignes[k - 1].niveau !== r.niveau) && (
                <div className="mt-1 rounded-md border-l-4 border-gold bg-gold-soft/50 px-2 py-px text-[11px] font-semibold leading-tight text-gold">
                  {r.niveau ?? "Niveau non renseigné"} · {lignes.filter((x) => x.niveau === r.niveau).length} élève(s)
                </div>
              )}
              <div data-eleve={r.eleve.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="bg-gold-soft/50 px-3 py-1 text-[13px] font-semibold">
                  {nomEleve(r.eleve)}
                  {multiNiveaux && !niveauSeul && r.niveau && <span className="ml-1.5 text-[11px] font-normal text-muted">{r.niveau}</span>}
                  {verrouEleve?.(r.eleve.id) && <span className="ml-1.5 text-[10px]">🔒</span>}
                </div>
                {siens.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/60 px-3 py-1.5">
                    {siens.map((ev) => {
                      const n = notes.get(`${ev.id}:${r.eleve.id}`);
                      const valeur = n ? (n.etat ? ETAT_COURT[n.etat] : String(n.note ?? "").replace(".", ",")) : "";
                      return (
                        <label key={ev.id} className="flex flex-col items-center text-[10.5px] text-muted">
                          <span className="max-w-20 truncate">{ev.titre}</span>
                          <CaseNote
                            key={`${ev.id}:${r.eleve.id}:${valeur}`}
                            valeur={valeur}
                            disabled={!peutNoter || !!verrouEleve?.(r.eleve.id)}
                            data=""
                            onKeyDown={() => {}}
                            onEnregistrer={(v) => enregistrerNote(ev, r.eleve.id, v)}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-stretch gap-2 border-t border-border/60 px-3 py-1.5">
                  <span className="flex w-16 shrink-0 items-center justify-center self-stretch rounded-md border border-border bg-surface-2/60 font-semibold tabular-nums">{m?.chiffre.moy == null ? "-/20" : note20(m.chiffre.moy)}</span>
                  <div className="min-w-0 flex-1">
                    <ChampAppreciation
                      key={`${r.bulletin?.id ?? r.eleve.id}:${matiere.id}`}
                      valeur={m?.ligne?.commentaire ?? ""}
                      disabled={!!raisonVerrou(droits, matiere, r)}
                      raison={raisonVerrou(droits, matiere, r)}
                      lignes={2}
                      onEnregistrer={(t) => (r.bulletin ? enregistrerAppreciation(sb, onMaj, r.bulletin.id, matiere.id, t) : Promise.resolve("Bulletin pas encore créé."))}
                    />
                  </div>
                </div>
              </div>
              </Fragment>
            );
          })}
          {!lignes.length && <p className="px-3 py-6 text-center text-muted">Aucun élève concerné par cette matière.</p>}
        </div>
      )}

      {/* Téléphone, nouvelle évaluation : par élève, une ligne de nom, puis la note et l'appréciation. */}
      {nouvelle && (
        <div className="space-y-2 md:hidden">
          {elevesNouvelle.map((r, k) => (
            <Fragment key={r.eleve.id}>
            {niveauxListe.size > 1 && (k === 0 || elevesNouvelle[k - 1].niveau !== r.niveau) && (
              <div className="mt-1 rounded-md border-l-4 border-gold bg-gold-soft/50 px-2 py-px text-[11px] font-semibold leading-tight text-gold">
                {r.niveau ?? "Niveau non renseigné"} · {elevesNouvelle.filter((x) => x.niveau === r.niveau).length} élève(s)
              </div>
            )}
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="bg-gold-soft/50 px-3 py-1 text-[13px] font-semibold">
                {nomEleve(r.eleve)}
                {multiNiveaux && !niveauSeul && r.niveau && <span className="ml-1.5 text-[11px] font-normal text-muted">{r.niveau}</span>}
              </div>
              <div className="flex items-stretch gap-2 border-t border-border/60 px-3 py-1.5">
                <input
                  value={notesNouvelle[r.eleve.id] ?? ""}
                  disabled={!!verrouEleve?.(r.eleve.id)}
                  inputMode="decimal"
                  placeholder={`/${String(nouvelle.bareme ?? 20).replace(".", ",")}`}
                  onChange={(e) => setNotesNouvelle({ ...notesNouvelle, [r.eleve.id]: e.target.value })}
                  className="w-16 shrink-0 self-stretch rounded-md border border-border bg-background px-1 py-0.5 text-center tabular-nums outline-none focus:border-accent"
                />
                <div className="min-w-0 flex-1">
                  <ChampAppreciation
                    key={`${r.bulletin?.id ?? r.eleve.id}:${matiere.id}`}
                    valeur={r.groupes.flatMap((g) => g.matieres).find((x) => x.matiere.id === matiere.id)?.ligne?.commentaire ?? ""}
                    disabled={!!raisonVerrou(droits, matiere, r)}
                    raison={raisonVerrou(droits, matiere, r)}
                    lignes={2}
                    onEnregistrer={(t) => (r.bulletin ? enregistrerAppreciation(sb, onMaj, r.bulletin.id, matiere.id, t) : Promise.resolve("Bulletin pas encore créé."))}
                  />
                </div>
              </div>
            </div>
            </Fragment>
          ))}
          {!elevesNouvelle.length && <p className="px-3 py-4 text-center text-muted">Cochez un niveau pour saisir les notes des élèves concernés.</p>}
        </div>
      )}

      {/* Saisie immédiate : note et appréciation des élèves des niveaux cochés (la note part avec « Créer »). */}
      {nouvelle && (
        <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
          <table className="text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] text-muted">
                <th className="min-w-48 px-3 py-2 text-left font-medium uppercase tracking-wide">Élève</th>
                <th className="min-w-24 border-l border-border/60 px-2 py-2 text-center font-medium uppercase tracking-wide">Note /{String(nouvelle.bareme ?? 20).replace(".", ",")}</th>
                <th className="w-[min(36rem,55vw)] min-w-56 border-l border-border px-2 py-2 text-left font-medium uppercase tracking-wide">Appréciation</th>
              </tr>
            </thead>
            <tbody>
              {elevesNouvelle.map((r, k) => (
                <Fragment key={r.eleve.id}>
                {niveauxListe.size > 1 && (k === 0 || elevesNouvelle[k - 1].niveau !== r.niveau) && (
                  <tr className="border-t-2 border-gold/50 bg-gold-soft/50">
                    <td colSpan={3} className="px-3 py-0.5 text-[11px] font-semibold leading-tight text-gold">
                      {r.niveau ?? "Niveau non renseigné"} · {elevesNouvelle.filter((x) => x.niveau === r.niveau).length} élève(s)
                    </td>
                  </tr>
                )}
                <tr className="border-t border-border/60">
                  <td className="px-3 py-1">
                    {nomEleve(r.eleve)}
                    {multiNiveaux && !niveauSeul && <span className="ml-1.5 text-[10.5px] text-muted">{r.niveau}</span>}
                  </td>
                  <td className="border-l border-border/60 px-1 py-0.5 text-center">
                    <input
                      value={notesNouvelle[r.eleve.id] ?? ""}
                      disabled={!!verrouEleve?.(r.eleve.id)}
                      inputMode="decimal"
                      onChange={(e) => setNotesNouvelle({ ...notesNouvelle, [r.eleve.id]: e.target.value })}
                      className="w-16 rounded-md border border-border bg-background px-1 py-0.5 text-center tabular-nums outline-none focus:border-accent"
                    />
                  </td>
                  <td className="border-l border-border px-2 py-1 align-top">
                    <ChampAppreciation
                      key={`${r.bulletin?.id ?? r.eleve.id}:${matiere.id}`}
                      valeur={r.groupes.flatMap((g) => g.matieres).find((x) => x.matiere.id === matiere.id)?.ligne?.commentaire ?? ""}
                      disabled={!!raisonVerrou(droits, matiere, r)}
                      raison={raisonVerrou(droits, matiere, r)}
                      lignes={2}
                      onEnregistrer={(t) => (r.bulletin ? enregistrerAppreciation(sb, onMaj, r.bulletin.id, matiere.id, t) : Promise.resolve("Bulletin pas encore créé."))}
                    />
                  </td>
                </tr>
                </Fragment>
              ))}
              {!elevesNouvelle.length && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-muted">
                    Cochez un niveau pour saisir les notes des élèves concernés.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Créer / Annuler : flottants, centrés en bas, visibles pendant le défilement. */}
      {nouvelle && (
        <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
          <div className="pointer-events-auto flex gap-2 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
            <button type="button" onClick={creerEvaluation} className="rounded-lg bg-accent px-5 py-2 text-[13px] font-medium text-accent-fg hover:opacity-90">
              Créer
            </button>
            <button type="button" onClick={() => { setNouvelle(null); setNotesNouvelle({}); }} className="rounded-lg px-5 py-2 text-[13px] hover:bg-surface-2">
              Annuler
            </button>
          </div>
        </div>
      )}

      {message && <p className="rounded-lg bg-negative/10 px-3 py-1.5 text-[13px] text-negative">{message}</p>}

      {/* Création d'une évaluation : le formulaire seul, sans le tableau de notes dessous. */}
      {nouvelle ? null : vue === "eleve" ? (
        <AppreciationsEleveParEleve sb={sb} ctx={ctx} matiere={matiere} lignes={lignes} evals={evals} notes={notes} droits={droits} onMaj={onMaj} />
      ) : (
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
        <table className="text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-muted">
              <th className="sticky left-0 z-10 min-w-48 bg-surface px-3 py-2 text-left font-medium uppercase tracking-wide">Élève</th>
              {evals.map((ev) => (
                <th key={ev.id} className="min-w-28 border-l border-border/60 px-2 py-1.5 text-center align-top font-normal">
                  <EnteteEvaluation
                    ev={ev}
                    modifiable={peutNoter}
                    niveauxPossibles={multiNiveaux ? niveauxPossibles : []}
                    versEnregistre={niveauxEnregistres}
                    onModifier={(p) => modifierEvaluation(ev, p)}
                    onSupprimer={() => supprimerEvaluation(ev)}
                  />
                </th>
              ))}
              <th className="min-w-24 border-l border-border bg-surface-2/60 px-2 py-2 text-center font-medium uppercase tracking-wide">Moyenne</th>
              <th className="w-[min(36rem,55vw)] min-w-56 border-l border-border px-2 py-2 text-left font-medium uppercase tracking-wide">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((r, li) => {
              const m = r.groupes.flatMap((g) => g.matieres).find((x) => x.matiere.id === matiere.id);
              // Classe à plusieurs niveaux : un bandeau ouvre chaque niveau (CE1, CE2…), élèves regroupés dessous.
              const nouveauNiveau = !niveauSeul && ctx.classe.niveaux.length > 1 && (li === 0 || lignes[li - 1].niveau !== r.niveau);
              return (
                <Fragment key={r.eleve.id}>
                {nouveauNiveau && (
                  <tr className="border-t-2 border-gold/50 bg-gold-soft/50">
                    <td colSpan={evals.length + 3} className="px-3 py-0.5 text-[11px] font-semibold leading-tight text-gold">
                      <span className="sticky left-3">
                        {r.niveau ?? "Niveau non renseigné"} · {lignes.filter((x) => x.niveau === r.niveau).length} élève(s)
                      </span>
                    </td>
                  </tr>
                )}
                <tr data-eleve={r.eleve.id} className="border-t border-border/60">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-1">
                    {nomEleve(r.eleve)}
                    {verrouEleve?.(r.eleve.id) && <span className="ml-1.5 text-[10px] text-muted" title="Relevé publié : notes verrouillées">🔒</span>}
                  </td>
                  {evals.map((ev, ci) => {
                    // Évaluation d'un autre niveau : case grisée, sans saisie.
                    if (!evaluationConcerne(ev, r.niveau))
                      return <td key={ev.id} className="border-l border-border/60 bg-surface-2/60 px-1 py-0.5 text-center text-[10.5px] text-muted" title={`Évaluation des ${ev.niveaux?.join(", ")}`} />;
                    const n = notes.get(`${ev.id}:${r.eleve.id}`);
                    const valeur = n ? (n.etat ? ETAT_COURT[n.etat] : String(n.note ?? "").replace(".", ",")) : "";
                    return (
                      <td key={ev.id} className="border-l border-border/60 px-1 py-0.5 text-center">
                        <CaseNote
                          key={`${ev.id}:${r.eleve.id}:${valeur}`}
                          valeur={valeur}
                          disabled={!peutNoter || !!verrouEleve?.(r.eleve.id)}
                          data={`${li}:${ci}`}
                          onKeyDown={(e) => bouger(e, li, ci)}
                          onEnregistrer={(v) => enregistrerNote(ev, r.eleve.id, v)}
                        />
                      </td>
                    );
                  })}
                  <td className="border-l border-border bg-surface-2/40 px-2 py-1 text-center font-semibold tabular-nums">
                    {note20(m?.chiffre.moy ?? null)}
                    {m?.ligne?.moyenne_saisie != null && <span className="ml-1 text-[10px] font-normal text-gold">saisie</span>}
                  </td>
                  <td className="border-l border-border px-2 py-1 align-top">
                    <ChampAppreciation
                      key={`${r.bulletin?.id ?? r.eleve.id}:${matiere.id}`}
                      valeur={m?.ligne?.commentaire ?? ""}
                      disabled={!!raisonVerrou(droits, matiere, r)}
                      raison={raisonVerrou(droits, matiere, r)}
                      lignes={2}
                      onEnregistrer={(t) => (r.bulletin ? enregistrerAppreciation(sb, onMaj, r.bulletin.id, matiere.id, t) : Promise.resolve("Bulletin pas encore créé."))}
                    />
                  </td>
                </tr>
                </Fragment>
              );
            })}
            {!lignes.length && (
              <tr>
                <td colSpan={evals.length + 3} className="px-3 py-6 text-center text-muted">
                  Aucun élève concerné par cette matière.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

const classeChamp = "rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus:border-accent";

function Champ({ label, children, large = false }: { label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <label className={`flex flex-col gap-0.5 ${large ? "min-w-56 flex-1" : ""}`}>
      <span className="text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}

function CaseNote({
  valeur,
  disabled,
  data,
  onKeyDown,
  onEnregistrer,
}: {
  valeur: string;
  disabled: boolean;
  data: string;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onEnregistrer: (v: string) => void;
}) {
  // Enregistrée au fil de la frappe (0,8 s), en quittant la case, et si la saisie est interrompue (voir sauvegardeAuto).
  const { valeur: texte, changer, envoyer } = useSauvegardeAuto(valeur, onEnregistrer);
  return (
    <input
      data-case={data}
      value={texte}
      disabled={disabled}
      inputMode="decimal"
      placeholder="abs"
      onChange={(e) => changer(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={onKeyDown}
      onBlur={() => void envoyer()}
      className={`w-16 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-center tabular-nums outline-none hover:border-border focus:border-accent focus:bg-background ${
        /^[a-z]/i.test(texte) ? "text-muted italic" : ""
      }`}
    />
  );
}

/** Niveaux concernés par une évaluation : cases à cocher (plusieurs possibles ; toutes = toute la classe). */
function ChoixNiveaux({ possibles, choix, onChange }: { possibles: string[]; choix: string[]; onChange: (n: string[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {possibles.map((n) => {
        const coche = choix.includes(n);
        return (
          <label
            key={n}
            className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[12.5px] ${coche ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-background text-muted"}`}
          >
            <input type="checkbox" checked={coche} onChange={() => onChange(coche ? choix.filter((x) => x !== n) : [...choix, n])} className="accent-[var(--accent)]" />
            {n}
          </label>
        );
      })}
    </div>
  );
}

function EnteteEvaluation({
  ev,
  modifiable,
  niveauxPossibles,
  versEnregistre,
  onModifier,
  onSupprimer,
}: {
  ev: Evaluation;
  modifiable: boolean;
  /** Classe à plusieurs niveaux : niveaux proposés (vide : pas de choix). */
  niveauxPossibles: string[];
  versEnregistre: (choix: string[]) => string[];
  onModifier: (p: Partial<Evaluation>) => void;
  onSupprimer: () => void;
}) {
  const [edition, setEdition] = useState(false);
  const niveauxActuels = ev.niveaux?.length ? ev.niveaux : niveauxPossibles;
  const [brouillon, setBrouillon] = useState({ titre: ev.titre, date: ev.date, coef: String(ev.coef), bareme: String(ev.bareme), niveaux: niveauxActuels });
  if (!edition) {
    return (
      <button type="button" disabled={!modifiable} onClick={() => setEdition(true)} className="w-full rounded-md px-1 py-0.5 text-center enabled:hover:bg-surface-2" title={modifiable ? "Modifier l'évaluation" : undefined}>
        <div className="font-medium text-foreground">{ev.titre}</div>
        <div className="text-[10.5px]">
          {new Date(ev.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · /{String(ev.bareme).replace(".", ",")}
          {Number(ev.coef) !== 1 && ` · coef ${String(ev.coef).replace(".", ",")}`}
        </div>
        {!!ev.niveaux?.length && <div className="mt-0.5 inline-block rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">{ev.niveaux.join(" · ")}</div>}
      </button>
    );
  }
  return (
    <div className="flex w-40 flex-col gap-1 text-left">
      <input value={brouillon.titre} onChange={(e) => setBrouillon({ ...brouillon, titre: e.target.value })} className={classeChamp} aria-label="Titre" />
      <input type="date" value={brouillon.date} onChange={(e) => setBrouillon({ ...brouillon, date: e.target.value })} className={classeChamp} aria-label="Date" />
      <div className="flex gap-1">
        <input value={brouillon.coef} onChange={(e) => setBrouillon({ ...brouillon, coef: e.target.value })} className={`${classeChamp} w-1/2`} aria-label="Coefficient" title="Coefficient" />
        <input value={brouillon.bareme} onChange={(e) => setBrouillon({ ...brouillon, bareme: e.target.value })} className={`${classeChamp} w-1/2`} aria-label="Noté sur" title="Noté sur" />
      </div>
      {niveauxPossibles.length > 0 && <ChoixNiveaux possibles={niveauxPossibles} choix={brouillon.niveaux} onChange={(n) => setBrouillon({ ...brouillon, niveaux: n })} />}
      <div className="flex justify-between gap-1">
        <button
          type="button"
          onClick={() => {
            if (niveauxPossibles.length && !brouillon.niveaux.length) return window.alert("Cochez au moins un niveau.");
            onModifier({
              titre: brouillon.titre.trim() || ev.titre,
              date: brouillon.date,
              coef: Number(brouillon.coef.replace(",", ".")) || 1,
              bareme: Number(brouillon.bareme.replace(",", ".")) || 20,
              ...(niveauxPossibles.length ? { niveaux: versEnregistre(brouillon.niveaux) } : {}),
            });
            setEdition(false);
          }}
          className="rounded-md bg-accent px-2 py-0.5 text-[12px] text-accent-fg"
        >
          OK
        </button>
        <button type="button" onClick={() => setEdition(false)} className="rounded-md px-2 py-0.5 text-[12px] hover:bg-surface-2">
          Annuler
        </button>
        <button type="button" onClick={onSupprimer} className="rounded-md px-2 py-0.5 text-[12px] text-negative hover:bg-negative/10">
          Suppr.
        </button>
      </div>
    </div>
  );
}

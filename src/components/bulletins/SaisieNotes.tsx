"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";
import {
  matiereConcerne,
  nomEleve,
  nomEnseignant,
  note20,
  type ContexteClasse,
  type Enseignant,
  type Evaluation,
  type Note,
  type ResultatEleve,
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
}: {
  ctx: ContexteClasse;
  resultats: ResultatEleve[];
  droits: Droits;
  enseignants: Map<string, Enseignant>;
  onMaj: (f: (c: ContexteClasse | null) => ContexteClasse | null) => void;
  /** Ouverte depuis les Relevés de notes : la matière est choisie là-bas (pas de sélecteur ici). */
  matiereImposee?: string;
  /** Relevé publié : les notes de l'élève ne se modifient plus (la base le refuse aussi). */
  verrouEleve?: (eleveId: string) => boolean;
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
  // Grille (notes + appréciations) ou saisie des appréciations élève par élève.
  const [vue, setVue] = useState<"grille" | "eleve">("grille");

  if (!matiere) return <p className="text-sm text-muted">Aucune matière dans cette classe.</p>;
  const peutNoter = droits.peutNoter(matiere);
  const evals = ctx.evaluations.filter((e) => e.matiere_id === matiere.id).sort((a, b) => a.date.localeCompare(b.date) || a.titre.localeCompare(b.titre));
  const lignes = resultats
    .filter((r) => matiereConcerne(matiere, r.niveau))
    .sort((a, b) => (a.niveau ?? "").localeCompare(b.niveau ?? "") || nomEleve(a.eleve).localeCompare(nomEleve(b.eleve), "fr"));
  const notes = new Map(ctx.notes.map((n) => [`${n.evaluation_id}:${n.eleve_id}`, n]));

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
    const ligne = {
      classe_id: ctx.classe.id,
      matiere_id: matiere.id,
      periode_id: ctx.periode.id,
      titre: nouvelle.titre.trim(),
      date: nouvelle.date || todayISO(),
      coef: Number(nouvelle.coef) || 1,
      bareme: Number(nouvelle.bareme) || 20,
    };
    const { data, error } = await sb.from("evaluations").insert(ligne).select().single();
    if (error) return setMessage(`Échec : ${error.message}`);
    onMaj((c) => c && { ...c, evaluations: [...c.evaluations, data as Evaluation] });
    setNouvelle(null);
    setMessage(null);
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

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{matiere.nom}</h3>
        <span className="text-[12px] text-muted">
          {matiere.enseignants
            .map((id) => enseignants.get(id))
            .filter((e): e is Enseignant => !!e)
            .map(nomEnseignant)
            .join(", ") || "—"}{" "}
          · coef {String(matiere.coef).replace(".", ",")}
        </span>
        {peutNoter && !nouvelle && (
          <button
            type="button"
            onClick={() => setNouvelle({ titre: `Évaluation ${evals.length + 1}`, date: todayISO() <= ctx.periode.fin ? todayISO() : ctx.periode.fin, coef: 1, bareme: 20 })}
            className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:opacity-90"
          >
            + Évaluation
          </button>
        )}
        <div className={`flex gap-1 rounded-lg bg-surface-2 p-1 ${peutNoter && !nouvelle ? "" : "ml-auto"}`}>
          {(
            [
              ["grille", "Grille"],
              ["eleve", "Élève par élève"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVue(v)}
              className={`rounded-md px-2.5 py-1 text-[12.5px] font-medium ${vue === v ? "bg-surface text-accent shadow-sm" : "text-muted hover:text-foreground"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {!peutNoter && <span className="ml-auto text-[12px] text-muted">Consultation seule : cette matière ne vous est pas attribuée.</span>}
      </div>

      {nouvelle && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-[13px]">
          <Champ label="Titre" large>
            <input autoFocus value={nouvelle.titre ?? ""} onChange={(e) => setNouvelle({ ...nouvelle, titre: e.target.value })} className={classeChamp} />
          </Champ>
          <Champ label="Date">
            <input type="date" value={nouvelle.date ?? ""} min={ctx.periode.debut} max={ctx.periode.fin} onChange={(e) => setNouvelle({ ...nouvelle, date: e.target.value })} className={classeChamp} />
          </Champ>
          <Champ label="Coefficient">
            <input inputMode="decimal" value={String(nouvelle.coef ?? "")} onChange={(e) => setNouvelle({ ...nouvelle, coef: e.target.value.replace(",", ".") as unknown as number })} className={`${classeChamp} w-16`} />
          </Champ>
          <Champ label="Noté sur">
            <input inputMode="decimal" value={String(nouvelle.bareme ?? "")} onChange={(e) => setNouvelle({ ...nouvelle, bareme: e.target.value.replace(",", ".") as unknown as number })} className={`${classeChamp} w-16`} />
          </Champ>
          <button type="button" onClick={creerEvaluation} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90">
            Créer
          </button>
          <button type="button" onClick={() => setNouvelle(null)} className="rounded-lg px-3 py-1.5 hover:bg-surface-2">
            Annuler
          </button>
        </div>
      )}

      {message && <p className="rounded-lg bg-negative/10 px-3 py-1.5 text-[13px] text-negative">{message}</p>}

      {vue === "eleve" ? (
        <AppreciationsEleveParEleve sb={sb} ctx={ctx} matiere={matiere} lignes={lignes} evals={evals} notes={notes} droits={droits} onMaj={onMaj} />
      ) : (
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-muted">
              <th className="sticky left-0 z-10 min-w-48 bg-surface px-3 py-2 text-left font-medium uppercase tracking-wide">Élève</th>
              {evals.map((ev) => (
                <th key={ev.id} className="min-w-28 border-l border-border/60 px-2 py-1.5 text-center align-top font-normal">
                  <EnteteEvaluation ev={ev} modifiable={peutNoter} onModifier={(p) => modifierEvaluation(ev, p)} onSupprimer={() => supprimerEvaluation(ev)} />
                </th>
              ))}
              <th className="min-w-24 border-l border-border bg-surface-2/60 px-2 py-2 text-center font-medium uppercase tracking-wide">Moyenne</th>
              <th className="min-w-72 border-l border-border px-2 py-2 text-left font-medium uppercase tracking-wide">Appréciation</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((r, li) => {
              const m = r.groupes.flatMap((g) => g.matieres).find((x) => x.matiere.id === matiere.id);
              return (
                <tr key={r.eleve.id} className="border-t border-border/60">
                  <td className="sticky left-0 z-10 bg-surface px-3 py-1">
                    {nomEleve(r.eleve)}
                    {r.niveau && <span className="ml-1.5 rounded bg-surface-2 px-1 text-[10px] text-muted">{r.niveau}</span>}
                    {verrouEleve?.(r.eleve.id) && <span className="ml-1.5 text-[10px] text-muted" title="Relevé publié : notes verrouillées">🔒</span>}
                  </td>
                  {evals.map((ev, ci) => {
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
                      lignes={1}
                      onEnregistrer={(t) => (r.bulletin ? enregistrerAppreciation(sb, onMaj, r.bulletin.id, matiere.id, t) : Promise.resolve("Bulletin pas encore créé."))}
                    />
                  </td>
                </tr>
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
      <p className="text-[11.5px] text-muted">
        Saisie : un nombre (virgule acceptée), ou <strong>abs</strong> (absent), <strong>disp</strong> (dispensé), <strong>nr</strong> (non rendu) — ces trois-là ne comptent pas
        dans la moyenne. Entrée ou ↓ : élève suivant. Les évaluations sont ramenées sur 20 et pondérées par leur coefficient.
      </p>
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
  const [texte, setTexte] = useState(valeur);
  return (
    <input
      data-case={data}
      value={texte}
      disabled={disabled}
      inputMode="decimal"
      onChange={(e) => setTexte(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={onKeyDown}
      onBlur={() => texte.trim() !== valeur && onEnregistrer(texte)}
      className={`w-16 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-center tabular-nums outline-none hover:border-border focus:border-accent focus:bg-background ${
        /^[a-z]/i.test(texte) ? "text-muted italic" : ""
      }`}
    />
  );
}

function EnteteEvaluation({
  ev,
  modifiable,
  onModifier,
  onSupprimer,
}: {
  ev: Evaluation;
  modifiable: boolean;
  onModifier: (p: Partial<Evaluation>) => void;
  onSupprimer: () => void;
}) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState({ titre: ev.titre, date: ev.date, coef: String(ev.coef), bareme: String(ev.bareme) });
  if (!edition) {
    return (
      <button type="button" disabled={!modifiable} onClick={() => setEdition(true)} className="w-full rounded-md px-1 py-0.5 text-center enabled:hover:bg-surface-2" title={modifiable ? "Modifier l'évaluation" : undefined}>
        <div className="font-medium text-foreground">{ev.titre}</div>
        <div className="text-[10.5px]">
          {new Date(ev.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} · /{String(ev.bareme).replace(".", ",")}
          {Number(ev.coef) !== 1 && ` · coef ${String(ev.coef).replace(".", ",")}`}
        </div>
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
      <div className="flex justify-between gap-1">
        <button
          type="button"
          onClick={() => {
            onModifier({ titre: brouillon.titre.trim() || ev.titre, date: brouillon.date, coef: Number(brouillon.coef.replace(",", ".")) || 1, bareme: Number(brouillon.bareme.replace(",", ".")) || 20 });
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

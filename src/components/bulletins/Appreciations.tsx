"use client";

import { ajusterHauteur, extensible } from "./outils";
import { useEffect, useRef, useState } from "react";
import { useSauvegardeAuto } from "@/lib/sauvegardeAuto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nomEleve, note20, type ContexteClasse, type Evaluation, type Ligne, type Matiere, type Note, type ResultatEleve, type Statut } from "@/lib/bulletins";
import type { Droits } from "./Bulletins";

/**
 * Appréciation d'une matière (bulletin_lignes.commentaire). 250 caractères : environ quatre lignes dans la colonne
 * Commentaire du PDF, ce qui garde le bulletin sur une page ; la base applique la même limite.
 */
export const LIMITE_APPRECIATION = 250;

type Maj = (f: (c: ContexteClasse | null) => ContexteClasse | null) => void;

/** Enregistre l'appréciation (seule la colonne commentaire est écrite ; la base vérifie les droits et le statut). */
export async function enregistrerAppreciation(sb: SupabaseClient, onMaj: Maj, bulletinId: string, matiereId: string, texte: string) {
  const commentaire = texte.trim() || null;
  const { error } = await sb.from("bulletin_lignes").upsert({ bulletin_id: bulletinId, matiere_id: matiereId, commentaire }, { onConflict: "bulletin_id,matiere_id" });
  if (error) return error.message;
  onMaj((c) => {
    if (!c) return c;
    const actuelle = c.lignes.find((l) => l.bulletin_id === bulletinId && l.matiere_id === matiereId);
    const ligne: Ligne = { bulletin_id: bulletinId, matiere_id: matiereId, afficher: true, moyenne_saisie: null, ...actuelle, commentaire };
    return {
      ...c,
      lignes: [...c.lignes.filter((l) => !(l.bulletin_id === bulletinId && l.matiere_id === matiereId)), ligne],
      bulletins: c.bulletins.map((x) => (x.id === bulletinId && x.statut === "nouveau" ? { ...x, statut: "en_cours" as Statut } : x)),
    };
  });
  return null;
}

/**
 * Zone d'appréciation : enregistrement automatique (0,8 s après la dernière frappe, et en quittant la zone),
 * état visible (Enregistrement…, Enregistré, Échec) et compteur de caractères.
 */
export function ChampAppreciation({
  valeur,
  disabled,
  onEnregistrer,
  lignes = 2,
  autoFocus = false,
  raison,
}: {
  valeur: string;
  disabled: boolean;
  /** Renvoie un message d'erreur, ou null si tout va bien. */
  onEnregistrer: (texte: string) => Promise<string | null>;
  lignes?: number;
  autoFocus?: boolean;
  /** Pourquoi la zone est verrouillée (affiché sous la zone). */
  raison?: string | null;
}) {
  // Enregistrement automatique commun (frappe, sortie du champ, démontage, onglet masqué, bouton « Enregistrer »).
  const { valeur: texte, changer: changerTexte, envoyer, etat, erreur } = useSauvegardeAuto(valeur, onEnregistrer);
  const changer = (t: string) => changerTexte(t.slice(0, LIMITE_APPRECIATION));
  const sauver = () => envoyer();
  // Coche verte tant que la dernière saisie est enregistrée (elle disparaît à la frappe suivante, et en quittant la matière).
  const coche = etat === "ok";
  // Vide ou sur une seule ligne : le texte est centré (horizontalement, et verticalement dans la hauteur de deux lignes) ;
  // à deux lignes ou plus, il occupe toute la zone.
  const zone = useRef<HTMLTextAreaElement | null>(null);
  const [centre, setCentre] = useState<number | null>(null);
  // Pendant la saisie, la zone ne bouge pas : deux lignes de base, puis elle s'agrandit au-delà. Le centrage vaut hors saisie.
  const [actif, setActif] = useState(false);
  useEffect(() => {
    const el = zone.current;
    if (actif) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- saisie en cours : pas de centrage
      setCentre(null);
      return;
    }
    if (!el || lignes < 2) return;
    const style = getComputedStyle(el);
    const lh = parseFloat(style.lineHeight) || 18;
    const marge = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const rowsAvant = el.rows;
    const paddingAvant = [el.style.paddingTop, el.style.paddingBottom];
    el.style.paddingTop = "";
    el.style.paddingBottom = "";
    el.rows = 1;
    el.style.height = "auto";
    const lignesTexte = Math.round((el.scrollHeight - marge) / lh);
    el.rows = rowsAvant;
    el.style.paddingTop = paddingAvant[0];
    el.style.paddingBottom = paddingAvant[1];
    ajusterHauteur(el);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mesure du texte affiché
    setCentre(lignesTexte <= 1 ? ((lignes - 1) * lh) / 2 + marge / 2 : null);
  }, [texte, lignes, actif]);
  // Centré : une seule ligne de texte et des marges égales (même hauteur totale que les lignes de base) ; hauteur recalculée.
  useEffect(() => {
    if (zone.current) ajusterHauteur(zone.current);
  }, [centre]);

  return (
    <div>
      <div className="relative">
      <textarea
        value={texte}
        disabled={disabled}
        autoFocus={autoFocus}
        maxLength={LIMITE_APPRECIATION}
        rows={centre != null ? 1 : lignes}
        placeholder={disabled ? "" : "Appréciation…"}
        onChange={(e) => changer(e.target.value)}
        onFocus={() => setActif(true)}
        onBlur={() => {
          setActif(false);
          void sauver();
        }}
        {...extensible}
        ref={(el) => {
          zone.current = el;
          extensible.ref(el);
        }}
        style={centre != null ? { paddingTop: centre, paddingBottom: centre } : undefined}
        className={`w-full resize-y rounded-md border border-border/70 bg-background px-2 py-1 text-[13px] leading-snug outline-none focus:border-accent disabled:border-transparent disabled:bg-transparent ${centre != null ? "text-center placeholder:text-center" : ""}`}
      />
      {coche && !disabled && (
        <span title="Enregistré" aria-label="Enregistré" className="pointer-events-none absolute right-2.5 top-1.5 text-[13px] font-bold leading-none text-positive">
          ✓
        </span>
      )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[10.5px]">
        {/* Pas d'état « Enregistré » à chaque champ (mention unique en bas de page) : la raison d'un verrou, ou l'erreur. */}
        <span className={etat === "erreur" ? "text-negative" : "text-muted"} title={erreur ?? undefined}>
          {disabled ? (raison ?? "") : etat === "erreur" ? `Échec de l'enregistrement : ${erreur ?? ""}` : ""}
        </span>
      </div>
    </div>
  );
}

/** Pourquoi l'appréciation n'est pas modifiable (mêmes règles que la base : matière enseignée, bulletin non validé). */
export function raisonVerrou(droits: Droits, m: Matiere, r: ResultatEleve): string | null {
  if (droits.peutCommenter(m, r.bulletin)) return null;
  if (!r.bulletin) return "Bulletin pas encore créé.";
  if (!droits.peutApprecier(m) && droits.peutNoter(m)) return "Appréciation réservée au Directeur spirituel.";
  if (!droits.peutNoter(m)) return "Matière non attribuée.";
  return "Bulletin validé ou publié : verrouillé.";
}

/** Saisie élève par élève : moyenne et notes de la matière à côté de l'appréciation, Précédent / Suivant. */
export function AppreciationsEleveParEleve({
  sb,
  ctx,
  matiere,
  lignes,
  evals,
  notes,
  droits,
  onMaj,
}: {
  sb: SupabaseClient;
  ctx: ContexteClasse;
  matiere: Matiere;
  lignes: ResultatEleve[];
  evals: Evaluation[];
  notes: Map<string, Note>;
  droits: Droits;
  onMaj: Maj;
}) {
  const [index, setIndex] = useState(0);
  const i = Math.min(index, Math.max(0, lignes.length - 1));
  const r = lignes[i];
  if (!r) return <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">Aucun élève concerné par cette matière.</p>;
  const m = r.groupes.flatMap((g) => g.matieres).find((x) => x.matiere.id === matiere.id);
  const raison = raisonVerrou(droits, matiere, r);
  const b = r.bulletin;
  const texteNote = (n: Note | undefined) =>
    !n ? "-" : n.etat ? { absent: "abs", dispense: "disp", non_rendu: "nr" }[n.etat] : String(n.note ?? "-").replace(".", ",");

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={i === 0} onClick={() => setIndex(i - 1)} className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2 disabled:opacity-40">
          ← Précédent
        </button>
        <div className="flex-1 text-center">
          <div className="text-[15px] font-semibold">
            {nomEleve(r.eleve)}
            {r.niveau && <span className="ml-1.5 rounded bg-surface-2 px-1 text-[10px] font-normal text-muted">{r.niveau}</span>}
          </div>
          <div className="text-[11.5px] text-muted">
            {i + 1} / {lignes.length} · {matiere.nom} · {ctx.classe.nom}
          </div>
        </div>
        <button
          type="button"
          disabled={i >= lignes.length - 1}
          onClick={() => setIndex(i + 1)}
          className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
        >
          Suivant →
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <div className="space-y-2 rounded-lg bg-surface-2/50 p-3 text-[13px]">
          <div>
            <span className="text-muted">Moyenne </span>
            <strong className="tabular-nums">{note20(m?.chiffre.moy ?? null)}</strong>
            {m?.chiffre.moyClasse != null && <span className="ml-2 text-[11.5px] text-muted">classe {note20(m.chiffre.moyClasse)}</span>}
          </div>
          {evals.length ? (
            <ul className="space-y-0.5">
              {evals.map((ev) => (
                <li key={ev.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted">{ev.titre}</span>
                  <span className="tabular-nums">
                    {texteNote(notes.get(`${ev.id}:${r.eleve.id}`))}
                    <span className="text-muted">/{String(ev.bareme).replace(".", ",")}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12px] text-muted">Aucune évaluation sur la période.</p>
          )}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">Appréciation</div>
          <ChampAppreciation
            key={`${b?.id ?? r.eleve.id}:${matiere.id}`}
            valeur={m?.ligne?.commentaire ?? ""}
            disabled={!!raison}
            raison={raison}
            lignes={5}
            autoFocus
            onEnregistrer={(t) => (b ? enregistrerAppreciation(sb, onMaj, b.id, matiere.id, t) : Promise.resolve("Bulletin pas encore créé."))}
          />
        </div>
      </div>
    </div>
  );
}

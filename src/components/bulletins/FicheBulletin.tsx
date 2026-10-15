"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MENTIONS,
  estSynthese,
  nomEleve,
  nomEnseignant,
  note20,
  rangTexte,
  type Bulletin,
  type Chiffre,
  type ContexteClasse,
  type Enseignant,
  type Ligne,
  type Matiere,
  type Mention,
  type ResultatEleve,
  type Statut,
} from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import type { Droits } from "./Bulletins";
import VueBulletin from "./VueBulletin";
import { PastilleStatut, dateFr, syntheseDe, extensible } from "./outils";
import { LIMITE_APPRECIATION } from "./Appreciations";

/** Un bulletin : commentaires, moyennes, mention et appréciation, enregistrés au fil de la saisie. */
export default function FicheBulletin({
  ctx,
  resultats,
  bulletinId,
  droits,
  enseignants,
  titulaire,
  onNaviguer,
  onMaj,
  onRecharger,
}: {
  ctx: ContexteClasse;
  resultats: ResultatEleve[];
  bulletinId: string;
  droits: Droits;
  enseignants: Map<string, Enseignant>;
  titulaire: string | null;
  onNaviguer: (id: string | null) => void;
  onMaj: (f: (c: ContexteClasse | null) => ContexteClasse | null) => void;
  onRecharger: () => Promise<void>;
}) {
  const sb = useMemo(() => createClient(), []);
  const ordre = useMemo(
    () =>
      [...resultats]
        .filter((r) => r.bulletin)
        .sort((a, b) => (a.niveau ?? "").localeCompare(b.niveau ?? "") || nomEleve(a.eleve).localeCompare(nomEleve(b.eleve), "fr")),
    [resultats],
  );
  const i = ordre.findIndex((r) => r.bulletin!.id === bulletinId);
  const r = ordre[i];
  const b = r.bulletin as Bulletin;
  const precedent = ordre[i - 1];
  const suivant = ordre[i + 1];
  const [apercu, setApercu] = useState(false);
  const [etat, setEtat] = useState<string | null>(null);

  // Alt + ← / → : élève précédent ou suivant (saisie des appréciations à la chaîne).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowLeft" && precedent) onNaviguer(precedent.bulletin!.id);
      if (e.key === "ArrowRight" && suivant) onNaviguer(suivant.bulletin!.id);
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [precedent, suivant, onNaviguer]);

  const signaler = (texte: string) => {
    setEtat(texte);
    window.setTimeout(() => setEtat((x) => (x === texte ? null : x)), 2500);
  };

  async function enregistrerLigne(m: Matiere, patch: Partial<Ligne>) {
    const actuelle = ctx.lignes.find((l) => l.bulletin_id === b.id && l.matiere_id === m.id);
    const ligne: Ligne = { bulletin_id: b.id, matiere_id: m.id, commentaire: null, afficher: true, moyenne_saisie: null, ...actuelle, ...patch };
    const { error } = await sb.from("bulletin_lignes").upsert(ligne, { onConflict: "bulletin_id,matiere_id" });
    if (error) return signaler(`Échec : ${error.message}`);
    onMaj((c) =>
      c && {
        ...c,
        lignes: [...c.lignes.filter((l) => !(l.bulletin_id === b.id && l.matiere_id === m.id)), ligne],
        bulletins: c.bulletins.map((x) => (x.id === b.id && x.statut === "nouveau" ? { ...x, statut: "en_cours" as Statut } : x)),
      },
    );
    signaler("Enregistré");
  }

  async function enregistrerBulletin(patch: { mention?: Mention | null; appreciation?: string | null }) {
    const { data, error } = await sb.from("bulletins").update(patch).eq("id", b.id).select().single();
    if (error) return signaler(`Échec : ${error.message}`);
    onMaj((c) => c && { ...c, bulletins: c.bulletins.map((x) => (x.id === b.id ? (data as Bulletin) : x)) });
    signaler("Enregistré");
  }

  async function statut(cible: Statut, confirmer?: string) {
    if (confirmer && !window.confirm(confirmer)) return;
    const { error } =
      cible === "publie"
        ? await sb.rpc("bulletins_publier", { p_items: [{ id: b.id, synthese: syntheseDe(r, ctx, titulaire, enseignants) }] })
        : await sb.rpc("bulletins_changer_statut", { p_ids: [b.id], p_statut: cible });
    if (error) return signaler(`Échec : ${error.message}`);
    await onRecharger();
  }

  const peutEditer = droits.peutEditer(b);
  const ouvert = ["nouveau", "en_cours", "pret"].includes(b.statut);
  const publie = b.statut === "publie" && estSynthese(b.synthese);
  const avecRang = ctx.classe.afficher_rang;

  return (
    <div className="space-y-3">
      {/* Navigation entre élèves. */}
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <button type="button" onClick={() => onNaviguer(null)} className="rounded-md px-2 py-1 text-accent hover:bg-accent-soft">
          ← Liste de la classe
        </button>
        <span className="text-muted">
          {i + 1} / {ordre.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            disabled={!precedent}
            onClick={() => precedent && onNaviguer(precedent.bulletin!.id)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-40 hover:bg-surface-2"
            title="Élève précédent (Alt + ←)"
          >
            ← {precedent ? nomEleve(precedent.eleve) : ""}
          </button>
          <button
            type="button"
            disabled={!suivant}
            onClick={() => suivant && onNaviguer(suivant.bulletin!.id)}
            className="rounded-md border border-border px-2 py-1 disabled:opacity-40 hover:bg-surface-2"
            title="Élève suivant (Alt + →)"
          >
            {suivant ? nomEleve(suivant.eleve) : ""} →
          </button>
        </div>
      </div>

      {/* En-tête : élève, moyenne générale, état et actions. */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{nomEleve(r.eleve)}</h2>
            {r.niveau && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">{r.niveau}</span>}
            <PastilleStatut statut={b.statut} />
            {b.source === "ecole-futee" && <span className="text-[11px] text-muted">Repris d&apos;École Futée</span>}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {b.publie_le && `Publié le ${dateFr(b.publie_le)}`}
            {b.lu_le && ` · lu par la famille le ${dateFr(b.lu_le)}`}
            {b.statut === "publie" && !b.lu_le && " · pas encore lu"}
            {b.envoye_courrier_le && ` · courrier le ${dateFr(b.envoye_courrier_le)}`}
          </div>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-1.5 text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted">Moyenne générale</div>
          <div className="text-lg font-semibold tabular-nums text-accent">{note20(r.general.moy)}</div>
          <div className="text-[11px] text-muted">
            Classe {note20(r.general.moyClasse)}
            {avecRang && r.general.rang ? ` · ${rangTexte(r.general.rang)}` : ""}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {etat && <span className="text-[12px] text-muted">{etat}</span>}
          {(droits.directrice || droits.titulaire) && ["nouveau", "en_cours"].includes(b.statut) && (
            <Action onClick={() => statut("pret")}>Marquer prêt</Action>
          )}
          {(droits.directrice || droits.titulaire) && b.statut === "pret" && <Action onClick={() => statut("en_cours")}>Remettre en cours</Action>}
          {droits.directrice && ouvert && (
            <Action fort onClick={() => statut("valide")}>
              Valider
            </Action>
          )}
          {droits.directrice && b.statut === "valide" && (
            <>
              <Action onClick={() => statut("en_cours")}>Remettre en cours</Action>
              <Action fort onClick={() => statut("publie", "Publier ce bulletin ? La famille le verra aussitôt dans son espace.")}>
                Publier
              </Action>
            </>
          )}
          {droits.directrice && b.statut === "publie" && (
            <Action onClick={() => statut("valide", "Retirer ce bulletin de l'espace de la famille (il redevient « Validé ») ?")}>Dépublier</Action>
          )}
          {!publie && <Action onClick={() => setApercu((a) => !a)}>{apercu ? "Revenir à la saisie" : "Aperçu famille"}</Action>}
          <Action onClick={() => telechargerBulletins([syntheseDe(r, ctx, titulaire, enseignants)])}>PDF</Action>
        </div>
      </div>

      {publie || apercu ? (
        <div className="rounded-xl border border-border bg-surface p-4">
          <VueBulletin s={syntheseDe(r, ctx, titulaire, enseignants)} />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[52rem] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-medium">Matière</th>
                  <th className="w-16 px-2 py-2 text-center font-medium" title="Décocher pour ne pas faire figurer la matière sur ce bulletin">
                    Afficher
                  </th>
                  <th className="w-24 px-2 py-2 text-center font-medium">Moyenne</th>
                  <th className="w-16 px-2 py-2 text-center font-medium">Classe</th>
                  {avecRang && <th className="w-12 px-2 py-2 text-center font-medium">Rang</th>}
                  <th className="px-3 py-2 font-medium">Appréciation</th>
                </tr>
              </thead>
              <tbody>
                {r.groupes.map((g) => (
                  <GroupeLignes key={g.groupe.id} g={g} avecRang={avecRang}>
                    {g.matieres.map((m) => {
                      const editable = droits.peutCommenter(m.matiere, b);
                      return (
                        <tr key={m.matiere.id} className={`border-t border-border/60 align-top ${m.ligne?.afficher === false ? "opacity-50" : ""}`}>
                          <td className="px-3 py-1.5 pl-5">
                            <div>{m.matiere.nom}</div>
                            <div className="text-[10.5px] text-muted">
                              {m.matiere.enseignants
                                .map((id) => enseignants.get(id))
                                .filter((e): e is Enseignant => !!e)
                                .map(nomEnseignant)
                                .join(", ")}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={m.ligne?.afficher !== false}
                              disabled={!editable}
                              onChange={(e) => enregistrerLigne(m.matiere, { afficher: e.target.checked })}
                              aria-label={`Afficher ${m.matiere.nom}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <ChampMoyenne
                              key={`${b.id}:${m.matiere.id}`}
                              calculee={m.calculee}
                              nbNotes={m.nbNotes}
                              saisie={m.ligne?.moyenne_saisie ?? null}
                              affichee={m.chiffre.moy}
                              disabled={!editable}
                              onEnregistrer={(v) => enregistrerLigne(m.matiere, { moyenne_saisie: v })}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center tabular-nums text-muted">{note20(m.chiffre.moyClasse)}</td>
                          {avecRang && <td className="px-2 py-1.5 text-center tabular-nums text-muted">{rangTexte(m.chiffre.rang)}</td>}
                          <td className="px-3 py-1">
                            <ChampTexte
                              key={`${b.id}:${m.matiere.id}`}
                              valeur={m.ligne?.commentaire ?? ""}
                              disabled={!editable}
                              placeholder={editable ? "Appréciation…" : ""}
                              max={LIMITE_APPRECIATION}
                              onEnregistrer={(v) => enregistrerLigne(m.matiere, { commentaire: v || null })}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </GroupeLignes>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-[14rem_1fr]">
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 text-xs font-semibold">Mention</div>
              <div className="flex flex-col gap-1">
                {[{ v: null, label: "Aucune mention" }, ...MENTIONS].map((x) => (
                  <label key={x.label} className={`flex items-center gap-2 rounded-md px-2 py-1 text-[13px] ${b.mention === x.v ? "bg-gold-soft font-medium" : ""}`}>
                    <input type="radio" name={`mention-${b.id}`} checked={b.mention === x.v} disabled={!peutEditer} onChange={() => enregistrerBulletin({ mention: x.v })} />
                    {x.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="mb-2 flex items-baseline justify-between text-xs">
                <span className="font-semibold">Appréciation générale</span>
                {!peutEditer && <span className="text-muted">Rédigée par la titulaire de la classe</span>}
              </div>
              <ChampTexte
                key={`app:${b.id}`}
                valeur={b.appreciation ?? ""}
                disabled={!peutEditer}
                lignes={6}
                compteur
                placeholder="Appréciation générale de la période…"
                onEnregistrer={(v) => enregistrerBulletin({ appreciation: v || null })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function GroupeLignes({ g, avecRang, children }: { g: { groupe: { nom: string }; chiffre: Chiffre }; avecRang: boolean; children: React.ReactNode }) {
  return (
    <>
      <tr className="border-t border-border bg-gold-soft/60 font-semibold">
        <td className="px-3 py-1.5">{g.groupe.nom}</td>
        <td />
        <td className="px-2 py-1.5 text-center tabular-nums">{note20(g.chiffre.moy)}</td>
        <td className="px-2 py-1.5 text-center tabular-nums font-normal text-muted">{note20(g.chiffre.moyClasse)}</td>
        {avecRang && <td className="px-2 py-1.5 text-center tabular-nums font-normal">{rangTexte(g.chiffre.rang)}</td>}
        <td />
      </tr>
      {children}
    </>
  );
}

function Action({ children, onClick, fort = false }: { children: React.ReactNode; onClick: () => void; fort?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${fort ? "bg-accent text-accent-fg hover:opacity-90" : "border border-border hover:bg-surface-2"}`}
    >
      {children}
    </button>
  );
}

/** Zone de texte enregistrée en quittant le champ. */
export function ChampTexte({
  valeur,
  onEnregistrer,
  disabled,
  placeholder,
  lignes = 1,
  compteur = false,
  max,
}: {
  valeur: string;
  onEnregistrer: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  lignes?: number;
  compteur?: boolean;
  /** Longueur maximale (appréciation de matière : LIMITE_APPRECIATION). */
  max?: number;
}) {
  const [texte, setTexte] = useState(valeur);
  return (
    <div>
      <textarea
        value={texte}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={max}
        rows={Math.max(lignes, Math.min(6, Math.ceil(texte.length / 70)))}
        onChange={(e) => setTexte(e.target.value)}
        onBlur={() => texte.trim() !== valeur.trim() && onEnregistrer(texte.trim())}
        {...extensible}
        className="w-full resize-y rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] leading-snug outline-none hover:border-border focus:border-accent focus:bg-background disabled:hover:border-transparent"
      />
      {max && !disabled && texte.length > max * 0.8 && <div className="text-right text-[10.5px] text-muted">{texte.length}/{max}</div>}
      {compteur && <div className="text-right text-[10.5px] text-muted">{texte.length} caractères</div>}
    </div>
  );
}

/** Moyenne : calculée à partir des évaluations, ou saisie directement (la saisie prime). */
function ChampMoyenne({
  calculee,
  nbNotes,
  saisie,
  affichee,
  disabled,
  onEnregistrer,
}: {
  calculee: number | null;
  nbNotes: number;
  saisie: number | null;
  affichee: number | null;
  disabled: boolean;
  onEnregistrer: (v: number | null) => void;
}) {
  const [texte, setTexte] = useState(saisie !== null ? String(saisie).replace(".", ",") : "");
  const [edition, setEdition] = useState(false);
  if (!edition) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEdition(true)}
        className="w-full rounded-md px-1 py-0.5 tabular-nums enabled:hover:bg-surface-2"
        title={
          saisie !== null
            ? `Moyenne saisie${calculee !== null ? ` (calcul des évaluations : ${note20(calculee)})` : ""}`
            : nbNotes
              ? `Calculée sur ${nbNotes} évaluation${nbNotes > 1 ? "s" : ""}`
              : disabled
                ? undefined
                : "Saisir une moyenne directement"
        }
      >
        <span className="font-semibold">{note20(affichee)}</span>
        {saisie !== null && <span className="ml-1 text-[10px] text-gold">saisie</span>}
        {saisie === null && nbNotes > 0 && <span className="ml-1 text-[10px] text-muted">({nbNotes})</span>}
      </button>
    );
  }
  const valider = () => {
    setEdition(false);
    const t = texte.trim().replace(",", ".");
    const v = t === "" ? null : Number(t);
    if (v !== null && (Number.isNaN(v) || v < 0 || v > 20)) return setTexte(saisie !== null ? String(saisie) : "");
    if (v !== saisie) onEnregistrer(v);
  };
  return (
    <input
      autoFocus
      inputMode="decimal"
      value={texte}
      placeholder={calculee !== null ? note20(calculee) : "/20"}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={valider}
      onKeyDown={(e) => {
        if (e.key === "Enter") valider();
        if (e.key === "Escape") setEdition(false);
      }}
      className="w-16 rounded-md border border-accent bg-background px-1.5 py-0.5 text-center text-[13px] tabular-nums outline-none"
      title="Laisser vide pour revenir à la moyenne calculée"
    />
  );
}

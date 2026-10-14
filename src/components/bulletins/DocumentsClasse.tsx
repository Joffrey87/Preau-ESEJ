"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { estSynthese, nomEleve, type Enseignant, type Matiere, type Periode, type Statut, type Synthese } from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import {
  matieresIntervenants,
  syntheseReleve,
  syntheseTrimestre,
  titreTrimestre,
  type ContexteDocs,
  type DocReleve,
  type DocTrimestre,
} from "@/lib/relevesTrimestre";
import { BoutonLot, PastilleStatut } from "./outils";
import VueBulletin from "./VueBulletin";

const OUVERTS: Statut[] = ["nouveau", "en_cours", "pret"];

/**
 * Relevés de notes (une période : notes seules, appréciation générale) ou bulletins trimestriels (moyennes simples,
 * appréciation de chaque professeur intervenant dans sa matière, appréciation générale de la titulaire). Même circuit
 * que les bulletins : Prêt (titulaire), Validé puis Publié (Directrice) ; la famille lit les documents publiés.
 */
export default function DocumentsClasse({
  mode,
  ctx,
  periode,
  directrice,
  titulaire,
  enseignantId,
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
  nomTitulaire: string | null;
  enseignants: Map<string, Enseignant>;
  onRecharger: () => Promise<void>;
}) {
  const sb = useMemo(() => createClient(), []);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const table = mode === "releve" ? "releves_notes" : "bulletins_trimestre";
  const docs: (DocReleve | DocTrimestre)[] = mode === "releve" ? ctx.releves : ctx.trimestriels;
  const docDe = (eleveId: string) => docs.find((d) => d.eleve_id === eleveId);
  const outils = { titulaire: nomTitulaire, enseignants };
  const intervenants = mode === "trimestre" ? matieresIntervenants(ctx) : [];
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

  const eleves = [...ctx.eleves].sort((a, b) => nomEleve(a).localeCompare(nomEleve(b), "fr"));
  const n = (s: Statut) => cible.filter((d) => d.statut === s).length;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface p-3 text-[13px]">
        <div className="font-semibold">
          {mode === "releve" ? `Relevés de notes · Période ${periode.ordre}` : `Bulletins · ${titreTrimestre(ctx.trimestre)}`}
        </div>
        <p className="text-[12px] text-muted">
          {mode === "releve"
            ? "Les notes de la période uniquement, sans moyenne, avec une appréciation générale."
            : `Moyennes simples sur 20, calculées sur toutes les notes du trimestre (périodes ${ctx.periodes.map((p) => p.ordre).join(", ")}). Chaque professeur intervenant écrit l'appréciation de sa matière ; la titulaire écrit l'appréciation générale, validée par la Directrice.`}
        </p>
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
      <div className="space-y-2">
        {eleves.map((e) => {
          const d = docDe(e.id);
          const s = ouvert === e.id ? synthese(e.id) : null;
          return (
            <div key={e.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
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
                {d && <PastilleStatut statut={d.statut} />}
                <button type="button" onClick={() => setOuvert(ouvert === e.id ? null : e.id)} className="ml-auto text-[12.5px] text-accent hover:underline">
                  {ouvert === e.id ? "Masquer" : mode === "releve" ? "Voir le relevé" : "Voir le bulletin"}
                </button>
              </div>

              {d && mode === "trimestre" && intervenants.length > 0 && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {intervenants.map((m) => {
                    const a = ctx.appreciations.find((x) => x.bulletin_id === d.id && x.matiere_id === m.id);
                    const modifiable = peutNoter(m) && (directrice || OUVERTS.includes(d.statut));
                    return (
                      <label key={m.id} className="grid gap-0.5 text-[11.5px] text-muted">
                        Appréciation · {m.nom}
                        <textarea
                          key={`${d.id}:${m.id}:${a?.texte ?? ""}`}
                          defaultValue={a?.texte ?? ""}
                          readOnly={!modifiable}
                          rows={2}
                          onBlur={(ev) => {
                            const v = ev.target.value.trim();
                            if (!modifiable || v === (a?.texte ?? "").trim()) return;
                            agir(sb.from("bulletins_trimestre_appreciations").upsert({ bulletin_id: d.id, matiere_id: m.id, texte: v || null }));
                          }}
                          className="rounded-md border border-border bg-background px-2 py-1 text-[13px] text-foreground outline-none focus:border-accent read-only:bg-surface-2/50"
                        />
                      </label>
                    );
                  })}
                </div>
              )}

              {d && (
                <label className="mt-2 grid gap-0.5 text-[11.5px] text-muted">
                  Appréciation générale{mode === "trimestre" ? " (titulaire)" : ""}
                  <textarea
                    key={`${d.id}:${d.appreciation ?? ""}`}
                    defaultValue={d.appreciation ?? ""}
                    readOnly={!peutEditer(d)}
                    rows={2}
                    onBlur={(ev) => {
                      const v = ev.target.value.trim();
                      if (!peutEditer(d) || v === (d.appreciation ?? "").trim()) return;
                      agir(sb.from(table).update({ appreciation: v || null }).eq("id", d.id));
                    }}
                    className="rounded-md border border-border bg-background px-2 py-1 text-[13px] text-foreground outline-none focus:border-accent read-only:bg-surface-2/50"
                  />
                </label>
              )}

              {s && (
                <div className="mt-3 border-t border-border pt-3">
                  <VueBulletin s={s} />
                  <button type="button" onClick={() => telechargerBulletins([s])} className="mt-2 text-[12.5px] text-accent hover:underline">
                    Télécharger le PDF
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { inputCls } from "./GestionComptes";
import { usePrenom } from "@/components/PrenomRecherche";
import HistoriqueRecherche from "@/components/HistoriqueRecherche";
import {
  MEMBRES,
  PILIERS,
  STATUTS_IDEE,
  formatCible,
  libelleStatutIdee,
  tracer,
  type Action,
  type Idee,
  type Pilier,
  type StatutIdee,
} from "@/lib/rechercheFonds";

type Form = {
  titre: string;
  pilier: Pilier;
  description: string;
  cible_valeur: string;
  cible_unite: string;
  periode: string;
  responsable: string;
  statut: StatutIdee;
};

const versForm = (i: Idee): Form => ({
  titre: i.titre,
  pilier: i.pilier,
  description: i.description ?? "",
  cible_valeur: i.cible_valeur != null ? String(i.cible_valeur).replace(".", ",") : "",
  cible_unite: i.cible_unite ?? "€",
  periode: i.periode ?? "",
  responsable: i.responsable ?? "",
  statut: i.statut,
});

/**
 * Onglet « Axes de recherche » : les idées du plan de financement, par pilier.
 * Dans chaque pilier : retenues, puis en réflexion, à étudier, et non retenues
 * en bas. Clic sur une idée : sa fiche (description, cible, auteur, responsable,
 * décision). Retenir une idée crée sa fiche dans « Suivi des actions ».
 */
export default function AxesRecherche({ idees, actions }: { idees: Idee[]; actions: Action[] }) {
  const router = useRouter();
  const { prenom } = usePrenom();
  // Classement des retenues par glisser-déposer : ordre affiché en attendant le rechargement.
  const [ordreLocal, setOrdreLocal] = useState<string[] | null>(null);
  const [glisse, setGlisse] = useState<string | null>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [edit, setEdit] = useState<Idee | "nouvelle" | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Menu de la pastille de statut ouvert (id de l'idée).
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!menu) return;
    const fermer = () => setMenu(null);
    document.addEventListener("click", fermer);
    return () => document.removeEventListener("click", fermer);
  }, [menu]);

  const actionDe = useMemo(() => new Map(actions.map((a) => [a.idee_id, a])), [actions]);

  // (Les idées non retenues depuis plus de trois semaines sont écartées par la page.)
  const visibles = idees;

  // Idées retenues, dans l'ordre du classement (les non classées à la suite).
  const retenuesBase = idees
    .filter((i) => i.statut === "retenue")
    .sort((a, b) => (a.priorite ?? 9999) - (b.priorite ?? 9999) || a.statut_le.localeCompare(b.statut_le));
  const retenues = ordreLocal
    ? [
        ...ordreLocal.map((id) => retenuesBase.find((i) => i.id === id)).filter((i): i is Idee => !!i),
        ...retenuesBase.filter((i) => !ordreLocal.includes(i.id)),
      ]
    : retenuesBase;

  async function deposer(cibleId: string) {
    const source = glisse;
    setGlisse(null);
    setSurvol(null);
    if (!source || source === cibleId) return;
    const ids = retenues.map((i) => i.id).filter((id) => id !== source);
    ids.splice(ids.indexOf(cibleId), 0, source);
    setOrdreLocal(ids);
    const supabase = createClient();
    await Promise.all(ids.map((id, k) => supabase.from("recherche_idees").update({ priorite: k + 1 }).eq("id", id)));
    const deplacee = retenues.find((i) => i.id === source);
    if (deplacee) {
      await tracer(supabase, { prenom, objet: "idee", objet_id: source, titre: deplacee.titre, evenement: `classée n° ${ids.indexOf(source) + 1}` });
    }
    router.refresh();
  }

  const glissable = (i: Idee) => ({
    draggable: true,
    onDragStart: () => setGlisse(i.id),
    onDragEnd: () => {
      setGlisse(null);
      setSurvol(null);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (survol !== i.id) setSurvol(i.id);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      void deposer(i.id);
    },
  });
  const rang = (s: StatutIdee) => STATUTS_IDEE.findIndex((x) => x.v === s);

  /** Idée retenue : sa fiche de suivi est créée (une seule par idée). */
  async function assurerAction(
    supabase: ReturnType<typeof createClient>,
    idee: Pick<Idee, "id" | "titre" | "responsable" | "cible_valeur" | "cible_unite">,
  ) {
    if (actionDe.get(idee.id)) return;
    const { data: action } = await supabase
      .from("recherche_actions")
      .insert({
        idee_id: idee.id,
        titre: idee.titre,
        porteur: idee.responsable,
        objectif_valeur: idee.cible_valeur,
        objectif_unite: idee.cible_unite,
      })
      .select("id")
      .single();
    if (action) await tracer(supabase, { prenom, objet: "action", objet_id: action.id, titre: idee.titre, evenement: "fiche de suivi créée" });
  }

  /** Changement de décision depuis la pastille. */
  async function changerStatut(i: Idee, statut: StatutIdee) {
    setMenu(null);
    if (i.statut === statut) return;
    const supabase = createClient();
    const maintenant = new Date().toISOString();
    const { error: err } = await supabase
      .from("recherche_idees")
      .update({ statut, statut_le: maintenant, modifie_le: maintenant })
      .eq("id", i.id);
    if (err) return window.alert("Changement impossible : " + err.message);
    await tracer(supabase, { prenom, objet: "idee", objet_id: i.id, titre: i.titre, evenement: `→ ${libelleStatutIdee(statut)}` });
    if (statut === "retenue") await assurerAction(supabase, i);
    router.refresh();
  }

  /** Croix d'une idée non retenue : suppression (tracée dans l'historique). */
  async function retirer(i: Idee) {
    const supabase = createClient();
    await supabase.from("recherche_idees").update({ supprime_le: new Date().toISOString() }).eq("id", i.id);
    await tracer(supabase, { prenom, objet: "idee", objet_id: i.id, titre: i.titre, evenement: "supprimée" });
    router.refresh();
  }

  function ouvrir(i: Idee | "nouvelle") {
    setError(null);
    setF(
      i === "nouvelle"
        ? { titre: "", pilier: "E", description: "", cible_valeur: "", cible_unite: "€", periode: "", responsable: "", statut: "a_etudier" }
        : versForm(i),
    );
    setEdit(i);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!f || !edit) return;
    if (!f.titre.trim()) return setError("L'intitulé est obligatoire.");
    const cible = f.cible_valeur.trim() ? Number(f.cible_valeur.replace(/\s/g, "").replace(",", ".")) : null;
    if (cible != null && !Number.isFinite(cible)) return setError("Cible invalide.");
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const champs = {
      titre: f.titre.trim(),
      pilier: f.pilier,
      description: f.description.trim() || null,
      cible_valeur: cible,
      cible_unite: f.cible_unite.trim() || null,
      periode: f.periode.trim() || null,
      responsable: f.responsable.trim() || null,
      statut: f.statut,
      modifie_le: new Date().toISOString(),
      ...(edit === "nouvelle" || edit.statut !== f.statut ? { statut_le: new Date().toISOString() } : {}),
    };
    let idee: Idee | null = null;
    if (edit === "nouvelle") {
      const { data, error: err } = await supabase
        .from("recherche_idees")
        .insert({ ...champs, auteur: prenom, source: "Groupe", ordre: 1000 })
        .select("*")
        .single();
      if (err || !data) {
        setSaving(false);
        return setError("Enregistrement impossible : " + (err?.message ?? ""));
      }
      idee = data as Idee;
      await tracer(supabase, { prenom, objet: "idee", objet_id: idee.id, titre: idee.titre, evenement: "proposée" });
    } else {
      const { error: err } = await supabase.from("recherche_idees").update(champs).eq("id", edit.id);
      if (err) {
        setSaving(false);
        return setError("Enregistrement impossible : " + err.message);
      }
      idee = { ...edit, ...champs } as Idee;
      if (edit.statut !== f.statut) {
        await tracer(supabase, { prenom, objet: "idee", objet_id: edit.id, titre: champs.titre, evenement: `→ ${libelleStatutIdee(f.statut)}` });
      }
      if ((edit.responsable ?? "") !== (champs.responsable ?? "")) {
        await tracer(supabase, {
          prenom,
          objet: "idee",
          objet_id: edit.id,
          titre: champs.titre,
          evenement: champs.responsable ? `responsable : ${champs.responsable}` : "responsable retiré",
        });
      }
    }
    if (idee.statut === "retenue") await assurerAction(supabase, idee);
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  async function supprimer() {
    if (!edit || edit === "nouvelle") return;
    if (!window.confirm(`Supprimer l'idée « ${edit.titre} » ?`)) return;
    const supabase = createClient();
    await supabase.from("recherche_idees").update({ supprime_le: new Date().toISOString() }).eq("id", edit.id);
    await tracer(supabase, { prenom, objet: "idee", objet_id: edit.id, titre: edit.titre, evenement: "supprimée" });
    setEdit(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <HistoriqueRecherche />
        <button type="button" onClick={() => ouvrir("nouvelle")} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
          + Nouvelle idée
        </button>
      </div>

      {/* Idées retenues, classées par glisser-déposer : les trois premières en avant. */}
      <section className="mb-5 rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold">Idées retenues ({retenues.length})</h2>
        {retenues.length === 0 ? (
          <p className="text-sm text-muted">Aucune idée retenue pour l&apos;instant.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {retenues.slice(0, 3).map((i, k) => (
                <div
                  key={i.id}
                  {...glissable(i)}
                  onClick={() => ouvrir(i)}
                  className={`cursor-grab rounded-xl border-2 bg-[#14295c] p-3 text-white transition active:cursor-grabbing ${
                    survol === i.id && glisse !== i.id ? "border-[#c8952f] ring-2 ring-[#c8952f]/50" : "border-[#c8952f]/70"
                  } ${glisse === i.id ? "opacity-40" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl font-semibold leading-none text-[#c8952f]">{k + 1}</span>
                    <span className="rounded bg-white/10 px-1.5 text-[11px] font-semibold text-[#c8952f]">{i.pilier}</span>
                  </div>
                  <div className="mt-2 text-sm font-semibold">
                    {i.nouvelle && <span className="mr-1 text-[#c8952f]">★</span>}
                    {i.titre}
                  </div>
                  <div className="mt-1 text-xs text-[#c3cee6]">
                    {[i.responsable, formatCible(i.cible_valeur, i.cible_unite)].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </div>
            {retenues.length > 3 && (
              <ol className="mt-3 divide-y divide-border rounded-lg border border-border">
                {retenues.slice(3).map((i, k) => (
                  <li
                    key={i.id}
                    {...glissable(i)}
                    onClick={() => ouvrir(i)}
                    className={`flex cursor-grab items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2 active:cursor-grabbing ${
                      survol === i.id && glisse !== i.id ? "bg-accent-soft" : ""
                    } ${glisse === i.id ? "opacity-40" : ""}`}
                  >
                    <span className="w-5 text-right tabular-nums text-muted">{k + 4}</span>
                    <span className="text-muted">⋮⋮</span>
                    <span className="flex-1">
                      {i.nouvelle && <span className="mr-1 text-[#c8952f]">★</span>}
                      {i.titre}
                    </span>
                    <span className="text-xs text-muted">{[i.responsable, formatCible(i.cible_valeur, i.cible_unite)].filter(Boolean).join(" · ")}</span>
                    <span className="rounded bg-[#14295c] px-1.5 text-[11px] font-semibold text-[#c8952f]">{i.pilier}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {PILIERS.map((p) => {
          const duPilier = visibles.filter((i) => i.pilier === p.code);
          return (
            <section key={p.code} className="overflow-hidden rounded-xl border border-border bg-surface">
              <header className="bg-[#14295c] px-4 py-2.5 text-white">
                <div className="text-sm font-semibold">
                  <span className="mr-1.5 text-[#c8952f]">PILIER {p.code}</span>
                  {p.titre}
                </div>
                <div className="text-xs text-[#c3cee6]">Cible : {p.cible}</div>
              </header>
              <ul className="px-2 py-2">
                {[...duPilier]
                  .sort((x, y) => rang(x.statut) - rang(y.statut) || x.ordre - y.ordre || x.titre.localeCompare(y.titre, "fr"))
                  .map((i) => {
                    const st = STATUTS_IDEE.find((x) => x.v === i.statut)!;
                    const non = i.statut === "non_retenue";
                    return (
                      <li key={i.id} className="relative flex items-start gap-2 rounded-lg px-1 hover:bg-surface-2">
                        {/* Pastille de décision : clic → choix du statut */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenu(menu === i.id ? null : i.id);
                          }}
                          title={`${st.l} — cliquer pour changer`}
                          aria-label={`Statut : ${st.l}. Changer`}
                          aria-expanded={menu === i.id}
                          className="mt-1.5 inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-surface py-0.5 pl-1 pr-1.5 hover:border-accent/60"
                        >
                          <span className="h-3 w-3 rounded-full" style={{ background: st.pastille }} />
                          <span className="text-[9px] leading-none text-muted">▾</span>
                        </button>
                        {menu === i.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute left-1 top-8 z-20 min-w-40 rounded-lg border border-border bg-surface p-1 shadow-lg"
                          >
                            {STATUTS_IDEE.map((x) => (
                              <button
                                key={x.v}
                                type="button"
                                onClick={() => changerStatut(i, x.v)}
                                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-surface-2 ${x.v === i.statut ? "font-semibold" : ""}`}
                              >
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.pastille }} />
                                <span className={x.v === "non_retenue" ? "line-through" : ""}>{x.l}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => ouvrir(i)}
                          className={`flex min-w-0 flex-1 items-start justify-between gap-3 py-1.5 text-left text-sm ${non ? "text-muted" : ""}`}
                        >
                          <span className="min-w-0">
                            {i.nouvelle && <span className="mr-1 text-[#c8952f]">★</span>}
                            <span className={non ? "line-through" : i.statut === "retenue" ? "font-medium" : ""}>{i.titre}</span>
                            {i.responsable && <span className="ml-1.5 text-xs text-muted">· {i.responsable}</span>}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted">{formatCible(i.cible_valeur, i.cible_unite) ?? ""}</span>
                        </button>
                        {non && (
                          <button
                            type="button"
                            onClick={() => retirer(i)}
                            title="Supprimer cette idée (sinon elle disparaît d'elle-même trois semaines après la décision)"
                            aria-label="Supprimer l'idée"
                            className="mt-1 shrink-0 rounded p-1 text-xs text-muted hover:text-negative"
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          );
        })}
      </div>

      {edit && f && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <form onSubmit={enregistrer} className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-3">
              <h2 className="text-base font-semibold">{edit === "nouvelle" ? "Nouvelle idée" : "Fiche de l'idée"}</h2>
              <button type="button" onClick={() => setEdit(null)} aria-label="Fermer" className="rounded p-1 text-muted hover:bg-surface-2">✕</button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-4 text-sm">
              <div>
                <div className="mb-1.5 font-medium">Décision</div>
                <div className="flex flex-wrap gap-2">
                  {STATUTS_IDEE.map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      onClick={() => setF({ ...f, statut: s.v })}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${f.statut === s.v ? s.cls + " ring-2 ring-accent/40" : "border-border hover:bg-surface-2"}`}
                    >
                      {s.l}
                    </button>
                  ))}
                </div>
                {edit !== "nouvelle" && edit.statut === "retenue" && actionDe.get(edit.id) && (
                  <Link href={`/recherche/suivi?action=${actionDe.get(edit.id)!.id}`} className="mt-2 inline-block text-xs text-accent hover:underline">
                    Voir sa fiche dans Suivi des actions →
                  </Link>
                )}
                {f.statut === "retenue" && (edit === "nouvelle" || edit.statut !== "retenue") && (
                  <p className="mt-2 text-xs text-muted">En l&apos;enregistrant, sa fiche sera créée dans « Suivi des actions ».</p>
                )}
              </div>
              <label className="block">
                <span className="mb-1 block font-medium">Intitulé</span>
                <input value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} className={inputCls} required />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Description</span>
                <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={4} className={inputCls} />
              </label>
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
                <label className="block">
                  <span className="mb-1 block font-medium">Cible</span>
                  <input value={f.cible_valeur} onChange={(e) => setF({ ...f, cible_valeur: e.target.value })} inputMode="decimal" placeholder="2 600" className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Unité</span>
                  <input value={f.cible_unite} onChange={(e) => setF({ ...f, cible_unite: e.target.value })} placeholder="€, inscriptions par an…" className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Pilier</span>
                  <select value={f.pilier} onChange={(e) => setF({ ...f, pilier: e.target.value as Pilier })} className={inputCls}>
                    {PILIERS.map((p) => (
                      <option key={p.code} value={p.code}>{p.code} · {p.titre}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-medium">Responsable</span>
                  <input value={f.responsable} onChange={(e) => setF({ ...f, responsable: e.target.value })} list="membres-recherche" placeholder="Prénom" className={inputCls} />
                  <datalist id="membres-recherche">
                    {[...new Set([...MEMBRES, ...(prenom ? [prenom] : [])])].map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">Période</span>
                  <input value={f.periode} onChange={(e) => setF({ ...f, periode: e.target.value })} placeholder="Déc. 2026" className={inputCls} />
                </label>
              </div>
              <p className="text-xs text-muted">
                Auteur :{" "}
                {edit === "nouvelle"
                  ? (prenom ?? "—")
                  : `${edit.auteur ?? "—"}${edit.cree_le ? ` · le ${formatDate(edit.cree_le.slice(0, 10))}` : ""}`}
              </p>
              {error && <p className="rounded-lg bg-negative/10 px-3 py-2 text-negative">{error}</p>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-3">
              {edit !== "nouvelle" ? (
                <button type="button" onClick={supprimer} className="text-sm text-muted hover:text-negative">Supprimer</button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEdit(null)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2">Annuler</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50">
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
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
  const [filtrePilier, setFiltrePilier] = useState<Pilier | "">("");
  const [seulementNouvelles, setSeulementNouvelles] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [edit, setEdit] = useState<Idee | "nouvelle" | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionDe = useMemo(() => new Map(actions.map((a) => [a.idee_id, a])), [actions]);
  const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const visibles = idees.filter(
    (i) =>
      (!filtrePilier || i.pilier === filtrePilier) &&
      (!seulementNouvelles || i.nouvelle) &&
      (!recherche.trim() || norm(`${i.titre} ${i.description ?? ""}`).includes(norm(recherche.trim()))),
  );
  const compte = (s: StatutIdee) => idees.filter((i) => i.statut === s).length;

  function ouvrir(i: Idee | "nouvelle") {
    setError(null);
    setF(
      i === "nouvelle"
        ? { titre: "", pilier: filtrePilier || "E", description: "", cible_valeur: "", cible_unite: "€", periode: "", responsable: "", statut: "a_etudier" }
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
    // Idée retenue : sa fiche de suivi est créée (une seule par idée).
    if (idee.statut === "retenue" && !actionDe.get(idee.id)) {
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

  const chip = (actif: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium ${actif ? "bg-accent text-accent-fg" : "border border-border text-muted hover:bg-surface-2"}`;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une idée"
          className={`${inputCls} max-w-xs`}
        />
        <button type="button" onClick={() => setFiltrePilier("")} className={chip(!filtrePilier)}>Tous les piliers</button>
        {PILIERS.map((p) => (
          <button key={p.code} type="button" onClick={() => setFiltrePilier(filtrePilier === p.code ? "" : p.code)} className={chip(filtrePilier === p.code)} title={p.titre}>
            {p.code} · {p.titre}
          </button>
        ))}
        <button type="button" onClick={() => setSeulementNouvelles((v) => !v)} className={chip(seulementNouvelles)}>
          ★ Nouvelles pistes
        </button>
        <div className="ml-auto flex gap-2">
          <HistoriqueRecherche />
          <button type="button" onClick={() => ouvrir("nouvelle")} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
            + Nouvelle idée
          </button>
        </div>
      </div>

      <p className="mb-4 text-xs text-muted">
        {idees.length} idées · {compte("retenue")} retenue{compte("retenue") > 1 ? "s" : ""} · {compte("en_reflexion")} en réflexion ·{" "}
        {compte("a_etudier")} à étudier · {compte("non_retenue")} non retenue{compte("non_retenue") > 1 ? "s" : ""}. ★ = nouvelle piste du plan V3.2.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {PILIERS.filter((p) => !filtrePilier || p.code === filtrePilier).map((p) => {
          const duPilier = visibles.filter((i) => i.pilier === p.code);
          if (duPilier.length === 0 && (recherche.trim() || seulementNouvelles)) return null;
          return (
            <section key={p.code} className="overflow-hidden rounded-xl border border-border bg-surface">
              <header className="bg-[#14295c] px-4 py-2.5 text-white">
                <div className="text-sm font-semibold">
                  <span className="mr-1.5 text-[#c8952f]">PILIER {p.code}</span>
                  {p.titre}
                </div>
                <div className="text-xs text-[#c3cee6]">Cible : {p.cible}</div>
              </header>
              {STATUTS_IDEE.map((s) => {
                const lot = duPilier.filter((i) => i.statut === s.v).sort((a, b) => a.ordre - b.ordre || a.titre.localeCompare(b.titre, "fr"));
                if (lot.length === 0) return null;
                return (
                  <div key={s.v} className="border-t border-border first:border-t-0">
                    <div className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                      {s.l} ({lot.length})
                    </div>
                    <ul className="px-2 pb-2">
                      {lot.map((i) => (
                        <li key={i.id}>
                          <button
                            type="button"
                            onClick={() => ouvrir(i)}
                            className={`flex w-full items-start justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2 ${
                              s.v === "non_retenue" ? "text-muted" : ""
                            }`}
                          >
                            <span className="min-w-0">
                              {i.nouvelle && <span className="mr-1 text-[#c8952f]">★</span>}
                              <span className={s.v === "retenue" ? "font-medium" : ""}>{i.titre}</span>
                              {i.responsable && <span className="ml-1.5 text-xs text-muted">· {i.responsable}</span>}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted">{formatCible(i.cible_valeur, i.cible_unite) ?? ""}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
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

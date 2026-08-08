"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "@/components/GestionComptes";
import {
  ETAPES,
  ETAPE_LABEL,
  SEGMENT_LABEL,
  SEGMENT_POTENTIEL,
  CAPACITE_LABEL,
  etapeSuivante,
  type Prospect,
  type Etape,
  type Segment,
  type Capacite,
} from "@/lib/pipeline";

type Form = {
  nom: string;
  segment: Segment;
  etape: Etape;
  capacite: "" | Capacite;
  montant_cible: string;
  montant_obtenu: string;
  responsable: string;
  prochaine_action: string;
  prochaine_action_date: string;
  notes: string;
};

const vide: Form = {
  nom: "", segment: "particulier", etape: "identifie", capacite: "",
  montant_cible: "", montant_obtenu: "", responsable: "",
  prochaine_action: "", prochaine_action_date: "", notes: "",
};

const eur = (s: string) => Number((s.trim() || "0").replace(/\s/g, "").replace(",", ".")) || 0;

export default function GestionPipeline({ prospects }: { prospects: Prospect[] }) {
  const router = useRouter();
  const today = todayISO();
  const [edit, setEdit] = useState<Prospect | "nouveau" | null>(null);
  const [form, setForm] = useState<Form>(vide);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [fEtape, setFEtape] = useState<"" | Etape>("");
  const [fSegment, setFSegment] = useState<"" | Segment>("");

  const filtres = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return prospects.filter(
      (p) =>
        (!ql || p.nom.toLowerCase().includes(ql) || (p.responsable ?? "").toLowerCase().includes(ql)) &&
        (!fEtape || p.etape === fEtape) &&
        (!fSegment || p.segment === fSegment),
    );
  }, [prospects, q, fEtape, fSegment]);

  // Analyse (sur la sélection filtrée).
  const actifs = filtres.filter((p) => p.etape !== "perdu");
  const totalCible = actifs.reduce((s, p) => s + Number(p.montant_cible ?? 0), 0);
  const totalObtenu = filtres.reduce((s, p) => s + Number(p.montant_obtenu ?? 0), 0);
  const dans7j = actifs.filter(
    (p) => p.prochaine_action_date && p.prochaine_action_date <= addJours(today, 7),
  ).length;

  // Répartition par étape (pour la barre de progression du pipeline).
  const parEtape = ETAPES.map((e) => ({ ...e, n: filtres.filter((p) => p.etape === e.key).length }));
  const maxEtape = Math.max(1, ...parEtape.map((e) => e.n));

  function ouvrir(p: Prospect | "nouveau") {
    setError(null);
    if (p === "nouveau") setForm(vide);
    else
      setForm({
        nom: p.nom, segment: p.segment, etape: p.etape, capacite: p.capacite ?? "",
        montant_cible: p.montant_cible != null ? String(p.montant_cible).replace(".", ",") : "",
        montant_obtenu: p.montant_obtenu ? String(p.montant_obtenu).replace(".", ",") : "",
        responsable: p.responsable ?? "", prochaine_action: p.prochaine_action ?? "",
        prochaine_action_date: p.prochaine_action_date ?? "", notes: p.notes ?? "",
      });
    setEdit(p);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (!form.nom.trim()) return setError("Le nom est obligatoire.");
    setSaving(true);
    const supabase = createClient();
    const payload = {
      nom: form.nom.trim(),
      segment: form.segment,
      etape: form.etape,
      capacite: form.capacite || null,
      montant_cible: form.montant_cible.trim() ? eur(form.montant_cible) : null,
      montant_obtenu: eur(form.montant_obtenu),
      responsable: form.responsable.trim() || null,
      prochaine_action: form.prochaine_action.trim() || null,
      prochaine_action_date: form.prochaine_action_date || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("prospects").insert(payload)
        : await supabase.from("prospects").update(payload).eq("id", (edit as Prospect).id);
    setSaving(false);
    if (err) return setError("Enregistrement impossible : " + err.message);
    setEdit(null);
    router.refresh();
  }

  async function avancer(p: Prospect) {
    const suite = etapeSuivante(p.etape);
    if (!suite) return;
    setBusy(p.id);
    const supabase = createClient();
    await supabase.from("prospects").update({ etape: suite, updated_at: new Date().toISOString() }).eq("id", p.id);
    setBusy(null);
    router.refresh();
  }

  async function supprimer(p: Prospect) {
    if (!confirm(`Supprimer « ${p.nom} » du pipeline ?`)) return;
    setBusy(p.id);
    const supabase = createClient();
    await supabase.from("prospects").delete().eq("id", p.id);
    setBusy(null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Analyse */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile label="Prospects actifs" valeur={String(actifs.length)} />
        <Tuile label="Objectif (cible)" valeur={formatEuros(totalCible)} />
        <Tuile label="Déjà obtenu" valeur={formatEuros(totalObtenu)} accent="positive" />
        <Tuile label="Actions ≤ 7 jours" valeur={String(dans7j)} accent={dans7j > 0 ? "gold" : "muted"} />
      </div>

      {/* Progression du pipeline par étape */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-end gap-1.5" style={{ height: 84 }}>
          {parEtape.map((e) => (
            <button
              key={e.key}
              type="button"
              onClick={() => setFEtape(fEtape === e.key ? "" : e.key)}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${e.label} : ${e.n}`}
            >
              <div className="flex w-full flex-1 items-end">
                <div
                  className={`w-full rounded-t ${fEtape === e.key ? "bg-accent" : "bg-accent/40"}`}
                  style={{ height: `${Math.max(4, (e.n / maxEtape) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-medium tabular-nums">{e.n}</span>
              <span className="text-[9px] text-muted">{e.court}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (nom, responsable)…"
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select value={fSegment} onChange={(e) => setFSegment(e.target.value as "" | Segment)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">Tous segments</option>
          {Object.entries(SEGMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fEtape} onChange={(e) => setFEtape(e.target.value as "" | Etape)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">Toutes étapes</option>
          {Object.entries(ETAPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {(q || fEtape || fSegment) && (
          <button type="button" onClick={() => { setQ(""); setFEtape(""); setFSegment(""); }} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
            Réinitialiser
          </button>
        )}
        <button type="button" onClick={() => ouvrir("nouveau")} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90">
          + Ajouter un prospect
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Prospect</th>
              <th className="px-4 py-3 font-medium">Étape</th>
              <th className="px-4 py-3 font-medium">Responsable</th>
              <th className="px-4 py-3 font-medium">Prochaine action</th>
              <th className="px-4 py-3 text-right font-medium">Cible</th>
              <th className="px-4 py-3 text-right font-medium">Obtenu</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtres.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">Aucun prospect. Commencez par « Ajouter un prospect ».</td></tr>
            ) : (
              filtres.map((p) => {
                const suite = etapeSuivante(p.etape);
                const retard = p.prochaine_action_date && p.prochaine_action_date < today;
                return (
                  <tr key={p.id} className={`border-b border-border last:border-0 ${p.etape === "perdu" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.nom}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span>{SEGMENT_LABEL[p.segment]}</span>
                        {p.capacite && <span className="rounded bg-surface-2 px-1.5 py-0.5" title={CAPACITE_LABEL[p.capacite]}>{p.capacite}</span>}
                        <span className="text-muted/70">{SEGMENT_POTENTIEL[p.segment]}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{ETAPE_LABEL[p.etape]}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{p.responsable ?? "—"}</td>
                    <td className="px-4 py-3">
                      {p.prochaine_action ? (
                        <div className="text-xs">
                          <div>{p.prochaine_action}</div>
                          {p.prochaine_action_date && (
                            <div className={retard ? "font-medium text-negative" : "text-muted"}>
                              {retard ? "en retard · " : ""}{formatDate(p.prochaine_action_date)}
                            </div>
                          )}
                        </div>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{p.montant_cible != null ? formatEuros(Number(p.montant_cible)) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-positive">{p.montant_obtenu ? formatEuros(Number(p.montant_obtenu)) : "—"}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {suite && (
                        <button type="button" onClick={() => avancer(p)} disabled={busy === p.id} className="text-accent hover:underline disabled:opacity-50" title={`→ ${ETAPE_LABEL[suite]}`}>
                          Avancer
                        </button>
                      )}
                      <button type="button" onClick={() => ouvrir(p)} className="ml-3 text-muted hover:underline">Modifier</button>
                      <button type="button" onClick={() => supprimer(p)} disabled={busy === p.id} className="ml-3 text-muted hover:underline disabled:opacity-50">Suppr.</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit === "nouveau" ? "Nouveau prospect" : "Modifier le prospect"} onClose={() => setEdit(null)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Nom / raison sociale">
              <input type="text" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className={inputCls} placeholder="Ex. M. et Mme X, Fondation Y, Entreprise Z" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Segment">
                <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value as Segment })} className={inputCls}>
                  {Object.entries(SEGMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Capacité">
                <select value={form.capacite} onChange={(e) => setForm({ ...form, capacite: e.target.value as "" | Capacite })} className={inputCls}>
                  <option value="">— non estimée —</option>
                  {Object.entries(CAPACITE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Étape">
                <select value={form.etape} onChange={(e) => setForm({ ...form, etape: e.target.value as Etape })} className={inputCls}>
                  {Object.entries(ETAPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Responsable (comité)">
                <input type="text" value={form.responsable} onChange={(e) => setForm({ ...form, responsable: e.target.value })} className={inputCls} placeholder="Qui suit ce prospect" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant cible (€)">
                <input type="text" inputMode="decimal" value={form.montant_cible} onChange={(e) => setForm({ ...form, montant_cible: e.target.value })} className={inputCls} placeholder="0,00" />
              </Field>
              <Field label="Montant obtenu (€)">
                <input type="text" inputMode="decimal" value={form.montant_obtenu} onChange={(e) => setForm({ ...form, montant_obtenu: e.target.value })} className={inputCls} placeholder="0,00" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prochaine action">
                <input type="text" value={form.prochaine_action} onChange={(e) => setForm({ ...form, prochaine_action: e.target.value })} className={inputCls} placeholder="Ex. Appeler, envoyer le dossier…" />
              </Field>
              <Field label="Échéance de l'action">
                <input type="date" value={form.prochaine_action_date} onChange={(e) => setForm({ ...form, prochaine_action_date: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Notes">
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} rows={2} placeholder="Motivations, historique, points d'attention…" />
            </Field>
            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Tuile({ label, valeur, accent = "default" }: { label: string; valeur: string; accent?: "default" | "positive" | "gold" | "muted" }) {
  const col = accent === "positive" ? "text-positive" : accent === "gold" ? "text-gold" : accent === "muted" ? "text-muted" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${col}`}>{valeur}</div>
    </div>
  );
}

function addJours(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

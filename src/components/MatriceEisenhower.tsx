"use client";

import { useState } from "react";
import { formatDate, todayISO } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "@/components/GestionComptes";
import {
  QUADRANTS,
  NON_CLASSE,
  quadrantDe,
  axesDe,
  type Tache,
  type QuadrantKey,
} from "@/lib/taches";

type TachePatch = Pick<Tache, "titre" | "description" | "urgent" | "important" | "date_echeance">;

type FormState = {
  titre: string;
  description: string;
  quadrant: QuadrantKey;
  date_echeance: string;
};

export default function MatriceEisenhower({
  taches,
  onSave,
  onMove,
  onToggleFait,
  onDelete,
}: {
  taches: Tache[];
  onSave: (patch: TachePatch, id: string | null) => void | Promise<void>;
  onMove: (id: string, urgent: boolean | null, important: boolean | null) => void | Promise<void>;
  onToggleFait: (t: Tache) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}) {
  const today = todayISO();
  const [edit, setEdit] = useState<Tache | "nouveau" | null>(null);
  const [form, setForm] = useState<FormState>({ titre: "", description: "", quadrant: "non_classe", date_echeance: "" });
  const [erreur, setErreur] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<QuadrantKey | null>(null);

  const parQuadrant = (key: QuadrantKey) => taches.filter((t) => quadrantDe(t) === key);

  function ouvrirNouveau(quadrant: QuadrantKey) {
    setErreur(null);
    setForm({ titre: "", description: "", quadrant, date_echeance: "" });
    setEdit("nouveau");
  }
  function ouvrirEdition(t: Tache) {
    setErreur(null);
    setForm({
      titre: t.titre,
      description: t.description ?? "",
      quadrant: quadrantDe(t),
      date_echeance: t.date_echeance ?? "",
    });
    setEdit(t);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titre.trim()) return setErreur("Le titre est obligatoire.");
    const { urgent, important } = axesDe(form.quadrant);
    setSaving(true);
    await onSave(
      {
        titre: form.titre.trim(),
        description: form.description.trim() || null,
        urgent,
        important,
        date_echeance: form.date_echeance || null,
      },
      edit === "nouveau" ? null : edit!.id,
    );
    setSaving(false);
    setEdit(null);
  }

  function handleDrop(key: QuadrantKey) {
    if (!dragId) return;
    const { urgent, important } = axesDe(key);
    void onMove(dragId, urgent, important);
    setDragId(null);
    setOverKey(null);
  }

  return (
    <div className="space-y-3">
      {/* Bac de tri — non classées */}
      <Zone
        titre={NON_CLASSE.titre}
        sousTitre={NON_CLASSE.sousTitre}
        conseil={NON_CLASSE.conseil}
        bordure={NON_CLASSE.bordure}
        entete={NON_CLASSE.entete}
        actif={overKey === "non_classe"}
        onDragOver={(e) => { e.preventDefault(); setOverKey("non_classe"); }}
        onDragLeave={() => setOverKey((k) => (k === "non_classe" ? null : k))}
        onDrop={() => handleDrop("non_classe")}
        onClickVide={() => ouvrirNouveau("non_classe")}
        compact
      >
        {parQuadrant("non_classe").map((t) => (
          <Carte key={t.id} t={t} today={today} onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
            onOpen={() => ouvrirEdition(t)} onToggle={() => onToggleFait(t)} onDelete={() => onDelete(t.id)} />
        ))}
      </Zone>

      {/* Entêtes de colonnes (desktop) */}
      <div className="hidden gap-3 px-1 md:grid md:grid-cols-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Urgent</span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Pas urgent</span>
      </div>

      {/* Les 4 cadrans */}
      <div className="grid gap-3 md:grid-cols-2">
        {QUADRANTS.map((q) => (
          <Zone
            key={q.key}
            titre={q.titre}
            sousTitre={q.sousTitre}
            conseil={q.conseil}
            bordure={q.bordure}
            entete={q.entete}
            actif={overKey === q.key}
            onDragOver={(e) => { e.preventDefault(); setOverKey(q.key); }}
            onDragLeave={() => setOverKey((k) => (k === q.key ? null : k))}
            onDrop={() => handleDrop(q.key)}
            onClickVide={() => ouvrirNouveau(q.key)}
          >
            {parQuadrant(q.key).map((t) => (
              <Carte key={t.id} t={t} today={today} onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
                onOpen={() => ouvrirEdition(t)} onToggle={() => onToggleFait(t)} onDelete={() => onDelete(t.id)} />
            ))}
          </Zone>
        ))}
      </div>

      <p className="text-xs text-muted">
        Glissez une tâche d&apos;un cadran à l&apos;autre. Cliquez dans le vide d&apos;un cadran pour y créer une tâche.
      </p>

      {edit && (
        <Modal title={edit === "nouveau" ? "Nouvelle tâche" : "Modifier la tâche"} onClose={() => setEdit(null)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Titre">
              <input type="text" required value={form.titre} onChange={(e) => setForm({ ...form, titre: e.target.value })} className={inputCls} placeholder="Ex. Préparer l'ordre du jour du CA" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cadran">
                <select value={form.quadrant} onChange={(e) => setForm({ ...form, quadrant: e.target.value as QuadrantKey })} className={inputCls}>
                  {QUADRANTS.map((q) => (
                    <option key={q.key} value={q.key}>{q.titre} — {q.sousTitre}</option>
                  ))}
                  <option value="non_classe">{NON_CLASSE.titre} — à trier</option>
                </select>
              </Field>
              <Field label="Échéance (facultatif)">
                <input type="date" value={form.date_echeance} onChange={(e) => setForm({ ...form, date_echeance: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Notes (facultatif)">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} rows={2} />
            </Field>
            {edit !== "nouveau" && (
              <button
                type="button"
                onClick={() => { onDelete(edit.id); setEdit(null); }}
                className="text-sm text-negative hover:underline"
              >
                Supprimer cette tâche
              </button>
            )}
            <FormFooter saving={saving} error={erreur} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Zone({
  titre, sousTitre, conseil, bordure, entete, actif, compact,
  onDragOver, onDragLeave, onDrop, onClickVide, children,
}: {
  titre: string; sousTitre: string; conseil: string; bordure: string; entete: string;
  actif: boolean; compact?: boolean;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: () => void;
  onClickVide: () => void; children: React.ReactNode;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border bg-surface ${bordure} ${actif ? "ring-2 ring-accent" : ""}`}>
      <div className={`flex items-center justify-between px-4 py-2 ${entete}`}>
        <div>
          <span className="text-sm font-semibold">{titre}</span>
          <span className="ml-2 text-xs opacity-80">{sousTitre}</span>
        </div>
        <span className="text-xs opacity-70">{conseil}</span>
      </div>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={(e) => { if (e.target === e.currentTarget) onClickVide(); }}
        className={`flex flex-wrap content-start gap-2 p-3 ${compact ? "min-h-[64px]" : "min-h-[150px]"} cursor-pointer`}
      >
        {children}
        <button
          type="button"
          onClick={onClickVide}
          className="h-fit rounded-lg border border-dashed border-border px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent"
        >
          + Ajouter
        </button>
      </div>
    </div>
  );
}

function Carte({
  t, today, onDragStart, onDragEnd, onOpen, onToggle, onDelete,
}: {
  t: Tache; today: string;
  onDragStart: () => void; onDragEnd: () => void;
  onOpen: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const retard = t.date_echeance && !t.fait && t.date_echeance < today;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onOpen(); }}
      className={`group w-full min-w-[9rem] flex-1 basis-[calc(50%-0.25rem)] cursor-grab rounded-lg border border-border bg-background px-3 py-2 text-sm active:cursor-grabbing ${t.fait ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={t.fait}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 shrink-0"
          title={t.fait ? "Terminée" : "Marquer terminée"}
        />
        <div className="min-w-0 flex-1">
          <div className={`break-words ${t.fait ? "line-through" : ""}`}>{t.titre}</div>
          {t.date_echeance && (
            <div className={`mt-0.5 text-xs ${retard ? "font-medium text-negative" : "text-muted"}`}>
              {retard ? "en retard · " : "échéance "}{formatDate(t.date_echeance)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="shrink-0 text-muted opacity-0 transition-opacity hover:text-negative group-hover:opacity-100"
          title="Supprimer"
          aria-label="Supprimer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

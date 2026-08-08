"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { todayISO } from "@/lib/format";

type Categorie = { id: string; nom: string; type: "recette" | "depense" };
type Compte = { id: string; nom: string };

const MODES = [
  { v: "virement", l: "Virement" },
  { v: "cheque", l: "Chèque" },
  { v: "carte", l: "Carte" },
  { v: "especes", l: "Espèces" },
  { v: "prelevement", l: "Prélèvement" },
  { v: "autre", l: "Autre" },
];

export default function NouvelleOperation({
  categories,
  comptes,
  exerciceId,
}: {
  categories: Categorie[];
  comptes: Compte[];
  exerciceId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<"recette" | "depense">("depense");
  const [date, setDate] = useState(todayISO());
  const [libelle, setLibelle] = useState("");
  const [montant, setMontant] = useState("");
  const [categorieId, setCategorieId] = useState("");
  const [compteId, setCompteId] = useState(comptes[0]?.id ?? "");
  const [mode, setMode] = useState("");
  const [notes, setNotes] = useState("");

  const cats = categories.filter((c) => c.type === type);

  function reset() {
    setType("depense");
    setDate(todayISO());
    setLibelle("");
    setMontant("");
    setCategorieId("");
    setCompteId(comptes[0]?.id ?? "");
    setMode("");
    setNotes("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const montantNum = Number(montant.replace(",", "."));
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      setError("Montant invalide.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("operations").insert({
      date_operation: date,
      libelle: libelle.trim(),
      montant: montantNum,
      type,
      categorie_id: categorieId || null,
      compte_id: compteId || null,
      exercice_id: exerciceId,
      mode_paiement: mode || null,
      notes: notes.trim() || null,
    });

    if (error) {
      setError("Enregistrement impossible : " + error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
      >
        + Nouvelle opération
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Nouvelle opération</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setType("depense");
                    setCategorieId("");
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    type === "depense"
                      ? "border-negative bg-negative/10 text-negative"
                      : "border-border text-muted"
                  }`}
                >
                  Dépense
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setType("recette");
                    setCategorieId("");
                  }}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    type === "recette"
                      ? "border-positive bg-positive/10 text-positive"
                      : "border-border text-muted"
                  }`}
                >
                  Recette
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Montant (€)">
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder="0,00"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Libellé">
                <input
                  type="text"
                  required
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  className={inputCls}
                  placeholder="Ex. Facture EDF, Don de M. Dupont…"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Catégorie">
                  <select
                    value={categorieId}
                    onChange={(e) => setCategorieId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Compte">
                  <select
                    value={compteId}
                    onChange={(e) => setCompteId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {comptes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nom}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Mode de paiement">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {MODES.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.l}
                    </option>
                  ))}
                </select>
              </Field>

              {error && (
                <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

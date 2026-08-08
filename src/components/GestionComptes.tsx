"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros } from "@/lib/format";

type Compte = {
  id: string;
  nom: string;
  type: string;
  solde_initial: number;
  ordre: number;
  archive: boolean;
};

const TYPES = [
  { v: "courant", l: "Compte courant" },
  { v: "epargne", l: "Épargne" },
  { v: "especes", l: "Espèces" },
  { v: "autre", l: "Autre" },
];

const typeLabel = (v: string) => TYPES.find((t) => t.v === v)?.l ?? v;

export default function GestionComptes({ comptes }: { comptes: Compte[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Compte | "nouveau" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nom, setNom] = useState("");
  const [type, setType] = useState("courant");
  const [solde, setSolde] = useState("");

  function ouvrir(c: Compte | "nouveau") {
    setError(null);
    if (c === "nouveau") {
      setNom("");
      setType("courant");
      setSolde("");
    } else {
      setNom(c.nom);
      setType(c.type);
      setSolde(String(c.solde_initial).replace(".", ","));
    }
    setEdit(c);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const soldeNum = Number((solde.trim() || "0").replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(soldeNum)) {
      setError("Solde initial invalide.");
      return;
    }
    if (!nom.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = { nom: nom.trim(), type, solde_initial: soldeNum };
    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("comptes").insert({ ...payload, ordre: comptes.length })
        : await supabase.from("comptes").update(payload).eq("id", (edit as Compte).id);

    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  async function toggleArchive(c: Compte) {
    const supabase = createClient();
    await supabase.from("comptes").update({ archive: !c.archive }).eq("id", c.id);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Comptes</h2>
        <button
          type="button"
          onClick={() => ouvrir("nouveau")}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          + Ajouter un compte
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">Solde initial</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {comptes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Aucun compte.
                </td>
              </tr>
            ) : (
              comptes.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border last:border-0 ${c.archive ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-3">
                    {c.nom}
                    {c.archive && <span className="ml-2 text-xs text-muted">(archivé)</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{typeLabel(c.type)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatEuros(Number(c.solde_initial))}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => ouvrir(c)}
                      className="text-accent hover:underline"
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleArchive(c)}
                      className="ml-4 text-muted hover:underline"
                    >
                      {c.archive ? "Réactiver" : "Archiver"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={edit === "nouveau" ? "Nouveau compte" : "Modifier le compte"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nom">
              <input
                type="text"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className={inputCls}
                placeholder="Ex. Compte courant"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
                  {TYPES.map((t) => (
                    <option key={t.v} value={t.v}>
                      {t.l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Solde initial (€)">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={solde}
                  onChange={(e) => setSolde(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </section>
  );
}

// --- UI partagée ---
export const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-foreground" aria-label="Fermer">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormFooter({
  saving,
  error,
  onCancel,
}: {
  saving: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  return (
    <>
      {error && (
        <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
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
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Categorie = { id: string; nom: string; type: "recette" | "depense" };

export default function EditionBudget({
  categories,
  exerciceId,
  existant,
}: {
  categories: Categorie[];
  exerciceId: string | null;
  /** Montant prévu par catégorie déjà enregistré. */
  existant: Record<string, number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Valeur saisie (texte) par catégorie.
  const [valeurs, setValeurs] = useState<Record<string, string>>({});

  function ouvrir() {
    const init: Record<string, string> = {};
    for (const c of categories) {
      const v = existant[c.id];
      init[c.id] = v != null && v !== 0 ? String(v).replace(".", ",") : "";
    }
    setValeurs(init);
    setError(null);
    setOpen(true);
  }

  function parseMontant(s: string): number | null {
    const t = s.trim();
    if (t === "") return 0;
    const n = Number(t.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!exerciceId) return;
    setError(null);

    const aUpserter: { exercice_id: string; categorie_id: string; montant_prevu: number }[] = [];
    const aSupprimer: string[] = [];

    for (const c of categories) {
      const montant = parseMontant(valeurs[c.id] ?? "");
      if (montant === null) {
        setError(`Montant invalide pour « ${c.nom} ».`);
        return;
      }
      if (montant > 0) {
        aUpserter.push({ exercice_id: exerciceId, categorie_id: c.id, montant_prevu: montant });
      } else if (existant[c.id] != null) {
        // Ligne existante remise à zéro → on la retire.
        aSupprimer.push(c.id);
      }
    }

    setSaving(true);
    const supabase = createClient();

    if (aUpserter.length > 0) {
      const { error: upErr } = await supabase
        .from("budget_lignes")
        .upsert(aUpserter, { onConflict: "exercice_id,categorie_id" });
      if (upErr) {
        setError("Enregistrement impossible : " + upErr.message);
        setSaving(false);
        return;
      }
    }

    if (aSupprimer.length > 0) {
      const { error: delErr } = await supabase
        .from("budget_lignes")
        .delete()
        .eq("exercice_id", exerciceId)
        .in("categorie_id", aSupprimer);
      if (delErr) {
        setError("Suppression impossible : " + delErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  const recettes = categories.filter((c) => c.type === "recette");
  const depenses = categories.filter((c) => c.type === "depense");

  const totalSaisi = (rows: Categorie[]) =>
    rows.reduce((s, c) => {
      const n = parseMontant(valeurs[c.id] ?? "");
      return s + (n ?? 0);
    }, 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

  return (
    <>
      <button
        type="button"
        onClick={ouvrir}
        disabled={!exerciceId}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Modifier le budget
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold">Modifier le budget prévisionnel</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
                {[
                  { title: "Recettes", rows: recettes },
                  { title: "Dépenses", rows: depenses },
                ].map((grp) => (
                  <div key={grp.title}>
                    <div className="mb-2 flex items-baseline justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
                        {grp.title}
                      </h3>
                      <span className="text-sm tabular-nums text-muted">
                        Total prévu : {fmt(totalSaisi(grp.rows))}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {grp.rows.map((c) => (
                        <label key={c.id} className="flex items-center gap-3">
                          <span className="flex-1 text-sm">{c.nom}</span>
                          <span className="relative w-40">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0,00"
                              value={valeurs[c.id] ?? ""}
                              onChange={(e) =>
                                setValeurs((v) => ({ ...v, [c.id]: e.target.value }))
                              }
                              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 pr-7 text-right text-sm tabular-nums outline-none focus:border-accent"
                            />
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                              €
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {error && (
                <p className="mx-6 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
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
                  {saving ? "Enregistrement…" : "Enregistrer le budget"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

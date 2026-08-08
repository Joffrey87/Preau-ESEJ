"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";

type Categorie = {
  id: string;
  nom: string;
  type: "recette" | "depense";
  ordre: number;
  archive: boolean;
};

export default function GestionCategories({ categories }: { categories: Categorie[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Categorie | "nouveau" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nom, setNom] = useState("");
  const [type, setType] = useState<"recette" | "depense">("depense");

  function ouvrir(c: Categorie | "nouveau") {
    setError(null);
    if (c === "nouveau") {
      setNom("");
      setType("depense");
    } else {
      setNom(c.nom);
      setType(c.type);
    }
    setEdit(c);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = { nom: nom.trim(), type };
    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("categories").insert({ ...payload, ordre: categories.length })
        : await supabase.from("categories").update(payload).eq("id", (edit as Categorie).id);

    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  async function toggleArchive(c: Categorie) {
    const supabase = createClient();
    await supabase.from("categories").update({ archive: !c.archive }).eq("id", c.id);
    router.refresh();
  }

  const groupes = [
    { titre: "Recettes", type: "recette" as const },
    { titre: "Dépenses", type: "depense" as const },
  ];

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Catégories</h2>
        <button
          type="button"
          onClick={() => ouvrir("nouveau")}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          + Ajouter une catégorie
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {groupes.map((g) => {
          const rows = categories.filter((c) => c.type === g.type);
          return (
            <div key={g.type} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {g.titre}
              </div>
              <ul>
                {rows.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-muted">Aucune catégorie.</li>
                ) : (
                  rows.map((c) => (
                    <li
                      key={c.id}
                      className={`flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm last:border-0 ${
                        c.archive ? "opacity-50" : ""
                      }`}
                    >
                      <span className="flex-1">
                        {c.nom}
                        {c.archive && <span className="ml-2 text-xs text-muted">(archivée)</span>}
                      </span>
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
                        className="text-muted hover:underline"
                      >
                        {c.archive ? "Réactiver" : "Archiver"}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </div>

      {edit && (
        <Modal
          title={edit === "nouveau" ? "Nouvelle catégorie" : "Modifier la catégorie"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("depense")}
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
                onClick={() => setType("recette")}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  type === "recette"
                    ? "border-positive bg-positive/10 text-positive"
                    : "border-border text-muted"
                }`}
              >
                Recette
              </button>
            </div>
            <Field label="Nom">
              <input
                type="text"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className={inputCls}
                placeholder="Ex. Don, Frais de logement…"
              />
            </Field>
            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </section>
  );
}

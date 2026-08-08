"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";

type Exercice = {
  id: string;
  libelle: string;
  date_debut: string;
  date_fin: string;
  actif: boolean;
};

export default function GestionExercices({ exercices }: { exercices: Exercice[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Exercice | "nouveau" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [libelle, setLibelle] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [actif, setActif] = useState(false);

  function ouvrir(ex: Exercice | "nouveau") {
    setError(null);
    if (ex === "nouveau") {
      setLibelle("");
      setDebut("");
      setFin("");
      setActif(exercices.length === 0);
    } else {
      setLibelle(ex.libelle);
      setDebut(ex.date_debut);
      setFin(ex.date_fin);
      setActif(ex.actif);
    }
    setEdit(ex);
  }

  /** Bascule l'exercice donné en actif et désactive tous les autres. */
  async function rendreActif(id: string) {
    const supabase = createClient();
    await supabase.from("exercices").update({ actif: false }).neq("id", id);
    await supabase.from("exercices").update({ actif: true }).eq("id", id);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!libelle.trim()) {
      setError("Le libellé est obligatoire.");
      return;
    }
    if (!debut || !fin) {
      setError("Les dates de début et de fin sont obligatoires.");
      return;
    }
    if (debut >= fin) {
      setError("La date de fin doit être postérieure à la date de début.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      libelle: libelle.trim(),
      date_debut: debut,
      date_fin: fin,
      actif,
    };

    let cibleId: string | null = null;
    if (edit === "nouveau") {
      const { data, error: err } = await supabase
        .from("exercices")
        .insert(payload)
        .select("id")
        .single();
      if (err) {
        setError("Enregistrement impossible : " + err.message);
        setSaving(false);
        return;
      }
      cibleId = data.id;
    } else {
      const { error: err } = await supabase
        .from("exercices")
        .update(payload)
        .eq("id", (edit as Exercice).id);
      if (err) {
        setError("Enregistrement impossible : " + err.message);
        setSaving(false);
        return;
      }
      cibleId = (edit as Exercice).id;
    }

    // Un seul exercice actif : si celui-ci l'est, désactiver les autres.
    if (actif && cibleId) {
      await supabase.from("exercices").update({ actif: false }).neq("id", cibleId);
    }

    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Exercices</h2>
        <button
          type="button"
          onClick={() => ouvrir("nouveau")}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          + Ajouter un exercice
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Libellé</th>
              <th className="px-4 py-3 font-medium">Période</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {exercices.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Aucun exercice.
                </td>
              </tr>
            ) : (
              exercices.map((ex) => (
                <tr key={ex.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{ex.libelle}</td>
                  <td className="px-4 py-3 text-muted tabular-nums">
                    {formatDate(ex.date_debut)} → {formatDate(ex.date_fin)}
                  </td>
                  <td className="px-4 py-3">
                    {ex.actif ? (
                      <span className="rounded-full bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
                        Actif
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Clôturé</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => ouvrir(ex)}
                      className="text-accent hover:underline"
                    >
                      Modifier
                    </button>
                    {!ex.actif && (
                      <button
                        type="button"
                        onClick={() => rendreActif(ex.id)}
                        className="ml-4 text-muted hover:underline"
                      >
                        Rendre actif
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={edit === "nouveau" ? "Nouvel exercice" : "Modifier l'exercice"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Libellé">
              <input
                type="text"
                required
                value={libelle}
                onChange={(e) => setLibelle(e.target.value)}
                className={inputCls}
                placeholder="Ex. Exercice 2026-2027"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Début">
                <input
                  type="date"
                  required
                  value={debut}
                  onChange={(e) => setDebut(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="Fin">
                <input
                  type="date"
                  required
                  value={fin}
                  onChange={(e) => setFin(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={actif}
                onChange={(e) => setActif(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Exercice actif (les autres seront clôturés)
            </label>
            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </section>
  );
}

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MatriceEisenhower from "@/components/MatriceEisenhower";
import CalendrierPriorites from "@/components/CalendrierPriorites";
import type { Tache } from "@/lib/taches";
import type { Evenement } from "@/lib/evenements";

const nowISO = () => new Date().toISOString();

export default function Priorites({
  roleSlug,
  tachesInit,
  evenements: evInit,
}: {
  roleSlug: string;
  tachesInit: Tache[];
  evenements: Evenement[];
}) {
  const [vue, setVue] = useState<"matrice" | "calendrier">("matrice");
  const [taches, setTaches] = useState<Tache[]>(tachesInit);
  const [evenements, setEvenements] = useState<Evenement[]>(evInit);

  // ————— Tâches —————
  type TachePatch = Pick<Tache, "titre" | "description" | "urgent" | "important" | "date_echeance">;

  async function saveTache(patch: TachePatch, id: string | null) {
    const supabase = createClient();
    if (id) {
      setTaches((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      await supabase.from("taches").update({ ...patch, updated_at: nowISO() }).eq("id", id);
    } else {
      const ordre = taches.length;
      const { data } = await supabase
        .from("taches")
        .insert({ ...patch, role: roleSlug, fait: false, ordre })
        .select()
        .single();
      if (data) setTaches((ts) => [...ts, data as Tache]);
    }
  }

  async function moveTache(id: string, urgent: boolean | null, important: boolean | null) {
    setTaches((ts) => ts.map((t) => (t.id === id ? { ...t, urgent, important } : t)));
    await createClient().from("taches").update({ urgent, important, updated_at: nowISO() }).eq("id", id);
  }

  async function toggleFait(t: Tache) {
    setTaches((ts) => ts.map((x) => (x.id === t.id ? { ...x, fait: !x.fait } : x)));
    await createClient().from("taches").update({ fait: !t.fait, updated_at: nowISO() }).eq("id", t.id);
  }

  async function removeTache(id: string) {
    setTaches((ts) => ts.filter((t) => t.id !== id));
    await createClient().from("taches").delete().eq("id", id);
  }

  // ————— Événements —————
  type EvPatch = Pick<Evenement, "titre" | "description" | "groupe" | "date_debut" | "date_fin" | "heure" | "lieu">;

  async function saveEvenement(patch: EvPatch, id: string | null) {
    const supabase = createClient();
    if (id) {
      setEvenements((es) => es.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      await supabase.from("evenements").update({ ...patch, updated_at: nowISO() }).eq("id", id);
    } else {
      const { data } = await supabase
        .from("evenements")
        .insert({ ...patch, created_by_role: roleSlug })
        .select()
        .single();
      if (data) setEvenements((es) => [...es, data as Evenement]);
    }
  }

  async function removeEvenement(id: string) {
    setEvenements((es) => es.filter((e) => e.id !== id));
    await createClient().from("evenements").delete().eq("id", id);
  }

  return (
    <div className="space-y-4">
      {/* Bascule Matrice / Calendrier */}
      <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        <button
          type="button"
          onClick={() => setVue("matrice")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            vue === "matrice" ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
          }`}
        >
          Matrice
        </button>
        <button
          type="button"
          onClick={() => setVue("calendrier")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            vue === "calendrier" ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
          }`}
        >
          Calendrier
        </button>
      </div>

      {vue === "matrice" ? (
        <MatriceEisenhower
          taches={taches}
          onSave={saveTache}
          onMove={moveTache}
          onToggleFait={toggleFait}
          onDelete={removeTache}
        />
      ) : (
        <CalendrierPriorites
          roleSlug={roleSlug}
          taches={taches}
          evenements={evenements}
          onSaveEvenement={saveEvenement}
          onDeleteEvenement={removeEvenement}
        />
      )}
    </div>
  );
}

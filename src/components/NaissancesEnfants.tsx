"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Enfant = { id: string; prenom: string | null; date_naissance: string | null };

/**
 * Dates de naissance des enfants, modifiables par la famille. Chaque modification est appliquée tout de suite et
 * signalée à la Directrice (« À valider — Modification Famille »).
 */
export default function NaissancesEnfants({ ids, lectureSeule }: { ids: string[]; lectureSeule: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const cle = ids.join(",");

  useEffect(() => {
    if (!cle) return;
    let annule = false;
    sb.from("eleves")
      .select("id, prenom, date_naissance")
      .in("id", cle.split(","))
      .then(({ data }) => {
        if (!annule) setEnfants((data ?? []) as Enfant[]);
      });
    return () => {
      annule = true;
    };
  }, [sb, cle]);

  async function enregistrer(e: Enfant, v: string) {
    if (v === (e.date_naissance ?? "")) return;
    const { error } = await sb.rpc("famille_naissance_enfant", { p_eleve: e.id, p_naissance: v || null });
    if (error) return setMessage({ ok: false, texte: `Échec : ${error.message}` });
    setEnfants((xs) => xs.map((x) => (x.id === e.id ? { ...x, date_naissance: v || null } : x)));
    setMessage({ ok: true, texte: "Date de naissance enregistrée. L'école en est informée." });
  }

  if (!enfants.length) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold">Dates de naissance</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {enfants.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">{e.prenom}</span>
            <input
              type="date"
              key={e.date_naissance ?? ""}
              defaultValue={e.date_naissance ?? ""}
              disabled={lectureSeule}
              aria-label={`Date de naissance de ${e.prenom ?? ""}`}
              onBlur={(ev) => enregistrer(e, ev.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-60"
            />
          </li>
        ))}
      </ul>
      {message && <p className={`mt-2 text-xs ${message.ok ? "text-positive" : "text-negative"}`}>{message.texte}</p>}
    </section>
  );
}

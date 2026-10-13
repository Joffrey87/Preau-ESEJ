"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import { bouton, champ, nombre, recettes, type EvenementCaisse, type MembreEvenement } from "@/lib/evenement";
import { useEnregistrer } from "./useEnregistrer";

const vide = { nom: "", date: "", responsable_id: "", caisse_avant: "", caisse_apres: "" };

export default function ListeEvenements({
  peutModifier,
  membres,
  evenements,
}: {
  peutModifier: boolean;
  membres: MembreEvenement[];
  evenements: EvenementCaisse[];
}) {
  const supabase = createClient();
  const { erreur, occupe, executer } = useEnregistrer();
  const [ev, setEv] = useState(vide);
  const [edition, setEdition] = useState<string | null>(null);
  const libelle = (id: string | null) => membres.find((m) => m.id === id)?.libelle ?? "—";

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const ligne = {
      nom: ev.nom.trim(),
      date: ev.date,
      responsable_id: ev.responsable_id || null,
      caisse_avant: nombre(ev.caisse_avant),
      caisse_apres: nombre(ev.caisse_apres),
    };
    const ok = await executer(() =>
      edition ? supabase.from("evenements_caisse").update(ligne).eq("id", edition) : supabase.from("evenements_caisse").insert(ligne),
    );
    if (ok) {
      setEdition(null);
      setEv(vide);
    }
  }

  return (
    <div className="space-y-6">
      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      {peutModifier && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">{edition ? "Modifier l'événement" : "Nouvel événement"}</h2>
          <form onSubmit={enregistrer} className="grid gap-3 sm:grid-cols-2">
            <input required placeholder="Nom de l'événement" value={ev.nom} onChange={(e) => setEv({ ...ev, nom: e.target.value })} className={champ} />
            <input required type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} className={champ} />
            <select value={ev.responsable_id} onChange={(e) => setEv({ ...ev, responsable_id: e.target.value })} className={champ}>
              <option value="">Responsable de caisse…</option>
              {membres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.libelle}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input inputMode="decimal" placeholder="Caisse avant (€)" value={ev.caisse_avant} onChange={(e) => setEv({ ...ev, caisse_avant: e.target.value })} className={champ} />
              <input inputMode="decimal" placeholder="Caisse après (€)" value={ev.caisse_apres} onChange={(e) => setEv({ ...ev, caisse_apres: e.target.value })} className={champ} />
            </div>
            <div className="flex gap-3 sm:col-span-2">
              <button type="submit" disabled={occupe} className={bouton}>
                {edition ? "Enregistrer" : "Ajouter"}
              </button>
              {edition && (
                <button
                  type="button"
                  onClick={() => {
                    setEdition(null);
                    setEv(vide);
                  }}
                  className="text-sm text-muted hover:underline"
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
        </section>
      )}

      <section className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Événement</th>
              <th className="px-4 py-2">Responsable de caisse</th>
              <th className="px-4 py-2 text-right">Caisse avant</th>
              <th className="px-4 py-2 text-right">Caisse après</th>
              <th className="px-4 py-2 text-right">Recettes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {evenements.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  Aucun événement pour l&apos;instant.
                </td>
              </tr>
            )}
            {evenements.map((e) => {
              const r = recettes(e);
              return (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-2">{formatDate(e.date)}</td>
                  <td className="px-4 py-2 font-medium">{e.nom}</td>
                  <td className="px-4 py-2">{libelle(e.responsable_id)}</td>
                  <td className="px-4 py-2 text-right">{e.caisse_avant == null ? "—" : formatEuros(Number(e.caisse_avant))}</td>
                  <td className="px-4 py-2 text-right">{e.caisse_apres == null ? "—" : formatEuros(Number(e.caisse_apres))}</td>
                  <td className="px-4 py-2 text-right font-semibold">{r == null ? "—" : formatEuros(r)}</td>
                  <td className="px-4 py-2 text-right">
                    {peutModifier && (
                      <button
                        type="button"
                        onClick={() => {
                          setEdition(e.id);
                          setEv({
                            nom: e.nom,
                            date: e.date,
                            responsable_id: e.responsable_id ?? "",
                            caisse_avant: e.caisse_avant == null ? "" : String(e.caisse_avant),
                            caisse_apres: e.caisse_apres == null ? "" : String(e.caisse_apres),
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="text-accent hover:underline"
                      >
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

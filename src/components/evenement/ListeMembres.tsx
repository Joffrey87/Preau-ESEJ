"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { bouton, champ, type MembreEvenement } from "@/lib/evenement";
import { useEnregistrer } from "./useEnregistrer";

export default function ListeMembres({ peutModifier, membres }: { peutModifier: boolean; membres: MembreEvenement[] }) {
  const supabase = createClient();
  const { erreur, occupe, executer } = useEnregistrer();
  const [modif, setModif] = useState<{ id: string; nom: string; courriel: string } | null>(null);
  const [mb, setMb] = useState({ prenom: "", nom: "", courriel: "" });
  const [info, setInfo] = useState<string | null>(null);

  async function enregistrerMembre(e: React.FormEvent) {
    e.preventDefault();
    if (!modif) return;
    const ok = await executer(() =>
      supabase.rpc("modifier_membre_evenement", { p_id: modif.id, p_nom: modif.nom, p_courriel: modif.courriel }),
    );
    if (ok) setModif(null);
  }

  async function ajouterMembre(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    const ok = await executer(() =>
      supabase.rpc("ajouter_membre_evenement", { p_prenom: mb.prenom, p_nom: mb.nom, p_courriel: mb.courriel }),
    );
    if (ok) {
      setInfo(`Compte créé : ${mb.prenom} se connecte avec le bouton « Événement », son prénom et le mot de passe « ${mb.prenom.toLowerCase()} ».`);
      setMb({ prenom: "", nom: "", courriel: "" });
    }
  }

  return (
    <div className="space-y-6">
      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      <section className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2">Prénom</th>
              <th className="px-4 py-2">Nom</th>
              <th className="px-4 py-2">Courriel</th>
              <th className="px-4 py-2">Famille</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {membres.map((m) =>
              modif?.id === m.id ? (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{m.libelle}</td>
                  <td className="px-4 py-2">
                    <input placeholder="Nom" value={modif.nom} onChange={(e) => setModif({ ...modif, nom: e.target.value })} className={champ} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="email" placeholder="Courriel (facultatif)" value={modif.courriel} onChange={(e) => setModif({ ...modif, courriel: e.target.value })} className={champ} />
                  </td>
                  <td className="px-4 py-2" />
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <form onSubmit={enregistrerMembre} className="inline">
                      <button type="submit" disabled={occupe} className={bouton}>
                        Enregistrer
                      </button>
                    </form>
                    <button type="button" onClick={() => setModif(null)} className="ml-2 text-sm text-muted hover:underline">
                      Annuler
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{m.libelle}</td>
                  <td className="px-4 py-2">{m.nom ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{m.courriel ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">
                    {m.famille ? `${m.famille.nom}${m.famille.membre_recherche ? ` (Recherche de fonds : ${m.famille.membre_recherche})` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {peutModifier && (
                      <button
                        type="button"
                        onClick={() => setModif({ id: m.id, nom: m.nom ?? "", courriel: m.courriel ?? "" })}
                        className="text-accent hover:underline"
                      >
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>

      {peutModifier && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Ajouter un membre</h2>
          <form onSubmit={ajouterMembre} className="grid gap-3 sm:grid-cols-4">
            <input required placeholder="Prénom" value={mb.prenom} onChange={(e) => setMb({ ...mb, prenom: e.target.value })} className={champ} />
            <input required placeholder="Nom" value={mb.nom} onChange={(e) => setMb({ ...mb, nom: e.target.value })} className={champ} />
            <input required type="email" placeholder="Courriel" value={mb.courriel} onChange={(e) => setMb({ ...mb, courriel: e.target.value })} className={champ} />
            <button type="submit" disabled={occupe} className={bouton}>
              Ajouter
            </button>
          </form>
          {info && <p className="mt-3 rounded-lg bg-positive/10 px-3 py-2 text-sm text-positive">{info}</p>}
        </section>
      )}
    </div>
  );
}

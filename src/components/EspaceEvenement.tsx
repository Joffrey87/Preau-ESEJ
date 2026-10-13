"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";

export type MembreEvenement = { id: string; libelle: string; prenom: string; nom: string | null; courriel: string | null };
export type EvenementCaisse = {
  id: string;
  nom: string;
  date: string;
  responsable_id: string | null;
  caisse_avant: number | null;
  caisse_apres: number | null;
};

const champ = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const bouton = "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
const nombre = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

/** Recettes d'un événement : caisse après moins caisse avant (null tant que l'une manque). */
export const recettes = (e: EvenementCaisse) =>
  e.caisse_avant == null || e.caisse_apres == null ? null : Number(e.caisse_apres) - Number(e.caisse_avant);

export default function EspaceEvenement({
  prenom,
  membres,
  evenements,
}: {
  prenom: string | null;
  membres: MembreEvenement[];
  evenements: EvenementCaisse[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [ev, setEv] = useState({ nom: "", date: "", responsable_id: "", caisse_avant: "", caisse_apres: "" });
  const [edition, setEdition] = useState<string | null>(null);
  const [mb, setMb] = useState({ prenom: "", nom: "", courriel: "" });
  const [info, setInfo] = useState<string | null>(null);
  const libelle = (id: string | null) => membres.find((m) => m.id === id)?.libelle ?? "—";

  async function executer(f: () => PromiseLike<{ error: { message: string } | null }>) {
    setErreur(null);
    setOccupe(true);
    const { error } = await f();
    setOccupe(false);
    if (error) {
      setErreur(error.message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function enregistrerEvenement(e: React.FormEvent) {
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
      setEv({ nom: "", date: "", responsable_id: "", caisse_avant: "", caisse_apres: "" });
    }
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

  async function deconnexion() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Événements</h1>
          {prenom && <p className="text-sm text-muted">Bonjour {prenom}</p>}
        </div>
        <button type="button" onClick={deconnexion} className="text-sm text-accent hover:underline">
          Se déconnecter
        </button>
      </header>

      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">{edition ? "Modifier l'événement" : "Nouvel événement"}</h2>
        <form onSubmit={enregistrerEvenement} className="grid gap-3 sm:grid-cols-2">
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
                  setEv({ nom: "", date: "", responsable_id: "", caisse_avant: "", caisse_apres: "" });
                }}
                className="text-sm text-muted hover:underline"
              >
                Annuler
              </button>
            )}
          </div>
        </form>
      </section>

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
                      }}
                      className="text-accent hover:underline"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">Membres</h2>
        <ul className="mb-4 grid gap-1 text-sm sm:grid-cols-2">
          {membres.map((m) => (
            <li key={m.id}>
              <span className="font-medium">{m.libelle}</span>
              {m.nom && <span> {m.nom}</span>}
              {m.courriel && <span className="text-muted"> · {m.courriel}</span>}
            </li>
          ))}
        </ul>
        <form onSubmit={ajouterMembre} className="grid gap-3 sm:grid-cols-4">
          <input required placeholder="Prénom" value={mb.prenom} onChange={(e) => setMb({ ...mb, prenom: e.target.value })} className={champ} />
          <input required placeholder="Nom" value={mb.nom} onChange={(e) => setMb({ ...mb, nom: e.target.value })} className={champ} />
          <input required type="email" placeholder="Courriel" value={mb.courriel} onChange={(e) => setMb({ ...mb, courriel: e.target.value })} className={champ} />
          <button type="submit" disabled={occupe} className={bouton}>
            Ajouter un membre
          </button>
        </form>
        {info && <p className="mt-3 rounded-lg bg-positive/10 px-3 py-2 text-sm text-positive">{info}</p>}
      </section>
    </main>
  );
}

"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import {
  BUCKET_FACTURES,
  STATUTS_FACTURE,
  bouton,
  champ,
  libelleStatut,
  nomContact,
  nombre,
  type ContactEvenement,
  type EvenementCaisse,
  type FactureFournisseur,
} from "@/lib/evenement";
import { useEnregistrer } from "./useEnregistrer";

const vide = { fournisseur_id: "", montant: "", date: "", numero: "", evenement_id: "", statut: "pas_importee", notes: "" };
type Candidate = { id: string; date_operation: string; libelle: string; montant: number };

/**
 * Factures fournisseurs (profil Événement ; réutilisable côté Trésorier). `fournisseurFixe` : fiche d'un fournisseur.
 * « Payée » n'est jamais choisi à la main : la base le pose quand le Trésorier relie l'opération bancaire.
 */
export default function FacturesFournisseurs({
  peutModifier,
  estTresorier,
  factures,
  fournisseurs,
  evenements,
  fournisseurFixe,
}: {
  peutModifier: boolean;
  estTresorier: boolean;
  factures: FactureFournisseur[];
  fournisseurs: ContactEvenement[];
  evenements: Pick<EvenementCaisse, "id" | "nom" | "date">[];
  fournisseurFixe?: string;
}) {
  const supabase = createClient();
  const { erreur, setErreur, occupe, executer } = useEnregistrer();
  const [f, setF] = useState({ ...vide, fournisseur_id: fournisseurFixe ?? "" });
  const [fichier, setFichier] = useState<File | null>(null);
  const [edition, setEdition] = useState<FactureFournisseur | null>(null);
  const [candidates, setCandidates] = useState<{ facture: string; ops: Candidate[] } | null>(null);
  const nomF = (id: string) => {
    const c = fournisseurs.find((x) => x.id === id);
    return c ? nomContact(c) : "—";
  };
  const nomEv = (id: string | null) => evenements.find((e) => e.id === id)?.nom ?? "—";

  function reinitialiser() {
    setEdition(null);
    setFichier(null);
    setF({ ...vide, fournisseur_id: fournisseurFixe ?? "" });
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    let chemin = edition?.fichier ?? null;
    if (fichier) {
      const ext = fichier.name.split(".").pop()?.toLowerCase() ?? "pdf";
      chemin = `${f.fournisseur_id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_FACTURES).upload(chemin, fichier, { contentType: fichier.type });
      if (error) return setErreur(`Fichier non envoyé : ${error.message}`);
    }
    const ligne = {
      fournisseur_id: f.fournisseur_id,
      montant: nombre(f.montant),
      date: f.date,
      numero: f.numero.trim() || null,
      evenement_id: f.evenement_id || null,
      fichier: chemin,
      notes: f.notes.trim() || null,
      ...(edition?.statut === "payee" ? {} : { statut: f.statut }),
    };
    const ok = await executer(() =>
      edition
        ? supabase.from("factures_fournisseurs").update(ligne).eq("id", edition.id)
        : supabase.from("factures_fournisseurs").insert(ligne),
    );
    if (ok) reinitialiser();
  }

  async function ouvrir(chemin: string) {
    const { data, error } = await supabase.storage.from(BUCKET_FACTURES).createSignedUrl(chemin, 120);
    if (error || !data) return setErreur("Fichier introuvable.");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function chercherOperations(facture: string) {
    const { data, error } = await supabase.rpc("operations_candidates_facture", { p_facture: facture });
    if (error) return setErreur(error.message);
    setCandidates({ facture, ops: (data ?? []) as Candidate[] });
  }

  async function lier(facture: string, operation: string | null) {
    const ok = await executer(() => supabase.from("factures_fournisseurs").update({ operation_id: operation }).eq("id", facture));
    if (ok) setCandidates(null);
  }

  return (
    <div className="space-y-6">
      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      {peutModifier && (
        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">{edition ? "Modifier la facture" : "Nouvelle facture"}</h2>
          {fournisseurs.length === 0 ? (
            <p className="text-sm text-muted">Ajoutez d&apos;abord un fournisseur dans le Carnet d&apos;adresses.</p>
          ) : (
            <form onSubmit={enregistrer} className="grid gap-3 sm:grid-cols-3">
              {!fournisseurFixe && (
                <select required value={f.fournisseur_id} onChange={(e) => setF({ ...f, fournisseur_id: e.target.value })} className={champ}>
                  <option value="">Fournisseur…</option>
                  {fournisseurs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomContact(c)}
                    </option>
                  ))}
                </select>
              )}
              <input required inputMode="decimal" placeholder="Montant TTC (€)" value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value })} className={champ} />
              <input required type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={champ} />
              <input placeholder="N° de facture (facultatif)" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} className={champ} />
              <select value={f.evenement_id} onChange={(e) => setF({ ...f, evenement_id: e.target.value })} className={champ}>
                <option value="">Événement (facultatif)…</option>
                {evenements.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.nom} · {formatDate(ev.date)}
                  </option>
                ))}
              </select>
              {edition?.statut === "payee" ? (
                <p className="self-center text-sm text-positive">Payée (opération bancaire liée)</p>
              ) : (
                <select value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })} className={champ}>
                  {STATUTS_FACTURE.filter((s) => s.v !== "payee").map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
              )}
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className="text-sm sm:col-span-2" />
              <input placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={champ} />
              <div className="flex gap-3 sm:col-span-3">
                <button type="submit" disabled={occupe} className={bouton}>
                  {edition ? "Enregistrer" : "Ajouter"}
                </button>
                {edition && (
                  <button type="button" onClick={reinitialiser} className="text-sm text-muted hover:underline">
                    Annuler
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      )}

      <section className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2">Date</th>
              {!fournisseurFixe && <th className="px-4 py-2">Fournisseur</th>}
              <th className="px-4 py-2">N°</th>
              <th className="px-4 py-2">Événement</th>
              <th className="px-4 py-2 text-right">Montant</th>
              <th className="px-4 py-2">Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {factures.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  Aucune facture.
                </td>
              </tr>
            )}
            {factures.map((x) => {
              const st = libelleStatut(x.statut);
              return (
                <tr key={x.id} className="border-t border-border align-top">
                  <td className="px-4 py-2">{formatDate(x.date)}</td>
                  {!fournisseurFixe && <td className="px-4 py-2 font-medium">{nomF(x.fournisseur_id)}</td>}
                  <td className="px-4 py-2">{x.numero ?? "—"}</td>
                  <td className="px-4 py-2">{nomEv(x.evenement_id)}</td>
                  <td className="px-4 py-2 text-right">{formatEuros(Number(x.montant))}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${st?.cls ?? ""}`}>{st?.l ?? x.statut}</span>
                  </td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-2 text-right">
                    {x.fichier && (
                      <button type="button" onClick={() => ouvrir(x.fichier!)} className="text-accent hover:underline">
                        Fichier
                      </button>
                    )}
                    {peutModifier && (
                      <button
                        type="button"
                        onClick={() => {
                          setEdition(x);
                          setFichier(null);
                          setF({
                            fournisseur_id: x.fournisseur_id,
                            montant: String(x.montant),
                            date: x.date,
                            numero: x.numero ?? "",
                            evenement_id: x.evenement_id ?? "",
                            statut: x.statut,
                            notes: x.notes ?? "",
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="text-accent hover:underline"
                      >
                        Modifier
                      </button>
                    )}
                    {estTresorier &&
                      (x.operation_id ? (
                        <button type="button" onClick={() => lier(x.id, null)} className="text-muted hover:underline">
                          Délier l&apos;opération
                        </button>
                      ) : (
                        <button type="button" onClick={() => chercherOperations(x.id)} className="text-accent hover:underline">
                          Lier une opération
                        </button>
                      ))}
                    {candidates?.facture === x.id && (
                      <div className="mt-2 space-y-1 text-left">
                        {candidates.ops.length === 0 && <p className="text-xs text-muted">Aucun débit de ce montant à ±45 jours.</p>}
                        {candidates.ops.map((o) => (
                          <button key={o.id} type="button" onClick={() => lier(x.id, o.id)} className="block w-full rounded border border-border px-2 py-1 text-left text-xs hover:bg-surface-2">
                            {formatDate(o.date_operation)} · {o.libelle} · −{formatEuros(Number(o.montant))}
                          </button>
                        ))}
                      </div>
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

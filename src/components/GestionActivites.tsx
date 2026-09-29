"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEurosCourt as formatEuros, formatDate, todayISO } from "@/lib/format";
import { inputCls } from "./GestionComptes";
import { CLASSES, classeEn, prenomEleve, type Classe, type Eleve } from "@/lib/eleves";

export type Activite = {
  id: string;
  annee_scolaire: string;
  titre: string;
  date_activite: string | null;
  date_limite: string | null;
  description: string | null;
  prix_defaut: number | null;
  prix_par_classe: Partial<Record<Classe, number>>;
};

export type Participation = {
  id: string;
  activite_id: string;
  eleve_id: string;
  montant: number;
  paye_le: string | null;
};

type EleveFamille = Eleve & { famille_nom: string };

/**
 * Activités et commandes groupées passées par l'école : une ligne par enfant
 * concerné, au prix de sa classe, et le suivi du paiement. Chaque famille les
 * retrouve dans son espace (onglet Paiements).
 */
export default function GestionActivites({
  annee,
  activites,
  participations,
  eleves,
}: {
  annee: string;
  activites: Activite[];
  participations: Participation[];
  eleves: EleveFamille[];
}) {
  const router = useRouter();
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [f, setF] = useState({
    titre: "", date_activite: "", date_limite: "", description: "", prix_defaut: "",
    prix: {} as Partial<Record<Classe, string>>,
    classes: new Set<Classe>(CLASSES),
  });
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const eleveParId = useMemo(() => new Map(eleves.map((e) => [e.id, e])), [eleves]);
  const nomEleve = (e: EleveFamille | undefined) =>
    e ? `${prenomEleve(e)} ${e.famille_nom}` : "—";
  const scolarisesCetteAnnee = eleves.filter((e) => classeEn(e, annee) !== null);

  async function creer() {
    if (!f.titre.trim()) return setErreur("Le titre est obligatoire.");
    const num = (s: string | undefined) => (s && s.trim() ? Number(s.replace(",", ".")) : null);
    const prixParClasse: Partial<Record<Classe, number>> = {};
    for (const c of CLASSES) {
      const v = num(f.prix[c]);
      if (v !== null && Number.isFinite(v)) prixParClasse[c] = v;
    }
    const prixDefaut = num(f.prix_defaut);
    setBusy(true);
    setErreur(null);
    const supabase = createClient();
    const { data: act, error } = await supabase
      .from("activites")
      .insert({
        annee_scolaire: annee,
        titre: f.titre.trim(),
        date_activite: f.date_activite || null,
        date_limite: f.date_limite || null,
        description: f.description.trim() || null,
        prix_defaut: prixDefaut,
        prix_par_classe: prixParClasse,
      })
      .select("id")
      .single();
    if (error || !act) {
      setBusy(false);
      return setErreur("Création impossible : " + (error?.message ?? "inconnu"));
    }
    // Une participation par enfant scolarisé dans les classes concernées.
    const lignes = scolarisesCetteAnnee
      .map((e) => ({ e, classe: classeEn(e, annee)! }))
      .filter(({ classe }) => f.classes.has(classe))
      .map(({ e, classe }) => ({
        activite_id: (act as { id: string }).id,
        eleve_id: e.id,
        montant: prixParClasse[classe] ?? prixDefaut ?? 0,
      }));
    if (lignes.length > 0) {
      const { error: e2 } = await supabase.from("activites_participations").insert(lignes);
      if (e2) setErreur("Activité créée, mais participations non enregistrées : " + e2.message);
    }
    setBusy(false);
    setCreation(false);
    router.refresh();
  }

  async function payer(p: Participation, date: string | null) {
    const { error } = await createClient().from("activites_participations").update({ paye_le: date }).eq("id", p.id);
    if (error) return setErreur(error.message);
    router.refresh();
  }

  async function retirer(p: Participation) {
    const { error } = await createClient().from("activites_participations").delete().eq("id", p.id);
    if (error) return setErreur(error.message);
    router.refresh();
  }

  async function supprimerActivite(a: Activite) {
    if (!window.confirm(`Supprimer l'activité « ${a.titre} » et ses participations ?`)) return;
    const { error } = await createClient().from("activites").delete().eq("id", a.id);
    if (error) return setErreur(error.message);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {scolarisesCetteAnnee.length} enfant(s) enregistré(s) pour {annee}.
        </p>
        <button type="button" onClick={() => setCreation((v) => !v)} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90">
          {creation ? "Fermer" : "+ Nouvelle activité"}
        </button>
      </div>

      {creation && (
        <div className="grid gap-2 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
          <input value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} placeholder="Titre (ex. Sortie au musée, photo de classe)" className={`${inputCls} sm:col-span-2`} />
          <label className="text-xs text-muted">Date de l&apos;activité<input type="date" value={f.date_activite} onChange={(e) => setF({ ...f, date_activite: e.target.value })} className={inputCls} /></label>
          <label className="text-xs text-muted">Payer avant le<input type="date" value={f.date_limite} onChange={(e) => setF({ ...f, date_limite: e.target.value })} className={inputCls} /></label>
          <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description (facultatif)" className={`${inputCls} sm:col-span-2`} />
          <label className="text-xs text-muted">Prix par défaut (€)<input value={f.prix_defaut} onChange={(e) => setF({ ...f, prix_defaut: e.target.value })} inputMode="decimal" className={inputCls} /></label>
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-muted">Classes concernées et prix par classe (vide = prix par défaut)</div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {CLASSES.map((c) => (
                <label key={c} className="text-xs">
                  <span className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={f.classes.has(c)}
                      onChange={(e) => {
                        const n = new Set(f.classes);
                        if (e.target.checked) n.add(c);
                        else n.delete(c);
                        setF({ ...f, classes: n });
                      }}
                    />
                    {c}
                  </span>
                  <input
                    value={f.prix[c] ?? ""}
                    onChange={(e) => setF({ ...f, prix: { ...f.prix, [c]: e.target.value } })}
                    inputMode="decimal"
                    placeholder="€"
                    className={`${inputCls} mt-0.5 py-1 text-xs`}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <button type="button" onClick={creer} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50">
              {busy ? "…" : "Créer l'activité"}
            </button>
          </div>
        </div>
      )}

      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Activité</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">À payer avant</th>
              <th className="px-4 py-3 text-center font-medium">Enfants</th>
              <th className="px-4 py-3 text-right font-medium">Payé / attendu</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {activites.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">Aucune activité pour {annee}.</td></tr>
            )}
            {activites.map((a) => {
              const parts = participations.filter((p) => p.activite_id === a.id);
              const attendu = parts.reduce((s, p) => s + Number(p.montant), 0);
              const paye = parts.filter((p) => p.paye_le).reduce((s, p) => s + Number(p.montant), 0);
              const ouvertes = ouverte === a.id;
              return (
                <Fragment key={a.id}>
                  <tr onClick={() => setOuverte(ouvertes ? null : a.id)} className="cursor-pointer border-b border-border hover:bg-surface-2">
                    <td className="px-4 py-3 font-medium">
                      <span className={`mr-1.5 inline-block text-muted transition-transform ${ouvertes ? "rotate-90" : ""}`}>›</span>
                      {a.titre}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{a.date_activite ? formatDate(a.date_activite) : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{a.date_limite ? formatDate(a.date_limite) : "—"}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{parts.length}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${paye < attendu ? "text-gold" : "text-positive"}`}>
                      {formatEuros(paye)} / {formatEuros(attendu)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={(e) => { e.stopPropagation(); supprimerActivite(a); }} className="text-xs text-muted hover:text-negative">Supprimer</button>
                    </td>
                  </tr>
                  {ouvertes && (
                    <tr className="border-b border-border bg-surface-2/40">
                      <td colSpan={6} className="px-4 py-2">
                        <table className="w-full text-xs">
                          <tbody>
                            {parts.map((p) => {
                              const e = eleveParId.get(p.eleve_id);
                              return (
                                <tr key={p.id} className="border-b border-border/40 last:border-0">
                                  <td className="py-1">{nomEleve(e)}</td>
                                  <td className="py-1 text-muted">{e ? classeEn(e, annee) ?? "—" : "—"}</td>
                                  <td className="py-1 text-right tabular-nums">{formatEuros(Number(p.montant))}</td>
                                  <td className="py-1 text-right">
                                    {p.paye_le ? (
                                      <span className="text-positive">
                                        payé le {formatDate(p.paye_le)}{" "}
                                        <button type="button" onClick={() => payer(p, null)} className="text-muted hover:underline">annuler</button>
                                      </span>
                                    ) : (
                                      <button type="button" onClick={() => payer(p, todayISO())} className="text-accent hover:underline">Marquer payé</button>
                                    )}
                                  </td>
                                  <td className="w-8 py-1 text-right">
                                    <button type="button" onClick={() => retirer(p)} className="text-muted hover:text-negative" title="Retirer cet enfant">✕</button>
                                  </td>
                                </tr>
                              );
                            })}
                            {parts.length === 0 && <tr><td className="py-2 text-muted">Aucun enfant concerné.</td></tr>}
                          </tbody>
                        </table>
                        {a.description && <p className="mt-1 text-xs text-muted">{a.description}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

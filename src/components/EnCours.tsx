"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "@/components/GestionComptes";
import {
  prochaineOccurrence,
  joursRestants,
  RECURRENCE_LABEL,
  type Echeance,
  type ImpayeScolarite,
  type Sens,
  type Recurrence,
} from "@/lib/echeances";

type Cat = { id: string; nom: string; type: "recette" | "depense" };

type Form = {
  sens: Sens;
  libelle: string;
  tiers: string;
  montant: string;
  date_echeance: string;
  recurrence: "" | Recurrence;
  categorie_id: string;
  notes: string;
};

const vide: Form = {
  sens: "a_payer",
  libelle: "",
  tiers: "",
  montant: "",
  date_echeance: "",
  recurrence: "",
  categorie_id: "",
  notes: "",
};

export default function EnCours({
  echeances,
  categories,
  impayes,
  anneeScolaire,
}: {
  echeances: Echeance[];
  categories: Cat[];
  impayes: ImpayeScolarite[];
  anneeScolaire: string;
}) {
  const router = useRouter();
  const today = todayISO();
  const [edit, setEdit] = useState<Echeance | "nouveau" | null>(null);
  const [form, setForm] = useState<Form>(vide);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catNom = useMemo(() => new Map(categories.map((c) => [c.id, c.nom])), [categories]);

  // Répartition : ponctuelles (par sens) vs récurrentes.
  const ponctuelles = echeances.filter((e) => !e.recurrence);
  const aEncaisser = ponctuelles.filter((e) => e.sens === "a_recevoir");
  const aRegler = ponctuelles.filter((e) => e.sens === "a_payer");
  const recurrentes = echeances
    .filter((e) => e.recurrence)
    .map((e) => ({ e, prochaine: prochaineOccurrence(e.date_echeance ?? today, e.recurrence, today) }))
    .sort((a, b) => a.prochaine.localeCompare(b.prochaine));

  // Totaux (analyse).
  const totalScolarite = impayes.reduce((s, i) => s + i.reste, 0);
  const totalCreances = aEncaisser.reduce((s, e) => s + Number(e.montant), 0);
  const totalDettes = aRegler.reduce((s, e) => s + Number(e.montant), 0);
  const totalEncaisser = totalScolarite + totalCreances;
  const enRetard = aRegler.filter((e) => e.date_echeance && e.date_echeance < today).length;

  function ouvrir(e: Echeance | "nouveau") {
    setError(null);
    if (e === "nouveau") {
      setForm(vide);
    } else {
      setForm({
        sens: e.sens,
        libelle: e.libelle,
        tiers: e.tiers ?? "",
        montant: String(e.montant).replace(".", ","),
        date_echeance: e.date_echeance ?? "",
        recurrence: e.recurrence ?? "",
        categorie_id: e.categorie_id ?? "",
        notes: e.notes ?? "",
      });
    }
    setEdit(e);
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    const montant = Number((form.montant.trim() || "0").replace(/\s/g, "").replace(",", "."));
    if (!form.libelle.trim()) return setError("Le libellé est obligatoire.");
    if (!Number.isFinite(montant) || montant <= 0) return setError("Montant invalide.");

    setSaving(true);
    const supabase = createClient();
    const payload = {
      sens: form.sens,
      libelle: form.libelle.trim(),
      tiers: form.tiers.trim() || null,
      montant,
      date_echeance: form.date_echeance || null,
      recurrence: form.recurrence || null,
      categorie_id: form.categorie_id || null,
      notes: form.notes.trim() || null,
    };
    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("echeances").insert(payload)
        : await supabase.from("echeances").update(payload).eq("id", (edit as Echeance).id);
    setSaving(false);
    if (err) return setError("Enregistrement impossible : " + err.message);
    setEdit(null);
    router.refresh();
  }

  async function regler(e: Echeance) {
    setBusy(e.id);
    const supabase = createClient();
    await supabase.from("echeances").update({ statut: "regle", regle_le: today }).eq("id", e.id);
    setBusy(null);
    router.refresh();
  }

  async function supprimer(e: Echeance) {
    if (!confirm(`Supprimer « ${e.libelle} » ?`)) return;
    setBusy(e.id);
    const supabase = createClient();
    await supabase.from("echeances").delete().eq("id", e.id);
    setBusy(null);
    router.refresh();
  }

  const catsPourSens = categories.filter((c) => c.type === (form.sens === "a_payer" ? "depense" : "recette"));

  return (
    <div className="space-y-6">
      {/* Synthèse (analyse) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile label="À encaisser" valeur={formatEuros(totalEncaisser)} accent="positive" />
        <Tuile label="À régler" valeur={formatEuros(totalDettes)} accent="negative" />
        <Tuile
          label="Position nette"
          valeur={formatEuros(totalEncaisser - totalDettes)}
          accent={totalEncaisser - totalDettes >= 0 ? "positive" : "negative"}
        />
        <Tuile
          label="Dettes en retard"
          valeur={String(enRetard)}
          accent={enRetard > 0 ? "negative" : "muted"}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => ouvrir("nouveau")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          + Ajouter une échéance
        </button>
      </div>

      {/* À ENCAISSER */}
      <Bloc titre="À encaisser" total={formatEuros(totalEncaisser)} accent="positive">
        {/* Scolarité impayée (auto) */}
        {impayes.length > 0 && (
          <div className="border-b border-border">
            <div className="flex items-center justify-between px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">
              <span>Scolarité impayée · {anneeScolaire}</span>
              <Link href="/scolarite" className="text-accent hover:underline">Voir la scolarité →</Link>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {impayes.map((i) => (
                  <tr key={i.famille_nom} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">Famille {i.famille_nom}</div>
                      {i.emails && <div className="text-xs text-muted">{i.emails}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted">
                      réglé {formatEuros(i.regle)} / {formatEuros(i.du)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums text-positive whitespace-nowrap">
                      {formatEuros(i.reste)}
                    </td>
                    <td className="w-28 px-4 py-2.5" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <LignesEcheances
          lignes={aEncaisser}
          vide="Aucune créance ponctuelle en attente."
          today={today}
          catNom={catNom}
          busy={busy}
          onRegler={regler}
          onEdit={ouvrir}
          onDelete={supprimer}
          sens="a_recevoir"
        />
      </Bloc>

      {/* À RÉGLER */}
      <Bloc titre="À régler" total={formatEuros(totalDettes)} accent="negative">
        <LignesEcheances
          lignes={aRegler}
          vide="Aucune facture ou dette en attente."
          today={today}
          catNom={catNom}
          busy={busy}
          onRegler={regler}
          onEdit={ouvrir}
          onDelete={supprimer}
          sens="a_payer"
        />
      </Bloc>

      {/* ÉCHÉANCES RÉCURRENTES */}
      <Bloc titre="Échéances récurrentes à venir" accent="muted">
        {recurrentes.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            Aucune échéance récurrente. Ajoutez le loyer, les salaires, l&apos;URSSAF… avec une récurrence
            pour les voir arriver ici.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {recurrentes.map(({ e, prochaine }) => {
                const j = joursRestants(prochaine, today);
                return (
                  <tr key={e.id} className="border-t border-border first:border-t-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{e.libelle}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {e.tiers && <span>{e.tiers}</span>}
                        <span className="rounded bg-surface-2 px-1.5 py-0.5">{RECURRENCE_LABEL[e.recurrence!]}</span>
                        <span className={e.sens === "a_payer" ? "text-negative" : "text-positive"}>
                          {e.sens === "a_payer" ? "à régler" : "à encaisser"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted whitespace-nowrap">
                      prochaine : {formatDate(prochaine)}
                      <div className={j <= 7 ? "text-gold" : ""}>
                        {j === 0 ? "aujourd'hui" : j > 0 ? `dans ${j} j` : `il y a ${-j} j`}
                      </div>
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular-nums whitespace-nowrap ${e.sens === "a_payer" ? "text-negative" : "text-positive"}`}>
                      {formatEuros(Number(e.montant))}
                    </td>
                    <td className="w-28 px-4 py-2.5 text-right whitespace-nowrap">
                      <button type="button" onClick={() => ouvrir(e)} className="text-accent hover:underline">Modifier</button>
                      <button
                        type="button"
                        onClick={() => supprimer(e)}
                        disabled={busy === e.id}
                        className="ml-3 text-muted hover:underline disabled:opacity-50"
                      >
                        Suppr.
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Bloc>

      {edit && (
        <Modal
          title={edit === "nouveau" ? "Nouvelle échéance" : "Modifier l'échéance"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  value={form.sens}
                  onChange={(e) => setForm({ ...form, sens: e.target.value as Sens, categorie_id: "" })}
                  className={inputCls}
                >
                  <option value="a_payer">À régler (dette / facture)</option>
                  <option value="a_recevoir">À encaisser (créance)</option>
                </select>
              </Field>
              <Field label="Montant (€)">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.montant}
                  onChange={(e) => setForm({ ...form, montant: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Libellé">
              <input
                type="text"
                required
                value={form.libelle}
                onChange={(e) => setForm({ ...form, libelle: e.target.value })}
                className={inputCls}
                placeholder="Ex. Facture EDF, Loyer, Remboursement sortie…"
              />
            </Field>
            <Field label="Tiers (fournisseur / débiteur)">
              <input
                type="text"
                value={form.tiers}
                onChange={(e) => setForm({ ...form, tiers: e.target.value })}
                className={inputCls}
                placeholder="Ex. EDF, SCI…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date d'échéance">
                <input
                  type="date"
                  value={form.date_echeance}
                  onChange={(e) => setForm({ ...form, date_echeance: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Récurrence">
                <select
                  value={form.recurrence}
                  onChange={(e) => setForm({ ...form, recurrence: e.target.value as "" | Recurrence })}
                  className={inputCls}
                >
                  <option value="">Ponctuelle</option>
                  <option value="mensuel">Mensuelle</option>
                  <option value="trimestriel">Trimestrielle</option>
                  <option value="annuel">Annuelle</option>
                </select>
              </Field>
            </div>
            <Field label="Catégorie (optionnel)">
              <select
                value={form.categorie_id}
                onChange={(e) => setForm({ ...form, categorie_id: e.target.value })}
                className={inputCls}
              >
                <option value="">— aucune —</option>
                {catsPourSens.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </Field>
            <Field label="Notes (optionnel)">
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputCls}
              />
            </Field>
            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Tuile({ label, valeur, accent }: { label: string; valeur: string; accent: "positive" | "negative" | "muted" }) {
  const col = accent === "positive" ? "text-positive" : accent === "negative" ? "text-negative" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${col}`}>{valeur}</div>
    </div>
  );
}

function Bloc({
  titre,
  total,
  accent,
  children,
}: {
  titre: string;
  total?: string;
  accent: "positive" | "negative" | "muted";
  children: React.ReactNode;
}) {
  const dot = accent === "positive" ? "bg-positive" : accent === "negative" ? "bg-negative" : "bg-gold";
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {titre}
        </h2>
        {total && <span className="text-sm font-medium tabular-nums text-muted">{total}</span>}
      </div>
      {children}
    </section>
  );
}

function LignesEcheances({
  lignes,
  vide,
  today,
  catNom,
  busy,
  onRegler,
  onEdit,
  onDelete,
}: {
  lignes: Echeance[];
  vide: string;
  today: string;
  catNom: Map<string, string>;
  busy: string | null;
  onRegler: (e: Echeance) => void;
  onEdit: (e: Echeance) => void;
  onDelete: (e: Echeance) => void;
  sens: Sens;
}) {
  if (lignes.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-muted">{vide}</p>;
  }
  const tri = [...lignes].sort((a, b) => (a.date_echeance ?? "9999").localeCompare(b.date_echeance ?? "9999"));
  return (
    <table className="w-full text-sm">
      <tbody>
        {tri.map((e) => {
          const retard = e.date_echeance && e.date_echeance < today;
          return (
            <tr key={e.id} className="border-t border-border first:border-t-0">
              <td className="px-4 py-2.5">
                <div className="font-medium">{e.libelle}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {e.tiers && <span>{e.tiers}</span>}
                  {e.categorie_id && catNom.get(e.categorie_id) && <span>· {catNom.get(e.categorie_id)}</span>}
                  {e.notes && <span>· {e.notes}</span>}
                </div>
              </td>
              <td className="px-4 py-2.5 text-right text-xs whitespace-nowrap">
                {e.date_echeance ? (
                  <span className={retard ? "font-medium text-negative" : "text-muted"}>
                    {retard ? "en retard · " : "échéance "}
                    {formatDate(e.date_echeance)}
                  </span>
                ) : (
                  <span className="text-muted">sans date</span>
                )}
              </td>
              <td className={`px-4 py-2.5 text-right font-medium tabular-nums whitespace-nowrap ${e.sens === "a_payer" ? "text-negative" : "text-positive"}`}>
                {formatEuros(Number(e.montant))}
              </td>
              <td className="w-32 px-4 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => onRegler(e)}
                  disabled={busy === e.id}
                  className="text-positive hover:underline disabled:opacity-50"
                >
                  {e.sens === "a_payer" ? "Réglé" : "Encaissé"}
                </button>
                <button type="button" onClick={() => onEdit(e)} className="ml-3 text-accent hover:underline">Modifier</button>
                <button
                  type="button"
                  onClick={() => onDelete(e)}
                  disabled={busy === e.id}
                  className="ml-3 text-muted hover:underline disabled:opacity-50"
                >
                  Suppr.
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

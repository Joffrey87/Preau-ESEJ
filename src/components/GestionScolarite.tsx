"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros } from "@/lib/format";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";

export type Inscription = {
  id: string;
  annee_scolaire: string;
  famille_nom: string;
  nb_enfants: number | null;
  emails: string | null;
  montant_mensuel: number;
  avance: number | null;
  m_sept: number | null;
  m_oct: number | null;
  m_nov: number | null;
  m_dec: number | null;
  m_jan: number | null;
  m_fev: number | null;
  m_mars: number | null;
  m_avr: number | null;
  m_mai: number | null;
  m_juin: number | null;
  notes: string | null;
};

const MOIS: { k: keyof Inscription; l: string }[] = [
  { k: "m_sept", l: "Sept" },
  { k: "m_oct", l: "Oct" },
  { k: "m_nov", l: "Nov" },
  { k: "m_dec", l: "Déc" },
  { k: "m_jan", l: "Jan" },
  { k: "m_fev", l: "Fév" },
  { k: "m_mars", l: "Mars" },
  { k: "m_avr", l: "Avr" },
  { k: "m_mai", l: "Mai" },
  { k: "m_juin", l: "Juin" },
];

const MOIS_PAR_AN = 10;

export function totalDu(i: Pick<Inscription, "montant_mensuel">): number {
  return Number(i.montant_mensuel) * MOIS_PAR_AN;
}
export function totalRegle(i: Inscription): number {
  const cols = ["avance", ...MOIS.map((m) => m.k)] as (keyof Inscription)[];
  return cols.reduce((s, c) => s + (Number(i[c]) || 0), 0);
}

type FormState = Record<string, string> & {
  famille_nom: string;
  nb_enfants: string;
  emails: string;
  montant_mensuel: string;
  notes: string;
};

const numOrNull = (s: string) => {
  const t = (s ?? "").trim();
  if (t === "") return null;
  const n = Number(t.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export default function GestionScolarite({
  annee,
  annees,
  inscriptions,
  bareme,
}: {
  annee: string;
  annees: string[];
  inscriptions: Inscription[];
  /** nb_enfants -> montant mensuel, pour l'année courante. */
  bareme: Record<number, number>;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<Inscription | "nouveau" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const champsVides = (): FormState => {
    const base: Record<string, string> = {
      famille_nom: "",
      nb_enfants: "",
      emails: "",
      montant_mensuel: "",
      avance: "",
      notes: "",
    };
    for (const m of MOIS) base[m.k] = "";
    return base as FormState;
  };
  const [f, setF] = useState<FormState>(champsVides());
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  function changerAnnee(a: string) {
    router.push(`/scolarite?annee=${encodeURIComponent(a)}`);
  }

  function majMontantDepuisBareme(nb: string) {
    set("nb_enfants", nb);
    const m = bareme[Number(nb)];
    if (m != null) set("montant_mensuel", String(m).replace(".", ","));
  }

  function ouvrir(i: Inscription | "nouveau") {
    setError(null);
    if (i === "nouveau") {
      setF(champsVides());
    } else {
      const base: Record<string, string> = {
        famille_nom: i.famille_nom,
        nb_enfants: i.nb_enfants != null ? String(i.nb_enfants) : "",
        emails: i.emails ?? "",
        montant_mensuel: String(i.montant_mensuel).replace(".", ","),
        avance: i.avance != null ? String(i.avance).replace(".", ",") : "",
        notes: i.notes ?? "",
      };
      for (const m of MOIS) {
        const v = i[m.k] as number | null;
        base[m.k] = v != null ? String(v).replace(".", ",") : "";
      }
      setF(base as FormState);
    }
    setEdit(i);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.famille_nom.trim()) {
      setError("Le nom de famille est obligatoire.");
      return;
    }
    const montant = numOrNull(f.montant_mensuel);
    if (montant === null || Number.isNaN(montant)) {
      setError("Montant mensuel invalide.");
      return;
    }
    const payload: Record<string, unknown> = {
      annee_scolaire: annee,
      famille_nom: f.famille_nom.trim(),
      nb_enfants: f.nb_enfants ? Number(f.nb_enfants) : null,
      emails: f.emails.trim() || null,
      montant_mensuel: montant,
      avance: numOrNull(f.avance),
      notes: f.notes.trim() || null,
    };
    for (const m of MOIS) {
      const v = numOrNull(f[m.k]);
      if (Number.isNaN(v)) {
        setError(`Montant invalide pour ${m.l}.`);
        return;
      }
      payload[m.k] = v;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("scolarite_inscriptions").insert(payload)
        : await supabase.from("scolarite_inscriptions").update(payload).eq("id", (edit as Inscription).id);
    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  // Totaux de l'année
  const sumDu = inscriptions.reduce((s, i) => s + totalDu(i), 0);
  const sumRegle = inscriptions.reduce((s, i) => s + totalRegle(i), 0);
  const sumReste = sumDu - sumRegle;

  const badgeAvance = (i: Inscription) => {
    const av = Number(i.avance) || 0;
    if (av >= Number(i.montant_mensuel) && av > 0)
      return <span className="rounded-full bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">Payé</span>;
    if (av > 0)
      return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">Partiel</span>;
    return <span className="text-xs text-muted">—</span>;
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Année scolaire</label>
          <select
            value={annee}
            onChange={(e) => changerAnnee(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
          >
            {annees.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => ouvrir("nouveau")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          + Ajouter une famille
        </button>
      </div>

      {/* Synthèse */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { l: "Total attendu", v: sumDu, c: "" },
          { l: "Total réglé", v: sumRegle, c: "text-positive" },
          { l: "Reste à percevoir", v: sumReste, c: sumReste > 0 ? "text-negative" : "" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="text-xs uppercase tracking-wider text-muted">{s.l}</div>
            <div className={`mt-1 text-xl font-semibold tabular-nums ${s.c}`}>{formatEuros(s.v)}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Famille</th>
              <th className="px-4 py-3 font-medium text-center">Enf.</th>
              <th className="px-4 py-3 font-medium text-right">Mensuel</th>
              <th className="px-4 py-3 font-medium text-right">Total dû</th>
              <th className="px-4 py-3 font-medium text-center">Mois d'avance</th>
              <th className="px-4 py-3 font-medium text-right">Réglé</th>
              <th className="px-4 py-3 font-medium text-right">Reste</th>
              <th className="px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {inscriptions.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted">
                  Aucune famille pour {annee}.
                </td>
              </tr>
            ) : (
              inscriptions.map((i) => {
                const du = totalDu(i);
                const regle = totalRegle(i);
                const reste = du - regle;
                return (
                  <tr key={i.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{i.famille_nom}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{i.nb_enfants ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEuros(Number(i.montant_mensuel))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatEuros(du)}</td>
                    <td className="px-4 py-3 text-center">{badgeAvance(i)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-positive">{formatEuros(regle)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${reste > 0 ? "text-negative" : ""}`}>
                      {formatEuros(reste)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => ouvrir(i)} className="text-accent hover:underline">
                        Saisir / modifier
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={edit === "nouveau" ? `Nouvelle famille · ${annee}` : `${(edit as Inscription).famille_nom} · ${annee}`}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={handleSubmit} className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Famille">
                <input type="text" required value={f.famille_nom} onChange={(e) => set("famille_nom", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Nombre d'enfants">
                <select value={f.nb_enfants} onChange={(e) => majMontantDepuisBareme(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Montant mensuel (€)">
                <input type="text" inputMode="decimal" required value={f.montant_mensuel} onChange={(e) => set("montant_mensuel", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Mois d'avance (€)">
                <input type="text" inputMode="decimal" value={f.avance} onChange={(e) => set("avance", e.target.value)} className={inputCls} placeholder="0,00" />
              </Field>
            </div>
            <Field label="Emails">
              <input type="text" value={f.emails} onChange={(e) => set("emails", e.target.value)} className={inputCls} placeholder="parent1@… ; parent2@…" />
            </Field>

            <div>
              <div className="mb-1 text-sm font-medium">Paiements mensuels (€)</div>
              <div className="grid grid-cols-5 gap-2">
                {MOIS.map((m) => (
                  <label key={m.k} className="block">
                    <span className="mb-0.5 block text-xs text-muted">{m.l}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={f[m.k as string]}
                      onChange={(e) => set(m.k as string, e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-accent"
                    />
                  </label>
                ))}
              </div>
            </div>

            <Field label="Notes / relance">
              <input type="text" value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
            </Field>

            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { TONE_CLASSES } from "@/lib/statutDon";
import { nomCliquableCls } from "@/lib/ui";
import {
  AXES,
  STATUTS,
  AXE_TONE,
  STATUT_LABEL,
  STATUT_TONE,
  estClos,
  statutSuivant,
  joursAvant,
  type AxeFin,
  type StatutFin,
  type Financement,
} from "@/lib/financements";

type FormState = {
  intitule: string;
  axe: AxeFin;
  organisme: string;
  montant_vise: string;
  montant_obtenu: string;
  echeance: string;
  statut: StatutFin;
  responsable: string;
  notes: string;
};

function vide(): FormState {
  return {
    intitule: "",
    axe: "entreprise",
    organisme: "",
    montant_vise: "",
    montant_obtenu: "",
    echeance: "",
    statut: "piste",
    responsable: "",
    notes: "",
  };
}

const nombre = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export default function GestionPistes({
  financements,
  roleSlug = null,
}: {
  financements: Financement[];
  roleSlug?: string | null;
}) {
  const router = useRouter();
  const today = todayISO();
  const [edit, setEdit] = useState<Financement | "nouveau" | null>(null);
  const [f, setF] = useState<FormState>(vide());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtreAxe, setFiltreAxe] = useState<AxeFin | null>(null);
  const [vueCorbeille, setVueCorbeille] = useState(false);
  const [toast, setToast] = useState<{ id: string; nom: string } | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const actifs = useMemo(() => financements.filter((x) => !x.supprime_le), [financements]);
  const supprimes = useMemo(() => financements.filter((x) => x.supprime_le), [financements]);

  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(h);
  }, [toast]);

  const stats = useMemo(() => {
    const ouvertes = actifs.filter((x) => !estClos(x));
    const vise = ouvertes.reduce((s, x) => s + Number(x.montant_vise || 0), 0);
    const obtenu = actifs.filter((x) => x.statut === "obtenu").reduce((s, x) => s + Number(x.montant_obtenu || 0), 0);
    const prochaine = ouvertes
      .filter((x) => x.echeance)
      .map((x) => x.echeance as string)
      .sort()
      .find((d) => joursAvant(d, today) >= 0);
    return { vise, obtenu, nbOuvertes: ouvertes.length, prochaine };
  }, [actifs, today]);

  const affiches = useMemo(() => {
    const base = vueCorbeille ? supprimes : actifs;
    return base
      .filter((x) => vueCorbeille || !filtreAxe || x.axe === filtreAxe)
      .sort((a, b) => {
        // Non clos d'abord, puis par échéance la plus proche, puis intitulé.
        const ca = estClos(a) ? 1 : 0;
        const cb = estClos(b) ? 1 : 0;
        if (ca !== cb) return ca - cb;
        if (a.echeance && b.echeance) return a.echeance.localeCompare(b.echeance);
        if (a.echeance) return -1;
        if (b.echeance) return 1;
        return a.intitule.localeCompare(b.intitule);
      });
  }, [actifs, supprimes, vueCorbeille, filtreAxe]);

  // Prochaines échéances (pistes ouvertes datées, à venir ou en retard).
  const echeances = useMemo(
    () =>
      actifs
        .filter((x) => !estClos(x) && x.echeance)
        .map((x) => ({ x, j: joursAvant(x.echeance as string, today) }))
        .sort((a, b) => a.j - b.j)
        .slice(0, 6),
    [actifs, today],
  );

  function ouvrir(x: Financement | "nouveau") {
    setError(null);
    if (x === "nouveau") {
      setF({ ...vide(), responsable: roleSlug ?? "" });
    } else {
      setF({
        intitule: x.intitule,
        axe: x.axe,
        organisme: x.organisme ?? "",
        montant_vise: x.montant_vise != null ? String(x.montant_vise).replace(".", ",") : "",
        montant_obtenu: x.montant_obtenu ? String(x.montant_obtenu).replace(".", ",") : "",
        echeance: x.echeance ?? "",
        statut: x.statut,
        responsable: x.responsable ?? "",
        notes: x.notes ?? "",
      });
    }
    setEdit(x);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.intitule.trim()) {
      setError("L'intitulé est obligatoire.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      intitule: f.intitule.trim(),
      axe: f.axe,
      organisme: f.organisme.trim() || null,
      montant_vise: f.montant_vise.trim() ? nombre(f.montant_vise) : null,
      montant_obtenu: f.montant_obtenu.trim() ? nombre(f.montant_obtenu) : 0,
      echeance: f.echeance || null,
      statut: f.statut,
      responsable: f.responsable.trim() || null,
      notes: f.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("financements").insert(payload)
        : await supabase.from("financements").update(payload).eq("id", (edit as Financement).id);
    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  async function avancer(x: Financement) {
    const suivant = statutSuivant(x.statut);
    if (!suivant) return;
    await createClient().from("financements").update({ statut: suivant, updated_at: new Date().toISOString() }).eq("id", x.id);
    router.refresh();
  }

  async function supprimer(x: Financement) {
    const { error: err } = await createClient()
      .from("financements")
      .update({ supprime_le: new Date().toISOString(), supprime_par: roleSlug })
      .eq("id", x.id);
    if (err) {
      setError("Suppression impossible : " + err.message);
      return;
    }
    setEdit(null);
    setToast({ id: x.id, nom: x.intitule });
    router.refresh();
  }

  async function restaurer(id: string) {
    await createClient().from("financements").update({ supprime_le: null, supprime_par: null }).eq("id", id);
    setToast((t) => (t?.id === id ? null : t));
    router.refresh();
  }

  return (
    <>
      {/* Synthèse */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tuile label="Pistes en cours" valeur={String(stats.nbOuvertes)} />
        <Tuile label="Montant visé (en cours)" valeur={formatEuros(stats.vise)} />
        <Tuile label="Obtenu" valeur={formatEuros(stats.obtenu)} accent="positive" />
        <Tuile
          label="Prochaine échéance"
          valeur={stats.prochaine ? formatDate(stats.prochaine) : "—"}
        />
      </div>

      {/* Prochaines échéances */}
      {echeances.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold">Échéances à surveiller</h2>
          <ul className="space-y-1.5">
            {echeances.map(({ x, j }) => (
              <li key={x.id} className="flex items-center justify-between gap-3 text-sm">
                <button type="button" onClick={() => ouvrir(x)} className={nomCliquableCls}>
                  {x.intitule}
                </button>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    j < 0 ? TONE_CLASSES.red : j <= 30 ? TONE_CLASSES.amber : TONE_CLASSES.gray
                  }`}
                >
                  {j < 0 ? `en retard de ${-j} j` : j === 0 ? "aujourd'hui" : `dans ${j} j`} · {formatDate(x.echeance as string)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Barre : filtres axe + corbeille + ajout */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          <FiltreBtn actif={!filtreAxe} onClick={() => setFiltreAxe(null)}>
            Tous
          </FiltreBtn>
          {AXES.map((a) => (
            <FiltreBtn key={a.key} actif={filtreAxe === a.key} onClick={() => setFiltreAxe(a.key)}>
              {a.court}
            </FiltreBtn>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setVueCorbeille((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              vueCorbeille ? "border-accent bg-accent-soft text-accent" : "border-border hover:bg-surface-2"
            }`}
          >
            🗑 Corbeille{supprimes.length > 0 ? ` (${supprimes.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => ouvrir("nouveau")}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            + Nouvelle piste
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Intitulé</th>
              <th className="px-4 py-3 font-medium">Axe</th>
              <th className="px-4 py-3 text-right font-medium">Visé</th>
              <th className="px-4 py-3 text-right font-medium">Obtenu</th>
              <th className="px-4 py-3 font-medium">Échéance</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {affiches.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted">
                  {vueCorbeille
                    ? "Corbeille vide."
                    : actifs.length === 0
                      ? "Aucune piste. Ajoutez vos premières sources de financement."
                      : "Aucune piste pour ce filtre."}
                </td>
              </tr>
            ) : (
              affiches.map((x) => {
                const suivant = statutSuivant(x.statut);
                return (
                  <tr key={x.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => ouvrir(x)} className={nomCliquableCls}>
                        {x.intitule}
                      </button>
                      {x.organisme && <div className="text-xs text-muted">{x.organisme}</div>}
                      {x.responsable && <div className="text-xs text-muted">Resp. {x.responsable}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[AXE_TONE[x.axe]]}`}>
                        {AXES.find((a) => a.key === x.axe)?.court ?? x.axe}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{x.montant_vise != null ? formatEuros(x.montant_vise) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{x.montant_obtenu ? formatEuros(x.montant_obtenu) : "—"}</td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap text-muted">{x.echeance ? formatDate(x.echeance) : "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[STATUT_TONE[x.statut]]}`}>
                        {STATUT_LABEL[x.statut]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {vueCorbeille ? (
                        <button type="button" onClick={() => restaurer(x.id)} className="text-accent hover:underline">
                          Restaurer
                        </button>
                      ) : (
                        <>
                          {suivant && (
                            <button
                              type="button"
                              onClick={() => avancer(x)}
                              title={`Passer à « ${STATUT_LABEL[suivant]} »`}
                              className="text-accent hover:underline"
                            >
                              Avancer
                            </button>
                          )}
                          <button type="button" onClick={() => ouvrir(x)} className="ml-4 text-muted hover:underline">
                            Modifier
                          </button>
                          <button type="button" onClick={() => supprimer(x)} className="ml-4 text-muted hover:text-negative hover:underline">
                            Supprimer
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title={edit === "nouveau" ? "Nouvelle piste de financement" : "Modifier la piste"} onClose={() => setEdit(null)}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Intitulé">
              <input type="text" required value={f.intitule} onChange={(e) => set("intitule", e.target.value)} className={inputCls} placeholder="Ex. Fondation du patrimoine — appel 2026" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Axe">
                <select value={f.axe} onChange={(e) => set("axe", e.target.value as AxeFin)} className={inputCls}>
                  {AXES.map((a) => (
                    <option key={a.key} value={a.key}>{a.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Statut">
                <select value={f.statut} onChange={(e) => set("statut", e.target.value as StatutFin)} className={inputCls}>
                  {STATUTS.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Organisme / interlocuteur">
              <input type="text" value={f.organisme} onChange={(e) => set("organisme", e.target.value)} className={inputCls} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Montant visé (€)">
                <input type="text" inputMode="decimal" value={f.montant_vise} onChange={(e) => set("montant_vise", e.target.value)} className={inputCls} placeholder="0,00" />
              </Field>
              <Field label="Obtenu (€)">
                <input type="text" inputMode="decimal" value={f.montant_obtenu} onChange={(e) => set("montant_obtenu", e.target.value)} className={inputCls} placeholder="0,00" />
              </Field>
              <Field label="Échéance">
                <input type="date" value={f.echeance} onChange={(e) => set("echeance", e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Responsable">
              <input type="text" value={f.responsable} onChange={(e) => set("responsable", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Notes">
              <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} rows={3} />
            </Field>

            {edit !== "nouveau" && (
              <button type="button" onClick={() => supprimer(edit as Financement)} className="text-sm text-negative hover:underline">
                Supprimer cette piste
              </button>
            )}
            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}

      {/* Toast : suppression réversible */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm shadow-lg">
          <span>Piste supprimée{toast.nom ? ` — ${toast.nom}` : ""}.</span>
          <button type="button" onClick={() => restaurer(toast.id)} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90">
            Annuler
          </button>
          <button type="button" onClick={() => setToast(null)} className="text-muted hover:text-foreground" aria-label="Fermer">
            ✕
          </button>
        </div>
      )}
    </>
  );
}

function Tuile({ label, valeur, accent = "default" }: { label: string; valeur: string; accent?: "default" | "positive" }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${accent === "positive" ? "text-positive" : ""}`}>{valeur}</div>
    </div>
  );
}

function FiltreBtn({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition ${
        actif ? "border-accent bg-accent-soft font-medium text-accent" : "border-border text-muted hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import {
  appliquerCorrespondances,
  normaliserLibelle,
  type Correspondance,
  type ModeMotif,
  type NiveauAlerte,
} from "@/lib/correspondances";

type Categorie = { id: string; nom: string; type: "recette" | "depense" };

/** Un libellé bancaire distinct, avec le nombre d'opérations concernées. */
export type Echantillon = {
  libelle_origine: string;
  montant: number;
  type: "recette" | "depense";
  date_operation: string;
  occurrences: number;
};

type FormState = {
  motif: string;
  mode: ModeMotif;
  type_operation: "" | "recette" | "depense";
  montant_min: string;
  montant_max: string;
  libelle_modele: string;
  categorie_id: string;
  alerte: "" | NiveauAlerte;
  alerte_message: string;
  notes: string;
  ordre: string;
  actif: boolean;
};

function vide(): FormState {
  return {
    motif: "", mode: "contient", type_operation: "", montant_min: "", montant_max: "",
    libelle_modele: "", categorie_id: "", alerte: "", alerte_message: "", notes: "",
    ordre: "100", actif: true,
  };
}

function formDepuis(c: Correspondance): FormState {
  return {
    motif: c.motif,
    mode: c.mode,
    type_operation: c.type_operation ?? "",
    montant_min: c.montant_min === null ? "" : String(c.montant_min),
    montant_max: c.montant_max === null ? "" : String(c.montant_max),
    libelle_modele: c.libelle_modele ?? "",
    categorie_id: c.categorie_id ?? "",
    alerte: c.alerte ?? "",
    alerte_message: c.alerte_message ?? "",
    notes: c.notes ?? "",
    ordre: String(c.ordre),
    actif: c.actif,
  };
}

const TON_ALERTE: Record<NiveauAlerte, string> = {
  ambre: "bg-gold-soft text-gold",
  rouge: "bg-negative/10 text-negative",
};

export default function GestionCorrespondances({
  regles: reglesInit,
  categories,
  echantillons,
}: {
  regles: Correspondance[];
  categories: Categorie[];
  echantillons: Echantillon[];
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<Correspondance | "nouvelle" | null>(null);
  const [f, setF] = useState<FormState>(vide());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "sans-regle" | "alerte">("tous");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const catNom = useMemo(() => new Map(categories.map((c) => [c.id, c.nom])), [categories]);
  const regles = useMemo(() => [...reglesInit].sort((a, b) => a.ordre - b.ordre), [reglesInit]);

  // Aperçu : chaque libellé bancaire distinct passé dans le moteur de règles.
  const apercu = useMemo(
    () => echantillons.map((e) => ({ ech: e, res: appliquerCorrespondances(e, regles) })),
    [echantillons, regles],
  );

  // Nombre d'opérations couvertes par chaque règle (pour repérer les inutiles).
  const couverture = useMemo(() => {
    const m = new Map<string, number>();
    for (const { ech, res } of apercu) {
      if (res.regle) m.set(res.regle.id, (m.get(res.regle.id) ?? 0) + ech.occurrences);
    }
    return m;
  }, [apercu]);

  const apercuFiltre = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return apercu
      .filter(({ ech, res }) => {
        if (filtre === "sans-regle" && res.regle) return false;
        if (filtre === "alerte" && !res.alerte) return false;
        if (!q) return true;
        return (
          ech.libelle_origine.toLowerCase().includes(q) || res.libelle.toLowerCase().includes(q)
        );
      })
      .slice(0, 200);
  }, [apercu, recherche, filtre]);

  const sansRegle = apercu.filter(({ res }) => !res.regle).reduce((s, { ech }) => s + ech.occurrences, 0);
  const totalOps = echantillons.reduce((s, e) => s + e.occurrences, 0);
  const avecAlerte = apercu.filter(({ res }) => res.alerte).reduce((s, { ech }) => s + ech.occurrences, 0);

  function ouvrir(c: Correspondance | "nouvelle") {
    setError(null);
    setF(c === "nouvelle" ? vide() : formDepuis(c));
    setEdit(c);
  }

  /** Pré-remplit une règle depuis un libellé bancaire non couvert. */
  function creerDepuis(libelle: string) {
    setError(null);
    setF({ ...vide(), motif: libelle.slice(0, 40).trim(), libelle_modele: normaliserLibelle(libelle) });
    setEdit("nouvelle");
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.motif.trim()) return setError("Le motif de reconnaissance est obligatoire.");
    if (f.mode === "regex") {
      try {
        new RegExp(f.motif);
      } catch {
        return setError("Expression régulière invalide.");
      }
    }

    setSaving(true);
    const payload = {
      ordre: Number(f.ordre) || 100,
      actif: f.actif,
      motif: f.motif.trim(),
      mode: f.mode,
      type_operation: f.type_operation || null,
      montant_min: f.montant_min === "" ? null : Number(f.montant_min),
      montant_max: f.montant_max === "" ? null : Number(f.montant_max),
      libelle_modele: f.libelle_modele.trim() || null,
      categorie_id: f.categorie_id || null,
      alerte: f.alerte || null,
      alerte_message: f.alerte_message.trim() || null,
      notes: f.notes.trim() || null,
    };

    const supabase = createClient();
    const { error: err } =
      edit === "nouvelle"
        ? await supabase.from("correspondances").insert(payload)
        : await supabase.from("correspondances").update(payload).eq("id", (edit as Correspondance).id);

    setSaving(false);
    if (err) return setError("Enregistrement impossible : " + err.message);
    setEdit(null);
    router.refresh();
  }

  async function supprimer(c: Correspondance) {
    const { error: err } = await createClient().from("correspondances").delete().eq("id", c.id);
    if (err) return setError("Suppression impossible : " + err.message);
    setEdit(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tuile label="Règles actives" valeur={String(regles.filter((r) => r.actif).length)} />
        <Tuile label="Libellés distincts" valeur={String(echantillons.length)} />
        <Tuile label="Opérations sans règle" valeur={`${sansRegle} / ${totalOps}`} ton="gold" />
        <Tuile label="À vérifier (alerte)" valeur={String(avecAlerte)} ton="gold" />
      </div>

      {/* --- Les règles --------------------------------------------------- */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Règles de correspondance</h2>
        <button
          type="button"
          onClick={() => ouvrir("nouvelle")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          + Nouvelle règle
        </button>
      </div>

      <div className="mb-8 overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-3 py-3 font-medium">Ordre</th>
              <th className="px-4 py-3 font-medium">Reconnaît</th>
              <th className="px-4 py-3 font-medium">Intitulé produit</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 font-medium">Alerte</th>
              <th className="px-4 py-3 text-right font-medium">Opérations</th>
            </tr>
          </thead>
          <tbody>
            {regles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  Aucune règle. Créez-en une, ou partez d&apos;un libellé non couvert ci-dessous.
                </td>
              </tr>
            ) : (
              regles.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => ouvrir(r)}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-2 ${
                    r.actif ? "" : "opacity-50"
                  }`}
                >
                  <td className="px-3 py-3 tabular-nums text-muted">{r.ordre}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{r.motif}</code>
                    <span className="ml-2 text-xs text-muted">{r.mode}</span>
                    {!r.actif && <span className="ml-2 text-xs text-muted">· inactive</span>}
                  </td>
                  <td className="px-4 py-3">{r.libelle_modele ?? <span className="text-muted">— normalisation seule —</span>}</td>
                  <td className="px-4 py-3 text-muted">{r.categorie_id ? catNom.get(r.categorie_id) ?? "—" : "—"}</td>
                  <td className="px-4 py-3">
                    {r.alerte ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TON_ALERTE[r.alerte]}`}>
                        {r.alerte}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{couverture.get(r.id) ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- L'aperçu ----------------------------------------------------- */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Aperçu sur les libellés réels</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un libellé…"
            className={`${inputCls} max-w-xs`}
          />
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {([
              ["tous", "Tous"],
              ["sans-regle", "Sans règle"],
              ["alerte", "À vérifier"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFiltre(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  filtre === k ? "bg-accent text-accent-fg" : "text-muted hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Libellé bancaire</th>
              <th className="px-4 py-3 font-medium">Deviendrait</th>
              <th className="px-4 py-3 font-medium">Catégorie</th>
              <th className="px-4 py-3 text-right font-medium">Occurrences</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {apercuFiltre.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted">Aucun libellé pour ce filtre.</td>
              </tr>
            ) : (
              apercuFiltre.map(({ ech, res }) => (
                <tr key={ech.libelle_origine} className="border-b border-border last:border-0">
                  <td className="max-w-[20rem] px-4 py-3 text-xs text-muted">{ech.libelle_origine}</td>
                  <td className="px-4 py-3">
                    <span className={res.regle ? "font-medium" : ""}>{res.libelle}</span>
                    {res.alerte && (
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${TON_ALERTE[res.alerte]}`}
                        title={res.alerte_message ?? undefined}
                      >
                        à vérifier
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {res.categorie_id ? catNom.get(res.categorie_id) ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{ech.occurrences}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {res.regle ? (
                      <button type="button" onClick={() => ouvrir(res.regle!)} className="text-xs text-accent hover:underline">
                        règle {res.regle.ordre}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => creerDepuis(ech.libelle_origine)}
                        className="text-xs text-accent hover:underline"
                      >
                        créer une règle
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {apercu.length > apercuFiltre.length && (
        <p className="mt-2 text-xs text-muted">
          {apercuFiltre.length} libellés affichés sur {apercu.length}. Affinez la recherche pour voir les autres.
        </p>
      )}

      {/* --- Édition ------------------------------------------------------ */}
      {edit && (
        <Modal title={edit === "nouvelle" ? "Nouvelle règle" : "Modifier la règle"} onClose={() => setEdit(null)}>
          <form onSubmit={enregistrer} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
            <div className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              La règle s&apos;applique au <strong>libellé bancaire brut</strong>. La première règle qui
              correspond, dans l&apos;ordre croissant, l&apos;emporte.
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Motif reconnu">
                <input type="text" value={f.motif} onChange={(e) => set("motif", e.target.value)} className={inputCls} placeholder="stripe" />
              </Field>
              <Field label="Mode">
                <select value={f.mode} onChange={(e) => set("mode", e.target.value as ModeMotif)} className={inputCls}>
                  <option value="contient">contient</option>
                  <option value="commence">commence par</option>
                  <option value="regex">expression régulière</option>
                </select>
              </Field>
              <Field label="Ordre">
                <input type="number" value={f.ordre} onChange={(e) => set("ordre", e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Sens">
                <select value={f.type_operation} onChange={(e) => set("type_operation", e.target.value as FormState["type_operation"])} className={inputCls}>
                  <option value="">indifférent</option>
                  <option value="recette">recette</option>
                  <option value="depense">dépense</option>
                </select>
              </Field>
              <Field label="Montant min.">
                <input type="number" step="0.01" value={f.montant_min} onChange={(e) => set("montant_min", e.target.value)} className={inputCls} placeholder="—" />
              </Field>
              <Field label="Montant max.">
                <input type="number" step="0.01" value={f.montant_max} onChange={(e) => set("montant_max", e.target.value)} className={inputCls} placeholder="—" />
              </Field>
            </div>

            <Field label="Intitulé produit">
              <input type="text" value={f.libelle_modele} onChange={(e) => set("libelle_modele", e.target.value)} className={inputCls} placeholder="Paie {mois} Mme Nom Prénom" />
            </Field>
            <p className="-mt-2 text-xs text-muted">
              Jetons : <code>{"{mois}"}</code> <code>{"{annee}"}</code> <code>{"{montant}"}</code>{" "}
              <code>{"{origine}"}</code>, et <code>{"{1}"}</code> <code>{"{2}"}</code> pour les groupes
              capturés en mode expression régulière. Laissé vide, seule la normalisation s&apos;applique.
            </p>

            <Field label="Catégorie imposée">
              <select value={f.categorie_id} onChange={(e) => set("categorie_id", e.target.value)} className={inputCls}>
                <option value="">— aucune —</option>
                {categories
                  .filter((c) => !f.type_operation || c.type === f.type_operation)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
              </select>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Alerte">
                <select value={f.alerte} onChange={(e) => set("alerte", e.target.value as FormState["alerte"])} className={inputCls}>
                  <option value="">aucune</option>
                  <option value="ambre">ambre — à vérifier</option>
                  <option value="rouge">rouge — bloquant</option>
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="Message d'alerte">
                  <input type="text" value={f.alerte_message} onChange={(e) => set("alerte_message", e.target.value)} className={inputCls} placeholder="Don ou vente ? à trancher" />
                </Field>
              </div>
            </div>

            <Field label="Notes">
              <input type="text" value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
            </Field>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={f.actif} onChange={(e) => set("actif", e.target.checked)} />
              Règle active
            </label>

            {edit !== "nouvelle" && (
              <button
                type="button"
                onClick={() => supprimer(edit as Correspondance)}
                className="text-sm text-negative hover:underline"
              >
                Supprimer cette règle
              </button>
            )}

            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}

function Tuile({ label, valeur, ton = "default" }: { label: string; valeur: string; ton?: "default" | "gold" }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${ton === "gold" ? "text-gold" : ""}`}>{valeur}</div>
    </div>
  );
}

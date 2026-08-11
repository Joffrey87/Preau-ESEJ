"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres } from "@/lib/donsChiffre";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { formatEuros, formatDate } from "@/lib/format";
import { nomDonateur } from "@/lib/statutDon";
import {
  extraireNom,
  donsProbables,
  identitesDonateurs,
  donateursRessemblants,
  type OpDon,
} from "@/lib/reconciliation";
import type { Don } from "@/components/GestionDons";

const CATEGORIES = ["Particulier", "Association", "Entreprise", "Professionnel", "Communauté religieuse"];

type FormState = {
  est_personne_morale: boolean;
  donateur_titre: string;
  donateur_nom: string;
  donateur_prenom: string;
  raison_sociale: string;
  adresse: string;
  cp_ville: string;
  courriel: string;
  categorie_donateur: string;
};

function formDepuis(nomExtrait: string): FormState {
  return {
    est_personne_morale: false,
    donateur_titre: "",
    donateur_nom: nomExtrait,
    donateur_prenom: "",
    raison_sociale: "",
    adresse: "",
    cp_ville: "",
    courriel: "",
    categorie_donateur: "Particulier",
  };
}

function formDepuisDon(d: Don): FormState {
  return {
    est_personne_morale: d.est_personne_morale,
    donateur_titre: d.donateur_titre ?? "",
    donateur_nom: d.donateur_nom ?? "",
    donateur_prenom: d.donateur_prenom ?? "",
    raison_sociale: d.raison_sociale ?? "",
    adresse: d.adresse ?? "",
    cp_ville: d.cp_ville ?? "",
    courriel: d.courriel ?? "",
    categorie_donateur: d.categorie_donateur ?? "Particulier",
  };
}

export default function ReconciliationCompta({
  operations,
  dons: donsInit,
  roleSlug = null,
}: {
  operations: OpDon[];
  dons: Don[];
  roleSlug?: string | null;
}) {
  const router = useRouter();
  const coffre = useCoffre();
  const { dons, verrou } = useDonsDechiffres(donsInit);

  const [edit, setEdit] = useState<OpDon | null>(null);
  const [f, setF] = useState<FormState>(formDepuis(""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const identites = useMemo(() => identitesDonateurs(dons), [dons]);

  // Analyse de chaque opération : dons déjà enregistrés (montant+date) + nom deviné.
  const analyse = useMemo(
    () =>
      operations.map((op) => {
        const probables = donsProbables(op, dons);
        const nomExtrait = extraireNom(op.libelle_origine);
        const ressemblants = donateursRessemblants(nomExtrait, identites).slice(0, 4);
        return { op, probables, nomExtrait, ressemblants };
      }),
    [operations, dons, identites],
  );

  // Coffre requis ouvert (on crée des dons chiffrés — décision « on fait propre »).
  if (coffre.estConfigure && !coffre.estOuvert) {
    return (
      <div className="rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-6 text-center text-sm">
        <p className="text-gold">🔒 Déverrouillez le coffre pour rapprocher et importer les dons (ils seront chiffrés).</p>
        <div className="mt-3 flex justify-center">
          <DeverrouillerCoffre label="🔓 Déverrouiller le coffre" />
        </div>
      </div>
    );
  }

  function ouvrir(op: OpDon, nomExtrait: string, base?: Don) {
    setError(null);
    setF(base ? formDepuisDon(base) : formDepuis(nomExtrait));
    setEdit(op);
  }

  async function lier(op: OpDon, don: Don) {
    const { error: err } = await createClient().from("dons").update({ operation_id: op.id }).eq("id", don.id);
    if (err) {
      setError("Liaison impossible : " + err.message);
      return;
    }
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit) return;
    setError(null);
    if (f.est_personne_morale ? !f.raison_sociale.trim() : !f.donateur_nom.trim()) {
      setError(f.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
      return;
    }
    if (!coffre.estOuvert) {
      setError("Coffre verrouillé.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const base = {
      origine: null as string | null,
      categorie_donateur: f.categorie_donateur || null,
      est_personne_morale: f.est_personne_morale,
      montant: Number(edit.montant),
      date_don: edit.date_operation,
      mode_paiement: edit.mode_paiement,
      recu_numero: null,
      recu_etat: null,
      observations: "Importé depuis la comptabilité",
      operation_id: edit.id,
    };
    const pii = {
      titre: f.donateur_titre.trim() || null,
      nom: f.est_personne_morale ? f.raison_sociale.trim() : f.donateur_nom.trim(),
      prenom: f.donateur_prenom.trim() || null,
      raison: f.est_personne_morale ? f.raison_sociale.trim() : null,
      adresse: f.adresse.trim() || null,
      cp_ville: f.cp_ville.trim() || null,
      courriel: f.courriel.trim() || null,
    };
    const payload = {
      ...base,
      pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
      donateur_titre: null,
      donateur_nom: null,
      donateur_prenom: null,
      raison_sociale: null,
      adresse: null,
      cp_ville: null,
      courriel: null,
    };

    const { error: err } = await supabase.from("dons").insert(payload);
    if (err) {
      setError("Import impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  if (operations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-2 px-4 py-10 text-center text-sm text-muted">
        Toutes les opérations « Don » de la comptabilité sont déjà rapprochées. Rien à importer. 🎉
      </div>
    );
  }

  const aImporter = analyse.filter((a) => a.probables.length === 0).length;

  return (
    <>
      {verrou && (
        <div className="mb-4 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm text-gold">
          🔒 Coffre verrouillé — les noms existants ne peuvent pas être comparés.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tuile label="Opérations à traiter" valeur={String(operations.length)} />
        <Tuile label="À importer (nouvelles)" valeur={String(aImporter)} accent="gold" />
        <Tuile label="Déjà enregistrées (à lier)" valeur={String(operations.length - aImporter)} accent="positive" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 text-right font-medium">Montant</th>
              <th className="px-4 py-3 font-medium">Libellé bancaire</th>
              <th className="px-4 py-3 font-medium">Donateur deviné</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {analyse.map(({ op, probables, nomExtrait, ressemblants }) => (
              <tr key={op.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{formatDate(op.date_operation)}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{formatEuros(Number(op.montant))}</td>
                <td className="px-4 py-3 max-w-[16rem] text-xs text-muted">{op.libelle_origine ?? op.libelle}</td>
                <td className="px-4 py-3">
                  {nomExtrait ? <span className="font-medium">{nomExtrait}</span> : <span className="text-muted">—</span>}
                  {ressemblants.length > 0 && (
                    <div className="mt-0.5 text-xs text-muted">
                      Ressemble à : {ressemblants.map((r) => r.nom).join(", ")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {probables.length > 0 ? (
                    <span className="inline-flex items-center rounded-full bg-positive/15 px-2 py-0.5 text-xs font-medium text-positive">
                      Déjà enregistré{probables.length > 1 ? ` (${probables.length})` : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-gold-soft px-2 py-0.5 text-xs font-medium text-gold">
                      Nouveau don
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {probables.length === 1 ? (
                    <button type="button" onClick={() => lier(op, probables[0])} className="text-accent hover:underline" title={`Lier à « ${nomDonateur(probables[0])} »`}>
                      Lier
                    </button>
                  ) : probables.length > 1 ? (
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const d = probables.find((x) => x.id === e.target.value);
                        if (d) lier(op, d);
                      }}
                      className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none"
                    >
                      <option value="" disabled>
                        Lier à…
                      </option>
                      {probables.map((d) => (
                        <option key={d.id} value={d.id}>
                          {nomDonateur(d)} — {formatDate(d.date_don)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <button type="button" onClick={() => ouvrir(op, nomExtrait)} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90">
                        Ajouter aux dons
                      </button>
                      {ressemblants.length > 0 && (
                        <button type="button" onClick={() => ouvrir(op, nomExtrait, ressemblants[0].exemple)} className="text-xs text-accent hover:underline">
                          … avec « {ressemblants[0].nom} »
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal title="Ajouter ce don" onClose={() => setEdit(null)}>
          <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
              <span className="text-muted">Opération : </span>
              <strong>{formatEuros(Number(edit.montant))}</strong> le {formatDate(edit.date_operation)}
              {edit.mode_paiement ? ` · ${edit.mode_paiement}` : ""} — <span className="text-xs text-muted">{edit.libelle_origine ?? edit.libelle}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => set("est_personne_morale", false)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${!f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}>
                Particulier
              </button>
              <button type="button" onClick={() => set("est_personne_morale", true)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}>
                Personne morale
              </button>
            </div>

            {f.est_personne_morale ? (
              <>
                <Field label="Raison sociale">
                  <input type="text" required value={f.raison_sociale} onChange={(e) => set("raison_sociale", e.target.value)} className={inputCls} />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Contact — Titre">
                    <input type="text" value={f.donateur_titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Contact — Nom">
                    <input type="text" value={f.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Contact — Prénom">
                    <input type="text" value={f.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Titre">
                  <input type="text" value={f.donateur_titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} placeholder="Monsieur…" />
                </Field>
                <Field label="Prénom">
                  <input type="text" value={f.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Nom">
                  <input type="text" required value={f.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}

            <Field label="Adresse">
              <input type="text" value={f.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CP et ville">
                <input type="text" value={f.cp_ville} onChange={(e) => set("cp_ville", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Courriel">
                <input type="email" value={f.courriel} onChange={(e) => set("courriel", e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Catégorie donateur">
              <select value={f.categorie_donateur} onChange={(e) => set("categorie_donateur", e.target.value)} className={inputCls}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>

            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}

function Tuile({ label, valeur, accent = "default" }: { label: string; valeur: string; accent?: "default" | "gold" | "positive" }) {
  const col = accent === "gold" ? "text-gold" : accent === "positive" ? "text-positive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${col}`}>{valeur}</div>
    </div>
  );
}

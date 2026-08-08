"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { genererRecuDocx } from "@/lib/recu";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";

export type Don = {
  id: string;
  exercice_id: string | null;
  origine: string | null;
  categorie_donateur: string | null;
  est_personne_morale: boolean;
  donateur_titre: string | null;
  donateur_nom: string;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  montant: number;
  date_don: string;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
  recu_emis_le: string | null;
  observations: string | null;
};

const CATEGORIES = [
  "Particulier",
  "Association",
  "Entreprise",
  "Professionnel",
  "Communauté religieuse",
];
const MODES = ["Virement", "Chèque", "Carte bancaire", "Espèces", "Nature", "Autre"];

type FormState = {
  origine: string;
  categorie_donateur: string;
  est_personne_morale: boolean;
  donateur_titre: string;
  donateur_nom: string;
  donateur_prenom: string;
  raison_sociale: string;
  adresse: string;
  cp_ville: string;
  courriel: string;
  montant: string;
  date_don: string;
  mode_paiement: string;
  recu_numero: string;
  recu_etat: string;
  observations: string;
};

function vide(): FormState {
  return {
    origine: "",
    categorie_donateur: "Particulier",
    est_personne_morale: false,
    donateur_titre: "Monsieur",
    donateur_nom: "",
    donateur_prenom: "",
    raison_sociale: "",
    adresse: "",
    cp_ville: "",
    courriel: "",
    montant: "",
    date_don: todayISO(),
    mode_paiement: "Virement",
    recu_numero: "",
    recu_etat: "",
    observations: "",
  };
}

export default function GestionDons({ dons }: { dons: Don[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Don | "nouveau" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genErreur, setGenErreur] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(vide());

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  function ouvrir(d: Don | "nouveau") {
    setError(null);
    if (d === "nouveau") {
      setF(vide());
    } else {
      setF({
        origine: d.origine ?? "",
        categorie_donateur: d.categorie_donateur ?? "Particulier",
        est_personne_morale: d.est_personne_morale,
        donateur_titre: d.donateur_titre ?? "",
        donateur_nom: d.donateur_nom,
        donateur_prenom: d.donateur_prenom ?? "",
        raison_sociale: d.raison_sociale ?? "",
        adresse: d.adresse ?? "",
        cp_ville: d.cp_ville ?? "",
        courriel: d.courriel ?? "",
        montant: String(d.montant).replace(".", ","),
        date_don: d.date_don,
        mode_paiement: d.mode_paiement ?? "",
        recu_numero: d.recu_numero ?? "",
        recu_etat: d.recu_etat ?? "",
        observations: d.observations ?? "",
      });
    }
    setEdit(d);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const montantNum = Number(f.montant.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (f.est_personne_morale ? !f.raison_sociale.trim() : !f.donateur_nom.trim()) {
      setError(f.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      origine: f.origine.trim() || null,
      categorie_donateur: f.categorie_donateur || null,
      est_personne_morale: f.est_personne_morale,
      donateur_titre: f.donateur_titre.trim() || null,
      donateur_nom: f.est_personne_morale ? f.raison_sociale.trim() : f.donateur_nom.trim(),
      donateur_prenom: f.est_personne_morale ? null : f.donateur_prenom.trim() || null,
      raison_sociale: f.est_personne_morale ? f.raison_sociale.trim() : null,
      adresse: f.adresse.trim() || null,
      cp_ville: f.cp_ville.trim() || null,
      courriel: f.courriel.trim() || null,
      montant: montantNum,
      date_don: f.date_don,
      mode_paiement: f.mode_paiement || null,
      recu_numero: f.recu_numero.trim() || null,
      recu_etat: f.recu_etat.trim() || null,
      observations: f.observations.trim() || null,
    };

    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("dons").insert(payload)
        : await supabase.from("dons").update(payload).eq("id", (edit as Don).id);

    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  async function genererRecu(d: Don) {
    setGenErreur(null);
    try {
      await genererRecuDocx(d);
    } catch (e) {
      setGenErreur(e instanceof Error ? e.message : "Génération impossible.");
    }
  }

  const total = dons.reduce((s, d) => s + Number(d.montant), 0);
  const nomAffiche = (d: Don) =>
    d.est_personne_morale
      ? d.raison_sociale ?? d.donateur_nom
      : [d.donateur_titre, d.donateur_nom, d.donateur_prenom].filter(Boolean).join(" ");

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">
          {dons.length} don{dons.length > 1 ? "s" : ""} · Total {formatEuros(total)}
        </p>
        <button
          type="button"
          onClick={() => ouvrir("nouveau")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          + Nouveau don
        </button>
      </div>

      {genErreur && (
        <p className="mb-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{genErreur}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Donateur</th>
              <th className="px-4 py-3 font-medium text-right">Montant</th>
              <th className="px-4 py-3 font-medium">N° reçu</th>
              <th className="px-4 py-3 font-medium">État</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {dons.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  Aucun don enregistré.
                </td>
              </tr>
            ) : (
              dons.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 tabular-nums">{formatDate(d.date_don)}</td>
                  <td className="px-4 py-3">
                    {nomAffiche(d)}
                    {d.cp_ville && <span className="text-muted"> · {d.cp_ville}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatEuros(Number(d.montant))}</td>
                  <td className="px-4 py-3 tabular-nums text-xs">{d.recu_numero ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted">{d.recu_etat ?? "—"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => genererRecu(d)}
                      className="text-accent hover:underline"
                    >
                      Reçu
                    </button>
                    <button
                      type="button"
                      onClick={() => ouvrir(d)}
                      className="ml-4 text-muted hover:underline"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={edit === "nouveau" ? "Nouveau don" : "Modifier le don"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("est_personne_morale", false)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  !f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"
                }`}
              >
                Particulier
              </button>
              <button
                type="button"
                onClick={() => set("est_personne_morale", true)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"
                }`}
              >
                Personne morale
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date d'encaissement">
                <input type="date" required value={f.date_don} onChange={(e) => set("date_don", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Montant (€)">
                <input type="text" inputMode="decimal" required placeholder="0,00" value={f.montant} onChange={(e) => set("montant", e.target.value)} className={inputCls} />
              </Field>
            </div>

            {f.est_personne_morale ? (
              <Field label="Raison sociale">
                <input type="text" required value={f.raison_sociale} onChange={(e) => set("raison_sociale", e.target.value)} className={inputCls} placeholder="Ex. Oeuvre Salésienne" />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Titre">
                    <input type="text" value={f.donateur_titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} placeholder="Monsieur…" />
                  </Field>
                  <Field label="Nom">
                    <input type="text" required value={f.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Prénom">
                    <input type="text" value={f.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </>
            )}

            <Field label="Adresse">
              <input type="text" value={f.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls} placeholder="N° et rue" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CP et ville">
                <input type="text" value={f.cp_ville} onChange={(e) => set("cp_ville", e.target.value)} className={inputCls} placeholder="51100 Reims" />
              </Field>
              <Field label="Courriel">
                <input type="email" value={f.courriel} onChange={(e) => set("courriel", e.target.value)} className={inputCls} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Catégorie donateur">
                <select value={f.categorie_donateur} onChange={(e) => set("categorie_donateur", e.target.value)} className={inputCls}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Mode de paiement">
                <select value={f.mode_paiement} onChange={(e) => set("mode_paiement", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Origine (qui a amené le don)">
              <input type="text" value={f.origine} onChange={(e) => set("origine", e.target.value)} className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="N° de reçu">
                <input type="text" value={f.recu_numero} onChange={(e) => set("recu_numero", e.target.value)} className={inputCls} placeholder="RE_000210_20260808" />
              </Field>
              <Field label="État du reçu">
                <input type="text" value={f.recu_etat} onChange={(e) => set("recu_etat", e.target.value)} className={inputCls} placeholder="Envoyé - Courriel…" />
              </Field>
            </div>

            <Field label="Observations">
              <input type="text" value={f.observations} onChange={(e) => set("observations", e.target.value)} className={inputCls} />
            </Field>

            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}

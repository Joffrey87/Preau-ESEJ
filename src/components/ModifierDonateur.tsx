"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls } from "./GestionComptes";
import ChampsParticulier from "./ChampsParticulier";
import ChampCourriel from "./ChampCourriel";
import Icon from "@/components/Icon";
import { estCouple } from "@/lib/couple";
import { CATEGORIES_DONATEUR, estCategoriePersonneMorale } from "@/lib/categoriesDonateur";
import { PREFERENCES_ENVOI, prefereEnBase } from "@/lib/envoiRecu";
import { createClient } from "@/lib/supabase/client";
import { useCoffre } from "@/components/CoffreProvider";
import { nomSoigne } from "@/lib/nomPropre";
import type { Don } from "@/components/GestionDons";

type Form = {
  est_personne_morale: boolean;
  categorie_donateur: string;
  donateur_titre: string;
  donateur_nom: string;
  donateur_prenom: string;
  raison_sociale: string;
  adresse: string;
  cp_ville: string;
  courriel: string;
  a_transmettre: string;
  envoi_prefere: string;
};

function formDepuis(d: Don): Form {
  return {
    est_personne_morale: d.est_personne_morale,
    categorie_donateur: d.categorie_donateur ?? (d.est_personne_morale ? "Association" : "Particulier"),
    donateur_titre: d.donateur_titre ?? "",
    donateur_nom: d.donateur_nom ?? "",
    donateur_prenom: d.donateur_prenom ?? "",
    raison_sociale: d.raison_sociale ?? "",
    adresse: d.adresse ?? "",
    cp_ville: d.cp_ville ?? "",
    courriel: d.courriel ?? "",
    a_transmettre: d.a_transmettre ?? "",
    envoi_prefere: d.envoi_prefere ?? "courriel",
  };
}

/**
 * Renseignements du donateur, modifiables depuis sa fiche dans Relations donateurs (Trésorier et bureau). La fiche
 * modifiée est reportée sur TOUS les dons du donateur (chaque don porte sa copie, chiffrée dans le coffre).
 * Un clic en dehors de la fiche enregistre les modifications (la fenêtre soumet ce formulaire).
 */
export default function ModifierDonateur({ dons }: { dons: Don[] }) {
  const router = useRouter();
  const coffre = useCoffre();
  const recent = [...dons].sort((a, b) => b.date_don.localeCompare(a.date_don))[0];
  const [ouvert, setOuvert] = useState(false);
  const [form, setForm] = useState<Form>(() => formDepuis(recent));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!coffre.estOuvert) return setErreur("Coffre verrouillé : déverrouillez-le pour modifier la fiche (elle est chiffrée).");
    if (form.est_personne_morale ? !form.raison_sociale.trim() : !form.donateur_nom.trim())
      return setErreur(form.est_personne_morale ? "Le nom de l'organisme est obligatoire." : "Le nom est obligatoire.");
    setBusy(true);
    const pii = {
      titre: form.donateur_titre.trim() || null,
      nom: nomSoigne(form.donateur_nom, form.est_personne_morale) || null,
      prenom: form.donateur_prenom.trim() || null,
      raison: form.est_personne_morale ? form.raison_sociale.trim() : null,
      adresse: form.adresse.trim() || null,
      cp_ville: form.cp_ville.trim() || null,
      courriel: form.courriel.trim() || null,
      transmettre: form.a_transmettre.trim() || null,
    };
    const { error } = await createClient()
      .from("dons")
      .update({
        pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
        donateur_titre: null,
        donateur_nom: null,
        donateur_prenom: null,
        raison_sociale: null,
        adresse: null,
        cp_ville: null,
        courriel: null,
        est_personne_morale: form.est_personne_morale,
        categorie_donateur: form.categorie_donateur || null,
        envoi_prefere: prefereEnBase(form.envoi_prefere),
      })
      .in("id", dons.map((d) => d.id));
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    setOuvert(false);
    router.refresh();
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        <Icon name="crayon" className="h-4 w-4" />
        Modifier les renseignements
      </button>
    );
  }

  const couple = !form.est_personne_morale && estCouple(form.donateur_titre);
  return (
    <form onSubmit={enregistrer} className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold">Renseignements du donateur</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Catégorie">
          <select
            value={form.categorie_donateur}
            onChange={(e) => {
              set("categorie_donateur", e.target.value);
              set("est_personne_morale", estCategoriePersonneMorale(e.target.value));
            }}
            className={inputCls}
          >
            {!CATEGORIES_DONATEUR.includes(form.categorie_donateur as (typeof CATEGORIES_DONATEUR)[number]) && (
              <option value={form.categorie_donateur}>{form.categorie_donateur}</option>
            )}
            {CATEGORIES_DONATEUR.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reçus fiscaux envoyés par">
          <select value={form.envoi_prefere} onChange={(e) => set("envoi_prefere", e.target.value)} className={inputCls}>
            {PREFERENCES_ENVOI.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {form.envoi_prefere === "transmettre" && (
        <Field label="Reçu à transmettre à">
          <input
            type="text"
            value={form.a_transmettre}
            onChange={(e) => set("a_transmettre", e.target.value)}
            className={inputCls}
            placeholder="Prénom Nom, courriel de la personne de contact"
          />
        </Field>
      )}
      {form.est_personne_morale ? (
        <div className="space-y-3">
          <Field label="Nom de l'organisme">
            <input type="text" value={form.raison_sociale} onChange={(e) => set("raison_sociale", e.target.value)} className={inputCls} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Contact — Titre">
              <input type="text" value={form.donateur_titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} placeholder="Monsieur…" />
            </Field>
            <Field label="Contact — Prénom">
              <input type="text" value={form.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Contact — Nom">
              <input type="text" value={form.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>
      ) : (
        <ChampsParticulier titre={form.donateur_titre} prenom={form.donateur_prenom} nom={form.donateur_nom} set={set} />
      )}
      <Field label="Adresse">
        <input type="text" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls} placeholder="N° et rue" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="CP et ville">
          <input type="text" value={form.cp_ville} onChange={(e) => set("cp_ville", e.target.value)} className={inputCls} placeholder="51100 Reims" />
        </Field>
        {!couple && <ChampCourriel titre={form.donateur_titre} courriel={form.courriel} onChange={(v) => set("courriel", v)} />}
      </div>
      {couple && <ChampCourriel titre={form.donateur_titre} courriel={form.courriel} onChange={(v) => set("courriel", v)} />}
      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Reportée sur tous les dons de ce donateur ({dons.length}).</span>
        <span className="flex gap-2">
          <button type="button" onClick={() => setOuvert(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
            Annuler
          </button>
          <button type="submit" disabled={busy} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </span>
      </div>
    </form>
  );
}

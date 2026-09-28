"use client";

import { CATEGORIES_DONATEUR } from "@/lib/categoriesDonateur";
import { Field, inputCls } from "./GestionComptes";
import type { Don } from "@/components/GestionDons";

/**
 * Fiche donateur saisie au moment de rattacher une opération « Don » à l'onglet
 * Dons. Partagée par l'import bancaire et par l'import depuis la Comptabilité.
 */
export type FormDonateur = {
  est_personne_morale: boolean;
  donateur_titre: string;
  donateur_nom: string;
  donateur_prenom: string;
  raison_sociale: string;
  adresse: string;
  cp_ville: string;
  courriel: string;
  categorie_donateur: string;
  origine: string;
};

export function formDonateurDepuisNom(nomExtrait: string): FormDonateur {
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
    origine: "",
  };
}

export function formDonateurDepuisDon(d: Don): FormDonateur {
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
    origine: d.origine ?? "",
  };
}

/** Libellé court d'une fiche, pour une colonne « Donateur ». */
export function resumeDonateur(f: FormDonateur): string {
  if (f.est_personne_morale) return f.raison_sociale.trim();
  return [f.donateur_prenom.trim(), f.donateur_nom.trim()].filter(Boolean).join(" ");
}

/** Une fiche est-elle exploitable pour créer un don ? */
export function ficheDonateurValide(f: FormDonateur): boolean {
  return (f.est_personne_morale ? f.raison_sociale : f.donateur_nom).trim().length > 0;
}

/** Données personnelles de la fiche, prêtes à chiffrer (`dons.pii_chiffre`). */
export function piiDeFiche(f: FormDonateur) {
  return {
    titre: f.donateur_titre.trim() || null,
    nom: f.est_personne_morale ? f.raison_sociale.trim() : f.donateur_nom.trim(),
    prenom: f.donateur_prenom.trim() || null,
    raison: f.est_personne_morale ? f.raison_sociale.trim() : null,
    adresse: f.adresse.trim() || null,
    cp_ville: f.cp_ville.trim() || null,
    courriel: f.courriel.trim() || null,
  };
}

/** Relations déjà employées dans les dons, proposées en suggestion. */
export function relationsConnues(dons: Don[]): string[] {
  return Array.from(new Set(dons.map((d) => (d.origine ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
}

/** Champs de la fiche donateur (identité, coordonnées, catégorie, relation). */
export default function ChampsDonateur({
  f,
  set,
  relations,
  idListe = "relations-donateur",
}: {
  f: FormDonateur;
  set: <K extends keyof FormDonateur>(k: K, v: FormDonateur[K]) => void;
  relations: string[];
  idListe?: string;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => set("est_personne_morale", false)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${!f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
        >
          Particulier
        </button>
        <button
          type="button"
          onClick={() => set("est_personne_morale", true)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
        >
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
          {CATEGORIES_DONATEUR.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>

      <Field label="Relation (qui a amené ce don)">
        <input
          type="text"
          list={idListe}
          value={f.origine}
          onChange={(e) => set("origine", e.target.value)}
          className={inputCls}
          placeholder="Chanoine Journé, Paroisse, CA…"
        />
        <datalist id={idListe}>
          {relations.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </Field>
    </>
  );
}

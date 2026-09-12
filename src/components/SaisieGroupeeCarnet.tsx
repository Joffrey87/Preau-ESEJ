"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputCls } from "./GestionComptes";
import { useCarnet } from "@/components/CarnetProvider";
import { piiDepuisContact, PII_VIDE } from "@/lib/contactsChiffre";
import { CATEGORIES, type CategorieSlug } from "@/lib/carnet";

const CIVILITES = ["", "Monsieur", "Madame", "Mademoiselle", "M. et Mme", "Père", "Sœur", "Abbé"];

type Ligne = {
  cle: number;
  civilite: string;
  prenom: string;
  nom: string;
  courriel: string;
  telephone: string;
  categories: CategorieSlug[];
  notes: string;
};

let compteur = 0;
const ligneVide = (categories: CategorieSlug[] = []): Ligne => ({
  cle: ++compteur,
  civilite: "",
  prenom: "",
  nom: "",
  courriel: "",
  telephone: "",
  categories,
  notes: "",
});

/**
 * Saisie de plusieurs contacts d'un coup — pensée pour les renouvellements de
 * bureau et les rentrées : on remplit une grille plutôt que d'ouvrir douze fois
 * le même formulaire.
 */
export default function SaisieGroupeeCarnet({ categorieParDefaut = "bureau" }: { categorieParDefaut?: CategorieSlug }) {
  const router = useRouter();
  const carnet = useCarnet();
  const [lignes, setLignes] = useState<Ligne[]>(() =>
    Array.from({ length: 5 }, () => ligneVide([categorieParDefaut])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bilan, setBilan] = useState<string | null>(null);

  const maj = (cle: number, patch: Partial<Ligne>) =>
    setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...patch } : l)));

  const remplies = lignes.filter((l) => l.nom.trim());

  function basculerCategorie(l: Ligne, slug: CategorieSlug) {
    const has = l.categories.includes(slug);
    maj(l.cle, {
      categories: has ? l.categories.filter((c) => c !== slug) : [...l.categories, slug],
    });
  }

  async function enregistrer() {
    setError(null);
    setBilan(null);
    if (remplies.length === 0) return setError("Renseignez au moins un nom.");

    setSaving(true);
    const supabase = createClient();
    const payloads = [];

    for (const l of remplies) {
      const base = {
        civilite: l.civilite || null,
        est_personne_morale: false,
        nom: l.nom.trim(),
        prenom: l.prenom.trim() || null,
        raison_sociale: null,
        categories: l.categories,
        courriel: l.courriel.trim() || null,
        telephone: l.telephone.trim() || null,
        adresse: null,
        cp_ville: null,
        iban: null,
        notes: l.notes.trim() || null,
        updated_at: new Date().toISOString(),
      };

      // Coffre du carnet ouvert → on chiffre, comme la saisie fiche par fiche.
      if (carnet.estOuvert) {
        const pii = piiDepuisContact({ ...base, pii_chiffre: null } as never);
        payloads.push({
          est_personne_morale: false,
          categories: l.categories,
          updated_at: base.updated_at,
          ...PII_VIDE,
          pii_chiffre: await carnet.chiffrer(JSON.stringify(pii)),
        });
      } else {
        payloads.push(base);
      }
    }

    const { error: err } = await supabase.from("contacts").insert(payloads);
    setSaving(false);
    if (err) return setError("Enregistrement impossible : " + err.message);

    setBilan(`${payloads.length} contact(s) ajouté(s) au carnet.`);
    setLignes(Array.from({ length: 5 }, () => ligneVide([categorieParDefaut])));
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Saisie groupée</h2>
          <p className="mt-1 text-xs text-muted">
            Une ligne par personne. Seul le nom est obligatoire ; le reste se complète plus tard depuis
            la fiche. Utile lors d&apos;un renouvellement de bureau ou d&apos;une rentrée.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setLignes((ls) => [...ls, ligneVide([categorieParDefaut])])}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          + Ajouter une ligne
        </button>
      </div>

      {!carnet.estOuvert && carnet.estConfigure && (
        <p className="mt-3 rounded-lg bg-gold-soft/40 px-3 py-2 text-xs text-gold">
          🔒 Coffre du carnet verrouillé : les contacts seraient enregistrés en clair. Déverrouillez-le
          depuis Paramètres pour qu&apos;ils soient chiffrés.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-2 py-2 font-medium">Civilité</th>
              <th className="px-2 py-2 font-medium">Prénom</th>
              <th className="px-2 py-2 font-medium">Nom *</th>
              <th className="px-2 py-2 font-medium">Courriel</th>
              <th className="px-2 py-2 font-medium">Téléphone</th>
              <th className="px-2 py-2 font-medium">Rôles</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.cle} className="border-b border-border last:border-0 align-top">
                <td className="px-2 py-2">
                  <select value={l.civilite} onChange={(e) => maj(l.cle, { civilite: e.target.value })} className={`${inputCls} min-w-[7rem]`}>
                    {CIVILITES.map((c) => (
                      <option key={c} value={c}>{c || "—"}</option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-2">
                  <input type="text" value={l.prenom} onChange={(e) => maj(l.cle, { prenom: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <input type="text" value={l.nom} onChange={(e) => maj(l.cle, { nom: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <input type="email" value={l.courriel} onChange={(e) => maj(l.cle, { courriel: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <input type="tel" value={l.telephone} onChange={(e) => maj(l.cle, { telephone: e.target.value })} className={inputCls} />
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c.slug}
                        type="button"
                        onClick={() => basculerCategorie(l, c.slug)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          l.categories.includes(c.slug)
                            ? "bg-accent text-accent-fg"
                            : "border border-border text-muted hover:bg-surface-2"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-2 text-right">
                  {lignes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLignes((ls) => ls.filter((x) => x.cle !== l.cle))}
                      className="text-xs text-muted hover:text-negative"
                      title="Retirer cette ligne"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={enregistrer}
          disabled={saving || remplies.length === 0}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : `Enregistrer ${remplies.length} contact${remplies.length > 1 ? "s" : ""}`}
        </button>
        {bilan && <p className="text-sm text-positive">{bilan}</p>}
        {error && <p className="text-sm text-negative">{error}</p>}
      </div>
    </section>
  );
}

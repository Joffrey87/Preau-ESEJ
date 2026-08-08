"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import {
  CATEGORIES,
  CATEGORIE_LABEL,
  CATEGORIE_TONE,
  TONE_CLASSES,
  nomAffiche,
  type Contact,
  type CategorieSlug,
} from "@/lib/carnet";

const CIVILITES = ["", "Monsieur", "Madame", "M. et Mme", "Père", "Sœur", "Abbé"];

type FormState = {
  civilite: string;
  est_personne_morale: boolean;
  nom: string;
  prenom: string;
  raison_sociale: string;
  categories: string[];
  courriel: string;
  telephone: string;
  adresse: string;
  cp_ville: string;
  iban: string;
  notes: string;
};

function vide(): FormState {
  return {
    civilite: "Monsieur",
    est_personne_morale: false,
    nom: "",
    prenom: "",
    raison_sociale: "",
    categories: [],
    courriel: "",
    telephone: "",
    adresse: "",
    cp_ville: "",
    iban: "",
    notes: "",
  };
}

export default function GestionCarnet({
  contacts,
  canVoirIban,
  categoriesGerables,
  roleLabel,
}: {
  contacts: Contact[];
  canVoirIban: boolean;
  categoriesGerables: CategorieSlug[];
  roleLabel: string;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<Contact | "nouveau" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtreCat, setFiltreCat] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(vide());

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const toggleCat = (slug: string) =>
    setF((p) => ({
      ...p,
      categories: p.categories.includes(slug)
        ? p.categories.filter((c) => c !== slug)
        : [...p.categories, slug],
    }));

  // Catégories réellement présentes (pour les filtres), limitées à celles gérables.
  const catsFiltrables = CATEGORIES.filter(
    (c) => categoriesGerables.includes(c.slug) && contacts.some((k) => k.categories?.includes(c.slug)),
  );

  const liste = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return contacts.filter((c) => {
      if (filtreCat && !c.categories?.includes(filtreCat)) return false;
      if (!q) return true;
      return [c.nom, c.prenom, c.raison_sociale, c.courriel, c.cp_ville]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [contacts, recherche, filtreCat]);

  function ouvrir(c: Contact | "nouveau") {
    setError(null);
    if (c === "nouveau") {
      setF(vide());
    } else {
      setF({
        civilite: c.civilite ?? "",
        est_personne_morale: c.est_personne_morale,
        nom: c.nom,
        prenom: c.prenom ?? "",
        raison_sociale: c.raison_sociale ?? "",
        categories: c.categories ?? [],
        courriel: c.courriel ?? "",
        telephone: c.telephone ?? "",
        adresse: c.adresse ?? "",
        cp_ville: c.cp_ville ?? "",
        iban: c.iban ?? "",
        notes: c.notes ?? "",
      });
    }
    setEdit(c);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (f.est_personne_morale ? !f.raison_sociale.trim() : !f.nom.trim()) {
      setError(f.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      civilite: f.est_personne_morale ? null : f.civilite.trim() || null,
      est_personne_morale: f.est_personne_morale,
      nom: f.est_personne_morale ? f.raison_sociale.trim() : f.nom.trim(),
      prenom: f.est_personne_morale ? null : f.prenom.trim() || null,
      raison_sociale: f.est_personne_morale ? f.raison_sociale.trim() : null,
      categories: f.categories,
      courriel: f.courriel.trim() || null,
      telephone: f.telephone.trim() || null,
      adresse: f.adresse.trim() || null,
      cp_ville: f.cp_ville.trim() || null,
      ...(canVoirIban ? { iban: f.iban.trim() || null } : {}),
      notes: f.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("contacts").insert(payload)
        : await supabase.from("contacts").update(payload).eq("id", (edit as Contact).id);

    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  async function supprimer(c: Contact) {
    if (!confirm(`Supprimer « ${nomAffiche(c)} » du carnet ?`)) return;
    const supabase = createClient();
    const { error: err } = await supabase.from("contacts").delete().eq("id", c.id);
    if (err) {
      setError("Suppression impossible : " + err.message);
      return;
    }
    setEdit(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un contact…"
          className={`${inputCls} max-w-xs`}
        />
        <button
          type="button"
          onClick={() => ouvrir("nouveau")}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          + Nouveau contact
        </button>
      </div>

      {catsFiltrables.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {catsFiltrables.map((c) => {
            const n = contacts.filter((k) => k.categories?.includes(c.slug)).length;
            const actif = filtreCat === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => setFiltreCat(actif ? null : c.slug)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${TONE_CLASSES[c.tone]} ${
                  actif ? "ring-2 ring-accent ring-offset-1 ring-offset-background" : "opacity-90 hover:opacity-100"
                }`}
              >
                {c.label}
                <span className="rounded-full bg-black/10 px-1.5 tabular-nums dark:bg-white/15">{n}</span>
              </button>
            );
          })}
          {filtreCat && (
            <button type="button" onClick={() => setFiltreCat(null)} className="text-xs text-muted underline hover:text-foreground">
              Tout afficher
            </button>
          )}
        </div>
      )}

      <p className="mb-2 text-sm text-muted">
        {liste.length} contact{liste.length > 1 ? "s" : ""} visible{liste.length > 1 ? "s" : ""} · profil {roleLabel}
      </p>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Catégories</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Ville</th>
              {canVoirIban && <th className="px-4 py-3 font-medium">IBAN</th>}
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {liste.length === 0 ? (
              <tr>
                <td colSpan={canVoirIban ? 6 : 5} className="px-4 py-12 text-center text-muted">
                  {contacts.length === 0 ? "Aucun contact accessible avec votre profil." : "Aucun contact pour cette recherche."}
                </td>
              </tr>
            ) : (
              liste.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-3 font-medium">{nomAffiche(c)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.categories ?? []).map((cat) => (
                        <span
                          key={cat}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[CATEGORIE_TONE[cat] ?? "gray"]}`}
                        >
                          {CATEGORIE_LABEL[cat] ?? cat}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.courriel && <div className="text-accent">{c.courriel}</div>}
                    {c.telephone && <div className="text-muted">{c.telephone}</div>}
                    {!c.courriel && !c.telephone && <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{c.cp_ville ?? "—"}</td>
                  {canVoirIban && <td className="px-4 py-3 tabular-nums text-xs text-muted">{c.iban ?? "—"}</td>}
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => ouvrir(c)} className="text-accent hover:underline">
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
        <Modal title={edit === "nouveau" ? "Nouveau contact" : "Modifier le contact"} onClose={() => setEdit(null)}>
          <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("est_personne_morale", false)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${!f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
              >
                Personne
              </button>
              <button
                type="button"
                onClick={() => set("est_personne_morale", true)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
              >
                Structure
              </button>
            </div>

            {f.est_personne_morale ? (
              <Field label="Raison sociale">
                <input type="text" required value={f.raison_sociale} onChange={(e) => set("raison_sociale", e.target.value)} className={inputCls} />
              </Field>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Civilité">
                  <select value={f.civilite} onChange={(e) => set("civilite", e.target.value)} className={inputCls}>
                    {CIVILITES.map((c) => (
                      <option key={c} value={c}>{c || "—"}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Nom">
                  <input type="text" required value={f.nom} onChange={(e) => set("nom", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Prénom">
                  <input type="text" value={f.prenom} onChange={(e) => set("prenom", e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}

            <div>
              <span className="mb-1 block text-sm font-medium">Catégories</span>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.filter((c) => categoriesGerables.includes(c.slug)).map((c) => {
                  const on = f.categories.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => toggleCat(c.slug)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Courriel">
                <input type="email" value={f.courriel} onChange={(e) => set("courriel", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Téléphone">
                <input type="tel" value={f.telephone} onChange={(e) => set("telephone", e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Adresse">
              <input type="text" value={f.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls} placeholder="N° et rue" />
            </Field>
            <Field label="CP et ville">
              <input type="text" value={f.cp_ville} onChange={(e) => set("cp_ville", e.target.value)} className={inputCls} placeholder="51100 Reims" />
            </Field>

            {canVoirIban && (
              <Field label="IBAN (confidentiel)">
                <input type="text" value={f.iban} onChange={(e) => set("iban", e.target.value)} className={inputCls} placeholder="FR76…" />
              </Field>
            )}

            <Field label="Notes">
              <input type="text" value={f.notes} onChange={(e) => set("notes", e.target.value)} className={inputCls} />
            </Field>

            {edit !== "nouveau" && (
              <button type="button" onClick={() => supprimer(edit as Contact)} className="text-sm text-negative hover:underline">
                Supprimer ce contact
              </button>
            )}

            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, inputCls } from "./GestionComptes";

export type Organisation = {
  id: string;
  denomination: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  objet: string | null;
  type_organisme: string | null;
  article_cgi: string | null;
  signataire_nom: string | null;
  signataire_qualite: string | null;
};

export default function GestionOrganisation({ organisation }: { organisation: Organisation | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const [f, setF] = useState({
    denomination: organisation?.denomination ?? "",
    adresse: organisation?.adresse ?? "",
    code_postal: organisation?.code_postal ?? "",
    ville: organisation?.ville ?? "",
    objet: organisation?.objet ?? "",
    type_organisme: organisation?.type_organisme ?? "",
    article_cgi: organisation?.article_cgi ?? "",
    signataire_nom: organisation?.signataire_nom ?? "",
    signataire_qualite: organisation?.signataire_qualite ?? "",
  });

  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setOk(false);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const payload = {
      denomination: f.denomination.trim() || null,
      adresse: f.adresse.trim() || null,
      code_postal: f.code_postal.trim() || null,
      ville: f.ville.trim() || null,
      objet: f.objet.trim() || null,
      type_organisme: f.type_organisme.trim() || null,
      article_cgi: f.article_cgi.trim() || null,
      signataire_nom: f.signataire_nom.trim() || null,
      signataire_qualite: f.signataire_qualite.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error: err } = organisation
      ? await supabase.from("organisation").update(payload).eq("id", organisation.id)
      : await supabase.from("organisation").insert(payload);

    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setOk(true);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Association</h2>
        <p className="mt-1 text-xs text-muted">
          Informations légales figurant sur les reçus fiscaux (CERFA 11580).
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border bg-surface p-5"
      >
        <Field label="Dénomination">
          <input
            type="text"
            value={f.denomination}
            onChange={(e) => set("denomination", e.target.value)}
            className={inputCls}
            placeholder="Ex. Association Rémoise pour l'Instruction Libre (ARIL)"
          />
        </Field>
        <Field label="Adresse">
          <input type="text" value={f.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls} placeholder="N° et rue" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Code postal">
            <input type="text" value={f.code_postal} onChange={(e) => set("code_postal", e.target.value)} className={inputCls} />
          </Field>
          <div className="col-span-2">
            <Field label="Ville">
              <input type="text" value={f.ville} onChange={(e) => set("ville", e.target.value)} className={inputCls} />
            </Field>
          </div>
        </div>
        <Field label="Objet de l'association">
          <input type="text" value={f.objet} onChange={(e) => set("objet", e.target.value)} className={inputCls} placeholder="Ex. gestion et soutien de l'École du Saint-Enfant-Jésus" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nature de l'organisme">
            <input type="text" value={f.type_organisme} onChange={(e) => set("type_organisme", e.target.value)} className={inputCls} placeholder="Ex. organisme d'intérêt général à caractère éducatif" />
          </Field>
          <Field label="Article du CGI applicable">
            <input type="text" value={f.article_cgi} onChange={(e) => set("article_cgi", e.target.value)} className={inputCls} placeholder="Ex. 200 (particuliers) / 238 bis" />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Signataire (nom)">
            <input type="text" value={f.signataire_nom} onChange={(e) => set("signataire_nom", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Qualité du signataire">
            <input type="text" value={f.signataire_qualite} onChange={(e) => set("signataire_qualite", e.target.value)} className={inputCls} placeholder="Ex. Trésorier" />
          </Field>
        </div>

        {error && (
          <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{error}</p>
        )}
        <div className="flex items-center justify-end gap-3">
          {ok && <span className="text-sm text-positive">Enregistré ✓</span>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>

    </section>
  );
}

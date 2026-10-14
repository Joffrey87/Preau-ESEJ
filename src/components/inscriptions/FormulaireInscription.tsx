"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { versJpeg } from "@/lib/trombiPdf";
import { CLASSES_DEMANDEES, type DonneesInscription } from "@/lib/inscriptions";

const champ = "w-full rounded-lg border border-border bg-background px-3 py-2 text-[15px] outline-none focus:border-accent";

/**
 * Dossier d'inscription : l'enfant, ses parents, l'adresse, la photo. Utilisé par la préinscription (lien public) et par
 * la réinscription (Espace famille, pré-rempli). La photo est ramenée en JPEG puis déposée dans le stockage privé.
 */
export default function FormulaireInscription({
  initial,
  dossierPhoto,
  envoyer,
  libelleBouton,
}: {
  initial: DonneesInscription;
  /** Préfixe du chemin de la photo (preinscription ou reinscription/<famille>). */
  dossierPhoto: string;
  envoyer: (d: DonneesInscription, photo: string | null) => Promise<string | null>;
  libelleBouton: string;
}) {
  const sb = useMemo(() => createClient(), []);
  const [d, setD] = useState<DonneesInscription>(initial);
  const [photo, setPhoto] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const maj = (k: keyof DonneesInscription) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });

  const f = (k: keyof DonneesInscription, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="grid gap-1 text-[13px] text-muted">
      {label}
      <input value={d[k]} onChange={maj(k)} className={champ} {...props} />
    </label>
  );

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!d.enfant_prenom.trim() || !d.enfant_nom.trim()) return setErreur("Indiquez le prénom et le nom de l'enfant.");
    if (!d.parent1_courriel.trim() && !d.parent1_telephone.trim()) return setErreur("Indiquez au moins un courriel ou un téléphone pour vous joindre.");
    setEnvoi(true);
    try {
      let chemin: string | null = null;
      if (photo) {
        const jpeg = await versJpeg(photo);
        chemin = `${dossierPhoto}/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from("inscriptions").upload(chemin, jpeg, { contentType: "image/jpeg" });
        if (error) throw new Error(`Photo : ${error.message}`);
      }
      const err = await envoyer(d, chemin);
      if (err) setErreur(err);
    } catch (x) {
      setErreur(x instanceof Error ? x.message : "Envoi impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="space-y-5">
      <fieldset className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-semibold">L&apos;enfant</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {f("enfant_prenom", "Prénom *", { required: true, autoComplete: "off" })}
          {f("enfant_nom", "Nom *", { required: true, autoComplete: "off" })}
          {f("date_naissance", "Date de naissance", { type: "date" })}
          {f("lieu_naissance", "Lieu de naissance")}
          <label className="grid gap-1 text-[13px] text-muted">
            Classe demandée
            <select value={d.classe_demandee} onChange={maj("classe_demandee")} className={champ}>
              <option value="">—</option>
              {CLASSES_DEMANDEES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {f("ecole_actuelle", "École actuelle")}
        </div>
        <label className="grid gap-1 text-[13px] text-muted">
          Photo de l&apos;enfant
          <div className="flex items-center gap-3">
            {apercu && (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local du fichier choisi
              <img src={apercu} alt="" className="h-20 w-16 rounded-lg object-cover" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const x = e.target.files?.[0] ?? null;
                setPhoto(x);
                setApercu(x ? URL.createObjectURL(x) : null);
              }}
              className="text-[13px]"
            />
          </div>
        </label>
      </fieldset>

      {([1, 2] as const).map((k) => (
        <fieldset key={k} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <legend className="px-1 text-sm font-semibold">Parent {k}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {f(`parent${k}_prenom`, "Prénom")}
            {f(`parent${k}_nom`, "Nom")}
            {f(`parent${k}_telephone`, k === 1 ? "Téléphone *" : "Téléphone", { type: "tel", autoComplete: "tel" })}
            {f(`parent${k}_courriel`, k === 1 ? "Courriel *" : "Courriel", { type: "email", autoComplete: "email" })}
          </div>
        </fieldset>
      ))}

      <fieldset className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-semibold">Adresse postale</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {f("adresse", "Adresse", { autoComplete: "street-address" })}
          {f("cp_ville", "Code postal et ville")}
        </div>
        <label className="grid gap-1 text-[13px] text-muted">
          Remarques (santé, fratrie, questions…)
          <textarea value={d.remarques} onChange={maj("remarques")} rows={3} className={champ} />
        </label>
      </fieldset>

      <p className="text-[12px] text-muted">* Le prénom et le nom de l&apos;enfant sont obligatoires, ainsi qu&apos;un téléphone ou un courriel.</p>
      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      <button type="submit" disabled={envoi} className="w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-fg disabled:opacity-50 sm:w-auto">
        {envoi ? "Envoi…" : libelleBouton}
      </button>
    </form>
  );
}

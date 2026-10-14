"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { versJpeg } from "@/lib/trombiPdf";
import { pleineLargeur, sectionsPour, type Champ, type ConfigFormulaire, type TypeFormulaire } from "@/lib/formulaireInscription";

export type Reponses = Record<string, string>;

const champ = "w-full rounded-lg border border-border bg-background px-3 py-2 text-[15px] outline-none focus:border-accent";

/**
 * Dossier d'inscription construit d'après le formulaire de la Directrice (sections et champs du type de dossier).
 * Utilisé par la préinscription (lien public), la réinscription (Espace famille, pré-rempli), l'aperçu de la Directrice
 * (envoi désactivé) et la correction d'un dossier reçu. La photo est ramenée en JPEG ; pièces jointes déposées telles quelles.
 */
export default function FormulaireInscription({
  config,
  type,
  initial,
  dossierFichiers,
  envoyer,
  libelleBouton,
  apercu = false,
  correction = false,
  photoActuelle = false,
}: {
  config: ConfigFormulaire;
  type: TypeFormulaire;
  initial: Reponses;
  /** Préfixe des fichiers déposés (preinscription, reinscription/<famille> ou directrice). */
  dossierFichiers: string;
  envoyer: (d: Reponses, photo: string | null) => Promise<string | null>;
  libelleBouton: string;
  /** Aperçu de la Directrice : tout se remplit, rien ne s'envoie. */
  apercu?: boolean;
  /** Correction par la Directrice : les champs obligatoires ne bloquent pas (sauf le nom de l'enfant). */
  correction?: boolean;
  /** Le dossier a déjà une photo (correction) : le champ photo obligatoire est satisfait. */
  photoActuelle?: boolean;
}) {
  const sb = useMemo(() => createClient(), []);
  const sections = useMemo(() => sectionsPour(config, type), [config, type]);
  const [d, setD] = useState<Reponses>(initial);
  const [fichiers, setFichiers] = useState<Record<string, File | null>>({});
  const [apercus, setApercus] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vu, setVu] = useState(false);
  const champs = sections.flatMap((s) => s.champs);

  const valeur = (k: string) => d[k] ?? "";
  const poser = (k: string, v: string) => setD((x) => ({ ...x, [k]: v }));
  const choisirFichier = (ch: Champ, f: File | null) => {
    setFichiers((x) => ({ ...x, [ch.cle]: f }));
    setApercus((x) => ({ ...x, [ch.cle]: f && f.type.startsWith("image/") ? URL.createObjectURL(f) : "" }));
  };
  const rempli = (ch: Champ) =>
    ch.type === "photo" ? !!fichiers[ch.cle] || photoActuelle : ch.type === "fichier" ? !!fichiers[ch.cle] || !!valeur(ch.cle) : !!valeur(ch.cle).trim();

  async function deposer(f: File, jpeg: boolean) {
    const contenu = jpeg ? await versJpeg(f) : f;
    const ext = jpeg ? "jpg" : (f.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    const chemin = `${dossierFichiers}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("inscriptions").upload(chemin, contenu, { contentType: jpeg ? "image/jpeg" : f.type });
    if (error) throw new Error(`${f.name} : ${error.message}`);
    return chemin;
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setVu(true);
    if (apercu) return setErreur("Aperçu : l'envoi est réservé aux familles.");
    if (!valeur("enfant_prenom").trim() || !valeur("enfant_nom").trim()) return setErreur("Indiquez le prénom et le nom de l'enfant.");
    if (!correction) {
      const manquants = champs.filter((ch) => ch.obligatoire && !rempli(ch));
      if (manquants.length) return setErreur(`À compléter : ${manquants.map((ch) => ch.libelle).join(", ")}.`);
      if (champs.some((ch) => ch.cle === "parent1_courriel") && !valeur("parent1_courriel").trim() && !valeur("parent1_telephone").trim())
        return setErreur("Indiquez au moins un courriel ou un téléphone pour vous joindre.");
    }
    const tropGros = Object.values(fichiers).find((f) => f && f.size > 5 * 1024 * 1024 && !f.type.startsWith("image/"));
    if (tropGros) return setErreur(`${tropGros.name} dépasse 5 Mo.`);
    setEnvoi(true);
    try {
      const reponses = { ...d };
      let photo: string | null = null;
      for (const ch of champs) {
        const f = fichiers[ch.cle];
        if (!f) continue;
        if (ch.type === "photo") photo = await deposer(f, true);
        else reponses[ch.cle] = await deposer(f, false);
      }
      const err = await envoyer(reponses, photo);
      if (err) setErreur(err);
    } catch (x) {
      setErreur(x instanceof Error ? x.message : "Envoi impossible.");
    } finally {
      setEnvoi(false);
    }
  }

  const saisie = (ch: Champ) => {
    const manque = vu && !correction && ch.obligatoire && !rempli(ch);
    const cadre = `${champ} ${manque ? "border-negative" : ""}`;
    switch (ch.type) {
      case "texte_long":
        return <textarea value={valeur(ch.cle)} onChange={(e) => poser(ch.cle, e.target.value)} rows={3} className={cadre} />;
      case "choix":
        return (
          <select value={valeur(ch.cle)} onChange={(e) => poser(ch.cle, e.target.value)} className={cadre}>
            <option value="">—</option>
            {(ch.options ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      case "photo":
      case "fichier":
        return (
          <div className="flex items-center gap-3">
            {apercus[ch.cle] && (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local du fichier choisi
              <img src={apercus[ch.cle]} alt="" className="h-20 w-16 rounded-lg object-cover" />
            )}
            <input type="file" accept={ch.type === "photo" ? "image/*" : "image/*,application/pdf"} onChange={(e) => choisirFichier(ch, e.target.files?.[0] ?? null)} className="text-[13px]" />
            {ch.type === "fichier" && valeur(ch.cle) && !fichiers[ch.cle] && <span className="text-[12px] text-muted">Fichier déjà joint</span>}
            {ch.type === "photo" && photoActuelle && !fichiers[ch.cle] && <span className="text-[12px] text-muted">Photo déjà jointe</span>}
          </div>
        );
      default: {
        const t = { date: "date", courriel: "email", tel: "tel" }[ch.type as string] ?? "text";
        const auto = { courriel: "email", tel: "tel" }[ch.type as string] ?? "off";
        return <input type={t} value={valeur(ch.cle)} onChange={(e) => poser(ch.cle, e.target.value)} autoComplete={auto} className={cadre} />;
      }
    }
  };

  return (
    <form onSubmit={soumettre} className="space-y-5">
      {sections.map((s) => (
        <fieldset key={s.id} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <legend className="px-1 text-sm font-semibold">{s.titre}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {s.champs.map((ch) =>
              ch.type === "case" ? (
                <label key={ch.cle} className="flex items-start gap-2 text-[14px] sm:col-span-2">
                  <input type="checkbox" checked={valeur(ch.cle) === "oui"} onChange={(e) => poser(ch.cle, e.target.checked ? "oui" : "")} className="mt-1" />
                  <span>
                    {ch.libelle}
                    {ch.obligatoire && " *"}
                    {ch.aide && <span className="block text-[12px] text-muted">{ch.aide}</span>}
                  </span>
                </label>
              ) : (
                <label key={ch.cle} className={`grid gap-1 text-[13px] text-muted ${pleineLargeur(ch.type) ? "sm:col-span-2" : ""}`}>
                  <span>
                    {ch.libelle}
                    {ch.obligatoire && " *"}
                  </span>
                  {saisie(ch)}
                  {ch.aide && <span className="text-[12px]">{ch.aide}</span>}
                </label>
              ),
            )}
          </div>
        </fieldset>
      ))}

      {!correction && <p className="text-[12px] text-muted">* Champs obligatoires. Indiquez au moins un téléphone ou un courriel pour vous joindre.</p>}
      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      <button type="submit" disabled={envoi} className="w-full rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-fg disabled:opacity-50 sm:w-auto">
        {envoi ? "Envoi…" : libelleBouton}
      </button>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, inputCls } from "./GestionComptes";
import {
  SIGNATURES_ENSEIGNANTS_BUCKET,
  cheminSignatureEnseignant,
  type ProfilEnseignant,
} from "@/lib/profilEnseignant";

/**
 * Formulaire « Mon profil » pour un enseignant (ou la Directrice liée) :
 * nom / prénom en lecture seule ; adresse, téléphone et signature modifiables.
 */
export default function ProfilEnseignantForm({ initial }: { initial: ProfilEnseignant }) {
  const router = useRouter();
  const [adresse, setAdresse] = useState(initial.adresse ?? "");
  const [telephone, setTelephone] = useState(initial.telephone ?? "");
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [supprimerSignature, setSupprimerSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let annule = false;
    const urls: string[] = [];
    (async () => {
      if (!initial.signature_path) return;
      const supabase = createClient();
      const { data } = await supabase.storage.from(SIGNATURES_ENSEIGNANTS_BUCKET).download(initial.signature_path);
      if (!data || annule) return;
      const url = URL.createObjectURL(data);
      urls.push(url);
      setApercu(url);
    })();
    return () => {
      annule = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [initial.signature_path]);

  function choisir(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setErreur("La signature doit être une image PNG ou JPEG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErreur("Image trop lourde (2 Mo maximum).");
      return;
    }
    setErreur(null);
    setSupprimerSignature(false);
    setFichier(file);
    setApercu(URL.createObjectURL(file));
    setOk(false);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setOk(false);
    setBusy(true);
    try {
      const supabase = createClient();
      let signaturePath: string | null | undefined = undefined; // undefined = ne pas toucher

      if (supprimerSignature && initial.signature_path) {
        await supabase.storage.from(SIGNATURES_ENSEIGNANTS_BUCKET).remove([initial.signature_path]);
        signaturePath = "";
      } else if (fichier) {
        const path = cheminSignatureEnseignant(initial.id, fichier.type);
        // Remplace une ancienne extension éventuelle.
        if (initial.signature_path && initial.signature_path !== path) {
          await supabase.storage.from(SIGNATURES_ENSEIGNANTS_BUCKET).remove([initial.signature_path]);
        }
        const { error: upErr } = await supabase.storage
          .from(SIGNATURES_ENSEIGNANTS_BUCKET)
          .upload(path, fichier, { upsert: true, contentType: fichier.type });
        if (upErr) throw new Error("Envoi de la signature impossible : " + upErr.message);
        signaturePath = path;
      }

      const { error } = await supabase.rpc("mon_profil_enseignant_modifier", {
        p_adresse: adresse,
        p_telephone: telephone,
        // null = ne pas toucher ; "" = retirer ; chemin = nouvelle signature.
        p_signature: signaturePath === undefined ? null : signaturePath,
      });
      if (error) throw new Error(error.message);

      setFichier(null);
      setSupprimerSignature(false);
      setOk(true);
      router.refresh();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Enregistrement impossible.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={enregistrer} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Prénom">
          <input value={initial.prenom} readOnly className={`${inputCls} bg-surface-2 text-muted`} />
        </Field>
        <Field label="Nom">
          <input value={initial.nom} readOnly className={`${inputCls} bg-surface-2 text-muted`} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Adresse">
            <input
              value={adresse}
              onChange={(e) => {
                setAdresse(e.target.value);
                setOk(false);
              }}
              className={inputCls}
              placeholder="Rue, code postal, ville"
            />
          </Field>
        </div>
        <Field label="Numéro de téléphone">
          <input
            type="tel"
            value={telephone}
            onChange={(e) => {
              setTelephone(e.target.value);
              setOk(false);
            }}
            className={inputCls}
            placeholder="06 …"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-border p-3">
        <div className="mb-2 text-sm font-medium">Signature</div>
        <div className="flex h-20 items-center justify-center rounded-lg bg-white">
          {apercu && !supprimerSignature ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL d'objet locale
            <img src={apercu} alt="" className="max-h-16 max-w-full object-contain" />
          ) : (
            <span className="text-xs text-muted">Aucune signature — les documents s&apos;imprimeront sans</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-block cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
            {fichier ? `Remplacer (${fichier.name})` : apercu && !supprimerSignature ? "Remplacer…" : "Choisir une image…"}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => choisir(e.target.files?.[0])}
            />
          </label>
          {(apercu || initial.signature_path) && !supprimerSignature && (
            <button
              type="button"
              onClick={() => {
                setSupprimerSignature(true);
                setFichier(null);
                setApercu(null);
                setOk(false);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
            >
              Retirer
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          PNG ou JPEG, fond blanc de préférence, environ 600 × 200 pixels.
        </p>
      </div>

      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      <div className="flex items-center justify-end gap-3">
        {ok && <span className="text-sm text-positive">Enregistré ✓</span>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

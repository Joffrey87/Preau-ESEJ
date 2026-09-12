"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Field, inputCls } from "./GestionComptes";
import {
  MODELES_BUCKET,
  MODELE_DEFAUT,
  chargerModeleRecu,
  invaliderModeleRecu,
  type ModeleRecuRow,
} from "@/lib/modeleRecu";
import { construireRecuPdf } from "@/lib/recuPdf";

type Champs = {
  president_nom: string;
  tresorier_nom: string;
  adresse_rue: string;
  adresse_cp_ville: string;
  courriel_contact: string;
};

const SIGNATURES = {
  president: { path: "signatures/president.png", label: "Signature du Président" },
  tresorier: { path: "signatures/tresorier.png", label: "Signature du Trésorier" },
} as const;
type Qui = keyof typeof SIGNATURES;

/**
 * Boîte d'édition du modèle de reçu fiscal : signataires, adresse de l'école,
 * contact donateurs, et les deux signatures (image PNG ou JPEG).
 *
 * Tout ce qui n'est pas renseigné retombe sur le modèle ESEJ livré avec
 * l'application, si bien qu'un reçu peut toujours être produit.
 */
export default function ModeleRecuDialog({
  initial,
  onFermer,
}: {
  initial: ModeleRecuRow | null;
  onFermer: () => void;
}) {
  const [f, setF] = useState<Champs>({
    president_nom: initial?.president_nom ?? MODELE_DEFAUT.presidentNom,
    tresorier_nom: initial?.tresorier_nom ?? MODELE_DEFAUT.tresorierNom,
    adresse_rue: initial?.adresse_rue ?? MODELE_DEFAUT.adresseRue,
    adresse_cp_ville: initial?.adresse_cp_ville ?? MODELE_DEFAUT.adresseCpVille,
    courriel_contact: initial?.courriel_contact ?? MODELE_DEFAUT.courrielContact,
  });
  const set = (k: keyof Champs, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Fichiers choisis mais pas encore envoyés, et aperçus (URL d'objet).
  const [fichiers, setFichiers] = useState<Partial<Record<Qui, File>>>({});
  const [apercus, setApercus] = useState<Partial<Record<Qui, string>>>({});
  const [busy, setBusy] = useState<"enregistrer" | "apercu" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  // Aperçu des signatures déjà en place dans le bucket.
  useEffect(() => {
    let annule = false;
    const urls: string[] = [];
    (async () => {
      const supabase = createClient();
      for (const qui of ["president", "tresorier"] as Qui[]) {
        const path = qui === "president" ? initial?.signature_president_path : initial?.signature_tresorier_path;
        if (!path) continue;
        const { data } = await supabase.storage.from(MODELES_BUCKET).download(path);
        if (!data || annule) continue;
        const url = URL.createObjectURL(data);
        urls.push(url);
        setApercus((a) => ({ ...a, [qui]: url }));
      }
    })();
    return () => {
      annule = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [initial]);

  function choisir(qui: Qui, file: File | undefined) {
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
    setFichiers((p) => ({ ...p, [qui]: file }));
    setApercus((a) => ({ ...a, [qui]: URL.createObjectURL(file) }));
  }

  async function envoyerSignatures(): Promise<Partial<Record<`signature_${Qui}_path`, string>>> {
    const supabase = createClient();
    const chemins: Partial<Record<`signature_${Qui}_path`, string>> = {};
    for (const qui of Object.keys(fichiers) as Qui[]) {
      const file = fichiers[qui]!;
      const { error } = await supabase.storage
        .from(MODELES_BUCKET)
        .upload(SIGNATURES[qui].path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(`Envoi de la ${SIGNATURES[qui].label.toLowerCase()} impossible : ${error.message}`);
      chemins[`signature_${qui}_path`] = SIGNATURES[qui].path;
    }
    return chemins;
  }

  async function enregistrer() {
    setErreur(null);
    setOk(false);
    setBusy("enregistrer");
    try {
      const chemins = await envoyerSignatures();
      const supabase = createClient();
      const { error } = await supabase.from("modele_recu").upsert({
        id: 1,
        ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null])),
        ...chemins,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error("Enregistrement impossible : " + error.message);
      invaliderModeleRecu();
      setFichiers({});
      setOk(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible.");
    }
    setBusy(null);
  }

  /** Reçu fictif composé avec les valeurs du formulaire, ouvert dans un onglet. */
  async function apercuPdf() {
    setErreur(null);
    setBusy("apercu");
    try {
      const lire = async (qui: Qui) => {
        const file = fichiers[qui];
        if (file) return file.arrayBuffer();
        return (await chargerModeleRecu(createClient()))[qui === "president" ? "signaturePresident" : "signatureTresorier"];
      };
      const octets = await construireRecuPdf(
        {
          recu_numero: "RE_000000_" + new Date().toISOString().slice(0, 10).replace(/-/g, ""),
          donateur_titre: "Madame",
          donateur_nom: "Exemple",
          donateur_prenom: "Marie",
          raison_sociale: null,
          est_personne_morale: false,
          adresse: "1 rue de l'Exemple",
          cp_ville: "51100 Reims",
          montant: 150,
          date_don: new Date().toISOString().slice(0, 10),
          mode_paiement: "Virement",
        },
        {
          modele: {
            presidentNom: f.president_nom.trim() || MODELE_DEFAUT.presidentNom,
            tresorierNom: f.tresorier_nom.trim() || MODELE_DEFAUT.tresorierNom,
            adresseRue: f.adresse_rue.trim() || MODELE_DEFAUT.adresseRue,
            adresseCpVille: f.adresse_cp_ville.trim() || MODELE_DEFAUT.adresseCpVille,
            courrielContact: f.courriel_contact.trim() || MODELE_DEFAUT.courrielContact,
            signaturePresident: await lire("president"),
            signatureTresorier: await lire("tresorier"),
          },
        },
      );
      const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: "application/pdf" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Aperçu impossible.");
    }
    setBusy(null);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Modèle de reçu fiscal</h2>
            <p className="mt-1 text-sm text-muted">
              Signataires, adresse et contact imprimés sur chaque reçu. La lettre et les mentions
              légales ne changent pas.
            </p>
          </div>
          <button type="button" onClick={onFermer} className="text-muted hover:text-foreground" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Président (Prénom Nom)">
            <input value={f.president_nom} onChange={(e) => set("president_nom", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Trésorier (Prénom Nom)">
            <input value={f.tresorier_nom} onChange={(e) => set("tresorier_nom", e.target.value)} className={inputCls} />
          </Field>

          {(["president", "tresorier"] as Qui[]).map((qui) => (
            <div key={qui} className="rounded-xl border border-border p-3">
              <div className="mb-2 text-sm font-medium">{SIGNATURES[qui].label}</div>
              <div className="flex h-16 items-center justify-center rounded-lg bg-white">
                {apercus[qui] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL d'objet locale
                  <img src={apercus[qui]} alt="" className="max-h-14 max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted">Aucune signature — le reçu s&apos;imprimera sans</span>
                )}
              </div>
              <label className="mt-2 inline-block cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2">
                {fichiers[qui] ? `Remplacer (${fichiers[qui]!.name})` : "Choisir une image…"}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => choisir(qui, e.target.files?.[0])}
                />
              </label>
            </div>
          ))}

          <Field label="Adresse de l'école (rue)">
            <input value={f.adresse_rue} onChange={(e) => set("adresse_rue", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Code postal et ville">
            <input value={f.adresse_cp_ville} onChange={(e) => set("adresse_cp_ville", e.target.value)} className={inputCls} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Courriel de contact donateurs">
              <input
                type="email"
                value={f.courriel_contact}
                onChange={(e) => set("courriel_contact", e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted">
          Conseil : une signature scannée sur fond blanc, recadrée au plus près, d&apos;environ 600 × 200 pixels.
        </p>

        {erreur && <p className="mt-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
        {ok && <p className="mt-3 rounded-lg bg-positive/10 px-3 py-2 text-sm text-positive">Modèle enregistré ✓</p>}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={apercuPdf}
            disabled={busy !== null}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
          >
            {busy === "apercu" ? "Composition…" : "Aperçu PDF"}
          </button>
          <button type="button" onClick={onFermer} className="rounded-lg px-4 py-2 text-sm text-muted hover:text-foreground">
            Fermer
          </button>
          <button
            type="button"
            onClick={enregistrer}
            disabled={busy !== null}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy === "enregistrer" ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

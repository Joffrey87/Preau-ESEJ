"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { compresserPhoto } from "@/lib/compresserPhoto";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import {
  BUCKET_FACTURES,
  STATUTS_FACTURE,
  bouton,
  champ,
  libelleStatut,
  nomContact,
  nombre,
  type ContactEvenement,
  type EvenementCaisse,
  type FactureFournisseur,
} from "@/lib/evenement";
import { useEnregistrer } from "./useEnregistrer";

const NOUVEAU = "__nouveau__";
/** Catégorie de dépense proposée par défaut (si elle existe dans la Comptabilité). */
const CATEGORIE_DEFAUT = "fournitures pour ventes diverses";
const normaliser = (t: string | null | undefined) =>
  (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type Formulaire = {
  fournisseur_id: string;
  nv_entreprise: string;
  nv_nom: string;
  nv_prenom: string;
  montant: string;
  date: string;
  numero: string;
  libelle: string;
  categorie_id: string;
  doute: boolean;
  evenement_id: string;
  statut: string;
  notes: string;
};
type Candidate = { id: string; date_operation: string; libelle: string; montant: number };
type Lue = {
  fournisseur_entreprise: string | null;
  fournisseur_nom: string | null;
  fournisseur_prenom: string | null;
  date: string | null;
  numero: string | null;
  montant_ttc: number | null;
  libelle: string | null;
};
export type CategorieDepense = { id: string; nom: string };

/**
 * Factures fournisseurs (profil Événement ; réutilisable côté Trésorier). `fournisseurFixe` : fiche d'un fournisseur.
 * Import d'une facture (photo ou fichier) lue automatiquement, puis tout reste modifiable.
 * « Payée » n'est jamais choisi à la main : la base le pose quand le Trésorier relie l'opération bancaire.
 */
/** Événement par défaut d'une facture : celui dont la date est la plus proche d'aujourd'hui (avant ou après). */
export function evenementLePlusProche(evenements: Pick<EvenementCaisse, "id" | "date">[]): string {
  const auj = Date.parse(new Date().toISOString().slice(0, 10));
  let meilleur = "";
  let ecart = Infinity;
  for (const e of evenements) {
    const d = Math.abs(Date.parse(e.date) - auj);
    if (d < ecart) {
      ecart = d;
      meilleur = e.id;
    }
  }
  return meilleur;
}

export default function FacturesFournisseurs({
  peutModifier,
  estTresorier,
  factures,
  fournisseurs,
  evenements,
  fournisseurFixe,
  evenementFixe,
  categories = [],
}: {
  peutModifier: boolean;
  estTresorier: boolean;
  factures: FactureFournisseur[];
  fournisseurs: ContactEvenement[];
  evenements: Pick<EvenementCaisse, "id" | "nom" | "date">[];
  fournisseurFixe?: string;
  evenementFixe?: string;
  categories?: CategorieDepense[];
}) {
  const supabase = createClient();
  const { erreur, setErreur, occupe, executer } = useEnregistrer();
  const categorieDefaut = categories.find((c) => normaliser(c.nom) === CATEGORIE_DEFAUT)?.id ?? "";
  const vide = (): Formulaire => ({
    fournisseur_id: fournisseurFixe ?? "",
    nv_entreprise: "",
    nv_nom: "",
    nv_prenom: "",
    montant: "",
    date: new Date().toISOString().slice(0, 10),
    numero: "",
    libelle: "",
    categorie_id: categorieDefaut,
    doute: false,
    evenement_id: evenementFixe ?? evenementLePlusProche(evenements),
    statut: "pas_importee",
    notes: "",
  });
  const [f, setF] = useState<Formulaire>(vide);
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [saisie, setSaisie] = useState(false);
  const [lecture, setLecture] = useState(false);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [edition, setEdition] = useState<FactureFournisseur | null>(null);
  const [candidates, setCandidates] = useState<{ facture: string; ops: Candidate[] } | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fichierRef = useRef<HTMLInputElement>(null);
  const nomF = (id: string) => {
    const c = fournisseurs.find((x) => x.id === id);
    return c ? nomContact(c) : "—";
  };
  const nomEv = (id: string | null) => evenements.find((e) => e.id === id)?.nom ?? "—";
  const nomCat = (id: string | null) => categories.find((c) => c.id === id)?.nom ?? "—";
  const formulaireVisible = saisie || !!fichier || !!edition;

  function reinitialiser() {
    setEdition(null);
    setSaisie(false);
    choisirFichier(null);
    setErreurLecture(null);
    setF(vide());
  }

  /** Cherche le fournisseur lu dans le Carnet (entreprise, ou prénom + nom). */
  function retrouverFournisseur(l: Lue): string | null {
    const ent = normaliser(l.fournisseur_entreprise);
    const pers = normaliser([l.fournisseur_prenom, l.fournisseur_nom].filter(Boolean).join(" "));
    const persInv = normaliser([l.fournisseur_nom, l.fournisseur_prenom].filter(Boolean).join(" "));
    const c = fournisseurs.find((x) => {
      const rs = normaliser(x.raison_sociale);
      const pn = normaliser([x.prenom, x.nom].filter(Boolean).join(" "));
      return (ent && (rs === ent || normaliser(x.nom) === ent)) || (pers && (pn === pers || pn === persInv));
    });
    return c?.id ?? null;
  }

  async function choisirFichier(brut: File | null) {
    setErreurLecture(null);
    if (apercu) URL.revokeObjectURL(apercu);
    if (cameraRef.current) cameraRef.current.value = "";
    if (fichierRef.current) fichierRef.current.value = "";
    if (!brut) {
      setFichier(null);
      setApercu(null);
      return;
    }
    const fic = await compresserPhoto(brut);
    setFichier(fic);
    setApercu(fic.type.startsWith("image/") ? URL.createObjectURL(fic) : null);
    if (edition) return; // remplacement du fichier d'une facture existante : pas de relecture
    setLecture(true);
    try {
      const fd = new FormData();
      fd.append("fichier", fic);
      const rep = await fetch("/api/lecture-facture", { method: "POST", body: fd });
      const j = (await rep.json().catch(() => ({}))) as Lue & { erreur?: string };
      if (!rep.ok) throw new Error(j.erreur ?? "La lecture automatique a échoué.");
      const trouve = fournisseurFixe ?? retrouverFournisseur(j);
      const aLu = j.fournisseur_entreprise || j.fournisseur_nom;
      setF((p) => ({
        ...p,
        fournisseur_id: trouve ?? (aLu ? NOUVEAU : p.fournisseur_id),
        nv_entreprise: j.fournisseur_entreprise ?? "",
        nv_nom: j.fournisseur_nom ?? "",
        nv_prenom: j.fournisseur_prenom ?? "",
        montant: j.montant_ttc != null ? String(j.montant_ttc).replace(".", ",") : p.montant,
        date: j.date ?? p.date,
        numero: j.numero ?? p.numero,
        libelle: j.libelle ?? p.libelle,
      }));
    } catch (e) {
      setErreurLecture(e instanceof Error ? e.message : "La lecture automatique a échoué.");
    } finally {
      setLecture(false);
    }
  }

  /** Crée le fournisseur lu dans le Carnet d'adresses s'il n'existe pas encore. */
  async function idFournisseur(): Promise<string | null> {
    if (f.fournisseur_id !== NOUVEAU) return f.fournisseur_id;
    const ent = f.nv_entreprise.trim();
    const { data, error } = await supabase.rpc("enregistrer_contact_evenement", {
      p_id: null,
      p_categorie: "vendeur",
      p_personne_morale: !!ent,
      p_nom: f.nv_nom.trim() || ent,
      p_prenom: f.nv_prenom.trim() || null,
      p_raison_sociale: ent || null,
      p_courriel: null,
      p_telephone: null,
      p_adresse: null,
      p_cp_ville: null,
      p_notes: null,
    });
    if (error) {
      setErreur(`Fournisseur non créé : ${error.message}`);
      return null;
    }
    return data as string;
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    const fournisseurId = await idFournisseur();
    if (!fournisseurId) return;
    let chemin = edition?.fichier ?? null;
    if (fichier) {
      const ext = fichier.name.split(".").pop()?.toLowerCase() ?? "pdf";
      chemin = `${fournisseurId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_FACTURES).upload(chemin, fichier, { contentType: fichier.type });
      if (error) return setErreur(`Fichier non envoyé : ${error.message}`);
    }
    const ligne = {
      fournisseur_id: fournisseurId,
      montant: nombre(f.montant),
      date: f.date,
      numero: f.numero.trim() || null,
      libelle: f.libelle.trim() || null,
      categorie_id: f.categorie_id || null,
      doute: f.doute,
      evenement_id: f.evenement_id || null,
      fichier: chemin,
      notes: f.notes.trim() || null,
      ...(edition?.statut === "payee" ? {} : { statut: f.statut }),
    };
    const ok = await executer(() =>
      edition
        ? supabase.from("factures_fournisseurs").update(ligne).eq("id", edition.id)
        : supabase.from("factures_fournisseurs").insert(ligne),
    );
    if (ok) reinitialiser();
  }

  async function ouvrir(chemin: string) {
    const { data, error } = await supabase.storage.from(BUCKET_FACTURES).createSignedUrl(chemin, 120);
    if (error || !data) return setErreur("Fichier introuvable.");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function chercherOperations(facture: string) {
    const { data, error } = await supabase.rpc("operations_candidates_facture", { p_facture: facture });
    if (error) return setErreur(error.message);
    setCandidates({ facture, ops: (data ?? []) as Candidate[] });
  }

  async function lier(facture: string, operation: string | null) {
    const ok = await executer(() => supabase.from("factures_fournisseurs").update({ operation_id: operation }).eq("id", facture));
    if (ok) setCandidates(null);
  }

  const tuile =
    "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-left focus-within:ring-2 focus-within:ring-gold focus-within:ring-offset-2";

  return (
    <div className="space-y-6">
      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
      {peutModifier && (
        <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">{edition ? "Modifier la facture" : "Nouvelle facture"}</h2>
          {!edition && (
            <div className="grid max-w-md grid-cols-2 gap-2">
              <label className={`${tuile} border-accent bg-accent text-accent-fg hover:opacity-90`}>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => choisirFichier(e.target.files?.[0] ?? null)} />
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 shrink-0"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3.5" /></svg>
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">Prendre une photo</span>
                  <span className="text-xs opacity-80">Appareil photo</span>
                </span>
              </label>
              <label className={`${tuile} border-border bg-surface text-accent hover:bg-surface-2`}>
                <input ref={fichierRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => choisirFichier(e.target.files?.[0] ?? null)} />
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">Choisir un fichier</span>
                  <span className="text-xs text-muted">Image ou PDF</span>
                </span>
              </label>
            </div>
          )}
          {fichier && (
            <div className="flex max-w-md items-center gap-3 rounded-lg border border-border bg-surface-2 p-2 text-sm">
              {apercu ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={apercu} alt="Aperçu de la facture" className="h-14 w-14 rounded object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded bg-surface text-xs font-semibold text-muted">PDF</span>
              )}
              <span className="min-w-0 flex-1 truncate">{fichier.name}</span>
              <button type="button" className="rounded border border-border px-2 py-0.5 text-xs hover:bg-surface" onClick={() => choisirFichier(null)}>
                Retirer
              </button>
            </div>
          )}
          {!formulaireVisible && (
            <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2" onClick={() => setSaisie(true)}>
              Saisie manuelle
            </button>
          )}
          {lecture && (
            <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent" role="status">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
              Lecture de la facture en cours…
            </p>
          )}
          {erreurLecture && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-negative" role="alert">{erreurLecture}</p>}

          {formulaireVisible && (
            <form onSubmit={enregistrer} className="grid gap-3 sm:grid-cols-3">
              {!fournisseurFixe && (
                <select required aria-label="Fournisseur" value={f.fournisseur_id} onChange={(e) => setF({ ...f, fournisseur_id: e.target.value })} className={champ}>
                  <option value="">Fournisseur…</option>
                  <option value={NOUVEAU}>+ Nouveau fournisseur</option>
                  {fournisseurs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {nomContact(c)}
                    </option>
                  ))}
                </select>
              )}
              {f.fournisseur_id === NOUVEAU && (
                <div className="grid gap-2 sm:col-span-2 sm:grid-cols-3">
                  <input aria-label="Entreprise" placeholder="Entreprise" value={f.nv_entreprise} onChange={(e) => setF({ ...f, nv_entreprise: e.target.value })} className={champ} />
                  <input aria-label="Nom" placeholder="Nom" value={f.nv_nom} onChange={(e) => setF({ ...f, nv_nom: e.target.value })} className={champ} />
                  <input aria-label="Prénom" placeholder="Prénom" value={f.nv_prenom} onChange={(e) => setF({ ...f, nv_prenom: e.target.value })} className={champ} />
                </div>
              )}
              <input required aria-label="Date de la facture" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={champ} />
              <input aria-label="N° de facture" placeholder="N° de facture" value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} className={champ} />
              <input required aria-label="Montant TTC" inputMode="decimal" placeholder="Montant TTC (€)" value={f.montant} onChange={(e) => setF({ ...f, montant: e.target.value })} className={champ} />
              <input aria-label="Libellé" placeholder="Libellé court" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} className={champ} />
              <div className="flex items-center gap-3">
                <select aria-label="Catégorie de dépense" value={f.categorie_id} onChange={(e) => setF({ ...f, categorie_id: e.target.value })} className={champ}>
                  <option value="">Catégorie…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
                <label className="flex shrink-0 items-center gap-1 text-sm">
                  <input type="checkbox" checked={f.doute} onChange={(e) => setF({ ...f, doute: e.target.checked })} />
                  Doute
                </label>
              </div>
              <select aria-label="Événement" value={f.evenement_id} onChange={(e) => setF({ ...f, evenement_id: e.target.value })} className={champ}>
                <option value="">Aucun événement</option>
                {evenements.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.nom} · {formatDate(ev.date)}
                  </option>
                ))}
              </select>
              {edition?.statut === "payee" ? (
                <p className="self-center text-sm text-positive">Payée (opération bancaire liée)</p>
              ) : (
                <select aria-label="Statut" value={fichier && f.statut === "pas_importee" ? "recue_a_payer" : f.statut} onChange={(e) => setF({ ...f, statut: e.target.value })} className={champ}>
                  {STATUTS_FACTURE.filter((s) => s.v !== "payee").map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
              )}
              <input aria-label="Notes" placeholder="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={champ} />
              {edition && (
                <input type="file" aria-label="Remplacer le fichier" accept="application/pdf,image/*" onChange={(e) => choisirFichier(e.target.files?.[0] ?? null)} className="text-sm sm:col-span-3" />
              )}
              <div className="flex gap-3 sm:col-span-3">
                <button type="submit" disabled={occupe || lecture} className={bouton}>
                  {edition ? "Enregistrer" : "Ajouter"}
                </button>
                {/* Visible seulement après saisie manuelle, import, ou édition (formulaireVisible). */}
                <button type="button" onClick={reinitialiser} className="text-sm text-muted hover:underline">
                  Annuler
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr>
              <th className="px-4 py-2">Date</th>
              {!fournisseurFixe && <th className="px-4 py-2">Fournisseur</th>}
              <th className="px-4 py-2">N°</th>
              <th className="px-4 py-2">Libellé · catégorie</th>
              <th className="px-4 py-2">Événement</th>
              <th className="px-4 py-2 text-right">Montant</th>
              <th className="px-4 py-2">Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {factures.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted">
                  Aucune facture.
                </td>
              </tr>
            )}
            {factures.map((x) => {
              const st = libelleStatut(x.statut);
              return (
                <tr key={x.id} className="border-t border-border align-top">
                  <td className="px-4 py-2">{formatDate(x.date)}</td>
                  {!fournisseurFixe && <td className="px-4 py-2 font-medium">{nomF(x.fournisseur_id)}</td>}
                  <td className="px-4 py-2">{x.numero ?? "—"}</td>
                  <td className="px-4 py-2">
                    <span className="block">{x.libelle ?? "—"}</span>
                    <span className="text-xs text-muted">
                      {nomCat(x.categorie_id)}
                      {x.doute && <span className="ml-1 rounded bg-gold-soft px-1 text-foreground">Doute</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {x.evenement_id && !evenementFixe ? (
                      <Link href={`/evenement/${x.evenement_id}`} className="text-accent hover:underline">
                        {nomEv(x.evenement_id)}
                      </Link>
                    ) : (
                      nomEv(x.evenement_id)
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{formatEuros(Number(x.montant))}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${st?.cls ?? ""}`}>{st?.l ?? x.statut}</span>
                  </td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-2 text-right">
                    {x.fichier && (
                      <button type="button" onClick={() => ouvrir(x.fichier!)} className="text-accent hover:underline">
                        Fichier
                      </button>
                    )}
                    {peutModifier && (
                      <button
                        type="button"
                        onClick={() => {
                          setEdition(x);
                          choisirFichier(null);
                          setF({
                            ...vide(),
                            fournisseur_id: x.fournisseur_id,
                            libelle: x.libelle ?? "",
                            categorie_id: x.categorie_id ?? "",
                            doute: x.doute,
                            montant: String(x.montant),
                            date: x.date,
                            numero: x.numero ?? "",
                            evenement_id: x.evenement_id ?? "",
                            statut: x.statut,
                            notes: x.notes ?? "",
                          });
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="text-accent hover:underline"
                      >
                        Modifier
                      </button>
                    )}
                    {estTresorier &&
                      (x.operation_id ? (
                        <button type="button" onClick={() => lier(x.id, null)} className="text-muted hover:underline">
                          Délier l&apos;opération
                        </button>
                      ) : (
                        <button type="button" onClick={() => chercherOperations(x.id)} className="text-accent hover:underline">
                          Lier une opération
                        </button>
                      ))}
                    {candidates?.facture === x.id && (
                      <div className="mt-2 space-y-1 text-left">
                        {candidates.ops.length === 0 && <p className="text-xs text-muted">Aucun débit de ce montant à ±45 jours.</p>}
                        {candidates.ops.map((o) => (
                          <button key={o.id} type="button" onClick={() => lier(x.id, o.id)} className="block w-full rounded border border-border px-2 py-1 text-left text-xs hover:bg-surface-2">
                            {formatDate(o.date_operation)} · {o.libelle} · −{formatEuros(Number(o.montant))}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

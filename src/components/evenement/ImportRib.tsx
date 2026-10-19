"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compresserPhoto } from "@/lib/compresserPhoto";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { champ, nomContact, type ContactEvenement } from "@/lib/evenement";
import { BUCKET_RIBS, bicValide, ibanFormate, ibanNu, ibanValide, titulaireDifferent } from "@/lib/iban";

export type RibLu = { iban: string | null; bic: string | null; titulaire: string | null };

/** Vérification et enregistrement d'un RIB lu (ou saisi). Un IBAN différent de l'IBAN actif reste « à confirmer » par le Trésorier. */
export function BlocRib({
  fournisseurs,
  fournisseurInitial,
  fixe,
  fichier,
  lu,
  onFini,
}: {
  fournisseurs: ContactEvenement[];
  fournisseurInitial: string;
  fixe?: boolean;
  fichier: File | null;
  lu: RibLu;
  onFini?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [fournisseur, setFournisseur] = useState(fournisseurInitial);
  const [iban, setIban] = useState(lu.iban ? ibanFormate(lu.iban) : "");
  const [bic, setBic] = useState(lu.bic ?? "");
  const [titulaire, setTitulaire] = useState(lu.titulaire ?? "");
  const [verifie, setVerifie] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);
  const c = fournisseurs.find((x) => x.id === fournisseur);
  const ibanOk = ibanValide(iban);
  const bicOk = !bic.trim() || bicValide(bic);
  const alerteTitulaire = !!c && titulaireDifferent(titulaire, `${c.raison_sociale ?? ""} ${c.prenom ?? ""} ${c.nom}`);
  const actuelFin = c?.iban_masque?.slice(-4);
  const change = !!c?.rib_renseigne && !!actuelFin && ibanNu(iban).slice(-4) !== actuelFin;

  async function enregistrer() {
    if (!c) return;
    setOccupe(true);
    setMessage(null);
    let chemin: string | null = null;
    if (fichier) {
      const ext = fichier.name.split(".").pop()?.toLowerCase() ?? "pdf";
      chemin = `${c.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_RIBS).upload(chemin, fichier, { contentType: fichier.type });
      if (error) {
        setOccupe(false);
        return setMessage({ ok: false, t: `Fichier du RIB non envoyé : ${error.message}` });
      }
    }
    const { data, error } = await supabase.rpc("fournisseur_rib_importer", {
      p_contact: c.id,
      p_iban: iban,
      p_bic: bic.trim() || null,
      p_titulaire: titulaire.trim() || null,
      p_fichier: chemin,
    });
    setOccupe(false);
    if (error) return setMessage({ ok: false, t: `RIB non enregistré : ${error.message}` });
    setMessage({
      ok: true,
      t:
        data === "a_confirmer"
          ? "Nouvel IBAN enregistré « à confirmer » : l'IBAN actuel reste utilisé tant que le Trésorier ne l'a pas validé."
          : data === "identique"
            ? "Cet IBAN est déjà celui du fournisseur : justificatif ajouté."
            : "RIB enregistré.",
    });
    router.refresh();
    onFini?.();
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
      <h3 className="font-semibold">RIB du fournisseur</h3>
      {!fixe && (
        <select aria-label="Fournisseur du RIB" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} className={champ}>
          <option value="">Fournisseur…</option>
          {fournisseurs.map((x) => (
            <option key={x.id} value={x.id}>{nomContact(x)}</option>
          ))}
        </select>
      )}
      {!fixe && !fournisseur && <p className="text-xs text-muted">Choisissez le fournisseur (s&apos;il est nouveau, enregistrez d&apos;abord la facture ou créez-le dans le Carnet d&apos;adresses).</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <input aria-label="IBAN" placeholder="IBAN" value={iban} onChange={(e) => { setIban(e.target.value); setVerifie(false); }} className={`${champ} font-mono sm:col-span-2 ${iban && !ibanOk ? "border-negative" : ""}`} />
        <input aria-label="BIC" placeholder="BIC" value={bic} onChange={(e) => setBic(e.target.value.toUpperCase())} className={`${champ} font-mono ${!bicOk ? "border-negative" : ""}`} />
        <input aria-label="Titulaire du compte" placeholder="Titulaire du compte" value={titulaire} onChange={(e) => setTitulaire(e.target.value)} className={`${champ} sm:col-span-3`} />
      </div>
      {iban && (
        <p className={`text-sm ${ibanOk ? "text-positive" : "text-negative"}`}>
          {ibanOk ? "✓ Clé de contrôle de l'IBAN correcte." : "✗ IBAN invalide (clé de contrôle incorrecte) : vérifiez chaque caractère."}
        </p>
      )}
      {!bicOk && <p className="text-sm text-negative">BIC invalide (8 ou 11 caractères).</p>}
      {alerteTitulaire && (
        <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
          ⚠ Le titulaire du compte (« {titulaire} ») ne correspond pas au nom du fournisseur (« {c ? nomContact(c) : ""} »). Vérifiez avant d&apos;enregistrer.
        </p>
      )}
      {change && (
        <p className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Ce fournisseur a déjà un IBAN (se terminant par {actuelFin}). Le nouvel IBAN restera « à confirmer » jusqu&apos;à validation par le Trésorier.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={verifie} onChange={(e) => setVerifie(e.target.checked)} />
        J&apos;ai vérifié l&apos;IBAN, le BIC et le titulaire avec le document.
      </label>
      <button type="button" disabled={!c || !ibanOk || !bicOk || !verifie || occupe} onClick={enregistrer} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50">
        {occupe ? "Enregistrement…" : "Enregistrer le RIB"}
      </button>
      {message && <p className={`text-sm ${message.ok ? "text-positive" : "text-negative"}`} role="status">{message.t}</p>}
    </div>
  );
}

/** Bouton d'import d'un RIB depuis la fiche d'un fournisseur (lecture automatique, puis vérification). */
export function ImportRibFournisseur({ contact }: { contact: ContactEvenement }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [lu, setLu] = useState<RibLu | null>(null);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [cle, setCle] = useState(0);
  async function choisir(brut: File | null) {
    if (ref.current) ref.current.value = "";
    setErreur(null);
    setLu(null);
    if (!brut) return;
    const fic = await compresserPhoto(brut);
    setFichier(fic);
    setLecture(true);
    try {
      const fd = new FormData();
      fd.append("fichier", fic);
      const rep = await fetch("/api/lecture-facture", { method: "POST", body: fd });
      const j = (await rep.json().catch(() => ({}))) as RibLu & { erreur?: string; detail?: string; contient_rib?: boolean };
      if (!rep.ok) throw new Error([j.erreur ?? `La lecture automatique a échoué (HTTP ${rep.status}).`, j.detail && `Détail : ${j.detail}`].filter(Boolean).join(" "));
      if (!j.iban) setErreur("Aucun IBAN lu sur ce document : saisissez-le ci-dessous.");
      setLu({ iban: j.iban, bic: j.bic, titulaire: j.titulaire });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La lecture automatique a échoué.");
      setLu({ iban: null, bic: null, titulaire: null });
    } finally {
      setLecture(false);
      setCle((k) => k + 1);
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-accent hover:bg-surface-2">
        <input ref={ref} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => choisir(e.target.files?.[0] ?? null)} />
        Importer un RIB (photo ou fichier)
      </label>
      {lecture && <p className="text-sm text-accent" role="status">Lecture du RIB en cours…</p>}
      {erreur && <p className="text-sm text-negative" role="alert">{erreur}</p>}
      {lu && <BlocRib key={cle} fournisseurs={[contact]} fournisseurInitial={contact.id} fixe fichier={fichier} lu={lu} />}
    </div>
  );
}

export type RibAttente = {
  id: string;
  contact_id: string;
  fournisseur: string;
  telephone: string | null;
  iban_actuel: string | null;
  iban: string;
  bic: string | null;
  titulaire: string | null;
  titulaire_different: boolean;
  fichier: string | null;
  cree_le: string;
};

/** Trésorier : nouveaux IBAN en attente de validation (anti-fraude). */
export function RibsAConfirmer({ liste }: { liste: RibAttente[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  async function traiter(id: string, accepter: boolean) {
    if (accepter && !window.confirm("Avez-vous appelé le fournisseur (à un numéro connu, pas celui du document) pour confirmer ce nouvel IBAN ?")) return;
    const { error } = await supabase.rpc("fournisseur_rib_traiter", { p_rib: id, p_accepter: accepter });
    if (error) return setErreur(error.message);
    router.refresh();
  }
  async function ouvrir(chemin: string) {
    const { data } = await supabase.storage.from(BUCKET_RIBS).createSignedUrl(chemin, 120);
    if (data) window.open(data.signedUrl, "_blank", "noopener");
  }
  if (!liste.length) return null;
  return (
    <section className="space-y-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-amber-950 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs text-white">{liste.length}</span>
        Nouveaux IBAN à confirmer
      </h2>
      <p className="text-sm">
        Avant de valider, appelez le fournisseur à un numéro que vous connaissez déjà pour confirmer le changement de coordonnées bancaires
        (fraude au changement de RIB). Tant que vous n&apos;avez pas validé, l&apos;ancien IBAN reste actif.
      </p>
      {erreur && <p className="text-sm text-negative">{erreur}</p>}
      <ul className="space-y-2">
        {liste.map((r) => (
          <li key={r.id} className="rounded-lg border border-amber-300 bg-white p-3 text-sm">
            <div className="font-medium">{r.fournisseur} <span className="text-xs text-muted">· importé le {formatDate(r.cree_le.slice(0, 10))}</span></div>
            <div>Actuel : <span className="font-mono">{r.iban_actuel ?? "—"}</span></div>
            <div>Nouveau : <span className="font-mono font-semibold">{r.iban}</span>{r.bic ? <span className="font-mono"> · {r.bic}</span> : null}</div>
            {r.titulaire && <div>Titulaire : {r.titulaire}{r.titulaire_different && <span className="ml-2 font-semibold text-negative">⚠ ne correspond pas au fournisseur</span>}</div>}
            {r.telephone && <div>Téléphone connu : {r.telephone}</div>}
            <div className="mt-2 flex flex-wrap gap-2">
              {r.fichier && <button type="button" className="rounded border border-border px-2 py-1 hover:bg-surface-2" onClick={() => ouvrir(r.fichier!)}>Voir le RIB</button>}
              <button type="button" className="rounded bg-accent px-2 py-1 text-accent-fg" onClick={() => traiter(r.id, true)}>Valider (fournisseur appelé)</button>
              <button type="button" className="rounded border border-negative px-2 py-1 text-negative" onClick={() => traiter(r.id, false)}>Rejeter</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

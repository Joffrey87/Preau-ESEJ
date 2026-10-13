"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDonsDechiffres, type DonChiffrable } from "@/lib/donsChiffre";
import { nomDonateur } from "@/lib/statutDon";
import ChequesCompacts from "@/components/ChequesCompacts";
import { compresserPhoto } from "@/lib/compresserPhoto";
import { formatDate, formatEuros, todayISO } from "@/lib/format";
import {
  BUCKET_CHEQUES,
  anneeScolaire,
  INCONNU,
  libelleCategorie,
  type CategorieRecette,
  candidatsActivite,
  candidatsDon,
  candidatsFamille,
  COLONNES_CHEQUE,
  SUIVI_MOTIF,
  type ActiviteCandidate,
  type FamilleCandidate,
  type ParticipationCandidate,
  candidatsInscription,
  candidatsRemise,
  libelleMotif,
  sansLienAuto,
  totalCheques,
  type Cheque,
  type DonCandidat,
  type InscriptionCandidate,
  type Lien,
  type MotifCheque,
  type OpRemise,
  type Remise,
} from "@/lib/depotCheques";

export type DonDepot = DonChiffrable & { id: string; montant: number; date_don: string; operation_id: string | null };

type Ligne = { montant: string; emetteur: string; date_cheque: string; categorie_id: string; doute: boolean };
type ChampsLien = Partial<Pick<Cheque, "don_id" | "inscription_id" | "famille_id" | "activite_id">>;
const ligneVide = (): Ligne => ({ montant: "", emetteur: "", categorie_id: INCONNU, doute: false, date_cheque: todayISO() });

const champ = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const btnPrimaire = "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
const btnDiscret = "rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-2 disabled:opacity-50";
const montantDe = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;

/** Date affichée en compact (« Aujourd'hui, 13/10/2026 ») avec un petit lien « changer ». */
function DateCompacte({ valeur, onChange, libelle }: { valeur: string; onChange: (v: string) => void; libelle: string }) {
  const [edition, setEdition] = useState(false);
  if (edition)
    return (
      <input
        type="date"
        autoFocus
        aria-label={libelle}
        className="block rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-foreground"
        value={valeur}
        onChange={(e) => onChange(e.target.value || todayISO())}
        onBlur={() => setEdition(false)}
      />
    );
  return (
    <span className="block whitespace-nowrap text-sm text-foreground">
      {valeur === todayISO() ? "Aujourd\u2019hui, " : ""}
      {valeur ? formatDate(valeur) : "—"}{" "}
      <button type="button" className="text-xs text-muted underline hover:text-accent" aria-label={`Changer : ${libelle}`} onClick={() => setEdition(true)}>
        changer
      </button>
    </span>
  );
}

function PastilleLien({ lien }: { lien: Lien }) {
  if (!lien) return null;
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${lien === "auto" ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"}`}
      title={lien === "auto" ? "Relié automatiquement par Préau (rapprochement évident)" : "Relié à la main"}
    >
      {lien === "auto" ? "auto" : "confirmé"}
    </span>
  );
}

/** Onglet Dépôt de chèques : remises (photo + chèques) et rapprochement avec la comptabilité. */
export default function DepotCheques({
  remisesInit,
  chequesInit,
  operations,
  donsInit,
  inscriptions,
  familles,
  activites,
  participations,
  categories,
  peutLier,
}: {
  remisesInit: Remise[];
  chequesInit: Cheque[];
  operations: OpRemise[];
  donsInit: DonDepot[];
  inscriptions: InscriptionCandidate[];
  familles: FamilleCandidate[];
  activites: ActiviteCandidate[];
  participations: ParticipationCandidate[];
  categories: CategorieRecette[];
  peutLier: boolean;
}) {
  const [remises, setRemises] = useState(remisesInit);
  const [cheques, setCheques] = useState(chequesInit);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Formulaire de nouvelle remise.
  const [ouvert, setOuvert] = useState(remisesInit.length === 0);
  const [dateRemise, setDateRemise] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [saisie, setSaisie] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const apercu = useMemo(() => (photo && photo.type.startsWith("image/") ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);
  const [lecture, setLecture] = useState<"en_cours" | null>(null);
  const [erreurLecture, setErreurLecture] = useState<string | null>(null);
  const [totalBordereau, setTotalBordereau] = useState<number | null>(null);
  const numLecture = useRef(0);
  function choisirPhoto(f: File | null) {
    if (fichierRef.current) fichierRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    setErreurLecture(null);
    setTotalBordereau(null);
    numLecture.current++;
    if (!f) {
      setPhoto(null);
      setLecture(null);
      return;
    }
    void preparerEtLire(f, numLecture.current);
  }
  // Compression puis lecture automatique par Claude (route serveur : la clé reste côté serveur).
  async function preparerEtLire(f: File, n: number) {
    setLecture("en_cours");
    setPhoto(f);
    try {
      const fichier = await compresserPhoto(f);
      if (n !== numLecture.current) return;
      setPhoto(fichier);
      const fd = new FormData();
      fd.append("photo", fichier);
      const rep = await fetch("/api/lecture-cheques", { method: "POST", body: fd });
      const d = await rep.json().catch(() => ({}));
      if (n !== numLecture.current) return;
      if (!rep.ok) throw new Error(d.erreur ?? "La lecture automatique a échoué.");
      const lus = (d.cheques ?? []) as { montant: number | null; emetteur: string | null; date: string | null }[];
      if (lus.length === 0) throw new Error("Aucun chèque reconnu sur la photo : saisissez-les à la main.");
      setLignes(
        lus.map((c) => ({
          ...ligneVide(),
          montant: c.montant != null ? String(c.montant).replace(".", ",") : "",
          emetteur: c.emetteur ?? "",
          date_cheque: c.date ?? todayISO(),
        })),
      );
      setTotalBordereau(typeof d.total_bordereau === "number" ? d.total_bordereau : null);
    } catch (e) {
      if (n === numLecture.current) setErreurLecture(e instanceof Error ? e.message : "La lecture automatique a échoué.");
    } finally {
      if (n === numLecture.current) setLecture(null);
    }
  }
  const [lignes, setLignes] = useState<Ligne[]>([ligneVide()]);
  const fichierRef = useRef<HTMLInputElement>(null);
  const totalSaisi = Math.round(lignes.reduce((s, l) => s + montantDe(l.montant), 0) * 100) / 100;

  // Noms des donateurs déchiffrés (coffre) pour reconnaître l'émetteur.
  const { dons: donsClairs } = useDonsDechiffres(donsInit);
  const dons: DonCandidat[] = useMemo(
    () => donsClairs.map((d) => ({ id: d.id, montant: Number(d.montant), date_don: d.date_don, operation_id: d.operation_id, nom: nomDonateur(d) })),
    [donsClairs],
  );
  const opsParId = useMemo(() => new Map(operations.map((o) => [o.id, o])), [operations]);
  const donsParId = useMemo(() => new Map(dons.map((d) => [d.id, d])), [dons]);
  const inscParId = useMemo(() => new Map(inscriptions.map((i) => [i.id, i])), [inscriptions]);

  const opsLiees = new Set(remises.map((r) => r.operation_id).filter(Boolean) as string[]);
  const donsLies = new Set(cheques.map((c) => c.don_id).filter(Boolean) as string[]);

  async function lierRemise(r: Remise, operation_id: string | null, lien: Lien) {
    const { error } = await createClient().from("remises_cheques").update({ operation_id, lien_operation: lien }).eq("id", r.id);
    if (error) return setMessage({ ok: false, t: error.message });
    setRemises((rs) => rs.map((x) => (x.id === r.id ? { ...x, operation_id, lien_operation: lien } : x)));
    // Le suivi des chèques suit l'opération de la remise (déclencheur) : on relit ses chèques.
    const { data } = await createClient().from("cheques_remis").select(COLONNES_CHEQUE).eq("remise_id", r.id);
    if (data) {
      const frais = new Map((data as Cheque[]).map((x) => [x.id, x]));
      setCheques((cs) => cs.map((x) => frais.get(x.id) ?? x));
    }
  }

  // Le suivi (scolarité, activités) est mis à jour en base par déclencheur : on relit la ligne.
  async function lierCheque(c: Cheque, champs: ChampsLien, lien: Lien) {
    const maj = {
      don_id: champs.don_id ?? null,
      inscription_id: champs.inscription_id ?? null,
      famille_id: champs.famille_id ?? null,
      activite_id: champs.activite_id ?? null,
      lien,
    };
    const { data, error } = await createClient().from("cheques_remis").update(maj).eq("id", c.id).select(COLONNES_CHEQUE).single();
    if (error) return setMessage({ ok: false, t: error.message });
    setCheques((cs) => cs.map((x) => (x.id === c.id ? (data as Cheque) : x)));
  }

  // Liens évidents posés automatiquement (une fois par chargement, Trésorier seulement).
  const autoFait = useRef(new Set<string>());
  useEffect(() => {
    if (!peutLier) return;
    const supabase = createClient();
    const liees = new Set(remises.map((r) => r.operation_id).filter(Boolean) as string[]);
    const lies = new Set(cheques.map((c) => c.don_id).filter(Boolean) as string[]);
    const majRemises: { id: string; operation_id: string }[] = [];
    const majCheques: ({ id: string } & ChampsLien)[] = [];
    for (const r of remises) {
      if (r.operation_id || autoFait.current.has(r.id)) continue;
      autoFait.current.add(r.id);
      const { candidats, evident } = candidatsRemise(r, totalCheques(cheques.filter((c) => c.remise_id === r.id)), operations, liees);
      if (evident) {
        liees.add(candidats[0].id);
        majRemises.push({ id: r.id, operation_id: candidats[0].id });
      }
    }
    const dateDe = new Map(remises.map((r) => [r.id, r.date_remise]));
    for (const c of cheques) {
      if (c.lien || sansLienAuto(c) || autoFait.current.has(c.id)) continue;
      const date = dateDe.get(c.remise_id) ?? todayISO();
      if (c.motif === "don") {
        // Les noms ne sont lisibles qu'une fois le coffre ouvert : on attend qu'ils le soient.
        if (dons.length === 0 || dons.every((d) => !d.nom || d.nom.includes("🔒"))) continue;
        autoFait.current.add(c.id);
        const { candidats, evident } = candidatsDon(c, date, dons, lies);
        if (evident) {
          lies.add(candidats[0].id);
          majCheques.push({ id: c.id, don_id: candidats[0].id, inscription_id: null });
        }
      } else if (c.motif === "frais_scolarite" || c.motif === "frais_dossier" || c.motif === "mois_avance") {
        autoFait.current.add(c.id);
        const { candidats, evident } = candidatsInscription(c, date, inscriptions);
        if (evident) majCheques.push({ id: c.id, inscription_id: candidats[0].id });
      } else if (c.motif === "fourniture" || c.motif === "activite") {
        autoFait.current.add(c.id);
        const fam = c.famille_id ? { evident: true, candidats: [{ id: c.famille_id }] } : candidatsFamille(c, familles);
        if (!fam.evident) continue;
        if (c.motif === "fourniture") majCheques.push({ id: c.id, famille_id: fam.candidats[0].id });
        else {
          const act = candidatsActivite(c, fam.candidats[0].id, participations, activites);
          if (act.evident) majCheques.push({ id: c.id, famille_id: fam.candidats[0].id, activite_id: act.candidats[0].id });
        }
      }
    }
    if (majRemises.length === 0 && majCheques.length === 0) return;
    (async () => {
      for (const m of majRemises) {
        const { error } = await supabase.from("remises_cheques").update({ operation_id: m.operation_id, lien_operation: "auto" }).eq("id", m.id);
        if (!error) setRemises((rs) => rs.map((x) => (x.id === m.id ? { ...x, operation_id: m.operation_id, lien_operation: "auto" } : x)));
      }
      for (const m of majCheques) {
        const maj = {
          don_id: m.don_id ?? null,
          inscription_id: m.inscription_id ?? null,
          famille_id: m.famille_id ?? null,
          activite_id: m.activite_id ?? null,
          lien: "auto" as const,
        };
        const { data, error } = await supabase.from("cheques_remis").update(maj).eq("id", m.id).select(COLONNES_CHEQUE).single();
        if (!error) setCheques((cs) => cs.map((x) => (x.id === m.id ? (data as Cheque) : x)));
      }
    })();
  }, [peutLier, remises, cheques, operations, dons, inscriptions, familles, activites, participations]);

  async function enregistrer() {
    setMessage(null);
    const valides = lignes.filter((l) => montantDe(l.montant) > 0);
    if (valides.length === 0) return setMessage({ ok: false, t: "Saisissez au moins un chèque avec son montant." });
    if (valides.some((l) => !l.emetteur.trim())) return setMessage({ ok: false, t: "Chaque chèque doit avoir un émetteur." });
    setBusy("nouvelle");
    const supabase = createClient();
    try {
      const { data: r, error } = await supabase
        .from("remises_cheques")
        .insert({ date_remise: dateRemise, notes: notes.trim() || null })
        .select("id, date_remise, photo_path, notes, operation_id, lien_operation, created_at")
        .single();
      if (error || !r) throw new Error(error?.message ?? "Création de la remise impossible.");
      let remise = r as Remise;
      if (photo) {
        const fichier = photo; // déjà compressée au choix
        const ext = (fichier.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${remise.id}/remise.${ext}`;
        const up = await supabase.storage.from(BUCKET_CHEQUES).upload(path, fichier, {
          contentType: fichier.type,
          upsert: true,
          // Métadonnées pour un futur rattachement en pièce comptable à l'opération bancaire.
          metadata: { piece_comptable: "remise_cheques", remise_id: remise.id, date_remise: remise.date_remise },
        });
        if (up.error) throw new Error(`Remise créée, mais envoi de la photo impossible : ${up.error.message}`);
        await supabase.from("remises_cheques").update({ photo_path: path, photo_type: fichier.type, photo_octets: fichier.size }).eq("id", remise.id);
        remise = { ...remise, photo_path: path };
      }
      const { data: cs, error: e2 } = await supabase
        .from("cheques_remis")
        .insert(
          valides.map((l) => ({
            remise_id: remise.id,
            montant: montantDe(l.montant),
            emetteur: l.emetteur.trim(),
            date_cheque: l.date_cheque || null,
            categorie_id: l.categorie_id || null, // le motif est déduit en base
            doute: l.doute,
          })),
        )
        .select(COLONNES_CHEQUE);
      if (e2) throw new Error(`Remise créée, mais enregistrement des chèques impossible : ${e2.message}`);
      setRemises((rs) => [remise, ...rs].sort((a, b) => b.date_remise.localeCompare(a.date_remise)));
      setCheques((x) => [...x, ...((cs ?? []) as Cheque[])]);
      setLignes([ligneVide()]);
      setNotes("");
      setSaisie(false);
      choisirPhoto(null);
      setOuvert(false);
      setMessage({ ok: true, t: `Remise du ${formatDate(remise.date_remise)} enregistrée : ${valides.length} chèque(s), ${formatEuros(totalSaisi)}.` });
    } catch (e) {
      setMessage({ ok: false, t: e instanceof Error ? e.message : "Enregistrement impossible." });
    } finally {
      setBusy(null);
    }
  }

  async function voirPhoto(r: Remise) {
    if (!r.photo_path) return;
    const { data, error } = await createClient().storage.from(BUCKET_CHEQUES).createSignedUrl(r.photo_path, 300);
    if (error || !data) return setMessage({ ok: false, t: error?.message ?? "Photo introuvable." });
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function supprimer(r: Remise) {
    if (!window.confirm(`Supprimer la remise du ${formatDate(r.date_remise)} et ses chèques ?`)) return;
    setBusy(r.id);
    const supabase = createClient();
    if (r.photo_path) await supabase.storage.from(BUCKET_CHEQUES).remove([r.photo_path]);
    const { error } = await supabase.from("remises_cheques").delete().eq("id", r.id);
    setBusy(null);
    if (error) return setMessage({ ok: false, t: error.message });
    setRemises((rs) => rs.filter((x) => x.id !== r.id));
    setCheques((cs) => cs.filter((c) => c.remise_id !== r.id));
  }

  const majLigne = (i: number, p: Partial<Ligne>) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  /** True dès qu'une saisie manuelle est ouverte, qu'un fichier est importé, ou qu'une ligne/note a été remplie. */
  const aDuContenu =
    saisie ||
    !!photo ||
    lecture === "en_cours" ||
    !!erreurLecture ||
    totalBordereau != null ||
    notes.trim() !== "" ||
    lignes.some((l) => l.montant.trim() !== "" || l.emetteur.trim() !== "" || l.doute || l.categorie_id !== INCONNU);

  /** Revient à l'état initial : 2 tuiles d'import + « Saisie manuelle », sans fermer la section. */
  function annulerFormulaire() {
    numLecture.current++;
    setSaisie(false);
    setDateRemise(todayISO());
    setNotes("");
    setLignes([ligneVide()]);
    setTotalBordereau(null);
    setErreurLecture(null);
    setLecture(null);
    choisirPhoto(null);
  }

  return (
    <div className="space-y-5">
      {message && (
        <p className={`rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-positive/40 bg-positive/10 text-positive" : "border-negative/40 bg-negative/10 text-negative"}`}>
          {message.t}
        </p>
      )}

      {!ouvert ? (
        <button type="button" className={btnPrimaire} onClick={() => setOuvert(true)}>
          + Nouvelle remise de chèques
        </button>
      ) : (
        <section className="space-y-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Nouvelle remise de chèques</h2>
          <div>
            <div>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label="Photo des chèques ou du bordereau de remise">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-3 py-3 text-left text-accent-fg shadow-md hover:opacity-90 focus-within:ring-2 focus-within:ring-gold focus-within:ring-offset-2">
                  <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => choisirPhoto(e.target.files?.[0] ?? null)} />
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 shrink-0"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3.5" /></svg>
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold">Prendre une photo</span>
                    <span className="text-xs opacity-80">Appareil photo</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-border bg-surface px-3 py-3 text-left text-accent hover:bg-surface-2 focus-within:ring-2 focus-within:ring-gold focus-within:ring-offset-2">
                  <input ref={fichierRef} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => choisirPhoto(e.target.files?.[0] ?? null)} />
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                  <span className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold">Choisir un fichier</span>
                    <span className="text-xs text-muted">Image ou PDF</span>
                  </span>
                </label>
              </div>
              {photo && (
                <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-2 text-sm" aria-live="polite">
                  {apercu ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={apercu} alt="Aperçu de la photo choisie" className="h-14 w-14 rounded object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded bg-surface text-xs font-semibold text-muted">PDF</span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{photo.name}</span>
                  <button type="button" className={btnDiscret} onClick={() => choisirPhoto(null)}>
                    Retirer
                  </button>
                </div>
              )}
            </div>
          </div>

          {!saisie && !photo && (
            <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2" onClick={() => setSaisie(true)}>
              Saisie manuelle
            </button>
          )}

          {lecture === "en_cours" && (
            <p className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent" role="status">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
              Lecture des chèques en cours…
            </p>
          )}
          {erreurLecture && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm text-negative" role="alert">
              {erreurLecture}
            </p>
          )}
          {totalBordereau != null && lecture === null && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${Math.abs(totalBordereau - totalSaisi) < 0.005 ? "bg-surface-2 text-positive" : "bg-gold-soft text-foreground"}`}
              role="status"
            >
              {Math.abs(totalBordereau - totalSaisi) < 0.005
                ? `Total du bordereau ${formatEuros(totalBordereau)} : la somme des chèques correspond.`
                : `⚠ Total du bordereau ${formatEuros(totalBordereau)}, mais la somme des chèques est ${formatEuros(totalSaisi)} (écart ${formatEuros(Math.round((totalSaisi - totalBordereau) * 100) / 100)}). Vérifiez les montants.`}
            </p>
          )}

          {(saisie || (photo && lecture === null)) && (
          <>
          <div className="text-xs text-muted">
            Date de la remise
            <DateCompacte valeur={dateRemise} onChange={setDateRemise} libelle="Date de la remise" />
          </div>
          {photo && !saisie ? (
            <ChequesCompacts lignes={lignes} categories={categories} onChange={majLigne} onRetirer={(i) => setLignes((ls) => ls.filter((_, j) => j !== i))} />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Montant (€)</th>
                  <th className="py-1 pr-2 font-medium">Émetteur</th>
                  <th className="py-1 pr-2 font-medium">Date du chèque</th>
                  <th className="py-1 pr-2 font-medium">Catégorie</th>
                  <th />
                  <th />
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2">
                      <input inputMode="decimal" className={`${champ} w-28 text-right tabular-nums`} value={l.montant} onChange={(e) => majLigne(i, { montant: e.target.value })} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className={champ} placeholder="Nom sur le chèque" value={l.emetteur} onChange={(e) => majLigne(i, { emetteur: e.target.value })} />
                    </td>
                    <td className="py-1 pr-2">
                      <DateCompacte valeur={l.date_cheque} onChange={(v) => majLigne(i, { date_cheque: v })} libelle="Date du chèque" />
                    </td>
                    <td className="py-1 pr-2">
                      <select className={champ} value={l.categorie_id} onChange={(e) => majLigne(i, { categorie_id: e.target.value })}>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nom}
                          </option>
                        ))}
                        <option value={INCONNU}>Inconnu</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <label className="flex items-center gap-1 whitespace-nowrap text-xs text-muted" title="Doute : jamais relié automatiquement">
                        <input type="checkbox" checked={l.doute} onChange={(e) => majLigne(i, { doute: e.target.checked })} />
                        Doute
                      </label>
                    </td>
                    <td className="py-1">
                      {lignes.length > 1 && (
                        <button type="button" className={btnDiscret} aria-label="Retirer ce chèque" onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className={btnDiscret} onClick={() => setLignes((ls) => [...ls, ligneVide()])}>
              + Ajouter un chèque
            </button>
            <p className="text-sm">
              Total : <span className="font-semibold tabular-nums">{formatEuros(totalSaisi)}</span>
            </p>
          </div>
          <label className="block text-xs text-muted">
            Notes (facultatif)
            <input className={champ} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" className={btnPrimaire} disabled={busy === "nouvelle"} onClick={enregistrer}>
              {busy === "nouvelle" ? "Enregistrement…" : "Enregistrer la remise"}
            </button>
            {aDuContenu && (
              <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2" onClick={annulerFormulaire}>
                Annuler
              </button>
            )}
          </div>
          </>
          )}

          {/* Annuler pendant la lecture (fichier importé, champs pas encore affichés). */}
          {photo && lecture === "en_cours" && !saisie && (
            <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2" onClick={annulerFormulaire}>
              Annuler
            </button>
          )}
        </section>
      )}

      {remises.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-6 text-sm text-muted">Aucune remise enregistrée pour l&apos;instant.</p>
      ) : (
        remises.map((r) => {
          const chs = cheques.filter((c) => c.remise_id === r.id);
          const total = totalCheques(chs);
          const op = r.operation_id ? opsParId.get(r.operation_id) : undefined;
          const cand = peutLier && !r.operation_id ? candidatsRemise(r, total, operations, opsLiees).candidats : [];
          return (
            <section key={r.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">
                    Remise du {formatDate(r.date_remise)} · {chs.length} chèque{chs.length > 1 ? "s" : ""} ·{" "}
                    <span className="tabular-nums">{formatEuros(total)}</span>
                  </h3>
                  {r.notes && <p className="text-xs text-muted">{r.notes}</p>}
                </div>
                <div className="flex gap-2">
                  {r.photo_path && (
                    <button type="button" className={btnDiscret} onClick={() => voirPhoto(r)}>
                      📷 Voir la photo
                    </button>
                  )}
                  <button type="button" className={btnDiscret} disabled={busy === r.id} onClick={() => supprimer(r)}>
                    Supprimer
                  </button>
                </div>
              </div>

              {/* Opération bancaire de la remise. */}
              <div className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                {r.operation_id ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>
                      Crédit bancaire : {op ? `${formatDate(op.date_operation)} · ${op.libelle_origine || op.libelle} · ${formatEuros(Number(op.montant))}` : "opération reliée"}
                    </span>
                    <PastilleLien lien={r.lien_operation} />
                    {peutLier && (
                      <button type="button" className={btnDiscret} onClick={() => lierRemise(r, null, null)}>
                        Délier
                      </button>
                    )}
                  </span>
                ) : !peutLier ? (
                  <span className="text-muted">En attente du rapprochement avec le relevé bancaire (Trésorier).</span>
                ) : cand.length === 0 ? (
                  <span className="text-muted">Aucun crédit de {formatEuros(total)} trouvé à ±10 jours : le relevé n&apos;est peut-être pas encore importé.</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-gold">À confirmer :</span>
                    <select className={`${champ} w-auto`} defaultValue="" onChange={(e) => e.target.value && lierRemise(r, e.target.value, "manuel")}>
                      <option value="">Choisir le crédit bancaire…</option>
                      {cand.map((o) => (
                        <option key={o.id} value={o.id}>
                          {formatDate(o.date_operation)} · {o.libelle_origine || o.libelle} · {formatEuros(Number(o.montant))}
                        </option>
                      ))}
                    </select>
                  </span>
                )}
              </div>

              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Émetteur</th>
                    <th className="py-1 pr-2 font-medium">Date</th>
                    <th className="py-1 pr-2 font-medium">Catégorie</th>
                    <th className="py-1 pr-2 text-right font-medium">Montant</th>
                    <th className="py-1 pl-3 font-medium">Comptabilité</th>
                  </tr>
                </thead>
                <tbody>
                  {chs.map((c) => (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="py-1.5 pr-2">{c.emetteur}</td>
                      <td className="py-1.5 pr-2 text-muted">{c.date_cheque ? formatDate(c.date_cheque) : "—"}</td>
                      <td className="py-1.5 pr-2">
                        {libelleCategorie(c.categorie_id, categories)}
                        {c.doute && (
                          <span className="ml-1.5 rounded-full bg-gold-soft px-1.5 py-0.5 text-[10px] font-medium text-gold" title="Doute : jamais relié automatiquement">
                            Doute
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatEuros(Number(c.montant))}</td>
                      <td className="py-1.5 pl-3 text-xs">
                        <LienCheque
                          c={c}
                          dateRemise={r.date_remise}
                          peutLier={peutLier}
                          dons={dons}
                          donsLies={donsLies}
                          donsParId={donsParId}
                          inscriptions={inscriptions}
                          inscParId={inscParId}
                          familles={familles}
                          activites={activites}
                          participations={participations}
                          remiseReliee={!!r.operation_id}
                          lier={lierCheque}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </div>
  );
}

function LienCheque({
  c,
  dateRemise,
  peutLier,
  dons,
  donsLies,
  donsParId,
  inscriptions,
  inscParId,
  familles,
  activites,
  participations,
  remiseReliee,
  lier,
}: {
  c: Cheque;
  dateRemise: string;
  peutLier: boolean;
  dons: DonCandidat[];
  donsLies: Set<string>;
  donsParId: Map<string, DonCandidat>;
  inscriptions: InscriptionCandidate[];
  inscParId: Map<string, InscriptionCandidate>;
  familles: FamilleCandidate[];
  activites: ActiviteCandidate[];
  participations: ParticipationCandidate[];
  remiseReliee: boolean;
  lier: (c: Cheque, champs: ChampsLien, lien: Lien) => void;
}) {
  const nomFamille = (id: string | null) => familles.find((f) => f.id === id)?.nom ?? "famille";
  const relie =
    !!c.don_id ||
    !!c.inscription_id ||
    (c.motif === "fourniture" && !!c.famille_id) ||
    (c.motif === "activite" && !!c.famille_id && !!c.activite_id);
  if (relie) {
    const d = c.don_id ? donsParId.get(c.don_id) : undefined;
    const i = c.inscription_id ? inscParId.get(c.inscription_id) : undefined;
    const a = c.activite_id ? activites.find((x) => x.id === c.activite_id) : undefined;
    const texte = c.don_id
      ? `Don${d ? ` de ${d.nom} du ${formatDate(d.date_don)}` : " relié"}`
      : c.inscription_id
        ? `Famille ${i ? `${i.famille_nom} (${i.annee_scolaire})` : "reliée"}`
        : c.motif === "activite"
          ? `${a ? a.titre : "Activité"} · famille ${nomFamille(c.famille_id)}`
          : `Fournitures · famille ${nomFamille(c.famille_id)}`;
    let suivi: string | undefined = SUIVI_MOTIF[c.motif];
    if (c.motif === "activite" && remiseReliee)
      suivi = c.participations_payees.length > 0 ? `${c.participations_payees.length} participation(s) marquée(s) payée(s)` : "Participations déjà payées : rien changé";
    else if ((c.motif === "frais_scolarite" || c.motif === "frais_dossier" || c.motif === "mois_avance" || c.motif === "activite") && !remiseReliee)
      suivi = "Suivi mis à jour quand la remise sera reliée à son crédit bancaire";
    return (
      <span className="flex flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          {texte}
          <PastilleLien lien={c.lien} />
          {peutLier && (
            <button type="button" className={btnDiscret} onClick={() => lier(c, {}, null)}>
              Délier
            </button>
          )}
        </span>
        {suivi && <span className="text-[11px] text-muted">{suivi}</span>}
      </span>
    );
  }
  if (!peutLier) return <span className="text-muted">À rapprocher (Trésorier)</span>;
  if (c.motif === "don") {
    const { candidats } = candidatsDon(c, dateRemise, dons, donsLies);
    if (candidats.length === 0) return <span className="text-muted">Aucun don de ce montant à ±20 jours</span>;
    return (
      <select className={`${champ} w-auto text-xs`} defaultValue="" onChange={(e) => e.target.value && lier(c, { don_id: e.target.value }, "manuel")}>
        <option value="">À confirmer : choisir le don…</option>
        {candidats.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nom || "—"} · {formatDate(d.date_don)} · {formatEuros(d.montant)}
          </option>
        ))}
      </select>
    );
  }
  if (c.motif === "frais_scolarite" || c.motif === "frais_dossier" || c.motif === "mois_avance") {
    const { candidats } = candidatsInscription(c, dateRemise, inscriptions);
    const liste = candidats.length > 0 ? candidats : inscriptions.filter((i) => i.annee_scolaire >= anneeScolaire(dateRemise));
    return (
      <select className={`${champ} w-auto text-xs`} defaultValue="" onChange={(e) => e.target.value && lier(c, { inscription_id: e.target.value }, "manuel")}>
        <option value="">{candidats.length > 0 ? "À confirmer : choisir la famille…" : "Aucune famille reconnue : choisir…"}</option>
        {[...liste]
          .sort((a, b) => a.famille_nom.localeCompare(b.famille_nom, "fr"))
          .map((i) => (
            <option key={i.id} value={i.id}>
              {i.famille_nom} ({i.annee_scolaire})
            </option>
          ))}
      </select>
    );
  }
  if (c.motif === "fourniture" || c.motif === "activite") {
    if (c.motif === "activite" && c.famille_id) {
      const { candidats } = candidatsActivite(c, c.famille_id, participations, activites);
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          Famille {nomFamille(c.famille_id)}
          {candidats.length === 0 ? (
            <span className="text-muted">: aucune participation non payée</span>
          ) : (
            <select
              className={`${champ} w-auto text-xs`}
              defaultValue=""
              onChange={(e) => e.target.value && lier(c, { famille_id: c.famille_id, activite_id: e.target.value }, "manuel")}
            >
              <option value="">Choisir l&apos;activité…</option>
              {candidats.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.titre} ({a.date_activite ? formatDate(a.date_activite) : a.annee_scolaire})
                </option>
              ))}
            </select>
          )}
          <button type="button" className={btnDiscret} onClick={() => lier(c, {}, null)}>
            Autre famille
          </button>
        </span>
      );
    }
    const { candidats } = candidatsFamille(c, familles);
    const liste = candidats.length > 0 ? candidats : familles;
    return (
      <select
        className={`${champ} w-auto text-xs`}
        defaultValue=""
        onChange={(e) => e.target.value && lier(c, { famille_id: e.target.value }, c.motif === "fourniture" ? "manuel" : null)}
      >
        <option value="">{candidats.length > 0 ? "À confirmer : choisir la famille…" : "Aucune famille reconnue : choisir…"}</option>
        {[...liste]
          .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
          .map((f) => (
            <option key={f.id} value={f.id}>
              {f.nom}
            </option>
          ))}
      </select>
    );
  }
  if (c.motif === "inconnu") return <span className="text-muted">Catégorie inconnue : pas de rapprochement automatique</span>;
  return <span className="text-muted">Pas de rapprochement pour cette catégorie</span>;
}

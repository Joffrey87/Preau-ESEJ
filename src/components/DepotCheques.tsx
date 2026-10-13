"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useDonsDechiffres, type DonChiffrable } from "@/lib/donsChiffre";
import { nomDonateur } from "@/lib/statutDon";
import { formatDate, formatEuros, todayISO } from "@/lib/format";
import {
  BUCKET_CHEQUES,
  anneeScolaire,
  MOTIFS,
  candidatsDon,
  candidatsInscription,
  candidatsRemise,
  libelleMotif,
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

type Ligne = { montant: string; emetteur: string; date_cheque: string; motif: MotifCheque };
const ligneVide = (): Ligne => ({ montant: "", emetteur: "", date_cheque: "", motif: "don" });

const champ = "w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm";
const btnPrimaire = "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
const btnDiscret = "rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-2 disabled:opacity-50";
const montantDe = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;

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
  peutLier,
}: {
  remisesInit: Remise[];
  chequesInit: Cheque[];
  operations: OpRemise[];
  donsInit: DonDepot[];
  inscriptions: InscriptionCandidate[];
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
  const [photo, setPhoto] = useState<File | null>(null);
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
  }

  async function lierCheque(c: Cheque, champs: Partial<Pick<Cheque, "don_id" | "inscription_id">>, lien: Lien) {
    const maj = { don_id: champs.don_id ?? null, inscription_id: champs.inscription_id ?? null, lien };
    const { error } = await createClient().from("cheques_remis").update(maj).eq("id", c.id);
    if (error) return setMessage({ ok: false, t: error.message });
    setCheques((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...maj } : x)));
  }

  // Liens évidents posés automatiquement (une fois par chargement, Trésorier seulement).
  const autoFait = useRef(new Set<string>());
  useEffect(() => {
    if (!peutLier) return;
    const supabase = createClient();
    const liees = new Set(remises.map((r) => r.operation_id).filter(Boolean) as string[]);
    const lies = new Set(cheques.map((c) => c.don_id).filter(Boolean) as string[]);
    const majRemises: { id: string; operation_id: string }[] = [];
    const majCheques: { id: string; don_id: string | null; inscription_id: string | null }[] = [];
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
      if (c.lien || autoFait.current.has(c.id)) continue;
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
      } else if (c.motif === "frais_scolarite" || c.motif === "frais_dossier") {
        autoFait.current.add(c.id);
        const { candidats, evident } = candidatsInscription(c, date, inscriptions);
        if (evident) majCheques.push({ id: c.id, don_id: null, inscription_id: candidats[0].id });
      }
    }
    if (majRemises.length === 0 && majCheques.length === 0) return;
    (async () => {
      for (const m of majRemises) {
        const { error } = await supabase.from("remises_cheques").update({ operation_id: m.operation_id, lien_operation: "auto" }).eq("id", m.id);
        if (!error) setRemises((rs) => rs.map((x) => (x.id === m.id ? { ...x, operation_id: m.operation_id, lien_operation: "auto" } : x)));
      }
      for (const m of majCheques) {
        const maj = { don_id: m.don_id, inscription_id: m.inscription_id, lien: "auto" as const };
        const { error } = await supabase.from("cheques_remis").update(maj).eq("id", m.id);
        if (!error) setCheques((cs) => cs.map((x) => (x.id === m.id ? { ...x, ...maj } : x)));
      }
    })();
  }, [peutLier, remises, cheques, operations, dons, inscriptions]);

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
        const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${remise.id}/remise.${ext}`;
        const up = await supabase.storage.from(BUCKET_CHEQUES).upload(path, photo, { contentType: photo.type, upsert: true });
        if (up.error) throw new Error(`Remise créée, mais envoi de la photo impossible : ${up.error.message}`);
        await supabase.from("remises_cheques").update({ photo_path: path }).eq("id", remise.id);
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
            motif: l.motif,
          })),
        )
        .select("id, remise_id, montant, emetteur, date_cheque, motif, don_id, inscription_id, lien");
      if (e2) throw new Error(`Remise créée, mais enregistrement des chèques impossible : ${e2.message}`);
      setRemises((rs) => [remise, ...rs].sort((a, b) => b.date_remise.localeCompare(a.date_remise)));
      setCheques((x) => [...x, ...((cs ?? []) as Cheque[])]);
      setLignes([ligneVide()]);
      setNotes("");
      setPhoto(null);
      if (fichierRef.current) fichierRef.current.value = "";
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
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-muted">
              Date de la remise
              <input type="date" className={champ} value={dateRemise} onChange={(e) => setDateRemise(e.target.value)} />
            </label>
            <label className="text-xs text-muted sm:col-span-2">
              Photo des chèques ou du bordereau de remise
              <input
                ref={fichierRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className={champ}
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Montant (€)</th>
                  <th className="py-1 pr-2 font-medium">Émetteur</th>
                  <th className="py-1 pr-2 font-medium">Date du chèque</th>
                  <th className="py-1 pr-2 font-medium">Motif</th>
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
                      <input type="date" className={champ} value={l.date_cheque} onChange={(e) => majLigne(i, { date_cheque: e.target.value })} />
                    </td>
                    <td className="py-1 pr-2">
                      <select className={champ} value={l.motif} onChange={(e) => majLigne(i, { motif: e.target.value as MotifCheque })}>
                        {MOTIFS.map((m) => (
                          <option key={m.v} value={m.v}>
                            {m.l}
                          </option>
                        ))}
                      </select>
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
            <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2" onClick={() => setOuvert(false)}>
              Annuler
            </button>
          </div>
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
                    <th className="py-1 pr-2 font-medium">Motif</th>
                    <th className="py-1 pr-2 text-right font-medium">Montant</th>
                    <th className="py-1 pl-3 font-medium">Comptabilité</th>
                  </tr>
                </thead>
                <tbody>
                  {chs.map((c) => (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="py-1.5 pr-2">{c.emetteur}</td>
                      <td className="py-1.5 pr-2 text-muted">{c.date_cheque ? formatDate(c.date_cheque) : "—"}</td>
                      <td className="py-1.5 pr-2">{libelleMotif(c.motif)}</td>
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
  lier: (c: Cheque, champs: Partial<Pick<Cheque, "don_id" | "inscription_id">>, lien: Lien) => void;
}) {
  if (c.don_id || c.inscription_id) {
    const d = c.don_id ? donsParId.get(c.don_id) : undefined;
    const i = c.inscription_id ? inscParId.get(c.inscription_id) : undefined;
    const texte = c.don_id
      ? `Don${d ? ` de ${d.nom} du ${formatDate(d.date_don)}` : " relié"}`
      : `Famille ${i ? `${i.famille_nom} (${i.annee_scolaire})` : "reliée"}`;
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {texte}
        <PastilleLien lien={c.lien} />
        {peutLier && (
          <button type="button" className={btnDiscret} onClick={() => lier(c, {}, null)}>
            Délier
          </button>
        )}
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
  if (c.motif === "frais_scolarite" || c.motif === "frais_dossier") {
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
  return <span className="text-muted">Pas de rapprochement pour ce motif</span>;
}


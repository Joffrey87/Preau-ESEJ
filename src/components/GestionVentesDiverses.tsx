"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros, todayISO } from "@/lib/format";
import { telechargerVentesPdf } from "@/lib/ventesPdf";
import { Modal } from "./GestionComptes";
import {
  DOMAINES,
  MODES,
  STATUTS,
  libellePayeur,
  statutVente,
  type DomaineVente,
  type ModeAttendu,
  type Payeur,
  type SousCategorie,
  type VenteDue,
  type VentePaiement,
} from "@/lib/ventes";

export type OperationVente = {
  id: string;
  date_operation: string;
  libelle: string;
  montant: number;
  mode_paiement: string | null;
  categorie_id: string | null;
  categories: { nom: string } | null;
};

const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const btn = "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
const btnGhost = "rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50";

export default function GestionVentesDiverses({
  exercices,
  exerciceId,
  domaines,
  estTresorier,
  peutModifier,
  sousCategories,
  dues,
  paiements,
  payeurs,
  operations,
  ventilations,
  vueInitiale,
}: {
  exercices: { id: string; libelle: string }[];
  exerciceId: string;
  domaines: DomaineVente[];
  estTresorier: boolean;
  peutModifier: boolean;
  sousCategories: SousCategorie[];
  dues: VenteDue[];
  paiements: VentePaiement[];
  payeurs: Payeur[];
  operations: OperationVente[];
  ventilations: { id: string; operation_id: string; sous_categorie_id: string; montant: number }[];
  vueInitiale: "ventes" | "rattachement";
}) {
  const router = useRouter();
  const [vue, setVue] = useState<"ventes" | "rattachement">(vueInitiale);
  const [domaine, setDomaine] = useState<DomaineVente>(domaines[0] ?? "ecole");
  const [erreur, setErreur] = useState("");
  const [busy, setBusy] = useState(false);

  // Nouvel objet de vente (sous-catégorie)
  const [nomSous, setNomSous] = useState("");
  // Nouvelle vente
  const [sousId, setSousId] = useState("");
  const [payeur, setPayeur] = useState(""); // "famille:uuid" | "contact:uuid"
  const [montant, setMontant] = useState("");
  const [mode, setMode] = useState<ModeAttendu>("virement");
  const [notes, setNotes] = useState("");
  const [liquideMaintenant, setLiquideMaintenant] = useState(false);
  // Nouveau contact rapide
  const [nouveauContact, setNouveauContact] = useState(false);
  const [cNom, setCNom] = useState("");
  const [cPrenom, setCPrenom] = useState("");

  const sousDuDomaine = useMemo(
    () => sousCategories.filter((s) => s.domaine === domaine && !s.archive),
    [sousCategories, domaine],
  );
  const duesFiltrees = useMemo(() => dues.filter((d) => d.domaine === domaine), [dues, domaine]);
  const payeDe = (id: string) => paiements.filter((p) => p.vente_due_id === id).reduce((s, p) => s + Number(p.montant), 0);
  const familles = payeurs.filter((p) => p.kind === "famille").map((p) => ({ id: p.id, nom: p.libelle }));
  const contacts = payeurs.filter((p) => p.kind === "contact").map((p) => ({ id: p.id, libelle: p.libelle }));
  const exerciceLib = exercices.find((e) => e.id === exerciceId)?.libelle ?? "";

  const totaux = (() => {
    return sousDuDomaine.map((s) => {
      const lignes = duesFiltrees.filter((d) => d.sous_categorie_id === s.id);
      const attendu = lignes.reduce((a, d) => a + Number(d.montant_attendu), 0);
      const paye = lignes.reduce((a, d) => a + payeDe(d.id), 0);
      // Sous-totaux par payeur (famille ou personne du Carnet), pour l'arborescence des Totaux.
      const parPayeur = new Map<string, { libelle: string; nb: number; attendu: number; paye: number }>();
      for (const d of lignes) {
        const libelle = libellePayeur(d, familles, contacts);
        const cle = d.famille_id ? `f:${d.famille_id}` : d.contact_id ? `c:${d.contact_id}` : `l:${libelle}`;
        const g = parPayeur.get(cle) ?? { libelle, nb: 0, attendu: 0, paye: 0 };
        g.nb += 1;
        g.attendu += Number(d.montant_attendu);
        g.paye += payeDe(d.id);
        parPayeur.set(cle, g);
      }
      const payeursTries = [...parPayeur.entries()].map(([cle, g]) => ({ cle, ...g })).sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
      return { sous: s, attendu, paye, nb: lignes.length, lignes, payeurs: payeursTries };
    });
  })();
  // Arborescence des Totaux : sous-totaux dépliés par défaut ; objets repliés à la demande.
  const [replies, setReplies] = useState<Set<string>>(new Set());
  const basculerRepli = (id: string) =>
    setReplies((r) => {
      const n = new Set(r);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toutReplie = totaux.length > 0 && totaux.every((t) => replies.has(t.sous.id));
  // Fiche résumé d'un objet de vente (clic sur son nom).
  const [fiche, setFiche] = useState<string | null>(null);
  const ficheTotal = totaux.find((t) => t.sous.id === fiche) ?? null;

  async function creerSousCat(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (!nomSous.trim()) return setErreur("Indiquez un intitulé.");
    setBusy(true);
    const { error } = await createClient().from("ventes_sous_categories").insert({ nom: nomSous.trim(), domaine });
    setBusy(false);
    if (error) return setErreur(error.message.includes("unique") ? "Cet intitulé existe déjà pour ce domaine." : error.message);
    setNomSous("");
    router.refresh();
  }

  async function creerVente(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (!exerciceId) return setErreur("Choisissez un exercice.");
    if (!sousId) return setErreur("Choisissez un objet de vente.");
    const m = Number(String(montant).replace(",", "."));
    if (!isFinite(m) || m <= 0) return setErreur("Montant invalide.");
    let famille_id: string | null = null;
    let contact_id: string | null = null;
    let libelle_payeur: string | null = null;
    const sb = createClient();
    setBusy(true);
    if (nouveauContact) {
      if (!cNom.trim()) {
        setBusy(false);
        return setErreur("Nom du contact obligatoire.");
      }
      const { data: cid, error } = await sb.rpc("ventes_creer_contact", {
        p_domaine: domaine,
        p_nom: cNom.trim(),
        p_prenom: cPrenom.trim() || null,
        p_courriel: null,
        p_telephone: null,
      });
      if (error) {
        setBusy(false);
        return setErreur(error.message);
      }
      contact_id = cid as string;
      libelle_payeur = `${cPrenom.trim()} ${cNom.trim()}`.trim();
    } else {
      if (!payeur) {
        setBusy(false);
        return setErreur("Choisissez un payeur.");
      }
      const [kind, id] = payeur.split(":");
      if (kind === "famille") famille_id = id;
      else contact_id = id;
      libelle_payeur = payeurs.find((p) => p.kind === kind && p.id === id)?.libelle ?? null;
    }
    const { data: due, error } = await sb
      .from("ventes_dues")
      .insert({
        exercice_id: exerciceId,
        sous_categorie_id: sousId,
        domaine,
        famille_id,
        contact_id,
        libelle_payeur,
        montant_attendu: m,
        mode_attendu: mode,
        notes: notes.trim() || null,
      })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      return setErreur(error.message);
    }
    if (mode === "liquide" && liquideMaintenant && due) {
      const { error: e2 } = await sb.rpc("ventes_paiement_liquide", {
        p_due: due.id,
        p_montant: m,
        p_date: todayISO(),
        p_libelle: `Vente · ${libelle_payeur}`,
      });
      if (e2) {
        setBusy(false);
        return setErreur("Vente créée, mais paiement liquide impossible : " + e2.message);
      }
    }
    setBusy(false);
    setSousId("");
    setPayeur("");
    setMontant("");
    setNotes("");
    setNouveauContact(false);
    setCNom("");
    setCPrenom("");
    setLiquideMaintenant(false);
    router.refresh();
  }

  async function payerLiquide(due: VenteDue) {
    const reste = Number(due.montant_attendu) - payeDe(due.id);
    if (reste <= 0) return;
    setBusy(true);
    setErreur("");
    const { error } = await createClient().rpc("ventes_paiement_liquide", {
      p_due: due.id,
      p_montant: reste,
      p_date: todayISO(),
      p_libelle: `Vente · ${libellePayeur(due, familles, contacts)}`,
    });
    setBusy(false);
    if (error) setErreur(error.message);
    else router.refresh();
  }

  async function supprimerDue(id: string) {
    if (!window.confirm("Supprimer cette vente attendue ?")) return;
    setBusy(true);
    const { error } = await createClient().from("ventes_dues").delete().eq("id", id);
    setBusy(false);
    if (error) setErreur(error.message);
    else router.refresh();
  }

  async function rattacher(dueId: string, opId: string, montantOp: number) {
    setBusy(true);
    setErreur("");
    const { error } = await createClient().rpc("ventes_rattacher_operation", {
      p_due: dueId,
      p_operation: opId,
      p_montant: montantOp,
    });
    setBusy(false);
    if (error) setErreur(error.message);
    else router.refresh();
  }

  async function exporterPdf() {
    setBusy(true);
    try {
      await telechargerVentesPdf({
        exercice: exerciceLib,
        domaine: domaines.length > 1 ? "tous" : domaine,
        sousCats: sousCategories,
        dues,
        paiements,
        payeurDe: (d) => libellePayeur(d, familles, contacts),
      });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Export impossible");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Exercice"
          title="Exercice"
          className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
          value={exerciceId}
          onChange={(e) => {
            const u = new URL(window.location.href);
            u.searchParams.set("exercice", e.target.value);
            router.push(u.pathname + "?" + u.searchParams.toString());
          }}
        >
          {exercices.map((e) => (
            <option key={e.id} value={e.id}>
              {e.libelle.replace(/^Exercice\s+/i, "")}
            </option>
          ))}
        </select>
        {domaines.length > 1 && (
          <div className="flex rounded-lg border border-border p-0.5">
            {domaines.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDomaine(d)}
                className={`rounded-md px-3 py-1 text-sm ${domaine === d ? "bg-accent text-accent-fg" : "hover:bg-surface-2"}`}
              >
                {DOMAINES.find((x) => x.v === d)?.label}
              </button>
            ))}
          </div>
        )}
        {estTresorier && (
          <div className="flex rounded-lg border border-border p-0.5">
            <button type="button" onClick={() => setVue("ventes")} className={`rounded-md px-3 py-1 text-sm ${vue === "ventes" ? "bg-surface-2 font-medium" : ""}`}>
              Ventes
            </button>
            <button type="button" onClick={() => setVue("rattachement")} className={`rounded-md px-3 py-1 text-sm ${vue === "rattachement" ? "bg-surface-2 font-medium" : ""}`}>
              Rattachement bancaire
            </button>
          </div>
        )}
        <button type="button" onClick={exporterPdf} disabled={busy} className={btnGhost + " ml-auto"}>
          Export PDF
        </button>
        <Link href="/caisses" className={btnGhost}>
          Caisses
        </Link>
      </div>

      {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}

      {vue === "ventes" && (
        <>
          {/* Totaux : arborescence objet de vente → sous-totaux par famille / personne */}
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Totaux · {DOMAINES.find((d) => d.v === domaine)?.label}</span>
              {totaux.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReplies(toutReplie ? new Set() : new Set(totaux.map((t) => t.sous.id)))}
                  className="ml-auto text-xs font-medium text-accent hover:underline"
                >
                  {toutReplie ? "Tout déplier" : "Tout replier"}
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Objet de vente · famille ou personne</th>
                  <th className="px-4 py-2 font-medium text-right">Ventes</th>
                  <th className="px-4 py-2 font-medium text-right">Attendu</th>
                  <th className="px-4 py-2 font-medium text-right">Payé</th>
                  <th className="px-4 py-2 font-medium text-right">Reste</th>
                </tr>
              </thead>
              <tbody>
                {totaux.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">
                      Aucun objet de vente. Créez-en un ci-dessous.
                    </td>
                  </tr>
                ) : (
                  totaux.map((t) => {
                    const ouvert = !replies.has(t.sous.id);
                    return (
                      <Fragment key={t.sous.id}>
                        <tr className="border-b border-border/60 bg-surface-2/40">
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => basculerRepli(t.sous.id)}
                                disabled={t.payeurs.length === 0}
                                aria-expanded={ouvert}
                                title={ouvert ? "Replier les sous-totaux" : "Déplier les sous-totaux"}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 disabled:opacity-30"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-4 w-4 transition-transform ${ouvert && t.payeurs.length > 0 ? "rotate-90" : ""}`} aria-hidden="true">
                                  <path d="m9 6 6 6-6 6" />
                                </svg>
                              </button>
                              <button type="button" onClick={() => setFiche(t.sous.id)} className="text-left font-medium hover:text-accent hover:underline" title="Fiche résumé">
                                {t.sous.nom}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{t.nb}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{formatEuros(t.attendu)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium text-positive">{formatEuros(t.paye)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{formatEuros(t.attendu - t.paye)}</td>
                        </tr>
                        {ouvert &&
                          t.payeurs.map((g) => (
                            <tr key={g.cle} className="border-b border-border/40 text-[13px]">
                              <td className="py-1.5 pl-12 pr-4 text-muted">
                                {g.libelle}
                                {g.paye >= g.attendu - 0.005 && (
                                  <span className="ml-2 text-emerald-600" title="Soldé">
                                    ✓
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-muted">{g.nb}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums">{formatEuros(g.attendu)}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums text-positive">{formatEuros(g.paye)}</td>
                              <td className="px-4 py-1.5 text-right tabular-nums">{formatEuros(g.attendu - g.paye)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          {ficheTotal && (
            <Modal title={ficheTotal.sous.nom} onClose={() => setFiche(null)} fermerAuClicExterieur>
              {(() => {
                const t = ficheTotal;
                const statuts = STATUTS.map((st) => ({
                  ...st,
                  n: t.lignes.filter((d) => statutVente(Number(d.montant_attendu), payeDe(d.id)) === st.v).length,
                })).filter((st) => st.n > 0);
                const parMode = MODES.map((m) => {
                  const ls = t.lignes.filter((d) => d.mode_attendu === m.v);
                  return { ...m, n: ls.length, attendu: ls.reduce((a, d) => a + Number(d.montant_attendu), 0) };
                }).filter((m) => m.n > 0);
                const ventile = ventilations.filter((v) => v.sous_categorie_id === t.sous.id).reduce((a, v) => a + v.montant, 0);
                const taux = t.attendu > 0 ? Math.round((t.paye / t.attendu) * 100) : 0;
                return (
                  <div className="space-y-3 text-sm">
                    <p className="text-xs text-muted">
                      {DOMAINES.find((d) => d.v === t.sous.domaine)?.label} · {exerciceLib}
                    </p>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { l: "Ventes", v: String(t.nb) },
                        { l: "Attendu", v: formatEuros(t.attendu) },
                        { l: "Payé", v: formatEuros(t.paye) },
                        { l: "Reste", v: formatEuros(t.attendu - t.paye) },
                      ].map((k) => (
                        <div key={k.l} className="rounded-lg bg-surface-2 px-2 py-1.5">
                          <div className="text-[10.5px] uppercase tracking-wide text-muted">{k.l}</div>
                          <div className="font-semibold tabular-nums">{k.v}</div>
                        </div>
                      ))}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" title={`${taux} % encaissé`}>
                      <div className="h-full bg-positive" style={{ width: `${Math.min(100, taux)}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {statuts.map((st) => (
                        <span key={st.v} className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                          {st.n} {st.label.toLowerCase()}
                        </span>
                      ))}
                      {parMode.map((m) => (
                        <span key={m.v} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                          {m.label.replace(/ attendu.*$/, "")} : {m.n} · {formatEuros(m.attendu)}
                        </span>
                      ))}
                    </div>
                    {estTresorier && ventile > 0 && (
                      <p className="text-xs text-muted">Ventilé depuis la banque (Comptabilité) : {formatEuros(ventile)}</p>
                    )}
                    {t.payeurs.length > 0 && (
                      <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
                        {t.payeurs.map((g) => (
                          <li key={g.cle} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                            <span className="min-w-0 flex-1 truncate">{g.libelle}</span>
                            <span className="tabular-nums text-muted">
                              {formatEuros(g.paye)} / {formatEuros(g.attendu)}
                            </span>
                            {g.paye >= g.attendu - 0.005 ? <span className="text-emerald-600">✓</span> : <span className="w-3" />}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </Modal>
          )}

          {/* Tableau dus / payés */}
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">Ventes attendues</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Payeur</th>
                    <th className="px-4 py-2 font-medium">Objet de vente</th>
                    <th className="px-4 py-2 font-medium">Mode</th>
                    <th className="px-4 py-2 font-medium text-right">Attendu</th>
                    <th className="px-4 py-2 font-medium text-right">Payé</th>
                    <th className="px-4 py-2 font-medium">Statut</th>
                    {peutModifier && <th className="px-4 py-2 font-medium" />}
                  </tr>
                </thead>
                <tbody>
                  {duesFiltrees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted">
                        Aucune vente pour ce domaine.
                      </td>
                    </tr>
                  ) : (
                    duesFiltrees.map((d) => {
                      const paye = payeDe(d.id);
                      const st = statutVente(Number(d.montant_attendu), paye);
                      const stInfo = STATUTS.find((s) => s.v === st)!;
                      const cat = sousCategories.find((s) => s.id === d.sous_categorie_id)?.nom ?? "—";
                      return (
                        <tr key={d.id} className="border-b border-border/60">
                          <td className="px-4 py-2 font-medium">
                            {libellePayeur(d, familles, contacts)}
                            {st === "paye" || st === "trop_percu" ? (
                              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700" title="Payé">
                                ✓
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2">{cat}</td>
                          <td className="px-4 py-2 text-muted">{MODES.find((m) => m.v === d.mode_attendu)?.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatEuros(Number(d.montant_attendu))}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatEuros(paye)}</td>
                          <td className="px-4 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stInfo.cls}`}>{stInfo.label}</span>
                          </td>
                          {peutModifier && (
                            <td className="px-4 py-2 text-right whitespace-nowrap">
                              {d.mode_attendu === "liquide" && st === "a_payer" && (
                                <button type="button" disabled={busy} className={btnGhost + " mr-1"} onClick={() => payerLiquide(d)}>
                                  Marquer payé (caisse)
                                </button>
                              )}
                              <button type="button" disabled={busy} className="text-xs text-muted hover:text-negative" onClick={() => supprimerDue(d.id)}>
                                Suppr.
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {peutModifier && (
            <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
              <form onSubmit={creerVente} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <h2 className="text-sm font-semibold">Nouvelle vente attendue</h2>
                <select className={input} value={sousId} onChange={(e) => setSousId(e.target.value)} required>
                  <option value="">Objet de vente…</option>
                  {sousDuDomaine.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nom}
                    </option>
                  ))}
                </select>
                {!nouveauContact ? (
                  <div className="flex gap-2">
                    <select className={input} value={payeur} onChange={(e) => setPayeur(e.target.value)}>
                      <option value="">Famille ou personne…</option>
                      <optgroup label="Familles">
                        {payeurs.filter((p) => p.kind === "famille").map((p) => (
                          <option key={p.id} value={`famille:${p.id}`}>
                            {p.libelle}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Personnes (Carnet)">
                        {payeurs.filter((p) => p.kind === "contact").map((p) => (
                          <option key={p.id} value={`contact:${p.id}`}>
                            {p.libelle}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <button type="button" className={btnGhost + " shrink-0"} onClick={() => setNouveauContact(true)}>
                      + Personne
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input className={input} placeholder="Prénom" value={cPrenom} onChange={(e) => setCPrenom(e.target.value)} />
                    <input className={input} placeholder="Nom" value={cNom} onChange={(e) => setCNom(e.target.value)} required />
                    <button type="button" className={btnGhost + " col-span-2"} onClick={() => setNouveauContact(false)}>
                      Choisir dans le Carnet
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} placeholder="Montant (€)" value={montant} onChange={(e) => setMontant(e.target.value)} required />
                  <select className={input} value={mode} onChange={(e) => setMode(e.target.value as ModeAttendu)}>
                    {MODES.map((m) => (
                      <option key={m.v} value={m.v}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                {mode === "liquide" && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={liquideMaintenant} onChange={(e) => setLiquideMaintenant(e.target.checked)} />
                    Déjà payé en liquide (écrit dans la Caisse {DOMAINES.find((d) => d.v === domaine)?.label})
                  </label>
                )}
                <input className={input} placeholder="Notes (optionnel)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <button type="submit" disabled={busy} className={btn}>
                  Enregistrer
                </button>
              </form>
              <form onSubmit={creerSousCat} className="rounded-xl border border-border bg-surface p-3 space-y-2">
                <h2 className="text-sm font-semibold">Nouvel objet de vente</h2>
                <div className="flex gap-2">
                  <input className={input + " py-1.5"} placeholder="Ex. Vente photo" value={nomSous} onChange={(e) => setNomSous(e.target.value)} />
                  <button type="submit" disabled={busy} className={btn + " shrink-0"}>
                    Créer
                  </button>
                </div>
                <p className="text-[11px] text-muted">Réutilisable d&apos;un exercice à l&apos;autre · {DOMAINES.find((d) => d.v === domaine)?.label}</p>
              </form>
            </div>
          )}

        </>
      )}

      {vue === "rattachement" && estTresorier && (
        <section className="space-y-4">
          <p className="text-sm text-muted">
            Rattachez une opération bancaire catégorisée « Ventes diverses » à une vente attendue. Le paiement passe alors en Payé (coche verte). Les chèques et virements passent par la Comptabilité ; le liquide passe par les{" "}
            <Link href="/caisses" className="text-accent underline">
              Caisses
            </Link>
            .
          </p>
          {operations.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-muted">
              Aucune recette « Ventes diverses » sur cet exercice. Importez le relevé ou catégorisez l&apos;opération dans{" "}
              <Link href="/comptabilite" className="text-accent underline">
                Comptabilité
              </Link>
              .
            </p>
          ) : (
            operations.map((op) => {
              const deja = ventilations.filter((v) => v.operation_id === op.id).reduce((s, v) => s + v.montant, 0);
              const reste = op.montant - deja;
              const duesOuvertes = dues.filter((d) => statutVente(Number(d.montant_attendu), payeDe(d.id)) === "a_payer");
              return (
                <div key={op.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-xs text-muted">{formatDate(op.date_operation)}</span>
                      <div className="font-medium">{op.libelle}</div>
                      <div className="text-xs text-muted">{op.categories?.nom} · {op.mode_paiement ?? "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums font-semibold">{formatEuros(op.montant)}</div>
                      {deja > 0 && <div className="text-xs text-muted">dont {formatEuros(deja)} déjà ventilé · reste {formatEuros(reste)}</div>}
                    </div>
                  </div>
                  {reste > 0.005 && duesOuvertes.length > 0 && (
                    <ul className="mt-3 space-y-1 border-t border-border pt-3">
                      {duesOuvertes.map((d) => {
                        const manque = Number(d.montant_attendu) - payeDe(d.id);
                        const m = Math.min(reste, manque);
                        return (
                          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>
                              {libellePayeur(d, familles, contacts)} · {sousCategories.find((s) => s.id === d.sous_categorie_id)?.nom} · reste {formatEuros(manque)}
                            </span>
                            <button type="button" disabled={busy} className={btn} onClick={() => rattacher(d.id, op.id, m)}>
                              Rattacher {formatEuros(m)}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {reste > 0.005 && duesOuvertes.length === 0 && (
                    <p className="mt-2 text-xs text-muted">Aucune vente « À payer » : créez-en une dans l&apos;onglet Ventes.</p>
                  )}
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

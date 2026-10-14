"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros, todayISO } from "@/lib/format";
import { telechargerVentesPdf } from "@/lib/ventesPdf";
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

  // Nouvelle sous-catégorie
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
      return { sous: s, attendu, paye, nb: lignes.length };
    });
  })();

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
    if (!sousId) return setErreur("Choisissez une sous-catégorie.");
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
        <label className="text-sm text-muted">Exercice</label>
        <select
          className={input + " w-auto"}
          value={exerciceId}
          onChange={(e) => {
            const u = new URL(window.location.href);
            u.searchParams.set("exercice", e.target.value);
            router.push(u.pathname + "?" + u.searchParams.toString());
          }}
        >
          {exercices.map((e) => (
            <option key={e.id} value={e.id}>
              {e.libelle}
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
          {/* Totaux */}
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Totaux · {DOMAINES.find((d) => d.v === domaine)?.label}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Sous-catégorie</th>
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
                      Aucune sous-catégorie. Créez-en une ci-dessous.
                    </td>
                  </tr>
                ) : (
                  totaux.map((t) => (
                    <tr key={t.sous.id} className="border-b border-border/60">
                      <td className="px-4 py-2">{t.sous.nom}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{t.nb}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatEuros(t.attendu)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-positive">{formatEuros(t.paye)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatEuros(t.attendu - t.paye)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {peutModifier && (
            <div className="grid gap-4 md:grid-cols-2">
              <form onSubmit={creerSousCat} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <h2 className="text-sm font-semibold">Nouvelle sous-catégorie</h2>
                <p className="text-xs text-muted">Réutilisable d&apos;un exercice à l&apos;autre · domaine {DOMAINES.find((d) => d.v === domaine)?.label}</p>
                <input className={input} placeholder="Ex. Vente photo" value={nomSous} onChange={(e) => setNomSous(e.target.value)} />
                <button type="submit" disabled={busy} className={btn}>
                  Créer
                </button>
              </form>

              <form onSubmit={creerVente} className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <h2 className="text-sm font-semibold">Nouvelle vente attendue</h2>
                <select className={input} value={sousId} onChange={(e) => setSousId(e.target.value)} required>
                  <option value="">Sous-catégorie…</option>
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
            </div>
          )}

          {/* Tableau dus / payés */}
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted">Ventes attendues</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="px-4 py-2 font-medium">Payeur</th>
                    <th className="px-4 py-2 font-medium">Sous-catégorie</th>
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

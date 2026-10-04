"use client";

import { useMemo, useState } from "react";
import { Field, inputCls } from "./GestionComptes";
import type { Don } from "./GestionDons";
import type { Groupe, RecuInfo } from "./ListeRecus";
import { LIBELLE, TON, VERROUILLER_ANNEES_AVANT, recalculerRegistre, type StatutRecu } from "./recusCommun";
import { CATEGORIES_DONATEUR, estCategoriePersonneMorale } from "@/lib/categoriesDonateur";
import { PREFERENCES_ENVOI, libelleMoyen, prefereEnBase } from "@/lib/envoiRecu";
import { formatDate, formatEuros } from "@/lib/format";
import { dateEditionDuNumero } from "@/lib/recu";
import { createClient } from "@/lib/supabase/client";
import { useCoffre } from "@/components/CoffreProvider";
import { champsImportantsManquants, recuEnvoye } from "@/lib/statutDon";

type Entree = { g: Groupe; statut: StatutRecu };

/** Ce que la fiche peut déclencher : ces fenêtres vivent dans la liste des reçus. */
export type ActionsFiche = {
  etablir: (g: Groupe) => void;
  envoi: (g: Groupe) => void;
  pdf: (g: Groupe) => void;
  annuler: (g: Groupe) => void;
  refuser: (g: Groupe) => void;
  retablir: (g: Groupe) => void;
  modifierDon: (d: Don, signaler: boolean) => void;
  reattribuer: (d: Don, g: Groupe, statut: StatutRecu) => void;
};

type FormFiche = {
  est_personne_morale: boolean;
  categorie_donateur: string;
  donateur_titre: string;
  donateur_nom: string;
  donateur_prenom: string;
  raison_sociale: string;
  adresse: string;
  cp_ville: string;
  courriel: string;
  envoi_prefere: string;
};

const nomDe = (d: Don) =>
  d.est_personne_morale
    ? d.raison_sociale ?? d.donateur_nom ?? "—"
    : [d.donateur_titre, d.donateur_prenom, d.donateur_nom].filter(Boolean).join(" ") || "—";

function formDepuis(d: Don): FormFiche {
  return {
    est_personne_morale: d.est_personne_morale,
    categorie_donateur: d.categorie_donateur ?? (d.est_personne_morale ? "Association" : "Particulier"),
    donateur_titre: d.donateur_titre ?? "",
    donateur_nom: d.donateur_nom ?? "",
    donateur_prenom: d.donateur_prenom ?? "",
    raison_sociale: d.raison_sociale ?? "",
    adresse: d.adresse ?? "",
    cp_ville: d.cp_ville ?? "",
    courriel: d.courriel ?? "",
    envoi_prefere: d.envoi_prefere ?? "courriel",
  };
}

/**
 * Fiche « Reçu fiscal donateur » : d'abord la fiche du donateur (modifiable, reportée sur
 * tous ses dons), puis, année par année, ses dons classés par reçu fiscal : reçus déjà
 * édités (envoi, PDF), dons encore sans reçu (établir un reçu complet ou intermédiaire).
 */
export default function FicheRecuDonateur({
  entrees,
  dons,
  suivi,
  anneeCible,
  actions,
  onFermer,
  onChange,
}: {
  /** Tous les groupes (reçus et dons à établir) de ce donateur. */
  entrees: Entree[];
  /** Tous ses dons, déchiffrés. */
  dons: Don[];
  suivi: Map<string, RecuInfo>;
  /** Année de la ligne cliquée : sa section est mise en évidence. */
  anneeCible: number | null;
  actions: ActionsFiche;
  onFermer: () => void;
  /** Après une écriture : message à afficher et rechargement des données. */
  onChange: (ok: boolean, message: string) => void;
}) {
  const coffre = useCoffre();
  const recent = useMemo(() => [...dons].sort((a, b) => b.date_don.localeCompare(a.date_don))[0], [dons]);
  const [form, setForm] = useState<FormFiche>(() => formDepuis(recent));
  const [initial, setInitial] = useState<FormFiche>(() => formDepuis(recent));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rattacher, setRattacher] = useState<{ donId: string; cible: string } | null>(null);
  const set = <K extends keyof FormFiche>(k: K, v: FormFiche[K]) => setForm((p) => ({ ...p, [k]: v }));
  const modifiee = JSON.stringify(form) !== JSON.stringify(initial);

  const annees = useMemo(() => [...new Set(entrees.map((e) => e.g.annee))].sort((a, b) => b - a), [entrees]);
  const verrouille = (annee: number) => VERROUILLER_ANNEES_AVANT !== null && annee <= VERROUILLER_ANNEES_AVANT;

  async function enregistrerFiche() {
    setErreur(null);
    if (!coffre.estOuvert) return setErreur("Coffre verrouillé : déverrouillez-le (Paramètres → Sécurité) pour modifier la fiche.");
    if (form.est_personne_morale ? !form.raison_sociale.trim() : !form.donateur_nom.trim())
      return setErreur(form.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
    setBusy(true);
    const pii = {
      titre: form.donateur_titre.trim() || null,
      nom: form.donateur_nom.trim() || null,
      prenom: form.donateur_prenom.trim() || null,
      raison: form.est_personne_morale ? form.raison_sociale.trim() : null,
      adresse: form.adresse.trim() || null,
      cp_ville: form.cp_ville.trim() || null,
      courriel: form.courriel.trim() || null,
    };
    const { error } = await createClient()
      .from("dons")
      .update({
        pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
        donateur_titre: null,
        donateur_nom: null,
        donateur_prenom: null,
        raison_sociale: null,
        adresse: null,
        cp_ville: null,
        courriel: null,
        est_personne_morale: form.est_personne_morale,
        categorie_donateur: form.categorie_donateur || null,
        envoi_prefere: prefereEnBase(form.envoi_prefere),
      })
      .in("id", dons.map((d) => d.id));
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    setInitial(form);
    onChange(true, `Fiche de ${nomDe({ ...recent, ...fusion(form) })} enregistrée sur ${dons.length} don${dons.length > 1 ? "s" : ""}.`);
  }

  /** Retire un don de son reçu : il redevient « sans reçu » et rejoint le reçu à établir de l'année. */
  async function detacher(d: Don, g: Groupe, st: StatutRecu) {
    if (!g.numero) return;
    const avert = st === "envoye" ? " Ce reçu a déjà été envoyé : l'exemplaire du donateur ne correspondra plus." : st === "edite" || st === "courrier" ? " Ce reçu est déjà établi : son PDF sera à refaire." : "";
    if (!window.confirm(`Retirer le don du ${formatDate(d.date_don)} (${formatEuros(Number(d.montant))}) du reçu ${g.numero} ?${avert}`)) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("dons").update({ recu_numero: null, recu_emis_le: null, recu_etat: null }).eq("id", d.id);
    if (!error) await recalculerRegistre(supabase, g.numero);
    setBusy(false);
    onChange(!error, error ? error.message : `Don du ${formatDate(d.date_don)} retiré du reçu ${g.numero}.`);
  }

  /** Rattache un don sans reçu à un reçu déjà établi du même donateur et de la même année. */
  async function rattacherDon(d: Don, cible: Entree) {
    const numero = cible.g.numero;
    if (!numero) return;
    const envoye = cible.statut === "envoye";
    const avert = envoye
      ? " Ce reçu a déjà été envoyé : l'exemplaire du donateur ne couvrira pas ce don."
      : " Ce reçu est déjà établi : son PDF sera à refaire.";
    if (!window.confirm(`Rattacher le don du ${formatDate(d.date_don)} (${formatEuros(Number(d.montant))}) au reçu ${numero} ?${avert}`)) return;
    setBusy(true);
    const supabase = createClient();
    const modele = cible.g.dons[0];
    const { error } = await supabase
      .from("dons")
      .update({
        recu_numero: numero,
        recu_emis_le: cible.g.dons.find((x) => x.recu_emis_le)?.recu_emis_le ?? null,
        recu_etat: envoye ? cible.g.dons.map((x) => x.recu_etat).find((t) => recuEnvoye({ recu_etat: t } as never) && t) ?? modele.recu_etat : null,
      })
      .eq("id", d.id);
    if (!error) await recalculerRegistre(supabase, numero);
    setBusy(false);
    setRattacher(null);
    onChange(!error, error ? error.message : `Don du ${formatDate(d.date_don)} rattaché au reçu ${numero}.`);
  }

  const infoEnvoi = (g: Groupe) => {
    const s = g.numero ? suivi.get(g.numero) : undefined;
    if (s?.envoye_le) return `Envoyé le ${formatDate(s.envoye_le)}${libelleMoyen(s.envoi_mode) ? ` · ${libelleMoyen(s.envoi_mode)}` : ""}`;
    return g.dons.map((d) => d.recu_etat?.trim()).find(Boolean) ?? null;
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Reçu fiscal — {nomDe({ ...recent, ...fusion(form) })}</h2>
            <p className="text-xs text-muted">
              {dons.length} don{dons.length > 1 ? "s" : ""} · {formatEuros(dons.reduce((s, d) => s + Number(d.montant), 0))} au total
            </p>
          </div>
          <button type="button" onClick={onFermer} className="text-muted hover:text-foreground" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5 text-sm">
          {/* 1. Fiche du donateur */}
          <section className="space-y-3 rounded-xl border border-border p-4">
            <h3 className="font-semibold">Fiche du donateur</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Catégorie">
                <select
                  value={form.categorie_donateur}
                  onChange={(e) => {
                    set("categorie_donateur", e.target.value);
                    set("est_personne_morale", estCategoriePersonneMorale(e.target.value));
                  }}
                  className={inputCls}
                >
                  {!CATEGORIES_DONATEUR.includes(form.categorie_donateur as (typeof CATEGORIES_DONATEUR)[number]) && (
                    <option value={form.categorie_donateur}>{form.categorie_donateur}</option>
                  )}
                  {CATEGORIES_DONATEUR.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reçus fiscaux envoyés par">
                <select value={form.envoi_prefere} onChange={(e) => set("envoi_prefere", e.target.value)} className={inputCls}>
                  {PREFERENCES_ENVOI.map((o) => (
                    <option key={o.v} value={o.v}>{o.l}</option>
                  ))}
                </select>
              </Field>
            </div>
            {form.est_personne_morale ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Field label="Raison sociale">
                    <input type="text" value={form.raison_sociale} onChange={(e) => set("raison_sociale", e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <Field label="Contact — Prénom">
                  <input type="text" value={form.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Contact — Nom">
                  <input type="text" value={form.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls} />
                </Field>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Titre">
                  <input type="text" value={form.donateur_titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} placeholder="Monsieur…" />
                </Field>
                <Field label="Prénom">
                  <input type="text" value={form.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
                </Field>
                <Field label="Nom">
                  <input type="text" value={form.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}
            <Field label="Adresse">
              <input type="text" value={form.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls} placeholder="N° et rue" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CP et ville">
                <input type="text" value={form.cp_ville} onChange={(e) => set("cp_ville", e.target.value)} className={inputCls} placeholder="51100 Reims" />
              </Field>
              <Field label="Courriel">
                <input type="email" value={form.courriel} onChange={(e) => set("courriel", e.target.value)} className={inputCls} />
              </Field>
            </div>
            {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-negative">{erreur}</p>}
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">La fiche est reportée sur tous les dons de ce donateur.</span>
              <button
                type="button"
                onClick={enregistrerFiche}
                disabled={busy || !modifiee}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Enregistrement…" : "Enregistrer la fiche"}
              </button>
            </div>
          </section>

          {/* 2. Dons et reçus, année par année */}
          {annees.map((annee) => {
            const lesEntrees = entrees.filter((e) => e.g.annee === annee);
            const total = lesEntrees.reduce((s, e) => s + e.g.total, 0);
            const nb = lesEntrees.reduce((s, e) => s + e.g.dons.length, 0);
            const bloque = verrouille(annee);
            const numerotes = lesEntrees.filter((e) => e.g.numero);
            return (
              <section
                key={annee}
                className={`space-y-3 rounded-xl border p-4 ${annee === anneeCible ? "border-accent" : "border-border"}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold">
                    Reçu fiscal {annee}
                    {bloque && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-normal text-muted">🔒 verrouillé</span>}
                  </h3>
                  <span className="text-xs text-muted">
                    {nb} don{nb > 1 ? "s" : ""} · {formatEuros(total)}
                  </span>
                </div>

                {lesEntrees.map((e) => {
                  const { g, statut: st } = e;
                  const manque = g.sans ? [] : champsImportantsManquants(g.representant);
                  const emis = g.dons.find((d) => d.recu_emis_le)?.recu_emis_le ?? dateEditionDuNumero(g.numero);
                  return (
                    <div key={g.cle} className="rounded-lg border border-border bg-surface-2/40 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TON[st]}`}>{LIBELLE[st]}</span>
                            {g.numero ? (
                              <span className="font-medium tabular-nums">{g.numero}</span>
                            ) : (
                              <span className="text-muted">Dons sans reçu</span>
                            )}
                            <span className="font-medium tabular-nums">{formatEuros(g.total)}</span>
                            {g.aScinder && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs text-gold">numéro partagé avec une autre année</span>}
                          </div>
                          <div className="text-xs text-muted">
                            {g.numero && emis ? `Édité le ${formatDate(emis)}` : null}
                            {g.numero && infoEnvoi(g) ? ` · ${infoEnvoi(g)}` : null}
                            {!g.numero && !g.sans && st === "attente" ? "Donateur régulier : un reçu unique est possible en fin d'année ; un reçu intermédiaire reste possible." : null}
                            {g.sans ? "Ce donateur ne demande pas de reçu fiscal." : null}
                          </div>
                          {manque.length > 0 && <div className="text-xs text-negative">⚠ fiche incomplète : {manque.join(", ")}</div>}
                        </div>
                        {!bloque && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {g.numero ? (
                              <>
                                <button type="button" onClick={() => actions.pdf(g)} className="rounded-lg border border-border px-2.5 py-1 hover:bg-surface-2">
                                  PDF
                                </button>
                                {st === "envoye" ? (
                                  <button type="button" onClick={() => actions.envoi(g)} className="rounded-lg border border-border px-2.5 py-1 hover:bg-surface-2">
                                    Modifier l&apos;envoi
                                  </button>
                                ) : (
                                  <>
                                    <button type="button" onClick={() => actions.envoi(g)} className="rounded-lg border border-positive/40 px-2.5 py-1 text-positive hover:bg-positive/10">
                                      Marquer envoyé
                                    </button>
                                    <button type="button" onClick={() => actions.annuler(g)} className="rounded-lg border border-border px-2.5 py-1 text-muted hover:text-negative">
                                      Annuler le reçu
                                    </button>
                                  </>
                                )}
                              </>
                            ) : g.sans ? (
                              <button type="button" onClick={() => actions.retablir(g)} className="rounded-lg border border-border px-2.5 py-1 text-accent hover:bg-surface-2">
                                Rétablir le reçu
                              </button>
                            ) : (
                              <>
                                <button type="button" onClick={() => actions.refuser(g)} className="rounded-lg border border-border px-2.5 py-1 text-muted hover:text-foreground">
                                  Reçu non demandé
                                </button>
                                <button type="button" onClick={() => actions.etablir(g)} className="rounded-lg bg-accent px-3 py-1 font-medium text-accent-fg hover:opacity-90">
                                  {st === "attente" ? "Reçu intermédiaire" : "Établir le reçu"}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <ul className="mt-2 divide-y divide-border/60">
                        {g.dons.map((d) => {
                          const cibles = numerotes.filter((x) => x.g.cle !== g.cle);
                          return (
                            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                              <span className="w-24 tabular-nums">{formatDate(d.date_don)}</span>
                              <span className="w-24 text-right font-medium tabular-nums">{formatEuros(Number(d.montant))}</span>
                              <span className="w-28 text-muted">{d.mode_paiement ?? "—"}</span>
                              {d.operation_id ? (
                                <span className="rounded-full bg-positive/15 px-2 py-0.5 text-xs text-positive" title="Relié à la comptabilité">
                                  compta{d.operation?.date_operation ? ` · ${formatDate(d.operation.date_operation)}` : ""}
                                </span>
                              ) : (
                                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">hors compta</span>
                              )}
                              {!bloque && (
                                <span className="ml-auto flex flex-wrap items-center gap-3 text-xs">
                                  <button type="button" onClick={() => actions.modifierDon(d, manque.length > 0)} className="text-accent hover:underline">
                                    Modifier
                                  </button>
                                  <button type="button" onClick={() => actions.reattribuer(d, g, st)} className="text-muted hover:text-foreground hover:underline">
                                    Réattribuer
                                  </button>
                                  {g.numero && (
                                    <button type="button" onClick={() => detacher(d, g, st)} disabled={busy} className="text-muted hover:text-negative hover:underline disabled:opacity-50">
                                      Détacher du reçu
                                    </button>
                                  )}
                                  {!g.numero && !g.sans && cibles.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => setRattacher({ donId: d.id, cible: cibles[0].g.cle })}
                                      className="text-muted hover:text-foreground hover:underline"
                                    >
                                      Rattacher à un reçu
                                    </button>
                                  )}
                                </span>
                              )}
                              {rattacher?.donId === d.id && (
                                <div className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs">
                                  <span>Rattacher à :</span>
                                  <select
                                    value={rattacher.cible}
                                    onChange={(ev) => setRattacher({ donId: d.id, cible: ev.target.value })}
                                    className={`${inputCls} max-w-xs`}
                                  >
                                    {cibles.map((x) => (
                                      <option key={x.g.cle} value={x.g.cle}>
                                        {x.g.numero} — {formatEuros(x.g.total)} ({LIBELLE[x.statut]})
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      const c = cibles.find((x) => x.g.cle === rattacher.cible);
                                      if (c) void rattacherDon(d, c);
                                    }}
                                    className="rounded-lg bg-accent px-3 py-1 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                                  >
                                    Rattacher
                                  </button>
                                  <button type="button" onClick={() => setRattacher(null)} className="text-muted hover:text-foreground">
                                    Annuler
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Champs de la fiche qui servent à reconstituer le nom affiché (titre, prénom, nom, raison sociale). */
function fusion(f: FormFiche) {
  return {
    est_personne_morale: f.est_personne_morale,
    donateur_titre: f.donateur_titre || null,
    donateur_prenom: f.donateur_prenom || null,
    donateur_nom: f.donateur_nom || null,
    raison_sociale: f.raison_sociale || null,
  };
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { genererRecuDocx } from "@/lib/recu";
import { Modal, Field, FormFooter, inputCls } from "./GestionComptes";
import { useCoffre } from "@/components/CoffreProvider";
import { useDonsDechiffres, piiDepuis } from "@/lib/donsChiffre";
import {
  statutsDon,
  donateursRecurrents,
  cleDonateur,
  TONE_CLASSES,
  FILTRES,
  type Chip,
  type StatutKey,
} from "@/lib/statutDon";

export type Don = {
  id: string;
  exercice_id: string | null;
  origine: string | null;
  categorie_donateur: string | null;
  est_personne_morale: boolean;
  donateur_titre: string | null;
  donateur_nom: string | null;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  adresse: string | null;
  cp_ville: string | null;
  courriel: string | null;
  pii_chiffre: string | null;
  montant: number;
  date_don: string;
  mode_paiement: string | null;
  recu_numero: string | null;
  recu_etat: string | null;
  recu_emis_le: string | null;
  observations: string | null;
};

const CATEGORIES = [
  "Particulier",
  "Association",
  "Entreprise",
  "Professionnel",
  "Communauté religieuse",
];
const MODES = ["Virement", "Chèque", "Carte bancaire", "Espèces", "Nature", "Autre"];

// Année SCOLAIRE (1er sept → 31 août) d'une date ISO → « 2025-2026 ».
const anneeScolaireISO = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
};
const anneeScolaireCourante = () => anneeScolaireISO(new Date().toISOString().slice(0, 10));

type FormState = {
  origine: string;
  categorie_donateur: string;
  est_personne_morale: boolean;
  donateur_titre: string;
  donateur_nom: string;
  donateur_prenom: string;
  raison_sociale: string;
  adresse: string;
  cp_ville: string;
  courriel: string;
  montant: string;
  date_don: string;
  mode_paiement: string;
  recu_numero: string;
  recu_etat: string;
  observations: string;
};

function vide(): FormState {
  return {
    origine: "",
    categorie_donateur: "Particulier",
    est_personne_morale: false,
    donateur_titre: "Monsieur",
    donateur_nom: "",
    donateur_prenom: "",
    raison_sociale: "",
    adresse: "",
    cp_ville: "",
    courriel: "",
    montant: "",
    date_don: todayISO(),
    mode_paiement: "Virement",
    recu_numero: "",
    recu_etat: "",
    observations: "",
  };
}

export default function GestionDons({ dons: donsInit }: { dons: Don[] }) {
  const router = useRouter();
  const coffre = useCoffre();
  // Dons hydratés : PII déchiffré si le coffre est ouvert, 🔒 sinon.
  const { dons, verrou } = useDonsDechiffres(donsInit);
  const nonChiffres = useMemo(() => donsInit.filter((d) => !d.pii_chiffre), [donsInit]);
  const [edit, setEdit] = useState<Don | "nouveau" | null>(null);
  const [saving, setSaving] = useState(false);
  const [migration, setMigration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genErreur, setGenErreur] = useState<string | null>(null);
  const [f, setF] = useState<FormState>(vide());
  const [filtre, setFiltre] = useState<StatutKey | null>(null);
  const [signaler, setSignaler] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [anneeFiltre, setAnneeFiltre] = useState(anneeScolaireCourante());
  const [catFiltre, setCatFiltre] = useState("toutes");

  const recurrents = useMemo(() => donateursRecurrents(dons), [dons]);
  const chipsParDon = useMemo(() => {
    const map = new Map<string, Chip[]>();
    for (const d of dons) map.set(d.id, statutsDon(d, recurrents));
    return map;
  }, [dons, recurrents]);
  const compteParStatut = useMemo(() => {
    const c = new Map<StatutKey, number>();
    for (const chips of chipsParDon.values())
      for (const ch of chips) c.set(ch.key, (c.get(ch.key) ?? 0) + 1);
    return c;
  }, [chipsParDon]);
  const annees = useMemo(() => {
    const s = new Set<string>([anneeScolaireCourante()]);
    for (const d of dons) if (d.date_don) s.add(anneeScolaireISO(d.date_don));
    return [...s].sort().reverse();
  }, [dons]);
  const categoriesPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const d of dons) if (d.categorie_donateur) s.add(d.categorie_donateur);
    return [...s].sort();
  }, [dons]);

  const donsAffiches = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return dons.filter((d) => {
      if (filtre && !(chipsParDon.get(d.id) ?? []).some((c) => c.key === filtre)) return false;
      if (anneeFiltre !== "toutes" && (!d.date_don || anneeScolaireISO(d.date_don) !== anneeFiltre)) return false;
      if (catFiltre !== "toutes" && (d.categorie_donateur ?? "") !== catFiltre) return false;
      if (q) {
        const nom = d.est_personne_morale
          ? d.raison_sociale ?? d.donateur_nom
          : [d.donateur_titre, d.donateur_nom, d.donateur_prenom].filter(Boolean).join(" ");
        if (!`${nom} ${d.courriel ?? ""} ${d.cp_ville ?? ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [dons, filtre, anneeFiltre, catFiltre, recherche, chipsParDon]);

  const statsAffiches = useMemo(() => {
    const totalM = donsAffiches.reduce((s, d) => s + Number(d.montant), 0);
    const donateurs = new Set(donsAffiches.map((d) => cleDonateur(d))).size;
    return {
      count: donsAffiches.length,
      total: totalM,
      donateurs,
      moyenne: donsAffiches.length ? totalM / donsAffiches.length : 0,
    };
  }, [donsAffiches]);

  const filtresActifs =
    filtre || anneeFiltre !== anneeScolaireCourante() || catFiltre !== "toutes" || recherche.trim() !== "";
  function reinitialiser() {
    setFiltre(null);
    setAnneeFiltre(anneeScolaireCourante());
    setCatFiltre("toutes");
    setRecherche("");
  }

  function exporterCSV() {
    const entete = ["Date", "Donateur", "Catégorie", "Montant", "Mode", "N° reçu", "État reçu", "Courriel", "CP/Ville"];
    const lignes = donsAffiches.map((d) => {
      const nom = d.est_personne_morale
        ? d.raison_sociale ?? d.donateur_nom
        : [d.donateur_titre, d.donateur_nom, d.donateur_prenom].filter(Boolean).join(" ");
      return [d.date_don, nom, d.categorie_donateur ?? "", String(d.montant).replace(".", ","), d.mode_paiement ?? "", d.recu_numero ?? "", d.recu_etat ?? "", d.courriel ?? "", d.cp_ville ?? ""];
    });
    const csv = [entete, ...lignes]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dons${anneeFiltre !== "toutes" ? "-" + anneeFiltre : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  function ouvrir(d: Don | "nouveau", signale = false) {
    setError(null);
    setSignaler(signale);
    if (d === "nouveau") {
      setF(vide());
    } else {
      setF({
        origine: d.origine ?? "",
        categorie_donateur: d.categorie_donateur ?? "Particulier",
        est_personne_morale: d.est_personne_morale,
        donateur_titre: d.donateur_titre ?? "",
        donateur_nom: d.donateur_nom ?? "",
        donateur_prenom: d.donateur_prenom ?? "",
        raison_sociale: d.raison_sociale ?? "",
        adresse: d.adresse ?? "",
        cp_ville: d.cp_ville ?? "",
        courriel: d.courriel ?? "",
        montant: String(d.montant).replace(".", ","),
        date_don: d.date_don,
        mode_paiement: d.mode_paiement ?? "",
        recu_numero: d.recu_numero ?? "",
        recu_etat: d.recu_etat ?? "",
        observations: d.observations ?? "",
      });
    }
    setEdit(d);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const montantNum = Number(f.montant.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      setError("Montant invalide.");
      return;
    }
    if (f.est_personne_morale ? !f.raison_sociale.trim() : !f.donateur_nom.trim()) {
      setError(f.est_personne_morale ? "La raison sociale est obligatoire." : "Le nom est obligatoire.");
      return;
    }

    if (coffre.estConfigure && !coffre.estOuvert) {
      setError("Coffre verrouillé : déverrouillez-le (Paramètres → Sécurité) pour enregistrer un donateur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Champs NON personnels (restent en clair).
    const base = {
      origine: f.origine.trim() || null,
      categorie_donateur: f.categorie_donateur || null,
      est_personne_morale: f.est_personne_morale,
      montant: montantNum,
      date_don: f.date_don,
      mode_paiement: f.mode_paiement || null,
      recu_numero: f.recu_numero.trim() || null,
      recu_etat: f.recu_etat.trim() || null,
      observations: f.observations.trim() || null,
    };
    // Champs personnels (chiffrés si le coffre est ouvert).
    const pii = {
      titre: f.donateur_titre.trim() || null,
      nom: f.est_personne_morale ? f.raison_sociale.trim() : f.donateur_nom.trim(),
      prenom: f.est_personne_morale ? null : f.donateur_prenom.trim() || null,
      raison: f.est_personne_morale ? f.raison_sociale.trim() : null,
      adresse: f.adresse.trim() || null,
      cp_ville: f.cp_ville.trim() || null,
      courriel: f.courriel.trim() || null,
    };

    type DonPayload = typeof base & {
      pii_chiffre: string | null;
      donateur_titre: string | null;
      donateur_nom: string | null;
      donateur_prenom: string | null;
      raison_sociale: string | null;
      adresse: string | null;
      cp_ville: string | null;
      courriel: string | null;
    };
    const payload: DonPayload = coffre.estOuvert
      ? {
          ...base,
          pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
          donateur_titre: null, donateur_nom: null, donateur_prenom: null,
          raison_sociale: null, adresse: null, cp_ville: null, courriel: null,
        }
      : {
          ...base,
          pii_chiffre: null,
          donateur_titre: pii.titre, donateur_nom: pii.nom, donateur_prenom: pii.prenom,
          raison_sociale: pii.raison, adresse: pii.adresse, cp_ville: pii.cp_ville, courriel: pii.courriel,
        };

    const { error: err } =
      edit === "nouveau"
        ? await supabase.from("dons").insert(payload)
        : await supabase.from("dons").update(payload).eq("id", (edit as Don).id);

    if (err) {
      setError("Enregistrement impossible : " + err.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setEdit(null);
    router.refresh();
  }

  // Chiffre les dons encore en clair (migration ponctuelle, coffre ouvert).
  async function chiffrerExistants() {
    if (!coffre.estOuvert || nonChiffres.length === 0) return;
    setMigration(true);
    const supabase = createClient();
    for (const d of nonChiffres) {
      const pii_chiffre = await coffre.chiffrer(JSON.stringify(piiDepuis(d)));
      await supabase
        .from("dons")
        .update({
          pii_chiffre,
          donateur_titre: null, donateur_nom: null, donateur_prenom: null,
          raison_sociale: null, adresse: null, cp_ville: null, courriel: null,
        })
        .eq("id", d.id);
    }
    setMigration(false);
    router.refresh();
  }

  async function genererRecu(d: Don) {
    setGenErreur(null);
    if (d.pii_chiffre && !coffre.estOuvert) {
      setGenErreur("Déverrouillez le coffre (Paramètres → Sécurité) pour générer un reçu.");
      return;
    }
    try {
      await genererRecuDocx({ ...d, donateur_nom: d.donateur_nom ?? "" });
    } catch (e) {
      setGenErreur(e instanceof Error ? e.message : "Génération impossible.");
    }
  }

  const ringManque = (estVide: boolean) =>
    signaler && estVide ? " ring-2 ring-negative/60 !border-negative" : "";
  const nomAffiche = (d: Don) =>
    d.est_personne_morale
      ? d.raison_sociale ?? d.donateur_nom
      : [d.donateur_titre, d.donateur_nom, d.donateur_prenom].filter(Boolean).join(" ");

  return (
    <>
      {/* Coffre verrouillé : les noms sont masqués */}
      {verrou && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3 text-sm">
          <span className="text-gold">🔒 Coffre verrouillé — les données des donateurs sont masquées.</span>
          <a href="/parametres" className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2">Déverrouiller</a>
        </div>
      )}

      {/* Migration : dons pas encore chiffrés (coffre ouvert) */}
      {coffre.estOuvert && nonChiffres.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
          <span>
            <strong>{nonChiffres.length}</strong> don{nonChiffres.length > 1 ? "s" : ""} pas encore chiffré
            {nonChiffres.length > 1 ? "s" : ""}. Chiffrez-les pour retirer les données en clair de la base.
          </span>
          <button
            type="button"
            onClick={chiffrerExistants}
            disabled={migration}
            className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {migration ? "Chiffrement…" : "Chiffrer maintenant"}
          </button>
        </div>
      )}

      {/* Barre d'outils : recherche, filtres, export, ajout */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un donateur…"
          className={`${inputCls} max-w-[16rem] flex-1`}
        />
        <select value={anneeFiltre} onChange={(e) => setAnneeFiltre(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="toutes">Toutes les années</option>
          {annees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={catFiltre} onChange={(e) => setCatFiltre(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="toutes">Toutes catégories</option>
          {categoriesPresentes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {filtresActifs && (
          <button type="button" onClick={reinitialiser} className="text-xs text-muted underline hover:text-foreground">
            Réinitialiser
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={exporterCSV}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Exporter CSV
          </button>
          <button
            type="button"
            onClick={() => ouvrir("nouveau")}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            + Nouveau don
          </button>
        </div>
      </div>

      {/* Analyse : synthèse de la sélection courante */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Dons", value: String(statsAffiches.count) },
          { label: "Montant total", value: formatEuros(statsAffiches.total) },
          { label: "Donateurs", value: String(statsAffiches.donateurs) },
          { label: "Don moyen", value: formatEuros(statsAffiches.moyenne) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-3">
            <div className="text-xs text-muted">{s.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {genErreur && (
        <p className="mb-3 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{genErreur}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTRES.map((item) => {
          const n = compteParStatut.get(item.key) ?? 0;
          const actif = filtre === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setFiltre(actif ? null : item.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition ${TONE_CLASSES[item.tone]} ${
                actif ? "ring-2 ring-accent ring-offset-1 ring-offset-background" : "opacity-90 hover:opacity-100"
              } ${n === 0 ? "opacity-40" : ""}`}
            >
              {item.label}
              <span className="rounded-full bg-black/10 px-1.5 tabular-nums dark:bg-white/15">{n}</span>
            </button>
          );
        })}
        {filtre && (
          <button
            type="button"
            onClick={() => setFiltre(null)}
            className="text-xs text-muted underline hover:text-foreground"
          >
            Tout afficher
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Donateur</th>
              <th className="px-4 py-3 font-medium text-right">Montant</th>
              <th className="px-4 py-3 font-medium">N° reçu</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {donsAffiches.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted">
                  {dons.length === 0 ? "Aucun don enregistré." : "Aucun don pour ce filtre."}
                </td>
              </tr>
            ) : (
              donsAffiches.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 tabular-nums">{formatDate(d.date_don)}</td>
                  <td className="px-4 py-3">
                    {nomAffiche(d)}
                    {recurrents.has(cleDonateur(d)) && (
                      <span
                        title="Donateur récurrent (plusieurs dons)"
                        className="ml-1.5 align-middle text-xs text-violet-600 dark:text-violet-400"
                      >
                        ↻
                      </span>
                    )}
                    {d.cp_ville && <span className="text-muted"> · {d.cp_ville}</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatEuros(Number(d.montant))}</td>
                  <td className="px-4 py-3 tabular-nums text-xs">{d.recu_numero ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(chipsParDon.get(d.id) ?? []).map((c) => {
                        const cls = `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[c.tone]}`;
                        return c.key === "important" || c.key === "mineur" ? (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => ouvrir(d, true)}
                            title={`${c.detail ?? ""} — cliquer pour compléter`}
                            className={`${cls} cursor-pointer underline-offset-2 hover:underline`}
                          >
                            {c.label}
                          </button>
                        ) : (
                          <span key={c.key} title={c.detail} className={cls}>
                            {c.label}
                          </span>
                        );
                      })}
                    </div>
                    {d.recu_etat && d.recu_etat.trim() && (
                      <p className="mt-1 text-xs text-muted">{d.recu_etat}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => genererRecu(d)}
                      className="text-accent hover:underline"
                    >
                      Reçu
                    </button>
                    <button
                      type="button"
                      onClick={() => ouvrir(d)}
                      className="ml-4 text-muted hover:underline"
                    >
                      Modifier
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={edit === "nouveau" ? "Nouveau don" : "Modifier le don"}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {signaler && (
              <div className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
                Complétez les informations importantes surlignées. Elles seront aussi reportées sur les autres dons de ce donateur.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("est_personne_morale", false)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  !f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"
                }`}
              >
                Particulier
              </button>
              <button
                type="button"
                onClick={() => set("est_personne_morale", true)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  f.est_personne_morale ? "border-accent bg-accent-soft text-accent" : "border-border text-muted"
                }`}
              >
                Personne morale
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date d'encaissement">
                <input type="date" required value={f.date_don} onChange={(e) => set("date_don", e.target.value)} className={inputCls} />
              </Field>
              <Field label="Montant (€)">
                <input type="text" inputMode="decimal" required placeholder="0,00" value={f.montant} onChange={(e) => set("montant", e.target.value)} className={inputCls} />
              </Field>
            </div>

            {f.est_personne_morale ? (
              <Field label="Raison sociale">
                <input type="text" required value={f.raison_sociale} onChange={(e) => set("raison_sociale", e.target.value)} className={inputCls + ringManque(!f.raison_sociale.trim())} placeholder="Ex. Oeuvre Salésienne" />
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Titre">
                    <input type="text" value={f.donateur_titre} onChange={(e) => set("donateur_titre", e.target.value)} className={inputCls} placeholder="Monsieur…" />
                  </Field>
                  <Field label="Nom">
                    <input type="text" required value={f.donateur_nom} onChange={(e) => set("donateur_nom", e.target.value)} className={inputCls + ringManque(!f.donateur_nom.trim())} />
                  </Field>
                  <Field label="Prénom">
                    <input type="text" value={f.donateur_prenom} onChange={(e) => set("donateur_prenom", e.target.value)} className={inputCls} />
                  </Field>
                </div>
              </>
            )}

            <Field label="Adresse">
              <input type="text" value={f.adresse} onChange={(e) => set("adresse", e.target.value)} className={inputCls + ringManque(!f.adresse.trim())} placeholder="N° et rue" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CP et ville">
                <input type="text" value={f.cp_ville} onChange={(e) => set("cp_ville", e.target.value)} className={inputCls + ringManque(!f.cp_ville.trim())} placeholder="51100 Reims" />
              </Field>
              <Field label="Courriel">
                <input type="email" value={f.courriel} onChange={(e) => set("courriel", e.target.value)} className={inputCls + ringManque(!f.courriel.trim())} />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Catégorie donateur">
                <select value={f.categorie_donateur} onChange={(e) => set("categorie_donateur", e.target.value)} className={inputCls}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Mode de paiement">
                <select value={f.mode_paiement} onChange={(e) => set("mode_paiement", e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {MODES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Origine (qui a amené le don)">
              <input type="text" value={f.origine} onChange={(e) => set("origine", e.target.value)} className={inputCls} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="N° de reçu">
                <input type="text" value={f.recu_numero} onChange={(e) => set("recu_numero", e.target.value)} className={inputCls} placeholder="RE_000210_20260808" />
              </Field>
              <Field label="État du reçu">
                <input type="text" value={f.recu_etat} onChange={(e) => set("recu_etat", e.target.value)} className={inputCls} placeholder="Envoyé - Courriel…" />
              </Field>
            </div>

            <Field label="Observations">
              <input type="text" value={f.observations} onChange={(e) => set("observations", e.target.value)} className={inputCls} />
            </Field>

            <FormFooter saving={saving} error={error} onCancel={() => setEdit(null)} />
          </form>
        </Modal>
      )}
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Don } from "@/components/GestionDons";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { Modal, inputCls } from "./GestionComptes";
import ChampsParticulier from "./ChampsParticulier";
import ChampCourriel from "./ChampCourriel";
import { estCouple } from "@/lib/couple";
import { CATEGORIES_DONATEUR, estCategoriePersonneMorale } from "@/lib/categoriesDonateur";
import { groupesAHarmoniser, type ChampFiche, type GroupeAHarmoniser } from "@/lib/fichesDoublons";
import { foyersARegrouper, type TexteOperation } from "@/lib/foyers";
import { dechiffrerLibellesDon, texteDonateur } from "@/lib/libelleDon";
import { nomSoigne } from "@/lib/nomPropre";

const CHAMPS_EDITABLES: [ChampFiche, string][] = [
  ["donateur_titre", "Civilité"],
  ["donateur_prenom", "Prénom"],
  ["donateur_nom", "Nom"],
  ["raison_sociale", "Organisme"],
  ["adresse", "Adresse"],
  ["cp_ville", "Code postal et ville"],
  ["courriel", "Courriel"],
  ["categorie_donateur", "Catégorie"],
  ["envoi_prefere", "Mode d'envoi des reçus"],
  ["a_transmettre", "À transmettre à"],
];

/**
 * Bouton « Fiches à harmoniser » : repère les donateurs dont les copies de la fiche
 * (une par don) ne sont pas identiques — adresse présente sur l'une et absente sur
 * l'autre, nom écrit autrement — et réécrit la fiche fusionnée sur tous leurs dons.
 * Le don le plus récent fait foi ; ses champs vides sont complétés par les autres. Chaque
 * valeur proposée reste modifiable avant d'appliquer.
 */
export default function HarmoniserFiches({
  dons,
  verrou,
  mode = "fiches",
}: {
  dons: Don[];
  verrou: boolean;
  /** « foyers » : couples saisis en plusieurs fiches (prénoms retrouvés dans les écritures bancaires), à regrouper. */
  mode?: "fiches" | "foyers";
}) {
  const router = useRouter();
  const coffre = useCoffre();
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const foyers = mode === "foyers";
  const groupesFiches = useMemo(() => (verrou || foyers ? [] : groupesAHarmoniser(dons)), [dons, verrou, foyers]);
  // Foyers : l'analyse lit les écritures (libellés, certains chiffrés) ; elle se lance à l'ouverture.
  const [foyersTrouves, setFoyersTrouves] = useState<{ groupes: GroupeAHarmoniser[]; ignores: number } | null>(null);
  const [analyse, setAnalyse] = useState(false);
  const groupes = foyers ? (foyersTrouves?.groupes ?? []) : groupesFiches;
  // Valeurs saisies par l'utilisateur à la place de celles proposées, par groupe et par champ.
  const [edits, setEdits] = useState<Record<string, Partial<Record<ChampFiche, string>>>>({});

  if (verrou || (!foyers && groupes.length === 0)) return null;

  async function analyserFoyers() {
    setOuvert(true);
    setMessage(null);
    if (!coffre.estOuvert) return setMessage("Coffre verrouillé : déverrouillez-le pour analyser les foyers.");
    setAnalyse(true);
    const { data, error } = await createClient()
      .from("operations")
      .select("date_operation, libelle, libelle_origine, libelle_origine_chiffre")
      .eq("type", "recette")
      .range(0, 4999);
    if (error) {
      setAnalyse(false);
      return setMessage("Lecture des écritures impossible : " + error.message);
    }
    const textes: TexteOperation[] = [];
    for (const o of (data ?? []) as { date_operation: string; libelle: string | null; libelle_origine: string | null; libelle_origine_chiffre: string | null }[]) {
      const clair = texteDonateur(await dechiffrerLibellesDon(coffre.dechiffrer, o.libelle_origine_chiffre));
      const texte = [clair, o.libelle_origine ?? o.libelle].filter(Boolean).join(" ");
      if (texte) textes.push({ date: o.date_operation, texte });
    }
    setFoyersTrouves(foyersARegrouper(dons, textes));
    setAnalyse(false);
  }

  /** Fiche à appliquer : la proposition, avec les corrections de l'utilisateur. */
  const cibleDe = (g: GroupeAHarmoniser) => {
    const c = { ...g.cible, ...edits[g.cle] };
    c.est_personne_morale = edits[g.cle]?.categorie_donateur !== undefined ? estCategoriePersonneMorale(c.categorie_donateur) : g.cible.est_personne_morale;
    return c;
  };

  async function appliquer(g: GroupeAHarmoniser): Promise<boolean> {
    const c = cibleDe(g);
    const pii = {
      titre: c.donateur_titre || null,
      nom: nomSoigne(c.donateur_nom, c.est_personne_morale) || null,
      prenom: c.donateur_prenom || null,
      raison: c.est_personne_morale ? c.raison_sociale || null : null,
      adresse: c.adresse || null,
      cp_ville: c.cp_ville || null,
      courriel: c.courriel || null,
      transmettre: c.a_transmettre || null,
    };
    const { error } = await createClient()
      .from("dons")
      .update({
        pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
        est_personne_morale: c.est_personne_morale,
        categorie_donateur: c.categorie_donateur || null,
        envoi_prefere: c.envoi_prefere || null,
        donateur_titre: null,
        donateur_nom: null,
        donateur_prenom: null,
        raison_sociale: null,
        adresse: null,
        cp_ville: null,
        courriel: null,
      })
      .in("id", g.dons.map((d) => d.id));
    if (error) {
      setMessage(`Harmonisation de « ${g.nom} » impossible : ${error.message}`);
      return false;
    }
    return true;
  }

  async function harmoniser(liste: GroupeAHarmoniser[]) {
    if (!coffre.estOuvert) return setMessage("Coffre verrouillé : déverrouillez-le pour réécrire les fiches (chiffrées).");
    const conflit = liste.filter((g) => g.conflits.length > 0);
    if (
      conflit.length > 0 &&
      !window.confirm(
        `${conflit.map((g) => `${g.nom} (${g.conflits.join(", ")})`).join(" ; ")} : deux valeurs différentes sont renseignées. ` +
          "La plus récente sera conservée. Continuer ?",
      )
    ) {
      return;
    }
    setMessage(null);
    let faits = 0;
    for (const g of liste) {
      setBusy(g.cle);
      if (!(await appliquer(g))) {
        setBusy(null);
        router.refresh();
        return;
      }
      faits += 1;
    }
    setBusy(null);
    setMessage(`${faits} ${foyers ? "foyer" : "fiche"}${faits > 1 ? "s" : ""} ${foyers ? "regroupé" : "harmonisée"}${faits > 1 ? "s" : ""}.`);
    if (foyers) setFoyersTrouves((t) => (t ? { ...t, groupes: t.groupes.filter((x) => !liste.includes(x)) } : t));
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (foyers ? void analyserFoyers() : setOuvert(true))}
        className="rounded-lg border border-gold/50 bg-gold-soft/40 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold-soft"
        title={
          foyers
            ? "Couples saisis en plusieurs fiches (un conjoint par fiche, nom écrit de plusieurs façons) : repérés par les deux prénoms dans les écritures"
            : "Donateurs dont les fiches (une copie par don) ne sont pas identiques : adresse manquante, nom écrit autrement…"
        }
      >
        {foyers ? "👫 Foyers à regrouper" : `🧹 Fiches à harmoniser (${groupes.length})`}
      </button>
      {ouvert && (
        <Modal title={foyers ? "Foyers à regrouper" : "Fiches donateur à harmoniser"} onClose={() => setOuvert(false)}>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-sm">
            {foyers && (
              <p className="text-xs text-muted">
                Un même couple est parfois saisi en deux fiches (un conjoint chacune, nom écrit autrement). Ils sont repérés quand une écriture bancaire
                (ou une fiche « Monsieur &amp; Madame ») contient les deux prénoms et un nom de famille commun : le nom de famille seul ne suffit jamais.
                « Regrouper » réécrit la fiche du foyer sur tous les dons des deux fiches. Les anciens reçus gardent leur numéro, leur date et leur état :
                ils ne sont pas régénérés et apparaissent sous la fiche regroupée.
              </p>
            )}
            {foyers && analyse && <p className="text-sm text-muted">Analyse des écritures…</p>}
            {foyers && !analyse && foyersTrouves && groupes.length === 0 && (
              <p className="rounded-lg bg-surface-2 px-3 py-3 text-sm">Aucun foyer à regrouper détecté.</p>
            )}
            {foyers && foyersTrouves && foyersTrouves.ignores > 0 && (
              <p className="text-xs text-muted">
                {foyersTrouves.ignores} ensemble{foyersTrouves.ignores > 1 ? "s" : ""} de plus de deux personnes (famille) {foyersTrouves.ignores > 1 ? "ignorés" : "ignoré"} : à traiter à la main.
              </p>
            )}
            {!foyers && (
            <p className="text-xs text-muted">
              Chaque don porte sa propre copie de la fiche. Ces donateurs figurent plusieurs fois avec des fiches différentes. « Harmoniser » réécrit
              la fiche fusionnée (le don le plus récent fait foi, ses champs vides sont complétés par les autres) sur tous leurs dons. Les liens à la comptabilité et les
              numéros de reçu ne changent pas ; un reçu déjà envoyé n&apos;est modifié que si vous le régénérez.
            </p>
            )}
            {groupes.map((g) => (
              <div key={g.cle} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-medium">{g.nom}</span>
                    <span className="ml-2 text-xs text-muted">
                      {g.dons.length} don{g.dons.length > 1 ? "s" : ""}, {g.aChanger.length} à mettre à jour
                    </span>
                    {g.conflits.length > 0 && (
                      <span className="ml-2 rounded-full bg-gold-soft px-1.5 py-0.5 text-[11px] text-gold">⚠ valeurs différentes : {g.conflits.join(", ")}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => harmoniser([g])}
                    disabled={busy !== null}
                    className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === g.cle ? "…" : foyers ? "Regrouper" : "Harmoniser"}
                  </button>
                </div>
                {g.preuves.length > 0 && (
                  <ul className="mt-1.5 list-inside list-disc text-xs text-muted">
                    {g.preuves.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                {!cibleDe(g).est_personne_morale && (
                  <div className="mt-2 space-y-2">
                    <ChampsParticulier
                      titre={cibleDe(g).donateur_titre}
                      prenom={cibleDe(g).donateur_prenom}
                      nom={cibleDe(g).donateur_nom}
                      set={(k, v) => setEdits((p) => ({ ...p, [g.cle]: { ...p[g.cle], [k]: v } }))}
                    />
                    {(["donateur_titre", "donateur_prenom", "donateur_nom"] as const).some((c) => g.modifications.some((m) => m.champ === c)) && (
                      <p className="text-xs text-muted">
                        {g.modifications
                          .filter((m) => ["donateur_titre", "donateur_prenom", "donateur_nom"].includes(m.champ))
                          .map((m) => `${m.libelle} (${m.completion ? "à compléter" : "diffère"} sur ${m.nbDons} don${m.nbDons > 1 ? "s" : ""}${m.avant.length ? " : " + m.avant.join(" / ") : ""})`)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                )}
                <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
                  {CHAMPS_EDITABLES.filter(([champ]) => {
                    if (champ === "raison_sociale") return cibleDe(g).est_personne_morale;
                    // Particulier : civilité, prénom et nom (avec l'option « Couple ») sont saisis au-dessus.
                    if (!cibleDe(g).est_personne_morale && ["donateur_titre", "donateur_prenom", "donateur_nom"].includes(champ)) return false;
                    // Couple : les deux adresses électroniques se saisissent dans le bloc dédié, plus bas.
                    if (champ === "courriel" && !cibleDe(g).est_personne_morale && estCouple(cibleDe(g).donateur_titre)) return false;
                    return true;
                  }).map(([champ, libelle]) => {
                    const valeur = cibleDe(g)[champ];
                    const modif = g.modifications.find((m) => m.champ === champ);
                    const change = edits[g.cle]?.[champ] !== undefined && edits[g.cle]?.[champ] !== g.cible[champ];
                    const onChange = (v: string) => setEdits((p) => ({ ...p, [g.cle]: { ...p[g.cle], [champ]: v } }));
                    return (
                      <label key={champ} className="block text-xs text-muted">
                        {libelle}
                        {modif && (
                          <span className="ml-1">
                            ({modif.completion ? "à compléter" : "diffère"} sur {modif.nbDons} don{modif.nbDons > 1 ? "s" : ""}
                            {modif.avant.length > 0 && (
                              <>
                                {" : "}
                                <span className="line-through">{modif.avant.join(" / ")}</span>
                              </>
                            )}
                            )
                          </span>
                        )}
                        {champ === "categorie_donateur" ? (
                          <select value={valeur} onChange={(e) => onChange(e.target.value)} className={`${inputCls} mt-0.5 ${change ? "border-accent" : ""}`}>
                            <option value="">—</option>
                            {CATEGORIES_DONATEUR.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : champ === "envoi_prefere" ? (
                          <select value={valeur} onChange={(e) => onChange(e.target.value)} className={`${inputCls} mt-0.5 ${change ? "border-accent" : ""}`}>
                            <option value="">Courriel</option>
                            <option value="courrier">Courrier postal</option>
                            <option value="transmettre">À transmettre à une personne</option>
                            <option value="aucun">Aucun envoi</option>
                          </select>
                        ) : (
                          <input type="text" value={valeur} onChange={(e) => onChange(e.target.value)} className={`${inputCls} mt-0.5 ${change ? "border-accent" : ""}`} />
                        )}
                      </label>
                    );
                  })}
                </div>
                {!cibleDe(g).est_personne_morale && estCouple(cibleDe(g).donateur_titre) && (
                  <div className="mt-1.5">
                    <ChampCourriel
                      titre={cibleDe(g).donateur_titre}
                      courriel={cibleDe(g).courriel}
                      onChange={(v) => setEdits((p) => ({ ...p, [g.cle]: { ...p[g.cle], courriel: v } }))}
                    />
                  </div>
                )}
              </div>
            ))}
            {message && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs">{message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOuvert(false)} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
                Fermer
              </button>
              <button
                type="button"
                onClick={() => harmoniser(groupes)}
                disabled={busy !== null}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                {foyers ? "Tout regrouper" : "Tout harmoniser"} ({groupes.length})
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

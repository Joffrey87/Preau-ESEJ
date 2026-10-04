"use client";

import { useMemo, useState } from "react";
import { Modal, inputCls } from "./GestionComptes";
import ChampsDonateur, {
  ficheDonateurValide,
  formDonateurDepuisDon,
  formDonateurDepuisNom,
  piiDeFiche,
  relationsConnues,
  type FormDonateur,
} from "./FormulaireDonateur";
import { fichesDonateurs } from "./ChoixDonateur";
import type { Don } from "./GestionDons";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import { cleDonateur, nomDonateur } from "@/lib/statutDon";

/**
 * Réattribution d'UN don à un autre donateur : existant (recherche) ou nouveau
 * (la fiche est créée à la validation). Seul ce don change : contrairement au
 * formulaire du don, l'identité n'est pas reportée sur les autres dons de
 * l'ancien donateur. Le don quitte son reçu (il redevient « à établir » chez le
 * nouveau donateur) et le total de l'ancien reçu est recalculé.
 */
export default function ReattribuerDon({
  don,
  dons,
  statutRecu,
  onFermer,
  onFait,
}: {
  /** Le don à réattribuer (données déchiffrées). */
  don: Don;
  /** Tous les dons (déchiffrés), pour rechercher un donateur existant. */
  dons: Don[];
  /** Où en est son reçu actuel : « envoye », « edite » ou rien s'il n'a pas de numéro. */
  statutRecu: "envoye" | "edite" | null;
  onFermer: () => void;
  onFait: (message: string) => void;
}) {
  const coffre = useCoffre();
  const [mode, setMode] = useState<"existant" | "nouveau">("existant");
  const [recherche, setRecherche] = useState("");
  const [choisie, setChoisie] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState<FormDonateur>(formDonateurDepuisNom(""));
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const cleActuelle = cleDonateur(don);
  const fiches = useMemo(() => fichesDonateurs(dons).filter((f) => f.cle !== cleActuelle), [dons, cleActuelle]);
  const filtrees = useMemo(() => {
    // Chaque mot saisi doit se retrouver dans le nom, quel que soit l'ordre (« de Boisgelin George »
    // comme « George de Boisgelin »), sans tenir compte des accents ni des majuscules.
    const plat = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = plat(recherche).split(/\s+/).filter(Boolean);
    return (mots.length ? fiches.filter((f) => mots.every((m) => plat(`${f.nom} ${f.exemple.donateur_nom ?? ""} ${f.exemple.donateur_prenom ?? ""} ${f.exemple.cp_ville ?? ""}`).includes(m))) : fiches).slice(0, 40);
  }, [fiches, recherche]);
  const ficheChoisie = fiches.find((f) => f.cle === choisie) ?? null;
  const numero = don.recu_numero && /^RE_/.test(don.recu_numero) ? don.recu_numero : null;
  const peutValider = mode === "existant" ? !!ficheChoisie : ficheDonateurValide(nouveau);

  async function valider() {
    setErreur(null);
    if (!coffre.estOuvert) return setErreur("Coffre verrouillé : déverrouillez-le (Paramètres → Sécurité) pour réattribuer un don.");
    const cible: FormDonateur = mode === "existant" && ficheChoisie ? formDonateurDepuisDon(ficheChoisie.exemple) : nouveau;
    if (!ficheDonateurValide(cible)) return setErreur(cible.est_personne_morale ? "Le nom de l'organisme est obligatoire." : "Le nom est obligatoire.");
    setBusy(true);
    const supabase = createClient();
    const envoiPrefere = mode === "existant" && ficheChoisie ? (ficheChoisie.exemple.envoi_prefere ?? null) : null;
    const { error } = await supabase
      .from("dons")
      .update({
        pii_chiffre: await coffre.chiffrer(JSON.stringify(piiDeFiche(cible))),
        donateur_titre: null,
        donateur_nom: null,
        donateur_prenom: null,
        raison_sociale: null,
        adresse: null,
        cp_ville: null,
        courriel: null,
        est_personne_morale: cible.est_personne_morale,
        categorie_donateur: cible.categorie_donateur || null,
        envoi_prefere: envoiPrefere,
        // Il quitte son ancien reçu : il sera établi au nom du nouveau donateur.
        recu_numero: null,
        recu_emis_le: null,
        recu_etat: null,
      })
      .eq("id", don.id);
    if (error) {
      setBusy(false);
      return setErreur("Réattribution impossible : " + error.message);
    }
    // Registre : le total de l'ancien reçu est recalculé (annulé s'il ne contient plus rien).
    if (numero) {
      const { data: restants } = await supabase
        .from("dons")
        .select("montant")
        .eq("recu_numero", numero)
        .is("supprime_le", null);
      const nb = restants?.length ?? 0;
      const total = (restants ?? []).reduce((s, d) => s + Number(d.montant), 0);
      await supabase
        .from("recus")
        .update(nb === 0 ? { total: 0, nb_dons: 0, annule_le: new Date().toISOString() } : { total, nb_dons: nb })
        .eq("recu_numero", numero);
    }
    setBusy(false);
    onFait(
      `Don du ${formatDate(don.date_don)} (${formatEuros(Number(don.montant))}) réattribué à ${
        mode === "existant" && ficheChoisie ? ficheChoisie.nom : nomDonateur(cible) || "nouveau donateur"
      }${numero ? ` ; retiré du reçu ${numero}` : ""}.`,
    );
  }

  return (
    <Modal title="Réattribuer le don à un autre donateur" onClose={onFermer}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm">
        <p className="rounded-lg bg-surface-2 px-3 py-2">
          Don du <strong>{formatDate(don.date_don)}</strong> de <strong>{formatEuros(Number(don.montant))}</strong>, actuellement au nom de{" "}
          <strong>{nomDonateur(don) || "—"}</strong>. Seul ce don change ; les autres dons de ce donateur restent inchangés.
        </p>

        {numero && (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">
            Ce don figure sur le reçu {numero}
            {statutRecu === "envoye" ? " (déjà envoyé au donateur)" : statutRecu === "edite" ? " (établi, pas encore envoyé)" : ""}. Il sera retiré de ce reçu et son
            total recalculé
            {statutRecu ? " : l'exemplaire déjà édité ne correspondra plus, il faudra le refaire" : ""}. Le don redeviendra « à établir » au nom du nouveau donateur.
          </p>
        )}

        <div className="flex gap-2">
          {(["existant", "nouveau"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg border px-3 py-1.5 ${mode === m ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-2"}`}
            >
              {m === "existant" ? "Donateur existant" : "Nouveau donateur"}
            </button>
          ))}
        </div>

        {mode === "existant" ? (
          <div className="space-y-2">
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un donateur…"
              className={inputCls}
              autoFocus
            />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-surface">
              {filtrees.length === 0 ? (
                <p className="px-3 py-4 text-center text-muted">
                  Aucun donateur trouvé. Choisissez « Nouveau donateur » pour créer sa fiche.
                </p>
              ) : (
                filtrees.map((f) => (
                  <button
                    key={f.cle}
                    type="button"
                    onClick={() => setChoisie(f.cle)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2 ${choisie === f.cle ? "bg-accent-soft" : ""}`}
                  >
                    <span className="font-medium">{f.nom}</span>
                    <span className="whitespace-nowrap text-xs text-muted">
                      {f.nbDons} don{f.nbDons > 1 ? "s" : ""} · {formatEuros(f.total)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <ChampsDonateur
              f={nouveau}
              set={(k, v) => setNouveau((p) => ({ ...p, [k]: v }))}
              relations={relationsConnues(dons)}
              idListe="relations-reattribution"
            />
            <p className="text-xs text-muted">La fiche du nouveau donateur sera créée à la validation.</p>
          </div>
        )}

        {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-negative">{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFermer} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
            Fermer
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={busy || !peutValider}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Réattribution…" : "Réattribuer ce don"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

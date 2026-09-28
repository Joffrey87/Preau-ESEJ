"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCarnet } from "@/components/CarnetProvider";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { inputCls } from "./GestionComptes";
import { CLASSES, classeEn, depuis, termineEnJuin, type Classe, type Eleve } from "@/lib/eleves";

export type FicheFamille = {
  id: string;
  nom: string;
  parent1: string | null;
  parent2: string | null;
  adresse: string | null;
  cp_ville: string | null;
  telephone: string | null;
  courriels: string | null;
  notes: string | null;
};

type FormEleve = { prenom: string; classe_entree: Classe; annee_entree: string; decalage: string; sorti_le: string };

const CHAMPS_FICHE: { k: keyof FicheFamille; l: string }[] = [
  { k: "parent1", l: "Parent 1" },
  { k: "parent2", l: "Parent 2" },
  { k: "adresse", l: "Adresse" },
  { k: "cp_ville", l: "CP et ville" },
  { k: "telephone", l: "Téléphone" },
  { k: "courriels", l: "Courriels" },
];

/**
 * Fiche de la famille et ses enfants, dans le détail de l'onglet Frais de
 * scolarité. La fiche est visible par la famille dans son espace ; le prénom
 * des enfants est chiffré avec le coffre du carnet (l'initiale reste en clair).
 */
export default function FamilleEnfants({
  famille,
  eleves,
  annee,
}: {
  famille: FicheFamille | null;
  eleves: Eleve[];
  annee: string;
}) {
  const router = useRouter();
  const carnet = useCarnet();
  const [prenoms, setPrenoms] = useState<Record<string, string>>({});
  const [ficheOuverte, setFicheOuverte] = useState(false);
  const [fiche, setFiche] = useState<FicheFamille | null>(famille);
  const [eleveEdite, setEleveEdite] = useState<Eleve | "nouveau" | null>(null);
  const [f, setF] = useState<FormEleve>({ prenom: "", classe_entree: "PS", annee_entree: annee, decalage: "0", sorti_le: "" });
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [courrielCompte, setCourrielCompte] = useState("");
  const [messageCompte, setMessageCompte] = useState<string | null>(null);

  // Prénoms déchiffrés, coffre du carnet ouvert.
  const { estOuvert: carnetOuvert, dechiffrer } = carnet;
  useEffect(() => {
    if (!carnetOuvert) return;
    let annule = false;
    (async () => {
      const m: Record<string, string> = {};
      for (const e of eleves) {
        if (!e.prenom_chiffre) continue;
        try {
          m[e.id] = await dechiffrer(e.prenom_chiffre);
        } catch {
          /* prénom illisible : on garde l'initiale */
        }
      }
      if (!annule) setPrenoms(m);
    })();
    return () => {
      annule = true;
    };
  }, [eleves, carnetOuvert, dechiffrer]);

  if (!famille) return <p className="text-xs text-muted">Famille non reliée : enregistrez-la à nouveau.</p>;

  const nomEleve = (e: Eleve) => prenoms[e.id] ?? (e.initiale ? `${e.initiale}.` : "Enfant");

  /** Rattache un compte (invité depuis Supabase) à cette famille : il n'accèdera qu'à son espace. */
  async function rattacherCompte() {
    setMessageCompte(null);
    if (!courrielCompte.trim()) return;
    const { data, error } = await createClient().rpc("rattacher_compte_famille", {
      p_email: courrielCompte.trim(),
      p_famille: famille!.nom,
    });
    setMessageCompte(error ? error.message : (data as string));
    if (!error) setCourrielCompte("");
  }

  async function enregistrerFiche() {
    if (!fiche) return;
    setBusy(true);
    setErreur(null);
    const maj = Object.fromEntries(CHAMPS_FICHE.map(({ k }) => [k, (fiche[k] as string | null)?.trim() || null]));
    const { error } = await createClient().from("familles").update(maj).eq("id", famille!.id);
    setBusy(false);
    if (error) return setErreur(error.message);
    setFicheOuverte(false);
    router.refresh();
  }

  function editerEleve(e: Eleve | "nouveau") {
    setErreur(null);
    setF(
      e === "nouveau"
        ? { prenom: "", classe_entree: "PS", annee_entree: annee, decalage: "0", sorti_le: "" }
        : {
            prenom: prenoms[e.id] ?? "",
            classe_entree: e.classe_entree,
            annee_entree: e.annee_entree,
            decalage: String(e.decalage ?? 0),
            sorti_le: e.sorti_le ?? "",
          },
    );
    setEleveEdite(e);
  }

  async function enregistrerEleve() {
    if (!eleveEdite) return;
    const prenom = f.prenom.trim();
    if (!prenom) return setErreur("Le prénom est obligatoire.");
    if (!/^\d{4}-\d{4}$/.test(f.annee_entree)) return setErreur("Année d'entrée au format 2024-2025.");
    if (!carnet.estOuvert) return setErreur("Déverrouillez le coffre du carnet : le prénom est chiffré.");
    setBusy(true);
    setErreur(null);
    const ligne = {
      famille_id: famille!.id,
      prenom_chiffre: await carnet.chiffrer(prenom),
      initiale: prenom.charAt(0).toUpperCase(),
      classe_entree: f.classe_entree,
      annee_entree: f.annee_entree,
      decalage: Number(f.decalage) || 0,
      sorti_le: f.sorti_le || null,
    };
    const supabase = createClient();
    const { error } =
      eleveEdite === "nouveau"
        ? await supabase.from("eleves").insert(ligne)
        : await supabase.from("eleves").update(ligne).eq("id", eleveEdite.id);
    setBusy(false);
    if (error) return setErreur(error.message);
    setEleveEdite(null);
    router.refresh();
  }

  async function supprimerEleve(e: Eleve) {
    if (!window.confirm(`Retirer ${nomEleve(e)} de la famille ? (ses participations aux activités seront supprimées)`)) return;
    const { error } = await createClient().from("eleves").delete().eq("id", e.id);
    if (error) return setErreur(error.message);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Fiche famille</h4>
          <button type="button" onClick={() => setFicheOuverte((v) => !v)} className="text-xs text-accent hover:underline">
            {ficheOuverte ? "Fermer" : "Modifier"}
          </button>
        </div>
        {ficheOuverte && fiche ? (
          <div className="mt-1 grid gap-1.5">
            {CHAMPS_FICHE.map(({ k, l }) => (
              <input
                key={k}
                value={(fiche[k] as string | null) ?? ""}
                onChange={(e) => setFiche({ ...fiche, [k]: e.target.value })}
                placeholder={l}
                className={`${inputCls} py-1 text-xs`}
              />
            ))}
            <button
              type="button"
              onClick={enregistrerFiche}
              disabled={busy}
              className="justify-self-end rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-50"
            >
              Enregistrer
            </button>
            <p className="text-[11px] text-muted">Visible par la famille dans son espace.</p>
          </div>
        ) : (
          <dl className="mt-1 space-y-0.5 text-xs">
            {CHAMPS_FICHE.filter(({ k }) => famille[k]).map(({ k, l }) => (
              <div key={k} className="flex gap-2">
                <dt className="w-20 shrink-0 text-muted">{l}</dt>
                <dd>{famille[k] as string}</dd>
              </div>
            ))}
            {CHAMPS_FICHE.every(({ k }) => !famille[k]) && <p className="text-muted">Fiche à compléter.</p>}
          </dl>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Enfants</h4>
          <button type="button" onClick={() => editerEleve("nouveau")} className="text-xs text-accent hover:underline">
            + Ajouter
          </button>
        </div>
        {!carnet.estOuvert && eleves.length > 0 && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gold">
            Prénoms chiffrés <DeverrouillerCoffre carnet label="🔓 Carnet" />
          </div>
        )}
        <ul className="mt-1 space-y-1 text-xs">
          {eleves.map((e) => {
            const classe = classeEn(e, annee);
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{nomEleve(e)}</span>
                <span className={classe ? "" : "text-muted"}>{classe ?? "hors école cette année"}</span>
                <span className="text-muted">{depuis(e)}</span>
                {termineEnJuin(e, annee) && (
                  <span className="rounded bg-gold-soft px-1 text-[10px] font-medium text-gold" title="Juin non dû pour cet enfant (couvert par le mois d'avance)">
                    fin de scolarité en juin
                  </span>
                )}
                <button type="button" onClick={() => editerEleve(e)} className="text-accent hover:underline">modifier</button>
                <button type="button" onClick={() => supprimerEleve(e)} className="text-muted hover:text-negative">✕</button>
              </li>
            );
          })}
          {eleves.length === 0 && <li className="text-muted">Aucun enfant enregistré (import de la liste de l&apos;école à venir).</li>}
        </ul>

        {eleveEdite && (
          <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg border border-border p-2">
            <input value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} placeholder="Prénom" className={`${inputCls} col-span-2 py-1 text-xs`} />
            <label className="text-[11px] text-muted">
              Classe d&apos;entrée
              <select value={f.classe_entree} onChange={(e) => setF({ ...f, classe_entree: e.target.value as Classe })} className={`${inputCls} py-1 text-xs`}>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted">
              Année d&apos;entrée
              <input value={f.annee_entree} onChange={(e) => setF({ ...f, annee_entree: e.target.value })} placeholder="2024-2025" className={`${inputCls} py-1 text-xs`} />
            </label>
            <label className="text-[11px] text-muted" title="−1 par redoublement, +1 par saut de classe">
              Décalage
              <input type="number" value={f.decalage} onChange={(e) => setF({ ...f, decalage: e.target.value })} className={`${inputCls} py-1 text-xs`} />
            </label>
            <label className="text-[11px] text-muted">
              Sorti le
              <input type="date" value={f.sorti_le} onChange={(e) => setF({ ...f, sorti_le: e.target.value })} className={`${inputCls} py-1 text-xs`} />
            </label>
            <div className="col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setEleveEdite(null)} className="text-xs text-muted hover:underline">Annuler</button>
              <button type="button" onClick={enregistrerEleve} disabled={busy} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg disabled:opacity-50">
                Enregistrer
              </button>
            </div>
          </div>
        )}
        {erreur && <p className="mt-1 text-xs text-negative">{erreur}</p>}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Espace famille</h4>
          <a href={`/apercu-famille/${famille.id}`} className="text-xs font-medium text-accent hover:underline">
            Voir son espace (aperçu) →
          </a>
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Invitez la famille depuis Supabase (Authentication → Invite user) : elle choisira son mot de passe via le lien reçu.
          Rattachez ensuite son adresse ici.
        </p>
        <div className="mt-1 flex gap-1.5">
          <input
            type="email"
            value={courrielCompte}
            onChange={(e) => setCourrielCompte(e.target.value)}
            placeholder="Adresse du compte famille"
            className={`${inputCls} py-1 text-xs`}
          />
          <button type="button" onClick={rattacherCompte} className="rounded-lg border border-border px-2 text-xs font-medium hover:bg-surface-2">
            Rattacher
          </button>
        </div>
        {messageCompte && <p className="mt-1 text-[11px] text-muted">{messageCompte}</p>}
      </div>
    </div>
  );
}

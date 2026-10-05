"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, inputCls } from "./GestionComptes";
import type { Don } from "@/components/GestionDons";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES_DONATEUR, CATEGORIE_PARTICULIER } from "@/lib/categoriesDonateur";
import { correctionsEntreprises, type Correction } from "@/lib/fichesEntreprises";

type Saisie = { organisme: string; titre: string; prenom: string; nom: string; categorie: string };

/**
 * Bouton « Fiches entreprise à corriger » : les donateurs dont la catégorie est une personne
 * morale (Entreprise, Association…) mais enregistrés comme particuliers. Chaque fiche reçoit
 * le nom de l'organisme (repris du champ « titre » ou « nom » quand c'est possible) et le
 * contact (prénom, nom). À vérifier ligne par ligne ; rien n'est écrit sans clic.
 */
export default function NormaliserEntreprises({ dons, verrou }: { dons: Don[]; verrou: boolean }) {
  const router = useRouter();
  const coffre = useCoffre();
  const [ouvert, setOuvert] = useState(false);
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const corrections = useMemo(() => (verrou ? [] : correctionsEntreprises(dons)), [dons, verrou]);

  if (verrou || corrections.length === 0) return null;

  const valeur = (c: Correction): Saisie =>
    saisies[c.cle] ?? { organisme: c.organisme, titre: c.contact.titre, prenom: c.contact.prenom, nom: c.contact.nom, categorie: c.categorie };
  const modifier = (c: Correction, patch: Partial<Saisie>) => setSaisies((p) => ({ ...p, [c.cle]: { ...valeur(c), ...patch } }));

  async function corriger(liste: Correction[]) {
    if (!coffre.estOuvert) return setMessage("Coffre verrouillé : déverrouillez-le pour réécrire les fiches (chiffrées).");
    const incompletes = liste.filter((c) => !valeur(c).organisme.trim());
    if (incompletes.length > 0) return setMessage("Saisissez le nom de l'organisme de chaque fiche à corriger.");
    if (liste.some((c) => valeur(c).categorie === CATEGORIE_PARTICULIER)) return setMessage("Choisissez une catégorie d'organisme (Entreprise, Association…) pour chaque fiche.");
    setMessage(null);
    const supabase = createClient();
    let faits = 0;
    for (const c of liste) {
      setBusy(c.cle);
      const v = valeur(c);
      const d = c.dons[0];
      const pii = {
        titre: v.titre.trim() || null,
        nom: v.nom.trim() || null,
        prenom: v.prenom.trim() || null,
        raison: v.organisme.trim(),
        adresse: d.adresse?.trim() || null,
        cp_ville: d.cp_ville?.trim() || null,
        courriel: d.courriel?.trim() || null,
        transmettre: d.a_transmettre?.trim() || null,
      };
      const { error } = await supabase
        .from("dons")
        .update({
          pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)),
          est_personne_morale: true,
          categorie_donateur: v.categorie,
          donateur_titre: null,
          donateur_nom: null,
          donateur_prenom: null,
          raison_sociale: null,
          adresse: null,
          cp_ville: null,
          courriel: null,
        })
        .in("id", c.dons.map((x) => x.id));
      if (error) {
        setBusy(null);
        setMessage(`Correction de « ${v.organisme} » impossible : ${error.message}`);
        router.refresh();
        return;
      }
      faits += 1;
    }
    setBusy(null);
    setMessage(`${faits} fiche${faits > 1 ? "s" : ""} corrigée${faits > 1 ? "s" : ""}.`);
    router.refresh();
  }

  const pretes = corrections.filter((c) => valeur(c).organisme.trim());

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="rounded-lg border border-gold/50 bg-gold-soft/40 px-3 py-1.5 text-sm font-medium text-gold hover:bg-gold-soft"
        title="Entreprises, associations… enregistrées comme des particuliers : le nom de l'organisme manque sur la fiche"
      >
        🏢 Fiches entreprise à corriger ({corrections.length})
      </button>
      {ouvert && (
        <Modal title="Fiches entreprise, association… à corriger" onClose={() => setOuvert(false)}>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-sm">
            <p className="text-xs text-muted">
              Ces dons sont ceux d&apos;un organisme (entreprise, association, œuvre…) mais enregistrés, en tout ou partie, comme ceux d&apos;un particulier : catégorie « Particulier »,
              nom de l&apos;organisme dans le champ nom ou titre. Le reçu n&apos;est alors pas établi au nom de l&apos;organisme et porte la mention de l&apos;article 200 du CGI au lieu de l&apos;article 238 bis. Vérifiez le nom de l&apos;organisme et
              le contact, puis corrigez : tous les dons de la fiche sont mis à jour.
            </p>
            {corrections.map((c) => {
              const v = valeur(c);
              return (
                <div key={c.cle} className="rounded-lg border border-border bg-surface p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {c.categorieActuelle || "sans catégorie"} · {c.dons.length} don{c.dons.length > 1 ? "s" : ""}
                      {c.motif === "organisme_categorie_particulier" && " · enregistré comme organisme, mais catégorie « Particulier »"}
                      {c.motif === "nom_d_organisme_en_particulier" && " · nom d'organisme saisi comme un particulier"}
                      {c.origine === "fiche" && " · nom de l'organisme déjà renseigné"}
                      {c.origine === "titre" && " · nom de l'organisme repris du champ « titre »"}
                      {c.origine === "nom" && " · nom de l'organisme repris du champ « nom »"}
                      {c.origine === "a_saisir" && " · nom de l'organisme à saisir"}
                    </span>
                    <button
                      type="button"
                      onClick={() => corriger([c])}
                      disabled={busy !== null || !v.organisme.trim()}
                      className="rounded bg-accent px-2.5 py-1 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
                    >
                      {busy === c.cle ? "…" : "Corriger"}
                    </button>
                  </div>
                  <label className="mb-2 block text-xs text-muted">
                    Catégorie
                    <select value={v.categorie} onChange={(e) => modifier(c, { categorie: e.target.value })} className={`${inputCls} mt-0.5`}>
                      {CATEGORIES_DONATEUR.filter((x) => x !== CATEGORIE_PARTICULIER).map((x) => (
                        <option key={x} value={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs text-muted">
                    Nom de l&apos;organisme
                    <input type="text" value={v.organisme} onChange={(e) => modifier(c, { organisme: e.target.value })} className={`${inputCls} mt-0.5`} />
                  </label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="block text-xs text-muted">
                      Contact — civilité
                      <input type="text" value={v.titre} onChange={(e) => modifier(c, { titre: e.target.value })} className={`${inputCls} mt-0.5`} />
                    </label>
                    <label className="block text-xs text-muted">
                      Contact — prénom
                      <input type="text" value={v.prenom} onChange={(e) => modifier(c, { prenom: e.target.value })} className={`${inputCls} mt-0.5`} />
                    </label>
                    <label className="block text-xs text-muted">
                      Contact — nom
                      <input type="text" value={v.nom} onChange={(e) => modifier(c, { nom: e.target.value })} className={`${inputCls} mt-0.5`} />
                    </label>
                  </div>
                </div>
              );
            })}
            {message && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs">{message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOuvert(false)} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
                Fermer
              </button>
              <button
                type="button"
                onClick={() => corriger(pretes)}
                disabled={busy !== null || pretes.length === 0}
                className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
              >
                Corriger les {pretes.length} fiche{pretes.length > 1 ? "s" : ""} prête{pretes.length > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

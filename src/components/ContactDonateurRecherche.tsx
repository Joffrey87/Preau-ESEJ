"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Field, inputCls } from "./GestionComptes";
import { createClient } from "@/lib/supabase/client";
import { useCoffre } from "@/components/CoffreProvider";
import { piiDepuis } from "@/lib/donsChiffre";
import { nomDonateur } from "@/lib/statutDon";
import { formatDate, formatEuros } from "@/lib/format";
import type { Don } from "@/components/GestionDons";

/**
 * Recherche de fonds : fiche du donateur en lecture, dont seules la relation, le courriel et le
 * téléphone sont modifiables (reportés sur tous ses dons). Le Trésorier en est alerté sur la ligne du don.
 */
export default function ContactDonateurRecherche({
  don, donsDuDonateur, prenom, onFermer,
}: { don: Don; donsDuDonateur: Don[]; prenom: string | null; onFermer: () => void }) {
  const router = useRouter();
  const coffre = useCoffre();
  const [relation, setRelation] = useState(don.origine ?? "");
  const [courriel, setCourriel] = useState(don.courriel ?? "");
  const [telephone, setTelephone] = useState(don.telephone ?? "");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const chiffre = donsDuDonateur.some((d) => d.pii_chiffre);
  const courrielBloque = chiffre && !coffre.estOuvert;
  const lecture = (label: string, v: string | null | undefined) => (
    <div><div className="text-xs text-muted">{label}</div><div className="text-sm">{v?.trim() || "—"}</div></div>
  );

  async function enregistrer() {
    setErreur(null);
    const changements: { champ: string; avant?: string | null; apres?: string | null }[] = [];
    const n = (s: string | null | undefined) => (s ?? "").trim();
    if (n(relation) !== n(don.origine)) changements.push({ champ: "relation", avant: n(don.origine), apres: n(relation) });
    if (n(telephone) !== n(don.telephone)) changements.push({ champ: "telephone", avant: n(don.telephone), apres: n(telephone) });
    const courrielChange = !courrielBloque && n(courriel) !== n(don.courriel);
    // Courriel chiffré dans le coffre : seule la mention « modifié » est consignée, sans les valeurs.
    if (courrielChange) changements.push(chiffre ? { champ: "courriel" } : { champ: "courriel", avant: n(don.courriel), apres: n(courriel) });
    if (changements.length === 0) return onFermer();
    setBusy(true);
    let pii: string | null = null;
    if (courrielChange && chiffre) pii = await coffre.chiffrer(JSON.stringify({ ...piiDepuis(don), courriel: n(courriel) || null }));
    const { error } = await createClient().rpc("dons_modifier_contact_donateur", {
      p_dons: donsDuDonateur.map((d) => d.id),
      p_origine: relation,
      p_telephone: telephone,
      p_courriel_clair: courrielBloque ? (don.courriel ?? "") : courriel,
      p_pii_chiffre: pii,
      p_changements: changements,
      p_prenom: prenom,
    });
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    router.refresh();
    onFermer();
  }

  return (
    <Modal title={`Fiche donateur — ${nomDonateur(don) || "Donateur"}`} onClose={onFermer}>
      <div className="space-y-4">
        <div className="grid gap-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-2">
          {lecture("Catégorie", don.categorie_donateur)}
          {lecture("Adresse", [don.adresse, don.cp_ville].filter(Boolean).join(", "))}
          {lecture("Don", `${formatEuros(Number(don.montant))} le ${formatDate(don.date_don)}`)}
          {lecture("Dons de ce donateur", String(donsDuDonateur.length))}
        </div>
        <p className="text-xs text-muted">Le don n&apos;est pas modifiable ici. Vous pouvez mettre à jour la relation et les coordonnées ; le Trésorier en sera averti.</p>
        <Field label="Relation">
          <input type="text" value={relation} onChange={(e) => setRelation(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Courriel">
            <input type="email" value={courriel} disabled={courrielBloque} onChange={(e) => setCourriel(e.target.value)} className={inputCls}
              title={courrielBloque ? "Déverrouillez le coffre pour modifier le courriel (donnée chiffrée)" : undefined} />
          </Field>
          <Field label="Téléphone">
            <input type="tel" value={telephone} onChange={(e) => setTelephone(e.target.value)} className={inputCls} />
          </Field>
        </div>
        {courrielBloque && <p className="text-xs text-gold">🔒 Coffre verrouillé : le courriel ne peut pas être modifié.</p>}
        {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFermer} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">Annuler</button>
          <button type="button" onClick={() => void enregistrer()} disabled={busy}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50">
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

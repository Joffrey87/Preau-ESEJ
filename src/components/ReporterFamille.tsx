"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/GestionComptes";
import DeverrouillerCoffre from "@/components/DeverrouillerCoffre";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { piiDepuis, useDonsDechiffres, type DonChiffrable } from "@/lib/donsChiffre";
import { cleDonateur, nomDonateur } from "@/lib/statutDon";
import { jetonsNom } from "@/lib/foyers";

type Famille = {
  nom: string;
  adresse: string | null;
  cp_ville: string | null;
  parent1_nom: string | null;
  parent1_courriel: string | null;
  parent2_nom: string | null;
  parent2_courriel: string | null;
};
type Contact = { id: string; nom: string; prenom: string | null; courriel: string | null };
type DonBrut = DonChiffrable & { id: string; supprime_le: string | null };

type Cible = { cle: string; type: "contact" | "donateur"; nom: string; niveau: "sur" | "verifier"; ids: string[]; courriel: string | null };

const COURRIEL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const courriels = (t: string | null | undefined): string[] => (t ?? "").toLowerCase().match(COURRIEL) ?? [];

/**
 * Reporte les coordonnées d'une famille (adresse, code postal et ville, courriel) sur le contact du carnet et sur
 * la fiche donateur qui semblent être cette famille. Courriel identique = sûr (coché d'office) ; même nom de
 * famille seul = à vérifier. Les fiches donateur sont chiffrées : le coffre doit être ouvert.
 */
export default function ReporterFamille({ famille, onClose }: { famille: Famille; onClose: () => void }) {
  const router = useRouter();
  const coffre = useCoffre();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [donsBruts, setDonsBruts] = useState<DonBrut[]>([]);
  // Choix de l'utilisateur ; sans choix, seules les correspondances sûres sont cochées.
  const [choix, setChoix] = useState<Map<string, boolean>>(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; t: string } | null>(null);
  const { dons, verrou } = useDonsDechiffres(donsBruts);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const [{ data: c }, { data: d }] = await Promise.all([
        supabase.from("contacts").select("id, nom, prenom, courriel").is("supprime_le", null).eq("est_personne_morale", false),
        supabase
          .from("dons")
          .select("id, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, a_transmettre, pii_chiffre, supprime_le")
          .is("supprime_le", null)
          .eq("est_personne_morale", false),
      ]);
      setContacts((c ?? []) as Contact[]);
      setDonsBruts((d ?? []) as unknown as DonBrut[]);
    })();
  }, []);

  const mails = useMemo(() => new Set([...courriels(famille.parent1_courriel), ...courriels(famille.parent2_courriel)]), [famille]);
  const nomsFamille = useMemo(
    () => [...new Set([...jetonsNom(famille.nom), ...jetonsNom(famille.parent1_nom), ...jetonsNom(famille.parent2_nom)])].filter((t) => t.length >= 4),
    [famille],
  );
  const correspond = (nom: string | null, courriel: string | null): "sur" | "verifier" | null => {
    if (courriels(courriel).some((m) => mails.has(m))) return "sur";
    const j = jetonsNom(nom);
    return nomsFamille.some((t) => j.has(t)) ? "verifier" : null;
  };

  const cibles: Cible[] = useMemo(() => {
    const res: Cible[] = [];
    for (const c of contacts) {
      const n = correspond(c.nom, c.courriel);
      if (n) res.push({ cle: `c|${c.id}`, type: "contact", nom: [c.prenom, c.nom].filter(Boolean).join(" "), niveau: n, ids: [c.id], courriel: c.courriel });
    }
    if (!verrou) {
      const parCle = new Map<string, DonBrut[]>();
      for (const d of dons as DonBrut[]) {
        if (!d.donateur_nom || d.donateur_nom.startsWith("🔒")) continue;
        const k = cleDonateur(d);
        (parCle.get(k) ?? parCle.set(k, []).get(k)!).push(d);
      }
      for (const [k, liste] of parCle) {
        const n = liste.map((d) => correspond(d.donateur_nom, d.courriel)).find((x) => x === "sur") ?? correspond(liste[0].donateur_nom, liste[0].courriel);
        if (n) res.push({ cle: `d|${k}`, type: "donateur", nom: nomDonateur(liste[0]), niveau: n, ids: liste.map((d) => d.id), courriel: liste[0].courriel });
      }
    }
    return res.sort((a, b) => Number(a.niveau === "verifier") - Number(b.niveau === "verifier") || a.nom.localeCompare(b.nom, "fr"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, dons, verrou, mails, nomsFamille]);

  const cochee = (c: Cible) => choix.get(c.cle) ?? c.niveau === "sur";
  const nbCoches = cibles.filter(cochee).length;
  const basculer = (c: Cible) => setChoix((p) => new Map(p).set(c.cle, !cochee(c)));

  async function appliquer() {
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const choisies = cibles.filter(cochee);
    let faits = 0;
    for (const c of choisies) {
      if (c.type === "contact") {
        const { error } = await supabase.from("contacts").update({ adresse: famille.adresse, cp_ville: famille.cp_ville }).eq("id", c.ids[0]);
        if (error) {
          setBusy(false);
          return setMessage({ ok: false, t: `« ${c.nom} » : ${error.message}` });
        }
      } else {
        if (!coffre.estOuvert) {
          setBusy(false);
          return setMessage({ ok: false, t: "Coffre verrouillé : déverrouillez-le pour mettre à jour les fiches donateur." });
        }
        for (const id of c.ids) {
          const d = (dons as DonBrut[]).find((x) => x.id === id);
          if (!d) continue;
          const pii = { ...piiDepuis(d), adresse: famille.adresse, cp_ville: famille.cp_ville };
          const { error } = await supabase.from("dons").update({ pii_chiffre: await coffre.chiffrer(JSON.stringify(pii)) }).eq("id", id);
          if (error) {
            setBusy(false);
            return setMessage({ ok: false, t: `« ${c.nom} » : ${error.message}` });
          }
        }
      }
      faits += 1;
    }
    setBusy(false);
    setMessage({ ok: true, t: `${faits} fiche${faits > 1 ? "s" : ""} mise${faits > 1 ? "s" : ""} à jour (adresse et ville).` });
    router.refresh();
  }

  return (
    <Modal title={`Reporter les coordonnées — famille ${famille.nom}`} onClose={onClose} fermerAuClicExterieur>
      <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1 text-sm">
        <p className="text-xs text-muted">
          Adresse reportée : <strong>{[famille.adresse, famille.cp_ville].filter(Boolean).join(", ") || "—"}</strong>. Courriel identique = sûr (coché),
          même nom de famille seul = à vérifier.
        </p>
        {verrou && (
          <div className="rounded-lg border border-gold/40 bg-gold-soft/40 px-3 py-2 text-xs text-gold">
            🔒 Coffre verrouillé : les fiches donateur ne sont pas lisibles.
            <div className="mt-2">
              <DeverrouillerCoffre label="🔓 Déverrouiller le coffre" />
            </div>
          </div>
        )}
        {cibles.length === 0 ? (
          <p className="rounded-lg bg-surface-2 px-3 py-3">Aucun contact ni donateur ne correspond à cette famille.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {cibles.map((c) => (
              <li key={c.cle}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-surface-2">
                  <input type="checkbox" checked={cochee(c)} onChange={() => basculer(c)} className="h-4 w-4" />
                  <span className="flex-1">
                    {c.nom} <span className="text-xs text-muted">({c.type === "contact" ? "contact du carnet" : "donateur"})</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${c.niveau === "sur" ? "bg-positive/15 text-positive" : "bg-gold-soft text-gold"}`}>
                    {c.niveau === "sur" ? "sûr" : "à vérifier"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p className={`rounded-lg px-3 py-2 text-xs ${message.ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>{message.t}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
            Fermer
          </button>
          <button
            type="button"
            onClick={() => void appliquer()}
            disabled={busy || nbCoches === 0}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : `Mettre à jour ${nbCoches} fiche${nbCoches > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

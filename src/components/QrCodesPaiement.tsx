"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// QR codes de paiement (IBAN SumUp, IBAN Crédit Mutuel) : déposés par le Trésorier dans ses Paramètres, ouverts en un
// clic depuis l'onglet Ventes diverses. Compartiment privé « qr-codes » (lien signé de quelques minutes).

const BUCKET = "qr-codes";
export const QR_CODES = [
  { cle: "sumup", label: "QR code IBAN SumUp" },
  { cle: "credit-mutuel", label: "QR code IBAN Crédit Mutuel" },
] as const;

/** QR codes déposés (noms des objets présents). */
function useQrPresents(): [Set<string>, () => void] {
  const [presents, setPresents] = useState<Set<string>>(new Set());
  const [tour, setTour] = useState(0);
  useEffect(() => {
    createClient()
      .storage.from(BUCKET)
      .list()
      .then(({ data }) => setPresents(new Set((data ?? []).map((o) => o.name))));
  }, [tour]);
  return [presents, () => setTour((t) => t + 1)];
}

async function ouvrir(cle: string) {
  // Fenêtre ouverte tout de suite (sinon bloquée), adresse signée posée ensuite.
  const w = window.open("", "_blank");
  const { data } = await createClient().storage.from(BUCKET).createSignedUrl(cle, 300);
  if (data?.signedUrl && w) w.location.href = data.signedUrl;
  else w?.close();
}

/** Ventes diverses : liens vers les QR codes déposés. */
export function LiensQrCodes() {
  const [presents] = useQrPresents();
  const dispo = QR_CODES.filter((q) => presents.has(q.cle));
  if (dispo.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      {dispo.map((q) => (
        <button key={q.cle} type="button" onClick={() => ouvrir(q.cle)} className="font-medium text-accent hover:underline">
          {q.label}
        </button>
      ))}
    </div>
  );
}

/** Paramètres du Trésorier : dépôt, remplacement et retrait des QR codes. */
export default function QrCodesPaiement() {
  const [presents, recharger] = useQrPresents();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  async function deposer(cle: string, fichier: File | undefined) {
    if (!fichier) return;
    setOccupe(cle);
    setErreur(null);
    const { error } = await createClient().storage.from(BUCKET).upload(cle, fichier, { upsert: true, contentType: fichier.type });
    setOccupe(null);
    if (error) setErreur(error.message);
    recharger();
  }

  async function retirer(cle: string) {
    if (!window.confirm("Retirer ce QR code ?")) return;
    setOccupe(cle);
    const { error } = await createClient().storage.from(BUCKET).remove([cle]);
    setOccupe(null);
    if (error) setErreur(error.message);
    recharger();
  }

  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold">QR codes de paiement</h2>
      <p className="mb-3 text-sm text-muted">Affichés en lien dans l&apos;onglet Ventes diverses (image PNG, JPEG, WebP ou PDF, 5 Mo maximum).</p>
      <div className="grid gap-3 md:grid-cols-2">
        {QR_CODES.map((q) => {
          const present = presents.has(q.cle);
          return (
            <div key={q.cle} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{q.label}</div>
                <div className={`text-xs ${present ? "text-positive" : "text-muted"}`}>{present ? "Déposé" : "Aucun fichier"}</div>
              </div>
              {present && (
                <button type="button" onClick={() => ouvrir(q.cle)} className="text-xs font-medium text-accent hover:underline">
                  Voir
                </button>
              )}
              <label className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2">
                {occupe === q.cle ? "…" : present ? "Remplacer" : "Déposer"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  disabled={occupe !== null}
                  onChange={(e) => {
                    void deposer(q.cle, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {present && (
                <button type="button" onClick={() => retirer(q.cle)} disabled={occupe !== null} className="text-xs text-muted hover:text-negative">
                  Retirer
                </button>
              )}
            </div>
          );
        })}
      </div>
      {erreur && <p className="mt-2 text-sm text-negative">{erreur}</p>}
    </section>
  );
}

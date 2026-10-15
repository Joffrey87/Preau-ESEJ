"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Famille = { id: string; nom: string; identifiant: string | null };
type Lien = { famille_id: string; code: string; expire_le: string };

/**
 * Liens d'invitation de l'Espace famille, conservés (rien n'est envoyé : bouton Copier). Le Webmestre peut aussi
 * ouvrir l'Espace d'une famille, avec les droits de cette famille, sans son mot de passe (ouverture journalisée).
 */
export default function LiensInvitationFamilles() {
  const sb = useMemo(() => createClient(), []);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [liens, setLiens] = useState<Map<string, Lien>>(new Map());
  const [webmestre, setWebmestre] = useState(false);
  const [copie, setCopie] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");

  const charger = useCallback(async () => {
    const [{ data: f }, { data: l }, { data: w }] = await Promise.all([
      sb.from("familles").select("id, nom, identifiant").eq("masquee_connexion", false).order("nom"),
      sb.from("invitations_famille_liens").select("famille_id, code, expire_le"),
      sb.rpc("est_webmestre"),
    ]);
    setFamilles((f ?? []) as Famille[]);
    setLiens(new Map(((l ?? []) as Lien[]).map((x) => [x.famille_id, x])));
    setWebmestre(w === true);
  }, [sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture initiale
    void charger();
  }, [charger]);

  const url = (code: string) => `${window.location.origin}/auth/invitation?code=${encodeURIComponent(code)}`;
  async function copier(f: Famille, l: Lien) {
    await navigator.clipboard.writeText(url(l.code));
    setCopie(f.id);
    setTimeout(() => setCopie(null), 1500);
  }
  async function regenerer(f: Famille) {
    if (liens.has(f.id) && !window.confirm(`Régénérer le lien de la famille ${f.nom} ? L'ancien lien ne fonctionnera plus.`)) return;
    const { error } = await sb.rpc("invitation_famille_conserver", { p_famille: f.id });
    setErreur(error ? error.message : null);
    await charger();
  }

  const aujourdhui = new Date().toISOString().slice(0, 10);
  const visibles = familles.filter((f) => f.nom.toLowerCase().includes(filtre.toLowerCase()));
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Liens d&apos;invitation — Espace famille</h2>
        <input value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Rechercher une famille" className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-[13px]" />
      </div>
      <p className="mb-2 text-[12px] text-muted">
        Rien n&apos;est envoyé : copiez le lien et transmettez-le à la famille. Le lien permet à la famille de choisir son propre mot de passe (valable 60 jours).
      </p>
      {erreur && <p className="mb-2 rounded bg-negative/10 px-2 py-1 text-[13px] text-negative">{erreur}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-muted">
              <th className="py-1 font-medium">Famille</th>
              <th className="py-1 font-medium">Identifiant</th>
              <th className="py-1 font-medium">Lien</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const l = liens.get(f.id);
              const expire = l && l.expire_le.slice(0, 10) < aujourdhui;
              return (
                <tr key={f.id} className="border-t border-border">
                  <td className="py-1.5 font-medium">{f.nom}</td>
                  <td className="py-1.5 font-mono text-[12px]">{f.identifiant}</td>
                  <td className="py-1.5">
                    {l ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => copier(f, l)} className="rounded-md border border-border px-2 py-0.5 hover:bg-surface-2">
                          {copie === f.id ? "Copié ✓" : "Copier le lien"}
                        </button>
                        <span className={`text-[11px] ${expire ? "text-negative" : "text-muted"}`}>
                          {expire ? "expiré" : `jusqu'au ${l.expire_le.slice(0, 10).split("-").reverse().join("/")}`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    <span className="flex justify-end gap-2">
                      <button type="button" onClick={() => regenerer(f)} className="text-[12px] text-accent hover:underline">
                        {l ? "Régénérer" : "Générer"}
                      </button>
                      {webmestre && (
                        <a href={`/famille-liee/webmestre?famille=${f.id}`} className="rounded-md bg-accent px-2 py-0.5 text-[12px] font-medium text-accent-fg" title="Ouvrir l'Espace de cette famille (journalisé)">
                          Ouvrir l&apos;Espace
                        </a>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

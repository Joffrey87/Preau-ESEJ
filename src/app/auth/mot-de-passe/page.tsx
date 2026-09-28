"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Choix du mot de passe, depuis le lien d'invitation (ou de réinitialisation)
 * reçu par courriel. Le lien ouvre une session ; la famille fixe ici son mot
 * de passe, puis rejoint son espace.
 */
export default function ChoixMotDePasse() {
  const router = useRouter();
  const [pret, setPret] = useState<boolean | null>(null);
  const [mdp, setMdp] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    // Le lien d'invitation porte un code à échanger contre une session.
    const code = new URLSearchParams(window.location.search).get("code");
    (async () => {
      if (code) await supabase.auth.exchangeCodeForSession(code);
      const { data } = await supabase.auth.getSession();
      setPret(!!data.session);
    })();
  }, []);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (mdp.length < 10) return setErreur("Au moins 10 caractères.");
    if (mdp !== confirmation) return setErreur("Les deux saisies diffèrent.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: mdp });
    setBusy(false);
    if (error) return setErreur("Enregistrement impossible : " + error.message);
    router.push("/espace");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" className="mb-4 h-28 w-28 rounded-full object-contain" />
          <h1 className="text-xl font-semibold">Choisir votre mot de passe</h1>
          <p className="mt-1 text-sm text-muted">École du Saint-Enfant-Jésus · Espace familles</p>
        </div>
        {pret === null ? (
          <p className="text-center text-sm text-muted">Vérification du lien…</p>
        ) : !pret ? (
          <p className="rounded-xl border border-negative/30 bg-negative/5 px-4 py-3 text-center text-sm text-negative">
            Ce lien n&apos;est plus valide. Demandez à l&apos;école de vous renvoyer une invitation.
          </p>
        ) : (
          <form onSubmit={valider} className="space-y-3 rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Nouveau mot de passe"
              value={mdp}
              onChange={(e) => setMdp(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder="Confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : "Enregistrer et accéder à mon espace"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

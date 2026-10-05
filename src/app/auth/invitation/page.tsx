"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { emailConnexionFamille } from "@/lib/identifiantFamille";

type Infos = { famille: string; prenom1: string | null; prenom2: string | null; courriel1: string | null; courriel2: string | null };

/**
 * Invitation d'une famille : lien personnel transmis par le bureau. La famille vérifie (ou corrige) les adresses
 * électroniques de Monsieur et de Madame, puis choisit UN mot de passe, commun aux deux. Elle se connectera ensuite
 * avec son nom de famille et ce mot de passe ; les adresses ne servent qu'à retrouver un mot de passe oublié.
 */
function Invitation() {
  const router = useRouter();
  const code = useSearchParams().get("code") ?? "";
  const [infos, setInfos] = useState<Infos | null | undefined>(undefined);
  const [courriel1, setCourriel1] = useState("");
  const [courriel2, setCourriel2] = useState("");
  const [mdp, setMdp] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await createClient().rpc("invitation_infos", { p_code: code });
      const i = (data as Infos | null) ?? null;
      setInfos(i);
      if (i) {
        setCourriel1(i.courriel1 ?? "");
        setCourriel2(i.courriel2 ?? "");
      }
    })();
  }, [code]);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!infos) return;
    if (mdp.length < 10) return setErreur("Au moins 10 caractères.");
    if (mdp !== confirmation) return setErreur("Les deux saisies diffèrent.");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("activer_invitation", { p_code: code, p_courriel1: courriel1, p_courriel2: courriel2, p_mdp: mdp });
    if (error) {
      setBusy(false);
      return setErreur(error.message);
    }
    const { error: e2 } = await supabase.auth.signInWithPassword({ email: emailConnexionFamille(infos.famille), password: mdp });
    setBusy(false);
    if (e2) return setErreur("Mot de passe enregistré, mais connexion impossible : retournez à l'accueil et connectez-vous avec votre nom de famille.");
    router.push("/espace/famille");
    router.refresh();
  }

  const champ = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="grid min-h-screen place-items-center px-5 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.webp" alt="" className="mb-4 h-28 w-28 rounded-full object-contain" />
          <h1 className="text-xl font-semibold">Bienvenue dans votre espace famille</h1>
          <p className="mt-1 text-sm text-muted">École du Saint-Enfant-Jésus</p>
        </div>
        {infos === undefined ? (
          <p className="text-center text-sm text-muted">Vérification du lien…</p>
        ) : infos === null ? (
          <p className="rounded-xl border border-negative/30 bg-negative/5 px-4 py-3 text-center text-sm text-negative">
            Ce lien n&apos;est plus valide. Demandez à l&apos;école de vous en envoyer un nouveau.
          </p>
        ) : (
          <form onSubmit={valider} className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
            <p className="text-sm">
              Famille <strong>{infos.famille}</strong>. Pour vous connecter, vous saisirez votre <strong>nom de famille</strong> et un mot de passe,{" "}
              <strong>le même pour Monsieur et pour Madame</strong>.
            </p>
            <div className="space-y-3">
              <label className="block text-xs text-muted">
                Adresse électronique de Monsieur {infos.prenom1 ? `(${infos.prenom1})` : ""}
                <input type="email" value={courriel1} onChange={(e) => setCourriel1(e.target.value)} className={`${champ} mt-1`} autoComplete="email" />
              </label>
              <label className="block text-xs text-muted">
                Adresse électronique de Madame {infos.prenom2 ? `(${infos.prenom2})` : ""} <span className="text-muted/70">— facultative</span>
                <input type="email" value={courriel2} onChange={(e) => setCourriel2(e.target.value)} className={`${champ} mt-1`} />
              </label>
              <p className="text-xs text-muted">
                Ces adresses (proposées d&apos;après votre fiche, modifiables) ne servent qu&apos;à retrouver votre mot de passe en cas d&apos;oubli.
              </p>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-muted">
                Choisissez votre mot de passe (10 caractères minimum)
                <input type="password" required minLength={10} value={mdp} onChange={(e) => setMdp(e.target.value)} className={`${champ} mt-1`} autoComplete="new-password" />
              </label>
              <label className="block text-xs text-muted">
                Confirmez-le
                <input type="password" required minLength={10} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={`${champ} mt-1`} autoComplete="new-password" />
              </label>
            </div>
            {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">{erreur}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Enregistrement…" : "Valider et entrer dans mon espace"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function PageInvitation() {
  return (
    <Suspense fallback={null}>
      <Invitation />
    </Suspense>
  );
}

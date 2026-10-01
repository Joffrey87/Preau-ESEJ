"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { COOKIE_PRENOM, ROLES, ROLES_PRENOM_A_L_ACCES } from "@/lib/roles";
import { MEMBRES } from "@/lib/rechercheFonds";

export default function LoginPage() {
  const router = useRouter();
  // Bureau : un compte par rôle, choisi dans la liste. Famille : son adresse.
  const [espace, setEspace] = useState<"bureau" | "famille">("bureau");
  const [email, setEmail] = useState(ROLES[1].email); // Trésorier par défaut
  const [password, setPassword] = useState("");
  // Profil partagé (Recherche de fonds) : chacun indique son prénom à l'accès.
  const [prenom, setPrenom] = useState("");
  const avecPrenom = espace === "bureau" && ROLES_PRENOM_A_L_ACCES.includes(ROLES.find((r) => r.email === email)?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (avecPrenom && !prenom) return setError("Choisissez votre prénom.");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(espace === "famille" ? "Adresse ou mot de passe incorrect." : "Rôle ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    // Prénom de la visite : cookie de session (sans durée), effacé à la fermeture du navigateur.
    document.cookie = avecPrenom
      ? `${COOKIE_PRENOM}=${encodeURIComponent(prenom)}; path=/; SameSite=Lax`
      : `${COOKIE_PRENOM}=; path=/; max-age=0; SameSite=Lax`;

    // Le middleware oriente chaque compte vers son espace.
    router.push(espace === "famille" ? "/espace" : "/");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="Préau"
            className="mb-4 h-44 w-44 rounded-full object-contain"
          />
          <h1 className="text-xl font-semibold">Préau</h1>
          <p className="mt-1 text-sm text-muted">
            ARIL · École du Saint-Enfant-Jésus
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-surface p-6 shadow-sm"
        >
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1 text-sm">
            {(["bureau", "famille"] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setEspace(e);
                  setEmail(e === "bureau" ? ROLES[1].email : "");
                  setError(null);
                }}
                className={`rounded-md px-3 py-1.5 font-medium ${espace === e ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                {e === "bureau" ? "Bureau" : "Espace famille"}
              </button>
            ))}
          </div>

          {espace === "bureau" ? (
            <>
              <label className="mb-1 block text-sm font-medium" htmlFor="role">
                Rôle
              </label>
              <select
                id="role"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              >
                {ROLES.map((r) => (
                  <option key={r.slug} value={r.email}>
                    {r.label}
                  </option>
                ))}
              </select>
              {avecPrenom && (
                <>
                  <label className="mb-1 block text-sm font-medium" htmlFor="prenom">
                    Prénom
                  </label>
                  <select
                    id="prenom"
                    required
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  >
                    <option value="">— Choisir —</option>
                    {MEMBRES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          ) : (
            <>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                Adresse électronique
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </>
          )}

          <label className="mb-1 block text-sm font-medium" htmlFor="password">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mb-4 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />

          {error && (
            <p className="mb-4 rounded-lg bg-negative/10 px-3 py-2 text-sm text-negative">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Accès…" : "Accéder"}
          </button>
        </form>

        {espace !== "bureau" && (
          <p className="mt-4 text-center text-xs text-muted">
            Première connexion : utilisez le lien reçu par courriel pour choisir votre mot de passe.
          </p>
        )}
      </div>
    </div>
  );
}

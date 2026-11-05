import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireConsoNetlify } from "@/lib/netlifyCredits";

// Crédits Netlify + nb de déploiements du mois. Réservé au Webmestre.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ erreur: "Session expirée : reconnectez-vous." }, { status: 401 });
  const { data: webmestre } = await supabase.rpc("est_webmestre");
  if (webmestre !== true) return NextResponse.json({ erreur: "Réservé au Webmestre." }, { status: 403 });

  try {
    const conso = await lireConsoNetlify();
    if (!conso) {
      return NextResponse.json({
        configure: false,
        // TODO : définir NETLIFY_AUTH_TOKEN sur Netlify (Functions + Runtime).
        message: "Jeton Netlify absent (NETLIFY_AUTH_TOKEN).",
      });
    }
    return NextResponse.json({ configure: true, ...conso });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "inconnu";
    console.error("netlify-credits :", msg);
    return NextResponse.json({ erreur: "Impossible de lire la conso Netlify.", detail: msg.slice(0, 300) }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireFactureAvecClaude } from "@/lib/lectureFacture";

// Lecture automatique d'une facture fournisseur. Réservé aux membres Événementiel et au Trésorier
// (fonction SQL peut_saisir_factures). Ni le fichier ni la clé ne sont journalisés.
export const runtime = "nodejs";
export const maxDuration = 60;

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const TAILLE_MAX = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ erreur: "Session expirée : reconnectez-vous." }, { status: 401 });
  const { data: autorise } = await supabase.rpc("peut_saisir_factures");
  if (autorise !== true) return NextResponse.json({ erreur: "Lecture réservée aux membres de l'Événementiel et au Trésorier." }, { status: 403 });

  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return NextResponse.json({ erreur: "Lecture automatique non configurée (clé manquante sur le serveur)." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const f = form?.get("fichier");
  if (!(f instanceof File)) return NextResponse.json({ erreur: "Aucun fichier reçu." }, { status: 400 });
  if (!TYPES.includes(f.type)) return NextResponse.json({ erreur: "Format non pris en charge (JPEG, PNG, WebP ou PDF)." }, { status: 415 });
  if (f.size > TAILLE_MAX) return NextResponse.json({ erreur: "Fichier trop lourd (10 Mo max)." }, { status: 413 });

  try {
    const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
    return NextResponse.json(await lireFactureAvecClaude(cle, b64, f.type));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "inconnu";
    console.error("lecture-facture : échec", msg);
    return NextResponse.json(
      { erreur: "La lecture automatique a échoué. Complétez à la main ou réessayez.", detail: msg.slice(0, 300) },
      { status: 502 },
    );
  }
}

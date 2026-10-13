import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lireAvecClaude } from "@/lib/lectureCheques";

// Lecture automatique d'une photo de chèques / bordereau. Réservé à Trésorier, Président, Directrice
// (fonction SQL peut_deposer_cheques). Ni l'image ni la clé ne sont journalisées.
export const runtime = "nodejs";
export const maxDuration = 60;

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const TAILLE_MAX = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return NextResponse.json({ erreur: "Session expirée : reconnectez-vous." }, { status: 401 });
  const { data: autorise } = await supabase.rpc("peut_deposer_cheques");
  if (autorise !== true) return NextResponse.json({ erreur: "Lecture réservée au Trésorier, au Président et à la Directrice." }, { status: 403 });

  const cle = process.env.ANTHROPIC_API_KEY;
  if (!cle) return NextResponse.json({ erreur: "Lecture automatique non configurée (clé manquante sur le serveur)." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const f = form?.get("photo");
  if (!(f instanceof File)) return NextResponse.json({ erreur: "Aucune photo reçue." }, { status: 400 });
  if (!TYPES.includes(f.type)) return NextResponse.json({ erreur: "Format non pris en charge (JPEG, PNG, WebP ou PDF)." }, { status: 415 });
  if (f.size > TAILLE_MAX) return NextResponse.json({ erreur: "Fichier trop lourd (10 Mo max)." }, { status: 413 });

  try {
    const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
    return NextResponse.json(await lireAvecClaude(cle, b64, f.type));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "inconnu";
    console.error("lecture-cheques : échec", msg);
    // Détail technique (statut et message de l'API, jamais la clé ni l'image) pour le diagnostic.
    return NextResponse.json(
      { erreur: "La lecture automatique a échoué. Saisissez les chèques à la main ou réessayez.", detail: msg.slice(0, 300) },
      { status: 502 },
    );
  }
}

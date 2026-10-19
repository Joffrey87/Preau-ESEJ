// Lecture automatique d'UNE facture fournisseur (photo ou PDF) par Claude. Côté serveur uniquement.

export const MODELE_LECTURE = "claude-sonnet-5-5";

export type FactureLue = {
  fournisseur_entreprise: string | null;
  fournisseur_nom: string | null;
  fournisseur_prenom: string | null;
  date: string | null;
  numero: string | null;
  montant_ttc: number | null;
  libelle: string | null;
  /** Ce que contient le document : une facture, un RIB, ou les deux (RIB imprimé au bas d'une facture). */
  contient_facture: boolean;
  contient_rib: boolean;
  iban: string | null;
  bic: string | null;
  titulaire: string | null;
};

const CONSIGNE = `Tu lis un document d'un fournisseur adressé à une association : une facture (ou note), un RIB (relevé d'identité bancaire), ou une facture portant aussi des coordonnées bancaires.
Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"contient_facture":true|false,"contient_rib":true|false,"fournisseur_entreprise":"…"|null,"fournisseur_nom":"…"|null,"fournisseur_prenom":"…"|null,"date":"AAAA-MM-JJ"|null,"numero":"…"|null,"montant_ttc":123.45|null,"libelle":"…"|null,"iban":"…"|null,"bic":"…"|null,"titulaire":"…"|null}
Règles :
- contient_facture : vrai si le document est une facture ou une note à payer ; contient_rib : vrai si un IBAN y figure ;
- iban : l'IBAN du fournisseur tel qu'imprimé (lettres et chiffres, sans espaces), bic : le code BIC/SWIFT, titulaire : le titulaire du compte ;
- pour un RIB seul, laisse date, numero, montant_ttc et libelle à null (le fournisseur est le titulaire) ;
- le fournisseur est l'émetteur de la facture (pas le client destinataire) : nom de l'entreprise, et/ou nom et prénom de la personne ;
- date d'émission de la facture au format AAAA-MM-JJ ;
- numero : le numéro de facture tel qu'imprimé ;
- montant_ttc : total TTC à payer en euros (nombre décimal avec point) ;
- libelle : objet de la facture en 2 à 6 mots (ex. « Location de tables », « Courses kermesse ») ;
- n'invente rien : null pour ce que tu ne lis pas.`;

const texte = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
function nombre(x: unknown): number | null {
  if (typeof x === "number" && isFinite(x)) return Math.round(x * 100) / 100;
  if (typeof x === "string" && x.trim()) {
    const n = Number(x.replace(/\s/g, "").replace(",", "."));
    return isFinite(n) ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

export function analyserReponse(t: string): FactureLue {
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse illisible");
  const j = JSON.parse(m[0]) as Record<string, unknown>;
  const d = texte(j.date);
  return {
    fournisseur_entreprise: texte(j.fournisseur_entreprise),
    fournisseur_nom: texte(j.fournisseur_nom),
    fournisseur_prenom: texte(j.fournisseur_prenom),
    date: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
    numero: texte(j.numero),
    montant_ttc: nombre(j.montant_ttc),
    libelle: texte(j.libelle),
    contient_facture: j.contient_facture !== false,
    contient_rib: j.contient_rib === true || !!texte(j.iban),
    iban: texte(j.iban)?.replace(/[\s-]/g, "").toUpperCase() ?? null,
    bic: texte(j.bic)?.replace(/\s/g, "").toUpperCase() ?? null,
    titulaire: texte(j.titulaire),
  };
}

/** Appel à l'API Anthropic. La clé n'est jamais journalisée ni renvoyée. */
export async function lireFactureAvecClaude(cle: string, base64: string, mediaType: string): Promise<FactureLue> {
  const source = { type: "base64", media_type: mediaType, data: base64 };
  const bloc = mediaType === "application/pdf" ? { type: "document", source } : { type: "image", source };
  const rep = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cle,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({
      model: MODELE_LECTURE,
      max_tokens: 1000,
      messages: [{ role: "user", content: [bloc, { type: "text", text: CONSIGNE }] }],
    }),
  });
  if (!rep.ok) {
    const detail = ((await rep.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
    throw new Error(`API ${rep.status} ${detail.slice(0, 200)}`);
  }
  const d = (await rep.json()) as { content?: { type: string; text?: string }[] };
  return analyserReponse((d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(""));
}

// Lecture automatique d'UNE facture fournisseur (photo ou PDF) par Claude. Côté serveur uniquement.
import { leverErreurApi, verifierFin } from "@/lib/erreurLecture";
import { objetsJson } from "@/lib/lectureDocument";
import type { SuiviConso, UsageClaude } from "@/lib/consoClaude";

export const MODELE_LECTURE = "claude-sonnet-5-5";

/** Une facture lue dans le document. `pages` : ses pages (à partir de 1), pour découper un PDF qui en réunit plusieurs. */
export type FactureDetectee = {
  fournisseur_entreprise: string | null;
  fournisseur_nom: string | null;
  fournisseur_prenom: string | null;
  date: string | null;
  numero: string | null;
  montant_ttc: number | null;
  libelle: string | null;
  pages: number[];
};

export type FactureLue = Omit<FactureDetectee, "pages"> & {
  /** Ce que contient le document : une facture, un RIB, ou les deux (RIB imprimé au bas d'une facture). */
  contient_facture: boolean;
  contient_rib: boolean;
  iban: string | null;
  bic: string | null;
  titulaire: string | null;
  /** Présent seulement si le document réunit plusieurs factures distinctes. */
  factures?: FactureDetectee[];
};

const CONSIGNE = `Tu lis un document d'un fournisseur adressé à une association : une ou plusieurs factures (ou notes), un RIB (relevé d'identité bancaire), ou des factures portant aussi des coordonnées bancaires.
Réponds UNIQUEMENT par un seul objet JSON, sans texte autour :
{"contient_rib":true|false,"iban":"…"|null,"bic":"…"|null,"titulaire":"…"|null,"factures":[{"fournisseur_entreprise":"…"|null,"fournisseur_nom":"…"|null,"fournisseur_prenom":"…"|null,"date":"AAAA-MM-JJ"|null,"numero":"…"|null,"montant_ttc":123.45|null,"libelle":"…"|null,"pages":[1]}]}
Règles :
- factures : une entrée par facture ou note à payer ; liste vide si le document n'est qu'un RIB ;
- une facture peut s'étendre sur plusieurs pages (suite du détail, conditions générales, total en dernière page) : c'est alors UNE seule entrée ;
- ne fais plusieurs entrées que pour des factures réellement distinctes : numéros différents, émetteurs différents, ou chacune son propre total à payer. En cas de doute, une seule entrée ;
- pages : numéros des pages de cette facture, à partir de 1, annexes comprises ;
- contient_rib : vrai si un IBAN y figure ; iban : l'IBAN du fournisseur tel qu'imprimé (lettres et chiffres, sans espaces), bic : le code BIC/SWIFT, titulaire : le titulaire du compte ;
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

const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Réunit des objets en un seul : la première valeur renseignée, sauf le total à payer (celui de la dernière page). */
function reunir(objets: Record<string, unknown>[]) {
  const j: Record<string, unknown> = {};
  for (const o of objets)
    for (const [k, v] of Object.entries(o))
      if (v !== null && v !== "" && (j[k] === undefined || j[k] === false || k === "montant_ttc")) j[k] = v;
  return j;
}

function lireFacture(j: Record<string, unknown>): FactureDetectee {
  const d = texte(j.date);
  return {
    fournisseur_entreprise: texte(j.fournisseur_entreprise),
    fournisseur_nom: texte(j.fournisseur_nom),
    fournisseur_prenom: texte(j.fournisseur_prenom),
    date: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
    numero: texte(j.numero),
    montant_ttc: nombre(j.montant_ttc),
    libelle: texte(j.libelle),
    pages: Array.isArray(j.pages) ? j.pages.filter((p): p is number => Number.isInteger(p) && p > 0) : [],
  };
}

export function analyserReponse(t: string): FactureLue {
  const objets = objetsJson(t);
  if (!objets.length) throw new Error("Réponse illisible");
  const listees = objets.flatMap((o) => (Array.isArray(o.factures) ? o.factures.filter(estObjet) : []));
  const avecListe = objets.some((o) => Array.isArray(o.factures));
  // Réponse hors format (un objet par page) : une seule facture, faute d'indication contraire.
  const factures = (avecListe ? listees : [reunir(objets)]).map(lireFacture);
  const r = reunir([...objets, ...listees]);
  return {
    ...(factures[0] ?? lireFacture({})),
    contient_facture: avecListe ? factures.length > 0 : r.contient_facture !== false,
    contient_rib: r.contient_rib === true || !!texte(r.iban),
    iban: texte(r.iban)?.replace(/[\s-]/g, "").toUpperCase() ?? null,
    bic: texte(r.bic)?.replace(/\s/g, "").toUpperCase() ?? null,
    titulaire: texte(r.titulaire),
    ...(factures.length > 1 ? { factures } : {}),
  };
}

/** Appel à l'API Anthropic. La clé n'est jamais journalisée ni renvoyée. */
export async function lireFactureAvecClaude(cle: string, base64: string, mediaType: string, suivi?: SuiviConso): Promise<FactureLue> {
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
      max_tokens: 4000,
      // Sonnet 5.5 « réfléchit » par défaut (effort high) et cette réflexion compte dans max_tokens :
      // effort bas pour une simple lecture (plus rapide, la réponse JSON n'est pas tronquée).
      output_config: { effort: "low" },
      messages: [{ role: "user", content: [bloc, { type: "text", text: CONSIGNE }] }],
    }),
  });
  if (!rep.ok) await leverErreurApi(rep);
  const d = (await rep.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: UsageClaude };
  // Jetons facturés (même si la réponse est ensuite inexploitable) : pour le suivi du crédit.
  if (suivi) suivi.usage = d.usage ?? null;
  verifierFin(d);
  return analyserReponse((d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(""));
}

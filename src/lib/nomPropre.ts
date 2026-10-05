// Nom d'un particulier : seule l'initiale de chaque mot du nom porte la majuscule
// (« DUPONT » → « Dupont », « GIRARDOT-PERROT » → « Girardot-Perrot »), les particules restent
// en minuscules (« D'ORGVILLE » → « d'Orgville », « DE KERMABON » → « de Kermabon »).
// Ne s'applique pas aux organismes (personnes morales), dont le nom s'écrit tel quel.

const PARTICULES = new Set(["de", "du", "des", "van", "von", "der", "den", "ten", "ter", "zu"]);
const ARTICLES = new Set(["la", "le", "les"]);

const minuscules = (s: string) => s.toLocaleLowerCase("fr-FR");
const capitale = (s: string) => (s ? s.charAt(0).toLocaleUpperCase("fr-FR") + minuscules(s.slice(1)) : s);

/** Un mot : les parties séparées par un tiret ou une apostrophe portent chacune leur majuscule. */
function mot(m: string, precedeParticule: boolean, premier: boolean): string {
  const bas = minuscules(m);
  if (PARTICULES.has(bas)) return bas;
  if (!premier && precedeParticule && ARTICLES.has(bas)) return bas;
  // « d'orgville » : la particule collée à son apostrophe reste en minuscules (hors tête de nom : « O'Brien »).
  const apostrophe = /^(d|l)['’](.+)$/i.exec(m);
  if (apostrophe && minuscules(apostrophe[1]) === "d") return `d'${capitale(apostrophe[2])}`;
  return m
    .split(/([-'’])/)
    .map((p) => (/^[-'’]$/.test(p) ? p : capitale(p)))
    .join("");
}

/** « D AUBREBY DELACOUR » / « d'AUBREBY delacour » → « d'Aubreby Delacour ». */
export function formaterNomParticulier(nom: string | null | undefined): string {
  const brut = (nom ?? "").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  if (!brut) return "";
  // Un « d » isolé devant un mot est une particule élidée dont l'apostrophe a été oubliée.
  const morceaux = brut.replace(/^(d)\s+(?=\S)/i, "d'").split(" ");
  let precedeParticule = false;
  return morceaux
    .map((m, i) => {
      const r = mot(m, precedeParticule, i === 0);
      precedeParticule = PARTICULES.has(minuscules(m)) || /^d['’]/i.test(m);
      return r;
    })
    .join(" ")
    .replace(/^d' /, "d'");
}

/** Nom prêt à enregistrer : corrigé pour un particulier, inchangé pour un organisme. */
export const nomSoigne = (nom: string, estPersonneMorale: boolean): string =>
  estPersonneMorale ? nom.trim() : formaterNomParticulier(nom);

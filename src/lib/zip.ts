// Création d'une archive ZIP dans le navigateur, sans dépendance (méthode « stockée » : les PDF
// sont déjà compressés). Les noms de fichiers sont en UTF-8 (accents et « ° » conservés).

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Date et heure au format MS-DOS, telles que les attend le ZIP. */
function dateDos(d: Date): { heure: number; date: number } {
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type FichierZip = { nom: string; octets: Uint8Array };

/** Assemble les fichiers en une archive ZIP (deux noms identiques reçoivent un suffixe « (2) »…). */
export function creerZip(fichiers: FichierZip[]): Uint8Array {
  const encodeur = new TextEncoder();
  const vus = new Map<string, number>();
  const parties: Uint8Array[] = [];
  const centrale: Uint8Array[] = [];
  const { heure, date } = dateDos(new Date());
  let decalage = 0;

  for (const f of fichiers) {
    let nom = f.nom;
    const n = (vus.get(nom) ?? 0) + 1;
    vus.set(nom, n);
    if (n > 1) nom = nom.replace(/(\.[^.]+)?$/, ` (${n})$1`);
    const nomOctets = encodeur.encode(nom);
    const crc = crc32(f.octets);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version nécessaire
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint16(8, 0, true); // méthode : stockée
    local.setUint16(10, heure, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.octets.length, true);
    local.setUint32(22, f.octets.length, true);
    local.setUint16(26, nomOctets.length, true);
    local.setUint16(28, 0, true);
    parties.push(new Uint8Array(local.buffer), nomOctets, f.octets);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, heure, true);
    c.setUint16(14, date, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, f.octets.length, true);
    c.setUint32(24, f.octets.length, true);
    c.setUint16(28, nomOctets.length, true);
    c.setUint32(42, decalage, true);
    centrale.push(new Uint8Array(c.buffer), nomOctets);

    decalage += 30 + nomOctets.length + f.octets.length;
  }

  const tailleCentrale = centrale.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentrale, true);
  fin.setUint32(16, decalage, true);

  const tout = [...parties, ...centrale, new Uint8Array(fin.buffer)];
  const resultat = new Uint8Array(tout.reduce((s, p) => s + p.length, 0));
  let position = 0;
  for (const p of tout) {
    resultat.set(p, position);
    position += p.length;
  }
  return resultat;
}

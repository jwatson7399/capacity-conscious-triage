/**
 * De-identify a weekly schedule workbook.
 *
 * Rewrites only the leading person-name token of each cell, preserving the sheet
 * layout, shift times, annotations, and the PGY key table verbatim. This keeps the
 * file parse-equivalent to the real one under src/utils/scheduleParser.ts while
 * removing every real provider name.
 *
 * Usage:
 *   npx tsx scripts/deidentify-schedule.ts <source.xlsx> <dest.xlsx>
 *
 * Verify the result with scripts/verify-deidentified-schedule.ts.
 */
import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';
import { nameTokenOf } from './schedule-name-tokens';

const [, , SRC, DEST] = process.argv;
if (!SRC || !DEST) {
  console.error('usage: tsx scripts/deidentify-schedule.ts <source.xlsx> <dest.xlsx>');
  process.exit(1);
}

/** Pseudonym pool: single-token, obviously synthetic, distinct surnames. */
const POOL = [
  'Alder', 'Birch', 'Cedar', 'Dogwood', 'Elm', 'Fir', 'Ginkgo', 'Hawthorn',
  'Ironwood', 'Juniper', 'Katsura', 'Larch', 'Magnolia', 'Nutmeg', 'Olive',
  'Poplar', 'Quince', 'Redbud', 'Spruce', 'Tupelo', 'Umbrella', 'Viburnum',
  'Willow', 'Xylosma', 'Yew', 'Zelkova', 'Acacia', 'Basswood', 'Chestnut',
  'Dogbane', 'Ebony', 'Filbert', 'Gumtree', 'Hemlock', 'Inkberry', 'Jacaranda',
  'Kapok', 'Linden', 'Mulberry', 'Nettle', 'Osage', 'Persimmon', 'Quassia',
  'Rowan', 'Sumac', 'Tamarind', 'Ulmus', 'Vervain', 'Walnut', 'Yarrow',
  'Aspen', 'Buckeye', 'Cypress', 'Dewberry', 'Elderberry', 'Fringetree',
  'Goldenrain', 'Hackberry', 'Ilex', 'Jujube', 'Kalmia', 'Laurel', 'Mesquite',
  'Ninebark', 'Oleander', 'Pawpaw', 'Sassafras', 'Teak', 'Viburnifolia', 'Wahoo',
  'Almond', 'Bayberry', 'Camellia', 'Damson', 'Eucalypt', 'Foxglove', 'Gardenia',
  'Hibiscus', 'Indigo', 'Jasmine', 'Kingcup', 'Lantana', 'Marigold', 'Nasturtium',
  'Orchid', 'Peony', 'Quillwort', 'Ragwort', 'Saffron', 'Thistle', 'Umbel',
  'Verbena', 'Wisteria', 'Xeranth', 'Yucca', 'Zinnia', 'Anemone', 'Bluebell',
  'Clover', 'Daffodil', 'Edelweiss', 'Freesia', 'Gentian', 'Heather', 'Iris',
  'Jonquil', 'Kerria', 'Lupine', 'Myrtle', 'Nigella',
];

const wb = XLSX.read(readFileSync(SRC), { type: 'buffer' });
const nameMap = new Map<string, string>();
let poolIdx = 0;

function pseudonymFor(token: string): string {
  const key = token.toLowerCase();
  let v = nameMap.get(key);
  if (!v) {
    v = poolIdx < POOL.length ? POOL[poolIdx] : `Synth${poolIdx + 1}`;
    poolIdx++;
    nameMap.set(key, v);
  }
  return v;
}

let cellsChanged = 0;

for (const sheetName of wb.SheetNames) {
  const sheet = wb.Sheets[sheetName];
  const ref = sheet['!ref'];
  if (!ref) continue;
  const range = XLSX.utils.decode_range(ref);

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell || cell.t !== 's') continue;

      const trimmed = String(cell.v ?? '').trim();
      const tok = nameTokenOf(trimmed);
      if (!tok) continue;

      // Replace only the leading token; keep annotations such as "(Swing T1/T3)".
      const replaced = pseudonymFor(tok);
      const rest = trimmed.slice(tok.length);
      cell.v = replaced + rest;
      if (cell.w) delete cell.w; // drop cached formatted text
      cellsChanged++;
    }
  }
}

writeFileSync(DEST, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

console.log(`source : ${SRC}`);
console.log(`dest   : ${DEST}`);
console.log(`cells rewritten : ${cellsChanged}`);
console.log(`distinct names  : ${nameMap.size}`);
console.log('\nname map (real -> synthetic), review that every left-hand side is a person:');
for (const [k, v] of [...nameMap.entries()].sort()) {
  console.log(`  ${k.padEnd(20)} -> ${v}`);
}

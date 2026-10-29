#!/usr/bin/env node
/* Ladekarten-Tarife: erzeugt data/ladekarten-tarife.json und data/ladekarten-tarife.csv aus der Tarifliste der
   Ampena-App (ladetarife.ts) und prüft sie. Node.js ab 22.13, keine Pakete.

   node tools/export.mjs --git <app-repo> [--ref <zweig>] [--pfad app/src/data/ladetarife.ts]
       liest die Liste aus einem Git-Stand (der Arbeitsordner des App-Repos bleibt unberührt)
   node tools/export.mjs --datei <pfad/zu/ladetarife.ts>
   node tools/export.mjs --pruefen
       prüft nur die Dateien in data/ (ohne App)
   Optionen: --heute JJJJ-MM-TT (Stichtag für Aktionen und Alter, sonst heute), --max-alter-tage 30

   Nicht exportiert werden Zeilen ohne Quelle auf der eigenen Seite des Anbieters und Aktionspreise nach ihrem Ende.
   Jeder andere Prüffehler bricht ab, ohne Dateien zu schreiben. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_DATEI = join(WURZEL, 'data', 'ladekarten-tarife.json');
const CSV_DATEI = join(WURZEL, 'data', 'ladekarten-tarife.csv');
const README = join(WURZEL, 'README.md');
const REPO_URL = 'https://github.com/jonasdannenmaier/ladekarten-tarife';
const NAMENSNENNUNG = `Ladekarten-Tarife (Ampena), ${REPO_URL}, Lizenz: CC BY 4.0`;

/* Eigene Seiten der Anbieter: eine Quelle zählt nur auf dieser Domain (und, wo angegeben, unter diesem Pfad).
   Neuer Anbieter: erst prüfen, dass die Preisseite dem Anbieter selbst gehört, dann hier eintragen. */
const EIGENE_SEITEN = {
  'ACV Ladekarte': { domain: 'acv.de' },
  /* Produktseite der ADAC-Ladekarte, nicht der Tarifvergleich des ADAC */
  'ADAC e-Charge': { domain: 'adac.de', pfad: '/rund-ums-fahrzeug/e-angebote/ladekarte/' },
  Allego: { domain: 'allego.eu' },
  'Aral pulse': { domain: 'aral.de' },
  Electra: { domain: 'go-electra.com' },
  Elli: { domain: 'elli.eco' },
  'EnBW mobility+': { domain: 'enbw.com' },
  'enercity easyGo': { domain: 'enercity.de' },
  'ENTEGA Ladekarte': { domain: 'entega.de' },
  'EWE Go': { domain: 'ewe-go.de' },
  Fastned: { domain: 'fastnedcharging.com' },
  'Hamburger Energiewerke': { domain: 'hamburger-energiewerke.de' },
  IONITY: { domain: 'ionity.eu' },
  Kaufland: { domain: 'kaufland.de' },
  Lidl: { domain: 'lidl.de' },
  'MAINGAU Autostrom': { domain: 'maingau-energie.de' },
  'Mer chargeMe': { domain: 'mer.eco' },
  'SWM Ladekarte': { domain: 'swm.de' },
  'Vattenfall InCharge': { domain: 'vattenfall.de' },
};
/* Vergleichsportale sind nie Quelle */
const VERGLEICHSPORTALE = ['chargeprice.app', 'chargeprice.net', 'goingelectric.de'];

const FELDER = [
  'id', 'anbieter', 'tarif', 'grundgebuehr_eur_monat', 'ac_eur_kwh', 'dc_eur_kwh', 'hpc_eur_kwh', 'preise_gelten_bei',
  'andere_betreiber_ac_eur_kwh', 'andere_betreiber_dc_eur_kwh', 'blockiergebuehr_eur_min', 'blockiergebuehr', 'gueltig_bis',
  'stand', 'quelle_url', 'hinweis',
];
const PFLICHT = ['id', 'anbieter', 'tarif', 'stand', 'quelle_url'];
const ZAHLEN = {
  grundgebuehr_eur_monat: [0, 60],
  ac_eur_kwh: [0.05, 1.5],
  dc_eur_kwh: [0.05, 1.5],
  hpc_eur_kwh: [0.05, 1.5],
  andere_betreiber_ac_eur_kwh: [0.05, 1.5],
  andere_betreiber_dc_eur_kwh: [0.05, 1.5],
  blockiergebuehr_eur_min: [0.01, 1],
};
const TEXTE = ['preise_gelten_bei', 'blockiergebuehr', 'hinweis'];
/* Interne Wörter und Kontaktdaten gehören nicht in die offenen Daten */
const INTERN = /@|\bTafel\b|DATEN-\d|Gründer|Ampena|TODO/i;

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TAG_MS = 864e5;

function abbruch(text) {
  console.error(`Fehler: ${text}`);
  process.exit(1);
}

function argumente(argv) {
  const a = { ref: 'HEAD', pfad: 'app/src/data/ladetarife.ts', heute: new Date().toISOString().slice(0, 10), maxAlter: 30 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const wert = () => argv[++i] ?? abbruch(`${k} braucht einen Wert`);
    if (k === '--git') a.git = wert();
    else if (k === '--ref') a.ref = wert();
    else if (k === '--pfad') a.pfad = wert();
    else if (k === '--datei') a.datei = wert();
    else if (k === '--pruefen') a.pruefen = true;
    else if (k === '--heute') a.heute = wert();
    else if (k === '--max-alter-tage') a.maxAlter = Number(wert());
    else abbruch(`unbekannte Option ${k}`);
  }
  if (!datumOk(a.heute)) abbruch('--heute braucht JJJJ-MM-TT');
  if (!a.pruefen && !a.git && !a.datei) abbruch('--git <app-repo>, --datei <ladetarife.ts> oder --pruefen angeben');
  return a;
}

const datumOk = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const tage = (von, bis) => Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / TAG_MS);

/* „Hamburger Energiewerke“ + „Kombi Smart“ → hamburger-energiewerke-kombi-smart; Wörter des Anbieters vorn im Tarif fallen weg */
const slug = (s) =>
  s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function zeilenId(anbieter, tarif) {
  const a = slug(anbieter).split('-');
  const t = slug(tarif).split('-');
  let i = 0;
  while (i < t.length && a.includes(t[i])) i++;
  return [...a, ...t.slice(i)].join('-');
}

/* Fehlertext, wenn die Quelle keine eigene Seite des Anbieters ist, sonst null */
function quelleFehler(anbieter, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return 'quelle_url ist keine URL';
  }
  if (u.protocol !== 'https:') return 'quelle_url nicht https';
  const host = u.hostname.toLowerCase();
  const passt = (d) => host === d || host.endsWith(`.${d}`);
  if (VERGLEICHSPORTALE.some(passt) || /vergleich/i.test(u.pathname)) return `Vergleichsseite als Quelle (${host})`;
  const eigen = EIGENE_SEITEN[anbieter];
  if (!eigen) return 'Domain des Anbieters nicht hinterlegt (EIGENE_SEITEN in tools/export.mjs)';
  if (!passt(eigen.domain)) return `Quelle ${host} ist nicht die Seite des Anbieters (${eigen.domain})`;
  if (eigen.pfad && !u.pathname.startsWith(eigen.pfad)) return `Quelle liegt nicht unter ${eigen.domain}${eigen.pfad}`;
  return null;
}

/* Eine Zeile aus einem Tarif der App-Liste; interne Felder (id, art) bleiben weg */
function zeileAus(a, t) {
  const block = t.block ?? null;
  const proMin = block ? [...new Set([...block.matchAll(/(\d+,\d+)\s?€\/Min/g)].map((m) => Number(m[1].replace(',', '.'))))] : [];
  return {
    id: zeilenId(a.name, t.name),
    anbieter: a.name,
    tarif: t.name,
    grundgebuehr_eur_monat: t.grund ?? null,
    ac_eur_kwh: t.ac ?? null,
    dc_eur_kwh: t.dc ?? null,
    hpc_eur_kwh: t.hpc ?? null,
    preise_gelten_bei: t.nurBei ?? null,
    andere_betreiber_ac_eur_kwh: t.nurBei ? (t.sonstAc ?? null) : null,
    andere_betreiber_dc_eur_kwh: t.nurBei ? (t.sonstDc ?? null) : null,
    blockiergebuehr_eur_min: proMin.length === 1 ? proMin[0] : null,
    blockiergebuehr: block,
    gueltig_bis: t.bis ?? null,
    stand: t.stand,
    quelle_url: t.quelle,
    hinweis: t.hinweis ?? null,
  };
}

function pruefe(zeilen, heute, maxAlter) {
  const fehler = [];
  const warnungen = [];
  const ids = new Set();
  for (const z of zeilen) {
    const wo = `${z.anbieter ?? '?'} / ${z.tarif ?? '?'}`;
    const f = (m) => fehler.push(`${wo}: ${m}`);
    const fremd = Object.keys(z).filter((k) => !FELDER.includes(k));
    if (fremd.length) f(`unbekannte Felder ${fremd.join(', ')}`);
    for (const k of PFLICHT) if (typeof z[k] !== 'string' || !z[k].trim()) f(`${k} fehlt`);
    if (ids.has(z.id)) f(`id ${z.id} doppelt`);
    ids.add(z.id);
    if (typeof z.id === 'string' && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(z.id)) f(`id ${z.id} ungültig`);
    for (const [k, [min, max]] of Object.entries(ZAHLEN)) {
      const v = z[k];
      if (v == null) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) f(`${k} ist keine Zahl`);
      else if (v < min || v > max) f(`${k} ${v} außerhalb ${min}–${max}`);
    }
    if (z.ac_eur_kwh == null && z.dc_eur_kwh == null && z.hpc_eur_kwh == null) f('kein Preis je kWh');
    if (!z.preise_gelten_bei && (z.andere_betreiber_ac_eur_kwh != null || z.andere_betreiber_dc_eur_kwh != null))
      f('andere_betreiber_* ohne preise_gelten_bei');
    if (z.blockiergebuehr_eur_min != null && !z.blockiergebuehr) f('blockiergebuehr_eur_min ohne Bedingungen');
    if (typeof z.quelle_url === 'string') {
      const q = quelleFehler(z.anbieter, z.quelle_url);
      if (q) f(q);
    }
    if (!datumOk(z.stand)) f('stand ist kein Datum (JJJJ-MM-TT)');
    else if (z.stand > heute) f(`stand ${z.stand} liegt in der Zukunft`);
    else if (tage(z.stand, heute) > maxAlter) warnungen.push(`${wo}: stand ${z.stand} ist ${tage(z.stand, heute)} Tage alt, auf der Anbieterseite prüfen`);
    if (z.gueltig_bis != null) {
      if (!datumOk(z.gueltig_bis)) f('gueltig_bis ist kein Datum (JJJJ-MM-TT)');
      else if (z.gueltig_bis < heute) f(`Aktion endete ${z.gueltig_bis}`);
      else if (tage(heute, z.gueltig_bis) <= 7) warnungen.push(`${wo}: Aktion endet ${z.gueltig_bis}, danach neu prüfen`);
    }
    for (const k of TEXTE) {
      const v = z[k];
      if (v == null) continue;
      if (typeof v !== 'string' || !v.trim()) f(`${k} ist kein Text`);
      else if (/[\r\n]/.test(v)) f(`${k} enthält einen Zeilenumbruch`);
      else if (INTERN.test(v)) f(`${k} enthält ein internes Wort oder Kontaktdaten`);
    }
  }
  return { fehler, warnungen };
}

const zelle = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const alsCsv = (zeilen) => [FELDER.join(','), ...zeilen.map((z) => FELDER.map((k) => zelle(z[k])).join(','))].join('\n') + '\n';

function metadaten(zeilen) {
  const staende = zeilen.map((z) => z.stand).sort();
  return {
    titel: 'Ladekarten-Tarife in Deutschland',
    herausgeber: 'Ampena',
    lizenz: 'CC BY 4.0',
    lizenz_url: 'https://creativecommons.org/licenses/by/4.0/',
    namensnennung: NAMENSNENNUNG,
    stand: staende.at(-1),
    aeltester_stand: staende[0],
    waehrung: 'EUR',
    preise_inkl_mwst: true,
    anzahl_anbieter: new Set(zeilen.map((z) => z.anbieter)).size,
    anzahl_tarife: zeilen.length,
  };
}

const datumDe = (s) => `${Number(s.slice(8))}. ${MONATE[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
const datumEn = (s) => `${Number(s.slice(8))} ${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;

/* Stand und Anzahl im README zwischen <!-- stand-de --> … <!-- /stand-de --> (und -en) passend zu den Daten */
function readmeStand(m) {
  const de = `Stand: ${datumDe(m.stand)}${m.aeltester_stand !== m.stand ? ` (ältester Wert vom ${datumDe(m.aeltester_stand)})` : ''} · ${m.anzahl_tarife} Tarife von ${m.anzahl_anbieter} Anbietern`;
  const en = `As of ${datumEn(m.stand)}${m.aeltester_stand !== m.stand ? ` (oldest value ${datumEn(m.aeltester_stand)})` : ''}: ${m.anzahl_tarife} tariffs from ${m.anzahl_anbieter} providers.`;
  return { de, en };
}
function setzeReadme(text, m) {
  const { de, en } = readmeStand(m);
  return text
    .replace(/<!-- stand-de -->[\s\S]*?<!-- \/stand-de -->/, `<!-- stand-de -->${de}<!-- /stand-de -->`)
    .replace(/<!-- stand-en -->[\s\S]*?<!-- \/stand-en -->/, `<!-- stand-en -->${en}<!-- /stand-en -->`);
}

async function ladeListe(a) {
  const quelltext = a.datei
    ? readFileSync(a.datei, 'utf8')
    : execFileSync('git', ['-C', a.git, 'show', `${a.ref}:${a.pfad}`], { encoding: 'utf8', maxBuffer: 1e7 });
  let mod;
  try {
    const js = stripTypeScriptTypes(quelltext);
    mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  } catch (e) {
    abbruch(`ladetarife.ts lässt sich nicht laden (${e.message}). Die Datei darf nur Typen importieren.`);
  }
  if (!Array.isArray(mod.ANBIETER)) abbruch('ladetarife.ts exportiert kein ANBIETER-Array');
  return mod.ANBIETER;
}

async function exportieren(a) {
  const anbieter = await ladeListe(a);
  const alle = anbieter.flatMap((x) => x.tarife.map((t) => zeileAus(x, t)));
  const zeilen = [];
  const raus = [];
  for (const z of alle) {
    const q = typeof z.quelle_url === 'string' && z.quelle_url ? quelleFehler(z.anbieter, z.quelle_url) : 'keine Quelle';
    if (q) raus.push(`${z.anbieter} / ${z.tarif}: ${q}`);
    else if (datumOk(z.gueltig_bis) && z.gueltig_bis < a.heute) raus.push(`${z.anbieter} / ${z.tarif}: Aktion endete ${z.gueltig_bis}, Preis neu prüfen`);
    else zeilen.push(z);
  }
  zeilen.sort((x, y) => x.anbieter.localeCompare(y.anbieter, 'de', { sensitivity: 'base' }));
  const { fehler, warnungen } = pruefe(zeilen, a.heute, a.maxAlter);
  if (fehler.length) abbruch(`${fehler.length} Prüffehler, nichts geschrieben:\n  ${fehler.join('\n  ')}`);
  const m = metadaten(zeilen);
  writeFileSync(JSON_DATEI, `${JSON.stringify({ ...m, tarife: zeilen }, null, 2)}\n`);
  writeFileSync(CSV_DATEI, alsCsv(zeilen));
  writeFileSync(README, setzeReadme(readFileSync(README, 'utf8'), m));
  console.log(`${zeilen.length} Tarife von ${m.anzahl_anbieter} Anbietern geschrieben (Stand ${m.aeltester_stand} bis ${m.stand}).`);
  if (raus.length) console.log(`Nicht exportiert (${raus.length}):\n  ${raus.join('\n  ')}`);
  if (warnungen.length) console.log(`Hinweise (${warnungen.length}):\n  ${warnungen.join('\n  ')}`);
}

function nurPruefen(a) {
  const daten = JSON.parse(readFileSync(JSON_DATEI, 'utf8'));
  const zeilen = daten.tarife ?? [];
  const { fehler, warnungen } = pruefe(zeilen, a.heute, a.maxAlter);
  const m = metadaten(zeilen);
  for (const [k, v] of Object.entries(m)) if (daten[k] !== v) fehler.push(`JSON-Kopf: ${k} ist ${daten[k]}, erwartet ${v}`);
  if (readFileSync(CSV_DATEI, 'utf8').replace(/\r\n/g, '\n') !== alsCsv(zeilen)) fehler.push('CSV passt nicht zur JSON-Datei');
  const readme = readFileSync(README, 'utf8');
  if (setzeReadme(readme, m) !== readme) fehler.push('Stand oder Anzahl im README passt nicht zu den Daten');
  if (warnungen.length) console.log(`Hinweise (${warnungen.length}):\n  ${warnungen.join('\n  ')}`);
  if (fehler.length) abbruch(`${fehler.length} Prüffehler:\n  ${fehler.join('\n  ')}`);
  console.log(`ok: ${zeilen.length} Tarife von ${m.anzahl_anbieter} Anbietern, Stand ${m.aeltester_stand} bis ${m.stand}.`);
}

const a = argumente(process.argv.slice(2));
if (a.pruefen) nurPruefen(a);
else await exportieren(a);

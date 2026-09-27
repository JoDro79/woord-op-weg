// Zet alle tekstbestanden in /teksten om naar /teksten.json, dat index.html inleest.
//
// Map = categorie:  teksten/Bezinning/  teksten/Geloof/  teksten/Geschiedenis/
// Ondersteund:      .md  .txt  .docx  .html
// Genegeerd:        bestanden die beginnen met _ of .
//
// Titel      front matter "titel"/"title", anders de eerste regel of kop van de tekst
// Datum      front matter "datum"/"date", anders een datum vooraan de bestandsnaam
//            (2026-09-27-mijn-tekst.docx), anders de datum waarop het bestand is geüpload
// Samenvatting  front matter "samenvatting"/"excerpt", anders de eerste zinnen
// Afbeelding    front matter "afbeelding"/"image", anders een plaatje met dezelfde naam
//               ernaast (mijn-tekst.jpg), anders geen afbeelding

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import mammoth from 'mammoth';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BRON = path.join(ROOT, 'teksten');
const DOEL = path.join(ROOT, 'teksten.json');
const CATEGORIEEN = ['Bezinning', 'Geloof', 'Geschiedenis'];
const STANDAARD_CATEGORIE = 'Bezinning';
const AFBEELDING_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const TEKST_EXT = ['.md', '.txt', '.docx', '.html'];

const waarschuwingen = [];

function* wandel(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* wandel(p);
    else yield p;
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kaleTekst = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tekst';
}

function samenvatting(html, max = 180) {
  const t = kaleTekst(html);
  if (t.length <= max) return t;
  const knip = t.slice(0, max);
  const zin = knip.lastIndexOf('. ');
  return (zin > 80 ? knip.slice(0, zin + 1) : knip.slice(0, knip.lastIndexOf(' ')) + '…');
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
function leesDatum(w) {
  if (!w) return null;
  if (w instanceof Date && !isNaN(w)) return w.toISOString().slice(0, 10);
  const s = String(w).trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m && MAANDEN.includes(m[2])) return `${m[3]}-${String(MAANDEN.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function gitDatum(bestand) {
  try {
    const uit = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%cI', '--', bestand],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
    if (uit.length) return uit[uit.length - 1].slice(0, 10);
  } catch {}
  return null;
}

// Haalt de eerste kop of alinea uit de HTML als titel, als er geen titel is opgegeven.
function trekTitelAf(html) {
  const m = html.match(/^\s*<(h[1-3]|p)[^>]*>([\s\S]*?)<\/\1>\s*/i);
  if (!m) return { titel: null, html };
  const titel = kaleTekst(m[2]);
  // Een kop (h1-h3) is altijd een titel. Een gewone alinea alleen als het geen zin is:
  // kort, en niet eindigend op . ! ? : ;  ("Sinds Eden verzamelt de mens bladeren." is tekst)
  const isKop = /^h/i.test(m[1]);
  if (!titel || titel.length > 140) return { titel: null, html };
  if (!isKop && (titel.length > 90 || /[.!?:;…]["'”’)]?$/.test(titel))) return { titel: null, html };
  return { titel, html: html.slice(m[0].length) };
}

function txtNaarHtml(tekst) {
  tekst = tekst.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const heeftWitregels = /\n\s*\n/.test(tekst.trim());
  const blokken = heeftWitregels ? tekst.split(/\n\s*\n/) : tekst.split('\n');
  return blokken.map((b) => b.trim()).filter(Boolean)
    .map((b) => `<p>${esc(b).replace(/\n/g, '<br>')}</p>`).join('\n');
}

async function verwerk(bestand) {
  const ext = path.extname(bestand).toLowerCase();
  const rel = path.relative(ROOT, bestand).split(path.sep).join('/');
  const basis = path.basename(bestand, path.extname(bestand));
  let meta = {}, html = '';

  if (ext === '.md') {
    const g = matter(fs.readFileSync(bestand, 'utf8'));
    meta = g.data; html = marked.parse(g.content);
  } else if (ext === '.html') {
    const g = matter(fs.readFileSync(bestand, 'utf8'));
    meta = g.data; html = g.content.trim();
  } else if (ext === '.txt') {
    html = txtNaarHtml(fs.readFileSync(bestand, 'utf8'));
  } else if (ext === '.docx') {
    const r = await mammoth.convertToHtml({ path: bestand }, {
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Titel'] => h1:fresh",
        "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Citaat'] => blockquote:fresh",
        "p[style-name='Kop 1'] => h2:fresh", "p[style-name='Kop 2'] => h3:fresh"],
    });
    html = r.value;
  }

  let titel = meta.titel || meta.title;
  if (!titel) { const t = trekTitelAf(html); titel = t.titel; html = t.html; }
  if (!titel) {
    // Titel uit de bestandsnaam. Een bijbeltekst als "Lukas 9-62" wordt "Lukas 9:62"
    // (een dubbele punt mag niet in een bestandsnaam).
    titel = basis.replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, '')
      .replace(/^(.*\p{L}\s+\d+)-(\d+(?:-\d+)?)$/u, (_, a, b) => `${a}:${b}`)
      .replace(/_+/g, ' ');
    // "de-vuurtoren" → "De vuurtoren" (alleen als de naam geen spaties heeft)
    if (!/\s/.test(titel)) titel = titel.replace(/-+/g, ' ');
    titel = titel.charAt(0).toUpperCase() + titel.slice(1);
  }

  // Lege bladwijzers uit Word (<a id="_..."></a>) weghalen
  html = html.replace(/<a id="[^"]*"><\/a>/g, '');

  // Koppen in de tekst: h1 → h3 zodat ze niet groter worden dan de titel, in de stijl van de site.
  // Niet in .html-bestanden: die blijven precies zoals ze zijn.
  if (ext !== '.html') html = html.replace(/<h[1-3]([^>]*)>/gi, '<h3 style="font-family:\'Cinzel\',serif;color:var(--navy);margin:2em 0 0.5em;font-size:1.2rem;">')
    .replace(/<\/h[1-3]>/gi, '</h3>');

  const deelMap = rel.split('/')[1];
  let categorie = meta.categorie || meta.category || (rel.split('/').length > 2 ? deelMap : null) || STANDAARD_CATEGORIE;
  const gevonden = CATEGORIEEN.find((c) => c.toLowerCase() === String(categorie).toLowerCase());
  if (!gevonden) { waarschuwingen.push(`${rel}: onbekende categorie "${categorie}", geplaatst onder ${STANDAARD_CATEGORIE}`); }
  categorie = gevonden || STANDAARD_CATEGORIE;

  const datum = leesDatum(meta.datum || meta.date) || leesDatum(basis) || gitDatum(rel)
    || fs.statSync(bestand).mtime.toISOString().slice(0, 10);

  let img = meta.afbeelding || meta.image || '';
  if (!img) {
    const map = path.dirname(bestand);
    const buur = AFBEELDING_EXT.map((e) => basis + e).find((n) => fs.existsSync(path.join(map, n)));
    if (buur) img = path.relative(ROOT, path.join(map, buur)).split(path.sep).join('/');
  }

  return {
    id: meta.id ? String(meta.id) : 'tekst-' + slug(basis.replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, '')),
    titel: String(titel).trim(),
    categorie,
    datum,
    excerpt: String(meta.samenvatting || meta.excerpt || samenvatting(html)).trim(),
    img,
    imgPositie: meta.afbeelding_positie || '',
    auteur: meta.auteur || meta.author || 'Verbius',
    body: html,
    bron: rel,
  };
}

const lijst = [];
if (fs.existsSync(BRON)) {
  for (const f of wandel(BRON)) {
    if (!TEKST_EXT.includes(path.extname(f).toLowerCase())) continue;
    try { lijst.push(await verwerk(f)); }
    catch (e) { waarschuwingen.push(`${path.relative(ROOT, f)}: kon niet worden gelezen (${e.message})`); }
  }
}

// Dubbele id's (zelfde bestandsnaam in twee mappen) uniek maken
const gezien = new Map();
for (const t of lijst) {
  const n = gezien.get(t.id) || 0;
  gezien.set(t.id, n + 1);
  if (n) t.id += '-' + (n + 1);
}

lijst.sort((a, b) => b.datum.localeCompare(a.datum) || a.titel.localeCompare(b.titel));
fs.writeFileSync(DOEL, JSON.stringify({ gegenereerd: new Date().toISOString(), teksten: lijst }, null, 1) + '\n');

console.log(`${lijst.length} tekst(en) geschreven naar teksten.json`);
for (const t of lijst) console.log(`  ${t.datum}  ${t.categorie.padEnd(12)} ${t.titel}  (${t.bron})`);
for (const w of waarschuwingen) console.log(`::warning::${w}`);

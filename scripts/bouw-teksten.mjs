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
//               ernaast (mijn-tekst.jpg), anders de eerste afbeelding in het Word-bestand,
//               anders geen afbeelding (de site toont dan een omslag met de beginletter)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import mammoth from 'mammoth';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BRON = path.join(ROOT, 'teksten');
const DOEL = path.join(ROOT, 'teksten.json');
// Afbeeldingen uit Word-bestanden komen hier terecht (wordt bij elke run opnieuw opgebouwd)
const WORD_BEELDEN = path.join(ROOT, 'images', 'teksten');
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
  const m = html.match(/^\s*<(h[1-3]|p)(?![^>]*class="intro")[^>]*>([\s\S]*?)<\/\1>\s*/i);
  if (!m) return { titel: null, html };
  const titel = kaleTekst(m[2]);
  // Een kop (h1-h3) is altijd een titel. Een gewone alinea alleen als het geen zin is:
  // kort, en niet eindigend op . ! ? : ;  ("Sinds Eden verzamelt de mens bladeren." is tekst)
  const isKop = /^h/i.test(m[1]);
  if (!titel || titel.length > 140) return { titel: null, html };
  if (!isKop && (titel.length > 90 || /[.!?:;…]["'”’)]?$/.test(titel))) return { titel: null, html };
  return { titel, html: html.slice(m[0].length) };
}

// ── Automatische opmaak in de stijl van de site ──
// Alleen voor .docx/.txt/.md (niet voor .html: die blijven zoals ze zijn).
// Uitzetten per tekst met front matter "opmaak: nee".
const STIJL_KOP = "font-family:'Cinzel',serif;color:var(--navy);margin:2em 0 0.5em;font-size:1.2rem;";
const STIJL_INTRO = "font-family:'Cormorant Garamond',serif;font-style:italic;font-size:1.15rem;color:var(--text-light);border-left:3px solid var(--sand);padding-left:1.2rem;margin-bottom:2em;";
const BOEKEN = 'Genesis|Exodus|Leviticus|Numeri|Deuteronomium|Jozua|Richteren|Ruth|Samuël|Samuel|Koningen|Kronieken|Ezra|Nehemia|Esther|Job|Psalm|Psalmen|Spreuken|Prediker|Hooglied|Jesaja|Jeremia|Klaagliederen|Ezechiël|Ezechiel|Daniël|Daniel|Hosea|Joël|Amos|Obadja|Jona|Micha|Nahum|Habakuk|Zefanja|Haggaï|Zacharia|Maleachi|Matteüs|Mattheüs|Matthëus|Mattheus|Marcus|Markus|Lucas|Lukas|Johannes|Handelingen|Romeinen|Korintiërs|Korinthe|Galaten|Efeziërs|Efeze|Filippenzen|Kolossenzen|Tessalonicenzen|Thessalonicenzen|Timoteüs|Timotheüs|Titus|Filemon|Hebreeën|Jakobus|Petrus|Judas|Openbaring|Ef|Rom|Joh|Matt|Mat|Luc|Luk|Mar|Mark|Hand|Hebr|Kor|Gal|Fil|Kol|Openb|Ps|Spr|Jes|Jer|Gen|Ex';
const BIJBELREF = new RegExp(`(?:^|[\\s(—–-])(?:[1-3]\\s?)?(?:${BOEKEN})\\.?\\s+\\d+(?::\\d+(?:\\s?[-–]\\s?\\d+)?)?`, 'u');
const ALLEEN_REF = new RegExp(`^(?:[1-3]\\s?)?(?:${BOEKEN})\\.?\\s+\\d+(?::\\d+(?:\\s?[-–]\\s?\\d+)?)?:?$`, 'u');
const OPEN = `"“„'‘«`, SLUIT = `"”'’»`;

function blokken(html) {
  const uit = [], re = /<(p|h[1-6]|blockquote|ul|ol|table|figure)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m, laatst = 0;
  while ((m = re.exec(html))) {
    if (m.index > laatst && html.slice(laatst, m.index).trim()) uit.push({ tag: 'raw', html: html.slice(laatst, m.index) });
    uit.push({ tag: m[1].toLowerCase(), attrs: m[2] || '', inner: m[3], html: m[0], tekst: kaleTekst(m[3]) });
    laatst = re.lastIndex;
  }
  if (html.slice(laatst).trim()) uit.push({ tag: 'raw', html: html.slice(laatst) });
  return uit;
}

// Eén geheel tussen aanhalingstekens, eventueel gevolgd door een bron: "…" (Johannes 3:16) of "…" — Lucas 9:62
function isCitaat(t) {
  if (!OPEN.includes(t[0]) || t.length > 500) return false;
  const kern = t.replace(/\s*(?:\([^)]*\)|[—–-]\s*[^"”]{2,60})\s*\.?$/, '').trim();
  const eind = kern[kern.length - 1];
  if (!SLUIT.includes(eind) && !(SLUIT.includes(kern[kern.length - 2]) && /[.!?]/.test(eind))) return false;
  // Geen dialoog: binnenin mag het citaat niet sluiten en weer openen ("…," zei hij. "…")
  const binnen = kern.slice(1, -1);
  return !/["”]\s*[,.]?\s+\p{Ll}+[^"“„]*["“„]/u.test(binnen);
}

function isKop(b, volgende) {
  const t = b.tekst;
  if (b.tag !== 'p' || !t || !volgende) return false;
  if (/^\d+[.)]\s+\S/.test(t) && t.length <= 90) return true;          // "1. Hoor het Woord: …"
  if (t.length > 80 || t.split(/\s+/).length > 12) return false;
  if (OPEN.includes(t[0]) || ALLEEN_REF.test(t)) return false;
  if (/[.!?:;,…"”’'»)]$/.test(t)) return false;                          // een zin, geen kop
  if (!/^[\p{Lu}\d]/u.test(t)) return false;
  return volgende.tekst.length > t.length;                               // er volgt echte tekst
}

function verfraai(html, categorie) {
  const bs = blokken(html);
  const inhoud = bs.filter((b) => b.tag !== 'raw');
  let eersteAlinea = true;
  return bs.map((b, i) => {
    if (b.tag === 'raw') return b.html;
    const idx = inhoud.indexOf(b), vorige = inhoud[idx - 1], volgende = inhoud[idx + 1];
    const t = b.tekst;
    if (b.tag === 'p' && /class="intro"/.test(b.attrs)) return `<p style="${STIJL_INTRO}">${b.inner.trim()}</p>`;
    if (b.tag === 'p' && /^(\*\s*){3,}$|^(-\s*){3,}$|^(~\s*){1,3}$|^✦/.test(t)) {
      return '<p class="tekst-scheiding" aria-hidden="true">✦ &nbsp; ✦ &nbsp; ✦</p>';
    }
    if (b.tag === 'p' && idx === 0 && ALLEEN_REF.test(t)) {
      return `<p style="${STIJL_INTRO}">${t.replace(/:$/, '')}</p>`;              // bijbeltekst als opening
    }
    // Bijbelvers met versnummer ("34 Toen zei David…"): citaat, versnummer klein;
    // opeenvolgende verzen komen samen in één citaatblok
    if (b.tag === 'p' && /^\d{1,3}\s+\p{L}/u.test(t) && t.length < 700) {
      // Versnummer klein zetten, ook als Word het vet/cursief maakte: <strong><em>34 </em></strong>
      const vers = b.inner.trim().replace(
        /^((?:<(?:strong|em|b|i)>)*)\s*(\d{1,3})\s*((?:<\/(?:strong|em|b|i)>)*)\s*/,
        (_, open, nr, sluit) => (open.match(/</g) || []).length === (sluit.match(/</g) || []).length
          ? `<sup>${nr}</sup>\u00a0` : `${open}<sup>${nr}</sup>\u00a0`);
      const vorigVers = vorige && vorige.tag === 'p' && /^\d{1,3}\s+\p{L}/u.test(vorige.tekst) && vorige.tekst.length < 700;
      const volgendVers = volgende && volgende.tag === 'p' && /^\d{1,3}\s+\p{L}/u.test(volgende.tekst) && volgende.tekst.length < 700;
      return `${vorigVers ? '' : '<blockquote>'}<p>${vers}</p>${volgendVers ? '' : '</blockquote>'}`;
    }
    if (b.tag === 'p' && isCitaat(t) && (
      (idx === 0) ||
      categorie === 'Geloof' ||                                                // losse citaten in geloofsteksten                                                           // motto bovenaan
      BIJBELREF.test(t) ||                                                     // citaat met bron
      (vorige && (/:$/.test(vorige.tekst) || ALLEEN_REF.test(vorige.tekst))) // aangekondigd citaat
    )) {
      return `<blockquote>${b.inner.trim()}</blockquote>`;
    }
    if (isKop(b, volgende)) return `<h3 style="${STIJL_KOP}">${b.inner.replace(/<\/?strong>/g, '').trim()}</h3>`;
    if (b.tag === 'p' && eersteAlinea && t.length > 60 && !OPEN.includes(t[0])) {
      eersteAlinea = false;
      return `<p class="tekst-begin">${b.inner}</p>`;                       // initiaal
    }
    return b.html;
  }).join('\n');
}

function inleidingTekst(html) {
  const m = html.match(/^\s*<p style="[^"]*border-left:3px solid var\(--sand\)[^"]*">([\s\S]*?)<\/p>/);
  return m && !ALLEEN_REF.test(kaleTekst(m[1])) ? kaleTekst(m[1]) : '';
}

function categorieVoorOpmaak(rel, meta) {
  const c = meta.categorie || meta.category || (rel.split('/').length > 2 ? rel.split('/')[1] : '');
  return CATEGORIEEN.find((x) => x.toLowerCase() === String(c).toLowerCase()) || '';
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
  let meta = {}, html = '', eersteBeeld = '';

  if (ext === '.md') {
    const g = matter(fs.readFileSync(bestand, 'utf8'));
    meta = g.data; html = marked.parse(g.content);
  } else if (ext === '.html') {
    const g = matter(fs.readFileSync(bestand, 'utf8'));
    meta = g.data; html = g.content.trim();
  } else if (ext === '.txt') {
    html = txtNaarHtml(fs.readFileSync(bestand, 'utf8'));
  } else if (ext === '.docx') {
    const sleutel = slug(basis);
    let n = 0;
    const r = await mammoth.convertToHtml({ path: bestand }, {
      convertImage: mammoth.images.imgElement(async (beeld) => {
        const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' })[beeld.contentType] || 'png';
        const naam = `${sleutel}-${++n}.${ext}`;
        fs.mkdirSync(WORD_BEELDEN, { recursive: true });
        fs.writeFileSync(path.join(WORD_BEELDEN, naam), await beeld.read());
        const src = `images/teksten/${naam}`;
        if (!eersteBeeld) eersteBeeld = src;
        return { src };
      }),
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Titel'] => h1:fresh",
        "p[style-name='Quote'] => blockquote:fresh", "p[style-name='Citaat'] => blockquote:fresh",
        "p[style-name='Intense Quote'] => blockquote:fresh", "p[style-name='Duidelijk citaat'] => blockquote:fresh",
        // Word-stijl "Ondertitel" (intern "Subtitle") = de schuingedrukte inleiding bovenaan
        "p[style-name='Subtitle'] => p.intro:fresh", "p[style-name='Ondertitel'] => p.intro:fresh",
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
  html = html.replace(/<p>\s*<\/p>/g, '');

  const inleiding = meta.inleiding || meta.ondertitel || meta.subtitle;
  if (inleiding && ext !== '.html') html = `<p class="intro">${esc(inleiding)}</p>\n` + html;

  if (ext !== '.html' && !/^(nee|no|uit|false)$/i.test(String(meta.opmaak ?? ''))) html = verfraai(html, categorieVoorOpmaak(rel, meta));

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
    // Naamgenoot zoeken, ongevoelig voor hoofdletters en extra spaties
    // ("Be the original .docx" hoort bij "be the original.JPG")
    const norm = (n) => n.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
    const buur = fs.readdirSync(map).find((n) =>
      AFBEELDING_EXT.includes(path.extname(n).toLowerCase()) &&
      norm(path.basename(n, path.extname(n))) === norm(basis));
    if (buur) img = path.relative(ROOT, path.join(map, buur)).split(path.sep).join('/');
  }
  if (!img && eersteBeeld) img = eersteBeeld;

  return {
    id: meta.id ? String(meta.id) : 'tekst-' + slug(basis.replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, '')),
    titel: String(titel).trim(),
    categorie,
    datum,
    // Samenvatting op de kaart: opgegeven, anders de inleiding, anders de eerste zinnen
    excerpt: String(meta.samenvatting || meta.excerpt || inleidingTekst(html) || samenvatting(html.replace(/<p style="[^"]*border-left[^"]*">[\s\S]*?<\/p>/, ''))).trim(),
    img,
    imgPositie: meta.afbeelding_positie || '',
    auteur: meta.auteur || meta.author || 'Verbius',
    body: html,
    bron: rel,
  };
}

fs.rmSync(WORD_BEELDEN, { recursive: true, force: true });
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

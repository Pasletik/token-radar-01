// Token Radar's local gate mirror: the sealed gate's seven rows, checked against a built
// /output directory, plus the dossier byte-equality the scorer demands. Node 22, stdlib only.
//
//   node tests/gate-check.mjs <out-dir> [--snapshot <snapshot.json>]
//
// Exits 0 when every row passes, 1 with the first failure otherwise.
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const snapArg = process.argv.indexOf('--snapshot');
const snapFile = snapArg >= 0 ? process.argv[snapArg + 1] : null;
const snapshot = snapFile ? JSON.parse(readFileSync(snapFile, 'utf8')) : null;

let failures = 0;
function check(name, ok, detail) {
  process.stdout.write(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failures++;
}

const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
function walk(dir, base = '') {
  const files = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = base === '' ? e.name : `${base}/${e.name}`;
    if (e.isDirectory()) files.push(...walk(join(dir, e.name), rel));
    else if (e.isFile()) files.push(rel);
  }
  return files.sort();
}

// --- dashboard_files: index.html + css + js, <=400 files, <=4 MiB, plain names, no network.
{
  const dashDir = join(out, 'dashboard');
  const files = existsSync(dashDir) ? walk(dashDir) : [];
  const bytes = files.reduce((n, f) => n + statSync(join(dashDir, f)).size, 0);
  let issue = null;
  if (!files.includes('index.html')) issue = 'no index.html';
  else if (!files.some((f) => f.endsWith('.css'))) issue = 'no .css file';
  else if (!files.some((f) => f.endsWith('.js'))) issue = 'no .js file';
  else if (files.length > 400) issue = `${files.length} files`;
  else if (bytes > 4_194_304) issue = `${bytes} bytes`;
  else {
    for (const f of files) {
      const base = f.split('/').pop();
      if (!PLAIN_NAME.test(base) || f.split('/').some((part) => part.startsWith('.'))) { issue = `bad name: ${f}`; break; }
      if (/\.(html|css|js|mjs)$/.test(f)) {
        const text = readFileSync(join(dashDir, f), 'utf8');
        const at = text.search(/https?:\/\//);
        if (at >= 0) { issue = `${f} names a network address near "...${text.slice(Math.max(0, at - 30), at + 40)}..."`; break; }
      }
    }
  }
  check('dashboard_files', issue === null, issue ?? `${files.length} files, ${bytes} bytes`);
  const sourceBytes = files.filter((f) => /\.(html|css|js|mjs)$/.test(f)).reduce((n, f) => n + statSync(join(dashDir, f)).size, 0);
  process.stdout.write(`info  dashboard source is ${sourceBytes} bytes (judge reads 65,536)\n`);
  if (sourceBytes > 65_536) { process.stdout.write('warn  dashboard source exceeds the 65,536-byte text the dossier shows whole\n'); }
}

// --- board_file + sorted_by_value + coverage + farm_steps.
let board = null;
{
  const boardPath = join(out, 'board.json');
  let issue = null;
  if (!existsSync(boardPath)) issue = 'no board.json';
  else {
    const size = statSync(boardPath).size;
    if (size > 8 * 1024 * 1024) issue = `${size} bytes`;
    else {
      const parsed = JSON.parse(readFileSync(boardPath, 'utf8'));
      board = Array.isArray(parsed) ? parsed : parsed.rows;
      if (!Array.isArray(board)) issue = 'no rows array';
      else if (board.length < 100 || board.length > 4000) issue = `${board.length} rows`;
      else {
        const seen = new Set();
        const slugs = snapshot ? new Set(snapshot.protocols.map((p) => p.slug)) : null;
        for (const r of board) {
          if (typeof r.slug !== 'string' || /\s/.test(r.slug) || r.slug.length > 128) { issue = `bad slug: ${r.slug}`; break; }
          if (seen.has(r.slug)) { issue = `duplicate slug: ${r.slug}`; break; }
          seen.add(r.slug);
          if (slugs && !slugs.has(r.slug)) { issue = `invented slug: ${r.slug}`; break; }
          if (typeof r.name !== 'string' || r.name.length === 0) { issue = `empty name: ${r.slug}`; break; }
          if (!Number.isSafeInteger(r.rank) || r.rank <= 0) { issue = `bad rank: ${r.slug}`; break; }
          if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) { issue = `bad implied value: ${r.slug}`; break; }
          if (!Array.isArray(r.farm_steps)) { issue = `no farm_steps: ${r.slug}`; break; }
        }
        if (issue === null && board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) {
          issue = 'all rows share one implied value';
        }
      }
    }
  }
  check('board_file', issue === null, issue ?? `${board ? board.length : 0} rows`);
  if (board) {
    const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
    let sorted = ranks.every((r, i) => r === i + 1);
    if (sorted) {
      const byRank = [...board].sort((a, b) => a.rank - b.rank);
      for (let i = 1; i < byRank.length; i++) {
        if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) { sorted = false; break; }
      }
    }
    check('sorted_by_value', sorted, sorted ? `ranks 1..${board.length}, implied non-increasing` : 'ranks or order wrong');
    if (snapshot) {
      const have = new Set(board.map((r) => r.slug));
      const missing = snapshot.watchlist.filter((s) => !have.has(s));
      check('coverage', missing.length === 0, missing.length === 0 ? `all ${snapshot.watchlist.length} watchlist slugs` : `missing: ${missing.slice(0, 5).join(', ')}`);
    } else {
      process.stdout.write('skip  coverage — no snapshot given\n');
    }
    let stepsIssue = null;
    for (const r of board) {
      if (r.farm_steps.length < 3 || r.farm_steps.length > 12) { stepsIssue = `${r.slug} has ${r.farm_steps.length} steps`; break; }
      for (const s of r.farm_steps) {
        if (typeof s !== 'string' || s.trim().length < 20 || s.trim().length > 600) { stepsIssue = `${r.slug} has a step of ${s.trim().length} characters`; break; }
      }
      if (stepsIssue) break;
    }
    check('farm_steps', stepsIssue === null, stepsIssue ?? `${board.length} rows, 3..12 steps each`);
  }
}

// --- screenshots: 3-4 images, <=512 KiB, long side <=1440, short side >=800.
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'PNG' };
}
function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) return null;
    const marker = buf[at + 1];
    const len = buf.readUInt16BE(at + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(at + 5), w: buf.readUInt16BE(at + 7), type: 'JPEG' };
    }
    at += 2 + len;
  }
  return null;
}
{
  const shotsDir = join(out, 'screenshots');
  const names = existsSync(shotsDir) ? readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort() : [];
  let issue = null;
  if (names.length < 3 || names.length > 4) issue = `${names.length} images`;
  else {
    for (const name of names) {
      if (!PLAIN_NAME.test(name)) { issue = `bad name: ${name}`; break; }
      const buf = readFileSync(join(shotsDir, name));
      if (buf.length > 524_288) { issue = `${name} is ${buf.length} bytes`; break; }
      const size = pngSize(buf) ?? jpegSize(buf);
      if (!size) { issue = `${name} is neither a whole PNG nor a JPEG`; break; }
      const long = Math.max(size.w, size.h);
      const short = Math.min(size.w, size.h);
      if (long > 1440 || short < 800) { issue = `${name} is ${size.w}x${size.h}`; break; }
    }
  }
  check('screenshots', issue === null, issue ?? names.map((n) => `${n} (${statSync(join(shotsDir, n)).size} bytes)`).join(', '));
}

// --- dossier_matches: byte for byte what buildDossier writes.
{
  const dossierPath = join(out, 'dossier.json');
  let issue = null;
  if (!existsSync(dossierPath)) issue = 'no dossier.json';
  else {
    try {
      const rebuilt = buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
      const have = readFileSync(dossierPath);
      if (Buffer.compare(Buffer.from(rebuilt), have) !== 0) issue = `dossier.json differs from a rebuild (${have.length} vs ${rebuilt.length} bytes)`;
      else if (have.length > 1_572_864) issue = `dossier is ${have.length} bytes`;
    } catch (err) {
      issue = `buildDossier refuses: ${err.message}`;
    }
  }
  check('dossier_matches', issue === null, issue ?? `${statSync(dossierPath).size} bytes`);
}

process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
// POC: the project registry's two-sided binding and the alias rule. Predictions and verdict: README.md.
//
// Run: node tests/one-offs/thinking/poc-registry-binding/poc.mjs <scratch folder>
//
// The scratch folder must lie outside the repo, ~/claude and ~/.claude. The run makes run-<stamp>/ inside
// it and every write, rename, delete and link goes through `io`, which throws on a path outside that
// folder. Fixtures are synthetic. results.md is written beside this file, with no scratch paths in it.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const WIN = process.platform === 'win32';
const norm = p => (WIN ? path.resolve(p).toLowerCase() : path.resolve(p));
const under = (p, root) => {
  const rel = path.relative(norm(root), norm(p));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

// ---------------------------------------------------------------- the scratch folder and the guard

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node poc.mjs <scratch folder>');
  process.exit(2);
}
const SCRATCH = path.resolve(arg);
for (const f of [REPO, path.join(os.homedir(), 'claude'), path.join(os.homedir(), '.claude')]) {
  if (under(SCRATCH, f) || under(f, SCRATCH)) {
    console.error(`refused: the scratch folder must not be inside, or hold, ${f}`);
    process.exit(2);
  }
}
fs.mkdirSync(SCRATCH, { recursive: true });
const RUN = path.join(SCRATCH, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(RUN); // throws if it exists: a run never reuses a folder

const guard = p => {
  if (!under(p, RUN)) throw new Error(`refused: ${p} is outside the run folder`);
  return p;
};
const ser = o => JSON.stringify(o, null, 2) + '\n';
const io = {
  write(p, text) {
    guard(p);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
  },
  writeJson(p, o) { io.write(p, ser(o)); },
  removeFile(p) {
    guard(p);
    if (!fs.lstatSync(p).isFile()) throw new Error(`refused: ${p} is not a plain file`);
    fs.unlinkSync(p);
  },
  rename(a, b) {
    guard(a); guard(b);
    if (fs.existsSync(b)) throw new Error(`refused: ${b} exists`);
    fs.renameSync(a, b);
  },
  link(target, at) {
    guard(target); guard(at);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(target, at, WIN ? 'junction' : 'dir');
  },
  unlink(at) {
    guard(at);
    if (!fs.lstatSync(at).isSymbolicLink()) throw new Error(`refused: ${at} is not a link`);
    fs.unlinkSync(at); // removes the link only, never its target
  },
  copyDir(a, b) {
    guard(a); guard(b);
    fs.cpSync(a, b, { recursive: true, errorOnExist: true, force: false });
  },
  copyFileIfAbsent(a, b) {
    guard(a); guard(b);
    if (!fs.existsSync(b)) fs.copyFileSync(a, b);
  },
};
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const readable = p => { try { fs.readFileSync(p); return true; } catch { return false; } };
const sha = buf => crypto.createHash('sha1').update(buf).digest('hex');

// ---------------------------------------------------------------- the fixtures (synthetic)

const USER = 'dustin';
const BASE = Date.parse('2026-11-02T22:00:00Z');
const T = n => new Date(BASE + n * 60000).toISOString().replace('.000Z', 'Z');

// Each project has a numeric id (the chosen rule) and a mini id (the 16:34 fallback). CB and DZ share 7.
const SPEC = {
  CB: { name: 'claude-bookmarks', created_at: '2026-11-02T22:00:00Z', minted_on: 'machine-a', num: 7, uid: 'k7mq2x' },
  RK: { name: 'git-repokit-common', created_at: '2026-10-01T10:00:00Z', minted_on: 'machine-a', num: 4, uid: 'r4b8zt' },
  DZ: { name: 'dazzlecmd', created_at: '2026-10-15T09:00:00Z', minted_on: 'machine-b', num: 7, uid: 'd9w3hc' },
  TG: { name: 'tag-tool', created_at: '2026-10-20T12:00:00Z', minted_on: 'machine-b', num: 5, uid: 't5n6pv' },
};
const identity = e => `${e.minted_on}|${e.created_at}|${e.user}`;
// The harness alone knows which project is which; the model never reads WHO or an item's _expect.
const WHO = new Map(Object.entries(SPEC).map(([k, s]) => [`${s.minted_on}|${s.created_at}|${USER}`, k]));
const whoOf = e => WHO.get(identity(e)) ?? '?';

const ENTRY_KEYS = ['version', 'id', 'name', 'user', 'created_at', 'minted_on', 'aliases', 'updated_at', 'stamps',
  'machines', 'sessions', 'position', 'resources'];
const PJ_KEYS = ENTRY_KEYS.filter(k => k !== 'resources');
const WRITE_BACK = ['name', 'sessions', 'position'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));
const folderName = e => `${e.name}__${e.id}__${e.user}`;
const entryPath = (root, e) => path.join(root, 'registry', `${folderName(e)}.json`);

// ---------------------------------------------------------------- the model under test

const projectJsonOf = e => pick(e, PJ_KEYS);
const entryOf = (pj, folder) => pick({ ...pj, resources: { bookmarks: `projects/${folder}` } }, ENTRY_KEYS);

function makeEntry(key, idk, machine, { vault = null, sessions = [], position = 'lean', members } = {}) {
  const s = SPEC[key];
  const e = {
    version: 1, id: s[idk], name: s.name, user: USER, created_at: s.created_at, minted_on: s.minted_on,
    aliases: [], updated_at: s.created_at,
    machines: {
      [machine]: {
        root: `/work/${s.name}`,
        members: members ?? [{ path: `/work/${s.name}`, lists: '_root' }],
        vault, junction_point: vault ? 'bookmarks' : null,
      },
    },
    sessions, position,
  };
  e.resources = { bookmarks: `projects/${folderName(e)}` };
  return pick(e, ENTRY_KEYS);
}

function writeProject(root, e, { projectJson = true, lists, bundles, variant = 'ids' }) {
  const dir = path.join(root, e.resources.bookmarks);
  if (projectJson) io.writeJson(path.join(dir, 'project.json'), projectJsonOf(e));
  for (const [base, items] of Object.entries(lists)) {
    const doc = variant === 'names' ? { version: 3, project: e.name, items } : { version: 3, items };
    io.writeJson(path.join(dir, 'lists', ...base.split('/'), 'lists.json'), doc);
  }
  io.writeJson(path.join(dir, 'bundles', 'index.json'), {
    version: 1, bundles: bundles.map(b => ({ id: b.id, file: b.file, rev: 1, updated: T(0) })),
  });
  for (const b of bundles) {
    io.write(path.join(dir, 'bundles', b.file), `---\ntype: bookmarks-bundle\n---\n# ${b.file}\n\n<!-- bm end: 1 -->\n`);
  }
  io.writeJson(entryPath(root, e), e);
}

// A cross-project reference: by id (the rule) or by name (the variant the rename cost is measured against).
const xref = (variant, key, idk) => (variant === 'names' ? { projectName: SPEC[key].name } : { project: SPEC[key][idk] });
const exp = (who, file) => ({ who, file });

// Machine A: claude-bookmarks (7), linked into its vault, and git-repokit-common (4), which shows CB's bundle.
function buildA(root, { variant = 'ids', projectJson = true, idk = 'num' } = {}) {
  const vault = path.join(root, 'vaults', 'claude-bookmarks', 'private', 'claude');
  fs.mkdirSync(guard(vault), { recursive: true });
  const cb = makeEntry('CB', idk, 'machine-a', {
    vault, position: 'full',
    members: [
      { path: '/work/claude-bookmarks', lists: '_root' },
      { path: '/work/claude-bookmarks/private/claude', lists: 'private/claude' },
    ],
    sessions: [
      { id: '00000000-0000-4000-8000-000000000001', name: 'PROJECT__2026.11.2__Director', role: 'director' },
      { id: '00000000-0000-4000-8000-000000000002', name: 'PROJECT__2026.10.3__worker', role: 'lead worker' },
      { id: '00000000-0000-4000-8000-000000000003', name: 'PROJECT__2026.10.4__oracle', role: 'oracle' },
    ],
  });
  const rk = makeEntry('RK', idk, 'machine-a');
  writeProject(root, cb, {
    projectJson, variant,
    lists: {
      _root: [
        { id: 'i1', text: 'epic 14', bundle: 'b1', _expect: exp('CB', '2026-10-30__epic-14.md') },
        { id: 'i2', text: 'the registry', bundle: 'b2', _expect: exp('CB', '2026-11-02__registry.md') },
      ],
      'private/claude': [{ id: 'i1', text: 'the oracle sweep', bundle: 'b1', _expect: exp('CB', '2026-10-30__epic-14.md') }],
    },
    bundles: [{ id: 'b1', file: '2026-10-30__epic-14.md' }, { id: 'b2', file: '2026-11-02__registry.md' }],
  });
  writeProject(root, rk, {
    projectJson, variant,
    lists: {
      _root: [
        { id: 'i1', text: 'subtree sync', bundle: 'r1', _expect: exp('RK', '2026-10-05__subtree-sync.md') },
        { id: 'i2', text: 'the bookmarks epic, shown here', ...xref(variant, 'CB', idk), bundle: 'b1', _expect: exp('CB', '2026-10-30__epic-14.md') },
      ],
    },
    bundles: [{ id: 'r1', file: '2026-10-05__subtree-sync.md' }],
  });
  io.link(path.join(root, cb.resources.bookmarks), path.join(vault, 'bookmarks'));
  return { cb, rk, vault };
}

// Machine B: dazzlecmd (also 7), tag-tool (5) which shows dazzlecmd's bundles, and a synced copy of repokit (4).
// dazzlecmd has a bundle b1 too, as sequential bundle ids collide across files today.
function buildB(root, { idk = 'num' } = {}) {
  const dz = makeEntry('DZ', idk, 'machine-b');
  const tg = makeEntry('TG', idk, 'machine-b');
  const rk = makeEntry('RK', idk, 'machine-b');
  writeProject(root, dz, {
    lists: { _root: [
      { id: 'i1', text: 'the release', bundle: 'b1', _expect: exp('DZ', '2026-10-16__release.md') },
      { id: 'i2', text: 'kits', bundle: 'd2', _expect: exp('DZ', '2026-10-18__kits.md') },
    ] },
    bundles: [{ id: 'b1', file: '2026-10-16__release.md' }, { id: 'd2', file: '2026-10-18__kits.md' }],
  });
  writeProject(root, tg, {
    lists: { _root: [
      { id: 'i1', text: 'kits, from dazzlecmd', project: SPEC.DZ[idk], bundle: 'd2', _expect: exp('DZ', '2026-10-18__kits.md') },
      { id: 'i2', text: 'the release, from dazzlecmd', project: SPEC.DZ[idk], bundle: 'b1', _expect: exp('DZ', '2026-10-16__release.md') },
      { id: 'i3', text: 'subtree sync, from repokit', project: SPEC.RK[idk], bundle: 'r1', _expect: exp('RK', '2026-10-05__subtree-sync.md') },
      { id: 'i4', text: 'tags', bundle: 't1', _expect: exp('TG', '2026-10-21__tags.md') },
    ] },
    bundles: [{ id: 't1', file: '2026-10-21__tags.md' }],
  });
  writeProject(root, rk, {
    lists: { _root: [{ id: 'i1', text: 'subtree sync', bundle: 'r1', _expect: exp('RK', '2026-10-05__subtree-sync.md') }] },
    bundles: [{ id: 'r1', file: '2026-10-05__subtree-sync.md' }],
  });
  return { dz, tg, rk };
}

function loadRegistry(root) {
  const dir = path.join(root, 'registry');
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ file: path.join(dir, f), e: readJson(path.join(dir, f)) }));
}

function listsFiles(root) {
  const out = [];
  const walk = (dir, folder) => {
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      if (fs.lstatSync(p).isDirectory()) walk(p, folder);
      else if (n === 'lists.json') out.push({ folder, file: p, rel: path.relative(path.join(root, 'projects', folder), p).split(path.sep).join('/') });
    }
  };
  for (const folder of fs.readdirSync(path.join(root, 'projects'))) {
    const lists = path.join(root, 'projects', folder, 'lists');
    if (fs.existsSync(lists)) walk(lists, folder);
  }
  return out;
}

// Resolution modes for a project id: 'canonical-first' (the id, then a bare alias), 'alias-first',
// and 'scoped' (an alias recorded with the machine it came from, matched against the referring project's minted_on).
const aliasId = a => (typeof a === 'object' ? a.id : a);
function findProject(reg, id, referrer, mode) {
  const byAlias = reg.filter(r => r.e.aliases.some(a => aliasId(a) === id));
  if (mode === 'scoped') {
    const s = reg.find(r => r.e.aliases.some(a => typeof a === 'object' && a.id === id && a.on === referrer?.e.minted_on));
    if (s) return s;
  }
  if (mode === 'alias-first' && byAlias.length === 1) return byAlias[0];
  const canon = reg.filter(r => r.e.id === id);
  if (canon.length > 1) return { ambiguous: canon.length };
  if (canon.length === 1) return canon[0];
  if (mode !== 'scoped' && byAlias.length === 1) return byAlias[0];
  return null;
}

function followStub(root, rel) {
  const dir = path.join(root, rel);
  const stub = path.join(dir, 'moved-to.json');
  if (!fs.existsSync(path.join(dir, 'project.json')) && fs.existsSync(stub)) return path.join(root, 'projects', readJson(stub).moved_to);
  return dir;
}

function resolveAll(root, { variant = 'ids', mode = 'canonical-first' } = {}) {
  const reg = loadRegistry(root);
  const rows = [];
  for (const lf of listsFiles(root)) {
    const doc = readJson(lf.file);
    const owner = reg.find(r => r.e.resources.bookmarks === `projects/${lf.folder}`) ?? null;
    for (const item of doc.items) {
      if (!item.bundle) continue;
      const at = `${lf.folder}/${lf.rel}#${item.id}`;
      let target;
      if (variant === 'names') {
        const name = item.projectName ?? doc.project;
        const c = reg.filter(r => r.e.name === name);
        target = c.length === 1 ? c[0] : c.length > 1 ? { ambiguous: c.length } : null;
      } else if (item.project === undefined) target = owner;
      else target = findProject(reg, item.project, owner, mode);
      const row = { at, expected: item._expect, ok: false };
      if (!target) { rows.push({ ...row, reason: 'no project' }); continue; }
      if (target.ambiguous) { rows.push({ ...row, reason: `ambiguous (${target.ambiguous} entries)` }); continue; }
      const pdir = followStub(root, target.e.resources.bookmarks);
      const idxPath = path.join(pdir, 'bundles', 'index.json');
      if (!fs.existsSync(idxPath)) { rows.push({ ...row, reason: 'no project folder' }); continue; }
      const b = readJson(idxPath).bundles.find(x => x.id === item.bundle);
      const got = { who: whoOf(target.e), file: b?.file };
      if (!b) { rows.push({ ...row, got, reason: `no bundle ${item.bundle} in ${got.who}` }); continue; }
      if (!fs.existsSync(path.join(pdir, 'bundles', b.file))) { rows.push({ ...row, got, reason: 'no bundle file' }); continue; }
      const ok = got.who === item._expect.who && got.file === item._expect.file;
      rows.push({ ...row, got, ok, reason: ok ? '' : `wrong project: ${got.who} ${got.file}` });
    }
  }
  return rows;
}

// The rename rule: the entry's name changes, the folder is renamed, project.json mirrors it, a moved-to stub
// is left at the old path. The link is re-pointed by the caller, so the check between the steps can be observed.
function renameProject(root, id, newName, t) {
  const r = loadRegistry(root).find(x => x.e.id === id);
  const oldFolder = folderName(r.e);
  const e = structuredClone(r.e);
  e.name = newName;
  e.updated_at = t;
  const newFolder = folderName(e);
  e.resources.bookmarks = `projects/${newFolder}`;
  io.rename(path.join(root, 'projects', oldFolder), path.join(root, 'projects', newFolder));
  const pj = path.join(root, 'projects', newFolder, 'project.json');
  if (fs.existsSync(pj)) io.writeJson(pj, projectJsonOf(e));
  io.writeJson(entryPath(root, e), e);
  io.removeFile(r.file);
  io.writeJson(path.join(root, 'projects', oldFolder, 'moved-to.json'), { moved_to: newFolder, id });
  return { e, oldFolder, newFolder };
}

function repoint(root, e) {
  let n = 0;
  for (const m of Object.values(e.machines)) {
    if (!m.vault) continue;
    const at = path.join(m.vault, m.junction_point);
    io.unlink(at);
    io.link(path.join(root, e.resources.bookmarks), at);
    n++;
  }
  return n;
}

// The names variant has to rewrite every lists file that names the project.
function rewriteNames(root, oldName, newName) {
  let files = 0;
  for (const lf of listsFiles(root)) {
    const doc = readJson(lf.file);
    let changed = false;
    if (doc.project === oldName) { doc.project = newName; changed = true; }
    for (const it of doc.items) if (it.projectName === oldName) { it.projectName = newName; changed = true; }
    if (changed) { io.writeJson(lf.file, doc); files++; }
  }
  return files;
}

// Rebuild a lost registry entry from the folder's project.json; a folder with neither is an orphan.
function rebuildRegistry(root) {
  const known = new Set(loadRegistry(root).map(r => r.e.resources.bookmarks));
  const rebuilt = [], orphans = [];
  for (const folder of fs.readdirSync(path.join(root, 'projects'))) {
    const dir = path.join(root, 'projects', folder);
    if (known.has(`projects/${folder}`) || fs.existsSync(path.join(dir, 'moved-to.json'))) continue;
    const pjp = path.join(dir, 'project.json');
    if (!fs.existsSync(pjp)) { orphans.push(folder); continue; }
    const e = entryOf(readJson(pjp), folder);
    io.writeJson(entryPath(root, e), e);
    rebuilt.push(folder);
  }
  return { rebuilt, orphans };
}

function rebuildProjectFiles(root) {
  const rebuilt = [];
  for (const r of loadRegistry(root)) {
    const dir = path.join(root, r.e.resources.bookmarks);
    const pjp = path.join(dir, 'project.json');
    if (fs.existsSync(dir) && !fs.existsSync(pjp)) { io.writeJson(pjp, projectJsonOf(r.e)); rebuilt.push(r.e.resources.bookmarks); }
  }
  return rebuilt;
}

// Id assignment on import. 'newcomer': the incoming project is renumbered (the contract's rule).
// 'older-keeps': on a clash the project with the older created_at keeps the id.
function assignIds(local, incoming, rule) {
  const out = new Map();
  for (const e of local) out.set(identity(e), { id: e.id, e });
  const nextId = () => Math.max(...[...out.values()].map(v => v.id), ...incoming.map(e => e.id)) + 1;
  for (const e of [...incoming].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const k = identity(e);
    if (out.has(k)) continue;
    const clash = [...out.values()].find(v => v.id === e.id);
    if (!clash) { out.set(k, { id: e.id, e }); continue; }
    if (rule === 'older-keeps' && e.created_at < clash.e.created_at) {
      const id = nextId();
      clash.id = id;
      out.set(k, { id: e.id, e });
    } else out.set(k, { id: nextId(), e });
  }
  return out;
}

function importInto(root, other, { alias, rewrite, from, t }) {
  const local = loadRegistry(root), inc = loadRegistry(other);
  const ids = assignIds(local.map(r => r.e), inc.map(r => r.e), 'newcomer');
  const localIds = new Set(local.map(r => identity(r.e)));
  const renum = new Map();
  for (const r of inc) if (!localIds.has(identity(r.e)) && ids.get(identity(r.e)).id !== r.e.id) renum.set(r.e.id, ids.get(identity(r.e)).id);
  const stats = { merged: 0, kept: 0, renumbered: 0, rewrites: 0, folderRenames: 0 };
  for (const r of inc) {
    if (localIds.has(identity(r.e))) { stats.merged++; continue; }
    const e = structuredClone(r.e);
    const src = path.join(other, e.resources.bookmarks);
    if (renum.has(e.id)) {
      if (alias !== 'none') e.aliases.push(alias === 'scoped' ? { id: e.id, on: from } : e.id);
      e.id = renum.get(e.id);
      stats.renumbered++;
    } else stats.kept++;
    e.resources.bookmarks = `projects/${folderName(e)}`;
    e.updated_at = t;
    if (path.basename(src) !== folderName(e)) stats.folderRenames++;
    const dst = path.join(root, e.resources.bookmarks);
    io.copyDir(src, dst);
    io.writeJson(path.join(dst, 'project.json'), projectJsonOf(e));
    io.writeJson(entryPath(root, e), e);
    if (rewrite) {
      for (const lf of listsFiles(root).filter(x => x.folder === folderName(e))) {
        const doc = readJson(lf.file);
        let n = 0;
        for (const it of doc.items) if (it.project !== undefined && renum.has(it.project)) { it.project = renum.get(it.project); n++; }
        if (n) { io.writeJson(lf.file, doc); stats.rewrites += n; }
      }
    }
  }
  return stats;
}

// ---------------------------------------------------------------- the instrument: what a step touched

function snapshot(root) {
  const files = new Map(), links = new Map();
  const walk = d => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.lstatSync(p);
      const rel = path.relative(root, p).split(path.sep).join('/');
      if (st.isSymbolicLink()) links.set(rel, path.relative(root, fs.readlinkSync(p).replace(/^\\\\\?\\/, '')).split(path.sep).join('/'));
      else if (st.isDirectory()) walk(p);
      else { const buf = fs.readFileSync(p); files.set(rel, { h: sha(buf), text: buf.toString('utf8') }); }
    }
  };
  walk(root);
  return { files, links };
}

function diff(a, b) {
  let removed = [...a.files.keys()].filter(k => !b.files.has(k));
  let added = [...b.files.keys()].filter(k => !a.files.has(k));
  const edited = [...a.files.keys()].filter(k => b.files.has(k) && a.files.get(k).h !== b.files.get(k).h);
  const folderMoves = new Map();
  for (const r of removed) {
    const [top, proj, ...tail] = r.split('/');
    if (top !== 'projects' || !tail.length) continue;
    for (const x of added) {
      const [t2, p2, ...tail2] = x.split('/');
      if (t2 === 'projects' && p2 !== proj && tail2.join('/') === tail.join('/')) folderMoves.set(`projects/${proj}`, `projects/${p2}`);
    }
  }
  const movedEdited = [];
  for (const [from, to] of folderMoves) {
    for (const r of removed.filter(k => k.startsWith(from + '/'))) {
      const m = to + r.slice(from.length);
      if (!b.files.has(m)) continue;
      if (b.files.get(m).h !== a.files.get(r).h) movedEdited.push(m);
      removed = removed.filter(k => k !== r);
      added = added.filter(k => k !== m);
    }
  }
  let renamed = 0;
  for (const r of [...removed]) {
    const dir = path.posix.dirname(r);
    let idA; try { idA = JSON.parse(a.files.get(r).text).id; } catch { continue; }
    const x = added.find(k => { if (path.posix.dirname(k) !== dir) return false; try { return JSON.parse(b.files.get(k).text).id === idA; } catch { return false; } });
    if (x) { renamed++; removed = removed.filter(k => k !== r); added = added.filter(k => k !== x); }
  }
  const linksRepointed = [...a.links.keys()].filter(k => b.links.get(k) !== a.links.get(k)).length;
  const touched = [...edited, ...movedEdited, ...removed, ...added];
  return {
    folderRenames: folderMoves.size, filesRenamedAndEdited: renamed, filesEdited: edited.length + movedEdited.length,
    filesAdded: added.length, filesRemoved: removed.length, linksRepointed,
    listsFilesTouched: touched.filter(k => k.endsWith('lists.json')).length,
    total: folderMoves.size + renamed + edited.length + movedEdited.length + added.length + removed.length + linksRepointed,
  };
}

// ---------------------------------------------------------------- the arms

const arm = name => { const d = path.join(RUN, name); fs.mkdirSync(d, { recursive: true }); return d; };
const tally = rows => ({
  n: rows.length, ok: rows.filter(r => r.ok).length,
  dangling: rows.filter(r => !r.ok && !r.reason.startsWith('wrong')).length,
  wrong: rows.filter(r => r.reason?.startsWith('wrong')).length,
});
const fails = rows => rows.filter(r => !r.ok).map(r => `${r.at} -> ${r.reason}`);
const R = { arms: [], notes: [] };

// Arm 1: rename, references by id.
{
  const root = arm('arm1-ids');
  buildA(root);
  const before = snapshot(root);
  const base = tally(resolveAll(root));
  const { e } = renameProject(root, SPEC.CB.num, 'bookmarks-plugin', T(1));
  const linkAt = path.join(e.machines['machine-a'].vault, 'bookmarks');
  const linkTargetExists = fs.existsSync(linkAt);
  const linkHasProject = readable(path.join(linkAt, 'project.json'));
  repoint(root, e);
  const linkAfter = readable(path.join(linkAt, 'project.json')) && readJson(path.join(linkAt, 'project.json')).id === e.id;
  const rows = resolveAll(root);
  const stale = fs.existsSync(path.join(followStub(root, 'projects/claude-bookmarks__7__dustin'), 'bundles', 'index.json'));
  const t = tally(rows);
  const cost = diff(before, snapshot(root));
  R.arm1 = { base, t, cost, linkTargetExists, linkHasProject, linkAfter, stale, fails: fails(rows) };
  R.arms.push(['1 rename', '100% resolve', `${t.ok}/${t.n} resolve (baseline ${base.ok}/${base.n}); the vault link shows the project after re-pointing: ${linkAfter}; a stale session's old path reaches the data through the stub: ${stale}`,
    t.ok === t.n && linkAfter ? 'held' : 'FAILED']);
}

// The rename cost, references by name.
{
  const root = arm('arm1-names');
  buildA(root, { variant: 'names' });
  const before = snapshot(root);
  const { e } = renameProject(root, SPEC.CB.num, 'bookmarks-plugin', T(1));
  repoint(root, e);
  const untouched = tally(resolveAll(root, { variant: 'names' }));
  const files = rewriteNames(root, 'claude-bookmarks', 'bookmarks-plugin');
  const t = tally(resolveAll(root, { variant: 'names' }));
  R.names = { untouched, files, t, cost: diff(before, snapshot(root)) };
}

// Arm 2: delete the entry, rebuild it from project.json.
{
  const root = arm('arm2');
  const { cb } = buildA(root);
  const file = entryPath(root, cb);
  const orig = fs.readFileSync(file, 'utf8');
  io.removeFile(file);
  const gone = tally(resolveAll(root));
  const rb = rebuildRegistry(root);
  const now = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const o = JSON.parse(orig), n = now ? JSON.parse(now) : {};
  const wb = WRITE_BACK.every(k => JSON.stringify(o[k]) === JSON.stringify(n[k]));
  const machines = JSON.stringify(o.machines) === JSON.stringify(n.machines);
  const t = tally(resolveAll(root));
  R.arm2 = { gone, rb, wb, machines, whole: orig === now, name: fs.existsSync(file), t };
  R.arms.push(['2 rebuild the entry', 'write-back set and machine paths byte-equal',
    `after the delete ${gone.ok}/${gone.n} resolve; rebuilt ${rb.rebuilt.length}; write-back set equal: ${wb}; machines equal: ${machines}; whole file equal: ${orig === now}; same file name: ${fs.existsSync(file)}; then ${t.ok}/${t.n} resolve`,
    wb && machines && t.ok === t.n ? 'held' : 'FAILED']);
}

// 2b: a hand edit to the entry, not yet mirrored, then the entry lost.
{
  const root = arm('arm2b');
  const { cb } = buildA(root);
  const file = entryPath(root, cb);
  const e = readJson(file);
  e.position = 'lean';
  e.updated_at = T(5);
  io.writeJson(file, e);
  io.removeFile(file);
  rebuildRegistry(root);
  R.arm2b = { kept: readJson(file).position === 'lean' };
}

// Arm 3: delete project.json, rebuild it from the entry.
{
  const root = arm('arm3');
  const { cb } = buildA(root);
  const pjp = path.join(root, cb.resources.bookmarks, 'project.json');
  const orig = fs.readFileSync(pjp, 'utf8');
  io.removeFile(pjp);
  const mid = tally(resolveAll(root));
  const rb = rebuildProjectFiles(root);
  const equal = readable(pjp) && fs.readFileSync(pjp, 'utf8') === orig;
  const t = tally(resolveAll(root));
  R.arm3 = { rb, equal, mid, t };
  R.arms.push(['3 rebuild project.json', 'byte-equal', `rebuilt ${rb.length}; byte-equal: ${equal}; ${t.ok}/${t.n} resolve`, equal && t.ok === t.n ? 'held' : 'FAILED']);
}

// The control: no project.json anywhere; the entry deleted as in arm 2.
{
  const root = arm('control');
  const { cb } = buildA(root, { projectJson: false });
  io.removeFile(entryPath(root, cb));
  const rb = rebuildRegistry(root);
  const t = tally(resolveAll(root));
  const m = /^(.*)__(\d+)__(.*)$/.exec(rb.orphans[0] ?? '');
  R.control = { rb, t, fromName: m ? { name: m[1], id: Number(m[2]), user: m[3] } : null };
  R.arms.push(['control (no project.json)', 'must FAIL: nothing rebuilds the entry',
    `rebuilt ${rb.rebuilt.length}; orphans: ${rb.orphans.join(', ') || 'none'}; ${t.ok}/${t.n} resolve`,
    rb.rebuilt.length === 0 && rb.orphans.length === 1 ? 'failed, as designed' : 'PASSED: the instrument is wrong']);
}

// Arm 4: the colliding import, under four rules for the old id.
const VARIANTS = [
  { key: '4a', label: 'bare alias, canonical first (the rule as written)', idk: 'num', alias: 'bare', rewrite: false, mode: 'canonical-first' },
  { key: '4a2', label: 'bare alias, alias first', idk: 'num', alias: 'bare', rewrite: false, mode: 'alias-first' },
  { key: '4b', label: 'alias scoped to the machine that wrote it', idk: 'num', alias: 'scoped', rewrite: false, mode: 'scoped' },
  { key: '4c', label: 'rewrite references on import', idk: 'num', alias: 'bare', rewrite: true, mode: 'canonical-first' },
  { key: '4d', label: 'mini id (the 16:34 fallback)', idk: 'uid', alias: 'bare', rewrite: false, mode: 'canonical-first' },
];
R.arm4 = [];
for (const v of VARIANTS) {
  const root = path.join(arm(`arm${v.key}`), 'machine-a');
  const other = path.join(RUN, `arm${v.key}`, 'machine-b');
  buildA(root, { idk: v.idk });
  buildB(other, { idk: v.idk });
  const st = importInto(root, other, { alias: v.alias, rewrite: v.rewrite, from: 'machine-b', t: T(30) });
  const old = resolveAll(root, { mode: v.mode });
  // A later write, on machine A, into tag-tool's list (which came from machine B): a reference to claude-bookmarks.
  const tgFolder = loadRegistry(root).find(r => r.e.name === 'tag-tool').e.resources.bookmarks;
  const tgLists = path.join(root, tgFolder, 'lists', '_root', 'lists.json');
  const doc = readJson(tgLists);
  doc.items.push({ id: 'i9', text: 'written on machine A after the import', project: SPEC.CB[v.idk], bundle: 'b1', _expect: exp('CB', '2026-10-30__epic-14.md') });
  io.writeJson(tgLists, doc);
  const all = resolveAll(root, { mode: v.mode });
  const later = all.find(r => r.at.endsWith('#i9'));
  const dzId = loadRegistry(root).find(r => r.e.name === 'dazzlecmd').e.id;
  R.arm4.push({ ...v, st, old: tally(old), oldFails: fails(old), later, dzId });
}
{
  const a = R.arm4[0];
  R.arms.push(['4 colliding import (bare alias, as written)', 'both projects resolve; nothing dangles or misresolves',
    `dazzlecmd renumbered 7 -> ${a.dzId}; ${a.old.ok}/${a.old.n} resolve, ${a.old.dangling} dangle, ${a.old.wrong} resolve to the wrong project; ${a.st.rewrites} references rewritten`,
    a.old.ok === a.old.n ? 'held' : 'FAILED']);
}

// 4s: symmetry of the renumbering, each machine importing the other.
{
  const A = [makeEntry('CB', 'num', 'machine-a'), makeEntry('RK', 'num', 'machine-a')];
  const B = [makeEntry('DZ', 'num', 'machine-b'), makeEntry('TG', 'num', 'machine-b'), makeEntry('RK', 'num', 'machine-b')];
  R.sym = ['newcomer', 'older-keeps'].map(rule => {
    const onA = assignIds(A, B, rule), onB = assignIds(B, A, rule);
    const per = Object.keys(SPEC).map(k => {
      const id = s => [...s.values()].find(v => whoOf(v.e) === k)?.id;
      return { k, a: id(onA), b: id(onB) };
    });
    return { rule, per, agree: per.every(p => p.a === p.b) };
  });
}

// 4f: the registry folder copied file by file (a sync tool), with no import step.
{
  const root = path.join(arm('arm4f'), 'machine-a');
  const other = path.join(RUN, 'arm4f', 'machine-b');
  buildA(root);
  buildB(other);
  for (const f of fs.readdirSync(path.join(other, 'registry'))) io.copyFileIfAbsent(path.join(other, 'registry', f), path.join(root, 'registry', f));
  const reg = loadRegistry(root);
  const sevens = reg.filter(r => r.e.id === 7).length;
  const rows = resolveAll(root);
  R.sync = { entries: reg.length, sevens, t: tally(rows), fails: fails(rows) };
}

// R: reconciling the two copies when each side changed a different write-back field.
{
  const base = makeEntry('CB', 'num', 'machine-a', { position: 'full' });
  const entry = { ...structuredClone(base), name: 'bookmarks-plugin', updated_at: T(10) };
  const pj = { ...projectJsonOf(structuredClone(base)), sessions: [{ id: 's-new', name: 'NEW', role: 'worker' }], updated_at: T(20) };
  const newer = entry.updated_at > pj.updated_at ? entry : pj;
  const whole = Object.fromEntries(WRITE_BACK.map(k => [k, newer[k]]));
  const st0 = Object.fromEntries(WRITE_BACK.map(k => [k, base.updated_at]));
  const es = { ...st0, name: T(10) }, ps = { ...st0, sessions: T(20) };
  const stamped = Object.fromEntries(WRITE_BACK.map(k => [k, es[k] >= ps[k] ? entry[k] : pj[k]]));
  R.recon = {
    whole: { name: whole.name === 'bookmarks-plugin', sessions: whole.sessions.length === 1 },
    stamped: { name: stamped.name === 'bookmarks-plugin', sessions: stamped.sessions.length === 1 },
  };
}

// ---------------------------------------------------------------- the report

const yes = b => (b ? 'kept' : 'LOST');
const c = x => `${x.folderRenames} | ${x.filesRenamedAndEdited} | ${x.filesEdited} | ${x.filesAdded} | ${x.filesRemoved} | ${x.linksRepointed} | ${x.listsFilesTouched} | **${x.total}**`;
const L = [];
L.push('# Results: the project registry\'s two-sided binding and the alias rule', '');
L.push(`Run ${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}, Node ${process.version}, ${process.platform}, the vault link a ${WIN ? 'junction' : 'symlink'}. Written by \`poc.mjs\`; the predictions are in \`README.md\`.`, '');
L.push('## The arms', '', '| Arm | Pass criterion | Observed | Verdict |', '|---|---|---|---|');
for (const a of R.arms) L.push(`| ${a.join(' | ')} |`);
L.push('', '## The rename\'s cost', '', '| References carry | folder renames | files renamed and edited | files edited | files added | files removed | links re-pointed | lists files touched | total |', '|---|---|---|---|---|---|---|---|---|');
L.push(`| ids | ${c(R.arm1.cost)} |`, `| names | ${c(R.names.cost)} |`);
L.push('', `With names, before the lists files are rewritten: ${R.names.untouched.ok}/${R.names.untouched.n} resolve (${R.names.untouched.dangling} dangle); after rewriting ${R.names.files} lists files: ${R.names.t.ok}/${R.names.t.n}.`);
L.push('', `Between the stub and the re-point, the old link's target exists (${R.arm1.linkTargetExists}) but holds no project.json (${!R.arm1.linkHasProject}): the moved-to stub re-creates the old path, so a dangling check that tests only that the target exists passes on a stale link.`);
L.push('', '## Arm 4: the colliding import, by rule', '', '| Rule | renumbered | merged | folders renamed | references rewritten | old references | dangle | wrong project | a later write on machine A | verdict |', '|---|---|---|---|---|---|---|---|---|---|');
for (const v of R.arm4) {
  const later = v.later.ok ? 'resolves' : v.later.reason;
  const verdict = v.old.ok === v.old.n && v.later.ok ? 'held' : v.old.ok === v.old.n ? 'old refs hold; the later write FAILS' : 'FAILED';
  L.push(`| ${v.key} ${v.label} | ${v.st.renumbered} | ${v.st.merged} | ${v.st.folderRenames} | ${v.st.rewrites} | ${v.old.ok}/${v.old.n} | ${v.old.dangling} | ${v.old.wrong} | ${later} | ${verdict} |`);
}
for (const v of R.arm4.filter(x => x.oldFails.length)) L.push('', `${v.key} unresolved:`, ...v.oldFails.map(f => `- \`${f}\``));
L.push('', '## Extra measurements', '');
L.push(`- **2b, stale mirror:** a hand edit of \`position\` in the entry, not yet mirrored, then the entry lost and rebuilt: the edit was ${yes(R.arm2b.kept)}.`);
L.push(`- **R, reconcile with one \`updated_at\` per file:** \`name\` edited in the entry, then \`sessions\` in project.json. The newer file wins: name ${yes(R.recon.whole.name)}, sessions ${yes(R.recon.whole.sessions)}. With a stamp per field: name ${yes(R.recon.stamped.name)}, sessions ${yes(R.recon.stamped.sessions)}.`);
L.push(`- **4s, symmetry:** each machine imports the other's registry.`);
for (const s of R.sym) L.push(`  - ${s.rule}: ${s.per.map(p => `${p.k} A=${p.a} B=${p.b}`).join(', ')} -> ${s.agree ? 'the machines agree' : 'the machines DISAGREE'}`);
L.push(`- **4f, file-level sync:** the other machine's registry files copied in with no import step: ${R.sync.entries} entries, ${R.sync.sevens} with id 7; ${R.sync.t.ok}/${R.sync.t.n} references resolve.${R.sync.fails.length ? ' Unresolved: ' + R.sync.fails.map(f => `\`${f}\``).join('; ') : ''}`);
L.push(`- **The control's folder name** still carries ${R.control.fromName ? Object.keys(R.control.fromName).join(', ') : 'nothing'}; sessions, position, machines, created_at, minted_on and aliases are gone.`);
if (R.arm1.fails.length) L.push('', 'Arm 1 unresolved:', ...R.arm1.fails.map(f => `- \`${f}\``));
const out = L.join('\n') + '\n';
fs.writeFileSync(path.join(HERE, 'results.md'), out);
process.stdout.write(out);

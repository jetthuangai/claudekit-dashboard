#!/usr/bin/env node
/**
 * build-data.mjs — generates data/data.js for ClaudeKit Dashboard.
 *
 * Sources:
 *   - Engineer kit: local .claude/skills/*\/SKILL.md + .claude/agents/*.md
 *   - Marketing kit: private repo claudekit/claudekit-marketing via authenticated `gh` CLI
 *     (raw files cached under scripts/.cache/ so re-runs are offline-free)
 *
 * No npm dependencies (Node >= 18). Run: node scripts/build-data.mjs [--offline]
 *   --offline : never call `gh`; use cache only (fails if cache incomplete)
 *
 * Item ids ({kit}-{type}-{path-slug}) are localStorage keys for favorites/notes/usage.
 * The id scheme is FROZEN — changing it orphans users' saved data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { parseDetail, cleanProse, cleanFlagDesc } from './lib/detail-parser.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'scripts', '.cache');
const VI_CONTENT_PATH = path.join(ROOT, 'scripts', 'vi-content.json');
const VI_DETAILS_PATH = path.join(ROOT, 'scripts', 'vi-details.json');
const OUT_PATH = path.join(ROOT, 'data', 'data.js');
// Published alongside data.js. This is DERIVED metadata (flags, examples, descriptions), not
// the kits' raw source — those stay in .claude/ and scripts/.cache/, both gitignored.
// Not a dot-directory, because GitHub Pages does not serve dot-prefixed paths.
const DETAILS_PATH = path.join(ROOT, 'data', 'details.js');
const MKT_REPO = 'claudekit/claudekit-marketing';
const OFFLINE = process.argv.includes('--offline');

/**
 * Long-form detail per item id (overview, when-to-use, flags, examples), filled as the
 * extractors read each source file. Written to data/details.js and published: it is derived
 * metadata — the flag list and a couple of example invocations, closer to a CLI's --help than
 * to the kits themselves. The raw source files it is derived FROM are never published.
 */
const DETAILS = new Map();

function recordDetail(id, text, description) {
  const detail = parseDetail(text, description);
  if (detail) DETAILS.set(id, detail);
}

/* ---------------------------------------------------------------- *
 * Frontmatter mini-parser
 * Handles: flat `key: value`, quoted strings, [a, b] arrays, and
 * block scalars (>-, >, |, |-) whose continuation lines are joined.
 * Nested maps (deeper-indented `key:` children) are ignored.
 * ---------------------------------------------------------------- */
function parseFrontmatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line); // top-level keys only (no indent)
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (/^[>|]-?$/.test(value)) {
      // block scalar: consume following deeper-indented lines, join with spaces
      const parts = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
        i++;
        if (lines[i].trim() !== '') parts.push(lines[i].trim());
      }
      value = parts.join(' ');
    } else if (value === '') {
      // either empty value or a nested map — skip nested children
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) i++;
    }
    out[key] = unquote(value);
  }
  return out;
}

function unquote(v) {
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) return v.slice(1, -1);
  return v;
}

function parseArray(v) {
  if (!v) return [];
  const inner = /^\[(.*)\]$/.exec(v.trim());
  if (!inner) return v ? [v.trim()] : [];
  return inner[1].split(',').map((s) => unquote(s.trim())).filter(Boolean);
}

/**
 * Fallback when frontmatter yields no description: first plain paragraph of the body.
 * Needed for real upstream files — some /ckm commands have no frontmatter at all, and
 * context-engineering's SKILL.md has a malformed block scalar (key interleaved mid-block).
 */
function bodyIntro(text) {
  const body = text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---/, '');
  let inFence = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```')) { inFence = !inFence; continue; }
    if (inFence || !line || line.startsWith('#') || line.startsWith('|') || line.startsWith('-')) continue;
    return line;
  }
  return '';
}

/** First sentence of a description, cut before markdown/example noise, max ~200 chars. */
function firstSentence(desc) {
  if (!desc) return '';
  let s = desc.split('<example>')[0].replace(/\s+/g, ' ').trim();
  const dot = s.indexOf('. ');
  if (dot > 20) s = s.slice(0, dot + 1);
  if (s.length > 200) s = s.slice(0, 197).trimEnd() + '…';
  return s;
}

/** Diacritic fold for Vietnamese search ("sửa lỗi" -> "sua loi"). */
function foldVi(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* ---------------------------------------------------------------- *
 * Category taxonomies (Vietnamese labels)
 * ---------------------------------------------------------------- */
const ENG_CATEGORIES = [
  { id: 'planning', label: 'Lập kế hoạch', icon: '📐' },
  { id: 'implementation', label: 'Xây dựng tính năng', icon: '🧱' },
  { id: 'review-testing', label: 'Kiểm tra & test', icon: '✅' },
  { id: 'debug', label: 'Sửa lỗi', icon: '🐞' },
  { id: 'devops', label: 'Triển khai (DevOps)', icon: '🚀' },
  { id: 'docs', label: 'Tài liệu', icon: '📚' },
  { id: 'security', label: 'Bảo mật', icon: '🔒' },
  { id: 'media', label: 'Hình ảnh & media', icon: '🎬' },
  { id: 'ui-design', label: 'Giao diện & thiết kế', icon: '🎨' },
  { id: 'research', label: 'Nghiên cứu', icon: '🔍' },
  { id: 'integrations', label: 'Tích hợp & công cụ AI', icon: '🧩' },
  { id: 'database', label: 'Cơ sở dữ liệu', icon: '🗄️' },
  { id: 'utilities', label: 'Tiện ích', icon: '🧰' },
];

const MKT_CATEGORIES = [
  { id: 'content', label: 'Nội dung', icon: '✍️' },
  { id: 'seo', label: 'SEO', icon: '🔎' },
  { id: 'acquisition', label: 'Quảng cáo & tăng trưởng', icon: '📈' },
  { id: 'conversion', label: 'Chuyển đổi (CRO)', icon: '🎯' },
  { id: 'performance', label: 'Đo lường & phân tích', icon: '📊' },
  { id: 'strategy', label: 'Chiến lược & campaign', icon: '🧭' },
  { id: 'design', label: 'Thiết kế & media', icon: '🎨' },
  { id: 'tools', label: 'Công cụ chung (dev)', icon: '🧰' },
];

const KHAC = { id: 'khac', label: 'Khác', icon: '✨' };

// Engineer skill dir -> category (authoritative for the 84 shipped skills).
const ENG_SKILL_CATEGORY = {
  bootstrap: 'planning', 'ck-plan': 'planning', 'ck-predict': 'planning', 'ck-scenario': 'planning',
  brainstorm: 'planning', 'problem-solving': 'planning',
  cook: 'implementation', 'backend-development': 'implementation', 'frontend-development': 'implementation',
  'mobile-development': 'implementation', 'web-frameworks': 'implementation', tanstack: 'implementation',
  'react-best-practices': 'implementation', 'better-auth': 'implementation', copywriting: 'implementation',
  agentize: 'implementation',
  'ck-code-review': 'review-testing', test: 'review-testing', 'web-testing': 'review-testing',
  'review-pr': 'review-testing', 'ck-loop': 'review-testing',
  'ck-debug': 'debug', fix: 'debug', 'ck-autoresearch': 'debug', 'sequential-thinking': 'debug',
  deploy: 'devops', devops: 'devops', ship: 'devops', git: 'devops', worktree: 'devops', ghpm: 'devops',
  docs: 'docs', 'docs-seeker': 'docs', journal: 'docs', llms: 'docs', 'markdown-novel-viewer': 'docs',
  mintlify: 'docs', 'ck-graphify': 'docs', retro: 'docs', watzup: 'docs',
  'ck-security': 'security', 'security-scan': 'security', 'cti-expert': 'security', gkg: 'security',
  'ai-artist': 'media', 'media-processing': 'media', design: 'media', 'html-video': 'media',
  remotion: 'media', preview: 'media', shader: 'media', excalidraw: 'media', 'mermaidjs-v11': 'media',
  stitch: 'media', threejs: 'media',
  'ui-ux-pro-max': 'ui-design', 'ui-styling': 'ui-design', 'frontend-design': 'ui-design',
  'web-design-guidelines': 'ui-design', 'show-off': 'ui-design',
  research: 'research', ask: 'research', scout: 'research', repomix: 'research', xia: 'research',
  'mcp-builder': 'integrations', 'use-mcp': 'integrations', 'google-adk-python': 'integrations',
  'chrome-profile': 'integrations', 'agent-browser': 'integrations', 'ai-multimodal': 'integrations',
  'payment-integration': 'integrations', shopify: 'integrations', 'context-engineering': 'integrations',
  databases: 'database',
  'coding-level': 'utilities', 'find-skills': 'utilities', 'skill-creator': 'utilities', team: 'utilities',
  'project-management': 'utilities', 'project-organization': 'utilities', 'plans-kanban': 'utilities',
  'tech-graph': 'utilities', vibe: 'utilities',
};

const ENG_AGENT_CATEGORY = {
  researcher: 'research', planner: 'planning', 'code-reviewer': 'review-testing',
  'fullstack-developer': 'implementation', debugger: 'debug', tester: 'review-testing',
  'git-manager': 'devops', 'code-simplifier': 'review-testing', brainstormer: 'planning',
  'journal-writer': 'docs', 'docs-manager': 'docs', 'project-manager': 'utilities',
  'ui-ux-designer': 'ui-design',
};

// The marketing kit bundles generic dev-workflow tools (cook, fix, git, plan, docs...) —
// they get their own "tools" category instead of polluting marketing domains.
const MKT_TOOLS = new Set([
  'ask', 'better-auth', 'ckm-storage', 'code-review', 'code-reviewer', 'context-engineering',
  'cook', 'debugging', 'docs', 'docs-manager', 'docs-seeker', 'fix', 'frontend-development',
  'fullstack-developer', 'git', 'git-manager', 'google-adk-python', 'init', 'journal',
  'kanban', 'kit-builder', 'markdown-novel-viewer', 'mcp-management', 'mcp-manager',
  'payment-integration', 'plan', 'preview', 'problem-solving', 'project-manager', 'repomix',
  'sequential-thinking', 'shopify', 'skill-creator', 'storage', 'template-skill', 'test',
  'use-mcp', 'watzup', 'web-frameworks', 'worktree',
]);
const MKT_TOOLS_RE = /^(docs|plan|skill|storage|test)([:\-]|$)/; // nested dev commands: docs:init, plan:*, skill:*...

// Marketing categorization: first matching rule wins (specific before generic).
const MKT_RULES = [
  ['seo', /\bseo\b|competitor|keyword|backlink|positioning|programmatic|alternativ/],
  ['strategy', /campaign|^play([:\-]|$)|strateg|launch|psycholog|ab-test|split|experiment|research|persona|market-|planning|brainstorm|idea|scout/],
  ['design', /design|ui-ux|banner|artist|visual|logo|thumbnail|video|multimodal|elevenlabs|remotion|shader|threejs/],
  ['performance', /analytic|kpi|attribution|metric|dashboard|report|tracking|data/],
  ['acquisition', /paid|\bads?\b|affiliate|acquisition|lead|outreach|growth|referral|viral|attraction|social/],
  ['conversion', /\bcro\b|conversion|onboarding|pricing|funnel|landing|form|upsell|retention|email|sale|qualifier|continuity/],
  ['content', /content|copywrit|blog|creativ|community|brand|storytell|newsletter|\bwrite\b|writer|wizard|hub|media/],
];

function mktCategory(rawName, desc) {
  const raw = rawName.toLowerCase();
  if (MKT_TOOLS.has(raw) || MKT_TOOLS_RE.test(raw)) return 'tools';
  const hay = `${raw} ${desc}`.toLowerCase();
  for (const [cat, re] of MKT_RULES) if (re.test(hay)) return cat;
  return 'khac';
}

/* ---------------------------------------------------------------- *
 * Engineer kit (local filesystem)
 * ---------------------------------------------------------------- */
const ENG_SKILL_EXCLUDE = new Set(['.venv', 'common', '_shared', 'document-skills']);

function extractEngineer() {
  const items = [];
  const skillsDir = path.join(ROOT, '.claude', 'skills');
  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !ENG_SKILL_EXCLUDE.has(d.name))
    .map((d) => d.name)
    .sort();
  for (const dir of dirs) {
    const skillPath = path.join(skillsDir, dir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;
    const text = fs.readFileSync(skillPath, 'utf8');
    const fm = parseFrontmatter(text);
    const hint = fm['argument-hint'] || '';
    const id = `eng-skill-${slugify(dir)}`;
    items.push({
      id,
      name: `/ck:${dir}`,
      rawName: dir,
      type: 'skill',
      category: ENG_SKILL_CATEGORY[dir] || 'khac',
      userInvocable: fm['user-invocable'] !== 'false',
      descEn: firstSentence(fm.description) || firstSentence(bodyIntro(text)),
      example: `/ck:${dir}${hint ? ' ' + hint : ''}`,
      keywords: parseArray(fm.keywords),
    });
    recordDetail(id, text, fm.description);
  }
  const agentsDir = path.join(ROOT, '.claude', 'agents');
  const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort();
  for (const file of agentFiles) {
    const base = file.replace(/\.md$/, '');
    const text = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const fm = parseFrontmatter(text);
    const id = `eng-agent-${slugify(base)}`;
    items.push({
      id,
      name: fm.name || base,
      rawName: base,
      type: 'agent',
      category: ENG_AGENT_CATEGORY[base] || 'khac',
      userInvocable: true,
      descEn: firstSentence(fm.description) || firstSentence(bodyIntro(text)),
      example: '',
      keywords: parseArray(fm.keywords),
    });
    recordDetail(id, text, fm.description);
  }
  return items;
}

/* ---------------------------------------------------------------- *
 * Marketing kit (gh api + cache)
 * ---------------------------------------------------------------- */
function cachePathFor(repoPath) {
  return path.join(CACHE_DIR, repoPath.replace(/[\\/:]/g, '__'));
}

async function gh(args, opts = {}) {
  // GitHub occasionally returns transient 5xx — retry with backoff before failing the build
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { stdout } = await execFileAsync('gh', args, { maxBuffer: 64 * 1024 * 1024, ...opts });
      return stdout;
    } catch (err) {
      lastErr = err;
      const transient = /HTTP 5\d\d|timeout|ECONNRESET|ETIMEDOUT/i.test(String(err.stderr || err.message));
      if (!transient || attempt === 3) break;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw lastErr;
}

async function fetchRaw(repoPath) {
  const cached = cachePathFor(repoPath);
  if (fs.existsSync(cached)) return fs.readFileSync(cached, 'utf8');
  if (OFFLINE) throw new Error(`--offline but cache miss: ${repoPath}`);
  const raw = await gh(['api', '-H', 'Accept: application/vnd.github.raw',
    `repos/${MKT_REPO}/contents/${repoPath}`]);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cached, raw, 'utf8');
  return raw;
}

/** Small promise pool so ~230 first-run fetches don't run serially or all at once. */
async function mapPool(list, limit, fn) {
  const results = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next++;
      results[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return results;
}

async function extractMarketing() {
  const treeCache = path.join(CACHE_DIR, '__tree.json');
  let treeJson;
  if (fs.existsSync(treeCache)) {
    treeJson = fs.readFileSync(treeCache, 'utf8');
  } else {
    if (OFFLINE) throw new Error('--offline but tree cache missing');
    treeJson = await gh(['api', `repos/${MKT_REPO}/git/trees/main?recursive=1`]);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(treeCache, treeJson, 'utf8');
  }
  const tree = JSON.parse(treeJson);
  if (tree.truncated) {
    throw new Error('git tree response is truncated — recursive listing incomplete; aborting');
  }
  const paths = tree.tree.filter((e) => e.type === 'blob').map((e) => e.path);

  const skillPaths = paths.filter((p) => /^(claude|\.agent)\/skills\/[^/]+\/SKILL\.md$/.test(p)).sort();
  const agentPaths = paths.filter((p) => /^claude\/agents\/[^/]+\.md$/.test(p)).sort();
  const commandPaths = paths.filter((p) => /^claude\/commands\/ckm\/.*\.md$/.test(p)).sort();

  const items = [];

  // Skills — dedupe by dir name; claude/skills/ wins over .agent/skills/ (deterministic).
  const skillByName = new Map();
  const skillTexts = await mapPool(skillPaths, 6, async (p) => [p, await fetchRaw(p)]);
  for (const [p, text] of skillTexts) {
    const dir = p.split('/').slice(-2, -1)[0];
    const fromClaude = p.startsWith('claude/');
    if (skillByName.has(dir) && !fromClaude) continue; // .agent duplicate loses
    if (skillByName.has(dir) && fromClaude && skillByName.get(dir).fromClaude) continue;
    skillByName.set(dir, { p, text, fromClaude, dir });
  }
  for (const { text, dir } of [...skillByName.values()].sort((a, b) => a.dir.localeCompare(b.dir))) {
    const fm = parseFrontmatter(text);
    const fmName = fm.name || dir;
    const hasPrefix = fmName.includes(':');
    const desc = firstSentence(fm.description) || firstSentence(bodyIntro(text));
    const id = `mkt-skill-${slugify(dir)}`;
    items.push({
      id,
      name: hasPrefix ? `/${fmName}` : fmName,
      rawName: dir,
      type: 'skill',
      category: mktCategory(dir, desc),
      userInvocable: fm['user-invocable'] !== 'false',
      descEn: desc,
      example: hasPrefix ? `/${fmName}${fm['argument-hint'] ? ' ' + fm['argument-hint'] : ''}` : '',
      keywords: parseArray(fm.keywords),
    });
    recordDetail(id, text, fm.description);
  }

  // Agents
  const agentTexts = await mapPool(agentPaths, 6, async (p) => [p, await fetchRaw(p)]);
  for (const [p, text] of agentTexts) {
    const base = p.split('/').pop().replace(/\.md$/, '');
    const fm = parseFrontmatter(text);
    const desc = firstSentence(fm.description) || firstSentence(bodyIntro(text));
    const id = `mkt-agent-${slugify(base)}`;
    items.push({
      id,
      name: fm.name || base,
      rawName: base,
      type: 'agent',
      category: mktCategory(base, desc),
      userInvocable: true,
      descEn: desc,
      example: '',
      keywords: [],
    });
    recordDetail(id, text, fm.description);
  }

  // Commands — id from FULL path slug (58 nested subcommands collide on basename).
  const cmdTexts = await mapPool(commandPaths, 6, async (p) => [p, await fetchRaw(p)]);
  for (const [p, text] of cmdTexts) {
    const rel = p.replace(/^claude\/commands\/ckm\//, '').replace(/\.md$/, '');
    const segments = rel.split('/');
    const fm = parseFrontmatter(text);
    const desc = firstSentence(fm.description) || firstSentence(bodyIntro(text));
    const rawName = segments.join(':');
    const id = `mkt-cmd-${slugify(segments.join('-'))}`;
    items.push({
      id,
      name: `/ckm:${rawName}`,
      rawName,
      type: 'command',
      category: mktCategory(rawName, desc),
      userInvocable: true,
      descEn: desc,
      example: `/ckm:${rawName}${fm['argument-hint'] ? ' ' + fm['argument-hint'] : ''}`,
      keywords: [],
    });
    recordDetail(id, text, fm.description);
  }

  return items;
}

/* ---------------------------------------------------------------- *
 * Assembly: VN merge, searchFold, related, stats, validation
 * ---------------------------------------------------------------- */
function finishKit(items, viContent, categoriesDef, warnings) {
  for (const it of items) {
    const vi = viContent[it.id] || {};
    it.descVi = vi.descVi || '';
    it.whenToUseVi = vi.whenToUseVi || '';
    if (!it.descVi) warnings.missingVi.push(`${it.id} :: ${it.descEn.slice(0, 80)}`);
    if (!it.descEn) warnings.emptyDescEn.push(it.id);
    it.searchFold = foldVi([it.name, it.rawName, it.descVi, it.descEn, ...it.keywords].join(' '));
  }
  // related: same category, ranked by keyword overlap then name
  for (const it of items) {
    const peers = items.filter((o) => o !== it && o.category === it.category);
    const score = (o) => o.keywords.filter((k) => it.keywords.includes(k)).length;
    it.related = peers
      .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
      .slice(0, 3)
      .map((o) => o.id);
  }
  items.sort((a, b) => a.id.localeCompare(b.id));
  const used = new Set(items.map((i) => i.category));
  const categories = categoriesDef.filter((c) => used.has(c.id));
  if (used.has('khac')) categories.push(KHAC);
  const stats = {
    skills: items.filter((i) => i.type === 'skill').length,
    agents: items.filter((i) => i.type === 'agent').length,
    commands: items.filter((i) => i.type === 'command').length,
  };
  return { categories, stats, items };
}

async function main() {
  const viContent = fs.existsSync(VI_CONTENT_PATH)
    ? JSON.parse(fs.readFileSync(VI_CONTENT_PATH, 'utf8'))
    : {};
  const warnings = { missingVi: [], emptyDescEn: [] };

  const engItems = extractEngineer();
  const mktItems = await extractMarketing();

  const engineer = { label: 'Engineer', icon: '🛠️', ...finishKit(engItems, viContent, ENG_CATEGORIES, warnings) };
  const marketing = { label: 'Marketing', icon: '📣', ...finishKit(mktItems, viContent, MKT_CATEGORIES, warnings) };

  // Validations (fail build — see phase-01 plan)
  const allIds = [...engineer.items, ...marketing.items].map((i) => i.id);
  const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
  if (dupes.length) throw new Error(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);
  if (warnings.emptyDescEn.length) {
    throw new Error(`empty descEn (parser regression?): ${warnings.emptyDescEn.join(', ')}`);
  }
  // Scenario refs must point at real items (favorites/notes UX breaks on dead refs)
  const scenariosPath = path.join(ROOT, 'data', 'scenarios.js');
  if (fs.existsSync(scenariosPath)) {
    const idSet = new Set(allIds);
    const src = fs.readFileSync(scenariosPath, 'utf8');
    const badRefs = [...src.matchAll(/ref:\s*'([^']+)'/g)]
      .map((m) => m[1])
      .filter((ref) => !idSet.has(ref));
    if (badRefs.length) throw new Error(`scenarios.js refs not in CK_DATA: ${badRefs.join(', ')}`);
  }

  // Ordering the map by id keeps details.js stable across runs (no spurious diff).
  const details = {};
  for (const id of [...DETAILS.keys()].sort()) details[id] = DETAILS.get(id);

  /* Vietnamese overlay. The extractors pull English out of the source files; scripts/vi-details.json
     carries the translation, keyed by the SAME ids. Applying it here means the UI never has to know
     two languages exist — details.js simply ships Vietnamese. Anything without a translation keeps
     its English text rather than going blank. Command lines are keyed by their exact original string,
     so a bare `/ck:ship beta` (nothing to translate) is absent from the map and passes through. */
  const viDetails = fs.existsSync(VI_DETAILS_PATH)
    ? JSON.parse(fs.readFileSync(VI_DETAILS_PATH, 'utf8'))
    : {};
  const viStats = { overview: 0, whenToUse: 0, flags: 0, examples: 0 };
  for (const [id, vi] of Object.entries(viDetails)) {
    const d = details[id];
    if (!d) throw new Error(`vi-details.json has an id absent from the extracted set: ${id}`);
    // cleanProse again on the way in: a translator working from the raw English carries the
    // source's artefacts (literal "\n", a dangling "Examples:") straight into the Vietnamese.
    if (vi.overview) { d.overview = cleanProse(vi.overview); viStats.overview++; }
    if (vi.whenToUse) { d.whenToUse = cleanProse(vi.whenToUse); viStats.whenToUse++; }
    if (vi.flags) {
      d.flags = d.flags.map((f) =>
        vi.flags[f.flag] ? { ...f, desc: cleanFlagDesc(vi.flags[f.flag]) } : f
      );
      viStats.flags++;
    }
    if (vi.examples) {
      d.examples = d.examples.map((e) => vi.examples[e] || e);
      viStats.examples++;
    }
  }

  const withFlags = Object.values(details).filter((d) => d.flags.length).length;
  const withExamples = Object.values(details).filter((d) => d.examples.length).length;
  const withWhen = Object.values(details).filter((d) => d.whenToUse).length;

  /* Every detail field needs BOTH a floor and a purity check, and the floors must run before
     anything is written — otherwise a failed build leaves a fresh data.js beside a stale
     details.js and the modal quietly serves yesterday's content.

     A count of "items that got SOME detail" is worthless here: it stayed green at 305/306 while
     the when-to-use extractor was returning nothing for 73 of 74 files, because `overview` alone
     satisfied it. A purity check alone is just as blind — silently dropping every agent's
     examples produces zero impurities. Both bugs shipped. Hence: floors, per field.
     Set well under the observed corpus (74 / 29 / 101) to catch a regression, not normal drift. */
  const floors = [
    ['whenToUse', withWhen, 50, 74],
    ['flags', withFlags, 20, 29],
    ['examples', withExamples, 90, 101],
  ];
  for (const [field, actual, floor, observed] of floors) {
    if (actual < floor) {
      throw new Error(
        `${field} populated for only ${actual} items (floor ${floor}, corpus has ~${observed}) — parser regression`
      );
    }
  }

  /* Examples must be a runnable command or the user's own words — never the dialogue
     scaffolding around them. We once rendered "</example>" with a copy button next to it. */
  const dialogue = /assistant:|<commentary>|<\/?example>/i;
  const polluted = Object.entries(details)
    .flatMap(([id, d]) => d.examples.filter((e) => dialogue.test(e)).map((e) => `${id} :: ${e.slice(0, 60)}`));
  if (polluted.length) {
    throw new Error(`examples contain dialogue markup (${polluted.length}):\n  ` + polluted.slice(0, 5).join('\n  '));
  }

  /* Nothing may reach the UI still carrying the source's escaping or a heading whose body was
     stripped. Both shipped once, and the Vietnamese overlay reintroduced them because the
     translators worked from the unclean English. */
  const LITERAL_NEWLINE = String.fromCharCode(92) + 'n';
  const artefacts = [];
  for (const [id, d] of Object.entries(details)) {
    const fields = [d.overview, d.whenToUse, ...d.flags.map((f) => f.desc), ...d.examples];
    for (const f of fields) {
      if (f.includes(LITERAL_NEWLINE)) artefacts.push(`${id} :: literal newline :: ${f.slice(0, 50)}`);
      if (/(?:Examples?|Ví dụ)\s*:\s*$/i.test(f)) artefacts.push(`${id} :: dangling heading :: ${f.slice(-40)}`);
      if (/^(?:"[^"]*"|'[^']*'|\d+)\)\s*:/.test(f)) artefacts.push(`${id} :: stale default :: ${f.slice(0, 50)}`);
    }
  }
  if (artefacts.length) {
    throw new Error(`extraction artefacts reached the output (${artefacts.length}):\n  ` + artefacts.slice(0, 6).join('\n  '));
  }

  /* Vietnamese is the whole point of this dashboard. If the overlay stops applying, fail loudly
     rather than quietly shipping an English UI. */
  if (viStats.overview < 250) {
    throw new Error(`Vietnamese overlay applied to only ${viStats.overview} overviews (expected ~300) — is scripts/vi-details.json stale?`);
  }

  const data = {
    generatedAt: new Date().toISOString().slice(0, 10),
    kits: { engineer, marketing },
  };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(
    OUT_PATH,
    '// GENERATED by scripts/build-data.mjs — do not edit by hand\n' +
      'window.CK_DATA = ' + JSON.stringify(data, null, 2) + ';\n',
    'utf8'
  );

  fs.mkdirSync(path.dirname(DETAILS_PATH), { recursive: true });
  fs.writeFileSync(
    DETAILS_PATH,
    '// GENERATED by scripts/build-data.mjs — do not edit by hand.\n' +
      '// Derived metadata (flags, examples, descriptions). The raw kit files it comes from\n' +
      '// (.claude/, scripts/.cache/) are gitignored and never published.\n' +
      'window.CK_DETAILS = ' + JSON.stringify(details, null, 2) + ';\n',
    'utf8'
  );

  console.log(`engineer : ${JSON.stringify(engineer.stats)}`);
  console.log(`marketing: ${JSON.stringify(marketing.stats)}`);
  console.log(`written  : ${path.relative(ROOT, OUT_PATH)}`);
  console.log(
    `details  : ${path.relative(ROOT, DETAILS_PATH)} — ${Object.keys(details).length}/${allIds.length} items` +
      ` (${withWhen} when-to-use, ${withFlags} flags, ${withExamples} examples)`
  );
  if (warnings.missingVi.length) {
    console.log(`\n[warn] ${warnings.missingVi.length} items missing Vietnamese content`);
    fs.writeFileSync(path.join(ROOT, 'scripts', '.cache', 'missing-vi.txt'),
      warnings.missingVi.join('\n'), 'utf8');
    console.log('list written to scripts/.cache/missing-vi.txt — fill scripts/vi-content.json (phase-02)');
  }
}

main().catch((err) => {
  console.error('[build-data] FAILED:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * build-data.mjs — generates data/data.js + data/details.js for the AgentKit Dashboard.
 *
 * Source (since the AgentKit rebrand, 2026-07): the local `ak kit` build output for BOTH kits.
 *   Produce it with:
 *     ak kit init engineer  --build-only --out ../ak-kit-build --target claude-code --yes --no-interactive
 *     ak kit init marketing --build-only --out ../ak-kit-build --target claude-code --yes --no-interactive
 *   Both kits now share one shape: <kit>/skills/<ak-name>/SKILL.md + <kit>/agents/<name>.md.
 *   Override the base dir with AK_KIT_SRC (default: ../ak-kit-build relative to repo root).
 *   The raw kit files are the paid product — kept OUT of git; only the derived data is published.
 *
 * No npm dependencies (Node >= 18). Run: node scripts/build-data.mjs
 *   BUILD_BOOTSTRAP=1 : skip corpus-size / scenarios / Vietnamese floors so a first pass on a
 *                       freshly changed kit can emit English output to translate from. Ship WITHOUT it.
 *
 * Item ids ({kit}-{type}-{path-slug}) are localStorage keys for favorites/notes/usage.
 * The id scheme is FROZEN — changing it orphans users' saved data. The leading `ak-` on every
 * skill dir is stripped before slugifying, so ids stay stable across the ck→ak rename for every
 * skill that kept its base name (e.g. ak-cook -> eng-skill-cook).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDetail, cleanProse, cleanFlagDesc } from './lib/detail-parser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KIT_SRC = process.env.AK_KIT_SRC || path.join(ROOT, '..', 'ak-kit-build');
const VI_CONTENT_PATH = path.join(ROOT, 'scripts', 'vi-content.json');
const VI_DETAILS_PATH = path.join(ROOT, 'scripts', 'vi-details.json');
const OUT_PATH = path.join(ROOT, 'data', 'data.js');
// Published alongside data.js. DERIVED metadata (flags, examples, descriptions), not raw kit source.
// Not a dot-directory, because GitHub Pages does not serve dot-prefixed paths.
const DETAILS_PATH = path.join(ROOT, 'data', 'details.js');
const BOOTSTRAP = process.env.BUILD_BOOTSTRAP === '1';

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

/** Strip the uniform `ak-` kit prefix so ids stay stable across the ck→ak rename. */
function baseName(dir) {
  return dir.replace(/^ak-/, '');
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

// Engineer skill base-name -> category. Includes ck→ak renames (plan, debug, code-review, …)
// alongside the base names that survived the rebrand unchanged.
const ENG_SKILL_CATEGORY = {
  bootstrap: 'planning', plan: 'planning', predict: 'planning', scenario: 'planning',
  brainstorm: 'planning', 'problem-solving': 'planning',
  cook: 'implementation', 'backend-development': 'implementation', 'frontend-development': 'implementation',
  'mobile-development': 'implementation', 'web-frameworks': 'implementation', tanstack: 'implementation',
  'react-best-practices': 'implementation', 'better-auth': 'implementation', copywriting: 'implementation',
  agentize: 'implementation',
  'code-review': 'review-testing', test: 'review-testing', 'web-testing': 'review-testing',
  'review-pr': 'review-testing', loop: 'review-testing',
  debug: 'debug', fix: 'debug', autoresearch: 'debug', 'sequential-thinking': 'debug',
  deploy: 'devops', devops: 'devops', ship: 'devops', git: 'devops', worktree: 'devops', ghpm: 'devops',
  docs: 'docs', 'docs-seeker': 'docs', journal: 'docs', llms: 'docs', 'markdown-novel-viewer': 'docs',
  mintlify: 'docs', graphify: 'docs', retro: 'docs', watzup: 'docs',
  security: 'security', 'security-scan': 'security', 'cti-expert': 'security', gkg: 'security',
  'ai-artist': 'media', 'media-processing': 'media', design: 'media', 'html-video': 'media',
  remotion: 'media', preview: 'media', shader: 'media', excalidraw: 'media', 'mermaidjs-v11': 'media',
  stitch: 'media', threejs: 'media',
  'ui-ux-pro-max': 'ui-design', 'ui-styling': 'ui-design', 'frontend-design': 'ui-design',
  'web-design-guidelines': 'ui-design', 'show-off': 'ui-design',
  research: 'research', ask: 'research', scout: 'research', repomix: 'research', xia: 'research',
  advise: 'research', agentkit: 'utilities',
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
  'ui-ux-designer': 'ui-design', advisor: 'research',
};

// Generic dev-workflow tools bundled into the marketing kit get their own "tools" bucket
// instead of polluting the marketing domains.
const MKT_TOOLS = new Set([
  'ask', 'better-auth', 'code-review', 'code-reviewer', 'context-engineering',
  'cook', 'debug', 'docs', 'docs-manager', 'docs-seeker', 'fix', 'frontend-development',
  'fullstack-developer', 'git', 'git-manager', 'google-adk-python', 'init', 'journal',
  'kanban', 'kit-builder', 'markdown-novel-viewer', 'mcp-management', 'mcp-manager',
  'payment-integration', 'plan', 'preview', 'problem-solving', 'project-manager', 'repomix',
  'sequential-thinking', 'shopify', 'skill-creator', 'storage', 'template-skill', 'test',
  'use-mcp', 'watzup', 'web-frameworks', 'worktree', 'agent-browser', 'agentkit',
  'ai-multimodal', 'chrome-profile', 'scout', 'advise', 'brainstorm', 'agentize',
]);
const MKT_TOOLS_RE = /^(docs|plan|skill|storage|test)([:\-]|$)/;

// Marketing categorization: first matching rule wins (specific before generic).
const MKT_RULES = [
  ['seo', /\bseo\b|competitor|keyword|backlink|positioning|programmatic|alternativ/],
  ['strategy', /campaign|^play([:\-]|$)|strateg|launch|psycholog|ab-test|split|experiment|research|persona|market-|planning|brainstorm|idea|scout/],
  ['design', /design|ui-ux|banner|artist|visual|logo|thumbnail|video|multimodal|elevenlabs|remotion|shader|threejs/],
  ['performance', /analytic|analyze|kpi|attribution|metric|dashboard|report|tracking|data/],
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
 * Local kit extraction (both kits share one on-disk shape)
 * ---------------------------------------------------------------- */
const SKILL_EXCLUDE = new Set(['.venv', 'common', '_shared', 'document-skills']);

function extractKit({ kitDir, idPrefix, skillCategory, agentCategory }) {
  const items = [];

  const skillsDir = path.join(kitDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !SKILL_EXCLUDE.has(d.name))
      .map((d) => d.name)
      .sort();
    for (const dir of dirs) {
      const skillPath = path.join(skillsDir, dir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) continue;
      const text = fs.readFileSync(skillPath, 'utf8');
      const fm = parseFrontmatter(text);
      const base = baseName(dir);
      const id = `${idPrefix}-skill-${slugify(base)}`;
      const fmName = fm.name || `ak:${base}`;
      const display = fmName.includes(':') ? `/${fmName}` : `/ak:${base}`;
      const hint = fm['argument-hint'] || '';
      const desc = firstSentence(fm.description) || firstSentence(bodyIntro(text));
      items.push({
        id,
        name: display,
        rawName: base,
        type: 'skill',
        category: skillCategory(base, desc),
        userInvocable: fm['user-invocable'] !== 'false',
        descEn: desc,
        example: `${display}${hint ? ' ' + hint : ''}`,
        keywords: parseArray(fm.keywords),
      });
      recordDetail(id, text, fm.description);
    }
  }

  const agentsDir = path.join(kitDir, 'agents');
  if (fs.existsSync(agentsDir)) {
    const agentFiles = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).sort();
    for (const file of agentFiles) {
      const base = file.replace(/\.md$/, '');
      const text = fs.readFileSync(path.join(agentsDir, file), 'utf8');
      const fm = parseFrontmatter(text);
      const id = `${idPrefix}-agent-${slugify(base)}`;
      const desc = firstSentence(fm.description) || firstSentence(bodyIntro(text));
      items.push({
        id,
        name: fm.name || base,
        rawName: base,
        type: 'agent',
        category: agentCategory(base, desc),
        userInvocable: true,
        descEn: desc,
        example: '',
        keywords: parseArray(fm.keywords),
      });
      recordDetail(id, text, fm.description);
    }
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

function main() {
  if (!fs.existsSync(KIT_SRC)) {
    throw new Error(`kit source not found: ${KIT_SRC}\n  Build it first with \`ak kit init <kit> --build-only --out ${KIT_SRC} --target claude-code\` (set AK_KIT_SRC to override).`);
  }
  const viContent = fs.existsSync(VI_CONTENT_PATH)
    ? JSON.parse(fs.readFileSync(VI_CONTENT_PATH, 'utf8'))
    : {};
  const warnings = { missingVi: [], emptyDescEn: [] };

  const engItems = extractKit({
    kitDir: path.join(KIT_SRC, 'ak-engineer'),
    idPrefix: 'eng',
    skillCategory: (base) => ENG_SKILL_CATEGORY[base] || 'khac',
    agentCategory: (base) => ENG_AGENT_CATEGORY[base] || 'khac',
  });
  const mktItems = extractKit({
    kitDir: path.join(KIT_SRC, 'ak-marketing'),
    idPrefix: 'mkt',
    skillCategory: (base, desc) => mktCategory(base, desc),
    agentCategory: (base, desc) => mktCategory(base, desc),
  });

  const engineer = { label: 'Engineer', icon: '🛠️', ...finishKit(engItems, viContent, ENG_CATEGORIES, warnings) };
  const marketing = { label: 'Marketing', icon: '📣', ...finishKit(mktItems, viContent, MKT_CATEGORIES, warnings) };

  const allIds = [...engineer.items, ...marketing.items].map((i) => i.id);
  const dupes = allIds.filter((id, i) => allIds.indexOf(id) !== i);
  if (dupes.length) throw new Error(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);
  if (warnings.emptyDescEn.length) {
    throw new Error(`empty descEn (parser regression?): ${warnings.emptyDescEn.join(', ')}`);
  }

  // Scenario refs must point at real items (favorites/notes UX breaks on dead refs).
  const scenariosPath = path.join(ROOT, 'data', 'scenarios.js');
  if (fs.existsSync(scenariosPath)) {
    const idSet = new Set(allIds);
    const src = fs.readFileSync(scenariosPath, 'utf8');
    const badRefs = [...src.matchAll(/ref:\s*'([^']+)'/g)]
      .map((m) => m[1])
      .filter((ref) => !idSet.has(ref));
    if (badRefs.length) {
      if (BOOTSTRAP) console.log(`[bootstrap] scenarios.js dead refs (fix before shipping): ${badRefs.join(', ')}`);
      else throw new Error(`scenarios.js refs not in CK_DATA: ${badRefs.join(', ')}`);
    }
  }

  // Ordering the map by id keeps details.js stable across runs (no spurious diff).
  const details = {};
  for (const id of [...DETAILS.keys()].sort()) details[id] = DETAILS.get(id);

  /* Vietnamese overlay, keyed by the SAME ids. A translation whose id no longer exists in the
     extracted set is pruned with a warning (a kit rename legitimately drops ids); a MISSING
     translation is the real concern and is caught by missingVi + the overview floor below. */
  const viDetails = fs.existsSync(VI_DETAILS_PATH)
    ? JSON.parse(fs.readFileSync(VI_DETAILS_PATH, 'utf8'))
    : {};
  const staleViDetails = [];
  const viStats = { overview: 0, whenToUse: 0, flags: 0, examples: 0 };
  for (const [id, vi] of Object.entries(viDetails)) {
    const d = details[id];
    if (!d) { staleViDetails.push(id); continue; }
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
  if (staleViDetails.length) {
    console.log(`[warn] ${staleViDetails.length} vi-details.json ids no longer in the kit (pruned): ${staleViDetails.slice(0, 8).join(', ')}${staleViDetails.length > 8 ? ' …' : ''}`);
  }

  const withFlags = Object.values(details).filter((d) => d.flags.length).length;
  const withExamples = Object.values(details).filter((d) => d.examples.length).length;
  const withWhen = Object.values(details).filter((d) => d.whenToUse).length;

  /* Corpus-size floors catch a parser regression (extraction silently returning nothing).
     Skipped under BUILD_BOOTSTRAP because a freshly changed kit legitimately shifts the counts;
     recalibrate the floors to the new corpus, then ship without the flag. */
  if (!BOOTSTRAP) {
    const floors = [
      ['whenToUse', withWhen, 45],
      ['flags', withFlags, 15],
      ['examples', withExamples, 50],
    ];
    for (const [field, actual, floor] of floors) {
      if (actual < floor) {
        throw new Error(`${field} populated for only ${actual} items (floor ${floor}) — parser regression`);
      }
    }
  }

  /* Purity checks — always on (correctness, not corpus size). */
  const dialogue = /assistant:|<commentary>|<\/?example>/i;
  const polluted = Object.entries(details)
    .flatMap(([id, d]) => d.examples.filter((e) => dialogue.test(e)).map((e) => `${id} :: ${e.slice(0, 60)}`));
  if (polluted.length) {
    throw new Error(`examples contain dialogue markup (${polluted.length}):\n  ` + polluted.slice(0, 5).join('\n  '));
  }

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
     rather than quietly shipping an English UI. Floor = 70% of items with details. */
  if (!BOOTSTRAP) {
    const floor = Math.floor(Object.keys(details).length * 0.7);
    if (viStats.overview < floor) {
      throw new Error(`Vietnamese overlay applied to only ${viStats.overview} overviews (floor ${floor} = 70% of ${Object.keys(details).length}) — is scripts/vi-details.json stale?`);
    }
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
      '// (the ak kit build output) are kept out of git and never published.\n' +
      'window.CK_DETAILS = ' + JSON.stringify(details, null, 2) + ';\n',
    'utf8'
  );

  console.log(`engineer : ${JSON.stringify(engineer.stats)}`);
  console.log(`marketing: ${JSON.stringify(marketing.stats)}`);
  console.log(`written  : ${path.relative(ROOT, OUT_PATH)}`);
  console.log(
    `details  : ${path.relative(ROOT, DETAILS_PATH)} — ${Object.keys(details).length}/${allIds.length} items` +
      ` (${withWhen} when-to-use, ${withFlags} flags, ${withExamples} examples; vi overview ${viStats.overview})`
  );
  if (warnings.missingVi.length) {
    console.log(`\n[warn] ${warnings.missingVi.length} items missing Vietnamese content`);
    fs.writeFileSync(path.join(ROOT, 'scripts', 'missing-vi.txt'),
      warnings.missingVi.join('\n'), 'utf8');
    console.log('list written to scripts/missing-vi.txt — fill scripts/vi-content.json');
  }
}

try {
  main();
} catch (err) {
  console.error('[build-data] FAILED:', err.message);
  process.exit(1);
}

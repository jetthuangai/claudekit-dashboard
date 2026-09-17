/**
 * detail-parser.mjs — pulls the long-form detail out of one skill/agent/command markdown file.
 *
 * Everything returned here is EXTRACTED, never invented: if a file documents no flags,
 * `flags` comes back empty and the UI hides the section. build-data.mjs writes the result to
 * scripts/.cache/details.js — outside the publish tree, because this is paid-kit documentation.
 *
 * Surveyed against the real corpus (engineer SKILL.md + the cached marketing files):
 *   - only 10 of 84 engineer skills have a "## Usage" heading -> not a usable anchor
 *   - 74 files have "## When to Use"
 *   - 29 items document flags, in exactly two shapes: `- \`--x\`: desc` and `| \`--x\` | desc |`
 *   - agent descriptions carry <example> blocks whose `user:` line is a real-world case
 */

const MAX_OVERVIEW = 1200;
const MAX_FLAG_DESC = 220;
const MAX_EXAMPLES = 6;

/** Absolute filesystem paths that a fenced block may contain; never a slash command. */
const FS_PATH = /^\/(usr|home|etc|var|opt|tmp|bin|sbin|lib|mnt|media|root|proc|sys|dev|srv|boot|run|users)(\/|$)/i;

/** A cell holding nothing but reference filenames — a docs-routing table, not a flag description. */
const FILE_LIST = /^[\w./-]+\.md(\s*,\s*[\w./-]+\.md)*$/i;

/**
 * An earlier parser mistook the colon inside `(default: "a,b")` for the description separator and
 * left the tail — `"a,b"): Capture ratios` — as the description. Translations were made from that,
 * so the fragment survives in the Vietnamese overlay even now the parser is fixed. Deliberately
 * narrow: only a quoted string or a number followed by `):`, never arbitrary prose.
 */
const STALE_DEFAULT = /^(?:"[^"]*"|'[^']*'|\d+)\)\s*:\s*/;

/** Trailing heading whose body was stripped with the <example> blocks — in either language. */
const DANGLING_EXAMPLES = /\s*(?:Examples?|Ví dụ)\s*:\s*$/i;

/** Strip inline markdown emphasis/backticks that would render as literal noise. */
function clean(s) {
  return (s || '')
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(s, max) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

function stripFrontmatter(text) {
  return text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---/, '');
}

/**
 * Normalise a block of prose from the frontmatter.
 *
 * The frontmatter stores newlines as the two characters `\` + `n`, which are NOT whitespace —
 * so collapsing whitespace leaves them behind and the UI renders a literal "\n". Unescape before
 * cleaning. Stripping the <example> blocks also tends to leave a dangling "Examples:" heading
 * with nothing under it; drop that too.
 *
 * Exported because the Vietnamese overlay needs the exact same treatment: a translator working
 * from the raw text will faithfully carry the artefacts across.
 */
export function cleanProse(s) {
  if (!s) return '';
  const text = s
    .replace(/\\n/g, '\n')
    .replace(/<example>[\s\S]*?<\/example>/g, ' ')
    .replace(/<\/?(example|commentary)>/g, ' ');
  return truncate(clean(text).replace(DANGLING_EXAMPLES, '').trim(), MAX_OVERVIEW);
}

/** Flag description, with the stale `(default: …)` fragment removed. See STALE_DEFAULT. */
export function cleanFlagDesc(s) {
  return clean((s || '').replace(STALE_DEFAULT, ''));
}

/**
 * Full description minus the <example> blocks (those become `examples` instead).
 * build-data.mjs keeps only the first sentence for the card; the modal wants the rest.
 */
export function parseOverview(description) {
  return cleanProse(description);
}

/**
 * Body of a "## When to Use" section (any heading depth), up to the next heading.
 *
 * Walks lines rather than matching one big regex: the obvious
 * /^#{2,4}\s+When to Use[^\n]*\n([\s\S]*?)(?=\n#{1,4}\s|\n*$)/im
 * is a trap — with /m the `$` matches at every line end, so `\n*$` (with `\n*` matching
 * zero newlines) succeeds immediately and the lazy body captures nothing.
 */
export function parseWhenToUse(text) {
  const lines = stripFrontmatter(text).split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{2,4}\s+When\s+to\s+Use\b/i.test(l));
  if (start === -1) return '';

  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,4}\s/.test(lines[i])) break; // next heading ends the section
    const t = lines[i].trim();
    if (!t || t.startsWith('```') || t.startsWith('|')) continue;
    out.push(t.replace(/^[-*]\s+/, ''));
  }
  return truncate(clean(out.join(' ')), MAX_OVERVIEW);
}

/**
 * Join a list item with its wrapped continuation lines.
 *
 * Kit authors hard-wrap prose at ~80 columns, so a flag bullet routinely spans several lines:
 *
 *     - `--advice`: Run under `kongming` advisory supervision (see Advisory
 *       supervision)
 *
 * A line-anchored regex sees only the first line and emits a description cut mid-sentence.
 * A continuation is an indented, non-empty line that starts no new block: another list item,
 * a heading, a table row, or a fence all end the item. Fenced blocks are passed through
 * untouched so indented code never folds into prose.
 */
function unfoldListItems(body) {
  const out = [];
  let inFence = false;
  let open = false; // currently accumulating a list item in out[out.length - 1]

  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      open = false;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^\s*[-*]\s/.test(line)) {
      open = true;
      out.push(line);
      continue;
    }
    if (open && /^\s+\S/.test(line) && !/^\s*[#|>]/.test(line)) {
      out[out.length - 1] += ' ' + line.trim();
      continue;
    }
    open = false;
    out.push(line);
  }
  return out.join('\n');
}

/**
 * Flags in the two shapes the corpus actually uses. First mention of a flag wins;
 * a flag with no description attached is dropped (a bare `--json` mention teaches nothing).
 */
export function parseFlags(text) {
  const body = unfoldListItems(stripFrontmatter(text));
  const found = new Map();

  /* Between the flag and its separator there may be a parenthetical — `*(default)*`, and worse,
     `(default: "a,b,c")`, whose colon would otherwise be mistaken for the separator and leave the
     description as `"a,b,c"): Capture ratios`. So skip whole (...) groups instead of scanning for
     the first colon. */
  const bullet = /^\s*[-*]\s*`?(--[a-z][\w-]*)`?((?:[^:(\n]|\([^)\n]*\)){0,40}?)[:—–-]\s+(.+)$/gim;
  const table = /^\s*\|\s*`?(--[a-z][\w-]*)`?\s*\|\s*([^|\n]+?)\s*\|/gim;

  for (const [re, descGroup] of [[bullet, 3], [table, 2]]) {
    let m;
    while ((m = re.exec(body)) !== null) {
      const flag = m[1];
      const desc = clean(m[descGroup]);
      // A cell listing only reference files is a "which docs does this flag load" table, not a
      // description of what the flag DOES. preview's 3-column nav table matched here otherwise.
      if (!desc || found.has(flag) || FILE_LIST.test(desc)) continue;
      // Kits keep notes on withdrawn flags ("`--x` — cut from v1 scope"); the flag does not exist.
      if (/^(cut|removed|dropped) from\b/i.test(desc)) continue;
      found.set(flag, truncate(desc, MAX_FLAG_DESC));
    }
  }
  return [...found.entries()].map(([flag, desc]) => ({ flag, desc }));
}

/**
 * Runnable command lines, in priority order:
 *   1. `user:` lines inside <example> blocks (a real scenario, phrased the way a user would)
 *   2. slash-command lines inside fenced code blocks
 * Placeholder-only signatures (`/ck:cook <task>`) are skipped — the card already shows that.
 */
/**
 * The user's turn inside one <example> block.
 *
 * Cannot be done with a quote-delimited regex: agent frontmatter is a YAML single-quoted
 * scalar, so the whole block folds onto one line with NO double quotes and with '' escapes.
 * A `["“]?([^"”\n]+)` capture therefore swallows the assistant turn and the closing tag,
 * and we would render `</example>` to the user as a runnable command. Cut on structure instead.
 */
function userTurn(block) {
  // The frontmatter carries "\n" as two literal characters, so the char before `user:` is the
  // word char `n` and a \b anchor can never match. Unescape first — otherwise BOTH the `user:`
  // and `assistant:` boundaries fail, and the assistant turn leaks back into the examples.
  const b = block.replace(/\\n/g, '\n');
  const at = /\buser:/i.exec(b);
  if (!at) return '';
  let s = b.slice(at.index + at[0].length);
  const end = s.search(/\bassistant:|<commentary>|<\/example>|<example>/i);
  if (end !== -1) s = s.slice(0, end);
  return s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”]+/, '')
    .replace(/["'“”]+$/, '')
    .replace(/''/g, "'") // YAML doubles the apostrophe inside single-quoted scalars
    .trim();
}

export function parseExamples(text, description) {
  const out = [];
  const seen = new Set();

  const push = (s) => {
    const v = clean(s);
    if (!v || seen.has(v) || out.length >= MAX_EXAMPLES) return;
    seen.add(v);
    out.push(v);
  };

  // Older kits folded the <example> blocks into the agent `description`; since ak 2.16 they sit
  // in the agent body instead. Read both so either layout keeps its examples.
  const body = stripFrontmatter(text);
  for (const source of [description || '', body]) {
    const blocks = source.match(/<example>[\s\S]*?<\/example>/g) || [];
    for (const b of blocks) push(userTurn(b));
  }

  const fences = body.match(/```[\s\S]*?```/g) || [];
  for (const fence of fences) {
    for (const raw of fence.split(/\r?\n/)) {
      const line = raw.trim();
      if (!/^\/[a-z][\w:-]*/i.test(line)) continue;
      // Reject filesystem paths explicitly rather than by shape: the marketing kit nests its
      // commands with slashes ("/campaign/email create"), so any rule that treats a second
      // slash as "this is a path" would throw away real commands.
      // A lone "/plans/" is a directory in a tree listing. A trailing slash on an ARGUMENT
      // ("/storage:list designs/") is a real command, so only bare single-token lines are dropped.
      if (!line.includes(' ') && line.endsWith('/')) continue;
      if (FS_PATH.test(line)) continue; // "/usr/bin/node …", "/home/user/project"
      // Any <placeholder> means it is a template, not something a user can run as-is —
      // including mid-line ones like: /ck:plan --tdd "<source issue or feature request>"
      if (/<[^>]+>/.test(line)) continue;
      push(line);
    }
  }
  return out;
}

/** Returns null when the file yields nothing worth showing, so callers can skip the id. */
export function parseDetail(text, description) {
  const detail = {
    overview: parseOverview(description),
    whenToUse: parseWhenToUse(text),
    flags: parseFlags(text),
    examples: parseExamples(text, description),
  };
  const empty =
    !detail.overview && !detail.whenToUse && !detail.flags.length && !detail.examples.length;
  return empty ? null : detail;
}

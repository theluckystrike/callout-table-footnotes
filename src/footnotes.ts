// Pure footnote logic. No Obsidian and no DOM, so each function runs in unit tests and in the golden vectors
// (packages/spec/vectors/callout-table-footnotes.json).

export type Context = 'body' | 'callout' | 'quote' | 'table';

export interface RefInfo {
	id: string;
	/** Zero based line of the reference. */
	line: number;
	/** Zero based column of the "[" of the reference. */
	ch: number;
	context: Context;
}

export interface DefInfo {
	id: string;
	/** Column of the caret for an inline footnote. */
	ch?: number;
	/** Zero based line of the "[^id]:" label. */
	line: number;
	/** Column where the text of the definition starts. */
	at: number;
	/** Text of the definition, continuation lines joined with one space. */
	text: string;
}

export interface FootnoteScan {
	refs: RefInfo[];
	defs: DefInfo[];
	/** id to number, in order of first reference, only for ids that have a definition. */
	numbers: Record<string, number>;
	/** Ids with a reference and no definition. */
	missing: string[];
	/** Ids with a definition and no reference. */
	unused: string[];
	/** Zero based lines of named definitions and their continuation lines. */
	defLines: Set<number>;
}

export type Part = { text: string } | { id: string };

/** A reference found in rendered text: the label sits at offsets start (included) to end (excluded). */
export interface Located {
	id: string;
	start: number;
	end: number;
}

const ID = '[^\\]\\s^]+';
const CODE_SPAN = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
const DEF_LINE = new RegExp(`^ {0,3}\\[\\^(${ID})\\]:[ \\t]?(.*)$`);
const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
const ALNUM = /[\p{L}\p{N}]/u;
/** Longest piece of source text one scan reads after a widget start. Keeps a scan bounded. */
export const MAX_BLOCK_LINES = 400;

/** Inline math on one line ("$x$") as spaces. A "$" after a space or before a digit does not close it. */
function maskInlineMath(text: string): string {
	let out = '';
	let last = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\\') {
			i++;
			continue;
		}
		if (text[i] !== '$' || text[i + 1] === '$' || /\s/.test(text[i + 1] ?? ' ')) continue;
		let close = -1;
		for (let j = i + 1; j < text.length; j++) {
			if (text[j] === '\\') {
				j++;
				continue;
			}
			if (text[j] === '$' && !/\s/.test(text[j - 1] ?? ' ') && !/[$\d]/.test(text[j + 1] ?? '')) {
				close = j;
				break;
			}
		}
		// No later "$" can close either, since a closing "$" does not depend on the opening one.
		if (close < 0) break;
		out += text.slice(last, i) + ' '.repeat(close + 1 - i);
		last = close + 1;
		i = close;
	}
	return out + text.slice(last);
}
const BLOCK_OPEN = /%%|\$\$|<!--/;
const blank = (m: string): string => ' '.repeat(m.length);

/** A comment or display math block that is still open at the end of a line, by its closing marker. */
export type OpenBlock = '%%' | '$$' | '-->' | null;

/**
 * The line with code spans, comments (%% and HTML) and math as spaces, so the result has the same length as the line.
 * open is the block that an earlier line left open. Returns the block that this line leaves open. A marker whose
 * closing marker is not later on the line opens a block only when closesLater(closer, column after the marker) is
 * true. By default it does not, so "50%% off" in prose hides nothing.
 */
export function maskLine(line: string, open: OpenBlock = null, closesLater: (closer: Exclude<OpenBlock, null>, at: number) => boolean = () => false): { masked: string; open: OpenBlock } {
	const text = line.replace(CODE_SPAN, blank);
	let out = '';
	let i = 0;
	while (i < text.length) {
		if (open) {
			const end = text.indexOf(open, i);
			if (end < 0) {
				out += ' '.repeat(text.length - i);
				break;
			}
			out += ' '.repeat(end + open.length - i);
			i = end + open.length;
			open = null;
			continue;
		}
		const m = BLOCK_OPEN.exec(text.slice(i));
		if (!m) {
			out += text.slice(i);
			break;
		}
		const after = i + m.index + m[0].length;
		const closer: Exclude<OpenBlock, null> = m[0] === '<!--' ? '-->' : m[0] === '$$' ? '$$' : '%%';
		// An escaped dollar opens nothing, and a marker without a closing marker is plain text.
		if ((m[0] === '$$' && text[i + m.index - 1] === '\\') || (text.indexOf(closer, after) < 0 && !closesLater(closer, after))) {
			out += text.slice(i, after);
			i = after;
			continue;
		}
		out += text.slice(i, i + m.index) + ' '.repeat(m[0].length);
		i = after;
		open = closer;
	}
	return { masked: maskInlineMath(out), open };
}

export interface InlineFootnote {
	start: number;
	end: number;
	text: string;
}

/** An inline id has a space, so it cannot match a named footnote id. */
export function inlineId(line: number, ch: number): string {
	return `inline ${line}:${ch}`;
}

/**
 * Reads inline footnotes on one line. Balanced brackets and escaped brackets stay in the text. Footnotes in code spans,
 * math and comments do not count. masked is the line from maskLine when the caller knows the open block.
 */
export function inlineFootnotes(line: string, masked = maskLine(line).masked): InlineFootnote[] {
	// One pass finds the end of each balanced bracket, so a long line with open brackets stays linear.
	const close = new Map<number, number>();
	const open: number[] = [];
	for (let i = 0; i < masked.length; i++) {
		if (masked[i] === '\\') { i++; continue; }
		if (masked[i] === '[') open.push(i);
		else if (masked[i] === ']') {
			const at = open.pop();
			if (at !== undefined) close.set(at, i + 1);
		}
	}
	const out: InlineFootnote[] = [];
	for (let i = 0; i < masked.length - 1; i++) {
		if (masked[i] === '\\') { i++; continue; }
		if (masked[i] !== '^' || masked[i + 1] !== '[') continue;
		const end = close.get(i + 1);
		if (end === undefined) continue;
		out.push({ start: i, end, text: line.slice(i + 2, end - 1) });
		i = end - 1;
	}
	return out;
}

/** The source with each inline footnote replaced by its local rendered number. */
export function inlineLabels(line: string, first = 1): string {
	let next = first;
	let last = 0;
	let out = '';
	for (const note of inlineFootnotes(line)) {
		out += line.slice(last, note.start) + `[${next++}]`;
		last = note.end;
	}
	return out + line.slice(last);
}

/** Splits text into plain parts and footnote references. A reference in code, math, a comment or after a backslash stays plain. */
export function splitRefs(line: string, mask = maskLine(line).masked): Part[] {
	let masked = mask;
	for (const note of inlineFootnotes(line, mask)) masked = masked.slice(0, note.start) + ' '.repeat(note.end - note.start) + masked.slice(note.end);
	const parts: Part[] = [];
	let last = 0;
	for (const m of masked.matchAll(new RegExp(`\\[\\^(${ID})\\](?!:)`, 'g'))) {
		const at = m.index;
		if (at > 0 && masked[at - 1] === '\\') continue;
		if (at > last) parts.push({ text: line.slice(last, at) });
		parts.push({ id: m[1] ?? '' });
		last = at + m[0].length;
	}
	if (last < line.length) parts.push({ text: line.slice(last) });
	return parts;
}

/** Removes Markdown syntax that does not show as text, so the line matches the rendered text. References stay. */
export function stripLine(line: string): string {
	const keep = line.replace(new RegExp(`\\[\\^(${ID})\\](?!:)`, 'g'), '\uE000$1\uE001');
	const out = keep
		.replace(/^\s*#{1,6}\s+/, '')
		.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?/, '')
		.replace(/^\s*\[![^\]]*\][+-]?\s*/, '')
		.replace(/!\[\[[^\]]*\]\]/g, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
		.replace(/\[\[([^\]#|]*)#?[^\]|]*\]\]/g, '$1')
		.replace(/\]\([^)]*\)/g, ']')
		.replace(/<\/?(?!https?:)[a-zA-Z][^>]*>/g, '')
		.replace(/%%.*?%%/g, '')
		.replace(/\s\^[\w-]+\s*$/, '');
	return out.replace(/\uE000([^\uE001]*)\uE001/g, '[^$1]');
}

/** Lines of one callout or table that starts at lines[start]: a callout is a run of "&gt;" lines, a table a run of lines with a pipe. */
export function blockFrom(lines: string[], start: number, kind: 'callout' | 'table'): string[] {
	const out: string[] = [];
	for (let i = start; i < lines.length && out.length < MAX_BLOCK_LINES; i++) {
		const t = lines[i] ?? '';
		if (kind === 'callout' ? !/^\s*>/.test(t) : !t.includes('|')) break;
		out.push(t);
	}
	return out;
}

/** The text a callout body shows: the lines after the title line, quote marks and syntax removed. */
export function calloutSource(block: string[]): string {
	let fenced: string | null = null;
	const out: string[] = [];
	for (const raw of block.slice(1)) {
		const body = raw.replace(/^(?:\s*>)+ ?/, '');
		const previousFence: string | null = fenced;
		fenced = definitionFence(body, fenced);
		if (fenced !== previousFence) continue;
		out.push(fenced ? body.replace(/\[\^/g, '\\[^') : stripLine(body));
	}
	return out.join('\n');
}

export interface SourceCell {
	text: string;
	raw: string;
	ch: number;
}

/** Table cells with source columns. Escaped pipes and code spans stay in a cell. */
export function sourceCells(row: string): SourceCell[] {
	const cells: SourceCell[] = [];
	const masked = row.replace(CODE_SPAN, (m) => ' '.repeat(m.length));
	let start = 0;
	const add = (end: number): void => {
		const raw = row.slice(start, end);
		cells.push({ text: raw.trim().replace(/\\\|/g, '|'), raw: raw.trim(), ch: start + raw.length - raw.trimStart().length });
	};
	for (let i = 0; i < masked.length; i++) {
		if (masked[i] === '\\') { i++; continue; }
		if (masked[i] !== '|') continue;
		add(i);
		start = i + 1;
	}
	add(row.length);
	if (row.trimStart().startsWith('|')) cells.shift();
	if (row.trimEnd().endsWith('|') && !row.trimEnd().endsWith('\\|')) cells.pop();
	return cells;
}

/** Splits a table row. Escaped pipes and pipes in code stay in the cell. */
export function splitCells(row: string): string[] {
	return sourceCells(row).map((cell) => cell.text);
}

/** Source text of one rendered cell. row 0 is the header row, row 1 the first body row; the delimiter row is skipped. */
export function cellSource(block: string[], row: number, col: number): string {
	const raw = block[row === 0 ? 0 : row + 1];
	if (raw === undefined) return '';
	return stripLine(splitCells(raw)[col] ?? '');
}

export interface WidgetSource {
	source: string;
	inlineIds: string[];
}

/** Source text and inline ids for one widget. Inline numbers are local to its Markdown render. */
export function widgetSource(block: string[], startLine: number, cell?: { row: number; col: number }): WidgetSource {
	if (cell) {
		const row = cell.row === 0 ? 0 : cell.row + 1;
		const part = sourceCells(block[row] ?? '')[cell.col];
		if (!part) return { source: '', inlineIds: [] };
		return {
			source: stripLine(inlineLabels(part.raw).replace(/\\\|/g, '|')),
			inlineIds: inlineFootnotes(part.raw).map((note) => inlineId(startLine + row, part.ch + note.start)),
		};
	}
	let next = 1;
	let fenced: string | null = null;
	const inlineIds: string[] = [];
	const rendered = block.map((raw, line) => {
		const previousFence: string | null = fenced;
		fenced = definitionFence(raw.replace(/^(?:\s*>)+ ?/, ''), fenced);
		if (fenced !== previousFence) return raw;
		if (fenced) return raw;
		const notes = inlineFootnotes(raw);
		if (line > 0) inlineIds.push(...notes.map((note) => inlineId(startLine + line, note.start)));
		const out = inlineLabels(raw, next);
		next += notes.length;
		return out;
	});
	return { source: calloutSource(rendered), inlineIds };
}

interface Normal {
	chars: string[];
	at: number[];
}

/** Letters and digits of a text, lower case, with the offset of each one. Markup characters and spaces drop out. */
function normalize(s: string): Normal {
	const chars: string[] = [];
	const at: number[] = [];
	let i = 0;
	for (const ch of s) {
		if (ALNUM.test(ch)) {
			chars.push(ch.toLowerCase());
			at.push(i);
		}
		i += ch.length;
	}
	return { chars, at };
}

/**
 * Finds each footnote reference of source inside the rendered text. Obsidian draws a reference in a callout or a table
 * cell as its bare label ("note" for [^note]), so the label must be found by its place: the letters and digits before
 * it. Returns null when the text before a label does not match, so the caller leaves the widget as it is.
 */
export function locateRefs(rendered: string, source: string): Located[] | null {
	const r = normalize(rendered);
	let pos = 0;
	const out: Located[] = [];
	for (const part of splitRefs(source)) {
		if ('text' in part) {
			pos += normalize(part.text).chars.length;
			continue;
		}
		const want = normalize(part.id).chars;
		if (want.length === 0) continue;
		if (want.some((ch, k) => r.chars[pos + k] !== ch)) return null;
		let start = r.at[pos] ?? 0;
		const last = r.at[pos + want.length - 1] ?? 0;
		let end = last + ((rendered.codePointAt(last) ?? 0) > 0xffff ? 2 : 1);
		const prefix = /^[^\p{L}\p{N}]*/u.exec(part.id)?.[0] ?? '';
		const suffix = /[^\p{L}\p{N}]*$/u.exec(part.id)?.[0] ?? '';
		if (rendered.slice(start - prefix.length, start) === prefix) start -= prefix.length;
		if (rendered.slice(end, end + suffix.length) === suffix) end += suffix.length;
		out.push({ id: part.id, start, end });
		pos += want.length;
	}
	return out;
}

/** The lines of text that sit inside a table, found by a delimiter row under a header row. */
function tableLines(lines: string[]): Set<number> {
	const set = new Set<number>();
	for (let i = 0; i + 1 < lines.length; i++) {
		if (!(lines[i] ?? '').includes('|') || !DELIMITER_ROW.test(lines[i + 1] ?? '') || !(lines[i + 1] ?? '').includes('-')) continue;
		let j = i;
		while (j < lines.length && (lines[j] ?? '').includes('|')) set.add(j++);
		i = j;
	}
	return set;
}

/** Lines of text that sit inside a callout, found by a quote run that starts with a "[!type]" line. */
function calloutLines(lines: string[]): { callout: Set<number>; quote: Set<number> } {
	const callout = new Set<number>();
	const quote = new Set<number>();
	for (let i = 0; i < lines.length; i++) {
		if (!/^\s*>/.test(lines[i] ?? '')) continue;
		let j = i;
		while (j < lines.length && /^\s*>/.test(lines[j] ?? '')) j++;
		const target = /^\s*>\s*\[!/.test(lines[i] ?? '') ? callout : quote;
		for (let k = i; k < j; k++) target.add(k);
		i = j;
	}
	return { callout, quote };
}

/** Named references with their original source columns, also used for definition text. */
function namedRefs(text: string, line: number, context: Context, offset = 0, masked?: string): RefInfo[] {
	const refs: RefInfo[] = [];
	let ch = offset;
	for (const part of splitRefs(text, masked)) {
		if ('text' in part) ch += part.text.length;
		else {
			refs.push({ id: part.id, line, ch, context });
			ch += part.id.length + 3;
		}
	}
	return refs;
}

/** Definition fences use matching markers; a closing line has no info string. */
function definitionFence(text: string, open: string | null): string | null {
	const match = /^[ \t]*(`{3,}|~{3,})(.*)$/.exec(text);
	if (!match) return open;
	const marker = match[1] ?? '';
	const rest = match[2] ?? '';
	if (open) return marker[0] === open[0] && marker.length >= open.length && !rest.trim() ? null : open;
	return marker[0] === '`' && rest.includes('`') ? null : marker;
}

/** Reads the references and definitions of a note. Code blocks, code spans and front matter are skipped. */
export function scanFootnotes(text: string): FootnoteScan {
	const lines = text.split('\n');
	let start = 0;
	if ((lines[0] ?? '').trim() === '---') {
		const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
		if (end > 0) start = end + 1;
	}
	const table = tableLines(lines);
	const { callout, quote } = calloutLines(lines);
	const refs: RefInfo[] = [];
	const defs: DefInfo[] = [];
	const defLines = new Set<number>();
	let fenced: string | null = null;
	let block: OpenBlock = null;
	// A comment or math block that opens on one line must close later in the note, else its marker is plain text.
	const starts = lineStarts(text);
	const lastAt = { '%%': text.lastIndexOf('%%'), $$: text.lastIndexOf('$$'), '-->': text.lastIndexOf('-->') };
	let lineAt = 0;
	const closesLater = (closer: Exclude<OpenBlock, null>, at: number): boolean => lastAt[closer] >= lineAt + at;
	for (let i = start; i < lines.length; i++) {
		lineAt = starts[i] ?? 0;
		const line = lines[i] ?? '';
		const previousFence: string | null = fenced;
		if (!block) fenced = definitionFence(line.replace(/^(?:\s*>)+ ?/, ''), fenced);
		if (fenced !== previousFence) continue;
		if (fenced) continue;
		const inBlock = block !== null;
		const mask = maskLine(line, block, closesLater);
		block = mask.open;
		const def = inBlock ? null : DEF_LINE.exec(line);
		if (def) {
			defLines.add(i);
			let body = def[2] ?? '';
			const label = i;
			const at = line.length - body.length;
			let bodyFence = definitionFence(body, null);
			if (!bodyFence) refs.push(...namedRefs(body, i, 'body', at));
			while (i + 1 < lines.length && (/^(?: {2,}|\t)\S/.test(lines[i + 1] ?? '') || (bodyFence && !lines[i + 1]?.trim()))) {
				const continuation = lines[++i] ?? '';
				defLines.add(i);
				body += ` ${continuation.trim()}`;
				const previousFence = bodyFence;
				bodyFence = definitionFence(continuation, bodyFence);
				if (!previousFence && !bodyFence) refs.push(...namedRefs(continuation, i, 'body'));
			}
			defs.push({ id: def[1] ?? '', line: label, at, text: body.trim() });
			continue;
		}
		const context: Context = table.has(i) ? 'table' : callout.has(i) ? 'callout' : quote.has(i) ? 'quote' : 'body';
		const lineRefs: RefInfo[] = [];
		for (const note of inlineFootnotes(line, mask.masked)) {
			const id = inlineId(i, note.start);
			lineRefs.push({ id, line: i, ch: note.start, context });
			defs.push({ id, line: i, ch: note.start, at: note.start + 2, text: note.text });
		}
		lineRefs.push(...namedRefs(line, i, context, 0, mask.masked));
		refs.push(...lineRefs.sort((a, b) => a.ch - b.ch));
	}
	return summarize(refs, defs, defLines);
}

function summarize(refs: RefInfo[], defs: DefInfo[], defLines: Set<number>): FootnoteScan {
	const defined = new Set(defs.map((d) => d.id));
	const referenced = new Set(refs.map((r) => r.id));
	const numbers: Record<string, number> = Object.create(null) as Record<string, number>;
	let n = 0;
	for (const r of refs) if (defined.has(r.id) && numbers[r.id] === undefined) numbers[r.id] = ++n;
	return {
		refs,
		defs,
		numbers,
		missing: [...referenced].filter((id) => !defined.has(id)),
		unused: [...defined].filter((id) => !referenced.has(id)),
		defLines,
	};
}

/** A footnote in a paragraph, list item, task or blockquote that Live Preview can show as a number. */
export interface InlineMark {
	/** The inline id ("inline line:ch") or the named id. */
	id: string;
	kind: 'inline' | 'named';
	/** Offset of the "^" of "^[" or the "[" of "[^", in the note text. */
	from: number;
	/** Offset after the closing "]". */
	to: number;
	/** Offset of the first character of the inline text. For a named reference, from. */
	textFrom: number;
	/** The inline text. Empty for a named reference. */
	text: string;
	/** The number from the shared counter of the note, or null for a named reference without a definition. */
	number: number | null;
}

/** Offset of the start of each line. */
function lineStarts(text: string): number[] {
	const starts = [0];
	for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
	return starts;
}

/**
 * Finds the inline footnotes ("^[text]") in paragraphs, list items, tasks and blockquotes, with their place in the note
 * and their number. Callouts and tables are left out: their widgets get links from the post processor. With named
 * true, named references ("[^id]") in the same lines are added. Footnote definitions, code, math, comments, front
 * matter and escaped carets give nothing. The numbers come from the one counter of scanFootnotes.
 */
export function locateInline(text: string, named = false, scan: FootnoteScan = scanFootnotes(text)): InlineMark[] {
	const starts = lineStarts(text);
	const inline = new Map<string, DefInfo>();
	for (const def of scan.defs) if (def.ch !== undefined) inline.set(def.id, def);
	const out: InlineMark[] = [];
	for (const ref of scan.refs) {
		if ((ref.context !== 'body' && ref.context !== 'quote') || scan.defLines.has(ref.line)) continue;
		const from = (starts[ref.line] ?? 0) + ref.ch;
		const number = scan.numbers[ref.id] ?? null;
		const def = inline.get(ref.id);
		if (def) out.push({ id: ref.id, kind: 'inline', from, to: from + def.text.length + 3, textFrom: from + 2, text: def.text, number });
		else if (named && !ref.id.startsWith('inline ')) out.push({ id: ref.id, kind: 'named', from, to: from + ref.id.length + 3, textFrom: from, text: '', number });
	}
	return out;
}

/** A change to the note text, by offsets in the text before the change. */
export interface TextChange {
	from: number;
	to: number;
	insert: string;
}

/**
 * Pro: the changes that turn one inline footnote into a named one. The footnote is the one that holds the cursor
 * offset, or else the nearest one on the cursor line. "^[text]" becomes "[^n]" with the lowest free number n, and
 * "[^n]: text" goes at the end of the note. Returns null when the cursor line has no inline footnote.
 */
export function convertInline(text: string, offset: number, scan: FootnoteScan = scanFootnotes(text)): { id: string; changes: TextChange[] } | null {
	const starts = lineStarts(text);
	let line = 0;
	while (line + 1 < starts.length && (starts[line + 1] ?? 0) <= offset) line++;
	const lineStart = starts[line] ?? 0;
	const notes = scan.defs.filter((d) => d.ch !== undefined && d.line === line).map((d) => ({ def: d, from: lineStart + (d.ch ?? 0), to: lineStart + (d.ch ?? 0) + d.text.length + 3 }));
	if (notes.length === 0) return null;
	const pick = notes.find((n) => n.from <= offset && offset <= n.to) ?? notes.find((n) => n.from >= offset) ?? notes[notes.length - 1];
	if (!pick) return null;
	const used = new Set([...scan.refs.map((r) => r.id), ...scan.defs.map((d) => d.id)]);
	let n = 1;
	while (used.has(String(n))) n++;
	const id = String(n);
	const lines = text.split('\n');
	let last = lines.length - 1;
	while (last > 0 && !(lines[last] ?? '').trim()) last--;
	const afterDef = DEF_LINE.test(lines[last] ?? '');
	const prefix = text === '' || text.endsWith('\n\n') ? '' : text.endsWith('\n') ? (afterDef ? '' : '\n') : afterDef ? '\n' : '\n\n';
	return {
		id,
		changes: [
			{ from: pick.from, to: pick.to, insert: `[^${id}]` },
			{ from: text.length, to: text.length, insert: `${prefix}[^${id}]: ${pick.def.text}${text.endsWith('\n') ? '\n' : ''}` },
		],
	};
}

/** Applies changes (offsets in the old text, in any order, not overlapping) to a text. For tests and previews. */
export function applyChanges(text: string, changes: TextChange[]): string {
	let out = text;
	for (const c of [...changes].sort((a, b) => b.from - a.from)) out = out.slice(0, c.from) + c.insert + out.slice(c.to);
	return out;
}

/** One short line for a number of footnote problems, for a Notice. */
export function describeProblems(scan: FootnoteScan): string {
	const bits: string[] = [];
	if (scan.missing.length) bits.push(`${scan.missing.length} without a definition (${scan.missing.map((i) => `[^${i}]`).join(', ')})`);
	if (scan.unused.length) bits.push(`${scan.unused.length} never used (${scan.unused.map((i) => `[^${i}]`).join(', ')})`);
	return bits.length ? `Footnotes: ${bits.join('; ')}.` : `Footnotes: all ${scan.defs.length} have a reference and a definition.`;
}

/** The first reference of an id, or null. */
export function firstRef(scan: FootnoteScan, id: string): RefInfo | null {
	return scan.refs.find((r) => r.id === id) ?? null;
}

/** The definition of an id, or null. */
export function definitionOf(scan: FootnoteScan, id: string): DefInfo | null {
	return scan.defs.find((d) => d.id === id) ?? null;
}

/** Cursor place for a panel row: the definition text, inline text, or the first reference when there is no definition. */
export function panelTarget(scan: FootnoteScan, id: string): { line: number; ch: number } | null {
	const def = definitionOf(scan, id);
	if (def) return { line: def.line, ch: def.at };
	const ref = firstRef(scan, id);
	return ref ? { line: ref.line, ch: ref.ch } : null;
}

/** Id of the definition on a line, or null. For the Pro command that goes back to the reference. */
export function defIdOnLine(scan: FootnoteScan, line: number): string | null {
	return scan.defs.find((d) => d.line === line && d.ch === undefined)?.id ?? null;
}

/** What a reference shows: its number, or the id when it has no definition. */
export function labelOf(scan: FootnoteScan, id: string): string {
	return String(scan.numbers[id] ?? id);
}

export interface PanelItem {
	id: string;
	/** Number from the order of first use, or the id when the footnote has no definition. */
	label: string;
	text: string;
	/** Where the references sit: body, callout, quote, table. */
	where: string;
	refs: number;
	problem: 'missing' | 'unused' | null;
}

/** Rows for the footnote panel: numbered footnotes in order, then missing definitions, then unused definitions. */
export function panelItems(scan: FootnoteScan): PanelItem[] {
	const item = (id: string, problem: PanelItem['problem']): PanelItem => {
		const mine = scan.refs.filter((r) => r.id === id);
		const where = [...new Set(mine.map((r) => r.context))].join(', ');
		return { id, label: labelOf(scan, id), text: definitionOf(scan, id)?.text ?? '', where, refs: mine.length, problem };
	};
	const numbered = Object.keys(scan.numbers).sort((a, b) => (scan.numbers[a] ?? 0) - (scan.numbers[b] ?? 0));
	return [...numbered.map((id) => item(id, null)), ...scan.missing.map((id) => item(id, 'missing')), ...scan.unused.map((id) => item(id, 'unused'))];
}

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
const FENCE = /^\s*(?:```|~~~)/;
const ALNUM = /[\p{L}\p{N}]/u;
/** Longest piece of source text one scan reads after a widget start. Keeps a scan bounded. */
export const MAX_BLOCK_LINES = 400;

export interface InlineFootnote {
	start: number;
	end: number;
	text: string;
}

/** An inline id has a space, so it cannot match a named footnote id. */
export function inlineId(line: number, ch: number): string {
	return `inline ${line}:${ch}`;
}

/** Reads inline footnotes on one line. Balanced brackets and escaped brackets stay in the text. */
export function inlineFootnotes(line: string): InlineFootnote[] {
	const masked = line.replace(CODE_SPAN, (m) => ' '.repeat(m.length));
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

/** Splits text into plain parts and footnote references. A reference inside an inline code span, or after a backslash, stays plain. */
export function splitRefs(line: string): Part[] {
	let masked = line.replace(CODE_SPAN, (m) => ' '.repeat(m.length));
	for (const note of inlineFootnotes(line)) masked = masked.slice(0, note.start) + ' '.repeat(note.end - note.start) + masked.slice(note.end);
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
	let fenced = false;
	const out: string[] = [];
	for (const raw of block.slice(1)) {
		const body = raw.replace(/^(?:\s*>)+ ?/, '');
		if (FENCE.test(body)) {
			fenced = !fenced;
			continue;
		}
		out.push(fenced ? body : stripLine(body));
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
	let fenced = false;
	const inlineIds: string[] = [];
	const rendered = block.map((raw, line) => {
		if (FENCE.test(raw.replace(/^(?:\s*>)+ ?/, ''))) { fenced = !fenced; return raw; }
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
		out.push({ id: part.id, start: r.at[pos] ?? 0, end: (r.at[pos + want.length - 1] ?? 0) + 1 });
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
	let fenced = false;
	for (let i = start; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (FENCE.test(line.replace(/^(?:\s*>)+ ?/, ''))) {
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		const def = DEF_LINE.exec(line);
		if (def) {
			let body = def[2] ?? '';
			while (/^(?: {2,}|\t)\S/.test(lines[i + 1] ?? '')) body += ` ${(lines[++i] ?? '').trim()}`;
			defs.push({ id: def[1] ?? '', line: i, text: body.trim() });
			continue;
		}
		const context: Context = table.has(i) ? 'table' : callout.has(i) ? 'callout' : quote.has(i) ? 'quote' : 'body';
		const lineRefs: RefInfo[] = [];
		for (const note of inlineFootnotes(line)) {
			const id = inlineId(i, note.start);
			lineRefs.push({ id, line: i, ch: note.start, context });
			defs.push({ id, line: i, ch: note.start, text: note.text });
		}
		let ch = 0;
		for (const part of splitRefs(line)) {
			if ('text' in part) ch += part.text.length;
			else {
				lineRefs.push({ id: part.id, line: i, ch, context });
				ch += part.id.length + 3;
			}
		}
		refs.push(...lineRefs.sort((a, b) => a.ch - b.ch));
	}
	return summarize(refs, defs);
}

function summarize(refs: RefInfo[], defs: DefInfo[]): FootnoteScan {
	const defined = new Set(defs.map((d) => d.id));
	const referenced = new Set(refs.map((r) => r.id));
	const numbers: Record<string, number> = {};
	let n = 0;
	for (const r of refs) if (defined.has(r.id) && numbers[r.id] === undefined) numbers[r.id] = ++n;
	return {
		refs,
		defs,
		numbers,
		missing: [...referenced].filter((id) => !defined.has(id)),
		unused: [...defined].filter((id) => !referenced.has(id)),
	};
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
	if (def) return { line: def.line, ch: def.ch !== undefined ? def.ch + 2 : `[^${id}]: `.length };
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

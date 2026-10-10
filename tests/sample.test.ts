import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanFootnotes } from '../src/footnotes';

const dir = 'docs/sample-notes';
const read = (name: string) => readFileSync(`${dir}/${name}`, 'utf8');

// The README and the screenshots quote these sample notes.
describe('sample notes', () => {
	it('Field notes: four footnotes, eight references, in a callout, a table and a quote', () => {
		const s = scanFootnotes(read('Field notes.md'));
		expect(Object.keys(s.numbers).length).toBe(4);
		expect(s.refs.length).toBe(8);
		expect([...new Set(s.refs.map((r) => r.context))].sort()).toEqual(['body', 'callout', 'quote', 'table']);
		expect(s.missing).toEqual([]);
		expect(s.unused).toEqual([]);
	});
	it('Review checklist: one missing and one unused footnote', () => {
		const s = scanFootnotes(read('Review checklist.md'));
		expect(s.missing).toEqual(['risk']);
		expect(s.unused).toEqual(['old']);
	});
});

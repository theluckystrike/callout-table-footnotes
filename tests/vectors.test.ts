import { describe, expect, it } from 'vitest';
import vectors from './vectors/callout-table-footnotes.json';
import { scanFootnotes } from '../src/footnotes';

describe('golden vectors (packages/spec/vectors/callout-table-footnotes.json)', () => {
	it('has at least 20 cases', () => {
		expect(vectors.cases.length).toBeGreaterThanOrEqual(20);
	});
	for (const c of vectors.cases) {
		it(c.name, () => {
			const [text] = c.args as [string];
			const s = scanFootnotes(text);
			expect({
				numbers: s.numbers,
				missing: s.missing,
				unused: s.unused,
				refs: s.refs.map((r) => [r.id, r.line, r.ch, r.context]),
				defs: s.defs.map((d) => [d.id, d.line, d.text]),
			}).toEqual(c.expected);
		});
	}
});

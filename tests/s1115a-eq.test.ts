// s1115a A2. eslint-plugin-obsidianmd 0.6.0 regex-lookbehind (iOS before 16.4 has no lookbehind). Equivalence of the
// rewrite with the old lookbehind expression, on a table of edge cases and on seeded fuzz input (as lanes/R1-A1/eq/eq.mts).
import { describe, expect, it } from 'vitest';
import { CODE_SPAN } from '../src/footnotes';

let seed = 1115;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const gen = (alpha: string[], len: number) => Array.from({ length: Math.floor(rnd() * len) }, () => alpha[Math.floor(rnd() * alpha.length)]).join('');
const FUZZ = 20000;
const j = (x: unknown) => JSON.stringify(x);
/** Runs old and new on each input. Returns the inputs where they differ. */
function differ(inputs: string[], oldF: (s: string) => unknown, newF: (s: string) => unknown): string[] {
	return inputs.filter((s) => j(oldF(s)) !== j(newF(s)));
}
const fuzz = (alpha: string[], len: number) => Array.from({ length: FUZZ }, () => gen(alpha, len));

const OLD = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
const oldF = (s: string) => [...s.matchAll(OLD)].map((m) => [m.index, m[0]]);
const newF = (s: string) => [...s.matchAll(CODE_SPAN)].map((m) => [m.index, m[0]]);
const TABLE = ['', '`a`', '``', '````', '`` a ``', '``a`b``', '`a``', '``a`', '`a` `b`', '`\n`', '` `', '``` x ```', '`a``b`', '\\`a`', '[^1] `x[^2]`', '``a``b``'];

describe('code spans without lookbehind', () => {
	it('matches the old expression on the table', () => {
		expect(differ(TABLE, oldF, newF)).toEqual([]);
	});
	it('matches the old expression on fuzz input', () => {
		expect(differ(fuzz(['`', '``', 'a', ' ', '\n', '\\', '[^1]'], 24), oldF, newF)).toEqual([]);
	});
});

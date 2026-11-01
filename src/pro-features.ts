// The Pro features of this plugin, one line each. The "What Pro adds" window, the README Pro section and notemods.com
// use these lines word for word. Each gate is a text of the Pro check in src; tests/what-pro.test.ts checks it.
// No imports with code: tools and tests read this file as plain data.
import type { WhatProFeature } from './license/github-obsidian';

export const PRO_FEATURES: WhatProFeature[] = [
	{
		id: 'panel',
		line: 'A footnote panel lists each footnote of the note with its text and where it is used. Select a row to go to its definition.',
		gate: { file: 'src/main.ts', text: "this.addProCommand('show-footnotes'" },
	},
	{
		id: 'convert',
		line: 'A command changes an inline footnote into a named footnote and puts the definition at the end of the note.',
		gate: { file: 'src/main.ts', text: "this.addProCommand('convert-inline-footnote'" },
	},
	{
		id: 'back',
		line: 'A command moves the cursor from a footnote definition back to its first reference.',
		gate: { file: 'src/main.ts', text: "this.addProCommand('back-to-reference'" },
	},
	{
		id: 'check',
		line: 'A command names each reference without a definition and each definition that no reference uses.',
		gate: { file: 'src/main.ts', text: "this.addProCommand('check-footnotes'" },
	},
	{
		id: 'missing-red',
		line: 'A reference without a definition shows in red with a dashed underline.',
		gate: { file: 'src/main.ts', text: 'activeDocument.body.toggleClass(PRO_CLASS, isPro())' },
	},
];

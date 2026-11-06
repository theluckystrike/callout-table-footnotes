# callout-table-footnotes

## 1.3.5

### Patch Changes

- 5f30369: The command that goes from a definition back to its reference now works on every line of a long definition.
  The footnote check now says "This note has no footnotes." on a note without footnotes.
  The footnote check now counts a label that is defined twice as one footnote.

## 1.3.4

### Patch Changes

- The Pro notice of this plugin now says that one payment turns on Pro in every NoteMods plugin.

## 1.3.3

### Patch Changes

- 2bdf5e2: Add the "What Pro adds" window. It lists each Pro feature with a "Try it" demo on a sample note, the price, a "Sponsor $15 once" button and "Sign in with GitHub". Open it with the command "What Pro adds", the button in the Pro section of the settings, or the link in the Pro notice. It never opens by itself.

## 1.3.2

### Patch Changes

- The Sponsor on GitHub button of Footnotes in Callouts and Tables now opens the GitHub Sponsors one-time tab.

## 1.3.1

### Patch Changes

- The Footnotes in Callouts and Tables notice for a Pro feature now has a Sponsor on GitHub button.

## 1.3.0

### Minor Changes

- In Live Preview, inline footnotes in paragraphs, lists and blockquotes now show as small numbers with a hover preview and a click to the text.
- Footnote-like text in math and comments is no longer counted or numbered, as in Reading view, so some later numbers in callouts and tables go down by one.

## 1.2.0

### Minor Changes

- After a minor or major update, Footnotes in Callouts and Tables opens one What's new tab in the background. It links to notemods.com, where you can send feedback. Turn it off in Settings. Add the Send feedback command. The plugin makes no new network requests.

## 1.1.5

### Patch Changes

- 2ebc204: Add storefront links for the free and Pro offers.

## 1.1.4

### Patch Changes

- f348b90: Number footnote IDs without inherited object properties. Replace complete labels with punctuation or supplementary Unicode letters. Match code fences by marker and length.

## 1.1.3

### Patch Changes

- 2f3a9ce: Count named references in footnote definition bodies and continuation lines so the unused-footnote check and reference navigation include them. Preserve code exclusions and source positions. Clarify that scanner numbering can differ from Reading view.

## 1.1.2

### Patch Changes

- 85e6f8b: Treat a GitHub sponsorship reply without an amount as a failed check, not a refusal, and stop the GitHub sign in when the settings close or the plugin unloads.

## 1.1.1

### Patch Changes

- beb1ac0: Go to the first line of a footnote definition that continues on indented lines, keep the cursor inside the note for an empty definition, cancel a waiting popup in a popout window, and keep the way back to a reference in its own note.

## 1.1.0

### Minor Changes

- 29e1f43: Add free inline footnote links in callouts and table cells with one number order, a preview and a jump to the source.

## 1.0.1

### Patch Changes

- efdff8f: Correct the GitHub Sponsors payment, check and token storage text in the README.

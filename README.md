# Footnotes in Callouts and Tables

Footnotes in Callouts and Tables turns references in callouts and table cells into numbered links, and inline footnotes in paragraphs into small numbers. Hover to read a definition or click to go to it. Live Preview does not do this by itself.

## Features

### Numbered links in callouts

Without the plugin, Live Preview shows a label such as `[^2]` in a callout as plain text next to the word.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/without-plugin.png" alt="Live Preview without the plugin: the references in a callout and in a table cell show as the plain text percent2, sites3 and log4" width="720">

Free: footnote links in callouts, tables and paragraphs, previews, jumps. Pro: a panel, conversion, return links, warnings. $15 one time or $5 a month: [Sponsor](https://github.com/sponsors/theluckystrike?metadata_source=callout-table-footnotes) or [$15 one-time offer](https://github.com/sponsors/theluckystrike/sponsorships?tier_id=666162&metadata_source=callout-table-footnotes).

With the plugin, the same text shows a raised number that you can click, numbered by first use. Reading view can differ. A reference that has no definition keeps the id that you typed.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/callout.png" alt="Live Preview with the plugin: the references in the callout are raised, numbered links" width="720">

### Links in table cells

A reference in a table cell becomes a link too, also in the header row. A click on the link does not start editing the cell. A click on the cell text still does.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/table.png" alt="A table with raised, numbered footnote links in two columns" width="720">

### Inline footnotes

Write `^[text]` in a callout body or a table cell to keep the definition beside its reference. The plugin shows a numbered link. Inline and named footnotes use one number order for the note. Hover over the link to read the text. Click it, or press Enter, to move the cursor into that text.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/inline-footnotes.png" alt="Inline and named footnotes in a callout and table use one number order, with the inline text shown in a popup" width="720">

### Inline footnotes in paragraphs

Write `^[text]` in a paragraph, list item, task or blockquote. In Live Preview the plugin shows a small number in its place, in the same number order as the other footnotes of the note. Move the cursor onto the footnote to edit its text. Hover over the number to read the text, or click it to put the cursor at the start of the text. Footnotes in code, math and comments stay as typed. Turn on "Also number named references in paragraphs" to show `[^id]` as a number too.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/paragraph-footnotes.gif" alt="A note in Live Preview: inline footnotes in a paragraph, a list and a quote show as numbers, a hover shows the text, and a click opens the source text" width="720">

### Hover preview

Rest the pointer on a link to see the definition in a small popup, with its Markdown drawn.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/hover.png" alt="The definition of footnote 2 shown in a popup under the reference in the callout" width="720">

### Click to go to the definition

A click on a link moves the cursor to the definition and scrolls to it. The definition line lights up for a moment. The links also work with the keyboard: Tab to a link, then press Enter.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/footnote-jump.gif" alt="A note with a callout and a table: the pointer moves over a reference in a table cell, a click goes to its definition at the end of the note, and the definition line lights up" width="720">

### Footnote panel (Pro)

The command "Show the footnotes of this note" opens a searchable list of the footnotes in the note, also the ones in paragraphs. Each row shows the number, the definition, the reference count and where they are. Press Enter on a row to go to its definition. A footnote with no definition, or with no reference, shows a warning line. The command "Convert inline footnote to named footnote" moves the inline text at the cursor to a `[^n]:` definition at the end of the note. Undo restores it in one step.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/footnote-panel.png" alt="The footnote panel with four rows: two normal footnotes, one without a definition and one that is never used" width="720">

### Warnings for unused and missing footnotes (Pro)

With Pro, a reference that has no definition shows in red with a dashed underline. The command "Check for unused and missing footnotes" shows one notice that names each one, for example `Footnotes: 1 without a definition ([^risk]); 1 never used ([^old]).` The command "Go from a footnote definition to its reference" moves the cursor from a definition line to the first reference, or back to the place where you last clicked a reference.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/warnings.png" alt="A callout and a table with one reference in red, and a notice that names the missing and the unused footnote" width="720">

## Install

1. Open "Settings → Community plugins" and turn off restricted mode.
2. Select "Browse", search for "Footnotes in Callouts and Tables", then select "Install" and "Enable".

To install by hand, copy `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/callout-table-footnotes/`. Then enable the plugin. You need Obsidian 1.13.4 or later.

## Usage

There is nothing to set up. Open a note in Live Preview, and the links show.

1. Write the reference as `[^label]` and the definition as `[^label]: text` on its own line, anywhere in the note.
2. Rest the pointer on a link to read the definition.
3. Click a link to go to the definition.

A definition can run over several lines if you indent the next lines by two spaces or more. A reference inside inline code, inside a code block, in the front matter, or after a backslash is not a reference. Reading view already draws footnotes, so the plugin does nothing there. If the source and a drawn callout or table do not match, the plugin leaves it as drawn.

## Settings

After a minor or major update, this plugin opens one What's new tab in the background. The tab and settings card suggest other NoteMods plugins and Zovo Chat and link to notemods.com for feedback ([privacy](https://notemods.com/privacy/)). The tab sends no data. Turn the tab off in Settings.

| Setting | What it does |
| --- | --- |
| Show numbers | Shows each reference as its number. Turn it off to show named labels. Inline footnotes keep numbers. |
| Inline footnotes in paragraphs | On by default. Shows each `^[text]` in a paragraph, list or blockquote as a number in Live Preview. |
| Also number named references in paragraphs | Off by default. Shows each `[^id]` in a paragraph as a number too. |
| Hover preview | Shows the definition in a popup. |
| Hover delay | Milliseconds to wait before the popup shows, from 0 to 2000. |

The settings tab also has the Pro section: sign in with GitHub, the status line and Refresh.

## Pro

To sign in and enable Pro:

1. Sponsor via [GitHub Sponsors](https://github.com/sponsors/theluckystrike?metadata_source=callout-table-footnotes). A total payment of $15 meets the payment requirement for Pro without further payment. Sign-in and the checks below still apply.
2. In Obsidian, open the settings of Footnotes in Callouts and Tables and select "Sign in with GitHub".
3. The plugin copies a code and opens github.com/login/device. Paste the code there and approve.

If you sponsor after you sign in, select Refresh.

## FAQ

### Does it change my notes?

No. The plugin reads the note text to find references and definitions. Only the Pro command "Convert inline footnote to named footnote" writes to the note, when you run it.

### Does it work with named labels like `[^source]`?

Yes. Labels such as `constructor` and `__proto__` get numbers too. Turn off "Show numbers" to show the label.

### Does it work in normal paragraphs?

Yes, for inline footnotes. A named reference such as `[^1]` in a paragraph shows as typed, unless you turn on "Also number named references in paragraphs".

### Which footnotes does it not handle?

Footnotes in embedded notes, inline footnotes in callout titles or footnote definitions, and inline footnotes that cross a line break. A label that has no letter and no digit, such as `[^-]`, also stays as drawn.

### How is this different from the Footnote Shortcut plugin?

Footnote Shortcut and Tidy Footnotes help you write and tidy footnotes. This plugin changes how references look and work in Live Preview.

## Payment, account and network

The core features are free. Pro features need a GitHub Sponsors sponsorship of theluckystrike: $5 a month or more, or $15 once. A total payment of $15 meets the payment requirement for Pro without further payment. Sign-in and the checks below still apply. Your notes stay readable and editable with or without Pro.

GitHub handles the payment. Sponsor at https://github.com/sponsors/theluckystrike. You need no account for the free features. Pro needs the GitHub account that sponsors.

Until you select "Sign in with GitHub" in the settings, Footnotes in Callouts and Tables makes no network requests. Sign in uses the GitHub device flow. Footnotes in Callouts and Tables sends its public client ID and the scope `read:user` to `https://github.com/login/device/code` and shows you a code. While you enter the code at https://github.com/login/device, it asks `https://github.com/login/oauth/access_token` every few seconds to check the sign-in status. The scope permits profile reads only. GitHub needs this access to show the sponsorship tier. It grants no repository scope and no write access.

After sign in, Footnotes in Callouts and Tables sends one query to `https://api.github.com/graphql`. It checks if the signed-in account sponsors theluckystrike. It asks for the tier and the total payment to theluckystrike. The plugin reuses a successful check for 7 days. Failed checks can retry after 6 hours. Select Refresh to request an earlier check. It sends no note content, file names or other vault data, and it has no telemetry.

After a successful check, Pro can work offline for up to 14 days. Sign out or a negative sponsorship answer turns Pro off. The plugin stores the GitHub token through the secret storage API of Obsidian. It does not put the token in its saved settings or its local sponsorship data. The local storage of this device keeps your GitHub login, the tier and the time of the last check. Sign out clears the token. You can also revoke the access in your GitHub settings, under Applications.

## Support

Plugin page: [callout-table-footnotes](https://notemods.com/plugins/callout-table-footnotes/).

Report bugs and ask for features in the GitHub issues of this repository. Add your Obsidian version and a small sample note.

## Community

Questions, bugs or plugin ideas? Talk to me and other Obsidian users in [Zovo Chat](https://t.me/+k2MM-BIc7SQ5OWM0) on Telegram. It has a topic for these plugins. You can also open an issue here.

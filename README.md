# Footnotes in Callouts and Tables

Footnotes in Callouts and Tables fixes a gap in Live Preview. When you write a footnote reference inside a callout or a table cell, Obsidian shows it as a bare number or word. You cannot click it, and you cannot read the definition without scrolling. This plugin turns those references into numbered links, like the footnote links that Obsidian draws in a normal paragraph. Hover over the link to read the definition. Click it to go to the definition.

## Features

### Numbered links in callouts

Write a footnote the usual way, with a label such as `[^2]` in the callout text and the definition anywhere in the note. Without the plugin, Live Preview shows the label as plain text next to the word.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/without-plugin.png" alt="Live Preview without the plugin: the references in a callout and in a table cell show as the plain text percent2, sites3 and log4" width="720">

With the plugin, the same text shows a raised number that you can click. The number follows the order of first use in the note, the same order that the reading view uses. A reference that has no definition keeps the id that you typed.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/callout.png" alt="Live Preview with the plugin: the references in the callout are raised, numbered links" width="720">

### Links in table cells

A reference in a table cell becomes a link too, in the header row and in the body rows. A click on the link does not start editing the cell. A click on the cell text still does, and the links come back when you leave the cell.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/table.png" alt="A table with raised, numbered footnote links in two columns" width="720">

### Inline footnotes

Write `^[text]` in a callout body or a table cell to keep the definition beside its reference in the source. The plugin shows a numbered link. Inline and named footnotes use one number order for the note. Hover over the link to read the inline text. Click it, or press Enter, to move the cursor into that text. The plugin removes the local list below a callout when its inline links are ready. The note text stays unchanged.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/inline-footnotes.png" alt="Inline and named footnotes in a callout and table use one number order, with the inline text shown in a popup" width="720">

### Hover preview

Rest the pointer on a link to see the text of the definition in a small popup. The popup shows Markdown, so links and bold text in the definition look as they do in the note.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/hover.png" alt="The definition of footnote 2 shown in a popup under the reference in the callout" width="720">

### Click to go to the definition

A click on a link moves the cursor to the definition and scrolls to it. The line of the definition shows a colour for a moment, so you can see where you are. The plugin stops the press on the link, so a table does not start to edit the cell. The links also work with the keyboard: Tab to a link, then press Enter.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/footnote-jump.gif" alt="A note with a callout and a table: the pointer moves over a reference in a table cell, a click goes to its definition at the end of the note, and the definition line lights up" width="720">

### Footnote panel (Pro)

The command "Show the footnotes of this note" opens a searchable list of the footnotes in the note. Each row shows the number, the definition, how many references the footnote has and where they are: body, callout, quote or table. Press Enter on a row to go to its definition. A footnote that has no definition, or that no reference uses, shows a warning line.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/footnote-panel.png" alt="The footnote panel with four rows: two normal footnotes, one without a definition and one that is never used" width="720">

### Warnings for unused and missing footnotes (Pro)

With Pro, a reference that has no definition shows in red with a dashed underline, in callouts and in table cells. The command "Check for unused and missing footnotes" shows one notice that names each one, for example `Footnotes: 1 without a definition ([^risk]); 1 never used ([^old]).` The command "Go from a footnote definition to its reference" moves the cursor from a definition line to the first reference. If the cursor is not on a definition, it goes back to the place where you last clicked a reference.

<img src="https://raw.githubusercontent.com/theluckystrike/callout-table-footnotes/HEAD/docs/warnings.png" alt="A callout and a table with one reference in red, and a notice that names the missing and the unused footnote" width="720">

## Install

1. Open "Settings → Community plugins" and turn off restricted mode.
2. Select "Browse", search for "Footnotes in Callouts and Tables", then select "Install" and "Enable".

To install by hand, copy `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/callout-table-footnotes/`. Then enable the plugin. You need Obsidian 1.13.4 or later.

## Usage

There is nothing to set up. Open a note in Live Preview with a footnote reference in a callout or a table, and the links show.

1. Write the reference as `[^label]` and the definition as `[^label]: text` on its own line, anywhere in the note.
2. Rest the pointer on a link to read the definition.
3. Click a link to go to the definition.

A definition can run over several lines if you indent the next lines by two spaces or more. A reference inside inline code, inside a code block, in the front matter, or after a backslash is not a reference. Reading view already draws footnotes in callouts and tables, so the plugin does nothing there.

### How it works

The plugin reads the source text with an editor extension and a Markdown post processor. It makes links after the widget is drawn. If the source and the widget do not match, it leaves the widget as drawn. It uses public API hooks.

## Settings

| Setting | What it does |
| --- | --- |
| Show numbers | Shows each reference as its number. Turn it off to show named labels. Inline footnotes keep numbers. |
| Hover preview | Shows the definition in a popup. |
| Hover delay | Milliseconds to wait before the popup shows, from 0 to 2000. |

The settings tab also has the Pro section: sign in with GitHub, the status line and Refresh.

## Pro

The free version has the numbered links for named and inline footnotes in callouts and tables, the hover preview and the jump to the definition. Pro adds the footnote panel, the way back from a definition to its reference, the red warning for a reference without a definition, and the check for unused and missing footnotes. To get it:

1. Sponsor [theluckystrike on GitHub Sponsors](https://github.com/sponsors/theluckystrike) with $5 a month, or $15 once. A total payment of $15 meets the payment requirement for Pro without further payment. Sign-in and the checks below still apply.
2. In Obsidian, open the settings of Footnotes in Callouts and Tables and select "Sign in with GitHub".
3. The plugin copies a code and opens github.com/login/device. Paste the code there and approve.

If you sponsor after you sign in, select Refresh. A negative sponsorship answer turns Pro off.

## FAQ

### Does it change my notes?

No. The plugin reads the text of the note to find the references and the definitions. It never writes to a note.

### Does it work with named labels like `[^source]`?

Yes. The label can hold letters, digits, hyphens and `_`. The link shows the number. Turn off "Show numbers" to show the label.

### Why does a reference in a normal paragraph still show as `[^1]`?

Live Preview draws it that way, and the plugin leaves it. The plugin only changes bare labels.

### Which footnotes does it not handle?

Footnotes in embedded notes, inline footnotes in callout titles or footnote definitions, and inline footnotes that cross a line break. A label that has no letter and no digit, such as `[^-]`, also stays as drawn.

### How is this different from the Footnote Shortcut plugin?

Footnote Shortcut and Tidy Footnotes help you write and tidy footnotes. This plugin changes how references look and work inside callouts and tables.

## Payment, account and network

The core features are free. Pro features need a GitHub Sponsors sponsorship of theluckystrike: $5 a month or more, or $15 once. A total payment of $15 meets the payment requirement for Pro without further payment. Sign-in and the checks below still apply. Your notes stay readable and editable with or without Pro.

GitHub handles the payment. Sponsor at https://github.com/sponsors/theluckystrike. You need no account for the free features. Pro needs the GitHub account that sponsors.

Until you select "Sign in with GitHub" in the settings, Footnotes in Callouts and Tables makes no network requests. Sign in uses the GitHub device flow. Footnotes in Callouts and Tables sends its public client ID and the scope `read:user` to `https://github.com/login/device/code` and shows you a code. While you enter the code at https://github.com/login/device, it asks `https://github.com/login/oauth/access_token` every few seconds to check the sign-in status. The scope permits profile reads only. GitHub needs this access to show the sponsorship tier. It grants no repository scope and no write access.

After sign in, Footnotes in Callouts and Tables sends one query to `https://api.github.com/graphql`. It checks if the signed-in account sponsors theluckystrike. It asks for the tier and the total payment to theluckystrike. The plugin reuses a successful check for 7 days. Failed checks can retry after 6 hours. Select Refresh to request an earlier check. It sends no note content, file names or other vault data, and it has no telemetry.

After a successful check, Pro can work offline for up to 14 days. Sign out or a negative sponsorship answer turns Pro off. The plugin stores the GitHub token through the secret storage API of Obsidian. It does not put the token in its saved settings or its local sponsorship data. The local storage of this device keeps your GitHub login, the tier and the time of the last check. Sign out clears the token. You can also revoke the access in your GitHub settings, under Applications.

## Support

Report bugs and ask for features in the GitHub issues of this repository. Add your Obsidian version and a small sample note.

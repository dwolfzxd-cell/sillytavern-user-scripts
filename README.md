# SillyTavern User Scripts

A [SillyTavern](https://github.com/SillyTavern/SillyTavern) extension that lets you write, manage, and persist custom JavaScript snippets that run automatically on every page load — without touching any files after initial setup.

## Features

- **Write JS snippets** directly in the ST Extensions panel
- **Auto-runs on load** — enabled scripts execute every time ST starts
- **Enable/disable** scripts individually with a single click
- **Drag to reorder** — execution order matters, so you control it
- **Collections / folders** — organize scripts into grouped sections in the settings list
- **Create empty collections** — make folders first, then drag scripts into them later
- **Descriptions** — add a short note to remind yourself what each script does
- **Run now** — test a script instantly without reloading
- **Export/Import** — back up your scripts to a `.json` file and restore them on any machine
- Errors are caught and logged to the console without breaking ST

## Installation

1. Clone or download this repo into your SillyTavern extensions folder:
   ```
   SillyTavern/public/scripts/extensions/third-party/user-scripts/
   ```
2. Restart SillyTavern.
3. Open the **Extensions** panel and enable **User Scripts**.

That's it. Your scripts are stored in `localStorage` and survive page refreshes.

## Usage

Open the **Extensions** panel → **User Scripts** drawer.

- Click **+ New Script** to create a script
- Give it a name, an optional collection, an optional description, and paste your JS
- Hit **▶ Run now** to test it immediately
- Click **Save** — it will now run automatically on every load

Scripts in the list are grouped by collection and each collection can be collapsed when you want a cleaner settings panel.
Use **+ New Collection** to create an empty collection from the toolbar, drag collection headers to reorder the collections themselves, and drag scripts onto a collection header or empty collection area to move them there.

To move scripts between machines or browsers, use the **Export** and **Import** buttons.

## Example Script

Fix SillyTavern's code block copy button pasting double newlines into editors:

```js
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.code-copy');
    if (btn) {
        e.stopImmediatePropagation();
        const code = btn.closest('code');
        if (code) navigator.clipboard.writeText(code.textContent.replace(/\n{2,}/g, '\n'));
    }
}, true);
```

## Notes

- Scripts are stored in SillyTavern's `extensionSettings`, which is persisted server-side. This means scripts automatically sync across all devices and browsers connecting to the same ST instance.
- Use Export/Import to move scripts between separate ST installations.
- Scripts run in the page's JS context and have full access to the ST environment. Be careful with scripts from untrusted sources.

## License

MIT — do whatever you want with it.

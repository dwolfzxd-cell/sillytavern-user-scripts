// ============================================================
// User Scripts Extension for SillyTavern
// Lets you write & persist custom JS snippets that run on load
// ============================================================

const MODULE_NAME = 'user_scripts';
const EXT_NAME = 'User Scripts';
const UNGROUPED_LABEL = 'Ungrouped';

const defaultSettings = Object.freeze({
    scripts: [],
    collections: [],
});

// ---------- Settings helpers ----------

function normalizeGroupName(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeScript(script = {}) {
    return {
        name: typeof script.name === 'string' && script.name.trim() ? script.name.trim() : 'Untitled',
        description: typeof script.description === 'string' ? script.description : '',
        code: typeof script.code === 'string' ? script.code : '',
        enabled: script.enabled !== false,
        autoRun: script.autoRun === true,
        group: normalizeGroupName(script.group),
    };
}

function normalizeCollections(collections) {
    return [...new Set((Array.isArray(collections) ? collections : []).map(normalizeGroupName).filter(Boolean))];
}

function getContext() {
    return SillyTavern.getContext();
}

function getSettings() {
    const { extensionSettings } = getContext();
    if (!extensionSettings[MODULE_NAME]) {
        extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(extensionSettings[MODULE_NAME], key)) {
            extensionSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    extensionSettings[MODULE_NAME].scripts = extensionSettings[MODULE_NAME].scripts.map(normalizeScript);
    extensionSettings[MODULE_NAME].collections = normalizeCollections([
        ...extensionSettings[MODULE_NAME].collections,
        ...extensionSettings[MODULE_NAME].scripts.map(script => script.group),
    ]);
    return extensionSettings[MODULE_NAME];
}

function loadScripts() {
    return getSettings().scripts;
}

function loadCollections() {
    return getSettings().collections;
}

function getAllCollectionNames({ scripts = loadScripts(), collections = loadCollections() } = {}) {
    return normalizeCollections([
        ...collections,
        ...scripts.map(script => script.group),
    ]);
}

function saveState({ scripts = loadScripts(), collections = loadCollections() } = {}) {
    const { saveSettingsDebounced } = getContext();
    const settings = getSettings();
    settings.scripts = scripts.map(normalizeScript);
    settings.collections = getAllCollectionNames({ scripts: settings.scripts, collections });
    saveSettingsDebounced();
}

function saveScripts(scripts) {
    saveState({ scripts });
}

function saveCollections(collections) {
    saveState({ collections });
}

// ---------- Run scripts ----------

// Runs a script regardless of flags — for manual "Run now" use
function runScript(script) {
    try {
        // eslint-disable-next-line no-new-func
        new Function(script.code)();
        console.log(`[User Scripts] ✓ "${script.name}" ran successfully`);
    } catch (err) {
        console.error(`[User Scripts] ✗ "${script.name}" threw an error:`, err);
    }
}

// Runs all scripts that are enabled AND marked as autoRun
function runAllScripts() {
    const scripts = loadScripts();
    scripts
        .filter(s => s.enabled && s.autoRun)
        .forEach(runScript);
}

// ---------- Export / Import ----------

function exportScripts() {
    const data = {
        version: 2,
        collections: loadCollections(),
        scripts: loadScripts(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'user-scripts.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importScripts(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            const importedScripts = Array.isArray(imported)
                ? imported
                : Array.isArray(imported?.scripts)
                    ? imported.scripts
                    : null;

            if (!importedScripts) {
                throw new Error('Expected a JSON array or an object with a scripts array');
            }

            const existing = loadScripts();
            const normalizedImported = importedScripts.map(normalizeScript);
            const importedCollections = Array.isArray(imported?.collections) ? imported.collections : [];
            const existingNames = new Set(existing.map(s => s.name));
            const duplicates = normalizedImported.filter(s => existingNames.has(s.name)).map(s => s.name);

            if (duplicates.length > 0) {
                const proceed = confirm(
                    `The following imported scripts have the same name as existing ones:\n\n• ${duplicates.join('\n• ')}\n\nThey will be added anyway as duplicates. Continue?`
                );
                if (!proceed) return;
            }

            const merged = [...existing, ...normalizedImported];
            const mergedCollections = getAllCollectionNames({
                scripts: merged,
                collections: [...loadCollections(), ...importedCollections],
            });
            saveState({ scripts: merged, collections: mergedCollections });
            renderList();
            updateHint();
            alert(`Imported ${normalizedImported.length} script(s).`);
        } catch (err) {
            alert('Import failed: ' + err.message);
        }
    };
    reader.readAsText(file);
}

// ---------- Build the settings panel UI ----------

function buildUI() {
    const container = document.createElement('div');
    container.id = 'user-scripts-panel';
    container.innerHTML = `
        <div class="us-toolbar">
            <button id="us-add-btn" class="us-btn us-btn-primary">+ New Script</button>
            <button id="us-add-group-btn" class="us-btn us-btn-secondary">+ New Collection</button>
            <button id="us-export-btn" class="us-btn us-btn-secondary">Export</button>
            <label class="us-btn us-btn-secondary us-import-label">
                Import <input id="us-import-input" type="file" accept=".json" style="display:none;" />
            </label>
            <span class="us-hint"></span>
        </div>
        <div id="us-list"></div>
        <div id="us-editor" class="us-editor us-hidden">
            <div class="us-editor-header">
                <input id="us-name-input" class="us-input" type="text" placeholder="Script name..." maxlength="60" />
                <input id="us-group-input" class="us-input us-group-input" type="text" placeholder="Collection / folder (optional)..." maxlength="40" list="us-group-options" />
                <label class="us-toggle-wrap" title="Allow this script to be run manually">
                    <input id="us-enabled-input" type="checkbox" checked />
                    <span>Enabled</span>
                </label>
                <label class="us-toggle-wrap" title="Run this script automatically on every page load">
                    <input id="us-autorun-input" type="checkbox" />
                    <span>Run on startup</span>
                </label>
            </div>
            <input id="us-desc-input" class="us-input us-desc-input" type="text" placeholder="Description (optional)..." maxlength="120" />
            <datalist id="us-group-options"></datalist>
            <textarea id="us-code-input" class="us-textarea" spellcheck="false" placeholder="// Your JavaScript here...
// Example: fix SillyTavern code-block copy double-newlines
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.code-copy');
    if (btn) {
        e.stopImmediatePropagation();
        const code = btn.closest('code');
        if (code) navigator.clipboard.writeText(code.textContent.replace(/\\n{2,}/g, '\\n'));
    }
}, true);"></textarea>
            <div class="us-editor-footer">
                <button id="us-save-btn" class="us-btn us-btn-primary">Save</button>
                <button id="us-run-btn" class="us-btn us-btn-secondary">▶ Run now</button>
                <button id="us-cancel-btn" class="us-btn us-btn-ghost">Cancel</button>
                <span id="us-run-status" class="us-run-status"></span>
            </div>
        </div>
    `;

    return container;
}

function getGroupedScripts(scripts, collections = loadCollections()) {
    const groups = [];
    const lookup = new Map();
    const ungroupedItems = [];

    function ensureGroup(key) {
        if (!key) return null;
        if (!lookup.has(key)) {
            const group = {
                key,
                label: key,
                items: [],
            };
            lookup.set(key, group);
            groups.push(group);
        }
        return lookup.get(key);
    }

    normalizeCollections(collections).forEach(ensureGroup);

    scripts.forEach((script, index) => {
        const key = normalizeGroupName(script.group);
        if (!key) {
            ungroupedItems.push({ script, index });
            return;
        }

        ensureGroup(key).items.push({ script, index });
    });

    if (ungroupedItems.length > 0) {
        groups.unshift({
            key: '',
            label: UNGROUPED_LABEL,
            items: ungroupedItems,
        });
    }

    return groups;
}

function renderScriptItem(script, index) {
    return `
        <div class="us-item ${script.enabled ? '' : 'us-item-disabled'}" data-index="${index}" draggable="true">
            <span class="us-drag-handle" title="Drag to reorder">⠿</span>
            <label class="us-toggle-inline" title="${script.enabled ? 'Click to disable' : 'Click to enable'}">
                <input type="checkbox" class="us-toggle-checkbox" data-index="${index}" ${script.enabled ? 'checked' : ''} />
            </label>
            <div class="us-item-text">
                <span class="us-item-name">${escapeHtml(script.name || 'Untitled')}</span>
                ${script.description ? `<span class="us-item-desc">${escapeHtml(script.description)}</span>` : ''}
            </div>
            <div class="us-item-badges">
                ${script.autoRun ? '<span class="us-badge us-badge-autorun" title="Runs on startup">startup</span>' : ''}
            </div>
            <div class="us-item-actions">
                <button class="us-btn us-btn-xs us-btn-secondary us-edit-btn" data-index="${index}">Edit</button>
                <button class="us-btn us-btn-xs us-btn-run us-runone-btn" data-index="${index}" title="Run this script now">▶</button>
                <button class="us-btn us-btn-xs us-btn-danger us-delete-btn" data-index="${index}">✕</button>
            </div>
        </div>
    `;
}

const collapsedGroups = new Set();

function renderGroupSection(group, showHeader) {
    const isCollapsed = collapsedGroups.has(group.key);
    const itemsMarkup = group.items.map(({ script, index }) => renderScriptItem(script, index)).join('');

    if (!showHeader) {
        return itemsMarkup;
    }

    return `
        <div class="us-group ${isCollapsed ? 'us-group-collapsed' : ''}" data-group-key="${escapeAttribute(group.key)}">
            <button
                class="us-group-header ${group.key ? 'us-group-header-draggable' : ''}"
                type="button"
                data-group-key="${escapeAttribute(group.key)}"
                ${group.key ? 'draggable="true" title="Click to collapse or drag to reorder collection"' : ''}
            >
                ${group.key ? '<span class="us-group-drag-handle" title="Drag to reorder collection">⠿</span>' : ''}
                <span class="us-group-chevron">${isCollapsed ? '▸' : '▾'}</span>
                <span class="us-group-title">${escapeHtml(group.label)}</span>
                <span class="us-group-count">${group.items.length}</span>
            </button>
            <div class="us-group-items" data-group-key="${escapeAttribute(group.key)}">
                ${itemsMarkup || `<div class="us-group-empty" data-group-key="${escapeAttribute(group.key)}">Drop scripts here</div>`}
            </div>
        </div>
    `;
}

function refreshGroupOptions() {
    const groupOptions = document.getElementById('us-group-options');
    if (!groupOptions) return;

    const groups = getAllCollectionNames();
    groupOptions.innerHTML = groups.map(group => `<option value="${escapeAttribute(group)}"></option>`).join('');
}

function renderList() {
    const list = document.getElementById('us-list');
    if (!list) return;
    const scripts = loadScripts();
    const collections = loadCollections();
    refreshGroupOptions();

    if (scripts.length === 0 && collections.length === 0) {
        list.innerHTML = '<div class="us-empty">No scripts yet. Click <strong>+ New Script</strong> to add one.</div>';
        updateHint();
        return;
    }

    const groups = getGroupedScripts(scripts, collections);
    const showHeaders = groups.length !== 1 || groups[0]?.key !== '';
    list.innerHTML = groups.map(group => renderGroupSection(group, showHeaders)).join('');

    attachDragAndDrop();
    updateHint();
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
}

// ---------- Drag and drop reordering ----------

let dragState = null;
let lastDragDropAt = 0;

function clearDragIndicators(list) {
    list.querySelectorAll('.us-drag-over').forEach(element => element.classList.remove('us-drag-over'));
    list.querySelectorAll('.us-group-drop-target').forEach(element => element.classList.remove('us-group-drop-target'));
    list.querySelectorAll('.us-group-reorder-before').forEach(element => element.classList.remove('us-group-reorder-before'));
    list.querySelectorAll('.us-group-reorder-after').forEach(element => element.classList.remove('us-group-reorder-after'));
    list.querySelectorAll('.us-group-dragging').forEach(element => element.classList.remove('us-group-dragging'));
}

function getGroupFirstIndex(scripts, groupKey) {
    return scripts.findIndex(script => normalizeGroupName(script.group) === groupKey);
}

function getGroupLastIndex(scripts, groupKey) {
    let lastIndex = -1;
    scripts.forEach((script, index) => {
        if (normalizeGroupName(script.group) === groupKey) {
            lastIndex = index;
        }
    });
    return lastIndex;
}

function getGroupDropInsertionIndex(scripts, groupKey) {
    const lastIndex = getGroupLastIndex(scripts, groupKey);
    if (lastIndex !== -1) {
        return lastIndex + 1;
    }

    const orderedKeys = getGroupedScripts(scripts, loadCollections()).map(group => group.key);
    const targetPosition = orderedKeys.indexOf(groupKey);
    if (targetPosition === -1) {
        return scripts.length;
    }

    for (let index = targetPosition + 1; index < orderedKeys.length; index++) {
        const nextGroupIndex = getGroupFirstIndex(scripts, orderedKeys[index]);
        if (nextGroupIndex !== -1) {
            return nextGroupIndex;
        }
    }

    return scripts.length;
}

function updateEditingIndexAfterMove(sourceIndex, targetIndex) {
    if (editingIndex === null) return;

    if (editingIndex === sourceIndex) {
        editingIndex = targetIndex;
        return;
    }

    let nextIndex = editingIndex;
    if (sourceIndex < nextIndex) nextIndex--;
    if (targetIndex <= nextIndex) nextIndex++;
    editingIndex = nextIndex;
}

function syncEditingIndexAfterReorder(originalScripts, reorderedScripts) {
    if (editingIndex === null) return;

    const editingScript = originalScripts[editingIndex];
    editingIndex = reorderedScripts.indexOf(editingScript);
}

function moveScript(sourceIndex, targetIndex, targetGroup) {
    const scripts = loadScripts();
    const sourceScript = scripts[sourceIndex];
    if (!sourceScript) return;

    const normalizedTargetGroup = normalizeGroupName(targetGroup);
    const sourceGroup = normalizeGroupName(sourceScript.group);
    const [moved] = scripts.splice(sourceIndex, 1);
    moved.group = normalizedTargetGroup;

    const finalIndex = Math.min(targetIndex, scripts.length);
    const hasPositionChange = sourceIndex !== finalIndex;
    const hasGroupChange = sourceGroup !== normalizedTargetGroup;
    if (!hasPositionChange && !hasGroupChange) {
        scripts.splice(sourceIndex, 0, moved);
        dragState = null;
        return;
    }

    scripts.splice(finalIndex, 0, moved);
    saveScripts(scripts);
    updateEditingIndexAfterMove(sourceIndex, finalIndex);
    renderList();
    dragState = null;
    lastDragDropAt = Date.now();
}

function getCollectionDropPlacement(event, header) {
    const rect = header.getBoundingClientRect();
    return event.clientY < rect.top + (rect.height / 2) ? 'before' : 'after';
}

function moveCollection(sourceKey, targetKey, placement) {
    const normalizedSourceKey = normalizeGroupName(sourceKey);
    const normalizedTargetKey = normalizeGroupName(targetKey);
    if (!normalizedSourceKey || !normalizedTargetKey || normalizedSourceKey === normalizedTargetKey) {
        dragState = null;
        return;
    }

    const collections = [...loadCollections()];
    const sourceIndex = collections.indexOf(normalizedSourceKey);
    const targetIndex = collections.indexOf(normalizedTargetKey);
    if (sourceIndex === -1 || targetIndex === -1) {
        dragState = null;
        return;
    }

    const nextCollections = [...collections];
    nextCollections.splice(sourceIndex, 1);
    const adjustedTargetIndex = nextCollections.indexOf(normalizedTargetKey);
    const insertIndex = placement === 'after' ? adjustedTargetIndex + 1 : adjustedTargetIndex;
    nextCollections.splice(insertIndex, 0, normalizedSourceKey);

    const scripts = loadScripts();
    const scriptsByGroup = new Map();
    scripts.forEach(script => {
        const key = normalizeGroupName(script.group);
        if (!scriptsByGroup.has(key)) {
            scriptsByGroup.set(key, []);
        }
        scriptsByGroup.get(key).push(script);
    });

    const reorderedScripts = [];
    if (scriptsByGroup.has('')) {
        reorderedScripts.push(...scriptsByGroup.get(''));
        scriptsByGroup.delete('');
    }

    nextCollections.forEach(key => {
        if (scriptsByGroup.has(key)) {
            reorderedScripts.push(...scriptsByGroup.get(key));
            scriptsByGroup.delete(key);
        }
    });

    scriptsByGroup.forEach(groupScripts => {
        reorderedScripts.push(...groupScripts);
    });

    saveState({ scripts: reorderedScripts, collections: nextCollections });
    syncEditingIndexAfterReorder(scripts, reorderedScripts);
    renderList();
    dragState = null;
    lastDragDropAt = Date.now();
}

function attachDragAndDrop() {
    const list = document.getElementById('us-list');
    if (!list) return;

    list.querySelectorAll('.us-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragState = {
                type: 'script',
                index: parseInt(item.dataset.index, 10),
            };
            item.classList.add('us-dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('us-dragging');
            clearDragIndicators(list);
            dragState = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            clearDragIndicators(list);
            item.classList.add('us-drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dropIndex = parseInt(item.dataset.index, 10);
            if (dragState?.type !== 'script') return;

            const scripts = loadScripts();
            const targetGroup = normalizeGroupName(scripts[dropIndex]?.group);
            moveScript(dragState.index, dropIndex, targetGroup);
        });
    });

    list.querySelectorAll('.us-group-header').forEach(header => {
        header.addEventListener('dragstart', (e) => {
            const groupKey = header.dataset.groupKey || '';
            if (!groupKey) {
                e.preventDefault();
                return;
            }
            dragState = { type: 'collection', key: groupKey };
            header.closest('.us-group')?.classList.add('us-group-dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        header.addEventListener('dragend', () => {
            clearDragIndicators(list);
            dragState = null;
        });

        header.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            clearDragIndicators(list);
            const groupElement = header.closest('.us-group');
            if (!groupElement) return;

            if (dragState?.type === 'collection') {
                const placement = getCollectionDropPlacement(e, header);
                groupElement.classList.add(placement === 'before' ? 'us-group-reorder-before' : 'us-group-reorder-after');
                return;
            }

            if (dragState?.type === 'script') {
                groupElement.classList.add('us-group-drop-target');
            }
        });

        header.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const groupKey = header.dataset.groupKey || '';

            if (dragState?.type === 'collection') {
                moveCollection(dragState.key, groupKey, getCollectionDropPlacement(e, header));
                return;
            }

            if (dragState?.type !== 'script') return;

            const scripts = loadScripts();
            moveScript(dragState.index, getGroupDropInsertionIndex(scripts, groupKey), groupKey);
        });
    });

    list.querySelectorAll('.us-group-items, .us-group-empty').forEach(target => {
        target.addEventListener('dragover', (e) => {
            if (dragState?.type !== 'script') return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            clearDragIndicators(list);
            target.closest('.us-group')?.classList.add('us-group-drop-target');
        });

        target.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (dragState?.type !== 'script') return;

            const groupKey = target.dataset.groupKey ?? target.closest('.us-group')?.dataset.groupKey ?? '';
            const scripts = loadScripts();
            moveScript(dragState.index, getGroupDropInsertionIndex(scripts, groupKey), groupKey);
        });
    });
}

// ---------- Editor state ----------

let editingIndex = null;

function openEditor(index = null) {
    const scripts = loadScripts();
    editingIndex = index;

    const editor = document.getElementById('us-editor');
    const nameInput = document.getElementById('us-name-input');
    const groupInput = document.getElementById('us-group-input');
    const descInput = document.getElementById('us-desc-input');
    const codeInput = document.getElementById('us-code-input');
    const enabledInput = document.getElementById('us-enabled-input');
    const autoRunInput = document.getElementById('us-autorun-input');
    refreshGroupOptions();

    if (index !== null && scripts[index]) {
        nameInput.value = scripts[index].name || '';
        groupInput.value = scripts[index].group || '';
        descInput.value = scripts[index].description || '';
        codeInput.value = scripts[index].code || '';
        enabledInput.checked = scripts[index].enabled !== false;
        autoRunInput.checked = scripts[index].autoRun === true;
    } else {
        nameInput.value = '';
        groupInput.value = '';
        descInput.value = '';
        codeInput.value = '';
        enabledInput.checked = true;
        autoRunInput.checked = false;
    }

    editor.classList.remove('us-hidden');
    nameInput.focus();
    clearRunStatus();
}

function closeEditor() {
    const editor = document.getElementById('us-editor');
    editor.classList.add('us-hidden');
    editingIndex = null;
    clearRunStatus();
}

function saveCurrentScript() {
    const name = document.getElementById('us-name-input').value.trim() || 'Untitled';
    const group = normalizeGroupName(document.getElementById('us-group-input').value);
    const description = document.getElementById('us-desc-input').value.trim();
    const code = document.getElementById('us-code-input').value;
    const enabled = document.getElementById('us-enabled-input').checked;
    const autoRun = document.getElementById('us-autorun-input').checked;

    const scripts = loadScripts();

    if (editingIndex !== null && scripts[editingIndex]) {
        scripts[editingIndex] = { name, group, description, code, enabled, autoRun };
    } else {
        scripts.push({ name, group, description, code, enabled, autoRun });
    }

    saveScripts(scripts);
    renderList();
    updateHint();
    closeEditor();
}

function createCollection() {
    const input = prompt('Collection name?');
    if (input === null) return;

    const name = normalizeGroupName(input);
    if (!name) {
        alert('Collection name cannot be empty.');
        return;
    }

    const collections = loadCollections();
    if (collections.includes(name)) {
        alert(`Collection "${name}" already exists.`);
        return;
    }

    saveCollections([...collections, name]);
    collapsedGroups.delete(name);
    renderList();
    updateHint();
}

function runCurrentInEditor() {
    const code = document.getElementById('us-code-input').value;
    const status = document.getElementById('us-run-status');
    try {
        // eslint-disable-next-line no-new-func
        new Function(code)();
        status.textContent = '✓ Ran OK';
        status.className = 'us-run-status us-run-ok';
    } catch (err) {
        status.textContent = '✗ ' + err.message;
        status.className = 'us-run-status us-run-err';
    }
}

function clearRunStatus() {
    const status = document.getElementById('us-run-status');
    if (status) { status.textContent = ''; status.className = 'us-run-status'; }
}

function toggleScript(index) {
    const scripts = loadScripts();
    if (!scripts[index]) return;
    scripts[index].enabled = !scripts[index].enabled;
    saveScripts(scripts);
    renderList();
}

function deleteScript(index) {
    const scripts = loadScripts();
    const name = scripts[index]?.name || 'this script';
    if (!confirm(`Delete "${name}"?`)) return;
    scripts.splice(index, 1);
    saveScripts(scripts);
    renderList();
    updateHint();
    if (editingIndex === index) closeEditor();
}

function updateHint() {
    const hint = document.querySelector('.us-hint');
    if (!hint) return;
    const scripts = loadScripts();
    const groups = getGroupedScripts(scripts, loadCollections());
    const enabled = scripts.filter(s => s.enabled).length;
    const autoRun = scripts.filter(s => s.enabled && s.autoRun).length;
    hint.textContent = `${scripts.length} script(s) in ${groups.length} collection(s) — ${enabled} enabled, ${autoRun} run on startup`;
}

// ---------- Wire up events (delegated) ----------

function attachEvents(container) {
    container.addEventListener('click', (e) => {
        if (e.target.id === 'us-add-btn') { openEditor(null); return; }
        if (e.target.id === 'us-add-group-btn') { createCollection(); return; }
        if (e.target.id === 'us-save-btn') { saveCurrentScript(); return; }
        if (e.target.id === 'us-run-btn') { runCurrentInEditor(); return; }
        if (e.target.id === 'us-cancel-btn') { closeEditor(); return; }
        if (e.target.id === 'us-export-btn') { exportScripts(); return; }

        const groupHeader = e.target.closest('.us-group-header');
        if (groupHeader) {
            if (Date.now() - lastDragDropAt < 250) return;
            const groupKey = groupHeader.dataset.groupKey || '';
            if (collapsedGroups.has(groupKey)) {
                collapsedGroups.delete(groupKey);
            } else {
                collapsedGroups.add(groupKey);
            }
            renderList();
            return;
        }

        if (e.target.classList.contains('us-edit-btn')) {
            openEditor(parseInt(e.target.dataset.index, 10));
            return;
        }
        if (e.target.classList.contains('us-delete-btn')) {
            deleteScript(parseInt(e.target.dataset.index, 10));
            return;
        }
        if (e.target.classList.contains('us-runone-btn')) {
            const idx = parseInt(e.target.dataset.index, 10);
            const scripts = loadScripts();
            if (scripts[idx]) runScript(scripts[idx]);
            return;
        }
    });

    container.addEventListener('change', (e) => {
        if (e.target.classList.contains('us-toggle-checkbox')) {
            toggleScript(parseInt(e.target.dataset.index, 10));
            return;
        }
        if (e.target.id === 'us-import-input' && e.target.files[0]) {
            importScripts(e.target.files[0]);
            e.target.value = '';
        }
    });
}

// ---------- Register with SillyTavern ----------

jQuery(async () => {
    getSettings();
    runAllScripts();

    const settingsHtml = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>User Scripts</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content" id="user-scripts-drawer-content">
            </div>
        </div>
    `;
    $('#extensions_settings').append(settingsHtml);

    const drawerContent = document.getElementById('user-scripts-drawer-content');
    if (drawerContent) {
        const panel = buildUI();
        drawerContent.appendChild(panel);
        renderList();
        attachEvents(panel);
    }

    console.log(`[${EXT_NAME}] Loaded.`);
});

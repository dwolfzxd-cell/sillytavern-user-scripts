// ============================================================
// User Scripts Extension for SillyTavern
// Lets you write & persist custom JS snippets that run on load
// ============================================================

const STORAGE_KEY = 'user_scripts_list';
const EXT_NAME = 'User Scripts';

// ---------- Storage helpers ----------

function loadScripts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveScripts(scripts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

// ---------- Run a single script ----------

function runScript(script) {
  if (!script.enabled) return;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(script.code);
    fn();
    console.log(`[User Scripts] ✓ "${script.name}" ran successfully`);
  } catch (err) {
    console.error(`[User Scripts] ✗ "${script.name}" threw an error:`, err);
  }
}

// ---------- Run all enabled scripts on load ----------

function runAllScripts() {
  const scripts = loadScripts();
  scripts.forEach(runScript);
}

// ---------- Export / Import ----------

function exportScripts() {
  const scripts = loadScripts();
  const blob = new Blob([JSON.stringify(scripts, null, 2)], { type: 'application/json' });
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
      if (!Array.isArray(imported)) throw new Error('Expected a JSON array');

      const existing = loadScripts();
      const existingNames = new Set(existing.map(s => s.name));
      const duplicates = imported.filter(s => existingNames.has(s.name)).map(s => s.name);

      if (duplicates.length > 0) {
        const proceed = confirm(
          `The following imported scripts have the same name as existing ones:\n\n• ${duplicates.join('\n• ')}\n\nThey will be added anyway as duplicates. Continue?`
        );
        if (!proceed) return;
      }

      const merged = [...existing, ...imported];
      saveScripts(merged);
      renderList();
      updateHint();
      alert(`Imported ${imported.length} script(s).`);
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
                <label class="us-toggle-wrap">
                    <input id="us-enabled-input" type="checkbox" checked />
                    <span>Enabled</span>
                </label>
            </div>
            <input id="us-desc-input" class="us-input us-desc-input" type="text" placeholder="Description (optional)..." maxlength="120" />
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

function renderList() {
  const list = document.getElementById('us-list');
  if (!list) return;
  const scripts = loadScripts();

  if (scripts.length === 0) {
    list.innerHTML = '<div class="us-empty">No scripts yet. Click <strong>+ New Script</strong> to add one.</div>';
    updateHint();
    return;
  }

  list.innerHTML = scripts.map((s, i) => `
        <div class="us-item ${s.enabled ? '' : 'us-item-disabled'}" data-index="${i}" draggable="true">
            <span class="us-drag-handle" title="Drag to reorder">⠿</span>
            <label class="us-toggle-inline" title="${s.enabled ? 'Click to disable' : 'Click to enable'}">
                <input type="checkbox" class="us-toggle-checkbox" data-index="${i}" ${s.enabled ? 'checked' : ''} />
            </label>
            <div class="us-item-text">
                <span class="us-item-name">${escapeHtml(s.name || 'Untitled')}</span>
                ${s.description ? `<span class="us-item-desc">${escapeHtml(s.description)}</span>` : ''}
            </div>
            <div class="us-item-actions">
                <button class="us-btn us-btn-xs us-btn-secondary us-edit-btn" data-index="${i}">Edit</button>
                <button class="us-btn us-btn-xs us-btn-run us-runone-btn" data-index="${i}" title="Run this script now">▶</button>
                <button class="us-btn us-btn-xs us-btn-danger us-delete-btn" data-index="${i}">✕</button>
            </div>
        </div>
    `).join('');

  attachDragAndDrop();
  updateHint();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- Drag and drop reordering ----------

let dragSrcIndex = null;

function attachDragAndDrop() {
  const list = document.getElementById('us-list');
  if (!list) return;

  list.querySelectorAll('.us-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragSrcIndex = parseInt(item.dataset.index, 10);
      item.classList.add('us-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('us-dragging');
      list.querySelectorAll('.us-item').forEach(i => i.classList.remove('us-drag-over'));
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      list.querySelectorAll('.us-item').forEach(i => i.classList.remove('us-drag-over'));
      item.classList.add('us-drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropIndex = parseInt(item.dataset.index, 10);
      if (dragSrcIndex === null || dragSrcIndex === dropIndex) return;

      const scripts = loadScripts();
      const [moved] = scripts.splice(dragSrcIndex, 1);
      scripts.splice(dropIndex, 0, moved);
      saveScripts(scripts);

      // Keep editor pointing at the correct script after reorder
      if (editingIndex === dragSrcIndex) {
        editingIndex = dropIndex;
      } else if (editingIndex !== null) {
        if (dragSrcIndex < editingIndex && dropIndex >= editingIndex) editingIndex--;
        else if (dragSrcIndex > editingIndex && dropIndex <= editingIndex) editingIndex++;
      }

      renderList();
      dragSrcIndex = null;
    });
  });
}

// ---------- Editor state ----------

let editingIndex = null; // null = new script

function openEditor(index = null) {
  const scripts = loadScripts();
  editingIndex = index;

  const editor = document.getElementById('us-editor');
  const nameInput = document.getElementById('us-name-input');
  const descInput = document.getElementById('us-desc-input');
  const codeInput = document.getElementById('us-code-input');
  const enabledInput = document.getElementById('us-enabled-input');

  if (index !== null && scripts[index]) {
    nameInput.value = scripts[index].name || '';
    descInput.value = scripts[index].description || '';
    codeInput.value = scripts[index].code || '';
    enabledInput.checked = scripts[index].enabled !== false;
  } else {
    nameInput.value = '';
    descInput.value = '';
    codeInput.value = '';
    enabledInput.checked = true;
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
  const description = document.getElementById('us-desc-input').value.trim();
  const code = document.getElementById('us-code-input').value;
  const enabled = document.getElementById('us-enabled-input').checked;

  const scripts = loadScripts();

  if (editingIndex !== null && scripts[editingIndex]) {
    scripts[editingIndex] = { name, description, code, enabled };
  } else {
    scripts.push({ name, description, code, enabled });
  }

  saveScripts(scripts);
  renderList();
  updateHint();
  closeEditor();
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
  const enabled = scripts.filter(s => s.enabled).length;
  hint.textContent = `${scripts.length} script(s) — ${enabled} enabled`;
}

// ---------- Wire up events (delegated) ----------

function attachEvents(container) {
  container.addEventListener('click', (e) => {
    if (e.target.id === 'us-add-btn') { openEditor(null); return; }
    if (e.target.id === 'us-save-btn') { saveCurrentScript(); return; }
    if (e.target.id === 'us-run-btn') { runCurrentInEditor(); return; }
    if (e.target.id === 'us-cancel-btn') { closeEditor(); return; }
    if (e.target.id === 'us-export-btn') { exportScripts(); return; }

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

  // Toggle checkbox and import file input
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
  // 1. Run all saved scripts immediately
  runAllScripts();

  // 2. Add settings panel to ST's Extensions tab
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
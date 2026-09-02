/*! Inline Visual CMS — complete engine */
(function () {
  'use strict';
  var STORAGE_KEY = 'ivc_cms_config_v1';
  var BLOCKS = [
    { id: 'h2', label: '見出し', html: '<h2>新しい見出し</h2>' },
    { id: 'p', label: '段落', html: '<p>ここに本文を入力します。</p>' },
    { id: 'card', label: 'カード', html: '<section style="padding:1rem;border:1px solid #ddd;border-radius:12px;margin:1rem 0"><h3>カード</h3><p>内容</p></section>' },
    { id: 'list', label: 'リスト', html: '<ul><li>項目1</li><li>項目2</li></ul>' },
    { id: 'quote', label: '引用', html: '<blockquote style="border-left:4px solid #3b82f6;padding:.5rem 1rem;margin:1rem 0">引用文</blockquote>' },
    { id: 'btn', label: 'ボタン', html: '<p><a href="#" style="display:inline-block;padding:.6rem 1rem;border-radius:999px;background:#3b82f6;color:#fff;text-decoration:none">リンク</a></p>' }
  ];
  var cfg = { owner: '', repo: '', branch: 'main', token: '', name: '', backup: '', remember: true };
  var state = { path: null, mode: 'visual', selected: null, originalHtml: null, fileSha: null, pageStyles: {}, undoStack: [], redoStack: [], undoLock: false };

  function $(id) { return document.getElementById(id); }
  function show(id) {
    ['view-login', 'view-dash', 'view-editor'].forEach(function (v) {
      var el = $(v); if (el) el.classList.toggle('hidden', v !== id);
    });
  }
  function status(msg) { var s = $('status'); if (s) s.textContent = msg; }
  function loginMsg(msg) { var m = $('login-msg'); if (m) m.textContent = msg || ''; }

  function loadConfig() {
    try {
      var o = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      Object.keys(cfg).forEach(function (k) { if (o[k] != null) cfg[k] = o[k]; });
    } catch (e) {}
  }
  function saveConfig() {
    if (!cfg.remember) { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} return; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) {}
  }
  function clearConfig() {
    cfg.token = '';
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  function apiBase() { return 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents'; }
  function backupApiBase() { return cfg.backup ? 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.backup + '/contents' : null; }
  function headers(json) {
    var h = {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }
  function decode(c) {
    try { return decodeURIComponent(escape(atob(String(c).replace(/\n/g, '')))); }
    catch (e) { return atob(String(c).replace(/\n/g, '')); }
  }
  function encode(s) { return btoa(unescape(encodeURIComponent(s))); }
  function formatNow() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  function friendlyErr(status, body) {
    var t = String(body || '');
    if (status === 401) return 'Token が無効です。再発行してください。';
    if (status === 403 || t.indexOf('Resource not accessible') >= 0) {
      return '権限不足です。PAT に Contents: Read and write を付け、対象リポジトリを許可してください。';
    }
    if (status === 404) return 'リポジトリまたはパスが見つかりません（Owner/Repo/Branch を確認）。';
    try { var j = JSON.parse(t); if (j && j.message) return j.message; } catch (e) {}
    return t || ('HTTP ' + status);
  }

  function getFile(path, base) {
    var b = base || apiBase();
    return fetch(b + '/' + path + '?ref=' + encodeURIComponent(cfg.branch), { headers: headers() })
      .then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) throw new Error(friendlyErr(r.status, t));
          return JSON.parse(t);
        });
      });
  }
  function putFile(path, content, message, sha, base) {
    var b = base || apiBase();
    var body = { message: message, content: encode(content), branch: cfg.branch };
    if (sha) body.sha = sha;
    return fetch(b + '/' + path, { method: 'PUT', headers: headers(true), body: JSON.stringify(body) })
      .then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) throw new Error(friendlyErr(r.status, t));
          return JSON.parse(t);
        });
      });
  }
  function listDir(path) {
    var url = apiBase() + (path ? '/' + path : '') + '?ref=' + encodeURIComponent(cfg.branch);
    return fetch(url, { headers: headers() }).then(function (r) {
      return r.text().then(function (t) {
        if (!r.ok) throw new Error(friendlyErr(r.status, t));
        var d = JSON.parse(t);
        return Array.isArray(d) ? d : [];
      });
    });
  }

  function connect() {
    cfg.owner = (($('cfg-owner') && $('cfg-owner').value) || '').trim().replace(/^@/, '');
    cfg.repo = (($('cfg-repo') && $('cfg-repo').value) || '').trim();
    cfg.branch = (($('cfg-branch') && $('cfg-branch').value) || 'main').trim() || 'main';
    cfg.token = (($('cfg-token') && $('cfg-token').value) || '').trim();
    cfg.name = (($('cfg-name') && $('cfg-name').value) || '').trim() || cfg.owner;
    cfg.backup = (($('cfg-backup') && $('cfg-backup').value) || '').trim();
    cfg.remember = !($('cfg-remember') && !$('cfg-remember').checked);

    if (!cfg.owner || !cfg.repo || !cfg.token) {
      loginMsg('Owner / Repository / Token は必須です');
      return;
    }
    if (!/^gh[pousr]_[A-Za-z0-9_]+/.test(cfg.token) && !/^github_pat_[A-Za-z0-9_]+/.test(cfg.token)) {
      loginMsg('Token 形式が不正です（ghp_ / github_pat_ で始まる必要があります）');
      return;
    }

    loginMsg('接続確認中…');
    var btn = $('btn-connect');
    if (btn) { btn.disabled = true; btn.textContent = '接続中…'; }

    fetch('https://api.github.com/user', { headers: headers() })
      .then(function (r) {
        return r.text().then(function (t) {
          if (!r.ok) throw new Error(friendlyErr(r.status, t));
          var u = JSON.parse(t);
          if (!cfg.name || cfg.name === cfg.owner) cfg.name = u.name || u.login || cfg.owner;
          return u;
        });
      })
      .then(function () { return listDir(''); })
      .then(function () {
        saveConfig();
        loginMsg('');
        openDash();
      })
      .catch(function (e) {
        loginMsg('接続失敗: ' + (e && e.message ? e.message : e));
      })
      .finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = '接続'; }
      });
  }

  function disconnect() {
    clearConfig();
    if ($('cfg-token')) $('cfg-token').value = '';
    show('view-login');
  }

  function openDash() {
    show('view-dash');
    if ($('dash-repo')) $('dash-repo').textContent = cfg.owner + '/' + cfg.repo + '@' + cfg.branch;
    if ($('dash-user')) $('dash-user').textContent = cfg.name;
    loadPages();
  }

  function collectHtml(paths, items, jobs) {
    (items || []).forEach(function (it) {
      var p = it.path || it.name;
      if (it.type === 'file' && /\.html?$/i.test(it.name) && it.name.toLowerCase() !== 'admin.html') {
        paths.push(p);
      } else if (it.type === 'dir' && it.name !== '.github' && it.name !== 'node_modules' && it.name !== '.git') {
        jobs.push(listDir(p).then(function (sub) { return collectHtml(paths, sub, jobs); }));
      }
    });
    return Promise.resolve();
  }

  function loadPages() {
    var grid = $('page-grid'), st = $('dash-status');
    if (!grid) return;
    grid.innerHTML = '';
    if (st) st.textContent = '読み込み中…';
    var paths = [], jobs = [];
    listDir('').then(function (root) {
      return collectHtml(paths, root, jobs).then(function () { return Promise.all(jobs); });
    }).then(function () {
      var uniq = [];
      paths.forEach(function (p) { if (uniq.indexOf(p) < 0) uniq.push(p); });
      uniq.sort();
      if (st) st.textContent = uniq.length ? (uniq.length + ' ページ') : 'HTML が見つかりません';
      return Promise.all(uniq.map(function (p) {
        return getFile(p).then(function (f) {
          var html = decode(f.content);
          var m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          return { path: p, title: m ? m[1].replace(/\s+/g, ' ').trim() : p };
        }).catch(function () { return { path: p, title: p }; });
      }));
    }).then(function (items) {
      items.forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'page-card';
        b.innerHTML = '<span class="t"></span><span class="p mono muted"></span>';
        b.querySelector('.t').textContent = it.title;
        b.querySelector('.p').textContent = it.path;
        b.onclick = function () { openEditor(it.path); };
        grid.appendChild(b);
      });
    }).catch(function (e) {
      if (st) st.textContent = '読込失敗: ' + e.message;
    });
  }

  function frame() { return $('preview-frame'); }
  function doc() { var f = frame(); return f && f.contentDocument ? f.contentDocument : null; }

  function openEditor(path) {
    state.path = path;
    state.pageStyles = {};
    state.undoStack = [];
    state.redoStack = [];
    state.selected = null;
    show('view-editor');
    if ($('ed-path')) $('ed-path').textContent = path;
    if ($('ed-title')) $('ed-title').textContent = '読み込み中…';
    if ($('commit-msg')) $('commit-msg').value = '';
    status('読み込み中…');
    setMode('visual');
    populateBlocks();
    getFile(path).then(function (f) {
      state.fileSha = f.sha;
      state.originalHtml = decode(f.content);
      var m = state.originalHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if ($('ed-title')) $('ed-title').textContent = m ? m[1].replace(/\s+/g, ' ').trim() : path;
      var frme = frame();
      frme.onload = function () { setupFrameEvents(); status('編集可能 — 要素をクリック'); };
      frme.srcdoc = state.originalHtml;
      if ($('code-area')) $('code-area').value = state.originalHtml;
    }).catch(function (e) { status('読込失敗: ' + e.message); });
  }

  function setMode(mode) {
    state.mode = mode;
    var vis = mode === 'visual';
    if (frame()) frame().classList.toggle('hidden', !vis);
    if ($('code-area')) $('code-area').classList.toggle('hidden', vis);
    if (!vis && doc()) { try { $('code-area').value = exportHtml(); } catch (e) {} }
  }

  function isLocked(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.closest && el.closest('[data-lock="true"]')) return true;
    return el.getAttribute('data-lock') === 'true';
  }
  function ensureCmsId(el) {
    if (!el || el.nodeType !== 1) return '';
    var id = el.getAttribute('data-cms-id');
    if (!id) { id = 'c' + Math.random().toString(36).slice(2, 10); el.setAttribute('data-cms-id', id); }
    return id;
  }
  function camelToKebab(s) { return String(s).replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }); }
  function buildPageCss() {
    var parts = ['/* Inline Visual CMS */', ''];
    Object.keys(state.pageStyles || {}).forEach(function (id) {
      var rules = state.pageStyles[id];
      if (!rules) return;
      var isBody = id === 'cms-body';
      var lines = Object.keys(rules).map(function (k) {
        var val = rules[k];
        if (val === '' || val == null) return '';
        return '  ' + camelToKebab(k) + ': ' + val + (isBody ? ' !important' : '') + ';';
      }).filter(Boolean).join('\n');
      if (!lines) return;
      if (isBody) {
        parts.push('html, body {\n' + lines + '\n}');
        parts.push('body[data-cms-id="cms-body"] {\n' + lines + '\n}');
      } else {
        parts.push('[data-cms-id="' + id + '"] {\n' + lines + '\n}');
      }
      parts.push('');
    });
    return parts.join('\n') + '\n';
  }
  function refreshPageStyleTag() {
    var d = doc(); if (!d) return;
    var tag = d.getElementById('cms-page-style');
    if (!tag) { tag = d.createElement('style'); tag.id = 'cms-page-style'; (d.head || d.documentElement).appendChild(tag); }
    tag.textContent = buildPageCss();
  }
  function recordStyle(el, styles) {
    if (!el || !styles) return;
    var id = ensureCmsId(el);
    if (!state.pageStyles[id]) state.pageStyles[id] = {};
    Object.keys(styles).forEach(function (k) {
      var v = styles[k];
      if (v === '' || v == null) { delete state.pageStyles[id][k]; el.style[k] = ''; }
      else { state.pageStyles[id][k] = v; el.style[k] = v; }
    });
    refreshPageStyleTag();
  }

  function pushUndo() {
    if (state.undoLock) return;
    var d = doc(); if (!d || !d.body) return;
    state.undoStack.push({ html: d.body.innerHTML, styles: JSON.parse(JSON.stringify(state.pageStyles || {})) });
    if (state.undoStack.length > 40) state.undoStack.shift();
    state.redoStack = [];
  }
  function restore(snap) {
    var d = doc(); if (!d || !snap) return;
    state.undoLock = true;
    try {
      clearSelection();
      d.body.innerHTML = snap.html;
      state.pageStyles = snap.styles || {};
      refreshPageStyleTag();
      setupFrameEvents();
    } finally { state.undoLock = false; }
  }
  function undoEdit() {
    if (!state.undoStack.length) { status('戻す履歴がありません'); return; }
    var d = doc();
    state.redoStack.push({ html: d.body.innerHTML, styles: JSON.parse(JSON.stringify(state.pageStyles || {})) });
    restore(state.undoStack.pop());
    status('元に戻しました');
  }
  function redoEdit() {
    if (!state.redoStack.length) { status('やり直し履歴がありません'); return; }
    var d = doc();
    state.undoStack.push({ html: d.body.innerHTML, styles: JSON.parse(JSON.stringify(state.pageStyles || {})) });
    restore(state.redoStack.pop());
    status('やり直しました');
  }

  function clearSelection() {
    var d = doc();
    if (d) d.querySelectorAll('.cms-sel').forEach(function (n) { n.classList.remove('cms-sel'); n.style.outline = ''; });
    if (state.selected) try { state.selected.removeAttribute('contenteditable'); } catch (e) {}
    state.selected = null;
    if ($('sel-info')) $('sel-info').textContent = '要素をクリックして選択';
    hideRt();
  }
  function selectEl(el) {
    if (!el || isLocked(el)) { status('ロック要素は編集できません'); return; }
    clearSelection();
    state.selected = el;
    el.classList.add('cms-sel');
    el.style.outline = '2px solid #3b82f6';
    if ($('sel-info')) $('sel-info').textContent = el.tagName.toLowerCase();
  }
  function enterEdit(el) {
    if (!el || isLocked(el)) return;
    selectEl(el);
    el.setAttribute('contenteditable', 'true');
    el.focus();
    showRt(el);
    if (!el.__u) { el.__u = true; el.addEventListener('focus', function () { pushUndo(); }); }
  }
  function showRt(el) {
    var tb = $('rt-toolbar'); if (!tb || !el) return;
    var r = el.getBoundingClientRect();
    tb.classList.add('open');
    tb.style.left = Math.max(8, r.left) + 'px';
    tb.style.top = Math.max(8, r.top - 44) + 'px';
  }
  function hideRt() { var tb = $('rt-toolbar'); if (tb) tb.classList.remove('open'); }

  function setupFrameEvents() {
    var d = doc(); if (!d) return;
    if (!d.getElementById('cms-ui-style')) {
      var st = d.createElement('style');
      st.id = 'cms-ui-style';
      st.textContent = '.cms-sel{outline:2px solid #3b82f6!important}[data-lock="true"]{cursor:not-allowed}[data-lock="true"]:hover{filter:blur(1px)}';
      (d.head || d.documentElement).appendChild(st);
    }
    d.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || t === d.body || t === d.documentElement) return;
      if (isLocked(t)) { e.preventDefault(); status('ロック要素です'); return; }
      var el = t;
      if (['SPAN', 'A', 'STRONG', 'EM'].indexOf(t.tagName) >= 0) {
        el = t.closest('p,h1,h2,h3,h4,li,blockquote,section,div,article') || t;
      }
      if (isLocked(el)) return;
      e.preventDefault();
      enterEdit(el);
    }, true);
    d.addEventListener('keydown', function (e) {
      var key = String(e.key).toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) { e.preventDefault(); undoEdit(); }
      if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redoEdit(); }
      if (e.key === 'Escape') clearSelection();
    }, true);
  }

  function applyStyle() {
    var el = state.selected;
    if (!el) { status('先に要素を選択'); return; }
    if (isLocked(el)) return;
    pushUndo();
    var styles = {};
    if ($('p-bg') && $('p-bg').value) styles.backgroundColor = $('p-bg').value;
    if ($('p-size')) styles.fontSize = $('p-size').value + 'px';
    if ($('p-weight') && $('p-weight').value) styles.fontWeight = $('p-weight').value;
    if ($('p-radius')) styles.borderRadius = $('p-radius').value + 'px';
    if ($('p-pad')) styles.padding = $('p-pad').value + 'px';
    if ($('p-margin')) styles.margin = $('p-margin').value + 'px';
    var bw = $('p-border-w') ? $('p-border-w').value : '0';
    if (parseInt(bw, 10) > 0) {
      styles.borderWidth = bw + 'px';
      styles.borderStyle = 'solid';
      styles.borderColor = ($('p-border-c') && $('p-border-c').value) || '#333';
    }
    recordStyle(el, styles);
    status('スタイルを適用');
  }

  function applyBodyBackground() {
    var d = doc(); if (!d || !d.body) return;
    pushUndo();
    var mode = ($('body-bg-mode') && $('body-bg-mode').value) || 'solid';
    var c1 = ($('body-bg-color') && $('body-bg-color').value) || '#f8fafc';
    var c2 = ($('body-bg-color2') && $('body-bg-color2').value) || '#e2e8f0';
    var angle = ($('body-bg-angle') && $('body-bg-angle').value) || '135';
    var img = ($('body-bg-image') && $('body-bg-image').value.trim()) || '';
    var custom = ($('body-bg-custom') && $('body-bg-custom').value.trim()) || '';
    var styles = {};
    if (mode === 'keep-site') { styles.background = ''; styles.backgroundImage = ''; styles.backgroundColor = ''; }
    else if (mode === 'solid') { styles.background = c1; styles.backgroundColor = c1; styles.backgroundImage = 'none'; }
    else if (mode === 'linear') { styles.background = 'linear-gradient(' + angle + 'deg,' + c1 + ',' + c2 + ')'; }
    else if (mode === 'radial') { styles.background = 'radial-gradient(circle at 30% 20%,' + c1 + ',' + c2 + ' 70%)'; }
    else if (mode === 'image' && img) {
      styles.backgroundImage = 'url("' + img.replace(/"/g, '') + '")';
      styles.backgroundSize = 'cover'; styles.backgroundPosition = 'center'; styles.backgroundColor = c1;
    } else if (mode === 'custom' && custom) { styles.background = custom; }
    else {
      var presets = {
        warm: 'radial-gradient(circle at 12% 18%,rgba(251,191,36,.35),transparent 42%),#fff7ed',
        cool: 'radial-gradient(circle at 20% 20%,rgba(56,189,248,.3),transparent 45%),#f0f9ff',
        night: 'radial-gradient(circle at 30% 20%,rgba(99,102,241,.45),transparent 40%),#0f172a',
        forest: 'radial-gradient(circle at 20% 15%,rgba(34,197,94,.3),transparent 45%),#052e1c'
      };
      styles.background = presets[mode] || presets.cool;
    }
    d.body.setAttribute('data-cms-id', 'cms-body');
    recordStyle(d.body, styles);
    status('ページ背景を適用（保存で確定）');
  }

  function populateBlocks() {
    var g = $('block-grid'); if (!g) return;
    g.innerHTML = '';
    BLOCKS.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn block-btn'; btn.textContent = b.label;
      btn.onclick = function () { insertBlock(b.html); };
      g.appendChild(btn);
    });
  }
  function insertBlock(html) {
    var d = doc(); if (!d) return;
    pushUndo();
    var wrap = d.createElement('div'); wrap.innerHTML = html;
    var node = wrap.firstElementChild || wrap;
    if (state.selected && state.selected.parentNode) state.selected.parentNode.insertBefore(node, state.selected.nextSibling);
    else d.body.appendChild(node);
    selectEl(node);
    status('ブロック追加');
  }

  function pageCssPath(htmlPath) {
    var base = String(htmlPath || 'page').replace(/\.html?$/i, '').replace(/[\/\\]+/g, '-').replace(/^-|-$/g, '');
    return 'assets/cms-pages/' + (base || 'page') + '.css';
  }
  function ensurePageCssLink(origDoc, htmlPath) {
    var href = pageCssPath(htmlPath);
    var depth = (String(htmlPath).match(/\//g) || []).length;
    var rel = '';
    for (var i = 0; i < depth; i++) rel += '../';
    rel += href;
    var head = origDoc.head || origDoc.querySelector('head');
    if (!head) return;
    var existing = head.querySelector('link[data-cms-page-css]');
    if (existing) { existing.setAttribute('href', rel); return; }
    var link = origDoc.createElement('link');
    link.rel = 'stylesheet'; link.href = rel; link.setAttribute('data-cms-page-css', '1');
    head.appendChild(link);
  }

  function exportHtml() {
    if (!state.originalHtml) throw new Error('originalHtml なし');
    var d = doc(); if (!d) throw new Error('doc なし');
    clearSelection();
    var bodyClone = d.body.cloneNode(true);
    bodyClone.querySelectorAll('.cms-sel, #cms-page-style, #cms-ui-style').forEach(function (n) {
      if (n.id === 'cms-page-style' || n.id === 'cms-ui-style') n.remove();
      else { n.classList.remove('cms-sel'); n.removeAttribute('contenteditable'); n.style.outline = ''; }
    });
    var parser = new DOMParser();
    var origDoc = parser.parseFromString(state.originalHtml, 'text/html');
    var oBody = origDoc.body || origDoc.querySelector('body');
    if (oBody) {
      oBody.innerHTML = bodyClone.innerHTML;
      var bStyle = d.body.getAttribute('style') || '';
      if (bStyle) oBody.setAttribute('style', bStyle); else oBody.removeAttribute('style');
      var cmsId = d.body.getAttribute('data-cms-id');
      if (cmsId) oBody.setAttribute('data-cms-id', cmsId);
      if (state.pageStyles && state.pageStyles['cms-body']) {
        var rs = state.pageStyles['cms-body'];
        Object.keys(rs).forEach(function (k) { try { oBody.style[k] = rs[k] || ''; } catch (e) {} });
      }
    }
    ensurePageCssLink(origDoc, state.path);
    return '<!DOCTYPE html>\n' + origDoc.documentElement.outerHTML;
  }

  function saveBackup(path, content, commitMsg) {
    var base = backupApiBase();
    if (!base) return Promise.resolve();
    var ts = formatNow().replace(/[:T]/g, '-');
    var safe = path.replace(/[^a-zA-Z0-9._\/-]/g, '_');
    var backupPath = 'data/' + safe + '/' + ts + '.html';
    var entry = { id: Date.now().toString(36), path: path, userName: cfg.name, message: commitMsg, datetime: formatNow(), backupPath: backupPath };
    return putFile(backupPath, content, 'backup: ' + path, null, base).then(function () {
      return getFile('src/backup.json', base).then(function (f) {
        var arr = [];
        try { arr = JSON.parse(decode(f.content)); } catch (e) {}
        if (!Array.isArray(arr)) arr = [];
        arr.unshift(entry);
        if (arr.length > 300) arr = arr.slice(0, 300);
        return putFile('src/backup.json', JSON.stringify(arr, null, 2), 'backup index: ' + path, f.sha, base);
      }).catch(function () {
        return putFile('src/backup.json', JSON.stringify([entry], null, 2), 'backup index: ' + path, null, base);
      });
    });
  }

  function save() {
    if (!state.path) return;
    var userMsg = ($('commit-msg') && $('commit-msg').value.trim()) || '';
    if (!userMsg) { status('コミットメッセージを入力してください'); return; }
    status('保存中…');
    var out;
    try {
      out = state.mode === 'code' ? (($('code-area') && $('code-area').value) || '') : exportHtml();
    } catch (e) { status('保存失敗: ' + e.message); return; }
    var cssPath = pageCssPath(state.path);
    var cssBody = buildPageCss();
    var cm = '[' + cfg.name + '] | [' + userMsg + '] | [' + formatNow() + ']';
    getFile(state.path).then(function (f) {
      return putFile(state.path, out, cm, f.sha).then(function () {
        return getFile(cssPath).then(function (cf) {
          return putFile(cssPath, cssBody, cm + ' [page-css]', cf.sha);
        }).catch(function () {
          return putFile(cssPath, cssBody, cm + ' [page-css]', null);
        });
      }).then(function () {
        return saveBackup(state.path, out, userMsg);
      }).then(function () {
        state.originalHtml = out;
        status('保存完了 ✓');
      });
    }).catch(function (e) { status('保存失敗: ' + e.message); });
  }

  function bindRange(id, labelId) {
    var el = $(id), lab = $(labelId);
    if (!el) return;
    el.oninput = function () { if (lab) lab.textContent = el.value; };
  }

  function boot() {
    loadConfig();
    if ($('cfg-owner')) $('cfg-owner').value = cfg.owner || '';
    if ($('cfg-repo')) $('cfg-repo').value = cfg.repo || '';
    if ($('cfg-branch')) $('cfg-branch').value = cfg.branch || 'main';
    if ($('cfg-token')) $('cfg-token').value = cfg.token || '';
    if ($('cfg-name')) $('cfg-name').value = cfg.name || '';
    if ($('cfg-backup')) $('cfg-backup').value = cfg.backup || '';
    if ($('cfg-remember')) $('cfg-remember').checked = cfg.remember !== false;

    if ($('btn-connect')) $('btn-connect').onclick = connect;
    if ($('btn-disconnect')) $('btn-disconnect').onclick = disconnect;
    if ($('btn-refresh')) $('btn-refresh').onclick = loadPages;
    if ($('btn-back')) $('btn-back').onclick = openDash;
    if ($('btn-save')) $('btn-save').onclick = save;
    if ($('btn-undo')) $('btn-undo').onclick = undoEdit;
    if ($('btn-redo')) $('btn-redo').onclick = redoEdit;
    if ($('btn-apply-style')) $('btn-apply-style').onclick = applyStyle;
    if ($('btn-body-bg')) $('btn-body-bg').onclick = applyBodyBackground;
    if ($('btn-mode-visual')) $('btn-mode-visual').onclick = function () { setMode('visual'); };
    if ($('btn-mode-code')) $('btn-mode-code').onclick = function () { setMode('code'); };
    if ($('btn-dup')) $('btn-dup').onclick = function () {
      if (!state.selected) return;
      pushUndo();
      var n = state.selected.cloneNode(true);
      n.removeAttribute('data-cms-id');
      state.selected.parentNode.insertBefore(n, state.selected.nextSibling);
      selectEl(n);
    };
    if ($('btn-del')) $('btn-del').onclick = function () {
      if (!state.selected) return;
      if (!confirm('削除しますか？')) return;
      pushUndo();
      state.selected.remove();
      clearSelection();
    };
    bindRange('p-size', 'p-size-v');
    bindRange('p-radius', 'p-radius-v');
    bindRange('p-pad', 'p-pad-v');
    bindRange('p-margin', 'p-margin-v');
    bindRange('p-border-w', 'p-border-w-v');
    bindRange('body-bg-angle', 'body-bg-angle-v');

    document.querySelectorAll('#rt-toolbar [data-cmd]').forEach(function (btn) {
      btn.onclick = function () {
        var d = doc(); if (d) d.execCommand(btn.getAttribute('data-cmd'), false, null);
      };
    });
    if ($('rt-color')) $('rt-color').oninput = function () {
      var d = doc(); if (d) d.execCommand('foreColor', false, $('rt-color').value);
    };
    if ($('rt-hilite')) $('rt-hilite').oninput = function () {
      var d = doc(); if (d) d.execCommand('hiliteColor', false, $('rt-hilite').value);
    };

    ['cfg-owner', 'cfg-repo', 'cfg-token', 'cfg-branch'].forEach(function (id) {
      if ($(id)) $(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter') connect();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      var tag = (e.target && e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      var key = String(e.key).toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoEdit(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redoEdit(); }
    });

    if (cfg.token && cfg.owner && cfg.repo) openDash();
    else show('view-login');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

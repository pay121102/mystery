/* 画面。データは data に持ち、変更のたびにチェックと自動保存をする */
(function () {
  'use strict';
  const MM = window.MM;
  const STORAGE_KEY = 'mystery-scenario-checker:v1';
  const TAB_KEY = 'mystery-scenario-checker:tab';

  let data = null;
  let tab = 'timeline';
  let warnings = [];

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // 要素を作る小さな関数。文字は必ず textContent で入れる
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach((k) => {
        const v = props[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    children.flat().forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  function options(list, selected, blankLabel) {
    const out = [h('option', { value: '' }, blankLabel)];
    list.forEach((x) => out.push(h('option', { value: x.id, selected: x.id === selected }, x.label)));
    return out;
  }
  const charOpts = () => data.characters.map((c) => ({ id: c.id, label: c.name || '(名前なし)' }));
  const slotOpts = () => data.slots.map((s) => ({ id: s.id, label: s.time || '(時刻なし)' }));
  const locOpts = () => data.locations.map((l) => ({ id: l.id, label: l.name || '(名前なし)' }));
  const locName = (id) => {
    const l = data.locations.find((x) => x.id === id);
    return l ? l.name || '(名前なし)' : '';
  };

  /* ---------- 保存 ---------- */
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    $('#save-status').textContent = '保存中…';
    saveTimer = setTimeout(save, 300);
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      $('#save-status').textContent = 'ブラウザに保存しました';
    } catch (e) {
      $('#save-status').textContent = 'ブラウザに保存できません。JSON 書き出しで保存してください';
    }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return MM.normalize(JSON.parse(raw));
    } catch (e) { /* 壊れていたらサンプルから始める */ }
    return MM.sampleScenario();
  }

  /* ---------- 全体 ---------- */
  function setData(d) {
    data = d;
    $('#title').value = data.title;
    renderTab();
    refresh();
  }

  function setTab(t) {
    tab = t;
    try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* 覚えなくてよい */ }
    renderTab();
    applyFlags();
  }

  function renderTab() {
    $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const main = $('#main');
    main.replaceChildren(({ timeline: renderTimeline, testimonies: renderTestimonies, clues: renderClues, settings: renderSettings })[tab]());
  }

  // 内容が変わったとき。structural なら表を作り直す
  function changed(structural) {
    if (structural) renderTab();
    refresh();
  }

  function refresh() {
    warnings = MM.check(data);
    renderWarnings();
    applyFlags();
    scheduleSave();
  }

  /* ---------- 警告 ---------- */
  function renderWarnings() {
    const errors = warnings.filter((w) => w.level === 'error').length;
    const warns = warnings.length - errors;
    const sum = $('#warn-summary');
    sum.replaceChildren();
    if (!warnings.length) sum.append('警告はありません');
    else {
      sum.append('警告 ');
      if (errors) sum.append(h('span', { class: 'count-error' }, `矛盾 ${errors} 件`));
      if (errors && warns) sum.append(' / ');
      if (warns) sum.append(h('span', { class: 'count-warn' }, `注意 ${warns} 件`));
    }
    const list = $('#warn-list');
    list.replaceChildren();
    if (!warnings.length) {
      list.append(h('p', { class: 'ok' }, '矛盾は見つかりませんでした。'));
      return;
    }
    MM.RULES.forEach((r) => {
      const ws = warnings.filter((w) => w.rule === r.id);
      if (!ws.length) return;
      list.append(h('div', { class: 'warn-group' },
        h('h3', null, `${r.level === 'error' ? '矛盾' : '注意'}: ${r.name} (${ws.length})`),
        ws.map((w) => h('button', { type: 'button', class: 'warn-item ' + w.level, onclick: () => jumpTo(w) }, w.msg))));
    });
  }

  function targetsOf(w) {
    const sel = [];
    const q = (attr, v) => `[data-${attr}="${CSS.escape(v)}"]`;
    if (w.kind === 'testimony') sel.push(q('testimony', w.id));
    if (w.kind === 'clue') sel.push(q('clue', w.id));
    if (w.kind === 'slot') sel.push(q('slot', w.id));
    w.cells.forEach((k) => sel.push(q('cell', k)));
    return sel.length ? $$(sel.join(',')) : [];
  }

  function applyFlags() {
    $$('.flag-error, .flag-warn').forEach((el) => {
      el.classList.remove('flag-error', 'flag-warn');
      el.removeAttribute('title');
    });
    warnings.forEach((w) => {
      targetsOf(w).forEach((el) => {
        if (w.level === 'error') {
          el.classList.remove('flag-warn');
          el.classList.add('flag-error');
        } else if (!el.classList.contains('flag-error')) el.classList.add('flag-warn');
        el.title = el.title ? el.title + '\n' + w.msg : w.msg;
      });
    });
  }

  function jumpTo(w) {
    const want = { cell: 'timeline', testimony: 'testimonies', clue: 'clues', slot: 'settings' }[w.kind];
    if (want !== tab) setTab(want);
    const el = targetsOf(w)[0];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    const focusable = el.matches('button, input, select') ? el : el.querySelector('button, input, select');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  /* ---------- 時系列表 ---------- */
  function renderTimeline() {
    const wrap = h('div', { class: 'panel' },
      h('h2', null, '時系列表'),
      h('p', { class: 'hint' }, 'マスを押すと、その時刻にいた場所と行動を入力できます。時刻は「その時点でそこにいた」という意味で、移動時間の確認に使います。'));
    if (!data.characters.length || !data.slots.length) {
      wrap.append(h('p', null, '先に「人物・時刻・場所」で人物と時刻を追加してください。'),
        h('button', { type: 'button', onclick: () => setTab('settings') }, '人物・時刻・場所へ'));
      return wrap;
    }
    const table = h('table', { class: 'grid' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, '時刻'), data.characters.map((c) => h('th', { scope: 'col' }, c.name || '(名前なし)')))),
      h('tbody', null, data.slots.map((s) => h('tr', null,
        h('th', { scope: 'row' }, s.time || '(時刻なし)'),
        data.characters.map((c) => h('td', null, cellButton(c, s)))))));
    wrap.append(h('div', { class: 'scroll grid-scroll' }, table));
    return wrap;
  }

  function cellButton(c, s) {
    const key = MM.cellKey(c.id, s.id);
    const entries = data.cells[key] || [];
    return h('button', {
      type: 'button', class: 'cell', dataset: { cell: key },
      'aria-label': `${c.name} ${s.time}`,
      onclick: () => openCell(c, s),
    }, entries.length
      ? entries.map((e) => h('div', { class: 'entry' },
        e.loc ? h('span', { class: 'loc-chip' }, locName(e.loc)) : null,
        e.action ? h('span', { class: 'action' }, e.action) : null))
      : h('span', { class: 'empty' }, '—'));
  }

  let editing = null; // { key, entries }
  function openCell(c, s) {
    const key = MM.cellKey(c.id, s.id);
    editing = { key, entries: (data.cells[key] || []).map((e) => Object.assign({}, e)) };
    if (!editing.entries.length) editing.entries.push({ loc: '', action: '' });
    $('#cell-title').textContent = `${c.name || '(名前なし)'} ／ ${s.time || '(時刻なし)'}`;
    renderCellEntries();
    $('#cell-dialog').showModal();
    const first = $('#cell-entries select');
    if (first) first.focus();
  }

  function renderCellEntries() {
    const box = $('#cell-entries');
    box.replaceChildren(...editing.entries.map((e, i) => h('div', { class: 'entry-edit' },
      h('select', { 'aria-label': '場所', onchange: (ev) => (e.loc = ev.target.value) }, options(locOpts(), e.loc, '(場所を選ぶ)')),
      h('button', { type: 'button', class: 'small danger', onclick: () => { editing.entries.splice(i, 1); renderCellEntries(); } }, '削除'),
      h('textarea', { 'aria-label': '行動', placeholder: '行動 (例: 書類の整理)', oninput: (ev) => (e.action = ev.target.value) }, e.action))));
    if (!data.locations.length) box.append(h('p', { class: 'hint' }, '場所がまだありません。「人物・時刻・場所」で追加できます。'));
  }

  function closeCell(saveIt) {
    if (saveIt && editing) {
      const entries = editing.entries.filter((e) => e.loc || e.action.trim());
      if (entries.length) data.cells[editing.key] = entries;
      else delete data.cells[editing.key];
    }
    const key = editing && editing.key;
    editing = null;
    $('#cell-dialog').close();
    if (saveIt) changed(true);
    const btn = key && $(`[data-cell="${CSS.escape(key)}"]`);
    if (btn) btn.focus();
  }

  /* ---------- 証言 ---------- */
  function renderTestimonies() {
    const list = h('div', { class: 'list' });
    data.testimonies.forEach((t) => {
      const set = (field) => (ev) => {
        t[field] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
        refresh();
      };
      list.append(h('div', { class: 'item', dataset: { testimony: t.id } },
        h('div', { class: 'fields' },
          h('label', { class: 'field' }, '証言者', h('select', { onchange: set('witness') }, options(charOpts(), t.witness, '(選ぶ)'))),
          h('label', { class: 'field' }, '見た相手', h('select', { onchange: set('target') }, options(charOpts(), t.target, '(選ぶ)'))),
          h('label', { class: 'field' }, '時刻', h('select', { onchange: set('slot') }, options(slotOpts(), t.slot, '(選ぶ)'))),
          h('label', { class: 'field' }, '場所', h('select', { onchange: set('loc') }, options(locOpts(), t.loc, '(選ぶ)'))),
          h('label', { class: 'field grow' }, 'メモ', h('input', { type: 'text', value: t.note, oninput: set('note') }))),
        h('div', { class: 'fields' },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: t.lie, onchange: set('lie') }), '意図的な嘘 (チェックしない)'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: t.remote, onchange: set('remote') }), '離れた場所から見た (窓越しなど)'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'small danger', onclick: () => {
            if (!confirm('この証言を削除しますか?')) return;
            data.testimonies = data.testimonies.filter((x) => x !== t);
            changed(true);
          } }, '削除'))));
    });
    return h('div', { class: 'panel' },
      h('h2', null, '証言'),
      h('p', { class: 'hint' }, '「誰が、誰を、いつ、どこで見たか」を入れると時系列表と突き合わせます。証言者と見た相手を同じ人物にすると、本人のアリバイの主張として確認します。'),
      data.testimonies.length ? list : h('p', null, 'まだ証言はありません。'),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', onclick: () => {
        const t = { id: MM.uid('t'), witness: '', target: '', slot: '', loc: '', note: '', lie: false, remote: false };
        data.testimonies.push(t);
        changed(true);
        const sel = $(`[data-testimony="${CSS.escape(t.id)}"] select`);
        if (sel) { sel.focus(); sel.scrollIntoView({ block: 'center' }); }
      } }, '＋ 証言を追加')));
  }

  /* ---------- 手がかり ---------- */
  function renderClues() {
    const table = h('table', { class: 'clue-table' },
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, '手がかり'),
        h('th', { scope: 'col' }, '秘密'),
        data.characters.map((c) => h('th', { scope: 'col' }, c.name || '(名前なし)')),
        h('th', { scope: 'col' }, 'メモ'),
        h('th', { scope: 'col' }, ''))),
      h('tbody', null, data.clues.map((k) => h('tr', { dataset: { clue: k.id } },
        h('td', { class: 'name' }, h('input', { type: 'text', value: k.name, 'aria-label': '手がかりの名前', placeholder: '例: 血のついたナイフ', oninput: (ev) => { k.name = ev.target.value; refresh(); } })),
        h('td', null, h('input', { type: 'checkbox', checked: k.secret, 'aria-label': '秘密', onchange: (ev) => { k.secret = ev.target.checked; refresh(); } })),
        data.characters.map((c) => h('td', null, h('input', {
          type: 'checkbox', checked: k.knownBy.indexOf(c.id) >= 0, 'aria-label': `${c.name} が知っている`,
          onchange: (ev) => {
            k.knownBy = k.knownBy.filter((x) => x !== c.id);
            if (ev.target.checked) k.knownBy = data.characters.map((x) => x.id).filter((id) => id === c.id || k.knownBy.indexOf(id) >= 0);
            refresh();
          },
        }))),
        h('td', { class: 'memo' }, h('input', { type: 'text', value: k.memo, 'aria-label': 'メモ', oninput: (ev) => { k.memo = ev.target.value; scheduleSave(); } })),
        h('td', null, h('button', { type: 'button', class: 'small danger', onclick: () => {
          if (!confirm(`手がかり「${k.name || '(名前なし)'}」を削除しますか?`)) return;
          data.clues = data.clues.filter((x) => x !== k);
          changed(true);
        } }, '削除'))))));
    return h('div', { class: 'panel' },
      h('h2', null, '手がかりの行き先'),
      h('p', { class: 'hint' }, '手がかりごとに、ゲーム中に知ることになる人物にチェックを入れます。「秘密」にチェックした手がかりを全員が知っていると警告します。'),
      data.clues.length ? h('div', { class: 'scroll' }, table) : h('p', null, 'まだ手がかりはありません。'),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', onclick: () => {
        const k = { id: MM.uid('k'), name: '', memo: '', secret: false, knownBy: [] };
        data.clues.push(k);
        changed(true);
        const inp = $(`[data-clue="${CSS.escape(k.id)}"] input`);
        if (inp) inp.focus();
      } }, '＋ 手がかりを追加')));
  }

  /* ---------- 人物・時刻・場所 ---------- */
  function moveButtons(list, item) {
    const i = list.indexOf(item);
    const move = (d) => () => {
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      changed(true);
    };
    return [
      h('button', { type: 'button', class: 'small', 'aria-label': '上へ', disabled: i === 0, onclick: move(-1) }, '↑'),
      h('button', { type: 'button', class: 'small', 'aria-label': '下へ', disabled: i === list.length - 1, onclick: move(1) }, '↓'),
    ];
  }

  function renderSettings() {
    const frag = document.createDocumentFragment();

    frag.append(h('div', { class: 'panel' },
      h('h2', null, '人物'),
      h('div', { class: 'list' }, data.characters.map((c) => h('div', { class: 'item' }, h('div', { class: 'fields' },
        h('label', { class: 'field' }, '名前', h('input', { type: 'text', value: c.name, oninput: (ev) => { c.name = ev.target.value; refresh(); } })),
        h('label', { class: 'field grow' }, 'メモ', h('input', { type: 'text', value: c.memo, oninput: (ev) => { c.memo = ev.target.value; scheduleSave(); } })),
        moveButtons(data.characters, c),
        h('button', { type: 'button', class: 'small danger', onclick: () => {
          if (!confirm(`人物「${c.name || '(名前なし)'}」を削除しますか? この人物の行動・証言・手がかりの記録も消えます。`)) return;
          data = MM.removeCharacter(data, c.id);
          changed(true);
        } }, '削除'))))),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', onclick: () => {
        data.characters.push({ id: MM.uid('c'), name: `人物${data.characters.length + 1}`, memo: '' });
        changed(true);
      } }, '＋ 人物を追加'))));

    frag.append(h('div', { class: 'panel' },
      h('h2', null, '時刻'),
      h('p', { class: 'hint' }, '「21:30」の形で、早い順に並べます。前の行より早い時刻は日付をまたいだとみなします (23:45 → 0:00)。'),
      h('div', { class: 'list' }, data.slots.map((s) => h('div', { class: 'item', dataset: { slot: s.id } }, h('div', { class: 'fields' },
        h('label', { class: 'field' }, '時刻', h('input', { type: 'text', inputmode: 'numeric', value: s.time, placeholder: '21:30', size: 8, oninput: (ev) => { s.time = ev.target.value; refresh(); } })),
        moveButtons(data.slots, s),
        h('button', { type: 'button', class: 'small danger', onclick: () => {
          if (!confirm(`時刻「${s.time}」を削除しますか? この時刻の行動と証言も消えます。`)) return;
          data = MM.removeSlot(data, s.id);
          changed(true);
        } }, '削除'))))),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', onclick: () => {
        const last = data.slots.length ? MM.parseTime(data.slots[data.slots.length - 1].time) : null;
        let time = '21:00';
        if (last !== null) {
          const t = (last + 15) % 1440;
          time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        }
        data.slots.push({ id: MM.uid('s'), time });
        changed(true);
      } }, '＋ 時刻を追加 (15 分後)'))));

    frag.append(h('div', { class: 'panel' },
      h('h2', null, '場所'),
      h('div', { class: 'list' }, data.locations.map((l) => h('div', { class: 'item' },
        h('div', { class: 'fields' },
          h('label', { class: 'field grow' }, '名前', h('input', { type: 'text', value: l.name, oninput: (ev) => { l.name = ev.target.value; refresh(); } })),
          moveButtons(data.locations, l),
          h('button', { type: 'button', class: 'small danger', onclick: () => {
            if (!confirm(`場所「${l.name || '(名前なし)'}」を削除しますか? この場所を使った行動と証言の場所は空になります。`)) return;
            data = MM.removeLocation(data, l.id);
            changed(true);
          } }, '削除')),
        h('details', { open: l.allowed.length || l.closed.length ? true : null },
          h('summary', { class: 'hint' }, `入れる人・閉鎖する時刻 (${l.allowed.length ? l.allowed.length + ' 人に限定' : '誰でも入れる'}${l.closed.length ? '、' + l.closed.length + ' 時刻閉鎖' : ''})`),
          h('p', { class: 'hint' }, '入れる人 (誰にもチェックしなければ全員が入れます)'),
          h('div', { class: 'checks' }, data.characters.map((c) => h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: l.allowed.indexOf(c.id) >= 0, onchange: (ev) => {
              l.allowed = data.characters.map((x) => x.id).filter((id) => (id === c.id ? ev.target.checked : l.allowed.indexOf(id) >= 0));
              changed(true);
            } }), c.name || '(名前なし)'))),
          h('p', { class: 'hint' }, '閉鎖する時刻 (この時刻は誰も入れません)'),
          h('div', { class: 'checks' }, data.slots.map((s) => h('label', { class: 'check' },
            h('input', { type: 'checkbox', checked: l.closed.indexOf(s.id) >= 0, onchange: (ev) => {
              l.closed = data.slots.map((x) => x.id).filter((id) => (id === s.id ? ev.target.checked : l.closed.indexOf(id) >= 0));
              changed(true);
            } }), s.time || '(時刻なし)'))))))),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', onclick: () => {
        data.locations.push({ id: MM.uid('l'), name: `場所${data.locations.length + 1}`, allowed: [], closed: [] });
        changed(true);
      } }, '＋ 場所を追加'))));

    const locs = data.locations;
    frag.append(h('div', { class: 'panel' },
      h('h2', null, '移動時間 (分)'),
      h('p', { class: 'hint' }, '隣り合う場所の間だけ入れれば、遠い場所への時間は経由する道の合計で計算します。どこともつながっていない組は下の既定値を使います。'),
      h('label', { class: 'field' }, '未設定のときの移動時間 (分)', h('input', { type: 'number', min: 0, value: data.defaultTravel, style: 'width:90px', oninput: (ev) => {
        const v = Number(ev.target.value);
        if (ev.target.value !== '' && Number.isFinite(v) && v >= 0) { data.defaultTravel = v; refresh(); }
      } })),
      locs.length > 1 ? h('div', { class: 'scroll', style: 'margin-top:8px' }, h('table', { class: 'travel' },
        h('thead', null, h('tr', null, h('th', null, ''), locs.map((l) => h('th', { scope: 'col' }, l.name || '(名前なし)')))),
        h('tbody', null, locs.map((a, i) => h('tr', null, h('th', { scope: 'row' }, a.name || '(名前なし)'),
          locs.map((b, j) => {
            if (i === j) return h('td', { class: 'self' }, '—');
            const k = MM.travelKey(a.id, b.id);
            return h('td', null, h('input', {
              type: 'number', min: 0, 'aria-label': `${a.name} と ${b.name} の移動時間`, dataset: { travel: k },
              value: data.travel[k] !== undefined ? data.travel[k] : '',
              oninput: (ev) => {
                const v = ev.target.value === '' ? null : Number(ev.target.value);
                if (v === null) delete data.travel[k];
                else if (Number.isFinite(v) && v >= 0) data.travel[k] = v;
                else return;
                $$(`[data-travel="${CSS.escape(k)}"]`).forEach((el) => { if (el !== ev.target) el.value = ev.target.value; });
                refresh();
              },
            }));
          })))))) : h('p', { class: 'hint' }, '場所が 2 つ以上になると表が出ます。')));
    return frag;
  }

  /* ---------- 書き出し・読み込み ---------- */
  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (data.title || 'scenario').replace(/[\\/:*?"<>|]/g, '_') + '.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let d;
      try {
        d = MM.normalize(JSON.parse(String(reader.result).replace(/^﻿/, '')));
      } catch (e) {
        alert('読み込めませんでした: ' + (e instanceof SyntaxError ? 'JSON として読めません。' : e.message));
        return;
      }
      if (!confirm(`「${d.title || '(名前なし)'}」を読み込みます。いま開いているシナリオは置き換わります。よろしいですか?`)) return;
      setData(d);
    };
    reader.onerror = () => alert('ファイルを読めませんでした。');
    reader.readAsText(file, 'utf-8');
  }

  /* ---------- 起動 ---------- */
  function init() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    $('#title').addEventListener('input', (ev) => { data.title = ev.target.value; scheduleSave(); });
    $('#btn-export').addEventListener('click', exportJson);
    $('#file-import').addEventListener('change', (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (f) importJson(f);
      ev.target.value = '';
    });
    $('#btn-sample').addEventListener('click', () => {
      if (confirm('サンプルシナリオを開きます。いま開いているシナリオは置き換わります (先に JSON 書き出しで保存してください)。よろしいですか?')) setData(MM.sampleScenario());
    });
    $('#btn-new').addEventListener('click', () => {
      if (confirm('新しいシナリオを作ります。いま開いているシナリオは置き換わります (先に JSON 書き出しで保存してください)。よろしいですか?')) setData(MM.newScenario());
    });
    $('#cell-add').addEventListener('click', () => {
      editing.entries.push({ loc: '', action: '' });
      renderCellEntries();
      const sels = $$('#cell-entries select');
      sels[sels.length - 1].focus();
    });
    $('#cell-clear').addEventListener('click', () => { editing.entries = []; closeCell(true); });
    $('#cell-cancel').addEventListener('click', () => closeCell(false));
    $('#cell-form').addEventListener('submit', (ev) => { ev.preventDefault(); closeCell(true); });
    $('#cell-dialog').addEventListener('cancel', (ev) => { ev.preventDefault(); closeCell(false); });

    try {
      const t = localStorage.getItem(TAB_KEY);
      if (['timeline', 'testimonies', 'clues', 'settings'].indexOf(t) >= 0) tab = t;
    } catch (e) { /* 既定のタブ */ }
    setData(load());
  }

  init();
})();

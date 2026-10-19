/* データの形・初期値・読み込み時の検証 */
(function (global) {
  'use strict';
  const MM = (global.MM = global.MM || {});

  const APP_ID = 'mystery-scenario-checker';
  const VERSION = 1;

  function uid(prefix) {
    return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emptyScenario() {
    return {
      app: APP_ID,
      version: VERSION,
      title: '',
      defaultTravel: 5,
      characters: [],
      slots: [],
      locations: [],
      travel: {},
      cells: {},
      testimonies: [],
      clues: [],
    };
  }

  function newScenario() {
    const d = emptyScenario();
    d.title = '新しいシナリオ';
    ['人物A', '人物B', '人物C', '人物D'].forEach((name) => d.characters.push({ id: uid('c'), name, memo: '' }));
    ['21:00', '21:15', '21:30', '21:45', '22:00'].forEach((time) => d.slots.push({ id: uid('s'), time }));
    ['大広間', '書斎'].forEach((name) => d.locations.push({ id: uid('l'), name, allowed: [], closed: [] }));
    return d;
  }

  function cellKey(charId, slotId) {
    return charId + '|' + slotId;
  }

  function travelKey(a, b) {
    return a < b ? a + '|' + b : b + '|' + a;
  }

  // 読み込んだ JSON を検証し、欠けている項目を補う。壊れた参照は捨てる
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('ファイルの中身がシナリオの形式ではありません。');
    }
    if (raw.app !== undefined && raw.app !== APP_ID) {
      throw new Error('このツールで書き出したファイルではありません。');
    }
    const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
    const arr = (v) => (Array.isArray(v) ? v : []);
    const okId = (v) => typeof v === 'string' && v !== '' && v.indexOf('|') < 0;
    const uniq = (list) => {
      const seen = new Set();
      return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    };

    const d = emptyScenario();
    d.title = str(raw.title);
    const dt = Number(raw.defaultTravel);
    d.defaultTravel = Number.isFinite(dt) && dt >= 0 ? dt : 5;

    d.characters = uniq(arr(raw.characters).filter((c) => c && okId(c.id)))
      .map((c) => ({ id: c.id, name: str(c.name), memo: str(c.memo) }));
    const charIds = new Set(d.characters.map((c) => c.id));

    d.slots = uniq(arr(raw.slots).filter((s) => s && okId(s.id))).map((s) => ({ id: s.id, time: str(s.time) }));
    const slotIds = new Set(d.slots.map((s) => s.id));

    d.locations = uniq(arr(raw.locations).filter((l) => l && okId(l.id))).map((l) => ({
      id: l.id,
      name: str(l.name),
      allowed: arr(l.allowed).filter((x) => charIds.has(x)),
      closed: arr(l.closed).filter((x) => slotIds.has(x)),
    }));
    const locIds = new Set(d.locations.map((l) => l.id));

    const travel = raw.travel && typeof raw.travel === 'object' ? raw.travel : {};
    Object.keys(travel).forEach((k) => {
      const [a, b] = k.split('|');
      const v = Number(travel[k]);
      if (locIds.has(a) && locIds.has(b) && a !== b && Number.isFinite(v) && v >= 0 && travel[k] !== '' && travel[k] !== null) {
        d.travel[travelKey(a, b)] = v;
      }
    });

    const cells = raw.cells && typeof raw.cells === 'object' ? raw.cells : {};
    Object.keys(cells).forEach((k) => {
      const [c, s] = k.split('|');
      if (!charIds.has(c) || !slotIds.has(s)) return;
      const entries = arr(cells[k])
        .filter((e) => e && typeof e === 'object')
        .map((e) => ({ loc: locIds.has(e.loc) ? e.loc : '', action: str(e.action) }))
        .filter((e) => e.loc || e.action);
      if (entries.length) d.cells[cellKey(c, s)] = entries;
    });

    d.testimonies = uniq(arr(raw.testimonies).filter((t) => t && okId(t.id))).map((t) => ({
      id: t.id,
      witness: charIds.has(t.witness) ? t.witness : '',
      target: charIds.has(t.target) ? t.target : '',
      slot: slotIds.has(t.slot) ? t.slot : '',
      loc: locIds.has(t.loc) ? t.loc : '',
      note: str(t.note),
      lie: !!t.lie,
      remote: !!t.remote,
    }));

    d.clues = uniq(arr(raw.clues).filter((k) => k && okId(k.id))).map((k) => ({
      id: k.id,
      name: str(k.name),
      memo: str(k.memo),
      secret: !!k.secret,
      knownBy: arr(k.knownBy).filter((x) => charIds.has(x)),
    }));
    return d;
  }

  // 人物・時刻・場所を消したときに、それを指している情報も消す
  function removeCharacter(d, id) {
    d.characters = d.characters.filter((c) => c.id !== id);
    return normalize(d);
  }
  function removeSlot(d, id) {
    d.slots = d.slots.filter((s) => s.id !== id);
    return normalize(d);
  }
  function removeLocation(d, id) {
    d.locations = d.locations.filter((l) => l.id !== id);
    return normalize(d);
  }

  MM.APP_ID = APP_ID;
  MM.uid = uid;
  MM.emptyScenario = emptyScenario;
  MM.newScenario = newScenario;
  MM.cellKey = cellKey;
  MM.travelKey = travelKey;
  MM.normalize = normalize;
  MM.removeCharacter = removeCharacter;
  MM.removeSlot = removeSlot;
  MM.removeLocation = removeLocation;
})(typeof window !== 'undefined' ? window : globalThis);

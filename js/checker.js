/* 矛盾チェック。画面に依存しない純粋な関数なので tests.html からも呼ぶ */
(function (global) {
  'use strict';
  const MM = (global.MM = global.MM || {});

  const RULES = [
    { id: 'double', name: '同じ時刻に複数の場所にいる', level: 'error' },
    { id: 'travel', name: '移動時間が足りない', level: 'error' },
    { id: 'restricted', name: '立ち入れない場所への出入り', level: 'error' },
    { id: 'testimony', name: '証言と行動の食い違い', level: 'error' },
    { id: 'witness', name: '目撃者がその場にいない', level: 'error' },
    { id: 'unbacked', name: '証言の裏付けがない', level: 'warn' },
    { id: 'clueNobody', name: '誰も知らない手がかり', level: 'warn' },
    { id: 'secretAll', name: '全員が知っている秘密', level: 'warn' },
    { id: 'slotTime', name: '時刻の書式・並び', level: 'warn' },
  ];
  const RULE_BY_ID = {};
  RULES.forEach((r) => (RULE_BY_ID[r.id] = r));

  // "21:30" → 1290。読めなければ null
  function parseTime(s) {
    const m = /^\s*(\d{1,2})[:：](\d{2})\s*$/.exec(s || '');
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 47 || min > 59) return null;
    return h * 60 + min;
  }

  // 時刻を通しの分に直す。前より小さくなったら日付をまたいだとみなす
  function slotMinutes(slots) {
    const out = {};
    const bad = [];
    let prev = null;
    let offset = 0;
    slots.forEach((s) => {
      const t = parseTime(s.time);
      if (t === null) {
        out[s.id] = null;
        bad.push({ slot: s, why: 'format' });
        return;
      }
      let v = t + offset;
      if (prev !== null && v < prev) {
        offset += 1440;
        v += 1440;
      }
      if (prev !== null && v === prev) bad.push({ slot: s, why: 'dup' });
      out[s.id] = v;
      prev = v;
    });
    return { minutes: out, bad };
  }

  // 設定された移動時間を辺とみなした最短経路。つながっていない組は既定値
  function travelTable(d) {
    const ids = d.locations.map((l) => l.id);
    const dist = {};
    ids.forEach((a) => {
      dist[a] = {};
      ids.forEach((b) => (dist[a][b] = a === b ? 0 : Infinity));
    });
    Object.keys(d.travel).forEach((k) => {
      const [a, b] = k.split('|');
      if (dist[a] && dist[b]) {
        const v = Number(d.travel[k]);
        dist[a][b] = Math.min(dist[a][b], v);
        dist[b][a] = Math.min(dist[b][a], v);
      }
    });
    ids.forEach((k) => ids.forEach((i) => ids.forEach((j) => {
      if (dist[i][k] + dist[k][j] < dist[i][j]) dist[i][j] = dist[i][k] + dist[k][j];
    })));
    return (a, b) => {
      if (a === b) return 0;
      const v = dist[a] && dist[a][b];
      return v === undefined || v === Infinity ? Number(d.defaultTravel) || 0 : v;
    };
  }

  function check(d) {
    const warnings = [];
    const charName = {};
    d.characters.forEach((c) => (charName[c.id] = c.name || '(名前なし)'));
    const slotLabel = {};
    d.slots.forEach((s) => (slotLabel[s.id] = s.time || '(時刻なし)'));
    const locById = {};
    d.locations.forEach((l) => (locById[l.id] = l));
    const locName = (id) => (locById[id] ? locById[id].name || '(名前なし)' : '?');
    const key = MM.cellKey;

    const add = (rule, msg, target, extra) => {
      warnings.push(Object.assign({ rule, level: RULE_BY_ID[rule].level, msg, cells: [] }, target, extra || {}));
    };

    // ある人物・時刻にいた場所 (重複なし)
    const locsAt = (c, s) => {
      const list = d.cells[key(c, s)] || [];
      return [...new Set(list.map((e) => e.loc).filter(Boolean))];
    };

    const { minutes, bad } = slotMinutes(d.slots);
    bad.forEach(({ slot, why }) => {
      add('slotTime', why === 'format'
        ? `時刻「${slot.time}」が読めません。「21:30」の形で入力してください (移動時間の確認から外れます)`
        : `時刻「${slot.time}」が前の行と同じです`, { kind: 'slot', id: slot.id });
    });

    const dist = travelTable(d);

    d.characters.forEach((c) => {
      let prev = null; // { slot, loc }
      d.slots.forEach((s) => {
        const locs = locsAt(c.id, s.id);
        if (locs.length > 1) {
          add('double', `${charName[c.id]} は ${slotLabel[s.id]} に ${locs.map((l) => `「${locName(l)}」`).join('と')} の ${locs.length} か所にいます`,
            { kind: 'cell', cells: [key(c.id, s.id)] });
        }
        locs.forEach((l) => {
          const loc = locById[l];
          if (loc.allowed.length && loc.allowed.indexOf(c.id) < 0) {
            add('restricted', `${charName[c.id]} は ${slotLabel[s.id]} に「${loc.name}」にいますが、入れるのは ${loc.allowed.map((x) => charName[x]).join('・')} だけです`,
              { kind: 'cell', cells: [key(c.id, s.id)] });
          }
          if (loc.closed.indexOf(s.id) >= 0) {
            add('restricted', `${charName[c.id]} は ${slotLabel[s.id]} に「${loc.name}」にいますが、この時刻は閉鎖中です`,
              { kind: 'cell', cells: [key(c.id, s.id)] });
          }
        });
        if (locs.length !== 1) {
          if (locs.length > 1) prev = null; // どこにいたか決まらないので、前後の移動は見ない
          return;
        }
        const cur = { slot: s, loc: locs[0] };
        if (prev && prev.loc !== cur.loc && minutes[prev.slot.id] != null && minutes[cur.slot.id] != null) {
          const need = dist(prev.loc, cur.loc);
          const have = minutes[cur.slot.id] - minutes[prev.slot.id];
          if (need > have) {
            add('travel', `${charName[c.id]} は ${slotLabel[prev.slot.id]}「${locName(prev.loc)}」→ ${slotLabel[cur.slot.id]}「${locName(cur.loc)}」の移動に ${need} 分かかりますが、${have} 分しかありません`,
              { kind: 'cell', cells: [key(c.id, prev.slot.id), key(c.id, cur.slot.id)] });
          }
        }
        if (minutes[cur.slot.id] != null) prev = cur;
      });
    });

    d.testimonies.forEach((t) => {
      if (!t.witness || !t.target || !t.slot || !t.loc || t.lie) return;
      const w = charName[t.witness];
      const tg = charName[t.target];
      const when = slotLabel[t.slot];
      const where = locName(t.loc);
      const self = t.witness === t.target;
      const what = self ? `${w} の「${when} に「${where}」にいた」という証言` : `${w} の「${when} に「${where}」で ${tg} を見た」という証言`;
      const tLocs = locsAt(t.target, t.slot);
      if (!tLocs.length) {
        add('unbacked', `${what}に対して、${tg} の ${when} の居場所が時系列表にありません`,
          { kind: 'testimony', id: t.id, cells: [key(t.target, t.slot)] });
      } else if (tLocs.indexOf(t.loc) < 0) {
        add('testimony', `${what}が、時系列表 (${tg} は ${tLocs.map(locName).join('・')}) と食い違います`,
          { kind: 'testimony', id: t.id, cells: [key(t.target, t.slot)] });
      }
      if (!self && !t.remote) {
        const wLocs = locsAt(t.witness, t.slot);
        if (wLocs.length && wLocs.indexOf(t.loc) < 0) {
          add('witness', `${what}がありますが、${w} 自身は ${when} に ${wLocs.map(locName).join('・')} にいます`,
            { kind: 'testimony', id: t.id, cells: [key(t.witness, t.slot)] });
        }
      }
    });

    d.clues.forEach((k) => {
      const name = k.name || '(名前なし)';
      if (!k.knownBy.length) {
        add('clueNobody', `手がかり「${name}」を知っている人物がいません`, { kind: 'clue', id: k.id });
      } else if (k.secret && d.characters.length > 1 && d.characters.every((c) => k.knownBy.indexOf(c.id) >= 0)) {
        add('secretAll', `秘密「${name}」を全員が知っています`, { kind: 'clue', id: k.id });
      }
    });

    const order = {};
    RULES.forEach((r, i) => (order[r.id] = i));
    warnings.sort((a, b) => order[a.rule] - order[b.rule]);
    return warnings;
  }

  MM.RULES = RULES;
  MM.RULE_BY_ID = RULE_BY_ID;
  MM.parseTime = parseTime;
  MM.travelTable = travelTable;
  MM.check = check;
})(typeof window !== 'undefined' ? window : globalThis);

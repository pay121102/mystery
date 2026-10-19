/* tests.html から読み込むテスト */
(function () {
  'use strict';
  const MM = window.MM;
  const results = [];

  function test(name, fn) {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, err: e && e.message ? e.message : String(e) });
    }
  }
  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assert に失敗');
  }
  function eq(a, b, msg) {
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    if (sa !== sb) throw new Error((msg ? msg + '\n' : '') + '期待: ' + sb + '\n実際: ' + sa);
  }
  // 警告を比べやすい形にする
  const sig = (w) => [w.rule, w.id || '', (w.cells || []).slice().sort().join(',')].join(' / ');
  const sigs = (ws) => ws.map(sig).sort();
  const rulesOf = (ws) => ws.map((w) => w.rule).sort();

  // 小さなシナリオを作る
  function mini(extra) {
    return MM.normalize(Object.assign({
      characters: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      slots: [{ id: 's1', time: '21:00' }, { id: 's2', time: '21:10' }, { id: 's3', time: '21:20' }],
      locations: [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }, { id: 'z', name: 'Z' }],
      travel: {},
      defaultTravel: 5,
      cells: {},
      testimonies: [],
      clues: [],
    }, extra));
  }
  const at = (loc, action) => [{ loc, action: action || '' }];

  /* ---- サンプル ---- */
  test('サンプル: 入れてある矛盾がすべて、余計なものなしで警告される', () => {
    const ws = MM.check(MM.sampleScenario());
    eq(sigs(ws), sigs(MM.SAMPLE_EXPECTED));
  });

  test('サンプル: 矛盾は 3 つ以上 (エラー級の警告の数)', () => {
    const ws = MM.check(MM.sampleScenario());
    assert(ws.filter((w) => w.level === 'error').length >= 3, 'エラー級が 3 件未満');
  });

  test('サンプル: 意図的な嘘の証言 (t3) は警告されない', () => {
    const ws = MM.check(MM.sampleScenario());
    assert(!ws.some((w) => w.id === 't3'), 't3 が警告された');
  });

  // 1 つずつ直すと、その警告だけが消える
  const FIXES = {
    double: (d) => { d.cells['aoki|s2200'] = [{ loc: 'kitchen', action: '水をもらう' }]; },
    travel: (d) => { d.cells['akasaka|s2130'] = [{ loc: 'garden', action: '散歩' }]; },
    restricted: (d) => { d.locations.find((l) => l.id === 'study').allowed.push('midorikawa'); },
    testimony: (d) => { d.cells['shiraishi|s2215'] = [{ loc: 'hall', action: '大広間を通って厨房へ' }]; },
    witness: (d) => { d.testimonies.find((t) => t.id === 't2').remote = true; },
    clueNobody: (d) => { d.clues.find((k) => k.id === 'k2').knownBy = ['aoki']; },
    secretAll: (d) => { const k = d.clues.find((x) => x.id === 'k3'); k.knownBy = k.knownBy.filter((x) => x !== 'midorikawa'); },
  };
  Object.keys(FIXES).forEach((rule) => {
    test(`サンプル: 「${MM.RULE_BY_ID[rule].name}」を直すとその警告だけ消える`, () => {
      const d = MM.sampleScenario();
      FIXES[rule](d);
      const ws = MM.check(d);
      eq(sigs(ws), sigs(MM.SAMPLE_EXPECTED.filter((x) => x.rule !== rule)));
    });
  });

  test('サンプル: すべて直すと警告が 0 件になる', () => {
    const d = MM.sampleScenario();
    Object.keys(FIXES).forEach((r) => FIXES[r](d));
    eq(sigs(MM.check(d)), []);
  });

  /* ---- 書き出し・読み込み ---- */
  test('JSON 書き出し → 読み込みで内容が完全に戻る', () => {
    const d = MM.sampleScenario();
    const back = MM.normalize(JSON.parse(JSON.stringify(d, null, 2)));
    eq(back, d);
    eq(sigs(MM.check(back)), sigs(MM.check(d)));
  });

  test('新規作成のデータも書き出し → 読み込みで戻る', () => {
    const d = MM.newScenario();
    eq(MM.normalize(JSON.parse(JSON.stringify(d))), d);
  });

  test('他のツールの JSON は読み込みを断る', () => {
    let threw = false;
    try { MM.normalize({ app: 'other-tool' }); } catch (e) { threw = true; }
    assert(threw, '例外にならなかった');
    threw = false;
    try { MM.normalize([1, 2]); } catch (e) { threw = true; }
    assert(threw, '配列で例外にならなかった');
  });

  test('読み込み時、存在しない人物・時刻・場所への参照は捨てる', () => {
    const d = mini({
      cells: { 'a|s1': at('nowhere', '何か'), 'ghost|s1': at('x'), 'a|s9': at('x') },
      testimonies: [{ id: 't', witness: 'ghost', target: 'a', slot: 's1', loc: 'x' }],
      clues: [{ id: 'k', name: 'K', knownBy: ['a', 'ghost'] }],
      locations: [{ id: 'x', name: 'X', allowed: ['ghost', 'b'], closed: ['s9', 's2'] }],
    });
    eq(Object.keys(d.cells), ['a|s1']);
    eq(d.cells['a|s1'], [{ loc: '', action: '何か' }]);
    eq(d.testimonies[0].witness, '');
    eq(d.clues[0].knownBy, ['a']);
    eq(d.locations[0].allowed, ['b']);
    eq(d.locations[0].closed, ['s2']);
  });

  test('人物を消すと、その人物の行動・手がかりの記録も消える', () => {
    let d = MM.sampleScenario();
    d = MM.removeCharacter(d, 'aoki');
    assert(!Object.keys(d.cells).some((k) => k.startsWith('aoki|')), '行動が残っている');
    assert(!d.clues.some((k) => k.knownBy.indexOf('aoki') >= 0), '手がかりに残っている');
    assert(!MM.check(d).some((w) => w.rule === 'double'), '青木の同時 2 か所が残っている');
  });

  /* ---- ルールごと ---- */
  test('同時に複数の場所: 同じ場所の行動が 2 つなら警告しない', () => {
    eq(rulesOf(MM.check(mini({ cells: { 'a|s1': [{ loc: 'x', action: '1' }, { loc: 'x', action: '2' }] } }))), []);
    eq(rulesOf(MM.check(mini({ cells: { 'a|s1': [{ loc: 'x', action: '1' }, { loc: 'y', action: '2' }] } }))), ['double']);
  });

  test('移動時間: 経由する道の合計で計算する', () => {
    // x-y 6 分, y-z 6 分 → x-z は 12 分。20 分あれば足りる、10 分では足りない
    const travel = { 'x|y': 6, 'y|z': 6 };
    eq(rulesOf(MM.check(mini({ travel, cells: { 'a|s1': at('x'), 'a|s3': at('z') } }))), []);
    eq(rulesOf(MM.check(mini({ travel, cells: { 'a|s1': at('x'), 'a|s2': at('z') } }))), ['travel']);
  });

  test('移動時間: どことも結ばれていない場所は既定値を使う', () => {
    eq(rulesOf(MM.check(mini({ defaultTravel: 15, cells: { 'a|s1': at('x'), 'a|s2': at('y') } }))), ['travel']);
    eq(rulesOf(MM.check(mini({ defaultTravel: 10, cells: { 'a|s1': at('x'), 'a|s2': at('y') } }))), []);
  });

  test('移動時間: 日付をまたぐ時刻 (23:50 → 0:05) を扱える', () => {
    const slots = [{ id: 's1', time: '23:50' }, { id: 's2', time: '0:05' }];
    eq(rulesOf(MM.check(mini({ slots, defaultTravel: 10, cells: { 'a|s1': at('x'), 'a|s2': at('y') } }))), []);
    eq(rulesOf(MM.check(mini({ slots, defaultTravel: 20, cells: { 'a|s1': at('x'), 'a|s2': at('y') } }))), ['travel']);
  });

  test('移動時間: 空いたマスをはさんでも前後で比べる', () => {
    eq(rulesOf(MM.check(mini({ defaultTravel: 15, cells: { 'a|s1': at('x'), 'a|s3': at('y') } }))), []);
    eq(rulesOf(MM.check(mini({ defaultTravel: 25, cells: { 'a|s1': at('x'), 'a|s3': at('y') } }))), ['travel']);
  });

  test('立ち入り: 入れる人の限定と閉鎖時刻', () => {
    const locations = [{ id: 'x', name: 'X', allowed: ['b'], closed: [] }, { id: 'y', name: 'Y', closed: ['s2'] }];
    eq(rulesOf(MM.check(mini({ locations, cells: { 'a|s1': at('x'), 'b|s1': at('x') } }))), ['restricted']);
    eq(rulesOf(MM.check(mini({ locations, cells: { 'a|s2': at('y') } }))), ['restricted']);
    eq(rulesOf(MM.check(mini({ locations, cells: { 'a|s1': at('y') } }))), []);
  });

  test('証言: 食い違い・目撃者不在・嘘・離れた場所・本人の主張', () => {
    const cells = { 'a|s1': at('x'), 'b|s1': at('y') };
    const t = (o) => [Object.assign({ id: 't', witness: 'a', target: 'b', slot: 's1', loc: 'y' }, o)];
    // a は x にいるのに y で b を見た → 目撃者不在
    eq(rulesOf(MM.check(mini({ cells, testimonies: t({}) }))), ['witness']);
    eq(rulesOf(MM.check(mini({ cells, testimonies: t({ remote: true }) }))), []);
    // b は y にいるのに x で見た → 食い違い (目撃者 a は x にいるので不在ではない)
    eq(rulesOf(MM.check(mini({ cells, testimonies: t({ loc: 'x' }) }))), ['testimony']);
    eq(rulesOf(MM.check(mini({ cells, testimonies: t({ loc: 'x', lie: true }) }))), []);
    // 本人の主張
    eq(rulesOf(MM.check(mini({ cells, testimonies: t({ witness: 'b', loc: 'y' }) }))), []);
    eq(rulesOf(MM.check(mini({ cells, testimonies: t({ witness: 'b', loc: 'z' }) }))), ['testimony']);
  });

  test('証言: 相手の行動が未入力なら「裏付けがない」(注意)', () => {
    const ws = MM.check(mini({ testimonies: [{ id: 't', witness: 'a', target: 'b', slot: 's2', loc: 'x' }] }));
    eq(rulesOf(ws), ['unbacked']);
    eq(ws[0].level, 'warn');
  });

  test('証言: 入力途中 (空欄あり) の証言は警告しない', () => {
    eq(rulesOf(MM.check(mini({ testimonies: [{ id: 't', witness: 'a', target: '', slot: 's2', loc: 'x' }] }))), []);
  });

  test('手がかり: 誰も知らない / 秘密を全員が知っている / 秘密でなければ全員でもよい', () => {
    eq(rulesOf(MM.check(mini({ clues: [{ id: 'k', name: 'K', knownBy: [] }] }))), ['clueNobody']);
    eq(rulesOf(MM.check(mini({ clues: [{ id: 'k', name: 'K', secret: true, knownBy: ['a', 'b'] }] }))), ['secretAll']);
    eq(rulesOf(MM.check(mini({ clues: [{ id: 'k', name: 'K', secret: false, knownBy: ['a', 'b'] }] }))), []);
    eq(rulesOf(MM.check(mini({ clues: [{ id: 'k', name: 'K', secret: true, knownBy: ['a'] }] }))), []);
  });

  test('時刻: 読めない書式と重複を注意する', () => {
    const slots = [{ id: 's1', time: '21:00' }, { id: 's2', time: '夜' }, { id: 's3', time: '21:00' }];
    eq(rulesOf(MM.check(mini({ slots }))), ['slotTime', 'slotTime']);
    eq(MM.parseTime('21：30'), 1290);
    eq(MM.parseTime('25:61'), null);
  });

  test('すべての警告にメッセージと飛び先がある', () => {
    MM.check(MM.sampleScenario()).forEach((w) => {
      assert(w.msg && w.msg.length > 5, 'メッセージが空');
      assert(['cell', 'testimony', 'clue', 'slot'].indexOf(w.kind) >= 0, '飛び先の種類がない');
      assert(w.kind !== 'cell' || w.cells.length > 0, 'セルがない');
    });
  });

  /* ---- 表示 ---- */
  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const summary = document.getElementById('summary');
  summary.textContent = failed ? `失敗 ${failed} 件 / 全 ${results.length} 件` : `すべて成功 (${results.length} 件)`;
  summary.style.color = failed ? 'var(--error)' : '#2e7d32';
  summary.dataset.failed = String(failed);
  const box = document.getElementById('results');
  results.forEach((r) => {
    const div = document.createElement('div');
    div.className = 'result ' + (r.ok ? 'pass' : 'fail');
    div.textContent = (r.ok ? '✓ ' : '✗ ') + r.name;
    if (!r.ok) {
      const pre = document.createElement('pre');
      pre.textContent = r.err;
      div.append(pre);
    }
    box.append(div);
  });
  window.TEST_RESULTS = { passed, failed, results };
})();

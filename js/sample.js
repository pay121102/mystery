/* 同梱のサンプルシナリオ (架空)。矛盾をわざと 5 つ、手がかりの警告を 2 つ入れてある */
(function (global) {
  'use strict';
  const MM = (global.MM = global.MM || {});

  function sampleScenario() {
    const e = (loc, action) => ({ loc, action });
    return MM.normalize({
      app: MM.APP_ID,
      version: 1,
      title: 'サンプル: 雪鳴館の殺人',
      defaultTravel: 5,
      characters: [
        { id: 'kurokawa', name: '黒川', memo: '館の主人。被害者' },
        { id: 'shiraishi', name: '白石', memo: '執事' },
        { id: 'akasaka', name: '赤坂', memo: '画家' },
        { id: 'aoki', name: '青木', memo: '医師' },
        { id: 'midorikawa', name: '緑川', memo: '黒川の姪' },
      ],
      slots: [
        { id: 's2100', time: '21:00' },
        { id: 's2115', time: '21:15' },
        { id: 's2130', time: '21:30' },
        { id: 's2145', time: '21:45' },
        { id: 's2200', time: '22:00' },
        { id: 's2215', time: '22:15' },
        { id: 's2230', time: '22:30' },
      ],
      locations: [
        { id: 'hall', name: '大広間', allowed: [], closed: [] },
        { id: 'study', name: '書斎', allowed: ['kurokawa', 'shiraishi'], closed: [] },
        { id: 'kitchen', name: '厨房', allowed: [], closed: [] },
        { id: 'guest', name: '客室A', allowed: [], closed: [] },
        { id: 'garden', name: '庭', allowed: [], closed: [] },
        { id: 'greenhouse', name: '温室', allowed: [], closed: [] },
      ],
      travel: {
        'hall|study': 2,
        'hall|kitchen': 2,
        'guest|hall': 3,
        'garden|hall': 5,
        'garden|greenhouse': 12,
        'garden|kitchen': 4,
        'guest|study': 3,
      },
      cells: {
        'kurokawa|s2100': [e('hall', '夕食後の挨拶')],
        'kurokawa|s2115': [e('study', '書類の整理')],
        'kurokawa|s2130': [e('study', '書類の整理')],
        'kurokawa|s2145': [e('study', '緑川と口論')],
        'kurokawa|s2200': [e('study', '白石の運んだ紅茶を飲む')],
        'kurokawa|s2215': [e('study', '殺害される')],
        'kurokawa|s2230': [e('study', '(遺体)')],

        'shiraishi|s2100': [e('hall', '給仕')],
        'shiraishi|s2115': [e('kitchen', '片付け')],
        'shiraishi|s2130': [e('kitchen', '紅茶の用意')],
        'shiraishi|s2145': [e('hall', '暖炉に薪をくべる')],
        'shiraishi|s2200': [e('study', '紅茶を運ぶ')],
        'shiraishi|s2215': [e('kitchen', '洗い物')], // 矛盾3: 緑川は大広間で見たと証言
        'shiraishi|s2230': [e('kitchen', '洗い物')],

        'akasaka|s2100': [e('hall', '談笑')],
        'akasaka|s2115': [e('hall', '談笑')],
        'akasaka|s2130': [e('hall', 'スケッチ')],
        'akasaka|s2145': [e('greenhouse', '蘭を描く')], // 矛盾2: 大広間から温室まで 17 分かかる
        'akasaka|s2200': [e('greenhouse', '蘭を描く')],
        'akasaka|s2215': [e('garden', '雪を眺める')],
        'akasaka|s2230': [e('garden', '雪を眺める')],

        'aoki|s2100': [e('hall', '談笑')],
        'aoki|s2115': [e('guest', '往診鞄を取りに戻る')],
        'aoki|s2130': [e('guest', '手紙を書く')],
        'aoki|s2145': [e('hall', 'ピアノを弾く')],
        'aoki|s2200': [e('kitchen', '水をもらう'), e('guest', '読書')], // 矛盾1: 同じ時刻に 2 か所
        'aoki|s2215': [e('hall', 'ピアノを弾く')],
        'aoki|s2230': [e('hall', '悲鳴を聞く')],

        'midorikawa|s2100': [e('hall', '談笑')],
        'midorikawa|s2115': [e('hall', '談笑')],
        'midorikawa|s2130': [e('hall', '窓の外を見る')],
        'midorikawa|s2145': [e('study', '伯父と口論')], // 矛盾4: 書斎に入れるのは黒川と白石だけ
        'midorikawa|s2200': [e('hall', '泣いている')],
        'midorikawa|s2215': [e('hall', 'ソファで休む')],
        'midorikawa|s2230': [e('hall', '悲鳴を聞く')],
      },
      testimonies: [
        { id: 't1', witness: 'midorikawa', target: 'shiraishi', slot: 's2215', loc: 'hall', note: '白石さんが大広間を横切るのを見た', lie: false, remote: false },
        // 矛盾5: 白石はこの時刻に厨房にいる
        { id: 't2', witness: 'shiraishi', target: 'akasaka', slot: 's2230', loc: 'garden', note: '庭で赤坂さんとすれ違った', lie: false, remote: false },
        { id: 't3', witness: 'aoki', target: 'akasaka', slot: 's2145', loc: 'hall', note: '赤坂さんをかばうための嘘 (警告は出ない)', lie: true, remote: false },
        { id: 't4', witness: 'akasaka', target: 'akasaka', slot: 's2200', loc: 'greenhouse', note: '自分のアリバイの主張', lie: false, remote: false },
        { id: 't5', witness: 'shiraishi', target: 'kurokawa', slot: 's2200', loc: 'study', note: '紅茶を運んだときは元気だった', lie: false, remote: false },
      ],
      clues: [
        { id: 'k1', name: '血のついたペーパーナイフ', memo: '書斎の机の下', secret: false, knownBy: ['shiraishi', 'aoki'] },
        { id: 'k2', name: '破れた手紙の切れ端', memo: '暖炉の灰の中', secret: false, knownBy: [] },
        { id: 'k3', name: '黒川の借金', memo: '赤坂への借金', secret: true, knownBy: ['kurokawa', 'shiraishi', 'akasaka', 'aoki', 'midorikawa'] },
        { id: 'k4', name: '書斎の合鍵', memo: '白石が緑川に渡していた', secret: true, knownBy: ['shiraishi', 'midorikawa'] },
      ],
    });
  }

  // サンプルに入れてある警告の一覧 (tests.html で使う)
  const SAMPLE_EXPECTED = [
    { rule: 'double', cells: ['aoki|s2200'] },
    { rule: 'travel', cells: ['akasaka|s2130', 'akasaka|s2145'] },
    { rule: 'restricted', cells: ['midorikawa|s2145'] },
    { rule: 'testimony', id: 't1', cells: ['shiraishi|s2215'] },
    { rule: 'witness', id: 't2', cells: ['shiraishi|s2230'] },
    { rule: 'clueNobody', id: 'k2' },
    { rule: 'secretAll', id: 'k3' },
  ];

  MM.sampleScenario = sampleScenario;
  MM.SAMPLE_EXPECTED = SAMPLE_EXPECTED;
})(typeof window !== 'undefined' ? window : globalThis);

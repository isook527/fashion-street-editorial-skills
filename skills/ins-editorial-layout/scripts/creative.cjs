const rhythm = [
  ['cover', '封面', '最强造型，先交代主商品'],
  ['environment', '环境大景', '展示人物与街道的尺度'],
  ['motion', '走动抓拍', '用步伐展示垂坠和整体比例'],
  ['emotion', '半身情绪', '以表情、视线和姿态接续场景'],
  ['detail', '结构细节', '展示承诺的款式细节'],
  ['texture', '面料细节', '让纹理和层次可读'],
  ['accessory', '配饰', '鞋包服务主商品，留出衣身轮廓'],
  ['turn', '背影或回头', '核对背面依据，保真缺图时选回头半侧'],
  ['close', '收尾', '留一张动作更安静的环境或半身画面'],
];
const actionLibrary = {
  'boxy-jacket': [
    ['平站双手下垂', []], ['半侧停步', ['远侧口袋']], ['一步走过门口', ['衣长参照']],
    ['小幅回头', ['正面门襟']], ['扶墙且手离开衣身', ['靠墙侧肩缝']], ['抬手整理头发', ['一侧落肩、袖窿']],
  ],
  'flowing-long': [
    ['侧向迈小步', []], ['顺风停步', ['下摆准确长度']], ['回头保持下摆入镜', ['正面门襟']],
    ['站在台阶前的平地', []], ['跨上矮台阶', ['衣长参照']], ['一手轻提裙边', ['自然下摆轮廓']],
  ],
  'wide-leg': [
    ['正面自然站姿', []], ['侧向一步', ['远侧裤脚']], ['双脚错开停步', []],
    ['低一级台阶迈下', ['两侧裤长对照']], ['腰部侧转', ['远侧裤型']], ['浅坐椅缘', ['裤长、裤脚']],
  ],
  'short-skirt': [
    ['正面自然站姿', []], ['斜向小步', []], ['半侧回头', ['正面裙褶']],
    ['站在店门侧面', ['远侧裙摆']], ['扶栏不遮腰线', ['靠栏侧轮廓']], ['浅坐且裙摆可见', ['自然衣长、腰线']],
  ],
};
const grades = {
  'daylight-soft': '日杂浅调，柔和漫射、浅灰阴影、保留白衣纹理',
  'film-warm': '胶片暖调，暖色放在高光和环境，保留肤色与商品色',
  'urban-cool': '冷调都市，降低背景色温，肤色保持中性',
  'ccd-flash': 'CCD 直闪，近轴闪光，环境暗部有层次，高光不过曝',
};

function creativeBrief(project, product = {}) {
  const concept = project.concept ?? {};
  const request = project.request ?? {};
  const count = request.count ?? 9;
  const ratio = request.ratio ?? '3:4';
  const grade = concept.grade ?? 'daylight-soft';
  if (!Number.isSafeInteger(count) || count < 1 || count > 60) throw new Error('request.count must be 1–60.');
  if (!Object.hasOwn(grades, grade)) throw new Error('Unknown color grade.');
  const refs = concept.references ?? [];
  const moods = concept.moods ?? [];
  if (!Array.isArray(refs) || refs.length > 3 || refs.some((ref) => typeof ref !== 'string' || !ref.trim())
    || !Array.isArray(moods) || moods.length > 3 || moods.some((word) => typeof word !== 'string' || !word.trim())) {
    throw new Error('Concept references and moods must be lists of up to three nonempty strings.');
  }
  const missing = [];
  if (!concept.line) missing.push('一句话概念');
  if (refs.length < 3) missing.push(`再补 ${3 - refs.length} 张概念参照`);
  if (moods.length < 3) missing.push(`再补 ${3 - moods.length} 个情绪词`);
  for (const key of ['light', 'temperature', 'street', 'time']) if (!concept.facts?.[key]) missing.push(`facts.${key}`);
  const slots = count === 1 ? [rhythm[0]] : count <= 9
    ? Array.from({ length: count }, (_, i) => rhythm[Math.round(i * 8 / (count - 1))])
    : [...rhythm.slice(0, 6), ...Array.from({ length: count - 9 }, () => rhythm[5]), ...rhythm.slice(6)];
  return {
    concept: { ...concept, references: refs, moods, grade },
    missing,
    defaults: { count, ratio },
    rhythm: slots.map(([role, name, purpose], index) => ({ slot: index + 1, role, name, purpose })),
    actions: actionLibrary[product.volume] ?? [],
    camera: { choices: ['35mm 环境与距离感', '50mm 自然比例', '85mm 压缩背景'],
      optional: ['机位高度', '景深', '引导线', '框中框', '前景遮挡'] },
    styling: ['先定主商品与比例，可用上短下长', '主色控制在三种以内，配饰呼应一处颜色',
      '用材质反差托出主商品，鞋包留出关键部位', '穿搭不覆盖需要展示的肩缝、腰线、袋口或下摆'],
    grade: { direction: grades[grade], whiteBalance: concept.whiteBalance ?? '以样张白平衡为锚',
      skin: '统一整组白平衡并核对肤色，商品保真同时核对服装色' },
  };
}

module.exports = { creativeBrief };

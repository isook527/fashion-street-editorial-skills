const fs = require('node:fs');

const artifacts = ['hands', 'buttons', 'pockets', 'shoes', 'intersections', 'perspective', 'textLogo'];
const repairRoutes = {
  occlusion: '换动作或机位，让部位完整可见',
  identity: '回原始身份参考，只重做该镜头',
  detail: '局部修复，逐项复核数目、位置和纹理',
  pose: '更换底图，重新匹配服装体量与动作',
  color: '先核对参考光线和白平衡，再局部调色并重测色差',
  anatomy: '修正手脚或衣服穿插，复查肢体与商品关系',
  perspective: '减小广角透视，调整机位或背景构图',
  lettering: '改用授权原素材或可编辑文字，复核拼写与标记',
  crop: '改裁切、留白或机位，重查关键部位',
};

function qualityReview(ctx, shot, attempt) {
  if (!ctx.project.quality?.enabled || !attempt) return { failed: [], pending: [] };
  const failed = [];
  const pending = [];
  for (const item of artifacts) {
    const value = attempt.artifacts?.[item];
    if (value === 'fail') failed.push(item);
    else if (value !== 'pass' && !(value === 'na' && attempt.artifactNotes?.[item])) pending.push(item);
  }
  for (const [item, required] of Object.entries(ctx.product.counts ?? {})) {
    if (attempt.counts?.[item] === undefined) pending.push(`count.${item}`);
    else if (attempt.counts[item] !== required) failed.push(`count.${item}`);
  }
  const grade = ctx.project.concept?.grade;
  if (grade) {
    const agreed = ctx.project.concept.whiteBalance ?? '以样张白平衡为锚';
    if (!attempt.grade) pending.push('grade.preset/whiteBalance/skin');
    else if (attempt.grade.preset !== grade || attempt.grade.whiteBalance !== agreed || attempt.grade.skin === 'fail') failed.push('grade');
    else if (attempt.grade.skin !== 'pass') pending.push('grade.skin');
  }
  const prompt = attempt.prompt;
  if (!prompt?.version || !prompt.text || !prompt.tool || !Object.hasOwn(prompt, 'seed')
    || (prompt.seed !== null && !Number.isSafeInteger(prompt.seed))) pending.push('prompt.version/text/tool/seed');
  const policy = ctx.project.quality.color;
  if (policy && (!policy.shots || policy.shots.includes(shot.id))) {
    const reference = ctx.product.views?.[policy.referenceView];
    const validFiles = ctx.present(reference) && ctx.present(attempt.file) && ctx.present(attempt.colorReport);
    let color;
    if (validFiles) {
      try {
        color = JSON.parse(fs.readFileSync(ctx.file(attempt.colorReport), 'utf8'));
        if (color.method !== 'CIE76-D65-sRGB' || color.threshold !== policy.threshold
          || color.referenceSha256 !== ctx.digest(reference) || color.imageSha256 !== ctx.digest(attempt.file)) color = null;
      } catch { color = null; }
    }
    if (color?.verdict === 'fail') failed.push('color.deltaE');
    else if (color?.verdict !== 'pass') pending.push('color.deltaE');
  }
  return { failed, pending };
}

function repairHistory(ctx, validByShot) {
  const history = [];
  for (const shot of ctx.shots.values()) {
    for (const [index, attempt] of (shot.attempts ?? []).entries()) {
      if (!index || !attempt.repair?.cause) continue;
      history.push({ shot: shot.id, previous: shot.attempts[index - 1].id, revision: attempt.id,
        cause: attempt.repair.cause, route: repairRoutes[attempt.repair.cause] ?? attempt.repair.action ?? null,
        action: attempt.repair.action ?? null, passed: validByShot.get(shot.id).has(attempt.id) });
    }
  }
  const causes = [...new Set(history.map((item) => item.cause))];
  return { history, byCause: causes.map((cause) => {
    const trials = history.filter((item) => item.cause === cause);
    const passed = trials.filter((item) => item.passed).length;
    return { cause, attempts: trials.length, passed, rate: passed / trials.length };
  }) };
}

function publicationReview(ctx, stampedPages = []) {
  const publication = ctx.project.publication ?? {};
  const requested = publication.aiContent;
  const real = ctx.person.kind === 'real' || publication.realPerson === true;
  const ready = [];
  const pending = [];
  if (requested === undefined) pending.push('确认成品是否含 AI 生成合成内容');
  if (requested === true) {
    if (publication.platformLabel?.status === 'confirmed' && publication.platformLabel.evidence) ready.push('平台标识已记录');
    else pending.push('发布时主动声明并使用平台提供的标识功能，发布后记录凭证');
    if (publication.originalsRetained === true) ready.push('原始生成文件已保留');
    else pending.push('保留生成原件及已有来源标识');
  }
  if (real) {
    if (ctx.person.consent?.status === 'confirmed' && ctx.person.consent.evidence && ctx.person.consent.scope) ready.push('真人授权范围已记录');
    else pending.push('补真人肖像授权范围与凭证');
  } else if (ctx.person.kind === 'fictional') ready.push('人物档案标记为虚构');
  else if (ctx.project.profiles.person) pending.push('确认人物档案为真人还是虚构');
  return {
    aiContent: requested ?? null,
    visibleLabel: publication.visibleLabel ?? null,
    visibleLabelExported: stampedPages.length > 0 && stampedPages.every((page) => page.disclosureVerified),
    platform: publication.platform ?? null,
    ready, pending,
  };
}

function copyForProject(ctx, plan) {
  const writing = ctx.project.copy ?? {};
  const accepted = new Set(plan.jobs.filter((job) => job.status === 'accepted').map((job) => job.id));
  const verified = new Set(plan.rows.filter((row) => accepted.has(row.shot) && row.verdict === 'pass').map((row) => row.point));
  const product = writing.productName ?? ctx.product.name ?? '本期穿搭';
  const benefits = (writing.benefits ?? []).filter((entry) => verified.has(entry.point) && typeof entry.text === 'string');
  const facts = [...new Set(plan.rows.filter((row) => verified.has(row.point)).map((row) => row.label))];
  const hook = writing.hook ?? (benefits.length ? `${product}怎么搭？${benefits[0].text}` : `${product}的搭配与细节`);
  const caption = writing.caption ?? ([ctx.project.concept?.line, ...benefits.map((entry) => entry.text),
    facts.length ? `组图展示${facts.join('、')}。` : null, writing.callToAction].filter(Boolean).join('\n') || `${product}的造型与细节见组图。`);
  const hashtags = [...new Set(writing.hashtags ?? ['日常穿搭', '穿搭细节'])].map((tag) => `#${String(tag).replace(/^#+/, '').replace(/\s+/g, '')}`);
  const alt = ctx.pages.map((page, index) => ({ page: index + 1,
    text: page.alt ?? [product, ...(page.shots ?? []).map((id) => ctx.shots.get(id)?.alt).filter(Boolean), page.title].filter(Boolean).join('，'),
    review: page.alt ? 'provided' : 'verify-visible-details' }));
  return { hook, caption, hashtags, alt, benefits, disclosure: ctx.project.publication?.aiContent === true
    ? '这组画面使用了 AI 生成或合成内容。' : null };
}

function summarizeFeedback(project) {
  return (project.feedback ?? []).map((entry) => {
    const counts = ['impressions', 'saves', 'clicks'];
    if (!entry.cover || !entry.window || !entry.platform || counts.some((key) => !Number.isSafeInteger(entry[key]) || entry[key] < 0)
      || entry.clicks > entry.impressions || entry.saves > entry.impressions) {
      throw new Error('Feedback requires cover, platform, window and valid impressions/saves/clicks.');
    }
    const ratio = (count) => entry.impressions ? count / entry.impressions : null;
    return { ...entry, saveRate: ratio(entry.saves), clickRate: ratio(entry.clicks) };
  });
}

function compareCovers(entries) {
  const experiments = new Map();
  for (const entry of entries) {
    if (!entry.experiment || !entry.control) continue;
    const key = JSON.stringify([entry.experiment, entry.platform, entry.window, entry.control]);
    if (!experiments.has(key)) experiments.set(key, []);
    experiments.get(key).push(entry);
  }
  return [...experiments.values()].filter((entries) => entries.length === 2 && new Set(entries.map((entry) => entry.cover)).size === 2)
    .map(([a, b]) => ({ experiment: a.experiment, covers: [a.cover, b.cover], impressions: [a.impressions, b.impressions],
      saveRateChange: a.saveRate === null || b.saveRate === null ? null : b.saveRate - a.saveRate,
      clickRateChange: a.clickRate === null || b.clickRate === null ? null : b.clickRate - a.clickRate }));
}

module.exports = { artifacts, repairRoutes, qualityReview, repairHistory, publicationReview, copyForProject, summarizeFeedback, compareCovers };

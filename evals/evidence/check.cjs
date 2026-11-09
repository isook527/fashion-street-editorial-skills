const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const evidence = require('./codex-2026-11-09.json');
const docs = fs.readFileSync(path.join(__dirname, '../../docs/evals.md'), 'utf8');
const cohorts = ['with-skill', 'without-skill'];
const groups = new Map();
for (const trial of evidence) {
  assert.match(trial.case, /^0[1-5]-[a-z0-9-]+$/);
  assert.ok(cohorts.includes(trial.condition));
  assert.ok(typeof trial.answer === 'string' && trial.answer.trim(), 'Missing answer');
  const rubric = fs.readFileSync(path.join(__dirname, '../tasks', trial.case, 'rubric.md'), 'utf8');
  const items = [...rubric.matchAll(/^(\d+)\. /gm)].map(match => Number(match[1]));
  assert.deepEqual(trial.rubric.map(item => item.item), items);
  assert.ok(trial.rubric.every(item => item.score === 0 || item.score === 1));
  const group = groups.get(trial.case) ?? new Map(cohorts.map(cohort => [cohort, new Map()]));
  const runs = group.get(trial.condition);
  assert.ok([1, 2, 3].includes(trial.trial) && !runs.has(trial.trial), 'Unexpected or duplicate trial');
  runs.set(trial.trial, [trial.rubric.reduce((sum, item) => sum + item.score, 0), items.length]);
  groups.set(trial.case, group);
}

const reported = new Map([...docs.matchAll(/^\| \[[^\]]+\]\(\.\.\/evals\/tasks\/([a-z0-9-]+)\/prompt\.md\) \| (\d+\/\d+) \| (\d+\/\d+) \|/gm)]
  .map(([, task, withSkill, withoutSkill]) => [task, [withSkill, withoutSkill]]));
assert.equal(groups.size, reported.size, 'Evidence and report cover different tasks');
for (const [task, group] of groups) {
  const totals = cohorts.map(cohort => {
    const runs = group.get(cohort);
    assert.equal(runs.size, 3, 'Expected three trials per condition');
    const [score, possible] = [...runs.values()].reduce(([sum, max], [earned, count]) => [sum + earned, max + count], [0, 0]);
    return score + '/' + possible;
  });
  assert.deepEqual(totals, reported.get(task), task);
  console.log(task, ...totals);
}

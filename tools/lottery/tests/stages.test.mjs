import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_IDS,
  createStage,
  isStageId,
  stageInfo,
  stageLabel,
} from '../site/src/stages/index.js';

test('每种形态都有 id、名字与 create', () => {
  for (const stage of STAGES) {
    assert.equal(typeof stage.id, 'string', '缺 id');
    assert.match(stage.id, /^[a-z][a-z0-9-]*$/, `id 形状不对：${stage.id}`);
    assert.equal(typeof stage.label, 'string', `${stage.id} 缺 label`);
    assert.notEqual(stage.label.trim(), '', `${stage.id} 的 label 是空的`);
    assert.equal(typeof stage.create, 'function', `${stage.id} 缺 create`);
    assert.equal(typeof stage.styles, 'string', `${stage.id} 缺 styles`);
  }
});

test('id 不重复，默认形态在册', () => {
  assert.equal(new Set(STAGE_IDS).size, STAGE_IDS.length);
  assert.ok(isStageId(DEFAULT_STAGE));
  assert.equal(stageLabel(DEFAULT_STAGE), STAGE_IDS.map(stageLabel)[0]);
});

test('认不出的 id 退回第一种形态', () => {
  assert.equal(stageInfo('does-not-exist').id, DEFAULT_STAGE);
  assert.equal(stageLabel('does-not-exist'), stageInfo(DEFAULT_STAGE).label);
  assert.equal(isStageId('does-not-exist'), false);
});

test('createStage 交给对应形态', () => {
  let called = '';
  const host = { replaceChildren() {} };
  for (const stage of STAGES) {
    const original = stage.create;
    stage.create = (received) => {
      called = stage.id;
      assert.equal(received, host);
      return { begin() {}, reveal() {}, reset() {}, destroy() {} };
    };
    try {
      createStage(stage.id, host);
      assert.equal(called, stage.id);
    } finally {
      stage.create = original;
    }
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_IDS,
  createStage,
  isStageId,
  stageBatch,
  stageInfo,
  stageLabel,
  stageMode,
} from '../site/src/stages/index.js';

test('每种形态都有 id、名字、create 与整屏界面', () => {
  for (const stage of STAGES) {
    assert.equal(typeof stage.id, 'string', '缺 id');
    assert.match(stage.id, /^[a-z][a-z0-9-]*$/, `id 形状不对：${stage.id}`);
    assert.equal(typeof stage.label, 'string', `${stage.id} 缺 label`);
    assert.notEqual(stage.label.trim(), '', `${stage.id} 的 label 是空的`);
    assert.equal(typeof stage.create, 'function', `${stage.id} 缺 create`);
    assert.equal(typeof stage.styles, 'string', `${stage.id} 缺 styles`);
  }
});

test('createStage 把入口一起交给形态', () => {
  let received = null;
  const host = { replaceChildren() {} };
  const api = { start() {}, pickPrize() {} };
  for (const stage of STAGES) {
    const original = stage.create;
    stage.create = (_host, _config, given) => {
      received = given;
      return { begin() {}, reveal() {}, reset() {}, update() {}, destroy() {} };
    };
    try {
      createStage(stage.id, host, {}, api);
      assert.equal(received, api, `${stage.id} 没拿到入口`);
    } finally {
      stage.create = original;
    }
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

test('每种形态自带抽法；一次抽几个是形态内部的配置', () => {
  for (const stage of STAGES) {
    assert.ok(stage.mode === 'prize-person' || stage.mode === 'person-prize', `${stage.id} 缺 mode`);
    const hasBatch = (stage.config ?? []).some((field) => field.key === 'batch');
    assert.equal(hasBatch, stage.mode === 'prize-person', `${stage.id} 的 batch 配置与抽法不一致`);
  }
  assert.equal(stageMode('wheel'), 'person-prize');
  assert.equal(stageMode('cards'), 'prize-person');
  assert.equal(stageBatch('wheel', {}), 1);
  assert.equal(stageBatch('cards', { batch: 3 }), 3);
});

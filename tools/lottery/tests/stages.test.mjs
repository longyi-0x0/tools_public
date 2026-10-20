import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_STAGE,
  STAGES,
  STAGE_IDS,
  createStage,
  isStageId,
  normalizeConfig,
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
  // 转盘 / 九宫格 / 老虎机都是「上台一个人 → 抽一个奖」
  for (const id of ['wheel', 'grid', 'slot']) {
    assert.equal(stageMode(id), 'person-prize');
    assert.equal(stageBatch(id, {}), 1);
  }
});

test('每种形态都能选样式，默认那一套在选项里', () => {
  for (const stage of STAGES) {
    const field = (stage.config ?? []).find((item) => item.key === 'skin');
    assert.ok(field !== undefined, `${stage.id} 没有样式可选`);
    assert.equal(field.type, 'select', `${stage.id} 的样式不是下拉`);
    assert.ok(field.options.length > 1, `${stage.id} 只有一套样式`);
    assert.ok(
      field.options.some((option) => option.value === field.value),
      `${stage.id} 的默认样式不在选项里`,
    );
    assert.equal(normalizeConfig(stage.id, {}).skin, field.value, `${stage.id} 取不到默认样式`);
    assert.equal(
      normalizeConfig(stage.id, { skin: '不存在的样式' }).skin,
      field.value,
      `${stage.id} 认不出的样式没退回默认`,
    );
  }
});

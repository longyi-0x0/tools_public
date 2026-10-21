import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_STAGE,
  STAGES,
  capabilitiesOf,
  compatible,
  isStageId,
  normalizeConfig,
  stageBatch,
  stageFields,
  stageInfo,
  stageLabel,
  stagesFor,
} from '../site/src/stages/index.js';
import { PROTOCOLS, protocolInfo } from '../site/src/protocols.js';

test('三种形态都登记在册，且都声明了能力', () => {
  assert.equal(STAGES.length, 3);
  assert.deepEqual(
    STAGES.map((stage) => stage.id),
    ['wheel', 'grid', 'slot'],
  );
  assert.equal(DEFAULT_STAGE, 'wheel');
  for (const stage of STAGES) {
    assert.equal(isStageId(stage.id), true);
    assert.equal(typeof stage.label, 'string');
    assert.equal(typeof stage.capabilities, 'object');
    assert.equal(typeof stage.create, 'function');
    // 形态不再声明自己是什么抽法
    assert.equal('mode' in stage, false);
  }
});

test('认不出的形态 id 退回第一种', () => {
  assert.equal(stageInfo('没有这个').id, DEFAULT_STAGE);
  assert.equal(stageLabel('没有这个'), stageLabel(DEFAULT_STAGE));
});

test('能力协商：现有三种形态都能承接两种抽法', () => {
  for (const protocol of PROTOCOLS) {
    const usable = stagesFor(protocol);
    assert.equal(usable.length, 3, `${protocol.label} 应能用三种形态`);
    for (const stage of usable) {
      assert.equal(compatible(stage, protocol), true);
    }
  }
});

test('能力协商：画不了多个结果的形态接不了多人抽奖', () => {
  const single = { id: 'single', label: '单格', capabilities: { spin: 1, slots: 2, winners: 1 } };
  assert.equal(compatible(single, protocolInfo('person-prize')), true);
  assert.equal(compatible(single, protocolInfo('prize-person')), false);
});

test('能力协商：不转的形态接不了要转的抽法', () => {
  const plain = { id: 'plain', label: '揭晓卡', capabilities: { spin: 0, slots: 2, winners: 'many' } };
  assert.equal(compatible(plain, protocolInfo('prize-person')), false);
  assert.equal(compatible(plain, { requires: { spin: 0, slots: 1, winners: 1 } }), true);
});

test('能力缺项时按最保守的一份算', () => {
  const capabilities = capabilitiesOf('没有这个');
  assert.deepEqual(capabilities, { spin: 0, slots: 1, winners: 1, labels: 1 });
});

test('配置项与默认值', () => {
  const keys = stageFields('wheel').map((field) => field.key);
  assert.deepEqual(keys, ['skin', 'duration', 'sound']);
  assert.equal(stageBatch('wheel', {}), 1);
});

test('配置归一化：越界收边，认不出的选项退回默认', () => {
  assert.equal(normalizeConfig('wheel', { duration: 1 }).duration, 2);
  assert.equal(normalizeConfig('wheel', { duration: 99 }).duration, 8);
  assert.equal(normalizeConfig('wheel', { sound: 'false' }).sound, false);
  assert.equal(normalizeConfig('wheel', { skin: '???' }).skin, 'red-gold');
});

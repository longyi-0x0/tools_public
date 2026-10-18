/** 按名字建舞台；未知名字退回滚动名单。 */

import { STAGE } from '../engine.js';
import { createBallStage } from './ball.js';
import { createCardsStage } from './cards.js';
import { createListStage } from './list.js';
import { createWheelStage } from './wheel.js';

const BUILDERS = {
  [STAGE.LIST]: createListStage,
  [STAGE.CARDS]: createCardsStage,
  [STAGE.WHEEL]: createWheelStage,
  [STAGE.BALL]: createBallStage,
};

export function createStage(name, host) {
  const build = BUILDERS[name] ?? createListStage;
  return build(host);
}

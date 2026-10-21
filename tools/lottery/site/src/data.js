/**
 * 应用数据：抽奖与池两类对象平级。
 *
 * - `pools`：素材池，导入一份 xlsx 得到一份，可复用。池上的 `kind`（人 / 奖品 /
 *   条目）**只决定编辑表单问哪几个字段**，引擎与抽法一概不看它。
 * - `lotteries`：一场抽奖。建的时候把选中的池复制进来，之后各改各的。
 *
 * 复制而不是引用，是为了让进行中的抽奖不受之后改素材影响：
 * 活动中途有人退场、奖品加量，那些都该发生在这场活动自己的副本上。
 *
 * 「哪个池填哪个槽」记在抽奖自己身上（`lottery.slots`），槽不认识池的种类。
 * v4 及更早的存档里池带 `role`，读的时候按旧字段推一次绑定。
 *
 * 存档版本 5。v3 的 `prizes` / `people` 两份数组会在这份文件里一次性转成池。
 */

import {
  KIND_NAMES,
  capacityOf,
  cleanEntries,
  cleanPool,
  cleanText,
  kindOf,
} from './pools.js';
import {
  DEFAULT_PROTOCOL,
  LEGACY_ROLE,
  isProtocolId,
  protocolInfo,
  slotKeys,
} from './protocols.js';
import {
  DEFAULT_STAGE,
  compatible,
  defaultStageFor,
  isStageId,
  normalizeStageConfig,
  stageBatch,
  stageInfo,
} from './stages/index.js';
import { canDraw, createState, nextId, voidKey } from './engine.js';

export const APP_VERSION = 5;

/** 一次最多抽几个。 */
export const MAX_BATCH = 50;

export { LEGACY_ROLE };

export { cleanText };

const VIEWS = new Set(['lotteries', 'pools']);

/* ---------- 条目 ---------- */

/** 一条结果里的 pick；不完整的丢掉。 */
function cleanPick(pick) {
  if (pick === null || typeof pick !== 'object') {
    return null;
  }
  const poolId = cleanText(pick.poolId);
  const entryId = cleanText(pick.entryId);
  if (poolId === '' || entryId === '') {
    return null;
  }
  return {
    slot: cleanText(pick.slot),
    poolId,
    entryId,
    name: cleanText(pick.name),
    meta: pick.meta !== null && typeof pick.meta === 'object' ? pick.meta : {},
  };
}

export function cleanResults(results, fallbackProtocol = DEFAULT_PROTOCOL) {
  return (Array.isArray(results) ? results : [])
    .filter((result) => result !== null && typeof result === 'object' && Array.isArray(result.picks))
    .map((result, index) => ({
      id: cleanText(result.id, `r${index + 1}`),
      at: Number.isFinite(Number(result.at)) ? Number(result.at) : Date.now(),
      protocol: isProtocolId(result.protocol) ? result.protocol : fallbackProtocol,
      picks: result.picks.map(cleanPick).filter((pick) => pick !== null),
    }))
    .filter((result) => result.picks.length > 0);
}

/**
 * 作废清单：记的是 `池/条目`，不是「某个人」。
 *
 * v5 早期存档里是裸的条目 id（那会儿只有人池会作废），只有一个池能对上时补全，
 * 对不上（多个池都有这个 id）就丢掉 —— 与其猜错一格，不如让它回到池里。
 */
function cleanExcluded(raw, pools) {
  const list = Array.isArray(raw) ? raw : [];
  const out = new Set();
  for (const item of list) {
    const text = cleanText(item);
    if (text === '') {
      continue;
    }
    const slash = text.indexOf('/');
    if (slash !== -1) {
      const poolId = text.slice(0, slash);
      const entryId = text.slice(slash + 1);
      if (pools.some((pool) => pool.id === poolId && pool.entries.some((entry) => entry.id === entryId))) {
        out.add(text);
      }
      continue;
    }
    const hits = pools.filter((pool) => pool.entries.some((entry) => entry.id === text));
    if (hits.length === 1) {
      out.add(voidKey(hits[0].id, text));
    }
  }
  return [...out];
}

/* ---------- 槽与池的绑定 ---------- */

/** 一次抽几个：留空表示跟形态走；其余收成 1..MAX_BATCH。 */
export function cleanBatchSize(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 1) {
    return null;
  }
  return Math.min(MAX_BATCH, count);
}

/**
 * 一份绑定初值。**不猜池的种类**：
 *
 * - 只有一个池：每个槽都用它（一个池也能抽）；
 * - 有多个池：全部留空，让人在「绑定」里逐个选。
 *
 * 以前按 `kind` 猜（名单配人中奖槽、奖品配奖项槽），猜错时更难发现 ——
 * 台面上写着奖品名却以为是名单。空着至少一眼看得出来还没配。
 */
export function defaultSlots(pools, protocolId = DEFAULT_PROTOCOL) {
  const list = Array.isArray(pools) ? pools : [];
  const keys = slotKeys(protocolId);
  const slots = {};
  for (const key of keys) {
    slots[key] = list.length === 1 ? list[0].id : null;
  }
  return slots;
}

/**
 * v4 及更早的存档只有池的 `role`、没有绑定 —— 那一支才需要按 role 找池。
 *
 * 只给迁移用：读的是**旧字段**，不是现在的 `kind`。新存档每个槽都有键，
 * 走到 `cleanSlots` 就返回了。
 */
function slotsFromLegacyRole(rawPools, pools, protocolId) {
  const keys = slotKeys(protocolId);
  const slots = {};
  const used = new Set();
  for (const key of keys) {
    const role = LEGACY_ROLE[key] ?? key;
    const hit =
      pools.find((pool, index) => {
        const rawRole = cleanText(rawPools?.[index]?.role);
        return !used.has(pool.id) && (rawRole === '' ? pool.kind : rawRole) === role;
      }) ?? null;
    slots[key] = hit?.id ?? null;
    if (hit !== null) {
      used.add(hit.id);
    }
  }
  return slots;
}

/**
 * 把存档里的绑定收干净：键集合恒等于当前抽法的槽集合，值必须真能在池里找到。
 *
 * `raw` 缺失时退回 `defaultSlots`；旧档那一条先由 `slotsFromLegacyRole` 补出
 * 一份带键的绑定，再进这里。
 */
export function cleanSlots(raw, pools, protocolId = DEFAULT_PROTOCOL) {
  const list = Array.isArray(pools) ? pools : [];
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaultSlots(list, protocolId);
  }
  const ids = new Set(list.map((pool) => pool.id));
  const slots = {};
  for (const key of slotKeys(protocolId)) {
    const value = cleanText(raw[key]);
    slots[key] = value !== '' && ids.has(value) ? value : null;
  }
  return slots;
}

/** 这场抽奖里填某个槽的池；没有绑定就返回 null —— 不猜。 */
export function poolOfSlot(lottery, slotKey) {
  const bound = cleanText(lottery?.slots?.[slotKey]);
  if (bound === '') {
    return null;
  }
  return (lottery?.pools ?? []).find((pool) => pool.id === bound) ?? null;
}

/** 这个池在这场的哪些槽里 —— 给界面打「奖项 / 中奖人 / 未参与」徽标用。 */
export function slotsOfPool(lottery, poolId) {
  const slots = lottery?.slots ?? {};
  return slotKeys(lottery?.protocol).filter((key) => slots[key] === poolId);
}

/* ---------- 抽奖 ---------- */

function cleanLottery(item, index) {
  const fallback = `g${index + 1}`;
  const id = cleanText(item?.id, fallback);
  const protocolId = isProtocolId(item?.protocol) ? item.protocol : DEFAULT_PROTOCOL;
  const protocol = protocolInfo(protocolId);
  const rawStage = item?.stage;
  const stage =
    isStageId(rawStage) && compatible(stageInfo(rawStage), protocol)
      ? rawStage
      : defaultStageFor(protocol);
  const stageConfig = normalizeStageConfig(item?.stageConfig);

  // 先算池，再算绑定：绑定的值必须是 `cleanPool` 之后的 id，反过来会被兜写成
  // `k{n}` 而把绑定静默清空。
  const rawPools = Array.isArray(item?.pools) ? item.pools : [];
  const pools = rawPools.map((pool, at) => cleanPool(pool, at));
  const rawSlots = item?.slots;
  const hasSlots =
    rawSlots !== null && rawSlots !== undefined && typeof rawSlots === 'object' && !Array.isArray(rawSlots);
  // v4 及更早：池上还有 `role`，没有绑定。补一份带键的绑定再进 cleanSlots；
  // 新存档没有 role，就按 `defaultSlots` 的下标顺序配。
  const legacy = rawPools.some((pool) => cleanText(pool?.role) !== '');
  const slots = cleanSlots(
    hasSlots ? rawSlots : legacy ? slotsFromLegacyRole(rawPools, pools, protocolId) : null,
    pools,
    protocolId,
  );
  const batchSize = cleanBatchSize(item?.batchSize);

  return {
    id,
    title: cleanText(item?.title, '未命名抽奖'),
    protocol: protocolId,
    stage,
    stageConfig,
    slots,
    batchSize,
    batch: batchSize ?? stageBatch(stage, stageConfig[stage]),
    pools,
    results: cleanResults(item?.results, protocolId),
    excluded: cleanExcluded(item?.excluded, pools),
    createdAt: Number.isFinite(Number(item?.createdAt)) ? Number(item.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(item?.updatedAt)) ? Number(item.updatedAt) : Date.now(),
  };
}

/** 空应用。 */
export function createApp() {
  return {
    version: APP_VERSION,
    lastView: 'lotteries',
    lastLotteryId: null,
    lastPoolId: null,
    pools: [],
    lotteries: [],
  };
}

/* ---------- 迁移 ---------- */

/** v3 的 `{ name, dept, employeeId }` 列表 → 人池的条目。 */
function peopleEntries(people, capacity) {
  return cleanEntries(
    (Array.isArray(people) ? people : []).map((person) => ({
      id: person?.id,
      name: person?.name,
      weight: 1,
      capacity,
      meta: { dept: person?.dept, employeeId: person?.employeeId },
    })),
    'people',
  );
}

/** v3 的 `{ name, count, weight, level }` 列表 → 奖品池的条目：名额就是容量。 */
function prizeEntries(prizes) {
  return cleanEntries(
    (Array.isArray(prizes) ? prizes : []).map((prize) => ({
      id: prize?.id,
      name: prize?.name,
      weight: prize?.weight,
      capacity: prize?.count,
      meta: { level: prize?.level },
    })),
    'prizes',
  );
}

function rosterToPool(roster, index) {
  return cleanPool(
    {
      id: roster?.id,
      name: cleanText(roster?.name, `名单 ${index + 1}`),
      kind: 'people',
      entries: peopleEntries(roster?.people, 1),
      updatedAt: roster?.updatedAt,
    },
    index,
  );
}

function prizeSetToPool(set, index) {
  return cleanPool(
    {
      id: set?.id,
      name: cleanText(set?.name, `奖品 ${index + 1}`),
      kind: 'prizes',
      entries: prizeEntries(set?.prizes),
      updatedAt: set?.updatedAt,
    },
    index,
  );
}

/** v3 的一条开奖记录 → 中性的 picks。 */
function legacyResultToResult(result, index, { mode, peoplePool, prizePool }) {
  const picks = [];
  const prize = prizePool?.entries.find((entry) => entry.id === result?.prizeId);
  if (prize !== undefined) {
    picks.push({ slot: 'prize', poolId: prizePool.id, entryId: prize.id, name: prize.name, meta: prize.meta });
  } else if (cleanText(result?.prizeName) !== '') {
    picks.push({
      slot: 'prize',
      poolId: prizePool?.id ?? '',
      entryId: cleanText(result.prizeId),
      name: cleanText(result.prizeName),
      meta: {},
    });
  }
  for (const winner of Array.isArray(result?.winners) ? result.winners : []) {
    const person = peoplePool?.entries.find((entry) => entry.id === winner?.personId);
    picks.push({
      slot: 'person',
      poolId: peoplePool?.id ?? '',
      entryId: cleanText(winner?.personId, person?.id ?? ''),
      name: cleanText(winner?.name, person?.name ?? ''),
      meta: {
        dept: cleanText(winner?.dept, person?.meta?.dept ?? ''),
        employeeId: cleanText(winner?.employeeId, person?.meta?.employeeId ?? ''),
      },
    });
  }
  return {
    id: cleanText(result?.id, `r${index + 1}`),
    at: Number.isFinite(Number(result?.at)) ? Number(result.at) : Date.now(),
    protocol: mode,
    picks: picks.filter((pick) => pick.poolId !== '' && pick.entryId !== ''),
  };
}

/** v3 / v2 的一场活动 → v5 的抽奖（池副本 + 绑定 + picks）。 */
function legacyLottery(item, index) {
  const id = cleanText(item?.id, `g${index + 1}`);
  const protocol = item?.mode === 'person-prize' ? 'person-prize' : 'prize-person';
  const uniqueWinner = item?.uniqueWinner !== false;
  const peoplePool = cleanPool(
    {
      id: cleanText(item?.rosterId, `${id}-people`),
      name: cleanText(item?.rosterName, '名单'),
      kind: 'people',
      entries: peopleEntries(item?.people, uniqueWinner ? 1 : null),
    },
    0,
  );
  const prizePool = cleanPool(
    {
      id: cleanText(item?.prizeSetId, `${id}-prizes`),
      name: cleanText(item?.prizeSetName, '奖品'),
      kind: 'prizes',
      entries: prizeEntries(item?.prizes),
    },
    1,
  );
  // 空池不进这场：迁出一个空池、再让抽奖页报「还没有条目」，比报「缺池」更困惑。
  const pools = [peoplePool, prizePool].filter((pool) => pool.entries.length > 0);
  const slots = {
    person: pools.includes(peoplePool) ? peoplePool.id : null,
    prize: pools.includes(prizePool) ? prizePool.id : null,
  };
  const results = (Array.isArray(item?.results) ? item.results : [])
    .map((result, at) =>
      legacyResultToResult(result, at, {
        mode: protocol,
        peoplePool: pools.find((pool) => pool.kind === 'people') ?? null,
        prizePool: pools.find((pool) => pool.kind === 'prizes') ?? null,
      }),
    )
    .filter((result) => result.picks.length > 0);

  return cleanLottery(
    {
      id,
      title: item?.title,
      protocol,
      stage: item?.stage,
      stageConfig: item?.stageConfig,
      slots,
      pools,
      results,
      excluded: item?.excluded,
      createdAt: item?.createdAt,
      updatedAt: item?.updatedAt,
    },
    index,
  );
}

/**
 * 读一份存档。
 *
 * v5 直接用；v4 也在这一支里过 —— 差别只是池少了 `role`、抽奖少了 `slots`，
 * `cleanLottery` 会按旧的 role 把绑定推出来，所以不需要单独写一份 v4 迁移。
 * v3 / v2 的「名单 + 奖品」转成池、`prizeId + winners` 转成 picks；
 * v1 那种「只有一场活动」的存档，拆成一份名单池 + 一份奖品池 + 一个抽奖。
 */
export function migrate(raw) {
  if (raw === null || typeof raw !== 'object') {
    return createApp();
  }

  const app = createApp();

  if (Number(raw.version) === APP_VERSION || (Array.isArray(raw.pools) && Array.isArray(raw.lotteries))) {
    app.pools = (Array.isArray(raw.pools) ? raw.pools : []).map((pool, index) =>
      cleanPool(pool, index),
    );
    app.lotteries = (Array.isArray(raw.lotteries) ? raw.lotteries : []).map(cleanLottery);
    app.lastView = VIEWS.has(raw.lastView) ? raw.lastView : 'lotteries';
    app.lastPoolId = cleanText(raw.lastPoolId) || app.pools[0]?.id || null;
    app.lastLotteryId =
      cleanText(raw.lastLotteryId) ||
      app.lotteries.find((item) => item.id === raw.lastActivityId)?.id ||
      app.lotteries[0]?.id ||
      null;
    return app;
  }

  if (Array.isArray(raw.lotteries) || Array.isArray(raw.activities)) {
    app.pools = [
      ...(Array.isArray(raw.rosters) ? raw.rosters : []).map(rosterToPool),
      ...(Array.isArray(raw.prizeSets) ? raw.prizeSets : []).map(prizeSetToPool),
    ];
    app.lotteries = (Array.isArray(raw.lotteries) ? raw.lotteries : raw.activities).map(legacyLottery);
    app.lastPoolId = app.pools[0]?.id ?? null;
    app.lastLotteryId =
      cleanText(raw.lastLotteryId) ||
      app.lotteries.find((item) => item.id === raw.lastActivityId)?.id ||
      app.lotteries[0]?.id ||
      null;
    return app;
  }

  // v1：单场活动
  const legacyPrizes = prizeEntries(raw.prizes);
  const legacyPeople = peopleEntries(raw.people, raw.uniqueWinner === false ? null : 1);
  if (legacyPrizes.length === 0 && legacyPeople.length === 0) {
    return app;
  }
  const title = cleanText(raw.title, '未命名抽奖');
  const peoplePool = cleanPool(
    { id: 'n1', name: `${title} · 名单`, kind: 'people', entries: legacyPeople },
    0,
  );
  const prizePool = cleanPool(
    { id: 's1', name: `${title} · 奖品`, kind: 'prizes', entries: legacyPrizes },
    1,
  );
  app.pools.push(peoplePool, prizePool);
  app.lotteries.push(
    cleanLottery(
      {
        id: 'g1',
        title,
        protocol: raw.mode,
        stage: raw.stage,
        slots: {
          person: peoplePool.entries.length > 0 ? peoplePool.id : null,
          prize: prizePool.entries.length > 0 ? prizePool.id : null,
        },
        pools: [peoplePool, prizePool],
        results: (Array.isArray(raw.results) ? raw.results : []).map((result, index) =>
          legacyResultToResult(result, index, {
            mode: 'prize-person',
            peoplePool,
            prizePool,
          }),
        ),
        excluded: raw.excluded,
      },
      0,
    ),
  );
  app.lastPoolId = peoplePool.id;
  app.lastLotteryId = 'g1';
  return app;
}

/* ---------- 命名 ---------- */

/**
 * 同名时按文件系统的习惯往后排：`名称`、`名称 (1)`、`名称 (2)`。
 * 只避让 `items` 里已有的名字。
 */
export function uniqueName(items, base, read = (item) => item.name) {
  const taken = new Set(items.map(read));
  const name = cleanText(base, '未命名');
  if (!taken.has(name)) {
    return name;
  }
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${name} (${index})`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return `${name} (${Date.now()})`;
}

/* ---------- 池 ---------- */

export function addPool(app, { name, kind, entries }) {
  const pool = cleanPool(
    {
      id: nextId(app.pools, 'k'),
      name: uniqueName(app.pools, name ?? `${KIND_NAMES[kindOf(kind)]} ${app.pools.length + 1}`),
      kind,
      entries,
      updatedAt: Date.now(),
    },
    app.pools.length,
  );
  return [{ ...app, pools: [...app.pools, pool] }, pool];
}

export function updatePool(app, poolId, patch) {
  return {
    ...app,
    pools: app.pools.map((pool) =>
      pool.id === poolId
        ? {
            ...pool,
            ...patch,
            name: patch.name === undefined ? pool.name : cleanText(patch.name, pool.name),
            entries:
              patch.entries === undefined ? pool.entries : cleanEntries(patch.entries, pool.kind),
            updatedAt: Date.now(),
          }
        : pool,
    ),
  };
}

export function removePool(app, poolId) {
  return { ...app, pools: app.pools.filter((pool) => pool.id !== poolId) };
}

export function poolById(app, poolId) {
  return app.pools.find((pool) => pool.id === poolId) ?? null;
}

/* ---------- 抽奖 ---------- */

/**
 * 新建一场抽奖：把选中的池复制进来。
 *
 * `poolIds` 给空就是「现场手动加」—— 建一场空池，进去再填。
 * `pools` 可以直接给（从 xlsx 新建或导入时用）。
 * `slots` 不给就按下标配一份初值（见 `defaultSlots`），给了就照给的收。
 */
export function createLottery(
  app,
  { title, protocol, stage, stageConfig, uniqueWinner, poolIds, pools, slots, batchSize, results } = {},
) {
  const chosen = pools ?? app.pools.filter((pool) => (poolIds ?? []).includes(pool.id));
  const protocolId = isProtocolId(protocol) ? protocol : DEFAULT_PROTOCOL;
  const lottery = cleanLottery(
    {
      id: nextId(app.lotteries, 'g'),
      title: cleanText(title, `抽奖 ${app.lotteries.length + 1}`),
      protocol: protocolId,
      stage,
      stageConfig,
      slots: slots ?? defaultSlots(chosen, protocolId),
      batchSize,
      pools: chosen,
      results: results ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    app.lotteries.length,
  );
  const next = uniqueWinner === false ? applyUniqueWinner(lottery, false) : lottery;
  return [{ ...app, lotteries: [...app.lotteries, next], lastLotteryId: next.id }, next];
}

/**
 * 改这场抽奖的抽法、外形、绑定与一次抽几个。
 *
 * 抽法换了以后槽的 key 集合可能变（`prize` / `person` 其实两法都有，但别指望
 * 以后也一样），所以 `cleanSlots` 排在 protocol 生效之后跑。
 */
export function updateLottery(app, lotteryId, patch) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) => {
      if (lottery.id !== lotteryId) {
        return lottery;
      }
      const next = { ...lottery };
      if (patch.title !== undefined) {
        next.title = cleanText(patch.title, lottery.title);
      }
      if (patch.protocol !== undefined && isProtocolId(patch.protocol)) {
        next.protocol = patch.protocol;
      }
      if (patch.stageConfig !== undefined) {
        const merged = { ...lottery.stageConfig };
        for (const [stageId, value] of Object.entries(patch.stageConfig)) {
          merged[stageId] = { ...(merged[stageId] ?? {}), ...value };
        }
        next.stageConfig = normalizeStageConfig(merged);
      }
      if (patch.stage !== undefined && isStageId(patch.stage)) {
        next.stage = patch.stage;
      }
      if (patch.slots !== undefined) {
        next.slots = { ...lottery.slots, ...patch.slots };
      }
      next.slots = cleanSlots(next.slots, next.pools, next.protocol);
      if (patch.batchSize !== undefined) {
        next.batchSize = cleanBatchSize(patch.batchSize);
      }
      if (!compatible(stageInfo(next.stage), protocolInfo(next.protocol))) {
        next.stage = defaultStageFor(next.protocol);
      }
      next.batch = next.batchSize ?? stageBatch(next.stage, next.stageConfig[next.stage]);
      next.updatedAt = Date.now();
      return next;
    }),
  };
}

/** 把某个槽改指另一个池；`poolId` 给 null 或空就是解绑。 */
export function setLotteryBinding(app, lotteryId, slotKey, poolId) {
  const lottery = lotteryById(app, lotteryId);
  if (lottery === null) {
    return app;
  }
  return updateLottery(app, lotteryId, { slots: { [slotKey]: cleanText(poolId) || null } });
}

/**
 * 往这场抽奖里加一个池。
 *
 * `sourceId` 给了就从素材池复制一份（同一个池可以再复制一次，改副本不影响别的），
 * 否则按 `kind` 建一个空池。返回 `[新应用, 新池]`。
 */
export function addLotteryPool(app, lotteryId, { name, kind, entries, sourceId } = {}) {
  const lottery = lotteryById(app, lotteryId);
  if (lottery === null) {
    return [app, null];
  }
  const source = sourceId ? poolById(app, sourceId) : null;
  const nextKind = kindOf(source?.kind ?? kind);
  const pool = cleanPool(
    {
      id: nextId(lottery.pools, 'k'),
      name: uniqueName(
        lottery.pools,
        name ?? source?.name ?? `${KIND_NAMES[nextKind]} ${lottery.pools.length + 1}`,
      ),
      kind: nextKind,
      entries: source?.entries ?? entries,
      updatedAt: Date.now(),
    },
    lottery.pools.length,
  );
  const nextApp = {
    ...app,
    lotteries: app.lotteries.map((item) =>
      item.id === lotteryId
        ? { ...item, pools: [...item.pools, pool], updatedAt: Date.now() }
        : item,
    ),
  };
  return [nextApp, pool];
}

/**
 * 从这场抽奖里删一个池。返回 `[新应用, 错误]`，错误为 null 表示删掉了。
 *
 * 还被槽绑着、或者开奖记录里还有它的条目，一律不许删 —— 删了记录就会指向不
 * 存在的东西，名额也算不回来。
 */
export function removeLotteryPool(app, lotteryId, poolId) {
  const lottery = lotteryById(app, lotteryId);
  if (lottery === null) {
    return [app, '这场抽奖已经不在了'];
  }
  if (slotsOfPool(lottery, poolId).length > 0) {
    return [app, '这个池还填着某个槽，先把「用于」改成别的池或「未参与」'];
  }
  const used = lottery.results.some((result) =>
    result.picks.some((pick) => pick.poolId === poolId),
  );
  if (used) {
    return [app, '开奖记录里还有这个池的条目，先撤销或清空记录再删'];
  }
  return [
    {
      ...app,
      lotteries: app.lotteries.map((item) =>
        item.id === lotteryId
          ? { ...item, pools: item.pools.filter((pool) => pool.id !== poolId), updatedAt: Date.now() }
          : item,
      ),
    },
    null,
  ];
}

/** 改这场抽奖里某个池的条目。 */
export function patchLotteryPools(app, lotteryId, poolId, entries) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) => {
      if (lottery.id !== lotteryId) {
        return lottery;
      }
      const pools = lottery.pools.map((pool) =>
        pool.id === poolId ? { ...pool, entries: cleanEntries(entries, pool.kind) } : pool,
      );
      return {
        ...lottery,
        pools,
        // 改条目可能换掉 id，绑定跟着收一遍（正常情况下池没动，绑定原样保留）。
        slots: cleanSlots(lottery.slots, pools, lottery.protocol),
        updatedAt: Date.now(),
      };
    }),
  };
}

/** 用一份导入的数据整体替换这场抽奖（名字与 id 不变）。 */
export function replaceLotteryData(app, lotteryId, data) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) =>
      lottery.id === lotteryId
        ? cleanLottery(
            {
              ...lottery,
              ...data,
              id: lottery.id,
              title: cleanText(data.title, lottery.title),
              updatedAt: Date.now(),
            },
            app.lotteries.indexOf(lottery),
          )
        : lottery,
    ),
  };
}

/** 重新抽奖：清空记录，池与名额留着。 */
export function resetLottery(app, lotteryId) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) =>
      lottery.id === lotteryId
        ? { ...lottery, results: [], excluded: [], updatedAt: Date.now() }
        : lottery,
    ),
  };
}

export function removeLottery(app, lotteryId) {
  const lotteries = app.lotteries.filter((lottery) => lottery.id !== lotteryId);
  return {
    ...app,
    lotteries,
    lastLotteryId:
      app.lastLotteryId === lotteryId ? (lotteries[0]?.id ?? null) : app.lastLotteryId,
  };
}

export function lotteryById(app, lotteryId) {
  return app.lotteries.find((lottery) => lottery.id === lotteryId) ?? null;
}

/* ---------- 不重复中奖 ---------- */

/**
 * 「不重复」落在数据上是把焦点槽的池每条容量设成 1；关掉就是不限。
 *
 * 焦点槽是揭晓大字写的那个槽（奖品抽人 → 中奖人，人抽奖品 → 奖项），
 * 也就是说这条开关问的一直是「每个 X 只出现一次」。与池的种类无关。
 */
export function isUniqueWinner(lottery) {
  const pool = poolOfSlot(lottery, protocolInfo(lottery.protocol).focus);
  return pool !== null && pool.entries.every((entry) => capacityOf(entry) === 1);
}

function applyUniqueWinner(lottery, unique) {
  const boundId = cleanText(lottery.slots?.[protocolInfo(lottery.protocol).focus]);
  if (boundId === '') {
    return lottery;
  }
  return {
    ...lottery,
    pools: lottery.pools.map((pool) =>
      pool.id === boundId
        ? {
            ...pool,
            entries: pool.entries.map((entry) => ({ ...entry, capacity: unique ? 1 : null })),
          }
        : pool,
    ),
  };
}

export function setUniqueWinner(app, lotteryId, unique) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) =>
      lottery.id === lotteryId ? { ...applyUniqueWinner(lottery, unique), updatedAt: Date.now() } : lottery,
    ),
  };
}

/* ---------- 引擎桥 ---------- */

/** 抽奖换成引擎认的那份状态。 */
export function runState(lottery) {
  return createState({
    title: lottery.title,
    protocol: lottery.protocol,
    pools: lottery.pools,
    slots: lottery.slots ?? {},
    results: lottery.results,
    excluded: lottery.excluded,
  });
}

/** 引擎跑完写回抽奖：只写会变的那些。 */
export function writeRunState(app, lotteryId, next) {
  return {
    ...app,
    lotteries: app.lotteries.map((lottery) =>
      lottery.id === lotteryId
        ? {
            ...lottery,
            pools: next.pools,
            results: next.results,
            excluded: next.excluded ?? [],
            updatedAt: Date.now(),
          }
        : lottery,
    ),
  };
}

/* ---------- 摘要 ---------- */

/** 已经抽出去几条 —— 只数「抽出来的」那些槽，先定的不算进度。 */
function handedCount(lottery, slotKeysDrawn) {
  const keys = new Set(slotKeysDrawn.length > 0 ? slotKeysDrawn : ['*']);
  return lottery.results.reduce(
    (sum, result) =>
      sum + (keys.has('*')
        ? result.picks.length
        : result.picks.filter((pick) => keys.has(pick.slot)).length),
    0,
  );
}

/**
 * 一场抽奖的进度摘要。
 *
 * 全部按抽法算：哪个槽是抽出来的、那个槽的池还有多少名额。这里没有「几个人、
 * 几个奖项」—— 那些是抽法的说法，池自己不分种类。
 */
export function lotterySummary(lottery) {
  const protocol = protocolInfo(lottery.protocol);
  const drawnKeys = protocol.slots.filter((slot) => slot.source === 'draw').map((slot) => slot.key);
  let total = 0;
  let unlimited = false;
  for (const key of drawnKeys) {
    for (const entry of poolOfSlot(lottery, key)?.entries ?? []) {
      const capacity = capacityOf(entry);
      if (capacity === Infinity) {
        unlimited = true;
      } else {
        total += capacity;
      }
    }
  }
  return {
    total,
    handed: handedCount(lottery, drawnKeys),
    unlimited,
    slots: protocol.slots.map((slot) => {
      const pool = poolOfSlot(lottery, slot.key);
      return {
        key: slot.key,
        label: slot.label,
        source: slot.source,
        poolId: pool?.id ?? null,
        poolName: pool?.name ?? '',
        entries: pool?.entries.length ?? 0,
      };
    }),
  };
}

/**
 * 状态由数据推出来：没记录 = 没开始，抽不动了 = 已完成，其余 = 进行中。
 */
export function lotteryStatus(lottery) {
  if (lottery.results.length === 0) {
    return 'idle';
  }
  return canDraw(runState(lottery)) ? 'running' : 'done';
}

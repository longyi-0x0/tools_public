import { createDocument, createNode } from "./core/ast.js";
import { addPage, createPage, createProject } from "./core/project.js";
import { createSampleDocument } from "./sample.js";

/**
 * 示例项目：三张页面，恰好把「组件集在项目上、页面只管结构」摆出来。
 * 它是首次打开的种子，不是唯一能有的东西——顶栏随时能新建项目。
 */
export function createSampleProject() {
  const project = createProject({
    name: "好物铺示例",
    description: "三张页面：列表、详情、购物车。改坏了可以重建。",
    firstPageTitle: "商品列表",
  });
  project.pages[0].doc = createSampleDocument();
  addPage(project, createPage({ title: "商品详情", doc: detailPage() }));
  addPage(project, createPage({ title: "购物车", doc: cartPage() }));
  return project;
}

/** 往这份页面里挂一个节点。示例页是手写的，节点 id 直接给定。 */
function collector(doc) {
  return (patch) => {
    const node = createNode(patch);
    doc.nodes[node.id] = node;
    return node;
  };
}

function detailPage() {
  const doc = createDocument("商品详情");
  const add = collector(doc);
  const root = doc.nodes[doc.root];
  root.desc = "商品详情整页";

  add({
    id: "dNav",
    parent: root.id,
    pos: "a",
    layout: "row",
    layoutProps: { gap: "sm", align: "center", distribute: "between" },
    slots: ["left", "right"],
    use: ["navbar"],
    props: { title: "商品详情" },
  });
  add({
    id: "dBack",
    parent: "dNav",
    slot: "left",
    pos: "a",
    use: ["button.ghost"],
    props: { label: "返回" },
  });
  add({
    id: "dShare",
    parent: "dNav",
    slot: "right",
    pos: "a",
    use: ["button.ghost"],
    props: { label: "分享" },
  });
  add({
    id: "dHero",
    parent: root.id,
    pos: "b",
    use: ["image"],
    desc: "主图，可左右滑",
    size: { width: "fill", height: 240 },
  });
  add({
    id: "dTitleRow",
    parent: root.id,
    pos: "c",
    layout: "row",
    layoutProps: { gap: "sm", align: "center", distribute: "between" },
  });
  add({
    id: "dTitle",
    parent: "dTitleRow",
    pos: "a",
    use: ["text"],
    props: { content: "轻量通勤双肩包" },
  });
  add({
    id: "dPrice",
    parent: "dTitleRow",
    pos: "b",
    use: ["text"],
    props: { content: "¥ 239" },
  });
  add({
    id: "dSub",
    parent: root.id,
    pos: "d",
    use: ["text.caption"],
    props: { content: "18L · 防泼水 · 独立笔记本仓" },
  });
  add({
    id: "dSpecs",
    parent: root.id,
    pos: "e",
    layout: "row",
    layoutProps: { gap: "sm", align: "start", distribute: "start" },
    desc: "规格选择，先占位不展开",
  });
  for (const [index, label] of ["黑色", "20L", "1 件"].entries()) {
    add({
      id: `dSpec${index}`,
      parent: "dSpecs",
      pos: String.fromCharCode(97 + index),
      use: ["button.ghost"],
      props: { label },
    });
  }
  add({
    id: "dBuyBar",
    parent: root.id,
    pos: "f",
    layout: "row",
    layoutProps: { gap: "md", align: "center", distribute: "between" },
  });
  add({
    id: "dTotal",
    parent: "dBuyBar",
    pos: "a",
    use: ["text"],
    props: { content: "合计 ¥ 239" },
  });
  add({
    id: "dBuy",
    parent: "dBuyBar",
    pos: "b",
    use: ["local:buy-button", "button"],
    props: { label: "立即购买" },
    size: { minWidth: 104 },
  });
  return doc;
}

function cartPage() {
  const doc = createDocument("购物车");
  const add = collector(doc);
  const root = doc.nodes[doc.root];
  root.desc = "购物车整页";

  add({
    id: "cNav",
    parent: root.id,
    pos: "a",
    layout: "row",
    layoutProps: { gap: "sm", align: "center", distribute: "between" },
    slots: ["left", "right"],
    use: ["navbar"],
    props: { title: "购物车" },
  });
  add({
    id: "cManage",
    parent: "cNav",
    slot: "right",
    pos: "a",
    use: ["button.ghost"],
    props: { label: "管理" },
  });
  const list = add({
    id: "cList",
    parent: root.id,
    pos: "b",
    layout: "column",
    layoutProps: { gap: "sm", align: "fill", distribute: "start" },
  });
  const items = [
    ["cItem1", "cThumb1", "cInfo1", "cName1", "cPrice1", "折叠桌面收纳架", "¥ 89"],
    ["cItem2", "cThumb2", "cInfo2", "cName2", "cPrice2", "便携榨汁杯", "¥ 129"],
  ];
  items.forEach(([itemId, thumbId, infoId, nameId, priceId, name, price], index) => {
    add({
      id: itemId,
      parent: list.id,
      pos: String.fromCharCode(97 + index),
      layout: "row",
      layoutProps: { gap: "sm", align: "center", distribute: "start" },
    });
    add({
      id: thumbId,
      parent: itemId,
      pos: "a",
      use: ["image"],
      desc: "缩略图",
      size: { width: 64, height: 64, aspect: 1 },
    });
    add({
      id: infoId,
      parent: itemId,
      pos: "b",
      layout: "column",
      layoutProps: { gap: "xs", align: "start", distribute: "start" },
    });
    add({
      id: nameId,
      parent: infoId,
      pos: "a",
      use: ["text"],
      props: { content: name },
    });
    add({
      id: priceId,
      parent: infoId,
      pos: "b",
      use: ["text.caption"],
      props: { content: price },
    });
  });
  add({
    id: "cCheckBar",
    parent: root.id,
    pos: "c",
    layout: "row",
    layoutProps: { gap: "md", align: "center", distribute: "between" },
  });
  add({
    id: "cSum",
    parent: "cCheckBar",
    pos: "a",
    use: ["text"],
    props: { content: "合计 ¥ 218" },
  });
  add({
    id: "cCheck",
    parent: "cCheckBar",
    pos: "b",
    use: ["local:buy-button", "button"],
    props: { label: "去结算" },
    size: { minWidth: 104 },
  });
  return doc;
}

/**
 * 三个内置示例：首次进入预填第一个，操作行的三个按钮各自写入一个。
 *
 * 都写成能直接渲染成功的完整 `@startuml … @enduml`；不做图库、不做列表，
 * 它们只解决「第一次打开是空白页」。
 */

export const EXAMPLES = [
  {
    label: "序列图",
    source: `@startuml
title 看一眼自己的图
actor 用户
participant "工具箱" as 盒
用户 -> 盒: 贴一段 .puml
盒 -> 盒: UTF-8 → raw DEFLATE → base64
盒 --> 用户: 官方服务器出的 SVG
@enduml`,
  },
  {
    label: "状态图",
    source: `@startuml
title 一张图的一生
[*] --> 草稿
草稿 --> 渲染中: 停手 700ms
渲染中 --> 出图: 地址算对了
渲染中 --> 报错图: 语法写错
报错图 --> 草稿: 改源码
出图 --> [*]
@enduml`,
  },
  {
    label: "时序图",
    source: `@startuml
title 页面里发生的事
robust "官方服务器" as 服务
concise "浏览器" as 浏览器
@0
服务 is 空闲
浏览器 is 空闲
@1
浏览器 is 等图
@3
服务 is 出图
浏览器 is 看图
@5
服务 is 空闲
浏览器 is 空闲
@enduml`,
  },
];

/** 首次进入（以及「清空」之后没有历史输入时）预填的那一段。 */
export const DEFAULT_EXAMPLE = EXAMPLES[0];

/* data.js —— 布局图册的全部内容。
 *
 * 页面不认识任何一个布局，只把这里的数据画出来：加一条就是往 items 里加一个对象，
 * 删一条就是从数组里拿掉一个对象。页面本身不用改。
 *
 * BASE 是预览里那层基础样式。预览装在一个没有脚本权限的 iframe 里，本文件的字体与
 * 变量漏不进去，反过来也一样 —— 所以预览那份基础样式只能在这里，每次拼进 iframe
 * 的文档头，不能靠页面继承。
 *
 * 字段口径在文件末尾，也在本目录 README.md 里。
 */

const BASE = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%}
body{
  font:400 13px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  color:#8b8172;background:#fff;
}
.box{padding:10px 12px;border-radius:8px;background:#f4f0e8;border:1px solid #e5dfd2;
     font-size:12px;color:#93897a;text-align:center}
.tall{min-height:120px}
.fillery{background:repeating-linear-gradient(45deg,#f4f0e8 0 8px,#faf7f1 8px 16px)}
`;

const CATALOG = {
  version: 1,
  groups: [
    { id: "shell", name: "整页骨架" },
    { id: "grid",  name: "重复与分栏" },
    { id: "flow",  name: "排布与对齐" },
    { id: "piece", name: "局部部件" }
  ],
  items: [
    // 加一条就是往这里加一个对象，页面不用动。形状见文件末尾的注释。
  ]
};

/* SCHEMA —— 一条布局片段的完整字段口径（与 docs/布局图册形态设计-v1.md 一致）
   {
     id:        小写字母、数字与连字符，全册唯一
     name:      列表与标题上的名字
     group:     CATALOG.groups 里某个 id
     tags:      [] 扁平小标签，用于在册内搜索与筛选，不产生层级
     summary:   一句话讲清它是什么，卡片上最多两行
     note:      一句话讲清什么时候别用它，只在详情出现
     source:    { title, url } 可选，出处
     previewVw: 预览用的逻辑视口宽（px），缺省 1024
     params:    [] 可调项，全部实现为 CSS 变量
                  name  变量名，CSS 里写 var(--name)
                  label 滑块上的名字
                  min / max / step / value  数值
                  unit  单位字符串，px / ch / 空
     html:      片段的 markup，不要包 <html><body>
     css:       片段的样式。类名可以放平坦 —— 预览在独立 iframe 里，污染不到外面

   一条硬规矩：params 的名字与 css 里用到的 var(--…) 必须严格一一对应。
   多了漏了都不行 —— 滑块改不动预览，或预览里的值找不到滑块，这条就失真了，
   而它是唯一会被当成「册上写的都对」的东西。
*/

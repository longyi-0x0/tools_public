# tools_public（公开工具源）

这是工具箱的公开工具仓库。当前没有已发布工具，不放置演示工具。

仓库根目录的 `toolbox.json` 定义顶层分组。新增分组时，在 `children` 中加入直接子目录名，并在该目录放置自己的 `toolbox.json`；分组可以递归嵌套。工具目录通过 `type: "tool"` 描述：

- H5 工具将页面文件放在 `site/`，并在 `toolbox.json` 指定入口。
- Web 工具在 `toolbox.json` 中写入 HTTPS 地址。

发布器会按工具箱清单契约校验字段、路径与入口；仅将根 `children` 及其递归声明的内容纳入发布。

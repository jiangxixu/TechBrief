# TechBrief · 每日科技简报

由 ChatGPT 整理内容的个人科技阅读网站，聚焦 AI、Agent、机器人与无人机。纯静态网站，无模型 API 调用，无运行时 npm 依赖。

## 已实现

- 今日简报、最新动态、按月与按日查看历史。
- 全站搜索：标题、摘要、分析、来源名称、英文论文名、作者、标签、专题；支持中英文别名及简单英文拼写容错。
- 分类、内容类型、1/3/7/30 天时间筛选；时间筛选依据原始发布日期。
- 论文库、快慢脑 / 世界模型 / UAV Agent / RAG 专题与关联阅读。
- 原论文和官方出处链接、可靠来源图片、失败图片自动隐藏。
- 收藏与阅读笔记、JSON 备份导出与合并导入。数据保存在当前浏览器，**不会自动跨设备同步**。
- 响应式布局、深浅模式、键盘搜索快捷键 `/`、可访问的阅读弹窗。
- PWA 安装图标与离线阅读；联网优先取得新内容，离线时显示已缓存版本。
- JSON 校验、自动生成索引、GitHub Actions 构建与 Pages 部署。

## 本地运行

需要 Node.js 22 或更高版本，不需要执行 npm install。

```bash
npm test
npm run build
npm start
```

打开终端输出的预览地址。默认支持根路径及 `/TechBrief/` 子路径。构建输出位于 `dist/`。

## 发布到 GitHub Pages

仓库 Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**，然后在 Actions 运行 **Validate and deploy TechBrief**。以后向 main 提交内容会自动校验、构建并部署。

实际上线地址以 Actions 的 deploy 结果为准，不能仅凭用户名推断已上线。

截至实现时，仓库为 private。GitHub Pages 对私有仓库是否可用取决于 GitHub 账户计划；GitHub Free 的 Pages 仅支持公开仓库。账户是否具备权限需要在设置页确认，不要自动改变仓库可见性。即使源代码仓库私有，普通 Pages 网站也可能公开，请以设置页显示的访问范围为准。

官方说明：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

如果 Pages 未启用，构建可完成，但部署步骤会失败；先完成上述一次设置，再重新运行工作流。

## 每日内容从哪里来

现有 ChatGPT“AI 科技每日简报”任务负责联网检索、撰写与向此仓库新增日报。GitHub Actions 负责校验、建立索引与发布，不负责生成新闻。

定时任务与 GitHub 连接是外部服务，无法由这个静态仓库自行创建。任务配置状态应以 ChatGPT 实际任务设置为准；每次运行是否写入成功，可在仓库提交记录确认。若连接过期或权限不足，需恢复连接；不能把定时任务已配置等同于每天发布必定成功。

内容字段、日期、图片出处、查重与追加规则见 [docs/CONTENT.md](docs/CONTENT.md)。

## 项目结构

```text
index.html / styles.css / app.js   页面与交互
core.js                            搜索、日期、过滤和备份校验
data/daily/YYYY-MM-DD.json          每天独立的原始简报
data/papers.json                    论文库
data/topics.json                    专题
data/catalog.json                   生成的全站索引
scripts/validate.mjs                内容校验
scripts/build.mjs                   构建、图标与索引生成
scripts/add-daily.mjs               只追加、不覆盖日报
scripts/serve.mjs                   本地预览
.github/workflows/pages.yml         校验和部署
```

首期为 2026-09-20 的 5 条来源核验整理，另有 7 篇论文、4 个专题。其他历史聊天内容尚未导入。论文有原始日期，历史论文不会伪装成当日新闻。

## 常见问题

- 页面没有当天新闻：以页面显示的“最近一期”日期为准，检查定时任务和提交记录。网站不会根据日历自动捏造一份新简报。
- 手机上仍是旧内容：点击右上角刷新。缓存采用网络优先；重新联网或一段时间后回到页面也会检查更新。
- 收藏丢失：收藏属于当前浏览器，清理浏览器数据会清除它；使用“我的收藏 → 导出收藏与笔记”备份。
- 双击 HTML 打不开数据：请使用本地 HTTP 服务或部署地址，浏览器通常会限制 file:// 页面读取 JSON。

论文图与官方图片归原作者所有；图片出处列在每篇文章中。

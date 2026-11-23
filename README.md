# TechBrief · 每日科技简报

由 AI 整理内容的个人科技阅读网站，聚焦 AI、Agent、机器人与无人机。网站为纯静态页面，无浏览器端模型调用和运行时 npm 依赖；日报由 GitHub Actions 调用模型 API 检索与生成。

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

GitHub Actions 的 **Generate Daily AI News** 使用 Secrets 中的 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 调用模型 API。基础 URL 需包含提供方要求的路径（如 `/v1`）；模型名以 `claude-` 开头时使用 Claude Messages API 并追加 `/messages`，其他模型继续使用 Responses API 并追加 `/responses`。网站浏览器端不持有密钥。

生成先分别检索五个领域，再核对一手来源发布日期、历史去重并撰写。优先3天内、最多7天；arXiv最多2条，候选不足时少于5条，搜索不可用或没有可用来源时失败并保留旧日报。重复触发若当日日报已存在会跳过，不能据此判断搜索已经执行。

每天北京时间 02:00 只安排一次正式生成，不自动运行预览，也不安排半小时后的补触发；当天日报已经存在时直接跳过。失败后等待次日定时任务，或由用户明确要求手动重跑。

Actions 上传 `generation-diagnostics` 诊断。正常运行直接校验并发布这一份生成结果，不再另跑一遍收费预览。排障时优先使用已有诊断、免费校验与模拟测试；只有用户明确要求时才启用 `force_regenerate` 和 `dry_run` 进行收费模型预览。单次正式生成仍保留分领域检索、原文核验和撰写，API 请求数不等于生成份数。详情见 [生成流程排查与验收](docs/GENERATION_AUDIT.md)。另外的 Daily TechBrief Refresh 只维护索引，不调用模型。

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



### Claude 网关迁移

先在本地或修复分支验证，再更新仓库 Secrets：`OPENAI_API_KEY` 使用新网关密钥，`OPENAI_BASE_URL` 填 `https://apinebula.ai/v1`，`OPENAI_MODEL` 填实际允许的 Claude 模型（例如 `claude-sonnet-4-6`）。沿用原 Secret 名称以兼容已有工作流，不把密钥写入仓库。模型列表和普通聊天成功只能证明鉴权和基础生成可用；必须再以 `dry_run=true` 验证联网检索、原文日期核验和日报结构。

Claude 搜索要求真实的服务器搜索调用及对应结果；仅有文字声称已搜索不算成功。网关只返回搜索结果时，再调用一次模型提取候选 JSON，随后仍执行原有来源、日期和历史查重规则。截断结果拒绝发布；额度不足立即停止，不继续请求其他领域。Claude 生成的日报标记为 `generatedBy: Claude`。

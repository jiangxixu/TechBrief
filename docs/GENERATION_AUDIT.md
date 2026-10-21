# TechBrief 生成流程排查与验收（2026-10-13）

## 实际运行补充

最终运行 [38388082191](https://github.com/jiangxixu/TechBrief/actions/runs/38388082191) 已成功生成、提交并部署10月13日日报。26项测试通过。新版为5条：3条Agent、1条无人机、1条机器人/具身；3条官方网页、2篇arXiv论文。1条发表于10月12日，其余4条发表于10月7至9日；未收录AI/大模型和科技产业，状态为published_partial，不宣称全部是当日新闻。

实际联调还确认，当前custom网关会对撰写请求返回HTTP200，却未遵守text.format Schema：元数据被放入editionMetadata，sources缺少name。程序现在自行构建日报元数据和来源显示标签；事实摘要、来源URL、published和category仍保持核验与精确匹配，不因格式补全而放松。成功版本复用了当天运行38386336442的完整搜索证据并重新访问原文核验日期，没有把“复用搜索”伪装成重新搜索。

修复已合并，运行 [38385575763](https://github.com/jiangxixu/TechBrief/actions/runs/38385575763) 首次执行真实检索。诊断中Agent和无人机均有HTTP200、completed search/open_page动作，来源数量分别59与71；实际端点类型为custom。因此已确认该接口实际执行了web_search。此次运行失败，未覆盖旧日报；后续错误被旧诊断归为泛化生成错误，尚不能仅据该信息断定具体原因。

实际联调发现工具open_page/find_in_page的action.url也应纳入来源证据，不能只读取搜索sources及文本引用。补充这类工具来源、候选拒绝URL和搜索失败阶段诊断；单次请求预算从90秒延长为180秒。每个领域独立记录失败并继续其他领域，只有至少一篇网页文章完成来源和日期核验才允许进入筛选，避免再次退回纯arXiv日报；任何检索缺失都标明部分发布。

另增按日期显式触发的 `.github/techbrief-regenerate.json` 请求，只有该文件在main发生变更时才触发强制生成，并要求请求日期等于当日。dryRun可选择预览或正常发布。普通日报提交不会循环触发生成。

## 已确认的根因

真正生成日报的三次运行都先收到 HTTP 400 / invalid_json_schema，再进入不带搜索工具的 arXiv 兼容模式。

| 日报 | 实际生成运行 | generate job | 400 报错位置 | 所选论文日期 |
|---|---|---|---|---|
| 2026-10-11 | [38085014250](https://github.com/jiangxixu/TechBrief/actions/runs/38085014250) | 114309602463 | properties.date 缺少 type | 2026-10-08 |
| 2026-10-12 | [38175012904](https://github.com/jiangxixu/TechBrief/actions/runs/38175012904) | 114575451409 | properties.date 缺少 type | 2026-10-08 |
| 2026-10-13 | [38324308889](https://github.com/jiangxixu/TechBrief/actions/runs/38324308889) | 115059320744 | properties.schemaVersion 缺少 type | 2026-10-09 |

10月13日报是在北京时间 07:51:38 开始生成、07:52:12 写入。用户提供的 [38329455954](https://github.com/jiangxixu/TechBrief/actions/runs/38329455954) 在 08:53:29 输出 `2026-10-13.json already exists; nothing to do.`，随后构建、部署；它没有调用模型API，也没有生成新日报。

日志中的关键报错：

```text
Invalid schema for response_format 'techbrief_daily':
In context=('properties', 'schemaVersion'), schema must have a 'type' key.
```

原脚本 `schemaVersion/date/timezone/generatedBy` 只声明 const，category 只声明 enum。当前接口拒绝该结构。捕获400后，兼容请求只传 model 和 input，候选仅为 arXiv 最新30篇，因此持续只写论文的直接机制已确认。原提示词要求恰好5条，日期门槛仅为至少4条在14天内，领域覆盖没有程序约束。

## 联网和API配置：能确认与不能确认的部分

- 工作流从 Secrets 读取 OPENAI_API_KEY、OPENAI_BASE_URL、OPENAI_MODEL；模型未设置时默认 `gpt-5.6-sol`。配置检查仅判断非空。
- api-config.mjs 在基础路径后添加 `/responses`，已有该后缀则不再追加。它不会自动添加 `/v1`。例如 `https://api.openai.com/v1` 会变成 `https://api.openai.com/v1/responses`；仅填域名会变成 `/responses`。必须根据提供方的真实接口填写。
- Secrets 值在日志中被遮罩，无法由日志确认实际模型名称或是否使用第三方网关，不读取或输出密钥。
- arXiv 抓取在三次真实生成中均成功返回30个记录；这证明该数据抓取可用。
- 高级请求在Schema校验时被拒绝，不能证明 web_search 已执行，也不能证明模型或网关不支持它。真实搜索能力仍需修复后的独立检索请求验证。
- 原来的 `tool_choice: auto` 不强制搜索；HTTP成功也不等于工具实际执行。OpenAI官方说明可用 required 强制工具使用，并通过 web_search_call、action.sources 或 url_citation 查看执行和来源：[Web search](https://developers.openai.com/api/docs/guides/tools-web-search)。[Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) 的Schema示例显式声明字段类型。

## 完整流程与原有校验边界

生成工作流：checkout → Node22 → 非空配置检查 → generate-daily.mjs → build.mjs → 写日报/索引提交 → Pages artifact → deploy。另有每日 refresh 仅更新索引，不能修复日报正文；它的“无模型API”注释及原README描述已过时。

原 validateDaily 检查结构、HTTPS地址、有效日期、不能晚于日报日期和同日ID重复；它不抓取网页验证日期或正文。原新鲜度判断依赖模型填的 published，兼容模式仅要求至少一个URL属于候选，并未核对URL对应的原始日期。跨日报查重主要在构建readContent时按标题/URL隐藏重复，生成阶段只是把近期中文标题交给模型；改写标题仍可重复入库。

因此，本修复保留结构校验、历史构建查重，并加强生成阶段的来源和日期检查。HTTPS地址有效不等于报道事实已经全面核验。

## 本次代码变化

1. **daily-schema.mjs**：所有属性显式type，固定值用typed enum；新闻数量由核验结果决定，允许1至5条。
2. **generate-daily.mjs**：先分别检索 Agent、无人机、机器人/具身、科技产业、AI。发现阶段不使用JSON Schema，并强制web_search；没有completed search action或来源证据即失败，禁止悄悄转入纯论文模式。
3. **news-policy.mjs**：检索URL必须属于工具返回的来源，再访问允许的一手出版方域名；限制HTTPS、重定向与页面体积。只采纳datePublished等发布日期元数据，不用dateModified或页面任意日期；缺失、冲突或模型日期不匹配则剔除。arXiv使用实时Atom published原始日期，不把updated当新论文日期。
4. **筛选**：优先0至3天，最多7天，4至7天明确标注补充；按全部历史URL及标题查重，归一arXiv版本/路径；每个领域优先一条，arXiv最多2条，无符合候选的领域可以缺席。不足5条就少发，0条则失败并保留原日报。
5. **撰写**：仅传筛选后的来源正文；强制输出日期/类别/URL与候选对应。不允许额外来源。仅在格式API明确返回invalid_json_schema时做格式重试，来源和筛选不变。质量失败不会触发arXiv降级。
6. **可观测性**：reports/generation.json记录执行状态、API HTTP状态/request ID、每领域搜索动作、拒绝原因、采用来源和年龄、缺失领域。Actions always上传诊断，Summary区别skipped_existing、failed、published、published_partial。不保存凭证或API原始返回。
7. **安全验收**：workflow_dispatch新增dry_run。启用时只上传核验预览，跳过日报写入、提交及部署。既有日报仍会跳过，所以测试时同时启用force_regenerate。
8. **测试**：增加生成策略与隔离模拟API集成测试；新增PR测试工作流；保持已有历史数据和网站行为。

## 验证方法

### 已完成的本地验证

```bash
npm test
npm run build
```

23项测试通过，包含原9项及新增14项；构建成功（242条去重新闻、142篇论文、4个专题）。模拟API测试覆盖：分领域检索正常但只有2条可采纳；搜索未执行；日期不一致；格式API拒绝后的同来源重试；既有日报跳过；dry_run不写日报。纯策略测试覆盖Schema类型、来源白名单、日期冲突、旧闻/未来日期/历史重复、arXiv上限和撰写来源匹配。

这些测试验证控制流与规则，不能替代真实服务的联网能力测试。没有在本地使用仓库Secrets调用API。

### 合并前在修复分支做真实验证

1. Actions → Generate Daily AI News → Run workflow，选择修复分支。
2. 同时设置 force_regenerate=true、dry_run=true。此操作会调用真实API并产生相应费用，但不会改变日报或部署。
3. 下载 generation-diagnostics artifact。检查 generation.json 的5个领域都有completed search动作；HTTP400若仍出现，按request ID核对提供方支持的参数，不以普通文本回答当搜索成功。
4. 检查selected的URL、published、ageDays、dateBasis，以及missingCategories和rejected原因；阅读edition.preview.json并逐条打开原文，核对标题事件、数字、实验条件、仿真/实机和预印本限制。
5. 验证缺少领域或不足5条时明确显示validated_partial，没有补造新闻；无可用来源或搜索不可用时failed，旧日报仍保留。
6. 只有真实检索和预览内容验收通过，才合并并启用正常定时发布。不要把23项模拟测试通过等同于实际联网通过，也不要把工作流绿色等同于内容完整。

### 后续监测

连续7个生成日统计：实际搜索执行数、来源年龄分布、领域缺失、重复率、拒绝原因及部分发布天数；跳过重跑应单独统计。若页面缺少标准日期元数据，增加该出版方的专用日期解析适配并提供真实页面fixture，不放宽成“任意页面日期”。

## 仍存在的限制

- 真实API联调已完成，已确认custom端点执行web_search；实际模型名称和网关地址仍不可由遮罩日志确认。
- 出版方白名单和发布日期元数据策略较保守，会漏掉部分真实新闻；这比根据模型猜日期补满数量更符合目标。
- 默认每期5次检索加一次撰写，格式重试可能额外增加一次调用；比旧兼容模式更昂贵。
- 日期、来源访问和链接匹配是程序可验证的；正文是否完全支持每一句模型摘要、事件分类是否合适仍需预览抽检。本方案没有声称实现完整语义事实证明。
- arXiv的补充池仍是宽泛分类最新30篇；专门领域搜索是主要覆盖机制，不能保证每天必有新的无人机动态。


## 2026-10-22 生成中断修复

失败运行 39503099002 的 5 次检索均 HTTP 200，但工具来源全部变为临时代理地址，20 条原文候选因链接不匹配被拒绝。现仅对全部来源被代理的检索启用独立出版方原文核验；保留白名单、原始日期、重定向、去重及来源正文约束，并明确记录 provenanceBasis。新增部分一手出版方域名。

真实预览 39634157577 成功产出 5 条并通过校验，其中 3 条独立核验出版方页面，2 条实时 arXiv；2 条为4至7天补充，缺无人机和科技产业。4 次网关 HTTP 400 被明确记为检索失败。针对间歇失败增加最多一次重试及共享180秒期限，永久格式、认证、配额或不支持的请求不盲目重试；诊断仅记录状态和分类，不保存API响应原文。

删除重复的源码目录部署工作流，保留 pages.yml 构建发布，daily-ai-news.yml 仍负责日报生成后的发布。构建包含 knowledge.html 与 roadmaps.html。34 项本地测试通过，构建通过；真实预览成功不能视为5领域均完成检索。

正式检索运行 39635116081 的 5 次搜索全部成功，但候选因出版方白名单及日期格式限制未发布。实页核对后加入 Mistral、Meta、GitHub 官方项目和 Zoom 出版方；NVIDIA newsroom 使用专用 div.article-date 发布日期栏（实页样本 openshell-reference-architecture，2026-10-21）。只对该主机和该栏解析，忽略相关链接及版权年份，日期冲突仍拒绝。允许显式同日重跑从检索诊断恢复新增适配的候选，重新读取原文核验；新增代理来源复用、恢复及专用日期栏测试，现37项通过。

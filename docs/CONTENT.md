# 内容发布约定

本文件是 TechBrief 每日内容更新的操作依据。仓库：`jiangxixu/TechBrief`，分支：`main`。

## 内容原则

- 日报由 GitHub Actions 通过 OpenAI 兼容的 Responses API 自动生成。API Key、Base URL 和模型名只保存在 GitHub Actions Secrets 中，不写入代码、构建产物或网站前端。
- 优先最近 24 小时的 AI、Agent、机器人、无人机、计算机科研与科技产业进展。重要内容不足时可补充近期内容并标注原始发布日期；每日目标 10 条；可信材料经核验及去重后不足 10 条时按实际数量发布并注明缺口。
- 先读取现有日报，避免重复。引用一手原论文、官方公告或项目仓库，核对标题、日期和数字。不能从摘要推断实机部署；观点写在 why/relevance，证据限制写在 caveat。
- 图片仅在找到可靠原始图片地址时添加，包含图片出处与作者说明；没有可靠图片就省略 image。
- 日期按 Asia/Shanghai。`date` 是简报日期，`published` 是来源最初公开日期或明确注明的修订日期，两者不能混淆。
- 历史日报只追加，不覆盖。勘误需要明确记录原因及更正；不要自动重写旧稿或伪造过去日报。

## 日报文件

创建 `data/daily/YYYY-MM-DD.json`。字段示例中的内容是结构说明，不能直接作为新闻发布。

```json
{
  "schemaVersion": 1,
  "date": "YYYY-MM-DD",
  "timezone": "Asia/Shanghai",
  "generatedBy": "ChatGPT",
  "title": "当天主题概括",
  "news": [{
    "id": "n-yyyymmdd-unique-slug",
    "title": "中文标题",
    "category": "Agent",
    "kind": "论文",
    "published": "YYYY-MM-DD",
    "summary": "核心事实",
    "why": "为什么值得关注",
    "relevance": "对学习或研究的启发，明确这是分析",
    "caveat": "结果适用范围、样本限制或暂时不能确认的内容",
    "tags": ["Agent"],
    "sources": [{"name": "官方原文", "url": "https://example.org/source"}]
  }]
}
```

`category` 只允许：`AI / 大模型`、`Agent`、`机器人 / 具身`、`无人机`、`科技产业`。

可选字段：`paperTitle`（英文论文名）、`authors`（数组）、`sections`（`{title,text}` 数组）、`relatedIds`（已经存在的内容 ID 数组）。图片字段为 `image: {url,alt,credit,sourceUrl}`，两个地址均使用 HTTPS。

一份日报允许 1–10 条，目标为 10 条；来源日期不能晚于日报日期。ID 全站唯一，只能使用小写字母、数字、连字符。

## 提交流程

1. 每天北京时间 02:00 由 `.github/workflows/daily-ai-news.yml` 仅启动一次正式生成（GitHub 调度可能延迟），不自动运行预览或 02:30 补触发；脚本检查当天文件是否已存在，默认存在时跳过、不覆盖。失败后等待次日定时任务，或由用户明确要求手动重跑。
2. 阅读近期日报原文件，查重并核验新的来源。
3. 创建日报，必要时添加已核验的论文记录至 `data/papers.json`。保留已有记录，不为了扩大数量虚构论文或补填未知信息。
4. 本地可用时运行 `node scripts/add-daily.mjs /absolute/path/to/new-edition.json`，然后 `npm test && npm run build`。
5. GitHub 连接器发布时，使用 `create_file` 创建当天文件即可。提交到 main 会触发构建；构建会扫描所有日报并在发布产物里重新生成两个索引。不要为了手工改索引而覆盖原来的日报。
6. 检查提交及 Actions 状态。部署失败时明确说明“内容已提交、网站尚未部署”，不能说网站已更新。页面发布地址应从部署结果获得。

## 自动生成配置

仓库 `Settings → Secrets and variables → Actions` 中必须存在前两个 Repository secrets；第三个为可选配置：

- `OPENAI_API_KEY`：OpenAI 官方或兼容中转服务提供的密钥。
- `OPENAI_BASE_URL`：API 基础地址，例如以 `/v1` 结尾；脚本会自动拼接 `/responses`。
- `OPENAI_MODEL`（可选）：中转服务实际支持的模型 ID；未配置时默认使用 `gpt-5.6-sol`。

生成脚本会要求模型联网检索一手来源、输出结构化 JSON，再运行仓库现有校验与构建。当天文件已存在时不会覆盖；如确需重建，可在 Actions 手动运行工作流并勾选 `force_regenerate`。第三方中转服务能够看到传给它的密钥和请求内容，不应把 OpenAI 官方密钥交给不可信的中转站。

## 十条目标与候选补充

每个领域原有的单次检索最多返回12个候选；同一批搜索工具返回的其他白名单原文URL也会直接抓取并核验发布日期、标题和正文，每领域最多补查12个URL，不增加模型检索轮次。新增Vercel、WPI、AMD、IBM、Apple、Replit等官方出版方。实时arXiv候选池扩大至100篇，每期预印本最多6条，并明确其非同行评审属性。只收录简报当天或前一天原始发布的内容，当天优先于前一天；同一天优先官方动态，按领域尽量平衡，无新消息的领域可由其他领域补位。两天前及更早的内容一律不参与候选，即使不足10条也不放宽日期；arXiv和工具URL补查遵守同样日期限制。检索明确给出这两个日期，并提示跨官方新闻室、博客和研究栏目、英语及中文公告寻找更多不同事件，不增加模型检索轮次。

新日报携带 `targetCount: 10` 和 `maxSourceAgeDays: 1`，生成器及发布校验器双重检查日期，索引与首页展示实际条数、预印本数、当天与前一天条数。日期按来源的原始发布日期计算，前一天是日历日期而非滚动24小时。历史日报保留原文并明确标识旧规则，不重新包装为当天新闻；新规则从下一次正式生成生效，不为切换规则额外运行付费生成。每日仍只正式生成一次，不额外运行收费预览；长文输入有长度上限，但条数增加可能使实际token费用增加。

## 索引与专题

检索接口若把全部来源链接替换为 `api.shep-api.com/v1/media/assets/` 临时地址，无法用它们证明原文链接身份。此时仅把模型给出的原文地址作为发现线索，独立访问白名单出版方、核验原始发布日期（元数据或已适配出版方的专用发布日期栏）和正文，并在诊断的 `provenanceBasis` 中注明。仍要求真实完成搜索；普通来源链接模式继续要求候选与工具来源匹配。临时地址不会进入日报。日期缺失、冲突、不一致、过期及非白名单来源仍拒绝发布。

- `data/daily/index.json`：生成的简报日期索引。
- `data/catalog.json`：生成的全站搜索索引。网站读取发布产物中的最新版本。
- `data/papers.json`：论文库；每条包括 `id,title,paperTitle,published,category,summary,tags,sources`，其余字段同日报条目。
- `data/topics.json`：专题；每条包括 `id,title,subtitle,date,category,summary,tags,sections,sources`。

仓库中两个索引是上次本地构建时的快照，自动化查重以 `data/daily` 实际文件为准。线上每次构建都会重建索引，不依赖快照是否手工更新。

## 首期记录

2026-09-20 是依据一手来源重新核验的首期整理，不是此前聊天消息的逐字回放。此前提及的“Agentic AI Networking for Heterogeneous Unmanned Aerial Systems in Low-Altitude Wireless Networks”未找到足以核验的对应原论文，因此没有沿用，改为已核验的 2026-09-13 多无人机研究。没有导入未取得原文的其他历史简报。


## 新闻来源与社区隔离（2026-11-23）

允许官方公告和正式编辑部报道，包括IT之家、iThome台湾、TechCrunch、The Verge、Ars Technica、TechRadar、Tom’s Hardware、Reuters、AP、Axios、机器之心、量子位、The Robot Report、DroneLife等白名单。主域名白名单不能覆盖社区子域：community、forums、discuss、quan等及论坛/评论路径均拒绝，在抓取前和重定向后检查。新日报带 `sourcePolicy: editorial-news-v1`，发布校验再次拒绝社区或未批准来源；旧日报保持可读。

六个公开RSS/Atom订阅源用于发现候选，并记录成功/失败。标题过滤促销、传闻和汇总，发布时间仅接受当天/前一天；候选交给原有五个领域检索做相关性、实质新进展及事件去重筛选，不能将一篇新报道中的旧事件冒充新事件。RSS不是最终证据，必须另抓原文验证日期和正文。IT之家日期适配只读其文章专用 `pubtime_baidu` 栏，不读取页脚/相关推荐日期。媒体报道在摘要中归因媒体，并保留原文及证据边界。原有每天02:00一次正式生成的计划不变；本次用户单独授权额外付费预览，日常不增加预览。

补查得到的正文也必须经独立内容审查请求，不能沿用检索领域强行分类。审查可纠正类别，要求近两天的实质进展日期、原文中的逐字证据片段和事件去重键；校验拒绝旧事件、正文未出现的证据及来源外URL。每次日常生成新增一次内容审查模型请求，因此token费用可能增加；仍每天一次正式生成。

正文审查必须实际联网检索原始公告或更早报道，特别核对融资、研究发布和产品更新；不能只采信媒体正文中的“今天消息”。若实际事件早于前一天且无新进展，则不收录。审查搜索来源写入诊断，无法验证新鲜度时省略；本次已人工追溯剔除数篇最近报道中的上周公告。额外联网审查可能增加模型和搜索用量。

# 内容发布约定

本文件是 TechBrief 每日内容更新的操作依据。仓库：`jiangxixu/TechBrief`，分支：`main`。

## 内容原则

- 日报由 GitHub Actions 通过 OpenAI 兼容的 Responses API 自动生成。API Key、Base URL 和模型名只保存在 GitHub Actions Secrets 中，不写入代码、构建产物或网站前端。
- 优先最近 24 小时的 AI、Agent、机器人、无人机、计算机科研与科技产业进展。重要内容不足时可补充近期内容并标注原始发布日期；可信材料不足时少于 5 条也可以。
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

一份日报允许 1–10 条，通常精选 5 条；来源日期不能晚于日报日期。ID 全站唯一，只能使用小写字母、数字、连字符。

## 提交流程

1. 每天北京时间 08:00 由 `.github/workflows/daily-ai-news.yml` 启动；脚本检查当天文件是否已存在，默认存在时跳过、不覆盖。
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

## 索引与专题

- `data/daily/index.json`：生成的简报日期索引。
- `data/catalog.json`：生成的全站搜索索引。网站读取发布产物中的最新版本。
- `data/papers.json`：论文库；每条包括 `id,title,paperTitle,published,category,summary,tags,sources`，其余字段同日报条目。
- `data/topics.json`：专题；每条包括 `id,title,subtitle,date,category,summary,tags,sections,sources`。

仓库中两个索引是上次本地构建时的快照，自动化查重以 `data/daily` 实际文件为准。线上每次构建都会重建索引，不依赖快照是否手工更新。

## 首期记录

2026-09-20 是依据一手来源重新核验的首期整理，不是此前聊天消息的逐字回放。此前提及的“Agentic AI Networking for Heterogeneous Unmanned Aerial Systems in Low-Altitude Wireless Networks”未找到足以核验的对应原论文，因此没有沿用，改为已核验的 2026-09-13 多无人机研究。没有导入未取得原文的其他历史简报。

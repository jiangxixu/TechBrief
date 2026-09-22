import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from './validate.mjs';

// Titles recovered from the user's AI 科技每日简报 conversation (2026-08-23—2026-09-19).
// A missing URL means the old message retained only a truncated link; we intentionally do not guess it.
const days={
 '2026-08-23':[
  ['2026世界人形机器人运动会开幕：2,056台机器人接受公开压力测试','科技产业'],
  ['Anthropic 将 Computer Use、Skills API、Files API 推向正式可用','Agent'],
  ['AdaPT：人形机器人从网球比赛视频学习职业运动风格','机器人 / 具身','https://arxiv.org/abs/2608.20087'],
  ['AI4AI-Bench：科研 Agent 更擅长调参，而不是发明训练算法','Agent','https://arxiv.org/abs/2608.20318'],
  ['EXIMO：VLA 用 VLM 规划、模仿与强化学习掌握新任务','机器人 / 具身','https://arxiv.org/abs/2608.19891']],
 '2026-08-24':[
  ['世界人形机器人运动会进入1500米与自由搏击项目','科技产业','https://apnews.com/article/ce96217d30c6462e8d3d552d5dd1bb39'],
  ['Anthropic：专用“测谎模型”跨欺骗类型泛化失效','AI / 大模型','https://alignment.anthropic.com/2026/lie-detectors/'],
  ['GPT-5.6 Sol API 价格下调超过20%','AI / 大模型','https://openai.com/index/gpt-5-6/'],
  ['HiTac-WAM：触觉世界动作模型','机器人 / 具身','https://arxiv.org/abs/2608.19574'],
  ['What Matters for Latent Actions：比较41种机器人 Latent Action 设计','机器人 / 具身','https://arxiv.org/abs/2608.19613']],
 '2026-08-26':[
  ['NVIDIA Jetson Orin Nano 2 面向边缘 AI','科技产业'],
  ['OpenAI Jalapeño AI 芯片计划','科技产业'],
  ['小鹏机器人融资进展','科技产业'],
  ['EarthVerse：面向地球科学的研究 Agent','Agent'],
  ['Q-Planning：面向智能体的规划方法','Agent']],
 '2026-08-27':[
  ['AWS × NVIDIA 再加码200万块 GPU','科技产业'],
  ['Gemini 3.5 Transcribe 发布','AI / 大模型'],
  ['AIRSEAI 加入 LF AI & Data','科技产业','https://github.com/AIRSEAI/AIRSEAI-1.0'],
  ['ARLI：机器人学习研究','机器人 / 具身','https://arxiv.org/abs/2608.23831'],
  ['SMITH：机器人研究新方法','机器人 / 具身','https://arxiv.org/abs/2608.24571']],
 '2026-08-28':[
  ['Anthropic MHS：统一 Agent 与真实设备的控制接口','Agent','https://www.anthropic.com/news/model-hardware-standard-research-preview'],
  ['OpenAI Codex Persistent Mode：跨会话长期运行的主动 Agent','Agent','https://www.wired.com/story/openai-is-developing-a-persistent-ai-agent/'],
  ['瑞萨在北京成立 Physical AI & Robotics Lab','科技产业'],
  ['Zero-WAM：把人类视频作为机器人上下文提示','机器人 / 具身','https://arxiv.org/abs/2608.26103'],
  ['R³：先用自然语言推理，再执行机器人短任务','机器人 / 具身','https://arxiv.org/abs/2608.26053']],
 '2026-08-29':[
  ['高德 ABot-Recon：短期视觉上下文构建万帧级3D世界','机器人 / 具身','https://amap-cvlab.github.io/ABot-Recon-html/'],
  ['CLAP：一个 World Model 学习人类、机械臂和人形机器人','机器人 / 具身','https://arxiv.org/abs/2608.27406'],
  ['UrbanGround：城市级机器人仿真环境','机器人 / 具身','https://urbanground.github.io/'],
  ['WikiSkill：为 Agent 构建可持久复用的技能','Agent','https://arxiv.org/abs/2608.27454'],
  ['Salesforce × Anthropic 推出 Claudeforce','Agent','https://www.salesforce.com/claudeforce/']],
 '2026-08-30':[
  ['Reimagine Robotics 推进通用机器人平台','机器人 / 具身'],
  ['Meta 将机器人用于数据中心运维','机器人 / 具身'],
  ['FlashVLA：面向实时机器人的视觉语言动作模型','机器人 / 具身'],
  ['Riemann-1.0：机器人基础模型','机器人 / 具身'],
  ['Instruct-to-Act：从语言指令生成机器人动作','机器人 / 具身']],
 '2026-08-31':[
  ['AI 投资带来巨额账面收益','科技产业'],
  ['Microduck：轻量机器人系统','机器人 / 具身'],
  ['OpenAI 停止向 Cursor 提供部分模型','科技产业'],
  ['ATOMZA：机器人智能研究','机器人 / 具身'],
  ['ROS2SmolVLA：在 ROS 2 中部署轻量 VLA','机器人 / 具身']],
 '2026-09-01':[
  ['GitHub Agentic Workflows：用 Agent 自动化开发流程','Agent'],
  ['HUMAIN × Applied Intuition 推进自动驾驶卡车','科技产业'],
  ['Gemini 进入人形机器人场景','机器人 / 具身'],
  ['VLAct：视觉语言动作学习','机器人 / 具身'],
  ['LLM 引导的无人机 ObjectNav','无人机']],
 '2026-09-02':[
  ['Astra：新一代 AI 系统进展','AI / 大模型'],
  ['SUN：具身智能研究进展','机器人 / 具身'],
  ['TuringLLM：大模型研究进展','AI / 大模型'],
  ['Measure Before You Manage：Agent 系统评测','Agent'],
  ['Lucid Bots 发布 Power Tether 无人机系统','无人机']],
 '2026-09-03':[
  ['Gemini 3.8 Flash 发布','AI / 大模型'],
  ['Facet-0：新型 AI 模型研究','AI / 大模型'],
  ['EmbodiedSkills：可验证、可恢复的机器人技能执行','机器人 / 具身','https://arxiv.org/abs/2609.01281'],
  ['Atlas 人形机器人新进展','机器人 / 具身'],
  ['Elroy Air Chaparral 无人货运飞机进展','无人机']],
 '2026-09-04':[
  ['OpenAI Daybreak for Frontline Defenders','Agent'],
  ['K2 Horizon 模型发布','AI / 大模型'],
  ['FANUC 推进 Physical AI','机器人 / 具身'],
  ['WM-LOCO：用世界模型辅助机器人运动控制','机器人 / 具身','https://arxiv.org/abs/2609.02542'],
  ['DroneCATS-Agent：多模态大模型直接决策无人机动作','无人机','https://arxiv.org/abs/2609.01404']],
 '2026-09-05':[
  ['Claude 参与费马大定理机器验证','AI / 大模型'],
  ['GPT-6 Astra 模型进展','AI / 大模型'],
  ['Figure 扩充机器人 GPU 训练基础设施','科技产业'],
  ['On-the-Fly3R：在线3D重建与一致性验证','机器人 / 具身','https://arxiv.org/abs/2609.00923'],
  ['PART：1.1M参数雷达运动目标检测','机器人 / 具身']],
 '2026-09-06':[
  ['HydraFusion：多传感器融合项目','机器人 / 具身'],
  ['Iwa Robotics 机器人平台进展','机器人 / 具身'],
  ['WISE：具身智能研究','机器人 / 具身'],
  ['AGC-VLN：视觉语言导航研究','机器人 / 具身'],
  ['TRaIL-Odom：机器人里程计研究','机器人 / 具身']],
 '2026-09-07':[
  ['OpenAI 自动化研究实习生系统','Agent'],
  ['NVIDIA PAIR 机器人研究','机器人 / 具身'],
  ['FWBC-VLA：视觉语言动作模型','机器人 / 具身'],
  ['R2S-Eval：机器人系统评测','机器人 / 具身'],
  ['6D-DWA：六自由度无人机局部规划','无人机']],
 '2026-09-08':[
  ['GitHub Agentic Workflows v0.88.4','Agent'],
  ['NEURA × SECO 推进机器人计算平台','科技产业'],
  ['VLA-Precision：提高视觉语言动作控制精度','机器人 / 具身','https://arxiv.org/abs/2609.04355'],
  ['KVMem：为 Agent 提供持久键值记忆','Agent','https://arxiv.org/abs/2609.04852'],
  ['Hermeus × Anduril：Lattice 接入高速飞行平台','无人机','https://www.hermeus.com/article/anduril-lattice']],
 '2026-09-09':[
  ['Meta Muse 模型发布','AI / 大模型'],
  ['XPENG IRON 人形机器人进展','机器人 / 具身'],
  ['AWS Agent Evaluation 接入 GitHub Actions','Agent'],
  ['TacPAC：机器人触觉研究','机器人 / 具身'],
  ['TU Dresden Air-Take-Off 无人机研究','无人机']],
 '2026-09-10':[
  ['General Robotics 发布 GRID','机器人 / 具身'],
  ['日立建机推进 Physical AI 挖掘机','机器人 / 具身'],
  ['京东公布 Physical AI 采购计划','科技产业'],
  ['Samsung × Mistral 合作','科技产业'],
  ['MobileVLA-R1 2.0：移动机器人视觉语言动作推理','机器人 / 具身']],
 '2026-09-11':[
  ['ACSL × PFN：生成式 AI 自动规划无人机航路','无人机'],
  ['Show-Harness：VLM 通过语义动作接口控制机器人','机器人 / 具身'],
  ['Subagents vs Agent Skills：两种 Agent 分工方式','Agent'],
  ['Salesforce Enterprise AI Harness','Agent'],
  ['NVIDIA × d-Matrix 推进 Prefill/Decode 解耦推理','科技产业']],
 '2026-09-12':[
  ['FANUC × Google AI Welding Agent','机器人 / 具身'],
  ['OpenAI Agents API 更新','Agent'],
  ['Anthropic 发布 AI 威胁报告','AI / 大模型'],
  ['GE-Act 2.0：World-Action Model','机器人 / 具身'],
  ['Mercury 2.5：扩散式大语言模型','AI / 大模型']],
 '2026-09-13':[
  ['JAL × Donecle 推进自动无人机飞机巡检','无人机'],
  ['Salesforce Long-Horizon Runtime 支持长期 Agent','Agent'],
  ['T1：通过强化学习训练 Terminal Agent','Agent'],
  ['Programmable World Model：保持可操作的世界状态','机器人 / 具身'],
  ['Qualcomm × Amazon 扩展 AI 推理基础设施','科技产业']],
 '2026-09-14':[
  ['现代汽车把数据飞轮与 VLA 推进自动驾驶主线','科技产业'],
  ['Scaling Automatic Research Agents via World Models','Agent','https://arxiv.org/abs/2608.12564'],
  ['Thinking with Looped Flows：让小模型通过循环继续推理','AI / 大模型','https://arxiv.org/abs/2609.11801'],
  ['Skild S1：机器人通过 Prompt 学习新任务','机器人 / 具身','https://www.skild.ai/blogs/s1'],
  ['EVPeriscope：用无人机螺旋桨信号辅助定位','无人机','https://arxiv.org/abs/2609.11920']],
 '2026-09-15':[
  ['小马智行发布第四代 L4 Robotruck','科技产业'],
  ['Motus2：融合 Policy、World Model 与 Value Model','机器人 / 具身','https://arxiv.org/abs/2608.30237'],
  ['AWS 提出生产级 Multi-Agent 原则','Agent'],
  ['Perplexity 使用 GPT-6 Astra 操作完整软件系统','Agent','https://openai.com/index/perplexity-improving-accuracy-with-astra/'],
  ['AWS 开源 Unified Knowledge Graph RAG','Agent','https://github.com/awslabs/unified-kg-rag-on-aws']],
 '2026-09-16':[
  ['富士通发布 Aurora：企业 IT 支持开始 Agent 化','Agent','https://global.fujitsu/en-global/newsroom/europe/2026/15-09'],
  ['Siemens × Salesforce：Agent 读取 Teamcenter 数字孪生','Agent'],
  ['英国研究7万英尺自主高空无人机作为5G/6G基站','无人机'],
  ['Toward Self-Adaptive Physical AI','机器人 / 具身','https://arxiv.org/abs/2609.13436'],
  ['The Router Within：模型内部路由研究','AI / 大模型','https://arxiv.org/abs/2609.15982']],
 '2026-09-18':[
  ['VLM-MPPI：用自然语言约束多样化空中导航轨迹','无人机','https://arxiv.org/abs/2609.18451'],
  ['AeroWeaver：无人机自主系统研究','无人机','https://arxiv.org/abs/2609.18520'],
  ['GPT-Policy：语言模型生成机器人策略','机器人 / 具身','https://arxiv.org/abs/2609.19138'],
  ['Edge0：边缘侧具身智能模型','机器人 / 具身','https://arxiv.org/abs/2609.18063'],
  ['Nokia × Microsoft：Agent 进入真实电信网络运维','Agent']],
 '2026-09-19':[
  ['Figure Helix 2.5 推进人形机器人控制','机器人 / 具身'],
  ['SafeHarness：把避障约束写进机器人 Coding Agent','机器人 / 具身','https://arxiv.org/abs/2609.20822'],
  ['Workspace Models：用显著性监督构建轻量机器人记忆','机器人 / 具身','https://arxiv.org/abs/2609.20820'],
  ['dQwen3.5：大语言模型架构研究','AI / 大模型','https://arxiv.org/abs/2609.20751'],
  ['华为云发布 Agentic Cloud 能力','Agent']]
};

const items=[];
for(const [date,entries] of Object.entries(days))entries.forEach(([title,category,url],index)=>items.push({
 id:`h-${date.replaceAll('-','')}-${index+1}`,
 title,category,date,
 sources:url?[{name:url.includes('arxiv.org')?'arXiv 原论文':'原始来源',url}]:[]
}));
items.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
await writeFile(resolve(root,'data/history.json'),JSON.stringify(items,null,2)+'\n');
console.log(`Imported ${items.length} recovered news items from ${Object.keys(days).length} chat editions.`);

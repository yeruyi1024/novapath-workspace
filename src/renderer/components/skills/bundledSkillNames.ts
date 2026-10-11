import type { LocalizedText } from '../../types/skill';

/** Default presentation order; optional integrations remain available in the full catalog. */
export const COMMON_BUNDLED_SKILL_ORDER = [
  'docx', 'pptx', 'pdf', 'xlsx', 'web-search', 'playwright', 'create-plan',
  'article-writer', 'frontend-design', 'skill-creator', 'skill-vetter',
] as const;

/**
 * Localized display names for the skills bundled with the app
 * (the ones listed in SKILLs/skills.config.json).
 *
 * The skill store currently ships English-only ids as names, so these give
 * Chinese users a readable title today. Once the server sends `displayName`
 * for a skill, that value wins over this map — see
 * `skillService.getLocalizedSkillName()`.
 *
 * When adding a bundled skill, add its display name here too; a missing entry
 * only means the prettified English name is shown.
 */
export const BUNDLED_SKILL_DISPLAY_NAMES: Record<string, LocalizedText> = {
  'article-writer': { zh: '长文写作', en: 'Article Writer' },
  'canvas-design': { zh: '画布设计', en: 'Canvas Design' },
  'content-planner': { zh: '内容规划', en: 'Content Planner' },
  'create-plan': { zh: '计划生成', en: 'Create Plan' },
  'daily-trending': { zh: '每日热点', en: 'Daily Trending' },
  'develop-web-game': { zh: '网页游戏开发', en: 'Web Game Development' },
  'docx': { zh: 'Word 文档处理', en: 'Word Documents' },
  'films-search': { zh: '影视资源搜索', en: 'Films Search' },
  'frontend-design': { zh: '前端页面设计', en: 'Frontend Design' },
  'imap-smtp-email': { zh: '邮件收发', en: 'Email (IMAP/SMTP)' },
  'local-tools': { zh: '本地工具', en: 'Local Tools' },
  'music-search': { zh: '音乐搜索', en: 'Music Search' },
  'pdf': { zh: 'PDF 处理', en: 'PDF Toolkit' },
  'playwright': { zh: 'Playwright 自动化', en: 'Playwright' },
  'pptx': { zh: 'PPT 制作', en: 'PowerPoint Slides' },
  'remotion': { zh: '程序化视频', en: 'Programmatic Video' },
  'seedance': { zh: 'Seedance 视频生成', en: 'Seedance' },
  'seedream': { zh: 'Seedream 图像生成', en: 'Seedream' },
  'skill-creator': { zh: '技能创建', en: 'Skill Creator' },
  'skill-vetter': { zh: '技能安全审查', en: 'Skill Vetter' },
  'skin-creator': { zh: '皮肤创建', en: 'Skin Creator' },
  'stock-analyzer': { zh: '股票分析', en: 'Stock Analyzer' },
  'stock-announcements': { zh: '上市公司公告', en: 'Stock Announcements' },
  'stock-explorer': { zh: '行情浏览', en: 'Stock Explorer' },
  'technology-news-search': { zh: '科技新闻检索', en: 'Tech News Search' },
  'weather': { zh: '天气查询', en: 'Weather' },
  'web-search': { zh: '联网搜索', en: 'Web Search' },
  'xlsx': { zh: '表格处理', en: 'Excel Spreadsheets' },
  'youdaonote': { zh: '有道云笔记', en: 'Youdao Note' },
};

/** Product-facing summaries; execution instructions remain in each skill. */
export const BUNDLED_SKILL_DESCRIPTIONS: Record<string, LocalizedText> = {
  'article-writer': { zh: '从素材、提纲到成稿，完成不同风格的长文。', en: 'Develop sources and outlines into polished articles.' },
  'canvas-design': { zh: '制作海报、插画与静态视觉作品。', en: 'Create posters, illustrations, and visual compositions.' },
  'content-planner': { zh: '整理选题方向，制定内容发布日历。', en: 'Plan topics and organize an editorial calendar.' },
  'create-plan': { zh: '把复杂目标拆分为清晰、可执行的步骤。', en: 'Turn a complex goal into an actionable plan.' },
  'daily-trending': { zh: '汇总多个平台的热门话题。', en: 'Explore trending topics across platforms.' },
  'develop-web-game': { zh: '构建、调试并验证浏览器小游戏。', en: 'Build, test, and refine browser games.' },
  'docx': { zh: '创建与编辑 Word 文档，保留格式、批注和修订。', en: 'Create and edit Word documents with formatting and tracked changes.' },
  'films-search': { zh: '按片名检索影视资源。', en: 'Find film and television resources by title.' },
  'frontend-design': { zh: '设计并实现网站、界面和交互组件。', en: 'Design and build websites, interfaces, and components.' },
  'imap-smtp-email': { zh: '连接邮箱，搜索邮件并处理附件与回复。', en: 'Connect a mailbox to search messages and work with attachments.' },
  'local-tools': { zh: '使用本地日历等系统工具处理日常事务。', en: 'Work with local calendars and system tools.' },
  'music-search': { zh: '按歌曲、专辑或歌手检索音乐资源。', en: 'Find music resources by song, album, or artist.' },
  'pdf': { zh: '提取 PDF 内容，合并文档或填写表单。', en: 'Extract PDF content, merge documents, and fill forms.' },
  'playwright': { zh: '执行浏览器操作，检查页面和交互流程。', en: 'Automate browser tasks and verify page interactions.' },
  'pptx': { zh: '制作和修改演示文稿，整理版式与讲稿。', en: 'Create and edit presentations, layouts, and speaker notes.' },
  'remotion': { zh: '用代码制作可复用的视频与动画。', en: 'Create reusable videos and animations with code.' },
  'seedance': { zh: '通过 Seedance 将文字或图片生成视频。', en: 'Generate videos from text or images with Seedance.' },
  'seedream': { zh: '通过 Seedream 生成、编辑与融合图片。', en: 'Generate, edit, and combine images with Seedream.' },
  'skill-creator': { zh: '把重复任务整理为可复用的技能。', en: 'Create reusable skills for repeatable tasks.' },
  'skill-vetter': { zh: '安装前检查技能的权限与潜在风险。', en: 'Review skill permissions and risks before installation.' },
  'skin-creator': { zh: '创作背景、徽记与配色，定制工作空间外观。', en: 'Customize your workspace with coordinated backgrounds and colors.' },
  'stock-analyzer': { zh: '整理行情、基本面和技术指标，辅助研究。', en: 'Organize quotes, fundamentals, and technical indicators for research.' },
  'stock-announcements': { zh: '检索上市公司公告，追踪重要动态。', en: 'Search company announcements and track major developments.' },
  'stock-explorer': { zh: '浏览行情与指标，生成数据概览。', en: 'Explore market data and generate indicator summaries.' },
  'technology-news-search': { zh: '检索科技媒体、开发者社区与行业资讯。', en: 'Search technology media, developer communities, and industry news.' },
  'weather': { zh: '查询实时天气与未来预报。', en: 'Check current weather and forecasts.' },
  'web-search': { zh: '检索网页信息，查找资料与最新动态。', en: 'Search the web for sources and recent information.' },
  'xlsx': { zh: '整理表格、编写公式，分析并可视化数据。', en: 'Organize spreadsheets, calculate formulas, and visualize data.' },
  'youdaonote': { zh: '连接有道云笔记，管理笔记、待办与收藏。', en: 'Connect Youdao Note to manage notes, tasks, and clippings.' },
};

'use strict';

// UI copy only. User content and translation-linked article snapshots are excluded.
const uiMessages = {
  '界面':'UI', '界面语言':'Interface language', '选择文章：':'Select article: ', '文章操作：':'Article actions: ',
  '文章语言版本':'Article language version', '当前原文站点':'Original site', '语言与站点':'Languages & sites', '查看原文站点':'View original site',
  '只发布当前语言；另一语言独立保存与发布。':'Only this language is published. Each language is saved and published independently.',
  '只发布当前语言；另一语言独立保存与发布。原文公开后再安排外部分发。':'This publishes only the selected language. Arrange external distribution once the original is live.',
  '本次只提交当前语言草稿，不会公开文章。':'This submits only the selected language draft. The article will remain private.',
  '一个双语 publication 对应两个独立 Ghost 站点。每个站点保留自己的文章、公开版本与地址。':'One bilingual publication has two independent Ghost sites, each with its own articles, published versions and URLs.',
  '两篇关联稿件，对应两个独立原文站点。切换标签只切换当前稿件；保存、发布与下线分别生效。':'Two linked drafts publish to two independent sites. Tabs select a draft; saving, publishing and unpublishing affect only that language.',
  '跳转到内容':'Skip to content', '好想法，':'Good ideas', '值得被世界':'deserve to be ', '看见。':'seen.',
  '产品洞察':'Product insights','开发者指南':'Developer guides','产品更新':'Product updates','工程实践':'Engineering','设计手记':'Design notes','团队手记':'Team notes','个人随笔':'Personal essays','未分类':'Uncategorized','导入文章':'Imported articles',
  '简体中文':'Simplified Chinese','中文':'Chinese','中':'ZH','刚刚':'Just now', '昨天':'Yesterday','今天':'Today',
  '选择':'Select','更多操作':'More actions', '约':'About', '字符':'characters', '分钟阅读':'min read', '分钟前':'minutes ago','小时前':'hours ago',
  '共 ':'Total: ', ' 篇内容':' articles', ' 篇文章':' articles', ' · 显示 ':' · Showing ', ' 篇':' articles', '第 ':'Page ', ' 页':'',
  '草稿 v':'Draft v', '线上 v':'Live v', '可见版本 v':'Visible version v', '公开版本 v':'Published version v', '原文 v':'Original v',
  '保存版本 v':'Saved version v', '已保存版本 v':'Saved version v', '当前线上 v':'Current live v',
  ' + 修改':' + edits', ' · 未包含当前未保存的修改':' · Unsaved edits excluded', ' · 不计入阅读数据':' · Excluded from readership metrics',
  '状态更新于 ':'Updated at ', '原文：':'Original: ', '内容：':'Content: ', '作者：':'Author: ', '语言：':'Language: ',
  '分钟':'minutes', '小时':'hours', '在线':'Live', '未公开':'Not public', '未发布':'Unpublished', '个人空间':'Personal workspace',
  '欢迎来到':'Welcome to ', 'Jing 的个人空间':'Jing’s workspace', '每日估算 UV':'Daily estimated UV',
  '每日估算独立读者':'Daily estimated unique visitors', '10 月 30 日':'Oct 30', '10 月 29 日':'Oct 29', '10 月 28 日':'Oct 28',
  '10 月 5 日':'Oct 5','10 月 12 日':'Oct 12','10 月 19 日':'Oct 19','10 月 26 日':'Oct 26','11 月 3 日':'Nov 3'
};

const uiEnglishToChinese = {
  'PUBLISHING STUDIO':'创作工作台','Publishing Studio':'创作工作台','Connected with':'已连接',
  'YOUR PUBLISHING SPACE':'属于我们的创作空间','MARKDOWN SOURCE':'MARKDOWN 原文','READY TO SHARE':'准备与世界分享','READY FOR YOUR TEAM':'准备提交给团队',
  'A PLACE FOR YOUR NEXT IDEA':'让下一个想法在此生长','WELCOME TO YOUR STUDIO':'欢迎来到创作工作台','MAKE ROOM FOR YOUR IDEAS':'为好想法留一席之地',
  'CREATE':'创作','CONNECT':'连接','PUBLISH':'发布','ChronoAI · An open space for connected ideas.':'ChronoAI · 让想法自由连接。',
  'CONNECTED, WITH INTENT':'有目的地连接','A SPACE THAT FEELS LIKE YOURS':'让工作区呈现自己的风格','THE PEOPLE BEHIND THE WORDS':'文字背后的人',
  'FROM YOUR FIRST DRAFT, FORWARD':'从第一篇草稿出发','YOUR FIRST PUBLISHING JOURNEY':'开始第一次发布之旅',
  'IDEAS · PEOPLE · POSSIBILITIES':'想法 · 人 · 可能性','INDEPENDENT IDEAS. SHARED POSSIBILITIES.':'独立思考，共创可能。',
  'Good ideas travel further.':'让好想法抵达更远的地方。','JOURNAL':'文章','NOTES':'手记','Journal':'文章',
  'Nov 3, 2026':'2026 年 11 月 3 日','Nov 2, 2026':'2026 年 11 月 2 日','Nov 3, 2026 · 3 min read':'2026 年 11 月 3 日 · 3 分钟阅读','3 min read':'3 分钟阅读',
  'Identity.':'身份。','Into action.':'化为行动。','Built for':'为更多','possibility.':'可能而构建。','Trust.':'信任。','By design.':'源于设计。',
  'Unavailable':'数据不可用'
};
const uiPatterns = [
  [/([0-9,]+) 分钟前/g,'$1 minutes ago'], [/([0-9,]+) 小时前/g,'$1 hours ago'],
  [/([0-9,]+) 分钟阅读/g,'$1 min read'], [/([0-9,]+) 字符/g,'$1 characters'],
  [/([0-9]+) 月 ([0-9]+) 日/g,'$1/$2'], [/。/g,'. '], [/，/g,', '], [/：/g,': '], [/；/g,'; '], [/“|”/g,'"']
];
Object.assign(uiEnglishToChinese, {
'EVERY DESTINATION, ONE VIEW':'所有目的地，一处掌握','UNDERSTAND YOUR IMPACT':'看懂内容的影响力','One identity.':'一个身份。','Every possibility.':'连接无限可能。','NYXID / CONNECTED WORK':'NYXID / 连接工作','IDEAS. PEOPLE. POSSIBILITIES.':'想法。人与人。可能性。',
'CHRONOAI / JOURNAL — 01':'CHRONOAI / 文章 — 01','CHRONOAI / JOURNAL — 02':'CHRONOAI / 文章 — 02','CHRONOAI / JOURNAL — 03':'CHRONOAI / 文章 — 03','CHRONOAI / JOURNAL — 04':'CHRONOAI / 文章 — 04',
'Unavailable · 已发布状态与阅读指标分别记录，缺少数据不会记作 0。':'数据不可用 · 已发布状态与阅读指标分别记录，缺少数据不会记作 0。','Unavailable · 渠道未提供':'数据不可用 · 渠道未提供','Unavailable · 尚未提供':'数据不可用 · 尚未提供'
});
Object.assign(uiMessages, {'当前演示身份：':'Current demo identity: ','将下线':'Unpublish','的 English 版本。另一个语言版本保持原状。':'in English. The other language remains unchanged.','的 简体中文 版本。另一个语言版本保持原状。':'in Simplified Chinese. The other language remains unchanged.'});
Object.assign(uiMessages, {'中 ·':'ZH ·'});
const uiDynamicMessages = [
  [/^共 (\d+) 篇内容(?: · 显示 (\d+)[–-](\d+) 篇)?$/, (_,count,first,last) => `${count} articles${first ? ` · Showing ${first}–${last}` : ''}`],
  [/^第 (\d+) 页$/, 'Page $1'],
  [/^最近(\d+)天浏览次数趋势，示例数据共([\d,]+)次$/, 'Views over the last $1 days; $2 sample views'],
  [/^草稿 v(\d+) 已保存；线上仍是 v(\d+)。$/, 'Draft v$1 saved; live version remains v$2.'],
  [/^草稿 v(\d+) 已保存；线上尚未发布。$/, 'Draft v$1 saved; not yet published.']
];

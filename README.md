# 尤复天梯观察站：免费托管版

目标平台：腾讯云 EdgeOne Makers / Pages 免费托管，自有域名单独按年购买。
本目录是独立迁移项目，旧 chatgpt.site 网站保持原样。初始数据为两个完整赛季，各100人；统计完全排除流局、无效局。

## 本地运行

需要 Node.js 22.22.3（最低22.13）。

```sh
npm ci
npm run build
npm test
npm run preview
```

打开 http://127.0.0.1:5188/ 。预览只读，无写入或采集入口。
dist 是公开前端及函数源码。完整发布使用 node scripts/deploy.mjs，由官方CLI编译为 dist/.edgeone 后部署；直接上传原始dist仅能保证静态页面。collector 中的采集程序、状态文件不在公开产物中。

## 一次性配置

1. 将源码上传自己的 GitHub 仓库，默认分支 main。若选公开仓库，标准 GitHub 托管运行器免费；源码、玩家公开战绩和同步进度会对外可见。私有仓库需控制免费分钟数。不要向仓库提交账号、Cookie、Token或其他凭据。
2. 腾讯云账户开通 EdgeOne Makers / Pages 免费版，创建或复用一个项目，项目名建议 yuri-ladder。选择「全球可用区（不含中国大陆）」，无备案域名只能用这一加速区域。CLI 的 --site china 是腾讯云中国站账户选择，与加速区域不同。
3. 在 EdgeOne 控制台创建 API Token。在 GitHub Settings → Secrets and variables → Actions 中保存为 EDGEONE_API_TOKEN。凭据只放 Secrets，不要发到聊天或写入源码。
4. 发布固定核对现有项目ID makers-i6sbocft2osz，通过官方SDK读取实际项目名与加速区域，再调用CLI发布；不依赖猜测的项目名。EDGEONE_SITE 为 china，国际站账户则用 global。SDK只用于核对已有项目，不创建项目或修改凭据。
5. Actions 中手动执行 Hourly ladder sync and deploy，代码首次推送也会启动。它会恢复进度、采集、保存进度、构建、测试，并部署同一个项目。没有 Token 时仍执行数据更新和测试，生成上传产物，跳过网站部署并注明待配置。
6. 已选择自有域名 yuri-ladder.cn，用户已购买且已通过审核。审核通过后绑定现有项目，无需再购买云服务器。
7. 在项目「域名管理」绑定实际购买的域名。将平台实际返回的CNAME写入DNS；不可预先猜CNAME。申请免费HTTPS证书，待域名和证书状态均正常再分享。
8. 从国内手机流量和家庭宽带分别关闭代理测试首页、筛选、选手详情和比赛明细，通过后才确认国内直连可用。

不建议提前为域名支付多年费用。平台默认域名在中国大陆要求3小时有效的预览链接，自有域名绑定完成后才适合长期分享。免费托管和自有域名不能保证每个国内运营商的跨境线路质量。

## 每小时采集和断点恢复

工作流在北京时间每小时第55分钟触发（UTC同为55分），也支持手动运行。GitHub调度可能延迟。每次最多运行35分钟，未结束时保存翻页游标，下次继续；不会发布半成品排名。

SQLite仅在每次运行器内使用。同步状态导出为带SHA256校验的NDJSON，写入同仓库独立 ladder-data 分支；下一台运行器从该分支重建数据库，包括翻页游标、待查摘要、完整和暂存批次。公开页面只读取已经完整的内容文件。采集失败仍可部署上次完整数据并显示失败进度。

仓库主分支放代码；ladder-data分支放采集状态和公开快照。工作流只推送数据分支，不覆盖主分支。全程并发不超过2、全局请求间隔至少2秒；遇来源限流立即保存进度，下个周期重试。比赛ID字符串、双人gameType=4且gameVersion=0；每7天完整复核，新入榜选手补历史，旧选手回查48小时。

`npm run sync` 是完整同步命令。`node collector/collector.mjs step` 只推进一批，退出码75表示已保存的未完成任务；退出码1表示失败。退出码0为完成或只导出。设置 YURI_CHECKPOINT_DIR、YURI_DATA_DIR、YURI_PUBLIC_DATA_DIR 可隔离工作目录。生产不要同时运行两个独立采集器。

公开仓库若长期无活动，GitHub可能停用定时工作流；检查Actions状态并按需恢复。数据分支持续更新也需关注平台策略变化。不要把免费定时调度视作精确到分钟的服务承诺。

## 选手对手档案与积分排名历史

选手研究中点击一位选手，可切换“对手档案”和“积分与排名历史”。对手档案继承当前赛季、时间、地图、己方/对手积分、分差和榜内范围筛选；按对手ID聚合，列出己方视角胜负、胜率、Wilson区间、最新交手时间及本次榜单积分。相近分数为绝对分差≤100，其他已知分差分为高分/低分；未知积分单列。支持搜索和排序，点击对手打开同一完整批次的比赛明细与己方三阵营交手统计。CSV增加对手档案和分组计数，最低样本门槛不改变档案统计。

积分与排名历史按每次完整榜单的真实采集时间记录，通过独立ranking_history表及带SHA256校验的断点文件长期保存；完整比赛快照轮换不会删除轻量历史。升级时复用可验证的完整公开快照及数据库中已有完整榜单；初始导入样本没有可靠榜单采集时间，因此不伪装成新观察点。只展示实际保存过的观察，不推算更早积分。

未选择个人时，选手研究页提供历史选手目录、最近两次完整榜单的入榜/离榜变化，以及当前浏览器收藏选手的快捷入口。掉榜选手仍可通过historyPlayer选择并查看旧记录；观察不到更低名次，因此不会填成第101名。GET /api/history?season=31&summary=1返回已记录选手目录和相邻榜单变化。

历史图支持积分/名次、全部/7天/30天、键盘定位及独立CSV导出。缺采超过3小时或未在该次榜单中时断线；未入榜显示空值，不记为第101名。历史仅受赛季、选手、historyRange影响，比赛筛选不改变历史曲线。周期从榜单实际观察时间倒推；已结束赛季也使用实际采集时间，明确说明采集可能在赛季结束后。它不改变比赛统计中的榜单快照积分口径。

新增接口：GET /api/history?season=31&player=945674&historyRange=all&snapshot=<完整批次>，返回采集点、积分、排名、在榜状态和最早观察时间。旧数据没有历史文件时返回available=false，不影响原统计。GET /api/matches增加opponent，须同时指定player。GET /api/stats的analytics增加opponents。UI通过research=opponents/history、historyRange=all/7d/30d、rival=<对手ID>保存视图；rival仅用于明细，不进入保存方案。历史文件按内容SHA命名并与完整批次一起发布。

## 分区改版与对抗分析

网站以 `screen=overview|players|matchups|maps|trends` 保存五个页面：总览、选手研究、阵营对抗、地图研究、胜率走势。旧 `view=maps/trend/tiers/compare`、选手链接和榜单/矩阵锚点继续可用。切换页面保留全部统计筛选，数据说明为常驻弹窗。

高级筛选默认收起。己方积分、绝对分差支持双端滑杆和整数输入；滑杆范围参考所选赛季样本，不限制手填范围。编辑仅改变草稿，应用后更新统计；四种快捷条件直接应用。漏斗每步同时给出出场数与独立比赛数；第3步只排除当前筛选所需的缺失积分，并非一律要求双方积分。手机默认收起漏斗，可展开完整四步。方案可命名、保存、覆盖、删除，仅存于当前浏览器，最多30个；保存统计条件及视图，不保存批次、明细和分页。

`/api/stats` 增加 `funnel`、`ratingOptions`；`analytics` 增加 `matchups`、`gapTiers`、`mapMatchups`、`crossSummary`。三组异阵营对抗卡包含六个有向计数，分别展示胜负、场次、Wilson区间。同一场只要至少一个己方视角符合筛选即可出现在卡片独立比赛数中；两个方向分别计数，不人为互补。分差分层为0–100、101–200、201–300、301–500、501及以上，继承全部筛选、排除内战，未知积分单独披露。

地图热图按官方原始地图名称及版本生成六种异阵营对阵。列表门槛继续按该地图全部胜负出场判断，小样本格子淡化而不删除。点击格子通过 `detailMap` 保存局部明细地图，不改变全站地图条件；读取 `/api/matches` 时使用该地图、原有筛选和同一 `snapshot`。CSV增加漏斗、六个方向、分差分层和地图对阵；导出保留各自分母。

手机提供导航菜单、全高筛选抽屉、精简四列榜单；点击选手可继续查看阵营及国家、收藏和对比。弹层支持Escape关闭、Tab循环和返回触发按钮焦点。

本轮不增加对局时长或历史积分，不推断地图类型。仍仅收录两个赛季前100名；流局与无效局全部排除。

分区改版已在正式域名发布。桌面和390×844手机布局、键盘焦点、分享、保存方案和CSV完成本地验收。云端已完成两个赛季200名选手采集及断点保存，未核查记录0。最新发布与线上验收结果见verification.json。

自动发布只编译公开的dist，保留函数入口名称；边缘运行时用Response构造函数生成JSON错误和405拒写响应。每次发布后回读正式域名，核对两个赛季的完整快照SHA256、总体/矩阵/漏斗/对抗/分差层/地图汇总和比赛明细，同时检查非法条件400、写入405；不通过则Actions标红。源码修复可在提交信息加[publish-only]，复用最近完整快照并执行构建、测试、部署、线上验收，按时运行仍照常采集。

打包：python scripts/package.py --edition 分区改版_自动发布版 --compiled-zip <已下载的edgeone-compiled-site.zip>。该上传包是官方CLI编译产物，根目录含assets、edge-functions及其config.json；选择既有项目上传。日常更新由Actions完成，无需人工上传。

### 原有数据接口

保留搜索、排序、个人统计、三阵营/十国矩阵、赛季/7天/30天、榜内对手、CSV和分享URL。前端从本站同源JSON计算，不请求旧chatgpt.site后端；可选头像和原始记录链接来自官方平台。

只读边缘接口：

```text
GET /api/stats?season=31&range=7d&opponents=top100&group=country&player=945674
GET /api/matches?season=31&group=faction&own=allied&enemy=yuri&offset=0
```

参数：season；range=season/7d/30d；opponents=all/top100；group=faction/country；player为字符串ID；map为来源地图原名；segment为下述积分或排名分段key。stats另接受compare（最多4个以逗号分隔的字符串ID）、bucket=day/week。view=compare/maps/trend/tiers与tierBy=mmr/rank用于保存界面视图。明细额外接受own/enemy、offset与snapshot。每页30行。矩阵明细按选手视角计出场数；独立比赛按ID去重；胜率=胜/(胜+负)。原始快照保留流局用于核查，查询与导出均排除。

内容文件名为完整SHA256；清单最后原子替换。保留前两次旧快照供已打开页面读取。边缘接口只读取本站静态数据，拒绝POST；无公开sync/MCP/admin写入口。

## 新增分析功能

- 选手对比：同时选择2至4位选手，比较总胜率及三阵营表现，并按两人组合展示真实直接交手比分。同一场比赛只从每对选手中第一位的视角计一次。比较遵循赛季、时间、地图、对手范围和分段筛选，不受个人详情选择影响。
- 地图胜率：按官方原始地图名称及版本分组，显示独立比赛、出场次数、总胜率与各阵营胜率；支持搜索、排序和点击地图筛选全站。不会擅自合并不同版本地图。
- 近期走势：按北京时间自然日或周一开始的自然周统计，遵循顶部时间窗口。展示分期胜率而非累计胜率；空白日期没有样本，显示“—”并断开折线。支持阵营切换、鼠标或键盘读取点位和完整数据表。
- 收藏选手：榜单星标及个人页均可收藏，支持只看收藏。按字符串ID保存在当前浏览器localStorage，跨赛季保留、同一浏览器标签间同步；不登录，不跨设备同步。存储不可用时本次页面内可继续操作并提示。
- 分段阵营胜率：积分分为2000以下、2000–2999、3000–3999、4000及以上；排名分为1–10、11–25、26–50、51–100。以本次榜单快照的己方选手积分/排名分组，统计该组前100名选手的赛季胜负记录，不是比赛时历史积分，也不代表全平台。各分段横向比较遵循时间、地图与对手筛选，不受个人详情或单个分段选择影响。点击分段筛选榜单、个人矩阵和明细。

少于20局标记样本较少，零样本胜率为null/“—”。榜内双方各计一次出场；地图/分段的独立比赛按字符串比赛ID去重，不同分段的独立比赛数不能相加。CSV同时导出地图、走势、对比和分段，带统计口径、截止时间及当前筛选。分享URL保留选手、地图、分段、对比列表、走势周期和分析标签。

只读接口示例：

```text
GET /api/stats?season=31&compare=945674,1322368&bucket=week
GET /api/stats?season=31&segment=rank%3A1-10&view=tiers
GET /api/stats?season=31&segment=mmr%3A4000%2B
GET /api/matches?season=31&map=%E5%90%B5%E9%97%B9%E9%AC%BCLE-%E5%B0%A4%E5%A4%8D%E5%A4%A9%E6%A2%AF
```

## 精细积分与分差筛选

“精细筛选”支持己方、对手的任意积分上下限，绝对分差上下限，以及只看更高分/更低分对手。上下限包含边界，可只填一侧；留空不限，0是有效条件，例如分差0–0表示同分。按“应用筛选”才生效，错误区间保留上次结果并显示提示。快捷方案提供同水平≤100、分差≤200、挑战高分≤300、观察低分≤300。

所有积分来自本次赛季榜单快照，不是比赛发生时的历史积分。现有数据仅含前100名积分；开启对手积分或分差条件后，缺少所需积分的出场会被排除，不会当成0分。覆盖率按当前己方范围/个人统计，显示筛选前出场、符合条件、双方积分已知比例、未知积分排除数及已知积分不符条件数。覆盖率分母包括当前时间/地图/榜内范围，独立比赛仍按ID去重。

榜单、个人矩阵、地图、走势、对比、比赛明细和CSV共用同一积分/分差筛选。分段横向比较忽略单个己方分段与自定义己方积分范围，继续遵循时间、地图、对手范围、对手积分和分差条件。UI切换固定分段会清除自定义己方范围，应用新的自定义己方范围会清除固定分段与个人/比较选择；直接API同时传入则取交集。

最低样本数仅影响榜单和地图列表，不改变总体胜率、矩阵或走势。榜单按当前排序指标样本数筛选（例如按盟军胜率排序时看盟军场次），地图按总场次。CSV只导出当前可见选手及达到门槛的地图，保留全部矩阵/走势及筛选条件。新增Wilson 95%置信区间，描述样本不确定性，不保证未来表现；零样本无区间。

API新参数：mmrMin/mmrMax（己方）、enemyMmrMin/enemyMmrMax（对手）、gapMin/gapMax（绝对分差），均为0–100000整数；gapDirection=any/stronger/weaker；minSamples=0–10000整数。非法数值或反向区间返回400。比赛明细新增ownMmr/opponentMmr和scoreGap，后者为对手积分减己方积分，带正负号；ratingBasis为ladder-snapshot。

```text
GET /api/stats?mmrMin=3500&mmrMax=4300&gapMin=0&gapMax=100&minSamples=20
GET /api/stats?enemyMmrMin=4000&gapMax=300&gapDirection=stronger
GET /api/matches?mmrMin=3500&mmrMax=4300&gapMax=100
```

使用`node scripts/verify-rating-data.mjs dist/data`可逐场独立复核两个赛季、三个时间窗口、两种对手范围、七组积分条件，共84组合。

## 当前验证与限制

选手对手档案与积分排名历史已正式发布。最新运行 https://github.com/caozqiu/yuri-ladder/actions/runs/39630087333 完成58项云端测试、0失败、0跳过，以及两赛季对手档案、历史、掉榜目录、拒写与完整快照回读。本地58项中57通过、1项Windows Git环境测试在云端通过；另外逐场独立核对200名选手、9538组交手计数。桌面及390×844手机、搜索排序、分享、键盘、收藏历史入口和CSV均已验收。历史仅从已保存的真实榜单开始，当前每赛季4个采集点，后续逐小时积累。完整证据见verification.json的playerResearch。


2026-10-21正式发布完成：云端48项测试全部通过；本地48项中47通过、1项Windows Git沙箱集成跳过，云端无跳过。正式域名的两赛季统计、非对称分差筛选、地图明细、400非法条件和405拒写均已回读。版本 7f311be5459cfac8abb6462847ef5e4324491634，部署 dploz8qz646a。完整证据见verification.json及输出发布记录。官方来源采集、SQLite持久化、全量查询对照、发布后统计回读分别验证。前端视觉验收在本地完成，正式站通过HTTPS及资源内容校验。国内手机流量和家庭宽带关闭代理后的访问仍需真实网络测试；海外节点成功不能证明所有国内线路可用。

源码和工作流：https://github.com/caozqiu/yuri-ladder 。复用项目makers-i6sbocft2osz，实际项目名yuri-ladder，加速区域overseas。域名yuri-ladder.cn的CNAME和HTTPS已生效，凭据已保存于GitHub Secret并验证；运行中不会要求将Token放入聊天或本地源码。

## 参考

- 官方数据源：https://ra2.com/rank/ladders
- 免费托管定价：https://pages.edgeone.ai/zh/pricing
- 自有域名与加速区域：https://pages.edgeone.ai/document/domain-overview
- EdgeOne CLI：https://pages.edgeone.ai/document/edgeone-cli
- GitHub部署配置：https://pages.edgeone.ai/document/using-github-actions
- 域名价表：https://buy.cloud.tencent.com/domain/price?type=renew

非官方统计项目，与兰博平台无隶属关系。

最新成功运行：https://github.com/caozqiu/yuri-ladder/actions/runs/39618628706 。独立定时采集：https://github.com/caozqiu/yuri-ladder/actions/runs/39616133026 。

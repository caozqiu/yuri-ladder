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
已编译 dist 可以直接托管；collector 中的采集程序、状态文件不在公开产物中。

## 一次性配置

1. 将源码上传自己的 GitHub 仓库，默认分支 main。若选公开仓库，标准 GitHub 托管运行器免费；源码、玩家公开战绩和同步进度会对外可见。私有仓库需控制免费分钟数。不要向仓库提交账号、Cookie、Token或其他凭据。
2. 腾讯云账户开通 EdgeOne Makers / Pages 免费版，创建或复用一个项目，项目名建议 yuri-ladder。选择「全球可用区（不含中国大陆）」，无备案域名只能用这一加速区域。CLI 的 --site china 是腾讯云中国站账户选择，与加速区域不同。
3. 在 EdgeOne 控制台创建限于所需项目的 API Token。在 GitHub Settings → Secrets and variables → Actions 中保存为 EDGEONE_API_TOKEN。凭据只放 Secrets，不要发到聊天或写入源码。
4. GitHub Actions 仓库变量 EDGEONE_PROJECT_NAME 设置为实际项目名；EDGEONE_SITE 为 china，国际站账户则用 global。
5. Actions 中手动执行 Hourly ladder sync and deploy，代码首次推送也会启动。它会恢复进度、采集、保存进度、构建、测试，并部署同一个项目。没有 Token 时仍执行数据更新和测试，生成上传产物，跳过网站部署并注明待配置。
6. 注册自有域名，推荐先查询 yuri-ladder.com。当前查询没有注册局记录，不代表已保留。腾讯云当前标准价表 .com 续费90元/年，.cn 38元/年；.com 已提示2026年11月将调价，以最终结算与未来续费公告为准。无需买云服务器或付费DNS套餐。
7. 在项目「域名管理」绑定实际购买的域名。将平台实际返回的CNAME写入DNS；不可预先猜CNAME。申请免费HTTPS证书，待域名和证书状态均正常再分享。
8. 从国内手机流量和家庭宽带分别关闭代理测试首页、筛选、选手详情和比赛明细，通过后才确认国内直连可用。

不建议提前为域名支付多年费用。平台默认域名在中国大陆要求3小时有效的预览链接，自有域名绑定完成后才适合长期分享。免费托管和自有域名不能保证每个国内运营商的跨境线路质量。

## 每小时采集和断点恢复

工作流在北京时间每小时第55分钟触发（UTC同为55分），也支持手动运行。GitHub调度可能延迟。每次最多运行35分钟，未结束时保存翻页游标，下次继续；不会发布半成品排名。

SQLite仅在每次运行器内使用。同步状态导出为带SHA256校验的NDJSON，写入同仓库独立 ladder-data 分支；下一台运行器从该分支重建数据库，包括翻页游标、待查摘要、完整和暂存批次。公开页面只读取已经完整的内容文件。采集失败仍可部署上次完整数据并显示失败进度。

仓库主分支放代码；ladder-data分支放采集状态和公开快照。工作流只推送数据分支，不覆盖主分支。全程并发2、比赛ID字符串、双人gameType=4且gameVersion=0；每7天完整复核，新入榜选手补历史，旧选手回查48小时。

`npm run sync` 是完整同步命令。`node collector/collector.mjs step` 只推进一批，退出码75表示已保存的未完成任务；退出码1表示失败。退出码0为完成或只导出。设置 YURI_CHECKPOINT_DIR、YURI_DATA_DIR、YURI_PUBLIC_DATA_DIR 可隔离工作目录。生产不要同时运行两个独立采集器。

公开仓库若长期无活动，GitHub可能停用定时工作流；检查Actions状态并按需恢复。数据分支持续更新也需关注平台策略变化。不要把免费定时调度视作精确到分钟的服务承诺。

## 数据与接口

保留搜索、排序、个人统计、三阵营/十国矩阵、赛季/7天/30天、榜内对手、CSV和分享URL。前端从本站同源JSON计算，不请求旧chatgpt.site后端；可选头像和原始记录链接来自官方平台。

只读边缘接口：

```text
GET /api/stats?season=31&range=7d&opponents=top100&group=country&player=945674
GET /api/matches?season=31&group=faction&own=allied&enemy=yuri&offset=0
```

参数：season；range=season/7d/30d；opponents=all/top100；group=faction/country；player为字符串ID；明细额外接受own/enemy、offset与snapshot。每页30行。矩阵明细按选手视角计出场数；独立比赛按ID去重；胜率=胜/(胜+负)。原始快照保留流局用于核查，查询与导出均排除。

内容文件名为完整SHA256；清单最后原子替换。保留前两次旧快照供已打开页面读取。边缘接口只读取本站静态数据，拒绝POST；无公开sync/MCP/admin写入口。

## 当前验证与未完成项

本地构建通过；20项测试通过，包括96组与原SQLite接口逐项对照、流局、零样本、大ID、分页、独立比赛计数、只读访问和失败不覆盖。另有一项Git数据分支测试因本机Windows沙箱限制而跳过，将在Linux Actions运行器执行；不能据此宣称云端更新链路已经通过。
已用两个全新SQLite目录访问真实官方源，恢复同一任务，完成选手从2增至4/200。新一轮200人的更新尚未完成，展示的仍是此前两季完整快照。

尚需账户授权、线上首次部署、域名购买与绑定、线上小时任务回读、国内无代理访问验收。浏览器控制连接未恢复，当前未重新完成桌面/手机截图验收；现有页面样式保持原版。

## 参考

- 官方数据源：https://ra2.com/rank/ladders
- 免费托管定价：https://pages.edgeone.ai/zh/pricing
- 自有域名与加速区域：https://pages.edgeone.ai/document/domain-overview
- EdgeOne CLI：https://pages.edgeone.ai/document/edgeone-cli
- GitHub部署配置：https://pages.edgeone.ai/document/using-github-actions
- 域名价表：https://buy.cloud.tencent.com/domain/price?type=renew

非官方统计项目，与兰博平台无隶属关系。

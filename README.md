# X DingTalk Tweet Monitor

一个轻量、开源的 X（Twitter）新推文监控器：定时检查指定账号的公开主页，一旦发现新的原创推文，就把正文、发布时间和原文链接推送到钉钉群机器人。

## 这个项目能做什么

- 监控一个指定 X 账号的新推文。
- 将新推文实时推送到钉钉自定义机器人。
- 推送推文正文、北京时间和原文链接。
- 默认只推送原创与引用推文，排除回复和转推。
- 首次运行只建立当前基线，不补发历史推文。
- 使用“推文 ID + 发布时间”双重去重，降低动态插入旧帖造成的误报。
- 监控失败时记录日志并自动重试。
- 在 macOS 上一条命令安装为登录后常驻服务。

它不做 AI 摘要、翻译、情感分析或自动回复，因此：

- 不需要大模型 API Key。
- 不需要 TwitterAPI.io API Key。
- 不需要申请 X Developer API。

## 工作原理

项目使用 Puppeteer 驱动本机 Chrome，通过独立浏览器目录保存一次人工登录产生的 X 会话。监控器按配置的间隔访问目标账号主页，从页面中读取最新推文并与本地状态比较，然后调用钉钉 Webhook。

这不是官方 X API 客户端。它依赖 X 网页结构，X 改版、风控或登录态过期时可能暂时失效。

## 环境要求

- Node.js 20 或更高版本，推荐 Node.js 24。
- Google Chrome 或 Chromium。
- 一个可以正常登录 X 的账号。
- 一个钉钉自定义机器人 Webhook。
- macOS 可自动安装常驻任务；Linux/Windows 可手动运行或使用自己的进程管理器。

## 快速开始

```bash
git clone https://github.com/SLEEQQY/x-dingtalk-tweet-monitor.git
cd x-dingtalk-tweet-monitor
npm install
cp config.example.json config.local.json
```

编辑 `config.local.json`：

```json
{
  "TARGET_ACCOUNT": "要监控的X用户名，不带@",
  "POLL_INTERVAL_SECONDS": 60,
  "FETCH_LIMIT": 10,
  "INCLUDE_REPLIES": false,
  "INCLUDE_RETWEETS": false,
  "DINGTALK_WEBHOOK": "你的钉钉机器人Webhook",
  "DINGTALK_SECRET": "",
  "DINGTALK_KEYWORD": "X监控",
  "TIME_ZONE": "Asia/Shanghai",
  "CHROME_EXECUTABLE_PATH": ""
}
```

如果钉钉机器人启用了“自定义关键词”安全设置，`DINGTALK_KEYWORD` 必须填写其中一个允许的关键词；项目会把它放入每条推送。如果机器人启用了加签，将密钥填入 `DINGTALK_SECRET`。

### 1. 建立 X 登录会话

```bash
npm run login
```

在弹出的独立 Chrome 窗口中登录 X。程序检测到登录成功后会自动关闭窗口，会话保存在被 Git 忽略的 `浏览器数据/`。

### 2. 建立监控基线

```bash
npm run once
```

首次运行不会推送旧帖，只会记录当前已经存在的推文。

### 3. 持续运行

前台运行：

```bash
npm start
```

macOS 安装为登录后常驻任务：

```bash
npm run service:install
npm run service:status
```

卸载常驻任务：

```bash
npm run service:uninstall
```

运行日志位于 `日志/运行.log`，本地去重状态位于 `状态.json`。

## 实时性

默认每 60 秒检查一次，所以正常发现延迟约为 0–60 秒，再加几秒页面加载与网络耗时。把轮询间隔调得过低可能增加 X 风控或限流风险，程序要求最小间隔为 60 秒。

锁屏不会停止 macOS LaunchAgent；关机、退出当前用户或电脑睡眠时无法继续抓取，恢复后服务会自动继续。

## 安全与隐私

本仓库是仅包含通用源码和用户文档的公开发行版。具体监控目标、本机部署信息、内部开发工程日志和任务记录不属于公开发行内容。

以下内容已在 `.gitignore` 中排除，绝对不要提交：

- `config.local.json`：包含钉钉 Webhook 和可能的签名密钥。
- `浏览器数据/`：包含 X 登录 Cookie。
- `状态.json`：包含本地监控状态。
- `日志/`：可能包含目标账号和推文链接。
- `开发工程日志.md`、`正在关注的任务.md`：内部工程记录。

建议为此项目使用权限最小化的独立 X 账号，并定期轮换泄露过的钉钉 Webhook。公开仓库发布前可执行：

```bash
git status --ignored
git grep -n -E 'access_token=|DINGTALK_SECRET'
```

## 配置说明

| 字段 | 说明 |
|---|---|
| `TARGET_ACCOUNT` | X 用户名，不含 `@` |
| `POLL_INTERVAL_SECONDS` | 轮询间隔，最小 60 秒 |
| `FETCH_LIMIT` | 每轮最多读取的页面推文数 |
| `INCLUDE_REPLIES` | 是否推送回复 |
| `INCLUDE_RETWEETS` | 是否推送转推 |
| `DINGTALK_WEBHOOK` | 钉钉自定义机器人 Webhook |
| `DINGTALK_SECRET` | 钉钉加签密钥，未启用加签时留空 |
| `DINGTALK_KEYWORD` | 钉钉机器人安全关键词 |
| `TIME_ZONE` | 推送消息显示的 IANA 时区 |
| `CHROME_EXECUTABLE_PATH` | Chrome 路径；自动识别失败时填写 |

## 测试

```bash
npm test
```

测试覆盖原创推文筛选、旧帖防误报和钉钉消息内容。GitHub Actions 会在每次推送和 Pull Request 时执行测试。

## 使用边界

- 仅监控登录账号有权查看的内容，不绕过账号权限或 X 的访问控制。
- 请遵守 X、钉钉及所在地适用的服务条款和法律法规。
- 网页选择器随 X 改版可能需要维护，本项目不承诺 100% 可用性或毫秒级实时性。

## License

[MIT](LICENSE)

import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const 当前目录 = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

export const 浏览器数据目录 = path.join(当前目录, '浏览器数据');

export function 解析Chrome路径(自定义路径 = process.env.CHROME_EXECUTABLE_PATH) {
  const 候选路径 = [
    自定义路径,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    process.platform === 'darwin' ? '/Applications/Chromium.app/Contents/MacOS/Chromium' : null,
    process.platform === 'win32' && process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
    process.platform === 'linux' ? '/usr/bin/google-chrome' : null,
    process.platform === 'linux' ? '/usr/bin/chromium' : null,
    process.platform === 'linux' ? '/usr/bin/chromium-browser' : null,
  ].filter(Boolean);
  const Chrome路径 = 候选路径.find((项目) =>fs.existsSync(项目));
  if (!Chrome路径) {
    throw new Error('找不到 Chrome；请安装 Chrome 或设置 CHROME_EXECUTABLE_PATH 环境变量');
  }
  return Chrome路径;
}

export async function 创建浏览器数据源({ headless = true, executablePath } = {}) {
  const 浏览器 = await puppeteer.launch({
    headless,
    timeout: 30_000,
    executablePath: 解析Chrome路径(executablePath),
    userDataDir: 浏览器数据目录,
    args: [
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-gpu',
    ],
  });
  const 页面 = (await 浏览器.pages())[0] || await 浏览器.newPage();
  await 页面.setViewport({ width: 1280, height: 900 });

  async function 获取推文(账号, 数量 = 10) {
    const 地址 = `https://x.com/${encodeURIComponent(账号)}?monitor_ts=${Date.now()}`;
    await 页面.goto(地址, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    if (页面.url().includes('/i/flow/login')) {
      throw new Error('X 登录态已失效，请运行“建立X会话.mjs”重新登录');
    }

    await 页面.waitForSelector('article[data-testid="tweet"]', { timeout: 30_000 });
    const 推文列表 = await 页面.$$eval(
      'article[data-testid="tweet"]',
      (文章列表, 参数) =>文章列表.slice(0, 参数.数量).map((文章) => {
        const 状态链接 = [...文章.querySelectorAll('a[href*="/status/"]')]
          .map((元素) =>元素.getAttribute('href'))
          .find((链接) =>链接?.toLowerCase().includes(`/${参数.账号.toLowerCase()}/status/`));
        const 时间 = 文章.querySelector('time')?.getAttribute('datetime') || null;
        const 社交上下文 = 文章.querySelector('[data-testid="socialContext"]')?.innerText || '';
        const 正文 = 文章.querySelector('[data-testid="tweetText"]')?.innerText || '';
        const id = 状态链接?.match(/status\/(\d+)/)?.[1] || null;
        return {
          id,
          fullText: 正文,
          timeParsed: 时间,
          timestamp: 时间 ? new Date(时间).getTime() : 0,
          permanentUrl: 状态链接 ? `https://x.com${状态链接.split('?')[0]}` : null,
          isReply: false,
          isRetweet: /reposted|retweeted|转推|已转发/i.test(社交上下文),
        };
      }).filter((项目) =>项目.id),
      { 账号, 数量 },
    );

    if (!推文列表.length) throw new Error('X 页面没有返回可识别的推文');
    return 推文列表.sort((甲, 乙) =>乙.timestamp - 甲.timestamp);
  }

  return {
    获取推文,
    async 关闭() {
      await 浏览器.close();
    },
  };
}

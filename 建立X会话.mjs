import { createRequire } from 'node:module';
import { 浏览器数据目录, 解析Chrome路径 } from './浏览器数据源.mjs';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const 浏览器 = await puppeteer.launch({
  headless: false,
  executablePath: 解析Chrome路径(),
  userDataDir: 浏览器数据目录,
  args: ['--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'],
});

const 页面 = (await 浏览器.pages())[0] || await 浏览器.newPage();
await 页面.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 45_000 });
console.log('请在打开的 Chrome 窗口中完成 X 登录，程序正在等待……');

const 截止时间 = Date.now() + 15 * 60_000;
let 已登录 = false;
while (Date.now() < 截止时间) {
  const cookies = await 页面.cookies('https://x.com');
  const 有认证Cookie = cookies.some((cookie) => cookie.name === 'auth_token' && cookie.value);
  if (有认证Cookie) {
    已登录 = true;
    break;
  }
  await new Promise((完成) => setTimeout(完成, 2_000));
}

if (已登录) {
  console.log('X 登录成功，会话已保存。');
  await 浏览器.close();
  process.exit(0);
}

console.error('等待登录超时，请重新运行。');
await 浏览器.close();
process.exit(2);

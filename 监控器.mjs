import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 创建浏览器数据源 } from './浏览器数据源.mjs';

const 当前目录 = path.dirname(fileURLToPath(import.meta.url));
const 配置路径 = path.join(当前目录, 'config.local.json');
const 状态路径 = path.join(当前目录, '状态.json');
const 日志路径 = path.join(当前目录, '日志', '运行.log');
let 数据源;

async function 读取JSON(文件路径, 默认值 = null) {
  try {
    return JSON.parse(await fs.readFile(文件路径, 'utf8'));
  } catch (错误) {
    if (错误.code === 'ENOENT') return 默认值;
    throw 错误;
  }
}

async function 写入JSON(文件路径, 数据) {
  const 临时路径 = `${文件路径}.tmp`;
  await fs.writeFile(临时路径, `${JSON.stringify(数据, null, 2)}\n`, 'utf8');
  await fs.rename(临时路径, 文件路径);
}

async function 记录(日志) {
  const 行 = `[${new Date().toISOString()}] ${日志}`;
  console.log(行);
  await fs.mkdir(path.dirname(日志路径), { recursive: true });
  await fs.appendFile(日志路径, `${行}\n`, 'utf8');
}

function 验证配置(配置) {
  for (const 字段 of ['TARGET_ACCOUNT', 'DINGTALK_WEBHOOK', 'DINGTALK_KEYWORD']) {
    if (!配置?.[字段]) throw new Error(`缺少配置：${字段}`);
  }
  if (!Number.isInteger(配置.POLL_INTERVAL_SECONDS) || 配置.POLL_INTERVAL_SECONDS < 60) {
    throw new Error('POLL_INTERVAL_SECONDS 必须是不小于 60 的整数');
  }
}

export function 筛选新推文(推文列表, 已见ID, 配置, 最晚发布时间 = 0) {
  const 已见 = new Set(已见ID);
  const 时间边界 = new Date(最晚发布时间 || 0).getTime();
  return 推文列表
    .filter((推文) => !已见.has(String(推文.id)))
    .filter((推文) => Number(推文.timestamp || 0) > 时间边界)
    .filter((推文) => 配置.INCLUDE_REPLIES || !推文.isReply)
    .filter((推文) => 配置.INCLUDE_RETWEETS || !推文.isRetweet)
    .sort((甲, 乙) => Number(甲.timestamp || 0) - Number(乙.timestamp || 0));
}

export function 构建钉钉内容(推文, 配置) {
  const 关键词 = 配置.DINGTALK_KEYWORD.trim();
  const 正文 = 推文.fullText || 推文.text || '(无文本内容)';
  const 链接 = 推文.permanentUrl || `https://x.com/${配置.TARGET_ACCOUNT}/status/${推文.id}`;
  const 时间 = 推文.timeParsed
    ? new Date(推文.timeParsed).toLocaleString('zh-CN', {
        timeZone: 配置.TIME_ZONE || 'Asia/Shanghai',
        hour12: false,
      })
    : '未知';

  return {
    msgtype: 'markdown',
    markdown: {
      title: `${关键词} @${配置.TARGET_ACCOUNT} 发布新推文`,
      text: `${关键词} 🐦 **@${配置.TARGET_ACCOUNT} 发布新推文**\n\n${正文}\n\n[点击查看原文](${链接})\n\n发布时间：${时间}`,
    },
    at: { isAtAll: false },
  };
}

function 构建Webhook地址(配置) {
  const 地址 = new URL(配置.DINGTALK_WEBHOOK);
  if (配置.DINGTALK_SECRET) {
    const 时间戳 = Date.now().toString();
    const 签名原文 = `${时间戳}\n${配置.DINGTALK_SECRET}`;
    const 签名 = crypto.createHmac('sha256', 配置.DINGTALK_SECRET).update(签名原文).digest('base64');
    地址.searchParams.set('timestamp', 时间戳);
    地址.searchParams.set('sign', 签名);
  }
  return 地址.toString();
}

export async function 发送钉钉(推文, 配置, fetch实现 = fetch) {
  const 响应 = await fetch实现(构建Webhook地址(配置), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(构建钉钉内容(推文, 配置)),
    signal: AbortSignal.timeout(15_000),
  });
  const 结果 = await 响应.json();
  if (!响应.ok || 结果.errcode !== 0) {
    throw new Error(`钉钉推送失败：HTTP ${响应.status}，${结果.errmsg || '未知错误'}`);
  }
}

async function 获取推文(配置) {
  if (!数据源) {
    await 记录('正在启动已登录的后台 X 浏览器');
    数据源 = await 创建浏览器数据源({ executablePath: 配置.CHROME_EXECUTABLE_PATH });
    await 记录('后台 X 浏览器启动成功');
  }
  return 数据源.获取推文(配置.TARGET_ACCOUNT, 配置.FETCH_LIMIT || 10);
}

async function 关闭数据源() {
  if (!数据源) return;
  const 待关闭 = 数据源;
  数据源 = null;
  await 待关闭.关闭();
}

export async function 执行一次() {
  const 配置 = await 读取JSON(配置路径);
  验证配置(配置);
  const 推文列表 = await 获取推文(配置);
  const 状态 = await 读取JSON(状态路径, null);

  if (!状态) {
    const 最晚发布时间 = Math.max(...推文列表.map((推文) => Number(推文.timestamp || 0)));
    await 写入JSON(状态路径, {
      targetAccount: 配置.TARGET_ACCOUNT,
      seenIds: 推文列表.map((推文) => String(推文.id)).slice(0, 200),
      lastPublishedAt: new Date(最晚发布时间).toISOString(),
      initializedAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    });
    await 记录(`已建立 @${配置.TARGET_ACCOUNT} 基线，共 ${推文列表.length} 条；不补发历史推文`);
    return { initialized: true, sent: 0, fetched: 推文列表.length };
  }

  if (!状态.lastPublishedAt) {
    const 最晚发布时间 = Math.max(...推文列表.map((推文) => Number(推文.timestamp || 0)));
    状态.lastPublishedAt = new Date(最晚发布时间).toISOString();
    状态.seenIds = [...new Set([
      ...推文列表.map((推文) => String(推文.id)),
      ...(状态.seenIds || []),
    ])].slice(0, 200);
    状态.lastCheckedAt = new Date().toISOString();
    await 写入JSON(状态路径, 状态);
    await 记录('状态已升级为“ID + 发布时间”双重防误报基线；本轮不推送');
    return { initialized: true, sent: 0, fetched: 推文列表.length };
  }

  const 新推文 = 筛选新推文(推文列表, 状态.seenIds || [], 配置, 状态.lastPublishedAt);
  for (const 推文 of 新推文) {
    await 发送钉钉(推文, 配置);
    状态.seenIds = [String(推文.id), ...(状态.seenIds || [])].slice(0, 200);
    await 写入JSON(状态路径, { ...状态, lastCheckedAt: new Date().toISOString() });
    await 记录(`已推送 ${推文.permanentUrl || 推文.id}`);
  }

  const 当前ID = 推文列表.map((推文) => String(推文.id));
  const 当前最晚时间 = Math.max(...推文列表.map((推文) => Number(推文.timestamp || 0)));
  状态.seenIds = [...new Set([...当前ID, ...(状态.seenIds || [])])].slice(0, 200);
  if (当前最晚时间 > new Date(状态.lastPublishedAt).getTime()) {
    状态.lastPublishedAt = new Date(当前最晚时间).toISOString();
  }
  状态.lastCheckedAt = new Date().toISOString();
  await 写入JSON(状态路径, 状态);
  await 记录(`检查完成：获取 ${推文列表.length} 条，新增 ${新推文.length} 条`);
  return { initialized: false, sent: 新推文.length, fetched: 推文列表.length };
}

async function 主程序() {
  const 仅一次 = process.argv.includes('--once');
  const 配置 = await 读取JSON(配置路径);
  验证配置(配置);

  try {
    do {
      try {
        await 执行一次();
      } catch (错误) {
        await 记录(`检查失败：${错误.message}`);
        await 关闭数据源().catch(() => {});
        if (仅一次) throw 错误;
      }
      if (!仅一次) await new Promise((完成) => setTimeout(完成, 配置.POLL_INTERVAL_SECONDS * 1000));
    } while (!仅一次);
  } finally {
    await 关闭数据源();
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  主程序().catch((错误) => {
    console.error(错误);
    process.exitCode = 1;
  });
}

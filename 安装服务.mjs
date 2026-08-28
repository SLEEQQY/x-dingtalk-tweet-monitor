import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const 项目目录 = path.dirname(fileURLToPath(import.meta.url));
const 服务名 = 'io.github.x-dingtalk-tweet-monitor';
const 用户编号 = process.getuid?.();
const 服务域 = `gui/${用户编号}`;
const 启动项目录 = path.join(os.homedir(), 'Library', 'LaunchAgents');
const Plist路径 = path.join(启动项目录, `${服务名}.plist`);

function XML转义(内容) {
  return 内容
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function 生成Plist() {
  const node路径 = XML转义(process.execPath);
  const 监控器路径 = XML转义(path.join(项目目录, '监控器.mjs'));
  const 工作目录 = XML转义(项目目录);
  const 日志目录 = XML转义(path.join(项目目录, '日志'));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${服务名}</string>
  <key>ProgramArguments</key><array><string>${node路径}</string><string>${监控器路径}</string></array>
  <key>WorkingDirectory</key><string>${工作目录}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>${日志目录}/launchd.out.log</string>
  <key>StandardErrorPath</key><string>${日志目录}/launchd.err.log</string>
</dict></plist>
`;
}

function 执行Launchctl(参数, 忽略错误 = false) {
  try {
    return execFileSync('launchctl', 参数, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (错误) {
    if (忽略错误) return '';
    throw new Error(错误.stderr?.trim() || 错误.message);
  }
}

if (process.platform !== 'darwin' || 用户编号 === undefined) {
  throw new Error('自动常驻安装目前只支持 macOS；其他系统可用 npm start 配合自己的进程管理器');
}

const 操作 = process.argv[2] || 'status';
if (操作 === 'install') {
  await fs.mkdir(启动项目录, { recursive: true });
  await fs.mkdir(path.join(项目目录, '日志'), { recursive: true });
  await fs.writeFile(Plist路径, 生成Plist(), { mode: 0o644 });
  执行Launchctl(['bootout', 服务域, Plist路径], true);
  执行Launchctl(['bootstrap', 服务域, Plist路径]);
  执行Launchctl(['kickstart', '-k', `${服务域}/${服务名}`]);
  console.log(`已安装并启动：${服务名}`);
} else if (操作 === 'uninstall') {
  执行Launchctl(['bootout', 服务域, Plist路径], true);
  await fs.rm(Plist路径, { force: true });
  console.log(`已卸载：${服务名}`);
} else if (操作 === 'status') {
  process.stdout.write(执行Launchctl(['print', `${服务域}/${服务名}`]));
} else {
  throw new Error('用法：node 安装服务.mjs install|status|uninstall');
}

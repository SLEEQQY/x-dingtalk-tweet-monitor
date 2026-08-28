import test from 'node:test';
import assert from 'node:assert/strict';

import { 构建钉钉内容, 筛选新推文 } from '../监控器.mjs';

const 配置 = {
  TARGET_ACCOUNT: 'example_account',
  INCLUDE_REPLIES: false,
  INCLUDE_RETWEETS: false,
  DINGTALK_KEYWORD: 'DT',
};

test('只返回未见过的原创推文，并按时间正序排列', () => {
  const 推文 = [
    { id: '3', timestamp: 3, isReply: false, isRetweet: false },
    { id: '1', timestamp: 1, isReply: false, isRetweet: false },
    { id: '2', timestamp: 2, isReply: true, isRetweet: false },
    { id: '4', timestamp: 4, isReply: false, isRetweet: true },
  ];
  assert.deepEqual(筛选新推文(推文, ['1'], 配置).map((项目) => 项目.id), ['3']);
});

test('动态出现的旧推文即使 ID 未见过也不会误报', () => {
  const 推文 = [
    { id: 'old', timestamp: 100, isReply: false, isRetweet: false },
    { id: 'new', timestamp: 301, isReply: false, isRetweet: false },
  ];
  assert.deepEqual(
    筛选新推文(推文, [], 配置, new Date(300).toISOString()).map((项目) =>项目.id),
    ['new'],
  );
});

test('钉钉内容包含安全关键词、正文和原文链接', () => {
  const 内容 = 构建钉钉内容({
    id: '123',
    fullText: '测试推文',
    timeParsed: '2026-08-10T12:00:00.000Z',
    permanentUrl: 'https://x.com/example_account/status/123',
  }, 配置);
  assert.match(内容.markdown.text, /DT/);
  assert.match(内容.markdown.text, /测试推文/);
  assert.match(内容.markdown.text, /status\/123/);
});

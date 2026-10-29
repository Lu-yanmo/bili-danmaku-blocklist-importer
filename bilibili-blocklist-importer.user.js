// ==UserScript==
// @name         B站弹幕屏蔽词一键导入
// @namespace    Lu_yamo.blocklist.importer
// @version      1.0.0
// @description  在 bilibili.com 任意页面打开面板，粘贴文本/选择 txt·xml 文件/使用内置词库，批量导入弹幕屏蔽词到账号云端（关键词+正则，去重、限速、进度日志），并支持导出备份。导入后手机 App 同账号同步即生效。
// @author       Lu_yamo
// @match        *://*.bilibili.com/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @license      MIT
// @homepageURL  https://github.com/Lu-yanmo/bili-danmaku-blocklist-importer
// @supportURL   https://github.com/Lu-yanmo/bili-danmaku-blocklist-importer/issues
// @source       https://github.com/Lu-yanmo/bili-danmaku-blocklist-importer
// ==/UserScript==

(() => {
  'use strict';

  // ─────────────────────────────────────────────
  // 内置词库（与 bilibili-blocklist 同源，2026-10 整理）
  // 格式：每行一条；r= 前缀表示正则；# 开头为注释
  // ─────────────────────────────────────────────
  const BUILTIN_LIST = `
# ── 一、广告引流 ──
公众号
加微信
加VX
加QQ
加群
进群
粉丝群
扫码
二维码
刷单
兼职
网赚
返利
优惠券
领红包
代购
私聊我
看主页
主页详聊
日入过万
福利姬
招代理
接推广
# ── 二、引战对喷 ──
无脑吹
无脑黑
孝子
急了
你急
破防
小丑
杠精
云玩家
反串
# ── 三、低质刷屏 ──
到此一游
路过打卡
打卡
前排
纯路人
刷到这
火钳刘明
完结撒花
失踪人口
下次一定
一键三连
求三连
求关注
求点赞
先赞后看
# ── 四、正则 ──
r=1[3-9]\\d{9}
r=https?://
r=www\\.
r=^[\\d\\s.,:;!?~\\-—…、。，：；？！～"']+$
r=^(.)\\1{4,}$
r=^\\d{1,3}[:：]\\d{2}(:\\d{2})?$
r=^[hH]{4,}$
r=[2467]{5,}
r=[vV]信|薇信|威芯
`;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/bili_jct=([^;]+)/) || [])[1] || '';

  // ─────────────────────────────────────────────
  // 解析导入文本：txt（# 注释、r= 正则）或 xml（<item> 标签）
  // 返回 [{ v, type }]；xml 中 enabled="false" 的词条跳过并计数
  // ─────────────────────────────────────────────
  function parseInput(text) {
    const out = [];
    let skippedDisabled = 0;
    const trimmed = text.trim();
    if (trimmed.startsWith('<')) {
      const doc = new DOMParser().parseFromString(trimmed, 'text/xml');
      const items = doc.querySelectorAll('item');
      for (const it of items) {
        const enabled = it.getAttribute('enabled') !== 'false';
        let v = (it.textContent || '').trim();
        let type = 0;
        if (v.startsWith('r=')) { type = 1; v = v.slice(2); }
        else if (v.startsWith('t=')) { type = 0; v = v.slice(2); }
        else if (v.startsWith('u=')) { continue; } // 用户屏蔽不在本脚本范围
        if (!v) continue;
        if (!enabled) { skippedDisabled++; continue; }
        out.push({ v, type });
      }
    } else {
      for (let line of text.split(/\r?\n/)) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        let type = 0;
        if (line.startsWith('r=')) { type = 1; line = line.slice(2).trim(); }
        if (!line) continue;
        out.push({ v: line, type });
      }
    }
    return { rules: out, skippedDisabled };
  }

  // ─────────────────────────────────────────────
  // 云端接口
  // ─────────────────────────────────────────────
  async function fetchExist() {
    const set = new Set();
    try {
      const res = await fetch('https://api.bilibili.com/x/dm/filter/user/list', {
        method: 'GET', credentials: 'include',
      });
      const j = await res.json();
      if (j.code === 0 && j.data) {
        for (const seg of [j.data.keyword, j.data.regex]) {
          for (const it of (seg || [])) set.add(String(it.filter).trim());
        }
      }
    } catch (e) { log('⚠ 拉取已有列表失败：' + e.message); }
    return set;
  }

  async function addRule(v, type) {
    const body = new URLSearchParams({ filter: v, type: String(type), csrf: csrf() });
    const res = await fetch('https://api.bilibili.com/x/dm/filter/user/add', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return res.json();
  }

  async function exportBackup() {
    try {
      const res = await fetch('https://api.bilibili.com/x/dm/filter/user/list', {
        method: 'GET', credentials: 'include',
      });
      const j = await res.json();
      if (j.code !== 0) { log('❌ 导出失败：' + (j.message || j.code)); return; }
      const lines = [];
      for (const it of (j.data.keyword || [])) lines.push(it.filter);
      for (const it of (j.data.regex || [])) lines.push('r=' + it.filter);
      const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bilibili-blocklist-backup.txt';
      a.click();
      URL.revokeObjectURL(a.href);
      log(`✅ 已导出 ${lines.length} 条备份（r= 前缀为正则）`);
    } catch (e) { log('❌ 导出异常：' + e.message); }
  }

  // ─────────────────────────────────────────────
  // 主流程：导入
  // ─────────────────────────────────────────────
  let importing = false;
  async function runImport(text) {
    if (importing) { log('⏳ 已有导入在进行中，请稍候'); return; }
    if (!csrf()) { log('❌ 未检测到登录态（cookie 无 bili_jct），请先登录'); return; }
    const { rules, skippedDisabled } = parseInput(text);
    if (!rules.length) { log('❌ 没解析到任何词条（# 注释行会被跳过）'); return; }
    importing = true;
    log(`解析到 ${rules.length} 条词条` +
        (skippedDisabled ? `，另有 ${skippedDisabled} 条 XML 关闭状态词条已跳过` : '') + '，开始导入…');
    const exist = await fetchExist();
    let ok = 0, dup = 0, fail = 0;
    const failed = [];
    for (let i = 0; i < rules.length; i++) {
      const { v, type } = rules[i];
      if (exist.has(v)) { dup++; continue; }
      try {
        const j = await addRule(v, type);
        if (j.code === 0) { ok++; log(`[${i + 1}/${rules.length}] ✅ ${v}`); }
        else { fail++; failed.push(`${v}（code=${j.code} ${j.message}）`); log(`[${i + 1}/${rules.length}] ❌ ${v}：${j.message || j.code}`); }
      } catch (e) {
        fail++; failed.push(`${v}（${e.message}）`); log(`[${i + 1}/${rules.length}] ❌ ${v}：${e.message}`);
      }
      await sleep(350); // 限速防风控
    }
    log('══════════ 导入完成 ══════════');
    log(`✅ 新增 ${ok} ｜ 重复跳过 ${dup} ｜ 失败 ${fail}`);
    if (failed.length) log('失败的稍等片刻重跑一次即可续传（已存在的会自动跳过）。');
    log('提示：手机 App → 弹幕设置 → 屏蔽管理 → 同步，拉取云端列表即生效。');
    importing = false;
  }

  // ─────────────────────────────────────────────
  // UI 面板
  // ─────────────────────────────────────────────
  let panel = null;

  function log(msg) {
    const box = document.getElementById('muyan-bl-log');
    if (!box) { console.log('[屏蔽词导入] ' + msg); return; }
    const div = document.createElement('div');
    div.textContent = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
    while (box.childElementCount > 300) box.removeChild(box.firstChild);
  }

  function openPanel() {
    if (panel) { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'; return; }
    panel = document.createElement('div');
    panel.id = 'muyan-bl-panel';
    panel.innerHTML = `
      <style>
        #muyan-bl-panel{position:fixed;top:64px;right:16px;width:380px;max-height:80vh;
          background:#fff;color:#18191c;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.25);
          z-index:2147483647;display:flex;flex-direction:column;padding:14px;gap:8px;
          font:13px/1.6 "Microsoft YaHei",sans-serif;}
        #muyan-bl-panel h3{margin:0;font-size:14px;display:flex;justify-content:space-between;align-items:center;}
        #muyan-bl-panel a{color:#00a1d6;cursor:pointer;text-decoration:none;font-weight:normal;font-size:12px;}
        #muyan-bl-text{width:100%;height:160px;box-sizing:border-box;resize:vertical;
          border:1px solid #e3e5e7;border-radius:6px;padding:6px;font:12px/1.5 Consolas,monospace;}
        #muyan-bl-btns{display:flex;gap:6px;flex-wrap:wrap;}
        #muyan-bl-btns button{flex:1;border:none;border-radius:6px;padding:7px 10px;cursor:pointer;
          font-size:13px;background:#00a1d6;color:#fff;}
        #muyan-bl-btns button.ghost{background:#f1f2f3;color:#18191c;}
        #muyan-bl-log{flex:1;overflow-y:auto;background:#f6f7f8;border-radius:6px;padding:6px 8px;
          font:12px/1.6 Consolas,monospace;min-height:80px;white-space:pre-wrap;word-break:break-all;}
      </style>
      <h3>弹幕屏蔽词导入 <a id="muyan-bl-close">收起</a></h3>
      <textarea id="muyan-bl-text" placeholder="每行一个词条；r= 开头为正则；# 开头为注释&#10;也可直接粘贴 XML 屏蔽词文件内容"></textarea>
      <div id="muyan-bl-btns">
        <button id="muyan-bl-go">导入以上内容</button>
        <button id="muyan-bl-builtin" class="ghost">内置词库</button>
        <button id="muyan-bl-file" class="ghost">选文件(.txt/.xml)</button>
        <button id="muyan-bl-exp" class="ghost">导出备份</button>
      </div>
      <input type="file" id="muyan-bl-input" accept=".txt,.xml,.json" style="display:none">
      <div id="muyan-bl-log"></div>`;
    document.documentElement.appendChild(panel);

    panel.querySelector('#muyan-bl-close').onclick = () => (panel.style.display = 'none');
    panel.querySelector('#muyan-bl-go').onclick = () => runImport(panel.querySelector('#muyan-bl-text').value);
    panel.querySelector('#muyan-bl-builtin').onclick = () => {
      panel.querySelector('#muyan-bl-text').value = BUILTIN_LIST;
      runImport(BUILTIN_LIST);
    };
    panel.querySelector('#muyan-bl-file').onclick = () => panel.querySelector('#muyan-bl-input').click();
    panel.querySelector('#muyan-bl-exp').onclick = exportBackup;
    panel.querySelector('#muyan-bl-input').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result);
        panel.querySelector('#muyan-bl-text').value = text;
        runImport(text);
      };
      reader.readAsText(f, 'utf-8');
      e.target.value = '';
    };
    log('面板就绪。粘贴词条/选文件/用内置词库，然后点导入。');
  }

  GM_registerMenuCommand('屏蔽词导入面板', openPanel);

  // 首次进入自动挂一个小角标，方便找不到菜单的用户
  const badge = document.createElement('div');
  badge.textContent = '屏蔽词';
  badge.title = '打开弹幕屏蔽词导入面板';
  badge.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#00a1d6;color:#fff;'
    + 'padding:6px 10px;border-radius:16px;font:12px "Microsoft YaHei",sans-serif;cursor:pointer;'
    + 'opacity:.6;box-shadow:0 2px 8px rgba(0,0,0,.2);';
  badge.onclick = openPanel;
  if (document.readyState === 'complete') document.documentElement.appendChild(badge);
  else window.addEventListener('load', () => document.documentElement.appendChild(badge));
})();

// ==UserScript==
// @name         B站弹幕屏蔽词一键导入
// @namespace    Lu_yamo.blocklist.importer
// @version      1.3.0
// @description  在 bilibili.com 任意页面打开面板，按分类勾选/粘贴文本/选择 txt·xml 文件，批量导入弹幕屏蔽词到账号云端（关键词+正则，去重、限速、进度日志），并支持导出备份。导入后手机 App 同账号同步即生效。
// @author       Lu_yamo
// @match        *://*.bilibili.com/*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @license      MIT
// @icon         https://raw.githubusercontent.com/Lu-yanmo/bili-danmaku-blocklist-importer/main/assets/bilibili-icon.ico
// @homepageURL  https://github.com/Lu-yanmo/bili-danmaku-blocklist-importer
// @supportURL   https://github.com/Lu-yanmo/bili-danmaku-blocklist-importer/issues
// @source       https://github.com/Lu-yanmo/bili-danmaku-blocklist-importer
// ==/UserScript==

(() => {
  'use strict';

  // ─────────────────────────────────────────────
  // 内置词库（2026-10-29 扩充版，与 blocklist.txt 同源）
  // type: 0 = 关键词（包含即命中），1 = 正则
  // on: 面板中默认是否勾选
  // ─────────────────────────────────────────────
  const CATEGORIES = [
    {
      key: 'ads', label: '广告引流', on: true,
      words: [
        ['公众号', 0], ['加微信', 0], ['加VX', 0], ['加QQ', 0], ['加群', 0],
        ['进群', 0], ['粉丝群', 0], ['扫码', 0], ['二维码', 0], ['刷单', 0],
        ['兼职', 0], ['网赚', 0], ['返利', 0], ['优惠券', 0], ['领红包', 0],
        ['代购', 0], ['私聊我', 0], ['看主页', 0], ['主页详聊', 0], ['日入过万', 0],
        ['福利姬', 0], ['招代理', 0], ['接推广', 0], ['免费领', 0], ['免费送', 0],
        ['零元购', 0], ['九块九', 0], ['9块9', 0], ['一分钱', 0], ['日结', 0],
        ['一单一结', 0], ['代写', 0], ['代做', 0], ['接单', 0], ['引流', 0],
        ['变现', 0], ['获客', 0], ['全国空降', 0], ['同城约', 0], ['番号', 0],
        ['资源群', 0], ['扣群', 0], ['扣裙', 0], ['砍一刀', 0], ['拼单', 0],
        ['秒杀', 0], ['低价出', 0],
      ],
    },
    {
      key: 'flame', label: '引战对喷', on: true,
      words: [
        ['无脑吹', 0], ['无脑黑', 0], ['孝子', 0], ['急了', 0], ['你急', 0],
        ['破防', 0], ['小丑', 0], ['杠精', 0], ['云玩家', 0], ['反串', 0],
        ['傻逼', 0], ['脑残', 0], ['弱智', 0], ['智障', 0], ['低能', 0],
        ['白痴', 0], ['蠢货', 0], ['废物', 0], ['舔狗', 0], ['跪舔', 0],
        ['就这', 0], ['不过如此', 0], ['nmsl', 0], ['鼠人', 0], ['割韭菜', 0],
        ['下头', 0], ['拉踩', 0], ['人渣', 0], ['扑街', 0], ['撕逼', 0],
        ['妈卖批', 0], ['走狗', 0],
        ['不看就?(滚|右上角|叉)', 1],                                // 不看滚 / 不看右上角
      ],
    },
    {
      key: 'spam', label: '低质刷屏', on: true,
      words: [
        ['到此一游', 0], ['路过打卡', 0], ['打卡', 0], ['前排', 0], ['纯路人', 0],
        ['刷到这', 0], ['火钳刘明', 0], ['完结撒花', 0], ['失踪人口', 0],
        ['下次一定', 0], ['一键三连', 0], ['求三连', 0], ['求关注', 0],
        ['求点赞', 0], ['先赞后看', 0], ['火前留名', 0], ['占楼', 0], ['沙发', 0],
        ['考古', 0], ['补票', 0], ['蹲后续', 0], ['蹲一个', 0], ['我来晚了', 0],
        ['护体', 0], ['结界', 0], ['百万播放', 0], ['热乎', 0], ['先投再看', 0],
      ],
    },
    {
      key: 'regex', label: '结构化正则', on: true,
      words: [
        ['1[3-9]\\d{9}', 1],                                        // 手机号
        ['https?://', 1],                                           // 链接
        ['www\\.', 1],                                              // 链接
        ['[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', 1],     // 邮箱
        ['(\\+|＋)\\s*[vVＶ]', 1],                                  // +V 加人变体
        ['^\\d{9,}$', 1],                                           // QQ群号等长数字
        ['^\\d{1,3}[:：]\\d{2}(:\\d{2})?$', 1],                     // 时间戳刷屏
        ['^第[0-9一二三四五六七八九十百]+[名个楼]?$', 1],            // 抢楼
        ['^[\\d\\s.,:;!?~\\-—…、。，：；？！～"\']+$', 1],           // 纯数字标点
        ['^(.)\\1{4,}$', 1],                                        // 单字重复5次以上
        ['^[hH]{4,}$', 1],                                          // hhhh 刷屏
        ['[12467]{5,}', 1],                                         // 233/666 连打5位以上
        ['[?？]{3,}|[!！]{3,}', 1],                                 // 连续问号/感叹号刷屏
        ['(.)\\1{9,}', 1],                                          // 任意字符连打10次以上
        ['[vV]信|薇信|威芯', 1],                                    // 微信变体
        // —— 以下句式正则自社区词库筛选吸收（Griklit / sunbertrs / jnxyp），均为锚定匹配 ——
        ['^[0-9一二三四五六七八九十]+(秒|秒钟|分|分钟|时|小时|天|月|年)前?$', 1],   // 「三小时前」新视频玩梗
        ['^来早了.?$', 1], ['^最[早晚]的一[次集].?$', 1],           // 来早了 / 最早的一次
        ['^(霸占)?空[屏瓶]$', 1], ['^刚刚[!！]*$', 1],              // 空屏 / 刚刚
        ['^暂停看.字$', 1], ['^(狗头)?保[护護]$', 1],               // 暂停看字幕 / 保护
        ['^借[你您]吉言$', 1], ['^[许还][愿原].{0,8}$', 1],         // 借你吉言 / 许愿
        ['^接+$', 1], ['^吸+(欧气)?$', 1],                          // 接接接 / 吸欧气
        ['^您[?？]$', 1], ['^(你品)?.?你细?品$', 1],                // 您？ / 你品你细品
        ['(弹幕.*复制)|(复制.*弹幕)', 1],                           // 复制弹幕迷信链
      ],
    },
    {
      key: 'sentiment', label: '高频梗/情怀刷屏（高误伤）', on: false,
      words: [
        ['前方高能', 0], ['高能', 0], ['空耳', 0], ['泪目', 0], ['爷青回', 0],
        ['爷青结', 0], ['DNA动了', 0], ['awsl', 0], ['名场面', 0], ['有内味了', 0],
        ['好活', 0], ['广告', 0], ['推广', 0], ['恰烂钱', 0], ['有生之年', 0],
        ['倍速', 0], ['充值', 0], ['充钱', 0],
      ],
    },
    {
      key: 'politics', label: '时政引战（高误伤）', on: false,
      words: [
        ['1450', 0], ['50万', 0], ['50w', 0], ['来电了', 0], ['遥遥领先', 0],
        ['小粉红', 0], ['公知', 0], ['棒子', 0], ['阿三', 0], ['鬼子', 0],
      ],
    },
    {
      key: 'memes', label: '烂梗（看口味）', on: false,
      words: [
        ['小黑子', 0], ['鸡脚', 0], ['你干嘛', 0], ['只因', 0], ['2年半', 0],
        ['泰裤辣', 0], ['鸽鸽', 0], ['乐子人', 0], ['鼠鼠', 0], ['典中典', 0],
        ['绷不住了', 0], ['笑嘻了', 0], ['奥利给', 0], ['栓Q', 0], ['退退退', 0],
        ['绝绝子', 0], ['yyds', 0], ['破大防', 0], ['蚌埠住了', 0], ['芜湖', 0],
        ['什么档次', 0], ['老登', 0], ['逆天', 0], ['抽象', 0],
        ['懂哥', 0], ['神人', 0], ['狗叫', 0], ['怎么你了', 0], ['含金量', 0],
        ['今夕是何年', 0], ['太优雅了', 0], ['人机', 0], ['文艺复兴', 0],
        ['啊对对对', 0], ['114514', 0], ['1919810', 0], ['homo', 0],
      ],
    },
    {
      key: 'fandom', label: '饭圈控评（看口味）', on: false,
      words: [
        ['控评', 0], ['打投', 0], ['应援', 0], ['塌房', 0], ['唯粉', 0],
        ['做数据', 0], ['出道', 0], ['撕番', 0], ['xxs', 0],
      ],
    },
    {
      key: 'spoilers', label: '剧透保护（看口味）', on: false,
      words: [
        ['剧透', 0], ['反向剧透', 0], ['大结局', 0], ['烂尾', 0], ['提前看', 0],
      ],
    },
    {
      key: 'riskyRegex', label: '争议正则（高误伤）', on: false,
      words: [
        ['^[哈嘿呵]{4,}$', 1],                                  // 哈哈哈类纯笑
        ["^[a-zA-Z\\s!?.,;:'\\-]{6,}$", 1],                     // 纯英文弹幕
        ['^.{1,2}$', 1],                                        // 1~2字超短弹幕
        ['啊{3,}', 1],                                          // 啊啊啊
        ['[典急孝乐绷]', 1],                                    // ⚠ 单字命中：经典/着急/孝顺全拦，慎用
      ],
    },
  ];

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
  // 主流程：导入（rules: [{v, type}]）
  // ─────────────────────────────────────────────
  let importing = false;
  async function importRules(rules, title) {
    if (importing) { log('⏳ 已有导入在进行中，请稍候'); return; }
    if (!csrf()) { log('❌ 未检测到登录态（cookie 无 bili_jct），请先登录'); return; }
    if (!rules.length) { log('❌ 没有可导入的词条'); return; }
    importing = true;
    log(`【${title}】共 ${rules.length} 条词条，开始导入…`);
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

    // 动态生成分类勾选区
    const catHtml = CATEGORIES.map((c, i) => {
      const n = c.words.length;
      return `<label class="muyan-bl-cat" title="${n} 条词条">`
        + `<input type="checkbox" data-cat="${i}" ${c.on ? 'checked' : ''}> ${c.label} (${n})</label>`;
    }).join('');

    panel.innerHTML = `
      <style>
        #muyan-bl-panel{position:fixed;top:64px;right:16px;width:400px;max-height:85vh;
          background:#fff;color:#18191c;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,.25);
          z-index:2147483647;display:flex;flex-direction:column;padding:14px;gap:8px;
          font:13px/1.6 "Microsoft YaHei",sans-serif;}
        #muyan-bl-panel h3{margin:0;font-size:14px;display:flex;justify-content:space-between;align-items:center;}
        #muyan-bl-panel a{color:#00a1d6;cursor:pointer;text-decoration:none;font-weight:normal;font-size:12px;}
        #muyan-bl-cats{display:flex;flex-wrap:wrap;gap:4px 10px;background:#f6f7f8;border-radius:6px;padding:8px;}
        .muyan-bl-cat{display:inline-flex;align-items:center;gap:4px;cursor:pointer;font-size:12px;user-select:none;}
        .muyan-bl-cat input{accent-color:#00a1d6;}
        #muyan-bl-text{width:100%;height:110px;box-sizing:border-box;resize:vertical;
          border:1px solid #e3e5e7;border-radius:6px;padding:6px;font:12px/1.5 Consolas,monospace;}
        #muyan-bl-btns{display:flex;gap:6px;flex-wrap:wrap;}
        #muyan-bl-btns button{flex:1;border:none;border-radius:6px;padding:7px 10px;cursor:pointer;
          font-size:13px;background:#00a1d6;color:#fff;white-space:nowrap;}
        #muyan-bl-btns button.ghost{background:#f1f2f3;color:#18191c;}
        #muyan-bl-log{flex:1;overflow-y:auto;background:#f6f7f8;border-radius:6px;padding:6px 8px;
          font:12px/1.6 Consolas,monospace;min-height:80px;white-space:pre-wrap;word-break:break-all;}
      </style>
      <h3><img src="/favicon.ico" alt="" style="width:16px;height:16px;vertical-align:-3px;margin-right:6px;">弹幕屏蔽词导入 <a id="muyan-bl-close">收起</a></h3>
      <div>
        <div style="font-size:12px;color:#61666d;margin-bottom:4px;">按分类导入内置词库：</div>
        <div id="muyan-bl-cats">${catHtml}</div>
      </div>
      <div id="muyan-bl-btns">
        <button id="muyan-bl-go">导入勾选分类</button>
        <button id="muyan-bl-file" class="ghost">选文件(.txt/.xml)</button>
        <button id="muyan-bl-exp" class="ghost">导出备份</button>
      </div>
      <textarea id="muyan-bl-text" placeholder="自定义导入（可选）：每行一个词条；r= 开头为正则；# 开头为注释；也可直接粘贴 XML 屏蔽词文件内容"></textarea>
      <div id="muyan-bl-btns2" style="display:flex;gap:6px;">
        <button id="muyan-bl-custom" class="ghost" style="flex:1;border:none;border-radius:6px;padding:7px 10px;cursor:pointer;font-size:13px;color:#18191c;">导入以上自定义内容</button>
      </div>
      <input type="file" id="muyan-bl-input" accept=".txt,.xml,.json" style="display:none">
      <div id="muyan-bl-log"></div>`;
    document.documentElement.appendChild(panel);

    panel.querySelector('#muyan-bl-close').onclick = () => (panel.style.display = 'none');
    panel.querySelector('#muyan-bl-go').onclick = () => {
      const rules = [];
      const picked = [];
      panel.querySelectorAll('#muyan-bl-cats input:checked').forEach((cb) => {
        const c = CATEGORIES[Number(cb.dataset.cat)];
        picked.push(c.label);
        rules.push(...c.words.map(([v, type]) => ({ v, type })));
      });
      if (!picked.length) { log('❌ 请先勾选至少一个分类'); return; }
      log('已选分类：' + picked.join('、'));
      importRules(rules, '内置词库·' + picked.length + ' 个分类');
    };
    panel.querySelector('#muyan-bl-custom').onclick = () => {
      const text = panel.querySelector('#muyan-bl-text').value;
      const { rules, skippedDisabled } = parseInput(text);
      if (skippedDisabled) log(`⏭ XML 中 ${skippedDisabled} 条关闭状态词条已跳过`);
      importRules(rules, '自定义内容');
    };
    panel.querySelector('#muyan-bl-file').onclick = () => panel.querySelector('#muyan-bl-input').click();
    panel.querySelector('#muyan-bl-exp').onclick = exportBackup;
    panel.querySelector('#muyan-bl-input').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        panel.querySelector('#muyan-bl-text').value = String(reader.result);
        panel.querySelector('#muyan-bl-custom').click();
      };
      reader.readAsText(f, 'utf-8');
      e.target.value = '';
    };
    const total = CATEGORIES.reduce((s, c) => s + c.words.length, 0);
    log(`面板就绪。内置词库共 ${total} 条（7 个分类，默认勾选 4 个高置信分类），按需勾选后点导入。`);
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

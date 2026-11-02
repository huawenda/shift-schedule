/* 昼夜 · 重新设计样张：数据与渲染
 * 只做视觉评审用：数据与 demo 同源，不接业务层。 */

const DAY = 86400000;
const START = Date.UTC(2026, 9, 20);   // 10-20
const ANCHOR = Date.UTC(2026, 5, 7);   // 周期锚点
const LEADING = new Date(START).getUTCDay(); // 10-20 是周二 → 补 2 格

const SHIFTS = {
  '4F': '夜夜夜夜休休夜夜夜夜休休白白白白休休白白白白休休',
  '4G': '休夜夜夜夜休休夜夜夜夜休休白白白白休休白白白白休',
  '4H': '休休夜夜夜夜休休夜夜夜夜休休白白白白休休白白白白',
  '4I': '白休休夜夜夜夜休休夜夜夜夜休休白白白白休休白白白',
  '4J': '白白休休夜夜夜夜休休夜夜夜夜休休白白白白休休白白',
  '4K': '白白白休休夜夜夜夜休休夜夜夜夜休休白白白白休休白',
  '4R': '白白白白休休白白白白休休夜夜夜夜休休夜夜夜夜休休',
  '4S': '休白白白白休休白白白白休休夜夜夜夜休休夜夜夜夜休',
  '4T': '休休白白白白休休白白白白休休夜夜夜夜休休夜夜夜夜',
  '4U': '夜休休白白白白休休白白白白休休夜夜夜夜休休夜夜夜',
  '4V': '夜夜休休白白白白休休白白白白休休夜夜夜夜休休夜夜',
  '4W': '夜夜夜休休白白白白休休白白白白休休夜夜夜夜休休夜',
  '4X': '夜夜夜夜休休白白白白休休白白白白休休夜夜夜夜休休'
};
const MEMBERS = [
  ['华文达', '4F'], ['张舒棋', '4G'], ['陈泳智', '4H'], ['韩义博', '4I'], ['段志彬', '4J'],
  ['余昌耿', '4K'], ['张涛', '4R'], ['谢懋', '4S'], ['农伟俊', '4T'], ['帅长安', '4U'],
  ['林泽勇', '4V'], ['陈家辉', '4W'], ['张增全', '4X']
];

const TO_FULL = { 白: '白班', 夜: '夜班', 休: '休息' };
const SHORT = { 白班: '白', 夜班: '夜', 休息: '休', 白特: '特', 夜特: '特', 事假: '假' };
const TONE = { 白班: 'day', 夜班: 'night', 休息: 'rest', 白特: 'dayx', 夜特: 'nightx', 事假: 'leave' };
const OT = { '11-01': '+2', '11-03': '+2', '11-05': '+3', '11-11': '+1.5', '11-16': '+10' };
const LEGAL = new Set(['11-05', '11-06']);
const CHANGES = { '11-12': '事假', '11-16': '白特', '11-06': '休息' };

function keyOf(date) {
  return String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
}

function shiftOf(pattern, date) {
  const text = SHIFTS[pattern] || '';
  const index = ((Math.round((date.getTime() - ANCHOR) / DAY) % 24) + 24) % 24;
  return TO_FULL[text[index]] || '休息';
}

function cellOf(date, inPeriod) {
  const key = keyOf(date);
  const shift = inPeriod && CHANGES[key] ? CHANGES[key] : shiftOf('4F', date);
  return {
    key, day: key.slice(3), inPeriod, shift,
    short: SHORT[shift], tone: TONE[shift],
    today: key === '11-01',
    ot: inPeriod ? (OT[key] || '') : '',
    legal: inPeriod && LEGAL.has(key)
  };
}

const CELLS = [];
for (let i = 0; i < 35; i += 1) {
  CELLS.push(cellOf(new Date(START + (i - LEADING) * DAY), i >= LEADING && i < LEADING + 31));
}

function calendar() {
  const grid = CELLS.map(c => `<div class="cell ${c.inPeriod ? '' : 'out'} ${c.today ? 'today' : ''}">
      <span class="num">${c.day}</span>
      <span class="sq t-${c.tone}">${c.short}</span>
      ${c.ot ? `<span class="ot">${c.ot}</span>` : ''}
    </div>`).join('');

  return `<div class="cal">
    <div class="month"><span class="step">‹</span><b>2026 年 11 月</b><span class="step">›</span></div>
    <div class="range">10.20 — 11.19 · 31 DAYS</div>
    <div class="today">
      <div class="t-label"><span>今天 · 11/01 · 周日</span><span>20:00 — 08:00</span></div>
      <div class="t-main"><span class="t-shift">夜班</span><span class="t-chip">+2h 加班</span></div>
      <div class="t-foot">1 项待办</div>
    </div>
    <div class="weekdays"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
    <div class="grid">${grid}</div>
    <div class="foot">
      <div class="legend">
        <span class="lg"><i style="background:var(--day-bg)"></i>白班</span>
        <span class="lg"><i style="background:var(--night-bg)"></i>夜班</span>
        <span class="lg"><i style="background:var(--rest-bg)"></i>休息</span>
        <span class="lg"><i style="background:var(--accent)"></i>加班</span>
      </div>
      <div class="stats">
        <div class="stat"><b>18</b><span>出勤</span></div>
        <div class="stat"><b>18.5</b><span>加班</span></div>
        <div class="stat"><b>4</b><span>待办</span></div>
      </div>
    </div>
  </div>`;
}

function matrix() {
  const head = [];
  for (let i = 0; i < 31; i += 1) {
    const d = new Date(START + i * DAY);
    const today = keyOf(d) === '11-01';
    head.push(`<div class="d-cell ${today ? 'today' : ''}"><span>${String(d.getUTCDate()).padStart(2, '0')}</span><span>${'日一二三四五六'[d.getUTCDay()]}</span></div>`);
  }

  const rows = MEMBERS.slice(0, 10).map((member, rowIndex) => {
    const pills = [];
    for (let i = 0; i < 31; i += 1) {
      const d = new Date(START + i * DAY);
      const shift = shiftOf(member[1], d);
      pills.push(`<div class="pill-cell"><span class="pill sq t-${TONE[shift]}">${SHORT[shift]}</span></div>`);
    }
    return `<div class="d-row">${pills.join('')}</div>`;
  }).join('');

  const names = MEMBERS.slice(0, 10).map((member, index) => `
    <div class="nm"><b>${member[0]}${index === 0 ? '<span class="self">本人</span>' : ''}</b>
    <span>${member[1]} · PNP</span></div>`).join('');

  return `<div class="mx">
    <div class="mx-sum">
      <div><b>8</b><span>白班</span></div><div><b>3</b><span>夜班</span></div><div><b>2</b><span>休息</span></div>
    </div>
    <div class="mx-body">
      <div class="names"><div class="nm-head"></div>${names}</div>
      <div class="days">
        <div class="d-inner">
          <div class="d-head">${head.join('')}</div>
          ${rows}
        </div>
        <div class="fade"></div>
      </div>
    </div>
  </div>`;
}

function settings() {
  const row = (title, sub, value) => `<div class="row2">
    <div class="r-main"><span class="r-title">${title}</span>${sub ? `<span class="r-sub">${sub}</span>` : ''}</div>
    ${value ? `<span class="r-value">${value}</span>` : '<span class="r-arrow">›</span>'}
  </div>`;

  return `<div class="st">
    <div class="me">
      <span class="mono-badge">华</span>
      <div><div class="n">华文达</div><div class="s">4F · PNP · 本人</div></div>
    </div>
    <div class="group">
      <div class="g-head"><span class="g-title">SALARY</span><span class="g-note">每月固定</span></div>
      <div class="rows">
        ${row('月度应发', '基本 3982 · 绩效 1300 · 岗位 1000')}
        ${row('社保公积金', '每月个人缴纳 1600')}
      </div>
    </div>
    <div class="group">
      <div class="g-head"><span class="g-title">ROSTER</span><span class="g-note">13 人 · 14 条班序</span></div>
      <div class="rows">${row('成员与班序', '增删成员、编辑 24 天循环')}</div>
    </div>
    <div class="group">
      <div class="g-head"><span class="g-title">DATA</span><span class="g-note">只在本机</span></div>
      <div class="rows">
        ${row('导出备份')}${row('导入备份')}${row('载入演示数据')}
        <div class="row2"><div class="r-main"><span class="r-title danger">清空所有数据</span></div><span class="r-arrow">›</span></div>
      </div>
    </div>
    <div class="group">
      <div class="g-head"><span class="g-title">ABOUT</span></div>
      <div class="rows">${row('离线运行', '数据只在本机，不上传', 'v0.1')}</div>
    </div>
  </div>`;
}

function phone(title, note, action, content, tabIndex, tabLabel) {
  const tabs = ['日历', '矩阵', '设置'].map((label, index) => {
    const icons = [
      '<div class="glyph g-cal"></div>',
      '<div class="glyph g-matrix"><i></i><i></i><i></i><i></i></div>',
      '<div class="glyph g-set"><i></i><i></i><i></i></div>'
    ];
    return `<div class="tab ${index === tabIndex ? 'on' : ''}">${icons[index]}<span>${label}</span></div>`;
  }).join('');

  return `<div class="item">
    <div class="label"><b>${title}</b><span>${note}</span></div>
    <div class="phone">
      <div class="status"><span>18:20</span><span>5G · 100%</span><i></i></div>
      <div class="nav"><span class="brand">昼夜</span>${action ? `<span class="nav-action">${action}</span>` : ''}</div>
      <div class="page">${content}</div>
      <div class="tabbar">${tabs}</div>
    </div>
  </div>`;
}

document.getElementById('row').innerHTML = [
  phone('日历', '一排小方印，先像历书', '概览 ›', calendar(), 0),
  phone('矩阵', '发丝线 + 等宽日期', '今天', matrix(), 1),
  phone('设置', '分栏靠字距与横线', '', settings(), 2)
].join('');

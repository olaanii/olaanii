import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const login = 'olaanii';
const output = resolve('assets/github-activity.svg');
const endDate = new Date();
endDate.setUTCDate(endDate.getUTCDate() - 1);
const startDate = new Date(endDate);
startDate.setUTCDate(startDate.getUTCDate() - 364);
const iso = (date) => date.toISOString().slice(0, 10);
const from = iso(startDate);
const to = iso(endDate);
const xml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const comma = (value) => Number(value).toLocaleString('en-US');
const dateLabel = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

async function github(url) {
  const headers = { 'user-agent': 'OlaniProfileActivity/1.0', accept: 'application/vnd.github+json' };
  if (new URL(url).hostname === 'api.github.com' && process.env.GITHUB_TOKEN) {
    headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    headers['x-github-api-version'] = '2022-11-28';
  }
  const response = await fetch(url, {
    headers,
  });
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}): ${url}`);
  return response;
}

async function getContributionDays() {
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])];
  const pages = await Promise.all(years.map(async (year) => {
    const response = await github(`https://github.com/users/${login}/contributions?from=${year}-01-01&to=${year}-12-31`);
    return response.text();
  }));
  const all = new Map();

  for (const html of pages) {
    const tooltips = new Map([...html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g)]
      .map(([, id, text]) => [id, text.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')]));
    for (const [tag] of html.matchAll(/<[^>]*\bdata-date="\d{4}-\d{2}-\d{2}"[^>]*>/g)) {
      const date = tag.match(/\bdata-date="(\d{4}-\d{2}-\d{2})"/)?.[1];
      if (!date || date < from || date > to) continue;
      const id = tag.match(/\bid="([^"]+)"/)?.[1];
      const label = tag.match(/\baria-label="([^"]+)"/)?.[1] ?? (id ? tooltips.get(id) : '') ?? '';
      const count = Number(tag.match(/\bdata-count="([\d,]+)"/)?.[1]?.replaceAll(',', '') ?? label.match(/([\d,]+)\s+contribution/)?.[1]?.replaceAll(',', '') ?? 0);
      const level = Number(tag.match(/\bdata-level="([0-4])"/)?.[1] ?? 0);
      all.set(date, { date, count, level });
    }
  }

  const days = [];
  for (const date = new Date(startDate); date <= endDate; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = iso(date);
    days.push(all.get(key) ?? { date: key, count: 0, level: 0 });
  }
  if (all.size < 300) throw new Error(`GitHub returned only ${all.size} contribution days; refusing to publish incomplete data.`);
  return days;
}

async function getLanguages() {
  const reposResponse = await github(`https://api.github.com/users/${login}/repos?per_page=100&type=owner&sort=pushed`);
  const repositories = await reposResponse.json();
  if (!Array.isArray(repositories)) throw new Error('GitHub did not return the public repository list.');

  const totals = new Map();
  let cursor = 0;
  const workers = Array.from({ length: 6 }, async () => {
    while (cursor < repositories.length) {
      const repository = repositories[cursor++];
      if (repository.fork) continue;
      const response = await github(`https://api.github.com/repos/${login}/${repository.name}/languages`);
      for (const [language, bytes] of Object.entries(await response.json())) totals.set(language, (totals.get(language) ?? 0) + bytes);
    }
  });
  await Promise.all(workers);
  const entries = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = [...totals.values()].reduce((sum, bytes) => sum + bytes, 0);
  return entries.map(([name, bytes]) => ({ name, share: total ? Math.round(bytes * 100 / total) : 0 }));
}

function getStats(days) {
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const active = days.filter((day) => day.count > 0);
  const busiest = active.reduce((best, day) => day.count > (best?.count ?? 0) ? day : best, null);
  const weekdayCounts = Array(7).fill(0);
  for (const day of days) weekdayCounts[new Date(`${day.date}T00:00:00Z`).getUTCDay()] += day.count;

  let longest = 0;
  let streak = 0;
  let longestEnd = null;
  for (const day of days) {
    streak = day.count ? streak + 1 : 0;
    if (streak > longest) { longest = streak; longestEnd = day.date; }
  }
  let current = 0;
  for (let index = days.length - 1; index >= 0 && days[index].count > 0; index--) current++;

  const weeks = new Map();
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key = iso(monday);
    weeks.set(key, (weeks.get(key) ?? 0) + day.count);
  }
  const weekly = [...weeks].map(([start, count]) => ({ start, count }));
  const bestWeek = weekly.reduce((best, week) => week.count > (best?.count ?? 0) ? week : best, null);
  return { total, activeDays: active.length, busiest, weekdayCounts, longest, longestEnd, current, weekly, bestWeek };
}

function render(days, stats, languages) {
  const width = 1000;
  const height = 570;
  const chart = { left: 64, right: 958, top: 104, bottom: 240 };
  const max = Math.max(1, ...stats.weekly.map((week) => week.count));
  const points = stats.weekly.map((week, index) => {
    const x = chart.left + index * (chart.right - chart.left) / Math.max(1, stats.weekly.length - 1);
    const y = chart.bottom - week.count / max * (chart.bottom - chart.top);
    return { ...week, x, y };
  });
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const first = points[0];
  const last = points.at(-1);
  const area = `${line} L${last.x.toFixed(1)} ${chart.bottom} L${first.x.toFixed(1)} ${chart.bottom} Z`;
  const grid = [0, 0.5, 1].map((fraction) => {
    const y = chart.bottom - fraction * (chart.bottom - chart.top);
    return `<line x1="${chart.left}" y1="${y}" x2="${chart.right}" y2="${y}" class="grid"/><text x="${chart.left - 12}" y="${y + 4}" text-anchor="end" class="muted small">${Math.round(max * fraction)}</text>`;
  }).join('');
  const monthLabels = [];
  for (const point of points) {
    const month = new Date(`${point.start}T00:00:00Z`).getUTCMonth();
    const previous = monthLabels.at(-1)?.month;
    if (month !== previous) monthLabels.push({ month, x: point.x, label: new Date(`${point.start}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) });
  }
  const months = monthLabels.map((item) => `<text x="${item.x}" y="${chart.bottom + 22}" class="muted small">${item.label}</text>`).join('');
  const peak = points.reduce((best, point) => point.count > best.count ? point : best, points[0]);
  const weekdayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const weekdayMax = Math.max(1, ...stats.weekdayCounts);
  const weekdayBars = stats.weekdayCounts.map((value, index) => {
    const x = 38 + index * 45;
    const barHeight = value / weekdayMax * 46;
    return `<rect x="${x}" y="${515 - barHeight}" width="27" height="${barHeight}" fill="${index === stats.weekdayCounts.indexOf(weekdayMax) ? '#fff' : '#777'}"/><text x="${x + 13.5}" y="535" text-anchor="middle" class="muted tiny">${weekdayNames[index]}</text>`;
  }).join('');
  let languageX = 354;
  const languageBar = languages.map((language, index) => {
    const segmentWidth = 566 * language.share / Math.max(1, languages.reduce((sum, item) => sum + item.share, 0));
    const fill = ['#fff', '#ccc', '#999', '#666', '#444'][index];
    const rect = `<rect x="${languageX}" y="464" width="${segmentWidth}" height="9" fill="${fill}"/>`;
    languageX += segmentWidth;
    return rect;
  }).join('');
  const langLabels = languages.map((language, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return `<text x="${354 + col * 190}" y="${497 + row * 22}" class="muted small">${xml(language.name)} ${language.share}%</text>`;
  }).join('');

  const stat = (x, y, label, value, detail) => `<text x="${x}" y="${y}" class="eyebrow">${xml(label.toUpperCase())}</text><text x="${x}" y="${y + 27}" class="value">${xml(value)}</text><text x="${x}" y="${y + 45}" class="muted small">${xml(detail)}</text>`;
  const busiest = stats.busiest ? `${comma(stats.busiest.count)} contributions` : '0 contributions';
  const bestWeekCount = stats.bestWeek?.count ?? 0;
  const bestWeekDetail = stats.bestWeek ? `week of ${dateLabel(stats.bestWeek.start)}` : 'no contributions';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">Olani's GitHub activity</title><desc id="desc">Black and white summary of ${comma(stats.total)} GitHub contributions from ${from} through ${to}.</desc>
<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<style>.bg{fill:#000}.white{fill:#fff}.muted{fill:#b8b8b8}.small{font:13px ui-monospace,SFMono-Regular,Consolas,monospace}.tiny{font:11px ui-monospace,SFMono-Regular,Consolas,monospace}.eyebrow{font:11px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:1.5px;fill:#b8b8b8}.value{font:bold 18px ui-monospace,SFMono-Regular,Consolas,monospace;fill:#fff}.grid{stroke:#555;stroke-dasharray:4 5;stroke-width:1}.rule{stroke:#555;stroke-width:1}.chartline{fill:none;stroke:#fff;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round}</style>
<rect class="bg" width="1000" height="570" rx="14"/><text x="28" y="34" class="eyebrow">CONTRIBUTIONS PER WEEK · ${from} – ${to}</text><text x="972" y="34" text-anchor="end" class="eyebrow">GITHUB.COM/${login.toUpperCase()}</text>
${grid}<path d="${area}" fill="url(#area)"/><path d="${line}" class="chartline"/><circle cx="${peak.x}" cy="${peak.y}" r="4" class="white"/><text x="${peak.x}" y="${Math.max(chart.top - 12, peak.y - 12)}" text-anchor="middle" class="white small">${comma(peak.count)} in week of ${dateLabel(peak.start)}</text>${months}
<line x1="0" y1="276" x2="1000" y2="276" class="rule"/><line x1="333" y1="276" x2="333" y2="424" class="rule"/><line x1="666" y1="276" x2="666" y2="424" class="rule"/><line x1="0" y1="350" x2="1000" y2="350" class="rule"/><line x1="0" y1="424" x2="1000" y2="424" class="rule"/>
${stat(28, 300, 'Contributions', comma(stats.total), 'in the last year')}${stat(360, 300, 'Active days', comma(stats.activeDays), 'of 365 days')}${stat(694, 300, 'Busiest day', busiest, stats.busiest ? dateLabel(stats.busiest.date) : 'no active days')}
${stat(28, 374, 'Current streak', `${stats.current} days`, stats.current ? `through ${dateLabel(to)}` : 'no current streak')}${stat(360, 374, 'Longest streak', `${stats.longest} days`, stats.longestEnd ? `ended ${dateLabel(stats.longestEnd)}` : 'no active days')}${stat(694, 374, 'Best week', `${comma(bestWeekCount)} contributions`, bestWeekDetail)}
<text x="28" y="452" class="eyebrow">BY WEEKDAY</text><text x="354" y="452" class="eyebrow">LANGUAGES</text>${weekdayBars}<rect x="354" y="464" width="566" height="9" fill="#333"/>${languageBar}${langLabels}
<text x="972" y="548" text-anchor="end" class="muted tiny">SOURCE: PUBLIC GITHUB ACTIVITY · UPDATED WEEKLY</text></svg>`;
}

const days = await getContributionDays();
const [stats, languages] = [getStats(days), await getLanguages()];
await mkdir(dirname(output), { recursive: true });
await writeFile(output, render(days, stats, languages), 'utf8');
console.log(`Wrote ${output} with ${comma(stats.total)} contributions from ${from} to ${to}; languages: ${languages.map(({ name, share }) => `${name} ${share}%`).join(', ') || 'none'}.`);

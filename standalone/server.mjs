import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');
const publicRoot = resolve(projectRoot, 'client/public/legacy');
const dataDir = resolve(process.env.DATA_DIR || join(here, 'data'));
const databasePath = resolve(process.env.SQLITE_PATH || join(dataDir, 'yuejian.sqlite'));
const port = Number(process.env.PORT || process.env.SERVER_PORT || 8788);
const host = process.env.HOST || process.env.SERVER_HOST || '0.0.0.0';
const sessionDays = Math.max(1, Number(process.env.SESSION_DAYS || 30));

mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_state (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    state_json TEXT NOT NULL DEFAULT '{}',
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    request_json TEXT NOT NULL DEFAULT '{}',
    response_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS agent_runs_user_created_idx
    ON agent_runs(user_id, created_at DESC);
`);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
};

const IDEA_LIBRARY = [
  ['culture', '看展', '去看一场不需要提前做功课的小展', '室内 · 60–120 分钟'],
  ['culture', '音乐', '找一间可以坐下听完整张唱片的空间', '室内 · 不必一直说话'],
  ['culture', '脱口秀', '看一场轻松的脱口秀，散场后再聊笑点', '室内 · 场次需确认'],
  ['culture', '电影', '挑一部散场后还有话可聊的电影', '室内 · 约 2–3 小时'],
  ['craft', '陶艺', '一起做两件不一定完美的小器物', '手作 · 需预约'],
  ['craft', '银饰手作', '给今晚留下一件亲手做的小纪念', '手作 · 约 2 小时'],
  ['craft', '烘焙', '一起完成一份可以带走的小甜点', '室内 · 适合合作'],
  ['games', '桌游', '从一款双人合作桌游开始', '室内 · 可随时续时'],
  ['games', '密室', '玩一个不恐怖、重合作的双人密室', '室内 · 需确认场次'],
  ['games', '保龄球', '慢慢打一局保龄球，不急着分胜负', '室内 · 新手友好'],
  ['games', '台球', '找一张台球桌，边玩边聊天', '室内 · 节奏自由'],
  ['games', '街机', '去游戏厅互相挑三款小游戏', '室内 · 随时结束'],
  ['sport', '散步', '沿着亮灯的河岸慢慢走一段', '户外 · 天气合适再出发'],
  ['sport', '日落', '去高一点的地方等一次北京日落', '户外 · 受天气影响'],
  ['sport', '夜骑', '选一段可以随时缩短的夜骑路线', '户外 · 注意降雨与返程'],
  ['slow', '咖啡', '找一家不催人的咖啡店坐久一点', '室内 · 预算友好'],
  ['slow', '甜品', '两个人只点一份甜点慢慢分享', '室内 · 适合收尾'],
  ['slow', '书店', '去夜间书店各自翻一会儿书', '室内 · 安静'],
  ['slow', '晚餐', '选一家值得专门去吃的北京餐厅', '出发前确认营业与预约'],
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 180);
}

function cleanText(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function json(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(body);
}

function apiError(response, status, message, code = 'REQUEST_FAILED') {
  json(response, status, { error: message, code });
}

async function readJson(request, limit = 2_000_000) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw Object.assign(new Error('提交数据过大'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求内容不是有效 JSON'), { status: 400 });
  }
}

function cookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index < 0
          ? [part, '']
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function passwordDigest(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function safePasswordMatch(password, salt, expectedHex) {
  const actual = Buffer.from(passwordDigest(password, salt), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function currentUser(request) {
  const token = cookies(request).yuejian_session;
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), nowIso());
  return row || null;
}

function requireUser(request, response) {
  const user = currentUser(request);
  if (!user) {
    apiError(response, 401, '请先登录', 'UNAUTHORIZED');
    return null;
  }
  return user;
}

function sessionCookie(request, token, expiresAt) {
  const secure = request.socket.encrypted || String(request.headers['x-forwarded-proto'] || '').includes('https');
  return [
    `yuejian_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].filter(Boolean).join('; ');
}

function clearSessionCookie(request) {
  const secure = request.socket.encrypted || String(request.headers['x-forwarded-proto'] || '').includes('https');
  return [
    'yuejian_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ].filter(Boolean).join('; ');
}

function createSession(request, userId) {
  const token = randomBytes(32).toString('base64url');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + sessionDays * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(token), userId, expiresAt, createdAt);
  return { token, expiresAt, cookie: sessionCookie(request, token, expiresAt) };
}

function recordAgentRun(userId, kind, provider, input, output) {
  db.prepare(`
    INSERT INTO agent_runs (id, user_id, kind, provider, request_json, response_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    userId || null,
    kind,
    provider,
    JSON.stringify(input).slice(0, 20_000),
    JSON.stringify(output).slice(0, 20_000),
    nowIso(),
  );
  db.prepare('DELETE FROM agent_runs WHERE created_at < ?')
    .run(new Date(Date.now() - 30 * 86_400_000).toISOString());
}

function pickIdeas(input = {}) {
  const count = Math.max(3, Math.min(10, Number(input.count || 6)));
  const seed = `${input.seed || Date.now()}-${Math.random()}`;
  const offset = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % IDEA_LIBRARY.length;
  return Array.from({ length: count }, (_, index) => IDEA_LIBRARY[(offset + index * 7) % IDEA_LIBRARY.length])
    .map(([group, tag, description, subtitle], index) => ({
      id: `idea-${Date.now()}-${index}`,
      title: tag,
      subtitle,
      description,
      group,
      tag,
      mood: ['舒服一点', '不赶时间', '带一点新鲜感'][index % 3],
      searchQuery: `北京 ${tag}`,
    }));
}

const PLAN_THEME_ALIASES = {
  '看展': ['看展', '展览', '美术馆', '博物馆', '画廊'],
  '散步': ['散步', '步道', '河畔', '河岸', '公园', '街区漫步'],
  '音乐': ['音乐', 'livehouse', '音乐现场', '黑胶', '乐队', 'concert'],
  '日落': ['日落', '晚霞', '夕阳'],
  '书店': ['书店', '阅读'],
  '咖啡': ['咖啡', '咖啡馆', 'coffee', 'cafe'],
  '甜品': ['甜品', '甜点', 'dessert'],
  '冰淇淋': ['冰淇淋', 'gelato', 'ice cream'],
  '晚餐': ['晚餐', '餐厅', '餐馆', '饭店', '正餐', 'dinner', 'restaurant'],
  '脱口秀': ['脱口秀', '喜剧', 'comedy'],
  '陶艺': ['陶艺', '拉坯'],
  '手作': ['手作', '陶艺', '银饰', '金工', '烘焙'],
  '密室': ['密室', '逃脱', '解谜', 'escape room', 'escape_room'],
  '桌游': ['桌游', 'board game', 'boardgame'],
  '保龄球': ['保龄球', 'bowling'],
  '沉浸戏剧': ['沉浸戏剧', '沉浸式戏剧', '沉浸剧场'],
  '银饰手作': ['银饰手作', '银饰', '首饰手作', '金工', '银戒'],
  'K歌': ['k歌', 'ktv', '卡拉ok', 'karaoke'],
  '台球': ['台球', '桌球', 'billiard'],
  '街机': ['街机', '电玩', '游戏厅', 'arcade'],
  '夜骑': ['夜骑', '骑行'],
  '电影': ['电影', '影院', '电影院', 'movie theater', 'movie_theater'],
  '烘焙': ['烘焙', '烘培', '蛋糕制作', '甜点制作', 'baking'],
  '公园': ['公园', '花园', '绿地', 'park']
};

function planPlaceMatchesTheme(place, theme) {
  const selectedTheme = String(theme || '').trim();
  if (!selectedTheme) return true;
  const text = `${place?.name || ''} ${place?.category || ''} ${place?.categoryLabel || ''} ${(place?.tags || []).join(' ')}`.toLowerCase();
  return (PLAN_THEME_ALIASES[selectedTheme] || [selectedTheme])
    .some((alias) => text.includes(String(alias).toLowerCase()));
}

const PLAN_PRIORITY_VALUES = new Set(['少通勤', '少走路', '环境安静', '室内舒适', '不排队', '时间准点', '预算可控', '有一点新鲜感']);

function normalizePlanPriorities(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[、,，|｜]/);
  return [...new Set(values.map((item) => String(item || '').trim()).filter((item) => PLAN_PRIORITY_VALUES.has(item)))];
}

function planSelection(input = {}) {
  const places = Array.isArray(input.places) ? input.places : [];
  const conditions = input.conditions && typeof input.conditions === 'object' ? input.conditions : {};
  const feedback = input.feedback && typeof input.feedback === 'object' ? input.feedback : {};
  const preferred = new Set(Array.isArray(input.preferredPlaceIds) ? input.preferredPlaceIds : []);
  const maxDistance = Number(conditions.distance || 15);
  const maxBudget = Number(conditions.budget || 1200);
  const maxDuration = Number(conditions.duration || 3) * 60 + 15;
  const theme = String(input.theme || '').trim();
  const priorities = normalizePlanPriorities(input.priorities?.length ? input.priorities : input.messages?.[2]);
  const feedbackScore = (place) => {
    const text = `${place.name || ''} ${(place.tags || []).join(' ')} ${(place.moods || []).join(' ')} ${place.categoryLabel || ''}`;
    let score = 0;
    if (feedback.more === '安静聊天' && (place.noise === '安静' || /安静|咖啡|书店|聊天/.test(text))) score += 14;
    if (feedback.more === '新鲜体验' && (place.category === 'activity' || /体验|手作|展|音乐|戏剧|游戏/.test(text))) score += 13;
    if (feedback.more === '户外散步' && (!place.indoor || /散步|河|公园|日落|户外|骑行/.test(text))) score += 14;
    if (feedback.more === '认真吃饭' && place.category === 'dinner') score += 15;
    if (feedback.less === '通勤') score += Math.max(0, 12 - (Number(place.distanceKm || 0) / Math.max(maxDistance, 1)) * 12);
    if (feedback.less === '排队') score += place.booking?.status === 'available' ? 11 : place.booking?.status === 'walkin' ? 5 : 0;
    if (feedback.less === '花费') score += Math.max(0, 12 - (Number(place.priceForTwo || 0) / Math.max(maxBudget, 1)) * 10);
    if (feedback.less === '赶时间') score += Math.max(0, 10 - Number(place.travelMin || 0) / 3);
    return score;
  };
  const priorityScore = (place) => {
    const selected = new Set(priorities);
    const text = `${place.name || ''} ${place.categoryLabel || ''} ${(place.tags || []).join(' ')} ${(place.moods || []).join(' ')}`;
    let score = 0;
    if (selected.has('少通勤')) score += Math.max(0, 16 - (Number(place.distanceKm || 0) / Math.max(maxDistance, 1)) * 16);
    if (selected.has('少走路')) score += Math.max(0, 14 - Number(place.travelMin || 0) / 2.5);
    if (selected.has('环境安静') && (place.noise === '安静' || /安静|书店|咖啡|黑胶/.test(text))) score += 15;
    if (selected.has('室内舒适') && place.indoor) score += 15;
    if (selected.has('不排队')) score += place.booking?.status === 'available' ? 15 : place.booking?.status === 'walkin' ? 8 : 0;
    if (selected.has('时间准点')) {
      if (place.booking?.status === 'available' || /预约|场次|准时/.test(text)) score += 9;
      score += Math.max(0, 8 - Number(place.travelMin || 0) / 4);
    }
    if (selected.has('预算可控')) score += Math.max(0, 16 - (Number(place.priceForTwo || 0) / Math.max(maxBudget, 1)) * 14);
    if (selected.has('有一点新鲜感') && (place.category === 'activity' || /体验|手作|展|音乐|戏剧|游戏|密室|夜骑/.test(text))) score += 14;
    return score;
  };
  const ranked = places
    .filter((place) => Number(place.distanceKm || 0) <= maxDistance)
    .filter((place) => !Number(place.priceForTwo) || Number(place.priceForTwo) <= maxBudget)
    .map((place) => ({
      place,
      score: (preferred.has(place.id) ? 100 : 0)
        + Number(place.rating || 0) * 3
        - Number(place.distanceKm || 0)
        + (place.userDistanceKm != null && place.partnerDistanceKm != null
          ? Math.max(0, 18 - Number(place.distanceGapKm || 0) * 3)
          : 0)
        + feedbackScore(place)
        + priorityScore(place),
    }))
    .sort((left, right) => right.score - left.score);
  const selected = [];
  let selectedCost = 0;
  let selectedDuration = 0;
  const addPlace = (place) => {
    if (!place || selected.includes(place.id)) return false;
    const nextCost = selectedCost + Number(place.priceForTwo || 0);
    const nextDuration = selectedDuration + Number(place.durationMin || 60) + (selected.length ? Number(place.travelMin || 0) : 0);
    if (nextCost > maxBudget || nextDuration > maxDuration) return false;
    selected.push(place.id);
    selectedCost = nextCost;
    selectedDuration = nextDuration;
    return true;
  };
  if (theme) {
    const themeMatch = ranked.find(({ place }) => planPlaceMatchesTheme(place, theme));
    if (!themeMatch) {
      return {
        title: cleanText(input.themeTitle || theme, 60),
        analysis: `已把“${theme}”作为硬条件，但当前候选地点中没有匹配项。`,
        selectedPlaceIds: [],
        reasons: [`不会用其他活动替代“${theme}”`],
        cautions: ['请扩大范围或调整预算、时长后重新搜索'],
      };
    }
    addPlace(themeMatch.place);
    for (const category of ['dinner', 'dessert']) {
      if (selected.length >= 2) break;
      const match = ranked.find(({ place }) => place.category === category && !selected.includes(place.id));
      if (match) addPlace(match.place);
    }
  } else {
    for (const category of ['dinner', 'activity', 'dessert']) {
      const match = ranked.find(({ place }) => place.category === category && !selected.includes(place.id));
      if (match) addPlace(match.place);
    }
  }
  for (const { place } of ranked) {
    if (selected.length >= (theme ? 2 : 3)) break;
    if (theme && place.category === 'activity' && !planPlaceMatchesTheme(place, theme)) continue;
    addPlace(place);
  }
  return {
    title: cleanText(input.themeTitle || input.theme || '今晚约会方案', 60),
    analysis: theme
      ? `已把“${theme}”设为不可偏离的活动条件${priorities.length ? `，并同时照顾${priorities.join('、')}` : ''}，再按两个人各自的距离、预算和时间补充顺路安排。`
      : `已综合预算、双方距离、评分、活动节奏${priorities.length ? `以及${priorities.join('、')}` : ''}，优先选择通勤更均衡且信息完整的地点。`,
    selectedPlaceIds: selected,
    reasons: ['优先匹配今晚的主题与预算', '控制双方最远通勤并减少距离差', '保留一个可以随时调整的收尾'],
    cautions: ['商家营业、票务和价格请在出发前再次确认'],
  };
}

function memorySummary(input = {}) {
  const media = Array.isArray(input.media) ? input.media.slice(0, 80) : [];
  const plan = input.plan && typeof input.plan === 'object' ? input.plan : null;
  const memory = input.memory && typeof input.memory === 'object' ? input.memory : null;
  const images = media.filter((item) => String(item.type || '').startsWith('image/')).length;
  const videos = media.filter((item) => String(item.type || '').startsWith('video/')).length;
  const contributors = new Set(media.map((item) => item.contributor).filter(Boolean));
  const date = cleanText(input.date || new Date().toISOString().slice(0, 10), 10);
  const baseDate = new Date(`${date}T12:00:00`);
  const anniversary = Number.isNaN(baseDate.getTime()) ? new Date() : new Date(baseDate);
  anniversary.setFullYear(anniversary.getFullYear() + 1);
  const activityTitle = cleanText(plan?.title || memory?.title || input.title || '一起度过的这段时间', 60);
  const mediaLabel = [images ? `${images} 张照片` : '', videos ? `${videos} 段视频` : ''].filter(Boolean).join('和') || '这次上传的内容';
  const bothContributed = contributors.has('user') && contributors.has('partner');
  const digest = bothContributed
    ? `你和 TA 一起留下了${mediaLabel}。回看这些片段，这次见面的主线是「${activityTitle}」，既有共同经历，也保留了两个人各自看到的瞬间。`
    : `这次一共整理了${mediaLabel}。回看这些片段，最清晰的主线是「${activityTitle}」，适合保存为一段以后还能重新打开的共同回忆。`;
  const highlights = [
    bothContributed ? '双方都参与记录，同一段经历有了两个视角' : '已经把零散素材整理成同一段活动记录',
    videos ? '视频保留了当时的声音、动作和现场节奏' : '照片串起了本次活动的主要片段',
    memory?.favorite ? `最值得记住的地点是「${cleanText(memory.favorite, 40)}」` : plan?.stops?.[0]?.name ? `行程从「${cleanText(plan.stops[0].name, 40)}」开始` : '可以继续补充一句当时最想记住的话'
  ];
  return {
    id: `memory-summary-${Date.now()}`,
    date,
    title: `${activityTitle} · 活动日结`,
    digest,
    highlights,
    mediaCount: media.length,
    imageCount: images,
    videoCount: videos,
    contributors: [...contributors],
    anniversaryOn: anniversary.toISOString().slice(0, 10),
    createdAt: nowIso()
  };
}

function weatherLabel(code) {
  if (code === 0) return '晴';
  if ([1, 2].includes(code)) return '晴间多云';
  if (code === 3) return '多云';
  if ([45, 48].includes(code)) return '有雾';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '有雨';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '有雪';
  if ([95, 96, 99].includes(code)) return '雷阵雨';
  return '天气变化';
}

async function weatherPayload(url) {
  const latitude = Number(url.searchParams.get('latitude') || 39.9042);
  const longitude = Number(url.searchParams.get('longitude') || 116.4074);
  const city = cleanText(url.searchParams.get('city') || '北京', 30);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m',
    hourly: 'temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m',
    forecast_days: '2',
    timezone: 'Asia/Shanghai',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    headers: { 'user-agent': 'Yuejian/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('天气服务暂时不可用');
  const payload = await response.json();
  const current = payload.current || {};
  const hourly = payload.hourly || {};
  const start = new Date(`${current.time}:00+08:00`);
  if (start.getHours() < 18) start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 6 * 3_600_000);
  const samples = (hourly.time || []).map((time, index) => ({
    timestamp: new Date(`${time}:00+08:00`).getTime(),
    temperature: Number(hourly.temperature_2m?.[index] || 0),
    apparentTemperature: Number(hourly.apparent_temperature?.[index] || 0),
    rainProbability: Number(hourly.precipitation_probability?.[index] || 0),
    weatherCode: Number(hourly.weather_code?.[index] || 0),
    windSpeed: Number(hourly.wind_speed_10m?.[index] || 0),
  })).filter((sample) => sample.timestamp >= start.getTime() && sample.timestamp <= end.getTime());
  const tonight = samples.length ? samples : [{
    temperature: Number(current.temperature_2m || 0),
    apparentTemperature: Number(current.apparent_temperature || 0),
    rainProbability: 0,
    weatherCode: Number(current.weather_code || 0),
    windSpeed: Number(current.wind_speed_10m || 0),
  }];
  const rainiest = tonight.reduce((best, item) => item.rainProbability > best.rainProbability ? item : best, tonight[0]);
  return {
    city,
    source: 'Open-Meteo',
    observedAt: current.time,
    current: {
      temperature: Number(current.temperature_2m || 0),
      apparentTemperature: Number(current.apparent_temperature || 0),
      precipitation: Number(current.precipitation || 0),
      rain: Number(current.rain || 0),
      weatherCode: Number(current.weather_code || 0),
      condition: weatherLabel(Number(current.weather_code || 0)),
      windSpeed: Number(current.wind_speed_10m || 0),
    },
    evening: {
      start: start.toISOString(),
      end: end.toISOString(),
      minTemperature: Math.min(...tonight.map((item) => item.temperature)),
      maxTemperature: Math.max(...tonight.map((item) => item.temperature)),
      maxApparentTemperature: Math.max(...tonight.map((item) => item.apparentTemperature)),
      rainProbability: Math.max(...tonight.map((item) => item.rainProbability)),
      maxWindSpeed: Math.max(...tonight.map((item) => item.windSpeed)),
      weatherCode: rainiest.weatherCode,
      condition: weatherLabel(rainiest.weatherCode),
    },
  };
}

async function baiduSearch(input) {
  const ak = process.env.BAIDU_MAP_SERVER_AK || process.env.BAIDU_MAP_AK;
  if (!ak) throw Object.assign(new Error('百度地图地点服务尚未配置'), { status: 503, code: 'MAPS_NOT_CONFIGURED' });
  const params = new URLSearchParams({
    query: cleanText(input.query, 180),
    scope: '2',
    page_size: String(Math.max(1, Math.min(10, Number(input.maxResultCount || 5)))),
    output: 'json',
    ak,
  });
  const center = input.locationBias?.center;
  const latitude = Number(center?.latitude);
  const longitude = Number(center?.longitude);
  const radius = Math.max(1000, Math.min(50000, Number(input.locationBias?.radius || 6000)));
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    params.set('location', `${latitude},${longitude}`);
    params.set('radius', String(Math.round(radius)));
    params.set('radius_limit', 'true');
  } else {
    params.set('region', cleanText(input.region || '北京市', 30));
    params.set('city_limit', 'false');
  }
  const response = await fetch(`https://api.map.baidu.com/place/v2/search?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  if (!response.ok || Number(payload.status) !== 0) throw new Error(payload.message || '百度地图地点服务暂时不可用');
  return { provider: 'baidu', places: payload.results || [], searchedAt: nowIso() };
}

async function baiduGeocode(input) {
  const ak = process.env.BAIDU_MAP_SERVER_AK || process.env.BAIDU_MAP_AK;
  if (!ak) throw Object.assign(new Error('百度地图地理编码尚未配置'), { status: 503, code: 'MAPS_NOT_CONFIGURED' });
  const address = cleanText(input.address, 180);
  if (!address) throw Object.assign(new Error('请输入要搜索的地点'), { status: 400, code: 'ADDRESS_REQUIRED' });
  const params = new URLSearchParams({
    address,
    city: cleanText(input.city || '北京市', 30),
    output: 'json',
    ret_coordtype: 'bd09ll',
    ak,
  });
  const response = await fetch(`https://api.map.baidu.com/geocoding/v3/?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  const location = payload.result?.location;
  if (!response.ok || Number(payload.status) !== 0 || !location) {
    throw Object.assign(new Error(payload.message || '没有找到这个出发地点'), { status: 404, code: 'GEOCODE_FAILED' });
  }
  return {
    provider: 'baidu',
    coordinateSystem: 'bd09',
    formattedAddress: address,
    precise: Number(payload.result.precise || 0),
    confidence: Number(payload.result.confidence || 0),
    location: { latitude: Number(location.lat), longitude: Number(location.lng) },
  };
}

async function baiduPlaceDetail(uid) {
  const ak = process.env.BAIDU_MAP_SERVER_AK || process.env.BAIDU_MAP_AK;
  if (!ak) throw Object.assign(new Error('百度地图地点服务尚未配置'), { status: 503, code: 'MAPS_NOT_CONFIGURED' });
  const params = new URLSearchParams({
    uid: cleanText(uid, 120),
    scope: '2',
    output: 'json',
    ak,
  });
  const response = await fetch(`https://api.map.baidu.com/place/v2/detail?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  if (!response.ok || Number(payload.status) !== 0 || !payload.result) {
    throw Object.assign(new Error(payload.message || '百度地图地点详情暂时不可用'), {
      status: Number(payload.status) === 2 ? 404 : 502,
      code: 'PLACE_DETAIL_FAILED',
    });
  }
  return { provider: 'baidu', place: payload.result, checkedAt: nowIso() };
}

function serveStatic(request, response, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    apiError(response, 400, '路径格式不正确');
    return;
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = normalize(join(publicRoot, requested));
  if (!filePath.startsWith(`${publicRoot}/`) && filePath !== join(publicRoot, 'index.html')) {
    apiError(response, 403, '无权访问该路径');
    return;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    apiError(response, 404, '这一页暂时找不到');
    return;
  }
  const stat = statSync(filePath);
  response.writeHead(200, {
    'content-type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
  });
  if (request.method === 'HEAD') response.end();
  else createReadStream(filePath).pipe(response);
}

async function handleApi(request, response, url) {
  const method = request.method || 'GET';
  const path = url.pathname;

  if (method === 'GET' && path === '/api/health') {
    return json(response, 200, {
      status: 'ok',
      version: '2.0.0-independent',
      database: 'sqlite',
      platform: 'standalone',
      timestamp: nowIso(),
    });
  }

  if (method === 'GET' && path === '/api/config') {
    const baiduServerAk = process.env.BAIDU_MAP_SERVER_AK || process.env.BAIDU_MAP_AK || '';
    const baiduBrowserAk = process.env.BAIDU_MAP_BROWSER_AK || process.env.BAIDU_MAP_AK || '';
    return json(response, 200, {
      mapsEnabled: true,
      placesEnabled: Boolean(baiduServerAk),
      routesEnabled: false,
      browserKey: null,
      baiduBrowserAk: baiduBrowserAk || null,
      mapId: 'INDEPENDENT_MAP',
      mapProvider: baiduBrowserAk ? 'baidu' : 'osm',
      placesProvider: baiduServerAk ? 'baidu' : 'demo',
      mode: baiduServerAk ? 'live' : 'demo',
      agentEnabled: Boolean(process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY),
      agentProvider: process.env.DEEPSEEK_API_KEY ? 'deepseek' : process.env.OPENAI_API_KEY ? 'openai' : 'local',
      agentModel: process.env.DEEPSEEK_MODEL || process.env.OPENAI_MODEL || '约见独立规划器',
      backendEnabled: true,
      appVersion: '2.0.0-independent',
    });
  }

  if (method === 'GET' && path === '/api/auth/me') {
    return json(response, 200, { user: publicUser(currentUser(request)) });
  }

  if (method === 'POST' && path === '/api/auth/register') {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const displayName = cleanText(body.displayName || email.split('@')[0] || '用户', 30);
    if (!/^\S+@\S+\.\S+$/.test(email)) return apiError(response, 400, '请输入有效邮箱', 'INVALID_EMAIL');
    if (password.length < 8 || password.length > 128) return apiError(response, 400, '密码至少需要 8 位', 'WEAK_PASSWORD');
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return apiError(response, 409, '这个邮箱已经注册', 'EMAIL_EXISTS');
    const id = randomUUID();
    const salt = randomBytes(16).toString('hex');
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO users (id, email, display_name, password_hash, password_salt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, displayName, passwordDigest(password, salt), salt, timestamp, timestamp);
    const session = createSession(request, id);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return json(response, 201, { user: publicUser(user) }, { 'set-cookie': session.cookie });
  }

  if (method === 'POST' && path === '/api/auth/login') {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !safePasswordMatch(password, user.password_salt, user.password_hash)) {
      return apiError(response, 401, '邮箱或密码不正确', 'INVALID_CREDENTIALS');
    }
    const session = createSession(request, user.id);
    return json(response, 200, { user: publicUser(user) }, { 'set-cookie': session.cookie });
  }

  if (method === 'POST' && path === '/api/auth/logout') {
    const token = cookies(request).yuejian_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    return json(response, 200, { ok: true, managedBy: 'yuejian' }, { 'set-cookie': clearSessionCookie(request) });
  }

  if (method === 'GET' && path === '/api/account/state') {
    const user = requireUser(request, response);
    if (!user) return;
    const row = db.prepare('SELECT state_json, revision, updated_at FROM app_state WHERE user_id = ?').get(user.id);
    return json(response, 200, row ? {
      state: JSON.parse(row.state_json),
      revision: row.revision,
      updatedAt: row.updated_at,
    } : { state: null, revision: 0, updatedAt: null });
  }

  if (method === 'PUT' && path === '/api/account/state') {
    const user = requireUser(request, response);
    if (!user) return;
    const body = await readJson(request);
    const state = Object.prototype.hasOwnProperty.call(body, 'state') ? body.state : body;
    const stateJson = JSON.stringify(state && typeof state === 'object' ? state : {});
    if (Buffer.byteLength(stateJson) > 1_000_000) return apiError(response, 413, '同步数据过大', 'STATE_TOO_LARGE');
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO app_state (user_id, state_json, revision, created_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        state_json = excluded.state_json,
        revision = app_state.revision + 1,
        updated_at = excluded.updated_at
    `).run(user.id, stateJson, timestamp, timestamp);
    const saved = db.prepare('SELECT revision, updated_at FROM app_state WHERE user_id = ?').get(user.id);
    return json(response, 200, { revision: saved.revision, updatedAt: saved.updated_at });
  }

  if (method === 'PUT' && path === '/api/account/profile') {
    const user = requireUser(request, response);
    if (!user) return;
    const body = await readJson(request);
    const displayName = cleanText(body.displayName || user.display_name, 30);
    const timestamp = nowIso();
    db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
      .run(displayName, timestamp, user.id);
    return json(response, 200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
  }

  if (method === 'DELETE' && path === '/api/account') {
    const user = requireUser(request, response);
    if (!user) return;
    db.prepare('DELETE FROM agent_runs WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM app_state WHERE user_id = ?').run(user.id);
    return json(response, 200, { ok: true });
  }

  if (method === 'POST' && path === '/api/agent/plan') {
    const body = await readJson(request);
    const result = planSelection(body);
    const output = { provider: 'local', mode: 'local', result };
    recordAgentRun(currentUser(request)?.id, 'plan', 'local', body, output);
    return json(response, 200, output);
  }

  if (method === 'POST' && path === '/api/agent/memory-summary') {
    const body = await readJson(request);
    const summary = memorySummary(body);
    const output = { provider: 'local', mode: 'local', summary };
    recordAgentRun(currentUser(request)?.id, 'memory-summary', 'local', body, output);
    return json(response, 200, output);
  }

  if (method === 'POST' && path === '/api/agent/inspirations') {
    const body = await readJson(request);
    const output = { provider: 'local', mode: 'local', ideas: pickIdeas(body) };
    recordAgentRun(currentUser(request)?.id, 'inspirations', 'local', body, output);
    return json(response, 200, output);
  }

  if (method === 'GET' && path === '/api/weather') {
    return json(response, 200, await weatherPayload(url));
  }

  if (method === 'POST' && path === '/api/places/search') {
    const body = await readJson(request);
    return json(response, 200, await baiduSearch(body));
  }

  if (method === 'POST' && path === '/api/maps/geocode') {
    const body = await readJson(request);
    return json(response, 200, await baiduGeocode(body));
  }

  const placeDetailMatch = path.match(/^\/api\/places\/([^/]+)$/);
  if (method === 'GET' && placeDetailMatch) {
    const provider = cleanText(url.searchParams.get('provider') || 'baidu', 20);
    if (provider !== 'baidu') return apiError(response, 400, '当前独立后端仅启用百度地点详情', 'UNSUPPORTED_PROVIDER');
    return json(response, 200, await baiduPlaceDetail(decodeURIComponent(placeDetailMatch[1])));
  }

  if (method === 'POST' && path === '/api/routes') {
    return apiError(response, 503, '实时路线服务尚未配置，已保留百度地图跳转', 'ROUTES_NOT_CONFIGURED');
  }

  return apiError(response, 404, '接口不存在', 'NOT_FOUND');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
    else serveStatic(request, response, url);
  } catch (error) {
    console.error(error);
    apiError(response, Number(error?.status || 500), error?.message || '服务器暂时无法完成请求', error?.code || 'INTERNAL_ERROR');
  }
});

server.listen(port, host, () => {
  console.log(`约见独立服务已启动：http://${host}:${port}`);
  console.log(`数据文件：${databasePath}`);
});

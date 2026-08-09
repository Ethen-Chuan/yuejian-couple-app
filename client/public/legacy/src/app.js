import { coupleBucketList, inspirations, places as demoPlaces, preferenceOptions } from './data.js?v=2.4.11';
import {
  buildMemoryFromWrapup,
  deletePlanStop,
  getMatchReasons,
  getSearchRadii,
  placeMatchesTheme,
  rankPlaces,
  replacePlanStop,
  themeCategory
} from './domain.js?v=2.4.11';
import { moodDescription, moodLabel, moodSliderOptions } from './moods.js?v=2.4.11';
import { createStore } from './store.js?v=2.4.11';
import {
  accountService,
  aiPlannerService,
  dateAdviceService,
  downloadJson,
  inspirationService,
  locationService,
  mapService,
  mapsConfigService,
  memoryAgentService,
  memoryMediaService,
  placeService,
  shareService,
  weatherService
} from './services.js?v=2.4.11';

const app = document.querySelector('#legacy-app');
const store = createStore();
const ACCOUNT_RESTORE_TOAST_SESSION_KEY = 'yiqiya-account-restore-toast-shown';
let toastTimer = null;
let lastRenderedRouteKey = '';
let lastRenderedMarkup = '';
let pendingMicroMotion = null;
let accountBootstrapComplete = false;
let accountRestoreToastShown = false;
let syncTimer = null;
let lastSyncSignature = '';
let mapSearchInFlight = false;
let searchCenterInFlight = false;
let inspirationInFlight = false;
let stopPlanPresenceWatch = null;
let planPresenceWatchKey = '';
let lastPlanProgressSignature = '';
let activeWorkflowRangeDrag = null;
const memoryMediaObjectUrls = new Map();
const placeDetailsInFlight = new Set();
const mapErrorsShown = new Set();
const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const STABLE_SCROLL_SELECTORS = [
  '.page',
  '.home-content',
  '.conversation-log',
  '.detail-page',
  '.memory-page',
  '.profile-page',
  '.discover-page',
  '.wrap-page',
  '.guest-sheet-scroll',
  '.horizontal-cards',
  '.pill-row',
  '.quick-replies',
  '.favorite-row'
];

try {
  accountRestoreToastShown = sessionStorage.getItem(ACCOUNT_RESTORE_TOAST_SESSION_KEY) === '1';
} catch {
  accountRestoreToastShown = false;
}
const MAIN_NAV_ROUTES = ['tonight', 'discover', 'memory', 'profile'];
const APP_ROUTES = new Set([
  'welcome',
  'onboarding',
  'tonight',
  'conversation',
  'map-explore',
  'plan',
  'place',
  'memory',
  'memory-agent',
  'profile',
  'discover',
  'settings',
  'wrapup',
  'states',
  'design-system'
]);
const ROUTE_ALIASES = Object.freeze({
  home: 'tonight',
  community: 'tonight',
  planner: 'conversation',
  chat: 'conversation',
  map: 'map-explore',
  places: 'place',
  venue: 'place',
  memories: 'memory',
  me: 'profile',
  account: 'profile',
  inspiration: 'discover',
  discovery: 'discover',
  review: 'wrapup',
  preferences: 'settings'
});
const DISCOVER_FILTERS = [
  ['all', '全部'],
  ['daily', '日常心动'],
  ['city', '城市漫游'],
  ['create', '一起创造'],
  ['play', '好好玩'],
  ['culture', '看见世界']
];
const MAP_CATEGORIES = [['all', '全部'], ['dinner', '餐厅'], ['activity', '活动'], ['dessert', '咖啡甜品']];
const PROFILE_FOOD_OPTIONS = ['中餐', '西餐', '日料', '火锅', '素食', '咖啡', '甜品', '小酒馆'];
const PROFILE_DIETARY_OPTIONS = ['素食', '无麸质', '无乳糖', '不含坚果'];
const PROFILE_ACTIVITY_OPTIONS = ['看展', '散步', '电影', '现场音乐', '桌游', '手作', '运动', '城市探索'];
const PROFILE_PACE_OPTIONS = ['', '慢热安静', '自然随和', '热络外向', '需要独处缓冲'];
const PROFILE_PRIORITY_OPTIONS = ['', '空间与氛围', '少通勤', '准时可控', '新鲜体验', '预算友好', '好好吃饭'];
const PROFILE_CONVERSATION_OPTIONS = ['', '边做边聊', '深度聊天', '不用一直说话', '轻松闲聊'];
const PROFILE_ENERGY_OPTIONS = ['', '轻松低强度', '适中有变化', '活跃有参与感'];
const PROFILE_BUDGET_OPTIONS = ['', '预算优先', '体验优先', '平衡一点'];
const PROFILE_TRANSPORT_OPTIONS = ['', '地铁优先', '打车优先', '少走路', '可以骑行'];
const PROFILE_TIME_OPTIONS = ['', '准时可控', '可以随性延长', '早点结束'];
const PROFILE_AREA_OPTIONS = ['东城', '鼓楼', '三里屯', '亮马河', '798', '国贸', '望京', '前门', '海淀'];
const PROFILE_OCCASION_OPTIONS = ['第一次约会', '日常约会', '纪念日', '想认真聊聊', '临时起意'];
const WRAPUP_CHOICE_GROUPS = Object.freeze({
  more: {
    eyebrow: '下次偏好',
    title: '下次，多一点什么？',
    note: '这项反馈会和本次回顾一起用于后续推荐。',
    options: [
      { value: '安静聊天', description: '留更多空间慢慢聊', icon: 'chat' },
      { value: '新鲜体验', description: '安排一个没试过的小体验', icon: 'spark' },
      { value: '户外散步', description: '把更多时间留给走路和城市', icon: 'route' },
      { value: '认真吃饭', description: '优先选一顿值得专门去的饭', icon: 'dining' }
    ]
  },
  less: {
    eyebrow: '下次偏好',
    title: '下次，少一点什么？',
    note: '我们会优先避开让见面变得费力的部分。',
    options: [
      { value: '通勤', description: '地点更集中，少在路上折腾', icon: 'route' },
      { value: '排队', description: '优先可预约或等待更少的地方', icon: 'clock' },
      { value: '花费', description: '更重视预算和性价比', icon: 'wallet' },
      { value: '赶时间', description: '把节奏安排得更松弛', icon: 'timer' }
    ]
  },
  visibility: {
    eyebrow: '回忆隐私',
    title: '谁可以看到这段 Memory？',
    note: '这只影响回忆的可见范围，不影响偏好反馈。',
    options: [
      { value: 'couple', label: '我们可见', description: '你和 TA 都可以回看', icon: 'memory' },
      { value: 'private', label: '仅自己', description: '只保存在你的个人 Memory', icon: 'private' }
    ]
  }
});
const REPLACEMENT_OPTIONS = Object.freeze([
  { mode: 'same', label: '同类换一家', description: '保留当前场景，只换一个更合适的地点', icon: 'refresh' },
  { mode: 'different', label: '换一个完全不同的场景', description: '跳出当前类型，让行程更有变化', icon: 'spark' },
  { mode: 'activity', label: '换一种活动', description: '看展、手作、音乐、游戏等其他体验', icon: 'discover' },
  { mode: 'dinner', label: '换成吃饭', description: '安排一顿适合坐下来好好吃的饭', icon: 'dining' },
  { mode: 'outdoor', label: '换成散步或户外', description: '河边、公园、日落或城市闲逛', icon: 'route' },
  { mode: 'dessert', label: '换成咖啡甜品', description: '用更轻松的场景停留或收尾', icon: 'star' }
]);
const PLANNING_WORKFLOW = [
  { id: 'mood', title: '约见重点', hint: '先定下这次见面的主线', icon: 'spark' },
  { id: 'duration', title: '时间范围', hint: '决定节奏和安排数量', icon: 'clock' },
  { id: 'priority', title: '必须保留', hint: '锁定最重要的条件', icon: 'shield' }
];
const WORKFLOW_REPLY_HINTS = {
  priority: {
    '少通勤': '地点尽量集中，少在路上折腾',
    '少走路': '减少长距离步行、楼梯和频繁换乘',
    '环境安静': '优先选择能舒服聊天的空间',
    '室内舒适': '优先有座位、温度和天气更可控的地方',
    '不排队': '避开高峰和不确定的等待',
    '时间准点': '优先时长稳定、方便按计划结束的安排',
    '预算可控': '尽量留在设定预算内，避免临时加价',
    '有一点新鲜感': '保留一个没试过的小体验'
  }
};

function planningWorkflowSteps(conversation) {
  if (!conversation.theme) return PLANNING_WORKFLOW;
  return [
    {
      id: 'theme',
      title: '已选活动',
      hint: conversation.theme,
      icon: ideaIconName({ tag: conversation.theme, title: conversation.themeTitle })
    },
    ...PLANNING_WORKFLOW.slice(1)
  ];
}

const IDEA_MEDIA_BY_TAG = Object.freeze({
  '看展': { image: 'assets/gallery.jpg', alt: '展览空间的真实场景照片' },
  '散步': { image: 'assets/beijing-activities/liangma-river-youyi-bridge.jpg', alt: '北京亮马河友谊桥实景照片' },
  '咖啡': { image: 'assets/cafe.jpg', alt: '咖啡馆真实场景照片' },
  '晚餐': { image: 'assets/restaurant.jpg', alt: '餐厅用餐真实场景照片' },
  '日落': { image: 'assets/activity-scenes/beijing-forbidden-city-sunset.jpg', alt: '北京故宫黄昏与晚霞实景照片' },
  '音乐': { image: 'assets/vinyl-listening.jpg', alt: '黑胶唱片聆听空间真实场景照片' },
  '书店': { image: 'assets/bookstore-night.jpg', alt: '夜间书店真实场景照片' },
  '甜品': { image: 'assets/dessert-room.jpg', alt: '甜品与室内用餐真实场景照片' },
  '冰淇淋': { image: 'assets/gelato-street.jpg', alt: '街边冰淇淋约会真实场景照片' },
  '陶艺': { image: 'assets/activity-scenes/pottery-wheel.jpg', alt: '双手在陶轮上拉坯的陶艺实景照片' },
  '银饰手作': { image: 'assets/activity-scenes/silver-ring-making.jpg', alt: '工作台上制作银戒的手作实景照片' },
  '脱口秀': { image: 'assets/activity-scenes/comedy-stage.jpg', alt: '演员持麦克风进行脱口秀表演的真实场景照片', label: '活动场景图' },
  '密室': { image: 'assets/activity-scenes/escape-room.jpg', alt: '参与者使用线索道具进行密室解谜的真实场景照片', label: '活动场景图' },
  '桌游': { image: 'assets/activity-scenes/board-game-table.jpg', alt: '两人在木桌上操作棋子玩桌游的真实场景照片', label: '活动场景图' },
  '保龄球': { image: 'assets/activity-scenes/bowling-alley.jpg', alt: '参与者在保龄球馆投球的真实场景照片', label: '活动场景图' },
  '沉浸戏剧': { image: 'assets/activity-scenes/immersive-theater.jpg', alt: '观众在红幕剧场等待演出的真实场景照片', label: '活动场景图' },
  'K歌': { image: 'assets/activity-scenes/karaoke-room.jpg', alt: '两人手持麦克风一起唱歌的真实场景照片', label: '活动场景图' },
  '台球': { image: 'assets/activity-scenes/billiards-table.jpg', alt: '两人在室内台球桌旁击球的真实场景照片', label: '活动场景图' },
  '街机': { image: 'assets/activity-scenes/arcade-room.jpg', alt: '摆有多台游戏机的真实街机厅场景照片', label: '活动场景图' },
  '夜骑': { image: 'assets/activity-scenes/night-cycling.jpg', alt: '骑行者夜间沿城市道路结伴骑车的真实场景照片', label: '活动场景图' },
  '电影': { image: 'assets/activity-scenes/cinema-screen.jpg', alt: '影院银幕与座椅的真实场景照片', label: '活动场景图' },
  '烘焙': { image: 'assets/activity-scenes/baking-together.jpg', alt: '两人在厨房一起制作烘焙点心的真实场景照片', label: '活动场景图' }
});

const IDEA_MEDIA_TEXT_RULES = [
  [/(?:脱口秀|单口喜剧|开放麦)/, IDEA_MEDIA_BY_TAG['脱口秀']],
  [/(?:密室|逃脱|合作解谜)/, IDEA_MEDIA_BY_TAG['密室']],
  [/(?:桌游|棋盘游戏|卡牌游戏)/, IDEA_MEDIA_BY_TAG['桌游']],
  [/(?:保龄球|投球)/, IDEA_MEDIA_BY_TAG['保龄球']],
  [/(?:沉浸戏剧|沉浸式戏剧|沉浸演出)/, IDEA_MEDIA_BY_TAG['沉浸戏剧']],
  [/(?:K歌|唱歌|歌单|小包厢)/i, IDEA_MEDIA_BY_TAG['K歌']],
  [/(?:台球|桌球|开台)/, IDEA_MEDIA_BY_TAG['台球']],
  [/(?:街机|游戏厅|抓娃娃)/, IDEA_MEDIA_BY_TAG['街机']],
  [/(?:夜骑|夜间骑行|骑到城市)/, IDEA_MEDIA_BY_TAG['夜骑']],
  [/(?:电影|影院|电影院|观影)/, IDEA_MEDIA_BY_TAG['电影']],
  [/(?:烘焙|做蛋糕|做饼干|甜点制作|小甜点)/, IDEA_MEDIA_BY_TAG['烘焙']],
  [/(?:陶艺|拉坯|陶杯|陶器)/, IDEA_MEDIA_BY_TAG['陶艺']],
  [/(?:银饰|银戒|首饰手作|金工)/, IDEA_MEDIA_BY_TAG['银饰手作']],
  [/(?:北京日落|晚霞|黄昏)/, IDEA_MEDIA_BY_TAG['日落']],
  [/(?:黑胶|唱片|听音乐|现场音乐)/, IDEA_MEDIA_BY_TAG['音乐']]
];

const LEGACY_ROOT_URL = new URL('../', import.meta.url);
const ABSOLUTE_RESOURCE_PATTERN = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;

function runtimeAppUrl(path) {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const appPath = window.location.pathname.match(/^\/app\/app_[^/]+/)?.[0];
  const runtimeRoot = appPath
    ? `${window.location.origin}${appPath}/`
    : `${window.location.origin}/`;
  return new URL(normalizedPath, runtimeRoot).toString();
}

function legacyResourceUrl(value) {
  const source = String(value || '').trim();
  if (!source || ABSOLUTE_RESOURCE_PATTERN.test(source)) return source;
  if (/^\/?api\//.test(source)) return runtimeAppUrl(source);

  const normalizedPath = source
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/^legacy\//, '');
  return new URL(normalizedPath, LEGACY_ROOT_URL).toString();
}

const escapeHTML = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const selected = (value, current) => value === current ? 'selected' : '';
const checked = (value) => value ? 'checked' : '';
const motionEnabled = () => !reducedMotionQuery?.matches;

function uniqueProfileItems(items, limit = 12) {
  return [...new Set(items.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

function guestPreferenceTags(guest, limit = 6) {
  return uniqueProfileItems([
    ...(guest?.foodLikes || []),
    ...(guest?.dietaryNeeds || []),
    ...(guest?.activityLikes || []),
    guest?.socialPace,
    guest?.conversationStyle,
    guest?.energyLevel,
    guest?.planningPriority,
    guest?.budgetStyle,
    guest?.transportPreference,
    guest?.timePreference,
    ...(guest?.favoriteAreas || [])
  ], limit);
}

function sharedGuestPreferences(profile) {
  const preferenceItems = (guest) => uniqueProfileItems([
    ...(guest?.foodLikes || []),
    ...(guest?.activityLikes || []),
    guest?.socialPace,
    guest?.conversationStyle,
    guest?.energyLevel,
    guest?.planningPriority,
    guest?.budgetStyle,
    guest?.transportPreference,
    guest?.timePreference,
    ...(guest?.favoriteAreas || [])
  ], 30);
  const user = new Set(preferenceItems(profile?.guests?.user));
  return preferenceItems(profile?.guests?.partner).filter((item) => user.has(item)).slice(0, 8);
}

function combinedGuestConsiderations(profile) {
  return uniqueProfileItems([
    ...(profile?.guests?.user?.dietaryNeeds || []),
    ...(profile?.guests?.partner?.dietaryNeeds || []),
    ...(profile?.guests?.user?.activityAvoids || []),
    ...(profile?.guests?.partner?.activityAvoids || [])
  ], 10);
}

function guestProfileProgress(guest) {
  return [guest?.foodLikes?.length, guest?.dietaryNeeds?.length, guest?.activityLikes?.length, guest?.activityAvoids?.length, guest?.socialPace, guest?.conversationStyle, guest?.energyLevel, guest?.planningPriority, guest?.budgetStyle, guest?.transportPreference, guest?.timePreference, guest?.favoriteAreas?.length, guest?.occasionPreferences?.length, guest?.accessibilityNotes, guest?.notes]
    .filter(Boolean).length;
}

function guestProfilePercent(guest) {
  return Math.min(100, Math.round((guestProfileProgress(guest) / 12) * 100));
}

function guestProfileMetrics(guest) {
  const taste = (guest?.foodLikes?.length || 0) + (guest?.dietaryNeeds?.length || 0);
  const activities = (guest?.activityLikes?.length || 0) + (guest?.occasionPreferences?.length || 0);
  const rhythm = [guest?.socialPace, guest?.conversationStyle, guest?.energyLevel].filter(Boolean).length;
  const practical = [guest?.planningPriority, guest?.budgetStyle, guest?.transportPreference, guest?.timePreference, ...(guest?.favoriteAreas || [])].filter(Boolean).length;
  return { taste, activities, rhythm, practical };
}

function guestInsight(guest) {
  return profileLine([
    guest?.socialPace,
    guest?.conversationStyle,
    guest?.planningPriority,
    guest?.transportPreference,
    guest?.timePreference
  ], '还没有形成明确的约会节奏');
}

function updatedLabel(value) {
  if (!value) return '尚未完善';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '已保存';
  return `${date.getMonth() + 1}月${date.getDate()}日更新`;
}

function profileLine(values, empty = '') {
  const items = uniqueProfileItems(values || [], 5);
  return items.length ? items.join(' · ') : empty;
}

function splitProfileItems(value) {
  return uniqueProfileItems(String(value || '').split(/[、,，;；\n]/), 8);
}

function queueMicroMotion(motion) {
  pendingMicroMotion = motionEnabled() ? motion : null;
}

function closeModalWithMotion(onClosed) {
  const layer = document.querySelector('.modal-layer');
  if (!layer || !motionEnabled()) {
    onClosed();
    return;
  }
  let completed = false;
  let fallbackTimer = null;
  const handleAnimationEnd = (event) => {
    if (event.target === layer && event.animationName === 'backdrop-out') finish();
  };
  const finish = () => {
    if (completed) return;
    completed = true;
    clearTimeout(fallbackTimer);
    layer.removeEventListener('animationend', handleAnimationEnd);
    onClosed();
  };
  layer.classList.add('is-closing');
  layer.addEventListener('animationend', handleAnimationEnd);
  fallbackTimer = setTimeout(finish, 240);
}

function applyPendingMicroMotion() {
  const motion = pendingMicroMotion;
  pendingMicroMotion = null;
  if (!motion || !motionEnabled()) return;

  if (motion.type === 'toggle') {
    const toggle = document.querySelector(`.toggle[data-key="${motion.key}"]`);
    if (!toggle) return;
    toggle.style.setProperty('--toggle-from', motion.from ? '18px' : '0px');
    toggle.style.setProperty('--toggle-to', motion.to ? '18px' : '0px');
    toggle.style.setProperty('--toggle-bounce', motion.to ? '20px' : '-2px');
    toggle.style.setProperty('--toggle-bg-from', motion.from ? '#aa5b43' : '#dfcfc2');
    toggle.style.setProperty('--toggle-bg-to', motion.to ? '#aa5b43' : '#dfcfc2');
    toggle.classList.add('motion-change');
    return;
  }

  if (motion.type === 'segment') {
    const control = document.querySelector(`[data-slider-field="${motion.field}"]`);
    if (!control) return;
    control.style.setProperty('--previous-index', String(motion.fromIndex));
    if (control.dataset.sliderLayout === 'mood-grid') {
      control.style.setProperty('--previous-col', String(motion.fromIndex % 2));
      control.style.setProperty('--previous-row', String(Math.floor(motion.fromIndex / 2)));
    }
    control.classList.add('motion-change');
    return;
  }

  if (motion.type === 'nav-track') {
    const control = document.querySelector('.bottom-nav');
    if (!control) return;
    const activeIndex = Number(control.dataset.activeIndex || 0);
    const distance = Math.abs(activeIndex - motion.fromIndex);
    control.style.setProperty('--previous-index', String(motion.fromIndex));
    control.style.setProperty('--track-duration', `${Math.min(410, 300 + distance * 36)}ms`);
    control.classList.add('nav-motion-change');
    const items = [...control.querySelectorAll('.nav-item')];
    items[motion.fromIndex]?.classList.add('nav-from');
    items[activeIndex]?.classList.add('nav-to');
    return;
  }

  if (motion.type === 'choice-track') {
    const control = document.querySelector(`[data-choice-group="${motion.group}"]`);
    if (!control) return;
    const activeIndex = Number(control.dataset.activeIndex || 0);
    control.style.setProperty('--previous-index', String(motion.fromIndex));
    control.classList.add('motion-change');
    const items = [...control.querySelectorAll('button[data-value]')];
    items[motion.fromIndex]?.classList.add('choice-from');
    items[activeIndex]?.classList.add('choice-to');
    return;
  }

  if (motion.type === 'plan-card') {
    const card = [...document.querySelectorAll('.timeline-stop')]
      .find((item) => item.dataset.stopId === motion.stopId)
      ?.querySelector('.stop-card');
    card?.classList.add('item-updated');
    return;
  }

  if (motion.type === 'plan-list') {
    document.querySelector('.timeline')?.classList.add('list-updated');
    return;
  }

  if (motion.type === 'selection') {
    const control = [...document.querySelectorAll('[data-action="wrap-choice"]')]
      .find((item) => item.dataset.field === motion.field && item.dataset.value === motion.value);
    control?.classList.add('selection-updated');
    return;
  }

  if (motion.type === 'multi-select') {
    const control = [...document.querySelectorAll(`[data-action="${motion.action}"]`)]
      .find((item) => item.dataset.value === motion.value);
    control?.classList.add('selection-updated');
  }
}

function availablePlaces(state) {
  const places = state.places.mode === 'live' ? state.places.items : demoPlaces;
  return mapService.withMeetingDistances(places, state.meeting?.departures, state.maps.searchCenter);
}

function availableInspirations(state) {
  return state.agent.ideas?.length ? state.agent.ideas : inspirations;
}

function searchCenterForState(state) {
  if (state.maps.searchCenter) {
    return { ...state.maps.searchCenter, radiusKm: Number(state.maps.searchCenter.radiusKm || state.conditions.distance || 6) };
  }
  const meetingCenter = mapService.meetingCenterForDepartures(state.meeting?.departures, state.conditions.distance);
  if (meetingCenter) return meetingCenter;
  if (state.conditions.centerMode === 'current') return null;
  return mapService.searchCenterForConditions(state.conditions);
}

function rangeCenterLabel(conditions, searchCenter = null) {
  if (searchCenter?.source === 'couple-midpoint') return '双方中间区域';
  if (conditions.centerMode === 'current') {
    if (searchCenter?.source === 'current') return '当前位置';
    if (searchCenter?.source === 'area-fallback') return searchCenter.label;
    return '当前位置（正在定位）';
  }
  return searchCenter?.label || conditions.area || '北京东城区附近';
}

function recommendationFeedbackForState(state) {
  if (state.wrapup?.feedbackSubmittedAt) {
    return { more: state.wrapup.more || '', less: state.wrapup.less || '' };
  }
  const memoryWithFeedback = state.memories?.find((memory) => memory.feedback?.more || memory.feedback?.less);
  return memoryWithFeedback?.feedback || null;
}

function mapCandidates(state) {
  const category = state.ui.mapCategory || 'all';
  const searchCenter = searchCenterForState(state);
  const requestedDistance = Number(state.conditions.distance || 6);
  let effectiveDistance = Number(searchCenter?.radiusKm || requestedDistance);
  const centeredPlaces = availablePlaces(state).map((place) => {
    if (place.userDistanceKm != null && place.partnerDistanceKm != null) return place;
    const distance = searchCenter ? mapService.distanceFromCenter(place, searchCenter) : null;
    if (distance == null) return place;
    return {
      ...place,
      distanceKm: Number(distance.toFixed(1)),
      transport: `距范围中心约 ${distance.toFixed(1)} km`
    };
  });
  const selectedTheme = state.conversation.theme;
  const mainCategory = selectedTheme ? themeCategory(selectedTheme) : null;
  const rankAtDistance = (distance) => rankPlaces(centeredPlaces, { ...state.conditions, distance }, {
    theme: selectedTheme,
    preferredPlaceIds: state.conversation.preferredPlaceIds,
    priorities: aiPlannerService.priorityValuesFromAnswer(state.conversation.answers?.[2]),
    feedback: recommendationFeedbackForState(state)
  });
  let ranked = rankAtDistance(effectiveDistance);
  if (selectedTheme && !ranked.some((place) => place.category === mainCategory && placeMatchesTheme(place, selectedTheme))) {
    for (const radiusKm of getSearchRadii(Math.max(requestedDistance, effectiveDistance))) {
      effectiveDistance = radiusKm;
      ranked = rankAtDistance(radiusKm);
      if (ranked.some((place) => place.category === mainCategory && placeMatchesTheme(place, selectedTheme))) break;
    }
  }
  const themeScoped = selectedTheme
    ? ranked.filter((place) => place.category !== mainCategory || placeMatchesTheme(place, selectedTheme))
    : ranked;
  const results = (category === 'all' ? themeScoped : themeScoped.filter((place) => place.category === category)).slice(0, 30);
  results.searchDistanceKm = effectiveDistance;
  return results;
}

function placeDistanceLabel(place) {
  return mapService.meetingDistanceLabel(place);
}

function findPlace(state, placeId) {
  return state.currentPlan?.stops?.find((item) => item.id === placeId)
    || state.places.items.find((item) => item.id === placeId)
    || demoPlaces.find((item) => item.id === placeId);
}

function rangeProgress(value, min, max) {
  return Math.max(0, Math.min(100, ((Number(value) - min) / (max - min)) * 100));
}

function workflowRangeValueFromPointer(input, clientX) {
  const rect = input.getBoundingClientRect();
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Math.max(Number(input.step) || 1, Number.EPSILON);
  const thumbSize = 27;
  const trackStart = rect.left + thumbSize / 2;
  const trackWidth = Math.max(1, rect.width - thumbSize);
  const ratio = Math.max(0, Math.min(1, (clientX - trackStart) / trackWidth));
  const raw = min + ratio * (max - min);
  const snapped = min + Math.round((raw - min) / step) * step;
  const precision = String(step).includes('.') ? String(step).split('.')[1].length : 0;
  return Math.max(min, Math.min(max, Number(snapped.toFixed(precision))));
}

function updateWorkflowRangeFromPointer(input, clientX) {
  if (!input || !Number.isFinite(clientX)) return;
  const nextValue = workflowRangeValueFromPointer(input, clientX);
  if (Number(input.value) === nextValue) return;
  input.value = String(nextValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function rangeControl({ field, value, min, max, step, prefix = '', suffix = '', labels = [], name = field }) {
  const progress = rangeProgress(value, min, max);
  const durationField = field === 'duration';
  const normalizedValue = durationField ? durationHoursToMinutes(value) / 60 : value;
  const displayedValue = durationField ? formatDuration(durationHoursToMinutes(normalizedValue)) : value;
  return `<div class="range-control" data-range-wrap="${field}">
    <div class="range-value"><span>${prefix}</span><output data-range-output="${field}">${escapeHTML(displayedValue)}</output><span>${durationField ? '' : suffix}</span></div>
    <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${normalizedValue}" data-range-field="${field}" style="--range-progress:${rangeProgress(normalizedValue, min, max)}%" />
    <div class="range-labels">${labels.map((label) => `<span>${escapeHTML(label)}</span>`).join('')}</div>
  </div>`;
}

function sliderSegmented({ field, value, options, action = 'set-condition', name = '', layout = '' }) {
  const index = Math.max(0, options.findIndex((option) => (Array.isArray(option) ? option[0] : option) === value));
  const moodGrid = layout === 'mood-grid';
  const layoutClass = moodGrid ? ' mood-segmented' : '';
  const layoutStyle = moodGrid ? `;--active-col:${index % 2};--active-row:${Math.floor(index / 2)}` : '';
  return `<div class="slider-segmented${layoutClass}" style="--segment-count:${options.length};--active-index:${index}${layoutStyle}" data-slider-field="${field}" ${moodGrid ? 'data-slider-layout="mood-grid"' : ''}>
    <i class="slider-thumb" aria-hidden="true"></i>
    ${options.map((option) => {
      const optionValue = Array.isArray(option) ? option[0] : option;
      const label = Array.isArray(option) ? option[1] : option;
      const description = Array.isArray(option) ? option[2] : '';
      return `<button type="button" class="${optionValue === value ? 'active' : ''}" data-action="${action}" data-field="${field}" data-value="${escapeHTML(optionValue)}"><span>${escapeHTML(label)}</span>${description ? `<small>${escapeHTML(description)}</small>` : ''}</button>`;
    }).join('')}
    ${name ? `<input type="hidden" name="${name}" value="${escapeHTML(value)}" />` : ''}
  </div>`;
}

function moodSelector({ value, action = 'set-condition', name = '' }) {
  return `${sliderSegmented({ field: 'mood', value, options: moodSliderOptions(), action, name, layout: 'mood-grid' })}<p class="mood-selection-note"><strong>${escapeHTML(moodLabel(value))}</strong><span>${escapeHTML(moodDescription(value))}</span></p>`;
}

function priceDisplay(place) {
  if (['google', 'baidu', 'curated'].includes(place.source)) return place.priceLabel || '商家未提供价格';
  return `预算参考约 ¥${place.priceForTwo}`;
}

function formatDuration(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${rest} 分钟`;
  if (!rest) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分钟`;
}

function durationHoursToMinutes(hours) {
  return Math.max(60, Math.min(360, Math.round((Number(hours) || 3) * 60)));
}

function durationWorkflowHint(minutes) {
  const value = Math.max(60, Math.min(360, Number(minutes) || 180));
  if (value < 120) return '适合专注安排 1 个主要场景，并预留往返时间';
  if (value < 180) return '适合安排 2 站，控制通勤和等位时间';
  if (value < 240) return '吃饭和活动都能留出比较完整的时间';
  if (value < 300) return '可以安排 3 站，并留一点临时调整空间';
  return '适合安排一段更完整的活动，仍会控制总时长';
}

function clockLabel(totalMinutes) {
  const normalized = ((Number(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function placeSchedule(place) {
  if (place.schedule?.items?.length) return place.schedule;
  const duration = Math.max(30, Number(place.durationMin) || 90);
  const start = place.category === 'dinner' ? 19 * 60 : place.category === 'dessert' ? 20 * 60 + 30 : place.indoor ? 19 * 60 + 30 : 18 * 60 + 45;
  const arrivalLead = place.category === 'activity' ? 20 : 10;
  const activityLabel = place.category === 'dinner' ? '用餐' : place.category === 'dessert' ? '停留与聊天' : place.categoryLabel || '活动';
  return {
    basis: `建议安排 · 可按你选中的真实${place.category === 'activity' ? '场次' : '到店时间'}自动顺延`,
    needsConfirmation: Boolean(place.booking?.status === 'unknown' || place.priceIsEstimate),
    items: [
      { time: clockLabel(start - arrivalLead), title: '抵达与准备', detail: place.category === 'activity' ? '留出取票、存包或找入口的时间' : '到店、落座并确认当日供应' },
      { time: `${clockLabel(start)}–${clockLabel(start + duration)}`, title: activityLabel, detail: `${formatDuration(duration)}，节奏按两人偏好可适当缩短` },
      { time: clockLabel(start + duration + 10), title: '结束与下一步', detail: place.category === 'dinner' ? '可接散步或甜品，避免安排过满' : '预留返程，也可以临时再决定是否续一站' }
    ]
  };
}

function renderPlacePriceAndTime(place) {
  const schedule = placeSchedule(place);
  const numericPrice = Number(place.priceForTwo);
  const hasKnownPrice = Number.isFinite(numericPrice) && numericPrice >= 0;
  const twoPersonPrice = hasKnownPrice ? (numericPrice > 0 ? `¥${Math.round(numericPrice)}` : '免费') : '价格待确认';
  const priceTitle = place.priceIsEstimate ? `${twoPersonPrice} 参考` : twoPersonPrice;
  const durationTitle = Number(place.durationMin) > 0 ? formatDuration(place.durationMin) : '时长待确认';
  return `<section class="place-logistics-card card">
    <div class="section-row"><div><span class="eyebrow">PRICE · TIME</span><h2>价格和时间安排</h2></div>${schedule.needsConfirmation ? '<span class="detail-confirm-tag">出发前确认</span>' : '<span class="detail-confirm-tag ready">可直接参考</span>'}</div>
    <div class="place-logistics-summary">
      <div><span>${icon('wallet')}</span><small>两人费用</small><strong>${escapeHTML(priceTitle)}</strong><p>${escapeHTML(place.priceLabel || (place.priceIsEstimate ? '按当前公开资料估算' : '当前项目费用'))}</p></div>
      <div><span>${icon('clock')}</span><small>活动时长</small><strong>${escapeHTML(durationTitle)}</strong><p>${place.travelMin ? `另预留约 ${Math.round(place.travelMin)} 分钟前往` : '不含往返交通时间'}</p></div>
    </div>
    ${place.priceBreakdown?.length ? `<div class="price-breakdown">${place.priceBreakdown.map((item) => `<div><span>${escapeHTML(item.label)}</span><strong>${escapeHTML(item.value)}</strong></div>`).join('')}</div>` : ''}
    <div class="detail-schedule-heading"><strong>建议时间线</strong><span>${escapeHTML(schedule.basis || '按本次节奏安排')}</span></div>
    <div class="detail-schedule">${schedule.items.map((item) => `<div><time>${escapeHTML(item.time)}</time><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail || '')}</small></span></div>`).join('')}</div>
  </section>`;
}

function tonightDateLabel() {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
}

function finiteWeatherNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function renderWeatherCard(weatherState, compact = false) {
  if (weatherState?.status === 'loading' || weatherState?.status === 'idle') {
    return `<section class="weather-card card ${compact ? 'compact' : ''}"><div class="weather-glyph loading"><span class="spinner"></span></div><div><span class="eyebrow">北京 · 当天天气</span><strong>正在读取天气</strong><p>会根据体感、降雨和风力调整出行建议。</p></div></section>`;
  }
  if (weatherState?.status === 'error' || !weatherState?.data) {
    return `<section class="weather-card card ${compact ? 'compact' : ''}"><div class="weather-glyph">—</div><div><span class="eyebrow">北京 · 当天天气</span><strong>天气暂时没有更新</strong><p>建议出门前再看一次天气与实时路况。</p><button class="text-btn" data-action="refresh-weather">重新获取</button></div></section>`;
  }
  const weather = weatherState.data;
  const currentTemperature = finiteWeatherNumber(weather?.current?.temperature);
  const apparentTemperature = finiteWeatherNumber(weather?.evening?.maxApparentTemperature);
  const rainProbability = finiteWeatherNumber(weather?.evening?.rainProbability);
  const maxWindSpeed = finiteWeatherNumber(weather?.evening?.maxWindSpeed);
  const condition = String(weather?.evening?.condition || '').trim();
  const headline = [condition || '当天天气', currentTemperature == null ? '' : `${Math.round(currentTemperature)}°`].filter(Boolean).join(' · ');
  const details = [
    apparentTemperature == null ? '' : `体感最高约 ${Math.round(apparentTemperature)}°`,
    rainProbability == null ? '' : `降雨概率 ${Math.round(rainProbability)}%`,
    maxWindSpeed == null ? '' : `风速最高 ${Math.round(maxWindSpeed)} km/h`
  ].filter(Boolean);
  const observedAt = typeof weather?.observedAt === 'string' ? weather.observedAt.replace('T', ' ') : '';
  const source = String(weather?.source || '').trim();
  const sourceLine = [source ? `天气来源 ${source}` : '', observedAt].filter(Boolean).join(' · ');
  return `<section class="weather-card card ${compact ? 'compact' : ''}"><div class="weather-glyph">${weatherService.glyph(weather)}</div><div><span class="eyebrow">${escapeHTML(weather?.city || '北京')} · 当天</span><strong>${escapeHTML(headline)}</strong><p>${escapeHTML(details.length ? details.join(' · ') : '天气数据正在补全，出发前请再看一次实时天气。')}</p><small>${escapeHTML(sourceLine || '实时天气数据正在补全')}</small></div></section>`;
}

function renderPlanPrep(plan, weatherState) {
  const weather = weatherState?.data || null;
  const rainProbability = finiteWeatherNumber(weather?.evening?.rainProbability);
  const advice = dateAdviceService.forPlan(plan, weather);
  return `<section class="date-prep-card card"><div class="section-row"><div><span class="eyebrow">出发前准备</span><h2>天气、交通和穿搭一起看</h2></div><span>${rainProbability == null ? '天气待更新' : `${Math.round(rainProbability)}% 降雨`}</span></div>
    <div class="prep-summary"><strong>路线</strong><p>${escapeHTML(advice.summary.join(' '))}</p></div>
    <div class="prep-grid"><div><strong>穿搭</strong><p>${escapeHTML(advice.outfit.join(' '))}</p></div><div><strong>随身</strong><p>${escapeHTML(advice.carry.length ? advice.carry.join('、') : '手机、充电与预订信息')}</p></div></div>
    <div class="stop-advice-list">${advice.perStop.map(({ stop, advice: item }) => `<div><span>${escapeHTML(stop.start)}</span><strong>${escapeHTML(stop.name)}</strong><p>${escapeHTML(item.transport[0])}</p></div>`).join('')}</div>
    <p class="advice-note">以上由地点类型和天气生成，不代替百度地图实时路况或餐厅着装规定。</p>
  </section>`;
}

function renderPlacePrep(place, weatherState) {
  const weather = weatherState?.data || null;
  const currentTemperature = finiteWeatherNumber(weather?.current?.temperature);
  const weatherLabel = currentTemperature == null ? '天气待更新' : `${weatherService.glyph(weather)} ${Math.round(currentTemperature)}°`;
  const advice = dateAdviceService.forPlace(place, weather);
  return `<section class="place-prep-card card"><div class="section-row"><div><span class="eyebrow">去这里之前</span><h2>怎么去、怎么穿</h2></div><span>${weatherLabel}</span></div><div class="prep-grid"><div><strong>交通建议</strong><p>${escapeHTML(advice.transport.join(' '))}</p></div><div><strong>穿搭建议</strong><p>${escapeHTML(advice.outfit.join(' '))}</p></div></div>${advice.carry.length ? `<p class="carry-line"><strong>随身带：</strong>${escapeHTML(advice.carry.join('、'))}</p>` : ''}<p class="advice-note">出发前请再次查看实时路况、天气与商家通知。</p></section>`;
}

function showToast(message) {
  store.actions.setUI({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => store.actions.setUI({ toast: null }), 2400);
}

function showAccountRestoreToastOnce() {
  if (accountRestoreToastShown) return;
  accountRestoreToastShown = true;
  try {
    sessionStorage.setItem(ACCOUNT_RESTORE_TOAST_SESSION_KEY, '1');
  } catch {
    // Session storage is optional; the in-memory flag still prevents repeats.
  }
  showToast('已恢复账号中的偏好与 Memory');
}

function editingModalIsActive(state = store.getState()) {
  return Boolean(state.ui.modal && document.querySelector('.modal-layer form'));
}

function syncToastElement(message) {
  const shell = document.querySelector('.phone-shell');
  if (!shell) return;
  const current = shell.querySelector(':scope > .toast');
  if (!message) {
    current?.remove();
    return;
  }
  if (current?.textContent === message) return;
  current?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  const modal = shell.querySelector(':scope > .modal-layer');
  const indicator = shell.querySelector(':scope > .home-indicator');
  shell.insertBefore(toast, modal || indicator || null);
}

function renderUnlessEditing() {
  const state = store.getState();
  if (editingModalIsActive(state)) {
    syncToastElement(state.ui.toast);
    return;
  }
  render();
}

function captureScrollState() {
  const positions = [];
  STABLE_SCROLL_SELECTORS.forEach((selector) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      if (element.scrollTop || element.scrollLeft) {
        positions.push({ selector, index, top: element.scrollTop, left: element.scrollLeft });
      }
    });
  });
  return positions;
}

function restoreScrollState(positions) {
  positions.forEach(({ selector, index, top, left }) => {
    const element = document.querySelectorAll(selector)[index];
    if (!element) return;
    element.scrollTop = top;
    element.scrollLeft = left;
  });
}

function currentRoute() {
  const defaultRoute = store.getState().onboarding.completed ? 'tonight' : 'welcome';
  const raw = location.hash.replace(/^#\/?/, '').replace(/\/+$/, '') || defaultRoute;
  const [rawName, rawId] = raw.split('/');
  const aliasedName = ROUTE_ALIASES[rawName] || rawName;
  const name = APP_ROUTES.has(aliasedName) ? aliasedName : defaultRoute;
  let id;
  if (rawId) {
    try {
      id = decodeURIComponent(rawId);
    } catch {
      id = rawId;
    }
  }
  const canonical = id ? `${name}/${encodeURIComponent(id)}` : name;
  if (raw !== canonical) history.replaceState(null, '', `#/${canonical}`);
  return { name, id };
}

function go(route) {
  const target = route.startsWith('/') ? route : `/${route}`;
  if (location.hash === `#${target}`) render();
  else location.hash = target;
}

const ICON_FILES = Object.freeze({
  back: 'arrow-left',
  tonight: 'moon-star',
  memory: 'heart',
  discover: 'compass',
  compass: 'compass',
  me: 'circle-user-round',
  settings: 'settings-2',
  share: 'share-2',
  imagePlus: 'image-plus',
  video: 'video',
  close: 'x',
  spark: 'sparkles',
  location: 'map-pin',
  locationOff: 'map-pin-off',
  clock: 'clock-3',
  wallet: 'wallet-cards',
  route: 'route',
  search: 'search',
  edit: 'pencil',
  trash: 'trash-2',
  check: 'check',
  refresh: 'refresh-cw',
  send: 'send-horizontal',
  chevron: 'chevron-right',
  alert: 'triangle-alert',
  visible: 'eye',
  private: 'eye-off',
  direction: 'navigation',
  dining: 'utensils-crossed',
  timer: 'timer',
  price: 'badge-dollar-sign',
  date: 'calendar-days',
  chat: 'message-circle-heart',
  signal: 'signal',
  wifi: 'wifi',
  battery: 'battery-medium',
  external: 'external-link',
  shield: 'shield-check',
  offline: 'wifi-off',
  empty: 'circle-off',
  star: 'star'
});

function icon(name, className = '') {
  const file = ICON_FILES[name] || ICON_FILES.spark;
  const iconUrl = legacyResourceUrl(`assets/icons/${file}.svg`);
  return `<span class="ui-icon${className ? ` ${className}` : ''}" data-icon="${escapeHTML(name)}" style="--icon-url:url('${escapeHTML(iconUrl)}')" aria-hidden="true"></span>`;
}

function ideaIconName(idea) {
  const text = `${idea?.tag || ''} ${idea?.title || ''}`;
  if (/(晚餐|咖啡|甜品|冰淇淋|小酒馆)/.test(text)) return 'dining';
  if (/(散步|夜骑|公园|日落|城市探索)/.test(text)) return 'route';
  if (/(音乐|K歌|演出)/.test(text)) return 'star';
  if (/(桌游|密室|保龄球|台球|街机)/.test(text)) return 'spark';
  if (/(陶艺|银饰|手作|烘焙)/.test(text)) return 'edit';
  return idea?.group === 'culture' ? 'discover' : idea?.group === 'sport' ? 'route' : 'spark';
}

function ideaMedia(idea) {
  const tag = String(idea?.tag || '').trim();
  if (idea?.image) return {
    image: idea.image,
    alt: `${tag || '约会活动'}真实场景照片`,
    label: IDEA_MEDIA_BY_TAG[tag]?.label || null
  };
  if (IDEA_MEDIA_BY_TAG[tag]) return IDEA_MEDIA_BY_TAG[tag];
  const text = `${tag} ${idea?.title || ''}`;
  const matched = IDEA_MEDIA_TEXT_RULES.find(([pattern]) => pattern.test(text));
  if (matched) return matched[1];
  return null;
}

function ideaVisual(idea, { compact = false } = {}) {
  const media = ideaMedia(idea);
  const classes = ['idea-visual', idea?.group || 'slow', compact ? 'compact' : '', media ? 'has-photo' : 'no-photo'].filter(Boolean).join(' ');
  const tag = idea?.tag || '约会灵感';
  const fallback = '<span class="idea-photo-fallback"><small>暂无匹配实景</small></span>';
  const label = media?.label ? `<small class="idea-photo-label">${escapeHTML(media.label)}</small>` : '';
  return `<span class="${escapeHTML(classes)}">${media ? `<img src="${escapeHTML(legacyResourceUrl(media.image))}" alt="${escapeHTML(media.alt)}" loading="lazy" onerror="this.parentElement.classList.add('photo-failed');this.remove()"/>${fallback}${label}` : fallback}<i>${icon(ideaIconName(idea))}</i><b>${escapeHTML(tag)}</b></span>`;
}

function hasVerifiedPhoto(place) {
  return Boolean(place?.image && place?.photoVerified);
}

function hasPlanScenePhoto(place) {
  return Boolean(place?.sceneImage);
}

function photoSourceText(place) {
  return hasVerifiedPhoto(place)
    ? (place.photoSourceLabel || place.photoAttributions?.[0]?.displayName || '已核验地点图片')
    : '暂无可核验实景图';
}

function placeMedia(place, { className = '', showSource = false, tag = 'span', allowScene = false } = {}) {
  const verified = hasVerifiedPhoto(place);
  const scene = !verified && allowScene && hasPlanScenePhoto(place);
  const classes = ['place-media', verified ? 'verified-photo' : scene ? 'scene-photo' : 'no-photo', className].filter(Boolean).join(' ');
  const fallback = `<span class="place-photo-empty">${icon('empty')}<strong>暂无实景图</strong><small>不使用无关图片代替</small></span>`;
  const imageUrl = verified ? legacyResourceUrl(place.image) : scene ? legacyResourceUrl(place.sceneImage) : '';
  const sourceText = verified ? photoSourceText(place) : scene ? (place.sceneImageSourceLabel || '活动场景参考 · 非商家实拍') : photoSourceText(place);
  const shouldShowSource = showSource || scene;
  return `<${tag} class="${classes}">${verified || scene ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(scene ? `${place.name}相关活动场景参考` : place.name)}" loading="lazy" onerror="this.parentElement.classList.add('photo-failed')"/>${fallback}` : fallback}${shouldShowSource ? `<b class="place-photo-source${scene ? ' scene-source' : ''}">${escapeHTML(sourceText)}</b>` : ''}</${tag}>`;
}

function planPlaceMedia(place, options = {}) {
  return placeMedia(place, { ...options, allowScene: true });
}

function planPhotoPriority(place) {
  if (!hasVerifiedPhoto(place)) return hasPlanScenePhoto(place) ? 1 : 0;
  return ({ merchant: 5, interior: 5, 'venue-view': 5, official: 4, artwork: 3, poster: 2 }[place.imageKind] || 3);
}

function planVisualStops(plan) {
  return [...(plan?.stops || [])].sort((a, b) => planPhotoPriority(b) - planPhotoPriority(a));
}

function planMatchesTheme(plan) {
  if (!plan?.sourceTheme) return true;
  return plan.stops.some((stop) => placeMatchesTheme(stop, plan.sourceTheme));
}

function planDisplayTitle(plan) {
  if (planMatchesTheme(plan)) return plan.title;
  const labels = [...new Set(plan.stops.map((stop) => stop.categoryLabel).filter(Boolean))];
  if (labels.includes('散步') && labels.includes('脱口秀')) return '沿河走走，再看一场脱口秀';
  if (labels.length) return `本次安排：${labels.slice(0, 3).join(' · ')}`;
  return '一版符合当前条件的附近安排';
}

function clockMinutes(value) {
  const [hours, minutes] = String(value || '0:0').split(':').map(Number);
  return Math.max(0, (Number(hours) || 0) * 60 + (Number(minutes) || 0));
}

function localDayStart(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function planStopProgress(plan, now = new Date()) {
  const planDate = localDayStart(plan?.createdAt || now);
  const today = localDayStart(now);
  const dayDelta = Math.round((today.getTime() - planDate.getTime()) / 86400000);
  const nowMinutes = dayDelta * 1440 + now.getHours() * 60 + now.getMinutes();
  let dayOffset = 0;
  let previousStart = -1;
  const statuses = (plan?.stops || []).map((stop) => {
    let start = clockMinutes(stop.start);
    if (previousStart >= 0 && start < previousStart) dayOffset += 1440;
    previousStart = start;
    start += dayOffset;
    let end = clockMinutes(stop.end) + dayOffset;
    if (end <= start) end += 1440;
    const completed = Boolean(stop.arrivedAt || stop.completedAt);
    const active = Boolean(!completed && plan.accepted && nowMinutes >= start && nowMinutes < end);
    return { stop, completed, active, start, end };
  });
  const next = statuses.find((item) => !item.completed) || null;
  const completedCount = statuses.filter((item) => item.completed).length;
  return { statuses, next, completedCount, allCompleted: statuses.length > 0 && completedCount === statuses.length };
}

function renderPlanProgressNotice(plan, progress, presenceStatus = 'idle') {
  if (!plan.accepted) return '';
  if (progress.allCompleted) {
    return `<section class="plan-progress-notice complete card"><span>${icon('check')}</span><div><small>自动到达记录</small><strong>今天的地点都已识别</strong><p>没有打卡步骤。可以去回顾这次见面，也可以先补一张照片。</p></div><button class="btn primary" data-action="complete-date">去回顾</button></section>`;
  }
  if (!progress.next) return '';
  const hasCompletedStop = progress.completedCount > 0;
  const copy = presenceStatus === 'blocked'
    ? '定位权限没有开启，暂时不会自动记录到达。'
    : presenceStatus === 'disabled'
      ? '大致位置已关闭，开启后可自动识别到达。'
      : presenceStatus === 'unavailable'
        ? '当前位置暂时不可用，地图会在恢复后继续识别。'
        : progress.next.active
          ? `按时间预计正在体验，靠近地点后会自动记录。预计 ${escapeHTML(progress.next.stop.end)} 结束。`
          : hasCompletedStop
            ? `上一站已自动记录。${escapeHTML(progress.next.stop.start)} 前往下一站。`
            : `${escapeHTML(progress.next.stop.start)} 开始第一站，进入地点附近后自动记录。`;
  const needsSettings = ['blocked', 'disabled'].includes(presenceStatus);
  return `<section class="plan-progress-notice ${hasCompletedStop ? 'advance' : ''} card"><span>${icon(needsSettings ? 'locationOff' : hasCompletedStop ? 'navigation' : 'location')}</span><div><small>${needsSettings ? '自动识别未开启' : '沉浸式到达识别'}</small><strong>${escapeHTML(progress.next.stop.name)}</strong><p>${copy}</p></div><button class="btn secondary" ${needsSettings ? 'data-route="settings"' : `data-action="focus-next-stop" data-id="${escapeHTML(progress.next.stop.stopId)}"`}>${needsSettings ? '去开启' : hasCompletedStop ? '看下一站' : '查看'}</button></section>`;
}

function focusPlanStop(stopId) {
  const selector = `.timeline-stop[data-stop-id="${CSS.escape(String(stopId || ''))}"]`;
  document.querySelector(selector)?.scrollIntoView({ behavior: motionEnabled() ? 'smooth' : 'auto', block: 'center' });
}

function setPlanPresenceStatus(status) {
  if (store.getState().ui.planPresenceStatus === status) return;
  store.actions.setUI({ planPresenceStatus: status });
}

function clearPlanPresenceWatch() {
  stopPlanPresenceWatch?.();
  stopPlanPresenceWatch = null;
  planPresenceWatchKey = '';
}

function handlePlanPresenceLocation(location) {
  const state = store.getState();
  const plan = state.currentPlan;
  if (currentRoute().name !== 'plan' || !plan?.accepted || document.visibilityState === 'hidden') return;
  const accuracyMeters = Math.max(0, Number(location.accuracy) || 0);
  if (accuracyMeters > 800) {
    setPlanPresenceStatus('unavailable');
    return;
  }
  setPlanPresenceStatus('watching');
  const latestArrivalAt = Math.max(0, ...(plan.stops || []).map((stop) => Date.parse(stop.arrivedAt || stop.completedAt || '') || 0));
  if (latestArrivalAt && Date.now() - latestArrivalAt < 4 * 60 * 1000) return;
  const candidates = (plan.stops || [])
    .filter((stop) => stop.location && !stop.arrivedAt && !stop.completedAt)
    .map((stop) => ({ stop, distanceMeters: locationService.distanceMeters(stop, location) }))
    .filter((item) => Number.isFinite(item.distanceMeters))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
  const nearest = candidates[0];
  if (!nearest) return;
  const baseRadius = ['google', 'baidu', 'curated'].includes(nearest.stop.source) ? 180 : 280;
  const arrivalRadius = Math.min(420, Math.max(baseRadius, accuracyMeters * 1.25));
  if (nearest.distanceMeters > arrivalRadius) return;
  store.actions.recordPlanArrival(nearest.stop.stopId, { distanceMeters: nearest.distanceMeters, accuracyMeters });
  showToast(`已到达「${nearest.stop.name}」，约见已自动记下`);
}

function ensurePlanPresenceWatch() {
  const state = store.getState();
  const plan = state.currentPlan;
  const key = plan?.accepted ? String(plan.id || 'accepted-plan') : '';
  if (currentRoute().name !== 'plan' || !key || document.visibilityState === 'hidden') {
    clearPlanPresenceWatch();
    return;
  }
  if (!state.settings.locationEnabled) {
    clearPlanPresenceWatch();
    setPlanPresenceStatus('disabled');
    return;
  }
  if (stopPlanPresenceWatch && planPresenceWatchKey === key) return;
  clearPlanPresenceWatch();
  planPresenceWatchKey = key;
  stopPlanPresenceWatch = locationService.watch(handlePlanPresenceLocation, (error) => {
    setPlanPresenceStatus(error?.code === 1 ? 'blocked' : 'unavailable');
  });
  setPlanPresenceStatus('watching');
}

function statusBar(photo = false) {
  return `<div class="status-bar ${photo ? 'on-photo' : ''}" aria-hidden="true">
    <span>9:41</span><span class="status-symbols">${icon('signal')}${icon('wifi')}${icon('battery')}</span>
  </div>`;
}

function topBar({ title = '', back = false, photo = false, action = '' } = {}) {
  return `<header class="top-bar ${photo ? 'on-photo' : ''}">
    ${back ? `<button class="icon-btn ${photo ? 'glass' : ''}" data-action="back" aria-label="返回">${icon('back')}</button>` : '<span class="top-spacer"></span>'}
    <strong>${escapeHTML(title)}</strong>
    ${action || '<span class="top-spacer"></span>'}
  </header>`;
}

function bottomNav(active) {
  const items = [
    ['tonight', '约见', icon('tonight')],
    ['discover', '一起做', icon('discover')],
    ['memory', '回忆', icon('memory')],
    ['profile', '我们', icon('me')]
  ];
  const activeIndex = Math.max(0, items.findIndex(([route]) => route === active));
  return `<nav class="bottom-nav" style="--active-index:${activeIndex};--nav-count:${items.length}" data-active-index="${activeIndex}" aria-label="主导航">
    <i class="nav-selection" aria-hidden="true"></i>
    ${items.map(([route, label, glyph]) => `<button class="nav-item ${active === route ? 'active' : ''}" data-route="${route}" aria-current="${active === route ? 'page' : 'false'}"><span class="nav-icon">${glyph}</span><span class="nav-label">${label}</span></button>`).join('')}
  </nav>`;
}

function appFrame(content, { active = null, className = '', photoStatus = false, fixedAction = '' } = {}) {
  const state = store.getState();
  return `<div class="app-stage"><div class="phone-shell ${className}">
    ${statusBar(photoStatus)}
    ${!navigator.onLine ? `<div class="offline-banner"><span>当前离线，草稿与已有计划仍可使用</span><button data-route="states">查看</button></div>` : ''}
    <div class="screen">${content}</div>
    ${fixedAction}
    ${active ? bottomNav(active) : ''}
    ${renderModal(state)}
    <div class="home-indicator" aria-hidden="true"></div>
  </div></div>`;
}

function conditionPills(conditions, editable = false, theme = null) {
  const pills = [
    theme ? `已选 · ${theme}` : moodLabel(conditions.mood),
    `¥${conditions.budget} 内`,
    `每人 ≤ ${conditions.distance} km`,
    formatDuration(durationHoursToMinutes(conditions.duration))
  ];
  return `<div class="pill-row ${editable ? 'editable' : ''}">
    ${pills.map((pill) => `<span class="pill">${escapeHTML(pill)}</span>`).join('')}
    ${editable ? `<button class="pill pill-edit" data-action="open-conditions">${icon('edit')} 编辑</button>` : ''}
  </div>`;
}

function renderWelcome() {
  return appFrame(`
    <main class="welcome-page">
      <header class="welcome-header">
        <div class="welcome-brand"><span>${icon('spark')}</span><strong>约见</strong></div>
        <button class="welcome-login" data-action="open-auth" data-mode="login">登录</button>
      </header>

      <section class="welcome-intro">
        <span class="welcome-kicker">${escapeHTML(tonightDateLabel())} · 北京</span>
        <h1>把这次见面，<br/><em>安排得更轻松。</em></h1>
        <p>选择想做的活动，约见会帮你们找到合适的地点，排好路线和时间。</p>
      </section>

      <section class="welcome-showcase" aria-label="约见如何安排一次见面">
        <article class="welcome-showcase-card">
          <img src="${escapeHTML(legacyResourceUrl('assets/beijing-memories/cafe-kitsune-sanlitun.jpg'))}" alt="北京三里屯咖啡馆真实空间" />
          <div class="welcome-showcase-label"><span>${icon('spark')} 为两个人生成</span><small>北京 · 三里屯</small></div>
          <div class="welcome-showcase-copy">
            <span>一份清楚的见面计划</span>
            <strong>选活动、找地点，<br/>再排一条顺路的行程。</strong>
            <div class="welcome-flow" aria-label="约见规划流程">
              <span><i>01</i>一起选</span>
              <span><i>02</i>找到店</span>
              <span><i>03</i>排好路</span>
            </div>
          </div>
        </article>
      </section>

      <div class="welcome-value"><span>${icon('heart')}</span><p><strong>每次见面都会留下线索</strong><small>记住你们喜欢什么，让下一次更懂你们。</small></p></div>

      <section class="welcome-actions">
        <button class="welcome-primary" data-action="begin-onboarding"><span>开始规划这次见面</span>${icon('chevron')}</button>
        <button class="welcome-secondary" data-route="discover">看看情侣必做的 100 件事</button>
      </section>
    </main>`, { className: 'welcome' });
}

function departureLocationCard(state, guest) {
  const partner = guest === 'partner';
  const location = state.meeting?.departures?.[guest];
  const status = state.meeting?.locationStatus?.[guest] || 'idle';
  const title = partner ? 'TA 从哪里出发' : '你从哪里出发';
  const placeholder = partner ? '例如：望京、通州北苑、国贸' : '例如：三里屯、海淀黄庄、鼓楼';
  const busy = ['locating', 'searching'].includes(status);
  return `<article class="departure-card ${location ? 'ready' : ''}">
    <div class="departure-card-head"><span class="departure-person">${partner ? 'TA' : '你'}</span><div><small>${partner ? '伴侣的位置' : '我的位置'}</small><strong>${escapeHTML(title)}</strong></div>${location ? `<button type="button" data-action="clear-departure" data-guest="${guest}">修改</button>` : ''}</div>
    ${location ? `<div class="departure-ready"><span>${icon('check')}</span><div><strong>${escapeHTML(location.label)}</strong><small>${location.source === 'current' ? '已读取设备当前位置' : '已定位到这个区域'}</small></div></div>` : `<div class="departure-actions">
      ${partner ? '<p class="departure-note">TA 在身边时可以用这台设备定位；不在一起时，填写 TA 当前所在的街区或地铁站。</p>' : ''}
      <button type="button" class="departure-current" data-action="use-current-departure" data-guest="${guest}" ${busy ? 'disabled' : ''}>${icon('location')} ${status === 'locating' ? '正在获取位置…' : (partner ? 'TA 在身边，用这台设备定位' : '使用我的当前位置')}</button>
      <div class="departure-search"><input data-departure-input="${guest}" value="" placeholder="${escapeHTML(placeholder)}" aria-label="${escapeHTML(title)}"/><button type="button" data-action="search-departure" data-guest="${guest}" ${busy ? 'disabled' : ''}>${status === 'searching' ? '定位中…' : '确定'}</button></div>
    </div>`}
  </article>`;
}

function renderOnboarding(state) {
  const step = state.onboarding.step;
  const progress = `<div class="step-progress" aria-label="引导进度">${[0, 1, 2, 3].map((item) => `<i class="${item <= step ? 'active' : ''}"></i>`).join('')}</div>`;
  if (step === 0) return renderWelcome();

  if (step === 1) {
    const userLocation = state.meeting?.departures?.user;
    const partnerLocation = state.meeting?.departures?.partner;
    const bothReady = Boolean(userLocation && partnerLocation);
    const separationKm = bothReady ? locationService.separationKm(state.meeting.departures) : null;
    return appFrame(`
      ${topBar({ title: '双方出发位置', back: true })}
      <main class="page with-top no-bottom departure-page">
        <div class="section-heading">${progress}<span class="eyebrow">约见 · 2 / 4</span><h1>先确认两个人的<br/>当前出发位置。</h1><p>百度地图会先搜索双方中间区域，再分别计算两个人到每个地点的距离。</p></div>
        <section class="departure-grid">
          ${departureLocationCard(state, 'user')}
          ${departureLocationCard(state, 'partner')}
        </section>
        <section class="departure-method card ${bothReady ? 'ready' : ''}">
          <span>${icon(bothReady ? 'check' : 'route')}</span>
          <div><strong>${bothReady ? `两人相距约 ${separationKm} km` : '设置完成后这样筛选'}</strong><p>${bothReady ? `优先搜索双方中间区域，并控制每个人到地点的距离不超过你们设定的范围。` : '以中间区域为搜索中心，再分别计算你和 TA 到每个地点的距离；优先距离差小、双方都能接受的选项。'}</p></div>
        </section>
        <p class="departure-privacy">${icon('shield')} 位置只用于本次地点匹配，不会出现在公开内容里。</p>
      </main>`, {
        fixedAction: `<div class="fixed-actions single"><button class="btn primary full" data-action="${state.onboarding.completed ? 'save-departures' : 'onboarding-location-next'}" ${bothReady ? '' : 'disabled'}>${bothReady ? (state.onboarding.completed ? '保存位置并返回' : '继续设置约见偏好') : '请先设置两个人的位置'}</button></div>`
      });
  }

  if (step === 2) {
    const c = state.conditions;
    return appFrame(`
      ${topBar({ title: '约见偏好', back: true })}
      <main class="page with-top no-bottom preference-page">
        <div class="section-heading">${progress}<span class="eyebrow">约见 · 3 / 4</span><h1>再定一个双方都舒服的范围。</h1><p>这里的距离是每个人到约会地点的最大距离，不再是单一圆心半径。</p></div>
        <section class="choice-section"><div class="section-row"><h2>这次更想把重点放在哪？</h2><span>选一个最想要的</span></div>${moodSelector({ value: c.mood })}</section>
        <section class="choice-section"><div class="section-row"><h2>两人总预算</h2><span>拖动滑块</span></div>${rangeControl({ field: 'budget', value: c.budget, min: 200, max: 1200, step: 50, prefix: '¥', labels: ['轻松一点', '留有余量', '认真安排'] })}</section>
        <section class="choice-section"><div class="section-row"><h2>每个人最多愿意走多远</h2><span>分别计算双方距离</span></div>${rangeControl({ field: 'distance', value: c.distance, min: 1, max: 40, step: 1, suffix: ' km', labels: ['附近', '跨城区', '远一点也行'] })}</section>
        <section class="choice-section"><div class="section-row"><h2>这次留出多久</h2><span>5 分钟一档 · 包含通勤</span></div>${rangeControl({ field: 'duration', value: c.duration, min: 1, max: 6, step: 0.0833333333, labels: ['1 小时', '3 小时 30 分', '6 小时'] })}</section>
        <section class="choice-section"><div class="section-row"><h2>饮食需要</h2><span>可跳过</span></div><div class="pill-row">${preferenceOptions.dietary.map((value) => `<button class="pill ${c.dietary.includes(value) ? 'active' : ''}" data-action="toggle-dietary" data-value="${value}">${value}</button>`).join('')}</div></section>
      </main>`, {
        fixedAction: `<div class="fixed-actions single"><button class="btn primary full" data-action="onboarding-next">继续</button></div>`
      });
  }

  return appFrame(`
    ${topBar({ title: '边界与记忆', back: true })}
    <main class="page with-top no-bottom privacy-intro">
      <div class="section-heading">${progress}<span class="eyebrow">约见 · 4 / 4</span><h1>让推荐变准，也让边界一直清楚。</h1></div>
      <section class="invite-card card"><span class="eyebrow">你们的邀请码</span><strong>${escapeHTML(state.onboarding.inviteCode)}</strong><p>只有你主动分享后，TA 才会收到。你也可以先完善两个人的偏好档案。</p><button class="btn secondary" data-action="share-invite">邀请伴侣一起使用</button></section>
      <section class="promise-list">
        <article><span>${icon('check')}</span><div><strong>共同偏好可查看、可纠正</strong><p>不会用“默契分数”评价你们的关系。</p></div></article>
        <article><span>${icon('check')}</span><div><strong>只保存你确认的 Memory</strong><p>结束后的反馈也可以只用于下次推荐。</p></div></article>
        <article><span>${icon('check')}</span><div><strong>高风险动作始终二次确认</strong><p>预订、付款、邀请和删除都不会自动发生。</p></div></article>
      </section>
      <label class="consent-line ${state.ui.onboardingConsent ? 'checked' : ''}"><input type="checkbox" data-onboarding-consent ${checked(state.ui.onboardingConsent)} /> <span><strong>我已了解并确认</strong><small>这些设置之后都能在“管家设置”中更改</small></span></label>
    </main>`, {
      fixedAction: `<div class="fixed-actions single"><button class="btn primary full" data-action="finish-onboarding" ${state.ui.onboardingConsent ? '' : 'disabled'}>${state.ui.onboardingConsent ? '开始使用' : '请先确认以上说明'}</button></div>`
    });
}

function renderTonight(state) {
  const c = state.conditions;
  const hasBothDepartures = Boolean(state.meeting?.departures?.user && state.meeting?.departures?.partner);
  const rangeCenter = hasBothDepartures ? '双方通勤上限' : c.centerMode === 'current' ? '当前位置为中心' : `以${c.area}为中心`;
  return appFrame(`
    <header class="tonight-header"><div><span>${escapeHTML(tonightDateLabel())} · 北京</span><strong>约见</strong></div><button class="icon-btn" data-route="settings" aria-label="管家设置">${icon('settings')}</button></header>
    <main class="tonight-page has-bottom-nav">
      <section class="tonight-intro"><h1>今天，留一点时间<br/>给彼此。</h1><p>告诉我们你们想要的感觉，地点、顺序和时间交给约见。</p></section>
      ${!state.settings.locationEnabled ? `<button class="recovery-strip" data-route="states"><span>${icon('location')}</span><span><strong>定位暂未开启</strong><small>仍可使用“${escapeHTML(c.area)}”规划</small></span><b>查看</b></button>` : ''}
      <button class="tonight-feature" data-action="start-planning">
        <img src="${escapeHTML(legacyResourceUrl('assets/beijing-memories/cafe-kitsune-sanlitun.jpg'))}" alt="北京三里屯咖啡馆真实空间" />
        <span class="tonight-feature-copy"><small>这次从这里开始</small><strong>一起决定，这次怎么过。</strong><em>开始规划 ${icon('chevron')}</em></span>
      </button>
      <section class="tonight-facts">
        <button data-action="refresh-weather"><span>${icon('clock')}</span><div><small>当天气候</small><strong>${state.weather?.data?.temperature != null ? `${Math.round(state.weather.data.temperature)}°` : '查看天气'}</strong></div></button>
        <button data-action="open-conditions"><span>${icon('wallet')}</span><div><small>两人预算</small><strong>¥${c.budget}</strong></div></button>
        <button data-action="open-conditions"><span>${icon('location')}</span><div><small>${escapeHTML(rangeCenter)}</small><strong>${c.distance} km${hasBothDepartures ? ' / 人' : ''}</strong></div></button>
        <button data-action="open-conditions"><span>${icon('spark')}</span><div><small>相处方式</small><strong>${escapeHTML(moodLabel(c.mood))}</strong></div></button>
      </section>
      <section class="preview-section"><div class="section-row"><div><span class="eyebrow">一起完成的 100 件事</span><h2>为你们挑一件</h2></div><button class="text-btn" data-route="discover">查看清单</button></div>
        <div class="horizontal-cards">${inspirations.slice(0, 3).map((idea) => `<button class="image-card idea-preview-card" data-action="plan-theme" data-id="${idea.id}">${ideaVisual(idea, { compact: true })}<span>${escapeHTML(idea.title)}</span></button>`).join('')}</div>
      </section>
    </main>`, { active: 'tonight', className: 'home' });
}

function workflowAnswerLabel(question, answer) {
  if (question.id === 'theme') return answer;
  if (question.id === 'mood') return moodLabel(answer);
  if (question.id === 'duration') return formatDuration(aiPlannerService.durationMinutesFromAnswer(answer));
  if (question.id === 'priority') {
    const priorities = aiPlannerService.priorityValuesFromAnswer(answer);
    return priorities.length ? priorities.join(' · ') : '还没选择';
  }
  return answer;
}

function workflowReplyHint(question, reply) {
  if (question.id === 'theme') return '活动已从你们的共同清单带入，接下来只需要完善时间和必要条件';
  if (question.id === 'mood') return moodDescription(reply);
  if (question.id === 'duration') return durationWorkflowHint(aiPlannerService.durationMinutesFromAnswer(reply));
  return WORKFLOW_REPLY_HINTS[question.id]?.[reply] || '';
}

function renderWorkflowStepper(conversation, generating) {
  const completedCount = conversation.answers.length;
  const workflow = planningWorkflowSteps(conversation);
  return `<nav class="workflow-stepper" aria-label="约见规划进度">
    ${workflow.map((step, index) => {
      const complete = index < completedCount;
      const active = !generating && conversation.step === index;
      const available = index <= Math.min(completedCount, PLANNING_WORKFLOW.length - 1);
      return `<button type="button" class="workflow-step ${complete ? 'complete' : ''} ${active ? 'active' : ''}" data-action="workflow-step" data-step="${index}" ${available && !generating ? '' : 'disabled'} aria-current="${active ? 'step' : 'false'}">
        <span class="workflow-step-number">${complete ? icon('check') : index + 1}</span>
        <span><strong>${escapeHTML(step.title)}</strong><small>${escapeHTML(step.hint)}</small></span>
      </button>`;
    }).join('')}
  </nav>`;
}

function renderWorkflowSlider(conversation, question, selectedAnswer) {
  if (question.id === 'priority') {
    const selectedPriorities = aiPlannerService.priorityValuesFromAnswer(selectedAnswer);
    const selectedAnswerValue = aiPlannerService.priorityAnswerFromValues(selectedPriorities);
    const selectedLabel = selectedPriorities.length ? selectedPriorities.join(' · ') : '还没有选择';
    const selectedHint = selectedPriorities.length
      ? '这些偏向会同时参与地点筛选、排序和方案组合。'
      : '可以同时选择多项，至少选择 1 项。';
    return `<div class="workflow-priority-picker" data-priority-picker>
      <div class="workflow-priority-current ${selectedPriorities.length > 1 ? 'has-many' : ''}"><span data-priority-count>${selectedPriorities.length ? `已选择 ${selectedPriorities.length} 项` : '可多选'}</span><strong data-priority-label>${escapeHTML(selectedLabel)}</strong><p data-priority-hint>${escapeHTML(selectedHint)}</p></div>
      <input type="hidden" data-priority-value value="${escapeHTML(selectedAnswerValue)}"/>
      <div class="workflow-options priority-workflow-options">${question.replies.map((reply) => {
        const active = selectedPriorities.includes(reply);
        return `<button type="button" class="workflow-option ${active ? 'active' : ''}" data-action="workflow-priority-set" data-value="${escapeHTML(reply)}" aria-pressed="${active}"><span class="workflow-option-check">${icon('check')}</span><span><strong>${escapeHTML(reply)}</strong><small>${escapeHTML(workflowReplyHint(question, reply))}</small></span></button>`;
      }).join('')}</div>
      <button type="button" class="btn primary full workflow-priority-confirm" data-action="workflow-priority-confirm" ${selectedPriorities.length ? '' : 'disabled'}>${selectedPriorities.length ? `确认这 ${selectedPriorities.length} 个偏向` : '请至少选择 1 项'}</button>
    </div>`;
  }
  if (question.id === 'duration') {
    const selectedMinutes = selectedAnswer
      ? aiPlannerService.durationMinutesFromAnswer(selectedAnswer)
      : durationHoursToMinutes(store.getState().conditions.duration);
    const progress = ((selectedMinutes - question.min) / (question.max - question.min)) * 100;
    return `<div class="workflow-slider duration-workflow-slider" data-workflow-slider data-duration-slider style="--workflow-progress:${progress}%">
      <div class="workflow-slider-value"><span>当前选择</span><output data-workflow-value>${escapeHTML(formatDuration(selectedMinutes))}</output><p data-workflow-hint>${escapeHTML(durationWorkflowHint(selectedMinutes))}</p></div>
      <input type="range" min="${question.min}" max="${question.max}" step="${question.step}" value="${selectedMinutes}" data-workflow-range data-workflow-step="${conversation.step}" aria-label="${escapeHTML(question.text)}" aria-valuetext="${escapeHTML(formatDuration(selectedMinutes))}"/>
      <div class="workflow-duration-scale" aria-hidden="true"><span>1 小时</span><span>3 小时 30 分</span><span>6 小时</span></div>
      <p class="workflow-minute-note">每次滑动调整 5 分钟，规划总时长包含站点停留和站间通勤。</p>
      <button type="button" class="btn primary full workflow-slider-confirm" data-action="workflow-slider-confirm">选这个，下一步</button>
    </div>`;
  }
  const fallbackIndex = question.id === 'duration' ? Math.min(1, question.replies.length - 1) : 0;
  const selectedIndex = question.replies.includes(selectedAnswer) ? question.replies.indexOf(selectedAnswer) : fallbackIndex;
  const selectedReply = question.replies[selectedIndex];
  const label = workflowAnswerLabel(question, selectedReply);
  const hint = workflowReplyHint(question, selectedReply);
  const progress = question.replies.length > 1 ? (selectedIndex / (question.replies.length - 1)) * 100 : 0;
  return `<div class="workflow-slider" data-workflow-slider style="--workflow-progress:${progress}%;--workflow-count:${question.replies.length}">
    <div class="workflow-slider-value"><span>当前选择</span><output data-workflow-value>${escapeHTML(label)}</output><p data-workflow-hint>${escapeHTML(hint)}</p></div>
    <input type="range" min="0" max="${question.replies.length - 1}" step="1" value="${selectedIndex}" data-workflow-range data-workflow-step="${conversation.step}" aria-label="${escapeHTML(question.text)}"/>
    <div class="workflow-slider-scale">${question.replies.map((reply, index) => `<button type="button" class="${index === selectedIndex ? 'active' : ''}" data-action="workflow-slider-set" data-index="${index}" aria-label="选择${escapeHTML(workflowAnswerLabel(question, reply))}"><i></i><strong>${escapeHTML(workflowAnswerLabel(question, reply))}</strong></button>`).join('')}</div>
    <button type="button" class="btn primary full workflow-slider-confirm" data-action="workflow-slider-confirm">选这个，下一步</button>
  </div>`;
}

function renderWorkflowQuestion(conversation, question) {
  const stepMeta = planningWorkflowSteps(conversation)[conversation.step];
  if (question.id === 'theme') {
    const themeTitle = conversation.themeTitle || conversation.theme;
    return `<section class="workflow-card workflow-theme-card card" aria-live="polite">
      <div class="workflow-card-heading">
        <span class="workflow-card-icon">${icon(stepMeta.icon)}</span>
        <div><span class="eyebrow">第 1 步 · 活动已确定</span><h2>这次就安排「${escapeHTML(conversation.theme)}」</h2></div>
      </div>
      <div class="workflow-theme-lock"><span>${icon(stepMeta.icon)}</span><div><small>从共同清单带入</small><strong>${escapeHTML(themeTitle)}</strong><p>不会再让你重新选择活动类型；接下来只设置时间、距离和必须保留的条件。</p></div></div>
      <div class="workflow-theme-actions"><button type="button" class="btn secondary" data-action="change-theme">换一个活动</button><button type="button" class="btn primary" data-action="workflow-theme-confirm">继续设置时间</button></div>
    </section>`;
  }
  const selectedAnswer = conversation.answers[conversation.step] || (question.id === 'mood' ? store.getState().conditions.mood : '');
  return `<section class="workflow-card card" aria-live="polite">
    <div class="workflow-card-heading">
      <span class="workflow-card-icon">${icon(stepMeta.icon)}</span>
      <div><span class="eyebrow">第 ${conversation.step + 1} 步 · ${escapeHTML(stepMeta.title)}</span><h2>${escapeHTML(question.text)}</h2></div>
    </div>
    ${renderWorkflowSlider(conversation, question, selectedAnswer)}
    <form class="workflow-note" id="chatForm">
      <label for="chatText">没有合适选项？自己补充一句</label>
      <div><input id="chatText" name="message" autocomplete="off" maxlength="120" placeholder="例如：想轻松一点，但不要太吵"/><button type="submit" aria-label="提交补充">${icon('send')}</button></div>
    </form>
  </section>`;
}

function renderWorkflowReview(conversation, generating) {
  const workflow = planningWorkflowSteps(conversation);
  return `<section class="workflow-review card" aria-live="polite">
    <div class="workflow-review-heading"><span class="workflow-card-icon">${icon('check')}</span><div><span class="eyebrow">确认方案</span><h2>这些就是本次规划重点</h2></div></div>
    <div class="workflow-review-list">
      ${workflow.map((step, index) => {
        const question = aiPlannerService.getQuestion(index, conversation.theme);
        const answer = conversation.answers[index] || (question.id === 'theme' ? conversation.theme : '还没选择');
        return `<button type="button" data-action="workflow-step" data-step="${index}" ${generating ? 'disabled' : ''}><span>${icon(step.icon)}</span><span><small>${escapeHTML(step.title)}</small><strong>${escapeHTML(workflowAnswerLabel(question, answer))}</strong></span><em>${question.id === 'theme' ? '查看' : '修改'} ${icon('chevron')}</em></button>`;
      }).join('')}
    </div>
    ${generating ? `<div class="generation-card"><span class="spinner"></span><div><strong>${escapeHTML(conversation.status)}</strong><p>正在结合你们的偏好档案、天气和候选地点。</p></div></div>` : `<button class="btn primary full workflow-generate" data-action="generate-plan">按这些条件生成方案</button>`}
  </section>`;
}

function renderConversation(state) {
  const conversation = state.conversation;
  const count = aiPlannerService.getQuestionCount();
  const generating = !['idle', 'complete'].includes(conversation.status);
  const completeQuestions = conversation.step >= count;
  const question = aiPlannerService.getQuestion(conversation.step, conversation.theme);
  return appFrame(`
    ${topBar({ title: '规划这次约见', back: true })}
    <section class="conversation-ribbon planner-ribbon"><div class="planner-ribbon-mark">${icon('spark')}</div><div class="planner-ribbon-copy"><span class="eyebrow">${conversation.theme ? '活动已选好 · 接着完善安排' : '这次想怎么过'}</span><h1>${conversation.themeTitle ? escapeHTML(conversation.themeTitle) : '先选这次最想保留的重点。'}</h1></div></section>
    <main class="conversation-page workflow-page no-bottom">
      ${conditionPills(state.conditions, true, conversation.theme)}
      ${renderWorkflowStepper(conversation, generating)}
      <div class="planner-tool-row"><button type="button" data-route="map-explore">${icon('location')} 在地图上筛选地点</button><span>${conversation.preferredPlaceIds?.length ? `已选 ${conversation.preferredPlaceIds.length} 个候选` : '可先看地点分布'}</span></div>
      ${completeQuestions ? renderWorkflowReview(conversation, generating) : renderWorkflowQuestion(conversation, question)}
    </main>`);
}

function planStopCard(stop, canDelete, status = {}, accepted = false) {
  const providerBadge = stop.source === 'google' ? 'Google Maps 地点' : stop.source === 'baidu' ? '百度地图地点' : stop.source === 'curated' ? '已核验公开资料' : hasPlanScenePhoto(stop) ? '活动灵感 · 场景图非商家实拍' : '概念灵感 · 无实景图';
  const stateLabel = status.completed ? '已到达' : status.active ? '预计进行中' : accepted ? '等待靠近' : '待确认';
  return `<article class="timeline-stop ${status.completed ? 'arrived' : ''} ${status.active ? 'active' : ''}" data-stop-id="${escapeHTML(stop.stopId)}">
    <div class="timeline-dot"></div>
    <div class="stop-time">${stop.start}</div>
    <div class="stop-card card">
      <button class="stop-main" data-route="place/${encodeURIComponent(stop.id)}">
        ${planPlaceMedia(stop, { className: 'stop-photo' })}
        <span><small>${escapeHTML(stop.categoryLabel)} · ${stop.end} 结束</small><strong>${escapeHTML(stop.name)}</strong><em>${escapeHTML((stop.tags || []).slice(0, 2).join(' · '))}</em><i class="stop-state-label">${stateLabel}</i>${providerBadge ? `<b class="google-mini">${providerBadge}</b>` : ''}</span>
      </button>
      <div class="stop-actions ${status.completed ? 'arrival-recorded' : accepted ? 'with-presence' : ''}">${status.completed ? `<span class="stop-complete-copy">${icon('location')} 地图已自动记录到达</span>` : `${accepted ? `<span class="stop-presence-copy">${icon('location')} 靠近后自动记录</span>` : ''}<button data-action="open-replace-stop" data-id="${stop.stopId}">${icon('refresh')} 换场景</button><button data-action="delete-stop" data-id="${stop.stopId}" ${canDelete ? '' : 'disabled'}>${icon('trash')} 移除</button>`}</div>
    </div>
  </article>`;
}

function renderPlan(state) {
  const plan = state.currentPlan;
  if (!plan?.stops?.length) {
    const hasBothDepartures = Boolean(state.meeting?.departures?.user && state.meeting?.departures?.partner);
    const recoveryTitle = !hasBothDepartures ? '这个浏览器还没有<br/>双方位置' : !state.onboarding.completed ? '规划设置还没有完成' : '这次还没有生成方案';
    const recoveryCopy = !hasBothDepartures
      ? '换到新的浏览器后，本地草稿不会自动带过来。先确认你和 TA 的出发位置，再按双方距离筛选地点。'
      : !state.onboarding.completed
        ? '双方位置已经设置，继续完成预算、距离与约见偏好后就能生成方案。'
        : '位置和偏好已经准备好，选择这次想做的活动后即可生成新方案。';
    const recoveryAction = !hasBothDepartures ? '设置双方位置' : !state.onboarding.completed ? '继续完成设置' : '重新开始规划';
    return appFrame(`${topBar({ title: '约见方案', back: true })}<main class="center-state recovery-state plan-empty-state page with-top"><span class="state-glyph">${icon('route')}</span><span class="eyebrow">方案尚未生成</span><h1>${recoveryTitle}</h1><p>${recoveryCopy}</p>${!hasBothDepartures ? `<div class="plan-empty-note">${icon('info')}<span>如果你之前已登录账号，可在登录后同步；未登录的本地方案只保存在原浏览器。</span></div>` : ''}<div class="recovery-actions"><button class="btn primary" data-action="resume-empty-plan">${recoveryAction}</button><button class="btn tertiary" data-route="welcome">返回首页</button></div></main>`);
  }
  const actions = plan.accepted
    ? `<div class="fixed-actions"><button class="btn secondary" data-action="share-plan">${icon('share')} 分享</button><button class="btn primary" data-action="complete-date">结束后回顾</button></div>`
    : `<div class="fixed-actions"><button class="btn secondary" data-action="open-conditions">再调一下</button><button class="btn primary" data-action="open-accept-plan">确认方案</button></div>`;
  const livePlan = plan.stops.some((stop) => ['google', 'baidu', 'curated'].includes(stop.source));
  const visualStops = planVisualStops(plan);
  const collageLayout = visualStops.length === 2 ? 'two-stops' : visualStops.length === 1 ? 'one-stop' : 'three-stops';
  const themeMatched = planMatchesTheme(plan);
  const hasMapPoints = plan.stops.filter((stop) => stop.location).length >= 2;
  const route = state.maps.route.data;
  const progress = planStopProgress(plan);
  const progressByStop = new Map(progress.statuses.map((item) => [item.stop.stopId, item]));
  lastPlanProgressSignature = progress.statuses.map((item) => `${item.stop.stopId}:${item.completed ? 'done' : item.active ? 'active' : 'next'}`).join('|');
  const mapProviderLabel = mapService.providerLabel(state.maps.config);
  const baiduRouteUri = mapService.baiduRouteUri(plan);
  const coreStop = plan.stops.find((stop) => plan.sourceTheme && placeMatchesTheme(stop, plan.sourceTheme)) || plan.stops[0];
  const departureBalance = coreStop?.userDistanceKm != null && coreStop?.partnerDistanceKm != null
    ? `<section class="plan-departure-balance card"><span>${icon('route')}</span><div><small>到核心活动的双方距离</small><strong>你约 ${Number(coreStop.userDistanceKm).toFixed(1)} km · TA 约 ${Number(coreStop.partnerDistanceKm).toFixed(1)} km</strong><p>${Number(coreStop.distanceGapKm || 0) <= 2 ? '两个人的通勤距离比较均衡。' : `当前活动是硬条件，系统已在可用地点中尽量减小距离差；相差约 ${Number(coreStop.distanceGapKm || 0).toFixed(1)} km。`}</p></div></section>`
    : '';
  const routeMap = hasMapPoints && state.maps.config.mapsEnabled
    ? `<section class="merchant-map-card card"><div id="planMap" class="merchant-map plan-map" aria-label="约见路线地图"><div class="map-loading"><span class="spinner"></span>正在加载 ${escapeHTML(mapProviderLabel)}</div></div><div class="map-caption"><strong>${escapeHTML(mapService.getRouteLabel(plan, route))}</strong><p>${livePlan ? (state.maps.route.status === 'error' ? '精确步行路线暂时不可用，仍可逐站打开地图导航。' : '真实地点使用地图平台或官方公开资料；路线、营业与场次请在出发前再次确认。') : '未核验为具体商家的灵感项目不展示冒充实景的摄影图。'}</p><a class="map-external-link" href="${escapeHTML(baiduRouteUri)}" target="_blank" rel="noopener">${icon('navigation')} 在百度地图查看路线</a></div></section>`
    : `<section class="map-setup-card card"><span class="map-setup-icon">${icon('location')}</span><div><strong>当前地点缺少可用坐标</strong><p>配置百度地图 AK 后，可显示更多真实商家与多站路线。</p></div></section>`;
  return appFrame(`
    ${topBar({ title: '约见方案', back: true, action: `<button class="icon-btn" data-action="share-plan" aria-label="分享方案">${icon('share')}</button>` })}
    <main class="page with-top plan-page no-bottom">
      <section class="plan-collage ${collageLayout}">${planPlaceMedia(visualStops[0], { showSource: true })}${visualStops.length > 1 ? `<div>${visualStops.slice(1, 3).map((stop) => planPlaceMedia(stop)).join('')}</div>` : ''}</section>
      <section class="plan-heading"><span class="eyebrow">THIS TIME · ${plan.stops[0].start}</span><h1>${escapeHTML(planDisplayTitle(plan))}</h1><p>${plan.accepted ? '已确认。预订、导航与付款仍由你决定。' : plan.rangeExpanded ? `为了保留“${escapeHTML(plan.sourceTheme)}”，已自动把搜索范围从 ${plan.requestedDistanceKm} km 扩大到 ${plan.searchDistanceKm} km。` : themeMatched ? '每一站都能单独替换，也可以直接换一种场景。' : '当前方案未满足已选活动，已停止继续推荐。'}</p></section>
      <section class="plan-summary card"><div><strong>${plan.summary.stopCount}</strong><span>站</span></div><div><strong>¥${plan.summary.cost}</strong><span>${plan.summary.usesEstimatedPricing ? '预算参考' : '预计总花费'}</span></div><div><strong>${plan.summary.durationMin}</strong><span>分钟</span></div><div><strong>${route?.distanceMeters ? `${(route.distanceMeters / 1000).toFixed(1)}km` : plan.summary.transitMin}</strong><span>${route?.distanceMeters ? '路线距离' : '通勤分钟'}</span></div></section>
      ${departureBalance}
      ${renderPlanProgressNotice(plan, progress, state.ui.planPresenceStatus)}
      ${plan.agent?.analysis ? `<section class="agent-analysis-card card"><div class="section-row"><div><span class="eyebrow">安排说明</span><h2>这版为什么这样安排</h2></div><span>${escapeHTML(plan.agent.provider === 'local' ? '本地规划' : plan.agent.provider)}</span></div><p>${escapeHTML(plan.agent.analysis)}</p>${plan.agent.reasons?.length ? `<ul>${plan.agent.reasons.map((reason) => `<li>${escapeHTML(reason)}</li>`).join('')}</ul>` : ''}</section>` : ''}
      ${renderPlanPrep(plan, state.weather)}
      <section class="timeline">${plan.stops.map((stop) => planStopCard(stop, plan.stops.length > 1 && (!plan.sourceTheme || !placeMatchesTheme(stop, plan.sourceTheme)), progressByStop.get(stop.stopId), plan.accepted)).join('')}</section>
      ${routeMap}
      ${state.previousPlan ? `<div class="undo-bar"><span>${escapeHTML(plan.lastChange || '方案已调整')}</span><button data-action="undo-plan">撤销</button></div>` : ''}
    </main>`, { fixedAction: actions });
}

function placeDirectoryCandidates(state) {
  const filtered = mapCandidates(state);
  if (filtered.length) return { places: filtered, relaxed: false };
  if (state.conversation.theme || state.places.mode === 'live') return { places: [], relaxed: false };
  const category = state.ui.mapCategory || 'all';
  const fallback = availablePlaces(state)
    .filter((place) => place.open !== false)
    .filter((place) => category === 'all' || place.category === category)
    .sort((a, b) => Number(a.distanceGapKm || 0) - Number(b.distanceGapKm || 0) || a.distanceKm - b.distanceKm || b.rating - a.rating)
    .slice(0, 30);
  return { places: fallback, relaxed: true };
}

function renderPlaceDirectory(state, missingPlaceId = '') {
  const { places, relaxed } = placeDirectoryCandidates(state);
  const selectedIds = new Set(state.conversation.preferredPlaceIds || []);
  const centerLabel = rangeCenterLabel(state.conditions, searchCenterForState(state));
  const selectedTheme = state.conversation.theme;
  return appFrame(`
    ${topBar({ title: '地点', back: true, action: `<button class="icon-btn" data-route="map-explore" aria-label="打开地图筛选">${icon('location')}</button>` })}
    <main class="page with-top place-directory-page">
      ${missingPlaceId ? `<section class="route-recovery-note card"><span>${icon('refresh')}</span><div><strong>原来的地点链接已经更新</strong><p>已为你保留当前条件，并列出可以继续查看的地点。</p></div></section>` : ''}
      <section class="place-directory-heading"><span class="eyebrow">北京 · ${escapeHTML(centerLabel)}</span><h1>${selectedTheme ? `围绕“${escapeHTML(selectedTheme)}”看具体地点。` : '从一个具体地点开始。'}</h1><p>${selectedTheme ? `同类地点会严格匹配“${escapeHTML(selectedTheme)}”，餐厅和咖啡甜品只作为可选搭配，不会替代核心活动。` : '这里集中展示当前可查看的餐厅、活动和咖啡甜品；点进详情可继续查看图片、价格、时间与地图。'}</p></section>
      <div class="pill-row map-category-row place-directory-filters">${MAP_CATEGORIES.map(([value, label]) => `<button class="pill ${state.ui.mapCategory === value ? 'active' : ''}" data-action="map-category" data-value="${value}">${label}</button>`).join('')}</div>
      <section class="place-directory-tools card"><button data-route="map-explore"><span>${icon('location')}</span><strong>地图筛选</strong><small>按范围直观看地点</small></button><button data-route="conversation"><span>${icon('spark')}</span><strong>让管家安排</strong><small>结合你们两个人的偏好</small></button></section>
      ${relaxed ? `<p class="place-directory-relaxed">当前预算或距离内暂时没有完全匹配的地点，先展示同类别的附近备选；调整条件后会重新排序。</p>` : `<p class="place-directory-count">${places.length} 个地点符合当前预算、距离${selectedTheme ? `，并保留“${escapeHTML(selectedTheme)}”` : '与偏好'}</p>`}
      ${places.length ? `<section class="place-directory-list">${places.map((place) => `<article class="place-directory-card card ${selectedIds.has(place.id) ? 'chosen' : ''}"><button class="place-directory-main" data-route="place/${encodeURIComponent(place.id)}">${planPlaceMedia(place, { className: 'place-directory-photo' })}<span><small>${escapeHTML(place.neighborhood)} · ${escapeHTML(place.categoryLabel)}</small><strong>${escapeHTML(place.name)}</strong><em>${escapeHTML(priceDisplay(place))} · ${escapeHTML(placeDistanceLabel(place))}</em><b>${escapeHTML(place.booking?.label || '出发前确认')}</b></span></button><div><span>${selectedIds.has(place.id) ? `${icon('check')} 已加入本次候选` : `★ ${escapeHTML(String(place.rating || '—'))}`}</span><a href="${escapeHTML(mapService.baiduMapUri(place))}" target="_blank" rel="noopener">${icon('navigation')} 百度地图</a></div></article>`).join('')}</section>` : `<section class="center-state place-directory-empty"><span class="state-glyph">${icon('locationOff')}</span><h2>${selectedTheme ? `还没有找到“${escapeHTML(selectedTheme)}”` : '这一类地点还没有可用资料'}</h2><p>${selectedTheme ? '不会展示其他活动冒充匹配；可以进入地图自动扩大范围，或调整预算和时间。' : '可以切换分类，或进入地图筛选扩大范围。'}</p><button class="btn primary" data-route="map-explore">打开地图筛选</button></section>`}
    </main>`);
}

function renderPlace(state, placeId) {
  if (!placeId) return renderPlaceDirectory(state);
  const place = findPlace(state, placeId);
  if (!place) return renderPlaceDirectory(state, placeId);
  const reasons = getMatchReasons(place, state.conditions);
  const isLive = ['google', 'baidu', 'curated'].includes(place.source);
  const providerName = place.source === 'baidu' ? '百度地图' : place.source === 'google' ? 'Google Maps' : place.source === 'curated' ? '官方或公开票务资料' : '概念灵感';
  const baiduMapUri = mapService.baiduMapUri(place);
  const detailLoading = state.places.detailStatus[place.id] === 'loading';
  const fixed = isLive
    ? `<div class="fixed-actions"><a class="btn secondary ${place.phone ? '' : 'disabled'}" ${place.phone ? `href="tel:${escapeHTML(place.phone)}"` : 'aria-disabled="true"'}>${place.phone ? '联系商家' : '暂无电话'}</a><a class="btn primary" href="${escapeHTML(baiduMapUri)}" target="_blank" rel="noopener">打开百度地图</a></div>`
    : `<div class="fixed-actions"><button class="btn secondary" data-action="replace-place-from-detail" data-id="${place.id}">换一个</button><a class="btn primary" href="${escapeHTML(baiduMapUri)}" target="_blank" rel="noopener">打开百度地图</a></div>`;
  const ratingLabel = isLive
    ? (place.ratingLabel || (place.userRatingCount ? `★ ${place.rating} · ${place.userRatingCount} 条评价` : `★ ${place.rating}`))
    : '活动灵感 · 非商家评分';
  const openingHours = place.currentOpeningHours?.length ? place.currentOpeningHours : place.openingHours;
  const hasPhoto = hasVerifiedPhoto(place) || hasPlanScenePhoto(place);
  const usesScenePhoto = !hasVerifiedPhoto(place) && hasPlanScenePhoto(place);
  const heroSource = usesScenePhoto
    ? (place.sceneImageSourceLabel || '相关活动场景参考 · 非商家实拍')
    : `${providerName} · ${photoSourceText(place)}`;
  return appFrame(`
    <section class="detail-hero ${hasPhoto ? 'image-shade' : 'no-photo-hero'}">${placeMedia(place, { className: 'detail-place-photo', allowScene: true })}${topBar({ back: true, photo: hasPhoto, action: `<button class="icon-btn ${hasPhoto ? 'glass' : ''}" data-action="share-place" data-id="${place.id}" aria-label="分享地点">${icon('share')}</button>` })}<span class="freshness"><strong>${escapeHTML(heroSource)}</strong><small>${escapeHTML(place.freshness)}</small></span></section>
    <main class="detail-page no-bottom">
      <div class="section-row"><div><span class="eyebrow">${escapeHTML(place.neighborhood)} · ${escapeHTML(place.categoryLabel)}</span><h1>${escapeHTML(place.name)}</h1></div><span class="availability ${place.openNow === false ? 'closed' : ''}">${escapeHTML(place.booking.label)}</span></div>
      ${isLive && detailLoading ? '<div class="detail-source-line"><span class="detail-refreshing"><i class="spinner"></i>正在补全电话与营业时间</span></div>' : ''}
      ${renderPlacePriceAndTime(place)}
      <section class="match-block"><h2>为什么适合这次约见</h2><div class="reason-grid">${reasons.map((reason, index) => `<div><span>${icon(['dining', 'direction', 'spark'][index] || 'spark')}</span><strong>${escapeHTML(reason)}</strong><small>${escapeHTML(place.reasons[index] || place.tags[index])}</small></div>`).join('')}</div></section>
      <div class="fact-row"><span>${escapeHTML(ratingLabel)}</span><span>${escapeHTML(priceDisplay(place))}</span><span>${escapeHTML(placeDistanceLabel(place))}</span>${place.noiseDb ? `<span>${place.noiseDb} dB</span>` : ''}</div>
      <section class="feeling-card card"><span class="eyebrow">这次会是什么感觉</span><p>${escapeHTML(place.feeling)}</p></section>
      ${renderPlacePrep(place, state.weather)}
      ${place.location && state.maps.config.mapsEnabled ? `<section class="detail-map-section"><div id="placeMap" class="merchant-map" aria-label="${escapeHTML(place.name)} 地图"><div class="map-loading"><span class="spinner"></span>正在加载${escapeHTML(mapService.providerLabel(state.maps.config))}</div></div></section>` : ''}
      ${isLive ? `<section class="merchant-contact-card card">
        <div class="merchant-contact-row"><span>地址</span><strong>${escapeHTML(place.address)}</strong></div>
        <div class="merchant-contact-row"><span>电话</span>${place.phone ? `<a href="tel:${escapeHTML(place.phone)}">${escapeHTML(place.phone)}</a>` : '<strong>商家未公开电话</strong>'}</div>
        <div class="merchant-contact-row"><span>价格</span><strong>${escapeHTML(place.priceLabel || '商家未提供价格')}</strong></div>
        <div class="merchant-contact-row"><span>营业</span><strong>${escapeHTML(place.booking.label)}</strong></div>
        ${openingHours?.length ? `<details><summary>查看本周营业时间</summary><div>${openingHours.map((line) => `<span>${escapeHTML(line)}</span>`).join('')}</div></details>` : ''}
        <div class="merchant-link-row">${place.websiteUri ? `<a href="${escapeHTML(place.websiteUri)}" target="_blank" rel="noopener">商家页面 ${icon('external')}</a>` : ''}<a href="${escapeHTML(baiduMapUri)}" target="_blank" rel="noopener">百度地图与路线 ${icon('external')}</a></div>
      </section>` : `<section class="info-grid">
        <div><strong>预约与等位</strong><span>${escapeHTML(place.booking.label)}<br>${escapeHTML(place.booking.wait)}</span></div>
        <div><strong>交通</strong><span>${escapeHTML(place.transport)}</span></div>
        <div><strong>饮食</strong><span>${place.dietary.length ? escapeHTML(place.dietary.join('、')) : '暂未标注特殊选项'}</span></div>
        <div><strong>环境</strong><span>${escapeHTML(place.noise)} · ${place.indoor ? '室内' : '户外'}</span></div>
      </section>`}
      <p class="data-note">${place.source === 'curated' ? `地点资料来自${escapeHTML(place.dataAttribution || providerName)}。只有与该地点对应且可追溯来源的图片才会展示；价格、营业、票务与菜单请在出发前再次向场馆或商家确认。` : isLive ? `地点资料来自${providerName}。若地图服务没有返回可核验地点照片，这里会明确留空，不会套用同类别摄影图。营业状态、价格与联系电话请在出发前再次确认。` : '这是尚未绑定具体商家的活动灵感；当前展示的是与活动内容对应的真实场景参考，并明确标注为非商家实拍。选择实际目的地后，请再核对商家、价格与场次。'}</p>
    </main>`, { fixedAction: fixed, photoStatus: hasPhoto });
}

function filteredMemories(state) {
  const query = state.ui.memoryQuery.trim().toLowerCase();
  return state.memories
    .filter((memory) => memory.confirmed)
    .filter((memory) => state.ui.memoryFilter === 'all' || memory.visibility === state.ui.memoryFilter)
    .filter((memory) => !query || `${memory.title} ${memory.note} ${memory.favorite} ${memory.categoryLabel || ''}`.toLowerCase().includes(query));
}

function memoryCategory(memory) {
  return memory?.categoryLabel || memory?.category || '约会片段';
}

function renderMemory(state) {
  const memories = filteredMemories(state);
  const filters = [['all', '全部'], ['couple', '我们可见'], ['private', '仅自己']];
  const activeFilterIndex = Math.max(0, filters.findIndex(([value]) => value === state.ui.memoryFilter));
  const categories = [...new Set(state.memories.filter((memory) => memory.confirmed).map(memoryCategory))];
  return appFrame(`
    <header class="memory-header"><div><span class="eyebrow">只保存你确认的片段</span><h1>回忆</h1></div><button class="icon-btn" data-action="memory-search-focus" aria-label="搜索回忆">${icon('search')}</button></header>
    <main class="memory-page has-bottom-nav">
      <form class="search-form" id="memorySearch"><input id="memorySearchInput" name="query" value="${escapeHTML(state.ui.memoryQuery)}" placeholder="搜索地点、感受或一句话"/><button type="button" data-action="search-memory">搜索</button></form>
      <div class="filter-row sliding-choice" style="--choice-count:${filters.length};--active-index:${activeFilterIndex}" data-choice-group="memory-filter" data-active-index="${activeFilterIndex}"><i class="choice-selection" aria-hidden="true"></i>${filters.map(([value, label]) => `<button type="button" class="${state.ui.memoryFilter === value ? 'active' : ''}" data-action="memory-filter" data-value="${value}" aria-pressed="${state.ui.memoryFilter === value}">${label}</button>`).join('')}</div>
      <button class="memory-agent-entry card" data-route="memory-agent"><span>${icon('spark')}</span><span><small>回忆 Agent</small><strong>把双方的照片和视频整理成一段完整记录</strong><em>${state.memoryAgent.media.length ? `已归档 ${state.memoryAgent.media.length} 个素材` : '上传素材 · 生成日结 · 那年今天提醒'}</em></span>${icon('chevron')}</button>
      <section class="memory-overview card"><div><strong>${state.memories.filter((memory) => memory.confirmed).length}</strong><span>段共同回忆</span></div><div>${categories.map((category) => `<span>${escapeHTML(category)}</span>`).join('')}</div></section>
      ${memories.length ? `<div class="memory-grid">${memories.map((memory, index) => `<article class="memory-card card ${index === 0 ? 'featured' : ''}">${planPlaceMedia({ ...memory, name: memory.title }, { className: 'memory-photo', showSource: true })}<div class="memory-copy"><div class="memory-kicker"><span class="eyebrow">${escapeHTML(memory.date)} · ${memory.visibility === 'couple' ? '我们可见' : '仅自己'}</span><b>${escapeHTML(memoryCategory(memory))}</b></div><h2>${escapeHTML(memory.title)}</h2><blockquote>“${escapeHTML(memory.note)}”</blockquote>${(memory.photoSourceUrl || memory.sceneImageSourceUrl) ? `<a class="memory-source-link" href="${escapeHTML(memory.photoSourceUrl || memory.sceneImageSourceUrl)}" target="_blank" rel="noopener">${icon('external')} 查看图片来源</a>` : ''}<div class="memory-meta"><span>${escapeHTML(memory.feeling)} · ${escapeHTML(memory.favorite)}</span><div><button data-action="toggle-memory-visibility" data-id="${memory.id}" aria-label="切换可见性">${icon(memory.visibility === 'couple' ? 'visible' : 'private')}</button><button data-action="edit-memory" data-id="${memory.id}" aria-label="编辑">${icon('edit')}</button><button data-action="ask-delete-memory" data-id="${memory.id}" aria-label="删除">${icon('trash')}</button></div></div></div></article>`).join('')}</div>` : `<section class="center-state empty-memory"><span class="state-glyph">${icon('memory')}</span><h2>这里还没有符合条件的 Memory</h2><p>Memory 只会保存你明确确认过的内容。</p><button class="btn primary" data-route="tonight">从今天开始</button></section>`}
  </main>`, { active: 'memory' });
}

function memoryMediaLabel(item) {
  return item.type?.startsWith('video/') ? '视频' : '照片';
}

function renderMemoryAgent(state) {
  const agent = state.memoryAgent;
  const latestSummary = agent.summaries[0] || null;
  const contributor = state.ui.mediaContributor === 'partner' ? 'partner' : 'user';
  const status = state.ui.memoryAgentStatus || 'idle';
  const userName = state.profile.guests?.user?.name || '我';
  const partnerName = state.profile.guests?.partner?.name || 'TA';
  const userInitial = String(userName).trim().slice(0, 1) || '我';
  const partnerInitial = String(partnerName).trim() === 'TA' ? 'TA' : (String(partnerName).trim().slice(0, 1) || 'TA');
  const summaryButtonLabel = status === 'loading' ? '正在整理素材…' : latestSummary ? '重新生成日结' : '生成本次活动日结';
  const summaryButtonHint = !agent.media.length ? '先添加至少一张照片或一段视频' : latestSummary ? '根据当前素材更新摘要与高光' : '生成摘要、高光与纪念提醒';
  return appFrame(`
    ${topBar({ title: '回忆 Agent', back: true })}
    <main class="memory-agent-page page with-top no-bottom">
      <section class="memory-agent-hero">
        <span class="memory-agent-mark">${icon('spark')}</span>
        <span class="eyebrow">共同内容整理</span>
        <h1>把零散的照片和视频，<br/>整理成一段完整回忆。</h1>
        <p>双方都可以上传本次活动素材。Agent 会统一归档、生成日结与摘要，并在未来相同的日子提醒你们。</p>
      </section>

      <section class="memory-agent-section">
        <div class="section-row"><div><span class="eyebrow">双方素材</span><h2>这是谁拍的？</h2></div><span>${agent.media.length} 个素材</span></div>
        <div class="memory-contributor-switch" role="group" aria-label="选择素材拍摄者">
          <button class="${contributor === 'user' ? 'active' : ''}" data-action="set-media-contributor" data-value="user" aria-pressed="${contributor === 'user'}"><span class="contributor-avatar">${escapeHTML(userInitial)}</span><span class="contributor-copy"><strong>我的素材</strong><small>${escapeHTML(userName)}拍摄的照片和视频</small></span><i class="contributor-selected">${icon('check')}</i></button>
          <button class="${contributor === 'partner' ? 'active' : ''}" data-action="set-media-contributor" data-value="partner" aria-pressed="${contributor === 'partner'}"><span class="contributor-avatar">${escapeHTML(partnerInitial)}</span><span class="contributor-copy"><strong>TA 的素材</strong><small>${escapeHTML(partnerName)}拍摄的照片和视频</small></span><i class="contributor-selected">${icon('check')}</i></button>
        </div>
        <button class="memory-upload-card" data-action="pick-memory-media"><span class="memory-upload-icon">${icon('imagePlus')}</span><span class="memory-upload-copy"><small>共同素材库</small><strong>添加照片或视频</strong><em>照片 · 视频 · 可批量选择</em></span><span class="memory-upload-add"><b>添加</b>${icon('chevron')}</span></button>
        <input id="memoryMediaInput" class="sr-only" type="file" accept="image/*,video/*" multiple />
        ${agent.media.length ? `<div class="memory-agent-gallery">${agent.media.map((item) => `<article class="memory-agent-media" data-memory-media-id="${escapeHTML(item.id)}" data-media-type="${escapeHTML(item.type)}"><div class="memory-media-placeholder">${icon(item.type?.startsWith('video/') ? 'video' : 'imagePlus')}<span>${escapeHTML(memoryMediaLabel(item))}</span></div><span class="memory-media-owner">${item.contributor === 'partner' ? escapeHTML(partnerName) : escapeHTML(userName)}</span><button data-action="remove-memory-media" data-id="${escapeHTML(item.id)}" aria-label="移除素材">${icon('close')}</button></article>`).join('')}</div>` : `<div class="memory-agent-empty"><span class="memory-empty-stack" aria-hidden="true"><i></i><i></i><b>${icon('imagePlus')}</b></span><div><strong>共同素材库还是空的</strong><p>两个人可以先后添加，Agent 会归到同一次活动里。</p></div><button type="button" data-action="pick-memory-media">${icon('imagePlus')} 选择素材</button></div>`}
      </section>

      <section class="memory-agent-section memory-agent-summary card">
        <div class="section-row"><div><span class="eyebrow">活动日结</span><h2>${latestSummary ? escapeHTML(latestSummary.title) : '让 Agent 整理这次活动'}</h2></div><span class="agent-status ${status}">${status === 'loading' ? '整理中' : status === 'uploading' ? '上传中' : latestSummary ? '已生成' : '待生成'}</span></div>
        ${latestSummary ? `<p class="memory-agent-digest">${escapeHTML(latestSummary.digest)}</p><div class="memory-agent-highlights">${latestSummary.highlights.map((item) => `<span>${icon('check')} ${escapeHTML(item)}</span>`).join('')}</div>` : '<p class="memory-agent-digest">上传完成后，Agent 会根据双方素材、本次方案和已确认的 Memory 生成摘要与高光片段。</p>'}
        <button class="memory-summary-cta" data-action="generate-memory-summary" ${!agent.media.length || status === 'loading' ? 'disabled' : ''}><span class="memory-summary-cta-icon">${icon('spark')}</span><span><strong>${summaryButtonLabel}</strong><small>${summaryButtonHint}</small></span><i>${icon('chevron')}</i></button>
      </section>

      <section class="memory-agent-section anniversary-card card"><span class="anniversary-icon">${icon('date')}</span><div><span class="eyebrow">那年今天</span><h2>${latestSummary ? `${escapeHTML(latestSummary.anniversaryOn)} 提醒你们` : '生成日结后自动创建纪念提醒'}</h2><p>到明年今日、纪念日或相近日期，约见会把这段摘要和高光重新带回来。</p></div><button class="toggle ${agent.remindersEnabled ? 'on' : ''}" data-action="toggle-memory-reminders" aria-pressed="${agent.remindersEnabled}"><i></i></button></section>
    </main>`);
}

function renderGuestProfileCard(guest, guestId, { connected = true } = {}) {
  const progress = guestProfileProgress(guest);
  const percent = guestProfilePercent(guest);
  const fallbackInitial = guestId === 'user' ? '我' : 'TA';
  const initial = String(guest?.name || guest?.label || fallbackInitial).trim() === 'TA' ? 'TA' : String(guest?.name || guest?.label || fallbackInitial).slice(0, 1);
  const food = profileLine([...(guest?.foodLikes || []), ...(guest?.dietaryNeeds || []).map((item) => `避开${item}`)]);
  const activity = profileLine([...(guest?.activityLikes || []), ...(guest?.occasionPreferences || [])]);
  const rhythm = profileLine([guest?.socialPace, guest?.conversationStyle, guest?.energyLevel]);
  const practical = profileLine([guest?.planningPriority, guest?.budgetStyle, guest?.transportPreference, guest?.timePreference, ...(guest?.favoriteAreas || [])]);
  const boundaries = profileLine([...(guest?.activityAvoids || []), guest?.accessibilityNotes]);
  const metrics = guestProfileMetrics(guest);
  const tags = guestPreferenceTags(guest, 7);
  return `<article class="guest-profile-card card ${guestId}">
    <div class="guest-profile-head"><span class="guest-avatar">${escapeHTML(initial)}</span><div class="guest-identity"><span class="eyebrow">${escapeHTML(guest?.label || (guestId === 'user' ? '我' : '伴侣'))}</span><h2>${escapeHTML(guest?.name || (guestId === 'user' ? '你' : 'TA'))}</h2><small>${escapeHTML(updatedLabel(guest?.updatedAt))}</small></div><span class="guest-completion ${progress ? 'ready' : ''}" style="--complete:${percent * 3.6}deg"><b>${percent}%</b></span></div>
    ${progress ? `<div class="guest-profile-insight"><span>约会画像</span><strong>${escapeHTML(guestInsight(guest))}</strong></div>
    <div class="guest-metric-grid"><div><strong>${metrics.taste}</strong><span>口味线索</span></div><div><strong>${metrics.activities}</strong><span>活动偏好</span></div><div><strong>${metrics.rhythm}</strong><span>相处节奏</span></div><div><strong>${metrics.practical}</strong><span>安排习惯</span></div></div>
    ${tags.length ? `<div class="guest-preference-tags">${tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join('')}</div>` : ''}
    <div class="guest-detail-list">
      <div><span>${icon('dining')}</span><small>吃什么</small><strong>${escapeHTML(food || '口味暂未设置')}</strong></div>
      <div><span>${icon('spark')}</span><small>玩什么</small><strong>${escapeHTML(activity || '活动暂未设置')}</strong></div>
      <div><span>${icon('chat')}</span><small>怎么相处</small><strong>${escapeHTML(rhythm || '相处方式暂未设置')}</strong></div>
      <div><span>${icon('route')}</span><small>实际安排</small><strong>${escapeHTML(practical || '路线与预算暂未设置')}</strong></div>
      ${boundaries ? `<div class="guest-boundary"><span>${icon('shield')}</span><small>需要照顾</small><strong>${escapeHTML(boundaries)}</strong></div>` : ''}
    </div>` : `<div class="guest-empty"><strong>从三项开始</strong><span>口味、活动、相处方式</span></div>`}
    <div class="guest-card-actions">${guestId === 'partner' && !connected ? '<small>代为记录</small>' : '<span></span>'}<button class="text-btn" data-action="open-guest-profile" data-guest="${guestId}">${progress ? '编辑档案' : '完善档案'} ${icon('chevron')}</button></div>
  </article>`;
}

function renderCoupleCoordination(profile) {
  const shared = sharedGuestPreferences(profile);
  const considerations = combinedGuestConsiderations(profile);
  const user = profile.guests?.user || {};
  const partner = profile.guests?.partner || {};
  if (!guestProfileProgress(user) && !guestProfileProgress(partner)) return '';
  const userNeed = profileLine([user.planningPriority, user.conversationStyle, user.transportPreference, user.timePreference], '按本次条件安排');
  const partnerNeed = profileLine([partner.planningPriority, partner.conversationStyle, partner.transportPreference, partner.timePreference], '按本次条件安排');
  const strategy = [];
  if (shared.length) strategy.push(`保留${shared.slice(0, 2).join('、')}`);
  if ([user, partner].some((guest) => /慢热|安静|深度聊天|不用一直说话/.test(`${guest.socialPace || ''}${guest.conversationStyle || ''}`))) strategy.push('选安静、能坐下的空间');
  if ([user, partner].some((guest) => guest.planningPriority === '少通勤' || guest.transportPreference === '少走路')) strategy.push('减少跨区与步行');
  if (considerations.length) strategy.push(`避开${considerations.slice(0, 2).join('、')}`);
  const finalStrategy = strategy.length ? strategy.slice(0, 3).join('；') : '按两人的预算、路线和活动节奏共同排序';
  return `<section class="couple-coordination card"><div class="section-row"><div><span class="eyebrow">本次协调</span><h2>${escapeHTML(finalStrategy)}</h2></div><button class="icon-btn" data-route="conversation" aria-label="开始规划">${icon('chevron')}</button></div><div class="coordination-grid"><div><span>我</span><strong>${escapeHTML(userNeed)}</strong></div><div><span>伴侣</span><strong>${escapeHTML(partnerNeed)}</strong></div></div></section>`;
}

function renderProfile(state) {
  const profile = state.profile;
  const userGuest = profile.guests?.user || {};
  const partnerGuest = profile.guests?.partner || {};
  const account = state.account;
  const syncLabel = account.syncStatus === 'syncing' ? '正在同步'
    : account.syncStatus === 'error' ? '同步遇到问题'
      : account.lastSyncedAt ? `已同步 ${new Date(account.lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '等待首次同步';
  const accountCard = account.user
    ? `<section class="account-card card signed-in"><div class="account-avatar">${icon('me')}</div><div><strong>个人账号已登录</strong><small>${escapeHTML(syncLabel)}</small></div><button class="text-btn" data-action="open-account-profile">隐私</button></section>`
    : `<section class="account-card card"><div class="account-avatar">${icon('me')}</div><div><strong>登录账号</strong><small>同步档案与回忆</small></div><button class="btn secondary" data-action="open-auth" data-mode="login">登录</button><button class="text-btn account-register" data-action="open-auth" data-mode="register">创建账号</button></section>`;
  return appFrame(`
    <section class="profile-cover profile-cover-plain">${topBar({ title: '我们', action: `<button class="icon-btn" data-route="settings" aria-label="设置">${icon('settings')}</button>` })}<div class="profile-cover-mark">${icon('memory')}</div></section>
    <main class="profile-page has-bottom-nav">
      ${accountCard}
      <span class="eyebrow">两个人的偏好</span><h1>我们的档案</h1>
      ${!profile.connected ? `<section class="connection-card card compact"><div><strong>邀请伴侣一起使用</strong><p>${escapeHTML(state.onboarding.inviteCode || '生成邀请链接')}</p></div><button class="btn secondary" data-action="invite-again">邀请</button></section>` : ''}
      <section class="profile-section guest-directory"><div class="section-row"><h2>我们两个人</h2><button class="text-btn" data-route="conversation">开始规划</button></div><div class="guest-profile-grid">${renderGuestProfileCard(userGuest, 'user')}${renderGuestProfileCard(partnerGuest, 'partner', { connected: profile.connected })}</div></section>
      ${renderCoupleCoordination(profile)}
      ${profile.tonightOnly.length ? `<section class="profile-section tonight-preferences"><div class="section-row"><h2>本次临时偏好</h2><span>结束后清空</span></div><div class="pill-row">${profile.tonightOnly.map((item) => `<span class="pill">${escapeHTML(item)}</span>`).join('')}</div></section>` : ''}
    </main>`, { active: 'profile' });
}

function renderMapExplore(state) {
  const candidates = mapCandidates(state);
  const selectedIds = new Set(state.conversation.preferredPlaceIds || []);
  const selectedPlace = candidates.find((place) => place.id === state.ui.mapSelectedId) || candidates[0];
  const provider = mapService.providerLabel(state.maps.config);
  const searchCenter = searchCenterForState(state);
  const centerLabel = rangeCenterLabel(state.conditions, searchCenter);
  const radiusKm = Number(candidates.searchDistanceKm || searchCenter?.radiusKm || state.conditions.distance || 6);
  const selectedTheme = state.conversation.theme;
  const rangeWasExpanded = Boolean(selectedTheme && radiusKm > Number(state.conditions.distance || 6));
  const dualLocation = searchCenter?.source === 'couple-midpoint';
  const distanceRule = dualLocation
    ? `先在双方中间区域检索，再分别计算你和 TA 到每个地点的距离；任一方超过 ${radiusKm} km 都会被排除。`
    : `以「${centerLabel}」为圆心，筛选 ${radiusKm} km 内、两人预算 ¥${state.conditions.budget} 的地点。`;
  return appFrame(`
    ${topBar({ title: '地图筛选', back: true, action: `<button class="icon-btn" data-action="open-conditions" aria-label="编辑筛选条件">${icon('edit')}</button>` })}
    <main class="page with-top map-explore-page no-bottom">
      <section class="map-filter-summary"><span class="eyebrow">${escapeHTML(provider)} · ${dualLocation ? '双方距离筛选' : `圆心 ${escapeHTML(centerLabel)}`}</span><h1>${selectedTheme ? `先找到“${escapeHTML(selectedTheme)}”，再补充顺路地点。` : '把双方都方便的地点放到地图上。'}</h1><p>${selectedTheme ? `“${escapeHTML(selectedTheme)}”是本次硬条件；${rangeWasExpanded ? `已把双方距离上限从 ${state.conditions.distance} km 扩大到 ${radiusKm} km；` : distanceRule}不会用其他活动替代。` : distanceRule}</p></section>
      <div class="pill-row map-category-row">${MAP_CATEGORIES.map(([value, label]) => `<button class="pill ${state.ui.mapCategory === value ? 'active' : ''}" data-action="map-category" data-value="${value}">${label}</button>`).join('')}</div>
      ${state.maps.config.placesEnabled ? `<button class="map-refresh-line" data-action="refresh-map-places">${state.places.status === 'loading' ? '<span class="spinner"></span>正在搜索真实地点' : `${icon('refresh')} 刷新百度地图真实地点`}</button>` : `<div class="map-demo-line">${icon('location')} 当前优先展示已核验的北京真实地点；没有可靠照片的候选会明确显示无图。配置百度地图 AK 后可搜索更多地点。</div>`}
      <section class="map-browser card"><div id="browseMap" class="merchant-map browse-map" aria-label="筛选结果地图"><div class="map-loading"><span class="spinner"></span>正在加载地图点位</div></div><div class="map-range-legend"><span><i></i>${dualLocation ? '检索中心' : '范围中心'}：${escapeHTML(centerLabel)}</span><strong>${dualLocation ? `每人 ≤ ${radiusKm} km` : `${radiusKm} km 半径`}</strong></div><div class="map-browser-caption"><strong>${candidates.length} 个地点符合当前条件</strong><span>${selectedIds.size ? `已加入 ${selectedIds.size} 个本次候选` : dualLocation ? '列表同时显示双方距离' : '地图范围圈表示筛选半径'}</span></div></section>
      ${candidates.length ? `<section class="map-place-list">${candidates.map((place, index) => `<article class="map-place-card card ${place.id === selectedPlace?.id ? 'selected' : ''} ${selectedIds.has(place.id) ? 'chosen' : ''}" data-place-id="${escapeHTML(place.id)}"><button class="map-place-main" data-action="map-select-place" data-id="${escapeHTML(place.id)}"><span class="map-index">${index + 1}</span>${planPlaceMedia(place, { className: 'map-place-photo' })}<span><small>${escapeHTML(place.categoryLabel)} · ${escapeHTML(placeDistanceLabel(place))}</small><strong>${escapeHTML(place.name)}</strong><em>${escapeHTML(priceDisplay(place))} · ${escapeHTML(place.neighborhood)}</em></span></button><div><a class="map-card-link" href="${escapeHTML(mapService.baiduMapUri(place))}" target="_blank" rel="noopener">${icon('navigation')} 百度地图</a><button class="text-btn" data-route="place/${encodeURIComponent(place.id)}">详情</button><button class="btn ${selectedIds.has(place.id) ? 'secondary' : 'primary'}" data-action="toggle-map-candidate" data-id="${escapeHTML(place.id)}">${selectedIds.has(place.id) ? '移出候选' : '加入候选'}</button></div></article>`).join('')}</section>` : `<section class="center-state map-empty"><span class="state-glyph">${icon('locationOff')}</span><h2>${selectedTheme ? `还没有找到“${escapeHTML(selectedTheme)}”` : '当前条件下没有地点'}</h2><p>${selectedTheme ? `系统不会换成别的活动；已检查到 ${radiusKm} km，可调整预算、时长或室内条件后再试。` : '可以增加预算、扩大距离，或取消“只看室内”。'}</p><button class="btn primary" data-action="open-conditions">调整条件</button></section>`}
    </main>`, { fixedAction: `<div class="fixed-actions single"><button class="btn primary full" data-route="conversation">让规划 Agent 继续安排${selectedIds.size ? ` · 已选 ${selectedIds.size}` : ''}</button></div>` });
}

function renderDiscover(state) {
  const activeFilter = state.ui.discoverFilter || 'all';
  const completedIds = new Set(state.coupleList?.completedIds || []);
  const savedIds = new Set(state.coupleList?.savedIds || []);
  const filtered = activeFilter === 'all' ? coupleBucketList : coupleBucketList.filter((item) => item.group === activeFilter);
  const hero = filtered.find((item) => savedIds.has(item.id) && !completedIds.has(item.id))
    || filtered.find((item) => !completedIds.has(item.id))
    || filtered[0];
  const rest = filtered.filter((item) => item.id !== hero?.id);
  const completedCount = completedIds.size;
  const savedCount = savedIds.size;
  const heroCompleted = hero ? completedIds.has(hero.id) : false;
  const heroSaved = hero ? savedIds.has(hero.id) : false;
  return appFrame(`
    <header class="discover-header bucket-header"><span class="eyebrow">只属于你们的共同清单</span><h1>情侣一起完成的 100 件事</h1><div class="bucket-overview"><div><strong>${completedCount}</strong><span>/ 100 已拥有</span></div><p>${savedCount ? `还有 ${savedCount} 件，想和 TA 一起去做。` : '不是任务清单，是你们慢慢拥有的共同经历。'}</p></div><div class="pill-row discover-filters" aria-label="共同体验分类">${DISCOVER_FILTERS.map(([value, label]) => `<button class="pill discover-filter ${activeFilter === value ? 'active' : ''}" data-action="discover-filter" data-value="${value}" aria-pressed="${activeFilter === value}">${label}</button>`).join('')}</div></header>
    <main class="discover-page has-bottom-nav">
      ${hero ? `<section class="bucket-feature card ${heroCompleted ? 'completed' : ''}"><button class="bucket-feature-main" data-action="plan-bucket-item" data-id="${hero.id}">${ideaVisual(hero)}<span><small>第 ${String(hero.number).padStart(2, '0')} 件 · ${escapeHTML(hero.groupLabel)}</small><strong>${escapeHTML(hero.title)}</strong><em>${escapeHTML(hero.subtitle)}</em><b>${heroCompleted ? '再安排一次' : '为这件事找地方'} ${icon('chevron')}</b></span></button><button class="bucket-save ${heroSaved ? 'saved' : ''}" data-action="toggle-bucket-save" data-id="${hero.id}" aria-label="${heroSaved ? '从我们想做的清单移除' : '加入我们想做的清单'}" aria-pressed="${heroSaved}">${icon(heroSaved ? 'check' : 'memory')}</button></section>` : ''}
      <section class="bucket-list-heading"><div><span class="eyebrow">慢慢完成就好</span><h2>${activeFilter === 'all' ? '全部 100 件事' : escapeHTML(DISCOVER_FILTERS.find(([value]) => value === activeFilter)?.[1] || '')}</h2></div><span>${filtered.length} 件</span></section>
      <section class="bucket-list">${rest.map((item) => {
        const completed = completedIds.has(item.id);
        const saved = savedIds.has(item.id);
        return `<article class="bucket-item card ${completed ? 'completed' : ''}"><button class="bucket-item-main" data-action="plan-bucket-item" data-id="${item.id}"><span class="bucket-number">${String(item.number).padStart(2, '0')}</span><span><small>${escapeHTML(item.groupLabel)}${completed ? ' · 已一起做到' : saved ? ' · 想一起做' : ''}</small><strong>${escapeHTML(item.title)}</strong><em>${completed ? '再安排一次' : '找一个合适的时间和地点'} ${icon('chevron')}</em></span></button><button class="bucket-save ${saved ? 'saved' : ''}" data-action="toggle-bucket-save" data-id="${item.id}" aria-label="${saved ? '从我们想做的清单移除' : '加入我们想做的清单'}" aria-pressed="${saved}" ${completed ? 'disabled' : ''}>${icon(completed ? 'check' : saved ? 'check' : 'memory')}</button></article>`;
      }).join('')}</section>
      <div class="discover-footer bucket-footer"><p>真正完成时，地图到达记录会把它放进你们共同拥有的经历里。</p></div>
    </main>`, { active: 'discover' });
}

function toggleRow(key, title, description, value) {
  return `<div class="setting-row"><div><strong>${escapeHTML(title)}</strong><span>${escapeHTML(description)}</span></div><button class="toggle ${value ? 'on' : ''}" role="switch" aria-label="${escapeHTML(title)}" aria-checked="${value}" data-action="toggle-setting" data-key="${key}"><i></i></button></div>`;
}

function renderSettings(state) {
  const s = state.settings;
  const account = state.account;
  const proactivityOptions = [
    ['ask', '先问清楚'],
    ['options', '给我选择'],
    ['direct', '直接出方案']
  ];
  const proactivityCopy = {
    ask: '条件不够时，先问一个简短问题。',
    options: '先给 3 个可比较的方向，再决定是否生成。',
    direct: '已有条件完整时，直接做好一版方案。'
  };
  return appFrame(`
    ${topBar({ title: '设置', back: true })}
    <main class="page with-top settings-page">
      <section class="settings-intro"><h1>让约见更懂你们</h1><p>调整规划方式、提醒、隐私与数据。</p></section>
      <section class="settings-capabilities card">
        <article><span>${icon('search')}</span><div><strong>筛地点</strong><small>按预算、距离和双方偏好缩小范围</small></div></article>
        <article><span>${icon('route')}</span><div><strong>排路线</strong><small>安排顺序、通勤时间和整晚节奏</small></div></article>
        <article><span>${icon('clock')}</span><div><strong>出发提醒</strong><small>结合天气和时间提醒下一站</small></div></article>
        <article><span>${icon('memory')}</span><div><strong>记住偏好</strong><small>只保存你确认过的口味与 Memory</small></div></article>
      </section>
      <section class="settings-section"><div class="section-row"><h2>规划方式</h2><span>滑动选择</span></div>${sliderSegmented({ field: 'proactivity', value: s.proactivity, options: proactivityOptions, action: 'set-proactivity' })}<p class="slider-description">${escapeHTML(proactivityCopy[s.proactivity])}</p></section>
      <section class="settings-section"><h2>提醒与权限</h2><div class="settings-card card">${toggleRow('reminders', '周四、周五傍晚提醒', '只在你允许的时间出现', s.reminders)}${toggleRow('locationEnabled', '使用大致位置', '用于地点筛选与到达识别，浏览器会单独询问', s.locationEnabled)}${toggleRow('photoAccess', '允许选择照片', '仅在你保存 Memory 时使用', s.photoAccess)}</div></section>
      <section class="settings-section"><h2>记忆与隐私</h2><div class="settings-card card">${toggleRow('memoryEnabled', '记住共同偏好', '可查看、可纠正、可暂停', s.memoryEnabled)}${toggleRow('usePrivateConversation', '使用私密聊天内容', '默认关闭；推荐理由永不暴露私密内容', s.usePrivateConversation)}${toggleRow('autoBooking', '自动预订与付款', '高风险动作始终需要单独确认', s.autoBooking)}</div></section>
      <section class="settings-section"><h2>账号与同步</h2><div class="settings-card card action-list">${account.user ? `<button data-action="open-account-profile"><span><strong>个人账号 · 已登录</strong><small>邮箱只用于登录，不会显示给伴侣</small></span><b>${icon('chevron')}</b></button><button class="danger" data-action="ask-delete-account"><span><strong>清除我的云端数据</strong><small>删除本应用中的同步状态与 Agent 运行摘要</small></span><b>${icon('chevron')}</b></button>` : `<button data-action="open-auth" data-mode="login"><span><strong>登录独立账号</strong><small>使用邮箱密码同步档案、方案和 Memory</small></span><b>${icon('chevron')}</b></button>`}</div></section>
      <section class="settings-section"><h2>你的数据</h2><div class="settings-card card action-list"><button data-action="export-data"><span><strong>导出我的约会数据</strong><small>下载一份 JSON 副本</small></span><b>${icon('chevron')}</b></button><button class="danger" data-action="ask-delete-data"><span><strong>清空约见使用数据</strong><small>包括偏好、方案与 Memory；登录状态保留</small></span><b>${icon('chevron')}</b></button></div></section>
    </main>`);
}

function wrapChoiceTrigger(field, label, value) {
  const group = WRAPUP_CHOICE_GROUPS[field];
  const option = group?.options.find((item) => item.value === value) || group?.options[0];
  const optionLabel = option?.label || option?.value || '';
  return `<div class="wrap-choice-field">
    <span>${escapeHTML(label)}</span>
    <button type="button" class="wrap-choice-trigger" data-action="open-wrap-choice" data-field="${escapeHTML(field)}" aria-haspopup="dialog">
      <strong>${escapeHTML(optionLabel)}</strong>${icon('chevron')}
    </button>
    <input type="hidden" data-wrap-field="${escapeHTML(field)}" value="${escapeHTML(value)}" />
  </div>`;
}

function renderWrapup(state) {
  const plan = state.currentPlan;
  if (!plan?.stops?.length) {
    return appFrame(`${topBar({ title: '约会回顾', back: true })}<main class="center-state page with-top recovery-state"><span class="state-glyph">${icon('memory')}</span><h1>还没有可以回顾的约会</h1><p>先生成并完成一份约见方案，结束后这里会整理喜欢的片段、调整建议和 Memory。</p><div class="recovery-actions"><button class="btn primary" data-route="conversation">开始规划</button><button class="btn secondary" data-route="memory">查看已有回忆</button></div></main>`);
  }
  const w = state.wrapup;
  return appFrame(`
    <section class="wrap-hero image-shade"><img src="${escapeHTML(legacyResourceUrl('assets/beijing-memories/jingshan-forbidden-city.jpg'))}" alt="北京景山与故宫的真实城市景观"/>${topBar({ back: true, photo: true })}</section>
    <main class="wrap-page no-bottom">
      <section class="wrap-question card"><span class="eyebrow">本次回顾</span><h1>这次见面，感觉怎么样？</h1>${sliderSegmented({ field: 'feeling', value: w.feeling, options: ['一般', '还好', '很喜欢', '惊喜', '难忘'], action: 'wrap-choice' })}</section>
      <section class="wrap-section"><h2>最喜欢哪一段？</h2><div class="favorite-row">${plan.stops.map((stop) => `<button class="favorite-card ${w.favoritePlaceId === stop.id ? 'active' : ''}" data-action="wrap-choice" data-field="favoritePlaceId" data-value="${stop.id}">${planPlaceMedia(stop, { className: 'favorite-photo' })}<span>${escapeHTML(stop.categoryLabel)}</span></button>`).join('')}</div></section>
      <section class="wrap-section"><h2>下次想调整什么？</h2><div class="more-less-grid">${wrapChoiceTrigger('more', '多一点', w.more)}${wrapChoiceTrigger('less', '少一点', w.less)}</div></section>
      <section class="wrap-section"><label class="note-field"><span>留一句话给这次见面（可选）</span><textarea data-wrap-field="note" placeholder="例如：那天沿着河走了很久。">${escapeHTML(w.note)}</textarea></label><div class="visibility-field">${wrapChoiceTrigger('visibility', 'Memory 可见范围', w.visibility)}</div></section>
      <section class="memory-preview card">${planPlaceMedia(plan.stops.find((stop) => stop.id === w.favoritePlaceId) || plan.stops[0], { className: 'memory-preview-photo' })}<div><span class="eyebrow">回忆预览</span><strong>${escapeHTML(w.note || plan.title)}</strong><small>只有点击保存后才会进入回忆。</small></div></section>
      <div class="wrap-learning-note">${icon('spark')}<span><strong>你的调整会用于下次推荐</strong><small>是否保存 Memory，只决定要不要留下这段回忆。</small></span></div>
      <div class="wrap-actions"><button class="btn primary full" data-action="save-memory">保存 Memory，并优化下次推荐</button><button class="btn tertiary full" data-action="feedback-only">不保存回忆，只提交偏好</button></div>
    </main>`, { photoStatus: true });
}

function renderStates() {
  const states = [
    ['memory', '还没有 Memory', '不需要补完过去，这次可以是第一段。', '开始规划', 'tonight'],
    ['search', '没有完全符合的地点', '保留硬条件，并清楚说明哪些选项接近。', '调整条件', 'tonight'],
    ['chat', 'TA 还没加入', '你可以先完成自己的偏好，不会假装已有共同画像。', '查看邀请', 'profile'],
    ['locationOff', '定位暂未开启', '选择常去街区后仍然可以继续规划。', '使用北京东城区附近', 'tonight'],
    ['offline', '网络开了个小差', '草稿和已有方案已保留，恢复网络后再刷新地点事实。', '返回方案', 'plan']
  ];
  return appFrame(`${topBar({ title: '状态与恢复', back: true })}<main class="page with-top states-page"><div class="section-heading"><span class="eyebrow">遇到问题时</span><h1>每一步，都可以继续。</h1><p>不会因为网络、定位或伴侣未连接而丢掉当前上下文。</p></div><div class="state-list">${states.map(([iconName, title, desc, action, route]) => `<article class="state-card card"><span>${icon(iconName)}</span><div><h2>${title}</h2><p>${desc}</p><button class="text-btn state-action" data-route="${route}">${action}${icon('chevron')}</button></div></article>`).join('')}</div></main>`);
}

function renderDesignSystem() {
  const colors = [['Primary', '#B9684F'], ['Accent', '#D9A15F'], ['Canvas', '#FBF4EA'], ['Forest', '#47332C'], ['Text', '#30231F'], ['Muted', '#78675E']];
  return appFrame(`${topBar({ title: '内部设计系统', back: true })}<main class="page with-top design-system"><section><span class="eyebrow">A2 · APPLE × AIRBNB LIFESTYLE</span><h1>约见 UI Inventory</h1><p>设计与工程内部页面，不出现在用户主导航中。</p></section><section><h2>颜色</h2><div class="swatch-grid">${colors.map(([name, color]) => `<div><i style="background:${color}"></i><strong>${name}</strong><span>${color}</span></div>`).join('')}</div></section><section><h2>字体层级</h2><div class="type-demo"><h1>Editorial Display</h1><h2>页面标题 / H2</h2><p>正文用于清楚说明事实、边界与下一步。</p><small>辅助信息 · 来源 · 更新时间</small></div></section><section><h2>组件</h2><div class="component-demo"><button class="btn primary">主要操作</button><button class="btn secondary">次要操作</button><button class="btn tertiary">文字操作</button>${conditionPills({ mood: '安静聊聊', budget: 500, distance: 6, duration: 3 })}<div class="card sample-component"><span class="eyebrow">MATCHING REASON</span><h3>先解释为什么适合，再展示评分</h3><p>触控目标 ≥ 44×44pt，图片圆角 24pt，卡片圆角 20pt。</p></div></div></section><section><h2>原则</h2><ul><li>自然、真实、可抵达的生活方式摄影</li><li>避免粉色浪漫俗套、机器人形象和无限信息流</li><li>推荐理由不暴露任何私密偏好或对话内容</li><li>减少动态模式下，用淡入替代大幅位移动画</li></ul></section></main>`);
}

function profileCheckboxGroup(name, options, values = []) {
  const selectedValues = new Set(values || []);
  return `<div class="profile-check-grid">${options.map((option) => `<label><input type="checkbox" name="${name}" value="${escapeHTML(option)}" ${checked(selectedValues.has(option))}/><span>${escapeHTML(option)}</span></label>`).join('')}</div>`;
}

function renderModal(state) {
  const modal = state.ui.modal;
  if (!modal) return '';
  if (modal === 'share-plan' && state.currentPlan) {
    return `<div class="modal-layer"><section class="sheet share-sheet" role="dialog" aria-modal="true" aria-labelledby="sharePlanTitle"><div class="sheet-handle"></div><div class="section-row"><div><span class="eyebrow">分享约见</span><h2 id="sharePlanTitle">把这版安排发给 TA</h2></div><button class="icon-btn" data-action="close-modal">${icon('close')}</button></div><div class="share-platform-grid"><button data-action="share-platform" data-platform="wechat"><i class="share-brand wechat">微</i><strong>微信</strong><small>海报 + 配文</small></button><button data-action="share-platform" data-platform="qq"><i class="share-brand qq">Q</i><strong>QQ</strong><small>海报 + 配文</small></button><button data-action="share-platform" data-platform="xiaohongshu"><i class="share-brand xiaohongshu">红</i><strong>小红书</strong><small>竖版分享</small></button><button data-action="share-platform" data-platform="douyin"><i class="share-brand douyin">抖</i><strong>抖音</strong><small>海报 + 配文</small></button></div><div class="share-utility-row"><button class="btn secondary" data-action="system-share-plan">${icon('share')} 系统分享</button><button class="btn secondary" data-action="save-plan-poster">保存海报</button></div><button class="text-btn share-copy" data-action="copy-plan-caption">复制方案文字</button><p class="share-note">点击平台后会优先打开手机系统分享；若浏览器不支持，则自动保存海报并复制配文。</p></section></div>`;
  }
  if (modal.startsWith('replace-stop:')) {
    const stopId = modal.slice('replace-stop:'.length);
    const stop = state.currentPlan?.stops?.find((item) => item.stopId === stopId);
    if (!stop) return '';
    const replacingCoreTheme = Boolean(state.currentPlan?.sourceTheme && placeMatchesTheme(stop, state.currentPlan.sourceTheme));
    return `<div class="modal-layer wrap-choice-layer" role="presentation"><section class="sheet wrap-choice-sheet replace-choice-sheet" role="dialog" aria-modal="true" aria-labelledby="replaceChoiceTitle">
      <div class="sheet-handle"></div>
      <div class="section-row"><div><span class="eyebrow">调整行程</span><h2 id="replaceChoiceTitle">想把「${escapeHTML(stop.name)}」换成什么？</h2></div><button class="icon-btn" data-action="close-modal" aria-label="关闭选择">${icon('close')}</button></div>
      <div class="wrap-choice-options replace-choice-options">${REPLACEMENT_OPTIONS.map((option) => `<button type="button" class="wrap-choice-option" data-action="choose-replacement" data-id="${escapeHTML(stopId)}" data-mode="${escapeHTML(option.mode)}">
        <span class="wrap-choice-option-icon">${icon(option.icon)}</span>
        <span><strong>${escapeHTML(option.label)}</strong><small>${escapeHTML(option.description)}</small></span>
        <span class="wrap-choice-option-arrow">${icon('chevron')}</span>
      </button>`).join('')}</div>
      <p class="wrap-choice-note">${icon('shield')} ${replacingCoreTheme ? `“同类换一家”会继续保留“${escapeHTML(state.currentPlan.sourceTheme)}”；只有你主动选择其他类型，才会改变本次核心活动。` : '会继续保留本次核心活动，并遵守预算、距离和总时长。'}</p>
    </section></div>`;
  }
  if (modal.startsWith('wrap-choice:')) {
    const field = modal.split(':')[1];
    const group = WRAPUP_CHOICE_GROUPS[field];
    if (!group) return '';
    const currentValue = state.wrapup[field];
    return `<div class="modal-layer wrap-choice-layer" role="presentation"><section class="sheet wrap-choice-sheet" role="dialog" aria-modal="true" aria-labelledby="wrapChoiceTitle">
      <div class="sheet-handle"></div>
      <div class="section-row"><div><span class="eyebrow">${escapeHTML(group.eyebrow)}</span><h2 id="wrapChoiceTitle">${escapeHTML(group.title)}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="关闭选择">${icon('close')}</button></div>
      <div class="wrap-choice-options">${group.options.map((option) => {
        const active = option.value === currentValue;
        return `<button type="button" class="wrap-choice-option ${active ? 'active' : ''}" data-action="choose-wrap-option" data-field="${escapeHTML(field)}" data-value="${escapeHTML(option.value)}">
          <span class="wrap-choice-option-icon">${icon(option.icon)}</span>
          <span><strong>${escapeHTML(option.label || option.value)}</strong><small>${escapeHTML(option.description)}</small></span>
          <span class="wrap-choice-option-check">${active ? icon('check') : ''}</span>
        </button>`;
      }).join('')}</div>
      <p class="wrap-choice-note">${icon('shield')} ${escapeHTML(group.note)}</p>
    </section></div>`;
  }
  if (modal === 'auth:login' || modal === 'auth:register') {
    const register = modal === 'auth:register';
    return `<div class="modal-layer"><section class="sheet auth-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="section-row"><div><span class="eyebrow">约见账号</span><h2>${register ? '创建独立账号' : '登录约见'}</h2></div><button class="icon-btn" data-action="close-modal">${icon('close')}</button></div><p class="auth-intro">登录后可同步你们的档案、方案和 Memory。</p><form id="authForm" class="sheet-form" data-mode="${register ? 'register' : 'login'}">${register ? '<label>怎么称呼你<input name="displayName" maxlength="30" autocomplete="name" placeholder="输入你的称呼" required/></label>' : ''}<label>邮箱<input name="email" type="email" maxlength="180" autocomplete="email" placeholder="name@example.com" required/></label><label>密码<input name="password" type="password" minlength="8" maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}" placeholder="至少 8 位" required/></label>${state.account.error ? `<p class="form-error">${escapeHTML(state.account.error)}</p>` : ''}<button type="submit" class="btn primary full" ${state.account.status === 'submitting' ? 'disabled' : ''}>${state.account.status === 'submitting' ? '正在处理…' : register ? '创建并开始同步' : '登录并恢复数据'}</button><button type="button" class="text-btn auth-switch" data-action="switch-auth" data-mode="${register ? 'login' : 'register'}">${register ? '已有账号？去登录' : '还没有账号？创建一个'}</button></form></section></div>`;
  }
  if (modal === 'account-profile' && state.account.user) {
    return `<div class="modal-layer"><section class="sheet auth-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="section-row"><div><span class="eyebrow">PRIVACY</span><h2>账号信息已保护</h2></div><button class="icon-btn" data-action="close-modal">${icon('close')}</button></div><p class="auth-intro">当前以“${escapeHTML(state.account.user.displayName || '个人账号')}”登录。邮箱只用于身份验证，不会展示在公开页面或分享内容中。</p><button type="button" class="btn secondary full" data-action="logout-account">退出登录</button><button type="button" class="btn primary full" data-action="close-modal">完成</button></section></div>`;
  }
  if (modal.startsWith('guest-profile:')) {
    const guestId = modal.split(':')[1] === 'partner' ? 'partner' : 'user';
    const guest = state.profile.guests?.[guestId] || {};
    const guestTitle = guestId === 'user' ? '我' : '伴侣';
    const dialogTitle = `${guestId === 'user' ? '你的' : 'TA 的'}档案`;
    return `<div class="modal-layer guest-profile-layer"><section class="sheet guest-profile-sheet" role="dialog" aria-modal="true" aria-labelledby="guestProfileTitle">
      <header class="guest-sheet-header"><div class="sheet-handle"></div><div class="section-row"><div><span class="eyebrow">${escapeHTML(guestTitle)}</span><h2 id="guestProfileTitle">${escapeHTML(dialogTitle)}</h2></div><button class="icon-btn" data-action="close-modal" aria-label="关闭档案">${icon('close')}</button></div><p>只记录会影响约会体验的信息，之后随时可以修改。</p></header>
      <form id="guestProfileForm" class="sheet-form" data-guest="${guestId}">
        <div class="guest-sheet-scroll" data-scroll-region="guest-profile">
          <label>怎么称呼<input name="name" maxlength="20" value="${escapeHTML(guest?.name || (guestId === 'user' ? '你' : 'TA'))}" required/></label>
          <section class="profile-form-section"><span class="control-label">喜欢吃什么</span>${profileCheckboxGroup('foodLikes', PROFILE_FOOD_OPTIONS, guest?.foodLikes)}</section>
          <section class="profile-form-section"><span class="control-label">饮食需要</span>${profileCheckboxGroup('dietaryNeeds', PROFILE_DIETARY_OPTIONS, guest?.dietaryNeeds)}</section>
          <section class="profile-form-section"><span class="control-label">喜欢做什么</span>${profileCheckboxGroup('activityLikes', PROFILE_ACTIVITY_OPTIONS, guest?.activityLikes)}</section>
          <label>明确避开的体验<textarea name="activityAvoids" maxlength="160" placeholder="太吵、排长队、恐怖密室">${escapeHTML((guest?.activityAvoids || []).join('、'))}</textarea></label>
          <div class="profile-form-divider"><span>相处方式</span></div>
          <div class="form-two"><label>相处节奏<select name="socialPace">${PROFILE_PACE_OPTIONS.map((option) => `<option value="${escapeHTML(option)}" ${selected(option, guest?.socialPace || '')}>${escapeHTML(option || '暂不设置')}</option>`).join('')}</select></label><label>聊天方式<select name="conversationStyle">${PROFILE_CONVERSATION_OPTIONS.map((option) => `<option value="${escapeHTML(option)}" ${selected(option, guest?.conversationStyle || '')}>${escapeHTML(option || '暂不设置')}</option>`).join('')}</select></label></div>
          <div class="form-two"><label>活动强度<select name="energyLevel">${PROFILE_ENERGY_OPTIONS.map((option) => `<option value="${escapeHTML(option)}" ${selected(option, guest?.energyLevel || '')}>${escapeHTML(option || '暂不设置')}</option>`).join('')}</select></label><label>规划重点<select name="planningPriority">${PROFILE_PRIORITY_OPTIONS.map((option) => `<option value="${escapeHTML(option)}" ${selected(option, guest?.planningPriority || '')}>${escapeHTML(option || '暂不设置')}</option>`).join('')}</select></label></div>
          <div class="profile-form-divider"><span>实际安排</span></div>
          <div class="form-two"><label>预算态度<select name="budgetStyle">${PROFILE_BUDGET_OPTIONS.map((option) => `<option value="${escapeHTML(option)}" ${selected(option, guest?.budgetStyle || '')}>${escapeHTML(option || '暂不设置')}</option>`).join('')}</select></label><label>交通偏好<select name="transportPreference">${PROFILE_TRANSPORT_OPTIONS.map((option) => `<option value="${escapeHTML(option)}" ${selected(option, guest?.transportPreference || '')}>${escapeHTML(option || '暂不设置')}</option>`).join('')}</select></label></div>
          <label>时间习惯<select name="timePreference">${PROFILE_TIME_OPTIONS.map((option) => `<option value="${escapeHTML(option)}" ${selected(option, guest?.timePreference || '')}>${escapeHTML(option || '暂不设置')}</option>`).join('')}</select></label>
          <section class="profile-form-section"><span class="control-label">常去街区</span>${profileCheckboxGroup('favoriteAreas', PROFILE_AREA_OPTIONS, guest?.favoriteAreas)}</section>
          <section class="profile-form-section"><span class="control-label">常见约会场合</span>${profileCheckboxGroup('occasionPreferences', PROFILE_OCCASION_OPTIONS, guest?.occasionPreferences)}</section>
          <label>行动便利需求<textarea name="accessibilityNotes" maxlength="160" placeholder="少楼梯、少走路、需要无障碍通道">${escapeHTML(guest?.accessibilityNotes || '')}</textarea></label>
          <label>私密备注<textarea name="notes" maxlength="240" placeholder="只用于规划，不会公开展示">${escapeHTML(guest?.notes || '')}</textarea></label>
        </div>
        <footer class="guest-sheet-footer"><span>保存后用于两人的方案匹配</span><button type="submit" class="btn primary">保存档案</button></footer>
      </form>
    </section></div>`;
  }
  if (modal === 'delete-account') {
    return `<div class="modal-layer"><section class="confirm-dialog card" role="dialog" aria-modal="true"><span class="confirm-icon danger">${icon('alert')}</span><h2>清除我的云端数据？</h2><p>独立数据库中的偏好、方案、Memory 和 Agent 运行摘要都会删除，本机数据也会一并清空；账号仍可继续登录使用。</p><div><button class="btn secondary" data-action="close-modal">取消</button><button class="btn danger-btn" data-action="delete-account">确认清除</button></div></section></div>`;
  }
  if (modal === 'conditions') {
    const c = state.conditions;
    const userDeparture = state.meeting?.departures?.user;
    const partnerDeparture = state.meeting?.departures?.partner;
    const hasBothDepartures = Boolean(userDeparture && partnerDeparture);
    const initialCenterLabel = hasBothDepartures ? '每个人到约会地点' : c.centerMode === 'current' ? '当前位置' : `「${c.area}」`;
    return `<div class="modal-layer" role="presentation"><section class="sheet condition-sheet" role="dialog" aria-modal="true" aria-labelledby="conditionsTitle"><div class="sheet-handle"></div><div class="section-row"><div><span class="eyebrow">仅影响本次</span><h2 id="conditionsTitle">调整约见条件</h2></div><button class="icon-btn" data-action="close-modal">${icon('close')}</button></div><form id="conditionsForm" class="sheet-form">
      ${state.conversation.theme ? `<div class="condition-theme-lock"><span>${icon(ideaIconName({ tag: state.conversation.theme, title: state.conversation.themeTitle }))}</span><div><small>本次活动已选</small><strong>${escapeHTML(state.conversation.theme)}</strong><p>这里只调整预算、距离和时间，不会把活动改成其他类型。</p></div><button type="button" data-action="change-theme">更换</button></div>` : `<label class="control-label">这次更想把重点放在哪？</label>${moodSelector({ value: c.mood, action: 'set-form-choice', name: 'mood' })}`}
      <label class="control-label">两人总预算</label>${rangeControl({ field: 'budget', value: c.budget, min: 200, max: 1200, step: 50, prefix: '¥', labels: ['¥200', '预算参考', '¥1200'] })}
      <label class="control-label">双方出发位置</label><div class="condition-departures"><div><span>你</span><strong>${escapeHTML(userDeparture?.label || '尚未设置')}</strong></div><div><span>TA</span><strong>${escapeHTML(partnerDeparture?.label || '尚未设置')}</strong></div><button type="button" data-action="edit-departures">修改位置</button></div>
      <input type="hidden" name="centerMode" value="area"/><input type="hidden" name="area" value="${escapeHTML(c.area)}"/>
      <label class="control-label">每个人最多走多远</label>${rangeControl({ field: 'distance', value: c.distance, min: 1, max: 40, step: 1, suffix: ' km', labels: ['1 km', '分别计算双方距离', '40 km'] })}
      <p class="range-center-summary" data-range-center-summary><span>筛选方式</span><strong>${escapeHTML(initialCenterLabel)} · 最多 ${c.distance} km</strong><small>${hasBothDepartures ? '百度地图以双方中间区域检索，再剔除任一方超出上限的地点' : '设置双方位置后，将分别计算两个人到地点的距离'}</small></p>
      <label class="control-label">可用时间</label>${rangeControl({ field: 'duration', value: c.duration, min: 1, max: 6, step: 0.0833333333, labels: ['1 小时', '5 分钟一档 · 包含通勤', '6 小时'] })}
      <label class="checkbox-line"><input type="checkbox" name="indoorOnly" ${checked(c.indoorOnly)}/> 本次只考虑室内地点</label><button type="button" class="btn primary full" data-action="save-conditions">保存条件</button></form></section></div>`;
  }
  if (modal === 'accept-plan') {
    return `<div class="modal-layer"><section class="confirm-dialog card" role="dialog" aria-modal="true"><span class="confirm-icon">${icon('location')}</span><h2>确认使用这版约见方案？</h2><p>确认后，行程页打开期间会用设备位置识别到达，不需要逐站打卡。离开页面即停止读取位置，也不会自动预订、付款或通知任何人。</p><div><button class="btn secondary" data-action="close-modal">再看看</button><button class="btn primary" data-action="confirm-plan">确认方案</button></div></section></div>`;
  }
  if (modal.startsWith('edit-memory:')) {
    const id = modal.split(':')[1];
    const memory = state.memories.find((item) => item.id === id);
    if (!memory) return '';
    return `<div class="modal-layer"><section class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><div class="section-row"><h2>编辑 Memory</h2><button class="icon-btn" data-action="close-modal">${icon('close')}</button></div><form id="memoryEditForm" class="sheet-form" data-id="${memory.id}"><label>标题<input name="title" value="${escapeHTML(memory.title)}" required/></label><label>这一晚的一句话<textarea name="note" required>${escapeHTML(memory.note)}</textarea></label><label>可见范围<select name="visibility"><option value="couple" ${selected('couple', memory.visibility)}>我们可见</option><option value="private" ${selected('private', memory.visibility)}>仅自己</option></select></label><button type="button" class="btn primary full" data-action="save-memory-edit" data-id="${memory.id}">保存修改</button></form></section></div>`;
  }
  if (modal.startsWith('delete-memory:')) {
    const id = modal.split(':')[1];
    return `<div class="modal-layer"><section class="confirm-dialog card" role="dialog" aria-modal="true"><span class="confirm-icon danger">${icon('trash')}</span><h2>删除这段 Memory？</h2><p>删除后将从本机移除。此操作不会影响原来的约见方案。</p><div><button class="btn secondary" data-action="close-modal">取消</button><button class="btn danger-btn" data-action="delete-memory" data-id="${id}">确认删除</button></div></section></div>`;
  }
  if (modal === 'delete-data') {
    return `<div class="modal-layer"><section class="confirm-dialog card" role="dialog" aria-modal="true"><span class="confirm-icon danger">${icon('alert')}</span><h2>删除所有本机数据？</h2><p>偏好、方案、Memory 和设置都会清空，并重新进入首次使用流程。</p><div><button class="btn secondary" data-action="close-modal">取消</button><button class="btn danger-btn" data-action="delete-all-data">全部删除</button></div></section></div>`;
  }
  return '';
}

function render() {
  const state = store.getState();
  const route = currentRoute();
  if (route.name !== 'plan') clearPlanPresenceWatch();
  const routeKey = `${route.name}/${route.id || ''}`;
  const routeChanged = routeKey !== lastRenderedRouteKey;
  const views = {
    welcome: () => renderWelcome(),
    onboarding: () => renderOnboarding(state),
    tonight: () => renderTonight(state),
    conversation: () => renderConversation(state),
    'map-explore': () => renderMapExplore(state),
    plan: () => renderPlan(state),
    place: () => renderPlace(state, route.id),
    memory: () => renderMemory(state),
    'memory-agent': () => renderMemoryAgent(state),
    profile: () => renderProfile(state),
    discover: () => renderDiscover(state),
    settings: () => renderSettings(state),
    wrapup: () => renderWrapup(state),
    states: () => renderStates(),
    'design-system': () => renderDesignSystem()
  };
  const nextMarkup = (views[route.name] || views.tonight)();
  document.body.classList.toggle('modal-open', Boolean(state.ui.modal));
  if (!routeChanged && nextMarkup === lastRenderedMarkup) {
    syncToastElement(state.ui.toast);
    return;
  }
  const scrollState = routeChanged ? [] : captureScrollState();
  app.innerHTML = nextMarkup;
  lastRenderedMarkup = nextMarkup;
  document.body.dataset.route = route.name;
  const shell = document.querySelector('.phone-shell');
  if (routeChanged && motionEnabled()) shell?.classList.add('route-enter');
  lastRenderedRouteKey = routeKey;
  applyPendingMicroMotion();
  syncToastElement(state.ui.toast);
  queueMicrotask(() => {
    restoreScrollState(scrollState);
    hydrateRenderedView(route);
  });
}

async function hydrateMemoryAgentMedia() {
  const cards = [...document.querySelectorAll('[data-memory-media-id]')];
  await Promise.all(cards.map(async (card) => {
    const id = card.dataset.memoryMediaId;
    if (!id || card.querySelector('img, video')) return;
    try {
      let media = memoryMediaObjectUrls.get(id);
      if (!media) {
        media = await memoryMediaService.objectUrl(id);
        if (media) memoryMediaObjectUrls.set(id, media);
      }
      if (!media?.url || !card.isConnected) return;
      const element = document.createElement(media.type?.startsWith('video/') ? 'video' : 'img');
      element.src = media.url;
      element.alt = '本次活动上传素材';
      if (element.tagName === 'VIDEO') {
        element.muted = true;
        element.playsInline = true;
        element.preload = 'metadata';
      }
      card.prepend(element);
      card.querySelector('.memory-media-placeholder')?.remove();
    } catch {
      // Keep the lightweight placeholder when a local blob is unavailable.
    }
  }));
}

async function hydrateRenderedView(route) {
  const state = store.getState();
  const config = state.maps.config;
  if (route.name === 'memory-agent') hydrateMemoryAgentMedia();
  if (route.name === 'plan') ensurePlanPresenceWatch();
  if (route.name === 'map-explore') {
    if (config.placesEnabled && state.places.mode !== 'live' && !mapSearchInFlight && state.places.status !== 'loading') {
      refreshMapPlaces();
    }
    if (!config.placesEnabled && state.conditions.centerMode === 'current' && !state.maps.searchCenter && !searchCenterInFlight) {
      searchCenterInFlight = true;
      mapService.resolveSearchCenterForConditions(state.conditions, state.settings.locationEnabled, state.meeting?.departures)
        .then((center) => store.actions.setSearchCenter(center))
        .finally(() => { searchCenterInFlight = false; });
    }
    const latestState = store.getState();
    const candidates = mapCandidates(latestState);
    const baseSearchCenter = searchCenterForState(latestState);
    const searchCenter = baseSearchCenter && candidates.searchDistanceKm
      ? { ...baseSearchCenter, radiusKm: Number(candidates.searchDistanceKm) }
      : baseSearchCenter;
    const mapElement = document.querySelector('#browseMap');
    if (mapElement && (candidates.length || searchCenter)) {
      mapService.renderBrowseMap(mapElement, candidates, config, latestState.ui.mapSelectedId, searchCenter).catch(() => {
        if (!mapErrorsShown.has('browse')) {
          mapErrorsShown.add('browse');
          showToast('筛选地图暂时加载失败');
        }
      });
    }
  }
  if (route.name === 'place' && route.id) {
    const place = findPlace(state, route.id);
    if (['google', 'baidu'].includes(place?.source) && !placeDetailsInFlight.has(place.id) && !['ready', 'error'].includes(state.places.detailStatus[place.id])) {
      placeDetailsInFlight.add(place.id);
      store.actions.setPlaceDetailStatus(place.id, 'loading');
      try {
        const detail = await placeService.getDetails(place);
        store.actions.mergePlaceDetail(place.id, detail);
      } catch (error) {
        store.actions.setPlaceDetailStatus(place.id, 'error');
        showToast(error.message || '商家详情暂时无法刷新');
      } finally {
        placeDetailsInFlight.delete(place.id);
      }
      return;
    }
    const latestPlace = findPlace(store.getState(), route.id);
    const mapElement = document.querySelector('#placeMap');
    if (latestPlace?.location && mapElement && config.mapsEnabled) {
      mapService.renderPlaceMap(mapElement, latestPlace, config).catch(() => {
        if (!mapErrorsShown.has('place')) {
          mapErrorsShown.add('place');
          showToast(`${mapService.providerLabel(config)}暂时加载失败`);
        }
      });
    }
  }

  if (route.name === 'plan' && state.currentPlan?.stops?.filter((stop) => stop.location).length >= 2) {
    const key = mapService.routeKey(state.currentPlan);
    const routeState = state.maps.route;
    const canComputeGoogleRoute = config.routesEnabled && state.currentPlan.stops.some((stop) => stop.source === 'google');
    if (canComputeGoogleRoute && key && routeState.key !== key && routeState.status !== 'loading') {
      store.actions.setRouteStatus('loading', key);
      try {
        const routeData = await mapService.computeRoute(state.currentPlan);
        store.actions.setRouteStatus('ready', key, routeData);
      } catch (error) {
        store.actions.setRouteStatus('error', key, null, error.message || '路线暂时不可用');
      }
      return;
    }
    const mapElement = document.querySelector('#planMap');
    if (mapElement && config.mapsEnabled) {
      mapService.renderPlanMap(mapElement, state.currentPlan, routeState.data, config).catch(() => {
        if (!mapErrorsShown.has('plan')) {
          mapErrorsShown.add('plan');
          showToast('路线地图暂时加载失败');
        }
      });
    }
  }
}

async function refreshMapPlaces() {
  if (mapSearchInFlight) return;
  mapSearchInFlight = true;
  store.actions.setPlaceSearchStatus('loading');
  try {
    const state = store.getState();
    const profile = state.profile;
    const result = await placeService.searchForPlan({
      conditions: aiPlannerService.getEffectiveConditions(state.conditions, profile),
      theme: state.conversation.theme,
      locationEnabled: state.settings.locationEnabled,
      departures: state.meeting?.departures
    });
    store.actions.setSearchCenter(result.center);
    if (result.places.length) store.actions.setLivePlaces(result.places);
    else if (result.unavailableTheme && state.conversation.theme) {
      store.actions.setLivePlaces([]);
      showToast(`已自动搜索到 ${result.searchDistanceKm} km，仍没找到符合条件的“${state.conversation.theme}”`);
    } else store.actions.setLivePlaces([]);
  } catch (error) {
    store.actions.useDemoPlaces(error.message || '真实地点暂时不可用');
    showToast('真实地点暂时不可用，先展示北京内置地点');
  } finally {
    mapSearchInFlight = false;
  }
}

async function refreshInspirations() {
  if (inspirationInFlight) return;
  inspirationInFlight = true;
  store.actions.setAgentStatus('loading');
  try {
    const state = store.getState();
    const profile = state.profile;
    const result = await inspirationService.generate({
      conditions: aiPlannerService.getEffectiveConditions(state.conditions, profile),
      profile,
      weather: state.weather.data,
      places: availablePlaces(state),
      seed: `${Date.now()}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`
    });
    store.actions.setAgentIdeas(result.ideas, result.provider, result.mode);
  } catch (error) {
    store.actions.setAgentStatus('error', error.message || '灵感暂时无法生成');
    showToast('新灵感暂时没生成出来，请再试一次');
  } finally {
    inspirationInFlight = false;
  }
}

async function initializeAccount() {
  try {
    const { user } = await accountService.me();
    if (!user) {
      store.actions.setAccount('signed_out', null, null);
      accountBootstrapComplete = true;
      return;
    }
    store.actions.setAccount('ready', user, null);
    const remote = await accountService.loadState();
    if (remote.state) {
      store.actions.applyRemoteState(remote.state);
      showAccountRestoreToastOnce();
    }
    else await accountService.saveState(store.getSyncPayload());
    lastSyncSignature = JSON.stringify(store.getSyncPayload());
    accountBootstrapComplete = true;
    store.actions.setSyncStatus('ready', remote.updatedAt || new Date().toISOString());
  } catch (error) {
    accountBootstrapComplete = true;
    store.actions.setAccount('signed_out', null, error.status === 401 ? null : error.message);
  }
}

async function startAccountSession(user) {
  store.actions.setAccount('ready', user, null);
  accountBootstrapComplete = false;
  try {
    const remote = await accountService.loadState();
    if (remote.state) store.actions.applyRemoteState(remote.state);
    else await accountService.saveState(store.getSyncPayload());
    lastSyncSignature = JSON.stringify(store.getSyncPayload());
    accountBootstrapComplete = true;
    store.actions.setSyncStatus('ready', remote.updatedAt || new Date().toISOString());
  } catch (error) {
    accountBootstrapComplete = true;
    store.actions.setSyncStatus('error');
    throw error;
  }
}

function scheduleAccountSync(state) {
  if (!accountBootstrapComplete || !state.account.user) return;
  const payload = store.getSyncPayload();
  const signature = JSON.stringify(payload);
  if (signature === lastSyncSignature) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    store.actions.setSyncStatus('syncing');
    try {
      const result = await accountService.saveState(payload);
      lastSyncSignature = signature;
      store.actions.setSyncStatus('ready', result.updatedAt);
    } catch {
      store.actions.setSyncStatus('error');
    }
  }, 650);
}

async function initializeExternalServices() {
  store.actions.setWeatherStatus('loading');
  const [config, weatherResult] = await Promise.all([
    mapsConfigService.getConfig({ refresh: true }),
    weatherService.getTonightWeather().then((data) => ({ data })).catch((error) => ({ error }))
  ]);
  store.actions.setMapsConfig(config);
  if (!config.placesEnabled) store.actions.useDemoPlaces();
  if (weatherResult.data) store.actions.setWeatherStatus('ready', weatherResult.data);
  else store.actions.setWeatherStatus('error', null, weatherResult.error?.message || '天气暂时不可用');
}

async function generatePlan() {
  const state = store.getState();
  if (!['idle', 'complete'].includes(state.conversation.status)) return;
  store.actions.setConversationStatus('正在理解你们刚才的选择');
  try {
    const coupleProfile = state.profile;
    const effectiveConditions = aiPlannerService.getEffectiveConditions(state.conditions, coupleProfile);
    let planningPlaces = availablePlaces(store.getState());
    const config = store.getState().maps.config;
    if (config.placesEnabled) {
      const providerName = config.placesProvider === 'baidu' ? '百度地图' : 'Google Maps';
      store.actions.setConversationStatus(`正在${providerName}搜索真实商家`);
      store.actions.setPlaceSearchStatus('loading');
      try {
        const result = await placeService.searchForPlan({
          conditions: effectiveConditions,
          theme: state.conversation.theme,
          locationEnabled: state.settings.locationEnabled,
          departures: state.meeting?.departures
        });
        store.actions.setSearchCenter(result.center);
        const hasThemePlace = !state.conversation.theme || result.places.some((place) => placeMatchesTheme(place, state.conversation.theme));
        if (hasThemePlace && (state.conversation.theme || result.places.length >= 3)) {
          store.actions.setLivePlaces(result.places);
          planningPlaces = result.places;
        } else if (result.unavailableTheme && state.conversation.theme) {
          store.actions.setLivePlaces([]);
          planningPlaces = [];
        } else {
          store.actions.useDemoPlaces('目标街区的实时结果不足，已使用演示地点保证方案完整');
        }
      } catch (error) {
        store.actions.useDemoPlaces(error.message || '实时地点暂时不可用');
        showToast('实时商家暂时不可用，已切换到演示地点');
      }
    }
    const plan = await aiPlannerService.generate({
      places: planningPlaces,
      conditions: effectiveConditions,
      profile: coupleProfile,
      theme: state.conversation.theme,
      themeTitle: state.conversation.themeTitle,
      weather: store.getState().weather.data,
      messages: store.getState().conversation.answers,
      preferredPlaceIds: store.getState().conversation.preferredPlaceIds,
      feedback: recommendationFeedbackForState(store.getState()),
      onStatus: (status) => store.actions.setConversationStatus(status)
    });
    if (plan.unavailableTheme) {
      store.actions.setConversationStatus('idle');
      showToast(`已自动搜索到 ${plan.searchDistanceKm} km，仍没找到符合条件的“${plan.sourceTheme}”。可调整预算或时长再试。`);
      return;
    }
    if (plan.rangeExpanded) {
      showToast(`为保留“${plan.sourceTheme}”，已自动把范围扩大到 ${plan.searchDistanceKm} km`);
    }
    const latestConversation = store.getState().conversation;
    const bucketCoreStop = latestConversation.bucketItemId
      ? plan.stops.find((stop) => placeMatchesTheme(stop, plan.sourceTheme)) || plan.stops[0]
      : null;
    store.actions.setCurrentPlan({
      ...plan,
      bucketItemId: latestConversation.bucketItemId || null,
      bucketCoreStopId: bucketCoreStop?.stopId || null
    });
    go('plan');
  } catch (error) {
    console.error('generatePlan failed', error);
    store.actions.setConversationStatus('idle');
    showToast(error?.message ? `生成没有完成：${error.message}` : '生成没有完成，请再试一次');
  }
}

async function answerConversation(answer) {
  const state = store.getState();
  const step = state.conversation.step;
  const question = aiPlannerService.getQuestion(step, state.conversation.theme);
  const patch = aiPlannerService.interpretAnswer(question.id, answer);
  store.actions.answerConversation(answer, patch);
}

function saveConditionsForm() {
  const form = document.querySelector('#conditionsForm');
  if (!form) return;
  const conditions = {
    mood: form.querySelector('[name="mood"]')?.value || store.getState().conditions.mood,
    centerMode: form.querySelector('[name="centerMode"]')?.value === 'current' ? 'current' : 'area',
    budget: Number(form.querySelector('[name="budget"]').value),
    distance: Number(form.querySelector('[name="distance"]').value),
    duration: Number(form.querySelector('[name="duration"]').value),
    area: form.querySelector('[name="area"]').value || '北京东城区附近',
    indoorOnly: form.querySelector('[name="indoorOnly"]').checked
  };
  if (conditions.centerMode === 'current' && !store.getState().settings.locationEnabled) {
    conditions.centerMode = 'area';
  }
  closeModalWithMotion(() => {
    store.actions.updateConditions(conditions);
    store.actions.setUI({ modal: null });
    showToast(store.getState().meeting?.departures?.user && store.getState().meeting?.departures?.partner
      ? '已更新双方各自的距离上限'
      : '已更新地点筛选范围');
  });
}

function updateConditionsCenterSummary(form) {
  if (!form) return;
  const distance = Number(form.querySelector('[name="distance"]')?.value || 6);
  const summary = form.querySelector('[data-range-center-summary]');
  const strong = summary?.querySelector('strong');
  if (strong) strong.textContent = `每个人到约会地点 · 最多 ${distance} km`;
}

async function sendChatForm() {
  const input = document.querySelector('#chatText');
  const value = input?.value.trim();
  if (!value) {
    showToast('先写下你想补充的条件');
    input?.focus();
    return;
  }
  input.blur();
  await answerConversation(value);
}

function searchMemoryForm() {
  const input = document.querySelector('#memorySearchInput');
  store.actions.setUI({ memoryQuery: input?.value || '' });
}

function saveMemoryEditForm(id) {
  const form = document.querySelector('#memoryEditForm');
  if (!form) return;
  const title = form.querySelector('[name="title"]').value.trim();
  const note = form.querySelector('[name="note"]').value.trim();
  if (!title || !note) {
    showToast('标题和一句话都需要填写');
    return;
  }
  const memoryId = id || form.dataset.id;
  const visibility = form.querySelector('[name="visibility"]').value;
  closeModalWithMotion(() => {
    store.actions.setUI({ modal: null });
    store.actions.updateMemory(memoryId, { title, note, visibility });
    showToast('Memory 已更新');
  });
}

async function submitAuthForm(form) {
  if (!form) return;
  const mode = form.dataset.mode;
  const input = {
    email: form.querySelector('[name="email"]')?.value.trim(),
    password: form.querySelector('[name="password"]')?.value,
    displayName: form.querySelector('[name="displayName"]')?.value.trim()
  };
  store.actions.setAccount('submitting', null, null);
  try {
    const result = mode === 'register' ? await accountService.register(input) : await accountService.login(input);
    await startAccountSession(result.user);
    store.actions.setUI({ modal: null });
    showToast(mode === 'register' ? '账号已创建，数据已开始同步' : '登录成功，已恢复账号数据');
  } catch (error) {
    store.actions.setAccount('signed_out', null, error.message || '登录没有完成');
  }
}

function submitGuestProfile(form) {
  if (!form) return;
  const values = (name) => [...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value);
  const guestId = form.dataset.guest === 'partner' ? 'partner' : 'user';
  const name = form.querySelector('[name="name"]')?.value.trim();
  if (!name) {
    showToast('请填写称呼');
    return;
  }
  store.actions.updateGuestProfile(guestId, {
    name,
    foodLikes: values('foodLikes'),
    dietaryNeeds: values('dietaryNeeds'),
    activityLikes: values('activityLikes'),
    activityAvoids: splitProfileItems(form.querySelector('[name="activityAvoids"]')?.value),
    socialPace: form.querySelector('[name="socialPace"]')?.value || '',
    conversationStyle: form.querySelector('[name="conversationStyle"]')?.value || '',
    energyLevel: form.querySelector('[name="energyLevel"]')?.value || '',
    planningPriority: form.querySelector('[name="planningPriority"]')?.value || '',
    budgetStyle: form.querySelector('[name="budgetStyle"]')?.value || '',
    transportPreference: form.querySelector('[name="transportPreference"]')?.value || '',
    timePreference: form.querySelector('[name="timePreference"]')?.value || '',
    favoriteAreas: values('favoriteAreas'),
    occasionPreferences: values('occasionPreferences'),
    accessibilityNotes: form.querySelector('[name="accessibilityNotes"]')?.value.trim() || '',
    notes: form.querySelector('[name="notes"]')?.value.trim() || ''
  });
  store.actions.setUI({ modal: null });
  showToast(`${name}的偏好档案已保存`);
}

async function handleAppClick(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  const control = path.find((node) => node?.dataset?.route || node?.dataset?.action);
  if (!control || control.disabled) return;
  if (control.dataset.route) {
    const nav = control.closest('.bottom-nav');
    if (nav && MAIN_NAV_ROUTES.includes(control.dataset.route)) {
      const items = [...nav.querySelectorAll('.nav-item')];
      const fromIndex = Math.max(0, items.findIndex((item) => item.classList.contains('active')));
      const toIndex = Math.max(0, items.indexOf(control));
      if (fromIndex !== toIndex) queueMicroMotion({ type: 'nav-track', fromIndex });
    }
    go(control.dataset.route);
    return;
  }
  const button = control;
  const action = button.dataset.action;
  const state = store.getState();

  if (action === 'back') {
    const route = currentRoute();
    if (route.name === 'onboarding' && state.onboarding.step > 1 && !state.onboarding.completed) {
      store.actions.setOnboardingStep(state.onboarding.step - 1);
    } else if (route.name === 'onboarding' && state.onboarding.completed) {
      go('tonight');
    } else {
      history.length > 1 ? history.back() : go(state.onboarding.completed ? 'tonight' : 'welcome');
    }
  }
  if (action === 'begin-onboarding') {
    store.actions.chooseOnboardingPath('invite');
    go('onboarding');
  }
  if (action === 'onboarding-path') store.actions.chooseOnboardingPath(button.dataset.value);
  if (action === 'use-current-departure') {
    const guest = button.dataset.guest === 'partner' ? 'partner' : 'user';
    store.actions.setDepartureStatus(guest, 'locating');
    try {
      const location = await locationService.current();
      store.actions.setDepartureLocation(guest, location);
      showToast(`${guest === 'partner' ? 'TA' : '你'}的出发位置已设置`);
    } catch (error) {
      store.actions.setDepartureStatus(guest, 'error');
      showToast(error.message || '当前位置没有获取成功');
    }
  }
  if (action === 'search-departure') {
    const guest = button.dataset.guest === 'partner' ? 'partner' : 'user';
    const input = document.querySelector(`[data-departure-input="${guest}"]`);
    const query = input?.value.trim();
    if (!query) {
      showToast('先输入一个街区、地铁站或地址');
      input?.focus();
      return;
    }
    store.actions.setDepartureStatus(guest, 'searching');
    try {
      const location = await locationService.resolveText(query);
      store.actions.setDepartureLocation(guest, location);
      showToast(`${guest === 'partner' ? 'TA' : '你'}的出发位置已设置`);
    } catch (error) {
      store.actions.setDepartureStatus(guest, 'error');
      showToast(error.message || '没有找到这个出发地点');
    }
  }
  if (action === 'clear-departure') store.actions.clearDepartureLocation(button.dataset.guest);
  if (action === 'onboarding-location-next') {
    const latest = store.getState();
    if (!latest.meeting?.departures?.user || !latest.meeting?.departures?.partner) {
      showToast('请先设置两个人的出发位置');
      return;
    }
    store.actions.setOnboardingStep(2);
  }
  if (action === 'save-departures') {
    const latest = store.getState();
    if (!latest.meeting?.departures?.user || !latest.meeting?.departures?.partner) {
      showToast('请先设置两个人的出发位置');
      return;
    }
    go('tonight');
    showToast('双方出发位置已更新');
  }
  if (action === 'onboarding-next') {
    store.actions.setUI({ onboardingConsent: false });
    store.actions.setOnboardingStep(3);
  }
  if (action === 'set-condition') {
    const segmented = button.closest('[data-slider-field]');
    const options = segmented ? [...segmented.querySelectorAll('button[data-value]')] : [];
    queueMicroMotion({ type: 'segment', field: button.dataset.field, fromIndex: Math.max(0, options.findIndex((item) => item.classList.contains('active'))) });
    const numeric = ['budget', 'distance', 'duration'].includes(button.dataset.field);
    store.actions.updateConditions({ [button.dataset.field]: numeric ? Number(button.dataset.value) : button.dataset.value });
  }
  if (action === 'set-form-choice') {
    const control = button.closest('[data-slider-field]');
    const buttons = [...control.querySelectorAll('button[data-value]')];
    const index = buttons.indexOf(button);
    buttons.forEach((item) => item.classList.toggle('active', item === button));
    control.style.setProperty('--active-index', String(Math.max(0, index)));
    if (control.dataset.sliderLayout === 'mood-grid') {
      control.style.setProperty('--active-col', String(Math.max(0, index) % 2));
      control.style.setProperty('--active-row', String(Math.floor(Math.max(0, index) / 2)));
      const note = control.nextElementSibling?.classList.contains('mood-selection-note') ? control.nextElementSibling : null;
      if (note) {
        const strong = note.querySelector('strong');
        const span = note.querySelector('span');
        if (strong) strong.textContent = moodLabel(button.dataset.value);
        if (span) span.textContent = moodDescription(button.dataset.value);
      }
    }
    const hidden = control.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = button.dataset.value;
    if (button.dataset.field === 'centerMode') updateConditionsCenterSummary(button.closest('#conditionsForm'));
  }
  if (action === 'toggle-dietary') {
    queueMicroMotion({ type: 'multi-select', action, value: button.dataset.value });
    store.actions.toggleDietary(button.dataset.value);
  }
  if (action === 'finish-onboarding') {
    if (!state.ui.onboardingConsent) {
      showToast('请先勾选确认说明');
      return;
    }
    store.actions.completeOnboarding();
    go('tonight');
  }
  if (action === 'share-invite' || action === 'invite-again') {
    let code = state.onboarding.inviteCode;
    if (!code) {
      store.actions.chooseOnboardingPath('invite');
      code = store.getState().onboarding.inviteCode;
    }
    try {
      const result = await shareService.shareInvite(code);
      showToast(result === 'copied' ? '邀请码已复制' : '已打开分享面板');
    } catch { showToast('已取消分享'); }
  }
  if (action === 'open-conditions') {
    clearTimeout(toastTimer);
    store.actions.setUI({ modal: 'conditions', toast: null });
  }
  if (action === 'edit-departures') {
    store.actions.setUI({ modal: null });
    store.actions.setOnboardingStep(1);
    go('onboarding');
  }
  if (action === 'open-replace-stop') {
    if (state.currentPlan?.stops?.some((stop) => stop.stopId === button.dataset.id)) {
      store.actions.setUI({ modal: `replace-stop:${button.dataset.id}` });
    }
  }
  if (action === 'open-wrap-choice') {
    if (WRAPUP_CHOICE_GROUPS[button.dataset.field]) store.actions.setUI({ modal: `wrap-choice:${button.dataset.field}` });
  }
  if (action === 'choose-wrap-option') {
    const field = button.dataset.field;
    const group = WRAPUP_CHOICE_GROUPS[field];
    if (group?.options.some((option) => option.value === button.dataset.value)) {
      closeModalWithMotion(() => {
        store.actions.updateWrapup({ [field]: button.dataset.value, ...(field === 'more' || field === 'less' ? { feedbackSubmittedAt: null } : {}) });
        store.actions.setUI({ modal: null });
      });
    }
    return;
  }
  if (action === 'open-auth') {
    store.actions.setUI({ modal: `auth:${button.dataset.mode || 'login'}` });
  }
  if (action === 'switch-auth') {
    store.actions.setUI({ modal: `auth:${button.dataset.mode || 'login'}` });
  }
  if (action === 'open-account-profile') store.actions.setUI({ modal: 'account-profile' });
  if (action === 'open-guest-profile') store.actions.setUI({ modal: `guest-profile:${button.dataset.guest === 'partner' ? 'partner' : 'user'}` });
  if (action === 'logout-account') {
    try { await accountService.logout(); } catch { /* Session may already be expired. */ }
    clearTimeout(syncTimer);
    accountBootstrapComplete = true;
    lastSyncSignature = '';
    store.actions.setAccount('signed_out', null, null);
    showToast('已退出登录，本机数据仍保留');
  }
  if (action === 'ask-delete-account') store.actions.setUI({ modal: 'delete-account' });
  if (action === 'delete-account') {
    try {
      const activeUser = state.account.user;
      await accountService.deleteAccount();
      closeModalWithMotion(() => {
        store.actions.resetAll();
        store.actions.setAccount('ready', activeUser, null);
        accountBootstrapComplete = true;
        go('welcome');
      });
    } catch (error) {
      showToast(error.message || '云端数据暂时无法清除');
    }
  }
  if (action === 'refresh-weather') {
    store.actions.setWeatherStatus('loading');
    try {
      store.actions.setWeatherStatus('ready', await weatherService.getTonightWeather());
    } catch (error) {
      store.actions.setWeatherStatus('error', null, error.message || '天气暂时不可用');
    }
  }
  if (action === 'close-modal') {
    closeModalWithMotion(() => store.actions.setUI({ modal: null }));
    return;
  }
  if (action === 'save-conditions') saveConditionsForm();
  if (action === 'start-planning') {
    store.actions.resetConversation();
    go('conversation');
  }
  if (action === 'resume-empty-plan') {
    const latest = store.getState();
    const hasBothDepartures = Boolean(latest.meeting?.departures?.user && latest.meeting?.departures?.partner);
    if (!hasBothDepartures) {
      store.actions.setOnboardingStep(1);
      go('onboarding');
      return;
    }
    if (!latest.onboarding.completed) {
      store.actions.setOnboardingStep(2);
      go('onboarding');
      return;
    }
    store.actions.resetConversation();
    go('conversation');
  }
  if (action === 'plan-theme') {
    const idea = availableInspirations(state).find((item) => item.id === button.dataset.id);
    if (idea) store.actions.setTheme(idea.tag, idea.title);
    go('conversation');
  }
  if (action === 'plan-bucket-item') {
    const item = coupleBucketList.find((entry) => entry.id === button.dataset.id);
    if (item) {
      store.actions.saveCoupleListItem(item.id);
      store.actions.setTheme(item.tag, item.title, item.id);
      go('conversation');
    }
  }
  if (action === 'toggle-bucket-save') {
    store.actions.toggleCoupleListSaved(button.dataset.id);
    showToast(button.getAttribute('aria-pressed') === 'true' ? '已从想一起做中移除' : '已加入你们想一起做的清单');
  }
  if (action === 'change-theme') {
    store.actions.setUI({ modal: null });
    go('discover');
  }
  if (action === 'workflow-theme-confirm') store.actions.setConversationStep(1);
  if (action === 'workflow-priority-set') {
    const picker = button.closest('[data-priority-picker]');
    const value = button.dataset.value;
    const input = picker?.querySelector('[data-priority-value]');
    const question = aiPlannerService.getQuestion(state.conversation.step, state.conversation.theme);
    if (picker && input && question?.replies?.includes(value)) {
      const nextActive = !button.classList.contains('active');
      button.classList.toggle('active', nextActive);
      button.setAttribute('aria-pressed', String(nextActive));
      const options = [...picker.querySelectorAll('[data-action="workflow-priority-set"]')];
      const values = options.filter((option) => option.classList.contains('active')).map((option) => option.dataset.value);
      input.value = aiPlannerService.priorityAnswerFromValues(values);
      const label = picker.querySelector('[data-priority-label]');
      const hint = picker.querySelector('[data-priority-hint]');
      const count = picker.querySelector('[data-priority-count]');
      const current = picker.querySelector('.workflow-priority-current');
      const confirm = picker.querySelector('[data-action="workflow-priority-confirm"]');
      if (label) label.textContent = values.length ? values.join(' · ') : '还没有选择';
      if (hint) hint.textContent = values.length ? '这些偏向会同时参与地点筛选、排序和方案组合。' : '可以同时选择多项，至少选择 1 项。';
      if (count) count.textContent = values.length ? `已选择 ${values.length} 项` : '可多选';
      current?.classList.toggle('has-many', values.length > 1);
      if (confirm) {
        confirm.disabled = values.length === 0;
        confirm.textContent = values.length ? `确认这 ${values.length} 个偏向` : '请至少选择 1 项';
      }
    }
  }
  if (action === 'workflow-priority-confirm') {
    const value = button.closest('[data-priority-picker]')?.querySelector('[data-priority-value]')?.value;
    if (value) await answerConversation(value);
  }
  if (action === 'workflow-slider-set') {
    const slider = button.closest('[data-workflow-slider]');
    const input = slider?.querySelector('[data-workflow-range]');
    if (input) {
      input.value = button.dataset.index;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (action === 'workflow-slider-confirm') {
    const input = button.closest('[data-workflow-slider]')?.querySelector('[data-workflow-range]');
    const question = aiPlannerService.getQuestion(state.conversation.step, state.conversation.theme);
    const reply = question?.id === 'duration'
      ? aiPlannerService.durationAnswerFromMinutes(input?.value)
      : question?.replies?.[Number(input?.value || 0)];
    if (reply) await answerConversation(reply);
  }
  if (action === 'conversation-reply') await answerConversation(button.dataset.value);
  if (action === 'workflow-step') store.actions.setConversationStep(Number(button.dataset.step));
  if (action === 'send-chat') await sendChatForm();
  if (action === 'generate-plan') await generatePlan();
  if (action === 'focus-next-stop') focusPlanStop(button.dataset.id);
  if (action === 'choose-replacement') {
    const replacementMode = REPLACEMENT_OPTIONS.some((option) => option.mode === button.dataset.mode) ? button.dataset.mode : 'same';
    const next = replacePlanStop(state.currentPlan, button.dataset.id, availablePlaces(state), state.conditions, {
      theme: state.conversation.theme,
      preferredPlaceIds: state.conversation.preferredPlaceIds,
      priorities: aiPlannerService.priorityValuesFromAnswer(state.conversation.answers?.[2]),
      feedback: recommendationFeedbackForState(state),
      replacementMode
    });
    const before = state.currentPlan.stops.map((stop) => stop.id).join(',');
    const after = next.stops.map((stop) => stop.id).join(',');
    closeModalWithMotion(() => {
      store.actions.setUI({ modal: null });
      if (before === after) showToast('当前预算、距离和时长内暂时没有合适替代，可以放宽条件再试');
      else {
        queueMicroMotion({ type: 'plan-card', stopId: button.dataset.id });
        store.actions.changePlan(next);
        showToast(next.lastChange);
      }
    });
    return;
  }
  if (action === 'delete-stop') {
    const next = deletePlanStop(state.currentPlan, button.dataset.id);
    queueMicroMotion({ type: 'plan-list' });
    store.actions.changePlan(next);
    showToast(next.lastChange || '至少保留两站');
  }
  if (action === 'undo-plan') {
    queueMicroMotion({ type: 'plan-list' });
    store.actions.undoPlan();
    showToast('已撤销上一次调整');
  }
  if (action === 'open-accept-plan') store.actions.setUI({ modal: 'accept-plan' });
  if (action === 'confirm-plan') {
    closeModalWithMotion(() => {
      store.actions.setUI({ modal: null });
      store.actions.acceptPlan();
      showToast('方案已确认，靠近地点后会自动记录到达');
    });
  }
  if (action === 'complete-date') {
    store.actions.completePlan();
    go('wrapup');
  }
  if (action === 'share-plan') store.actions.setUI({ modal: 'share-plan' });
  if (action === 'share-platform') {
    try {
      const result = await shareService.shareToPlatform(state.currentPlan, button.dataset.platform);
      showToast(result.mode === 'shared' ? `已打开系统分享，请选择${result.platformLabel}` : `${result.platformLabel}海报已保存，配文已复制`);
    } catch (error) {
      showToast(error?.name === 'AbortError' ? '已取消分享' : '分享准备失败，请稍后重试');
    }
  }
  if (action === 'system-share-plan') {
    try {
      const result = await shareService.sharePlan(state.currentPlan);
      showToast(result === 'copied' ? '方案文字已复制' : '已打开系统分享');
    } catch (error) { showToast(error?.name === 'AbortError' ? '已取消分享' : '暂时无法分享'); }
  }
  if (action === 'save-plan-poster') {
    try { await shareService.savePlanPoster(state.currentPlan); showToast('方案海报已保存'); } catch { showToast('海报暂时无法生成'); }
  }
  if (action === 'copy-plan-caption') {
    try { await shareService.copyPlanText(state.currentPlan); showToast('方案文字已复制'); } catch { showToast('暂时无法复制'); }
  }
  if (action === 'share-place') {
    const place = findPlace(state, button.dataset.id);
    try { await navigator.clipboard?.writeText(`${place.name} · ${priceDisplay(place)} · ${place.address || placeDistanceLabel(place)}${place.phone ? ` · ${place.phone}` : ''}`); showToast('地点信息已复制'); } catch { showToast('暂时无法复制'); }
  }
  if (action === 'replace-place-from-detail') {
    const stop = state.currentPlan?.stops.find((item) => item.id === button.dataset.id);
    if (!stop) showToast('这个地点还不在当前方案中');
    else {
      const next = replacePlanStop(state.currentPlan, stop.stopId, availablePlaces(state), state.conditions, {
        theme: state.conversation.theme,
        priorities: aiPlannerService.priorityValuesFromAnswer(state.conversation.answers?.[2])
      });
      store.actions.changePlan(next);
      go('plan');
    }
  }
  if (action === 'add-place') showToast('请先从方案中选择要替换的一站');
  if (action === 'memory-filter' && state.ui.memoryFilter !== button.dataset.value) {
    const control = button.closest('[data-choice-group]');
    const options = control ? [...control.querySelectorAll('button[data-value]')] : [];
    queueMicroMotion({ type: 'choice-track', group: 'memory-filter', fromIndex: Math.max(0, options.findIndex((item) => item.classList.contains('active'))) });
    store.actions.setUI({ memoryFilter: button.dataset.value });
  }
  if (action === 'set-media-contributor') {
    store.actions.setUI({ mediaContributor: button.dataset.value === 'partner' ? 'partner' : 'user' });
  }
  if (action === 'pick-memory-media') document.querySelector('#memoryMediaInput')?.click();
  if (action === 'remove-memory-media') {
    try {
      await memoryMediaService.remove(button.dataset.id);
      const cached = memoryMediaObjectUrls.get(button.dataset.id);
      if (cached?.url) URL.revokeObjectURL(cached.url);
      memoryMediaObjectUrls.delete(button.dataset.id);
      store.actions.removeMemoryMedia(button.dataset.id);
      showToast('素材已移除');
    } catch { showToast('素材暂时无法移除'); }
  }
  if (action === 'generate-memory-summary') {
    if (!state.memoryAgent.media.length) return;
    store.actions.setUI({ memoryAgentStatus: 'loading' });
    try {
      const result = await memoryAgentService.summarize({
        date: new Date().toISOString().slice(0, 10),
        media: state.memoryAgent.media,
        plan: state.currentPlan,
        memory: state.memories.find((memory) => memory.confirmed) || null
      });
      store.actions.addMemoryAgentSummary(result.summary);
      store.actions.setUI({ memoryAgentStatus: 'ready' });
      showToast('活动日结和纪念提醒已生成');
    } catch (error) {
      store.actions.setUI({ memoryAgentStatus: 'error' });
      showToast(error.message || '日结暂时没有生成');
    }
  }
  if (action === 'toggle-memory-reminders') {
    store.actions.setMemoryAgentReminders(!state.memoryAgent.remindersEnabled);
    showToast(state.memoryAgent.remindersEnabled ? '已关闭“那年今天”提醒' : '已开启“那年今天”提醒');
  }
  if (action === 'discover-filter' && state.ui.discoverFilter !== button.dataset.value) {
    queueMicroMotion({ type: 'multi-select', action, value: button.dataset.value });
    store.actions.setUI({ discoverFilter: button.dataset.value });
  }
  if (action === 'search-memory') searchMemoryForm();
  if (action === 'memory-search-focus') document.querySelector('#memorySearchInput')?.focus();
  if (action === 'edit-memory') store.actions.setUI({ modal: `edit-memory:${button.dataset.id}` });
  if (action === 'save-memory-edit') saveMemoryEditForm(button.dataset.id);
  if (action === 'ask-delete-memory') store.actions.setUI({ modal: `delete-memory:${button.dataset.id}` });
  if (action === 'delete-memory') {
    closeModalWithMotion(() => {
      store.actions.setUI({ modal: null });
      store.actions.deleteMemory(button.dataset.id);
      showToast('Memory 已删除');
    });
  }
  if (action === 'toggle-memory-visibility') {
    const memory = state.memories.find((item) => item.id === button.dataset.id);
    store.actions.updateMemory(memory.id, { visibility: memory.visibility === 'couple' ? 'private' : 'couple' });
    showToast('可见范围已更新');
  }
  if (action === 'profile-correct') {
    store.actions.updateProfile({ correction: '这条变化不会继续用于推荐' });
    showToast('已记录纠正');
  }
  if (action === 'refresh-inspiration') await refreshInspirations();
  if (action === 'map-category') store.actions.setMapExplorer({ category: button.dataset.value, selectedId: null });
  if (action === 'map-select-place') {
    store.actions.setMapExplorer({ selectedId: button.dataset.id });
    queueMicrotask(() => document.querySelector(`[data-place-id="${CSS.escape(button.dataset.id)}"]`)?.scrollIntoView({ behavior: motionEnabled() ? 'smooth' : 'auto', block: 'nearest' }));
  }
  if (action === 'toggle-map-candidate') {
    store.actions.togglePreferredPlace(button.dataset.id);
    showToast(store.getState().conversation.preferredPlaceIds.includes(button.dataset.id) ? '已加入本次候选' : '已移出本次候选');
  }
  if (action === 'refresh-map-places') await refreshMapPlaces();
  if (action === 'set-proactivity') {
    const segmented = button.closest('[data-slider-field]');
    const options = segmented ? [...segmented.querySelectorAll('button[data-value]')] : [];
    queueMicroMotion({ type: 'segment', field: 'proactivity', fromIndex: Math.max(0, options.findIndex((item) => item.classList.contains('active'))) });
    store.actions.updateSetting('proactivity', button.dataset.value);
  }
  if (action === 'toggle-setting') {
    const from = Boolean(state.settings[button.dataset.key]);
    queueMicroMotion({ type: 'toggle', key: button.dataset.key, from, to: !from });
    store.actions.updateSetting(button.dataset.key, !from);
  }
  if (action === 'export-data') {
    downloadJson(`约见-数据-${new Date().toISOString().slice(0, 10)}.json`, store.exportData());
    showToast('数据副本已生成');
  }
  if (action === 'ask-delete-data') store.actions.setUI({ modal: 'delete-data' });
  if (action === 'delete-all-data') {
    closeModalWithMotion(() => {
      store.actions.resetAll();
      go('welcome');
    });
  }
  if (action === 'wrap-choice') {
    const segmented = button.closest('[data-slider-field]');
    if (segmented) {
      const options = [...segmented.querySelectorAll('button[data-value]')];
      queueMicroMotion({ type: 'segment', field: button.dataset.field, fromIndex: Math.max(0, options.findIndex((item) => item.classList.contains('active'))) });
    } else {
      queueMicroMotion({ type: 'selection', field: button.dataset.field, value: button.dataset.value });
    }
    store.actions.updateWrapup({ [button.dataset.field]: button.dataset.value });
  }
  if (action === 'save-memory') {
    const note = document.querySelector('[data-wrap-field="note"]')?.value;
    const more = document.querySelector('[data-wrap-field="more"]')?.value;
    const less = document.querySelector('[data-wrap-field="less"]')?.value;
    const visibility = document.querySelector('[data-wrap-field="visibility"]')?.value;
    store.actions.updateWrapup({ note, more, less, visibility, feedbackSubmittedAt: new Date().toISOString(), savedToMemory: true });
    const latest = store.getState();
    const memory = buildMemoryFromWrapup(latest.currentPlan, latest.wrapup);
    store.actions.addMemory(memory);
    showToast('已保存到 Memory，也会优化下次推荐');
    setTimeout(() => go('memory'), 350);
  }
  if (action === 'feedback-only') {
    const note = document.querySelector('[data-wrap-field="note"]')?.value;
    const more = document.querySelector('[data-wrap-field="more"]')?.value;
    const less = document.querySelector('[data-wrap-field="less"]')?.value;
    const visibility = document.querySelector('[data-wrap-field="visibility"]')?.value;
    store.actions.updateWrapup({ note, more, less, visibility, feedbackSubmittedAt: new Date().toISOString(), savedToMemory: false });
    showToast('偏好已记录，没有保存 Memory');
    setTimeout(() => go('tonight'), 450);
  }
}

app.addEventListener('click', handleAppClick);

app.addEventListener('pointerdown', (event) => {
  const range = event.target?.matches?.('[data-workflow-range]') ? event.target : null;
  if (!range || event.isPrimary === false || (typeof event.button === 'number' && event.button > 0)) return;
  activeWorkflowRangeDrag = { input: range, pointerId: event.pointerId };
  range.focus({ preventScroll: true });
  try {
    range.setPointerCapture?.(event.pointerId);
  } catch {
    // Some embedded WebViews do not expose pointer capture; delegated move events still work.
  }
  updateWorkflowRangeFromPointer(range, event.clientX);
  event.preventDefault();
});

app.addEventListener('pointermove', (event) => {
  if (!activeWorkflowRangeDrag || activeWorkflowRangeDrag.pointerId !== event.pointerId) return;
  updateWorkflowRangeFromPointer(activeWorkflowRangeDrag.input, event.clientX);
  event.preventDefault();
});

function finishWorkflowRangeDrag(event) {
  if (!activeWorkflowRangeDrag || activeWorkflowRangeDrag.pointerId !== event.pointerId) return;
  const { input, pointerId } = activeWorkflowRangeDrag;
  if (event.type !== 'pointercancel') updateWorkflowRangeFromPointer(input, event.clientX);
  try {
    input.releasePointerCapture?.(pointerId);
  } catch {
    // Pointer capture may already have been released by the browser.
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
  activeWorkflowRangeDrag = null;
}

app.addEventListener('pointerup', finishWorkflowRangeDrag);
app.addEventListener('pointercancel', finishWorkflowRangeDrag);
window.addEventListener('pointerup', finishWorkflowRangeDrag);
window.addEventListener('pointercancel', finishWorkflowRangeDrag);

app.addEventListener('keydown', (event) => {
  const range = event.target?.matches?.('[data-workflow-range]') ? event.target : null;
  if (!range || !['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const min = Number(range.min);
  const max = Number(range.max);
  const step = Number(range.step) || 1;
  const current = Number(range.value);
  const next = event.key === 'Home'
    ? min
    : event.key === 'End'
      ? max
      : Math.max(min, Math.min(max, current + (['ArrowRight', 'ArrowUp'].includes(event.key) ? step : -step)));
  range.value = String(next);
  range.dispatchEvent(new Event('input', { bubbles: true }));
  event.preventDefault();
});

app.addEventListener('submit', async (event) => {
  event.preventDefault();
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  const form = path.find((node) => node?.tagName === 'FORM') || event.target;
  if (form.id === 'chatForm') {
    await sendChatForm();
  }
  if (form.id === 'conditionsForm') {
    saveConditionsForm();
  }
  if (form.id === 'memorySearch') {
    searchMemoryForm();
  }
  if (form.id === 'memoryEditForm') {
    saveMemoryEditForm(form.dataset.id);
  }
  if (form.id === 'authForm') {
    await submitAuthForm(form);
  }
  if (form.id === 'guestProfileForm') {
    submitGuestProfile(form);
  }
});

app.addEventListener('map-place-select', (event) => {
  if (event.detail?.placeId) store.actions.setMapExplorer({ selectedId: event.detail.placeId });
});

app.addEventListener('input', (event) => {
  const workflowRange = event.target?.matches?.('[data-workflow-range]') ? event.target : null;
  if (workflowRange) {
    const slider = workflowRange.closest('[data-workflow-slider]');
    const currentConversation = store.getState().conversation;
    const question = aiPlannerService.getQuestion(Number(workflowRange.dataset.workflowStep), currentConversation.theme);
    if (question.id === 'duration') {
      const rawMinutes = Number(workflowRange.value);
      const step = Number(question.step) || 5;
      const snappedMinutes = question.min + Math.round(((Number.isFinite(rawMinutes) ? rawMinutes : 180) - question.min) / step) * step;
      const minutes = Math.max(question.min, Math.min(question.max, snappedMinutes));
      workflowRange.value = String(minutes);
      const progress = ((minutes - question.min) / (question.max - question.min)) * 100;
      slider?.style.setProperty('--workflow-progress', `${progress}%`);
      workflowRange.setAttribute('aria-valuetext', formatDuration(minutes));
      const output = slider?.querySelector('[data-workflow-value]');
      const hint = slider?.querySelector('[data-workflow-hint]');
      if (output) output.value = formatDuration(minutes);
      if (hint) hint.textContent = durationWorkflowHint(minutes);
      return;
    }
    const index = Math.max(0, Math.min(question.replies.length - 1, Number(workflowRange.value)));
    const reply = question.replies[index];
    const progress = question.replies.length > 1 ? (index / (question.replies.length - 1)) * 100 : 0;
    slider?.style.setProperty('--workflow-progress', `${progress}%`);
    const output = slider?.querySelector('[data-workflow-value]');
    const hint = slider?.querySelector('[data-workflow-hint]');
    if (output) output.value = workflowAnswerLabel(question, reply);
    if (hint) hint.textContent = workflowReplyHint(question, reply);
    slider?.querySelectorAll('[data-action="workflow-slider-set"]').forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === index));
    return;
  }
  const input = event.target?.matches?.('[data-range-field]') ? event.target : null;
  if (input) {
    const field = input.dataset.rangeField;
    const output = input.closest('[data-range-wrap]')?.querySelector(`[data-range-output="${field}"]`);
    if (output) output.value = field === 'duration' ? formatDuration(durationHoursToMinutes(input.value)) : input.value;
    input.style.setProperty('--range-progress', `${rangeProgress(input.value, Number(input.min), Number(input.max))}%`);
  }
  const conditionsForm = event.target?.closest?.('#conditionsForm');
  if (conditionsForm && (input || event.target?.name === 'area')) updateConditionsCenterSummary(conditionsForm);
});

app.addEventListener('change', async (event) => {
  if (event.target?.matches?.('[data-onboarding-consent]')) {
    store.actions.setUI({ onboardingConsent: Boolean(event.target.checked) });
    return;
  }
  if (event.target?.id === 'memoryMediaInput') {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    store.actions.setUI({ memoryAgentStatus: 'uploading' });
    try {
      const contributor = store.getState().ui.mediaContributor === 'partner' ? 'partner' : 'user';
      const items = await memoryMediaService.save(files, contributor);
      store.actions.addMemoryMedia(items);
      store.actions.setUI({ memoryAgentStatus: 'idle' });
      showToast(`已归档 ${items.length} 个素材`);
    } catch (error) {
      store.actions.setUI({ memoryAgentStatus: 'error' });
      showToast(error.message || '素材上传没有完成');
    } finally {
      event.target.value = '';
    }
    return;
  }
  const range = event.target?.matches?.('[data-range-field]') ? event.target : null;
  if (range && !range.closest('#conditionsForm')) {
    store.actions.updateConditions({ [range.dataset.rangeField]: Number(range.value) });
    return;
  }
  const field = event.target?.dataset?.wrapField ? event.target : null;
  if (field) store.actions.updateWrapup({ [field.dataset.wrapField]: field.value });
});

app.addEventListener('focusin', (event) => {
  if (event.target?.id !== 'chatText') return;
  const form = event.target.closest('.workflow-note');
  window.setTimeout(() => form?.scrollIntoView({ behavior: motionEnabled() ? 'smooth' : 'auto', block: 'center' }), 80);
});

store.subscribe((state) => {
  if (editingModalIsActive(state)) syncToastElement(state.ui.toast);
  else render();
  scheduleAccountSync(state);
});
window.addEventListener('hashchange', renderUnlessEditing);
window.addEventListener('online', renderUnlessEditing);
window.addEventListener('offline', renderUnlessEditing);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') clearPlanPresenceWatch();
  else if (currentRoute().name === 'plan') ensurePlanPresenceWatch();
});
window.setInterval(() => {
  const state = store.getState();
  if (currentRoute().name !== 'plan' || !state.currentPlan?.accepted) return;
  const signature = planStopProgress(state.currentPlan).statuses
    .map((item) => `${item.stop.stopId}:${item.completed ? 'done' : item.active ? 'active' : 'next'}`)
    .join('|');
  if (signature !== lastPlanProgressSignature) renderUnlessEditing();
}, 30000);

if (!location.hash) history.replaceState(null, '', `#/${store.getState().onboarding.completed ? 'tonight' : 'welcome'}`);
render();
initializeExternalServices();
initializeAccount();

if (window.parent === window && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

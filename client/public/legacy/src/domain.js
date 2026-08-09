import { moodLabel } from './moods.js?v=2.4.11';

const DEFAULT_CONDITIONS = {
  budget: 500,
  distance: 6,
  duration: 3,
  mood: '安静聊聊',
  indoorOnly: false,
  dietary: []
};

export function normalizeConditions(conditions = {}) {
  const durationHours = Number(conditions.duration ?? DEFAULT_CONDITIONS.duration);
  const normalizedDuration = Math.round(Math.max(1, Math.min(6, Number.isFinite(durationHours) ? durationHours : DEFAULT_CONDITIONS.duration)) * 12) / 12;
  return {
    ...DEFAULT_CONDITIONS,
    ...conditions,
    budget: Number(conditions.budget ?? DEFAULT_CONDITIONS.budget),
    distance: Number(conditions.distance ?? DEFAULT_CONDITIONS.distance),
    duration: normalizedDuration,
    dietary: Array.isArray(conditions.dietary) ? conditions.dietary : []
  };
}

const THEME_ALIASES = {
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

export function placeMatchesTheme(place, theme) {
  const selectedTheme = String(theme || '').trim();
  if (!selectedTheme) return true;
  const text = [
    place?.name,
    place?.category,
    place?.categoryLabel,
    ...(Array.isArray(place?.tags) ? place.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();
  const aliases = THEME_ALIASES[selectedTheme] || [selectedTheme];
  return aliases.some((alias) => text.includes(String(alias).toLowerCase()));
}

export function themeCategory(theme) {
  const selectedTheme = String(theme || '').trim();
  if (/(晚餐|餐厅|餐馆|饭店|正餐|火锅|日料|烤鸭|西餐|中餐)/.test(selectedTheme)) return 'dinner';
  if (/(咖啡|甜品|甜点|冰淇淋)/.test(selectedTheme)) return 'dessert';
  return 'activity';
}

export function getSearchRadii(distance) {
  const requested = Math.max(1, Number(distance) || DEFAULT_CONDITIONS.distance);
  return [...new Set([requested, 10, 15, 25, 40].filter((radius) => radius >= requested))];
}

export function filterPlaces(allPlaces, rawConditions = {}) {
  const conditions = normalizeConditions(rawConditions);
  return allPlaces.filter((place) => {
    if (!place.open) return false;
    if (place.distanceKm > conditions.distance) return false;
    if (place.priceForTwo > conditions.budget) return false;
    if (conditions.indoorOnly && !place.indoor) return false;
    if (conditions.dietary.length && ['dinner', 'dessert'].includes(place.category) && !conditions.dietary.every((item) => place.dietary.includes(item))) return false;
    return true;
  });
}

function scoreFeedbackPreference(place, feedback = {}, conditions = {}) {
  const learned = feedback && typeof feedback === 'object' ? feedback : {};
  const text = `${place.name || ''} ${(place.tags || []).join(' ')} ${(place.moods || []).join(' ')} ${place.categoryLabel || ''}`;
  let score = 0;
  if (learned.more === '安静聊天' && (place.noise === '安静' || /安静|咖啡|书店|聊天/.test(text))) score += 14;
  if (learned.more === '新鲜体验' && (place.category === 'activity' || /体验|手作|展|音乐|戏剧|游戏/.test(text))) score += 13;
  if (learned.more === '户外散步' && (!place.indoor || /散步|河|公园|日落|户外|骑行/.test(text))) score += 14;
  if (learned.more === '认真吃饭' && place.category === 'dinner') score += 15;

  if (learned.less === '通勤') score += Math.max(0, 12 - (Number(place.distanceKm || 0) / Math.max(Number(conditions.distance || 6), 1)) * 12);
  if (learned.less === '排队') score += place.booking?.status === 'available' ? 11 : place.booking?.status === 'walkin' ? 5 : 0;
  if (learned.less === '花费') score += Math.max(0, 12 - (Number(place.priceForTwo || 0) / Math.max(Number(conditions.budget || 500), 1)) * 10);
  if (learned.less === '赶时间') score += Math.max(0, 10 - Number(place.travelMin || 0) / 3);
  return score;
}

function normalizePlanningPriorities(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/[、,，|｜]/);
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function scorePlanningPriorities(place, priorities = [], conditions = {}) {
  const selected = new Set(normalizePlanningPriorities(priorities));
  if (!selected.size) return 0;
  const text = `${place.name || ''} ${place.categoryLabel || ''} ${(place.tags || []).join(' ')} ${(place.moods || []).join(' ')}`;
  const maxDistance = Math.max(Number(conditions.distance || 6), 1);
  const maxBudget = Math.max(Number(conditions.budget || 500), 1);
  let score = 0;
  if (selected.has('少通勤')) score += Math.max(0, 16 - (Number(place.distanceKm || 0) / maxDistance) * 16);
  if (selected.has('少走路')) score += Math.max(0, 14 - Number(place.travelMin || 0) / 2.5);
  if (selected.has('环境安静') && (place.noise === '安静' || /安静|书店|咖啡|黑胶/.test(text))) score += 15;
  if (selected.has('室内舒适') && place.indoor) score += 15;
  if (selected.has('不排队')) score += place.booking?.status === 'available' ? 15 : place.booking?.status === 'walkin' ? 8 : 0;
  if (selected.has('时间准点')) {
    if (place.booking?.status === 'available' || /预约|场次|准时/.test(text)) score += 9;
    score += Math.max(0, 8 - Number(place.travelMin || 0) / 4);
  }
  if (selected.has('预算可控')) score += Math.max(0, 16 - (Number(place.priceForTwo || 0) / maxBudget) * 14);
  if (selected.has('有一点新鲜感') && (place.category === 'activity' || /体验|手作|展|音乐|戏剧|游戏|密室|夜骑/.test(text))) score += 14;
  return score;
}

export function scorePlace(place, rawConditions = {}, context = {}) {
  const conditions = normalizeConditions(rawConditions);
  const moods = Array.isArray(place.moods) ? place.moods : [];
  const tags = Array.isArray(place.tags) ? place.tags : [];
  const moodMatch = moods.includes(conditions.mood) ? 32 : 0;
  const themeMatch = context.theme && placeMatchesTheme(place, context.theme) ? 72 : 0;
  const quietMatch = conditions.mood === '安静聊聊' && place.noise === '安静' ? 12 : 0;
  const distanceScore = Math.max(0, 14 - (place.distanceKm / Math.max(conditions.distance, 1)) * 14);
  const fairnessScore = place.userDistanceKm != null && place.partnerDistanceKm != null
    ? Math.max(0, 18 - Number(place.distanceGapKm || 0) * 3)
    : 0;
  const budgetScore = Math.max(0, 10 - (place.priceForTwo / Math.max(conditions.budget, 1)) * 7);
  const ratingScore = Math.max(0, (place.rating - 4) * 10);
  const availabilityScore = place.booking?.status === 'available' ? 8 : place.booking?.status === 'walkin' ? 6 : 3;
  const preferredMatch = Array.isArray(context.preferredPlaceIds) && context.preferredPlaceIds.includes(place.id) ? 60 : 0;
  const learnedPreferenceScore = scoreFeedbackPreference(place, context.feedback, conditions);
  const planningPriorityScore = scorePlanningPriorities(place, context.priorities, conditions);
  return Number((moodMatch + themeMatch + quietMatch + distanceScore + fairnessScore + budgetScore + ratingScore + availabilityScore + preferredMatch + learnedPreferenceScore + planningPriorityScore).toFixed(2));
}

export function rankPlaces(allPlaces, conditions = {}, context = {}) {
  return filterPlaces(allPlaces, conditions)
    .map((place) => ({ ...place, matchScore: scorePlace(place, conditions, context) }))
    .sort((a, b) => b.matchScore - a.matchScore || Number(a.distanceGapKm || 0) - Number(b.distanceGapKm || 0) || a.distanceKm - b.distanceKm || b.rating - a.rating);
}

function buildCombinations(groups, index = 0, selected = [], output = []) {
  if (index >= groups.length) {
    if (selected.length >= 2) output.push(selected);
    return output;
  }
  buildCombinations(groups, index + 1, selected, output);
  groups[index].forEach((place) => buildCombinations(groups, index + 1, [...selected, place], output));
  return output;
}

function planTotals(stops) {
  return stops.reduce(
    (totals, stop, index) => ({
      cost: totals.cost + stop.priceForTwo,
      durationMin: totals.durationMin + stop.durationMin + (index === 0 ? 0 : stop.travelMin),
      transitMin: totals.transitMin + (index === 0 ? 0 : stop.travelMin),
      usesEstimatedPricing: totals.usesEstimatedPricing || Boolean(stop.priceIsEstimate)
    }),
    { cost: 0, durationMin: 0, transitMin: 0, usesEstimatedPricing: false }
  );
}

function toClock(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function scheduleStops(stops, startMinutes = 19 * 60) {
  let cursor = startMinutes;
  return stops.map((place, index) => {
    if (index > 0) cursor += place.travelMin;
    const start = toClock(cursor);
    cursor += place.durationMin;
    const end = toClock(cursor);
    return {
      ...place,
      stopId: `stop-${index + 1}-${place.id}`,
      start,
      end
    };
  });
}

export function summarizePlan(stops) {
  const totals = planTotals(stops);
  return {
    ...totals,
    stopCount: stops.length,
    durationLabel: `${Math.floor(totals.durationMin / 60)} 小时${totals.durationMin % 60 ? ` ${totals.durationMin % 60} 分` : ''}`,
    costLabel: `约 ¥${totals.cost}`,
    transitLabel: `${totals.transitMin} 分钟通勤`
  };
}

export function buildPlan(allPlaces, rawConditions = {}, context = {}) {
  const conditions = normalizeConditions(rawConditions);
  const theme = String(context.theme || '').trim();
  const requestedDistanceKm = Number(conditions.distance || DEFAULT_CONDITIONS.distance);
  const maximumMinutes = conditions.duration * 60 + 15;
  const searchRadii = theme ? getSearchRadii(requestedDistanceKm) : [requestedDistanceKm];
  let searchDistanceKm = requestedDistanceKm;
  let planningConditions = conditions;
  let ranked = [];
  let themePlaces = [];

  for (const radiusKm of searchRadii) {
    const expandedConditions = { ...conditions, distance: radiusKm };
    const expandedRanked = rankPlaces(allPlaces, expandedConditions, context);
    const matchingThemePlaces = theme
      ? expandedRanked.filter((place) => placeMatchesTheme(place, theme) && place.durationMin <= maximumMinutes)
      : expandedRanked;
    if (!theme || matchingThemePlaces.length) {
      searchDistanceKm = radiusKm;
      planningConditions = expandedConditions;
      ranked = expandedRanked;
      themePlaces = matchingThemePlaces;
      break;
    }
    searchDistanceKm = radiusKm;
  }

  if (theme && !themePlaces.length) {
    return {
      id: `plan-${context.seed || 'unavailable'}`,
      title: context.themeTitle || theme,
      createdAt: context.createdAt || new Date().toISOString(),
      conditions,
      sourceTheme: theme,
      requestedDistanceKm,
      searchDistanceKm,
      rangeExpanded: searchDistanceKm > requestedDistanceKm,
      unavailableTheme: true,
      accepted: false,
      completed: false,
      stops: [],
      summary: summarizePlan([])
    };
  }

  const themeCategories = new Set(themePlaces.map((place) => place.category));
  const groups = theme
    ? [
        ...(themeCategories.has('dinner') ? [] : [ranked.filter((place) => place.category === 'dinner').slice(0, 4)]),
        themePlaces.slice(0, 8),
        ...(themeCategories.has('dessert') ? [] : [ranked.filter((place) => place.category === 'dessert').slice(0, 4)])
      ]
    : [
        ranked.filter((place) => place.category === 'dinner').slice(0, 4),
        ranked.filter((place) => place.category === 'activity').slice(0, 8),
        ranked.filter((place) => place.category === 'activity').slice(0, 8),
        ranked.filter((place) => place.category === 'dessert').slice(0, 4)
      ];
  const hasEligibleDinner = groups[0].length > 0;
  const candidates = buildCombinations(groups)
    .filter((combo) => new Set(combo.map((place) => place.id)).size === combo.length)
    .filter((combo) => theme ? combo.some((place) => placeMatchesTheme(place, theme)) : (!hasEligibleDinner || combo.some((place) => place.category === 'dinner')))
    .filter((combo) => !theme || combo.length <= 2)
    .map((combo) => {
      const totals = planTotals(combo);
      const distinctActivityTypes = new Set(combo.filter((place) => place.category === 'activity').map((place) => place.categoryLabel)).size;
      const score = combo.reduce((sum, place) => sum + place.matchScore, 0) + combo.length * 5 + distinctActivityTypes * 3;
      return { stops: combo, totals, score };
    })
    .filter(({ totals }) => totals.cost <= planningConditions.budget && totals.durationMin <= maximumMinutes)
    .sort((a, b) => b.stops.length - a.stops.length || b.score - a.score);

  const fallbackSingle = theme
    ? themePlaces[0]
    : ranked.find((place) => place.durationMin <= maximumMinutes);
  const chosen = candidates[0]?.stops || (fallbackSingle ? [fallbackSingle] : ranked.slice(0, 1));
  const scheduled = scheduleStops(chosen);
  return {
    id: `plan-${context.seed || 'tonight'}`,
    title: context.themeTitle || makePlanTitle(conditions, scheduled),
    createdAt: context.createdAt || new Date().toISOString(),
    conditions: planningConditions,
    sourceTheme: theme || null,
    requestedDistanceKm,
    searchDistanceKm,
    rangeExpanded: searchDistanceKm > requestedDistanceKm,
    unavailableTheme: false,
    accepted: false,
    completed: false,
    stops: scheduled,
    summary: summarizePlan(scheduled)
  };
}

export function buildPlanFromSelection(allPlaces, selectedPlaceIds, rawConditions = {}, context = {}) {
  const conditions = normalizeConditions(rawConditions);
  const constrainedPlan = context.theme
    ? buildPlan(allPlaces, conditions, { ...context, preferredPlaceIds: selectedPlaceIds })
    : null;
  if (constrainedPlan?.unavailableTheme) return constrainedPlan;
  const planningConditions = constrainedPlan?.conditions || conditions;
  const allowed = new Map(filterPlaces(allPlaces, planningConditions).map((place) => [place.id, place]));
  const selected = [...new Set(Array.isArray(selectedPlaceIds) ? selectedPlaceIds : [])]
    .map((id) => allowed.get(id))
    .filter(Boolean)
    .slice(0, 4);
  const totals = planTotals(selected);
  const themeMatched = !context.theme || selected.some((place) => placeMatchesTheme(place, context.theme));
  if (selected.length < 2 || (context.theme && selected.length > 2) || !themeMatched || totals.cost > planningConditions.budget || totals.durationMin > planningConditions.duration * 60 + 15) {
    return constrainedPlan || buildPlan(allPlaces, conditions, { ...context, preferredPlaceIds: selectedPlaceIds });
  }
  const scheduled = scheduleStops(selected);
  return {
    id: `plan-${context.seed || 'agent'}`,
    title: context.themeTitle || context.agentTitle || makePlanTitle(conditions, scheduled),
    createdAt: context.createdAt || new Date().toISOString(),
    conditions: planningConditions,
    sourceTheme: context.theme || null,
    requestedDistanceKm: constrainedPlan?.requestedDistanceKm ?? Number(conditions.distance || DEFAULT_CONDITIONS.distance),
    searchDistanceKm: constrainedPlan?.searchDistanceKm ?? Number(planningConditions.distance || DEFAULT_CONDITIONS.distance),
    rangeExpanded: Boolean(constrainedPlan?.rangeExpanded),
    unavailableTheme: false,
    agent: context.agent || null,
    accepted: false,
    completed: false,
    stops: scheduled,
    summary: summarizePlan(scheduled)
  };
}

function makePlanTitle(conditions, stops) {
  if (conditions.mood === '安静聊聊') return '一段不赶时间的相处';
  if (conditions.mood === '看点东西') return '看点新东西，再慢慢收尾';
  if (conditions.mood === '认真吃饭') return '把这次见面留给一顿好好吃的饭';
  if (conditions.mood === '听点音乐') return '让音乐带着这次约见往前走';
  return stops.length > 2 ? '有一点计划，也留一点偶然' : '简单、轻松，刚好够这次见面';
}

export function replacePlanStop(plan, stopId, allPlaces, rawConditions = {}, context = {}) {
  const index = plan.stops.findIndex((stop) => stop.stopId === stopId);
  if (index < 0) return plan;
  const current = plan.stops[index];
  const conditions = normalizeConditions({
    ...rawConditions,
    distance: Math.max(Number(rawConditions.distance || 0), Number(plan.searchDistanceKm || plan.conditions?.distance || 0))
  });
  const usedIds = new Set(plan.stops.filter((_, stopIndex) => stopIndex !== index).map((stop) => stop.id));
  const mode = context.replacementMode || 'same';
  const sourceTheme = plan.sourceTheme || context.theme || null;
  const replacingThemeStop = Boolean(sourceTheme && placeMatchesTheme(current, sourceTheme));
  const explicitlyChangingTheme = replacingThemeStop && mode !== 'same';
  const currentScene = current.tags?.[0] || current.categoryLabel || current.category;
  const replacement = rankPlaces(allPlaces, conditions, context)
    .filter((place) => {
      const text = `${place.name || ''} ${(place.tags || []).join(' ')} ${(place.moods || []).join(' ')} ${place.categoryLabel || ''}`;
      const candidateScene = place.tags?.[0] || place.categoryLabel || place.category;
      if (mode === 'different') return place.category !== current.category || candidateScene !== currentScene;
      if (mode === 'activity') return place.category === 'activity' && candidateScene !== currentScene;
      if (mode === 'dinner') return place.category === 'dinner';
      if (mode === 'dessert') return place.category === 'dessert';
      if (mode === 'outdoor') return !place.indoor || /散步|河|公园|日落|户外|骑行|城市探索/.test(text);
      return place.category === current.category;
    })
    .filter((place) => {
      if (!sourceTheme) return true;
      if (explicitlyChangingTheme) return !placeMatchesTheme(place, sourceTheme);
      if (replacingThemeStop) return placeMatchesTheme(place, sourceTheme);
      return plan.stops.some((stop, stopIndex) => stopIndex !== index && placeMatchesTheme(stop, sourceTheme))
        || placeMatchesTheme(place, sourceTheme);
    })
    .filter((place) => place.id !== current.id && !usedIds.has(place.id))
    .find((place) => {
      const candidateStops = plan.stops.map((stop, stopIndex) => (stopIndex === index ? place : stop));
      const totals = planTotals(candidateStops);
      return totals.cost <= conditions.budget && totals.durationMin <= conditions.duration * 60 + 15;
    });

  if (!replacement) return plan;
  const nextPlaces = plan.stops.map((stop, stopIndex) => (stopIndex === index ? replacement : stop));
  const stops = scheduleStops(nextPlaces);
  const nextSourceTheme = explicitlyChangingTheme
    ? (replacement.categoryLabel || replacement.tags?.[0] || replacement.name)
    : sourceTheme;
  return {
    ...plan,
    title: explicitlyChangingTheme ? nextSourceTheme : plan.title,
    sourceTheme: nextSourceTheme,
    stops,
    summary: summarizePlan(stops),
    lastChange: `已将 ${current.name} 替换为 ${replacement.name}`
  };
}

export function deletePlanStop(plan, stopId) {
  if (plan.stops.length <= 1) return plan;
  const target = plan.stops.find((stop) => stop.stopId === stopId);
  if (!target) return plan;
  const nextPlaces = plan.stops.filter((stop) => stop.stopId !== stopId);
  if (nextPlaces.length === plan.stops.length) return plan;
  if (plan.sourceTheme && placeMatchesTheme(target, plan.sourceTheme) && !nextPlaces.some((stop) => placeMatchesTheme(stop, plan.sourceTheme))) return plan;
  const stops = scheduleStops(nextPlaces);
  return {
    ...plan,
    stops,
    summary: summarizePlan(stops),
    lastChange: '已从约见方案中移除一站'
  };
}

export function getMatchReasons(place, conditions = {}) {
  const safeReasons = [];
  if (place.userDistanceKm != null && place.partnerDistanceKm != null && Number(place.distanceGapKm || 0) <= 2) safeReasons.push('双方通勤更均衡');
  if ((place.moods || []).includes(conditions.mood)) safeReasons.push(`适合${moodLabel(conditions.mood)}`);
  if (place.noise === '安静') safeReasons.push('环境相对安静');
  if (place.distanceKm <= Math.min(3, Number(conditions.distance || 6))) safeReasons.push('离你们不远');
  if (place.openNow === true) safeReasons.push('Google 显示正在营业');
  else if (place.booking?.status === 'available') safeReasons.push('当天预计可订');
  if (!safeReasons.length) safeReasons.push(...(place.tags || []).slice(0, 3));
  return safeReasons.slice(0, 3);
}

export function buildMemoryFromWrapup(plan, wrapup, id = `memory-${Date.now()}`) {
  const favoriteStop = plan.stops.find((stop) => stop.id === wrapup.favoritePlaceId) || plan.stops[0];
  return {
    id,
    date: new Date().toISOString().slice(0, 10),
    title: wrapup.title || plan.title,
    note: wrapup.note || `这次最喜欢的是 ${favoriteStop?.name || '一起度过的这段时间'}。`,
    image: favoriteStop?.photoVerified ? favoriteStop.image : null,
    sceneImage: favoriteStop?.photoVerified ? null : favoriteStop?.sceneImage || null,
    sceneImageSourceLabel: favoriteStop?.sceneImageSourceLabel || null,
    sceneImageSourceUrl: favoriteStop?.sceneImageSourceUrl || null,
    photoVerified: Boolean(favoriteStop?.photoVerified && favoriteStop?.image),
    photoSourceLabel: favoriteStop?.photoSourceLabel || null,
    photoSourceUrl: favoriteStop?.photoSourceUrl || favoriteStop?.websiteUri || null,
    photoAttributions: favoriteStop?.photoAttributions || [],
    imageKind: favoriteStop?.imageKind || (favoriteStop?.photoVerified ? 'merchant' : 'none'),
    visibility: wrapup.visibility || 'couple',
    feeling: wrapup.feeling || '很喜欢',
    favorite: favoriteStop?.name || '',
    category: favoriteStop?.category || 'activity',
    categoryLabel: favoriteStop?.categoryLabel || '约会片段',
    confirmed: true,
    source: '用户在约会结束后保存',
    feedback: {
      more: wrapup.more || '',
      less: wrapup.less || ''
    }
  };
}

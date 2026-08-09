import { buildPlan, buildPlanFromSelection, getSearchRadii, placeMatchesTheme, themeCategory } from './domain.js?v=2.4.11';
import { MOOD_VALUES } from './moods.js?v=2.4.11';

const questions = [
  {
    id: 'mood',
    text: '这次更想把重点放在哪？',
    replies: [...MOOD_VALUES]
  },
  {
    id: 'duration',
    text: '你们想为这次留出多久？',
    type: 'duration',
    min: 60,
    max: 360,
    step: 5
  },
  {
    id: 'priority',
    text: '这次最不想牺牲哪些？',
    replies: ['少通勤', '少走路', '环境安静', '室内舒适', '不排队', '时间准点', '预算可控', '有一点新鲜感']
  }
];

const priceLevelMeta = {
  PRICE_LEVEL_FREE: { label: '免费', estimate: 0 },
  PRICE_LEVEL_INEXPENSIVE: { label: '¥ · 价格亲民', estimate: 160 },
  PRICE_LEVEL_MODERATE: { label: '¥¥ · 中等价位', estimate: 360 },
  PRICE_LEVEL_EXPENSIVE: { label: '¥¥¥ · 较高价位', estimate: 650 },
  PRICE_LEVEL_VERY_EXPENSIVE: { label: '¥¥¥¥ · 高端价位', estimate: 1000 }
};

const typeLabels = {
  restaurant: '餐厅',
  cafe: '咖啡',
  coffee_shop: '咖啡',
  bakery: '烘焙',
  dessert_shop: '甜品',
  bar: '酒吧',
  art_gallery: '看展',
  museum: '博物馆',
  park: '散步',
  tourist_attraction: '体验',
  movie_theater: '电影',
  performing_arts_theater: '演出',
  comedy_club: '脱口秀',
  bowling_alley: '保龄球',
  amusement_center: '游戏体验',
  karaoke: 'K歌',
  cultural_center: '文化体验'
};

let mapsPromise = null;
let baiduMapsPromise = null;
let cachedConfig = null;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function runtimeAppUrl(path) {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const appPath = window.location.pathname.match(/^\/app\/app_[^/]+/)?.[0];
  const runtimeRoot = appPath
    ? `${window.location.origin}${appPath}/`
    : `${window.location.origin}/`;
  return new URL(normalizedPath, runtimeRoot).toString();
}

function requestUrl(url) {
  return /^\/?api\//.test(String(url || '')) ? runtimeAppUrl(url) : url;
}

async function requestJson(url, options = {}) {
  if (typeof window.yiqiyaApiRequest === 'function') {
    return window.yiqiyaApiRequest(url, options);
  }
  const response = await fetch(requestUrl(url), {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `请求失败（${response.status}）`);
    error.code = payload.code || 'REQUEST_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload;
}

function moneyValue(money) {
  if (!money) return null;
  const units = Number(money.units || 0);
  const nanos = Number(money.nanos || 0) / 1_000_000_000;
  const value = units + nanos;
  return Number.isFinite(value) ? value : null;
}

function currencySymbol(currencyCode) {
  const symbols = { CNY: '¥', USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', SGD: 'S$' };
  return symbols[currencyCode] || `${currencyCode || ''} `;
}

function parsePriceRange(priceRange) {
  const start = moneyValue(priceRange?.startPrice);
  const end = moneyValue(priceRange?.endPrice);
  const currency = priceRange?.startPrice?.currencyCode || priceRange?.endPrice?.currencyCode || '';
  if (start == null && end == null) return null;
  const symbol = currencySymbol(currency);
  const label = start != null && end != null
    ? `${symbol}${Math.round(start)}–${Math.round(end)}`
    : start != null ? `${symbol}${Math.round(start)} 起` : `最高 ${symbol}${Math.round(end)}`;
  return { start, end, currency, label };
}

function inferCategory(place, requestedCategory) {
  if (requestedCategory) return requestedCategory;
  const types = place.types || [];
  if (types.some((type) => ['restaurant', 'meal_takeaway', 'meal_delivery', 'bar'].includes(type))) return 'dinner';
  if (types.some((type) => ['cafe', 'coffee_shop', 'bakery', 'dessert_shop', 'ice_cream_shop'].includes(type))) return 'dessert';
  return 'activity';
}

function categoryLabel(place, category) {
  return place.primaryTypeDisplayName?.text || typeLabels[place.primaryType] || ({ dinner: '晚餐', activity: '体验', dessert: '收尾' }[category]);
}

function moodsForPlace(place, category) {
  const searchable = [place.displayName?.text, place.primaryType, ...(place.types || [])].filter(Boolean).join(' ').toLowerCase();
  if (category === 'dinner') return ['认真吃饭', '安静聊聊', '松弛一点'];
  if (category === 'dessert') return ['松弛一点', '安静聊聊', '随性一点'];
  if (/(music|record_store|night_club|performing_arts|concert|黑胶|音乐|演出)/.test(searchable)) return ['听点音乐', '松弛一点'];
  if (/(karaoke|ktv|k歌)/.test(searchable)) return ['听点音乐', '随性一点'];
  if (/(comedy|脱口秀|immersive|沉浸|theater|剧场|戏剧)/.test(searchable)) return ['看点东西', '尝点新的'];
  if (/(pottery|陶艺|silver|银饰|手作|board.?game|桌游)/.test(searchable)) return ['随性一点', '安静聊聊'];
  if (/(escape_room|escape room|密室|bowling|保龄球|billiard|台球|arcade|街机|amusement_center|游戏厅)/.test(searchable)) return ['随性一点', '尝点新的'];
  if (/(art_gallery|museum|movie_theater|book_store|exhibit|gallery|美术馆|博物馆|电影院|书店|展览)/.test(searchable)) return ['看点东西', '安静聊聊'];
  if (/(park|garden|walking|promenade|tourist_attraction|公园|步道|滨江|街区)/.test(searchable)) return ['随性一点', '安静聊聊'];
  return ['随性一点', '看点东西'];
}

function tagsForPlace(place, category) {
  const tags = [];
  if (place.currentOpeningHours?.openNow === true) tags.push('正在营业');
  if (place.rating >= 4.5) tags.push('高评分');
  if ((place.userRatingCount || 0) >= 100) tags.push('多人评价');
  tags.push(categoryLabel(place, category));
  return [...new Set(tags)].slice(0, 4);
}

function haversineKm(a, b) {
  if (!a || !b) return null;
  const toRadians = (value) => value * Math.PI / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function validLocation(value) {
  return Boolean(value && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude)));
}

function departureLocations(value = {}) {
  const user = validLocation(value?.user) ? value.user : null;
  const partner = validLocation(value?.partner) ? value.partner : null;
  return { user, partner };
}

function midpointForDepartures(value = {}) {
  const { user, partner } = departureLocations(value);
  if (!user && !partner) return null;
  if (!user || !partner) {
    const only = user || partner;
    return {
      latitude: Number(only.latitude),
      longitude: Number(only.longitude),
      label: only.label || '已设置的出发位置',
      source: user ? 'user-departure' : 'partner-departure',
      coordinateSystem: only.coordinateSystem || 'wgs84',
      departures: { user, partner }
    };
  }
  const userPoint = pointForProvider({ location: user, coordinateSystem: user.coordinateSystem || 'wgs84' }, 'osm');
  const partnerPoint = pointForProvider({ location: partner, coordinateSystem: partner.coordinateSystem || 'wgs84' }, 'osm');
  return {
    latitude: (userPoint.latitude + partnerPoint.latitude) / 2,
    longitude: (userPoint.longitude + partnerPoint.longitude) / 2,
    label: '双方中间区域',
    source: 'couple-midpoint',
    coordinateSystem: 'wgs84',
    separationKm: Number(haversineKm(userPoint, partnerPoint).toFixed(1)),
    departures: { user, partner }
  };
}

function meetingDistanceMetrics(destination, value = {}, center = null) {
  if (!validLocation(destination)) return {};
  const { user, partner } = departureLocations(value);
  const wgsUser = user ? pointForProvider({ location: user, coordinateSystem: user.coordinateSystem || 'wgs84' }, 'osm') : null;
  const wgsPartner = partner ? pointForProvider({ location: partner, coordinateSystem: partner.coordinateSystem || 'wgs84' }, 'osm') : null;
  const userDistance = wgsUser ? haversineKm(wgsUser, destination) : null;
  const partnerDistance = wgsPartner ? haversineKm(wgsPartner, destination) : null;
  const centerDistance = center && validLocation(center) ? haversineKm(center, destination) : null;
  const available = [userDistance, partnerDistance].filter((item) => item != null);
  const maximum = available.length ? Math.max(...available) : centerDistance;
  const gap = userDistance != null && partnerDistance != null ? Math.abs(userDistance - partnerDistance) : 0;
  return {
    userDistanceKm: userDistance == null ? null : Number(userDistance.toFixed(1)),
    partnerDistanceKm: partnerDistance == null ? null : Number(partnerDistance.toFixed(1)),
    centerDistanceKm: centerDistance == null ? null : Number(centerDistance.toFixed(1)),
    maxDepartureDistanceKm: maximum == null ? null : Number(maximum.toFixed(1)),
    distanceGapKm: Number(gap.toFixed(1)),
    distanceKm: maximum == null ? null : Number(maximum.toFixed(1))
  };
}

function withMeetingDistance(place, value = {}, center = null) {
  if (!place?.location) return place;
  const destination = pointForProvider(place, 'osm');
  const metrics = meetingDistanceMetrics(destination, value, center);
  if (metrics.distanceKm == null) return place;
  const both = metrics.userDistanceKm != null && metrics.partnerDistanceKm != null;
  return {
    ...place,
    ...metrics,
    travelMin: Math.max(6, Math.round(metrics.distanceKm * 4.5)),
    transport: both
      ? `你约 ${metrics.userDistanceKm} km · TA 约 ${metrics.partnerDistanceKm} km`
      : `距出发位置约 ${metrics.distanceKm} km`
  };
}

function openingLabel(place) {
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') return '当前暂停营业';
  if (place.currentOpeningHours?.openNow === true) return '正在营业';
  if (place.currentOpeningHours?.openNow === false) return '当前未营业';
  return '营业状态待确认';
}

function weatherGlyph(code) {
  if ([95, 96, 99].includes(Number(code))) return '⛈';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(Number(code))) return '☂';
  if ([71, 73, 75, 77, 85, 86].includes(Number(code))) return '❄';
  if ([1, 2, 3, 45, 48].includes(Number(code))) return '☁';
  return '☀';
}

export function normalizeGooglePlace(place, { category, origin, origins, checkedAt } = {}) {
  const resolvedCategory = inferCategory(place, category);
  const level = priceLevelMeta[place.priceLevel] || null;
  const range = parsePriceRange(place.priceRange);
  const rangeMidpoint = range ? ((range.start ?? range.end ?? 0) + (range.end ?? range.start ?? 0)) / 2 : null;
  const canUseRangeForCnyEstimate = rangeMidpoint != null && (!range.currency || range.currency === 'CNY');
  const estimatedCostForTwo = canUseRangeForCnyEstimate ? Math.round(rangeMidpoint * 2) : (level?.estimate ?? 320);
  const location = place.location ? {
    latitude: Number(place.location.latitude),
    longitude: Number(place.location.longitude)
  } : null;
  const distance = haversineKm(origin, location);
  const meetingMetrics = meetingDistanceMetrics(location, origins, origin);
  const effectiveDistance = meetingMetrics.distanceKm ?? distance;
  const openNow = place.currentOpeningHours?.openNow;
  const open = !['CLOSED_PERMANENTLY', 'CLOSED_TEMPORARILY'].includes(place.businessStatus);
  const name = place.displayName?.text || '未命名地点';
  const priceLabel = range?.label || level?.label || '商家未提供价格';
  const primaryPhoto = place.photos?.[0] || null;
  const merchantPhoto = primaryPhoto?.name
    ? runtimeAppUrl(`api/places/photo?name=${encodeURIComponent(primaryPhoto.name)}&maxWidth=1200`)
    : null;
  const photoVerified = Boolean(merchantPhoto);

  return {
    id: `google:${place.id}`,
    googlePlaceId: place.id,
    source: 'google',
    dataAttribution: 'Google Maps',
    coordinateSystem: 'wgs84',
    name,
    category: resolvedCategory,
    categoryLabel: categoryLabel(place, resolvedCategory),
    image: merchantPhoto,
    sceneImage: null,
    merchantPhoto,
    photoVerified,
    imageKind: photoVerified ? 'merchant' : 'none',
    photoSourceLabel: photoVerified ? 'Google Maps 地点图片' : '暂无可核验实景图',
    photoSourceUrl: photoVerified ? (place.googleMapsUri || null) : null,
    photoAttributions: primaryPhoto?.authorAttributions || [],
    priceForTwo: estimatedCostForTwo,
    priceIsEstimate: true,
    priceLevel: place.priceLevel || null,
    priceRange: range,
    priceLabel,
    ...meetingMetrics,
    distanceKm: effectiveDistance == null ? 2.8 : Number(effectiveDistance.toFixed(1)),
    durationMin: resolvedCategory === 'dinner' ? 75 : resolvedCategory === 'activity' ? 60 : 45,
    travelMin: effectiveDistance == null ? 12 : Math.max(6, Math.round(effectiveDistance * 4.5)),
    neighborhood: place.shortFormattedAddress || place.formattedAddress?.split(/[，,]/)[0] || '附近',
    address: place.formattedAddress || place.shortFormattedAddress || '地址待商家补充',
    location,
    rating: Number(place.rating || 4.2),
    userRatingCount: Number(place.userRatingCount || 0),
    noise: '以现场为准',
    noiseDb: null,
    indoor: resolvedCategory !== 'activity' || !(place.types || []).includes('park'),
    open,
    openNow,
    businessStatus: place.businessStatus || null,
    tags: tagsForPlace(place, resolvedCategory),
    moods: moodsForPlace(place, resolvedCategory),
    dietary: [],
    transport: meetingMetrics.userDistanceKm != null && meetingMetrics.partnerDistanceKm != null
      ? `你约 ${meetingMetrics.userDistanceKm} km · TA 约 ${meetingMetrics.partnerDistanceKm} km`
      : distance == null ? '打开地图查看实时路线' : `距范围中心约 ${distance.toFixed(1)} km`,
    booking: {
      status: openNow === true ? 'available' : 'unknown',
      label: openingLabel(place),
      wait: '排队与预约请直接联系商家确认'
    },
    freshness: checkedAt ? `查询于 ${new Date(checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '刚刚从 Google Maps 查询',
    reasons: [priceLabel, place.rating ? `Google 评分 ${place.rating}` : '公开地点资料', meetingMetrics.userDistanceKm != null && meetingMetrics.partnerDistanceKm != null ? `双方最远约 ${meetingMetrics.distanceKm} km` : distance == null ? '位于目标街区' : `距范围中心 ${distance.toFixed(1)} km`],
    feeling: place.editorialSummary?.text || `来自 Google Maps 的真实商家结果。你可以查看地址、电话、营业时间并直接打开地图导航。`,
    phone: place.nationalPhoneNumber || null,
    internationalPhone: place.internationalPhoneNumber || null,
    websiteUri: place.websiteUri || null,
    googleMapsUri: place.googleMapsUri || null,
    openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
    currentOpeningHours: place.currentOpeningHours?.weekdayDescriptions || [],
    checkedAt: checkedAt || new Date().toISOString()
  };
}

export function normalizeBaiduPlace(place, { category, origin, origins, checkedAt } = {}) {
  const resolvedCategory = category || 'activity';
  const detail = place.detail_info || {};
  const location = place.location ? {
    latitude: Number(place.location.lat),
    longitude: Number(place.location.lng)
  } : null;
  const wgsLocation = location ? pointForProvider({ location, coordinateSystem: 'bd09' }, 'osm') : null;
  const distance = haversineKm(origin, wgsLocation);
  const meetingMetrics = meetingDistanceMetrics(wgsLocation, origins, origin);
  const effectiveDistance = meetingMetrics.distanceKm ?? distance;
  const rating = Number(detail.overall_rating || 4.3);
  const price = Number(detail.price || 0);
  const priceForTwo = Number.isFinite(price) && price > 0 ? Math.round(price * 2) : ({ dinner: 320, activity: 220, dessert: 100 }[resolvedCategory]);
  const name = place.name || '未命名地点';
  const phone = place.telephone || detail.phone || null;
  const open = detail.shop_hours !== '暂停营业';
  const mapUri = location
    ? `https://api.map.baidu.com/marker?location=${location.latitude},${location.longitude}&title=${encodeURIComponent(name)}&content=${encodeURIComponent(place.address || '')}&output=html&src=Yuejian`
    : `https://map.baidu.com/search/${encodeURIComponent(name)}`;
  return {
    id: `baidu:${place.uid}`,
    baiduPlaceId: place.uid,
    source: 'baidu',
    dataAttribution: '百度地图',
    coordinateSystem: 'bd09',
    name,
    category: resolvedCategory,
    categoryLabel: detail.tag?.split(';')[0] || ({ dinner: '餐厅', activity: '娱乐体验', dessert: '咖啡甜品' }[resolvedCategory]),
    image: null,
    sceneImage: null,
    merchantPhoto: null,
    photoVerified: false,
    imageKind: 'none',
    photoSourceLabel: '暂无可核验实景图',
    photoSourceUrl: null,
    photoAttributions: [],
    priceForTwo,
    priceIsEstimate: true,
    priceLevel: null,
    priceRange: null,
    priceLabel: price > 0 ? `人均约 ¥${Math.round(price)}` : '商家未提供价格',
    ...meetingMetrics,
    distanceKm: effectiveDistance == null ? 2.8 : Number(effectiveDistance.toFixed(1)),
    durationMin: resolvedCategory === 'dinner' ? 75 : resolvedCategory === 'activity' ? 75 : 45,
    travelMin: effectiveDistance == null ? 12 : Math.max(6, Math.round(effectiveDistance * 4.5)),
    neighborhood: place.area || place.city || '附近',
    address: place.address || '地址待商家补充',
    location,
    rating: rating || 4.3,
    userRatingCount: Number(detail.comment_num || 0),
    noise: '以现场为准',
    noiseDb: null,
    indoor: resolvedCategory !== 'activity' || !/(公园|步道|景区|广场)/.test(`${detail.tag || ''}${name}`),
    open,
    openNow: null,
    businessStatus: open ? 'OPERATIONAL' : 'CLOSED_TEMPORARILY',
    tags: [detail.tag?.split(';')[0], rating ? `评分 ${rating}` : '', resolvedCategory === 'activity' ? '娱乐活动' : ''].filter(Boolean).slice(0, 4),
    moods: moodsForPlace({ displayName: { text: name }, primaryType: detail.tag, types: [detail.tag] }, resolvedCategory),
    dietary: [],
    transport: meetingMetrics.userDistanceKm != null && meetingMetrics.partnerDistanceKm != null
      ? `你约 ${meetingMetrics.userDistanceKm} km · TA 约 ${meetingMetrics.partnerDistanceKm} km`
      : distance == null ? '打开百度地图查看路线' : `距范围中心约 ${distance.toFixed(1)} km`,
    booking: {
      status: open ? 'unknown' : 'closed',
      label: open ? (detail.shop_hours || '营业状态待确认') : '当前暂停营业',
      wait: '预约、排队与场次请直接联系商家确认'
    },
    freshness: checkedAt ? `查询于 ${new Date(checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '刚刚从百度地图查询',
    reasons: [detail.tag?.split(';')[0] || '真实地点', rating ? `百度评分 ${rating}` : '公开地点资料', meetingMetrics.userDistanceKm != null && meetingMetrics.partnerDistanceKm != null ? `双方最远约 ${meetingMetrics.distanceKm} km` : distance == null ? '位于目标街区' : `距范围中心 ${distance.toFixed(1)} km`],
    feeling: `${name} 来自百度地图真实地点检索。具体场次、价格和预约情况请在出发前向商家确认。`,
    phone,
    internationalPhone: null,
    websiteUri: detail.detail_url || null,
    googleMapsUri: null,
    baiduMapsUri: mapUri,
    openingHours: detail.shop_hours ? [detail.shop_hours] : [],
    currentOpeningHours: detail.shop_hours ? [detail.shop_hours] : [],
    checkedAt: checkedAt || new Date().toISOString()
  };
}

function queryForCategory(category, conditions, theme, origin = null) {
  const area = origin?.source === 'couple-midpoint' ? '北京' : String(conditions.area || '北京').trim();
  const mood = conditions.mood;
  if (category === 'dinner') {
    const dinnerStyle = mood === '认真吃饭' ? '菜品口碑好 适合约会的'
      : mood === '安静聊聊' ? '安静 能久坐的'
        : mood === '随性一点' ? '不用预约 轻松的小馆'
          : '适合约会的';
    return `${area} ${theme === '晚餐' ? '' : dinnerStyle} 餐厅`;
  }
  if (category === 'dessert') {
    const moodEnding = mood === '松弛一点' ? '安静 可久坐 咖啡馆 甜品店'
      : mood === '随性一点' ? '冰淇淋 甜品 街边小店'
        : '咖啡馆 甜品店';
    const ending = ['咖啡', '甜品', '冰淇淋', '书店'].includes(theme) ? theme : moodEnding;
    return `${area} 晚间营业 ${ending}`;
  }
  const moodActivity = mood === '看点东西' ? '展览 美术馆 电影院 脱口秀 沉浸式戏剧 密室'
    : mood === '听点音乐' ? 'Livehouse 音乐现场 黑胶 演出 KTV'
      : mood === '随性一点' ? '桌游 保龄球 台球 街机 陶艺 夜骑 公园 夜景步道'
        : mood === '安静聊聊' ? '安静 公园 步道 书店'
          : '展览 美术馆 公园 约会体验';
  const activityThemes = ['看展', '散步', '音乐', '日落', '书店', '脱口秀', '陶艺', '密室', '桌游', '保龄球', '沉浸戏剧', '银饰手作', 'K歌', '台球', '街机', '夜骑', '电影', '烘焙', '公园'];
  const activity = activityThemes.includes(theme) ? theme : moodActivity;
  return `${area} ${activity}`;
}

async function getBrowserLocation(enabled) {
  if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 3200, maximumAge: 10 * 60 * 1000 }
    );
  });
}

const BEIJING_SEARCH_CENTERS = [
  [/(三里屯|工体)/, { latitude: 39.9343, longitude: 116.4551, label: '北京三里屯' }],
  [/(亮马河|亮马桥)/, { latitude: 39.9516, longitude: 116.4702, label: '北京亮马河' }],
  [/(鼓楼|后海|什刹海)/, { latitude: 39.9416, longitude: 116.3978, label: '北京鼓楼' }],
  [/(五道营|国子监|雍和宫)/, { latitude: 39.9478, longitude: 116.4176, label: '北京五道营' }],
  [/(798|酒仙桥)/, { latitude: 39.9847, longitude: 116.4962, label: '北京 798' }],
  [/(国贸|CBD)/i, { latitude: 39.9097, longitude: 116.4596, label: '北京国贸' }],
  [/(望京)/, { latitude: 39.9967, longitude: 116.4720, label: '北京望京' }],
  [/(前门|北京坊)/, { latitude: 39.8994, longitude: 116.3977, label: '北京前门' }],
  [/(海淀|中关村)/, { latitude: 39.9836, longitude: 116.3164, label: '北京中关村' }],
  [/(朝阳)/, { latitude: 39.9219, longitude: 116.4436, label: '北京朝阳区' }],
  [/(西城)/, { latitude: 39.9123, longitude: 116.3659, label: '北京西城区' }],
  [/(东城)/, { latitude: 39.9288, longitude: 116.4160, label: '北京东城区' }],
  [/(丰台)/, { latitude: 39.8584, longitude: 116.2871, label: '北京丰台区' }],
  [/(石景山)/, { latitude: 39.9057, longitude: 116.2234, label: '北京石景山区' }],
  [/(昌平)/, { latitude: 40.2208, longitude: 116.2312, label: '北京昌平区' }],
  [/(大兴|亦庄)/, { latitude: 39.7289, longitude: 116.3414, label: '北京大兴区' }],
  [/(通州|副中心)/, { latitude: 39.9098, longitude: 116.6564, label: '北京通州区' }],
  [/(顺义)/, { latitude: 40.1300, longitude: 116.6547, label: '北京顺义区' }],
  [/(房山)/, { latitude: 39.7489, longitude: 116.1433, label: '北京房山区' }]
];

function knownAreaSearchCenter(area) {
  const text = String(area || '').trim();
  const matched = BEIJING_SEARCH_CENTERS.find(([pattern]) => pattern.test(text));
  return matched ? { ...matched[1], label: text || matched[1].label, source: 'area', coordinateSystem: 'wgs84' } : null;
}

function areaSearchCenter(area) {
  const text = String(area || '北京东城区附近').trim();
  const known = knownAreaSearchCenter(text);
  const center = known || { latitude: 39.9042, longitude: 116.4074, label: text || '北京市中心' };
  return { ...center, label: text || center.label, source: 'area', coordinateSystem: 'wgs84' };
}

async function resolveSearchCenter(conditions, locationEnabled, departures = null) {
  const meetingCenter = midpointForDepartures(departures);
  if (meetingCenter) return meetingCenter;
  if (conditions?.centerMode === 'current') {
    const current = locationEnabled ? await getBrowserLocation(true) : null;
    if (current) return { ...current, label: '当前位置', source: 'current', coordinateSystem: 'wgs84' };
    const fallback = areaSearchCenter(conditions?.area);
    return { ...fallback, label: `${fallback.label}（定位未获取，暂用街区中心）`, source: 'area-fallback' };
  }
  return areaSearchCenter(conditions?.area);
}

export const locationService = {
  async current() {
    const location = await getBrowserLocation(true);
    if (!location) throw new Error('没有取得当前位置，请检查浏览器定位权限，或改为输入地点');
    return {
      ...location,
      label: '当前位置',
      source: 'current',
      coordinateSystem: 'wgs84',
      updatedAt: new Date().toISOString()
    };
  },
  async resolveText(query) {
    const text = String(query || '').trim();
    if (!text) throw new Error('请输入出发地点');
    const config = await mapsConfigService.getConfig();
    if (config.placesEnabled) {
      try {
        const payload = await requestJson('/api/maps/geocode', {
          method: 'POST',
          body: JSON.stringify({ address: text, city: '北京市' })
        });
        const point = payload.coordinateSystem === 'bd09'
          ? pointForProvider({ location: payload.location, coordinateSystem: 'bd09' }, 'osm')
          : payload.location;
        if (validLocation(point)) {
          return {
            ...point,
            label: payload.formattedAddress || text,
            source: 'search',
            coordinateSystem: 'wgs84',
            updatedAt: new Date().toISOString()
          };
        }
      } catch (error) {
        const local = knownAreaSearchCenter(text);
        if (!local) throw error;
        return { ...local, label: text, source: 'manual', updatedAt: new Date().toISOString() };
      }
    }
    const local = knownAreaSearchCenter(text);
    if (!local) throw new Error('当前演示模式可输入三里屯、望京、国贸、鼓楼、海淀、通州等北京街区；配置百度地图 AK 后可搜索完整地址');
    return { ...local, label: text, source: 'manual', updatedAt: new Date().toISOString() };
  },
  midpoint(departures) {
    return midpointForDepartures(departures);
  },
  separationKm(departures) {
    return midpointForDepartures(departures)?.separationKm ?? null;
  },
  watch(onLocation, onError) {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onError?.({ code: 0, message: '当前浏览器不支持位置识别' });
      return () => {};
    }
    const watchId = navigator.geolocation.watchPosition(
      (position) => onLocation?.({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        coordinateSystem: 'wgs84',
        updatedAt: new Date(position.timestamp || Date.now()).toISOString()
      }),
      (error) => onError?.(error),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  },
  distanceMeters(place, location) {
    if (!place?.location || !validLocation(location)) return null;
    const destination = pointForProvider(place, 'osm');
    const current = pointForProvider({ location, coordinateSystem: location.coordinateSystem || 'wgs84' }, 'osm');
    const distance = haversineKm(current, destination);
    return distance == null ? null : distance * 1000;
  }
};

export const mapsConfigService = {
  async getConfig({ refresh = false } = {}) {
    if (cachedConfig && !refresh) return cachedConfig;
    try {
      cachedConfig = await requestJson('/api/config');
    } catch {
      cachedConfig = { mapsEnabled: true, placesEnabled: false, routesEnabled: false, browserKey: null, baiduBrowserAk: null, mapId: 'DEMO_MAP_ID', mapProvider: 'osm', placesProvider: 'demo', mode: 'demo', agentEnabled: false, agentProvider: 'local', agentModel: '约见本地规划器' };
    }
    return cachedConfig;
  }
};

export const weatherService = {
  async getTonightWeather() {
    return requestJson('/api/weather?city=%E5%8C%97%E4%BA%AC&latitude=39.9042&longitude=116.4074');
  },
  glyph(weather) {
    return weatherGlyph(weather?.evening?.weatherCode ?? weather?.current?.weatherCode);
  }
};

function compactUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

export const dateAdviceService = {
  forPlace(place, weather = null) {
    const rainProbability = Number(weather?.evening?.rainProbability || 0);
    const apparentTemperature = Number(weather?.evening?.maxApparentTemperature ?? weather?.current?.apparentTemperature ?? 24);
    const transport = [];
    const outfit = [];
    const carry = [];
    const addressText = `${place?.neighborhood || ''}${place?.address || ''}`;

    if (place?.transportHint) transport.push(place.transportHint);
    else if (/(胡同|鼓楼|国子监|沙滩|五道营|前门|和平门)/.test(addressText)) transport.push('核心城区与胡同停车不便，优先地铁后步行，返程再叫车。');
    else if (/(三里屯|亮马桥|霄云路|国贸|望京)/.test(addressText)) transport.push('晚高峰建议优先地铁；需要打车时多预留 15 分钟。');
    else if (Number(place?.distanceKm || 0) <= 2 && rainProbability < 35) transport.push('距离不远，可把最后一段留给步行。');
    else transport.push('建议先查看百度地图实时路况，再决定地铁或网约车。');

    if (rainProbability >= 50) {
      transport.push('降雨概率较高，减少骑行和长距离步行，网约车上车点尽量选主路。');
      carry.push('折叠伞');
      outfit.push('防滑、耐水的鞋，避免麂皮或不耐雨材质。');
    } else if (rainProbability >= 25) carry.push('轻便折叠伞');

    if (apparentTemperature >= 35) {
      outfit.push('轻薄透气上装，避免厚重叠穿。');
      carry.push('纸巾或小毛巾');
    } else if (apparentTemperature >= 29) outfit.push('透气短袖或薄衬衫更舒服。');
    else if (apparentTemperature <= 12) outfit.push('准备一件保暖外套。');

    if (place?.dressCode) outfit.push(place.dressCode);
    else if (place?.source === 'curated') outfit.push('整洁的 smart casual 比较稳妥。');
    else if (place?.indoor) outfit.push('室内空调可能偏凉，可带一件轻薄外搭。');
    else outfit.push('选舒适鞋和方便活动的衣服。');

    if (!place?.indoor && apparentTemperature >= 30) carry.push('防晒用品');
    return {
      transport: compactUnique(transport),
      outfit: compactUnique(outfit),
      carry: compactUnique(carry),
      weatherSensitive: rainProbability >= 50 || !place?.indoor
    };
  },
  forPlan(plan, weather = null) {
    const stops = plan?.stops || [];
    const perStop = stops.map((stop) => ({ stop, advice: this.forPlace(stop, weather) }));
    const rainProbability = Number(weather?.evening?.rainProbability || 0);
    const outdoorCount = stops.filter((stop) => !stop.indoor).length;
    const neighborhoods = compactUnique(stops.map((stop) => stop.neighborhood));
    const summary = [];
    if (rainProbability >= 50 && outdoorCount) summary.push('当天有降雨风险，户外站建议保留室内备选。');
    if (neighborhoods.length >= 3) summary.push('行程跨多个街区，晚高峰不要把换乘时间压得太紧。');
    if (stops.some((stop) => /(胡同|鼓楼|国子监|沙滩|五道营)/.test(`${stop.neighborhood || ''}${stop.address || ''}`))) summary.push('胡同段以地铁加步行为主，停车通常不省心。');
    if (!summary.length) summary.push('路线较集中，优先公共交通，最后一段根据体感选择步行。');
    return {
      summary,
      outfit: compactUnique(perStop.flatMap((item) => item.advice.outfit)).slice(0, 3),
      carry: compactUnique(perStop.flatMap((item) => item.advice.carry)).slice(0, 3),
      perStop
    };
  }
};

function cleanProfileList(value, limit = 8) {
  return [...new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

export function compactCoupleProfile(profile) {
  if (!profile?.guests) return null;
  const compactGuest = (guest, fallbackName) => ({
    name: String(guest?.name || fallbackName).trim().slice(0, 20),
    foodLikes: cleanProfileList(guest?.foodLikes),
    dietaryNeeds: cleanProfileList(guest?.dietaryNeeds, 6),
    activityLikes: cleanProfileList(guest?.activityLikes),
    activityAvoids: cleanProfileList(guest?.activityAvoids),
    socialPace: String(guest?.socialPace || '').trim().slice(0, 24),
    conversationStyle: String(guest?.conversationStyle || '').trim().slice(0, 24),
    energyLevel: String(guest?.energyLevel || '').trim().slice(0, 24),
    planningPriority: String(guest?.planningPriority || '').trim().slice(0, 30),
    budgetStyle: String(guest?.budgetStyle || '').trim().slice(0, 24),
    transportPreference: String(guest?.transportPreference || '').trim().slice(0, 24),
    timePreference: String(guest?.timePreference || '').trim().slice(0, 24),
    favoriteAreas: cleanProfileList(guest?.favoriteAreas, 6),
    occasionPreferences: cleanProfileList(guest?.occasionPreferences, 5),
    accessibilityNotes: String(guest?.accessibilityNotes || '').trim().slice(0, 160),
    notes: String(guest?.notes || '').trim().slice(0, 240)
  });
  return {
    connected: Boolean(profile.connected),
    guests: {
      user: compactGuest(profile.guests.user, '我'),
      partner: compactGuest(profile.guests.partner, '伴侣')
    }
  };
}

export function mergeGuestConditions(conditions = {}, profile = null) {
  const compact = compactCoupleProfile(profile);
  if (!compact) return { ...conditions, dietary: cleanProfileList(conditions.dietary, 10) };
  const dietary = cleanProfileList([
    ...(Array.isArray(conditions.dietary) ? conditions.dietary : []),
    ...compact.guests.user.dietaryNeeds,
    ...compact.guests.partner.dietaryNeeds
  ], 10);
  return { ...conditions, dietary };
}

export const aiPlannerService = {
  getQuestion(step, theme = null) {
    const questionIndex = Math.min(Math.max(0, Number(step) || 0), questions.length - 1);
    const selectedTheme = String(theme || '').trim();
    if (questionIndex === 0 && selectedTheme) {
      return {
        id: 'theme',
        text: `已经选好「${selectedTheme}」`,
        replies: [selectedTheme],
        locked: true
      };
    }
    return questions[questionIndex];
  },
  getQuestionCount() {
    return questions.length;
  },
  durationMinutesFromAnswer(answer) {
    const text = String(answer ?? '').trim();
    const explicitMinutes = text.match(/^(\d+)\s*分钟$/);
    if (explicitMinutes) return Math.max(60, Math.min(360, Number(explicitMinutes[1])));
    const hourAndMinute = text.match(/^(\d+(?:\.\d+)?)\s*小时(?:\s*(\d+)\s*分(?:钟)?)?$/);
    if (hourAndMinute) {
      const minutes = Number(hourAndMinute[1]) * 60 + Number(hourAndMinute[2] || 0);
      return Math.max(60, Math.min(360, Math.round(minutes)));
    }
    const hours = Number.parseFloat(text);
    return Math.max(60, Math.min(360, Number.isFinite(hours) ? Math.round(hours * 60) : 180));
  },
  durationAnswerFromMinutes(minutes) {
    return `${Math.max(60, Math.min(360, Math.round(Number(minutes) || 180)))} 分钟`;
  },
  priorityValuesFromAnswer(answer) {
    const allowed = new Set(questions.find((question) => question.id === 'priority')?.replies || []);
    const values = Array.isArray(answer)
      ? answer
      : String(answer || '').split(/[、,，|｜]/);
    return [...new Set(values.map((value) => String(value || '').trim()).filter((value) => allowed.has(value)))];
  },
  priorityAnswerFromValues(values) {
    return this.priorityValuesFromAnswer(values).join('、');
  },
  interpretAnswer(questionId, answer) {
    if (questionId === 'mood' && MOOD_VALUES.includes(answer)) return { mood: answer };
    if (questionId === 'duration') return { duration: this.durationMinutesFromAnswer(answer) / 60 };
    if (questionId === 'priority') {
      const priorities = this.priorityValuesFromAnswer(answer);
      return { indoorOnly: priorities.includes('室内舒适') };
    }
    return null;
  },
  getEffectiveConditions(conditions, profile) {
    return mergeGuestConditions(conditions, profile);
  },
  async generate({ places, conditions, profile = null, theme, themeTitle, weather, messages = [], preferredPlaceIds = [], feedback = null, onStatus }) {
    const planningConditions = mergeGuestConditions(conditions, profile);
    const coupleProfile = compactCoupleProfile(profile);
    const priorities = this.priorityValuesFromAnswer(messages?.[2]);
    const statuses = coupleProfile
      ? ['正在合并你们的必要条件', '正在平衡双方口味、活动和相处节奏', '正在结合天气与交通组合顺路方案']
      : ['正在检查预算、时间与距离', '正在分析天气、交通和体验节奏', '正在组合顺路的 2–4 站'];
    for (const status of statuses) {
      onStatus?.(status);
      await delay(220);
    }
    try {
      onStatus?.('规划 Agent 正在比较候选地点');
      const agent = await requestJson('/api/agent/plan', {
        method: 'POST',
        body: JSON.stringify({ places, conditions: planningConditions, profile: coupleProfile, theme, weather, messages, priorities, preferredPlaceIds, feedback })
      });
      const result = agent.result || {};
      return buildPlanFromSelection(places, result.selectedPlaceIds, planningConditions, {
        theme,
        themeTitle,
        agentTitle: result.title,
        preferredPlaceIds,
        priorities,
        feedback,
        agent: {
          provider: agent.provider,
          mode: agent.mode,
          analysis: result.analysis,
          reasons: result.reasons || [],
          cautions: result.cautions || []
        },
        seed: `${agent.provider || 'agent'}-${Date.now()}`,
        createdAt: new Date().toISOString()
      });
    } catch {
      return buildPlan(places, planningConditions, {
        theme,
        themeTitle,
        preferredPlaceIds,
        priorities,
        feedback,
        seed: places.some((place) => ['google', 'baidu'].includes(place.source)) ? `live-${Date.now()}` : `local-${Date.now()}`,
        createdAt: new Date().toISOString()
      });
    }
  }
};

export const inspirationService = {
  async generate({ conditions, profile = null, weather, places, seed = `${Date.now()}-${Math.random()}` }) {
    return requestJson('/api/agent/inspirations', {
      method: 'POST',
      body: JSON.stringify({ conditions, profile: compactCoupleProfile(profile), weather, places, seed, count: 6 })
    });
  }
};

export const accountService = {
  async me() {
    return requestJson('/api/auth/me');
  },
  async register(input) {
    return requestJson('/api/auth/register', { method: 'POST', body: JSON.stringify(input) });
  },
  async login(input) {
    return requestJson('/api/auth/login', { method: 'POST', body: JSON.stringify(input) });
  },
  async logout() {
    return requestJson('/api/auth/logout', { method: 'POST', body: '{}' });
  },
  async loadState() {
    return requestJson('/api/account/state');
  },
  async saveState(state) {
    return requestJson('/api/account/state', { method: 'PUT', body: JSON.stringify({ state }) });
  },
  async updateProfile(displayName) {
    return requestJson('/api/account/profile', { method: 'PUT', body: JSON.stringify({ displayName }) });
  },
  async deleteAccount() {
    return requestJson('/api/account', { method: 'DELETE' });
  }
};

export const placeService = {
  async searchForPlan({ conditions, theme, locationEnabled = true, departures = null }) {
    const config = await mapsConfigService.getConfig();
    if (!config.placesEnabled) {
      const error = new Error('真实商家检索尚未配置');
      error.code = 'MAPS_NOT_CONFIGURED';
      throw error;
    }
    const origin = await resolveSearchCenter(conditions, locationEnabled, departures);
    const providerCenter = config.placesProvider === 'baidu'
      ? pointForProvider({ location: origin, coordinateSystem: origin.coordinateSystem || 'wgs84' }, 'baidu')
      : origin;
    const requestedDistanceKm = Math.max(1, Number(conditions.distance || 6));
    const searchCategory = async (category, radiusKm) => {
      const payload = await requestJson('/api/places/search', {
        method: 'POST',
        body: JSON.stringify({
          query: queryForCategory(category, conditions, theme, origin),
          languageCode: 'zh-CN',
          maxResultCount: 10,
          locationBias: origin ? {
            center: { latitude: providerCenter.latitude, longitude: providerCenter.longitude },
            radius: Math.max(1000, radiusKm * 1000)
          } : undefined
        })
      });
      const normalize = payload.provider === 'baidu' ? normalizeBaiduPlace : normalizeGooglePlace;
      return (payload.places || [])
        .map((place) => normalize(place, { category, origin, origins: departures, checkedAt: payload.searchedAt }))
        .filter((place) => place.open !== false)
        .filter((place) => Number(place.distanceKm || 0) <= radiusKm + 0.25)
        .filter((place) => !Number(place.priceForTwo) || Number(place.priceForTwo) <= Number(conditions.budget || 500))
        .filter((place) => !conditions.indoorOnly || place.indoor);
    };

    let searchDistanceKm = requestedDistanceKm;
    let responses;
    if (theme) {
      const primaryCategory = themeCategory(theme);
      let themePlaces = [];
      for (const radiusKm of getSearchRadii(requestedDistanceKm)) {
        const matches = (await searchCategory(primaryCategory, radiusKm))
          .filter((place) => placeMatchesTheme(place, theme));
        searchDistanceKm = radiusKm;
        if (matches.length) {
          themePlaces = matches;
          break;
        }
      }
      if (!themePlaces.length) {
        return {
          places: [],
          unavailableTheme: true,
          requestedDistanceKm,
          searchDistanceKm,
          center: { ...origin, radiusKm: searchDistanceKm, expandedFromKm: requestedDistanceKm }
        };
      }
      const companionCategories = primaryCategory === 'activity'
        ? ['dinner', 'dessert']
        : primaryCategory === 'dinner' ? ['dessert'] : ['dinner'];
      const companions = await Promise.all(companionCategories.map((category) => searchCategory(category, searchDistanceKm)));
      responses = [themePlaces, ...companions];
    } else {
      responses = await Promise.all(['dinner', 'activity', 'dessert'].map((category) => searchCategory(category, requestedDistanceKm)));
    }
    const deduplicated = new Map();
    responses.flat().forEach((place) => deduplicated.set(place.id, place));
    return {
      places: [...deduplicated.values()],
      unavailableTheme: false,
      requestedDistanceKm,
      searchDistanceKm,
      center: { ...origin, radiusKm: searchDistanceKm, expandedFromKm: searchDistanceKm > requestedDistanceKm ? requestedDistanceKm : null }
    };
  },
  async getDetails(place) {
    const provider = place?.source;
    const placeId = provider === 'baidu' ? place?.baiduPlaceId : place?.googlePlaceId;
    if (!placeId || !['google', 'baidu'].includes(provider)) return place;
    const payload = await requestJson(`/api/places/${encodeURIComponent(placeId)}?provider=${provider}`);
    const normalize = payload.provider === 'baidu' ? normalizeBaiduPlace : normalizeGooglePlace;
    const normalized = normalize(payload.place, { category: place.category, checkedAt: new Date().toISOString() });
    return {
      ...place,
      ...normalized,
      distanceKm: place.distanceKm,
      userDistanceKm: place.userDistanceKm,
      partnerDistanceKm: place.partnerDistanceKm,
      maxDepartureDistanceKm: place.maxDepartureDistanceKm,
      distanceGapKm: place.distanceGapKm,
      travelMin: place.travelMin,
      transport: place.transport
    };
  },
  async refresh(place) {
    if (['google', 'baidu'].includes(place?.source)) return this.getDetails(place);
    await delay(220);
    return { ...place, checkedAt: new Date().toISOString() };
  }
};

function loadGoogleMaps(config) {
  if (globalThis.google?.maps) return Promise.resolve(globalThis.google.maps);
  if (mapsPromise) return mapsPromise;
  if (!config?.browserKey) return Promise.reject(new Error('Maps JavaScript API 尚未配置'));
  mapsPromise = new Promise((resolve, reject) => {
    const callbackName = `datePilotMapsReady_${Date.now()}`;
    globalThis[callbackName] = () => {
      delete globalThis[callbackName];
      resolve(globalThis.google.maps);
    };
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(config.browserKey)}&libraries=marker,geometry&v=weekly&loading=async&callback=${callbackName}`;
    script.onerror = () => {
      delete globalThis[callbackName];
      mapsPromise = null;
      reject(new Error('Google 地图加载失败'));
    };
    document.head.append(script);
  });
  return mapsPromise;
}

function loadBaiduMaps(config) {
  if (globalThis.BMapGL?.Map) return Promise.resolve(globalThis.BMapGL);
  if (baiduMapsPromise) return baiduMapsPromise;
  if (!config?.baiduBrowserAk) return Promise.reject(new Error('百度地图 JavaScript API 尚未配置'));
  baiduMapsPromise = new Promise((resolve, reject) => {
    const callbackName = `datePilotBaiduReady_${Date.now()}`;
    globalThis[callbackName] = () => {
      delete globalThis[callbackName];
      resolve(globalThis.BMapGL);
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://api.map.baidu.com/api?v=1.0&type=webgl&ak=${encodeURIComponent(config.baiduBrowserAk)}&callback=${callbackName}`;
    script.onerror = () => {
      delete globalThis[callbackName];
      baiduMapsPromise = null;
      reject(new Error('百度地图加载失败'));
    };
    document.head.append(script);
  });
  return baiduMapsPromise;
}

function outOfChina(latitude, longitude) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(x, y) {
  let result = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  result += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  result += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
  result += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
  return result;
}

function transformLongitude(x, y) {
  let result = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  result += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
  result += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
  result += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
  return result;
}

function wgs84ToGcj02(latitude, longitude) {
  if (outOfChina(latitude, longitude)) return { latitude, longitude };
  const axis = 6378245;
  const eccentricity = 0.006693421622965943;
  let latitudeDelta = transformLatitude(longitude - 105, latitude - 35);
  let longitudeDelta = transformLongitude(longitude - 105, latitude - 35);
  const radLat = latitude / 180 * Math.PI;
  let magic = Math.sin(radLat);
  magic = 1 - eccentricity * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  latitudeDelta = (latitudeDelta * 180) / ((axis * (1 - eccentricity)) / (magic * sqrtMagic) * Math.PI);
  longitudeDelta = (longitudeDelta * 180) / (axis / sqrtMagic * Math.cos(radLat) * Math.PI);
  return { latitude: latitude + latitudeDelta, longitude: longitude + longitudeDelta };
}

function gcj02ToWgs84(latitude, longitude) {
  const converted = wgs84ToGcj02(latitude, longitude);
  return { latitude: latitude * 2 - converted.latitude, longitude: longitude * 2 - converted.longitude };
}

function gcj02ToBd09(latitude, longitude) {
  const z = Math.sqrt(longitude * longitude + latitude * latitude) + 0.00002 * Math.sin(latitude * Math.PI * 3000 / 180);
  const theta = Math.atan2(latitude, longitude) + 0.000003 * Math.cos(longitude * Math.PI * 3000 / 180);
  return { latitude: z * Math.sin(theta) + 0.006, longitude: z * Math.cos(theta) + 0.0065 };
}

function bd09ToGcj02(latitude, longitude) {
  const x = longitude - 0.0065;
  const y = latitude - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI * 3000 / 180);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI * 3000 / 180);
  return { latitude: z * Math.sin(theta), longitude: z * Math.cos(theta) };
}

function pointForProvider(place, provider) {
  if (!place?.location) return null;
  const point = place.location;
  if (provider === 'baidu') {
    if (place.coordinateSystem === 'bd09') return point;
    const gcj = wgs84ToGcj02(point.latitude, point.longitude);
    return gcj02ToBd09(gcj.latitude, gcj.longitude);
  }
  if (place.coordinateSystem === 'bd09') {
    const gcj = bd09ToGcj02(point.latitude, point.longitude);
    return gcj02ToWgs84(gcj.latitude, gcj.longitude);
  }
  return point;
}

function osmProject(point, zoom) {
  const scale = 256 * 2 ** zoom;
  const sinLatitude = Math.sin(point.latitude * Math.PI / 180);
  return {
    x: (point.longitude + 180) / 360 * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale
  };
}

function searchCenterPoint(center, provider = 'osm') {
  if (!center || !Number.isFinite(Number(center.latitude)) || !Number.isFinite(Number(center.longitude))) return null;
  return pointForProvider({ location: { latitude: Number(center.latitude), longitude: Number(center.longitude) }, coordinateSystem: center.coordinateSystem || 'wgs84' }, provider);
}

function radiusBoundaryPoints(center, provider = 'osm') {
  const wgsCenter = searchCenterPoint(center, 'osm');
  const radiusKm = Math.max(0, Number(center?.radiusKm || 0));
  if (!wgsCenter || !radiusKm) return [];
  const latitudeDelta = radiusKm / 111.32;
  const longitudeDelta = radiusKm / (111.32 * Math.max(0.2, Math.cos(wgsCenter.latitude * Math.PI / 180)));
  const raw = [
    wgsCenter,
    { latitude: wgsCenter.latitude + latitudeDelta, longitude: wgsCenter.longitude },
    { latitude: wgsCenter.latitude, longitude: wgsCenter.longitude + longitudeDelta },
    { latitude: wgsCenter.latitude - latitudeDelta, longitude: wgsCenter.longitude },
    { latitude: wgsCenter.latitude, longitude: wgsCenter.longitude - longitudeDelta }
  ];
  if (provider === 'osm' || provider === 'google') return raw;
  return raw.map((point) => pointForProvider({ location: point, coordinateSystem: 'wgs84' }, provider));
}

function renderOsmMap(element, places, { route = false, interactive = false, selectedId = null, searchCenter = null } = {}) {
  const usable = places.map((place) => ({ place, point: pointForProvider(place, 'osm') })).filter((item) => item.point);
  const rangePoints = radiusBoundaryPoints(searchCenter, 'osm');
  const departurePoints = Object.entries(searchCenter?.departures || {})
    .filter(([, departure]) => validLocation(departure))
    .map(([guest, departure]) => ({ guest, point: pointForProvider({ location: departure, coordinateSystem: departure.coordinateSystem || 'wgs84' }, 'osm') }));
  if (!usable.length && !rangePoints.length && !departurePoints.length) return;
  const fitItems = [
    ...usable.map((item) => ({ ...item, kind: 'place' })),
    ...rangePoints.map((point, index) => ({ point, kind: index === 0 ? 'center' : 'range' })),
    ...departurePoints.map((item) => ({ ...item, kind: 'departure' }))
  ];
  const width = Math.max(280, element.clientWidth || 340);
  const height = Math.max(170, element.clientHeight || 190);
  let zoom = usable.length === 1 ? 15 : 14;
  let projected = [];
  for (; zoom >= 10; zoom -= 1) {
    projected = fitItems.map((item) => ({ ...item, pixel: osmProject(item.point, zoom) }));
    const xs = projected.map((item) => item.pixel.x);
    const ys = projected.map((item) => item.pixel.y);
    if (Math.max(...xs) - Math.min(...xs) <= width - 92 && Math.max(...ys) - Math.min(...ys) <= height - 82) break;
  }
  const center = {
    x: projected.reduce((sum, item) => sum + item.pixel.x, 0) / projected.length,
    y: projected.reduce((sum, item) => sum + item.pixel.y, 0) / projected.length
  };
  const origin = { x: center.x - width / 2, y: center.y - height / 2 };
  const firstTileX = Math.floor(origin.x / 256);
  const lastTileX = Math.floor((origin.x + width) / 256);
  const firstTileY = Math.floor(origin.y / 256);
  const lastTileY = Math.floor((origin.y + height) / 256);
  const maxTile = 2 ** zoom;
  const tiles = [];
  for (let tileY = firstTileY; tileY <= lastTileY; tileY += 1) {
    for (let tileX = firstTileX; tileX <= lastTileX; tileX += 1) {
      const wrappedX = ((tileX % maxTile) + maxTile) % maxTile;
      if (tileY < 0 || tileY >= maxTile) continue;
      tiles.push(`<img class="osm-tile" alt="" src="https://tile.openstreetmap.de/${zoom}/${wrappedX}/${tileY}.png" style="left:${tileX * 256 - origin.x}px;top:${tileY * 256 - origin.y}px"/>`);
    }
  }
  const localPoints = projected.map((item) => ({ ...item, x: item.pixel.x - origin.x, y: item.pixel.y - origin.y }));
  const placePoints = localPoints.filter((item) => item.kind === 'place');
  const centerPoint = localPoints.find((item) => item.kind === 'center');
  const boundaryPoints = localPoints.filter((item) => item.kind === 'range');
  const localDepartures = localPoints.filter((item) => item.kind === 'departure');
  const radiusPixels = centerPoint && boundaryPoints.length
    ? boundaryPoints.reduce((sum, point) => sum + Math.hypot(point.x - centerPoint.x, point.y - centerPoint.y), 0) / boundaryPoints.length
    : 0;
  const rangeCircle = centerPoint && radiusPixels
    ? `<span class="osm-search-radius" style="left:${centerPoint.x - radiusPixels}px;top:${centerPoint.y - radiusPixels}px;width:${radiusPixels * 2}px;height:${radiusPixels * 2}px"></span><span class="osm-search-center" style="left:${centerPoint.x}px;top:${centerPoint.y}px">中心</span>`
    : '';
  const line = route && placePoints.length > 1
    ? `<svg class="osm-route" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${placePoints.map((point) => `${point.x},${point.y}`).join(' ')}"/></svg>`
    : '';
  const markers = placePoints.map((item, index) => {
    const content = route ? index + 1 : index + 1;
    const className = `osm-marker${item.place.id === selectedId ? ' selected' : ''}`;
    if (interactive) return `<button class="${className}" type="button" data-action="map-select-place" data-id="${String(item.place.id || '').replaceAll('"', '&quot;')}" style="left:${item.x}px;top:${item.y}px" title="${String(item.place.name || '').replaceAll('"', '&quot;')}">${content}</button>`;
    return `<span class="${className}" style="left:${item.x}px;top:${item.y}px" title="${String(item.place.name || '').replaceAll('"', '&quot;')}">${content}</span>`;
  }).join('');
  const departureMarkers = localDepartures.map((item) => `<span class="osm-departure-marker ${item.guest}" style="left:${item.x}px;top:${item.y}px">${item.guest === 'partner' ? 'TA' : '你'}</span>`).join('');
  element.innerHTML = `<div class="osm-map-layer">${tiles.join('')}${rangeCircle}${line}${markers}${departureMarkers}<a class="osm-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div>`;
  element.dataset.ready = 'true';
}

function boundsForPoints(maps, points) {
  const bounds = new maps.LatLngBounds();
  points.forEach((point) => bounds.extend({ lat: point.latitude, lng: point.longitude }));
  return bounds;
}

export const mapService = {
  searchCenterForConditions(conditions) {
    return { ...areaSearchCenter(conditions?.area), radiusKm: Number(conditions?.distance || 6) };
  },
  meetingCenterForDepartures(departures, distance = 6) {
    const center = midpointForDepartures(departures);
    return center ? { ...center, radiusKm: Number(distance || 6) } : null;
  },
  async resolveSearchCenterForConditions(conditions, locationEnabled = true, departures = null) {
    const center = await resolveSearchCenter(conditions, locationEnabled, departures);
    return { ...center, radiusKm: Number(conditions?.distance || 6) };
  },
  withMeetingDistances(places, departures, center = null) {
    const resolvedCenter = center || midpointForDepartures(departures);
    return (places || []).map((place) => withMeetingDistance(place, departures, resolvedCenter));
  },
  meetingDistanceLabel(place) {
    if (place?.userDistanceKm != null && place?.partnerDistanceKm != null) {
      return `你 ${Number(place.userDistanceKm).toFixed(1)} km · TA ${Number(place.partnerDistanceKm).toFixed(1)} km`;
    }
    return `${Number(place?.distanceKm || 0).toFixed(1)} km`;
  },
  distanceFromCenter(place, center) {
    if (!place?.location || !center) return null;
    const point = pointForProvider(place, 'osm');
    const centerPoint = pointForProvider({ location: center, coordinateSystem: center.coordinateSystem }, 'osm');
    return haversineKm(centerPoint, point);
  },
  providerLabel(config) {
    return config?.mapProvider === 'baidu' ? '百度地图' : config?.mapProvider === 'google' ? 'Google Maps' : 'OpenStreetMap';
  },
  baiduMapUri(place) {
    if (place?.baiduMapsUri) return place.baiduMapsUri;
    if (place?.location) {
      const point = pointForProvider(place, 'baidu');
      return `https://api.map.baidu.com/marker?location=${point.latitude},${point.longitude}&title=${encodeURIComponent(place.name || '约会地点')}&content=${encodeURIComponent(place.address || '')}&output=html&src=Yuejian`;
    }
    const query = [place?.name, place?.address, '北京'].filter(Boolean).join(' ');
    return `https://map.baidu.com/search/${encodeURIComponent(query || '北京约会地点')}`;
  },
  externalMapUri(place) {
    return this.baiduMapUri(place);
  },
  baiduRouteUri(plan, mode = 'walking') {
    const stops = (plan?.stops || []).filter((stop) => stop?.location);
    if (!stops.length) return 'https://map.baidu.com/';
    if (stops.length === 1) return this.baiduMapUri(stops[0]);
    const origin = stops[0];
    const destination = stops.at(-1);
    const originPoint = pointForProvider(origin, 'baidu');
    const destinationPoint = pointForProvider(destination, 'baidu');
    const endpoint = (place, point) => `latlng:${point.latitude},${point.longitude}|name:${place.name || '约会地点'}`;
    const travelMode = ['driving', 'walking', 'riding', 'transit'].includes(mode) ? mode : 'walking';
    return `https://api.map.baidu.com/direction?origin=${encodeURIComponent(endpoint(origin, originPoint))}&destination=${encodeURIComponent(endpoint(destination, destinationPoint))}&mode=${travelMode}&region=${encodeURIComponent('北京')}&output=html&src=Yuejian`;
  },
  getRouteLabel(plan, route = null) {
    if (!plan?.stops?.length) return '暂无路线';
    if (route?.distanceMeters) {
      const km = (route.distanceMeters / 1000).toFixed(route.distanceMeters >= 10000 ? 0 : 1);
      const minutes = Math.max(1, Math.round(Number.parseFloat(route.duration || '0') / 60));
      return `${plan.stops[0].name} → ${plan.stops.at(-1).name} · ${km} km · 约 ${minutes} 分钟`;
    }
    return `${plan.stops[0].start} → ${plan.stops.at(-1).end} · ${plan.summary.transitLabel}`;
  },
  routeKey(plan) {
    return (plan?.stops || []).map((stop) => `${stop.id}:${stop.location?.latitude || ''}:${stop.location?.longitude || ''}`).join('|');
  },
  async computeRoute(plan) {
    const points = (plan?.stops || []).map((stop) => stop.location).filter(Boolean);
    if (points.length < 2) return null;
    const payload = await requestJson('/api/routes', {
      method: 'POST',
      body: JSON.stringify({ points, travelMode: 'WALK' })
    });
    return payload.route || null;
  },
  async renderPlaceMap(element, place, config) {
    if (!element || !place?.location || element.dataset.ready === 'true') return;
    if (config?.mapProvider === 'baidu' && config.baiduBrowserAk) {
      const BMapGL = await loadBaiduMaps(config);
      const point = pointForProvider(place, 'baidu');
      const center = new BMapGL.Point(point.longitude, point.latitude);
      const map = new BMapGL.Map(element);
      map.centerAndZoom(center, 15);
      map.enableScrollWheelZoom(true);
      map.addOverlay(new BMapGL.Marker(center, { title: place.name }));
      element.dataset.ready = 'true';
      return;
    }
    if (config?.mapProvider !== 'google' || !config.browserKey) {
      renderOsmMap(element, [place]);
      return;
    }
    const maps = await loadGoogleMaps(config);
    const point = pointForProvider(place, 'google');
    const center = { lat: point.latitude, lng: point.longitude };
    const map = new maps.Map(element, {
      center,
      zoom: 15,
      mapId: config.mapId || 'DEMO_MAP_ID',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'cooperative'
    });
    const { AdvancedMarkerElement } = await maps.importLibrary('marker');
    new AdvancedMarkerElement({ map, position: center, title: place.name });
    element.dataset.ready = 'true';
  },
  async renderBrowseMap(element, places, config, selectedId = null, searchCenter = null) {
    const usable = (places || []).filter((place) => place.location).slice(0, 30);
    const centerKey = searchCenter
      ? `${Number(searchCenter.latitude).toFixed(5)},${Number(searchCenter.longitude).toFixed(5)},${Number(searchCenter.radiusKm || 0).toFixed(1)}`
      : 'no-center';
    const key = `${config?.mapProvider || 'osm'}:${selectedId || ''}:${centerKey}:${usable.map((place) => `${place.id}:${place.distanceKm}`).join('|')}`;
    if (!element || (!usable.length && !searchCenter) || element.dataset.browseKey === key) return;
    element.innerHTML = '<div class="map-loading"><span class="spinner"></span>正在把筛选结果放到地图上</div>';
    if (config?.mapProvider === 'baidu' && config.baiduBrowserAk) {
      const BMapGL = await loadBaiduMaps(config);
      const points = usable.map((place) => {
        const point = pointForProvider(place, 'baidu');
        return { place, point: new BMapGL.Point(point.longitude, point.latitude) };
      });
      const center = searchCenterPoint(searchCenter, 'baidu');
      const centerPoint = center ? new BMapGL.Point(center.longitude, center.latitude) : null;
      const departureMapPoints = Object.entries(searchCenter?.departures || {})
        .filter(([, departure]) => validLocation(departure))
        .map(([guest, departure]) => {
          const point = pointForProvider({ location: departure, coordinateSystem: departure.coordinateSystem || 'wgs84' }, 'baidu');
          return { guest, point: new BMapGL.Point(point.longitude, point.latitude) };
        });
      const map = new BMapGL.Map(element);
      map.centerAndZoom(centerPoint || points[0].point, 12);
      map.enableScrollWheelZoom(true);
      if (centerPoint) {
        const radiusMeters = Math.max(1000, Number(searchCenter.radiusKm || 6) * 1000);
        map.addOverlay(new BMapGL.Circle(centerPoint, radiusMeters, {
          strokeColor: '#834432',
          strokeWeight: 2,
          strokeOpacity: 0.62,
          fillColor: '#cf795b',
          fillOpacity: 0.1
        }));
        const centerLabel = new BMapGL.Label('中心', { position: centerPoint, offset: new BMapGL.Size(-18, -18) });
        centerLabel.setStyle({ width: '36px', height: '36px', lineHeight: '34px', textAlign: 'center', borderRadius: '50%', color: '#fffaf5', background: '#263a31', border: '3px solid #ffe1ba', boxShadow: '0 6px 16px rgba(54,43,34,.28)', fontSize: '10px', fontWeight: '800' });
        map.addOverlay(centerLabel);
      }
      points.forEach(({ place, point }, index) => {
        const label = new BMapGL.Label(String(index + 1), { position: point, offset: new BMapGL.Size(-14, -14) });
        const active = place.id === selectedId;
        label.setStyle({ width: '28px', height: '28px', lineHeight: '26px', textAlign: 'center', borderRadius: '50%', color: '#fff', background: active ? '#263a31' : '#a94635', border: active ? '3px solid #ffd6a0' : '2px solid #fff', boxShadow: '0 4px 10px rgba(76,37,29,.25)', cursor: 'pointer' });
        label.addEventListener('click', () => element.dispatchEvent(new CustomEvent('map-place-select', { bubbles: true, detail: { placeId: place.id } })));
        map.addOverlay(label);
      });
      departureMapPoints.forEach(({ guest, point }) => {
        const label = new BMapGL.Label(guest === 'partner' ? 'TA' : '你', { position: point, offset: new BMapGL.Size(-16, -12) });
        label.setStyle({ minWidth: '32px', height: '24px', lineHeight: '22px', padding: '0 7px', textAlign: 'center', borderRadius: '12px', color: guest === 'partner' ? '#263a31' : '#fffaf5', background: guest === 'partner' ? '#efd7c5' : '#8f503c', border: '2px solid #fff', boxShadow: '0 5px 13px rgba(65,44,34,.24)', fontSize: '9px', fontWeight: '800' });
        map.addOverlay(label);
      });
      const rangePoints = radiusBoundaryPoints(searchCenter, 'baidu').map((point) => new BMapGL.Point(point.longitude, point.latitude));
      map.setViewport([...points.map((item) => item.point), ...rangePoints, ...departureMapPoints.map((item) => item.point)], { margins: [42, 42, 42, 42] });
      element.dataset.browseKey = key;
      return;
    }
    if (config?.mapProvider !== 'google' || !config.browserKey) {
      renderOsmMap(element, usable, { interactive: true, selectedId, searchCenter });
      element.dataset.browseKey = key;
      return;
    }
    const maps = await loadGoogleMaps(config);
    const points = usable.map((place) => ({ place, point: pointForProvider(place, 'google') })).filter((item) => item.point);
    const center = searchCenterPoint(searchCenter, 'google');
    const initialCenter = center || points[0].point;
    const map = new maps.Map(element, { center: { lat: initialCenter.latitude, lng: initialCenter.longitude }, zoom: 12, mapId: config.mapId || 'DEMO_MAP_ID', disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative' });
    const { AdvancedMarkerElement } = await maps.importLibrary('marker');
    if (center) {
      new maps.Circle({ map, center: { lat: center.latitude, lng: center.longitude }, radius: Math.max(1000, Number(searchCenter.radiusKm || 6) * 1000), strokeColor: '#9f4e3a', strokeOpacity: 0.78, strokeWeight: 2, fillColor: '#d88970', fillOpacity: 0.13 });
      const centerPin = document.createElement('span');
      centerPin.className = 'map-search-center-pin';
      centerPin.textContent = '中心';
      new AdvancedMarkerElement({ map, position: { lat: center.latitude, lng: center.longitude }, title: searchCenter.label || '范围中心', content: centerPin });
    }
    points.forEach(({ place, point }, index) => {
      const pin = document.createElement('button');
      pin.className = `map-pin browse${place.id === selectedId ? ' selected' : ''}`;
      pin.textContent = String(index + 1);
      const marker = new AdvancedMarkerElement({ map, position: { lat: point.latitude, lng: point.longitude }, title: place.name, content: pin });
      marker.addListener('click', () => element.dispatchEvent(new CustomEvent('map-place-select', { bubbles: true, detail: { placeId: place.id } })));
    });
    map.fitBounds(boundsForPoints(maps, [...points.map((item) => item.point), ...radiusBoundaryPoints(searchCenter, 'google')]), 42);
    element.dataset.browseKey = key;
  },
  async renderPlanMap(element, plan, route, config) {
    if (!element || element.dataset.routeKey === this.routeKey(plan)) return;
    const stopsWithPoints = (plan?.stops || []).map((stop) => ({ stop, point: pointForProvider(stop, 'google') })).filter((item) => item.point);
    const points = stopsWithPoints.map((item) => item.point);
    if (points.length < 2) return;
    if (config?.mapProvider === 'baidu' && config.baiduBrowserAk) {
      const BMapGL = await loadBaiduMaps(config);
      const stops = plan.stops.filter((stop) => stop.location);
      const mapPoints = stops.map((stop) => {
        const point = pointForProvider(stop, 'baidu');
        return new BMapGL.Point(point.longitude, point.latitude);
      });
      const map = new BMapGL.Map(element);
      map.centerAndZoom(mapPoints[0], 13);
      map.enableScrollWheelZoom(true);
      mapPoints.forEach((point, index) => {
        const label = new BMapGL.Label(String(index + 1), { position: point, offset: new BMapGL.Size(-13, -13) });
        label.setStyle({ width: '26px', height: '26px', lineHeight: '24px', textAlign: 'center', borderRadius: '50%', color: '#fff', background: '#a94635', border: '2px solid #fff', boxShadow: '0 4px 10px rgba(76,37,29,.25)' });
        map.addOverlay(label);
      });
      map.addOverlay(new BMapGL.Polyline(mapPoints, { strokeColor: '#b8563f', strokeWeight: 5, strokeOpacity: 0.9 }));
      map.setViewport(mapPoints, { margins: [42, 42, 42, 42] });
      element.dataset.routeKey = this.routeKey(plan);
      return;
    }
    if (config?.mapProvider !== 'google' || !config.browserKey) {
      renderOsmMap(element, plan.stops, { route: true });
      element.dataset.routeKey = this.routeKey(plan);
      return;
    }
    const maps = await loadGoogleMaps(config);
    const map = new maps.Map(element, {
      center: { lat: points[0].latitude, lng: points[0].longitude },
      zoom: 13,
      mapId: config.mapId || 'DEMO_MAP_ID',
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: 'cooperative'
    });
    const { AdvancedMarkerElement } = await maps.importLibrary('marker');
    stopsWithPoints.forEach(({ stop, point }, index) => {
      const pin = document.createElement('div');
      pin.className = 'map-pin';
      pin.textContent = String(index + 1);
      new AdvancedMarkerElement({
        map,
        position: { lat: point.latitude, lng: point.longitude },
        title: stop.name,
        content: pin
      });
    });
    if (route?.polyline?.encodedPolyline && maps.geometry?.encoding) {
      new maps.Polyline({
        map,
        path: maps.geometry.encoding.decodePath(route.polyline.encodedPolyline),
        strokeColor: '#b8563f',
        strokeOpacity: 0.9,
        strokeWeight: 5
      });
    }
    map.fitBounds(boundsForPoints(maps, points), 42);
    element.dataset.routeKey = this.routeKey(plan);
  }
};

const SHARE_PLATFORM_LABELS = Object.freeze({
  wechat: '微信',
  qq: 'QQ',
  xiaohongshu: '小红书',
  douyin: '抖音'
});

function planShareText(plan, platform = null) {
  const title = plan?.title || '约见方案';
  const schedule = (plan?.stops || []).map((stop) => `${stop.start}  ${stop.name}`).join('\n');
  const summary = plan?.summary ? `两人预算约 ¥${plan.summary.cost} · ${plan.summary.durationMin} 分钟` : '';
  const hashtags = ['xiaohongshu', 'douyin'].includes(platform) ? '\n#北京约会 #情侣约会 #约会灵感' : '';
  return `约见｜${title}\n${schedule}${summary ? `\n${summary}` : ''}${hashtags}`;
}

async function copyShareText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('copy_failed');
}

function roundedCanvasRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function canvasTextLines(ctx, text, maxWidth) {
  const chars = [...String(text || '')];
  const lines = [];
  let line = '';
  chars.forEach((char) => {
    const next = `${line}${char}`;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else line = next;
  });
  if (line) lines.push(line);
  return lines;
}

async function createPlanPosterBlob(plan) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1440;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  const background = ctx.createLinearGradient(0, 0, 1080, 1440);
  background.addColorStop(0, '#fff8ef');
  background.addColorStop(0.58, '#f4e3d5');
  background.addColorStop(1, '#e8c9b6');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1080, 1440);
  ctx.fillStyle = 'rgba(185, 104, 79, 0.12)';
  ctx.beginPath();
  ctx.arc(930, 145, 240, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(217, 161, 95, 0.14)';
  ctx.beginPath();
  ctx.arc(100, 1280, 285, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#8f4d3c';
  ctx.font = '800 34px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText('约见 · THIS TIME', 82, 105);
  ctx.fillStyle = '#3f2e28';
  ctx.font = '800 70px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  const titleLines = canvasTextLines(ctx, plan?.title || '约见方案', 900).slice(0, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, 82, 205 + index * 88));

  const cardTop = 360;
  roundedCanvasRect(ctx, 64, cardTop, 952, 810, 46);
  ctx.fillStyle = 'rgba(255, 253, 249, 0.9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(113, 58, 46, 0.10)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const stops = (plan?.stops || []).slice(0, 4);
  stops.forEach((stop, index) => {
    const y = cardTop + 92 + index * 165;
    ctx.fillStyle = index === 0 ? '#b9684f' : '#d9a15f';
    ctx.beginPath();
    ctx.arc(116, y - 10, 15, 0, Math.PI * 2);
    ctx.fill();
    if (index < stops.length - 1) {
      ctx.strokeStyle = 'rgba(185, 104, 79, 0.28)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(116, y + 12);
      ctx.lineTo(116, y + 143);
      ctx.stroke();
    }
    ctx.fillStyle = '#9a6b59';
    ctx.font = '700 30px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText(stop.start || '', 160, y);
    ctx.fillStyle = '#3f2e28';
    ctx.font = '800 42px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    const stopName = String(stop.name || '').slice(0, 18);
    ctx.fillText(stopName, 300, y);
    ctx.fillStyle = '#8a756a';
    ctx.font = '500 26px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
    ctx.fillText(`${stop.categoryLabel || '约会地点'} · ${stop.neighborhood || '北京'}`, 160, y + 48);
  });

  const summary = plan?.summary || {};
  const summaryText = `${stops.length} 站  ·  约 ¥${summary.cost || '--'}  ·  ${summary.durationMin || '--'} 分钟`;
  ctx.fillStyle = '#6b4c40';
  ctx.font = '700 31px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText(summaryText, 96, 1124);

  ctx.fillStyle = '#3f2e28';
  ctx.font = '800 34px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText('愿你们这次见面，不用想太多。', 82, 1295);
  ctx.fillStyle = '#8a756a';
  ctx.font = '500 25px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
  ctx.fillText('地点营业、票务与路线请在出发前再次确认', 82, 1346);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('poster_failed')), 'image/png', 0.94));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const shareService = {
  async copyPlanText(plan, platform = null) {
    await copyShareText(planShareText(plan, platform));
  },
  async savePlanPoster(plan) {
    const blob = await createPlanPosterBlob(plan);
    downloadBlob(blob, `约见-方案-${new Date().toISOString().slice(0, 10)}.png`);
  },
  async sharePlan(plan) {
    const text = planShareText(plan);
    if (navigator.share) {
      await navigator.share({ title: '约见方案', text });
      return 'shared';
    }
    await copyShareText(text);
    return 'copied';
  },
  async shareToPlatform(plan, platform) {
    const platformLabel = SHARE_PLATFORM_LABELS[platform] || '目标平台';
    const text = planShareText(plan, platform);
    const blob = await createPlanPosterBlob(plan);
    const file = typeof File === 'function' ? new File([blob], '约见-方案.png', { type: 'image/png' }) : null;
    if (navigator.share) {
      const canShareFile = Boolean(file && navigator.canShare?.({ files: [file] }));
      const shareData = canShareFile ? { title: '约见方案', text, files: [file] } : { title: '约见方案', text };
      await navigator.share(shareData);
      return { mode: 'shared', platformLabel };
    }
    await copyShareText(text);
    downloadBlob(blob, `约见-${platformLabel}-分享海报.png`);
    return { mode: 'prepared', platformLabel };
  },
  async shareInvite(code) {
    const text = `来“约见”和我一起规划：邀请码 ${code}`;
    if (navigator.share) {
      await navigator.share({ title: '加入约见', text });
      return 'shared';
    }
    await copyShareText(text);
    return 'copied';
  }
};

const MEMORY_MEDIA_DB = 'yuejian-memory-agent';
const MEMORY_MEDIA_STORE = 'media';

function openMemoryMediaDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('当前浏览器不支持本地媒体归档'));
    const request = indexedDB.open(MEMORY_MEDIA_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MEMORY_MEDIA_STORE)) {
        request.result.createObjectStore(MEMORY_MEDIA_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('媒体归档初始化失败'));
  });
}

async function runMemoryMediaTransaction(mode, operation) {
  const database = await openMemoryMediaDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEMORY_MEDIA_STORE, mode);
    const store = transaction.objectStore(MEMORY_MEDIA_STORE);
    let result;
    try { result = operation(store); } catch (error) { database.close(); reject(error); return; }
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(transaction.error || new Error('媒体归档失败')); };
    transaction.onabort = () => { database.close(); reject(transaction.error || new Error('媒体归档已取消')); };
  });
}

export const memoryMediaService = {
  async save(files, contributor = 'user') {
    const prepared = [...files].filter((file) => file?.type?.startsWith('image/') || file?.type?.startsWith('video/')).map((file) => ({
      id: `media-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
      blob: file,
      name: file.name || '未命名素材',
      type: file.type || 'application/octet-stream',
      size: Number(file.size || 0),
      contributor: contributor === 'partner' ? 'partner' : 'user',
      createdAt: new Date().toISOString()
    }));
    if (!prepared.length) return [];
    if (prepared.some((item) => item.size > 120 * 1024 * 1024)) throw new Error('单个视频请控制在 120 MB 以内');
    await runMemoryMediaTransaction('readwrite', (store) => prepared.forEach((item) => store.put(item)));
    return prepared.map(({ blob, ...metadata }) => metadata);
  },
  async objectUrl(id) {
    const database = await openMemoryMediaDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(MEMORY_MEDIA_STORE, 'readonly').objectStore(MEMORY_MEDIA_STORE).get(id);
      request.onsuccess = () => {
        const item = request.result;
        database.close();
        resolve(item?.blob ? { url: URL.createObjectURL(item.blob), type: item.type } : null);
      };
      request.onerror = () => { database.close(); reject(request.error || new Error('素材读取失败')); };
    });
  },
  async remove(id) {
    await runMemoryMediaTransaction('readwrite', (store) => store.delete(id));
  }
};

export const memoryAgentService = {
  summarize(input) {
    return requestJson('/api/agent/memory-summary', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }
};

export function downloadJson(filename, content) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

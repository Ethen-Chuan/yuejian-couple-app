import { places, sampleMemories } from './data.js?v=2.4.11';

export const STORAGE_KEY = 'datepilot-state-v1';

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

const GUEST_PROFILE_DEFAULTS = {
  user: {
    id: 'user',
    label: '我',
    name: '你',
    foodLikes: [],
    dietaryNeeds: [],
    activityLikes: [],
    activityAvoids: [],
    socialPace: '',
    conversationStyle: '',
    energyLevel: '',
    planningPriority: '',
    budgetStyle: '',
    transportPreference: '',
    timePreference: '',
    favoriteAreas: [],
    occasionPreferences: [],
    accessibilityNotes: '',
    notes: '',
    updatedAt: null
  },
  partner: {
    id: 'partner',
    label: '伴侣',
    name: 'TA',
    foodLikes: [],
    dietaryNeeds: [],
    activityLikes: [],
    activityAvoids: [],
    socialPace: '',
    conversationStyle: '',
    energyLevel: '',
    planningPriority: '',
    budgetStyle: '',
    transportPreference: '',
    timePreference: '',
    favoriteAreas: [],
    occasionPreferences: [],
    accessibilityNotes: '',
    notes: '',
    updatedAt: null
  }
};

function normalizeTextList(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

function moodForTheme(theme, fallback = '安静聊聊') {
  const value = String(theme || '').trim();
  if (/(晚餐|餐厅|火锅|日料|烤鸭|西餐|中餐)/.test(value)) return '认真吃饭';
  if (/(音乐|演出|黑胶|Live|K歌|酒吧)/i.test(value)) return '听点音乐';
  if (/(看展|展览|电影|戏剧|脱口秀|博物馆|美术馆)/.test(value)) return '看点东西';
  if (/(咖啡|甜品|冰淇淋|书店)/.test(value)) return '松弛一点';
  if (/(散步|日落|公园|夜骑|街区|户外|陶艺|银饰|手作|烘焙|桌游|密室|保龄球|台球|街机)/.test(value)) return '随性一点';
  return fallback;
}

function normalizeGuestProfile(value, fallback) {
  const guest = { ...fallback, ...(value || {}) };
  return {
    ...guest,
    id: fallback.id,
    label: fallback.label,
    name: String(guest.name || fallback.name).trim().slice(0, 20) || fallback.name,
    foodLikes: normalizeTextList(guest.foodLikes),
    dietaryNeeds: normalizeTextList(guest.dietaryNeeds, 6),
    activityLikes: normalizeTextList(guest.activityLikes),
    activityAvoids: normalizeTextList(guest.activityAvoids),
    socialPace: String(guest.socialPace || '').trim().slice(0, 24),
    conversationStyle: String(guest.conversationStyle || '').trim().slice(0, 24),
    energyLevel: String(guest.energyLevel || '').trim().slice(0, 24),
    planningPriority: String(guest.planningPriority || '').trim().slice(0, 30),
    budgetStyle: String(guest.budgetStyle || '').trim().slice(0, 24),
    transportPreference: String(guest.transportPreference || '').trim().slice(0, 24),
    timePreference: String(guest.timePreference || '').trim().slice(0, 24),
    favoriteAreas: normalizeTextList(guest.favoriteAreas, 6),
    occasionPreferences: normalizeTextList(guest.occasionPreferences, 5),
    accessibilityNotes: String(guest.accessibilityNotes || '').trim().slice(0, 160),
    notes: String(guest.notes || '').trim().slice(0, 240),
    updatedAt: guest.updatedAt || null
  };
}

function normalizeDepartureLocation(value) {
  if (!value || !Number.isFinite(Number(value.latitude)) || !Number.isFinite(Number(value.longitude))) return null;
  return {
    latitude: Number(Number(value.latitude).toFixed(6)),
    longitude: Number(Number(value.longitude).toFixed(6)),
    label: String(value.label || '已设置出发位置').trim().slice(0, 60) || '已设置出发位置',
    source: ['current', 'search', 'manual', 'shared'].includes(value.source) ? value.source : 'manual',
    coordinateSystem: value.coordinateSystem === 'bd09' ? 'bd09' : 'wgs84',
    updatedAt: value.updatedAt || new Date().toISOString()
  };
}

function refreshDemoPlan(plan) {
  if (!plan?.stops?.length || plan.stops.some((stop) => ['google', 'baidu'].includes(stop.source))) return plan;
  return {
    ...plan,
    stops: plan.stops.map((stop) => {
      const latest = places.find((place) => place.id === stop.id);
      if (!latest) return stop;
      return {
        ...stop,
        ...latest,
        stopId: stop.stopId,
        start: stop.start,
        end: stop.end,
        matchScore: stop.matchScore
      };
    })
  };
}

function refreshMemoryMedia(memories = [], includeMissingSamples = false) {
  const latestSamples = new Map(sampleMemories.map((memory) => [memory.id, memory]));
  const legacyText = {
    'memory-summer-sunset': {
      title: ['第一次一起看完日落'],
      favorite: ['天台日落时刻']
    },
    'memory-river-walk': {
      title: ['雨后的咖啡馆'],
      favorite: ['Slow Cup']
    },
    'memory-last-minute': {
      title: ['临时决定的晚餐'],
      favorite: ['Morrow Bistro']
    }
  };
  const mediaFields = ['image', 'sceneImage', 'sceneImageSourceLabel', 'sceneImageSourceUrl', 'photoVerified', 'imageKind', 'photoSourceLabel', 'photoSourceUrl', 'photoAttributions', 'source', 'category', 'categoryLabel'];
  const refreshed = (Array.isArray(memories) ? memories : []).map((memory) => {
    const latest = latestSamples.get(memory.id);
    if (!latest) return memory;
    const migrated = { ...memory };
    mediaFields.forEach((field) => { migrated[field] = clone(latest[field]); });
    const oldText = legacyText[memory.id] || {};
    for (const field of ['title', 'favorite']) {
      if (!migrated[field] || oldText[field]?.includes(migrated[field])) migrated[field] = latest[field];
    }
    migrated.visibility = memory.visibility || latest.visibility;
    return migrated;
  });
  if (includeMissingSamples) {
    const existingIds = new Set(refreshed.map((memory) => memory.id));
    sampleMemories.forEach((memory) => {
      if (!existingIds.has(memory.id)) refreshed.push(clone(memory));
    });
  }
  return refreshed;
}

export function createInitialState() {
  return {
    schemaVersion: 9,
    onboarding: {
      completed: false,
      step: 0,
      path: null,
      inviteCode: null
    },
    conditions: {
      budget: 500,
      distance: 6,
      duration: 3,
      mood: '安静聊聊',
      centerMode: 'area',
      area: '北京东城区附近',
      indoorOnly: false,
      dietary: []
    },
    meeting: {
      departures: {
        user: null,
        partner: null
      },
      locationStatus: {
        user: 'idle',
        partner: 'idle'
      },
      strategy: 'balanced'
    },
    conversation: {
      step: 0,
      answers: [],
      theme: null,
      themeTitle: null,
      bucketItemId: null,
      preferredPlaceIds: [],
      status: 'idle'
    },
    account: {
      status: 'loading',
      user: null,
      error: null,
      syncStatus: 'idle',
      lastSyncedAt: null
    },
    agent: {
      status: 'idle',
      provider: 'local',
      mode: 'local',
      ideas: [],
      error: null,
      batch: 0
    },
    places: {
      mode: 'demo',
      status: 'idle',
      items: [],
      error: null,
      lastUpdated: null,
      detailStatus: {}
    },
    maps: {
      config: {
        mapsEnabled: true,
        placesEnabled: false,
        routesEnabled: false,
        browserKey: null,
        baiduBrowserAk: null,
        mapId: 'DEMO_MAP_ID',
        mapProvider: 'osm',
        placesProvider: 'demo',
        mode: 'demo'
      },
      searchCenter: null,
      route: {
        status: 'idle',
        key: null,
        data: null,
        error: null
      }
    },
    weather: {
      status: 'idle',
      data: null,
      error: null,
      lastUpdated: null
    },
    currentPlan: null,
    previousPlan: null,
    memories: refreshMemoryMedia(clone(sampleMemories)),
    profile: {
      userName: '你',
      partnerName: 'TA',
      connected: false,
      guests: clone(GUEST_PROFILE_DEFAULTS),
      sharedPreferences: [],
      differences: {
        user: '',
        partner: ''
      },
      tonightOnly: [],
      correction: null
    },
    settings: {
      proactivity: 'ask',
      optionStyle: 'three',
      reminders: true,
      memoryEnabled: true,
      usePrivateConversation: false,
      locationEnabled: true,
      photoAccess: false,
      autoBooking: false
    },
    wrapup: {
      feeling: '很喜欢',
      favoritePlaceId: null,
      more: '安静聊天',
      less: '通勤',
      note: '',
      visibility: 'couple',
      feedbackSubmittedAt: null,
      savedToMemory: false
    },
    memoryAgent: {
      media: [],
      summaries: [],
      remindersEnabled: true
    },
    coupleList: {
      savedIds: [],
      completedIds: []
    },
    ui: {
      modal: null,
      toast: null,
      memoryQuery: '',
      memoryFilter: 'all',
      discoverFilter: 'all',
      mapCategory: 'all',
      mapSelectedId: null,
      mediaContributor: 'user',
      memoryAgentStatus: 'idle',
      planPresenceStatus: 'idle',
      onboardingConsent: false
    }
  };
}

function mergeState(base, saved) {
  if (!saved || Number(saved.schemaVersion || 1) > base.schemaVersion) return base;
  const savedSchemaVersion = Number(saved.schemaVersion || 1);
  const hidesLegacyRealName = Number(saved.schemaVersion || 1) < 2;
  const { community: _legacyCommunity, ...savedWithoutCommunity } = saved;
  const { communityFilter: _legacyCommunityFilter, communityScope: _legacyCommunityScope, ...savedUi } = saved.ui || {};
  const savedPlanUsesLivePlaces = saved.currentPlan?.stops?.some((stop) => ['google', 'baidu'].includes(stop.source));
  const savedPlanUsesLegacyPlaces = saved.currentPlan?.stops?.some((stop) => !places.some((place) => place.id === stop.id));
  const savedArea = String(saved.conditions?.area || '');
  const shouldMigrateArea = !/(北京|东城|西城|朝阳|海淀|三里屯|鼓楼|亮马河|国贸|望京|前门)/.test(savedArea);
  const savedConversation = { ...base.conversation, ...saved.conversation };
  const migratedConversation = savedSchemaVersion < 7 && savedConversation.theme
    ? {
        ...savedConversation,
        step: Math.max(1, Number(savedConversation.step) || 0),
        answers: [String(savedConversation.theme), ...(Array.isArray(savedConversation.answers) ? savedConversation.answers.slice(1) : [])]
      }
    : savedConversation;
  return {
    ...base,
    ...savedWithoutCommunity,
    schemaVersion: base.schemaVersion,
    onboarding: {
      ...base.onboarding,
      ...saved.onboarding,
      path: saved.onboarding?.path ? 'invite' : null
    },
    conditions: {
      ...base.conditions,
      ...saved.conditions,
      duration: Math.round(Math.max(1, Math.min(6, Number(saved.conditions?.duration) || base.conditions.duration)) * 12) / 12,
      ...(migratedConversation.theme ? { mood: moodForTheme(migratedConversation.theme, saved.conditions?.mood || base.conditions.mood) } : {}),
      ...(shouldMigrateArea ? { area: base.conditions.area } : {})
    },
    meeting: {
      ...base.meeting,
      ...saved.meeting,
      departures: {
        user: normalizeDepartureLocation(saved.meeting?.departures?.user),
        partner: normalizeDepartureLocation(saved.meeting?.departures?.partner)
      },
      locationStatus: { ...base.meeting.locationStatus }
    },
    conversation: migratedConversation,
    account: { ...base.account },
    agent: { ...base.agent, ...saved.agent, status: 'idle', error: null },
    places: {
      ...base.places,
      ...saved.places,
      mode: 'demo',
      status: 'idle',
      items: [],
      detailStatus: {}
    },
    maps: {
      ...base.maps,
      ...saved.maps,
      config: { ...base.maps.config, ...saved.maps?.config, browserKey: null, baiduBrowserAk: null },
      route: { ...base.maps.route }
    },
    weather: { ...base.weather },
    currentPlan: savedPlanUsesLivePlaces || savedPlanUsesLegacyPlaces ? null : refreshDemoPlan(saved.currentPlan),
    previousPlan: savedPlanUsesLivePlaces || savedPlanUsesLegacyPlaces ? null : refreshDemoPlan(saved.previousPlan),
    memories: refreshMemoryMedia(saved.memories || base.memories, savedSchemaVersion < 5),
    profile: {
      ...base.profile,
      ...saved.profile,
      userName: hidesLegacyRealName ? base.profile.userName : (saved.profile?.userName || base.profile.userName),
      guests: {
        user: normalizeGuestProfile(hidesLegacyRealName ? { ...saved.profile?.guests?.user, name: base.profile.guests.user.name } : saved.profile?.guests?.user, base.profile.guests.user),
        partner: normalizeGuestProfile(saved.profile?.guests?.partner, base.profile.guests.partner)
      },
      differences: { ...base.profile.differences, ...saved.profile?.differences }
    },
    settings: { ...base.settings, ...saved.settings },
    wrapup: { ...base.wrapup, ...saved.wrapup },
    memoryAgent: {
      ...base.memoryAgent,
      ...saved.memoryAgent,
      media: Array.isArray(saved.memoryAgent?.media) ? saved.memoryAgent.media : [],
      summaries: Array.isArray(saved.memoryAgent?.summaries) ? saved.memoryAgent.summaries : []
    },
    coupleList: {
      savedIds: normalizeTextList(saved.coupleList?.savedIds, 100),
      completedIds: normalizeTextList(saved.coupleList?.completedIds, 100)
    },
    ui: { ...base.ui, ...savedUi, modal: null, toast: null }
  };
}

function readStorage(storage) {
  if (!storage) return null;
  try {
    return JSON.parse(storage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStorage(storage, state) {
  if (!storage) return;
  try {
    const persistable = makePersistableState(state);
    storage.setItem(STORAGE_KEY, JSON.stringify(persistable));
  } catch {
    // The application remains usable when private mode or storage quota blocks persistence.
  }
}

function makePersistableState(state) {
    const persistable = clone(state);
    persistable.account = { status: 'signed_out', user: null, error: null, syncStatus: 'idle', lastSyncedAt: null };
    persistable.agent = { ...persistable.agent, status: 'idle', error: null };
    persistable.places = {
      ...persistable.places,
      mode: 'demo',
      status: 'idle',
      items: [],
      detailStatus: {}
    };
    persistable.maps = {
      ...persistable.maps,
      config: { ...persistable.maps.config, browserKey: null, baiduBrowserAk: null },
      searchCenter: null,
      route: { status: 'idle', key: null, data: null, error: null }
    };
    persistable.weather = { status: 'idle', data: null, error: null, lastUpdated: null };
    if (persistable.currentPlan?.stops?.some((stop) => ['google', 'baidu'].includes(stop.source))) {
      persistable.currentPlan = null;
      persistable.previousPlan = null;
    }
    return persistable;
}

export function createStore(storage = globalThis.localStorage) {
  let state = mergeState(createInitialState(), readStorage(storage));
  const listeners = new Set();

  function commit(recipe) {
    const next = recipe(clone(state));
    state = next || state;
    writeStorage(storage, state);
    listeners.forEach((listener) => listener(state));
    return state;
  }

  const actions = {
    setOnboardingStep(step) {
      return commit((draft) => {
        draft.onboarding.step = Math.max(0, Math.min(3, Number(step)));
        return draft;
      });
    },
    chooseOnboardingPath() {
      return commit((draft) => {
        draft.onboarding.path = 'invite';
        draft.onboarding.step = 1;
        draft.ui.onboardingConsent = false;
        if (!draft.onboarding.inviteCode) {
          draft.onboarding.inviteCode = `DATE-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        }
        return draft;
      });
    },
    completeOnboarding() {
      return commit((draft) => {
        draft.onboarding.completed = true;
        draft.onboarding.step = 3;
        draft.ui.onboardingConsent = false;
        return draft;
      });
    },
    setDepartureStatus(guest, status) {
      return commit((draft) => {
        const key = guest === 'partner' ? 'partner' : 'user';
        draft.meeting.locationStatus[key] = ['idle', 'locating', 'searching', 'error'].includes(status) ? status : 'idle';
        return draft;
      });
    },
    setDepartureLocation(guest, location) {
      return commit((draft) => {
        const key = guest === 'partner' ? 'partner' : 'user';
        draft.meeting.departures[key] = normalizeDepartureLocation(location);
        draft.meeting.locationStatus[key] = 'idle';
        draft.maps.searchCenter = null;
        draft.maps.route = { status: 'idle', key: null, data: null, error: null };
        draft.places = { ...draft.places, mode: 'demo', status: 'idle', items: [], error: null };
        return draft;
      });
    },
    clearDepartureLocation(guest) {
      return commit((draft) => {
        const key = guest === 'partner' ? 'partner' : 'user';
        draft.meeting.departures[key] = null;
        draft.meeting.locationStatus[key] = 'idle';
        draft.maps.searchCenter = null;
        return draft;
      });
    },
    updateConditions(patch) {
      return commit((draft) => {
        const centerChanged = Object.prototype.hasOwnProperty.call(patch, 'area')
          || Object.prototype.hasOwnProperty.call(patch, 'centerMode');
        draft.conditions = { ...draft.conditions, ...patch };
        if (centerChanged) draft.maps.searchCenter = null;
        else if (Object.prototype.hasOwnProperty.call(patch, 'distance') && draft.maps.searchCenter) {
          draft.maps.searchCenter.radiusKm = Number(draft.conditions.distance || 6);
        }
        return draft;
      });
    },
    toggleDietary(item) {
      return commit((draft) => {
        const values = new Set(draft.conditions.dietary);
        values.has(item) ? values.delete(item) : values.add(item);
        draft.conditions.dietary = [...values];
        return draft;
      });
    },
    setTheme(theme, title = null, bucketItemId = null) {
      return commit((draft) => {
        const selectedTheme = String(theme || '').trim() || null;
        draft.conversation.theme = selectedTheme;
        draft.conversation.themeTitle = selectedTheme ? (title || selectedTheme) : null;
        draft.conversation.bucketItemId = selectedTheme ? (String(bucketItemId || '').trim() || null) : null;
        draft.conversation.step = selectedTheme ? 1 : 0;
        draft.conversation.answers = selectedTheme ? [selectedTheme] : [];
        draft.conversation.preferredPlaceIds = [];
        draft.conversation.status = 'idle';
        if (selectedTheme) draft.conditions.mood = moodForTheme(selectedTheme, draft.conditions.mood);
        return draft;
      });
    },
    resetConversation() {
      return commit((draft) => {
        draft.conversation = {
          ...draft.conversation,
          step: 0,
          answers: [],
          theme: null,
          themeTitle: null,
          bucketItemId: null,
          preferredPlaceIds: [],
          status: 'idle'
        };
        return draft;
      });
    },
    answerConversation(answer, conditionPatch = null) {
      return commit((draft) => {
        const step = Math.max(0, Math.min(2, Number(draft.conversation.step) || 0));
        draft.conversation.answers = [...draft.conversation.answers.slice(0, step), String(answer)];
        draft.conversation.step = Math.min(3, step + 1);
        if (conditionPatch) draft.conditions = { ...draft.conditions, ...conditionPatch };
        return draft;
      });
    },
    setConversationStep(step) {
      return commit((draft) => {
        const maxAvailable = Math.min(2, draft.conversation.answers.length);
        draft.conversation.step = Math.max(0, Math.min(maxAvailable, Number(step) || 0));
        draft.conversation.status = 'idle';
        return draft;
      });
    },
    setConversationStatus(status) {
      return commit((draft) => {
        draft.conversation.status = status;
        return draft;
      });
    },
    togglePreferredPlace(id) {
      return commit((draft) => {
        const values = new Set(draft.conversation.preferredPlaceIds || []);
        values.has(id) ? values.delete(id) : values.add(id);
        draft.conversation.preferredPlaceIds = [...values].slice(-6);
        draft.ui.mapSelectedId = id;
        return draft;
      });
    },
    setAccount(status, user = null, error = null) {
      return commit((draft) => {
        const realName = String(user?.displayName || '').trim();
        const privateUser = user ? { ...user, displayName: '个人账号', email: '已验证邮箱' } : null;
        draft.account = { ...draft.account, status, user: privateUser, error };
        if (realName && draft.profile.guests?.user?.name === realName) {
          draft.profile.userName = '你';
          draft.profile.guests.user.name = '你';
        }
        return draft;
      });
    },
    setSyncStatus(syncStatus, lastSyncedAt = null) {
      return commit((draft) => {
        draft.account.syncStatus = syncStatus;
        if (lastSyncedAt) draft.account.lastSyncedAt = lastSyncedAt;
        return draft;
      });
    },
    applyRemoteState(remoteState) {
      return commit((draft) => {
        const merged = mergeState(createInitialState(), remoteState);
        merged.account = draft.account;
        merged.maps.config = draft.maps.config;
        merged.maps.searchCenter = draft.maps.searchCenter;
        merged.maps.route = draft.maps.route;
        merged.weather = draft.weather;
        merged.places = draft.places;
        merged.ui.modal = draft.ui.modal;
        merged.ui.toast = draft.ui.toast;
        return merged;
      });
    },
    setAgentStatus(status, error = null) {
      return commit((draft) => {
        draft.agent.status = status;
        draft.agent.error = error;
        return draft;
      });
    },
    setAgentIdeas(ideas, provider = 'local', mode = 'local') {
      return commit((draft) => {
        draft.agent.status = 'ready';
        draft.agent.provider = provider;
        draft.agent.mode = mode;
        draft.agent.ideas = Array.isArray(ideas) ? ideas : [];
        draft.agent.error = null;
        draft.agent.batch += 1;
        return draft;
      });
    },
    setMapExplorer(patch) {
      return commit((draft) => {
        if (Object.prototype.hasOwnProperty.call(patch, 'category')) draft.ui.mapCategory = patch.category;
        if (Object.prototype.hasOwnProperty.call(patch, 'selectedId')) draft.ui.mapSelectedId = patch.selectedId;
        return draft;
      });
    },
    setCurrentPlan(plan) {
      return commit((draft) => {
        draft.currentPlan = plan;
        draft.previousPlan = null;
        draft.conversation.status = 'complete';
        draft.maps.route = { status: 'idle', key: null, data: null, error: null };
        return draft;
      });
    },
    changePlan(nextPlan) {
      return commit((draft) => {
        draft.previousPlan = draft.currentPlan;
        draft.currentPlan = nextPlan;
        draft.maps.route = { status: 'idle', key: null, data: null, error: null };
        return draft;
      });
    },
    undoPlan() {
      return commit((draft) => {
        if (!draft.previousPlan) return draft;
        const current = draft.currentPlan;
        draft.currentPlan = draft.previousPlan;
        draft.previousPlan = current;
        draft.maps.route = { status: 'idle', key: null, data: null, error: null };
        return draft;
      });
    },
    setMapsConfig(config) {
      return commit((draft) => {
        draft.maps.config = { ...draft.maps.config, ...config };
        return draft;
      });
    },
    setSearchCenter(searchCenter) {
      return commit((draft) => {
        draft.maps.searchCenter = searchCenter ? { ...searchCenter } : null;
        return draft;
      });
    },
    setPlaceSearchStatus(status, error = null) {
      return commit((draft) => {
        draft.places.status = status;
        draft.places.error = error;
        return draft;
      });
    },
    setLivePlaces(items) {
      return commit((draft) => {
        draft.places.mode = 'live';
        draft.places.status = 'ready';
        draft.places.items = items;
        draft.places.error = null;
        draft.places.lastUpdated = new Date().toISOString();
        return draft;
      });
    },
    useDemoPlaces(error = null) {
      return commit((draft) => {
        draft.places.mode = 'demo';
        draft.places.status = error ? 'fallback' : 'idle';
        draft.places.error = error;
        return draft;
      });
    },
    setPlaceDetailStatus(id, status) {
      return commit((draft) => {
        draft.places.detailStatus[id] = status;
        return draft;
      });
    },
    mergePlaceDetail(id, detail) {
      return commit((draft) => {
        draft.places.items = draft.places.items.map((place) => place.id === id ? { ...place, ...detail } : place);
        if (draft.currentPlan?.stops) {
          draft.currentPlan.stops = draft.currentPlan.stops.map((stop) => stop.id === id ? { ...stop, ...detail } : stop);
        }
        draft.places.detailStatus[id] = 'ready';
        return draft;
      });
    },
    setRouteStatus(status, key, data = null, error = null) {
      return commit((draft) => {
        draft.maps.route = { status, key, data, error };
        return draft;
      });
    },
    setWeatherStatus(status, data = null, error = null) {
      return commit((draft) => {
        draft.weather = {
          status,
          data,
          error,
          lastUpdated: status === 'ready' ? new Date().toISOString() : draft.weather.lastUpdated
        };
        return draft;
      });
    },
    acceptPlan() {
      return commit((draft) => {
        if (draft.currentPlan) draft.currentPlan.accepted = true;
        draft.ui.planPresenceStatus = 'idle';
        return draft;
      });
    },
    completePlanStop(stopId) {
      return commit((draft) => {
        if (!draft.currentPlan?.stops?.length) return draft;
        const completedAt = new Date().toISOString();
        draft.currentPlan.stops = draft.currentPlan.stops.map((stop) => stop.stopId === stopId
          ? { ...stop, completedAt }
          : stop);
        return draft;
      });
    },
    recordPlanArrival(stopId, details = {}) {
      return commit((draft) => {
        if (!draft.currentPlan?.stops?.length) return draft;
        const arrivedAt = new Date().toISOString();
        let matched = false;
        draft.currentPlan.stops = draft.currentPlan.stops.map((stop) => {
          if (stop.stopId !== stopId || stop.arrivedAt || stop.completedAt) return stop;
          matched = true;
          return {
            ...stop,
            arrivedAt,
            arrivalDistanceMeters: Math.max(0, Math.round(Number(details.distanceMeters) || 0)),
            arrivalAccuracyMeters: Math.max(0, Math.round(Number(details.accuracyMeters) || 0)),
            arrivalSource: 'device-location'
          };
        });
        if (!matched) return draft;
        draft.ui.planPresenceStatus = 'watching';
        if (draft.currentPlan.bucketItemId && draft.currentPlan.bucketCoreStopId === stopId) {
          const completed = new Set(draft.coupleList.completedIds || []);
          completed.add(draft.currentPlan.bucketItemId);
          draft.coupleList.completedIds = [...completed].slice(-100);
          draft.coupleList.savedIds = (draft.coupleList.savedIds || []).filter((id) => id !== draft.currentPlan.bucketItemId);
        }
        return draft;
      });
    },
    completePlan() {
      return commit((draft) => {
        if (draft.currentPlan) draft.currentPlan.completed = true;
        if (draft.currentPlan?.stops?.length && !draft.wrapup.favoritePlaceId) {
          draft.wrapup.favoritePlaceId = draft.currentPlan.stops[0].id;
        }
        return draft;
      });
    },
    updateWrapup(patch) {
      return commit((draft) => {
        draft.wrapup = { ...draft.wrapup, ...patch };
        return draft;
      });
    },
    addMemory(memory) {
      return commit((draft) => {
        if (memory.confirmed) draft.memories.unshift(memory);
        return draft;
      });
    },
    updateMemory(id, patch) {
      return commit((draft) => {
        draft.memories = draft.memories.map((memory) => memory.id === id ? { ...memory, ...patch } : memory);
        return draft;
      });
    },
    deleteMemory(id) {
      return commit((draft) => {
        draft.memories = draft.memories.filter((memory) => memory.id !== id);
        return draft;
      });
    },
    addMemoryMedia(items) {
      return commit((draft) => {
        const existing = new Set(draft.memoryAgent.media.map((item) => item.id));
        draft.memoryAgent.media.push(...(items || []).filter((item) => item?.id && !existing.has(item.id)));
        return draft;
      });
    },
    removeMemoryMedia(id) {
      return commit((draft) => {
        draft.memoryAgent.media = draft.memoryAgent.media.filter((item) => item.id !== id);
        return draft;
      });
    },
    addMemoryAgentSummary(summary) {
      return commit((draft) => {
        if (summary?.id) draft.memoryAgent.summaries.unshift(summary);
        return draft;
      });
    },
    setMemoryAgentReminders(enabled) {
      return commit((draft) => {
        draft.memoryAgent.remindersEnabled = Boolean(enabled);
        return draft;
      });
    },
    toggleCoupleListSaved(id) {
      return commit((draft) => {
        const itemId = String(id || '').trim();
        if (!itemId || draft.coupleList.completedIds.includes(itemId)) return draft;
        const saved = new Set(draft.coupleList.savedIds || []);
        saved.has(itemId) ? saved.delete(itemId) : saved.add(itemId);
        draft.coupleList.savedIds = [...saved].slice(-100);
        return draft;
      });
    },
    saveCoupleListItem(id) {
      return commit((draft) => {
        const itemId = String(id || '').trim();
        if (!itemId || draft.coupleList.completedIds.includes(itemId)) return draft;
        draft.coupleList.savedIds = [...new Set([...(draft.coupleList.savedIds || []), itemId])].slice(-100);
        return draft;
      });
    },
    updateProfile(patch) {
      return commit((draft) => {
        draft.profile = { ...draft.profile, ...patch };
        return draft;
      });
    },
    updateGuestProfile(guestId, patch) {
      return commit((draft) => {
        const key = guestId === 'partner' ? 'partner' : 'user';
        const current = draft.profile.guests?.[key] || GUEST_PROFILE_DEFAULTS[key];
        draft.profile.guests = {
          ...draft.profile.guests,
          [key]: normalizeGuestProfile({ ...current, ...patch, updatedAt: new Date().toISOString() }, GUEST_PROFILE_DEFAULTS[key])
        };
        if (key === 'user') draft.profile.userName = draft.profile.guests.user.name;
        if (key === 'partner') draft.profile.partnerName = draft.profile.guests.partner.name;
        return draft;
      });
    },
    updateSetting(key, value) {
      return commit((draft) => {
        if (Object.prototype.hasOwnProperty.call(draft.settings, key)) draft.settings[key] = value;
        return draft;
      });
    },
    setUI(patch) {
      return commit((draft) => {
        draft.ui = { ...draft.ui, ...patch };
        return draft;
      });
    },
    resetAll() {
      return commit((draft) => {
        const fresh = createInitialState();
        fresh.account = draft.account;
        fresh.maps.config = draft.maps.config;
        fresh.weather = draft.weather;
        return fresh;
      });
    }
  };

  return {
    getState: () => clone(state),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
    exportData() {
      const exportable = clone(state);
      delete exportable.ui;
      return JSON.stringify({ exportedAt: new Date().toISOString(), data: exportable }, null, 2);
    },
    getSyncPayload() {
      const persistable = makePersistableState(state);
      delete persistable.account;
      return persistable;
    }
  };
}

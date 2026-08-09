export const MOOD_OPTIONS = Object.freeze([
  {
    value: '安静聊聊',
    label: '聊天为主',
    description: '安静、能久坐，主要想认真聊聊'
  },
  {
    value: '认真吃饭',
    label: '吃饭为主',
    description: '餐厅和菜品最重要，留足用餐时间'
  },
  {
    value: '看点东西',
    label: '看展 / 电影',
    description: '想有一个可以一起看的内容'
  },
  {
    value: '听点音乐',
    label: '音乐 / 演出',
    description: '黑胶、Livehouse 或小型现场'
  },
  {
    value: '随性一点',
    label: '散步闲逛',
    description: '不赶行程，沿街区或夜景边走边聊'
  },
  {
    value: '松弛一点',
    label: '咖啡 / 甜品',
    description: '找家舒服的店坐坐，顺便吃点甜的'
  }
]);

const moodMeta = new Map(MOOD_OPTIONS.map((option) => [option.value, option]));

export const MOOD_VALUES = Object.freeze(MOOD_OPTIONS.map((option) => option.value));

export function moodLabel(value) {
  return moodMeta.get(value)?.label || value || '还没选择';
}

export function moodDescription(value) {
  return moodMeta.get(value)?.description || '';
}

export function moodSliderOptions() {
  return MOOD_OPTIONS.map(({ value, label, description }) => [value, label, description]);
}

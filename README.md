# 约见 Yuejian

> 面向固定情侣共同使用的约会规划与回忆应用：从双方位置出发，找到更公平的见面地点，把灵感变成共同经历，再由 Memory Agent 整理成两个人的生活档案。

「约见」不是一个以完成任务、手动打卡为中心的约会清单，也不是面向陌生人的匹配产品。它服务于一段稳定关系中的“我、伴侣和我们”：帮助两个人更轻松地决定去哪里、做什么，并尽量自然地保存共同经历。

本仓库是可独立运行的完整版本，包含移动端 PWA、账号系统、Node.js API、SQLite 数据存储、地图与天气适配，以及 Docker 部署配置。运行时不依赖原低代码平台或统一登录服务。

## 产品理念

- **属于两个人，而不是“嘉宾列表”**：产品语言统一使用“我 / 伴侣 / 我们”，避免社交匹配或多人约会产品的歧义。
- **先尊重活动意图，再扩大搜索范围**：选择密室、陶艺或看展后，系统会优先保持活动类型，只逐步扩大距离和区域，不会用无关餐厅或散步方案代替。
- **公平不等于机械取中点**：推荐同时考虑双方距离、最远一方的通勤成本和距离差，让见面地点更均衡。
- **减少打卡感**：到达活动地点附近后，由前台定位进行轻量识别；用户不需要为了“完成任务”反复点按钮。
- **回忆服务于未来**：照片、视频和当日感受不仅被保存，也能形成日结、摘要和纪念日提醒。

## 核心功能

### 1. 双方位置与公平会面范围

- 分别获取“我”和“伴侣”的当前位置，也支持输入北京街区或地址；
- 根据两点计算会面中心、双方直线距离、最远距离与距离差；
- 在推荐卡片中展示双方各自的大致距离；
- 将“少通勤”作为可学习偏好，而不是只按单方位置排序；
- 定位不可用时，可回退到用户输入的街区中心。

### 2. 活动主题硬约束与自动扩圈

用户选择某个活动后，规划器会先在当前半径寻找同类地点。如果数量不足，则按预设半径逐步扩圈，并继续保持活动主题；只有用户主动更换活动时，才会切换到其他类型。

这套逻辑适用于密室、陶艺、银饰、烘焙、桌游、保龄球、台球、KTV、街机、电影、脱口秀、看展、夜骑、书店、咖啡、甜品等活动页，而不是某一个页面的特殊判断。

### 3. 情侣一起完成的 100 件事

“灵感”被设计为情侣共同生活的长期清单，而非一次性的随机推荐：

- 浏览不同氛围、预算、时长和场景的共同体验；
- 收藏想一起做的事情；
- 将灵感带入约会规划流程；
- 在真实到达后记录完成状态；
- 后续可结合回忆内容形成属于两个人的专属版本。

### 4. 地图自动到达识别

对于具有可验证坐标的地点，应用可在页面处于前台时读取设备位置。当两个人实际来到目标附近，且定位精度满足条件时，系统记录本次到达，并同步更新相关清单。

当前原型根据地点与定位精度采用约 **180–280 米**的识别范围。它不是持续后台追踪：浏览器关闭、页面进入后台或用户拒绝定位权限后，不会继续获取位置。正式发布前应在隐私政策中清楚说明用途、保存字段和撤回方式。

### 5. Memory Agent

Memory Agent 用于整理一次活动产生的照片、视频与文字，而不是和“保存为 Memory”互相冲突：

- 双方可上传本次活动的照片和视频；
- 将媒体、地点、日期和活动信息归入同一段共同经历；
- 生成日结、摘要和适合回看的短标题；
- 保存为可检索的 Memory；
- 在未来相近日期提供“去年今日”式提醒；
- 支持继续使用已保存的 Memory 改进后续推荐。

独立版当前通过本地规则生成规划、灵感与回忆摘要；外部大模型配置仅作后续接入预留，详见“能力边界”。

### 6. 情侣偏好与状态同步

- 邮箱密码注册、登录和退出；
- 保存两个人的称呼、饮食限制、偏好与活动状态；
- 同步方案、收藏、100 件事进度、Memory 和 Agent 运行记录；
- 使用服务端 SQLite 持久化，不依赖浏览器单机数据才能工作。

### 7. 天气、地图与真实地点

- 使用 Open-Meteo 获取天气信息；
- 配置百度地图 AK 后，支持真实地点搜索、地址解析、地点详情和浏览器端 WebGL 地图；
- 未配置百度地图时，自动降级为 OpenStreetMap 地图与内置北京地点数据；
- 地点卡片区分真实商家、活动灵感和示意坐标，避免把素材图误认为具体门店实景；
- 出发前仍需确认营业时间、票务、价格、预约和实时交通情况。

## 页面导览

| 页面 | 路由 | 作用 |
| --- | --- | --- |
| 品牌封面 | `#/welcome` | 介绍产品定位并进入情侣共同体验 |
| 初次设置 | `#/onboarding` | 建立双方信息、定位和基础偏好 |
| 约会对话 | `#/conversation` | 选择活动、时间、预算、氛围与约束 |
| 方案详情 | `#/plan` | 查看行程、地点、距离、地图与到达状态 |
| 100 件事 | `#/discover` | 浏览、收藏并开始情侣共同体验 |
| Memory Agent | `#/memory-agent` | 上传媒体、生成摘要、管理纪念提醒 |
| 我们的资料 | `#/profile` | 管理情侣信息、偏好、账号与隐私设置 |

## 技术架构

```text
移动端浏览器 / PWA
        │
        ├── 原生 HTML + CSS + ES Modules
        ├── Service Worker 离线缓存
        └── 浏览器定位与地图展示
        │
Node.js 22 独立服务
        ├── 静态资源托管
        ├── 邮箱密码认证与 HttpOnly Cookie
        ├── 规划 / 灵感 / Memory API
        ├── 百度地图与 Open-Meteo 适配
        └── SQLite 数据库
```

主要技术选择：

- **前端**：原生 JavaScript ES Modules、响应式 CSS、PWA；
- **后端**：Node.js 内置 HTTP 服务与 `node:sqlite`；
- **数据**：SQLite WAL 模式；
- **认证**：scrypt 密码摘要、随机会话令牌、HttpOnly + SameSite Cookie；
- **地图**：百度地图优先，OpenStreetMap 与内置数据降级；
- **天气**：Open-Meteo；
- **部署**：Docker / Docker Compose。

当前前端缓存版本为 `2.4.11`，客户端数据 Schema 为 `9`，独立后端版本为 `2.0.0-independent`。

## 工程目录

```text
.
├── client/public/legacy/
│   ├── index.html                 # PWA 入口
│   ├── manifest.webmanifest       # 应用清单
│   ├── sw.js                      # 离线缓存
│   ├── src/
│   │   ├── app.js                 # 页面与交互
│   │   ├── data.js                # 地点、灵感与示例数据
│   │   ├── domain.js              # 推荐、排序与扩圈逻辑
│   │   ├── services.js            # API、地图、天气和定位服务
│   │   ├── store.js               # 客户端状态与迁移
│   │   └── styles.css             # 全局视觉系统
│   └── assets/                    # 图片、图标与来源说明
├── standalone/
│   ├── server.mjs                 # Node.js API 与静态服务
│   └── package.json
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## 快速开始

### 方式一：本地运行

需要 Node.js `22.13.0` 或更高版本。项目没有第三方运行时依赖，因此无需安装 npm 包。

```bash
cd standalone
npm start
```

打开 `http://127.0.0.1:8788`。

本地数据库默认创建在 `standalone/data/yuejian.sqlite`。该目录已被 Git 忽略。

如果需要临时配置百度地图，可在启动命令前设置环境变量，或使用 Node.js 的 `--env-file` 参数并将本地 `DATA_DIR` 设置为合适的可写目录。

### 方式二：Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
```

打开 `http://服务器地址:8080`。

数据库保存在 Docker 数据卷 `yuejian-data`，容器更新或重启不会删除数据。

查看运行状态：

```bash
docker compose ps
docker compose logs -f yuejian
```

停止服务：

```bash
docker compose down
```

不要使用 `docker compose down -v`，除非确认要同时删除数据库卷。

### 方式三：直接构建 Docker 镜像

```bash
docker build -t yuejian .
docker run -d \
  --name yuejian \
  --restart unless-stopped \
  -p 8080:8080 \
  -v yuejian-data:/data \
  yuejian
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` / `SERVER_PORT` | `8788` | 服务监听端口；Docker 镜像内为 `8080` |
| `HOST` / `SERVER_HOST` | `0.0.0.0` | 服务监听地址 |
| `DATA_DIR` | `standalone/data` | SQLite 数据目录；Docker 中为 `/data` |
| `SQLITE_PATH` | `<DATA_DIR>/yuejian.sqlite` | 可选的数据库完整路径 |
| `SESSION_DAYS` | `30` | 登录会话有效天数，最小为 1 |
| `BAIDU_MAP_SERVER_AK` | 空 | 服务端地点检索、地址解析和地点详情 AK |
| `BAIDU_MAP_BROWSER_AK` | 空 | 浏览器端百度 WebGL 地图 AK |
| `BAIDU_MAP_AK` | 空 | 兼容变量，可同时作为服务端和浏览器端 AK |
| `DEEPSEEK_API_KEY` | 空 | 预留；当前 Agent 接口不会调用外部模型 |
| `DEEPSEEK_MODEL` | 空 | 预留的模型名称 |
| `OPENAI_API_KEY` | 空 | 预留；当前 Agent 接口不会调用外部模型 |
| `OPENAI_MODEL` | 空 | 预留的模型名称 |

不要将真实 `.env`、地图 AK、模型密钥或数据库文件提交到 Git。仓库根目录的 `.gitignore` 已覆盖这些内容，但生产环境仍应使用云平台密钥管理或受控环境变量。

## 地图降级策略

| 配置状态 | 地图底图 | 地点搜索 | 地址解析 | 地点详情 |
| --- | --- | --- | --- | --- |
| 两个百度 AK 均配置 | 百度 WebGL | 百度地图 | 百度地图 | 百度地图 |
| 仅服务端 AK | OpenStreetMap | 百度地图 | 百度地图 | 百度地图 |
| 仅浏览器 AK | 百度 WebGL | 内置北京数据 | 有限回退 | 内置数据 |
| 未配置 AK | OpenStreetMap | 内置北京数据 | 街区中心回退 | 内置数据 |

实时路线服务当前尚未接入，`POST /api/routes` 会返回 `ROUTES_NOT_CONFIGURED`，界面保留跳转百度地图查看路线的入口。

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 服务、数据库与版本健康检查 |
| `GET` | `/api/config` | 返回地图、地点和 Agent 能力状态 |
| `GET` | `/api/auth/me` | 获取当前账号 |
| `POST` | `/api/auth/register` | 邮箱密码注册 |
| `POST` | `/api/auth/login` | 登录并设置会话 Cookie |
| `POST` | `/api/auth/logout` | 退出并清除会话 |
| `GET` | `/api/account/state` | 获取当前用户的应用状态 |
| `PUT` | `/api/account/state` | 保存偏好、方案、清单和 Memory 状态 |
| `PUT` | `/api/account/profile` | 修改账号显示名称 |
| `DELETE` | `/api/account` | 删除当前账号关联数据 |
| `POST` | `/api/agent/plan` | 使用本地规划器生成约会方案 |
| `POST` | `/api/agent/memory-summary` | 使用本地逻辑生成回忆摘要 |
| `POST` | `/api/agent/inspirations` | 使用本地灵感库生成建议 |
| `GET` | `/api/weather` | 获取 Open-Meteo 天气数据 |
| `POST` | `/api/places/search` | 百度地点搜索 |
| `POST` | `/api/maps/geocode` | 百度地址解析 |
| `GET` | `/api/places/:id` | 百度地点详情 |
| `POST` | `/api/routes` | 预留实时路线接口，当前未配置 |

需要账号的数据接口使用 HttpOnly Cookie 会话。应用状态单次同步上限为 1 MB。

## 数据、隐私与备份

SQLite 数据库可能包含账号邮箱、双方称呼、偏好、计划、回忆摘要、媒体元数据和 Agent 请求记录，因此必须被视为私人数据。

- 本地默认数据库：`standalone/data/yuejian.sqlite`；
- Docker 默认数据库：数据卷中的 `/data/yuejian.sqlite`；
- SQLite 使用 WAL 模式，备份时应同时考虑 `.sqlite-wal` 与 `.sqlite-shm`，或先安全停止写入；
- 数据库、日志和 `.env` 已被根目录 `.gitignore` 排除；
- Cookie 在 HTTPS 或受信反向代理传入 `X-Forwarded-Proto: https` 时自动添加 `Secure`；
- 正式上线必须配置 HTTPS，并提供隐私政策、定位授权说明、账号删除与数据导出流程；
- SQLite 适合单实例和中小规模部署，多实例或高并发场景应迁移至 PostgreSQL/MySQL。

建议备份 Docker 数据卷：

```bash
docker run --rm \
  -v yuejian-data:/data \
  -v "$PWD":/backup \
  alpine tar czf /backup/yuejian-data-backup.tgz -C /data .
```

备份文件同样包含私人数据，不应上传到代码仓库。

## 健康检查

```text
GET /api/health
```

示例响应：

```json
{
  "status": "ok",
  "version": "2.0.0-independent",
  "database": "sqlite",
  "platform": "standalone"
}
```

Docker 镜像已内置健康检查，每 30 秒请求一次该接口。

## 能力边界

- 当前 `/api/agent/plan`、`/api/agent/memory-summary` 和 `/api/agent/inspirations` 均使用本地规则、数据和模板；
- `DEEPSEEK_*` 与 `OPENAI_*` 仅用于后续外部模型接入时的配置预留，现阶段不会产生模型 API 调用；
- 浏览器端定位是前台轻量识别，不是 iOS/Android 原生后台地理围栏；
- 地点距离目前主要用于筛选与公平性估算，不等同于实时公共交通耗时；
- 示例地点、活动场景和价格可能随时间变化，不能替代商家确认；
- Memory 媒体上传在当前原型中侧重交互与元数据流程，生产化还需要对象存储、缩略图、转码、容量限制和内容安全策略。

## 生产部署建议

1. 使用 Nginx、Caddy 或云负载均衡提供 HTTPS；
2. 将反向代理指向容器 `8080` 端口；
3. 挂载持久化存储到 `/data`；
4. 保持单实例运行，或先迁移数据库；
5. 将地图 AK 限制到指定域名、IP 和允许调用的 API；
6. 设置定期加密备份与恢复演练；
7. 添加速率限制、登录失败保护、CSRF 策略和安全响应头；
8. 接入正式媒体存储后，再开放大规模照片和视频上传；
9. 发布前复核第三方图片、地图数据和品牌素材的授权范围。

## 图片、图标与第三方内容

完整图片来源、许可证和使用边界见：

`client/public/legacy/assets/ATTRIBUTION.md`

界面图标来自 Lucide，许可证文本保存在：

`client/public/legacy/assets/icons/LUCIDE-LICENSE.txt`

部分北京餐厅、品牌与场馆图片仅用于**私人产品原型中的地点识别和设计评估**，权利归原权利人所有。未经进一步授权，不应将这些素材用于公开商业发布、营销或再分发。因此建议本仓库保持为 **Private**。

## Roadmap

- 接入真实公共交通路线与通勤时间；
- 为双方建立邀请、绑定和共同编辑机制；
- 将 Memory 媒体迁移到对象存储并支持视频转码；
- 完成“去年今日”和纪念日通知服务；
- 在用户明确授权后，让历史 Memory 参与个性化推荐；
- 接入可审计的外部模型调用、成本控制和隐私脱敏；
- 增加数据导出、账号完整删除和隐私中心；
- 完善自动化测试、无障碍和多城市地点数据。

## 仓库说明

这是一个仍在迭代中的私人产品原型。仓库目前不附带开源许可证；除第三方素材各自许可证明确授予的权利外，项目代码与产品内容默认保留所有权利。

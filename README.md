# Chiyoda Twin · 千代田区城市运行数字孪生

基于日本国土交通省 PLATEAU 三维城市模型的 WebGIS 作品。它把东京千代田区 12,558 栋建筑、都营地铁实时列车、共享单车供需、气象观测和浸水想定放进同一个三维场景里，并配了总览面板。

技术栈：Vue 3 + Vite + TypeScript + CesiumJS 1.146 + Pinia + ECharts。后端是零依赖的 Node.js 脚本，前端只认相对路径，所以全部数据都通过后端提供。

## 一、怎么运行

需要 Node.js 18 以上（在命令行输入 `node -v` 查看版本）。

最简单的方式是双击 `start.bat`。它会在第一次运行时自动安装依赖、构建前端，然后启动后端并打开浏览器。

手动运行的步骤：

```bash
cd web
npm install        # 安装前端依赖（只需一次）
npm run build      # 构建前端，产物在 web/dist
cd ..
node server/server.mjs
# 浏览器打开 http://localhost:8787
```

开发时如果想改代码立即看到效果，开两个命令行窗口。第一个运行 `node server/server.mjs`，第二个在 `web` 目录运行 `npm run dev`，然后打开 http://localhost:5173 。Vite 会把 `/api`、`/plateau` 等请求转发给 8787 端口的后端。

本机需要走代理才能访问日本接口时，启动后端前先设置：

```bat
set NODE_USE_ENV_PROXY=1
set HTTPS_PROXY=http://127.0.0.1:7897
node server\server.mjs
```

电脑显卡较弱、页面卡顿或白屏时，打开 http://localhost:8787/?lite 。轻量模式用 LOD1 白模代替带纹理的 LOD2 模型，显存占用约为原来的五分之一，并关闭抗锯齿。

## 二、成果功能

顶栏可以切换四种工作模式，左侧面板随模式变化。在三维场景里点击建筑、列车、车站、单车站或航班，右侧面板都会显示它的详情。顶栏常驻东京时间和当前气温、湿度、风速。

| 模式 | 功能 | 说明 | 用到的数据 |
|---|---|---|---|
| 运行 | 地铁运行总览 | 都营 6 条线的在线列车数、区间行驶数、延误 ≥ 1 分钟的列车数，以及每条线的运行状态（正常运行或延误公告） | ODPT 列车位置、运行信息 |
| 运行 | 列车三维孪生 | 列车沿真实轨道平滑移动；点击列车显示车次、种别、开往、延误分钟，可开启“镜头跟随” | ODPT 列车位置 + OSM 轨道几何 + 预处理线路里程 |
| 运行 | 底部线路条 | 仿车厢 LCD 线路图，把一条线拉直显示，车站是刻度、列车是圆点，能看出发车间隔和延误位置 | 同上 |
| 运行 | 共享单车供需 | 千代田区周边约 268 个站点，每站一根立柱：柱高 = 可借车数，颜色 = 在桩率；面板给出可借车总数、平均在桩率、无车站点数 | docomo bike share GBFS |
| 运行 | 单车历史回放 | 后端每 5 分钟存一份快照，拖动滑块回看最近 24 小时 | 后端自存快照 |
| 运行 | 叠加实时图层 | 都营巴士位置、降雨临近预报、AMeDAS 风向与气温、东京上空航班（带高度） | ODPT GTFS-RT、气象厅、OpenSky |
| 建筑 | 建筑着色 | 真实纹理、按高度（6 档）、按用途三种方案 | PLATEAU 建筑模型 |
| 建筑 | 底图切换 | 航拍影像 / 浅色地图 | PLATEAU 航拍影像、浅色底图 |
| 建筑 | 建筑统计 | 全区 12,558 栋的高度分布、用途构成、最高的 5 栋 | 预处理的 buildings_stats.json |
| 建筑 | 建筑属性查询 | 点击建筑查看名称、用途、实测高度、地上地下层数、地址、耐火构造、用途地域、容积率、建蔽率、调查年份、各场景想定浸水深 | PLATEAU 建筑属性 |
| 防灾 | 浸水想定 | 5 个场景：荒川 L1/L2、神田川 L2、隅田川・新河岸川 L2、东京都高潮；显示按深度抬升的浸水面，建筑按想定浸水深着色 | PLATEAU 洪水 / 高潮浸水想定区域 |
| 防灾 | 受影响建筑统计 | 拖动浸水深阈值（如 0.5 m 约及膝），实时统计受影响建筑数、占比、各深度档栋数 | 建筑属性中的浸水深字段 |
| 分析 | 日照阴影 | 选冬至、春分、夏至、今天或任意日期，拖动东京时间 6:00–18:00，Cesium 按太阳位置投射建筑阴影 | 建筑模型 + 地形 |
| 分析 | 地上地下一体化 | 地表变半透明，显示东京站丸之内一带的地下街（橙色） | PLATEAU 地下街 LOD4 |
| 分析 | 预设视角 | 回到初始视角、俯瞰皇居、秋叶原 | — |

## 三、数据类型及来源

数据分两种获取方式。静态数据已经下载到 `data/` 目录，运行时不用联网；实时数据由后端代理请求上游接口，并缓存起来。地形和影像瓦片第一次访问时联网下载，之后从 `data/tilecache/` 读取。

### 3.1 三维城市模型（本地，PLATEAU 千代田区 2025 年度）

格式都是 3D Tiles 1.0（`tileset.json` + `.b3dm` 瓦片，几何用 Draco 压缩），高度基准是椭球高。原始数据是 CityGML，PLATEAU 官方已转换成 3D Tiles 发布。

| 目录 | 数据 | 细节等级 | 大小 | 本作品中的用途 |
|---|---|---|---|---|
| `bldg_lod2` | 建筑物模型（带屋顶形状和纹理） | LOD2 | 397 MB | 默认建筑图层 |
| `bldg_lod1` | 建筑物模型（白模） | LOD1 | 86 MB | 轻量模式 `?lite` 的建筑图层 |
| `brid_lod2` | 桥梁模型 | LOD2 | 40 MB | 常驻显示 |
| `wtr_lod1` | 水部模型（皇居护城河、神田川等） | LOD1 | 7.6 MB | 常驻显示 |
| `ubld_lod4` | 地下街模型 | LOD4 | 7.6 MB | 分析模式的地上地下一体化 |
| `fld_arakawa_l1` / `fld_arakawa_l2` | 荒川流域洪水浸水想定区域 | — | 0.6 / 3.6 MB | 防灾模式 |
| `fld_kanda_l2` | 神田川流域洪水浸水想定区域 | — | 25 MB | 防灾模式 |
| `fld_sumida_l2` | 隅田川・新河岸川流域洪水浸水想定区域 | — | 20 MB | 防灾模式 |
| `htd` | 东京都高潮浸水想定区域 | — | 48 MB | 防灾模式 |
| `tran_lod3` | 道路模型 | LOD3 | 60 MB | 已下载，当前版本未加载 |
| `veg_cover_lod3` | 植被覆盖模型 | LOD3 | 16 MB | 已下载，当前版本未加载 |

建筑瓦片的 Batch Table 里带有 PLATEAU 属性。本作品用到的字段有：`gml:name`（名称）、`bldg:usage`（用途）、`bldg:measuredHeight`（实测高度）、`bldg:storeysAboveGround` / `bldg:storeysBelowGround`（地上 / 地下层数）、`bldg:address`（地址），以及 `uro:BuildingDetailAttribute_…` 下的耐火构造、用途地域、指定容积率、指定建蔽率、调查年份，还有各流域的想定浸水深。浸水想定区域瓦片用 `uro:rank` 表示浸水深等级。L1 表示计划规模降雨，L2 表示想定最大规模降雨。

来源：国土交通省 Project PLATEAU，G 空间情报中心 https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2025 ；数据目录 API https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets 。

### 3.2 地形与底图（联网获取，带磁盘缓存）

| 数据 | 格式 | 来源 | 上游地址 |
|---|---|---|---|
| PLATEAU-Terrain 地形 | Cesium quantized-mesh（`layer.json` + `.terrain`），椭球高 | 国土交通省 PLATEAU | https://tile.plateauview.mlit.go.jp/terrain/ |
| 航拍正射影像（2024） | XYZ 栅格瓦片 PNG，最高 19 级 | 国土交通省 PLATEAU | https://tile.plateauview.mlit.go.jp/tiles/plateau-ortho-2024/ |
| 浅色底图 | XYZ 栅格瓦片 PNG | PLATEAU VIEW（由国土地理院矢量瓦片渲染） | https://tile.plateauview.mlit.go.jp/tiles/light-map/ |
| 淡色地图 | XYZ 栅格瓦片 PNG，2–18 级，航拍影像范围外的兜底底图 | 国土地理院 | https://cyberjapandata.gsi.go.jp/xyz/pale/ |

### 3.3 交通实时数据（联网，后端代理）

| 数据 | 格式 | 更新频率 | 后端缓存 | 来源与接口 |
|---|---|---|---|---|
| 都营地铁列车位置 | JSON-LD（`odpt:Train`），给出“从 A 站开往 B 站”、车次、种别、延误秒数，不含经纬度 | 约 30 秒 | 15 秒 | ODPT 公共交通开放数据中心 `https://api-public.odpt.org/api/v4/odpt:Train?odpt:operator=odpt.Operator:Toei` |
| 都营运行信息 | JSON-LD（`odpt:TrainInformation`），延误公告文字 | 有变化时 | 60 秒 | ODPT 同上，`odpt:TrainInformation` |
| 都营巴士位置 | GTFS-Realtime（protobuf 二进制），含经纬度 | 约 15–30 秒 | 20 秒 | ODPT `https://api-public.odpt.org/api/v4/gtfs/realtime/ToeiBus` |
| 共享单车站点状态 | GBFS JSON（`station_status`），每站可借车数、空桩数 | 约 1 分钟 | 55 秒 | docomo bike share，经 ODPT 发布 `https://api-public.odpt.org/api/v4/gbfs/docomo-cycle-tokyo/station_status.json` |
| 东京上空航班 | JSON（OpenSky state vectors），经纬度、气压高度、航向、速度、呼号 | 约 10 秒 | 匿名 4 分钟，有密钥 20 秒 | The OpenSky Network `https://opensky-network.org/api/states/all` |

### 3.4 气象数据（联网，后端代理）

| 数据 | 格式 | 更新频率 | 来源与接口 |
|---|---|---|---|
| AMeDAS 地面观测 | JSON，各站气温、湿度、风向风速、降水量、气压 | 10 分钟 | 气象厅 `https://www.jma.go.jp/bosai/amedas/data/map/{时刻}.json` |
| 高解像度降水临近预报 | XYZ 栅格瓦片 PNG，1 km 网格 | 5 分钟 | 气象厅 `https://www.jma.go.jp/bosai/jmatile/data/nowc/…/surf/hrpns/{z}/{x}/{y}.png` |
| 天气（备用） | JSON，模型计算的当前气温、湿度、风 | 15 分钟 | Open-Meteo `https://api.open-meteo.com/v1/forecast`，AMeDAS 请求失败时才使用 |

### 3.5 静态参考数据（本地，`data/raw/`）

这些文件在 2026-10-29 下载，用于预处理和站点匹配。

| 文件 | 内容 | 格式 | 来源 |
|---|---|---|---|
| `osm_toei_routes.json` | 都营各线路的轨道几何（route relation 及其成员 way） | Overpass API JSON | © OpenStreetMap contributors，经 Overpass API 查询 |
| `odpt_railway_toei.json` | 都营各线路的站序、线路色、线路编号 | JSON-LD（`odpt:Railway`） | ODPT |
| `odpt_station_toei.json` | 都营车站的经纬度、站名（日 / 英）、站号 | JSON-LD（`odpt:Station`） | ODPT |
| `odpt_traintype_toei.json` | 列车种别名称（普通、急行、エアポート快特等） | JSON-LD（`odpt:TrainType`） | ODPT |
| `gbfs_station_information.json` | 共享单车站点位置、名称、容量 | GBFS JSON（`station_information`） | docomo bike share，经 ODPT |
| `jma_amedastable.json` | AMeDAS 观测站表（位置、站名） | JSON | 气象厅 |

### 3.6 预处理与运行时生成的数据

| 文件 | 内容 | 怎么生成 |
|---|---|---|
| `data/derived/lines.json` | 6 条线的轨道折线、全长，以及每个车站距线路起点的里程（米） | `tools/build_lines.py`，输入 OSM 轨道 + ODPT 线路和车站 |
| `data/derived/buildings_stats.json` | 全区建筑的高度分布、用途构成、最高建筑、各浸水场景的深度列表 | `tools/build_stats.py`，直接读取本地 b3dm 的 Batch Table |
| `data/history/bike-日期.jsonl` | 单车站点可借车数快照，一行一份 | 后端运行时每 5 分钟写入 |
| `data/tilecache/` | 地形和影像瓦片的磁盘缓存 | 后端运行时自动写入 |

## 四、目录结构

```
chiyoda-twin/
├─ start.bat                  一键启动
├─ server/server.mjs          后端（零依赖）
├─ tools/
│  ├─ build_lines.py          生成线路里程数据 lines.json
│  └─ build_stats.py          从 b3dm 读出建筑属性，生成统计 buildings_stats.json
├─ data/
│  ├─ plateau/                PLATEAU 3D Tiles（已下载解压，约 700 MB）
│  │   bldg_lod1 / bldg_lod2  建筑白模 / 带纹理建筑
│  │   brid_lod2  tran_lod3   桥梁 / 道路
│  │   ubld_lod4              地下街
│  │   veg_cover_lod3 wtr_lod1 植被 / 水面
│  │   fld_* htd              洪水 / 高潮浸水想定区域
│  ├─ raw/                    原始数据快照（ODPT 车站与线路、GBFS 站点、OSM 轨道、AMeDAS 站表）
│  ├─ derived/                预处理结果（lines.json、buildings_stats.json）
│  ├─ tilecache/              运行后自动生成：地形和影像瓦片的磁盘缓存
│  └─ history/                运行后自动生成：单车历史快照，每天一个 bike-日期.jsonl
└─ web/                       前端
   ├─ vite.config.ts          构建配置（拷贝 Cesium 静态资源、开发代理）
   └─ src/
      ├─ config/city.ts       城市配置：初始视角、范围、瓦片地址。换城市主要改这里
      ├─ adapters/            数据适配层：把各数据源统一成 types.ts 里的类型
      ├─ scene/               Cesium 场景：viewer.ts 底座，layers/ 各业务图层，manager.ts 组装与拾取
      ├─ stores/twin.ts       Pinia 全局状态（只放数据和界面开关，不放 Cesium 对象）
      ├─ components/          Vue 界面组件
      └─ App.vue              把状态同步到 Cesium 图层的“桥”
```

## 五、架构要点

代码分三层，每层只依赖下一层。适配层（adapters）负责请求后端接口，并把 ODPT、GBFS、GTFS-RT、气象厅等格式统一成自己定义的类型。状态层（Pinia）保存这些数据和界面开关。场景层（scene）负责在 Cesium 里画出来。App.vue 用 `watch` 监听状态变化，再调用场景层的方法，所以界面组件从不直接操作 Cesium。这样换城市时只要写新的适配器、改 `city.ts`，界面和场景代码不用动。

Cesium 对象不放进 Pinia，因为 Vue 会对放进响应式系统的对象做深度代理，而 Viewer 内部有几十万个属性，代理后性能会急剧下降。它们放在 `scene/manager.ts` 的模块级变量里，通过 `getScene()` 获取。

列车位置的推算方法：ODPT 的列车数据不含经纬度，只说“从 A 站开往 B 站”。`tools/build_lines.py` 先把每个车站投影到 OSM 轨道折线上，算出“该站距线路起点多少米”。前端收到列车数据后，假设列车在两站之间匀速行驶，站间运行时间按“距离 ÷ 平均速度 35 km/h”估算（至少 1 分钟）。每一帧用“距上次观测过去的秒数”算出当前里程，进度限制在 5% 到 95% 之间，不会提前“到站”，等下一次数据确认。再用二分查找在折线上求出坐标。大江户线是“6”字形环线，都庁前在站序里出现两次，投影时只在上一站之后的轨道段上搜索，才能取到正确的位置。

后端的作用有四个：托管本地 3D Tiles 和前端；代理实时接口并按数据源缓存（列车 15 秒、巴士 20 秒、单车 55 秒、AMeDAS 5 分钟、航班匿名 4 分钟或有密钥 20 秒），上游失败时返回旧缓存并标记 `stale: true`，界面会显示“数据延迟”；把地形和影像瓦片缓存到磁盘，第二次打开同一区域时不再联网；每 5 分钟存一次单车快照，供回放使用。

## 六、后端接口

| 路径 | 内容 | 来源 |
|---|---|---|
| `/api/trains` | 都营列车实时位置 | ODPT odpt:Train |
| `/api/train-info` | 运行信息（延误公告） | ODPT odpt:TrainInformation |
| `/api/bus.pb` | 都营巴士位置（protobuf） | ODPT GTFS-RT |
| `/api/bike/status` | 单车站点可借车数 | docomo bike share GBFS |
| `/api/bike/history` | 单车历史快照 | 后端自存 |
| `/api/amedas` | 千代田周边 AMeDAS 观测 | 气象厅 |
| `/api/nowcast-times` | 降雨临近预报可用时刻 | 气象厅 |
| `/api/weather` | 天气（AMeDAS 失败时的备用） | Open-Meteo |
| `/api/flights` | 东京上空航班 | OpenSky Network |
| `/api/health` | 健康检查、各缓存年龄 | — |
| `/tiles/{terrain,ortho,gsi,light}/…` | 地形 / 航拍 / 淡色地图 / 浅色地图瓦片（带磁盘缓存） | PLATEAU、国土地理院 |
| `/plateau/…` | 本地 3D Tiles | data/plateau |
| `/data/…` | 预处理数据 | data/derived |

OpenSky 匿名访问每天有 400 积分额度。注册后设置 `OPENSKY_CLIENT_ID` 和 `OPENSKY_CLIENT_SECRET` 环境变量即可提高额度。

## 七、更新数据

PLATEAU 每年发布新版本。重新下载时，在 https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2025 找到对应的 3D Tiles 压缩包，解压到 `data/plateau/同名目录`，然后运行 `python tools/build_stats.py` 重新生成统计。线路数据变化时，更新 `data/raw` 下的 OSM 和 ODPT 文件，再运行 `python tools/build_lines.py`。两个脚本都只用 Python 标准库。

## 八、已知限制

日暮里・舎人ライナー在 ODPT 公开端点没有列车位置数据，面板里显示“无实时数据”。荒川线（都电）是有轨电车，ODPT 给出的是停靠站，位置精度比地铁低。

列车位置是根据“从哪站开往哪站”推算的，实际位置可能与显示位置有几百米偏差。这是公开数据的精度上限，界面上没有把它包装成精确的 GPS 位置。

浸水想定是“如果下了这种规模的雨会怎样”的模拟结果，不是实时洪水。

## 许可证

本项目原创代码与文档采用 MIT License，见 [LICENSE](LICENSE)。`data/` 目录中的数据不包含在该许可范围内，仍适用各自来源的利用条款，详见下文。

## 九、数据来源与署名

本作品使用的数据都可以免费获取，商用和二次分发前请自行确认各数据的利用条款。

3D都市モデル（Project PLATEAU）千代田区（2025年度）由国土交通省提供，适用 PLATEAU Policy（兼容 CC BY 4.0）。PLATEAU-Terrain 和 PLATEAU 航拍影像由国土交通省提供。都营地铁、都营巴士、共享单车数据来自公共交通オープンデータセンター（ODPT），适用公共交通开放数据基本利用规约。气象数据来自气象厅（AMeDAS、高解像度降水ナウキャスト）和 Open-Meteo（CC BY 4.0）。航班数据来自 The OpenSky Network（非商用研究用途）。轨道几何来自 © OpenStreetMap contributors（ODbL）。淡色地图由国土地理院提供。

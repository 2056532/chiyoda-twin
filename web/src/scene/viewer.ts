/**
 * 场景初始化：创建 Cesium Viewer，加载地形、影像、PLATEAU 建筑等静态底座。
 * 这里不放任何业务逻辑，业务图层在 layers/ 目录。
 */
import * as Cesium from 'cesium'
import { CITY } from '../config/city'

export interface BaseScene {
  viewer: Cesium.Viewer
  layers: { ortho: Cesium.ImageryLayer; light: Cesium.ImageryLayer; gsi: Cesium.ImageryLayer }
  tilesets: Partial<Record<keyof typeof CITY.tiles, Cesium.Cesium3DTileset>>
}

/**
 * 轻量模式：网址加 ?lite 打开。用 LOD1 白模代替 LOD2 纹理模型（显存占用约为 1/5），
 * 适合集成显卡、老电脑，或者演示时网络较慢。
 */
export const LITE = new URLSearchParams(location.search).has('lite')

/** 影像只在日本范围内请求，避免低缩放级别时向服务器要不存在的瓦片 */
const JAPAN = Cesium.Rectangle.fromDegrees(122, 20, 154, 46)

/** 用 {z}/{x}/{y} 模板创建一个影像图层 */
function xyzLayer(url: string, credit: string, maximumLevel: number, show = true, minimumLevel = 0) {
  const provider = new Cesium.UrlTemplateImageryProvider({
    url,                                   // 瓦片地址模板
    maximumLevel,                          // 超过这一级不再请求，直接放大上一级
    minimumLevel,                          // 低于这一级不请求
    rectangle: JAPAN,                      // 只在这个范围内请求瓦片
    credit: new Cesium.Credit(credit),     // 显示在右下角的数据署名
  })
  const layer = new Cesium.ImageryLayer(provider)
  layer.show = show
  return layer
}

export async function createViewer(container: HTMLElement): Promise<BaseScene> {
  // 地形：PLATEAU-Terrain 是椭球高，与 PLATEAU 建筑高度基准一致。加载失败时退回纯椭球面，至少能显示。
  const terrain = new Cesium.Terrain(Cesium.CesiumTerrainProvider.fromUrl(CITY.terrain, { requestVertexNormals: true }))
  terrain.errorEvent.addEventListener(e => console.warn('[terrain] 地形加载失败，退回椭球面', e))

  const viewer = new Cesium.Viewer(container, {
    terrain,
    baseLayer: false,              // 不用 Cesium ion 的默认影像（需要令牌），下面自己加
    baseLayerPicker: false,        // 以下控件都依赖 ion 或者用不到，统一关掉，界面自己做
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,                // 不用自带的弹窗，点击信息显示在右侧面板
    selectionIndicator: false,
    msaaSamples: LITE ? 1 : 4,     // 多重采样抗锯齿，建筑边缘更干净；轻量模式关闭
  })

  const scene = viewer.scene
  scene.globe.depthTestAgainstTerrain = true          // 被地形挡住的东西不显示
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#E9EDEF')  // 瓦片没加载出来时的底色
  scene.globe.showGroundAtmosphere = true
  scene.globe.maximumScreenSpaceError = 1.5           // 地形精度略高于默认（2），近景更细
  scene.fog.density = 0.00018                         // 远处轻微雾化，增加纵深感
  scene.postProcessStages.fxaa.enabled = true
  scene.screenSpaceCameraController.minimumZoomDistance = 30   // 防止镜头钻进地面
  ;(viewer.cesiumWidget.creditContainer as HTMLElement).classList.add('cz-credits')

  // 影像：从下到上依次是 国土地理院淡色图（兜底）→ PLATEAU 浅色底图（可切换）→ PLATEAU 航拍
  const gsi = xyzLayer(CITY.imagery.gsi, '国土地理院', 18, true, 2)          // 淡色地图从 2 级开始才有
  const light = xyzLayer(CITY.imagery.light, 'PLATEAU / 国土地理院', 18, false)
  const ortho = xyzLayer(CITY.imagery.ortho, '3D都市モデル（Project PLATEAU）国土交通省', 19)
  ortho.saturation = 0.82                             // 航拍略去饱和，让线路和专题色更突出
  ortho.brightness = 1.04
  for (const l of [gsi, light, ortho]) viewer.imageryLayers.add(l)

  // 镜头先放在高空，等建筑加载后再飞入（页面唯一的入场动画）
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(CITY.home.lon + 0.03, CITY.home.lat - 0.05, 9000),
    orientation: { heading: Cesium.Math.toRadians(-20), pitch: Cesium.Math.toRadians(-50) },
  })

  return { viewer, layers: { ortho, light, gsi }, tilesets: {} }
}

/**
 * 加载一个 3D Tiles 图层。
 * maximumScreenSpaceError：屏幕空间误差阈值，越大越省性能、越模糊。
 */
export async function loadTileset(base: BaseScene, key: keyof typeof CITY.tiles, opts: { show?: boolean; sse?: number } = {}) {
  if (base.tilesets[key]) return base.tilesets[key]!
  const ts = await Cesium.Cesium3DTileset.fromUrl(CITY.tiles[key], {
    maximumScreenSpaceError: opts.sse ?? 16,
    // 瓦片缓存上限：默认 512 MB，LOD2 纹理建筑全区约 400 MB，加上其他图层会超，调到 1 GB（轻量模式 384 MB）
    cacheBytes: (LITE ? 384 : 1024) * 1024 * 1024,
    maximumCacheOverflowBytes: (LITE ? 128 : 512) * 1024 * 1024,
    shadows: Cesium.ShadowMode.ENABLED,     // 参与日照阴影
  })
  ts.show = opts.show ?? true
  base.viewer.scene.primitives.add(ts)
  base.tilesets[key] = ts
  return ts
}

/** 飞到首页视角 */
export function flyHome(viewer: Cesium.Viewer, duration = 2.2) {
  const h = CITY.home
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(h.lon, h.lat, h.height),
    orientation: { heading: Cesium.Math.toRadians(h.heading), pitch: Cesium.Math.toRadians(h.pitch), roll: 0 },
    duration,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  })
}

/** 通用飞行：经纬度 + 高度 + 朝向（度） */
export function flyTo(viewer: Cesium.Viewer, p: { lon: number; lat: number; height: number; heading?: number; pitch?: number }, duration = 1.6) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height),
    orientation: {
      heading: Cesium.Math.toRadians(p.heading ?? viewer.camera.heading * 180 / Math.PI),
      pitch: Cesium.Math.toRadians(p.pitch ?? -45),
      roll: 0,
    },
    duration,
  })
}

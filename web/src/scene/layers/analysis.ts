/**
 * 分析工具
 *  - 日照阴影：开启 Cesium 阴影贴图，把场景时钟设到指定日期时刻（东京时间），太阳位置随之计算
 *  - 地下模式：地表半透明 + 允许镜头进入地下，显示 PLATEAU 地下街模型
 */
import * as Cesium from 'cesium'

/**
 * 设定日照时刻
 * @param date   'YYYY-MM-DD'
 * @param hour   东京时间，小时（可带小数，如 14.5 = 14:30）
 */
export function setSunTime(viewer: Cesium.Viewer, date: string, hour: number) {
  const h = Math.floor(hour), m = Math.round((hour - h) * 60)
  // 东京是 UTC+9，构造 ISO 字符串时写明时区，Cesium 会自动换算成 UTC
  const iso = `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(iso))
  viewer.clock.shouldAnimate = false     // 时间停住，不让太阳自己跑
}

export function enableShadows(viewer: Cesium.Viewer, on: boolean) {
  viewer.shadows = on
  viewer.terrainShadows = on ? Cesium.ShadowMode.RECEIVE_ONLY : Cesium.ShadowMode.DISABLED  // 地面接收建筑投下的阴影
  viewer.scene.light = new Cesium.SunLight()               // 光源用太阳
  const sm = viewer.scene.shadowMap
  sm.softShadows = true                                    // 软阴影，边缘更自然
  sm.size = 2048                                           // 阴影贴图分辨率
  sm.maximumDistance = 3000                                // 只在 3 公里内计算阴影，远处省性能
  sm.darkness = 0.45
  if (!on) {
    viewer.clock.currentTime = Cesium.JulianDate.now()
  }
}

/** 地下模式：地表变半透明，可以从上往下看到地下街 */
export function setUnderground(viewer: Cesium.Viewer, on: boolean) {
  const globe = viewer.scene.globe
  const ctrl = viewer.scene.screenSpaceCameraController
  globe.translucency.enabled = on
  globe.translucency.frontFaceAlphaByDistance = new Cesium.NearFarScalar(400, 0.3, 4000, 0.85)  // 越近越透明
  globe.translucency.backFaceAlpha = 0.6
  // 透过地表看到的是“太空”，默认是黑色，换成浅灰，地下街的颜色才看得清
  viewer.scene.backgroundColor = on ? Cesium.Color.fromCssColorString('#C9D2D6') : Cesium.Color.BLACK
  viewer.scene.skyBox!.show = !on
  viewer.scene.skyAtmosphere!.show = !on
  ctrl.enableCollisionDetection = !on        // 关掉碰撞检测，镜头才能钻到地面以下
  globe.depthTestAgainstTerrain = !on        // 地下物体不再被地表挡住
  // 地下模式下雾和大气会让画面发灰，暂时关掉
  viewer.scene.fog.enabled = !on
  globe.showGroundAtmosphere = !on
}

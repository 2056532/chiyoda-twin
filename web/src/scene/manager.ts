/**
 * 场景管理器：把各个图层组装起来，并负责鼠标拾取。
 * 这是一个普通的模块级单例（不进 Pinia），Vue 组件通过 getScene() 拿到它。
 */
import * as Cesium from 'cesium'
import { createViewer, flyHome, loadTileset, LITE, type BaseScene } from './viewer'
import { TrainLayer } from './layers/trains'
import { BikeLayer } from './layers/bikes'
import { WeatherLayer } from './layers/weather'
import { MobilityLayer } from './layers/mobility'
import { FloodLayer } from './layers/flood'
import { Highlighter, readBuilding } from './layers/buildings'
import type { Line } from '../adapters/types'
import type { Selection } from '../stores/twin'

export interface TwinScene {
  base: BaseScene
  viewer: Cesium.Viewer
  trains: TrainLayer
  bikes: BikeLayer
  weather: WeatherLayer
  mobility: MobilityLayer
  flood: FloodLayer
  highlighter: Highlighter
  buildings: Cesium.Cesium3DTileset
}

let scene: TwinScene | null = null
export const getScene = () => scene
// 调试用：在浏览器控制台输入 __twin 可以拿到场景对象
;(window as unknown as { __twin: () => TwinScene | null }).__twin = () => scene

/**
 * 创建整个场景
 * @param onProgress  加载进度文字回调（显示在加载遮罩上）
 * @param onPick      点击场景中的对象时回调
 */
export async function initScene(
  container: HTMLElement,
  lines: Line[],
  onProgress: (text: string) => void,
  onPick: (sel: Selection) => void,
): Promise<TwinScene> {
  const base = await createViewer(container)
  const viewer = base.viewer

  onProgress(LITE ? '正在加载建筑模型（轻量模式 LOD1）…' : '正在加载建筑模型（PLATEAU LOD2，1.2 万栋）…')
  const buildings = await loadTileset(base, LITE ? 'bldgLod1' : 'bldg', { sse: LITE ? 20 : 12 })
  // 次要图层后台加载，不阻塞首屏
  loadTileset(base, 'brid', { sse: 16 }).catch(e => console.warn('桥梁加载失败', e))
  loadTileset(base, 'wtr', { sse: 16 }).catch(e => console.warn('水部加载失败', e))
  loadTileset(base, 'ubld', { sse: 4, show: false })
    .then(ts => {
      // 地下街统一染成暖橙色，透过半透明地表时和地上的灰白建筑区分开
      ts.style = new Cesium.Cesium3DTileStyle({ color: "color('#F08A3C', 0.95)" })
      // 提前在后台加载瓦片：隐藏状态下 Cesium 不会请求，首次进入地下模式要等几十秒。
      // preloadWhenHidden 让它在隐藏时也把瓦片下载并解码好（地下街只有 7 MB）
      ts.preloadWhenHidden = true
    })
    .catch(e => console.warn('地下街加载失败', e))

  onProgress('正在连接实时数据…')
  scene = {
    base, viewer, buildings,
    trains: new TrainLayer(viewer, lines),
    bikes: new BikeLayer(viewer),
    weather: new WeatherLayer(viewer),
    mobility: new MobilityLayer(viewer),
    flood: new FloodLayer(viewer),
    highlighter: new Highlighter(),
  }

  bindPicking(viewer, onPick)

  // 首屏入场：等第一批建筑瓦片加载完再飞入；最多等 6 秒
  await Promise.race([
    new Promise<void>(r => { const off = buildings.initialTilesLoaded.addEventListener(() => { off(); r() }) }),
    new Promise<void>(r => setTimeout(r, 6000)),
  ])
  flyHome(viewer, 3.2)
  return scene
}

/** 鼠标交互：左键选中对象，悬停时改变鼠标指针 */
function bindPicking(viewer: Cesium.Viewer, onPick: (sel: Selection) => void) {
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)

  handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
    const picked = viewer.scene.pick(e.position)       // 屏幕坐标 → 场景对象
    scene!.highlighter.set(null)
    if (!picked) return onPick(null)

    // 3D Tiles 要素（建筑）
    if (picked instanceof Cesium.Cesium3DTileFeature) {
      if (picked.tileset !== scene!.buildings) return onPick(null)
      scene!.highlighter.set(picked)
      return onPick({ kind: 'building', data: readBuilding(picked) })
    }
    // 实体（列车、车站、单车、航班）：通过 properties.kind 区分
    const entity = picked.id as Cesium.Entity | undefined
    const props = entity?.properties
    const kind = props?.kind?.getValue()
    if (kind === 'train') return onPick({ kind: 'train', id: props!.trainId.getValue() })
    if (kind === 'station') return onPick({ kind: 'station', id: entity!.id.replace('station:', ''), lineId: props!.lineId.getValue() })
    if (kind === 'bike') return onPick({ kind: 'bike', id: props!.stationId.getValue() })
    if (kind === 'flight') return onPick({ kind: 'flight', data: props!.flight.getValue() })
    onPick(null)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // 悬停可点击对象时显示手型指针
  handler.setInputAction((e: Cesium.ScreenSpaceEventHandler.MotionEvent) => {
    const picked = viewer.scene.pick(e.endPosition)
    viewer.canvas.style.cursor = picked ? 'pointer' : ''
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)
}

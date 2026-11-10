/**
 * 防灾图层：PLATEAU 浸水想定区域 3D Tiles。
 * 这些面已经按浸水深度抬升了高度（顶面 = 地面 + 浸水深），所以叠加在建筑上就能直观看到淹到哪一层。
 * 颜色按 uro:rank（浸水深等级）着色，与建筑着色共用 FLOOD_LEGEND 色阶。
 */
import * as Cesium from 'cesium'

const RANK = "${feature['uro:rank']}"

export class FloodLayer {
  private sets = new Map<string, Cesium.Cesium3DTileset>()
  private current: string | null = null

  constructor(private viewer: Cesium.Viewer) {}

  /** 显示某个浸水场景（目录名，例如 fld_kanda_l2）；传 null 隐藏全部 */
  async show(dir: string | null) {
    for (const [k, ts] of this.sets) ts.show = k === dir
    this.current = dir
    if (!dir || this.sets.has(dir)) return
    const ts = await Cesium.Cesium3DTileset.fromUrl(`/plateau/${dir}/tileset.json`, { maximumScreenSpaceError: 8 })
    ts.style = new Cesium.Cesium3DTileStyle({
      color: {
        conditions: [
          [`${RANK} === '10m以上20m未満' || ${RANK} === '5m以上10m未満'`, "color('#8E3F9E', 0.62)"],
          [`${RANK} === '3m以上5m未満'`, "color('#D2506B', 0.6)"],
          [`${RANK} === '0.5m以上3m未満'`, "color('#F2A0A8', 0.6)"],
          ['true', "color('#F7E78A', 0.58)"],
        ],
      },
    })
    this.viewer.scene.primitives.add(ts)
    this.sets.set(dir, ts)
    ts.show = this.current === dir    // 加载期间用户可能已经切走了
  }
}

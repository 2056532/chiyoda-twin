/**
 * 城市配置：换城市（或换区）时只需要改这个文件和对应的数据适配器。
 * 所有 URL 都是相对路径，由后端 server.mjs 提供（本地文件或带缓存的代理）。
 */
export const CITY = {
  name: '千代田区',
  code: '13101',                                   // 全国地方公共团体代码
  // 初始镜头：从东京站东南方向斜看丸之内与皇居
  home: { lon: 139.7745, lat: 35.6705, height: 900, heading: -38, pitch: -28 },
  // 单车、巴士统计只算这个范围（千代田区外扩一点）
  bbox: { west: 139.728, south: 35.664, east: 139.792, north: 35.706 },
  amedasMain: '44132',                             // 气象厅“东京”观测站（北之丸公园，就在千代田区内）
  tiles: {
    bldg: '/plateau/bldg_lod2/tileset.json',       // 建筑 LOD2（带纹理）
    bldgLod1: '/plateau/bldg_lod1/tileset.json',   // 建筑 LOD1（白模，体积小）
    brid: '/plateau/brid_lod2/tileset.json',       // 桥梁
    tran: '/plateau/tran_lod3/tileset.json',       // 道路面
    veg: '/plateau/veg_cover_lod3/tileset.json',   // 植被
    wtr: '/plateau/wtr_lod1/tileset.json',         // 水部（皇居护城河、神田川）
    ubld: '/plateau/ubld_lod4/tileset.json',       // 地下街（东京站八重洲地下街等）
  },
  imagery: {
    ortho: '/tiles/ortho/{z}/{x}/{y}.png',         // PLATEAU 2024 航拍正射影像
    light: '/tiles/light/{z}/{x}/{y}.png',         // PLATEAU 浅色底图（国土地理院矢量瓦片渲染）
    gsi: '/tiles/gsi/{z}/{x}/{y}.png',             // 国土地理院淡色地图（影像范围外的兜底）
  },
  terrain: '/tiles/terrain',                       // PLATEAU-Terrain（椭球高，和 3D Tiles 高度基准一致）
  // 地下街（东京站丸之内侧，范围约 139.767–139.771°E、35.6785–35.683°N），地下模式镜头从东南方高处斜看下去
  underground: { lon: 139.7738, lat: 35.6748, height: 420, heading: -35, pitch: -38 },
}

/** ODPT 线路颜色：荒川线、舎人线接口里是灰色，这里换成更好区分的显示色（仅显示用途） */
export const LINE_COLOR_OVERRIDE: Record<string, string> = {
  'odpt.Railway:Toei.Arakawa': '#D7568A',
  'odpt.Railway:Toei.NipporiToneri': '#5E7484',
}

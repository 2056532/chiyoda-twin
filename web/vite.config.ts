import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Cesium 运行时需要的静态资源（Web Worker、着色器依赖、图标、样式）
// 不能被打包进 JS，必须原样拷贝到 dist/cesium 下，运行时通过 CESIUM_BASE_URL 找到它们
const cesiumBuild = 'node_modules/cesium/Build/Cesium'

// 开发模式下，接口和本地数据都转发给后端（node server/server.mjs，端口 8787）
const backend = 'http://localhost:8787'

export default defineConfig({
  plugins: [
    vue(),
    viteStaticCopy({
      targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map(dir => ({
        src: `${cesiumBuild}/${dir}`,   // 源目录
        dest: 'cesium',                 // 拷到 dist/cesium/<dir>
        // v4 默认保留源路径（会变成 cesium/node_modules/cesium/Build/Cesium/Workers），
        // stripBase 去掉前 4 段目录，只保留 Workers/...
        rename: { stripBase: 4 },
      })),
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': backend,      // 实时数据代理
      '/tiles': backend,    // 地形 / 影像瓦片缓存
      '/plateau': backend,  // 本地 3D Tiles
      '/data': backend,     // 预处理数据
      '/raw': backend,      // 静态原始数据
    },
  },
  build: {
    chunkSizeWarningLimit: 8000,  // Cesium 本身就有好几 MB，关掉无意义的体积警告
  },
})

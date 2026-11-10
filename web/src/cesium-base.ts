// 必须在 import 'cesium' 之前执行：告诉 Cesium 去哪里加载 Worker、图标等静态资源。
// vite.config.ts 把这些资源拷贝到了 /cesium/ 下。
// 单独放一个文件并最先 import，是因为 ES 模块的 import 会被提升，写在 main.ts 里赋值会太晚。
;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/'
export {}

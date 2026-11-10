import './cesium-base'                                  // 第一个导入：设置 CESIUM_BASE_URL
import 'cesium/Build/Cesium/Widgets/widgets.css'          // Cesium 自带控件样式（信用栏等）
import '@fontsource/barlow-semi-condensed/500.css'        // 数字与标题用字体（类似车站标识的窄体）
import '@fontsource/barlow-semi-condensed/600.css'
import '@fontsource/barlow-semi-condensed/700.css'
import './style.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

createApp(App)
  .use(createPinia())        // 注册状态管理
  .mount('#app')             // 挂载到 index.html 的 <div id="app">

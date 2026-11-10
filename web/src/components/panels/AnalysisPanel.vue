<!--
  分析模式面板：日照阴影分析、地上地下一体化浏览。
-->
<script setup lang="ts">
import * as Cesium from 'cesium'
import { computed } from 'vue'
import { useTwin } from '../../stores/twin'
import { getScene } from '../../scene/manager'
import { flyTo, flyHome } from '../../scene/viewer'
import { CITY } from '../../config/city'

const twin = useTwin()
const hourLabel = computed(() => {
  const h = Math.floor(twin.sun.hour), m = Math.round((twin.sun.hour - h) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
})

// 常用日期：冬至阴影最长，是日照分析的标准日
const year = new Date().getFullYear()
const presets = [
  { label: '冬至', date: `${year}-12-21` },
  { label: '春分', date: `${year}-03-20` },
  { label: '夏至', date: `${year}-06-21` },
  { label: '今天', date: new Date().toISOString().slice(0, 10) },
]

function goUnderground() {
  twin.underground = true
  const sc = getScene()
  if (!sc) return
  const ub = sc.base.tilesets.ubld
  // 直接飞到地下街模型的包围球：朝向东北、俯角 -30°，距离按模型大小自动算
  if (ub) sc.viewer.flyTo(ub, { duration: 2, offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(-60), Cesium.Math.toRadians(-38), 520) })
  else flyTo(sc.viewer, CITY.underground, 2)
}
function leaveUnderground() {
  twin.underground = false
  const sc = getScene()
  if (sc) flyHome(sc.viewer, 1.8)
}
</script>

<template>
  <div class="panel">
    <section>
      <h2>日照与阴影</h2>
      <label class="sw"><input type="checkbox" v-model="twin.sun.on" /> 开启阴影模拟</label>
      <template v-if="twin.sun.on">
        <div class="seg" style="margin-top:8px">
          <button v-for="p in presets" :key="p.label" :class="{ on: twin.sun.date === p.date }" @click="twin.sun.date = p.date">{{ p.label }}</button>
        </div>
        <input class="full" type="date" v-model="twin.sun.date" aria-label="日期" />
        <div class="replay" style="margin-top:10px">
          <div class="rl"><span>东京时间</span><b class="num">{{ hourLabel }}</b></div>
          <input type="range" min="6" max="18" step="0.25" v-model.number="twin.sun.hour" aria-label="时刻" />
        </div>
        <small class="hint">太阳位置由 Cesium 按日期时刻计算。冬至日 8:00–16:00 是日本日影规制的检查时段。</small>
      </template>
    </section>

    <section>
      <h2>地上地下一体化</h2>
      <p>东京站丸之内一带的地下街（PLATEAU 地下街模型 LOD4）。进入后地表变为半透明，镜头可以下潜到地面以下。</p>
      <div class="btns">
        <button class="btn" v-if="!twin.underground" @click="goUnderground">进入地下视角</button>
        <button class="btn ghost" v-else @click="leaveUnderground">回到地面</button>
      </div>
    </section>

    <section>
      <h2>视角</h2>
      <div class="btns">
        <button class="btn ghost" @click="getScene() && flyHome(getScene()!.viewer)">回到初始视角</button>
        <button class="btn ghost" @click="getScene() && flyTo(getScene()!.viewer, { lon: 139.7528, lat: 35.6852, height: 2600, heading: 0, pitch: -55 })">俯瞰皇居</button>
        <button class="btn ghost" @click="getScene() && flyTo(getScene()!.viewer, { lon: 139.7745, lat: 35.6935, height: 520, heading: -150, pitch: -25 })">秋叶原</button>
      </div>
    </section>
  </div>
</template>

<style scoped src="./panel.css"></style>

<!--
  通用横向条形图（ECharts）。按需引入 ECharts 模块，比整包引入小很多。
  用法：<BarChart :items="[['办公', 5161], ['商业', 872]]" :colors="['#4A6FA5', ...]" />
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart as EBar } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([EBar, GridComponent, TooltipComponent, CanvasRenderer])   // 注册用到的模块

const props = defineProps<{ items: [string, number][]; colors?: string[]; height?: number; unit?: string }>()
const el = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null
let ro: ResizeObserver | null = null

function render() {
  if (!chart) return
  const items = [...props.items].reverse()           // ECharts 横向条形图从下往上画，反转后第一项在最上面
  chart.setOption({
    animation: false,
    grid: { left: 4, right: 44, top: 2, bottom: 2, containLabel: true },
    tooltip: { trigger: 'item', formatter: (p: { name: string; value: number }) => `${p.name}：${p.value}${props.unit ?? ''}` },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category', data: items.map(i => i[0]),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#4E5E68', fontSize: 12 },
    },
    series: [{
      type: 'bar', barWidth: 10,
      data: items.map((i, k) => ({
        value: i[1],
        itemStyle: { color: props.colors?.[items.length - 1 - k] ?? '#3A8C97', borderRadius: [0, 3, 3, 0] },
      })),
      label: { show: true, position: 'right', color: '#1C2A33', fontFamily: 'Barlow Semi Condensed', fontSize: 13, fontWeight: 600 },
    }],
  }, true)
}

onMounted(() => {
  chart = echarts.init(el.value!, undefined, { renderer: 'canvas' })
  render()
  ro = new ResizeObserver(() => chart?.resize())     // 面板宽度变化时自适应
  ro.observe(el.value!)
})
watch(() => [props.items, props.colors], render, { deep: true })
onBeforeUnmount(() => { ro?.disconnect(); chart?.dispose() })
</script>

<template>
  <div ref="el" :style="{ height: (height ?? items.length * 22 + 8) + 'px' }" />
</template>

# -*- coding: utf-8 -*-
"""
预处理脚本：从本地 PLATEAU 建筑 3D Tiles（b3dm）里读出每栋建筑的属性，生成前端统计用的 buildings_stats.json。

为什么要预处理：
  浏览器里的 3D Tiles 是“看到哪里加载哪里”，前端拿不到全区 1.2 万栋建筑的完整属性。
  防灾面板要回答“水深超过 X 米时有多少栋建筑受影响”，必须基于全量数据，所以提前统计好。

b3dm 文件结构（3D Tiles 1.0）：
  28 字节文件头 → Feature Table（JSON + 二进制）→ Batch Table（JSON + 二进制）→ glTF 模型
  每栋建筑的属性就在 Batch Table JSON 里，键是属性名，值是“每栋建筑一个元素”的数组。

运行：python tools/build_stats.py
输出：data/derived/buildings_stats.json
"""
import glob
import json
import os
import struct
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'plateau', 'bldg_lod1', 'data')  # LOD1 每栋建筑只有一个要素，统计不会重复
OUT = os.path.join(ROOT, 'data', 'derived', 'buildings_stats.json')

# 浸水场景：前端下拉框的 key → 建筑属性里的“浸水深”字段名、对应的浸水区域 3D Tiles 目录
SCENARIOS = {
    'kanda_l2': ('神田川流域（都道府県管理区間）_L2（想定最大規模）_浸水深', 'fld_kanda_l2', '神田川流域 · 想定最大规模（L2）'),
    'sumida_l2': ('隅田川・新河岸川流域（都道府県管理区間）_L2（想定最大規模）_浸水深', 'fld_sumida_l2', '隅田川·新河岸川流域 · 想定最大规模（L2）'),
    'arakawa_l1': ('荒川水系神田川流域（都道府県管理区間）_L1（計画規模）_浸水深', 'fld_arakawa_l1', '荒川水系神田川流域 · 计划规模（L1）'),
    'arakawa_l2': ('荒川水系神田川流域（都道府県管理区間）_L2（想定最大規模）_浸水深', 'fld_arakawa_l2', '荒川水系神田川流域 · 想定最大规模（L2）'),
    'htd': ('高潮浸水想定_東京都高潮浸水想定区域図（令和6年12月19日）_浸水深', 'htd', '东京都高潮浸水想定（2024-12）'),
}

# 用途日文 → 中文，面板显示用
USAGE_ZH = {
    '業務施設': '办公', '商業施設': '商业', '共同住宅': '集合住宅', '住宅': '独立住宅',
    '店舗等併用住宅': '店住混合', '店舗等併用共同住宅': '店住混合(集合)', '作業所併用住宅': '作坊住宅',
    '官公庁施設': '政府机关', '文教厚生施設': '文教医疗', '宿泊施設': '酒店', '運輸倉庫施設': '交通仓储',
    '工場': '工厂', '供給処理施設': '市政设施', '農林漁業用施設': '农林渔业', '不明': '未知',
}


def read_batch_table(path):
    """读取一个 b3dm 文件的 Batch Table JSON 部分"""
    with open(path, 'rb') as f:
        b = f.read()
    # 文件头：magic(4) version(4) byteLength(4) ftJSON(4) ftBin(4) btJSON(4) btBin(4)
    _, _, ft_json, ft_bin, bt_json, _ = struct.unpack('<6I', b[4:28])
    start = 28 + ft_json + ft_bin
    return json.loads(b[start:start + bt_json]) if bt_json else {}


def main():
    seen = set()
    heights, usage = [], Counter()
    depths = {k: [] for k in SCENARIOS}
    tallest = []
    for f in sorted(glob.glob(os.path.join(SRC, '*.b3dm'))):
        bt = read_batch_table(f)
        n = len(bt.get('gml_id', []))
        # 有些属性存在 Batch Table 的二进制段里，JSON 里只有 {"byteOffset":..}，统计用不到，统一当作缺失
        bt = {k: v for k, v in bt.items() if isinstance(v, list) and len(v) == n}
        for i in range(n):
            gid = bt['gml_id'][i]
            if gid in seen:
                continue
            seen.add(gid)
            h = bt.get('bldg:measuredHeight', [None] * n)[i]
            u = bt.get('bldg:usage', [None] * n)[i] or '不明'
            usage[USAGE_ZH.get(u, u)] += 1
            if isinstance(h, (int, float)) and h > 0:
                heights.append(h)
                tallest.append((h, bt.get('gml:name', [None] * n)[i], bt.get('bldg:address', [None] * n)[i]))
            for k, (field, _, _) in SCENARIOS.items():
                d = bt.get(field, [None] * n)[i]
                if isinstance(d, (int, float)) and d > 0:
                    depths[k].append(round(d, 2))

    # 高度分档
    bins = [(0, 10), (10, 20), (20, 40), (40, 60), (60, 100), (100, 150), (150, 1000)]
    hist = [{'label': f'{a}-{b}m' if b < 1000 else f'{a}m+', 'count': sum(1 for h in heights if a <= h < b)} for a, b in bins]
    tallest.sort(key=lambda x: x[0], reverse=True)   # 只按高度排序（名称可能为空，不能参与比较）

    out = {
        'total': len(seen),
        'withHeight': len(heights),
        'maxHeight': max(heights),
        'medianHeight': sorted(heights)[len(heights) // 2],
        'heightHist': hist,
        'usage': usage.most_common(),
        'tallest': [{'h': h, 'name': n, 'address': a} for h, n, a in tallest[:10]],
        'scenarios': {
            k: {'title': SCENARIOS[k][2], 'tiles': SCENARIOS[k][1], 'field': SCENARIOS[k][0],
                'affected': len(v), 'maxDepth': max(v) if v else 0,
                'depths': sorted(v)}            # 排好序，前端用二分查找即可算出“≥ 阈值的栋数”
            for k, v in depths.items()
        },
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(f"建筑 {out['total']} 栋，有高度 {out['withHeight']} 栋，最高 {out['maxHeight']} m")
    for k, s in out['scenarios'].items():
        print(f"  {s['title']}: 受影响 {s['affected']} 栋，最大浸水深 {s['maxDepth']} m")
    print('已写出', OUT)


if __name__ == '__main__':
    main()

# -*- coding: utf-8 -*-
"""
预处理脚本：把 OSM 的都营线路几何 + ODPT 车站，合成前端可直接用的 lines.json。

为什么需要它：
  ODPT 的列车数据只告诉我们“从 A 站开往 B 站”，没有经纬度；
  ODPT 的线路数据只有站序，没有轨道的真实形状。
  所以我们从 OpenStreetMap 拿轨道折线，再把每个车站“投影”到折线上，
  得到“该站距线路起点多少米”。前端插值时只需在两站的里程之间取值，
  列车就会沿着真实轨道移动，而不是走直线。

运行：python tools/build_lines.py   （只用标准库，无需安装依赖）
输入：data/raw/osm_toei_routes.json、odpt_station_toei.json、odpt_railway_toei.json
输出：data/derived/lines.json
"""
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 工程根目录
RAW = os.path.join(ROOT, 'data', 'raw')
OUT = os.path.join(ROOT, 'data', 'derived', 'lines.json')

# ODPT 线路 ID → OSM relation ID（在 openstreetmap.org/relation/<id> 可查看）
RAILWAY_TO_OSM = {
    'odpt.Railway:Toei.Asakusa': 3302734,
    'odpt.Railway:Toei.Mita': 443286,
    'odpt.Railway:Toei.Shinjuku': 443259,
    'odpt.Railway:Toei.Oedo': 3355612,
    'odpt.Railway:Toei.Arakawa': 1952418,
    'odpt.Railway:Toei.NipporiToneri': 3423146,
}


def load(name):
    with open(os.path.join(RAW, name), encoding='utf-8') as f:
        return json.load(f)


def dist_m(a, b):
    """两点（经度, 纬度）之间的近似距离（米）。小范围内用等距矩形近似足够准确。"""
    lat = math.radians((a[1] + b[1]) / 2)
    dx = math.radians(b[0] - a[0]) * math.cos(lat) * 6371000
    dy = math.radians(b[1] - a[1]) * 6371000
    return math.hypot(dx, dy)


def stitch(ways):
    """
    把若干段 way（每段是点列表）首尾相接成一条折线。
    贪心法：从第一段开始，每次找端点离当前链两端最近的一段接上（必要时反转）。
    """
    ways = [w[:] for w in ways if len(w) >= 2]
    if not ways:
        return []
    chain = ways.pop(0)
    while ways:
        best = None  # (距离, 序号, 接在头还是尾, 是否反转)
        for i, w in enumerate(ways):
            for at_end in (True, False):
                end = chain[-1] if at_end else chain[0]
                for rev in (False, True):
                    p = w[-1] if rev else w[0]          # 这段要接上去的那个端点
                    if not at_end:
                        p = w[0] if rev else w[-1]
                    d = dist_m(end, p)
                    if best is None or d < best[0]:
                        best = (d, i, at_end, rev)
        d, i, at_end, rev = best
        w = ways.pop(i)
        if rev:
            w = w[::-1]
        if at_end:
            chain += w[1:] if dist_m(chain[-1], w[0]) < 1 else w
        else:
            chain = (w[:-1] if dist_m(w[-1], chain[0]) < 1 else w) + chain
    return chain


def chain_in_order(ways):
    """
    按 OSM relation 里成员的原始顺序拼接（route relation 通常已按行车顺序排好）。
    每段只决定是否反转，使它的起点贴着上一段的终点。环线（如大江户线）只能用这种方式。
    """
    ways = [w for w in ways if len(w) >= 2]
    if not ways:
        return []
    first, second = ways[0], ways[1] if len(ways) > 1 else None
    if second:  # 第一段的方向：哪一端离第二段更近，哪一端就是终点
        d_end = min(dist_m(first[-1], second[0]), dist_m(first[-1], second[-1]))
        d_start = min(dist_m(first[0], second[0]), dist_m(first[0], second[-1]))
        if d_start < d_end:
            first = first[::-1]
    chain = first[:]
    for w in ways[1:]:
        if dist_m(chain[-1], w[-1]) < dist_m(chain[-1], w[0]):
            w = w[::-1]
        chain += w[1:] if dist_m(chain[-1], w[0]) < 1 else w
    return chain


def project(pt, coords, cum, start_m=0.0):
    """把点投影到折线上（只考虑里程 ≥ start_m 的部分），返回（沿线里程米, 垂距米）。"""
    best = (float('inf'), 0.0)
    lat0 = math.radians(pt[1])
    kx = math.cos(lat0) * 111320  # 经度 1° 对应的米数
    ky = 110540                   # 纬度 1° 对应的米数
    found = False                  # 是否已进入“离车站足够近”的区段
    for i in range(len(coords) - 1):
        if cum[i + 1] < start_m:   # 这段在上一站之前，跳过（保证里程只增不减）
            continue
        ax, ay = coords[i][0] * kx, coords[i][1] * ky
        bx, by = coords[i + 1][0] * kx, coords[i + 1][1] * ky
        px, py = pt[0] * kx, pt[1] * ky
        vx, vy = bx - ax, by - ay
        L2 = vx * vx + vy * vy
        t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / L2))
        qx, qy = ax + t * vx, ay + t * vy
        d = math.hypot(px - qx, py - qy)
        m = cum[i] + t * (cum[i + 1] - cum[i])
        if m < start_m:
            continue
        if d < best[0]:
            best = (d, m)
        if d < 250:
            found = True
        elif found:
            # 已经找到“第一次经过车站”的位置，又走远了就停。
            # 环线（大江户线）会两次经过都庁前，这样能取到正确的那一次。
            break
    return best[1], best[0]


def main():
    osm = {e['id']: e for e in load('osm_toei_routes.json')['elements']}
    stations = {s['owl:sameAs']: s for s in load('odpt_station_toei.json')}
    railways = load('odpt_railway_toei.json')

    out = {}
    for rw in railways:
        rid = rw['owl:sameAs']
        rel = osm.get(RAILWAY_TO_OSM.get(rid))
        order = sorted(rw['odpt:stationOrder'], key=lambda x: x['odpt:index'])
        st_pts = []
        for o in order:
            s = stations.get(o['odpt:station'])
            if s and s.get('geo:long'):
                st_pts.append((o['odpt:station'], [s['geo:long'], s['geo:lat']], s['dc:title']))

        ways = []
        if rel:
            ways = [[[g['lon'], g['lat']] for g in m['geometry']]
                    for m in rel['members'] if m['type'] == 'way' and m['role'] in ('', 'forward', 'backward') and m.get('geometry')]

        def attempt(coords):
            """对一条候选折线做投影，返回（折线, 累计里程, 车站结果, 偏离站数, 是否单调）。"""
            if coords and dist_m(coords[0], st_pts[0][1]) > dist_m(coords[-1], st_pts[0][1]):
                coords = coords[::-1]          # 让折线方向与 ODPT 站序一致
            cum = [0.0]
            for i in range(1, len(coords)):
                cum.append(cum[-1] + dist_m(coords[i - 1], coords[i]))
            st, bad, last = [], 0, 0.0
            for sid, pt, title in st_pts:
                m, off = project(pt, coords, cum, last) if coords else (0, 0)
                if off > 300:                  # 车站离轨道超过 300 米，说明拼接有问题
                    bad += 1
                last = m
                st.append({'id': sid, 'title': title, 'lon': pt[0], 'lat': pt[1], 'm': round(m, 1)})
            mono = all(st[i]['m'] < st[i + 1]['m'] for i in range(len(st) - 1))
            return coords, cum, st, bad, mono

        # 先试“按成员顺序拼接”，不行再试“贪心拼接”
        coords, cum, st_out, bad, mono = attempt(chain_in_order(ways))
        if bad or not mono:
            coords, cum, st_out, bad, mono = attempt(stitch(ways))
        if not coords or bad or not mono:
            print(f'[降级] {rid}: OSM 折线不可用（偏离站数={bad}, 单调={mono}），改用车站连线')
            coords = [s['lon'] and [s['lon'], s['lat']] for s in st_out]
            cum = [0.0]
            for i in range(1, len(coords)):
                cum.append(cum[-1] + dist_m(coords[i - 1], coords[i]))
            for i, s in enumerate(st_out):
                s['m'] = round(cum[i], 1)

        out[rid] = {
            'title': rw['odpt:railwayTitle'],
            'color': rw.get('odpt:color', '#888888'),
            'lineCode': rw.get('odpt:lineCode'),
            'coords': [[round(c[0], 6), round(c[1], 6)] for c in coords],
            'cum': [round(x, 1) for x in cum],
            'stations': st_out,
        }
        print(f'{rid}: {len(coords)} 点, 全长 {cum[-1] / 1000:.1f} km, {len(st_out)} 站')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print('已写出', OUT)


if __name__ == '__main__':
    main()

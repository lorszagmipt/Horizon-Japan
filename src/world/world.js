// Мир целиком: генерация всего по шагам при загрузке и главные запросы физики — groundAt (что под колесом и на какой высоте) и waterLevelAt.

import { BIOMES } from "./mapData.js";
import { bakeBiomeGrid, biomeAt, sampleBiome } from "./biomes.js";
import { Terrain, lakeDistance } from "./terrain.js";
import { RoadNetwork } from "./roads.js";
import { ColliderGrid } from "../physics/colliders.js";
import { buildWaterGeometry } from "./water.js";
import { createSky } from "../render/sky.js";
import { Vegetation, scatterVegetation } from "./vegetation/scatter.js";
import { buildRoadside } from "./roadside.js";
import { buildStructures, buildWaterfall } from "./buildings.js";
import { Signs } from "./signs.js";

const nextTick = () => new Promise((f) => setTimeout(f, 0));

// Весь игровой мир. Создаётся один раз при загрузке (generate), дальше только отвечает на вопросы физики и камеры.
export class World {
  constructor(renderer) {
    this.r = renderer;
    this.terrain = new Terrain();
    this.roads = new RoadNetwork();
    this.colliders = new ColliderGrid(16);
    this.chunks = [];
    this.lodItems = [];
    this.waterItems = [];
    this.updaters = [];
    this.quality = {
      vegetation: 1,
      drawDist: 1300,
      lodScale: 1,
    };
    this.timings = {};
    this._b = {
      s: 0,
      a: 0,
      h: 0,
      f: 0,
    };
  }
  // Пошаговая генерация мира при загрузке. onProgress(доля, текст) двигает полоску загрузки.
  async generate(onProgress = () => {}, hooks = {}) {
    const terrain = this.terrain;
    let tPrev = performance.now();
    const mark = (stage) => {
      const now = performance.now();
      this.timings[stage] = Math.round(now - tPrev);
      tPrev = now;
    };
    onProgress(0.02, "Поднимаем горы…");
    await nextTick();
    bakeBiomeGrid();
    terrain.computeLakes();
    terrain.computeRiver();
    mark("biomes");
    onProgress(0.08, "Размечаем рельеф…");
    await nextTick();
    terrain.computeBlurField();
    mark("blur");
    onProgress(0.16, "Прокладываем дороги…");
    await nextTick();
    this.roads.build(terrain);
    this.roads.buildEdgeGrid();
    mark("roads");
    onProgress(0.24, "Выравниваем ландшафт…");
    await nextTick();
    terrain.buildGrid(this.roads);
    mark("grid");
    if (hooks.beforeTerrainMesh) {
      await hooks.beforeTerrainMesh(this, onProgress);
    }
    onProgress(0.4, "Раскрашиваем долины…");
    await nextTick();
    this.buildTerrainMeshes();
    mark("terrainMesh");
    onProgress(0.5, "Асфальт и разметка…");
    await nextTick();
    this.buildRoadMeshes();
    onProgress(0.52, "Ограждения, мосты и тоннель…");
    await nextTick();
    buildRoadside(this);
    this.signs = new Signs(this.r);
    this.signs.buildRoadSigns(this);
    mark("roadside");
    onProgress(0.55, "Деревни, храмы и замок…");
    await nextTick();
    buildStructures(this, this.signs);
    buildWaterfall(this);
    this.buildWaterMeshes();
    this.sky = createSky(this.r);
    mark("structures");
    onProgress(0.58, "Высаживаем сакуру и клёны…");
    await nextTick();
    const scatter = scatterVegetation(this, this.quality);
    mark("scatter");
    onProgress(0.66, "Сажаем леса и цветы…");
    await nextTick();
    this.vegetation = new Vegetation(this, this.quality);
    this.vegetation.build(scatter);
    mark("vegBuild");
    onProgress(0.7, "Дальние горы и Фудзи…");
    await nextTick();
    for (const geo of terrain.buildOuter()) {
      this.r.add({
        mesh: this.r.createMesh(geo),
        defines: ["TERRAIN"],
        layer: "far",
        reflect: true,
        tag: "outer",
      });
    }
    mark("outer");
    if (hooks.after) {
      await hooks.after(this, onProgress);
    }
  }
  buildTerrainMeshes() {
    const chunks = this.terrain.buildChunks(50);
    const side = Math.round(Math.sqrt(chunks.length));
    const SUPER = 4;
    this.superChunks = this.terrain.buildSuperChunks(50, SUPER).map((sc) => ({
      sc: sc,
      subs: [],
      item: this.r.add({
        tag: "terrainS",
        mesh: this.r.createMesh(sc.geo),
        defines: ["TERRAIN"],
        bounds: {
          c: sc.center,
          r: sc.radius,
        },
        visible: false,
        reflect: true,
      }),
    }));
    chunks.forEach((ch, idx) => {
      ch.ci = idx % side;
      ch.cj = Math.floor(idx / side);
    });
    for (const chunk of chunks) {
      const lodItems = chunk.lods.map((lod, level) =>
        this.r.add({
          tag: "terrain" + level,
          mesh: this.r.createMesh(lod.geo),
          defines: ["TERRAIN"],
          bounds: {
            c: chunk.center,
            r: chunk.radius,
          },
          shadow: false,
          visible: level === 0,
          reflect: false,
        }),
      );
      const entry = {
        c: chunk,
        items: lodItems,
      };
      this.chunks.push(entry);
      const parent = this.superChunks.find(
        (p) => p.sc.si === Math.floor(chunk.ci / SUPER) && p.sc.sj === Math.floor(chunk.cj / SUPER),
      );
      if (parent) {
        parent.subs.push(entry);
      }
    }
  }
  buildRoadMeshes() {
    const parts = this.roads.buildMeshes();
    for (const part of parts) {
      if (part.junction) {
        // заплатка перекрёстка — поверх обеих дорог; зебра — ещё выше
        const jo = -2 - (4 - part.road.priority) * 1.5 - 1.5;
        this.r.add({
          mesh: this.r.createMesh(part.geo),
          defines: ["ROAD"],
          bounds: { c: part.center, r: part.radius },
          polyOffset: [jo, jo * 2],
          shadow: false,
          order: 1 + (4 - part.road.priority),
          reflect: false,
        });
        if (part.marks) {
          this.r.add({
            mesh: this.r.createMesh(part.marks),
            bounds: { c: part.center, r: part.radius },
            polyOffset: [jo - 2, (jo - 2) * 2],
            shadow: false,
            order: 2 + (4 - part.road.priority),
            reflect: false,
          });
        }
        continue;
      }
      const offset = -2 - (4 - part.road.priority) * 1.5;
      this.r.add({
        mesh: this.r.createMesh(part.geo),
        defines: ["ROAD"],
        bounds: {
          c: part.center,
          r: part.radius,
        },
        polyOffset: [offset, offset * 2],
        shadow: false,
        order: 1 + (4 - part.road.priority),
        reflect: false,
      });
      if (part.under) {
        this.r.add({
          mesh: this.r.createMesh(part.under),
          bounds: {
            c: part.center,
            r: part.radius,
          },
          cull: "none",
          reflect: false,
        });
      }
    }
  }
  buildWaterMeshes() {
    const water = buildWaterGeometry(this.terrain);
    for (const lake of water.lakes) {
      const item = this.r.add({
        mesh: this.r.createMesh(lake.geo),
        prog: "water",
        bounds: {
          c: lake.center,
          r: lake.radius,
        },
        reflect: false,
        uniforms: { u_useRefl: 0 },
        order: 5,
      });
      item.lake = lake.lake;
      this.waterItems.push(item);
    }
    const rb = water.river.bounds();
    this.r.add({
      mesh: this.r.createMesh(water.river),
      prog: "water",
      bounds: {
        c: rb.center,
        r: rb.radius,
      },
      reflect: false,
      uniforms: { u_useRefl: 0 },
      order: 5,
    });
  }
  // Каждый кадр: выбор детализации (LOD) ландшафта и растительности по расстоянию до камеры.
  update(camPos, dt, time, cam) {
    if (this.vegetation && cam) {
      this.vegetation.update(cam);
    }
    for (const sc of this.superChunks) {
      let allFar = true;
      for (const sub of sc.subs) {
        const c = sub.c.center;
        const dist = Math.hypot(c[0] - camPos[0], c[2] - camPos[2]) - sub.c.radius * 0.7;
        sub.lod = dist < 380 ? 0 : dist < 1000 ? 1 : 2;
        if (sub.lod < 2) {
          allFar = false;
        }
      }
      sc.item.visible = allFar;
      for (const sub2 of sc.subs) {
        for (let lod = 0; lod < 3; lod++) {
          sub2.items[lod].visible = !allFar && lod === sub2.lod;
        }
      }
    }
    for (const fn of this.updaters) {
      fn(camPos, dt, time);
    }
  }
  // ЧТО ПОД КОЛЕСОМ. Возвращает в out: h — высота поверхности, surface — "road" | "shoulder" | "grass" | "gravel",
  // bridge/tunnel — на мосту ли / в тоннеле, road — какая дорога.
  // Если точка ближе (полуширина дороги + 1.45 м) к оси дороги — высота берётся с дороги, иначе с рельефа.
  // У перекрёстков вместо этого работает поле перекрёстка (асфальт со скруглёнными углами).
  // Резкая смена между этими двумя высотами — частая причина «подлётов» на краю дороги.
  groundAt(x, z, out) {
    // у перекрёстка: скруглённые углы и плавный переход высот (junctions.js)
    const jn = this.roads.junctionAt(x, z);
    if (jn && jn.F <= 1.45) {
      out.h = jn.h;
      out.surface = jn.F <= 0 ? "road" : "shoulder";
      out.bridge = false;
      out.tunnel = false;
      out.road = jn.road;
      return out;
    }
    // рядом с дорогой (по быстрой сетке) ищем точную ближайшую точку дороги
    const road =
      !this.roads.edge || this.roads.edgeDist(x, z) < 4 ? this.roads.nearest(x, z, 30) : null;
    // на дороге или обочине: высота полотна дороги
    if (road && road.d <= road.hw + 1.45) {
      out.h = road.h;
      out.surface = road.d <= road.hw ? "road" : "shoulder";
      out.bridge = road.bridge;
      out.tunnel = road.tunnel;
      out.road = road.road;
      return out;
    }
    // вне дороги: высота рельефа
    out.h = this.terrain.heightAt(x, z);
    out.bridge = false;
    out.tunnel = false;
    out.road = null;
    out.surface = "grass";
    if (sampleBiome(x, z, this._b).h > 0.6 && out.h > 220) {
      out.surface = "gravel";
    }
    return out;
  }
  // Уровень воды в точке (озеро или река), либо -Infinity, если воды нет.
  waterLevelAt(x, z) {
    for (const lake of this.terrain.lakes) {
      if (lakeDistance(lake, x, z) < 1) {
        return lake.level;
      }
    }
    const river = this.terrain.riverQuery(x, z);
    return river && !river.inLake && river.d < this.terrain.river.hw * 1.2 ? river.h : -Infinity;
  }
  // Какой биом в точке — для подписи региона на экране.
  regionAt(x, z) {
    const w = biomeAt(x, z);
    let best = 0;
    if (w[1] > w[best]) {
      best = 1;
    }
    if (w[2] > w[best]) {
      best = 2;
    }
    return BIOMES[best];
  }
}

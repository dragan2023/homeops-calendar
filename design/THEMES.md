# 多主题架构与 8 套主题（THEMES）

> 背景：用户 2026-09-21 决定 —— 不要"选一套设计语言"，而是**App 内置主题切换按钮，多套主题随时换**，并要"卡通粉（女生）/ 机甲（男生）"这类性格化主题。
> 地位：这是产品设计的主要决策，后续移动端 App（Expo）按本文件实现。

## 一、原理：组件只读语义令牌，主题只改令牌

- 所有组件 CSS **只使用** `var(--token)`，不写死任何颜色/圆角/阴影/字体。
- 每套主题 = 一个 `html[data-theme="<id>"]{ ... }` 令牌块。
- 换主题 = 改 `<html data-theme>` 一个属性，**组件代码零改动**。
- `:root` 里放一份完整默认值（= swiss），任何主题漏写的令牌都会安全兜底。

## 二、令牌契约（42 项，每套主题必须全填）

| 分组 | 令牌 | 用途 |
| --- | --- | --- |
| 表面 | `--bg` `--surface` `--surface-2` `--bg-deco` | 页面底 / 卡片 / 次级面 / 背景纹理（CSS background-image） |
| 描边 | `--border` `--border-w` `--border-strong` | 边框色 / 边框粗细（1px 或 3px 决定"精致"还是"粗野"） |
| 文字 | `--text` `--text-2` `--text-3` `--on-primary` | 主/次/弱文字、主色上的文字 |
| 品牌与状态 | `--primary` `--primary-soft` `--accent` `--accent-soft` `--warn(-soft)` `--danger(-soft)` `--success(-soft)` `--info(-soft)` | 主按钮、标签（临期=warn、缺货=danger 等） |
| 形状 | `--radius-card` `--radius-ctl` `--radius-pill` | 卡片/控件/胶囊圆角（0px=粗野、26px=黏土） |
| 阴影 | `--shadow-card` `--shadow-ctl` `--shadow-press` `--glow` | 常规阴影 / 控件 / 按下态 / 霓虹光 |
| 字体 | `--font-head` `--font-body` `--font-mono` `--fs-h1` `--fs-h2` `--label-transform` `--label-tracking` | 标题/正文/数字字体、字号、标签是否大写与字距 |
| 节奏 | `--gap` `--pad` `--ctl-h` | 间距 / 内边距 / 控件高度（触控目标 ≥44px） |
| 动效 | `--dur` `--ease` | 时长与缓动（粗野=0.1s linear，黏土=软弹曲线） |
| 图标 | `--icon-stroke` `--icon-cap` | 描边粗细与线端（圆端/方端让同一套 SVG 换气质） |
| 装饰钩子 | `--clip-card` `--nav-bg` | 卡片裁切形状（机甲切角）/ 底栏底色 |

**装饰钩子**是让"结构"也能随主题变的关键：机甲靠 `--clip-card: polygon(...)` 得到切角卡片，卡哇伊靠 `--bg-deco: radial-gradient(圆点)` 得到波点底纹 —— 都没有改一行组件 CSS。

> 令牌契约：核心 42 项 + 底栏前景 2 项（--nav-fg / --nav-fg-active）+ 装饰若干，当前共 52 个；每套主题都要填满（守卫会查）。

## 三、8 套主题

| id | 名称 | 气质 | 字体 | 关键差异 |
| --- | --- | --- | --- | --- |
| `swiss` | 瑞士极简 | 白纸黑字专业工具（默认） | Plus Jakarta Sans | 1px 细线、10px 圆角、无阴影、大字标签 |
| `brutal` | 新粗野 | 硬核台账、辨识度最高 | Space Mono | 3px 黑边、0 圆角、6px 硬投影、荧光黄 |
| `clay` | 柔和黏土 | 暖奶油、亲和 | Lora + Raleway | 26px 圆角、内外双阴影、衬线标题 |
| `kawaii` | 卡通粉 | 少女心/可爱 | Fredoka + Nunito | 波点底、28px 圆角、粉色主色、深莓色文字 |
| `mecha` | 机甲 HUD | 科技/男生 | Orbitron + Exo 2 | 深色、扫描线底纹、切角卡片、青色霓虹辉光 |
| `midnight` | 暗夜护眼 | 关灯看 | Fira Sans/Fira Code | 深靛蓝 + 暖琥珀，夜间低刺激 |
| `memphis` | 孟菲斯 80s | 潮流张扬 | Inter + JetBrains Mono | 多彩几何底、粗黑边、彩色硬投影 |
| `glass` | 极光玻璃 | 浅色通透 | Inter | 极光渐变底、毛玻璃卡片、半透明描边 |

深色主题（mecha/midnight）额外声明 `color-scheme:dark`，浏览器原生控件跟着变暗。

## 四、切换实现（原型已实现，移动端照此做）

1. `applyTheme(id)`：写 `documentElement.dataset.theme`、更新按钮上的名字与 4 色小样、`localStorage['homeops-theme']` 记住（`try/catch`，file:// 下可能被拒）。
2. 也支持 `#theme=mecha` 形式的 URL 参数，方便分享"你看这个主题"。
3. 主题选择器是一个抽屉：8 张卡片带真实色板 + 一句气质说明，点一下即时预览。
4. 待办（P1）：跟随系统深色（`prefers-color-scheme`）自动在浅色/深色主题间配对；每套主题可再配一张插画/贴纸皮肤。

## 五、新增一套主题的步骤

1. 复制任一 `html[data-theme="..."]{ }` 块，改 id 与 42 个令牌（全部要填，不要省）。
2. 在原型脚本的 `THEMES` 数组里加一条（id/名称/一句气质/4 个色板小样）。
3. 跑守卫（见下）：令牌覆盖必须 `missing=none`、对比度必须 `low/fail=0`。
4. 深色主题记得 `color-scheme:dark`；字体新引入的要在 `<link>` 里加上并用 `display=swap`。

## 六、机器守卫（防再犯）

| 脚本 | 作用 |
| --- | --- |
| `design/_raw/check-theme-contrast.mjs` | ①每套主题是否填满 42 个令牌；②10 组文字/底色 WCAG 对比度必须 ≥4.5（rgba 会先与实际底色合成再算） |
| `design/_raw/fix-theme-contrast.mjs` | 自动把不达标的文字色按亮度混合修正到 ≥4.8，并打印改了什么 |
| `design/_raw/check-html.mjs` | 抽出内联脚本做语法检查输入 + 统计标签开闭是否配平 |
| `design/_raw/check-ids.mjs` | JS 里 `$('#id')` 引用的 id 是否都真实存在于 HTML |
| `scripts/build-rn-themes.mjs --check` | 移动端（React Native）主题令牌是否与 `packages/themes/tokens.css` 一致（生成物 `mobile/src/theme/generated.ts`，不要手改） |

> 实测价值：首次跑对比度守卫就抓出 20 处不达标（例如卡哇伊主题白字压粉底只有 2.60:1、孟菲斯彩色标签只有 2.04:1），全部自动修正 —— 这类问题肉眼在小样上根本看不出来，必须机器查。

## 七、还没做

- 主题插画/吉祥物皮肤、主题音效（不承诺）。
- 字体随主题切换 = 一次加载 12 个字体族，首屏偏重；正式版按主题懒加载字体子集。
- 主题与"深色模式跟随系统"的自动配对规则。

## 八、两端一致性（同一份令牌）

| 端 | 消费方式 | 守卫 |
| --- | --- | --- |
| 静态原型 | 内联 `<style>` 里的 `html[data-theme]` 块 | `scripts/sync-theme-tokens.mjs --check` |
| 移动端（Expo/RN） | 生成 TS 对象 `mobile/src/theme/generated.ts` | `scripts/build-rn-themes.mjs --check` |

> 改主题只改 `packages/themes/tokens.css`，然后两个守卫（原型 + 移动端）都要跑过。RN 端把 px 转数字、把 "Npx Npx 0 色" 形态的硬投影转成 RN 阴影/海拔，属于**近似映射**（CSS 阴影语法无法 100% 还原），已在生成器注释里写明。

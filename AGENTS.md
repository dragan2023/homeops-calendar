# 家用仓管 App · 项目规则（只在本工作区注入）

> 项目知识写这里，不写全局 MEMORY.md。决策与进度看 `docs/决策记录.md`，主题体系看 `design/THEMES.md`。

## 零、产品形态：只做移动端（用户 2026-09-24 明确要求）
- **本项目只有移动端 App（Expo / React Native，目录 `mobile/`）**，不做网页端、不做 PWA、不做浏览器版。任何"顺手做个网页版 / 浏览器里也能用"的提议，先问用户，不要自行开工。
- `apps/web`、`scripts/check-web-tokens.mjs` 及只改 web 的一次性脚本已于 2026-09-24 删除；删除前的完整备份在 `_archive/web-removal-20260924/`（含快照文档与 MANIFEST.txt），确认无碍后可整目录删掉。
- 界面规则、主题守卫、验收脚本都只针对移动端：主题令牌链路是 `packages/themes/tokens.css` → `scripts/build-rn-themes.mjs` → `mobile/src/theme/generated.ts`，组件通过 `useTheme()` 取色。

## 一、技术约定（都是实测过的，别改）
- **Node v24.15.0 直接跑 TypeScript**：`node apps/api/src/server.ts`，没有构建步骤、没有 tsx/ts-node。
  - 因此**只能用可擦除语法**（禁 `enum`/`namespace`/`参数属性`）；**相对导入必须写全后缀**（`./stock.ts`、`./routes/auth.ts`）。
- **数据库 = `node:sqlite` 的 `DatabaseSync`**（零原生依赖，单文件）。schema 改动一律新增 `packages/db/migrations/000N_*.sql`，**不要改已发布的迁移**。
- **时间**：一律 ISO8601 字符串（UTC，`nowIso()`）；"今天"是 `YYYY-MM-DD`（`todayIso()`）。
- **金额**：整数"分"（`*_minor`），不做浮点货币。
- **所有写操作必须带 `idempotencyKey`**：`stock_transactions` 上 `UNIQUE(home_id, idempotency_key)`，重放返回首次结果（`replayed:true`）。这是防"手抖点两下入库变两份"的核心机制。
- **库存数量真相**：`stock_batches.quantity` 是当前量，`stock_transactions` 是流水账；两者必须在同一个事务里更新（`stock.ts` 的 `tx()`）。
- 认证：session cookie（`homeops_sid`，httpOnly）或 `Authorization: Bearer <api_token>`；token 只存 SHA-256 哈希。

## 二、主题与界面规则
- 组件**只允许**用语义令牌取色（移动端 `useTheme()`，令牌来自 `mobile/src/theme/generated.ts`），**不允许**在组件里写死颜色/圆角/阴影/字体；新增视觉参数先加到令牌契约（`design/THEMES.md` 的 42 项），跑 `scripts/build-rn-themes.mjs` 生成后再在每套主题里补齐。
- 加/改主题后必须跑 `node design/_raw/check-theme-contrast.mjs`：要求"令牌全覆盖 missing=none"且"对比度 low/fail=0"。
- 新增界面**只按现有令牌实现**，不另起设计语言、不出多套视觉风格（用户 2026-09-24 明确纠正）；需要挑「交互模型」时才出原型，且必须用产品现有主题呈现。
- **输入框永远不许被输入法挡住**（2026-09-24 用户实机反馈）：整屏用 `useKeyboardOverlap()`（`mobile/src/lib/keyboard.ts`）把底部让给键盘并让滚动区变矮；弹层由 `components/ui.tsx` 的 `Sheet` 自动抬起。只补「键盘高度 − 系统已压缩的窗口高度」，避免重复抬高。守卫：`mobile/src/__tests__/keyboard-guard.test.ts` 扫源码，有输入框却漏接就红。
- 默认主题＝瑞士极简（`swiss`）。

## 三、验收脚本（改完后端就跑，别靠眼睛）
```bash
node scripts/smoke.mjs          # M0：healthz / 初始化 / 登录 / 会话 / 401
node scripts/verify-m1.mjs      # M1：建物品→入库→领用(FEFO)→调拨→盘点→幂等→超量拒绝→扫码认物→批量调拨
node scripts/verify-m2.mjs      # M2：周期家务展开/临期联动/缺货买+换/对账幂等/来源消失自动关闭/日历四类事件
node scripts/verify-m3.mjs      # M3：MCP 握手/工具清单/幂等写/采购闭环/Token 撤销 + scripts/verify-m2.mjs 同款风格
node scripts/verify-m4.mjs      # M4：端到端主线（录入→日历/待办→临期→采购→入库→同步）+ SQLite 单文件搬移即恢复
node scripts/verify-mobile-api.mjs  # 移动端：登录签发 Bearer Token 后，手机要用的每个接口都能只带 Token 跑通
node scripts/build-rn-themes.mjs --check  # 移动端主题令牌与 packages/themes/tokens.css 是否一致
npm run test:mobile                       # 移动端组件/交互/主题/条码/容器/家务/键盘单测（jest-expo + @testing-library/react-native，43 项）
node scripts/check-phone-reachable.mjs   # 手机可达性自检（绑定/防火墙/局域网实连）
node design/_raw/check-theme-contrast.mjs   # 主题令牌覆盖 + 对比度
node scripts/verify-all.mjs     # 全链路回归（自动起服务，跑上面全部 + 移动端/主题守卫）
node scripts/sync-theme-tokens.mjs --check # 原型 HTML 与 packages/themes/tokens.css 是否一致
```
前置：先 `node apps/api/src/server.ts` 起服务（默认绑 0.0.0.0:8787 并打印手机可用地址，DB=./data/homeops.db；只想本机访问设 HOST=127.0.0.1）。
冒烟/验收账号：用户名 `admin`，口令**只从环境变量 `SMOKE_PASS` 读，仓库里不留任何默认口令**。`node scripts/verify-all.mjs` 会自动生成一次性随机口令并传给各子脚本；单独跑某个脚本时必须自己给 `SMOKE_PASS`，否则 exit 2 拒绝运行。正式部署请用 `set_password.bat` 改成你自己的口令。

## 四、踩过的坑（防再犯，带判据）
1. **SQLite `HAVING` 里用裸别名 = 静默错**（2026-09-21 实测）：`HAVING quantity <= i.reorder_point` 中的 `quantity` 被解析成 join 表 `stock_batches` 的真实列，而不是 `SUM(b.quantity)` 的别名 →
   无库存物品（LEFT JOIN 后该列为 NULL）**被错误排除**，有库存的物品拿任意一行的值误判。
   判据：**HAVING 里必须重写完整聚合表达式**（`HAVING IFNULL(SUM(b.quantity),0) <= i.reorder_point`）。守卫：`verify-m1.mjs` 第 12 项。
2. **Windows + Node 24：脚本末尾别用 `process.exit()`**：undici 的 keep-alive 连接未关完时强退会触发 libuv 断言
   （`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`）并让退出码变 1，看起来像测试失败。改用 `process.exitCode = ...` 让事件循环自然收尾。
3. **PowerShell 5.1 会毁 UTF-8 源码**（全局已记）：本机写文件一律用 Node/Python（显式 utf-8）或 `tools.write`，不要 `Get-Content | Set-Content`。
4. **`tools.edit` 的外部写入冲突**：用脚本改过文件后，`tools.edit` 会报 "file changed since it was read"；此时用 Node 脚本做字符串替换（本次改主题令牌、修 SQL 都是这么做的）。

5. **`tasks` 的来源唯一索引会挡住手工待办**（2026-09-21 实测）：索引是 `(home_id, kind, IFNULL(source_type,''), IFNULL(source_id,''), IFNULL(due_date,''))`。
   手工新增的待办若 `source_type='manual' / source_id=NULL`，同一天建第二条同名待办就撞唯一索引直接 500。
   判据：**手工待办的 `source_id` 必须写自己的 id**（每次唯一）。守卫：`verify-m2.mjs` 第 19 项（同一天建两条同名手工待办）。
6. **"今日待办"不能直接用范围查询**（2026-09-21）：`listTasks({to})` 用 `IFNULL(due_date,'9999-99-99') <= to` 过滤，会把**没有截止日的积压待办**（缺货联动生成的"买/换"）全部排掉——而它们恰恰是"今天该做"的主力。
   判据：今日视图单独用 `due_date IS NULL OR due_date <= today` 查询；范围查询只用于日历。守卫：`verify-m2.mjs` 第 17 项。
7. **验收脚本必须自带数据、可反复跑**（2026-09-21）：早期版本依赖"默认周期模板还会展开"，而 `syncTasks` 会把模板的 `next_due_date` 推进到滚动窗口之外，第二次跑就断言失败——**那是测试的错，不是产品的错**。
   判据：断言只针对本脚本新建的、带时间戳前缀的数据；不假定库里已有状态。

8. **验收脚本之间会共用同一个数据库**（2026-09-21）：M0 的 smoke 原本断言“分类=9、模板=2”这种**精确数量**，被 M2 脚本新增的模板一带就失败——测试互相污染。
   判据：**跨脚本共享状态时只断言存在性/下界**（≥N、含某个名字），精确数量只用于脚本自建的数据。守卫：`node scripts/verify-all.mjs` 一次跑完全部脚本必须 7/7。

9. **轮询等待"另一个进程起来"时，失败分支也必须 sleep**（2026-09-21 实测）：写成 `for (i<30 && !up) { try { up = (await fetch(...)).ok } catch { await sleep(400) } }` 时，
   如果端口已通但返回非 200（或 fetch 极快失败），30 次轮询会在**毫秒内**空转完 → 误判"服务起不来"，而且报错里什么都看不到。
   判据：用 `deadline + 无论成败每次 sleep 500ms`，并**把子进程 stdout/stderr 落进日志文件**，失败时打印尾部。守卫：`verify-m4.mjs` 第 14 项（单文件搬移，含随机端口起第二个实例）。

10. **后端只绑 127.0.0.1 → 手机必然 connect refused**（2026-09-21 实测，用户真机第一次连就撞上）：App 里地址推导是对的（显示 http://<本机局域网IP>:8787），但服务端 `netstat` 显示 `127.0.0.1:8787 LISTENING`，手机当然连不上；另外 Windows 防火墙对入站默认拦（本机原本没有任何 8787 规则）。
    判据：①`config.ts` 的 `HOST` 默认 `0.0.0.0`；②启动时打印局域网地址；③入站放行规则 `HomeOps Calendar TCP 8787` 存在。
    守卫：`node scripts/check-phone-reachable.mjs`（检查绑定地址 + 从局域网 IP 真发请求 + 防火墙规则，任一不合格就退出码 1 并给修复命令）。

## 五、启动脚本铁律（全局记忆，必须遵守）

**任何启动/重启脚本（.bat / .ps1 / npm script / docker entry）第一步必须先清理「这个软件自己的」旧进程，再启动新进程。**

- 血案（2026-09-21，真机第一次连就撞）：老后端进程仍绑 `127.0.0.1:8787`，源码已改成默认 `0.0.0.0`，用户重启了 App、重扫码，结果一模一样 —— 因为**服务根本没重启**。改了代码 ≠ 改了正在跑的程序。
- 做法：按端口定位占用进程 → 校验命令行确属本软件 → 只结束该 PID → 等端口真的释放 → 再启动。
- 安全边界：**绝不按进程名批量杀**（禁 `taskkill /IM node.exe`、`Stop-Process -Name node`）；命令行里出现 `dsh` 一律拒绝（保护宿主）。
- 本项目的实现与用法：
  - 工具：`scripts/free-port.mjs`（跨项目可复制）。用法 `node scripts/free-port.mjs <port> [期望命令性子串,...] [--any-node] [--force]`。
  - `start_backend.bat`：先清 8787 上的旧后端，再启动并打印手机可用地址。
  - `start_mobile.bat`：先清 8787（严格匹配 `apps/api/src/server.ts`）→ 起后端 → 清 8081（`--any-node`）→ 起 Metro。
  - 自检：`node scripts/check-phone-reachable.mjs`（绑定地址 / 局域网实连 / 防火墙规则，任一不合格 exit 1）。

11. **我这个会话里的后台服务会在回合之间被回收**（2026-09-21 实测）：每个 `run_in_background` 起的 `node apps/api/src/server.ts` 最终状态都是 `killed before exit`（pwsh-3..26 全如此）。
    后果：跟用户说"后端在跑，你去手机上试"是不可靠的——他去试的时候进程可能已经没了（这也是他前两次真机连不上的原因之一，另一个原因是旧进程占着 127.0.0.1）。
    判据：**验证用一次性进程**（脚本自己 spawn + 结束，如 verify-all/verify-m4）；**给用户长期跑的服务必须在他自己的窗口里**（start_backend.bat / npm start）。

12. **RN 主题生成器里 key 与 kebab 键混用导致静默覆盖**（2026-09-21，移动端单测抓到）：判断写的是 `key === 'label-tracking'`，但 `key` 已经是 camelCase（`labelTracking`）→ 条件永不成立，`--label-tracking` 与 `--label-transform` 都写进同一个字段、后者覆盖前者。
    判据：生成器里判断原始令牌时一律用 kebab 名（`k`），派生 camelCase 只用于输出键。守卫：`cd mobile && npm test`（theme.test.ts 逐令牌断言）。

13. **验收脚本跑在用户真实数据库上 = 直接毁掉他的账号体验**（2026-09-21，用户真机第一次打开就撞）：M0 的 smoke 通过 `POST /api/setup` 在 `data/homeops.db` 里建了一个 `admin` 账号，密码是当时写死在验收脚本里的一个开发口令。结果：用户打开 App 看到的是「登录」（他从没建过账号），点「初始化」又被 409 挡回（我的测试账号已占位），他永远进不去。
    判据：**所有验收脚本必须跑在临时库 + 随机端口**（`DB_PATH=./data/_verify-<pid>.db`），跑完删掉；真实库只允许由用户自己初始化。守卫：`scripts/verify-all.mjs` 现在自带隔离实例（输出会打印「隔离运行：端口 …，临时库 …」）。
    配套：客户端要先问 `GET /api/setup-status`（公开）决定显示「初始化」还是「登录」；忘记密码有 `set_password.bat`（改哈希，不需要原密码），要重来有 `reset_db.bat`（备份+清库）。

14. **深色底栏主题下，前景色不能沿用 text 令牌**（2026-09-21，用户真机截图发现「新粗野主题底栏选中项文字消失」）：新粗野的 `--nav-bg` 是纯黑 `#0A0A0A`，而 `--text` 也是 `#0A0A0A` → 黑底黑字。移动端 tabBar 直接用 `c.text` 当选中色，正好踩中。
    判据：**底栏前景必须用专门的 `--nav-fg` / `--nav-fg-active` 令牌**（9 个块都要有），组件不许用 text 当底栏前景。守卫：对比度守卫新增 `nav-fg/nav-bg`、`nav-fg-active/nav-bg` 两组配对（rgba 底色先与页面底色合成再算），要求 ≥4.5；新粗野现在 11.96 / 16.03。

15. **界面里不许把内部枚举/字段值直接渲染出来**（2026-09-21，用户要求把残留的字段名、数据表名隐去）：实际泄漏过的有 `t.kind`（chore/linked/expiry）、`source_type`（batch/item/template/manual）、`shopping.source`（auto-low）、流水 `type`（receipt/issue/adjust）、`batch_no`、SKU、FEFO 这类术语，以及主题面板里的开发说明。
    判据：渲染前一律过映射表（KIND_LABEL / SOURCE_LABEL / TX_LABEL）翻成中文业务词；开发说明不进 UI。守卫：`cd mobile && npm test` 里有 3 条用例直接扫渲染输出，出现禁用词即失败（auto-low / source_type / SKU- / batch_no / chore / linked / receipt / issue / adjust …）。

16. **测试数据会被用户当成产品数据看见**（2026-09-21，用户第二次抱怨：「M2-054277布洛芬」这种前缀还在）：验收脚本用 `tag + '-' + Date.now()` 当物品名前缀，跑完就把 101 个带前缀的假物品留在真实库里，合并前还出现 10 条同名「黄瓜」。
    判据：①验收脚本只在临时库跑（坑 13 的隔离 + 本次新增的闸门：不显式给 `BASE` 就 `exit 2` 拒绝运行）；②万一已经污染，`node scripts/clean-test-data.mjs --yes`（先自动备份）能去掉前缀并把同名同单位的重复物品合并成一条（批次/流水/待办/清单一起改挂）。
    守卫：清理脚本自身会打印「残留疑似测试名：无」；`design/_raw/verify-clean.mjs` 可复核（打印活动物品、重复名字、前缀残留计数）。

## 六、长列表规则（数据变多以后主页面不能被淹没）

**主页面上的任何列表都不许全量渲染**：只放前 N 条，超出部分用「显示全部 X 条 →」进入该门类自己的整屏页面（整屏里带返回、标题、条数，可选搜索）。

- 阈值（当前）：今日·赏味期限 4 条 / 今日·该补货了 4 条 / 待办·要买的 3 条 / 待办·今天到期 4 条 / 待办·接下来 4 条 / 库存 12 条。
- 组件（只有移动端一份）：`mobile/src/components/CollapsibleList.tsx`。
- 后端按**批次**返回临期数据，同一物品同一到期日会有多行 → 展示前必须按 `item_id + expiry_date` 合并成一行并累加数量（今日页的 `groupExpiring()`），否则用户看到的是「布洛芬 12 片」刷屏。
- 守卫：`cd mobile && npm test` 有三条用例直接测这个行为（3 个批次合并成「36 片」、9 条只显示 4 条且点「显示全部」后才出现第 6 条、40 项库存只先显示 12 条）。

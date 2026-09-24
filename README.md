# 家用仓管 App（homeops-calendar）

> 给一家人用的「家里的东西在哪、还剩多少、什么时候过期、该买什么」，外加「家里的周期活儿什么时候该做」。
> **只做移动端**（Expo / React Native，真机用 Expo Go 扫码），后端是跑在你自己电脑或 NAS 上的一个 Node 服务，数据就是一个 SQLite 单文件——拷走这个文件就等于搬走了全部数据。

---

## 一、它能干什么

| 模块 | 能力 |
| --- | --- |
| 库存 | 物品 / 批次 / 存放位置 / 保质期；入库、领用（**FEFO 先过期先出**）、调拨、盘点；数量按批次记账，流水与余额同事务更新 |
| 防手抖 | 所有写操作都带 `idempotencyKey`，同一请求重放不会入库两次（数据库层 `UNIQUE(home_id, idempotency_key)` 兜底） |
| 今日页 | 临期预警、该补货了；同一物品同一到期日的多个批次会合并成一行显示 |
| 待办 | 周期家务按模板自动展开；临期联动；缺货自动生成「买 / 换」待办；来源消失（比如已经补货）待办自动关闭 |
| 采购 | 缺货项一键进购物清单 → 收货入库 → 清单结清、待办自动关闭（幂等，可重复对账） |
| 日历 | 四类事件（周期家务 / 临期 / 采购 / 手工待办）统一进日历 |
| 扫码 | 用 `expo-camera` 扫条码认物 |
| 账号 | 用户名 + 密码（scrypt 加盐）登录；移动端签发 Bearer Token（`api_tokens` 只存 SHA-256 哈希，可撤销） |
| MCP | 后端自带 MCP 服务，外部 AI 客户端可以调用「查库存 / 建采购 / 入库」等工具 |

## 二、技术栈

- **后端**：TypeScript 直接跑（`node apps/api/src/server.ts`），**没有构建步骤**、没有 tsx/ts-node —— 靠 Node 24 的类型擦除。
  - 因此源码里**只能用可擦除语法**（禁 `enum` / `namespace`），**相对导入必须写全后缀**（`./stock.ts`）。
- **数据库**：Node 内置 `node:sqlite` 的 `DatabaseSync`，零原生依赖、单文件。schema 变更走 `packages/db/migrations/000N_*.sql`。
- **移动端**：Expo 57 / React Native 0.86 / React 19，导航用 React Navigation，单测用 jest-expo + @testing-library/react-native。
- **不需要** Postgres / Redis / Docker（Docker 只是可选的部署方式）。

## 三、目录结构

```
apps/api/src/        后端：server.ts（入口）/ stock.ts（库存核心，含幂等与事务）/ tasks.ts / auth.ts / mcp.ts / routes/*
packages/db/         SQLite 封装 + migrations/*.sql
packages/contracts/  前后端共享的类型契约
packages/themes/     tokens.css —— 8 套主题的语义令牌（唯一真源）
mobile/              Expo App：src/screens、src/components、src/theme/generated.ts（由令牌生成）
design/              design/THEMES.md（令牌契约）+ 原型 HTML + 主题守卫脚本
docs/                决策记录.md（ADR-lite）、开发计划、移动端测试用例、MCP 接入说明
scripts/             验收 / 自检 / 运维脚本（见下）
start_backend.bat    一键起后端（先清掉自己占 8787 的旧进程，再启动）
start_mobile.bat     一键起后端 + Metro（Expo Go 扫码）
set_password.bat     忘记密码：直接改哈希，不需要原密码
reset_db.bat         想彻底重来：先备份旧库再清空
```

## 四、快速开始

**环境要求**：Node ≥ 24（实测 v24.15.0）、pnpm 11.7.0；手机上装 Expo Go。

```bash
# 1) 装依赖（根目录 = 后端 + 脚本；mobile 是独立的 npm 项目）
pnpm install
cd mobile && npm install && cd ..

# 2) 起后端（默认绑 0.0.0.0:8787，并在启动时打印「手机该用哪个地址」）
node apps/api/src/server.ts        # Windows 也可以双击 start_backend.bat

# 3) 起移动端（Metro），用 Expo Go 扫终端里的二维码
cd mobile && npx expo start        # Windows 也可以双击 start_mobile.bat（会顺带清端口、起后端）
```

首次打开 App 会让你**初始化**：填家庭名 + 用户名 + 密码 —— 这个账号就是管理员，后端不预置任何账号。

> 只想自己电脑访问：`HOST=127.0.0.1 node apps/api/src/server.ts`。
> 手机连不上时先跑自检，它会指出到底是绑定地址、防火墙还是网络问题，并给出确切的修复命令：
> ```bash
> node scripts/check-phone-reachable.mjs
> ```

**可选：容器部署后端**（只跑 API，数据挂 volume）：

```bash
# compose.yaml 里的 SESSION_SECRET 请先改成随机字符串
docker compose up -d
```

## 五、验收与自检脚本

改完后端就跑，别靠眼睛。**这些脚本一律跑在临时库 + 随机端口上，不会碰你的真实数据**（真实库只允许你自己初始化）。

| 命令 | 查什么 |
| --- | --- |
| `node scripts/verify-all.mjs` | **全链路回归**：自动起隔离服务，一次跑完下面全部（临时库 `data/_verify-<pid>.db`） |
| `node scripts/smoke.mjs` | M0：healthz / 初始化 / 登录 / 会话 / 未登录 401 |
| `node scripts/verify-m1.mjs` | M1：建物品→入库→领用(FEFO)→调拨→盘点→幂等→超量拒绝→扫码认物 |
| `node scripts/verify-m2.mjs` | M2：周期家务展开 / 临期联动 / 缺货买+换 / 对账幂等 / 来源消失自动关闭 / 日历四类事件 |
| `node scripts/verify-m3.mjs` | M3：MCP 握手 / 工具清单 / 幂等写 / 采购闭环 / Token 撤销 |
| `node scripts/verify-m4.mjs` | M4：端到端主线 + SQLite 单文件搬移即恢复 |
| `node scripts/verify-mobile-api.mjs` | 移动端要用的每个接口都能只带 Bearer Token 跑通 |
| `npm run test:mobile` | 移动端组件 / 交互 / 主题 / 条码 / 长列表 / 键盘 单测 |
| `node design/_raw/check-theme-contrast.mjs` | 主题令牌全覆盖 + 对比度（要求 missing=none、low/fail=0） |
| `node scripts/build-rn-themes.mjs --check` | `tokens.css` → `mobile/src/theme/generated.ts` 是否同步 |
| `node scripts/sync-theme-tokens.mjs --check` | 原型 HTML 与 `tokens.css` 是否一致 |

> 单独跑某个验收脚本需要两个环境变量：`BASE`（要打哪个实例，不给就 exit 2 拒绝运行，防止写脏你的真实库）和 `SMOKE_PASS`（账号口令，**仓库里不存任何默认口令**）。
> 整链路用 `verify-all.mjs` 时这两样都由它自动准备（每次现生成一次性随机口令）。

## 六、主题体系

- 视觉参数的**唯一真源**是 `packages/themes/tokens.css` 里的语义令牌（42 项）；生成链路：
  `tokens.css` → `scripts/build-rn-themes.mjs` → `mobile/src/theme/generated.ts` → 组件用 `useTheme()` 取色。
- 内置 8 套主题：**瑞士极简（默认）** / 新粗野 / 柔和黏土 / 卡通粉 / 机甲 HUD / 暗夜护眼 / 孟菲斯 80s / 极光玻璃，App 内可切换。
- 组件里**不许写死颜色 / 圆角 / 阴影 / 字体**；换主题不改组件代码。新增视觉参数先加到令牌契约，再跑生成器。

## 七、安全与隐私（本项目的硬规矩）

- **密钥永不上网**：`.env` 只在本地，仓库只提交 `.env.example`；LLM / 条码等外部 key 绝不出现在代码与文档里。
- 数据库文件、`node_modules`、构建产物、`*.tsbuildinfo`、本地归档与第三方参考代码都在 `.gitignore` 里，不入库。
- **仓库里不存任何默认口令**：验收脚本的账号口令只从环境变量 `SMOKE_PASS` 读。
- API Token 只存 SHA-256 哈希，撤销即失效；密码用 scrypt 加盐存储。
- 这是**家庭内网自用**的服务：默认监听 `0.0.0.0` 方便手机连，**不要直接暴露到公网**；要外网访问请自己加反向代理 + HTTPS。

## 八、项目状态

后端 M0–M4 主线与移动端已打通，验收脚本全绿；持续在按真实使用反馈打磨界面细节。开发过程中的决策与踩过的坑记在 `docs/决策记录.md` 与 `AGENTS.md`（含每条规则的判据与守卫）。

## 九、许可

暂未指定开源许可证（仓库默认保留所有权利）。要给别人用请先加一个 LICENSE。

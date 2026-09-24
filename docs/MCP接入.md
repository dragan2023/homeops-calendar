# MCP 接入说明（给 Cherry Studio / Claude / Cline 等客户端）

## 1. 端点

| 项 | 值 |
| --- | --- |
| URL | `http://<运行服务的机器IP>:8787/mcp`（本机自测：`http://127.0.0.1:8787/mcp`） |
| 协议 | MCP Streamable HTTP（JSON-RPC 2.0，POST；无状态实现，不提供 SSE 推送，GET 返回 405 属正常） |
| 认证 | `Authorization: Bearer hpx_...`（家庭级 Token） |
| 协议版本 | 2025-06-18 |

## 2. 拿到 Token

```bash
# 1) 登录拿会话 cookie（-c 保存）
curl -c cookie.txt -H "content-type: application/json" \
  -d '{"username":"admin","password":"你的密码"}' http://127.0.0.1:8787/api/login

# 2) 签发 Token（明文只返回这一次，服务端只存 SHA-256 哈希）
curl -b cookie.txt -H "content-type: application/json" -d '{"name":"Cherry Studio"}' \
  http://127.0.0.1:8787/api/tokens
# → { "ok": true, "id": "...", "token": "hpx_xxx", "token_prefix": "hpx_8msSMyeg" }

# 3) 查看 / 撤销
curl -b cookie.txt http://127.0.0.1:8787/api/tokens
curl -b cookie.txt -X DELETE http://127.0.0.1:8787/api/tokens/<id>
```

在 Cherry Studio 里填：类型 = Streamable HTTP，URL = 上面的端点，Header 加 `Authorization: Bearer hpx_...`。

## 3. 工具清单（31 个）

**查询**：`get_home_overview`（总览，会顺带做一次待办对账）、`get_today`、`get_calendar`、`search_items`、`list_items`、`get_item`、`list_batches`、`expiring_soon`、`low_stock`、`list_locations`、`list_categories`、`list_tasks`、`list_task_templates`、`list_shopping`

**写入**：`create_item` `update_item` `delete_item` `create_location` `create_category` `record_receipt`（入库）`record_issue`（领用/FEFO）`transfer_stock`（调拨）`count_stock`（盘点）`create_task` `complete_task` `sync_tasks` `create_task_template` `add_shopping` `suggestions_to_shopping` `receive_shopping`（收货一键入库）`complete_shopping`

## 4. 约定（Agent 侧必须遵守）

- **所有库存写操作都要带 `idempotencyKey`**：同一个 key 重放不会重复记账（返回 `replayed: true`）。Agent 生成 key 建议用 `<动作>-<物品>-<时间戳>-<随机>`。
- `delete_item` 是危险操作：**先问用户**再调。
- 时间一律 `YYYY-MM-DD`；金额一律整数分（`unitCostMinor`：39.00 元 = 3900）。
- 调用失败会以 `isError: true` + 文字原因返回（例如 `insufficient_stock` 表示库存不够），不要当成功处理。

## 5. 手工验证（不装客户端也能测）

```bash
curl -s -H "content-type: application/json" -H "authorization: Bearer hpx_xxx" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' http://127.0.0.1:8787/mcp | head -c 400
```

自动化验收：`node scripts/verify-m3.mjs`（23 项，含握手 / 工具清单 / 幂等 / 采购闭环 / Token 撤销后立即 401）。

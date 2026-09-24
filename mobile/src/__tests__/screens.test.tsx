import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ThemeProvider } from "../theme";

const todayFixture = {
  ok: true,
  date: "2026-09-21",
  expiring: [{ batch_id: "b1", quantity: 3, expiry_date: "2026-09-22", item_id: "i1", name: "酸奶", base_unit: "杯", location_name: "冰箱" }],
  lowStock: [{ item_id: "i2", name: "牛奶", base_unit: "盒", reorder_point: 2, reorder_quantity: 1, quantity: 0 }],
  tasks: [{ id: "t1", title: "吃掉/用掉 酸奶", note: null, kind: "expiry", source_type: "batch", due_date: "2026-09-22", done: 0 }],
  events: [],
  shoppingPending: [],
  counts: { expiring: 1, lowStock: 1, tasks: 1, shopping: 0 },
};
const metaFixture = {
  ok: true,
  home: { id: "h1", name: "我家" },
  counts: { items: 2, batches: 3, tasks: 1, shopping: 0 },
  locations: [{ id: "L1", name: "冰箱", kind: "cold", sort_order: 10 }],
  categories: [{ id: "C1", name: "乳品" }],
  templates: [],
};
const locationsFixture = {
  ok: true,
  locations: [
    { id: "L1", parent_id: null, name: "冰箱", kind: "cold", sort_order: 10, active: 1, item_count: 1, unit_count: 3 },
    { id: "L2", parent_id: "L1", name: "冷冻室", kind: "cold", sort_order: 11, active: 1, item_count: 0, unit_count: 0 },
    { id: "L3", parent_id: null, name: "储物柜", kind: "storage", sort_order: 20, active: 1, item_count: 0, unit_count: 0 },
  ],
};
const templatesFixture = [
  { id: "tpl1", title: "清理冰箱过期区", note: null, cycle_rule: "FREQ=WEEKLY;BYDAY=SU", next_due_date: "2026-09-27", active: 1 },
];
const levelsFixture = {
  ok: true,
  levels: [{ item_id: "i1", name: "酸奶", base_unit: "杯", location_id: "L1", location_name: "冰箱", quantity: 3, first_expiry: "2026-09-22" }],
};
const itemsFixture = {
  ok: true,
  items: [{ id: "i1", sku: "SKU-00001", name: "酸奶", base_unit: "杯", consumption_type: "consumable", reorder_point: 2, default_location_id: "L1", expiry_warn_days: 7, category_name: "乳品", quantity: 3, first_expiry: "2026-09-22" }],
};

jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  const api = {
    today: jest.fn(),
    meta: jest.fn(),
    items: jest.fn(),
    item: jest.fn(),
    levels: jest.fn(),
    receipt: jest.fn(),
    levels: jest.fn(),
    issue: jest.fn(),
    tasks: jest.fn(),
    shopping: jest.fn(),
    shoppingFromLow: jest.fn(),
    receiveShopping: jest.fn(),
    completeTask: jest.fn(),
    syncTasks: jest.fn(),
    createTask: jest.fn(),
    calendar: jest.fn(),
    setupStatus: jest.fn(),
    locations: jest.fn(),
    createLocation: jest.fn(),
    updateLocation: jest.fn(),
    transferBatch: jest.fn(),
    updateItem: jest.fn(),
    taskTemplates: jest.fn(),
    createTaskTemplate: jest.fn(),
    updateTaskTemplate: jest.fn(),
  };
  return { ...actual, api, API_BASE: "http://test.local:8787" };
});

// 相机在 jest 里跑不起来：扫码面板换成假的，按下就回传一个固定条码（故意带空格，验证归一化）
jest.mock("../components/ScanBarcode", () => {
  const React2 = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    ScanSheet: ({ visible, onScanned }: { visible: boolean; onScanned: (code: string) => void }) =>
      visible
        ? React2.createElement(Pressable, { testID: "fake-scan", onPress: () => onScanned("690 1234 567892") }, React2.createElement(Text, null, "fake-scan"))
        : null,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = require("../services/api") as { api: Record<string, jest.Mock> };
const { TodayScreen } = require("../screens/TodayScreen") as { TodayScreen: React.ComponentType };
const { InventoryScreen } = require("../screens/InventoryScreen") as { InventoryScreen: React.ComponentType };
const { TasksScreen } = require("../screens/TasksScreen") as { TasksScreen: React.ComponentType };
const { CalendarScreen } = require("../screens/CalendarScreen") as { CalendarScreen: React.ComponentType };
const { LoginScreen } = require("../screens/LoginScreen") as { LoginScreen: React.ComponentType };
const { ContainersScreen } = require("../screens/ContainersScreen") as { ContainersScreen: React.ComponentType };
const { ChoresScreen } = require("../screens/ChoresScreen") as { ChoresScreen: React.ComponentType };

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return { ...actual, useNavigation: () => ({ navigate: jest.fn() }) };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { AuthProvider } = require("../contexts/AuthContext") as { AuthProvider: React.ComponentType<{ children: React.ReactNode }> };
const wrapAuth = (ui: React.ReactElement) => render(<ThemeProvider><AuthProvider>{ui}</AuthProvider></ThemeProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  api.today.mockResolvedValue(todayFixture);
  api.meta.mockResolvedValue(metaFixture);
  api.items.mockResolvedValue(itemsFixture);
  api.tasks.mockResolvedValue({ ok: true, tasks: todayFixture.tasks });
  api.levels.mockResolvedValue(levelsFixture);
  api.shopping.mockResolvedValue({ ok: true, items: [{ id: "s1", item_id: "i2", name: "牛奶", quantity: 1, unit: "盒", planned_date: "2026-09-21", source: "auto-low", completed: 0 }] });
  const TODAY = new Date().toISOString().slice(0, 10);
  api.calendar.mockResolvedValue({ ok: true, events: [{ date: TODAY, type: "expiry", title: "酸奶 到期", refId: "b1" }], byType: { expiry: 1 } });
  api.item.mockResolvedValue({ ok: true, item: itemsFixture.items[0], batches: [{ id: "b1", batch_no: "B1", quantity: 3, expiry_date: "2026-09-22", location_name: "冰箱", unit_cost_minor: null }], transactions: [] });
  api.shoppingFromLow.mockResolvedValue({ ok: true, added: ["牛奶"] });
  api.receiveShopping.mockResolvedValue({ ok: true, batchId: "nb" });
  api.completeTask.mockResolvedValue({ ok: true });
  api.receipt.mockResolvedValue({ ok: true, batchId: "nb2" });
  api.issue.mockResolvedValue({ ok: true });
  api.syncTasks.mockResolvedValue({ ok: true, created: [], reopened: [], closed: [] });
  api.createTask.mockResolvedValue({ ok: true, id: "nt" });
  api.setupStatus.mockResolvedValue({ ok: true, initialized: false, homeName: null, username: null, counts: null });
  api.locations.mockResolvedValue({ ok: true, locations: locationsFixture.locations });
  api.createLocation.mockResolvedValue({ ok: true, id: "L9" });
  api.updateLocation.mockResolvedValue({ ok: true });
  api.transferBatch.mockResolvedValue({ ok: true, replayed: false, movedItems: ["i1"], movedUnits: 3 });
  api.updateItem.mockResolvedValue({ ok: true });
  api.taskTemplates.mockResolvedValue({ ok: true, templates: templatesFixture });
  api.createTaskTemplate.mockResolvedValue({ ok: true, id: "tpl2" });
  api.updateTaskTemplate.mockResolvedValue({ ok: true });
});

describe("今日", () => {
  it("渲染统计、临期、缺货与今日提醒", async () => {
    wrap(<TodayScreen />);
    await waitFor(() => expect(screen.getByText(/1 样快过期/)).toBeTruthy());
    expect(screen.getByText(/酸奶 · 3 杯/)).toBeTruthy();
    expect(screen.getByText("牛奶")).toBeTruthy();
  });

  it("点「加清单」会调用后端把缺货加进购物清单", async () => {
    wrap(<TodayScreen />);
    await waitFor(() => expect(screen.getByText("牛奶")).toBeTruthy());
    fireEvent.press(screen.getByText("加清单"));
    await waitFor(() => expect(api.shoppingFromLow).toHaveBeenCalled());
  });

  it("点「手动录入一笔」打开录入弹层", async () => {
    wrap(<TodayScreen />);
    await waitFor(() => expect(screen.getByText("＋ 手动录入一笔")).toBeTruthy());
    fireEvent.press(screen.getByText("＋ 手动录入一笔"));
    await waitFor(() => expect(screen.getByText("随手记一笔")).toBeTruthy());
  });

  it("扫条码：认出家里已有的东西就带出名字，并把条码一起入库", async () => {
    api.items.mockResolvedValue({ ok: true, items: [{ ...itemsFixture.items[0], barcode: "6901234567892" }] });
    wrap(<TodayScreen />);
    await waitFor(() => expect(screen.getByText("扫条码")).toBeTruthy());
    fireEvent.press(screen.getByText("扫条码"));
    fireEvent.press(await screen.findByTestId("fake-scan"));
    await waitFor(() => expect(screen.getByDisplayValue("酸奶")).toBeTruthy());
    fireEvent.press(screen.getByText("入库"));
    await waitFor(() => expect(api.receipt).toHaveBeenCalledWith(expect.objectContaining({ name: "酸奶", barcode: "6901234567892" })));
  });

  it("扫条码：没见过的新条码不瞎编名字，等用户填一次", async () => {
    api.items.mockResolvedValue({ ok: true, items: [] });
    wrap(<TodayScreen />);
    await waitFor(() => expect(screen.getByText("扫条码")).toBeTruthy());
    fireEvent.press(screen.getByText("扫条码"));
    fireEvent.press(await screen.findByTestId("fake-scan"));
    await waitFor(() => expect(screen.getByText(/下次扫同一个码会自动认出来/)).toBeTruthy());
    expect(screen.queryByDisplayValue("酸奶")).toBeNull();
  });
});

describe("库存", () => {
  it("列出物品与真实地点，点开看批次", async () => {
    wrap(<InventoryScreen />);
    await waitFor(() => expect(screen.getByText(/酸奶/)).toBeTruthy());
    expect(screen.getByText("冰箱")).toBeTruthy(); // 地点筛选用真名（不是 id 前 4 位）
    fireEvent.press(screen.getByText(/酸奶/));
    await waitFor(() => expect(api.item).toHaveBeenCalledWith("i1"));
    await waitFor(() => expect(screen.getByText("入库 +1")).toBeTruthy());
  });

  it("「入库 +1」带幂等键调用后端", async () => {
    wrap(<InventoryScreen />);
    await waitFor(() => expect(screen.getByText(/酸奶/)).toBeTruthy());
    fireEvent.press(screen.getByText(/酸奶/));
    await waitFor(() => expect(screen.getByText("入库 +1")).toBeTruthy());
    fireEvent.press(screen.getByText("入库 +1"));
    await waitFor(() => expect(api.receipt).toHaveBeenCalled());
    const arg = api.receipt.mock.calls[0][0];
    expect(arg.itemId).toBe("i1");
    expect(String(arg.idempotencyKey).length).toBeGreaterThan(8);
  });
});

describe("待办与采购闭环", () => {
  it("渲染购物清单与待办，点开关会写回后端", async () => {
    wrap(<TasksScreen />);
    await waitFor(() => expect(screen.getByText(/牛奶 · 1 盒/)).toBeTruthy());
    fireEvent.press(screen.getByText(/吃掉\/用掉 酸奶/));
    await waitFor(() => expect(api.completeTask).toHaveBeenCalledWith("t1", true));
  });

  it("「收到入库」把清单行收货入库", async () => {
    wrap(<TasksScreen />);
    await waitFor(() => expect(screen.getByText("收到入库")).toBeTruthy());
    fireEvent.press(screen.getByText("收到入库"));
    await waitFor(() => expect(api.receiveShopping).toHaveBeenCalledWith("s1", expect.objectContaining({ quantity: 1 })));
  });

  it("主题面板列出 8 套主题并可切换", async () => {
    wrap(<TasksScreen />);
    await waitFor(() => expect(screen.getByText(/外观主题/)).toBeTruthy());
    fireEvent.press(screen.getByText(/外观主题/));
    await waitFor(() => expect(screen.getByText("选择主题")).toBeTruthy());
    for (const name of ["瑞士极简", "新粗野", "柔和黏土", "卡通粉", "机甲 HUD", "暗夜护眼", "孟菲斯 80s", "极光玻璃"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    fireEvent.press(screen.getByText("机甲 HUD"));
    await waitFor(() => expect(screen.getByText(/外观主题：机甲 HUD/)).toBeTruthy());
  });
});

describe("日历", () => {
  it("渲染当月与当日事件，翻月会重新拉数据", async () => {
    wrap(<CalendarScreen />);
    await waitFor(() => expect(api.calendar).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("酸奶 到期")).toBeTruthy());
    const before = api.calendar.mock.calls.length;
    fireEvent.press(screen.getByText("下月"));
    await waitFor(() => expect(api.calendar.mock.calls.length).toBeGreaterThan(before));
  });
});

describe("登录 / 初始化", () => {
  it("服务器没有账号时，自动显示初始化表单（不再让人对着登录框干瞪眼）", async () => {
    api.setupStatus.mockResolvedValue({ ok: true, initialized: false, homeName: null, username: null, counts: null });
    wrapAuth(<LoginScreen />);
    await waitFor(() => expect(screen.getByText(/这台服务器还没有账号/)).toBeTruthy());
    expect(screen.getByText("家庭名")).toBeTruthy();
    expect(screen.getByText("初始化并进入")).toBeTruthy();
    expect(screen.getByText(/你就是管理员/)).toBeTruthy();
  });

  it("服务器已有账号时显示登录，并说明账号从哪来、忘了密码怎么办", async () => {
    api.setupStatus.mockResolvedValue({ ok: true, initialized: true, homeName: "我家", username: "admin", counts: { items: 101, tasks: 3, shopping: 1 } });
    wrapAuth(<LoginScreen />);
    await waitFor(() => expect(screen.getByText(/这台服务器已经有账号了/)).toBeTruthy());
    expect(screen.getByText(/账号：admin/)).toBeTruthy();
    expect(screen.getByText(/已有 101 样物品/)).toBeTruthy();
    expect(screen.getByText(/set_password.bat/)).toBeTruthy();
  });
});

describe("界面不许出现内部字段/表名（用户看到的只能是中文业务词）", () => {
  const FORBIDDEN = ["auto-low", "source_type", "SKU-", "batch_no", "created_at", "item_id", "planned_date", "chore", "linked", "purchase", "receipt", "issue", "adjust", "transfer_in", "transfer_out"];
  const dump = () => JSON.stringify(screen.toJSON());

  it("待办页：kind / source_type 等内部值不出现，显示中文标签", async () => {
    wrap(<TasksScreen />);
    await waitFor(() => expect(screen.getByText(/牛奶 · 1 盒/)).toBeTruthy());
    const text = dump();
    for (const bad of FORBIDDEN) expect([bad, text.includes(bad)]).toEqual([bad, false]);
    expect(screen.getByText("临期处理")).toBeTruthy(); // kind=expiry 的中文标签
  });

  it("主题面板：没有开发说明文字", async () => {
    wrap(<TasksScreen />);
    await waitFor(() => expect(screen.getByText(/外观主题/)).toBeTruthy());
    fireEvent.press(screen.getByText(/外观主题/));
    await waitFor(() => expect(screen.getByText("选择主题")).toBeTruthy());
    for (const bad of ["唯一真相源", "tokens.css", "令牌", "P1", "SQLite"]) {
      expect([bad, dump().includes(bad)]).toEqual([bad, false]);
    }
    expect(screen.getByText("瑞士极简")).toBeTruthy();
  });

  it("物品详情：流水类型显示中文（入库/领用），数量不再是空白", async () => {
    api.item.mockResolvedValue({
      ok: true,
      item: { ...itemsFixture.items[0], quantity: undefined },
      batches: [{ id: "b1", batch_no: null, quantity: 3, expiry_date: "2026-09-22", location_name: "冰箱", unit_cost_minor: null }],
      transactions: [
        { id: "x1", type: "receipt", quantity: 2, reason: null, occurred_at: "2026-09-21T20:38:02.000Z" },
        { id: "x2", type: "issue", quantity: 1, reason: null, occurred_at: "2026-09-21T20:38:02.000Z" },
      ],
    });
    wrap(<InventoryScreen />);
    await waitFor(() => expect(screen.getByText(/酸奶/)).toBeTruthy());
    fireEvent.press(screen.getByText(/酸奶/));
    await waitFor(() => expect(screen.getByText(/现有 3 杯/)).toBeTruthy()); // 原来这里显示空白，因为详情接口不返回 quantity
    expect(screen.getAllByText("入库").length).toBeGreaterThan(0);
    expect(screen.getAllByText("领用").length).toBeGreaterThan(0);
    const text = dump();
    for (const bad of ["receipt", "issue", "batch_no", "无批次号"]) expect([bad, text.includes(bad)]).toEqual([bad, false]);
  });
});

describe("长列表收敛（主页面只放前几条，其余进独立整屏）", () => {
  it("今日：同物品同到期日的多个批次合并成一行", async () => {
    api.today.mockResolvedValue({
      ...todayFixture,
      expiring: [
        { batch_id: "b1", quantity: 12, expiry_date: "2026-09-24", item_id: "p1", name: "布洛芬", base_unit: "片", location_name: "药箱" },
        { batch_id: "b2", quantity: 12, expiry_date: "2026-09-24", item_id: "p1", name: "布洛芬", base_unit: "片", location_name: "药箱" },
        { batch_id: "b3", quantity: 12, expiry_date: "2026-09-24", item_id: "p1", name: "布洛芬", base_unit: "片", location_name: "药箱" },
      ],
      counts: { expiring: 3, lowStock: 0, tasks: 0, shopping: 0 },
    });
    wrap(<TodayScreen />);
    await waitFor(() => expect(screen.getByText(/布洛芬 · 36 片/)).toBeTruthy());
    expect(screen.queryByText(/布洛芬 · 12 片/)).toBeNull();
  });

  it("今日：赏味期限只放前 4 条，点「显示全部」进独立整屏能看到更多", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      batch_id: "b" + i, quantity: 1, expiry_date: "2026-09-2" + (i % 9), item_id: "p" + i, name: "物品" + i, base_unit: "个", location_name: "冰箱",
    }));
    api.today.mockResolvedValue({ ...todayFixture, expiring: many, counts: { expiring: 9, lowStock: 0, tasks: 0, shopping: 0 } });
    wrap(<TodayScreen />);
    await waitFor(() => expect(screen.getByText(/物品0 · 1 个/)).toBeTruthy());
    expect(screen.queryByText(/物品6 · 1 个/)).toBeNull();
    fireEvent.press(screen.getByText(/显示全部 9 条/));
    await waitFor(() => expect(screen.getByText(/物品6 · 1 个/)).toBeTruthy());
  });

  it("库存：40 项只先显示 12 条，显示全部后能看到更多", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: "i" + i, sku: "SKU-" + i, name: "物品" + i, base_unit: "个", consumption_type: "consumable", reorder_point: 0,
      default_location_id: "L1", expiry_warn_days: 7, category_name: "乳品", quantity: 1, first_expiry: "2026-09-25",
    }));
    api.items.mockResolvedValue({ ok: true, items: many });
    wrap(<InventoryScreen />);
    await waitFor(() => expect(screen.getByText(/物品0/)).toBeTruthy());
    expect(screen.queryByText(/物品30/)).toBeNull();
    fireEvent.press(screen.getByText(/显示全部 40 条/));
    await waitFor(() => expect(screen.getByText(/物品30/)).toBeTruthy());
  });
});

describe("容器与日期选择（2026-09-24 新增）", () => {
  it("放哪儿：点行打开容器弹窗，选中后写回", async () => {
    wrap(<TodayScreen />);
    fireEvent.press(await screen.findByText("＋ 手动录入一笔"));
    await waitFor(() => expect(screen.getByText("随手记一笔")).toBeTruthy());
    fireEvent.press(screen.getByTestId("pick-location"));
    await waitFor(() => expect(screen.getByText("放到哪里")).toBeTruthy());
    expect(screen.getByText("1 样 · 3 件")).toBeTruthy();
    fireEvent.press(screen.getByTestId("loc-L3"));
    await waitFor(() => expect(screen.queryByText("放到哪里")).toBeNull());
  });

  it("到期日：点行打开自绘月历，快捷块一键落值", async () => {
    wrap(<TodayScreen />);
    fireEvent.press(await screen.findByText("＋ 手动录入一笔"));
    fireEvent.press(await screen.findByTestId("pick-expiry"));
    await waitFor(() => expect(screen.getByText("什么时候到期")).toBeTruthy());
    fireEvent.press(screen.getByText("7 天后"));
    await waitFor(() => expect(screen.queryByText("什么时候到期")).toBeNull());
  });

  it("容器页：新建 / 改名 / 把容器里的东西整批搬走", async () => {
    wrap(<ContainersScreen />);
    await waitFor(() => expect(screen.getByText(/在用容器/)).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText("容器名字"), "药箱");
    fireEvent.press(screen.getByText("建立这个容器"));
    await waitFor(() => expect(api.createLocation).toHaveBeenCalledWith(expect.objectContaining({ name: "药箱" })));

    fireEvent.press(screen.getAllByText("改名")[0]);
    fireEvent.changeText(screen.getByPlaceholderText("新名字"), "冰箱A");
    fireEvent.press(screen.getByText("保存"));
    await waitFor(() => expect(api.updateLocation).toHaveBeenCalledWith("L1", { name: "冰箱A" }));

    fireEvent.press(screen.getByText("冰箱"));
    fireEvent.press(await screen.findByTestId("item-i1"));
    fireEvent.press(screen.getByText(/把选中的 1 样搬到/));
    fireEvent.press(await screen.findByTestId("loc-L3"));
    await waitFor(() => expect(api.transferBatch).toHaveBeenCalledWith(expect.objectContaining({ itemIds: ["i1"], fromLocationId: "L1", toLocationId: "L3" })));
  });

  it("周期家务：列出现有家务并用人话描述周期，新建后立刻排进待办", async () => {
    wrap(<ChoresScreen />);
    await waitFor(() => expect(screen.getByText("清理冰箱过期区")).toBeTruthy());
    expect(screen.getByText(/每周日 · 下次 2026-09-27/)).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText(/例如 刷洗饮水机/), "换净水滤芯");
    fireEvent.press(screen.getByText("建立这件家务"));
    await waitFor(() => expect(api.createTaskTemplate).toHaveBeenCalledWith(expect.objectContaining({ title: "换净水滤芯", cycleRule: "FREQ=WEEKLY;BYDAY=SU" })));
    await waitFor(() => expect(api.syncTasks).toHaveBeenCalled());
  });

  it("库存详情能改「低于多少提醒补货」和「到期前几天提醒」", async () => {
    wrap(<InventoryScreen />);
    await waitFor(() => expect(screen.getByText(/酸奶/)).toBeTruthy());
    fireEvent.press(screen.getByText(/酸奶/));
    await waitFor(() => expect(screen.getByText("低于多少提醒补货（杯）")).toBeTruthy());
    fireEvent.changeText(screen.getByDisplayValue("2"), "5");
    fireEvent.press(screen.getByText("保存这两个数"));
    await waitFor(() => expect(api.updateItem).toHaveBeenCalledWith("i1", { reorderPoint: 5, expiryWarnDays: 7 }));
  });
});

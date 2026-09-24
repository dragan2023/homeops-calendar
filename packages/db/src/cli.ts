import { openAndMigrate } from "./index.ts";

const dbPath = process.env.DB_PATH ?? "./data/homeops.db";
const { ran } = openAndMigrate(dbPath);
console.log(ran.length ? "已执行迁移: " + ran.join(", ") : "数据库已是最新");

-- 待办去重：同一来源（批次/物品/模板+发生日）只允许存在一条待办。
-- 这样 syncTasks 可以做成"对账"式：随时调用都安全，靠唯一索引兜底防止重复生成。
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_source_unique
  ON tasks(home_id, kind, IFNULL(source_type,''), IFNULL(source_id,''), IFNULL(due_date,''));

CREATE INDEX IF NOT EXISTS idx_tasks_open_due ON tasks(home_id, done, due_date, kind);

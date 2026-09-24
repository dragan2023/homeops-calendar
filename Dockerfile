# 单容器部署：只跑 API（移动端 App 通过局域网连它）；数据落 /data（挂 volume）
FROM node:24-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
RUN pnpm install --no-frozen-lockfile

ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 DB_PATH=/data/homeops.db
VOLUME ["/data"]
EXPOSE 8787
# 只提供 API：移动端 App 直接连 http://<主机IP>:8787（本项目不做网页端）
CMD ["node", "apps/api/src/server.ts"]

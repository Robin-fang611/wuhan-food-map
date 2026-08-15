# 蛮有味后端 · Docker 镜像（2026-08-15）
# 后端零 npm 依赖（仅 Node 内置模块 + h5 纯 ESM 数据/逻辑），镜像极简。
FROM node:22-alpine
WORKDIR /app
COPY hypha ./hypha
COPY h5 ./h5
COPY scripts ./scripts
COPY deploy ./deploy
COPY .env.example ./
ENV NODE_ENV=production
EXPOSE 8799
CMD ["node", "hypha/implementation/src/httpServer.js"]

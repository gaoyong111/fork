# ============================================
# 阶段 1: 构建阶段
# 安装依赖并构建前端和后端
# ============================================
FROM node:22-alpine AS build

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 安装 better-sqlite3 编译所需的构建工具
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制 workspace 配置和 lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/web/package.json ./packages/web/
COPY packages/server/package.json ./packages/server/

# 安装所有依赖（包括 devDependencies，构建需要）
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY packages/web/ ./packages/web/
COPY packages/server/ ./packages/server/

# 构建前端和后端
RUN pnpm build:web && pnpm build:server

# ============================================
# 阶段 2: 生产阶段
# 只包含运行所需文件
# ============================================
FROM node:22-alpine AS production

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 安装 better-sqlite3 运行时所需的系统依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

# 复制 workspace 配置和 lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/web/package.json ./packages/web/
COPY packages/server/package.json ./packages/server/

# 只安装生产依赖
RUN pnpm install --frozen-lockfile --prod

# 从构建阶段复制产物
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/packages/server/dist ./packages/server/dist

# 创建非 root 用户
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# 创建数据和上传目录
RUN mkdir -p /app/data /app/uploads && chown -R appuser:appgroup /app

# 切换到非 root 用户
USER appuser

# 数据持久化目录
VOLUME ["/app/data", "/app/uploads"]

# 环境变量
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# 启动后端服务
CMD ["node", "packages/server/dist/index.js"]

# 后端生产镜像：多阶段构建，运行时只保留 dependencies（不含 devDependencies）
# 使用 glibc 基础镜像以保证 @libsql/client 的 Linux x64 native 绑定可用（alpine/musl 无预编译绑定）
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx esbuild src/node.ts --bundle --platform=node --format=cjs --packages=external --outfile=dist/node.cjs

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 8787
CMD ["node", "dist/node.cjs"]

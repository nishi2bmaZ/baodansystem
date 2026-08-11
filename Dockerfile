FROM node:20-alpine

WORKDIR /app

# Prisma 在 alpine 上需要 openssl
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src
COPY public ./public

RUN npm run build

EXPOSE 3000

# 启动时把数据库表结构同步到库（开发期用 db push，生产再切 migrate）
# 增加重试：等 PostgreSQL 真正就绪再建表，避免 depends_on 只等容器启动导致的竞态失败
CMD ["sh", "-c", "for i in $(seq 1 30); do npx prisma db push --skip-generate --accept-data-loss && break; echo \"[等待数据库就绪] 第 $i 次重试...\"; sleep 3; done; node dist/main.js"]

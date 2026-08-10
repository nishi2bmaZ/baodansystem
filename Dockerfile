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

RUN npm run build

EXPOSE 3000

# 启动时把数据库表结构同步到库（开发期用 db push，生产再切 migrate）
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/main.js"]

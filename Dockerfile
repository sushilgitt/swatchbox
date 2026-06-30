FROM node:20-alpine

RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

# Lean, memory-friendly install (prod deps only). The Vite build tool lives in
# "dependencies" so the build still works without pulling all devDependencies.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY . .

RUN npm run build

# docker-start runs: prisma generate && prisma migrate deploy && remix-serve
CMD ["npm", "run", "docker-start"]

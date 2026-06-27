FROM node:18-alpine

RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

# Install ALL deps (incl. dev) so the Remix/Vite build can run.
# NODE_ENV is intentionally not "production" here, otherwise npm would skip devDependencies.
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force

COPY . .

RUN npm run build

# Runtime is production.
ENV NODE_ENV=production

# docker-start runs: prisma generate && prisma migrate deploy && remix-serve
CMD ["npm", "run", "docker-start"]

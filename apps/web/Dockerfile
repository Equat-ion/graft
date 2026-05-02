# Next.js dev image. For production use a multi-stage build with `next build`.
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]

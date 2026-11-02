FROM node:24-alpine AS build

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/server/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/protocol ./packages/protocol
COPY packages/world-state ./packages/world-state
RUN npm install
RUN npm run build --workspace=@polis/protocol
RUN npm run build --workspace=@polis/world-state

FROM node:20-slim
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/packages/world-state
EXPOSE 41241
CMD ["node", "dist/start.js"]

FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/protocol ./packages/protocol
COPY packages/agent-runtime ./packages/agent-runtime
RUN npm install
RUN npm run build --workspace=@polis/protocol
RUN npm run build --workspace=@polis/agent-runtime

FROM node:20-slim
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/packages/agent-runtime
CMD ["node", "dist/start.js"]

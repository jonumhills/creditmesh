FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm install
RUN npx tsc

EXPOSE 3002

CMD ["node", "dist/index.js"]

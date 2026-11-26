FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev
RUN npx playwright install --with-deps chromium

COPY . .

ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/data

RUN mkdir -p /data
EXPOSE 8787

CMD ["npm", "start"]

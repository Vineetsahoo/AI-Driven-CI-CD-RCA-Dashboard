FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend ci

COPY . .

# Build frontend assets so Express can serve frontend/dist in production.
RUN npm --prefix frontend run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]

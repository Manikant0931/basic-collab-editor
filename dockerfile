
# Build the Frontend
FROM node:20-alpine AS frontend-builder

COPY ./Frontend /app
WORKDIR /app

RUN npm install
RUN npm run build

# Build the Backend
FROM node:20-alpine

COPY ./Backend /app
WORKDIR /app

RUN npm install

# Copy production frontend build into backend public directory
COPY --from=frontend-builder /app/dist /app/public

EXPOSE 80

CMD ["node", "server.js"]

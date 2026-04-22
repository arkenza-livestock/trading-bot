FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install
COPY backend/ ./backend/
COPY frontend/ ./frontend/
RUN cd frontend && npm run build
RUN mkdir -p /app/data
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "server.js"]

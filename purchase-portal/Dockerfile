FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./

# npm ci (more reliable than npm install in Docker)
RUN npm ci --legacy-peer-deps

COPY . .

# Build with increased memory
RUN NODE_OPTIONS=--max-old-space-size=2048 npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
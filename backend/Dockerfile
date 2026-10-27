FROM node:24-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Prisma config requires DATABASE_URL during build.
# This placeholder is only for generating Prisma Client.
ENV DATABASE_URL="postgresql://postgres:build_placeholder@localhost:5432/brewlite_db?schema=public"

RUN npx prisma generate

RUN npm run build

EXPOSE 3001

CMD ["node", "dist/main"]
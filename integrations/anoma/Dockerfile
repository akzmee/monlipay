FROM node:22-alpine
WORKDIR /app/integrations/anoma
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY test ./test
COPY monad-reference.json ./
USER node
CMD ["npm", "test"]

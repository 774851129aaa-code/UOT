FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y 
python3 
python3-pip 
ffmpeg 
ca-certificates 
&& rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages --no-cache-dir --upgrade "yt-dlp[default]"

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p /var/data

ENV NODE_ENV=production
ENV DATA_DIR=/var/data

EXPOSE 3000

CMD ["npm", "start"]

# Base image
FROM node:18

# Cài Python và pip
RUN apt-get update && apt-get install -y python3 python3-pip ffmpeg

# Thiết lập thư mục làm việc chính
WORKDIR /app

# Copy và cài dependencies Node.js
COPY /package*.json ./
WORKDIR /app/
RUN npm install

# Copy toàn bộ source code Node.js (gồm cả .env)
COPY / ./
# Copy Python requirements và cài đặt
WORKDIR /app/
COPY /requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Copy toàn bộ source code Python
COPY / ./
#tìm thằng lồn j.js
RUN echo "Listing node_app files:" && ls -la /app/
# Quay lại thư mục chính để khởi động
WORKDIR /app
RUN npm install dotenv
RUN npm install express
RUN npm install path
RUN npm install googleapis
RUN npm install youtube-dl-exec
RUN npm install cors
RUN npm install axios
RUN npm install tmp
RUN npm install ffmpeg
# Thiết lập biến môi trường mặc định
ENV PORT=3000

# Lệnh khởi chạy ứng dụng Node.js
CMD ["node", "j.js"]

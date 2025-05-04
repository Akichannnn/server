# Base image
FROM node:18

# Cài Python và pip
RUN apt-get update && apt-get install -y python3 python3-pip

# Tạo thư mục app
WORKDIR /app

# Sao chép và cài đặt dependencies Node.js
COPY node_app/package*.json ./node_app/
WORKDIR /app/node_app
RUN npm install

# Sao chép toàn bộ mã nguồn Node.js
COPY node_app/ ./

# Sao chép và cài đặt Python dependencies
WORKDIR /app
COPY python_script/requirements.txt ./python_script/
RUN pip3 install --no-cache-dir -r python_script/requirements.txt

# Sao chép toàn bộ mã nguồn Python
COPY python_script/ ./python_script/

# Thiết lập biến môi trường
ENV PORT=9898

# Lệnh khởi chạy Node.js app
CMD ["node", "node_app/j.js"]
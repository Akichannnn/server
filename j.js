require("dotenv").config();
const express = require("express");
const path = require("path");
const youtubedl = require("youtube-dl-exec");
const { google } = require("googleapis");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Cấu hình YouTube API (sử dụng googleapis)
const api_key = process.env.API_KEY;
const youtube = google.youtube({
  version: 'v3',
  auth: api_key
});
const googleAuth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
const ASSETS_PATH = path.join(__dirname,"audio");
if(fs.existsSync(ASSETS_PATH)){
  fs.mkdirSync(ASSETS_PATH,{
    recursive: true
  });
}

// Route /audio: tải xuống audio từ YouTube bằng yt-dlp-exec và stream về client

app.get("/audio", async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send("Thiếu ID video!");

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(ASSETS_PATH, `${videoId}.mp3`);

  try {
    if (!fs.existsSync(outputPath)) {
      await youtubedl(videoUrl, {
        output: outputPath,
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: '64K',
        cookies: "./cookies.txt",
        ffmpegLocation: '/usr/bin/ffmpeg'
      });
    }

    const stat = fs.statSync(outputPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const file = fs.createReadStream(outputPath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "audio/mpeg",
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": "audio/mpeg",
      });
      fs.createReadStream(outputPath).pipe(res);
    }
  } catch (error) {
    console.log("Lỗi ở /audio", error);
    res.status(500).send("Có lỗi xảy ra khi tải hoặc phát audio!");
  }
});
// Route /info: lấy thông tin video từ YouTube sử dụng yt-dlp-exec
app.get("/info", async (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).send("Missing video ID");
  }
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log("Video URL:", videoUrl);
  
  try {
    // Sử dụng yt-dlp-exec để trích xuất thông tin video dưới dạng JSON
    const info = await youtubedl(videoUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true
    });
    console.log("Thông tin video đã đc lấy!");
    res.json({
      title: info.title,
      id: info.id,
      description: info.description,
      duration: info.duration,
      thumbnail: info.thumbnail
    });
  } catch (error) {
    console.log("Lỗi ở /info:", error);
    res.status(500).send("Có lỗi xảy ra khi tải thông tin video!");
  }
});

// Route /search: tìm kiếm video trên YouTube thông qua API của googleapis
app.get("/search", async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).send("Missing search query");
    }
    
    const response = await youtube.search.list({
      part: 'snippet',
      q: query,
      maxResults: 10,
      type: 'video'
    });
    
    const videos = response.data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium.url,
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt
    }));
    
    res.json(videos);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// Route /playlist: lấy danh sách phát từ playlist YouTube
app.get("/playlist", async (req, res) => {
  try {
    const playlistId = req.query.id;
    if (!playlistId) {
      return res.status(400).send("Missing playlist ID");
    }
    
    const response = await youtube.playlistItems.list({
      part: 'snippet',
      playlistId: playlistId,
      maxResults: 50
    });
    
    const playlistItems = response.data.items.map(item => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium?.url,
      position: item.snippet.position
    }));
    
    res.json(playlistItems);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});
app.get("/api/suggestions", async (req, res) => {
  const query = req.query.q;

  // Validate query parameter
  if (!query || typeof query !== "string" || query.trim() === "") {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  try {
    const response = await axios.get(
      `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}&hl=vi`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36",
        },
      }
    );

    let result;
    const data = response.data;

    try {
      if (typeof data === "string") {
        // Handle string response (JSONP format)
        const jsonStr = data.substring(data.indexOf("(") + 1, data.lastIndexOf(")"));
        const jsonData = JSON.parse(jsonStr);
        // Validate data structure
        if (!Array.isArray(jsonData) || !jsonData[1] || !Array.isArray(jsonData[1])) {
          throw new Error(
            `Invalid data structure. Expected array with array at index 1, got: ${JSON.stringify(jsonData)}`
          );
        }

        // Map suggestions to desired format
        result = jsonData[1].map((item) => ({
          title: typeof item === "string" ? item : item[0],
        })).slice(0,10);
      } else {
        // Handle JSON response
        // Validate data structure
        if (!Array.isArray(data) || !data[1] || !Array.isArray(data[1])) {
          throw new Error(
            `Invalid data structure. Expected array with array at index 1, got: ${JSON.stringify(data)}`
          );
        }

        // Map suggestions to desired format
        result = data[1].map((item) => ({
          title: typeof item === "string" ? item : item[0],
        })).slice(0,10)
      }

      return res.status(200).json(result);
    } catch (parseError) {
      console.error("Error parsing response:", parseError.message);
      return res.status(500).json({ error: "Error processing response data" });
    }
  } catch (error) {
    console.error("Error in /api/suggestions:", error.message);
    return res.status(500).json({
      error: "Failed to fetch suggestions",
      details: error.message,
    });
  }
});
app.get("/login/google", (req, res) => {
  const OAuth2Url = googleAuth.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"],
  });
  res.redirect(OAuth2Url);
});

app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await googleAuth.getToken(code);
    googleAuth.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: googleAuth,
      version: "v2",
    });

    const userInfo = await oauth2.userinfo.get();
    res.json(userInfo.data);
  } catch (error) {
    console.error("Lỗi ở /auth/google/callback!", error);
    res.status(500).send("Lỗi xác thực.");
  }
});
app.listen(port, () => {
  console.log(`Ứng dụng đang chạy ở http://localhost:${port}!`);
});

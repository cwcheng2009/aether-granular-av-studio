# AETHER // 粒子聲音合成與即時視覺特效實驗室 (Granular AV Studio)

這是一個零外部依賴、可直接在瀏覽器線上運行的**聲音粒子化合成（Granular Synthesis）**與**即時音訊反應視覺特效（Real-time Audio-Reactive Visual FX）**互動網站，專為線上創作、演出與公開部署上架所設計。

## 核心功能

1. **三合一聲音粒子訊號源**：
   - **音檔粒子 (Sampler)**：支援拖放或點擊載入任意 `MP3` / `WAV` / `OGG` 音訊檔案，亦內建 4 種程序化生成的立體聲取樣（星際合唱、水晶琶音、電子人聲共振、深海低頻脈衝）。
   - **麥克風即時粒子 (Live Mic)**：透過瀏覽器即時擷取麥克風聲音寫入 4 秒循環緩衝區（Ring Buffer），可隨時點擊 **Freeze（凍結）** 將當下的人聲或樂器聲化為永恆的粒子雲。
   - **振盪器粒子雲 (Synth Cloud)**：支援正弦波、鋸齒波、三角波、方波與 FM 金屬調變，並內建五聲音階、夢幻大七和弦等音階量化。
2. **完整的聲音粒子化合成器 (Granular Engine)**：
   - 即時控制掃描位置 (Position)、擴散範圍 (Spray)、粒子長度 (15ms ~ 450ms)、發射密度 (最高 65 顆/秒)、半音移調、隨機微調 (Shimmer)、包絡線對稱度與立體聲寬度。
   - 內建低通共鳴濾波器 (Lowpass Resonant Filter)、立體聲乒乓延遲 (Stereo Ping-Pong Delay) 與太空殘響 (Space Reverb)。
3. **即時粒子影像特效與視訊鏡頭融合**：
   - 內建 4 種音訊反應視覺模式：**流體粒子星雲 (Swarm)**、**頻譜引力漩渦 (Vortex)**、**賽博波浪矩陣 (CyberGrid)**、**幾何聲波萬花筒 (Kaleidoscope)**。
   - 支援開啟 **視訊鏡頭粒子投影 (Webcam FX)**，讓數千顆發光粒子吸附在您的鏡頭輪廓與色彩上，並隨重低音觸發 RGB 色差分離故障特效 (Glitch)。
4. **一鍵錄製 MP4 影音匯出**：
   - 點擊右上角「錄製 MP4」即可將畫布視覺與合成器立體聲音訊同步錄製並下載為 `.mp4` 高畫質影片（自動優先使用 H.264/AAC MP4 封裝）。

---

## 本地端預覽方式

在專案目錄下啟動任意靜態網頁伺服器即可：

```bash
cd "granular-av-studio"
python3 -m http.server 8080
```

接著打開瀏覽器前往 `http://localhost:8080`。

---

## 如何免費上架部署讓大家使用？

由於本專案採用純標準 Web API（Web Audio API + HTML5 Canvas + MediaStream API）打造，無需複雜後端即可直接部署至各大免費 CDN 平台（且自動享有 `HTTPS`，確保麥克風與視訊鏡頭權限正常運作）：

### 方法一：Vercel / Netlify（推薦，拖放即上架）
1. 前往 [Netlify Drop](https://app.netlify.com/drop) 或登入 [Vercel](https://vercel.com/)。
2. 直接將整個 `granular-av-studio` 資料夾拖曳上傳。
3. 數秒內即可獲得一個公開的 `https://...` 網址分享給所有人使用！

### 方法二：GitHub Pages
1. 將 `granular-av-studio` 內的檔案推送到您的 GitHub Repository。
2. 在 Repository 的 **Settings -> Pages** 中，選擇 `main` 分支並儲存，即可免費獲得公開網址。

### 方法三：Cloudflare Pages
1. 登入 Cloudflare Dashboard -> **Workers & Pages** -> **Create application** -> **Pages** -> **Upload assets**。
2. 上傳 `granular-av-studio` 資料夾即可發佈至全球邊緣網路。

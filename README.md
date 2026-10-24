# Ilab // 粒子聲音合成與即時視覺特效實驗室 (Granular AV Studio v2.8)

> **線上體驗網址**：[https://cwcheng2009.github.io/aether-granular-av-studio/](https://cwcheng2009.github.io/aether-granular-av-studio/)  
> **研究室網站**：[鄭建文數位音樂與互動科技研究室 (https://cwcheng2009.blogspot.com/)](https://cwcheng2009.blogspot.com/)  
> **所屬單位**：互動設計系暨研究所 · 互動音樂與多媒體實驗室 (ILAB) · 實驗室主持人：鄭建文

---

這是一個零外部依賴、純純標準 Web API（Web Audio API + HTML5 Canvas + MediaStream API）打造的**線上聲音粒子化合成（Granular Synthesis）**與**即時音訊反應視覺特效（Real-time Audio-Reactive Visual FX）**互動系統，專為線上創作、展演、跨領域教學與行動裝置體驗所設計。

---

## 🌟 核心功能特色 (v2.8)

### 1. 三合一聲音粒子訊號源
* **音檔粒子 (Sampler)**：支援拖放或點擊載入任意 `MP3` / `WAV` / `OGG` 音訊檔案，內建 4 組程序化生成的立體聲取樣（星際合唱、水晶琶音、電子人聲共振、深海脈衝）。
* **麥克風即時粒子 (Live Mic)**：即時收錄麥克風訊號寫入循環緩衝區，隨時點擊 **Freeze（凍結）** 將片刻聲響凝結為永恆演化的粒子雲。
* **振盪器粒子雲 (Synth Cloud)**：支援正弦波、鋸齒波、三角波、方波與 FM 金屬調變，內建五聲音階、夢幻大七和弦等多種音樂音階量化。

### 2. 超廣域聲音粒子合成引擎 (>2x 擴增刻度)
* **發射密度 (Density)**：支援 **`0.5 ~ 200 顆/秒`** 對數刻度調節，從極稀疏孤獨水滴聲至極高密度的星際聲雲一應俱全。
* **粒子長度 (Size)**：支援 **`5 ~ 1500 ms`** 對數刻度調節，涵蓋微粒打擊敲擊感至 1.5 秒悠長環境音牆。
* **多維微音細節**：即時控制掃描位置 (Position)、擴散範圍 (Spray)、半音移調 (-24 ~ +24 半音)、Shimmer 隨機微調、包絡線對稱度與立體聲空間擺位。
* **高品質音訊效果器 (FX)**：內建低通共鳴濾波器 (Lowpass Resonant Filter)、立體聲乒乓延遲 (Ping-Pong Delay) 與太空殘響 (Space Reverb)。

### 3. 無斷點平滑演化引擎 (Smooth Glide & Dwell Plateau Engine)
* **消除突兀跳躍**：徹底消滅傳統鋸齒波循環造成的斷崖式驟降，改以專利設計的連續餘弦 S 曲線與指數平滑滑行層（Glide）。
* **極端精準駐留 (Dwell Plateaus & Snap)**：在由慢到快（`accel`）、由快到慢（`decel`）與呼吸來回（`pendulum`）模式中，自動於極小值與極大值兩端飽和停留數秒並端點吸附，保證聽感上 100% 完整抵達最極致的聲音質地。
* **AUTO RANGE 自訂演化範圍**：使用者可在控制面板自由輸入演化時的「最慢/最快速度」、「最短/最長時長」與「漸變平滑秒數」，並支援本機快取記憶與一鍵重設。

### 4. 即時音像視覺特效與視訊體感融合
* **4 種音訊反應視覺模式**：流體粒子星雲 (Swarm)、頻譜引力漩渦 (Vortex)、賽博波浪矩陣 (CyberGrid)、幾何聲波萬花筒 (Kaleidoscope)。
* **視訊鏡頭體感發聲 (Webcam Motion FX)**：開啟視訊鏡頭後，數千顆發光粒子吸附於鏡頭輪廓，揮手即可依動作能量隔空觸發聲音粒子，並隨重低音產生色差分離故障特效 (Glitch)。

### 5. 雙 QR Code 展演光板與 Ilab 實驗室介紹
* 頂部與面板整合 **Ilab 品牌識別向量徽標** 與 **雙 QR Code 展演卡片**：
  * **QR Code ①**：本軟體線上版網頁（手機相機掃描即開即玩，支援多點體感觸控）。
  * **QR Code ②**：鄭建文老師個人網站 / 部落格（探索更多互動音像、聲音設計與科技藝術研究）。
  * 支援一鍵複製網址與沉浸式毛玻璃彈跳視窗展示。

### 6. 專業匯出與錄製支援
* **錄音 WAV**：一鍵錄製 32-bit Float / 44.1kHz 無損立體聲 WAV 音檔。
* **錄影 MP4**：同步將視覺畫布與合成音訊錄製封裝為高畫質 MP4 影片。
* **行動端適配**：手機與平板支援專屬浮動展開紐（FAB）與單指/多點全螢幕觸控拖曳演奏。

---

## 🚀 本地端運行

```bash
git clone https://github.com/cwcheng2009/aether-granular-av-studio.git
cd aether-granular-av-studio
python3 -m http.server 8080
```
瀏覽器造訪：`http://localhost:8080`

---

## 🌐 授權與引用

* **版權所有**：互動設計系暨研究所 · 互動音樂與多媒體實驗室 (ILAB)
* **實驗室主持人**：鄭建文 (Prof. Chien-Wen Cheng)
* **開源授權**：MIT License

/**
 * Ilab // GRANULAR AV STUDIO
 * 線上聲音粒子化合成 (Granular Synthesis) 與即時音訊反應視覺特效引擎
 * 支援三大訊號源：
 *  1. 音檔粒子 (Sampler) - 支援上傳任意音檔與 4 種高質感程序化合成取樣
 *  2. 麥克風即時粒子 (Live Mic) - 4 秒循環緩衝區即時收音切片與凍結 (Freeze)
 *  3. 振盪器粒子雲 (Synth Cloud) - 多波形音階量化 FM 粒子合成器
 */

(() => {
  'use strict';

  // ==========================================
  // 全域狀態與參數設定
  // ==========================================
  const state = {
    isRunning: false,
    isHold: false,
    isPointerDown: false,
    sourceMode: 'file', // 'file' | 'mic' | 'osc'
    micFrozen: false,
    webcamActive: false,

    // 畫布互動座標 (0 ~ 1)
    pointerX: 0.35,
    pointerY: 0.5,
    pointerVX: 0,
    pointerVY: 0,

    // 聲音粒子合成參數
    grain: {
      position: 0.35,    // 0 ~ 1
      spread: 0.15,      // 0 ~ 0.8
      sizeMs: 120,       // 15 ~ 450 ms
      density: 22,       // 每秒發射粒子數 (2 ~ 65)
      pitchSemitones: 0, // -24 ~ +24 半音
      detune: 12,        // 0 ~ 100 隨機微調
      attackRatio: 0.5,  // 0.1 ~ 0.9 粒子包絡線對稱度
      stereoPan: 0.75    // 0 ~ 1 立體聲擴散
    },

    // 振盪器粒子雲專屬參數
    osc: {
      waveform: 'sawtooth',
      scale: 'pentatonic',
      baseFreq: 130.81,
      fmDepth: 18
    },

    // 效果器參數
    fx: {
      cutoff: 4200,
      resonance: 2.5,
      delayMix: 0.35,
      reverbMix: 0.45,
      masterGain: 0.8
    },

    // 視覺特效參數
    visual: {
      mode: 'swarm', // 'swarm' | 'vortex' | 'cybergrid' | 'kaleidoscope'
      palette: 'cyberpunk',
      count: 2400,
      reactivity: 1.4,
      turbulence: 0.65,
      trails: 0.86,
      glitch: 0.35,
      particleSize: 2.2,
      camOpacity: 0.65, // 0 ~ 1 攝影機背景影像疊加亮度
      camClarity: 1.0   // 0 ~ 1 攝影機背景影像清晰度 (1 = 銳利清晰, 0 = 夢幻柔焦模糊)
    },

    // 執行期統計與視訊鏡頭體感偵測狀態
    activeGrainsCount: 0,
    recentGrainTriggers: [], // 儲存最近觸發的聲粒供波形圖與視覺爆發顯示
    camMotionEnergy: 0,      // 0 ~ 1 鏡頭畫面動作能量
    camMotionX: 0.5,         // 鏡頭動作重心 X (0 ~ 1)
    camMotionY: 0.5,         // 鏡頭動作重心 Y (0 ~ 1)

    // 自動演化與速度漸變參數 (02 區塊 8 個參數皆可獨立設定「手動」或「自動」)
    auto: {
      scanMode: 'manual',    // 'manual' | 'neighbor_step' | 'walk' | 'loop' | 'jump' | 'pendulum'
      tempoMode: 'manual',   // 'manual' | 'accel' | 'decel' | 'pendulum' | 'random_morph'
      pitchMode: 'manual',   // 'manual' | 'glissando' | 'brownian' | 'rising'
      cycleSec: 8.0,         // 漸變週期秒數 (2 ~ 30s)
      rampStartTime: 0,      // 單次或循環漸變起點時間 (ms)
      walkTargetPos: 0.5,
      glissTargetPitch: 0,
      morphTargetDensity: 25,
      morphTargetSize: 120,
      morphTargetSpread: 0.25,
      morphTargetDetune: 20,
      morphTargetAttack: 0.5,
      morphTargetPan: 0.75,
      // 各項參數獨立的「自動 / 手動」開關
      params: {
        position: false,
        spread: false,
        size: false,
        density: false,
        pitch: false,
        detune: false,
        attack: false,
        pan: false
      }
    }
  };

  // 音階半音對照表
  const SCALES = {
    pentatonic: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24],
    major7: [0, 4, 7, 11, 12, 14, 16, 19, 23, 24],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    fifths: [0, 7, 12, 14, 19, 24, 31]
  };

  // 色彩主題設定
  const PALETTES = {
    cyberpunk: [
      [0, 240, 255],   // Cyan
      [255, 42, 133],  // Magenta
      [138, 43, 226],  // Violet
      [0, 255, 157]    // Emerald
    ],
    aurora: [
      [0, 255, 157],
      [0, 210, 255],
      [110, 255, 200],
      [140, 100, 255]
    ],
    solar: [
      [255, 200, 0],
      [255, 85, 0],
      [255, 20, 100],
      [255, 245, 190]
    ],
    monochrome: [
      [240, 248, 255],
      [170, 190, 215],
      [110, 130, 160],
      [255, 255, 255]
    ]
  };

  // ==========================================
  // Web Audio API 聲音粒子化引擎
  // ==========================================
  let audioCtx = null;
  let filterNode = null;
  let delayNodeL = null;
  let delayNodeR = null;
  let delayFeedback = null;
  let delayWetGain = null;
  let convolverNode = null;
  let reverbWetGain = null;
  let masterGainNode = null;
  let analyserNode = null;
  let mediaStreamDest = null; // 供影音錄製使用

  // 純音訊 WAV 錄製專用緩衝區
  let isRecordingWav = false;
  let wavLeftChunks = [];
  let wavRightChunks = [];
  let wavRecorderNode = null;

  // 音訊緩衝區
  let sampleBuffer = null;     // 目前載入的音檔或內建取樣 Buffer
  let micRingBuffer = null;    // 麥克風 4 秒循環錄音 Float32Array
  let micAudioBuffer = null;   // 供粒子讀取的 AudioBuffer
  let micWriteIndex = 0;
  let micStream = null;
  let micProcessor = null;
  let micInputLevel = 0;

  // 粒子包絡線查表 (Hann / Tukey Window)
  let grainWindowCache = new Float32Array(256);

  function updateGrainWindow(attackRatio) {
    const N = grainWindowCache.length;
    for (let i = 0; i < N; i++) {
      const phase = i / (N - 1);
      if (phase < attackRatio) {
        grainWindowCache[i] = 0.5 * (1 - Math.cos(Math.PI * (phase / attackRatio)));
      } else {
        const releasePhase = (phase - attackRatio) / Math.max(0.001, 1 - attackRatio);
        grainWindowCache[i] = 0.5 * (1 + Math.cos(Math.PI * releasePhase));
      }
    }
  }
  updateGrainWindow(state.grain.attackRatio);

  // 初始化 Web Audio 引擎
  function initAudioEngine() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();

    // 主濾波器
    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = state.fx.cutoff;
    filterNode.Q.value = state.fx.resonance;

    // 乒乓立體聲延遲效果器 (Stereo Ping-Pong Delay)
    delayNodeL = audioCtx.createDelay(2.0);
    delayNodeR = audioCtx.createDelay(2.0);
    delayNodeL.delayTime.value = 0.27;
    delayNodeR.delayTime.value = 0.36;

    delayFeedback = audioCtx.createGain();
    delayFeedback.gain.value = 0.42;

    delayWetGain = audioCtx.createGain();
    delayWetGain.gain.value = state.fx.delayMix;

    const delayMerger = audioCtx.createChannelMerger(2);
    filterNode.connect(delayNodeL);
    delayNodeL.connect(delayNodeR);
    delayNodeR.connect(delayFeedback);
    delayFeedback.connect(delayNodeL);

    delayNodeL.connect(delayMerger, 0, 0);
    delayNodeR.connect(delayMerger, 0, 1);
    delayMerger.connect(delayWetGain);

    // 太空殘響效果器 (演算法合成 Impulse Response)
    convolverNode = audioCtx.createConvolver();
    convolverNode.buffer = createSpaceImpulseResponse(3.2, 2.4);
    reverbWetGain = audioCtx.createGain();
    reverbWetGain.gain.value = state.fx.reverbMix;

    filterNode.connect(convolverNode);
    convolverNode.connect(reverbWetGain);

    // 動態壓縮器防止爆音
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.15;

    masterGainNode = audioCtx.createGain();
    masterGainNode.gain.value = state.fx.masterGain;

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 1024;
    analyserNode.smoothingTimeConstant = 0.82;

    // 連接乾訊號與濕訊號
    filterNode.connect(compressor);
    delayWetGain.connect(compressor);
    reverbWetGain.connect(compressor);

    compressor.connect(masterGainNode);
    masterGainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    // 建立錄影用的音訊輸出節點
    mediaStreamDest = audioCtx.createMediaStreamDestination();
    masterGainNode.connect(mediaStreamDest);

    // 建立純音訊無損 WAV 錄製節點 (雙聲道 16-bit PCM)
    wavRecorderNode = audioCtx.createScriptProcessor(4096, 2, 2);
    wavRecorderNode.onaudioprocess = (e) => {
      if (!isRecordingWav) return;
      const inL = e.inputBuffer.getChannelData(0);
      const inR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inL;
      wavLeftChunks.push(new Float32Array(inL));
      wavRightChunks.push(new Float32Array(inR));
    };
    const silentWavOut = audioCtx.createGain();
    silentWavOut.gain.value = 0;
    masterGainNode.connect(wavRecorderNode);
    wavRecorderNode.connect(silentWavOut);
    silentWavOut.connect(audioCtx.destination);

    // 初始化麥克風 4 秒循環緩衝區
    const ringLen = audioCtx.sampleRate * 4;
    micRingBuffer = new Float32Array(ringLen);
    micAudioBuffer = audioCtx.createBuffer(1, ringLen, audioCtx.sampleRate);

    // 產生預設程序化取樣音檔
    generateProceduralPreset(document.getElementById('sample-preset').value);
  }

  // 建立立體聲太空殘響 Impulse Response
  function createSpaceImpulseResponse(durationSec, decay) {
    const rate = audioCtx.sampleRate;
    const length = Math.floor(rate * durationSec);
    const impulse = audioCtx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const env = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * env * 0.7;
      }
    }
    return impulse;
  }

  // 產生內建高質感程序化取樣 (免外部圖庫即可離線/線上直接玩)
  function generateProceduralPreset(presetName) {
    if (!audioCtx) return;
    const rate = audioCtx.sampleRate;
    const duration = 5.0; // 5 秒立體聲豐富音色供粒子切片
    const length = Math.floor(rate * duration);
    const buf = audioCtx.createBuffer(2, length, rate);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / rate;
      let sigL = 0;
      let sigR = 0;

      if (presetName === 'cosmic_pad') {
        // 豐富的和弦泛音演進 (C minor 9th + 慢速相位移動)
        const freqs = [130.81, 155.56, 196.00, 233.08, 293.66, 392.00, 587.33];
        freqs.forEach((f, idx) => {
          const detune = Math.sin(t * (0.4 + idx * 0.15)) * 0.8;
          const amp = (1 / Math.sqrt(idx + 1)) * (0.5 + 0.5 * Math.sin(t * 1.2 + idx));
          sigL += Math.sin(2 * Math.PI * (f + detune) * t) * amp;
          sigR += Math.sin(2 * Math.PI * (f - detune) * t + idx * 0.4) * amp;
        });
      } else if (presetName === 'crystal_arp') {
        // 清脆水晶泛音琶音序列
        const notes = [261.63, 311.13, 392.00, 523.25, 622.25, 783.99, 1046.5, 783.99];
        const stepDur = duration / notes.length;
        const stepIdx = Math.min(notes.length - 1, Math.floor(t / stepDur));
        const localT = t % stepDur;
        const f = notes[stepIdx];
        const env = Math.exp(-localT * 6.5);
        // FM 水晶泛音
        const mod = Math.sin(2 * Math.PI * f * 3.01 * localT) * 2.5 * env;
        sigL = Math.sin(2 * Math.PI * f * localT + mod) * env * 0.8;
        sigR = Math.sin(2 * Math.PI * (f * 1.003) * localT + mod * 0.9) * env * 0.8;
      } else if (presetName === 'vocal_formant') {
        // 電子人聲母音共振峰 (Formant Synthesis)
        const baseF = 110 + 20 * Math.sin(t * 0.8);
        const carrier = Math.sin(2 * Math.PI * baseF * t) + 0.5 * Math.sin(4 * Math.PI * baseF * t);
        const formant1 = 400 + 300 * (0.5 + 0.5 * Math.sin(t * 1.5));
        const formant2 = 1600 + 600 * (0.5 + 0.5 * Math.cos(t * 1.1));
        sigL = carrier * Math.sin(2 * Math.PI * formant1 * t) * 0.5 + Math.sin(2 * Math.PI * formant2 * t) * 0.25;
        sigR = carrier * Math.cos(2 * Math.PI * formant1 * t) * 0.5 + Math.cos(2 * Math.PI * formant2 * t) * 0.25;
      } else if (presetName === 'sub_perc') {
        // 深海低頻脈衝與金屬質感擊樂切片
        const stepDur = 0.625;
        const stepIdx = Math.floor(t / stepDur);
        const localT = t % stepDur;
        const pitchDrop = 55 + 180 * Math.exp(-localT * 28);
        const subEnv = Math.exp(-localT * 5.5);
        const noiseEnv = Math.exp(-localT * 22) * (stepIdx % 2 === 1 ? 0.6 : 0.15);
        const noise = (Math.random() * 2 - 1) * noiseEnv;
        sigL = Math.sin(2 * Math.PI * pitchDrop * localT) * subEnv * 0.9 + noise;
        sigR = Math.sin(2 * Math.PI * pitchDrop * localT + 0.2) * subEnv * 0.9 - noise;
      }

      // 淡入淡出尾端避免循環爆音
      const edgeEnv = Math.min(1, t * 20, (duration - t) * 20);
      L[i] = Math.tanh(sigL * 0.45) * edgeEnv;
      R[i] = Math.tanh(sigR * 0.45) * edgeEnv;
    }

    sampleBuffer = buf;
    drawWaveformStatic();
  }

  // 啟用麥克風即時收音寫入粒子循環緩衝區
  async function enableMicrophoneInput() {
    initAudioEngine();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    if (micStream) return true;

    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      const micSource = audioCtx.createMediaStreamSource(micStream);
      micProcessor = audioCtx.createScriptProcessor(1024, 1, 1);

      micProcessor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        let sum = 0;
        const ringLen = micRingBuffer.length;
        const targetChannel = micAudioBuffer.getChannelData(0);

        for (let i = 0; i < input.length; i++) {
          const sample = input[i];
          sum += sample * sample;
          if (!state.micFrozen) {
            // 混入微弱舊訊號形成自然循環層疊
            const blended = Math.tanh(sample * 1.4 + micRingBuffer[micWriteIndex] * 0.15);
            micRingBuffer[micWriteIndex] = blended;
            targetChannel[micWriteIndex] = blended;
            micWriteIndex = (micWriteIndex + 1) % ringLen;
          }
        }
        micInputLevel = Math.min(1, Math.sqrt(sum / input.length) * 4.5);
      };

      // ScriptProcessor 需要連到零增益節點以持續觸發
      const zeroGain = audioCtx.createGain();
      zeroGain.gain.value = 0;
      micSource.connect(micProcessor);
      micProcessor.connect(zeroGain);
      zeroGain.connect(audioCtx.destination);

      updateStatusTag('MIC LIVE', '#00ff9d');
      return true;
    } catch (err) {
      console.warn('無法取得麥克風權限:', err);
      updateStatusTag('MIC DENIED', '#ff2a85');
      alert('無法存取麥克風，請確認瀏覽器已允許麥克風權限，或改用「音檔粒子」與「振盪器粒子雲」模式。');
      return false;
    }
  }

  // ==========================================
  // 發射單顆聲音粒子 (Spawn Single Audio Grain)
  // ==========================================
  function spawnAudioGrain() {
    if (!audioCtx || audioCtx.state !== 'running') return;

    const now = audioCtx.currentTime;
    const durSec = Math.max(0.015, state.grain.sizeMs / 1000);
    const panVal = (Math.random() * 2 - 1) * state.grain.stereoPan;

    // 計算粒子音高倍率 (結合滑桿半音 + 隨機微調 Shimmer)
    const randomCents = (Math.random() * 2 - 1) * state.grain.detune * 1.2;
    const totalSemitones = state.grain.pitchSemitones + randomCents / 100;
    const playbackRate = Math.pow(2, totalSemitones / 12);

    // 建立粒子包絡線 GainNode 與立體聲定位 StereoPannerNode
    const grainGain = audioCtx.createGain();
    grainGain.gain.setValueAtTime(0.0001, now);

    // 根據同時發聲密度自動調整單顆粒子音量防止過載
    const densityScale = 0.38 / Math.pow(Math.max(1, state.grain.density * durSec), 0.42);
    const scaledWindow = new Float32Array(grainWindowCache.length);
    for (let i = 0; i < grainWindowCache.length; i++) {
      scaledWindow[i] = grainWindowCache[i] * densityScale;
    }
    grainGain.gain.setValueCurveAtTime(scaledWindow, now, durSec);

    const panner = audioCtx.createStereoPanner();
    panner.pan.setValueAtTime(panVal, now);

    grainGain.connect(panner);
    panner.connect(filterNode);

    let normalizedPos = state.grain.position;

    if (state.sourceMode === 'file' || state.sourceMode === 'mic') {
      const activeBuffer = state.sourceMode === 'mic' ? micAudioBuffer : sampleBuffer;
      if (!activeBuffer) return;

      // 若開啟「掃描位置：自動」且為「相鄰步進漫步 (neighbor_step)」，每顆聲粒嚴格向相鄰左邊(-1步)或右邊(+1步)移動一步，排除任何跳躍
      if (state.auto.params.position && state.auto.scanMode === 'neighbor_step' && !state.isPointerDown && !isDraggingWave) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        // 單步距離與粒子長度相連，確保永遠只走到緊鄰的左側或右側微切片
        const stepSize = Math.max(0.004, Math.min(0.025, (durSec * 0.45) / Math.max(0.5, activeBuffer.duration)));
        let nextPos = state.grain.position + dir * stepSize;
        if (nextPos < 0.01) nextPos = 0.01 + stepSize;
        if (nextPos > 0.99) nextPos = 0.99 - stepSize;
        setGrainPosition(Number(nextPos.toFixed(4)));
        normalizedPos = state.grain.position;
      } else {
        // 一般模式：計算隨機擴散後的取樣起點
        const jitter = (Math.random() * 2 - 1) * state.grain.spread * 0.5;
        normalizedPos = (state.grain.position + jitter + 1.0) % 1.0;
      }

      const maxOffset = Math.max(0.01, activeBuffer.duration - durSec * playbackRate - 0.01);
      const offsetSec = normalizedPos * maxOffset;

      const source = audioCtx.createBufferSource();
      source.buffer = activeBuffer;
      source.playbackRate.setValueAtTime(playbackRate, now);
      source.connect(grainGain);
      source.start(now, offsetSec, durSec * playbackRate);
      source.stop(now + durSec + 0.02);
    } else if (state.sourceMode === 'osc') {
      // 振盪器粒子雲模式：根據掃描位置與擴散選擇音階泛音
      const scaleIntervals = SCALES[state.osc.scale] || SCALES.pentatonic;
      if (state.auto.params.position && state.auto.scanMode === 'neighbor_step' && !state.isPointerDown && !isDraggingWave) {
        // 在音階上嚴格只往相鄰左一音或右一音走一步，排除跳音
        const totalNotes = scaleIntervals.length;
        const currentNoteIdx = Math.round(state.grain.position * (totalNotes - 1));
        const dir = Math.random() < 0.5 ? -1 : 1;
        let nextNoteIdx = currentNoteIdx + dir;
        if (nextNoteIdx < 0) nextNoteIdx = 1;
        if (nextNoteIdx >= totalNotes) nextNoteIdx = totalNotes - 2;
        const nextPos = nextNoteIdx / Math.max(1, totalNotes - 1);
        setGrainPosition(Number(nextPos.toFixed(4)));
        normalizedPos = state.grain.position;
      } else {
        const jitter = (Math.random() * 2 - 1) * state.grain.spread * 0.6;
        normalizedPos = Math.max(0, Math.min(1, state.grain.position + jitter));
      }

      const noteIndex = Math.floor(normalizedPos * (scaleIntervals.length - 0.01));
      const scaleSemitone = scaleIntervals[noteIndex] || 0;
      const freq = state.osc.baseFreq * Math.pow(2, (scaleSemitone + totalSemitones) / 12);

      const carrier = audioCtx.createOscillator();
      carrier.type = state.osc.waveform;
      carrier.frequency.setValueAtTime(freq, now);

      // FM 金屬泛音調變
      if (state.osc.fmDepth > 0) {
        const modulator = audioCtx.createOscillator();
        const modGain = audioCtx.createGain();
        modulator.type = 'sine';
        modulator.frequency.setValueAtTime(freq * 2.0, now);
        modGain.gain.setValueAtTime(freq * (state.osc.fmDepth / 100) * 1.8, now);
        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        modulator.start(now);
        modulator.stop(now + durSec + 0.02);
      }

      carrier.connect(grainGain);
      carrier.start(now);
      carrier.stop(now + durSec + 0.02);
    }

    // 紀錄觸發的聲粒供視覺與波形視窗繪製
    state.activeGrainsCount++;
    setTimeout(() => {
      state.activeGrainsCount = Math.max(0, state.activeGrainsCount - 1);
    }, durSec * 1000);

    state.recentGrainTriggers.push({
      pos: normalizedPos,
      pan: panVal,
      pitch: Math.max(0, Math.min(1, (totalSemitones + 24) / 48)),
      birth: performance.now(),
      life: durSec * 1000
    });
    if (state.recentGrainTriggers.length > 90) {
      state.recentGrainTriggers.shift();
    }

    // 同步激發視覺粒子爆發
    burstVisualParticles(normalizedPos, panVal);
  }

  // ==========================================
  // 02 參數自動化演化與速度漸變引擎 (各參數皆可獨立設定手動 / 自動)
  // ==========================================
  let lastAutoUpdateMs = 0;

  function setParamAutoState(paramKey, isAuto) {
    state.auto.params[paramKey] = isAuto;
    const btn = document.querySelector(`.param-auto-btn[data-param="${paramKey}"]`);
    if (btn) {
      btn.classList.toggle('active', isAuto);
      btn.textContent = isAuto ? '自動' : '手動';
    }
  }

  function hasAnyParamAuto() {
    return Object.values(state.auto.params).some(Boolean);
  }

  function updateAutomationEngine(nowMs) {
    const dt = Math.min(0.1, (nowMs - (lastAutoUpdateMs || nowMs)) / 1000);
    lastAutoUpdateMs = nowMs;
    if (!hasAnyParamAuto()) return;

    const cycleSec = Math.max(2, state.auto.cycleSec);
    if (!state.auto.rampStartTime) state.auto.rampStartTime = nowMs;
    const elapsedSec = (nowMs - state.auto.rampStartTime) / 1000;

    // 計算通用漸變曲線進度 (0 ~ 1)，供開啟「自動」的各項參數使用
    let morphProgress = 0.5 - 0.5 * Math.cos((elapsedSec / cycleSec) * Math.PI * 2);
    if (state.auto.tempoMode === 'accel') {
      morphProgress = (elapsedSec % cycleSec) / cycleSec; // 由慢到快循環漸變 (0 -> 1)
    } else if (state.auto.tempoMode === 'decel') {
      morphProgress = 1 - (elapsedSec % cycleSec) / cycleSec; // 由快到慢循環漸變 (1 -> 0)
    } else if (state.auto.tempoMode === 'pendulum') {
      morphProgress = 0.5 - 0.5 * Math.cos((elapsedSec / cycleSec) * Math.PI * 2);
    }

    // 1. 掃描位置 (Position)：僅在 params.position 為「自動」時才自動移動
    if (state.auto.params.position && !state.isPointerDown && !isDraggingWave) {
      const activeScan = state.auto.scanMode === 'manual' ? 'walk' : state.auto.scanMode;
      if (activeScan !== 'neighbor_step') {
        let nextPos = state.grain.position;
        if (activeScan === 'loop') {
          nextPos = (state.grain.position + dt / cycleSec) % 1.0;
        } else if (activeScan === 'pendulum') {
          const phase = (elapsedSec / cycleSec) * Math.PI * 2;
          nextPos = 0.5 + 0.45 * Math.sin(phase);
        } else if (activeScan === 'walk') {
          if (Math.abs(state.grain.position - state.auto.walkTargetPos) < 0.03) {
            state.auto.walkTargetPos = 0.05 + Math.random() * 0.9;
          }
          const walkSpeed = (1.2 / cycleSec) * dt;
          nextPos += Math.sign(state.auto.walkTargetPos - state.grain.position) * walkSpeed;
          nextPos = Math.max(0.02, Math.min(0.98, nextPos));
        } else if (activeScan === 'jump') {
          if (Math.random() < (dt * 3.5) / Math.max(1, cycleSec * 0.25)) {
            nextPos = 0.04 + Math.random() * 0.92;
          }
        }
        setGrainPosition(Number(nextPos.toFixed(3)));
      }
    }

    // 2. 位置擴散 (Spray)：當 params.spread 為「自動」時自動呼吸或隨速度漸變
    if (state.auto.params.spread) {
      let nextSpread = state.grain.spread;
      if (state.auto.tempoMode === 'random_morph') {
        if (Math.abs(state.grain.spread - state.auto.morphTargetSpread) < 0.03) {
          state.auto.morphTargetSpread = 0.02 + Math.random() * 0.72;
        }
        nextSpread += (state.auto.morphTargetSpread - state.grain.spread) * dt * (2.5 / cycleSec);
      } else {
        const wave = 0.5 - 0.5 * Math.cos((elapsedSec / cycleSec) * Math.PI * 2 + 0.9);
        const factor = (state.auto.tempoMode === 'accel' || state.auto.tempoMode === 'decel') ? morphProgress : wave;
        nextSpread = 0.03 + factor * 0.65;
      }
      applySingleGrainParam('spread', nextSpread);
    }

    // 3. 發射密度/速度 (Density) 與 4. 粒子長度 (Grain Size)：各自根據獨立「自動」開關決定是否變化
    if (state.auto.params.density || state.auto.params.size) {
      let targetDensity = state.grain.density;
      let targetSize = state.grain.sizeMs;

      if (state.auto.tempoMode === 'random_morph') {
        if (Math.abs(state.grain.density - state.auto.morphTargetDensity) < 3) {
          state.auto.morphTargetDensity = 4 + Math.random() * 58;
        }
        if (Math.abs(state.grain.sizeMs - state.auto.morphTargetSize) < 12) {
          state.auto.morphTargetSize = 22 + Math.random() * 340;
        }
        targetDensity = state.grain.density + (state.auto.morphTargetDensity - state.grain.density) * dt * (2.8 / cycleSec);
        targetSize = state.grain.sizeMs + (state.auto.morphTargetSize - state.grain.sizeMs) * dt * (2.8 / cycleSec);
      } else {
        const curved = Math.pow(morphProgress, 1.3);
        targetDensity = 3 + curved * 59; // 由慢 (3 /s) 到快 (62 /s)
        targetSize = 360 - curved * 338; // 由長 (360 ms) 到短 (22 ms)
      }

      if (state.auto.params.density) applySingleGrainParam('density', targetDensity);
      if (state.auto.params.size) applySingleGrainParam('size', targetSize);
    }

    // 5. 音高偏移 (Pitch)：僅在 params.pitch 為「自動」時演化
    if (state.auto.params.pitch) {
      const activePitchMode = state.auto.pitchMode === 'manual' ? 'glissando' : state.auto.pitchMode;
      let nextPitch = state.grain.pitchSemitones;
      if (activePitchMode === 'glissando') {
        const phase = (elapsedSec / cycleSec) * Math.PI * 2;
        nextPitch = Math.round(Math.sin(phase) * 12);
      } else if (activePitchMode === 'brownian') {
        if (Math.random() < dt * 4) {
          const step = [-5, -3, -2, 2, 3, 5, 7][Math.floor(Math.random() * 7)];
          nextPitch = Math.max(-19, Math.min(19, nextPitch + step));
        }
      } else if (activePitchMode === 'rising') {
        const norm = (elapsedSec % cycleSec) / cycleSec;
        nextPitch = Math.round(-12 + norm * 24);
      }
      applySingleGrainParam('pitch', nextPitch);
    }

    // 6. 隨機微調 (Shimmer / Detune)：當 params.detune 為「自動」時演化
    if (state.auto.params.detune) {
      const phase = (elapsedSec / cycleSec) * Math.PI * 2 + 1.7;
      const nextDetune = Math.round(5 + (0.5 + 0.5 * Math.sin(phase)) * 75);
      applySingleGrainParam('detune', nextDetune);
    }

    // 7. 包絡線形狀 (Envelope Attack)：當 params.attack 為「自動」時演化
    if (state.auto.params.attack) {
      const phase = (elapsedSec / cycleSec) * Math.PI * 2 + 2.6;
      const nextAttack = Number((0.15 + (0.5 + 0.5 * Math.sin(phase)) * 0.7).toFixed(2));
      applySingleGrainParam('attack', nextAttack);
    }

    // 8. 立體聲寬度 (Stereo Pan)：當 params.pan 為「自動」時演化
    if (state.auto.params.pan) {
      const phase = (elapsedSec / cycleSec) * Math.PI * 2 + 3.4;
      const nextPan = Number((0.15 + (0.5 + 0.5 * Math.cos(phase)) * 0.85).toFixed(2));
      applySingleGrainParam('pan', nextPan);
    }
  }

  function applySingleGrainParam(paramKey, val) {
    if (paramKey === 'spread') {
      state.grain.spread = Math.max(0, Math.min(0.8, val));
      const el = document.getElementById('grain-spread');
      const vEl = document.getElementById('val-grain-spread');
      if (el) el.value = state.grain.spread;
      if (vEl) vEl.textContent = `${Math.round(state.grain.spread * 100)}%`;
    } else if (paramKey === 'density') {
      state.grain.density = Math.max(2, Math.min(65, val));
      const el = document.getElementById('grain-density');
      const vEl = document.getElementById('val-grain-density');
      if (el) el.value = state.grain.density;
      if (vEl) vEl.textContent = `${Math.round(state.grain.density)} /s`;
    } else if (paramKey === 'size') {
      state.grain.sizeMs = Math.max(15, Math.min(450, val));
      const el = document.getElementById('grain-size');
      const vEl = document.getElementById('val-grain-size');
      if (el) el.value = state.grain.sizeMs;
      if (vEl) vEl.textContent = `${Math.round(state.grain.sizeMs)} ms`;
    } else if (paramKey === 'pitch') {
      const p = Math.max(-24, Math.min(24, Math.round(val)));
      state.grain.pitchSemitones = p;
      const el = document.getElementById('grain-pitch');
      const vEl = document.getElementById('val-grain-pitch');
      if (el) el.value = p;
      if (vEl) vEl.textContent = `${p >= 0 ? '+' : ''}${p} st`;
    } else if (paramKey === 'detune') {
      const d = Math.max(0, Math.min(100, Math.round(val)));
      state.grain.detune = d;
      const el = document.getElementById('grain-detune');
      const vEl = document.getElementById('val-grain-detune');
      if (el) el.value = d;
      if (vEl) vEl.textContent = `${d}%`;
    } else if (paramKey === 'attack') {
      const a = Math.max(0.1, Math.min(0.9, val));
      state.grain.attackRatio = a;
      updateGrainWindow(a);
      const el = document.getElementById('grain-attack');
      const vEl = document.getElementById('val-grain-attack');
      if (el) el.value = a;
      if (vEl) vEl.textContent = `${Math.round(a * 100)}%`;
    } else if (paramKey === 'pan') {
      const pan = Math.max(0, Math.min(1, val));
      state.grain.stereoPan = pan;
      const el = document.getElementById('grain-pan');
      const vEl = document.getElementById('val-grain-pan');
      if (el) el.value = pan;
      if (vEl) vEl.textContent = `${Math.round(pan * 100)}%`;
    }
  }

  // 粒子排程器迴圈 (支援滑鼠、HOLD、視訊鏡頭體感動作與自動演化觸發)
  let lastGrainSpawnTime = 0;
  function updateGranularScheduler(timestamp) {
    updateAutomationEngine(timestamp);

    const motionTriggered = state.webcamActive && state.camMotionEnergy > 0.04;
    const autoActive = hasAnyParamAuto();
    const shouldEmit = state.isRunning && (state.isHold || state.isPointerDown || motionTriggered || autoActive);
    if (!shouldEmit) return;

    // 若由鏡頭體感觸發，動作越大發射密度越高
    const motionBoost = motionTriggered ? (0.6 + state.camMotionEnergy * 1.8) : 1.0;
    const effectiveDensity = Math.min(75, state.grain.density * motionBoost);
    const intervalMs = 1000 / Math.max(1, effectiveDensity);

    if (timestamp - lastGrainSpawnTime >= intervalMs) {
      spawnAudioGrain();
      // 若高密度則單幀可補發第 2 顆粒子
      if (timestamp - lastGrainSpawnTime >= intervalMs * 2 && effectiveDensity > 35) {
        spawnAudioGrain();
      }
      lastGrainSpawnTime = timestamp;
    }
  }

  // ==========================================
  // 波形與粒子切點顯示器 (Waveform Canvas)
  // ==========================================
  const waveCanvas = document.getElementById('waveform-canvas');
  const waveCtx = waveCanvas.getContext('2d');
  let cachedWavePeaks = new Float32Array(210);

  function computeWavePeaks(buffer) {
    if (!buffer) return;
    const data = buffer.getChannelData(0);
    const bins = cachedWavePeaks.length;
    const step = Math.floor(data.length / bins);
    for (let i = 0; i < bins; i++) {
      let max = 0;
      const start = i * step;
      for (let j = 0; j < step; j += 8) {
        const v = Math.abs(data[start + j] || 0);
        if (v > max) max = v;
      }
      cachedWavePeaks[i] = max;
    }
  }

  function drawWaveformStatic() {
    if (state.sourceMode === 'file' && sampleBuffer) {
      computeWavePeaks(sampleBuffer);
    } else if (state.sourceMode === 'mic' && micAudioBuffer) {
      computeWavePeaks(micAudioBuffer);
    }
  }

  function renderWaveformOverlay(nowMs) {
    const w = waveCanvas.width;
    const h = waveCanvas.height;
    waveCtx.clearRect(0, 0, w, h);

    // 背景格線
    waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    waveCtx.lineWidth = 1;
    waveCtx.beginPath();
    waveCtx.moveTo(0, h / 2);
    waveCtx.lineTo(w, h / 2);
    waveCtx.stroke();

    if (state.sourceMode === 'mic' && !state.micFrozen && audioCtx) {
      computeWavePeaks(micAudioBuffer);
    }

    // 繪製波形或振盪器泛音曲線
    const bins = cachedWavePeaks.length;
    const barW = w / bins;
    for (let i = 0; i < bins; i++) {
      let amp = cachedWavePeaks[i];
      if (state.sourceMode === 'osc') {
        const phase = (i / bins) * Math.PI * 6 + nowMs * 0.003;
        amp = 0.35 + 0.3 * Math.sin(phase) * Math.cos(phase * 0.5);
      }
      const barH = Math.max(2, amp * (h * 0.82));
      const x = i * barW;
      const distFromScan = Math.abs(i / bins - state.grain.position);
      const inSpread = distFromScan <= state.grain.spread * 0.5;

      waveCtx.fillStyle = inSpread
        ? 'rgba(0, 240, 255, 0.72)'
        : 'rgba(139, 149, 176, 0.32)';
      waveCtx.fillRect(x, (h - barH) / 2, Math.max(1, barW - 1), barH);
    }

    // 繪製擴散範圍框 (Spray Region)
    const scanX = state.grain.position * w;
    const spreadW = state.grain.spread * w;
    waveCtx.fillStyle = 'rgba(0, 240, 255, 0.1)';
    waveCtx.fillRect(scanX - spreadW / 2, 0, spreadW, h);

    // 繪製目前活躍的聲粒閃光點
    for (let i = state.recentGrainTriggers.length - 1; i >= 0; i--) {
      const g = state.recentGrainTriggers[i];
      const age = nowMs - g.birth;
      if (age > g.life) {
        state.recentGrainTriggers.splice(i, 1);
        continue;
      }
      const alpha = 1 - age / g.life;
      const gx = g.pos * w;
      const gy = (0.5 + g.pan * 0.38) * h;

      waveCtx.fillStyle = `rgba(255, 42, 133, ${alpha})`;
      waveCtx.beginPath();
      waveCtx.arc(gx, gy, 3.2 * alpha + 1.5, 0, Math.PI * 2);
      waveCtx.fill();
    }

    // 繪製主掃描指針
    waveCtx.strokeStyle = '#00f0ff';
    waveCtx.lineWidth = 2;
    waveCtx.beginPath();
    waveCtx.moveTo(scanX, 0);
    waveCtx.lineTo(scanX, h);
    waveCtx.stroke();
  }

  // 波形視窗拖曳直接改變掃描位置
  let isDraggingWave = false;
  function updateScanFromWaveEvent(e) {
    const rect = waveCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setGrainPosition(normX);
  }

  waveCanvas.addEventListener('pointerdown', (e) => {
    isDraggingWave = true;
    updateScanFromWaveEvent(e);
    if (!state.isRunning) toggleEnginePower(true);
  });
  window.addEventListener('pointermove', (e) => {
    if (isDraggingWave) updateScanFromWaveEvent(e);
  });
  window.addEventListener('pointerup', () => {
    isDraggingWave = false;
  });

  // ==========================================
  // 即時粒子影像特效引擎 (Visual FX Canvas)
  // ==========================================
  const fxCanvas = document.getElementById('fx-canvas');
  const fxCtx = fxCanvas.getContext('2d');

  // 視訊鏡頭離屏取樣畫布與體感動態偵測緩衝區
  const webcamVideo = document.getElementById('webcam-video');
  const camSampleCanvas = document.createElement('canvas');
  camSampleCanvas.width = 128;
  camSampleCanvas.height = 72;
  const camSampleCtx = camSampleCanvas.getContext('2d', { willReadFrequently: true });
  let camPixelData = null;
  let prevCamLuma = new Float32Array(128 * 72);

  // 分析鏡頭畫面幀差 (Optical Motion Detection) 並驅動聲音粒子合成參數
  function analyzeWebcamMotion(pixelData) {
    const cw = 128;
    const ch = 72;
    let diffSum = 0;
    let weightedX = 0;
    let weightedY = 0;
    let activePixels = 0;

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const idx = y * cw + x;
        const pIdx = idx * 4;
        const luma = (pixelData[pIdx] * 0.299 + pixelData[pIdx + 1] * 0.587 + pixelData[pIdx + 2] * 0.114) / 255;
        const diff = Math.abs(luma - prevCamLuma[idx]);
        prevCamLuma[idx] = luma;

        // 過濾微弱相機雜訊
        if (diff > 0.075) {
          diffSum += diff;
          weightedX += (x / cw) * diff;
          weightedY += (y / ch) * diff;
          activePixels++;
        }
      }
    }

    const rawEnergy = Math.min(1, diffSum / 65);
    state.camMotionEnergy = state.camMotionEnergy * 0.72 + rawEnergy * 0.28;

    const motionFillEl = document.getElementById('motion-meter-fill');
    if (motionFillEl) {
      motionFillEl.style.width = `${Math.min(100, Math.round(state.camMotionEnergy * 130))}%`;
    }

    // 當偵測到明顯肢體/手部移動時，自動更新互動座標、粒子掃描位置與濾波器頻率
    if (diffSum > 1.2 && activePixels > 8 && !state.isPointerDown) {
      const targetX = Math.max(0, Math.min(1, weightedX / diffSum));
      const targetY = Math.max(0, Math.min(1, weightedY / diffSum));

      // 平滑追蹤動作重心
      state.camMotionX = state.camMotionX * 0.78 + targetX * 0.22;
      state.camMotionY = state.camMotionY * 0.78 + targetY * 0.22;

      state.pointerX = state.camMotionX;
      state.pointerY = state.camMotionY;

      // X 軸連動聲音粒子掃描位置 (Scan Position)
      setGrainPosition(Number(state.camMotionX.toFixed(3)));

      // Y 軸連動低通濾波器截止頻率與音高微調 (手舉高聲音更亮、音高上揚)
      const mappedCutoff = Math.round(180 * Math.pow(75, 1 - state.camMotionY));
      setFilterCutoff(Math.min(14000, Math.max(120, mappedCutoff)));

      document.getElementById('hud-x').textContent = state.camMotionX.toFixed(2);
      document.getElementById('hud-y').textContent = (1 - state.camMotionY).toFixed(2);
    }
  }

  // 視覺粒子陣列
  let particles = [];
  const MAX_PARTICLES = 5000;

  function initVisualParticles() {
    particles = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 1.8 + 0.6,
        colorIdx: i % 4,
        energy: 0,
        angle: Math.random() * Math.PI * 2,
        orbitRadius: 40 + Math.random() * Math.min(w, h) * 0.42
      });
    }
  }

  function resizeFxCanvas() {
    fxCanvas.width = window.innerWidth;
    fxCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeFxCanvas);
  resizeFxCanvas();
  initVisualParticles();

  // 當聲音粒子發射時，在畫布對應處激發視覺粒子能量
  function burstVisualParticles(normPos, panVal) {
    if (!particles.length) return;
    const count = state.visual.count;
    const burstSize = 14;
    const startIdx = Math.floor(Math.random() * Math.max(1, count - burstSize));
    const targetX = (0.15 + normPos * 0.7) * fxCanvas.width;
    const targetY = (1 - (state.grain.pitchSemitones + 24) / 48) * fxCanvas.height;

    for (let i = 0; i < burstSize; i++) {
      const p = particles[(startIdx + i) % count];
      if (!p) continue;
      p.energy = Math.min(2.5, p.energy + 1.15);
      if (Math.random() < 0.35) {
        p.x = targetX + (Math.random() - 0.5) * 90;
        p.y = targetY + panVal * 110 + (Math.random() - 0.5) * 90;
      }
    }
  }

  // 音訊頻譜分析資料陣列
  const freqData = new Uint8Array(512);
  const timeData = new Uint8Array(512);
  let audioEnergy = { bass: 0, mid: 0, high: 0, rms: 0 };

  function analyzeAudioFrame() {
    if (!analyserNode || !state.isRunning) {
      audioEnergy.bass *= 0.9;
      audioEnergy.mid *= 0.9;
      audioEnergy.high *= 0.9;
      audioEnergy.rms *= 0.9;
      return;
    }

    analyserNode.getByteFrequencyData(freqData);
    analyserNode.getByteTimeDomainData(timeData);

    let bassSum = 0;
    let midSum = 0;
    let highSum = 0;

    for (let i = 0; i < 20; i++) bassSum += freqData[i];
    for (let i = 20; i < 120; i++) midSum += freqData[i];
    for (let i = 120; i < 320; i++) highSum += freqData[i];

    const react = state.visual.reactivity;
    audioEnergy.bass = (bassSum / (20 * 255)) * react;
    audioEnergy.mid = (midSum / (100 * 255)) * react;
    audioEnergy.high = (highSum / (200 * 255)) * react;

    let sqSum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const norm = (timeData[i] - 128) / 128;
      sqSum += norm * norm;
    }
    audioEnergy.rms = Math.sqrt(sqSum / timeData.length);
  }

  // 繪製右下角即時頻譜與示波器
  const specCanvas = document.getElementById('spectrum-canvas');
  const specCtx = specCanvas.getContext('2d');
  const peakDbEl = document.getElementById('peak-db');

  function renderSpectrumScope() {
    const w = specCanvas.width;
    const h = specCanvas.height;
    specCtx.fillStyle = 'rgba(4, 6, 12, 0.45)';
    specCtx.fillRect(0, 0, w, h);

    // 繪製 FFT 頻譜柱狀圖
    const barCount = 48;
    const barW = w / barCount;
    for (let i = 0; i < barCount; i++) {
      const val = freqData[i * 3] / 255;
      const barH = val * (h * 0.85);
      specCtx.fillStyle = `hsla(${185 + i * 2.5}, 95%, 58%, 0.65)`;
      specCtx.fillRect(i * barW, h - barH, barW - 1.5, barH);
    }

    // 繪製即時波形 Oscilloscope
    specCtx.strokeStyle = '#00ff9d';
    specCtx.lineWidth = 1.6;
    specCtx.beginPath();
    for (let i = 0; i < timeData.length; i += 2) {
      const x = (i / timeData.length) * w;
      const y = (timeData[i] / 255) * h;
      if (i === 0) specCtx.moveTo(x, y);
      else specCtx.lineTo(x, y);
    }
    specCtx.stroke();

    // 更新分貝讀數與麥克風電平條
    if (audioEnergy.rms > 0.001) {
      const db = Math.max(-60, Math.round(20 * Math.log10(audioEnergy.rms)));
      peakDbEl.textContent = `${db} dB`;
    } else {
      peakDbEl.textContent = '-∞ dB';
    }

    if (state.sourceMode === 'mic') {
      document.getElementById('mic-meter-fill').style.width = `${Math.round(micInputLevel * 100)}%`;
    }
  }

  // 簡化流體Curl Noise 偽向量場函式
  function flowFieldAngle(x, y, t) {
    return (
      Math.sin(x * 0.0035 + t * 0.7) * Math.cos(y * 0.0035 - t * 0.5) * Math.PI * 2 +
      Math.sin((x + y) * 0.002 + t) * Math.PI
    );
  }

  // 主畫布視覺特效渲染迴圈
  function renderVisualFX(nowMs) {
    const w = fxCanvas.width;
    const h = fxCanvas.height;
    const t = nowMs * 0.001;
    const palette = PALETTES[state.visual.palette] || PALETTES.cyberpunk;

    // 1. 背景覆蓋與視訊鏡頭實景繪製
    const fadeAlpha = Math.max(0.04, 1 - state.visual.trails);
    fxCtx.globalCompositeOperation = 'source-over';

    if (state.webcamActive && webcamVideo.readyState >= 2) {
      camSampleCtx.save();
      camSampleCtx.scale(-1, 1); // 鏡像翻轉供體感偵測與粒子取色
      camSampleCtx.drawImage(webcamVideo, -camSampleCanvas.width, 0, camSampleCanvas.width, camSampleCanvas.height);
      camSampleCtx.restore();
      camPixelData = camSampleCtx.getImageData(0, 0, camSampleCanvas.width, camSampleCanvas.height).data;
      analyzeWebcamMotion(camPixelData);

      if (state.visual.camOpacity > 0.01) {
        // 先鋪一層深色底避免殘影過曝，接著直接繪製清晰完整的攝影機實景畫面
        fxCtx.fillStyle = `rgba(6, 7, 12, ${Math.max(fadeAlpha, state.visual.camOpacity * 0.65)})`;
        fxCtx.fillRect(0, 0, w, h);

        fxCtx.save();
        fxCtx.globalCompositeOperation = 'source-over';
        fxCtx.globalAlpha = state.visual.camOpacity;

        const blurPx = Math.round((1 - state.visual.camClarity) * 18);
        if (blurPx > 0) {
          fxCtx.filter = `blur(${blurPx}px)`;
        }

        // 鏡像翻轉並等比例滿版繪製高畫質攝影機實景
        fxCtx.translate(w, 0);
        fxCtx.scale(-1, 1);
        const vw = webcamVideo.videoWidth || 640;
        const vh = webcamVideo.videoHeight || 360;
        const scale = Math.max(w / vw, h / vh);
        const drawW = vw * scale;
        const drawH = vh * scale;
        fxCtx.drawImage(webcamVideo, (w - drawW) * 0.5, (h - drawH) * 0.5, drawW, drawH);
        fxCtx.restore();
      } else {
        fxCtx.fillStyle = `rgba(6, 7, 12, ${fadeAlpha})`;
        fxCtx.fillRect(0, 0, w, h);
      }
    } else {
      camPixelData = null;
      state.camMotionEnergy *= 0.85;
      fxCtx.fillStyle = `rgba(6, 7, 12, ${fadeAlpha})`;
      fxCtx.fillRect(0, 0, w, h);
    }

    // 開啟加法混色發光效果
    fxCtx.globalCompositeOperation = 'lighter';

    const cx = w * 0.5;
    const cy = h * 0.5;
    const px = state.pointerX * w;
    const py = state.pointerY * h;
    const bass = audioEnergy.bass;
    const mid = audioEnergy.mid;
    const high = audioEnergy.high;
    const count = state.visual.count;
    const mode = state.visual.mode;
    const turb = state.visual.turbulence;
    const baseSize = state.visual.particleSize;

    // 2. 若為「賽博波浪矩陣」或「幾何萬花筒」，繪製幾何音訊骨架背景
    if (mode === 'cybergrid') {
      drawCyberWaveGrid(w, h, t, palette, bass, mid);
    } else if (mode === 'kaleidoscope') {
      drawKaleidoscopeRings(cx, cy, t, palette, bass, mid, high);
    }

    // 3. 更新並繪製所有視覺粒子
    const rgbShift = state.visual.glitch * (bass * 24 + (state.isPointerDown ? 5 : 0));

    for (let i = 0; i < count; i++) {
      const p = particles[i];
      p.energy *= 0.94;

      if (mode === 'swarm') {
        // 流體粒子星雲模式
        const ang = flowFieldAngle(p.x, p.y, t * 0.6) * turb;
        const speed = 0.8 + mid * 4.5 + p.energy * 2.2;
        p.vx = p.vx * 0.92 + Math.cos(ang) * speed * 0.18;
        p.vy = p.vy * 0.92 + Math.sin(ang) * speed * 0.18;

        // 游標力場吸引與聲音粒子渦流
        const dx = px - p.x;
        const dy = py - p.y;
        const distSq = dx * dx + dy * dy + 1200;
        const pull = (state.isPointerDown || state.isHold) ? 280 / distSq : 75 / distSq;
        p.vx += dx * pull + dy * pull * 0.45;
        p.vy += dy * pull - dx * pull * 0.45;
      } else if (mode === 'vortex') {
        // 頻譜引力漩渦模式
        const freqBin = freqData[(i * 2) % 240] / 255;
        p.angle += (0.008 + freqBin * 0.045 + bass * 0.02) * (i % 2 === 0 ? 1 : -0.7);
        const targetR = p.orbitRadius * (0.55 + freqBin * 0.85 + bass * 0.35);
        const tx = px * 0.35 + cx * 0.65 + Math.cos(p.angle) * targetR;
        const ty = py * 0.35 + cy * 0.65 + Math.sin(p.angle) * targetR;
        p.vx = (tx - p.x) * 0.12;
        p.vy = (ty - p.y) * 0.12;
      } else if (mode === 'cybergrid') {
        // 3D 透視粒子光流
        const freqVal = freqData[i % 180] / 255;
        p.vx = Math.sin(p.y * 0.01 + t * 2) * turb * 1.5;
        p.vy = 1.2 + (bass + freqVal) * 4.5;
      } else if (mode === 'kaleidoscope') {
        // 對稱萬花筒粒子放射
        const sym = 8;
        const sectorAngle = ((i % sym) / sym) * Math.PI * 2 + t * 0.25;
        const localAng = Math.sin(t * 1.5 + i * 0.02) * 0.45 * turb;
        const radSpeed = 1.1 + (freqData[i % 160] / 255) * 6.5 + bass * 4;
        p.vx = Math.cos(sectorAngle + localAng) * radSpeed;
        p.vy = Math.sin(sectorAngle + localAng) * radSpeed;
        if (Math.hypot(p.x - cx, p.y - cy) > Math.max(w, h) * 0.58) {
          p.x = cx + (Math.random() - 0.5) * 20;
          p.y = cy + (Math.random() - 0.5) * 20;
        }
      }

      p.x += p.vx;
      p.y += p.vy;

      // 邊界環繞
      if (p.x < 0) p.x += w;
      else if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      else if (p.y > h) p.y -= h;

      // 決定粒子顏色與大小（若開啟 Webcam 則融合鏡頭像素色彩與亮度）
      let r, g, b;
      let radius = baseSize * p.size * (1 + bass * 0.9 + p.energy * 0.8);

      if (camPixelData) {
        const camX = Math.min(127, Math.max(0, Math.floor((p.x / w) * 128)));
        const camY = Math.min(71, Math.max(0, Math.floor((p.y / h) * 72)));
        const pIdx = (camY * 128 + camX) * 4;
        const cr = camPixelData[pIdx];
        const cg = camPixelData[pIdx + 1];
        const cb = camPixelData[pIdx + 2];
        const luma = (cr * 0.299 + cg * 0.587 + cb * 0.114) / 255;

        // 亮部區域放大粒子並強化吸力
        const baseCol = palette[p.colorIdx];
        r = Math.round(cr * 0.75 + baseCol[0] * 0.35);
        g = Math.round(cg * 0.75 + baseCol[1] * 0.35);
        b = Math.round(cb * 0.75 + baseCol[2] * 0.35);
        radius *= 0.45 + luma * 1.65;
      } else {
        const col = palette[p.colorIdx];
        r = col[0];
        g = col[1];
        b = col[2];
      }

      const alpha = Math.min(0.95, 0.35 + mid * 0.6 + p.energy * 0.5);
      fxCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      fxCtx.fillRect(p.x - radius * 0.5, p.y - radius * 0.5, radius, radius);

      // 重低音觸發 RGB 色差分離故障特效 (Glitch)
      if (rgbShift > 1.8 && i % 5 === 0) {
        fxCtx.fillStyle = `rgba(255, 30, 110, ${alpha * 0.65})`;
        fxCtx.fillRect(p.x - rgbShift, p.y, radius, radius);
        fxCtx.fillStyle = `rgba(0, 245, 255, ${alpha * 0.65})`;
        fxCtx.fillRect(p.x + rgbShift, p.y, radius, radius);
      }
    }

    // 4. 繪製游標聲音粒子發射核心光環
    drawEmitterCursorRing(px, py, bass, high, palette[0]);

    // 5. 若正在進行 AI 語音導覽展演，在畫布下方繪製電影感字幕橫幅 (確保直接錄進 MP4 影片中)
    if (state.narrationSubtitle) {
      drawNarrationSubtitleBanner(w, h, state.narrationSubtitle, state.narrationStepTitle);
    }
  }

  function drawNarrationSubtitleBanner(w, h, subtitleText, stepTitle) {
    fxCtx.save();
    fxCtx.globalCompositeOperation = 'source-over';

    const boxW = Math.min(w * 0.82, 860);
    const boxH = 82;
    const boxX = (w - boxW) * 0.5;
    const boxY = h - boxH - 64;

    // 半透明深色科技感字幕底框
    fxCtx.fillStyle = 'rgba(6, 9, 18, 0.82)';
    fxCtx.strokeStyle = 'rgba(0, 240, 255, 0.48)';
    fxCtx.lineWidth = 1.5;
    fxCtx.beginPath();
    if (fxCtx.roundRect) {
      fxCtx.roundRect(boxX, boxY, boxW, boxH, 12);
    } else {
      fxCtx.rect(boxX, boxY, boxW, boxH);
    }
    fxCtx.fill();
    fxCtx.stroke();

    // 繪製章節小標
    if (stepTitle) {
      fxCtx.font = '600 12px "JetBrains Mono", monospace';
      fxCtx.fillStyle = '#00f0ff';
      fxCtx.textAlign = 'center';
      fxCtx.fillText(stepTitle, w * 0.5, boxY + 24);
    }

    // 繪製旁白字幕主文
    fxCtx.font = '600 17px "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
    fxCtx.fillStyle = '#ffffff';
    fxCtx.textAlign = 'center';
    fxCtx.fillText(subtitleText, w * 0.5, boxY + 56, boxW - 36);

    fxCtx.restore();
  }

  function drawCyberWaveGrid(w, h, t, palette, bass, mid) {
    const rows = 14;
    const cols = 36;
    const col = palette[0];
    fxCtx.strokeStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${0.18 + bass * 0.35})`;
    fxCtx.lineWidth = 1.2;

    for (let r = 0; r < rows; r++) {
      const normR = r / (rows - 1);
      const baseY = h * 0.32 + Math.pow(normR, 1.5) * (h * 0.65);
      fxCtx.beginPath();
      for (let c = 0; c <= cols; c++) {
        const normC = c / cols;
        const x = normC * w;
        const freqIdx = Math.floor(Math.abs(normC - 0.5) * 160);
        const audioLift = (freqData[freqIdx] / 255) * 65 * (0.4 + normR);
        const wave = Math.sin(normC * 10 + t * 2.5 + r * 0.6) * (10 + mid * 25);
        const y = baseY - audioLift + wave;
        if (c === 0) fxCtx.moveTo(x, y);
        else fxCtx.lineTo(x, y);
      }
      fxCtx.stroke();
    }
  }

  function drawKaleidoscopeRings(cx, cy, t, palette, bass, mid, high) {
    const petals = 12;
    const baseR = 90 + bass * 160;
    const col1 = palette[0];
    const col2 = palette[1];

    fxCtx.save();
    fxCtx.translate(cx, cy);
    fxCtx.rotate(t * 0.3);

    for (let i = 0; i < petals; i++) {
      fxCtx.save();
      fxCtx.rotate((i / petals) * Math.PI * 2);
      fxCtx.strokeStyle = i % 2 === 0
        ? `rgba(${col1[0]}, ${col1[1]}, ${col1[2]}, ${0.22 + mid * 0.4})`
        : `rgba(${col2[0]}, ${col2[1]}, ${col2[2]}, ${0.22 + high * 0.4})`;
      fxCtx.lineWidth = 1.5 + bass * 2;

      fxCtx.beginPath();
      for (let k = 0; k < 32; k++) {
        const r = (k / 32) * baseR * 1.8;
        const wave = Math.sin(k * 0.35 - t * 4) * (12 + (freqData[k * 4] / 255) * 42);
        if (k === 0) fxCtx.moveTo(r, wave);
        else fxCtx.lineTo(r, wave);
      }
      fxCtx.stroke();
      fxCtx.restore();
    }
    fxCtx.restore();
  }

  function drawEmitterCursorRing(px, py, bass, high, mainColor) {
    const motionActive = state.webcamActive && state.camMotionEnergy > 0.04;
    const active = state.isRunning && (state.isPointerDown || state.isHold || motionActive);
    const radius = (active ? 26 : 14) + bass * 42 + (motionActive ? state.camMotionEnergy * 35 : 0);

    fxCtx.strokeStyle = `rgba(${mainColor[0]}, ${mainColor[1]}, ${mainColor[2]}, ${active ? 0.8 : 0.3})`;
    fxCtx.lineWidth = active ? 2.2 : 1;
    fxCtx.beginPath();
    fxCtx.arc(px, py, radius, 0, Math.PI * 2);
    fxCtx.stroke();

    if (active) {
      fxCtx.strokeStyle = `rgba(255, 42, 133, ${0.4 + high * 0.5})`;
      fxCtx.beginPath();
      fxCtx.arc(px, py, radius * (0.55 + state.grain.spread * 0.8), 0, Math.PI * 2);
      fxCtx.stroke();
    }
  }

  // ==========================================
  // 畫布 XY 觸控與滑鼠互動綁定
  // ==========================================
  function handleCanvasPointer(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const normX = Math.max(0, Math.min(1, clientX / window.innerWidth));
    const normY = Math.max(0, Math.min(1, clientY / window.innerHeight));

    state.pointerVX = normX - state.pointerX;
    state.pointerVY = normY - state.pointerY;
    state.pointerX = normX;
    state.pointerY = normY;

    // 拖曳時即時連動粒子掃描位置 (X軸) 與濾波器/音高共振 (Y軸)
    if (state.isPointerDown) {
      setGrainPosition(normX);
      // Y軸上方提高濾波截止頻率，下方降低
      const mappedCutoff = Math.round(180 * Math.pow(75, 1 - normY));
      setFilterCutoff(Math.min(14000, Math.max(120, mappedCutoff)));
    }

    document.getElementById('hud-x').textContent = normX.toFixed(2);
    document.getElementById('hud-y').textContent = (1 - normY).toFixed(2);
  }

  fxCanvas.addEventListener('pointerdown', (e) => {
    state.isPointerDown = true;
    if (!state.isRunning) {
      toggleEnginePower(true);
    }
    handleCanvasPointer(e);
    spawnAudioGrain();
    document.getElementById('hud-hint').style.opacity = '0.25';
  });

  window.addEventListener('pointermove', (e) => {
    if (e.target === fxCanvas || state.isPointerDown) {
      handleCanvasPointer(e);
    }
  });

  window.addEventListener('pointerup', () => {
    state.isPointerDown = false;
  });

  // ==========================================
  // UI 控制面板事件綁定
  // ==========================================
  function setGrainPosition(val) {
    state.grain.position = val;
    document.getElementById('grain-position').value = val;
    document.getElementById('val-grain-position').textContent = `${Math.round(val * 100)}%`;
  }

  function setFilterCutoff(hz) {
    state.fx.cutoff = hz;
    if (filterNode && audioCtx) {
      filterNode.frequency.setTargetAtTime(hz, audioCtx.currentTime, 0.02);
    }
    document.getElementById('fx-cutoff').value = hz;
    document.getElementById('val-fx-cutoff').textContent = `${hz} Hz`;
  }

  function updateStatusTag(text, colorHex) {
    const tag = document.getElementById('source-status-tag');
    tag.textContent = text;
    if (colorHex) {
      tag.style.color = colorHex;
      tag.style.borderColor = colorHex;
    }
  }

  // 啟動 / 停止主引擎
  async function toggleEnginePower(forceState) {
    initAudioEngine();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    state.isRunning = typeof forceState === 'boolean' ? forceState : !state.isRunning;

    const powerBtn = document.getElementById('btn-power');
    const powerLabel = document.getElementById('power-label');
    const iconPlay = document.getElementById('icon-play');
    const iconStop = document.getElementById('icon-stop');

    if (state.isRunning) {
      powerBtn.classList.add('running');
      powerLabel.textContent = '引擎運行中';
      iconPlay.style.display = 'none';
      iconStop.style.display = 'block';
      // 啟動時若未開啟 HOLD，預設開啟 HOLD 讓使用者立刻聽到粒子雲音效
      if (!state.isHold && !state.isPointerDown) {
        toggleHold(true);
      }
    } else {
      powerBtn.classList.remove('running');
      powerLabel.textContent = '啟動引擎';
      iconPlay.style.display = 'block';
      iconStop.style.display = 'none';
    }
  }

  function toggleHold(forceState) {
    state.isHold = typeof forceState === 'boolean' ? forceState : !state.isHold;
    const holdBtn = document.getElementById('btn-hold');
    holdBtn.classList.toggle('active', state.isHold);
  }

  document.getElementById('btn-power').addEventListener('click', () => toggleEnginePower());
  document.getElementById('btn-hold').addEventListener('click', () => {
    if (!state.isRunning) toggleEnginePower(true);
    toggleHold();
  });

  // 訊號源切換按鈕 (音檔 / 麥克風 / 振盪器)
  document.querySelectorAll('.source-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.source;
      if (mode === 'mic') {
        const ok = await enableMicrophoneInput();
        if (!ok) return;
      }

      state.sourceMode = mode;
      document.querySelectorAll('.source-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.source-pane').forEach((p) => p.classList.remove('active'));
      document.getElementById(`pane-${mode}`).classList.add('active');

      if (mode === 'file') updateStatusTag('SAMPLER', '#00f0ff');
      else if (mode === 'osc') updateStatusTag('SYNTH CLOUD', '#b469ff');
      drawWaveformStatic();
    });
  });

  // 內建程序化取樣選單
  document.getElementById('sample-preset').addEventListener('change', (e) => {
    initAudioEngine();
    generateProceduralPreset(e.target.value);
    updateStatusTag('PRESET LOADED', '#00ff9d');
  });

  // 音訊檔案上傳與拖放支援
  const dropZone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('audio-file-input');
  const fileLabel = document.getElementById('file-drop-label');

  async function loadUserAudioFile(file) {
    if (!file) return;
    initAudioEngine();
    fileLabel.textContent = `解碼中：${file.name}...`;
    updateStatusTag('DECODING...', '#ffb800');

    try {
      const arrayBuf = await file.arrayBuffer();
      sampleBuffer = await audioCtx.decodeAudioData(arrayBuf);
      fileLabel.textContent = `已載入：${file.name} (${sampleBuffer.duration.toFixed(1)}s)`;
      updateStatusTag('FILE READY', '#00ff9d');
      drawWaveformStatic();
      if (!state.isRunning) toggleEnginePower(true);
    } catch (err) {
      console.error('音檔解碼失敗:', err);
      fileLabel.textContent = '音檔格式不支援，請重試其他 MP3/WAV';
      updateStatusTag('ERROR', '#ff2a85');
    }
  }

  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => loadUserAudioFile(e.target.files[0]));
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      loadUserAudioFile(e.dataTransfer.files[0]);
    }
  });

  // 麥克風凍結按鈕
  const micFreezeBtn = document.getElementById('btn-mic-freeze');
  micFreezeBtn.addEventListener('click', () => {
    state.micFrozen = !state.micFrozen;
    micFreezeBtn.classList.toggle('active', state.micFrozen);
    document.getElementById('mic-freeze-text').textContent = state.micFrozen
      ? '已凍結麥克風緩衝區 (點擊解除)'
      : '凍結目前麥克風緩衝區 (Freeze)';
    updateStatusTag(state.micFrozen ? 'MIC FROZEN' : 'MIC LIVE', state.micFrozen ? '#ff2a85' : '#00ff9d');
  });

  // 振盪器控制項
  document.getElementById('osc-waveform').addEventListener('change', (e) => {
    state.osc.waveform = e.target.value;
  });
  document.getElementById('osc-scale').addEventListener('change', (e) => {
    state.osc.scale = e.target.value;
  });
  document.getElementById('osc-base-freq').addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.osc.baseFreq = val;
    document.getElementById('val-osc-base-freq').textContent = `${val.toFixed(1)} Hz`;
  });
  document.getElementById('osc-fm-depth').addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.osc.fmDepth = val;
    document.getElementById('val-osc-fm-depth').textContent = `${val}%`;
  });

  // 聲音粒子合成滑桿綁定
  const bindSlider = (id, callback) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(`val-${id}`);
    el.addEventListener('input', (e) => {
      const num = parseFloat(e.target.value);
      const formatted = callback(num);
      if (valEl && formatted !== undefined) valEl.textContent = formatted;
    });
  };

  bindSlider('grain-position', (v) => { state.grain.position = v; return `${Math.round(v * 100)}%`; });
  bindSlider('grain-spread', (v) => { state.grain.spread = v; return `${Math.round(v * 100)}%`; });
  bindSlider('grain-size', (v) => { state.grain.sizeMs = v; return `${Math.round(v)} ms`; });
  bindSlider('grain-density', (v) => { state.grain.density = v; return `${Math.round(v)} /s`; });
  bindSlider('grain-pitch', (v) => {
    state.grain.pitchSemitones = v;
    return `${v >= 0 ? '+' : ''}${v} st`;
  });
  bindSlider('grain-detune', (v) => { state.grain.detune = v; return `${Math.round(v)}%`; });
  bindSlider('grain-attack', (v) => {
    state.grain.attackRatio = v;
    updateGrainWindow(v);
    return `${Math.round(v * 100)}%`;
  });
  bindSlider('grain-pan', (v) => { state.grain.stereoPan = v; return `${Math.round(v * 100)}%`; });

  // 02 區塊各參數獨立「手動 / 自動」按鈕與選單連動綁定
  const scanModeSel = document.getElementById('auto-scan-mode');
  const tempoModeSel = document.getElementById('auto-tempo-mode');
  const pitchModeSel = document.getElementById('auto-pitch-mode');

  document.querySelectorAll('.param-auto-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const paramKey = btn.dataset.param;
      const nextAuto = !state.auto.params[paramKey];
      setParamAutoState(paramKey, nextAuto);
      if (!state.auto.rampStartTime) {
        state.auto.rampStartTime = performance.now();
      }

      // 若開啟「掃描位置：自動」且下拉選單仍為 manual，自動切為平滑漫步
      if (paramKey === 'position' && nextAuto && state.auto.scanMode === 'manual') {
        scanModeSel.value = 'walk';
        state.auto.scanMode = 'walk';
      } else if (paramKey === 'position' && !nextAuto) {
        scanModeSel.value = 'manual';
        state.auto.scanMode = 'manual';
      }

      // 若開啟「速度/密度、粒子長度或位置擴散：自動」且速度選單為 manual，自動切為呼吸循環
      if ((paramKey === 'density' || paramKey === 'size' || paramKey === 'spread') && nextAuto && state.auto.tempoMode === 'manual') {
        tempoModeSel.value = 'pendulum';
        state.auto.tempoMode = 'pendulum';
      } else if ((paramKey === 'density' || paramKey === 'size' || paramKey === 'spread') && !nextAuto) {
        if (!state.auto.params.density && !state.auto.params.size && !state.auto.params.spread) {
          tempoModeSel.value = 'manual';
          state.auto.tempoMode = 'manual';
        }
      }

      // 若開啟「音高：自動」且音高選單為 manual，自動切為滑音漫遊
      if (paramKey === 'pitch' && nextAuto && state.auto.pitchMode === 'manual') {
        pitchModeSel.value = 'glissando';
        state.auto.pitchMode = 'glissando';
      } else if (paramKey === 'pitch' && !nextAuto) {
        pitchModeSel.value = 'manual';
        state.auto.pitchMode = 'manual';
      }

      if (nextAuto && !state.isRunning) toggleEnginePower(true);
    });
  });

  // 全自動 / 全手動 快捷鍵
  document.getElementById('btn-all-auto').addEventListener('click', () => {
    if (!state.isRunning) toggleEnginePower(true);
    state.auto.rampStartTime = performance.now();
    Object.keys(state.auto.params).forEach((k) => setParamAutoState(k, true));
    if (state.auto.scanMode === 'manual') {
      scanModeSel.value = 'walk';
      state.auto.scanMode = 'walk';
    }
    if (state.auto.tempoMode === 'manual') {
      tempoModeSel.value = 'pendulum';
      state.auto.tempoMode = 'pendulum';
    }
    if (state.auto.pitchMode === 'manual') {
      pitchModeSel.value = 'glissando';
      state.auto.pitchMode = 'glissando';
    }
  });

  document.getElementById('btn-all-manual').addEventListener('click', () => {
    Object.keys(state.auto.params).forEach((k) => setParamAutoState(k, false));
    scanModeSel.value = 'manual';
    tempoModeSel.value = 'manual';
    pitchModeSel.value = 'manual';
    state.auto.scanMode = 'manual';
    state.auto.tempoMode = 'manual';
    state.auto.pitchMode = 'manual';
  });

  scanModeSel.addEventListener('change', (e) => {
    const val = e.target.value;
    state.auto.scanMode = val;
    state.auto.rampStartTime = performance.now();
    setParamAutoState('position', val !== 'manual');
    if (val !== 'manual' && !state.isRunning) toggleEnginePower(true);
  });

  tempoModeSel.addEventListener('change', (e) => {
    const val = e.target.value;
    state.auto.tempoMode = val;
    state.auto.rampStartTime = performance.now();
    const isAuto = val !== 'manual';
    // 切換粒子速度變化模式時，同步連動「發射密度/速度」、「粒子長度」與「位置擴散」的自動開關（使用者仍可隨時單獨點按鈕關閉其中任一項）
    setParamAutoState('density', isAuto);
    setParamAutoState('size', isAuto);
    setParamAutoState('spread', isAuto);
    if (isAuto && !state.isRunning) toggleEnginePower(true);
  });

  pitchModeSel.addEventListener('change', (e) => {
    const val = e.target.value;
    state.auto.pitchMode = val;
    state.auto.rampStartTime = performance.now();
    setParamAutoState('pitch', val !== 'manual');
    if (val !== 'manual' && !state.isRunning) toggleEnginePower(true);
  });

  bindSlider('auto-cycle-sec', (v) => {
    state.auto.cycleSec = v;
    return `${v.toFixed(1)} s`;
  });

  document.getElementById('btn-trigger-accel').addEventListener('click', () => {
    if (!state.isRunning) toggleEnginePower(true);
    tempoModeSel.value = 'accel';
    state.auto.tempoMode = 'accel';
    state.auto.rampStartTime = performance.now();
    setParamAutoState('density', true);
    setParamAutoState('size', true);
    setParamAutoState('spread', true);
    applySingleGrainParam('density', 3);
    applySingleGrainParam('size', 360);
    applySingleGrainParam('spread', 0.04);
  });

  document.getElementById('btn-trigger-decel').addEventListener('click', () => {
    if (!state.isRunning) toggleEnginePower(true);
    tempoModeSel.value = 'decel';
    state.auto.tempoMode = 'decel';
    state.auto.rampStartTime = performance.now();
    setParamAutoState('density', true);
    setParamAutoState('size', true);
    setParamAutoState('spread', true);
    applySingleGrainParam('density', 62);
    applySingleGrainParam('size', 22);
    applySingleGrainParam('spread', 0.65);
  });

  document.getElementById('btn-stop-auto').addEventListener('click', () => {
    document.getElementById('btn-all-manual').click();
  });

  // 效果器滑桿綁定
  bindSlider('fx-cutoff', (v) => {
    setFilterCutoff(v);
    return `${Math.round(v)} Hz`;
  });
  bindSlider('fx-resonance', (v) => {
    state.fx.resonance = v;
    if (filterNode && audioCtx) filterNode.Q.setTargetAtTime(v, audioCtx.currentTime, 0.02);
    return v.toFixed(1);
  });
  bindSlider('fx-delay', (v) => {
    state.fx.delayMix = v;
    if (delayWetGain && audioCtx) delayWetGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.02);
    return `${Math.round(v * 100)}%`;
  });
  bindSlider('fx-reverb', (v) => {
    state.fx.reverbMix = v;
    if (reverbWetGain && audioCtx) reverbWetGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.02);
    return `${Math.round(v * 100)}%`;
  });
  bindSlider('master-volume', (v) => {
    state.fx.masterGain = v;
    if (masterGainNode && audioCtx) masterGainNode.gain.setTargetAtTime(v, audioCtx.currentTime, 0.02);
    return `${Math.round(v * 100)}%`;
  });

  // 視覺特效控制項綁定
  document.querySelectorAll('.vmode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.visual.mode = btn.dataset.vmode;
      document.querySelectorAll('.vmode-btn').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  document.getElementById('vis-palette').addEventListener('change', (e) => {
    state.visual.palette = e.target.value;
  });

  bindSlider('vis-count', (v) => { state.visual.count = v; return `${v}`; });
  bindSlider('vis-reactivity', (v) => { state.visual.reactivity = v; return `${Math.round(v * 100)}%`; });
  bindSlider('vis-turbulence', (v) => { state.visual.turbulence = v; return `${Math.round(v * 100)}%`; });
  bindSlider('vis-trails', (v) => { state.visual.trails = v; return `${Math.round(v * 100)}%`; });
  bindSlider('vis-glitch', (v) => { state.visual.glitch = v; return `${Math.round(v * 100)}%`; });
  bindSlider('vis-size', (v) => { state.visual.particleSize = v; return `${v.toFixed(1)} px`; });
  bindSlider('cam-opacity', (v) => { state.visual.camOpacity = v; return `${Math.round(v * 100)}%`; });
  bindSlider('cam-clarity', (v) => { state.visual.camClarity = v; return `${Math.round(v * 100)}%`; });

  // 隨機靈感按鈕
  document.getElementById('btn-random-grain').addEventListener('click', () => {
    const rand = (min, max) => min + Math.random() * (max - min);
    setGrainPosition(Number(rand(0.08, 0.92).toFixed(2)));

    const setInput = (id, val) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input'));
    };

    setInput('grain-spread', rand(0.05, 0.55).toFixed(2));
    setInput('grain-size', Math.round(rand(35, 320)));
    setInput('grain-density', Math.round(rand(10, 52)));
    setInput('grain-pitch', [-12, -7, -5, 0, 0, 5, 7, 12][Math.floor(Math.random() * 8)]);
    setInput('grain-detune', Math.round(rand(4, 48)));
  });

  document.getElementById('btn-random-visual').addEventListener('click', () => {
    const modes = ['swarm', 'vortex', 'cybergrid', 'kaleidoscope'];
    const palettes = ['cyberpunk', 'aurora', 'solar', 'monochrome'];
    const nextMode = modes[Math.floor(Math.random() * modes.length)];
    const nextPal = palettes[Math.floor(Math.random() * palettes.length)];

    document.querySelector(`.vmode-btn[data-vmode="${nextMode}"]`).click();
    const palSelect = document.getElementById('vis-palette');
    palSelect.value = nextPal;
    palSelect.dispatchEvent(new Event('change'));
  });

  // 視訊鏡頭粒子化投影與體感發聲開關
  const webcamBtn = document.getElementById('btn-webcam-toggle');
  const webcamBtnText = document.getElementById('webcam-btn-text');
  let webcamStream = null;

  webcamBtn.addEventListener('click', async () => {
    if (state.webcamActive) {
      state.webcamActive = false;
      state.camMotionEnergy = 0;
      const motionFillEl = document.getElementById('motion-meter-fill');
      if (motionFillEl) motionFillEl.style.width = '0%';
      if (webcamStream) {
        webcamStream.getTracks().forEach((t) => t.stop());
        webcamStream = null;
      }
      webcamBtn.classList.remove('active');
      webcamBtnText.textContent = '開啟視訊鏡頭體感發聲 (Webcam Motion)';
      return;
    }

    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      });
      webcamVideo.srcObject = webcamStream;
      await webcamVideo.play();
      state.webcamActive = true;
      webcamBtn.classList.add('active');
      webcamBtnText.textContent = '關閉視訊鏡頭體感發聲 (體感互動中)';

      // 開啟鏡頭時自動啟動聲音引擎，並關閉 HOLD 讓使用者可以直接體驗「有動才有聲音、不動就安靜」的體感演奏
      if (!state.isRunning) {
        await toggleEnginePower(true);
      }
      toggleHold(false);
    } catch (err) {
      console.warn('無法開啟視訊鏡頭:', err);
      alert('無法存取視訊鏡頭，請確認瀏覽器已允許相機權限。');
    }
  });

  // 一鍵演出場景預設組 (Scene Presets)
  const SCENE_CONFIGS = {
    nebula: {
      sample: 'cosmic_pad', pos: 0.35, spread: 0.18, size: 140, density: 24, pitch: 0, detune: 14,
      cutoff: 4500, reverb: 0.55, vmode: 'swarm', palette: 'cyberpunk', turb: 0.65, glitch: 0.3
    },
    glitch_storm: {
      sample: 'vocal_formant', pos: 0.52, spread: 0.45, size: 42, density: 48, pitch: 5, detune: 38,
      cutoff: 8800, reverb: 0.3, vmode: 'cybergrid', palette: 'solar', turb: 1.4, glitch: 0.85
    },
    crystal_rain: {
      sample: 'crystal_arp', pos: 0.28, spread: 0.32, size: 85, density: 32, pitch: 12, detune: 8,
      cutoff: 9600, reverb: 0.72, vmode: 'kaleidoscope', palette: 'aurora', turb: 0.5, glitch: 0.2
    },
    deep_drone: {
      sample: 'sub_perc', pos: 0.18, spread: 0.12, size: 280, density: 16, pitch: -7, detune: 22,
      cutoff: 1400, reverb: 0.68, vmode: 'vortex', palette: 'monochrome', turb: 0.9, glitch: 0.5
    }
  };

  document.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cfg = SCENE_CONFIGS[btn.dataset.scene];
      if (!cfg) return;
      document.querySelectorAll('.pill-btn').forEach((b) => b.classList.toggle('active', b === btn));

      initAudioEngine();
      if (state.sourceMode === 'file') {
        const presetSel = document.getElementById('sample-preset');
        presetSel.value = cfg.sample;
        generateProceduralPreset(cfg.sample);
      }

      const triggerSlider = (id, v) => {
        const el = document.getElementById(id);
        el.value = v;
        el.dispatchEvent(new Event('input'));
      };

      triggerSlider('grain-position', cfg.pos);
      triggerSlider('grain-spread', cfg.spread);
      triggerSlider('grain-size', cfg.size);
      triggerSlider('grain-density', cfg.density);
      triggerSlider('grain-pitch', cfg.pitch);
      triggerSlider('grain-detune', cfg.detune);
      triggerSlider('fx-cutoff', cfg.cutoff);
      triggerSlider('fx-reverb', cfg.reverb);
      triggerSlider('vis-turbulence', cfg.turb);
      triggerSlider('vis-glitch', cfg.glitch);

      document.querySelector(`.vmode-btn[data-vmode="${cfg.vmode}"]`).click();
      const palSel = document.getElementById('vis-palette');
      palSel.value = cfg.palette;
      palSel.dispatchEvent(new Event('change'));

      if (!state.isRunning) toggleEnginePower(true);
    });
  });

  // ==========================================
  // 純音訊無損 WAV 錄音功能 (16-bit Stereo PCM .wav)
  // ==========================================
  const recAudioBtn = document.getElementById('btn-record-audio');
  const recAudioLabel = document.getElementById('record-audio-label');

  function encodeStereoWAV(leftChunks, rightChunks, sampleRate) {
    let totalSamples = 0;
    for (const c of leftChunks) totalSamples += c.length;

    const numChannels = 2;
    const bytesPerSample = 2;
    const dataByteLength = totalSamples * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataByteLength);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataByteLength, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true); // 16-bit
    writeStr(36, 'data');
    view.setUint32(40, dataByteLength, true);

    let offset = 44;
    for (let c = 0; c < leftChunks.length; c++) {
      const L = leftChunks[c];
      const R = rightChunks[c];
      for (let i = 0; i < L.length; i++) {
        const sL = Math.max(-1, Math.min(1, L[i]));
        const sR = Math.max(-1, Math.min(1, R[i]));
        view.setInt16(offset, sL < 0 ? sL * 0x8000 : sL * 0x7FFF, true);
        view.setInt16(offset + 2, sR < 0 ? sR * 0x8000 : sR * 0x7FFF, true);
        offset += 4;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  recAudioBtn.addEventListener('click', () => {
    if (isRecordingWav) {
      isRecordingWav = false;
      recAudioBtn.classList.remove('recording');
      recAudioLabel.textContent = '錄音 WAV';

      if (wavLeftChunks.length > 0 && audioCtx) {
        const wavBlob = encodeStereoWAV(wavLeftChunks, wavRightChunks, audioCtx.sampleRate);
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ilab-granular-audio-${Date.now()}.wav`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      wavLeftChunks = [];
      wavRightChunks = [];
      return;
    }

    initAudioEngine();
    if (!state.isRunning) toggleEnginePower(true);

    wavLeftChunks = [];
    wavRightChunks = [];
    isRecordingWav = true;
    recAudioBtn.classList.add('recording');
    recAudioLabel.textContent = '停止並下載 .WAV';
  });

  // ==========================================
  // 錄製畫面與音訊匯出功能 (優先輸出 MP4 H.264/AAC 影片)
  // ==========================================
  let mediaRecorder = null;
  let recordedChunks = [];
  const recBtn = document.getElementById('btn-record');
  const recLabel = document.getElementById('record-label');

  function getPreferredRecordingConfig() {
    const candidates = [
      { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
      { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
      { mimeType: 'video/mp4;codecs=h264,aac', ext: 'mp4' },
      { mimeType: 'video/mp4', ext: 'mp4' },
      { mimeType: 'video/webm;codecs=h264,opus', ext: 'mp4' },
      { mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
      { mimeType: 'video/webm', ext: 'webm' }
    ];
    for (const item of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(item.mimeType)) {
        return item;
      }
    }
    return { mimeType: '', ext: 'mp4' };
  }

  recBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      recBtn.classList.remove('recording');
      recLabel.textContent = '錄影 MP4';
      return;
    }

    initAudioEngine();
    if (!state.isRunning) toggleEnginePower(true);

    try {
      const canvasStream = fxCanvas.captureStream(60);
      const combinedTracks = [
        ...canvasStream.getVideoTracks(),
        ...(mediaStreamDest ? mediaStreamDest.stream.getAudioTracks() : [])
      ];
      const combinedStream = new MediaStream(combinedTracks);

      const { mimeType, ext } = getPreferredRecordingConfig();
      const options = mimeType
        ? { mimeType, videoBitsPerSecond: 8000000 }
        : { videoBitsPerSecond: 8000000 };

      mediaRecorder = new MediaRecorder(combinedStream, options);
      recordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blobType = ext === 'mp4' ? 'video/mp4' : (mimeType || 'video/webm');
        const blob = new Blob(recordedChunks, { type: blobType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ilab-granular-session-${Date.now()}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      };

      mediaRecorder.start();
      recBtn.classList.add('recording');
      recLabel.textContent = `停止並下載 .${ext.toUpperCase()}`;
    } catch (err) {
      console.error('錄影啟動失敗:', err);
      alert('您的瀏覽器不支援即時畫布錄影功能。');
    }
  });

  // 隱藏 / 顯示 UI 與全螢幕快捷鍵
  const workspaceEl = document.getElementById('workspace-panels');
  document.getElementById('btn-toggle-ui').addEventListener('click', () => {
    workspaceEl.classList.toggle('ui-hidden');
  });

  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      toggleEnginePower();
    } else if (e.key === 'h' || e.key === 'H') {
      workspaceEl.classList.toggle('ui-hidden');
    } else if (e.key === 'f' || e.key === 'F') {
      document.getElementById('btn-fullscreen').click();
    }
  });

  // ==========================================
  // MiniMax AI 語音導覽與自動說明影片剪輯工作台 (Director Studio)
  // ==========================================
  const directorModal = document.getElementById('director-modal');
  const openDirectorBtn = document.getElementById('btn-open-director');
  const closeDirectorBtn = document.getElementById('btn-close-director');
  const directorStatusEl = document.getElementById('director-status');
  const mmApiKeyInput = document.getElementById('mm-api-key');
  const mmGroupIdInput = document.getElementById('mm-group-id');
  const mmEndpointSel = document.getElementById('mm-endpoint');
  const mmModelSel = document.getElementById('mm-model');
  const mmVoiceSel = document.getElementById('mm-voice');

  let mmConfig = {
    bgmDuck: 0.32,
    speed: 1.05,
    isRunningShow: false
  };

  // 從 localStorage 載入已保存的 MiniMax 設定
  try {
    const savedKey = localStorage.getItem('aether_mm_api_key');
    const savedGroup = localStorage.getItem('aether_mm_group_id');
    const savedEndpoint = localStorage.getItem('aether_mm_endpoint');
    if (savedKey) mmApiKeyInput.value = savedKey;
    if (savedGroup) mmGroupIdInput.value = savedGroup;
    if (savedEndpoint) mmEndpointSel.value = savedEndpoint;
  } catch (_) {}

  const saveMmCredentials = () => {
    try {
      localStorage.setItem('aether_mm_api_key', mmApiKeyInput.value.trim());
      localStorage.setItem('aether_mm_group_id', mmGroupIdInput.value.trim());
      localStorage.setItem('aether_mm_endpoint', mmEndpointSel.value);
    } catch (_) {}
  };

  mmApiKeyInput.addEventListener('input', saveMmCredentials);
  mmApiKeyInput.addEventListener('change', saveMmCredentials);
  mmGroupIdInput.addEventListener('input', saveMmCredentials);
  mmGroupIdInput.addEventListener('change', saveMmCredentials);
  mmEndpointSel.addEventListener('change', saveMmCredentials);

  bindSlider('mm-bgm-duck', (v) => {
    mmConfig.bgmDuck = v;
    return `${Math.round(v * 100)}%`;
  });
  bindSlider('mm-speed', (v) => {
    mmConfig.speed = v;
    return `${v.toFixed(2)}x`;
  });

  openDirectorBtn.addEventListener('click', () => {
    directorModal.style.display = directorModal.style.display === 'none' ? 'flex' : 'none';
  });
  closeDirectorBtn.addEventListener('click', () => {
    saveMmCredentials();
    directorModal.style.display = 'none';
  });

  // 呼叫 MiniMax T2A v2 API 並解碼為 Web Audio AudioBuffer
  async function synthesizeMiniMaxSpeech(text) {
    initAudioEngine();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const apiKey = mmApiKeyInput.value.trim();
    const groupId = mmGroupIdInput.value.trim();
    const baseUrl = mmEndpointSel.value;
    const model = mmModelSel.value;
    const voiceId = mmVoiceSel.value;

    if (!apiKey) {
      throw new Error('請先在上方欄位貼上您的 MiniMax API Key！');
    }
    saveMmCredentials();

    const url = groupId ? `${baseUrl}?GroupId=${encodeURIComponent(groupId)}` : baseUrl;

    const payload = {
      model,
      text,
      stream: false,
      voice_setting: {
        voice_id: voiceId,
        speed: mmConfig.speed,
        vol: 1.0,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 120)}`);
    }

    const json = await res.json();
    if (json.base_resp && json.base_resp.status_code !== 0) {
      throw new Error(`MiniMax 錯誤 (${json.base_resp.status_code}): ${json.base_resp.status_msg}`);
    }

    const hexAudio = json.data && json.data.audio;
    if (!hexAudio) {
      throw new Error('MiniMax 回傳資料中未包含音訊內容 (data.audio)');
    }

    // 將 Hex 字串轉為 Uint8Array 並解碼為 AudioBuffer
    const byteLen = hexAudio.length / 2;
    const bytes = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) {
      bytes[i] = parseInt(hexAudio.substr(i * 2, 2), 16);
    }

    return await audioCtx.decodeAudioData(bytes.buffer);
  }

  // 播放解碼後的語音 Buffer（同時送入喇叭、視覺頻譜儀、WAV 錄音器與 MP4 錄影軌道）
  function playNarrationBuffer(audioBuffer) {
    return new Promise((resolve) => {
      const src = audioCtx.createBufferSource();
      src.buffer = audioBuffer;

      const voiceGain = audioCtx.createGain();
      voiceGain.gain.value = 1.15;

      src.connect(voiceGain);
      voiceGain.connect(analyserNode);
      if (mediaStreamDest) voiceGain.connect(mediaStreamDest);
      if (wavRecorderNode) voiceGain.connect(wavRecorderNode);

      src.onended = () => resolve();
      src.start();
    });
  }

  // 試聽第 1 段語音按鈕
  document.getElementById('btn-test-mm-voice').addEventListener('click', async () => {
    const firstTextarea = document.querySelector('.step-script');
    const text = firstTextarea ? firstTextarea.value.trim() : '歡迎來到 Ilab 粒子聲音合成實驗室。';
    directorStatusEl.textContent = '⏳ 正在連線 MiniMax 合成試聽語音...';
    directorStatusEl.style.color = '#ffb800';

    try {
      const buf = await synthesizeMiniMaxSpeech(text);
      directorStatusEl.textContent = `✅ 語音合成成功 (${buf.duration.toFixed(1)} 秒)，正在播放試聽...`;
      directorStatusEl.style.color = '#00ff9d';
      state.narrationStepTitle = 'VOICE PREVIEW // 語音試聽';
      state.narrationSubtitle = text;
      await playNarrationBuffer(buf);
      state.narrationSubtitle = '';
      state.narrationStepTitle = '';
    } catch (err) {
      console.error('MiniMax 語音合成失敗:', err);
      directorStatusEl.textContent = `❌ 合成失敗：${err.message}`;
      directorStatusEl.style.color = '#ff2a85';
    }
  });

  // 執行各分鏡段落對應的自動化功能與視覺特效切換
  function triggerStoryboardAction(stepIdx) {
    if (stepIdx === 0) {
      // 段落 1：音檔粒子 + 星雲漫遊 + 平滑漫步
      document.getElementById('btn-source-file').click();
      document.querySelector('.pill-btn[data-scene="nebula"]').click();
      setParamAutoState('position', true);
      scanModeSel.value = 'walk';
      state.auto.scanMode = 'walk';
    } else if (stepIdx === 1) {
      // 段落 2：相鄰步進漫步 (±1) + 粒子速度由慢到快漸變 + 引力漩渦
      scanModeSel.value = 'neighbor_step';
      state.auto.scanMode = 'neighbor_step';
      setParamAutoState('position', true);
      document.getElementById('btn-trigger-accel').click();
      document.querySelector('.vmode-btn[data-vmode="vortex"]').click();
    } else if (stepIdx === 2) {
      // 段落 3：多波形振盪器粒子雲 + 水晶萬花筒 + 滑音演化
      document.getElementById('btn-source-osc').click();
      document.querySelector('.pill-btn[data-scene="crystal_rain"]').click();
      setParamAutoState('pitch', true);
      pitchModeSel.value = 'glissando';
      state.auto.pitchMode = 'glissando';
    } else if (stepIdx === 3) {
      // 段落 4：電馭風暴 + 全自動演化展示
      document.getElementById('btn-source-file').click();
      document.querySelector('.pill-btn[data-scene="glitch_storm"]').click();
      document.getElementById('btn-all-auto').click();
    }
  }

  // 一鍵自動合成全部段落語音、展演功能並錄製下載 MP4 說明影片
  document.getElementById('btn-start-auto-show').addEventListener('click', async () => {
    if (mmConfig.isRunningShow) return;

    const stepElements = Array.from(document.querySelectorAll('.story-step'));
    const scripts = stepElements.map((el, idx) => ({
      el,
      title: el.querySelector('.step-badge').textContent,
      text: el.querySelector('.step-script').value.trim()
    })).filter((s) => s.text.length > 0);

    if (!scripts.length) {
      directorStatusEl.textContent = '❌ 請至少填寫一段旁白文字！';
      return;
    }

    mmConfig.isRunningShow = true;
    const startBtn = document.getElementById('btn-start-auto-show');
    startBtn.disabled = true;

    try {
      // 1. 預先向 MiniMax 合成所有段落的語音，確保錄影過程零延遲無縫銜接
      const audioBuffers = [];
      for (let i = 0; i < scripts.length; i++) {
        directorStatusEl.textContent = `⏳ [步驟 1/2] 正在透過 MiniMax 生成第 ${i + 1}/${scripts.length} 段語音旁白...`;
        directorStatusEl.style.color = '#ffb800';
        const buf = await synthesizeMiniMaxSpeech(scripts[i].text);
        audioBuffers.push(buf);
      }

      directorStatusEl.textContent = '🎬 語音全部準備完成！即將關閉設定窗、開始自動展演並錄製 MP4...';
      directorStatusEl.style.color = '#00ff9d';
      await new Promise((r) => setTimeout(r, 900));

      // 關閉工作台視窗以露出完整畫布與控制面板供錄影展示
      directorModal.style.display = 'none';

      // 啟動聲音引擎並將合成器背景音量適度調低 (Ducking) 凸顯旁白人聲
      if (!state.isRunning) await toggleEnginePower(true);
      toggleHold(true);
      const originalMasterGain = state.fx.masterGain;
      if (masterGainNode && audioCtx) {
        masterGainNode.gain.setTargetAtTime(mmConfig.bgmDuck, audioCtx.currentTime, 0.15);
      }

      // 若尚未開始錄影，自動按下錄影 MP4 按鈕
      const wasRecording = mediaRecorder && mediaRecorder.state === 'recording';
      if (!wasRecording) {
        recBtn.click();
      }

      // 2. 依序執行每個分鏡段落：切換場景與自動化參數 + 顯示畫布字幕 + 播報 MiniMax 語音
      for (let i = 0; i < scripts.length; i++) {
        stepElements.forEach((el, idx) => el.classList.toggle('active-step', idx === i));
        triggerStoryboardAction(i);
        state.narrationStepTitle = scripts[i].title;
        state.narrationSubtitle = scripts[i].text;

        await playNarrationBuffer(audioBuffers[i]);
        // 段落之間留 0.9 秒讓觀眾欣賞聲音粒子與視覺變化
        await new Promise((r) => setTimeout(r, 900));
      }

      // 結束展演：清除字幕、恢復主音量並自動停止錄影下載 MP4
      state.narrationSubtitle = '';
      state.narrationStepTitle = '';
      if (masterGainNode && audioCtx) {
        masterGainNode.gain.setTargetAtTime(originalMasterGain, audioCtx.currentTime, 0.25);
      }

      await new Promise((r) => setTimeout(r, 600));
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        recBtn.click(); // 觸發停止並自動下載 .mp4
      }

      directorStatusEl.textContent = '🎉 自動展演與 MP4 說明影片錄製完成！檔案已自動開始下載。';
      directorStatusEl.style.color = '#00ff9d';
    } catch (err) {
      console.error('自動展演失敗:', err);
      directorModal.style.display = 'flex';
      directorStatusEl.textContent = `❌ 執行中斷：${err.message}`;
      directorStatusEl.style.color = '#ff2a85';
    } finally {
      mmConfig.isRunningShow = false;
      startBtn.disabled = false;
    }
  });

  // ==========================================
  // 主動畫與音訊排程迴圈 (60 FPS)
  // ==========================================
  let frameCount = 0;
  let lastFpsTime = performance.now();
  const fpsEl = document.getElementById('hud-fps');
  const grainsEl = document.getElementById('hud-grains');

  function mainLoop(nowMs) {
    requestAnimationFrame(mainLoop);

    updateGranularScheduler(nowMs);
    analyzeAudioFrame();
    renderVisualFX(nowMs);
    renderWaveformOverlay(nowMs);
    renderSpectrumScope();

    grainsEl.textContent = state.activeGrainsCount;

    frameCount++;
    if (nowMs - lastFpsTime >= 500) {
      const fps = Math.min(60, Math.round((frameCount * 1000) / (nowMs - lastFpsTime)));
      fpsEl.textContent = fps;
      frameCount = 0;
      lastFpsTime = nowMs;
    }
  }

  // 初始化靜態預覽波形並啟動主迴圈
  for (let i = 0; i < cachedWavePeaks.length; i++) {
    cachedWavePeaks[i] = 0.25 + 0.55 * Math.abs(Math.sin(i * 0.08) * Math.cos(i * 0.03));
  }
  requestAnimationFrame(mainLoop);
})();

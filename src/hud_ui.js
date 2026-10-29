import { renderAllHudMiiAvatars, renderMiiAvatar } from "./mii_avatars.js";

export class HudUI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.bannerTimer = null;
    this.timingPopupTimer = null;
    this.skillHistory = [980, 1005, 1030, 1065, 1120];
    this.selectedGamesToWin = 2;
    this.selectedInputMode = "mouse";
    this.selectedDifficulty = "casual";
    this.currentRoomId = "default";
    this.currentTunnelUrl = window.location.origin;

    this.elTitleModal = document.getElementById("title-modal");
    this.elCompanionModal = document.getElementById("companion-modal");
    this.elVictoryModal = document.getElementById("victory-modal");
    this.elScoreCenter = document.getElementById("score-center-display");
    this.elScorePlayer = document.getElementById("score-player-text");
    this.elScoreSep = document.getElementById("score-separator");
    this.elScoreOpponent = document.getElementById("score-opponent-text");
    this.elGamesPlayer = document.getElementById("games-pill-player");
    this.elGamesOpponent = document.getElementById("games-pill-opponent");
    this.elServerTag = document.getElementById("server-tag");
    this.elPlayerNameplate = document.getElementById("player-nameplate");
    this.elTimingPopup = document.getElementById("timing-popup");
    this.elTimingGrade = document.getElementById("timing-popup-grade");
    this.elTimingDetail = document.getElementById("timing-popup-detail");
    this.elBannerLayer = document.getElementById("center-banner-layer");
    this.elBannerText = document.getElementById("center-banner-text");
    this.elBannerSub = document.getElementById("center-banner-sub");
    this.elReplayBadge = document.getElementById("replay-badge");
    this.elTimingCursor = document.getElementById("timing-cursor");
    this.elGaugeModeTitle = document.getElementById("gauge-mode-title");
    this.elGaugeSpeedReadout = document.getElementById("gauge-speed-readout");
    this.elAudioDot = document.getElementById("audio-status-dot");
    this.elAudioLabel = document.getElementById("audio-track-label");
    this.elCameraLabel = document.getElementById("camera-mode-label");
    this.elWebcamPip = document.getElementById("webcam-pip-card");
    this.elWebcamDot = document.getElementById("webcam-status-dot");
    this.elPhoneDot = document.getElementById("phone-status-dot");
    this.elPhoneLabel = document.getElementById("phone-status-label");
    this.elOpponentPresencePill = document.getElementById("opponent-presence-pill");
    this.elOpponentPresenceText = document.getElementById("opponent-presence-text");

    this.elHud3dRow = document.getElementById("hud-3d-telemetry-row");
    this.elHud3dDot = document.getElementById("hud-3d-calib-dot");
    this.elHud3dText = document.getElementById("hud-3d-calib-text");
    this.elHud3dAngles = document.getElementById("hud-3d-angles-text");
    this.elTitlePhoneBadge = document.getElementById("title-phone-badge");

    this.elCalibCanvasP1 = document.getElementById("calib-canvas-p1");
    this.elCalibCanvasP2 = document.getElementById("calib-canvas-p2");
    this.elCalibReadoutP1 = document.getElementById("calib-readout-p1");
    this.elCalibReadoutP2 = document.getElementById("calib-readout-p2");

    this._lastRoomStatus = {};
    this._lastOtherReady = false;
    this._justJoinedTimer = null;

    this._renderAllMiiPortraits();
    this._bindEvents();
    this._initUrlParamsState();
    this._drawMiniRacketPreview(this.elCalibCanvasP1, { pitch: 0, roll: 0, yaw: 0 }, false, "#00c8ff");
    this._drawMiniRacketPreview(this.elCalibCanvasP2, { pitch: 0, roll: 0, yaw: 0 }, false, "#ff6448");
  }

  _renderAllMiiPortraits() {
    renderAllHudMiiAvatars();
  }

  _drawMiiFace(canvas, opts = {}) {
    renderMiiAvatar(canvas, opts.characterId || canvas?.id || "player1", opts);
  }

  _initUrlParamsState() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = (params.get("room") || "").trim().toUpperCase();
    const roleParam = (params.get("role") || "p1").trim().toLowerCase() === "p2" ? "p2" : "p1";
    const modeParam = (params.get("mode") || params.get("difficulty") || "").toLowerCase();

    this.playerRole = roleParam;

    if (roomParam && roomParam !== "DEFAULT") {
      this.currentRoomId = roomParam;
      this._setDifficultySelection(modeParam === "couch_1v1" ? "couch_1v1" : "1v1", { notify: false });
    } else if (["casual", "pro", "couch_1v1", "1v1"].includes(modeParam)) {
      this._setDifficultySelection(modeParam, { notify: false });
    }

    if (roleParam === "p2") {
      const youTag = document.querySelector(".you-tag");
      if (youTag) youTag.textContent = "Player 1";
      const oppLabel = document.getElementById("setup-opponent-label");
      if (oppLabel) oppLabel.textContent = "You (P2)";
    }

    this.updateMultiplayerRoomInfo({
      roomId: this.currentRoomId,
      tunnelUrl: this.currentTunnelUrl,
      role: this.playerRole,
    });
  }

  _setDifficultySelection(mode, { notify = true } = {}) {
    const validMode = ["casual", "pro", "couch_1v1", "1v1"].includes(mode) ? mode : "casual";
    this.selectedDifficulty = validMode;

    document.querySelectorAll("#difficulty-mode-group .wii-green-choice").forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.difficulty === validMode);
    });

    const matchLengthSection = document.getElementById("match-length-section");
    if (matchLengthSection) {
      matchLengthSection.classList.remove("hidden");
    }
    const selectedGamesBtn = document.querySelector("#match-length-group .wii-green-choice.selected");
    const totalGames = parseInt(selectedGamesBtn?.dataset?.games || "3", 10);
    this.selectedGamesToWin = Math.ceil(totalGames / 2);
    this.configureGameBubbles(this.selectedGamesToWin);
    if (notify && this.callbacks.onSelectMatchLength) {
      this.callbacks.onSelectMatchLength(this.selectedGamesToWin);
    }

    const oppLabel = document.getElementById("setup-opponent-label");
    if (oppLabel && this.playerRole !== "p2") {
      if (validMode === "couch_1v1") {
        oppLabel.textContent = "Player 2 (Couch)";
      } else if (validMode === "1v1") {
        oppLabel.textContent = "Player 2 (Online)";
      } else if (validMode === "pro") {
        oppLabel.textContent = "Matt (Pro AI)";
      } else {
        oppLabel.textContent = "Club AI";
      }
    }

    this.updateOpponentPresence(this._lastRoomStatus || {});
    if (notify && this.callbacks.onSelectDifficulty) {
      this.callbacks.onSelectDifficulty(validMode);
    }
  }

  _bindEvents() {
    document.querySelectorAll("#difficulty-mode-group .wii-green-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const diff = btn.dataset.difficulty || "casual";
        this._setDifficultySelection(diff, { notify: true });
      });
    });

    const matchBtns = document.querySelectorAll("#match-length-group .wii-green-choice");
    matchBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        matchBtns.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        const games = parseInt(btn.dataset.games || "3", 10);
        this.selectedGamesToWin = Math.ceil(games / 2);
        this.configureGameBubbles(this.selectedGamesToWin);
        if (this.callbacks.onSelectMatchLength) {
          this.callbacks.onSelectMatchLength(this.selectedGamesToWin);
        }
      });
    });

    const inputBtns = document.querySelectorAll("#input-mode-group .wii-cyan-choice");
    inputBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        inputBtns.forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        this.selectedInputMode = btn.dataset.input || "mouse";
        if (this.callbacks.onSelectInputMode) {
          this.callbacks.onSelectInputMode(this.selectedInputMode);
        }
      });
    });

    const startBtn = document.getElementById("btn-start-match");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        this.hideTitleModal();
        if (this.callbacks.onStartMatch) {
          this.callbacks.onStartMatch({
            gamesToWin: this.selectedGamesToWin,
            inputMode: this.selectedInputMode,
            difficulty: this.selectedDifficulty,
          });
        }
      });
    }

    const titlePairBtn = document.getElementById("btn-title-pair-phone");
    if (titlePairBtn) {
      titlePairBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openMultiplayerModal();
      });
    }

    const audioBtn = document.getElementById("btn-audio-toggle");
    if (audioBtn) {
      audioBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.callbacks.onToggleAudio) this.callbacks.onToggleAudio();
      });
    }

    const camBtn = document.getElementById("btn-camera-cycle");
    if (camBtn) {
      camBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.callbacks.onCycleCamera) this.callbacks.onCycleCamera();
      });
    }

    const replayBtn = document.getElementById("btn-replay-trigger");
    if (replayBtn) {
      replayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.callbacks.onToggleReplay) this.callbacks.onToggleReplay();
      });
    }

    const webcamBtn = document.getElementById("btn-webcam-toggle");
    if (webcamBtn) {
      webcamBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (this.callbacks.onToggleWebcam) this.callbacks.onToggleWebcam();
      });
    }

    const phoneBtn = document.getElementById("btn-phone-racket");
    if (phoneBtn) {
      phoneBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openMultiplayerModal();
      });
    }

    const mpBtn = document.getElementById("btn-multiplayer-modal");
    if (mpBtn) {
      mpBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openMultiplayerModal();
      });
    }

    const hudRecenterBtn = document.getElementById("btn-hud-recenter-3d");
    if (hudRecenterBtn) {
      hudRecenterBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetRole = this.playerRole === "p2" ? "p2" : "p1";
        if (this.callbacks.onRecenter3D) this.callbacks.onRecenter3D(targetRole);
        hudRecenterBtn.textContent = "Zeroed ✓";
        setTimeout(() => {
          hudRecenterBtn.textContent = "Zero 3D";
        }, 1000);
      });
    }

    const recenterP1Btn = document.getElementById("btn-recenter-p1");
    if (recenterP1Btn) {
      recenterP1Btn.addEventListener("click", () => {
        if (this.callbacks.onRecenter3D) this.callbacks.onRecenter3D("p1");
        recenterP1Btn.textContent = "Zeroed 3D ✓";
        setTimeout(() => {
          recenterP1Btn.textContent = "🎯 Recenter 3D";
        }, 1200);
      });
    }

    const recenterP2Btn = document.getElementById("btn-recenter-p2");
    if (recenterP2Btn) {
      recenterP2Btn.addEventListener("click", () => {
        if (this.callbacks.onRecenter3D) this.callbacks.onRecenter3D("p2");
        recenterP2Btn.textContent = "Zeroed 3D ✓";
        setTimeout(() => {
          recenterP2Btn.textContent = "🎯 Recenter 3D";
        }, 1200);
      });
    }

    const hapticP1Btn = document.getElementById("btn-test-haptic-p1");
    if (hapticP1Btn) {
      hapticP1Btn.addEventListener("click", () => {
        if (this.callbacks.onTestHaptic) this.callbacks.onTestHaptic("p1");
        hapticP1Btn.textContent = "Sent Ping ✓";
        setTimeout(() => {
          hapticP1Btn.textContent = "📳 Test Haptic";
        }, 1000);
      });
    }

    const hapticP2Btn = document.getElementById("btn-test-haptic-p2");
    if (hapticP2Btn) {
      hapticP2Btn.addEventListener("click", () => {
        if (this.callbacks.onTestHaptic) this.callbacks.onTestHaptic("p2");
        hapticP2Btn.textContent = "Sent Ping ✓";
        setTimeout(() => {
          hapticP2Btn.textContent = "📳 Test Haptic";
        }, 1000);
      });
    }

    const createRoomBtn = document.getElementById("btn-create-1v1-room");
    if (createRoomBtn) {
      createRoomBtn.addEventListener("click", async () => {
        createRoomBtn.disabled = true;
        createRoomBtn.textContent = "Creating...";
        try {
          if (this.callbacks.onCreateMultiplayerRoom) {
            const res = await this.callbacks.onCreateMultiplayerRoom();
            if (res && res.roomId) {
              this.currentRoomId = res.roomId;
              this.updateMultiplayerRoomInfo({
                roomId: res.roomId,
                tunnelUrl: res.tunnelUrl || this.currentTunnelUrl,
                urls: res.urls,
              });
            }
          }
        } finally {
          createRoomBtn.disabled = false;
          createRoomBtn.textContent = "+ New Room Code";
        }
      });
    }

    const copyP2Btn = document.getElementById("btn-copy-p2-url");
    if (copyP2Btn) {
      copyP2Btn.addEventListener("click", async () => {
        const base = (this.currentTunnelUrl || window.location.origin).replace(/\/+$/, "");
        const url = `${base}/?room=${encodeURIComponent(this.currentRoomId)}&role=p2&mode=1v1`;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(url);
            copyP2Btn.textContent = "Copied P2 Link ✓";
            setTimeout(() => {
              copyP2Btn.textContent = "📋 Copy P2 Online Court Link";
            }, 1400);
          }
        } catch {
          // Ignore clipboard errors
        }
      });
    }

    const closeCompanionBtn = document.getElementById("btn-close-companion");
    if (closeCompanionBtn) {
      closeCompanionBtn.addEventListener("click", () => {
        if (this.elCompanionModal) this.elCompanionModal.classList.add("hidden");
      });
    }

    const playAgainBtn = document.getElementById("btn-play-again");
    if (playAgainBtn) {
      playAgainBtn.addEventListener("click", () => {
        this.hideVictoryModal();
        if (this.callbacks.onPlayAgain) this.callbacks.onPlayAgain();
      });
    }

    const returnTitleBtn = document.getElementById("btn-return-title");
    if (returnTitleBtn) {
      returnTitleBtn.addEventListener("click", () => {
        this.hideVictoryModal();
        this.showTitleModal();
      });
    }
  }

  async openMultiplayerModal() {
    if (!this.elCompanionModal) return;
    try {
      const resp = await fetch("/api/tunnel/status", { cache: "no-store" });
      if (resp.ok) {
        const data = await resp.json();
        if (data.tunnelUrl && !data.tunnelUrl.includes("argon-tennis-sandbox")) {
          this.currentTunnelUrl = data.tunnelUrl;
        }
      }
    } catch {
      // Ignore network error
    }
    this.updateMultiplayerRoomInfo({
      roomId: this.currentRoomId,
      tunnelUrl: this.currentTunnelUrl,
    });
    this.elCompanionModal.classList.remove("hidden");
  }

  hideTitleModal() {
    document.documentElement.classList.add("autoplay-mode");
    if (this.elTitleModal) {
      this.elTitleModal.classList.add("hidden");
      this.elTitleModal.style.display = "none";
    }
  }

  showTitleModal() {
    document.documentElement.classList.remove("autoplay-mode");
    if (this.elTitleModal) {
      this.elTitleModal.classList.remove("hidden");
      this.elTitleModal.style.display = "flex";
    }
  }

  hideVictoryModal() {
    if (this.elVictoryModal) this.elVictoryModal.classList.add("hidden");
  }

  showVictoryModal({ playerWon, playerGames, opponentGames }) {
    if (!this.elVictoryModal) return;
    const banner = document.getElementById("victory-result-banner");
    const score = document.getElementById("victory-match-score");
    const rating = document.getElementById("skill-rating-value");
    if (banner) {
      banner.textContent = playerWon ? "YOU WIN!" : "TRY AGAIN!";
      banner.style.color = playerWon ? "#ffea28" : "#9ad4ff";
    }
    if (score) score.textContent = `Final Games: ${playerGames} - ${opponentGames}`;
    const skillVal = playerWon ? 1145 : 1020;
    if (rating) rating.textContent = String(skillVal);
    this._drawSkillGraph(playerWon);
    this.elVictoryModal.classList.remove("hidden");
  }

  _drawSkillGraph(playerWon) {
    const canvas = document.getElementById("skill-graph-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#d0dce8";
    ctx.lineWidth = 1;
    for (let y = 25; y < h; y += 35) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const proY = h * 0.56;
    ctx.strokeStyle = "#9aaab8";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, proY);
    ctx.lineTo(w, proY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#6c7c8c";
    ctx.font = "bold 11px sans-serif";
    ctx.fillText("PRO 1000", 8, proY - 5);

    const pts = playerWon ? [0.74, 0.66, 0.58, 0.45, 0.24] : [0.74, 0.66, 0.58, 0.52, 0.55];
    ctx.strokeStyle = "#1f96f2";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach((p, idx) => {
      const x = 24 + (idx / (pts.length - 1)) * (w - 48);
      const y = h * p;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const lastX = w - 24;
    const lastY = h * pts[pts.length - 1];
    ctx.fillStyle = "#ffea28";
    ctx.beginPath();
    ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#006cc4";
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  configureGameBubbles(gamesToWin = 2) {
    [this.elGamesPlayer, this.elGamesOpponent].forEach((container) => {
      if (!container) return;
      container.querySelectorAll(".game-bubble").forEach((b, idx) => {
        if (idx < Math.max(1, gamesToWin)) b.classList.remove("hidden");
        else b.classList.add("hidden");
      });
    });
  }

  updateScoreboard({
    playerScoreText = "00",
    opponentScoreText = "00",
    deuceLabel = null,
    playerGames = 0,
    opponentGames = 0,
    gamesToWin = 2,
  }) {
    if (!this.elScoreCenter) return;
    if (deuceLabel) {
      this.elScoreCenter.classList.add("deuce-mode");
      this.elScorePlayer.textContent = deuceLabel;
      this.elScoreSep.classList.add("hidden");
      this.elScoreOpponent.classList.add("hidden");
    } else {
      this.elScoreCenter.classList.remove("deuce-mode");
      this.elScorePlayer.textContent = playerScoreText;
      this.elScoreSep.classList.remove("hidden");
      this.elScoreOpponent.classList.remove("hidden");
      this.elScoreOpponent.textContent = opponentScoreText;
    }
    this.configureGameBubbles(gamesToWin);
    if (this.elGamesPlayer) {
      this.elGamesPlayer.querySelectorAll(".game-bubble").forEach((b, idx) => {
        b.classList.toggle("won", idx < playerGames);
      });
    }
    if (this.elGamesOpponent) {
      this.elGamesOpponent.querySelectorAll(".game-bubble").forEach((b, idx) => {
        b.classList.toggle("won", idx < opponentGames);
      });
    }
  }

  updateServerTag(screenPos, visible) {
    if (!this.elServerTag) return;
    if (!visible || !screenPos || !screenPos.visible) {
      this.elServerTag.classList.add("hidden");
      return;
    }
    this.elServerTag.classList.remove("hidden");
    const x = Math.max(80, Math.min(window.innerWidth - 80, screenPos.x));
    const y = Math.max(95, Math.min(window.innerHeight - 90, screenPos.y));
    this.elServerTag.style.left = `${x.toFixed(1)}px`;
    this.elServerTag.style.top = `${y.toFixed(1)}px`;
  }

  updatePlayerNameplate(screenPos, visible) {
    if (!this.elPlayerNameplate) return;
    if (!visible || !screenPos || !screenPos.visible) {
      this.elPlayerNameplate.classList.add("hidden");
      return;
    }
    this.elPlayerNameplate.classList.remove("hidden");
    const x = Math.max(90, Math.min(window.innerWidth - 90, screenPos.x));
    const y = Math.max(120, Math.min(window.innerHeight - 50, screenPos.y));
    this.elPlayerNameplate.style.left = `${x.toFixed(1)}px`;
    this.elPlayerNameplate.style.top = `${y.toFixed(1)}px`;
  }

  showTimingPopup({ grade = "PERFECT", detail = "POWER TOPSPIN • 176 KM/H", screenPos = null, durationMs = 1100 }) {
    if (!this.elTimingPopup) return;
    if (this.timingPopupTimer) clearTimeout(this.timingPopupTimer);
    this.elTimingGrade.textContent = grade;
    this.elTimingGrade.className = "timing-grade";
    if (grade.includes("EARLY")) this.elTimingGrade.classList.add("grade-early");
    else if (grade.includes("LATE")) this.elTimingGrade.classList.add("grade-late");
    else this.elTimingGrade.classList.add("grade-perfect");

    this.elTimingDetail.textContent = detail;
    if (screenPos && screenPos.visible) {
      const x = Math.max(110, Math.min(window.innerWidth - 110, screenPos.x));
      const y = Math.max(110, Math.min(window.innerHeight - 120, screenPos.y));
      this.elTimingPopup.style.left = `${x.toFixed(1)}px`;
      this.elTimingPopup.style.top = `${y.toFixed(1)}px`;
    } else {
      this.elTimingPopup.style.left = "50%";
      this.elTimingPopup.style.top = "54%";
    }
    this.elTimingPopup.classList.remove("hidden");
    if (durationMs > 0) {
      this.timingPopupTimer = setTimeout(() => {
        this.elTimingPopup.classList.add("hidden");
      }, durationMs);
    }
  }

  showCenterBanner(text, { style = "style-gold", subText = "", durationMs = 1500, persistent = false } = {}) {
    if (!this.elBannerLayer || !this.elBannerText) return;
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    this.elBannerText.textContent = text;
    this.elBannerText.className = `center-banner-text ${style}`;
    if (this.elBannerSub) {
      if (subText) {
        this.elBannerSub.textContent = subText;
        this.elBannerSub.classList.remove("hidden");
      } else {
        this.elBannerSub.classList.add("hidden");
      }
    }
    this.elBannerLayer.classList.remove("hidden");
    if (!persistent && durationMs > 0) {
      this.bannerTimer = setTimeout(() => {
        this.hideCenterBanner();
      }, durationMs);
    }
  }

  hideCenterBanner() {
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    if (this.elBannerLayer) this.elBannerLayer.classList.add("hidden");
  }

  setReplayMode(active) {
    document.body.classList.toggle("replay-mode", !!active);
    if (this.elReplayBadge) this.elReplayBadge.classList.toggle("hidden", !active);
  }

  setActiveShotChip() {}

  updateTimingGauge({ cursorNormalized = 0.5, modeTitle = "SWING TIMING", speedText = "READY" }) {
    if (this.elTimingCursor) {
      const pct = Math.max(4, Math.min(96, cursorNormalized * 100));
      this.elTimingCursor.style.left = `${pct.toFixed(1)}%`;
    }
    if (this.elGaugeModeTitle) this.elGaugeModeTitle.textContent = modeTitle;
    if (this.elGaugeSpeedReadout) this.elGaugeSpeedReadout.textContent = speedText;
  }

  updateAudioStatus({ playing, trackName }) {
    if (this.elAudioDot) this.elAudioDot.classList.toggle("music-on", !!playing);
    if (this.elAudioLabel) {
      this.elAudioLabel.textContent = playing ? `Lyria: ${trackName || "Sunny Rally"}` : "Lyria: Muted";
    }
  }

  updateCameraLabel(label) {
    if (this.elCameraLabel) this.elCameraLabel.textContent = label;
  }

  updateMotionStatus({ webcamActive = false, phoneConnected = false, p1Phone = false, p2Phone = false }) {
    if (this.elWebcamPip) this.elWebcamPip.classList.toggle("hidden", !webcamActive);
    if (this.elWebcamDot) this.elWebcamDot.classList.toggle("active", !!webcamActive);
    const anyPhone = !!(phoneConnected || p1Phone || p2Phone);
    if (this.elPhoneDot) this.elPhoneDot.classList.toggle("active", anyPhone);
    if (this.elPhoneLabel) {
      if (p1Phone && p2Phone) {
        this.elPhoneLabel.textContent = "P1 & P2 Rackets ✓";
      } else if (anyPhone) {
        this.elPhoneLabel.textContent = "3D Racket Connected ✓";
      } else {
        this.elPhoneLabel.textContent = "Phone 3D Racket";
      }
    }
    if (this.elTitlePhoneBadge) {
      if (p1Phone && p2Phone) {
        this.elTitlePhoneBadge.textContent = "P1 & P2 Ready ✓";
        this.elTitlePhoneBadge.classList.add("connected");
      } else if (anyPhone) {
        this.elTitlePhoneBadge.textContent = "1 Phone Paired ✓";
        this.elTitlePhoneBadge.classList.add("connected");
      } else {
        this.elTitlePhoneBadge.textContent = "Scan QR";
        this.elTitlePhoneBadge.classList.remove("connected");
      }
    }
  }

  updateCalibrationPreview(p1State = {}, p2State = {}) {
    const activeState = this.playerRole === "p2" ? p2State : p1State;
    const anyConnected = !!(p1State?.connected || p2State?.connected);

    if (this.elHud3dRow) {
      this.elHud3dRow.classList.toggle("hidden", !anyConnected);
      if (anyConnected) {
        const isCalib = !!activeState?.calibrated;
        if (this.elHud3dDot) {
          this.elHud3dDot.classList.toggle("calibrated", isCalib);
        }
        const o = activeState?.orientation || { pitch: 0, roll: 0, yaw: 0 };
        const shotLock = String(activeState?.selectedShotType || "auto").toUpperCase();
        const rushTag = activeState?.dpad?.netRush ? " • ⚡NET RUSH" : "";
        if (this.elHud3dText) {
          this.elHud3dText.textContent = `${isCalib ? "3D Calibrated" : "3D Live"} (${shotLock}${rushTag})`;
        }
        if (this.elHud3dAngles) {
          this.elHud3dAngles.textContent = `P:${Math.round(o.pitch || 0)}° R:${Math.round(o.roll || 0)}° Y:${Math.round(o.yaw || 0)}°`;
        }
      }
    }

    if (this.elCalibReadoutP1) {
      const o1 = p1State?.orientation || { pitch: 0, roll: 0, yaw: 0 };
      const c1 = p1State?.connected
        ? p1State.calibrated
          ? "3D Calibrated ✓"
          : "Connected (Tap Zero)"
        : "Waiting for P1 Phone";
      this.elCalibReadoutP1.textContent = `P: ${Math.round(o1.pitch || 0)}°  R: ${Math.round(o1.roll || 0)}°  Y: ${Math.round(o1.yaw || 0)}° • ${c1}`;
    }

    if (this.elCalibReadoutP2) {
      const o2 = p2State?.orientation || { pitch: 0, roll: 0, yaw: 0 };
      const c2 = p2State?.connected
        ? p2State.calibrated
          ? "3D Calibrated ✓"
          : "Connected (Tap Zero)"
        : "Waiting for P2 Phone";
      this.elCalibReadoutP2.textContent = `P: ${Math.round(o2.pitch || 0)}°  R: ${Math.round(o2.roll || 0)}°  Y: ${Math.round(o2.yaw || 0)}° • ${c2}`;
    }

    // Only redraw modal canvases when companion modal is open
    if (this.elCompanionModal && !this.elCompanionModal.classList.contains("hidden")) {
      this._drawMiniRacketPreview(
        this.elCalibCanvasP1,
        p1State?.orientation || { pitch: 0, roll: 0, yaw: 0 },
        !!p1State?.connected,
        "#00c8ff"
      );
      this._drawMiniRacketPreview(
        this.elCalibCanvasP2,
        p2State?.orientation || { pitch: 0, roll: 0, yaw: 0 },
        !!p2State?.connected,
        "#ff6448"
      );
    }
  }

  _drawMiniRacketPreview(canvas, orientation, connected, accentColor = "#00c8ff") {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle court horizon grid
    ctx.strokeStyle = "rgba(140, 195, 255, 0.14)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(w * 0.5, h);
    ctx.stroke();

    const pitchRad = ((Number(orientation.pitch) || 0) * Math.PI) / 180;
    const rollRad = ((Number(orientation.roll) || 0) * Math.PI) / 180;
    const yawRad = ((Number(orientation.yaw) || 0) * Math.PI) / 180;

    ctx.save();
    ctx.translate(w * 0.5 + Math.sin(yawRad) * 22, h * 0.54 - Math.sin(pitchRad) * 14);
    ctx.rotate(rollRad * 0.85 + yawRad * 0.35);

    const headScaleY = Math.max(0.32, Math.cos(pitchRad * 0.75));
    const headScaleX = Math.max(0.38, Math.cos(rollRad * 0.55));

    // Handle
    ctx.strokeStyle = connected ? "#e2eef8" : "rgba(180, 205, 230, 0.4)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, 34);
    ctx.stroke();

    // Racket rim
    ctx.save();
    ctx.scale(headScaleX, headScaleY);
    ctx.strokeStyle = connected ? accentColor : "rgba(140, 180, 220, 0.45)";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(0, -10, 20, 24, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Strings
    ctx.strokeStyle = connected ? "rgba(255, 255, 255, 0.35)" : "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1;
    for (let x = -12; x <= 12; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, -30);
      ctx.lineTo(x, 10);
      ctx.stroke();
    }
    for (let y = -26; y <= 6; y += 6) {
      ctx.beginPath();
      ctx.moveTo(-16, y);
      ctx.lineTo(16, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  updateMultiplayerRoomInfo(info = {}) {
    const merged = { ...(this._lastRoomStatus || {}), ...info };
    this._lastRoomStatus = merged;

    if (merged.roomId) {
      this.currentRoomId = String(merged.roomId).toLowerCase();
    }
    if (merged.role) {
      this.playerRole = String(merged.role).toLowerCase() === "p2" ? "p2" : "p1";
    }
    if (merged.tunnelUrl && !String(merged.tunnelUrl).includes("argon-tennis-sandbox")) {
      this.currentTunnelUrl = String(merged.tunnelUrl).replace(/\/+$/, "");
    } else if (!this.currentTunnelUrl || this.currentTunnelUrl.includes("argon-tennis-sandbox")) {
      this.currentTunnelUrl = window.location.origin;
    }

    const roomBadge = document.getElementById("companion-room-badge");
    if (roomBadge) {
      roomBadge.textContent = `ROOM: ${this.currentRoomId.toUpperCase()}`;
    }

    const roomEnc = encodeURIComponent(this.currentRoomId);
    const base = (this.currentTunnelUrl || window.location.origin).replace(/\/+$/, "");
    const p1Url = `${base}/companion.html?room=${roomEnc}&role=p1`;
    const p2Url = `${base}/companion.html?room=${roomEnc}&role=p2`;

    const linkP1 = document.getElementById("companion-link");
    if (linkP1) linkP1.href = p1Url;
    const linkP2 = document.getElementById("companion-link-p2");
    if (linkP2) linkP2.href = p2Url;

    const qrP1 = document.getElementById("companion-qr");
    if (qrP1) {
      const qrSrc1 = `/api/qr?text=${encodeURIComponent(p1Url)}`;
      if (qrP1.dataset.lastSrc !== qrSrc1) {
        qrP1.src = qrSrc1;
        qrP1.dataset.lastSrc = qrSrc1;
      }
    }

    const qrP2 = document.getElementById("companion-qr-p2");
    if (qrP2) {
      const qrSrc2 = `/api/qr?text=${encodeURIComponent(p2Url)}`;
      if (qrP2.dataset.lastSrc !== qrSrc2) {
        qrP2.src = qrSrc2;
        qrP2.dataset.lastSrc = qrSrc2;
      }
    }

    const p1StatusEl = document.getElementById("mp-p1-status");
    if (p1StatusEl) {
      const p1Conn = !!merged.p1Phone;
      p1StatusEl.textContent = p1Conn ? "Connected ✓" : "Scan QR";
      p1StatusEl.classList.toggle("online", p1Conn);
    }

    const p2StatusEl = document.getElementById("mp-p2-status");
    if (p2StatusEl) {
      const p2Conn = !!merged.p2Phone;
      p2StatusEl.textContent = p2Conn ? "Connected ✓" : "Scan QR";
      p2StatusEl.classList.toggle("online", p2Conn);
    }

    const activeStatusEl = document.getElementById("mp-active-status");
    if (activeStatusEl) {
      const both = !!(merged.p1Phone && merged.p2Phone);
      const any = !!(merged.p1Phone || merged.p2Phone);
      activeStatusEl.textContent = both
        ? "P1 & P2 Connected ✓"
        : any
        ? "1 Phone Connected ✓"
        : `ROOM: ${this.currentRoomId.toUpperCase()}`;
      activeStatusEl.classList.toggle("online", any);
    }

    this.updateOpponentPresence(merged);
  }

  updateOpponentPresence(status = {}) {
    const isMp = !!(
      status.isMultiplayer ||
      this.selectedDifficulty === "1v1" ||
      this.selectedDifficulty === "couch_1v1" ||
      (this.currentRoomId && this.currentRoomId !== "default")
    );
    const oppAvatarBadge = document.querySelector(".mii-side-opponent .mii-avatar-badge:not(.secondary-mii)");
    if (!isMp) {
      if (this.elOpponentPresencePill) this.elOpponentPresencePill.classList.add("hidden");
      if (oppAvatarBadge) oppAvatarBadge.classList.remove("opponent-ready");
      this._lastOtherReady = false;
      return;
    }

    const hostName = status.hostName && status.hostName.trim() ? status.hostName.trim() : "Player 1";
    const guestName = status.guestName && status.guestName.trim() ? status.guestName.trim() : "Player 2";
    const isP2View = this.playerRole === "p2";
    let ready = false;
    let label = "";

    if (this.selectedDifficulty === "couch_1v1") {
      ready = !!(status.p1Phone && status.p2Phone);
      if (status.p1Phone && status.p2Phone) {
        label = "P1 & P2 Phones Paired • Couch 1v1 Ready!";
      } else if (status.p1Phone) {
        label = "P1 Phone Ready • Waiting for P2 Phone (or Arrow Keys)…";
      } else if (status.p2Phone) {
        label = "P2 Phone Ready • Waiting for P1 Phone…";
      } else {
        label = "Couch 1v1 • Pair P1 & P2 Phones (or use WASD vs Arrows)";
      }
    } else if (isP2View) {
      ready = !!(status.p2Phone || status.p1Phone || status.p1Online);
      if (status.p2Phone) label = `Racket Ready • ${hostName} Joined`;
      else if (status.p1Phone || status.p1Online) label = `${hostName} Ready • Scan QR for Phone Racket`;
      else label = `Waiting for ${hostName}…`;
    } else {
      ready = !!(status.p2Phone || status.p2Online);
      if (status.p2Phone && status.p2Online) label = `${guestName} Connected • Ready to Serve!`;
      else if (status.p2Phone) label = `${guestName}'s 3D Racket Ready • Ready to Serve!`;
      else if (status.p2Online) label = `${guestName} Joined • Ready to Serve!`;
      else label = `Waiting for ${guestName} (Scan P2 QR or Share Link)…`;
    }

    if (this.elOpponentPresencePill) {
      this.elOpponentPresencePill.classList.remove("hidden");
      this.elOpponentPresencePill.classList.toggle("ready", ready);
      this.elOpponentPresencePill.classList.toggle("in-rally", !!status.inRally);
      if (ready && !this._lastOtherReady) {
        this.elOpponentPresencePill.classList.remove("just-joined");
        void this.elOpponentPresencePill.offsetWidth;
        this.elOpponentPresencePill.classList.add("just-joined");
        if (this._justJoinedTimer) clearTimeout(this._justJoinedTimer);
        this._justJoinedTimer = setTimeout(() => {
          if (this.elOpponentPresencePill) this.elOpponentPresencePill.classList.remove("just-joined");
        }, 950);
      }
    }
    if (this.elOpponentPresenceText) {
      this.elOpponentPresenceText.textContent = label;
    }
    if (oppAvatarBadge) {
      oppAvatarBadge.classList.toggle("opponent-ready", ready);
    }

    const oppSetupLabel = document.getElementById("setup-opponent-label");
    if (oppSetupLabel && !isP2View) {
      if (this.selectedDifficulty === "couch_1v1") {
        oppSetupLabel.textContent = status.p2Phone ? "🟢 P2 Phone Ready" : "Player 2 (Couch)";
      } else if (this.selectedDifficulty === "1v1") {
        oppSetupLabel.textContent = ready ? `🟢 ${guestName} Ready` : guestName;
      }
    }
    this._lastOtherReady = ready;
  }
}

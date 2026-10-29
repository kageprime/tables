import * as THREE from "three";
import { GLTFLoader } from "../assets/vendor/GLTFLoader.js";
import { HudUI } from "./hud_ui.js";
import * as MotionControlsMod from "./motion_controls.js";
import * as AudioEngineMod from "./audio_engine.js";
import { RacketKinematicsController } from "./racket_kinematics.js";
import {
  upgradeMiiCharacterMaterials,
  upgradeRacketMaterials,
  updateCharacterContactShadow,
} from "./mii_model_overhaul.js";
import { MiiBodyAnimator } from "./mii_body_animation.js";
import { MiiFacialFXController } from "./mii_facial_fx.js";
import { SwingVFXManager } from "./swing_vfx.js";

const COURT = {
  BASELINE_Z: 11.89,
  SERVICE_LINE_Z: 6.4,
  SINGLES_X: 4.115,
  DOUBLES_X: 5.485,
  NET_HEIGHT_CENTER: 0.914,
  NET_HEIGHT_POST: 1.07,
  NET_POST_X: 6.4,
};

const TT = {
  TABLE_Y: 0.76,
  HALF_LENGTH_Z: 4.2,
  HALF_WIDTH_X: 2.3,
  NET_HEIGHT: 0.24,
  HOME_Z: 4.68,
};

const PHYSICS = {
  FIXED_DT: 1 / 120,
  GRAVITY: 9.15,
  AIR_DRAG: 0.012,
  BOUNCE_RESTITUTION: 0.77,
  SURFACE_FRICTION: 0.86,
};

const TENNIS_POINTS = ["00", "15", "30", "40"];

class BallRibbonTrail {
  constructor(scene, maxPoints = 45) {
    this.scene = scene;
    this.maxPoints = maxPoints;
    this.points = [];
    this.color = new THREE.Color(0xffffff);
    this.accentColor = new THREE.Color(0xfff176);
    this.baseWidth = 0.28;

    const vertexCount = maxPoints * 2;
    this.positions = new Float32Array(vertexCount * 3);
    this.colors = new Float32Array(vertexCount * 4);
    const indices = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));
    this.geometry.setIndex(indices);

    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.scene.add(this.mesh);
  }

  setStyle(shotType = "TOPSPIN", isPower = false) {
    const s = String(shotType || "TOPSPIN").toUpperCase();
    if (isPower || s === "SMASH" || s === "POWER") {
      this.color.setHex(0xffffff);
      this.accentColor.setHex(0x52e5ff);
      this.baseWidth = 0.3;
    } else if (s === "SLICE") {
      this.color.setHex(0xffffff);
      this.accentColor.setHex(0x88f0ff);
      this.baseWidth = 0.28;
    } else if (s === "LOB") {
      this.color.setHex(0xffffff);
      this.accentColor.setHex(0xeeffbf);
      this.baseWidth = 0.25;
    } else {
      this.color.setHex(0xffffff);
      this.accentColor.setHex(0xffeb35);
      this.baseWidth = 0.28;
    }
  }

  clear() {
    this.points.length = 0;
    this.mesh.visible = false;
  }

  pushPoint(p) {
    this.points.unshift(p.clone());
    if (this.points.length > this.maxPoints) {
      this.points.pop();
    }
  }

  seedArc(start, end, archHeight = 0.85) {
    this.points.length = 0;
    for (let i = 0; i < this.maxPoints; i++) {
      const t = 1 - i / (this.maxPoints - 1);
      const pt = new THREE.Vector3().lerpVectors(start, end, t);
      pt.y += Math.sin(t * Math.PI) * archHeight;
      this.points.push(pt);
    }
    this.mesh.visible = true;
  }

  updateGeometry(camera) {
    const count = this.points.length;
    if (count < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const camPos = camera.position;
    const tangent = new THREE.Vector3();
    const toCam = new THREE.Vector3();
    const side = new THREE.Vector3();
    const c = new THREE.Color();

    for (let i = 0; i < this.maxPoints; i++) {
      const idx = Math.min(i, count - 1);
      const pt = this.points[idx];
      const nextIdx = Math.min(idx + 1, count - 1);
      const prevIdx = Math.max(idx - 1, 0);

      tangent.subVectors(this.points[prevIdx], this.points[nextIdx]);
      if (tangent.lengthSq() < 1e-6) tangent.set(0, 0, 1);
      else tangent.normalize();

      toCam.subVectors(camPos, pt).normalize();
      side.crossVectors(tangent, toCam).normalize();
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);

      const life = 1 - idx / Math.max(1, count - 1);
      const halfW = this.baseWidth * (0.24 + 0.76 * Math.pow(life, 0.65)) * 0.5;
      const alpha = Math.pow(life, 0.9) * 0.92;
      c.copy(this.color).lerp(this.accentColor, (1 - life) * 0.65);

      const v0 = i * 2;
      const v1 = v0 + 1;
      this.positions[v0 * 3 + 0] = pt.x + side.x * halfW;
      this.positions[v0 * 3 + 1] = pt.y + side.y * halfW;
      this.positions[v0 * 3 + 2] = pt.z + side.z * halfW;

      this.positions[v1 * 3 + 0] = pt.x - side.x * halfW;
      this.positions[v1 * 3 + 1] = pt.y - side.y * halfW;
      this.positions[v1 * 3 + 2] = pt.z - side.z * halfW;

      this.colors[v0 * 4 + 0] = c.r;
      this.colors[v0 * 4 + 1] = c.g;
      this.colors[v0 * 4 + 2] = c.b;
      this.colors[v0 * 4 + 3] = alpha;

      this.colors[v1 * 4 + 0] = c.r;
      this.colors[v1 * 4 + 1] = c.g;
      this.colors[v1 * 4 + 2] = c.b;
      this.colors[v1 * 4 + 3] = alpha;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

function createSwingArcMesh() {
  const geom = new THREE.RingGeometry(0.22, 0.72, 28, 1, -Math.PI * 0.28, Math.PI * 0.56);
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const angleNorm = (Math.atan2(y, x) + Math.PI * 0.28) / (Math.PI * 0.56);
    const radNorm = (Math.hypot(x, y) - 0.22) / (0.72 - 0.22);
    const a = Math.max(0, Math.min(1, angleNorm * (0.35 + 0.65 * radNorm)));
    colors[i * 4 + 0] = 0.97;
    colors[i * 4 + 1] = 0.99;
    colors[i * 4 + 2] = 1.0;
    colors[i * 4 + 3] = a * 0.85;
  }
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.visible = false;
  mesh.renderOrder = 7;
  return mesh;
}

function createShadowBlobTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, "rgba(10, 24, 8, 0.78)");
  grad.addColorStop(0.55, "rgba(10, 24, 8, 0.46)");
  grad.addColorStop(1, "rgba(10, 24, 8, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function createSkyFallbackTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, "#2e86e6");
  grad.addColorStop(0.42, "#5cb2ff");
  grad.addColorStop(0.78, "#a6dcff");
  grad.addColorStop(1, "#def4ff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);
  [
    [120, 185, 95, 38],
    [180, 175, 110, 44],
    [250, 188, 85, 34],
    [460, 168, 120, 45],
    [535, 160, 130, 50],
    [610, 174, 95, 36],
    [820, 180, 115, 42],
    [895, 170, 125, 48],
    [960, 184, 90, 35],
  ].forEach(([cx, cy, rx, ry]) => {
    const g = ctx.createRadialGradient(cx, cy - ry * 0.2, rx * 0.1, cx, cy, rx);
    g.addColorStop(0, "rgba(255, 255, 255, 0.92)");
    g.addColorStop(0.6, "rgba(245, 252, 255, 0.55)");
    g.addColorStop(1, "rgba(255, 255, 255, 0.0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ArgonTennisEngine {
  constructor() {
    this.params = new URLSearchParams(window.location.search);
    this.urlState = (this.params.get("state") || "").toLowerCase();
    this.urlRoom = (this.params.get("room") || "").trim().toUpperCase();
    this.urlRole = (this.params.get("role") || "p1").trim().toLowerCase() === "p2" ? "p2" : "p1";
    this.urlMode = (this.params.get("mode") || this.params.get("difficulty") || "").toLowerCase();
    this.urlSport = (this.params.get("sport") || "tennis").toLowerCase();
    this.urlAutoPlay = this.params.has("play") || !!this.urlState;

    this.sport = this.urlSport === "table_tennis" || this.urlSport === "pingpong" ? "table_tennis" : "tennis";
    this.roomId = this.urlRoom || "default";
    this.playerRole = this.urlRole;
    this.isCouch1v1 = this.urlMode === "couch_1v1";
    this.isMultiplayer =
      !!(this.urlRoom && this.urlRoom !== "DEFAULT") || this.urlMode === "1v1" || this.isCouch1v1;

    this.roomStatus = {
      roomId: this.roomId,
      p1Online: true,
      p2Online: false,
      p1Phone: false,
      p2Phone: false,
      tunnelUrl: "",
      urls: null,
    };
    this.lastAppliedSnapshotSeq = 0;
    this.lastSyncSentAt = 0;
    this.bannerSeq = 0;
    this.lastBannerBroadcast = null;

    this.canvas = document.getElementById("game-canvas");
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x78c2ff);
    this.scene.fog = new THREE.FogExp2(0xbbe7ff, 0.0038);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 260);
    this.cameraMode = "RALLY_CAM";
    this.manualCameraOverride = null;
    this.cameraPosSmooth = new THREE.Vector3(0, 7.8, 22.8);
    this.cameraLookSmooth = new THREE.Vector3(0, 0.35, 1.8);
    this.cameraTrauma = 0;

    const initialDiff = ["casual", "pro", "couch_1v1", "1v1"].includes(this.urlMode)
      ? this.urlMode
      : this.isMultiplayer
      ? "1v1"
      : "casual";

    this.matchConfig = {
      sport: this.sport,
      gamesToWin: initialDiff === "1v1" ? 1 : 2,
      pointsToWin: 11,
      inputMode: "mouse",
      difficulty: initialDiff,
    };

    this.score = {
      playerPoints: 0,
      opponentPoints: 0,
      playerGames: 0,
      opponentGames: 0,
      server: "player",
      deuceSide: true,
    };

    this.phase = "TITLE";
    this.phaseTimer = 0;
    this.selectedShotType = "TOPSPIN";
    this.p2SelectedShotType = "TOPSPIN";
    this.autoPlayMode = this.urlAutoPlay;
    this.userHasInteracted = false;
    this.persistentStateLock = false;
    this.pendingUserSwing = null;
    this.pendingP2Swing = null;
    this.pendingServeSwing = null;

    this.ball = {
      mesh: null,
      pingPongMesh: null,
      tennisBallVisual: null,
      pos: new THREE.Vector3(0.85, 1.15, 11.6),
      vel: new THREE.Vector3(0, 0, 0),
      spin: new THREE.Vector3(0, 0, 0),
      inPlay: false,
      lastHitter: "player",
      bounceCountOnCurrentSide: 0,
      shotType: "TOPSPIN",
      isPowerShot: false,
      rallyStrokeCount: 0,
      targetLanding: new THREE.Vector3(0, 0, -8.5),
    };

    this.tennisStadiumGroup = new THREE.Group();
    this.scene.add(this.tennisStadiumGroup);
    this.tableTennisGroup = this._createTableTennisArena();
    this.tableTennisGroup.visible = false;
    this.scene.add(this.tableTennisGroup);

    this.player = this._createActorState("player", 1, new THREE.Vector3(1.15, 0, COURT.BASELINE_Z));
    this.playerPartner = this._createActorState(
      "player_partner",
      1,
      new THREE.Vector3(-2.1, 0, 5.4)
    );
    this.opponent = this._createActorState(
      "opponent",
      -1,
      new THREE.Vector3(-1.35, 0, -COURT.BASELINE_Z)
    );
    this.opponentPartner = this._createActorState(
      "opponent_partner",
      -1,
      new THREE.Vector3(2.1, 0, -5.4)
    );

    this._applyDifficultyTuning(this.matchConfig.difficulty);

    this.crowdScene = null;
    this.cheerEnergy = 0.25;
    this.ballTrail = new BallRibbonTrail(this.scene, 45);
    this.bounceRings = [];
    this.starParticles = [];

    this.racketKinematics = new RacketKinematicsController();
    this.bodyAnimator = new MiiBodyAnimator();
    this.facialFX = new MiiFacialFXController(this.scene);
    this.swingVfx = new SwingVFXManager(this.scene);

    this._setupLightingAndSky();
    this._setupEffectsPools();
    this._initHudAndControllers();

    this.clock = new THREE.Clock();
    this.physicsAccumulator = 0;
    this.elapsedTime = 0;
    window.addEventListener("resize", () => this._onResize());
  }

  _isTableTennis() {
    return this.sport === "table_tennis";
  }

  _getSurfaceY() {
    return this._isTableTennis() ? TT.TABLE_Y : 0;
  }

  _getNetHeight() {
    return this._isTableTennis() ? TT.TABLE_Y + TT.NET_HEIGHT : COURT.NET_HEIGHT_CENTER;
  }

  _getHomeZ() {
    return this._isTableTennis() ? TT.HOME_Z : COURT.BASELINE_Z;
  }

  _getMaxHalfWidthX() {
    return this._isTableTennis() ? TT.HALF_WIDTH_X : COURT.SINGLES_X;
  }

  _getMaxHalfLengthZ() {
    return this._isTableTennis() ? TT.HALF_LENGTH_Z : COURT.BASELINE_Z;
  }

  _createTableTennisArena() {
    const group = new THREE.Group();
    group.name = "TableTennisArena";

    // Crimson/Terracotta Olympic Table Tennis Flooring
    const floorGeo = new THREE.PlaneGeometry(36, 38);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x992b36,
      roughness: 0.58,
      metalness: 0.06,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = 0.008;
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Subtle Inner Wood/Polyurethane Court Mat
    const innerMatGeo = new THREE.PlaneGeometry(14.5, 20.5);
    innerMatGeo.rotateX(-Math.PI / 2);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x82202b,
      roughness: 0.5,
      metalness: 0.08,
    });
    const innerFloor = new THREE.Mesh(innerMatGeo, innerMat);
    innerFloor.position.y = 0.012;
    innerFloor.receiveShadow = true;
    group.add(innerFloor);

    // 3D Table Tennis Table Top (4.6m wide x 8.4m long, top at y = TT.TABLE_Y = 0.76m)
    const tableW = TT.HALF_WIDTH_X * 2;
    const tableL = TT.HALF_LENGTH_Z * 2;
    const tableThick = 0.09;
    const topGeo = new THREE.BoxGeometry(tableW, tableThick, tableL);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x15478c,
      roughness: 0.34,
      metalness: 0.08,
    });
    const tableTop = new THREE.Mesh(topGeo, topMat);
    tableTop.position.set(0, TT.TABLE_Y - tableThick * 0.5, 0);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    group.add(tableTop);

    // Dark Blue Metallic Apron Skirt Under Tabletop
    const apronGeo = new THREE.BoxGeometry(tableW - 0.08, 0.07, tableL - 0.08);
    const apronMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.45,
      metalness: 0.35,
    });
    const apronMesh = new THREE.Mesh(apronGeo, apronMat);
    apronMesh.position.set(0, TT.TABLE_Y - tableThick - 0.035, 0);
    apronMesh.castShadow = true;
    group.add(apronMesh);

    // Painted White Table Lines (End lines, Side lines, and Center Service Line)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const lineY = TT.TABLE_Y + 0.002;
    const borderW = 0.055;

    const addTableLine = (w, l, x, z) => {
      const g = new THREE.PlaneGeometry(w, l);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, lineMat);
      m.position.set(x, lineY, z);
      group.add(m);
    };

    // Left & Right sidelines
    addTableLine(borderW, tableL, -TT.HALF_WIDTH_X + borderW * 0.5, 0);
    addTableLine(borderW, tableL, TT.HALF_WIDTH_X - borderW * 0.5, 0);
    // Near & Far baselines
    addTableLine(tableW, borderW, 0, TT.HALF_LENGTH_Z - borderW * 0.5);
    addTableLine(tableW, borderW, 0, -TT.HALF_LENGTH_Z + borderW * 0.5);
    // Center longitudinal service line
    addTableLine(0.032, tableL - borderW * 2, 0, 0);

    // Table Undercarriage Legs & Crossbars
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.4,
      metalness: 0.65,
    });
    const legH = TT.TABLE_Y - tableThick;
    const legGeo = new THREE.CylinderGeometry(0.055, 0.055, legH, 12);
    [
      [-1.75, -2.85],
      [1.75, -2.85],
      [-1.75, 2.85],
      [1.75, 2.85],
      [-1.2, -0.55],
      [1.2, -0.55],
      [-1.2, 0.55],
      [1.2, 0.55],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, legH * 0.5, lz);
      leg.castShadow = true;
      group.add(leg);
    });

    // Under-Table Floor Contact Shadow Plane
    const underShadowGeo = new THREE.PlaneGeometry(tableW + 0.6, tableL + 0.6);
    underShadowGeo.rotateX(-Math.PI / 2);
    const underShadowMat = new THREE.MeshBasicMaterial({
      color: 0x090d16,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const underShadow = new THREE.Mesh(underShadowGeo, underShadowMat);
    underShadow.position.set(0, 0.015, 0);
    group.add(underShadow);

    // Table Tennis Net Assembly (width = tableW + 0.36m overhang, height = TT.NET_HEIGHT = 0.24m)
    const netW = tableW + 0.36;
    const netGeo = new THREE.BoxGeometry(netW, TT.NET_HEIGHT, 0.018);
    const netMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a,
      roughness: 0.7,
      transparent: true,
      opacity: 0.84,
    });
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, TT.TABLE_Y + TT.NET_HEIGHT * 0.5, 0);
    netMesh.castShadow = true;
    group.add(netMesh);

    // Crisp White Net Top Tape
    const tapeGeo = new THREE.BoxGeometry(netW + 0.02, 0.028, 0.024);
    const tapeMesh = new THREE.Mesh(tapeGeo, lineMat);
    tapeMesh.position.set(0, TT.TABLE_Y + TT.NET_HEIGHT - 0.01, 0);
    group.add(tapeMesh);

    // Net Clamp Posts on Left & Right Edges
    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, TT.NET_HEIGHT + 0.06, 12);
    [-netW * 0.5, netW * 0.5].forEach((px) => {
      const post = new THREE.Mesh(postGeo, apronMat);
      post.position.set(px, TT.TABLE_Y + TT.NET_HEIGHT * 0.5, 0);
      group.add(post);
    });

    // Low Arena Surround Barriers
    const barrierMat = new THREE.MeshStandardMaterial({
      color: 0x0f2d5e,
      roughness: 0.5,
      metalness: 0.15,
    });
    const sideBarrierGeo = new THREE.BoxGeometry(0.14, 0.72, 16);
    [-6.6, 6.6].forEach((bx) => {
      const b = new THREE.Mesh(sideBarrierGeo, barrierMat);
      b.position.set(bx, 0.36, 0);
      b.castShadow = true;
      b.receiveShadow = true;
      group.add(b);
    });

    return group;
  }

  _createTableTennisPaddleMesh(sideSign = 1) {
    const paddleGroup = new THREE.Group();
    paddleGroup.name = "TableTennisPaddle";

    // Flared Wooden Handle extending from grip (y = 0.04..0.34)
    const handleGeo = new THREE.CylinderGeometry(0.028, 0.038, 0.3, 14);
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xc88a4b,
      roughness: 0.55,
      metalness: 0.05,
    });
    const handleMesh = new THREE.Mesh(handleGeo, woodMat);
    handleMesh.position.set(0, 0.19, 0);
    handleMesh.castShadow = true;
    paddleGroup.add(handleMesh);

    // Center Wood Core Blade (centered at y = 0.545 so getRacketRimWorldPoints sweet spot matches!)
    const bladeRadius = 0.21;
    const coreGeo = new THREE.CylinderGeometry(bladeRadius, bladeRadius, 0.018, 28);
    coreGeo.rotateX(Math.PI / 2);
    const coreMesh = new THREE.Mesh(coreGeo, woodMat);
    coreMesh.position.set(0, 0.525, 0);
    coreMesh.scale.set(0.95, 1.06, 1);
    coreMesh.castShadow = true;
    paddleGroup.add(coreMesh);

    // Forehand Rubber Sheet (+Z face: Crimson Red for P1, Royal Red/Orange for P2)
    const redMat = new THREE.MeshStandardMaterial({
      color: sideSign > 0 ? 0xdc2626 : 0xe11d48,
      roughness: 0.32,
      metalness: 0.08,
    });
    const rubberGeo = new THREE.CylinderGeometry(bladeRadius * 0.97, bladeRadius * 0.97, 0.008, 28);
    rubberGeo.rotateX(Math.PI / 2);
    const forehandRubber = new THREE.Mesh(rubberGeo, redMat);
    forehandRubber.position.set(0, 0.525, 0.011);
    forehandRubber.scale.set(0.95, 1.06, 1);
    paddleGroup.add(forehandRubber);

    // Backhand Rubber Sheet (-Z face: Matte Charcoal Black)
    const blackMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.36,
      metalness: 0.1,
    });
    const backhandRubber = new THREE.Mesh(rubberGeo, blackMat);
    backhandRubber.position.set(0, 0.525, -0.011);
    backhandRubber.scale.set(0.95, 1.06, 1);
    paddleGroup.add(backhandRubber);

    // White Protective Edge Tape Ring
    const edgeTapeGeo = new THREE.TorusGeometry(bladeRadius * 0.98, 0.012, 10, 32);
    const edgeTapeMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const edgeTape = new THREE.Mesh(edgeTapeGeo, edgeTapeMat);
    edgeTape.position.set(0, 0.525, 0);
    edgeTape.scale.set(0.95, 1.06, 1);
    paddleGroup.add(edgeTape);

    paddleGroup.visible = false;
    return paddleGroup;
  }

  setSport(sport = "tennis") {
    const nextSport = sport === "table_tennis" ? "table_tennis" : "tennis";
    this.sport = nextSport;
    this.matchConfig.sport = nextSport;
    const isTT = nextSport === "table_tennis";

    if (this.tennisStadiumGroup) this.tennisStadiumGroup.visible = !isTT;
    if (this.tableTennisGroup) this.tableTennisGroup.visible = isTT;

    // Swap actor rackets vs paddles & hide doubles partners in Table Tennis
    [this.player, this.playerPartner, this.opponent, this.opponentPartner].forEach((actor) => {
      if (!actor) return;
      if (actor.tennisRacketVisual) actor.tennisRacketVisual.visible = !isTT;
      if (actor.paddleMesh) actor.paddleMesh.visible = isTT;
    });

    if (this.playerPartner) {
      this.playerPartner.root.visible = !isTT;
      if (this.playerPartner.shadowBlob) this.playerPartner.shadowBlob.visible = !isTT;
    }
    if (this.opponentPartner) {
      this.opponentPartner.root.visible = !isTT;
      if (this.opponentPartner.shadowBlob) this.opponentPartner.shadowBlob.visible = !isTT;
    }

    // Swap ball appearance (white 40mm ping-pong ball vs optic yellow tennis ball)
    if (this.ball.tennisBallVisual) this.ball.tennisBallVisual.visible = !isTT;
    if (this.ball.pingPongMesh) this.ball.pingPongMesh.visible = isTT;

    // Update bounce rings height so they sit on the tabletop in Table Tennis
    const ringY = isTT ? TT.TABLE_Y + 0.012 : 0.024;
    for (const r of this.bounceRings) {
      r.mesh.position.y = ringY;
    }

    this._applyDifficultyTuning(this.matchConfig.difficulty);

    if (this.hud && this.hud._setSportSelection && this.hud.selectedSport !== nextSport) {
      this.hud._setSportSelection(nextSport, false);
    }

    // Reposition players & camera for the selected sport
    if (this.phase === "TITLE" || this.autoPlayMode) {
      this.score.playerPoints = isTT ? 4 : 1;
      this.score.opponentPoints = isTT ? 3 : 0;
      this._syncScoreboardHUD();
      this._setupMidRallyShowcase({
        scorePlayer: this.score.playerPoints,
        scoreOpponent: this.score.opponentPoints,
      });
      this._snapCameraImmediate();
    } else {
      this.startNewMatch({ showStartBanner: true });
      this._snapCameraImmediate();
    }
  }

  _createActorState(role, sideSign, startPos) {
    const baseSpeeds = {
      player: 9.8,
      player_partner: 8.4,
      opponent: 5.85,
      opponent_partner: 5.2,
    };
    return {
      role,
      sideSign,
      root: new THREE.Group(),
      model: null,
      parts: {},
      racketPivot: new THREE.Group(),
      racketMesh: null,
      tennisRacketVisual: null,
      paddleMesh: null,
      swingArcMesh: null,
      shadowBlob: null,
      pos: startPos.clone(),
      vel: new THREE.Vector3(),
      targetPos: startPos.clone(),
      maxSpeed: baseSpeeds[role] || 8.2,
      stridePhase: 0,
      swingTimer: 0,
      swingDuration: 0.34,
      swingCooldown: 0,
      swingType: "forehand",
      arcVisibleTimer: 0,
    };
  }

  _applyDifficultyTuning(difficulty = "casual") {
    const d = String(difficulty || "casual").toLowerCase();
    this.matchConfig.difficulty = d;
    this.isCouch1v1 = d === "couch_1v1";
    const isTT = this._isTableTennis();
    const speedScale = isTT ? 0.78 : 1.0;

    if (d === "1v1" || d === "couch_1v1") {
      this.isMultiplayer = true;
      this.player.maxSpeed = 9.8 * speedScale;
      this.playerPartner.maxSpeed = 8.4 * speedScale;
      this.opponent.maxSpeed = 9.6 * speedScale;
      this.opponentPartner.maxSpeed = 8.2 * speedScale;
    } else if (d === "pro") {
      this.isMultiplayer = !!(this.urlRoom && this.urlRoom !== "DEFAULT");
      this.player.maxSpeed = 9.8 * speedScale;
      this.playerPartner.maxSpeed = 8.4 * speedScale;
      this.opponent.maxSpeed = (isTT ? 8.2 : 7.65) * speedScale;
      this.opponentPartner.maxSpeed = 6.6 * speedScale;
    } else {
      this.isMultiplayer = !!(this.urlRoom && this.urlRoom !== "DEFAULT");
      this.player.maxSpeed = 10.2 * speedScale;
      this.playerPartner.maxSpeed = 8.6 * speedScale;
      this.opponent.maxSpeed = (isTT ? 6.4 : 5.85) * speedScale;
      this.opponentPartner.maxSpeed = 5.15 * speedScale;
    }
  }

  _setupLightingAndSky() {
    const loader = new THREE.TextureLoader();
    const skyGeo = new THREE.SphereGeometry(185, 36, 20);
    const skyMat = new THREE.MeshBasicMaterial({
      map: createSkyFallbackTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    loader.load(
      "https://www.gstatic.com/aistudio/starter-apps/tennis/textures/court/tns_sky_a.png",
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.repeat.set(8, 1);
        skyMat.map = tex;
        skyMat.needsUpdate = true;
      }
    );

    const makeCloudRing = (radius, height, y, url, order) => {
      const g = new THREE.CylinderGeometry(radius, radius, height, 48, 1, true);
      const m = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.92,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.y = y;
      mesh.renderOrder = order;
      mesh.visible = false;
      this.scene.add(mesh);
      loader.load(url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.repeat.set(8, 1);
        m.map = tex;
        m.needsUpdate = true;
        mesh.visible = true;
      });
      return mesh;
    };

    this.cloudRing2 = makeCloudRing(
      152,
      54,
      24,
      "https://www.gstatic.com/aistudio/starter-apps/tennis/textures/court/cloud02.png",
      -2
    );
    this.cloudRing1 = makeCloudRing(
      138,
      46,
      19,
      "https://www.gstatic.com/aistudio/starter-apps/tennis/textures/court/cloud01.png",
      -1
    );

    const horizonGeo = new THREE.CylinderGeometry(96, 96, 15.5, 64, 1, true);
    const horizonMat = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.15,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.horizonRing = new THREE.Mesh(horizonGeo, horizonMat);
    this.horizonRing.position.y = 7.2;
    this.horizonRing.visible = false;
    this.scene.add(this.horizonRing);
    loader.load(
      "https://www.gstatic.com/aistudio/starter-apps/tennis/textures/court/tns_BG_c1.png",
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.repeat.set(8, 1);
        horizonMat.map = tex;
        horizonMat.needsUpdate = true;
        this.horizonRing.visible = true;
      }
    );

    const hemi = new THREE.HemisphereLight(0xa6ddff, 0x55a344, 1.22);
    hemi.position.set(0, 40, 0);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xfff9dc, 2.55);
    this.sunLight.position.set(14.5, 25, 15);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 75;
    const d = 22;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.scene.add(this.sunLight);

    const fillLight = new THREE.DirectionalLight(0xcbe8ff, 0.72);
    fillLight.position.set(-15, 16, -12);
    this.scene.add(fillLight);

    const shadowTex = createShadowBlobTexture();
    const makeShadowBlob = (radius, opacity) => {
      const g = new THREE.PlaneGeometry(radius * 2, radius * 2);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.y = 0.018;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      return mesh;
    };

    this.player.shadowBlob = makeShadowBlob(0.56, 0.82);
    this.playerPartner.shadowBlob = makeShadowBlob(0.54, 0.78);
    this.opponent.shadowBlob = makeShadowBlob(0.56, 0.82);
    this.opponentPartner.shadowBlob = makeShadowBlob(0.54, 0.78);
    this.ballShadowBlob = makeShadowBlob(0.34, 0.88);
  }

  _setupEffectsPools() {
    for (let i = 0; i < 6; i++) {
      const g = new THREE.RingGeometry(0.12, 0.24, 28);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.visible = false;
      mesh.position.y = 0.024;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.bounceRings.push({ mesh, age: 0, active: false });
    }

    const starGeo = new THREE.OctahedronGeometry(0.085, 0);
    for (let i = 0; i < 36; i++) {
      const m = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xffea28 : 0x48e5ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(starGeo, m);
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.scene.add(mesh);
      this.starParticles.push({
        mesh,
        vel: new THREE.Vector3(),
        age: 0,
        maxAge: 0.42,
        active: false,
      });
    }
  }

  _initHudAndControllers() {
    this.hud = new HudUI({
      onSelectSport: (sport) => {
        this.setSport(sport);
      },
      onReturnToSportsMenu: () => {
        this.phase = "TITLE";
        this.autoPlayMode = true;
        this.userHasInteracted = false;
        this.persistentStateLock = false;
        this.hud.hideCenterBanner();
        this.hud.setReplayMode(false);
        this._setupMidRallyShowcase({
          scorePlayer: this._isTableTennis() ? 4 : 1,
          scoreOpponent: this._isTableTennis() ? 3 : 0,
        });
        this._snapCameraImmediate();
      },
      onSelectMatchLength: (gamesToWin, pointsToWin) => {
        this.matchConfig.gamesToWin = gamesToWin;
        if (pointsToWin) this.matchConfig.pointsToWin = pointsToWin;
      },
      onSelectDifficulty: (diff) => {
        this._applyDifficultyTuning(diff);
        if (diff === "1v1" && (!this.roomId || this.roomId === "default")) {
          this.createMultiplayerRoom();
        }
      },
      onCreateMultiplayerRoom: async (opts = {}) => await this.createMultiplayerRoom(opts),
      onSelectInputMode: (mode) => {
        this.matchConfig.inputMode = mode;
        if (mode === "webcam" && this.motionController) {
          this.motionController.enableWebcam();
        }
      },
      onStartMatch: ({ sport, gamesToWin, pointsToWin, inputMode, difficulty }) => {
        if (sport && sport !== this.sport) {
          this.setSport(sport);
        }
        this.matchConfig.gamesToWin = gamesToWin;
        if (pointsToWin) this.matchConfig.pointsToWin = pointsToWin;
        this.matchConfig.inputMode = inputMode;
        if (difficulty) this._applyDifficultyTuning(difficulty);
        this.autoPlayMode = false;
        this.userHasInteracted = true;
        this.persistentStateLock = false;
        if (inputMode === "webcam" && this.motionController) {
          this.motionController.enableWebcam();
        }
        this.startNewMatch({ showStartBanner: true });
        this._snapCameraImmediate();
      },
      onSelectShotType: (shot) => {
        if (this.playerRole === "p2") this.p2SelectedShotType = shot;
        else this.selectedShotType = shot;
        if (this.motionController && this.motionController.setShotType) {
          this.motionController.setShotType(shot.toLowerCase());
        }
      },
      onToggleAudio: () => {
        if (this.audioEngine) {
          const muted = this.audioEngine.toggleMute();
          const info = this.audioEngine.getCurrentTrackInfo();
          this.hud.updateAudioStatus({ playing: !muted, trackName: info.title });
        }
      },
      onCycleCamera: () => {
        const modes = [null, "RALLY_CAM", "SERVE_CAM", "REPLAY_CAM", "INTRO_PAN"];
        const idx = modes.indexOf(this.manualCameraOverride);
        this.manualCameraOverride = modes[(idx + 1) % modes.length];
        const labels = {
          null: "Auto",
          RALLY_CAM: "Rally",
          SERVE_CAM: "Serve",
          REPLAY_CAM: "Net Close",
          INTRO_PAN: "Aerial",
        };
        this.hud.updateCameraLabel(labels[this.manualCameraOverride] || "Auto");
        this.hud.setReplayMode(this.manualCameraOverride === "REPLAY_CAM");
      },
      onToggleReplay: () => {
        if (this.phase === "REPLAY") {
          this.persistentStateLock = false;
          this.hud.setReplayMode(false);
          this._setupPointServe({ showBanner: false });
        } else {
          this._enterInstantReplayState({ persistent: false });
        }
      },
      onToggleWebcam: async () => {
        if (!this.motionController) return;
        this.autoPlayMode = false;
        this.userHasInteracted = true;
        this.persistentStateLock = false;
        if (this.motionController.webcamActive) {
          if (this.motionController.disableWebcam) this.motionController.disableWebcam();
          this.hud.updateMotionStatus({
            webcamActive: false,
            phoneConnected: this.motionController.phoneState?.connected,
          });
        } else {
          const ok = await this.motionController.enableWebcam();
          this.hud.updateMotionStatus({
            webcamActive: ok,
            phoneConnected: this.motionController.phoneState?.connected,
          });
          if (this.phase === "TITLE") {
            this.hud.hideTitleModal();
            this.startNewMatch({ showStartBanner: true });
          }
        }
      },
      onPlayAgain: () => {
        this.autoPlayMode = false;
        this.userHasInteracted = true;
        this.persistentStateLock = false;
        this.startNewMatch({ showStartBanner: true });
      },
      onRecenter3D: (role = "p1") => {
        if (this.motionController && this.motionController.requestRemoteRecenter) {
          this.motionController.requestRemoteRecenter(role);
        }
      },
      onTestHaptic: (role = "p1") => {
        if (this.motionController && this.motionController.triggerHapticFeedback) {
          this.motionController.triggerHapticFeedback({
            role,
            kind: "hit",
            grade: "3D HAPTIC TEST!",
            shotType: "TOPSPIN",
            speedKmh: 175,
            intensity: 1.35,
          });
        }
      },
    });

    const AudioEngineClass = AudioEngineMod.AudioEngine || AudioEngineMod.default;
    if (AudioEngineClass) {
      this.audioEngine = new AudioEngineClass({
        onTrackChange: (info) => {
          this.hud.updateAudioStatus({
            playing: !info.muted,
            trackName: info.title.replace(/\s*\(Lyria 3\)/i, ""),
          });
        },
      });
    }

    const MotionControllerClass = MotionControlsMod.MotionController || MotionControlsMod.default;
    if (MotionControllerClass) {
      this.motionController = new MotionControllerClass({
        webcamCanvasId: "webcam-canvas",
        roomId: this.roomId,
        role: this.playerRole,
        onSwing: (evt) => this._handleUserSwingInput(evt),
        onToss: (evt) => this._handleUserTossInput(evt),
        onP2Swing: (evt) => this._handleP2SwingInput(evt),
        onP2Toss: (evt) => this._handleP2TossInput(evt),
        onRoomState: (state) => this._handleRoomStateUpdate(state),
        onStatusChange: (st) => {
          this.hud.updateMotionStatus({
            webcamActive: !!st.webcam,
            phoneConnected: !!st.phone,
            p1Phone: !!st.p1Phone,
            p2Phone: !!st.p2Phone,
          });
        },
      });
    }

    window.addEventListener("keydown", (e) => {
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      if (e.code === "KeyC") {
        this.hud.callbacks.onCycleCamera();
      } else if (e.code === "KeyR") {
        this.hud.callbacks.onToggleReplay();
      } else if (
        this.isMultiplayer &&
        (e.code === "ShiftRight" || e.code === "KeyK" || e.code === "Numpad0")
      ) {
        this._handleP2SwingInput({
          source: "keyboard_p2",
          shotType: this.p2SelectedShotType,
          speed: 1.18,
        });
      }
    });
  }

  async createMultiplayerRoom({ p1Name = "Player 1", p2Name = "Player 2" } = {}) {
    try {
      const res = await fetch("/api/match/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p1Name, p2Name }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.roomId) {
          this.roomId = data.roomId;
          this.isMultiplayer = true;
          this._applyDifficultyTuning("1v1");
          if (this.motionController && this.motionController.setRoomConfig) {
            this.motionController.setRoomConfig({ roomId: this.roomId, role: this.playerRole });
          }
          this.roomStatus = {
            ...this.roomStatus,
            roomId: data.roomId,
            tunnelUrl: data.tunnelUrl || "",
            urls: data.urls || null,
            gchatCard: data.gchatCard || null,
          };
          if (this.hud && this.hud.updateMultiplayerRoomInfo) {
            this.hud.updateMultiplayerRoomInfo(this.roomStatus);
          }
          return data;
        }
      }
    } catch (err) {
      console.warn("[ArgonTennisEngine] Failed to create multiplayer room:", err);
    }
    return null;
  }

  async loadAssetsAndStart() {
    const loader = new GLTFLoader();
    const loadModel = async (url, retries = 4) => {
      const resolved =
        url.startsWith("http") || url.startsWith("./") || url.startsWith("/")
          ? url.replace("https://www.gstatic.com/aistudio/starter-apps/tennis/", "./assets/")
          : `./assets/models/${url}?v=argon4_kinetic`;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await new Promise((resolve, reject) => {
            loader.load(
              resolved,
              (gltf) => resolve(gltf.scene),
              undefined,
              (err) => reject(err)
            );
          });
        } catch (err) {
          if (attempt === retries) {
            console.warn(`[ArgonTennisEngine] Could not load ${resolved}:`, err);
            return new THREE.Group();
          }
          await new Promise((r) => setTimeout(r, 350));
        }
      }
      return new THREE.Group();
    };

    const [
      stadiumScene,
      netScene,
      playerScene,
      opponentScene,
      racketScene,
      ballScene,
      crowdScene,
    ] = await Promise.all([
      loadModel(
        "https://www.gstatic.com/aistudio/starter-apps/tennis/models/stadium_court.glb?v=argon4_kinetic"
      ),
      loadModel(
        "https://www.gstatic.com/aistudio/starter-apps/tennis/models/tennis_net.glb?v=argon4_kinetic"
      ),
      loadModel(
        "https://www.gstatic.com/aistudio/starter-apps/tennis/models/mii_player.glb?v=argon4_kinetic"
      ),
      loadModel(
        "https://www.gstatic.com/aistudio/starter-apps/tennis/models/mii_opponent.glb?v=argon4_kinetic"
      ),
      loadModel(
        "https://www.gstatic.com/aistudio/starter-apps/tennis/models/tennis_racket.glb?v=argon4_kinetic"
      ),
      loadModel(
        "https://www.gstatic.com/aistudio/starter-apps/tennis/models/tennis_ball.glb?v=argon4_kinetic"
      ),
      loadModel(
        "https://www.gstatic.com/aistudio/starter-apps/tennis/models/mii_crowd.glb?v=argon4_kinetic"
      ),
    ]);

    const playerPartnerScene = playerScene.clone(true);
    const opponentPartnerScene = opponentScene.clone(true);

    this._prepareStadiumAndNet(stadiumScene, netScene);
    this._prepareCrowd(crowdScene);
    this._prepareMiiActor(this.player, playerScene, racketScene);
    this._prepareMiiActor(this.playerPartner, playerPartnerScene, racketScene);
    this._prepareMiiActor(this.opponent, opponentScene, racketScene);
    this._prepareMiiActor(this.opponentPartner, opponentPartnerScene, racketScene);
    this._prepareTennisBall(ballScene);

    if (this.sport === "table_tennis") {
      this.setSport("table_tennis");
    }

    this._bootInitialStateFromURL();
    this.clock.start();

    const animate = () => {
      requestAnimationFrame(animate);
      const dt = Math.min(this.clock.getDelta(), 0.08);
      this.update(dt);
      this.render();
    };
    requestAnimationFrame(animate);
  }

  _prepareStadiumAndNet(stadiumScene, netScene) {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy
      ? this.renderer.capabilities.getMaxAnisotropy()
      : 8;
    const tuneMaterial = (mat) => {
      if (!mat) return;
      const name = mat.name || "";
      if (mat.map) {
        mat.map.anisotropy = maxAniso;
        mat.map.wrapS = THREE.RepeatWrapping;
        mat.map.wrapT = THREE.RepeatWrapping;
        mat.map.needsUpdate = true;
      }
      if (/TreeSprite/i.test(name)) {
        mat.alphaTest = 0.35;
        mat.transparent = true;
        mat.side = THREE.DoubleSide;
        mat.depthWrite = true;
      } else if (/Shadow|LogoArgonBanner/i.test(name)) {
        mat.transparent = true;
        mat.depthWrite = false;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -2;
        mat.polygonOffsetUnits = -2;
      } else if (/NetMesh/i.test(name)) {
        mat.transparent = true;
        mat.alphaTest = 0.08;
        mat.side = THREE.DoubleSide;
        mat.depthWrite = false;
      }
      mat.needsUpdate = true;
    };

    stadiumScene.traverse((child) => {
      if (child.isMesh) {
        const name = child.name || "";
        (Array.isArray(child.material) ? child.material : [child.material]).forEach(tuneMaterial);
        if (/Shadow/i.test(name)) {
          child.castShadow = false;
          child.receiveShadow = false;
          child.renderOrder = 1;
        } else if (/Tree/i.test(name)) {
          child.castShadow = true;
          child.receiveShadow = true;
        } else {
          child.receiveShadow = true;
          if (/Wall|Bleacher|Canopy|Pillar|Umpire|Bench|Clubhouse|StadiumCourt/i.test(name)) {
            child.castShadow = true;
          }
        }
      }
    });
    this.tennisStadiumGroup.add(stadiumScene);

    netScene.traverse((child) => {
      if (child.isMesh) {
        const name = child.name || "";
        (Array.isArray(child.material) ? child.material : [child.material]).forEach(tuneMaterial);
        if (/Shadow/i.test(name)) {
          child.castShadow = false;
          child.receiveShadow = false;
          child.renderOrder = 1;
        } else if (/Mesh/i.test(name)) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.renderOrder = 2;
        } else {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      }
    });
    this.tennisStadiumGroup.add(netScene);
  }

  _prepareCrowd(crowdScene) {
    crowdScene.position.set(0, 0, 0);
    crowdScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
      }
    });
    this.crowdScene = crowdScene;
    this.scene.add(crowdScene);
  }

  _prepareMiiActor(actor, modelScene, racketTemplate) {
    actor.model = modelScene;
    modelScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
      child.userData.basePos = child.position.clone();
      child.userData.baseRot = child.rotation.clone();
      const n = (child.name || "").trim();
      if (/^head(\.?0*\d+)?$/i.test(n) && (!actor.parts.head || !child.isMesh)) {
        actor.parts.head = child;
      } else if (/^torso(\.?0*\d+)?$/i.test(n) && (!actor.parts.torso || !child.isMesh)) {
        actor.parts.torso = child;
      } else if (/^hand_l(\.?0*\d+)?$/i.test(n) && (!actor.parts.handL || !child.isMesh)) {
        actor.parts.handL = child;
      } else if (/^hand_r(\.?0*\d+)?$/i.test(n) && (!actor.parts.handR || !child.isMesh)) {
        actor.parts.handR = child;
      } else if (/^foot_l(\.?0*\d+)?$/i.test(n) && (!actor.parts.footL || !child.isMesh)) {
        actor.parts.footL = child;
      } else if (/^foot_r(\.?0*\d+)?$/i.test(n) && (!actor.parts.footR || !child.isMesh)) {
        actor.parts.footR = child;
      }
    });

    modelScene.scale.setScalar(1.16);
    actor.root.add(modelScene);

    upgradeMiiCharacterMaterials(actor, actor.sideSign > 0 ? "p1" : "p2");
    if (this.facialFX) this.facialFX.attachFacialRig(actor);
    if (this.bodyAnimator) this.bodyAnimator.setupArticulatedMiiRig(actor);

    // Create wrapper group for racketMesh so RacketKinematicsController and SwingVFXManager work seamlessly in both sports
    const racketHolder = new THREE.Group();
    const tennisRacket = racketTemplate.clone(true);
    tennisRacket.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    upgradeRacketMaterials(tennisRacket);
    tennisRacket.scale.setScalar(1.22);
    racketHolder.add(tennisRacket);

    const paddleMesh = this._createTableTennisPaddleMesh(actor.sideSign);
    racketHolder.add(paddleMesh);

    actor.racketMesh = racketHolder;
    actor.tennisRacketVisual = tennisRacket;
    actor.paddleMesh = paddleMesh;

    actor.racketPivot.position.set(-0.36, 0.9, 0.16);
    actor.racketMesh.rotation.set(0, 0, 0);
    actor.racketPivot.add(actor.racketMesh);

    actor.swingArcMesh = createSwingArcMesh();
    actor.swingArcMesh.visible = false;
    actor.root.add(actor.swingArcMesh);
    actor.root.add(actor.racketPivot);

    actor.root.rotation.y = actor.sideSign > 0 ? Math.PI : 0;
    actor.root.position.copy(actor.pos);
    this.scene.add(actor.root);

    if (this.racketKinematics) this.racketKinematics.initActor(actor);
    if (this.swingVfx) this.swingVfx.registerActor(actor);
  }

  _prepareTennisBall(ballScene) {
    const ballRoot = new THREE.Group();
    ballScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
    ballScene.scale.setScalar(1.65);
    ballRoot.add(ballScene);

    // 3D Matte White 40mm Table Tennis Ball
    const ppGeo = new THREE.SphereGeometry(0.068, 20, 16);
    const ppMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.04,
      emissive: 0x222222,
    });
    const pingPongMesh = new THREE.Mesh(ppGeo, ppMat);
    pingPongMesh.castShadow = true;
    pingPongMesh.visible = false;
    ballRoot.add(pingPongMesh);

    this.ball.mesh = ballRoot;
    this.ball.tennisBallVisual = ballScene;
    this.ball.pingPongMesh = pingPongMesh;
    this.ball.mesh.position.copy(this.ball.pos);
    this.scene.add(this.ball.mesh);
  }

  _bootInitialStateFromURL() {
    if (this.urlRoom && this.urlRoom !== "DEFAULT" && !this.urlAutoPlay) {
      this.hud.hideTitleModal();
      this.autoPlayMode = false;
      this.userHasInteracted = true;
      this.persistentStateLock = false;
      this.startNewMatch({ showStartBanner: true });
      this._snapCameraImmediate();
      return;
    }

    if (!this.urlAutoPlay) {
      this.score.playerPoints = 0;
      this.score.opponentPoints = 0;
      this._syncScoreboardHUD();
      this._setupMidRallyShowcase({ scorePlayer: 0, scoreOpponent: 0 });
      this.autoPlayMode = true;
      if (this.audioEngine) this.audioEngine.playMusicForState("title");
      return;
    }

    this.hud.hideTitleModal();
    if (this.urlState === "gamepoint" || this.urlState === "serve") {
      this.score.playerPoints = this._isTableTennis() ? 10 : 3;
      this.score.opponentPoints = 0;
      this.score.playerGames = 0;
      this.score.opponentGames = 0;
      this.score.server = "player";
      this.score.deuceSide = false;
      this._syncScoreboardHUD();
      this.persistentStateLock = true;
      this._setupPointServe({
        showBanner: true,
        bannerText: "Game Point",
        bannerStyle: "style-gold",
        persistentBanner: true,
      });
      this._snapCameraImmediate();
      if (this.audioEngine) this.audioEngine.playMusicForState("gamepoint");
      return;
    }

    if (this.urlState === "start") {
      this.score.playerPoints = 0;
      this.score.opponentPoints = 0;
      this.score.server = "player";
      this.score.deuceSide = true;
      this._syncScoreboardHUD();
      this.persistentStateLock = true;
      this._setupPointServe({
        showBanner: true,
        bannerText: "Start",
        bannerStyle: "style-start",
        persistentBanner: true,
      });
      this._snapCameraImmediate();
      return;
    }

    if (this.urlState === "replay") {
      this.score.playerPoints = 3;
      this.score.opponentPoints = 0;
      this._syncScoreboardHUD();
      this.persistentStateLock = true;
      this._enterInstantReplayState({ persistent: true });
      this._snapCameraImmediate();
      if (this.audioEngine) this.audioEngine.playMusicForState("replay");
      return;
    }

    if (this.urlState && this.urlState.startsWith("showcase")) {
      this.score.playerPoints = 2;
      this.score.opponentPoints = 1;
      this._syncScoreboardHUD();
      this.persistentStateLock = true;
      this.autoPlayMode = false;
      this._setupKineticShowcaseState(this.urlState);
      this._snapCameraImmediate();
      return;
    }

    this.score.playerPoints = 1;
    this.score.opponentPoints = 0;
    this.score.playerGames = 0;
    this.score.opponentGames = 0;
    this._syncScoreboardHUD();
    this.hud.hideCenterBanner();
    this.hud.setReplayMode(false);
    this.autoPlayMode = true;
    this.persistentStateLock = false;
    this._setupMidRallyShowcase({ scorePlayer: 1, scoreOpponent: 0 });
    this._snapCameraImmediate();
    if (this.audioEngine) this.audioEngine.playMusicForState("rally");
  }

  _setupKineticShowcaseState(modeName = "showcase_topspin") {
    this.phase = "SHOWCASE";
    this.showcaseModeName = modeName;
    this.phaseTimer = 0;
    this.cameraMode = "SHOWCASE_CAM";
    this.hud.setReplayMode(false);
    this.hud.hideCenterBanner();

    const homeZ = this._getHomeZ();
    this.player.pos.set(1.15, 0, homeZ - 0.65);
    this.player.targetPos.copy(this.player.pos);
    this.player.root.rotation.y = Math.PI + 0.18;

    this.opponent.pos.set(-1.25, 0, -(homeZ - 1.5));
    this.opponent.targetPos.copy(this.opponent.pos);

    this.playerPartner.pos.set(-2.35, 0, 5.2);
    this.opponentPartner.pos.set(2.35, 0, -5.2);
    this._refreshShowcasePose();
  }

  _refreshShowcasePose() {
    const mode = this.showcaseModeName || "showcase_topspin";
    const stepPose = (elapsed) => {
      for (let i = 0; i < 10; i++) {
        this.player.racketKinematics.swingActive = true;
        this.player.racketKinematics.swingElapsed = elapsed;
        this.racketKinematics.update(this.player, 0.016, { ball: this.ball, phase: this.phase });
        this.player.racketKinematics.swingActive = true;
        this.player.racketKinematics.swingElapsed = elapsed;
        this.bodyAnimator.updateMiiBodyAnimation(this.player, 0.016, this);
      }
      this.player.root.updateMatrixWorld(true);
    };

    if (mode === "showcase_slice" || mode === "showcase_backhand") {
      this.player.swingType = "backhand";
      this.player.swingDuration = 0.36;
      this.player.swingTimer = 0.26;
      this.racketKinematics.triggerSwing(this.player, {
        shotType: mode === "showcase_backhand" ? "topspin" : "slice",
        side: "backhand",
        speed: 1.32,
        timing: "sweet",
      });
      stepPose(0.072);
      this.swingVfx.seedActorSwingArc(this.player, {
        shotType: "SLICE",
        isPower: false,
        whipSpeed: 28,
        swingType: "backhand",
      });
      this.facialFX.setExpression(this.player, "focused_squint", 10);
      const center = this.racketKinematics.getRacketRimWorldPoints(this.player).centerWorld.clone();
      this.ball.pos.copy(center).add(new THREE.Vector3(0.06, 0.03, -0.22));
      this.ball.vel.set(1.4, 0.9, -15.2);
      this.ballTrail.setStyle("SLICE", false);
      this.ballTrail.seedArc(center, this.ball.pos, 0.05);
      this.swingVfx.triggerBallDeformation(this.ball, "racket_hit", this.ball.vel, 26);
      this.swingVfx.spawnImpactBurst(center, { shotType: "SLICE", isPower: false, count: 16 });
    } else if (mode === "showcase_smash") {
      this.player.swingType = "smash";
      this.player.swingDuration = 0.36;
      this.player.swingTimer = 0.26;
      this.racketKinematics.triggerSwing(this.player, {
        shotType: "smash",
        side: "overhead",
        speed: 1.45,
        timing: "sweet",
      });
      stepPose(0.058);
      this.swingVfx.seedActorSwingArc(this.player, {
        shotType: "SMASH",
        isPower: true,
        whipSpeed: 34,
        swingType: "smash",
      });
      this.facialFX.setExpression(this.player, "effort_shout", 10);
      const center = this.racketKinematics.getRacketRimWorldPoints(this.player).centerWorld.clone();
      this.ball.pos.copy(center).add(new THREE.Vector3(-0.04, -0.04, -0.22));
      this.ball.vel.set(-1.5, -2.8, -22);
      this.ballTrail.setStyle("SMASH", true);
      this.ballTrail.seedArc(center, this.ball.pos, 0.05);
      this.swingVfx.triggerBallDeformation(this.ball, "racket_hit", this.ball.vel, 32);
      this.swingVfx.spawnImpactBurst(center, { shotType: "SMASH", isPower: true, count: 22 });
    } else {
      this.player.swingType = "forehand";
      this.player.swingDuration = 0.36;
      this.player.swingTimer = 0.26;
      this.racketKinematics.triggerSwing(this.player, {
        shotType: "topspin",
        side: "forehand",
        speed: 1.35,
        timing: "sweet",
      });
      stepPose(0.068);
      this.swingVfx.seedActorSwingArc(this.player, {
        shotType: "TOPSPIN",
        isPower: true,
        whipSpeed: 29,
        swingType: "forehand",
      });
      this.facialFX.setExpression(this.player, "effort_shout", 10);
      const center = this.racketKinematics.getRacketRimWorldPoints(this.player).centerWorld.clone();
      this.ball.pos.copy(center).add(new THREE.Vector3(-0.06, 0.04, -0.22));
      this.ball.vel.set(-1.8, 2.2, -18.5);
      this.ballTrail.setStyle("TOPSPIN", true);
      this.ballTrail.seedArc(center, this.ball.pos, 0.05);
      this.swingVfx.triggerBallDeformation(this.ball, "racket_hit", this.ball.vel, 28);
      this.swingVfx.spawnImpactBurst(center, { shotType: "TOPSPIN", isPower: true, count: 18 });
    }
  }

  startNewMatch({ showStartBanner = true } = {}) {
    this.score.playerPoints = 0;
    this.score.opponentPoints = 0;
    this.score.playerGames = 0;
    this.score.opponentGames = 0;
    this.score.server = "player";
    this.score.deuceSide = true;
    this._syncScoreboardHUD();
    this.hud.setReplayMode(false);
    if (this.audioEngine) {
      this.audioEngine.playMusicForState("start");
      this.audioEngine.announceScore("Start");
    }
    this._setupPointServe({
      showBanner: showStartBanner,
      bannerText: "Start",
      bannerStyle: "style-start",
      persistentBanner: false,
    });
  }

  _setupPointServe({
    showBanner = true,
    bannerText = null,
    bannerStyle = "style-gold",
    persistentBanner = false,
  } = {}) {
    this.phase = "SERVE_STANCE";
    this.phaseTimer = 0;
    this.cameraMode = "SERVE_CAM";
    this.hud.setReplayMode(false);
    this.ballTrail.clear();
    if (this.swingVfx) this.swingVfx.clearAllTrails();

    const isTT = this._isTableTennis();
    const homeZ = this._getHomeZ();
    const serveX = isTT ? (this.score.deuceSide ? 0.85 : -0.65) : this.score.deuceSide ? 1.35 : -0.55;
    const recvX = isTT ? (this.score.deuceSide ? -0.95 : 0.95) : this.score.deuceSide ? -2.35 : 2.15;
    const ballHoldY = isTT ? 1.16 : 1.12;

    if (this.score.server === "player") {
      this.player.pos.set(serveX, 0, homeZ + (isTT ? 0.05 : 0.12));
      this.player.targetPos.copy(this.player.pos);
      this.opponent.pos.set(recvX, 0, -homeZ + (isTT ? 0.08 : 0.35));
      this.opponent.targetPos.copy(this.opponent.pos);
      this.ball.pos.set(serveX - 0.24, ballHoldY, homeZ - 0.18);
    } else {
      this.opponent.pos.set(-serveX, 0, -homeZ - (isTT ? 0.05 : 0.12));
      this.opponent.targetPos.copy(this.opponent.pos);
      this.player.pos.set(-recvX, 0, homeZ - (isTT ? 0.08 : 0.35));
      this.player.targetPos.copy(this.player.pos);
      this.ball.pos.set(-serveX + 0.24, ballHoldY, -homeZ + 0.18);
    }

    const partnerX = this.score.deuceSide ? -2.05 : 2.05;
    this.playerPartner.pos.set(partnerX, 0, 5.2);
    this.playerPartner.targetPos.copy(this.playerPartner.pos);
    this.playerPartner.root.visible = !isTT;
    if (this.playerPartner.shadowBlob) this.playerPartner.shadowBlob.visible = !isTT;

    this.opponentPartner.pos.set(-partnerX, 0, -5.2);
    this.opponentPartner.targetPos.copy(this.opponentPartner.pos);
    this.opponentPartner.root.visible = !isTT;
    if (this.opponentPartner.shadowBlob) this.opponentPartner.shadowBlob.visible = !isTT;

    this.ball.vel.set(0, 0, 0);
    this.ball.spin.set(0, 0, 0);
    this.ball.inPlay = false;
    this.ball.bounceCountOnCurrentSide = 0;
    this.ball.rallyStrokeCount = 0;
    this.pendingUserSwing = null;
    this.pendingP2Swing = null;
    this.pendingServeSwing = null;

    this.player.swingArcMesh.visible = false;
    this.opponent.swingArcMesh.visible = false;
    if (this.playerPartner.swingArcMesh) this.playerPartner.swingArcMesh.visible = false;
    if (this.opponentPartner.swingArcMesh) this.opponentPartner.swingArcMesh.visible = false;

    this.player.swingCooldown = 0;
    this.playerPartner.swingCooldown = 0;
    this.opponent.swingCooldown = 0;
    this.opponentPartner.swingCooldown = 0;

    if (this.facialFX) {
      this.facialFX.setExpression(this.player, "neutral", 2);
      this.facialFX.setExpression(this.opponent, "neutral", 2);
      this.facialFX.setExpression(this.playerPartner, "neutral", 2);
      this.facialFX.setExpression(this.opponentPartner, "neutral", 2);
    }

    let bText = bannerText;
    let bStyle = bannerStyle;
    if (!bText && showBanner) {
      const highStakes = this._getHighStakesPointLabel();
      if (highStakes) {
        bText = highStakes;
        bStyle = "style-gold";
        if (this.audioEngine) this.audioEngine.announceScore(highStakes, { delayMs: 180 });
      }
    }

    if (bText && showBanner) {
      this._recordBannerBroadcast(bText, bStyle, "");
      this.hud.showCenterBanner(bText, {
        style: bStyle,
        durationMs: 1800,
        persistent: persistentBanner,
      });
    } else if (!persistentBanner) {
      this.hud.hideCenterBanner();
    }

    this.hud.updateTimingGauge({
      cursorNormalized: 0.5,
      modeTitle: isTT ? "PADDLE SERVE TOSS" : "SERVE TOSS",
      speedText: "UPWARD FLICK / SPACE",
    });
  }

  _setupMidRallyShowcase({ scorePlayer = 1, scoreOpponent = 0 } = {}) {
    this.phase = "RALLY";
    this.phaseTimer = 0;
    this.cameraMode = "RALLY_CAM";
    this.hud.setReplayMode(false);
    this.hud.hideCenterBanner();

    const isTT = this._isTableTennis();
    const homeZ = this._getHomeZ();

    this.player.pos.set(isTT ? 0.85 : 1.35, 0, homeZ - 0.35);
    this.player.targetPos.set(isTT ? 0.75 : 1.15, 0, homeZ - 0.35);
    this.player.swingType = "forehand";
    this.player.swingTimer = 0.25;
    this.player.arcVisibleTimer = 1.2;
    this.player.swingArcMesh.visible = true;

    if (this.racketKinematics) {
      this.racketKinematics.triggerSwing(this.player, {
        shotType: "topspin",
        side: "forehand",
        speed: 1.35,
        timing: "sweet",
      });
      this.player.racketKinematics.swingElapsed = 0.13;
    }
    if (this.swingVfx) {
      this.swingVfx.seedActorSwingArc(this.player, {
        shotType: "TOPSPIN",
        isPower: true,
        whipSpeed: 28,
        swingType: "forehand",
      });
    }
    if (this.facialFX) {
      this.facialFX.setExpression(this.player, "effort_shout", 1.2);
      this.facialFX.setExpression(this.opponent, "focused_squint", 1.2);
    }

    this.playerPartner.pos.set(-2.1, 0, 5.4);
    this.playerPartner.targetPos.copy(this.playerPartner.pos);
    this.playerPartner.root.visible = !isTT;
    if (this.playerPartner.shadowBlob) this.playerPartner.shadowBlob.visible = !isTT;

    this.opponentPartner.pos.set(2.1, 0, -5.4);
    this.opponentPartner.targetPos.copy(this.opponentPartner.pos);
    this.opponentPartner.root.visible = !isTT;
    if (this.opponentPartner.shadowBlob) this.opponentPartner.shadowBlob.visible = !isTT;

    this.opponent.pos.set(isTT ? -0.95 : -1.65, 0, -(homeZ - 0.55));
    this.opponent.targetPos.set(isTT ? -1.05 : -1.95, 0, -(homeZ - 0.45));

    const startPt = new THREE.Vector3(isTT ? 0.9 : 1.42, 1.25, homeZ - 0.55);
    const midPt = new THREE.Vector3(-0.18, isTT ? 1.32 : 1.88, 0.35);
    this.ball.pos.copy(midPt);
    this.ball.vel.set(-1.55, 1.85, isTT ? -9.5 : -14.8);
    this.ball.spin.set(18, 0, 0);
    this.ball.inPlay = true;
    this.ball.lastHitter = "player";
    this.ball.bounceCountOnCurrentSide = 0;
    this.ball.rallyStrokeCount = 2;
    this.ball.shotType = "TOPSPIN";
    this.ball.isPowerShot = true;

    this.ballTrail.setStyle("TOPSPIN", false);
    this.ballTrail.seedArc(startPt, midPt, isTT ? 0.35 : 0.72);
    if (this.swingVfx) {
      this.swingVfx.spawnImpactBurst(startPt, { shotType: "TOPSPIN", isPower: true, count: 14 });
    }
    this._predictBallIntercept(this.opponent);
  }

  _enterInstantReplayState({ persistent = false } = {}) {
    this.phase = "REPLAY";
    this.phaseTimer = 0;
    this.cameraMode = "REPLAY_CAM";
    this.persistentStateLock = persistent;
    this.hud.hideCenterBanner();
    this.hud.setReplayMode(true);
    this.cheerEnergy = 0.85;
    if (this.audioEngine && !persistent) this.audioEngine.playVoiceCallout("replay");
    this._resetReplayNetExchangePose();
  }

  _resetReplayNetExchangePose() {
    this.player.pos.set(1.55, 0, 0.95);
    this.player.targetPos.copy(this.player.pos);
    this.player.root.rotation.y = Math.PI + 0.22;
    this.player.swingType = "forehand";
    this.player.swingTimer = 0.08;
    this.player.arcVisibleTimer = 1.5;
    this.player.swingArcMesh.visible = true;

    this.opponent.pos.set(-1.25, 0, -1.35);
    this.opponent.targetPos.copy(this.opponent.pos);
    this.opponent.root.rotation.y = -0.18;
    this.opponent.swingType = "forehand";
    this.opponent.swingTimer = 0.12;
    this.opponent.arcVisibleTimer = 1.5;
    this.opponent.swingArcMesh.visible = true;

    if (this.racketKinematics) {
      this.racketKinematics.triggerSwing(this.player, {
        shotType: "topspin",
        side: "forehand",
        speed: 1.32,
        timing: "sweet",
      });
      this.player.racketKinematics.swingElapsed = 0.14;
      this.racketKinematics.triggerSwing(this.opponent, {
        shotType: "slice",
        side: "forehand",
        speed: 1.25,
        timing: "sweet",
      });
      this.opponent.racketKinematics.swingElapsed = 0.11;
    }

    if (this.swingVfx) {
      this.swingVfx.seedActorSwingArc(this.player, {
        shotType: "TOPSPIN",
        isPower: true,
        whipSpeed: 28,
        swingType: "forehand",
      });
      this.swingVfx.seedActorSwingArc(this.opponent, {
        shotType: "SLICE",
        isPower: false,
        whipSpeed: 25,
        swingType: "forehand",
      });
    }

    if (this.facialFX) {
      this.facialFX.setExpression(this.player, "effort_shout", 2);
      this.facialFX.setExpression(this.opponent, "wide_eyed_panic", 2);
      this.facialFX.spawnSweatDrops(this.opponent, 5);
    }

    const startPt = new THREE.Vector3(-1.12, 1.22, -1.08);
    const curPt = new THREE.Vector3(-0.08, 1.34, 0.05);
    this.ball.pos.copy(curPt);
    this.ball.vel.set(0.95, 0.85, 3.6);
    this.ball.inPlay = true;
    this.ballTrail.setStyle("SLICE", true);
    this.ballTrail.seedArc(startPt, curPt, 0.24);
  }

  _handleUserTossInput(evt = {}) {
    this.userHasInteracted = true;
    if (this.phase === "TITLE") {
      this.hud.hideTitleModal();
      this.autoPlayMode = false;
      this.persistentStateLock = false;
      this.startNewMatch({ showStartBanner: true });
      return true;
    }
    if (this.phase === "SERVE_STANCE" && this.score.server === "player") {
      this.persistentStateLock = false;
      this.hud.hideCenterBanner();
      this._startServeToss(this.player);
      return true;
    }
    return false;
  }

  _handleUserSwingInput(evt = {}) {
    this.userHasInteracted = true;
    if (this.phase === "TITLE") {
      this.hud.hideTitleModal();
      this.autoPlayMode = false;
      this.persistentStateLock = false;
      this.startNewMatch({ showStartBanner: true });
      return;
    }

    if (evt.shotType && evt.shotType !== "toss") {
      const upper = String(evt.shotType).toUpperCase();
      if (["TOPSPIN", "SLICE", "LOB", "SMASH", "FLAT"].includes(upper)) {
        this.selectedShotType = upper === "SMASH" ? "FLAT" : upper;
      }
    }

    if (this.phase === "SERVE_STANCE" && this.score.server === "player") {
      this.persistentStateLock = false;
      this.hud.hideCenterBanner();
      this._startServeToss(this.player);
      return;
    }

    if (this.phase === "SERVE_TOSS" && this.score.server === "player") {
      if (this.phaseTimer < 0.14) return;
      if (this.ball.pos.y >= 1.35 && this.ball.pos.y < 2.15 && this.ball.vel.y > 0.45) {
        this.pendingServeSwing = {
          actor: this.player,
          evt: { ...evt, speed: Math.max(1.22, Number(evt.speed || 1.22)) },
        };
        return;
      }
      this._executeServeHit(this.player, evt);
      return;
    }

    if (this.phase === "RALLY") {
      this.autoPlayMode = false;
      const isTT = this._isTableTennis();
      const side =
        evt.side === "backhand" || (Number(evt.dirX || 0) > 0.12 && evt.side !== "forehand")
          ? "backhand"
          : evt.side === "forehand" || Number(evt.dirX || 0) < -0.12
          ? "forehand"
          : this.ball.pos.x < this.player.pos.x - 0.05 || this.ball.targetLanding.x < -0.15
          ? "backhand"
          : "forehand";
      const shotLower = String(evt.shotType || this.selectedShotType || "topspin").toLowerCase();

      if (this.ball.lastHitter === "opponent") {
        const dzPlayer = this.ball.pos.z - this.player.pos.z;
        const dzPartner = this.ball.pos.z - this.playerPartner.pos.z;
        const usePartner =
          !isTT &&
          this.ball.pos.z > 0.3 &&
          this.ball.pos.z <= 7.5 &&
          Math.abs(this.ball.pos.x - this.playerPartner.pos.x) < 3.4;
        const dz = usePartner ? dzPartner : dzPlayer;
        if (dz < -0.95 && dz >= -7.8) {
          const hitter = usePartner ? this.playerPartner : this.player;
          if (this.racketKinematics) {
            this.racketKinematics.triggerSwing(hitter, {
              shotType: shotLower,
              side,
              speed: Number(evt.speed || 1.2),
              timing: "early",
              dirX: Number(evt.dirX || 0),
            });
          }
          if (this.audioEngine) this.audioEngine.playSwingWhoosh(Number(evt.speed || 1.15));
          this.pendingUserSwing = {
            evt: { ...evt, side, sweetSpotAssisted: true },
            expiresAt: this.elapsedTime + 0.48,
            waitForSweetSpot: true,
          };
          return;
        }
      }

      if (!this._attemptPlayerRallyStrike({ ...evt, side }, false)) {
        if (this.racketKinematics) {
          this.racketKinematics.triggerSwing(this.player, {
            shotType: shotLower,
            side,
            speed: Number(evt.speed || 1.2),
            timing: "sweet",
            dirX: Number(evt.dirX || 0),
          });
        }
        if (this.audioEngine) this.audioEngine.playSwingWhoosh(Number(evt.speed || 1.15));
        if (this.ball.lastHitter === "opponent") {
          const dzPlayer = this.ball.pos.z - this.player.pos.z;
          const dzPartner = this.ball.pos.z - this.playerPartner.pos.z;
          if (
            (dzPlayer >= -8 && dzPlayer <= 0.9) ||
            (!isTT && dzPartner >= -5.5 && dzPartner <= 0.9)
          ) {
            this.pendingUserSwing = {
              evt: { ...evt, side, sweetSpotAssisted: true },
              expiresAt: this.elapsedTime + 0.48,
              waitForSweetSpot: true,
            };
          }
        }
      }
    }
  }

  _handleP2TossInput(evt = {}) {
    this.userHasInteracted = true;
    this.isMultiplayer = true;
    if (this.phase === "TITLE") {
      this.hud.hideTitleModal();
      this.autoPlayMode = false;
      this.persistentStateLock = false;
      this.startNewMatch({ showStartBanner: true });
      return true;
    }
    if (this.phase === "SERVE_STANCE" && this.score.server === "opponent") {
      this.persistentStateLock = false;
      this.hud.hideCenterBanner();
      this._startServeToss(this.opponent);
      return true;
    }
    return false;
  }

  _handleP2SwingInput(evt = {}) {
    this.userHasInteracted = true;
    this.isMultiplayer = true;
    this._applyDifficultyTuning(this.isCouch1v1 ? "couch_1v1" : "1v1");
    if (this.phase === "TITLE") {
      this.hud.hideTitleModal();
      this.autoPlayMode = false;
      this.persistentStateLock = false;
      this.startNewMatch({ showStartBanner: true });
      return;
    }

    if (evt.shotType && evt.shotType !== "toss") {
      const upper = String(evt.shotType).toUpperCase();
      if (["TOPSPIN", "SLICE", "LOB", "SMASH", "FLAT"].includes(upper)) {
        this.p2SelectedShotType = upper === "SMASH" ? "FLAT" : upper;
      }
    }

    if (this.phase === "SERVE_STANCE" && this.score.server === "opponent") {
      this.persistentStateLock = false;
      this.hud.hideCenterBanner();
      this._startServeToss(this.opponent);
      return;
    }

    if (this.phase === "SERVE_TOSS" && this.score.server === "opponent") {
      if (this.phaseTimer < 0.14) return;
      if (this.ball.pos.y >= 1.35 && this.ball.pos.y < 2.15 && this.ball.vel.y > 0.45) {
        this.pendingServeSwing = {
          actor: this.opponent,
          evt: { ...evt, speed: Math.max(1.22, Number(evt.speed || 1.22)) },
        };
        return;
      }
      this._executeServeHit(this.opponent, evt);
      return;
    }

    if (this.phase === "RALLY") {
      this.autoPlayMode = false;
      const side =
        evt.side === "backhand" || (Number(evt.dirX || 0) > 0.12 && evt.side !== "forehand")
          ? "backhand"
          : evt.side === "forehand" || Number(evt.dirX || 0) < -0.12
          ? "forehand"
          : this.ball.pos.x > this.opponent.pos.x + 0.05 || this.ball.targetLanding.x > 0.15
          ? "backhand"
          : "forehand";
      const shotLower = String(evt.shotType || this.p2SelectedShotType || "topspin").toLowerCase();

      if (this.ball.lastHitter === "player") {
        const dz = this.opponent.pos.z - this.ball.pos.z;
        if (dz < -0.95 && dz >= -7.8) {
          if (this.racketKinematics) {
            this.racketKinematics.triggerSwing(this.opponent, {
              shotType: shotLower,
              side,
              speed: Number(evt.speed || 1.2),
              timing: "early",
              dirX: Number(evt.dirX || 0),
            });
          }
          this.pendingP2Swing = {
            evt: { ...evt, side, sweetSpotAssisted: true },
            expiresAt: this.elapsedTime + 0.48,
            waitForSweetSpot: true,
          };
          return;
        }
      }

      if (!this._attemptP2RallyStrike({ ...evt, side })) {
        if (this.racketKinematics) {
          this.racketKinematics.triggerSwing(this.opponent, {
            shotType: shotLower,
            side,
            speed: Number(evt.speed || 1.2),
            timing: "sweet",
            dirX: Number(evt.dirX || 0),
          });
        }
        if (this.ball.lastHitter === "player") {
          this.pendingP2Swing = {
            evt: { ...evt, side, sweetSpotAssisted: true },
            expiresAt: this.elapsedTime + 0.48,
            waitForSweetSpot: true,
          };
        }
      }
    }
  }

  _startServeToss(actor) {
    this.phase = "SERVE_TOSS";
    this.phaseTimer = 0;
    this.pendingServeSwing = null;
    const isTT = this._isTableTennis();
    const xOffset = actor.sideSign > 0 ? -0.28 : 0.28;
    this.ball.pos.set(
      actor.pos.x + xOffset,
      isTT ? 1.15 : 1.18,
      actor.pos.z - actor.sideSign * 0.22
    );
    this.ball.vel.set(0, isTT ? 4.8 : 6.32, 0);
    this.ball.inPlay = false;
    if (this.facialFX) this.facialFX.setExpression(actor, "focused_squint", 1.4);
    if (this.audioEngine) this.audioEngine.playServeToss();
  }

  _executeServeHit(actor, evt = {}) {
    const ballY = this.ball.pos.y;
    const isTT = this._isTableTennis();
    if (ballY < (isTT ? 1.05 : 1.25)) return;
    this.pendingServeSwing = null;

    const speed = THREE.MathUtils.clamp(Number(evt.speed || 1.18), 0.78, 1.68);
    const isSweet = isTT ? ballY >= 1.45 && ballY <= 2.45 : ballY >= 2.05 && ballY <= 3.55;
    const isEarly = ballY < (isTT ? 1.32 : 1.72);

    actor.swingType = isTT ? "forehand" : "serve";
    actor.swingDuration = 0.38;
    actor.swingTimer = 0.38;
    actor.arcVisibleTimer = 0.36;
    actor.swingArcMesh.visible = true;

    if (this.racketKinematics) {
      this.racketKinematics.triggerSwing(actor, {
        shotType: isTT ? "topspin" : "serve",
        side: isTT ? "forehand" : "overhead",
        speed,
        timing: isSweet ? "sweet" : isEarly ? "early" : "sweet",
        isServe: !isTT,
        dirX: Number(evt.dirX || 0),
      });
      this.racketKinematics.triggerImpactRecoil(actor, isSweet ? 1.45 : 0.95);
    }

    const diagSign = this.score.deuceSide ? -1 : 1;
    const maxW = this._getMaxHalfWidthX();
    const steerX = THREE.MathUtils.clamp(Number(evt.dirX || 0), -1, 1) * (isTT ? 0.65 : 1.15);
    const baseTargetX = actor.sideSign * diagSign * (isTT ? 0.85 + Math.random() * 0.55 : 1.75 + Math.random() * 0.85);
    const targetX = THREE.MathUtils.clamp(baseTargetX + steerX, -maxW + 0.32, maxW - 0.32);

    const aiPaceScale =
      actor.role === "opponent" && !this.isMultiplayer
        ? this.matchConfig.difficulty === "pro"
          ? 1
          : 1.22
        : 1;

    const targetZ = isTT
      ? -actor.sideSign * (2.25 + Math.random() * 1.25)
      : -actor.sideSign * (4.4 + Math.random() * 1.35);

    const flightTime = isTT
      ? (isSweet ? 0.42 : 0.52) * aiPaceScale
      : (isSweet ? Math.max(0.58, 0.66 / Math.min(1.18, speed * 0.92)) : isEarly ? 0.94 : 0.8) *
        aiPaceScale;

    const topspin = isSweet ? 22 : isEarly ? 8 : 15;
    const sidespin = Number(evt.dirX || 0) * -8;
    const contactPos = this.ball.pos.clone();

    this._launchBallToTarget(this.ball.pos, new THREE.Vector3(targetX, this._getSurfaceY(), targetZ), flightTime, {
      topspin,
      sidespin,
      allowNetFault: false,
    });

    const kmh = Math.round(
      isTT
        ? isSweet
          ? 112 + Math.min(18, (speed - 1) * 26)
          : 82 + Math.random() * 14
        : isSweet
        ? 188 + Math.min(22, (speed - 1) * 32)
        : isEarly
        ? 128 + Math.random() * 14
        : 158 + Math.min(22, (speed - 0.9) * 28)
    );

    this.ball.inPlay = true;
    this.ball.lastHitter = actor.role === "player" ? "player" : "opponent";
    this.ball.bounceCountOnCurrentSide = 0;
    this.ball.rallyStrokeCount = 1;
    this.ball.isPowerShot = isSweet;
    this.ball.shotType = isSweet ? "POWER" : "TOPSPIN";

    this.ballTrail.clear();
    this.ballTrail.setStyle(this.ball.shotType, isSweet);
    this.ballTrail.pushPoint(this.ball.pos);

    this.phase = "RALLY";
    this.cameraMode = "RALLY_CAM";

    if (this.swingVfx) {
      this.swingVfx.onRacketContact({
        actor,
        ball: this.ball,
        contactPos,
        shotType: isSweet ? "SMASH" : "SERVE",
        isPower: isSweet,
        isServe: true,
        timingQuality: isSweet ? "PERFECT" : "GOOD",
        speed: this.ball.vel.length(),
      });
    }
    if (this.facialFX) this.facialFX.setExpression(actor, "effort_shout", 0.55);
    if (isSweet) {
      this.cameraTrauma = 0.34;
      this._spawnStarBurst(this.ball.pos, 14);
    }
    if (this.audioEngine) {
      this.audioEngine.playSwingWhoosh(isSweet ? 1.5 : 1.1);
      this.audioEngine.playRacketHit(isSweet ? "smash" : "topspin", isSweet ? "perfect" : "good");
      if ((actor.role === "player" || this.isMultiplayer) && isSweet && !this.autoPlayMode) {
        this.audioEngine.playVoiceCallout("power serve");
      }
    }

    if (actor.role === "player" || (actor.role === "opponent" && this.isMultiplayer)) {
      const roleKey = actor.role === "player" ? "p1" : "p2";
      const grade = isSweet ? (isTT ? "SPIN SERVE!" : "POWER SERVE!") : isEarly ? "EARLY SERVE" : "GOOD SERVE";
      const detail = `${kmh} KM/H • ${isSweet ? "SWEET SPOT" : "IN PLAY"}`;
      const screenPos = this._projectToScreen(actor.pos.clone().add(new THREE.Vector3(0, 2.35, 0)));
      this.hud.showTimingPopup({ grade, detail, screenPos });
      this.hud.updateTimingGauge({
        cursorNormalized: isSweet ? 0.5 : isEarly ? 0.22 : 0.42,
        modeTitle: "SERVE IMPACT",
        speedText: `${kmh} KM/H`,
      });
      if (
        this.motionController &&
        this.motionController.triggerHapticFeedback &&
        !this.autoPlayMode
      ) {
        this.motionController.triggerHapticFeedback({
          role: roleKey,
          kind: "hit",
          grade,
          shotType: isSweet ? "SMASH" : "TOPSPIN",
          speedKmh: kmh,
          intensity: isSweet ? 1.5 : isEarly ? 0.75 : 1.05,
        });
      }
    }

    const receiver = actor.role === "player" ? this.opponent : this.player;
    this._predictBallIntercept(receiver);
  }

  _attemptPlayerRallyStrike(evt = {}, isAuto = false) {
    if (this.ball.lastHitter === "player") return false;
    const isTT = this._isTableTennis();

    const dzPlayer = this.ball.pos.z - this.player.pos.z;
    const dxPlayer = Math.abs(this.ball.pos.x - this.player.pos.x);
    const distPlayer = Math.hypot(dxPlayer, dzPlayer);

    const dzPartner = this.ball.pos.z - this.playerPartner.pos.z;
    const dxPartner = Math.abs(this.ball.pos.x - this.playerPartner.pos.z);
    const distPartner = Math.hypot(
      Math.abs(this.ball.pos.x - this.playerPartner.pos.x),
      dzPartner
    );

    const usePartner =
      !isTT &&
      !isAuto &&
      this.ball.pos.z > 0.3 &&
      this.ball.pos.z <= 7.6 &&
      distPartner <= 3.95 &&
      distPartner < distPlayer;

    const actor = usePartner ? this.playerPartner : this.player;
    const dz = usePartner ? dzPartner : dzPlayer;
    const dx = usePartner ? Math.abs(this.ball.pos.x - this.playerPartner.pos.x) : dxPlayer;
    const dist = usePartner ? distPartner : distPlayer;

    if (!isAuto && actor.swingCooldown > 0) return false;

    const speed = THREE.MathUtils.clamp(Number(evt.speed || 1.18), 0.8, 1.68);
    if (evt.shotType) {
      const upper = String(evt.shotType).toUpperCase();
      this.selectedShotType = upper === "SMASH" || upper === "POWER" ? "FLAT" : upper;
    }

    const isBackhand =
      evt.side === "backhand"
        ? true
        : evt.side === "forehand"
        ? false
        : Number(evt.dirX || 0) > 0.14
        ? true
        : Number(evt.dirX || 0) < -0.14
        ? false
        : this.ball.pos.x < actor.pos.x - 0.04 || this.ball.targetLanding.x < -0.12;

    const isSmash =
      evt.side === "overhead" ||
      ((this.selectedShotType === "FLAT" || evt.shotType === "smash") && this.ball.pos.y > 1.5) ||
      this.ball.pos.y > 1.78;

    actor.swingType = isSmash ? "smash" : isBackhand ? "backhand" : "forehand";
    actor.swingDuration = 0.36;
    actor.swingTimer = 0.36;
    actor.arcVisibleTimer = this.autoPlayMode ? 0.85 : 0.36;
    if (actor.swingArcMesh) actor.swingArcMesh.visible = false;

    if (this.racketKinematics) {
      const sLower = String(evt.shotType || this.selectedShotType || "topspin").toLowerCase();
      const kShot = isSmash || sLower === "power" ? "smash" : sLower;
      this.racketKinematics.triggerSwing(actor, {
        shotType: kShot,
        side: isSmash ? "overhead" : isBackhand ? "backhand" : "forehand",
        speed,
        timing: "sweet",
        dirX: Number(evt.dirX || 0),
      });
    }

    if (this.audioEngine) this.audioEngine.playSwingWhoosh(speed);

    const maxReach = isTT ? 3.85 : usePartner ? 4.05 : 4.85;
    if (dist > maxReach && !isAuto) {
      if (dz > 1.25) {
        actor.swingCooldown = 0.16;
        const grade = "TOO LATE! • WHIFF";
        const screenPos = this._projectToScreen(
          actor.pos.clone().add(new THREE.Vector3(0, 2.35, 0))
        );
        this.hud.showTimingPopup({
          grade,
          detail: "BALL PASSED",
          screenPos,
          durationMs: 750,
        });
        this.hud.updateTimingGauge({
          cursorNormalized: 0.92,
          modeTitle: "SWING WHIFF!",
          speedText: "LATE",
        });
        if (this.motionController && this.motionController.triggerHapticFeedback) {
          this.motionController.triggerHapticFeedback({
            role: "p1",
            kind: "whiff",
            grade,
            shotType: this.selectedShotType || "TOPSPIN",
            speedKmh: 0,
            intensity: 0.65,
          });
        }
      }
      return false;
    }

    let grade = "PERFECT";
    let gaugeNorm = 0.5;
    const wideStretch = dx > (isTT ? 1.85 : 2.85);

    if (evt.timing) {
      grade = String(evt.timing).toUpperCase();
    } else if (evt.sweetSpotAssisted && dz >= -1.85 && dz <= 0.78) {
      grade = "PERFECT";
      gaugeNorm = 0.5;
    } else if (dz < -2.65) {
      grade = "VERY EARLY";
      gaugeNorm = 0.14;
    } else if (dz < -1.45 || (evt.dirX && evt.dirX < -0.52)) {
      grade = "EARLY";
      gaugeNorm = 0.28;
    } else if (dz > 1.35) {
      grade = "VERY LATE";
      gaugeNorm = 0.88;
    } else if (dz > 0.68 || (evt.dirX && evt.dirX > 0.52)) {
      grade = "LATE";
      gaugeNorm = 0.72;
    } else if (wideStretch && this.matchConfig.difficulty === "pro") {
      grade = dz < 0 ? "EARLY" : "LATE";
      gaugeNorm = dz < 0 ? 0.3 : 0.7;
    }

    const isMistimed = grade === "VERY EARLY" || grade === "VERY LATE";
    const shotType = this.selectedShotType || "TOPSPIN";
    const isPower =
      !isMistimed && (grade === "PERFECT" || shotType === "FLAT" || isSmash) && speed >= 0.98;
    const playerSideSign = actor.pos.x >= 0 ? 1 : -1;
    const aimSteer = THREE.MathUtils.clamp(Number(evt.dirX || 0), -1, 1);

    const maxW = this._getMaxHalfWidthX();
    const lateralSpread = isTT ? 1.25 : 2.45;
    let targetX = 0;

    if (grade === "EARLY" || grade === "VERY EARLY") {
      targetX = -playerSideSign * (lateralSpread + Math.random() * 0.65) + aimSteer * 0.75;
    } else if (grade === "LATE" || grade === "VERY LATE") {
      targetX = playerSideSign * (lateralSpread + Math.random() * 0.65) + aimSteer * 0.75;
    } else {
      const openCourtSign = this.opponent.pos.x >= 0 ? -1 : 1;
      if (Math.abs(aimSteer) > 0.22) {
        targetX = aimSteer * (lateralSpread + 0.35 + Math.random() * 0.55);
      } else {
        targetX = openCourtSign * (lateralSpread + Math.random() * 0.75);
      }
    }

    let forceOut = false;
    if (
      isMistimed &&
      !isAuto &&
      !this.autoPlayMode &&
      this.matchConfig.difficulty === "pro" &&
      speed > 1.45 &&
      Math.random() < 0.28
    ) {
      forceOut = true;
    }

    if (forceOut) {
      targetX = (targetX >= 0 ? 1 : -1) * (maxW + 0.42 + Math.random() * 0.35);
    } else {
      targetX = THREE.MathUtils.clamp(targetX, -maxW + 0.28, maxW - 0.28);
    }

    let targetZ = isTT ? -(2.15 + Math.random() * 1.55) : -(8.2 + Math.random() * 2.6);
    let flightTime = isTT ? 0.46 : 0.84;
    let topspin = 16;
    let sidespin = 0;

    if (isTT) {
      if (shotType === "LOB") {
        flightTime = 0.72;
        targetZ = -(2.6 + Math.random() * 1.2);
        topspin = 6;
      } else if (shotType === "SLICE") {
        flightTime = 0.54;
        targetZ = -(1.85 + Math.random() * 1.4);
        topspin = -6;
        sidespin = -playerSideSign * 9;
      } else if (shotType === "FLAT" || isPower) {
        flightTime = Math.max(0.34, 0.42 / Math.min(1.2, speed * 0.94));
        targetZ = -(2.55 + Math.random() * 1.3);
        topspin = 22;
      } else {
        flightTime = Math.max(0.4, 0.48 / Math.min(1.16, speed * 0.92));
      }
    } else {
      if (isMistimed && !forceOut) {
        flightTime = 1.04;
        targetZ = -(6.2 + Math.random() * 2.2);
        topspin = 6;
      } else if (usePartner) {
        flightTime = isPower ? 0.56 : 0.68;
        targetZ = -(5.6 + Math.random() * 3.4);
        topspin = 12;
      } else if (shotType === "LOB") {
        flightTime = 1.32;
        targetZ = -(9 + Math.random() * 2);
        topspin = 4;
      } else if (shotType === "SLICE") {
        flightTime = 0.98;
        targetZ = -(6.8 + Math.random() * 2.6);
        topspin = -6.5;
        sidespin = -playerSideSign * 11;
      } else if (shotType === "FLAT" || isPower) {
        flightTime = Math.max(0.58, 0.72 / Math.min(1.2, speed * 0.94));
        targetZ = -(9 + Math.random() * 2.2);
        topspin = 21;
      } else {
        flightTime = Math.max(0.68, 0.84 / Math.min(1.16, speed * 0.92));
      }
    }

    const rallyPace = Math.max(0.84, 1 - Math.min(8, this.ball.rallyStrokeCount) * 0.015);
    flightTime *= rallyPace;

    const contactPos = this.ball.pos.clone();
    contactPos.y = Math.max(isTT ? 0.88 : 0.78, Math.min(1.92, contactPos.y));
    this.ball.pos.copy(contactPos);

    this._launchBallToTarget(
      contactPos,
      new THREE.Vector3(targetX, this._getSurfaceY(), targetZ),
      flightTime,
      { topspin, sidespin, allowNetFault: false }
    );

    this.ball.inPlay = true;
    this.ball.lastHitter = "player";
    this.ball.bounceCountOnCurrentSide = 0;
    this.ball.rallyStrokeCount += 1;
    this.ball.shotType = shotType;
    this.ball.isPowerShot = isPower;
    this.ballTrail.setStyle(shotType, isPower);

    if (this.racketKinematics) {
      this.racketKinematics.triggerImpactRecoil(actor, isPower ? 1.4 : 1);
    }
    if (this.swingVfx) {
      this.swingVfx.onRacketContact({
        actor,
        ball: this.ball,
        contactPos,
        shotType: isSmash ? "SMASH" : shotType,
        isPower,
        isServe: false,
        timingQuality: grade,
        speed: this.ball.vel.length(),
      });
    }
    if (this.facialFX) {
      this.facialFX.setExpression(actor, isPower ? "effort_shout" : "focused_squint", 0.55);
    }
    if (isPower) {
      this.cameraTrauma = 0.26;
      this._spawnStarBurst(contactPos, 11);
    }
    if (this.audioEngine) {
      this.audioEngine.playRacketHit(
        shotType === "FLAT" || isSmash ? "smash" : shotType.toLowerCase(),
        grade === "PERFECT" ? "perfect" : "good"
      );
      if (actor.swingType === "smash" && !this.autoPlayMode) {
        this.audioEngine.playVoiceCallout("smash");
      }
    }

    const kmh = Math.round(this.ball.vel.length() * 6.8);
    const sideLabel = isSmash ? "SMASH" : isBackhand ? "BACKHAND" : "FOREHAND";
    const shotLabel = usePartner
      ? "NET VOLLEY"
      : isMistimed
      ? "DEFENSIVE"
      : grade === "EARLY"
      ? `${sideLabel} CROSS`
      : grade === "LATE"
      ? `${sideLabel} LINE`
      : `${sideLabel} ${shotType}`;

    if (!this.autoPlayMode) {
      const screenPos = this._projectToScreen(
        actor.pos.clone().add(new THREE.Vector3(0, 2.35, 0))
      );
      this.hud.showTimingPopup({
        grade: `${grade} • ${shotLabel}!`,
        detail: `${kmh} KM/H`,
        screenPos,
      });
      if (this.motionController && this.motionController.triggerHapticFeedback) {
        this.motionController.triggerHapticFeedback({
          role: "p1",
          kind: isMistimed ? "fault" : "hit",
          grade: `${grade} • ${shotLabel}`,
          shotType: isSmash ? "SMASH" : shotType,
          speedKmh: kmh,
          intensity: isPower ? 1.45 : isMistimed ? 0.75 : 1.1,
        });
      }
    }

    this.hud.updateTimingGauge({
      cursorNormalized: gaugeNorm,
      modeTitle: `${grade} (${shotLabel})`,
      speedText: `${kmh} KM/H`,
    });

    const homeZ = this._getHomeZ();
    this.player.targetPos.set(
      THREE.MathUtils.clamp(-targetX * 0.22, -1.6, 1.6),
      0,
      homeZ - 0.15
    );
    if (!isTT) {
      this.playerPartner.targetPos.set(
        THREE.MathUtils.clamp(targetX * 0.35 + (this.score.deuceSide ? -1.4 : 1.4), -2.8, 2.8),
        0,
        5.1
      );
    }
    this._predictBallIntercept(this.opponent);
    return true;
  }

  _attemptP2RallyStrike(evt = {}) {
    if (this.ball.lastHitter === "opponent") return false;
    const isTT = this._isTableTennis();

    const dzOpp = this.opponent.pos.z - this.ball.pos.z;
    const dxOpp = Math.abs(this.ball.pos.x - this.opponent.pos.x);
    const distOpp = Math.hypot(dxOpp, dzOpp);

    const dzPartner = this.opponentPartner.pos.z - this.ball.pos.z;
    const dxPartner = Math.abs(this.ball.pos.x - this.opponentPartner.pos.x);
    const distPartner = Math.hypot(dxPartner, dzPartner);

    const usePartner =
      !isTT &&
      this.ball.pos.z < -0.3 &&
      this.ball.pos.z >= -7.6 &&
      distPartner <= 3.95 &&
      distPartner < distOpp;

    const actor = usePartner ? this.opponentPartner : this.opponent;
    const dz = usePartner ? dzPartner : dzOpp;
    const dist = usePartner ? distPartner : distOpp;

    if (actor.swingCooldown > 0) return false;

    const speed = THREE.MathUtils.clamp(Number(evt.speed || 1.18), 0.8, 1.68);
    if (evt.shotType) {
      const upper = String(evt.shotType).toUpperCase();
      this.p2SelectedShotType = upper === "SMASH" || upper === "POWER" ? "FLAT" : upper;
    }

    const isBackhand =
      evt.side === "backhand"
        ? true
        : evt.side === "forehand"
        ? false
        : Number(evt.dirX || 0) > 0.14
        ? true
        : Number(evt.dirX || 0) < -0.14
        ? false
        : this.ball.pos.x > actor.pos.x + 0.04 || this.ball.targetLanding.x > 0.12;

    const shotType = this.p2SelectedShotType || "TOPSPIN";
    const isSmash =
      evt.side === "overhead" ||
      ((shotType === "FLAT" || evt.shotType === "smash") && this.ball.pos.y > 1.5) ||
      this.ball.pos.y > 1.78;

    actor.swingType = isSmash ? "smash" : isBackhand ? "backhand" : "forehand";
    actor.swingDuration = 0.36;
    actor.swingTimer = 0.36;
    actor.arcVisibleTimer = 0.36;
    if (actor.swingArcMesh) actor.swingArcMesh.visible = false;

    if (this.racketKinematics) {
      const sLower = String(evt.shotType || shotType || "topspin").toLowerCase();
      const kShot = isSmash || sLower === "power" ? "smash" : sLower;
      this.racketKinematics.triggerSwing(actor, {
        shotType: kShot,
        side: isSmash ? "overhead" : isBackhand ? "backhand" : "forehand",
        speed,
        timing: "sweet",
        dirX: Number(evt.dirX || 0),
      });
    }

    if (this.audioEngine) this.audioEngine.playSwingWhoosh(speed);

    const maxReach = isTT ? 3.85 : usePartner ? 4.05 : 4.85;
    if (dist > maxReach) {
      if (dz > 1.25) {
        actor.swingCooldown = 0.16;
        if (this.motionController && this.motionController.triggerHapticFeedback) {
          this.motionController.triggerHapticFeedback({
            role: "p2",
            kind: "whiff",
            grade: "TOO LATE! • WHIFF",
            shotType,
            speedKmh: 0,
            intensity: 0.65,
          });
        }
      }
      return false;
    }

    let grade = "PERFECT";
    if (evt.sweetSpotAssisted && dz >= -1.85 && dz <= 0.78) {
      grade = "PERFECT";
    } else if (dz < -1.45 || (evt.dirX && evt.dirX < -0.52)) {
      grade = "EARLY";
    } else if (dz > 0.68 || (evt.dirX && evt.dirX > 0.52)) {
      grade = "LATE";
    }

    const isPower = (grade === "PERFECT" || shotType === "FLAT" || isSmash) && speed >= 0.98;
    const oppSideSign = actor.pos.x >= 0 ? 1 : -1;
    const aimSteer = THREE.MathUtils.clamp(Number(evt.dirX || 0), -1, 1);
    const maxW = this._getMaxHalfWidthX();
    const lateralSpread = isTT ? 1.25 : 2.25;

    let targetX = 0;
    if (grade === "EARLY") {
      targetX = -oppSideSign * (lateralSpread + Math.random() * 0.65) - aimSteer * 0.75;
    } else if (grade === "LATE") {
      targetX = oppSideSign * (lateralSpread + Math.random() * 0.65) - aimSteer * 0.75;
    } else {
      const openSign = this.player.pos.x >= 0 ? -1 : 1;
      targetX =
        Math.abs(aimSteer) > 0.22
          ? -aimSteer * (lateralSpread + 0.35 + Math.random() * 0.55)
          : openSign * (lateralSpread + Math.random() * 0.75);
    }
    targetX = THREE.MathUtils.clamp(targetX, -maxW + 0.28, maxW - 0.28);

    let targetZ = isTT ? 2.15 + Math.random() * 1.55 : 8 + Math.random() * 2.6;
    let flightTime = isTT ? (isPower ? 0.38 : 0.48) : isPower ? 0.72 : 0.86;
    let topspin = isPower ? 20 : 15;
    let sidespin = 0;

    if (!isTT) {
      if (usePartner) {
        flightTime = isPower ? 0.58 : 0.7;
        targetZ = 5.6 + Math.random() * 3.2;
      } else if (shotType === "LOB") {
        flightTime = 1.3;
        targetZ = 9 + Math.random() * 2;
        topspin = 4;
      } else if (shotType === "SLICE") {
        flightTime = 0.98;
        targetZ = 6.8 + Math.random() * 2.5;
        topspin = -6;
        sidespin = oppSideSign * 10;
      }
    }

    const contactPos = this.ball.pos.clone();
    contactPos.y = Math.max(isTT ? 0.88 : 0.78, Math.min(1.92, contactPos.y));
    this.ball.pos.copy(contactPos);

    this._launchBallToTarget(
      contactPos,
      new THREE.Vector3(targetX, this._getSurfaceY(), targetZ),
      flightTime,
      { topspin, sidespin, allowNetFault: false }
    );

    this.ball.inPlay = true;
    this.ball.lastHitter = "opponent";
    this.ball.bounceCountOnCurrentSide = 0;
    this.ball.rallyStrokeCount += 1;
    this.ball.shotType = shotType;
    this.ball.isPowerShot = isPower;
    this.ballTrail.setStyle(shotType, isPower);

    if (this.racketKinematics) {
      this.racketKinematics.triggerImpactRecoil(actor, isPower ? 1.4 : 1);
    }
    if (this.swingVfx) {
      this.swingVfx.onRacketContact({
        actor,
        ball: this.ball,
        contactPos,
        shotType: isSmash ? "SMASH" : shotType,
        isPower,
        isServe: false,
        timingQuality: grade,
        speed: this.ball.vel.length(),
      });
    }
    if (this.facialFX) {
      this.facialFX.setExpression(actor, isPower ? "effort_shout" : "focused_squint", 0.55);
    }
    if (isPower) {
      this.cameraTrauma = 0.24;
      this._spawnStarBurst(contactPos, 10);
    }
    if (this.audioEngine) {
      this.audioEngine.playRacketHit(
        shotType === "FLAT" || isSmash ? "smash" : shotType.toLowerCase(),
        grade === "PERFECT" ? "perfect" : "good"
      );
    }

    const kmh = Math.round(this.ball.vel.length() * 6.8);
    const shotLabel = usePartner
      ? "NET VOLLEY"
      : grade === "EARLY"
      ? "CROSS-COURT"
      : grade === "LATE"
      ? "DOWN THE LINE"
      : `SWEET SPOT ${shotType}`;
    const screenPos = this._projectToScreen(
      actor.pos.clone().add(new THREE.Vector3(0, 2.35, 0))
    );
    this.hud.showTimingPopup({
      grade: `P2 ${grade} • ${shotLabel}!`,
      detail: `${kmh} KM/H`,
      screenPos,
    });
    if (this.motionController && this.motionController.triggerHapticFeedback) {
      this.motionController.triggerHapticFeedback({
        role: "p2",
        kind: "hit",
        grade: `${grade} • ${shotLabel}`,
        shotType: isSmash ? "SMASH" : shotType,
        speedKmh: kmh,
        intensity: isPower ? 1.45 : 1.1,
      });
    }

    const homeZ = this._getHomeZ();
    this.opponent.targetPos.set(
      THREE.MathUtils.clamp(-targetX * 0.22, -1.6, 1.6),
      0,
      -homeZ + 0.25
    );
    this._predictBallIntercept(this.player);
    return true;
  }

  _executeOpponentReturn(actor = this.opponent) {
    const isTT = this._isTableTennis();
    const isPartner = actor === this.opponentPartner;
    const isCasual = this.matchConfig.difficulty !== "pro";
    const dx = Math.abs(this.ball.pos.x - actor.pos.x);
    const isPowerIncoming = !!this.ball.isPowerShot;
    const isStretched =
      dx > (isCasual ? 1.08 : 1.55) || (isPowerIncoming && dx > (isCasual ? 0.75 : 1.25));
    const isBackhand = this.ball.pos.x > actor.pos.x + 0.05;

    actor.swingType = isBackhand ? "backhand" : "forehand";
    actor.swingDuration = 0.36;
    actor.swingTimer = 0.36;
    actor.arcVisibleTimer = this.autoPlayMode ? 0.85 : 0.36;
    if (actor.swingArcMesh) actor.swingArcMesh.visible = false;

    const maxW = this._getMaxHalfWidthX();
    const aimSign = this.player.pos.x >= 0 ? -1 : 1;
    const spread = isTT
      ? 0.55 + Math.random() * 1.15
      : isCasual
      ? 0.85 + Math.random() * 1.15
      : 1.25 + Math.random() * 1.75;

    let targetX = THREE.MathUtils.clamp(aimSign * spread, -maxW + 0.38, maxW - 0.38);
    let targetZ = isTT
      ? 2.1 + Math.random() * 1.55
      : isCasual
      ? 6.4 + Math.random() * 2.4
      : 7.4 + Math.random() * 3;
    let shotType = "TOPSPIN";
    let flightTime = isTT ? (isCasual ? 0.54 : 0.44) : isCasual ? 1.14 : 0.88;
    let allowNetFault = false;

    if (this.autoPlayMode && !this.userHasInteracted) {
      shotType = "TOPSPIN";
      flightTime = isTT ? 0.48 : 0.84;
    } else if (isStretched && this.ball.rallyStrokeCount >= 2) {
      const errChance = isCasual ? (dx > 1.45 || isPowerIncoming ? 0.42 : 0.28) : dx > 1.92 ? 0.24 : 0.14;
      if (Math.random() < errChance) {
        if (Math.random() < 0.48) {
          allowNetFault = true;
          targetZ = isTT ? 0.6 : 1.2;
          flightTime = isTT ? 0.44 : 0.76;
        } else {
          targetX = (Math.random() < 0.5 ? 1 : -1) * (maxW + 0.45 + Math.random() * 0.4);
          targetZ = isTT ? 3.8 + Math.random() * 1.2 : 9.5 + Math.random() * 2.8;
          flightTime = isTT ? 0.48 : 0.88;
        }
      } else {
        shotType = dx > 1.35 || isPowerIncoming ? "LOB" : "SLICE";
        targetX = THREE.MathUtils.clamp((Math.random() - 0.5) * 2.0, -maxW + 0.6, maxW - 0.6);
        targetZ = isTT ? 2.2 + Math.random() * 1.3 : 5.6 + Math.random() * 2.2;
        flightTime = isTT ? 0.62 : shotType === "LOB" ? 1.36 : 1.18;
      }
    } else if (isPartner) {
      shotType = "SLICE";
      targetZ = 5.8 + Math.random() * 2.6;
      flightTime = isCasual ? 0.96 : 0.76;
    } else {
      const cycle = ["TOPSPIN", "TOPSPIN", "SLICE", "TOPSPIN", "LOB"];
      shotType = cycle[this.ball.rallyStrokeCount % cycle.length];
      if (isTT) {
        flightTime = shotType === "LOB" ? 0.64 : shotType === "SLICE" ? 0.54 : isCasual ? 0.52 : 0.42;
      } else {
        flightTime =
          shotType === "LOB"
            ? isCasual
              ? 1.36
              : 1.24
            : shotType === "SLICE"
            ? isCasual
              ? 1.18
              : 0.96
            : isCasual
            ? 1.1
            : 0.86;
      }
    }

    const contactPos = this.ball.pos.clone();
    contactPos.y = Math.max(isTT ? 0.88 : 0.82, Math.min(1.68, contactPos.y));
    this.ball.pos.copy(contactPos);

    this._launchBallToTarget(
      contactPos,
      new THREE.Vector3(targetX, this._getSurfaceY(), targetZ),
      flightTime,
      {
        topspin: shotType === "SLICE" ? -5 : shotType === "LOB" ? 5 : 13,
        sidespin: 0,
        allowNetFault,
      }
    );

    this.ball.inPlay = true;
    this.ball.lastHitter = "opponent";
    this.ball.bounceCountOnCurrentSide = 0;
    this.ball.rallyStrokeCount += 1;
    this.ball.shotType = shotType;
    this.ball.isPowerShot = false;
    this.ballTrail.setStyle(shotType, false);

    if (this.racketKinematics) {
      this.racketKinematics.triggerSwing(actor, {
        shotType: shotType.toLowerCase(),
        side: isBackhand ? "backhand" : "forehand",
        speed: 1.15,
        timing: "sweet",
      });
      this.racketKinematics.triggerImpactRecoil(actor, 0.95);
    }
    if (this.swingVfx) {
      this.swingVfx.onRacketContact({
        actor,
        ball: this.ball,
        contactPos,
        shotType,
        isPower: false,
        isServe: false,
        timingQuality: "GOOD",
        speed: this.ball.vel.length(),
      });
    }
    if (this.facialFX) {
      this.facialFX.setExpression(actor, isStretched ? "wide_eyed_panic" : "effort_shout", 0.65);
      if (isStretched) this.facialFX.spawnSweatDrops(actor, 4);
    }
    if (this.audioEngine) {
      this.audioEngine.playSwingWhoosh(1);
      this.audioEngine.playRacketHit(shotType.toLowerCase(), "good");
    }

    const homeZ = this._getHomeZ();
    this.opponent.targetPos.set(
      THREE.MathUtils.clamp(-targetX * 0.25, -1.6, 1.6),
      0,
      -homeZ + 0.35
    );
    this._predictBallIntercept(this.player);
  }

  _launchBallToTarget(
    startPos,
    targetPos,
    flightTime,
    { topspin = 14, sidespin = 0, allowNetFault = false } = {}
  ) {
    const T = Math.max(0.32, flightTime);
    const dx = targetPos.x - startPos.x;
    const dz = targetPos.z - startPos.z;
    const landingY = this._getSurfaceY() + 0.075;
    const dy = landingY - startPos.y;
    const effGrav = PHYSICS.GRAVITY + topspin * 0.14;

    const vx = dx / T - 0.5 * (sidespin * 0.12) * T;
    const vz = dz / T;
    const vy = (dy + 0.5 * effGrav * T * T) / T;

    this.ball.vel.set(vx, vy, vz);
    this.ball.spin.set(topspin, sidespin, 0);
    this.ball.targetLanding.copy(targetPos);

    const netTopY = this._getNetHeight();
    const isTT = this._isTableTennis();
    const tNet = Math.abs(startPos.z) / Math.max(1, Math.abs(vz));
    if (tNet > 0 && tNet < T) {
      const yAtNet = startPos.y + vy * tNet - 0.5 * effGrav * tNet * tNet;
      if (allowNetFault) {
        const dv = (netTopY - 0.08 - yAtNet) / tNet;
        this.ball.vel.y += dv;
      } else {
        const minClearance = netTopY + (isTT ? 0.16 : 0.34);
        if (yAtNet < minClearance) {
          const dv = (minClearance - yAtNet) / tNet;
          this.ball.vel.y += dv;
        }
      }
    }
  }

  _predictBallIntercept(actor) {
    const isTT = this._isTableTennis();
    const landing = this.ball.targetLanding;
    if (isTT) {
      const zBack = actor.sideSign > 0 ? TT.HOME_Z : -TT.HOME_Z;
      const offsetX = landing.x < -0.08 ? 0.25 : -0.25;
      const tx = THREE.MathUtils.clamp(
        landing.x + offsetX,
        -TT.HALF_WIDTH_X - 0.25,
        TT.HALF_WIDTH_X + 0.25
      );
      actor.targetPos.set(tx, 0, zBack);
      return;
    }

    const tz = THREE.MathUtils.clamp(
      landing.z + actor.sideSign * 2.15,
      actor.sideSign > 0 ? 3.2 : -13.6,
      actor.sideSign > 0 ? 13.4 : -3.2
    );
    const offsetX = landing.x < -0.12 ? 0.38 : -0.38;
    const tx = THREE.MathUtils.clamp(
      landing.x + offsetX,
      -COURT.DOUBLES_X + 0.4,
      COURT.DOUBLES_X - 0.4
    );
    actor.targetPos.set(tx, 0, tz);

    if (actor === this.player && this.playerPartner) {
      if (
        landing.z > 0 &&
        landing.z < 6.6 &&
        Math.abs(landing.x - this.playerPartner.pos.x) < 2.9
      ) {
        this.playerPartner.targetPos.set(
          THREE.MathUtils.clamp(landing.x, -COURT.SINGLES_X + 0.4, COURT.SINGLES_X - 0.4),
          0,
          THREE.MathUtils.clamp(landing.z + 0.85, 2.8, 6.2)
        );
      } else {
        this.playerPartner.targetPos.set(
          THREE.MathUtils.clamp(
            landing.x * 0.42 + (this.score.deuceSide ? -1.35 : 1.35),
            -2.9,
            2.9
          ),
          0,
          5.1
        );
      }
    } else if (actor === this.opponent && this.opponentPartner) {
      this.opponentPartner.targetPos.set(
        THREE.MathUtils.clamp(
          landing.x * 0.45 + (this.score.deuceSide ? 1.35 : -1.35),
          -2.9,
          2.9
        ),
        0,
        -5.1
      );
    }
  }

  update(dt) {
    this.elapsedTime += dt;
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.4);

    const effDt = this.swingVfx ? this.swingVfx.consumeHitStop(dt) : dt;
    const timeScale = this.phase === "REPLAY" ? 0.38 : 1;

    this.physicsAccumulator += effDt * timeScale;
    while (this.physicsAccumulator >= PHYSICS.FIXED_DT) {
      this._stepPhysics(PHYSICS.FIXED_DT);
      this.physicsAccumulator -= PHYSICS.FIXED_DT;
    }

    if (
      this.isMultiplayer &&
      this.roomId &&
      this.roomId !== "default" &&
      this.playerRole === "p1" &&
      this.elapsedTime - this.lastSyncSentAt >= 0.045
    ) {
      this.lastSyncSentAt = this.elapsedTime;
      this._broadcastMultiplayerSnapshot();
    }

    this._updateMiiAnimation(this.player, dt);
    this._updateMiiAnimation(this.playerPartner, dt);
    this._updateMiiAnimation(this.opponent, dt);
    this._updateMiiAnimation(this.opponentPartner, dt);
    this._updateCrowdAnimation(dt);

    if (this.swingVfx) {
      this.swingVfx.update(dt, {
        actors: [this.player, this.playerPartner, this.opponent, this.opponentPartner],
        ball: this.ball,
        camera: this.camera,
      });
      if (this.phase === "SHOWCASE") {
        const m = this.showcaseModeName || "showcase_topspin";
        if (m === "showcase_slice" || m === "showcase_backhand") {
          this.swingVfx.seedActorSwingArc(this.player, {
            shotType: "SLICE",
            isPower: false,
            whipSpeed: 26,
            swingType: "backhand",
          });
        } else if (m === "showcase_smash") {
          this.swingVfx.seedActorSwingArc(this.player, {
            shotType: "SMASH",
            isPower: true,
            whipSpeed: 34,
            swingType: "smash",
          });
        } else if (m === "showcase_topspin") {
          this.swingVfx.seedActorSwingArc(this.player, {
            shotType: "TOPSPIN",
            isPower: true,
            whipSpeed: 29,
            swingType: "forehand",
          });
        }
      } else if (this.phase === "REPLAY" && this.persistentStateLock && !this.userHasInteracted) {
        this.swingVfx.seedActorSwingArc(this.player, {
          shotType: "TOPSPIN",
          isPower: true,
          whipSpeed: 28,
          swingType: "forehand",
        });
        this.swingVfx.seedActorSwingArc(this.opponent, {
          shotType: "SLICE",
          isPower: false,
          whipSpeed: 25,
          swingType: "forehand",
        });
      } else if (this.phase === "RALLY" && this.autoPlayMode && !this.userHasInteracted) {
        this.swingVfx.seedActorSwingArc(this.player, {
          shotType: "TOPSPIN",
          isPower: true,
          whipSpeed: 28,
          swingType: "forehand",
        });
      }
    }

    this._updateEffects(dt);
    this._updateCameraRig(dt);
    this._updateProjectedHUD();
  }

  _stepPhysics(dt) {
    this.phaseTimer += dt;
    if (this.player.swingCooldown > 0)
      this.player.swingCooldown = Math.max(0, this.player.swingCooldown - dt);
    if (this.playerPartner.swingCooldown > 0)
      this.playerPartner.swingCooldown = Math.max(0, this.playerPartner.swingCooldown - dt);
    if (this.opponent.swingCooldown > 0)
      this.opponent.swingCooldown = Math.max(0, this.opponent.swingCooldown - dt);
    if (this.opponentPartner.swingCooldown > 0)
      this.opponentPartner.swingCooldown = Math.max(0, this.opponentPartner.swingCooldown - dt);

    if (this.phase === "SHOWCASE") {
      if (this.phaseTimer >= 0.34) {
        this.phaseTimer = 0;
        this._refreshShowcasePose();
      }
      return;
    }

    if (this.phase === "REPLAY") {
      if (this.persistentStateLock && !this.userHasInteracted) {
        const wave = 0.5 + 0.5 * Math.sin(this.elapsedTime * 2.2);
        const sPt = new THREE.Vector3(-1.12, 1.22, -1.08);
        const ePt = new THREE.Vector3(
          -0.18 + wave * 0.22,
          1.32 + wave * 0.08,
          -0.05 + wave * 0.22
        );
        this.ball.pos.copy(ePt);
        this.ballTrail.seedArc(sPt, ePt, 0.24);
        return;
      }
      this.ball.pos.addScaledVector(this.ball.vel, dt);
      this.ball.vel.y -= PHYSICS.GRAVITY * 0.65 * dt;
      this.ballTrail.pushPoint(this.ball.pos);
      if (this.phaseTimer > 1.45) {
        this.hud.setReplayMode(false);
        this._setupPointServe({ showBanner: true });
      }
      return;
    }

    if (this.phase === "SERVE_STANCE" && !this.persistentStateLock) {
      if (this.score.server === "opponent" && !this.isMultiplayer && this.phaseTimer > 1.25) {
        this._startServeToss(this.opponent);
      } else if (this.autoPlayMode && this.score.server === "player" && this.phaseTimer > 1.4) {
        this._startServeToss(this.player);
      }
    }

    if (this.phase === "SERVE_TOSS") {
      this.ball.pos.addScaledVector(this.ball.vel, dt);
      this.ball.vel.y -= PHYSICS.GRAVITY * dt;
      const isTT = this._isTableTennis();
      const apexNorm = THREE.MathUtils.clamp((this.ball.pos.y - 1.15) / (3.15 - 1.15), 0, 1);
      this.hud.updateTimingGauge({
        cursorNormalized: apexNorm * 0.52,
        modeTitle: "SERVE APEX TIMING",
        speedText: this.ball.pos.y >= (isTT ? 1.55 : 2.05) ? "SWEET SPOT!" : "RISING...",
      });

      if (
        this.pendingServeSwing &&
        (this.ball.pos.y >= (isTT ? 1.95 : 2.68) || this.ball.vel.y <= 0.35)
      ) {
        const { actor, evt } = this.pendingServeSwing;
        this.pendingServeSwing = null;
        this._executeServeHit(actor, evt);
        return;
      }

      if (
        ((this.score.server === "opponent" && !this.isMultiplayer) || this.autoPlayMode) &&
        this.ball.vel.y <= 0.25 &&
        this.ball.pos.y >= (isTT ? 1.75 : 2.75)
      ) {
        const server = this.score.server === "player" ? this.player : this.opponent;
        this._executeServeHit(server, { timing: "PERFECT" });
        return;
      }

      if (this.ball.pos.y <= 0.95 && this.ball.vel.y < 0) {
        this.phase = "SERVE_STANCE";
        this.phaseTimer = 0;
        this.ball.vel.set(0, 0, 0);
        this.pendingServeSwing = null;
      }
      return;
    }

    if (this.phase === "POINT_OVER") {
      if (this.phaseTimer > 2.05) {
        this._setupPointServe({ showBanner: true });
      }
      return;
    }

    if (this.phase === "RALLY" && this.ball.inPlay) {
      const isTT = this._isTableTennis();
      const homeZ = this._getHomeZ();

      if (this.autoPlayMode && !this.userHasInteracted) {
        const cycle = (this.elapsedTime * (isTT ? 1.15 : 0.85)) % 1;
        const t = 0.42 + 0.34 * Math.sin(cycle * Math.PI * 2);
        const pStart = new THREE.Vector3(isTT ? 0.85 : 1.42, 1.24, homeZ - 0.55);
        const pEnd = new THREE.Vector3(isTT ? -0.85 : -1.35, this._getSurfaceY() + 0.22, -(homeZ - 1.5));
        const cur = new THREE.Vector3().lerpVectors(pStart, pEnd, t);
        cur.y += Math.sin(t * Math.PI) * (isTT ? 0.65 : 1.45);
        this.ball.pos.copy(cur);
        if (this.ball.mesh) this.ball.mesh.rotation.x -= dt * 16;
        this.ballTrail.setStyle("TOPSPIN", false);
        this.ballTrail.seedArc(pStart, cur, (isTT ? 0.42 : 0.78) * t);

        this.player.pos.set(
          (isTT ? 0.85 : 1.35) + Math.sin(this.elapsedTime * 2.2) * 0.18,
          0,
          homeZ - 0.35
        );
        this.player.stridePhase += dt * 4.2;
        this.player.swingType = "forehand";
        this.player.swingTimer = 0.24;
        this.player.arcVisibleTimer = 0.85;
        if (this.player.racketKinematics) {
          this.player.racketKinematics.swingActive = true;
          this.player.racketKinematics.swingShotType = "topspin";
          this.player.racketKinematics.swingSide = "forehand";
          this.player.racketKinematics.swingElapsed = 0.12;
        }
        this.opponent.pos.set(
          (isTT ? -0.85 : -1.35) + Math.cos(this.elapsedTime * 2.2) * 0.35,
          0,
          -(homeZ - 0.55)
        );
        this.opponent.stridePhase += dt * 4.2;
        return;
      }

      const prevZ = this.ball.pos.z;
      const speed = this.ball.vel.length();
      const drag = Math.max(0, 1 - PHYSICS.AIR_DRAG * speed * dt);
      this.ball.vel.multiplyScalar(drag);
      this.ball.vel.y -= (PHYSICS.GRAVITY + this.ball.spin.x * 0.14) * dt;
      this.ball.vel.x += this.ball.spin.y * 0.12 * dt;
      this.ball.pos.addScaledVector(this.ball.vel, dt);

      if (this.ball.mesh) {
        this.ball.mesh.rotation.x += this.ball.vel.z * dt * 1.8;
        this.ball.mesh.rotation.z -= this.ball.vel.x * dt * 1.8;
      }
      this.ballTrail.pushPoint(this.ball.pos);
      if (this.ball.isPowerShot && Math.random() < 0.45) {
        this._spawnStarBurst(this.ball.pos, 1);
      }

      const netTopY = this._getNetHeight();
      if (
        ((prevZ > 0 && this.ball.pos.z <= 0) || (prevZ < 0 && this.ball.pos.z >= 0)) &&
        this.ball.pos.y < netTopY + 0.035
      ) {
        this.ball.vel.z *= -0.25;
        this.ball.vel.x *= 0.45;
        this.ball.vel.y = 1.2;
        if (this.audioEngine) this.audioEngine.playNetCord();
        this._awardPoint(this.ball.lastHitter === "player" ? "opponent" : "player", "Net");
        return;
      }

      const bounceSurfaceY = this._getSurfaceY() + (isTT ? 0.058 : 0.075);

      if (isTT) {
        const overTable =
          Math.abs(this.ball.pos.x) <= TT.HALF_WIDTH_X + 0.14 &&
          Math.abs(this.ball.pos.z) <= TT.HALF_LENGTH_Z + 0.18;

        if (overTable && this.ball.pos.y <= bounceSurfaceY && this.ball.vel.y < 0) {
          const vyMag = Math.abs(this.ball.vel.y);
          this.ball.pos.y = bounceSurfaceY;
          this.ball.vel.y = -this.ball.vel.y * 0.84;
          this.ball.vel.x *= 0.89;
          this.ball.vel.z *= 0.89;
          this._spawnBounceRing(this.ball.pos.x, this.ball.pos.z);
          if (this.audioEngine) this.audioEngine.playBallBounce(Math.min(1.2, vyMag / 4.2));

          const onPlayerHalf = this.ball.pos.z > 0;
          const playerHitLast = this.ball.lastHitter === "player";
          if ((playerHitLast && onPlayerHalf) || (!playerHitLast && !onPlayerHalf)) {
            this._awardPoint(playerHitLast ? "opponent" : "player", "Out");
            return;
          }
          this.ball.bounceCountOnCurrentSide += 1;
          if (this.ball.bounceCountOnCurrentSide >= 2) {
            this._awardPoint(this.ball.lastHitter, "Nice Shot!");
            return;
          }
        } else if (this.ball.pos.y <= 0.08 && this.ball.vel.y < 0) {
          // Ball hit the floor off the table
          const playerHitLast = this.ball.lastHitter === "player";
          if (this.ball.bounceCountOnCurrentSide === 0) {
            this._awardPoint(playerHitLast ? "opponent" : "player", "Out");
          } else {
            this._awardPoint(this.ball.lastHitter, "Nice Shot!");
          }
          return;
        }
      } else if (this.ball.pos.y <= bounceSurfaceY && this.ball.vel.y < 0) {
        const vyMag = Math.abs(this.ball.vel.y);
        this.ball.pos.y = bounceSurfaceY;
        this.ball.vel.y = -this.ball.vel.y * PHYSICS.BOUNCE_RESTITUTION;
        this.ball.vel.x *= PHYSICS.SURFACE_FRICTION;
        this.ball.vel.z *= PHYSICS.SURFACE_FRICTION;
        this._spawnBounceRing(this.ball.pos.x, this.ball.pos.z);
        if (this.swingVfx) {
          this.swingVfx.spawnTurfBounce(this.ball.pos.x, this.ball.pos.z, this.ball, vyMag);
        }
        if (this.audioEngine) this.audioEngine.playBallBounce(Math.min(1.2, vyMag / 5));

        const onPlayerHalf = this.ball.pos.z > 0;
        const playerHitLast = this.ball.lastHitter === "player";
        if ((playerHitLast && onPlayerHalf) || (!playerHitLast && !onPlayerHalf)) {
          this._awardPoint(playerHitLast ? "opponent" : "player", "Out");
          return;
        }
        this.ball.bounceCountOnCurrentSide += 1;
        if (this.ball.bounceCountOnCurrentSide === 1) {
          const outWide = Math.abs(this.ball.pos.x) > COURT.SINGLES_X + 0.22;
          const outLong = Math.abs(this.ball.pos.z) > COURT.BASELINE_Z + 0.28;
          if (outWide || outLong) {
            this._awardPoint(playerHitLast ? "opponent" : "player", "Out");
            return;
          }
        }
        if (this.ball.bounceCountOnCurrentSide >= 2) {
          this._awardPoint(this.ball.lastHitter, "Nice Shot!");
          return;
        }
      }

      this._stepActorFootwork(this.player, dt);
      if (!isTT) this._stepActorFootwork(this.playerPartner, dt);
      this._stepActorFootwork(this.opponent, dt);
      if (!isTT) this._stepActorFootwork(this.opponentPartner, dt);

      const triggerZ = isTT ? 0.65 : 2.0;
      const outBackZ = isTT ? 8.2 : 15.6;

      if (this.ball.lastHitter === "player" && this.ball.pos.z < -triggerZ) {
        if (this.isMultiplayer) {
          const dz = this.opponent.pos.z - this.ball.pos.z;
          const dx = Math.abs(this.ball.pos.x - this.opponent.pos.x);
          if (this.playerRole === "p2") {
            const cNorm = THREE.MathUtils.clamp(0.5 + dz * 0.16, 0.06, 0.94);
            this.hud.updateTimingGauge({
              cursorNormalized: cNorm,
              modeTitle: "P2 SWING TIMING",
              speedText:
                dz >= -1.45 && dz <= 0.68
                  ? "SWEET SPOT!"
                  : dz < -1.45
                  ? "EARLY (CROSS)"
                  : "LATE (LINE)",
            });
          }
          if (this.pendingP2Swing) {
            if (this.elapsedTime > this.pendingP2Swing.expiresAt) {
              this.pendingP2Swing = null;
            } else if (
              dz >= -0.95 &&
              dz <= 0.75 &&
              Math.hypot(dx, dz) <= 4.65 &&
              this.ball.pos.y < 2.35
            ) {
              const evt = this.pendingP2Swing.evt;
              this.pendingP2Swing = null;
              this._attemptP2RallyStrike(evt);
              return;
            }
          }
          if (this.ball.pos.z < -outBackZ) {
            this._awardPoint("player", "Nice Shot!");
            return;
          }
        } else {
          const isCasual = this.matchConfig.difficulty !== "pro";
          const reachX = isCasual ? 1.85 : 2.4;
          const dz = Math.abs(this.ball.pos.z - this.opponent.pos.z);
          const dx = Math.abs(this.ball.pos.x - this.opponent.pos.x);
          if (dz < (isTT ? 1.25 : 1.32) && this.ball.pos.y < 2.05) {
            if (dx <= reachX) {
              this._executeOpponentReturn(this.opponent);
            } else if (dx <= 3.45 && this.opponent.swingTimer <= 0) {
              const side = this.ball.pos.x < this.opponent.pos.x ? "backhand" : "forehand";
              this.opponent.swingType = side;
              this.opponent.swingDuration = 0.36;
              this.opponent.swingTimer = 0.36;
              this.opponent.arcVisibleTimer = 0.32;
              if (this.racketKinematics) {
                this.racketKinematics.triggerSwing(this.opponent, {
                  shotType: "slice",
                  side,
                  speed: 1.2,
                  timing: "late",
                });
              }
            }
          } else if (this.ball.pos.z < -outBackZ) {
            this._awardPoint("player", "Nice Shot!");
            return;
          }
        }
      }

      if (this.ball.lastHitter === "opponent" && this.ball.pos.z > triggerZ) {
        const dz = this.ball.pos.z - this.player.pos.z;
        const dx = Math.abs(this.ball.pos.x - this.player.pos.x);
        if (this.playerRole !== "p2") {
          const cNorm = THREE.MathUtils.clamp(0.5 + dz * 0.16, 0.06, 0.94);
          this.hud.updateTimingGauge({
            cursorNormalized: cNorm,
            modeTitle: isTT ? "PADDLE TIMING" : "SWING TIMING",
            speedText:
              dz >= -1.45 && dz <= 0.68
                ? "SWEET SPOT!"
                : dz < -2.65
                ? "VERY EARLY"
                : dz < -1.45
                ? "EARLY (CROSS)"
                : dz > 1.35
                ? "TOO LATE!"
                : "LATE (LINE)",
          });
        }
        if (this.pendingUserSwing) {
          if (this.elapsedTime > this.pendingUserSwing.expiresAt) {
            this.pendingUserSwing = null;
          } else if (
            (!this.pendingUserSwing.waitForSweetSpot || (dz >= -0.95 && dz <= 0.75)) &&
            Math.hypot(dx, dz) <= 4.65 &&
            this.ball.pos.y < 2.35
          ) {
            const evt = this.pendingUserSwing.evt;
            this.pendingUserSwing = null;
            this._attemptPlayerRallyStrike(evt, false);
            return;
          }
        }
        if (
          this.autoPlayMode &&
          !this.userHasInteracted &&
          Math.abs(dz) < 0.65 &&
          dx < 1.55 &&
          this.ball.pos.y < 1.85
        ) {
          this._attemptPlayerRallyStrike({ timing: "PERFECT" }, true);
        } else if (this.ball.pos.z > outBackZ) {
          this._awardPoint("opponent", this.isMultiplayer ? "Nice Shot!" : "Point");
          return;
        }
      }
    }
  }

  _stepActorFootwork(actor, dt) {
    const isTT = this._isTableTennis();
    const homeZ = this._getHomeZ();
    const maxW = isTT ? TT.HALF_WIDTH_X + 0.55 : COURT.DOUBLES_X - 0.35;

    if (
      this.motionController &&
      (actor === this.player || (actor === this.opponent && this.isMultiplayer))
    ) {
      const dpad =
        actor === this.player
          ? this.motionController.phoneState?.dpad
          : this.motionController.p2PhoneState?.dpad;
      if (dpad) {
        const dx = Number(dpad.x) || 0;
        const dy = Number(dpad.y) || 0;
        if (!isTT && (dpad.netRush || dy > 0.25)) {
          actor.targetPos.z = actor.sideSign * 4.35;
        }
        if (dy < -0.25) {
          actor.targetPos.z = actor.sideSign * (homeZ - 0.15);
        }
        if (Math.abs(dx) > 0.1) {
          actor.targetPos.x = THREE.MathUtils.clamp(
            actor.pos.x + dx * actor.sideSign * (isTT ? 1.8 : 2.8),
            -maxW,
            maxW
          );
        }
      }
    }

    const diffX = actor.targetPos.x - actor.pos.x;
    const diffZ = actor.targetPos.z - actor.pos.z;
    const dist = Math.hypot(diffX, diffZ);
    if (dist > 0.08) {
      const step = Math.min(dist, actor.maxSpeed * dt);
      const vx = (diffX / dist) * (step / dt);
      const vz = (diffZ / dist) * (step / dt);
      actor.vel.set(vx, 0, vz);
      actor.pos.x += (diffX / dist) * step;
      actor.pos.z += (diffZ / dist) * step;
      actor.stridePhase += step * 4.4;
    } else {
      actor.vel.set(0, 0, 0);
    }
  }

  _awardPoint(winner, reason = "") {
    this.phase = "POINT_OVER";
    this.phaseTimer = 0;
    this.ball.inPlay = false;
    this.cheerEnergy = 1;
    this.pendingUserSwing = null;
    this.pendingP2Swing = null;
    this.pendingServeSwing = null;

    const playerWonPoint = winner === "player";
    if (this.bodyAnimator) {
      this.bodyAnimator.triggerPointReaction(this.player, playerWonPoint ? "win" : "loss");
      this.bodyAnimator.triggerPointReaction(this.playerPartner, playerWonPoint ? "win" : "loss");
      this.bodyAnimator.triggerPointReaction(this.opponent, playerWonPoint ? "loss" : "win");
      this.bodyAnimator.triggerPointReaction(this.opponentPartner, playerWonPoint ? "loss" : "win");
    }
    if (this.facialFX) {
      this.facialFX.setExpression(this.player, playerWonPoint ? "happy_grin" : "shocked_loss", 1.8);
      this.facialFX.setExpression(
        this.playerPartner,
        playerWonPoint ? "happy_grin" : "shocked_loss",
        1.8
      );
      this.facialFX.setExpression(
        this.opponent,
        playerWonPoint ? "shocked_loss" : "happy_grin",
        1.8
      );
      this.facialFX.setExpression(
        this.opponentPartner,
        playerWonPoint ? "shocked_loss" : "happy_grin",
        1.8
      );
      this.facialFX.triggerEmoteBurst(playerWonPoint ? this.player : this.opponent, "win");
    }
    if (this.audioEngine) {
      this.audioEngine.playCrowdReaction(playerWonPoint ? "cheer" : "ooh");
    }
    if (
      this.motionController &&
      this.motionController.triggerHapticFeedback &&
      !this.autoPlayMode
    ) {
      this.motionController.triggerHapticFeedback({
        role: "p1",
        kind: playerWonPoint ? "point_won" : "fault",
        grade: reason || (playerWonPoint ? "POINT WON!" : "POINT LOST"),
        shotType: "TOPSPIN",
        speedKmh: 0,
        intensity: playerWonPoint ? 1.4 : 0.75,
      });
      if (this.isMultiplayer) {
        this.motionController.triggerHapticFeedback({
          role: "p2",
          kind: !playerWonPoint ? "point_won" : "fault",
          grade: reason || (!playerWonPoint ? "POINT WON!" : "POINT LOST"),
          shotType: "TOPSPIN",
          speedKmh: 0,
          intensity: !playerWonPoint ? 1.4 : 0.75,
        });
      }
    }

    if (playerWonPoint) this.score.playerPoints += 1;
    else this.score.opponentPoints += 1;
    this.score.deuceSide = !this.score.deuceSide;

    const pPts = this.score.playerPoints;
    const oPts = this.score.opponentPoints;
    const isTT = this._isTableTennis();
    const targetPts = isTT ? this.matchConfig.pointsToWin || 11 : 4;

    // Table Tennis alternates service every 2 points (or every 1 point at Deuce)
    if (isTT) {
      const totalPts = pPts + oPts;
      const deuceThreshold = Math.max(5, targetPts - 1);
      if (pPts >= deuceThreshold && oPts >= deuceThreshold) {
        this.score.server = this.score.server === "player" ? "opponent" : "player";
      } else if (totalPts % 2 === 0) {
        this.score.server = this.score.server === "player" ? "opponent" : "player";
      }
    }

    if ((pPts >= targetPts || oPts >= targetPts) && Math.abs(pPts - oPts) >= 2) {
      if (pPts > oPts) this.score.playerGames += 1;
      else this.score.opponentGames += 1;

      this.score.playerPoints = 0;
      this.score.opponentPoints = 0;
      this.score.deuceSide = true;
      if (!isTT) {
        this.score.server = this.score.server === "player" ? "opponent" : "player";
      }
      this._syncScoreboardHUD();

      if (
        this.score.playerGames >= this.matchConfig.gamesToWin ||
        this.score.opponentGames >= this.matchConfig.gamesToWin
      ) {
        const pWonMatch = this.score.playerGames > this.score.opponentGames;
        this.phase = "MATCH_OVER";
        const title = this.isMultiplayer
          ? pWonMatch
            ? "P1 WINS!"
            : "P2 WINS!"
          : pWonMatch
          ? "YOU WIN!"
          : "Game!";
        const sub = `Final Games: ${this.score.playerGames} - ${this.score.opponentGames}`;
        this._recordBannerBroadcast(title, "style-gold", sub);
        this.hud.showCenterBanner(title, {
          style: "style-gold",
          subText: sub,
          durationMs: 2600,
        });
        if (this.audioEngine) {
          this.audioEngine.playMusicForState("victory");
          this.audioEngine.announceScore(pWonMatch ? "Game Set and Match" : "Game");
        }
        setTimeout(() => {
          this.hud.showVictoryModal({
            playerWon: this.playerRole === "p2" ? !pWonMatch : pWonMatch,
            playerGames: this.score.playerGames,
            opponentGames: this.score.opponentGames,
          });
        }, 1800);
        return;
      }

      const sub = `Games: ${this.score.playerGames} - ${this.score.opponentGames}`;
      this._recordBannerBroadcast("Game!", "style-gold", sub);
      this.hud.showCenterBanner("Game!", {
        style: "style-gold",
        subText: sub,
        durationMs: 1650,
      });
      if (this.audioEngine) this.audioEngine.announceScore("Game");
      return;
    }

    this._syncScoreboardHUD();
    const { bannerScoreText } = this._formatCurrentScore();
    const style = reason === "Out" || reason === "Net" ? "style-fault" : "style-score";
    this._recordBannerBroadcast(bannerScoreText, style, reason || "");
    this.hud.showCenterBanner(bannerScoreText, {
      style,
      subText: reason || "",
      durationMs: 1450,
    });
    if (this.audioEngine) {
      if (reason === "Out" || reason === "Net" || reason === "Nice Shot!") {
        this.audioEngine.playVoiceCallout(reason, { clearQueue: true });
        this.audioEngine.announceScore(bannerScoreText, { delayMs: 680 });
      } else {
        this.audioEngine.announceScore(bannerScoreText);
      }
    }
  }

  _recordBannerBroadcast(text, style = "style-score", subText = "") {
    this.bannerSeq += 1;
    this.lastBannerBroadcast = { seq: this.bannerSeq, text, style, subText };
  }

  _broadcastMultiplayerSnapshot() {
    const serActor = (a) => ({
      px: Number(a.pos.x.toFixed(3)),
      pz: Number(a.pos.z.toFixed(3)),
      tx: Number(a.targetPos.x.toFixed(3)),
      tz: Number(a.targetPos.z.toFixed(3)),
      st: a.swingType,
      sw: Number(a.swingTimer.toFixed(3)),
      av: Number(a.arcVisibleTimer.toFixed(3)),
    });
    const snapshot = {
      sport: this.sport,
      pointsToWin: this.matchConfig.pointsToWin || 11,
      phase: this.phase,
      phaseTimer: Number(this.phaseTimer.toFixed(3)),
      cameraMode: this.cameraMode,
      score: { ...this.score },
      ball: {
        px: Number(this.ball.pos.x.toFixed(3)),
        py: Number(this.ball.pos.y.toFixed(3)),
        pz: Number(this.ball.pos.z.toFixed(3)),
        vx: Number(this.ball.vel.x.toFixed(3)),
        vy: Number(this.ball.vel.y.toFixed(3)),
        vz: Number(this.ball.vel.z.toFixed(3)),
        inPlay: this.ball.inPlay,
        lastHitter: this.ball.lastHitter,
        shotType: this.ball.shotType,
        isPowerShot: this.ball.isPowerShot,
        rallyStrokeCount: this.ball.rallyStrokeCount,
      },
      actors: {
        player: serActor(this.player),
        playerPartner: serActor(this.playerPartner),
        opponent: serActor(this.opponent),
        opponentPartner: serActor(this.opponentPartner),
      },
      banner: this.lastBannerBroadcast,
    };
    fetch("/api/match/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: this.roomId, snapshot }),
    }).catch(() => {});
  }

  _handleRoomStateUpdate(state = {}) {
    if (!state) return;
    const prevP2 = !!(this.roomStatus.p2Online || this.roomStatus.p2Phone);
    const prevP1 = !!(this.roomStatus.p1Online || this.roomStatus.p1Phone);
    const nextP2 = !!(state.p2Online || state.p2?.connected);
    const nextP1 = !!(state.p1Online || state.p1?.connected);

    if (nextP2 && !prevP2) {
      this.isMultiplayer = true;
      this._applyDifficultyTuning(this.isCouch1v1 ? "couch_1v1" : "1v1");
      if (this.playerRole !== "p2" && this.audioEngine && this.audioEngine.playServeToss) {
        this.audioEngine.playServeToss();
      }
    } else if (nextP1 && !prevP1 && this.playerRole === "p2") {
      if (this.audioEngine && this.audioEngine.playServeToss) {
        this.audioEngine.playServeToss();
      }
    }

    this.roomStatus = {
      roomId: state.roomId || this.roomId,
      hostName: state.hostName || this.roomStatus.hostName || "Player 1",
      guestName: state.guestName || this.roomStatus.guestName || "Player 2",
      p1Online: !!state.p1Online,
      p2Online: !!state.p2Online,
      p1Phone: !!state.p1?.connected,
      p2Phone: !!state.p2?.connected,
      isMultiplayer: !!(this.isMultiplayer || (this.roomId && this.roomId !== "default")),
      inRally: this.phase === "RALLY",
      tunnelUrl: state.tunnelUrl || this.roomStatus.tunnelUrl || "",
      urls: state.urls || this.roomStatus.urls || null,
    };

    if (this.hud && this.hud.updateMultiplayerRoomInfo) {
      this.hud.updateMultiplayerRoomInfo(this.roomStatus);
    }
    if (this.hud && this.hud.updateCalibrationPreview && this.motionController) {
      this.hud.updateCalibrationPreview(
        this.motionController.phoneState,
        this.motionController.p2PhoneState
      );
    }

    if (
      this.playerRole === "p2" &&
      state.snapshot &&
      typeof state.snapshotSeq === "number" &&
      state.snapshotSeq > this.lastAppliedSnapshotSeq
    ) {
      this.lastAppliedSnapshotSeq = state.snapshotSeq;
      const snap = state.snapshot;
      if (snap.sport && snap.sport !== this.sport) {
        this.setSport(snap.sport);
      }
      if (snap.pointsToWin) {
        this.matchConfig.pointsToWin = snap.pointsToWin;
      }
      if (snap.phase && snap.phase !== "TITLE") {
        if (this.phase === "TITLE") this.hud.hideTitleModal();
        this.phase = snap.phase;
        this.cameraMode = snap.cameraMode || this.cameraMode;
      }
      if (snap.score) {
        this.score = { ...this.score, ...snap.score };
        this._syncScoreboardHUD();
      }
      if (snap.ball) {
        this.ball.pos.set(snap.ball.px, snap.ball.py, snap.ball.pz);
        this.ball.vel.set(snap.ball.vx, snap.ball.vy, snap.ball.vz);
        this.ball.inPlay = !!snap.ball.inPlay;
        this.ball.lastHitter = snap.ball.lastHitter || this.ball.lastHitter;
        this.ball.shotType = snap.ball.shotType || "TOPSPIN";
        this.ball.isPowerShot = !!snap.ball.isPowerShot;
        this.ball.rallyStrokeCount = Number(snap.ball.rallyStrokeCount || 0);
        this.ballTrail.setStyle(this.ball.shotType, this.ball.isPowerShot);
      }
      const applyActor = (actor, data) => {
        if (!data) return;
        actor.pos.x = THREE.MathUtils.lerp(actor.pos.x, data.px, 0.65);
        actor.pos.z = THREE.MathUtils.lerp(actor.pos.z, data.pz, 0.65);
        actor.targetPos.set(data.tx, 0, data.tz);
        if (data.sw > 0 && actor.swingTimer <= 0.05) {
          actor.swingType = data.st || "forehand";
          actor.swingTimer = data.sw;
          actor.arcVisibleTimer = data.av || 0.32;
          if (this.racketKinematics) {
            this.racketKinematics.triggerSwing(actor, {
              shotType: (snap.ball?.shotType || "topspin").toLowerCase(),
              side:
                data.st === "backhand"
                  ? "backhand"
                  : data.st === "smash"
                  ? "overhead"
                  : "forehand",
              speed: 1.2,
              timing: "sweet",
            });
          }
        }
      };
      if (snap.actors) {
        applyActor(this.player, snap.actors.player);
        applyActor(this.playerPartner, snap.actors.playerPartner);
        applyActor(this.opponent, snap.actors.opponent);
        applyActor(this.opponentPartner, snap.actors.opponentPartner);
      }
      if (snap.banner && snap.banner.seq && snap.banner.seq !== this.bannerSeq) {
        this.bannerSeq = snap.banner.seq;
        this.hud.showCenterBanner(snap.banner.text, {
          style: snap.banner.style || "style-score",
          subText: snap.banner.subText || "",
          durationMs: 1550,
        });
      }
    }
  }

  _formatCurrentScore() {
    const p = this.score.playerPoints;
    const o = this.score.opponentPoints;

    if (this._isTableTennis()) {
      const target = this.matchConfig.pointsToWin || 11;
      const deuceAt = Math.max(5, target - 1);
      const pText = String(p).padStart(2, "0");
      const oText = String(o).padStart(2, "0");
      if (p >= deuceAt && o >= deuceAt) {
        if (p === o) {
          return {
            playerScoreText: pText,
            opponentScoreText: oText,
            deuceLabel: "Deuce",
            bannerScoreText: `Deuce (${p} - ${o})`,
          };
        }
        const pLead = p > o;
        const adv = pLead ? "Ad In" : "Ad Out";
        return {
          playerScoreText: pText,
          opponentScoreText: oText,
          deuceLabel: null,
          bannerScoreText: `${adv} (${p} - ${o})`,
        };
      }
      return {
        playerScoreText: pText,
        opponentScoreText: oText,
        deuceLabel: null,
        bannerScoreText: `${p} - ${o}`,
      };
    }

    if (p >= 3 && o >= 3) {
      if (p === o) {
        return {
          playerScoreText: "40",
          opponentScoreText: "40",
          deuceLabel: "Deuce",
          bannerScoreText: "Deuce",
        };
      }
      const pLead = p > o;
      const label = pLead ? "Ad In" : "Ad Out";
      return {
        playerScoreText: pLead ? "Ad" : "40",
        opponentScoreText: pLead ? "40" : "Ad",
        deuceLabel: label,
        bannerScoreText: label,
      };
    }
    const pStr = TENNIS_POINTS[Math.min(3, p)];
    const oStr = TENNIS_POINTS[Math.min(3, o)];
    return {
      playerScoreText: pStr,
      opponentScoreText: oStr,
      deuceLabel: null,
      bannerScoreText: `${pStr} - ${oStr}`,
    };
  }

  _getHighStakesPointLabel() {
    const p = this.score.playerPoints;
    const o = this.score.opponentPoints;
    const isTT = this._isTableTennis();
    const minWinPts = isTT ? (this.matchConfig.pointsToWin || 11) - 1 : 3;

    const pGamePt = p >= minWinPts && p - o >= 1;
    const oGamePt = o >= minWinPts && o - p >= 1;
    if (pGamePt) {
      return this.score.playerGames + 1 >= this.matchConfig.gamesToWin
        ? "Match Point"
        : "Game Point";
    }
    if (oGamePt) {
      return this.score.opponentGames + 1 >= this.matchConfig.gamesToWin
        ? "Match Point"
        : !isTT && this.score.server === "player"
        ? "Break Point"
        : "Game Point";
    }
    return null;
  }

  _syncScoreboardHUD() {
    const formatted = this._formatCurrentScore();
    this.hud.updateScoreboard({
      playerScoreText: formatted.playerScoreText,
      opponentScoreText: formatted.opponentScoreText,
      deuceLabel: formatted.deuceLabel,
      playerGames: this.score.playerGames,
      opponentGames: this.score.opponentGames,
      gamesToWin: this.matchConfig.gamesToWin,
    });
  }

  _updateMiiAnimation(actor, dt) {
    if (!actor.model || !actor.root.visible) return;
    if (actor.swingTimer > 0) actor.swingTimer = Math.max(0, actor.swingTimer - dt);
    if (actor.arcVisibleTimer > 0) actor.arcVisibleTimer = Math.max(0, actor.arcVisibleTimer - dt);
    if (actor.swingArcMesh) actor.swingArcMesh.visible = false;

    let liveInput = null;
    if (this.motionController) {
      if (actor === this.player && this.hud && this.hud.updateCalibrationPreview) {
        this.hud.updateCalibrationPreview(
          this.motionController.phoneState,
          this.motionController.p2PhoneState
        );
      }
      const p1State = this.motionController.phoneState;
      const p2State = this.motionController.p2PhoneState;
      if (actor === this.player && p1State?.connected && this.playerRole !== "p2") {
        const o = p1State.orientation || {};
        liveInput = {
          tiltPitch: ((Number(o.pitch) || 0) * Math.PI) / 180,
          tiltRoll: ((Number(o.roll) || 0) * Math.PI) / 180,
          tiltYaw: ((Number(o.yaw) || 0) * Math.PI) / 180,
          accelMag: Number(p1State.accelMag) || 0,
        };
      } else if (
        actor === this.opponent &&
        (p2State?.connected || (this.playerRole === "p2" && p1State?.connected))
      ) {
        const src = p2State?.connected ? p2State : p1State;
        const o = src.orientation || {};
        liveInput = {
          tiltPitch: ((Number(o.pitch) || 0) * Math.PI) / 180,
          tiltRoll: ((Number(o.roll) || 0) * Math.PI) / 180,
          tiltYaw: ((Number(o.yaw) || 0) * Math.PI) / 180,
          accelMag: Number(src.accelMag) || 0,
        };
      }
    }

    if (this.racketKinematics) {
      this.racketKinematics.update(actor, dt, {
        phase: this.phase,
        score: this.score,
        ball: this.ball,
        elapsedTime: this.elapsedTime,
        liveInput,
      });
    }

    if (this.bodyAnimator) {
      this.bodyAnimator.updateMiiBodyAnimation(actor, dt, this);
    } else {
      actor.root.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
    }

    updateCharacterContactShadow(actor, actor.rig?.verticalHopOffset || 0);
    if (this.facialFX) {
      this.facialFX.update(actor, dt, {
        phase: this.phase,
        ball: this.ball,
        score: this.score,
        rallyCount: this.ball.rallyStrokeCount,
        camera: this.camera,
      });
    }
  }

  _updateCrowdAnimation(dt) {
    this.cheerEnergy = Math.max(0.22, this.cheerEnergy - dt * 0.35);
    if (this.crowdScene) {
      const freq = 5.5 + this.cheerEnergy * 4.5;
      const amp = 0.025 + this.cheerEnergy * 0.055;
      this.crowdScene.position.y = Math.abs(Math.sin(this.elapsedTime * freq)) * amp;
    }
  }

  _spawnBounceRing(x, z) {
    const slot = this.bounceRings.find((r) => !r.active) || this.bounceRings[0];
    slot.active = true;
    slot.age = 0;
    const y = this._isTableTennis() ? TT.TABLE_Y + 0.012 : 0.024;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.setScalar(0.6);
    slot.mesh.material.opacity = 0.9;
    slot.mesh.visible = true;
  }

  _spawnStarBurst(pos, count = 8) {
    let spawned = 0;
    for (let i = 0; i < this.starParticles.length && spawned < count; i++) {
      const p = this.starParticles[i];
      if (!p.active) {
        p.active = true;
        p.age = 0;
        p.maxAge = 0.32 + Math.random() * 0.22;
        p.mesh.position.copy(pos);
        p.vel.set(
          (Math.random() - 0.5) * 4.2,
          (Math.random() - 0.2) * 3.8,
          (Math.random() - 0.5) * 4.2
        );
        p.mesh.scale.setScalar(0.9 + Math.random() * 0.6);
        p.mesh.material.opacity = 1;
        p.mesh.visible = true;
        spawned++;
      }
    }
  }

  _updateEffects(dt) {
    if (this.ball.mesh) {
      this.ball.mesh.position.copy(this.ball.pos);
    }
    if (this.ballShadowBlob) {
      this.ballShadowBlob.position.x = this.ball.pos.x;
      this.ballShadowBlob.position.z = this.ball.pos.z;
      const isTT = this._isTableTennis();
      const overTable =
        isTT &&
        Math.abs(this.ball.pos.x) <= TT.HALF_WIDTH_X + 0.1 &&
        Math.abs(this.ball.pos.z) <= TT.HALF_LENGTH_Z + 0.1;
      const shadowY = overTable ? TT.TABLE_Y + 0.01 : 0.018;
      this.ballShadowBlob.position.y = shadowY;
      const relH = Math.max(0, this.ball.pos.y - shadowY);
      const s = THREE.MathUtils.clamp(1.15 - relH * 0.16, 0.45, 1.15);
      this.ballShadowBlob.scale.setScalar(isTT ? s * 0.65 : s);
      this.ballShadowBlob.material.opacity = THREE.MathUtils.clamp(
        0.88 - relH * 0.14,
        0.28,
        0.88
      );
    }

    for (const r of this.bounceRings) {
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / 0.48;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
      } else {
        r.mesh.scale.setScalar(0.6 + t * 2.4);
        r.mesh.material.opacity = (1 - t) * 0.85;
      }
    }

    for (const p of this.starParticles) {
      if (!p.active) continue;
      p.age += dt;
      const t = p.age / p.maxAge;
      if (t >= 1) {
        p.active = false;
        p.mesh.visible = false;
      } else {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.y += dt * 9;
        p.mesh.rotation.z += dt * 7;
        p.mesh.scale.setScalar((1 - t * 0.65) * 1.15);
        p.mesh.material.opacity = 1 - t;
      }
    }

    if (this.cloudRing1) this.cloudRing1.rotation.y += dt * 0.0065;
    if (this.cloudRing2) this.cloudRing2.rotation.y += dt * 0.0035;
    this.ballTrail.updateGeometry(this.camera);
  }

  _computeTargetCameraPose() {
    const mode = this.manualCameraOverride || this.cameraMode;
    const targetPos = new THREE.Vector3();
    const targetLook = new THREE.Vector3();
    const isTT = this._isTableTennis();
    const isCouchWide =
      this.isCouch1v1 ||
      (this.isMultiplayer &&
        this.roomStatus?.p1Phone &&
        this.roomStatus?.p2Phone &&
        this.playerRole !== "p2");

    if (mode === "INTRO_PAN") {
      const a = this.elapsedTime * 0.42;
      targetPos.set(
        Math.sin(a) * (isTT ? 6.2 : 9.5),
        isTT ? 4.2 : 8.2,
        (isTT ? 9.5 : 16.5) + Math.cos(a) * 2.5
      );
      targetLook.set(0, isTT ? 0.95 : 0.8, isTT ? 0 : -1.5);
    } else if (mode === "SHOWCASE_CAM") {
      targetPos.set(1.15, 1.54, isTT ? 2.4 : 7.55);
      targetLook.set(1.15, 1.12, this._getHomeZ() - 0.65);
    } else if (isTT) {
      // Dedicated close-up Table Tennis camera framing the table, net, and Mii paddles
      if (mode === "REPLAY_CAM") {
        targetPos.set(2.15, 1.45, 2.85);
        targetLook.set(-0.65, 0.96, -0.65);
      } else if (this.playerRole === "p2") {
        const ox = this.opponent.pos.x;
        targetPos.set(ox * 0.22, 3.28, -9.2);
        targetLook.set(this.ball.pos.x * 0.14, 0.88, -0.45);
      } else {
        const px = this.player.pos.x;
        targetPos.set(px * 0.22, isCouchWide ? 3.65 : 3.28, isCouchWide ? 9.8 : 9.2);
        targetLook.set(this.ball.pos.x * 0.14, 0.88, 0.45);
      }
    } else if (mode === "SERVE_CAM") {
      if (isCouchWide) {
        const px = this.player.pos.x;
        targetPos.set(px * 0.14, 9.1, 23.6);
        targetLook.set(px * 0.06, 0.25, 0.6);
      } else if (this.playerRole === "p2") {
        const ox = this.opponent.pos.x;
        targetPos.set(ox * 0.16, 7.8, -22.8);
        targetLook.set(ox * 0.08, 0.35, -1.8);
      } else {
        const px = this.player.pos.x;
        targetPos.set(px * 0.16, 7.8, 22.8);
        targetLook.set(px * 0.08, 0.35, 1.8);
      }
    } else if (mode === "REPLAY_CAM") {
      targetPos.set(2.35, 1.48, 4.15);
      targetLook.set(-1.45, 0.95, -1.35);
    } else if (isCouchWide) {
      targetPos.set(this.player.pos.x * 0.12, 9.1, 23.6);
      targetLook.set(this.ball.pos.x * 0.1, 0.25, 0.6);
    } else if (this.playerRole === "p2") {
      targetPos.set(this.opponent.pos.x * 0.16, 7.8, -22.8);
      targetLook.set(this.ball.pos.x * 0.12, 0.35, -1.8);
    } else {
      targetPos.set(this.player.pos.x * 0.16, 7.8, 22.8);
      targetLook.set(this.ball.pos.x * 0.12, 0.35, 1.8);
    }

    return { targetPos, targetLook };
  }

  _snapCameraImmediate() {
    const { targetPos, targetLook } = this._computeTargetCameraPose();
    this.cameraPosSmooth.copy(targetPos);
    this.cameraLookSmooth.copy(targetLook);
    this.camera.position.copy(targetPos);
    this.camera.lookAt(targetLook);
    this.camera.updateMatrixWorld();
    this.ballTrail.updateGeometry(this.camera);
    this._updateProjectedHUD();
  }

  _updateCameraRig(dt) {
    const { targetPos, targetLook } = this._computeTargetCameraPose();
    const alpha = 1 - Math.exp(-6.5 * dt);
    this.cameraPosSmooth.lerp(targetPos, alpha);
    this.cameraLookSmooth.lerp(targetLook, alpha);
    this.camera.position.copy(this.cameraPosSmooth);
    if (this.cameraTrauma > 0.001) {
      const shake = this.cameraTrauma * this.cameraTrauma * 0.26;
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }
    this.camera.lookAt(this.cameraLookSmooth);
  }

  _projectToScreen(worldPos) {
    const p = worldPos.clone().project(this.camera);
    const visible = p.z >= -1 && p.z <= 1;
    const x = (p.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-p.y * 0.5 + 0.5) * window.innerHeight;
    return { x, y, visible };
  }

  _updateProjectedHUD() {
    if (
      (this.phase === "SERVE_STANCE" || this.phase === "SERVE_TOSS") &&
      this.cameraMode !== "REPLAY_CAM"
    ) {
      const serverActor = this.score.server === "player" ? this.player : this.opponent;
      const worldHead = serverActor.pos.clone().add(new THREE.Vector3(0, 2.25, 0));
      const screen = this._projectToScreen(worldHead);
      this.hud.updateServerTag(screen, true);
    } else {
      this.hud.updateServerTag(null, false);
    }
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const engine = new ArgonTennisEngine();
  window.__argonTennis = engine;
  engine.loadAssetsAndStart();
});

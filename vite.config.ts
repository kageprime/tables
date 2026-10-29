import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import QRCode from "qrcode";

function createRacketSlot(role: string) {
  return {
    role,
    seq: 0,
    lastSeenTs: 0,
    connected: false,
    calibrated: false,
    calibrationSeq: 0,
    recenterRequestSeq: 0,
    selectedShotType: "auto",
    orientation: {
      pitch: 0,
      roll: 0,
      yaw: 0,
      accelMag: 0,
      buttonB: false,
      connected: false,
      calibrated: false,
    },
    dpad: {
      x: 0,
      y: 0,
      netRush: false,
      manualMode: false,
    },
    lastSwing: null as any,
    swingHistory: [] as any[],
    feedbackSeq: 0,
    lastFeedback: null as any,
  };
}

function createRoom(
  roomId: string,
  hostName = "Player 1",
  guestName = "Player 2",
  gamesToWin = 2
) {
  return {
    roomId,
    hostName,
    guestName,
    gamesToWin,
    rackets: {
      p1: createRacketSlot("p1"),
      p2: createRacketSlot("p2"),
    },
    stateSeq: 0,
    matchSnapshot: null as any,
    p1DesktopSeenTs: 0,
    p2DesktopSeenTs: 0,
    customTunnelUrl: "",
  };
}

function serializeRacket(slot: any) {
  const now = Date.now();
  const lastSeenMs = slot.lastSeenTs > 0 ? Math.max(0, now - slot.lastSeenTs) : -1;
  const connected = Boolean(slot.connected && lastSeenMs >= 0 && lastSeenMs < 12000);
  return {
    role: slot.role,
    connected,
    calibrated: Boolean(slot.calibrated && connected),
    calibrationSeq: slot.calibrationSeq || 0,
    recenterRequestSeq: slot.recenterRequestSeq || 0,
    selectedShotType: slot.selectedShotType || "auto",
    lastSeenMs,
    orientation: {
      ...slot.orientation,
      connected,
      calibrated: Boolean(slot.calibrated && connected),
    },
    dpad: {
      ...(slot.dpad || { x: 0, y: 0, netRush: false, manualMode: false }),
    },
    lastSwing: slot.lastSwing ? { ...slot.lastSwing } : null,
    lastFeedback: slot.lastFeedback ? { ...slot.lastFeedback } : null,
    swingHistory: slot.swingHistory.slice(-15),
  };
}

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    req.on("data", (c: any) => chunks.push(String(c)));
    req.on("end", () => {
      try {
        const raw = chunks.join("");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res: any, status: number, payload: any) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.end(body);
}

function resolveOrigin(req: any, fallbackUrl: string): string {
  if (fallbackUrl) return fallbackUrl.replace(/\/+$/, "");
  const protoHeader = req.headers?.["x-forwarded-proto"];
  const hostHeader = req.headers?.["x-forwarded-host"] || req.headers?.host;
  if (hostHeader) {
    const proto = protoHeader
      ? String(protoHeader).split(",")[0].trim()
      : String(hostHeader).includes("localhost") || String(hostHeader).includes("127.0.0.1")
      ? "http"
      : "https";
    return `${proto}://${String(hostHeader).split(",")[0].trim()}`;
  }
  return "http://localhost:3000";
}

const assetCache = new Map<string, { contentType: string; body: Buffer }>();
const assetInFlight = new Map<string, Promise<{ contentType: string; body: Buffer }>>();

const mimeForPath = (p: string) =>
  p.endsWith(".glb")
    ? "model/gltf-binary"
    : p.endsWith(".mp3")
    ? "audio/mpeg"
    : p.endsWith(".png")
    ? "image/png"
    : p.endsWith(".wasm")
    ? "application/wasm"
    : p.endsWith(".json")
    ? "application/json; charset=utf-8"
    : "application/octet-stream";

function argonTennisRelayPlugin() {
  const rooms = new Map<string, any>();
  rooms.set("default", createRoom("default"));
  let globalTunnelUrl = "";

  const getOrCreateRoom = (rawRoomId?: string) => {
    const cleaned = (rawRoomId || "default").replace(/[^A-Za-z0-9_-]/g, "").toUpperCase() || "default";
    const key = cleaned === "DEFAULT" ? "default" : cleaned;
    let room = rooms.get(key);
    if (!room) {
      room = createRoom(key);
      rooms.set(key, room);
    }
    return room;
  };

  const attachMiddlewares = (middlewares: any) => {
    middlewares.use(async (req: any, res: any, next: any) => {
      const rawUrl = req.url || "/";
      const parsedUrl = new URL(rawUrl, "http://localhost:3000");
      const pathname = parsedUrl.pathname;

      if (pathname === "/___rPc_sWiTcH___") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end("OK");
        return;
      }

      if (
        pathname.startsWith("/assets/models/") ||
        pathname.startsWith("/assets/audio/") ||
        pathname.startsWith("/assets/textures/") ||
        pathname.startsWith("/assets/mediapipe/")
      ) {
        const targetUrl = `https://www.gstatic.com/aistudio/starter-apps/tennis/${pathname.slice(8)}${parsedUrl.search}`;
        try {
          let entry = assetCache.get(targetUrl);
          if (!entry) {
            let pending = assetInFlight.get(targetUrl);
            if (!pending) {
              pending = fetch(targetUrl)
                .then(async (resp) => {
                  if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
                  const buf = Buffer.from(await resp.arrayBuffer());
                  const item = { contentType: mimeForPath(pathname), body: buf };
                  assetCache.set(targetUrl, item);
                  return item;
                })
                .finally(() => assetInFlight.delete(targetUrl));
              assetInFlight.set(targetUrl, pending);
            }
            entry = await pending;
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", entry.contentType);
          res.setHeader("Content-Length", entry.body.length);
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.end(entry.body);
        } catch {
          res.statusCode = 502;
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end("Upstream asset fetch failed");
        }
        return;
      }

      if (!pathname.startsWith("/api/")) {
        next();
        return;
      }

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.end();
        return;
      }

      if (req.method === "GET" && pathname === "/api/qr") {
        const text = parsedUrl.searchParams.get("text") || resolveOrigin(req, globalTunnelUrl);
        try {
          const svg = await QRCode.toString(text, {
            type: "svg",
            margin: 1,
            width: 240,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
          res.statusCode = 200;
          res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.end(svg);
        } catch {
          res.statusCode = 500;
          res.end("QR generation error");
        }
        return;
      }

      const roomParam = parsedUrl.searchParams.get("room") || "default";
      const roleParam = (parsedUrl.searchParams.get("role") || "p1").toLowerCase();
      const roleKey = roleParam === "p2" || roleParam === "2" || roleParam === "opponent" ? "p2" : "p1";

      if (req.method === "GET" && pathname === "/api/racket/state") {
        const room = getOrCreateRoom(roomParam);
        const origin = resolveOrigin(req, room.customTunnelUrl || globalTunnelUrl);
        const slot = room.rackets[roleKey];
        sendJson(res, 200, {
          ...serializeRacket(slot),
          roomId: room.roomId,
          tunnelUrl: origin,
          matchSnapshot: room.matchSnapshot,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/tunnel/status") {
        const room = getOrCreateRoom(roomParam);
        const origin = resolveOrigin(req, room.customTunnelUrl || globalTunnelUrl);
        const roomQuery = room.roomId !== "default" ? `room=${room.roomId}&` : "";
        sendJson(res, 200, {
          ok: true,
          active: true,
          tunnelUrl: origin,
          companionUrl: `${origin}/companion.html?${roomQuery}role=${roleKey}`,
          joinUrl: `${origin}/?room=${room.roomId}&role=${roleKey}`,
        });
        return;
      }

      if (req.method === "GET" && pathname === "/api/match/state") {
        const room = getOrCreateRoom(roomParam);
        const origin = resolveOrigin(req, room.customTunnelUrl || globalTunnelUrl);
        const touch = parsedUrl.searchParams.get("touch");
        if (touch === "p1" || touch === "p2") {
          if (touch === "p2") room.p2DesktopSeenTs = Date.now();
          else room.p1DesktopSeenTs = Date.now();
        } else if (touch === "1") {
          if (roleKey === "p2") room.p2DesktopSeenTs = Date.now();
          else room.p1DesktopSeenTs = Date.now();
        }
        const now = Date.now();
        const p1 = serializeRacket(room.rackets.p1);
        const p2 = serializeRacket(room.rackets.p2);
        const p1Online = room.p1DesktopSeenTs > 0 && now - room.p1DesktopSeenTs < 8000;
        const p2Online = room.p2DesktopSeenTs > 0 && now - room.p2DesktopSeenTs < 8000;

        sendJson(res, 200, {
          ok: true,
          roomId: room.roomId,
          hostName: room.hostName,
          guestName: room.guestName,
          gamesToWin: room.gamesToWin,
          p1Online,
          p2Online,
          p1DesktopOnline: p1Online,
          p2DesktopOnline: p2Online,
          p1PhoneConnected: p1.connected,
          p2PhoneConnected: p2.connected,
          p1,
          p2,
          rackets: { p1, p2 },
          snapshotSeq: room.stateSeq,
          snapshot: room.matchSnapshot,
          tunnelUrl: origin,
        });
        return;
      }

      if (req.method === "POST") {
        const body = await readJsonBody(req);
        if (pathname === "/api/tunnel/url") {
          const cleanUrl = String(body.tunnelUrl || "").trim().replace(/\/+$/, "");
          if (cleanUrl) globalTunnelUrl = cleanUrl;
          sendJson(res, 200, { ok: true, tunnelUrl: globalTunnelUrl });
          return;
        }

        const targetRoomId = String(body.room || roomParam || "default");
        const targetRoleRaw = String(body.role || roleKey || "p1").toLowerCase();
        const targetRole = targetRoleRaw === "p2" || targetRoleRaw === "2" || targetRoleRaw === "opponent" ? "p2" : "p1";
        const room = getOrCreateRoom(targetRoomId);
        const slot = room.rackets[targetRole];

        if (pathname === "/api/racket/calibrate") {
          slot.lastSeenTs = Date.now();
          slot.connected = true;
          if (body.requestFromDesktop) {
            slot.recenterRequestSeq = (slot.recenterRequestSeq || 0) + 1;
          } else {
            slot.calibrated = true;
            slot.calibrationSeq = (slot.calibrationSeq || 0) + 1;
            slot.orientation.pitch = 0;
            slot.orientation.roll = 0;
            slot.orientation.yaw = 0;
            slot.orientation.calibrated = true;
          }
          sendJson(res, 200, {
            ok: true,
            roomId: room.roomId,
            role: slot.role,
            calibrated: slot.calibrated,
            calibrationSeq: slot.calibrationSeq,
            recenterRequestSeq: slot.recenterRequestSeq,
          });
          return;
        }

        if (pathname === "/api/racket/swing") {
          const now = Date.now();
          slot.seq += 1;
          slot.lastSeenTs = now;
          slot.connected = true;
          if (body.calibrated !== undefined) slot.calibrated = Boolean(body.calibrated);

          const swingEvent = {
            seq: slot.seq,
            role: slot.role,
            type: String(body.type || "swing").toLowerCase() === "toss" ? "toss" : "swing",
            side: body.side || null,
            shotType: String(body.shotType || "topspin").toLowerCase(),
            speed: Number(body.speed ?? 1.15),
            angleX: Number(body.angleX ?? body.dirX ?? 0),
            dirX: Number(body.angleX ?? body.dirX ?? 0),
            dirY: Number(body.dirY ?? -0.45),
            pitch: Number(body.pitch ?? slot.orientation.pitch ?? 0),
            roll: Number(body.roll ?? slot.orientation.roll ?? 0),
            yaw: Number(body.yaw ?? slot.orientation.yaw ?? 0),
            timestamp: Number(body.timestamp ?? now),
            serverTimeMs: now,
            source: String(body.source || "phone"),
          };
          slot.lastSwing = swingEvent;
          slot.swingHistory.push(swingEvent);
          if (slot.swingHistory.length > 50) slot.swingHistory.shift();

          sendJson(res, 200, {
            ok: true,
            roomId: room.roomId,
            role: slot.role,
            swing: swingEvent,
          });
          return;
        }

        if (pathname === "/api/racket/telemetry") {
          slot.lastSeenTs = Date.now();
          slot.connected = Boolean(body.connected ?? true);
          if (body.calibrated !== undefined) {
            slot.calibrated = Boolean(body.calibrated);
          }
          if (body.selectedShotType) {
            slot.selectedShotType = String(body.selectedShotType);
          }
          slot.orientation = {
            pitch: Number(body.pitch ?? slot.orientation.pitch ?? 0),
            roll: Number(body.roll ?? slot.orientation.roll ?? 0),
            yaw: Number(body.yaw ?? slot.orientation.yaw ?? 0),
            accelMag: Number(body.accelMag ?? 0),
            buttonB: Boolean(body.buttonB ?? false),
            connected: slot.connected,
            calibrated: Boolean(slot.calibrated),
          };
          if (body.dpad && typeof body.dpad === "object") {
            slot.dpad = {
              x: Math.max(-1, Math.min(1, Number(body.dpad.x ?? 0))),
              y: Math.max(-1, Math.min(1, Number(body.dpad.y ?? 0))),
              netRush: Boolean(body.dpad.netRush ?? (Number(body.dpad.y ?? 0) < -0.35)),
              manualMode: Boolean(body.dpad.manualMode ?? false),
            };
          }
          sendJson(res, 200, {
            ok: true,
            roomId: room.roomId,
            role: slot.role,
            orientation: slot.orientation,
            dpad: slot.dpad,
            calibrated: slot.calibrated,
            recenterRequestSeq: slot.recenterRequestSeq || 0,
            lastFeedback: slot.lastFeedback,
            matchSnapshot: room.matchSnapshot
              ? {
                  phase: room.matchSnapshot.phase,
                  score: room.matchSnapshot.score,
                  banner: room.matchSnapshot.banner,
                }
              : null,
          });
          return;
        }

        if (pathname === "/api/racket/feedback") {
          slot.feedbackSeq += 1;
          slot.lastFeedback = {
            seq: slot.feedbackSeq,
            role: slot.role,
            kind: String(body.kind || "hit"),
            grade: String(body.grade || "PERFECT"),
            shotType: String(body.shotType || "TOPSPIN"),
            speedKmh: Number(body.speedKmh ?? 160),
            intensity: Number(body.intensity ?? 1),
            serverTimeMs: Date.now(),
          };
          sendJson(res, 200, {
            ok: true,
            roomId: room.roomId,
            feedback: slot.lastFeedback,
          });
          return;
        }

        if (pathname === "/api/match/sync") {
          room.stateSeq += 1;
          room.p1DesktopSeenTs = Date.now();
          const snap = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : body;
          room.matchSnapshot = {
            ...snap,
            seq: room.stateSeq,
            serverTimeMs: Date.now(),
          };
          sendJson(res, 200, {
            ok: true,
            roomId: room.roomId,
            seq: room.stateSeq,
            p1Racket: serializeRacket(room.rackets.p1),
            p2Racket: serializeRacket(room.rackets.p2),
          });
          return;
        }

        if (pathname === "/api/match/create") {
          const newId = "AT-" + Math.random().toString(36).substring(2, 6).toUpperCase();
          const newRoom = createRoom(
            newId,
            String(body.hostName || body.p1Name || "Player 1"),
            String(body.guestName || body.p2Name || "Player 2"),
            Number(body.gamesToWin || 2)
          );
          rooms.set(newId, newRoom);
          const origin = resolveOrigin(req, globalTunnelUrl);
          sendJson(res, 200, {
            ok: true,
            roomId: newId,
            tunnelUrl: origin,
            hostDesktopUrl: `${origin}/?room=${newId}&role=p1`,
            guestDesktopUrl: `${origin}/?room=${newId}&role=p2`,
            p1PhoneUrl: `${origin}/companion.html?room=${newId}&role=p1`,
            p2PhoneUrl: `${origin}/companion.html?room=${newId}&role=p2`,
          });
          return;
        }
      }

      next();
    });
  };

  return {
    name: "argon-tennis-relay",
    configureServer(server: any) {
      attachMiddlewares(server.middlewares);
    },
    configurePreviewServer(server: any) {
      attachMiddlewares(server.middlewares);
    },
  };
}

export default defineConfig(({ mode }) => {
  const _env = loadEnv(mode, ".", "");
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
      hmr: process.env.DISABLE_HMR !== "true",
    },
    plugins: [react(), argonTennisRelayPlugin()],
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, "index.html"),
          companion: path.resolve(__dirname, "companion.html"),
        },
      },
    },
    resolve: {
      alias: {
        "../assets/vendor/GLTFLoader.js": "three/examples/jsm/loaders/GLTFLoader.js",
        "@": path.resolve("."),
      },
    },
  };
});


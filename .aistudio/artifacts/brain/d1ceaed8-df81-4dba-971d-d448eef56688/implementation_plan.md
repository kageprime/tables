# Argon Tennis — Wii U Phone Controller, 3D Calibration & 1v1 Modes

Transform Argon Tennis into a tactile Wii U / Wii MotionPlus arcade experience where any smartphone pairs instantly via QR code or room code to act as a 60Hz 3D motion racket controller with point-at-screen calibration, live 3D racket mirroring, optional D-pad net-rushing, and seamless 1v1 Player vs. CPU, Same-Screen 2-Phone Couch PvP, and Remote Online PvP modes.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions incorporate your confirmed choices from our design deliberation:

- **Confirmed Decision 1 — Hybrid Wii U GamePad Phone Controller**: The mobile companion interface combines 60Hz 3D gyroscope/accelerometer swing sensing with a live interactive 3D mini-racket display, tactile shot-modifier buttons (Topspin, Slice, Lob, Flat/Smash), a dedicated **B-Trigger / Serve Toss** button, and haptic vibration feedback.
- **Confirmed Decision 2 — Point-at-Screen 3D Calibration & Auto-Drift Compensation**: Players point their phone toward the main screen and tap/hold **Calibrate (Zero 3D)** to capture a reference quaternion offset. Both the phone screen and the main stadium HUD render a live 3D preview of the calibrated racket posture, paired with continuous complimentary-filter drift correction between rallies.
- **Confirmed Decision 3 — Unified 1v1 Modes (PvCPU, Couch 2-Phone PvP, Remote Room PvP)**: The match setup modal and controller dock let players choose between **1v1 vs. CPU** (Casual or Pro Matt AI), **Couch 1v1 (Same Screen, 2 Phones)** where Player 1 and Player 2 pair their phones to the same display with split/overhead camera framing, and **Remote 1v1 Room** where each player joins from their own display and phone.
- **Confirmed Decision 4 — Auto-Footwork with Optional D-Pad Override**: Mii characters automatically track and intercept incoming shots like classic Wii Sports, while an ergonomic thumb D-Pad on the phone controller lets players manually charge the net, drop back to the baseline, or shade left/right before contact.

---

## 1. Overview & Core Concept

- **What It Does**: Bridges the main 3D stadium viewport and mobile web browsers into a dual-screen Wii U console experience. Players scan a dynamically generated QR code (or enter a 4-letter Room ID) on their phone to unlock a dedicated controller web app. Swinging, twisting, and tilting the phone drives the Mii's 3D tennis racket in real time with sub-frame spring kinematics, wrist pronation/supination, and sweet-spot impact haptics.
- **Target Audience / Persona**: Solo arcade players wanting authentic motion-controlled rallies against expressive Club/Pro CPU opponents, couch competitors pairing two phones to a single laptop/TV screen, and remote friends playing 1v1 across separate screens.
- **Key Value**: Eliminates uncalibrated sensor drift and static/broken QR placeholders in favor of a genuine, responsive 3D motion control loop with zero-install browser pairing.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Title & Mode Selection Flow**:
   - From the Wii Sports-inspired Title Card, players select their match mode: **Casual AI (1v1)**, **Pro AI (1v1)**, **Couch 1v1 (2 Phones, 1 Screen)**, or **Online 1v1 (2 Screens)**, along with match length (1 Game, Best of 3, Best of 5) and a direct **Pair Phone Controller** button.
2. **Phone Pairing & Sensor Handshake Flow**:
   - Clicking **Phone Controller / 1v1 Setup** opens the Pairing & Calibration Hub displaying live connection badges for **Player 1 Racket** and **Player 2 Racket**, scannable dynamic QR codes bound to the active room and origin URL, and a 1-tap copy link.
   - Opening the link on iOS or Android prompts a clear single-tap **Enable 3D Motion Sensors** button (handling iOS `DeviceOrientationEvent.requestPermission()` and `DeviceMotionEvent.requestPermission()`).
3. **3D Calibration & Live Preview Flow**:
   - Once sensors activate, the phone displays a live 3D racket orientation gizmo and prompts the player: *"Point phone toward the center of the TV/Monitor and tap Calibrate 3D"*.
   - Tapping **Calibrate 3D** records the baseline yaw, pitch, and roll quaternion, zeroes out azimuthal compass drift, flashes a green confirmation badge on both the phone and main screen, and mirrors every wrist twist (forehand/backhand roll, slice bevel, overhead pitch) onto the Mii's racket in real time.
   - Holding the **Calibrate / Recenter** button for 0.4s at any time during a match instantly re-zeroes the neutral forward axis, while subtle low-pass drift compensation automatically nudges yaw back toward neutral when the phone is held still between points.
4. **In-Match Wii U GamePad & Rally Flow**:
   - **Serve**: Flick the phone upward (or press the tactile **Toss Ball** pad) to toss, then swing forward/downward at the apex for a Power Serve.
   - **Rally**: Physical phone swings compute 3D swing plane (`forehand`, `backhand`, `overhead`), face angle (`topspin` closed face, `slice` open face, `lob` upward scoop, `smash` downward snap), and peak angular/linear velocity. Players can also hold a tactile shot-type button on the thumb pad to lock in a specific stroke or use the thumb D-pad to rush the net for volleys.
   - **Haptic & Second-Screen Telemetry**: Upon ball contact, the main court engine sends shot grade (`PERFECT`, `EARLY`, `LATE`), ball speed (`KM/H`), and vibration patterns back to the phone screen, which pulses and displays the rally callout in real time.

### Visual Identity & Theme

- **Aesthetic Direction**: Clean, tactile **Wii Sports Resort / Wii U GamePad** industrial ergonomics—crisp glossy white and sky-cyan shells on the main screen paired with a high-contrast, glare-resistant dark slate controller deck on the phone screen for effortless peripheral thumb reach.
- **Color Palette & Mood**:
  - *Main Stadium HUD*: Sky Cyan (`#25A8F5`), Championship Gold (`#FFEA28`), Turf Green (`#58B828`), and deep translucent obsidian HUD pills (`rgba(16, 20, 26, 0.88)`).
  - *Phone Wii U Controller Deck*: Deep Obsidian Slate (`#0B1017`) canvas (60%), Elevated Graphite Control Pods (`#151E2B`) with subtle hairline borders (30%), and Electric Cyan (`#25A8F5`) / P1 Crimson (`#FF5238`) / P2 Cobalt (`#3B82F6`) / Sweet-Spot Lime (`#DFFF00`) accents (10%).
- **Typography & Hierarchy**:
  - *Display / Arcade Callouts*: Rounded geometric sans (`Nunito` / `Varela Round` / `Plus Jakarta Sans`, bold/black weights) for scores, shot callouts, and modal titles.
  - *Telemetry & Calibration Readouts*: Tabular monospace numerals (`JetBrains Mono` / `tabular-nums`) for live 3D Euler angles (`Pitch`, `Roll`, `Yaw`), swing speed (`KM/H`), and latency (`ms`).
- **Mobile Controller Ergonomics (Thumb-Zone Discipline)**:
  - **Top 20% (Hard Reach)**: Connection status bar, Player Role badge (`P1 RED` / `P2 BLUE`), live match score ticker (`15 - 30`), and **Calibrate 3D** button.
  - **Middle 35% (Visual & Touch Arena)**: Interactive 3D Racket Calibration Viewport + swipe-to-swing touch fallback arena showing real-time racket face tilt, swing vector arrow, and impact grade banners.
  - **Bottom 45% (Natural Thumb Zone)**: Left thumb 4-way **Court Footwork D-Pad** (Net Rush / Baseline / Left / Right + Auto-Run toggle) and Right thumb **Tactile Action Cluster** (large central **B-Trigger Toss / Swing** button surrounded by `Topspin`, `Slice`, `Lob`, and `Smash` quick-lock pads, all $\ge 48 \times 48\text{px}$).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Quaternion Delta Calibration + Auto-Drift Filtering vs. Raw Euler Angles**
  - *Chosen Approach*: Convert browser `DeviceOrientation` (`alpha`, `beta`, `gamma`) into a 3D Quaternion $Q_{\text{raw}}$, store the player's neutral point-at-screen pose as $Q_{\text{ref}}$, and compute the relative rotation $Q_{\text{cal}} = Q_{\text{ref}}^{-1} \cdot Q_{\text{raw}}$. Pair this with a stationary gyro-drift detector that gently slerps yaw bias toward zero when linear acceleration is near 1G rest.
  - *Why*: Raw compass `alpha` (yaw) differs wildly depending on which direction the user's desk or TV faces, and suffers from gimbal lock when pitching the phone vertical during overheads. Relative quaternion calibration guarantees that "pointing at the screen" is always straight down the court ($0^\circ$ yaw, $0^\circ$ pitch, $0^\circ$ roll) regardless of room orientation.
- **Decision 2: High-Frequency HTTP/WebSocket Relay with Local Client Prediction**
  - *Chosen Approach*: Stream orientation and D-pad vectors from the phone at ~30–60Hz while running peak-acceleration swing detection directly on the phone at full sensor rate (60–100Hz), immediately dispatching discrete `swing` / `toss` packets with pre-computed 3D kinematics (`speed`, `dirX`, `dirY`, `calPitch`, `calRoll`, `calYaw`, `side`, `shotType`).
  - *Why*: Detecting the swing apex on the phone avoids network jitter diluting peak acceleration spikes, ensuring crisp, instant racket whips on the main screen.
- **Decision 3: Same-Screen Couch 1v1 vs. Remote 2-Screen 1v1 Camera Modes**
  - *Chosen Approach*: Support both in the match engine. In **Couch 1v1 (Same Screen)**, one browser instance runs the authoritative physics engine while both P1's phone and P2's phone connect to `role=p1` and `role=p2` in the same room, using a slightly higher Broadcast/Elevated camera angle so both near-court (P1) and far-court (P2) players have clear sightlines and dual timing gauges. In **Remote 1v1 (2 Screens)**, P2 opens the desktop URL with `role=p2` and sees the court from their own baseline perspective.
  - *Why*: Lets two friends play immediately in the same living room with two phones and one laptop/TV, while preserving full remote play.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        MOBILE COMPANION CONTROLLER                           │
│                  (/companion.html + CompanionController)                     │
├───────────────────────┬──────────────────────────┬───────────────────────────┤
│ 3D Sensor & Calib     │ Tactile Wii U Deck       │ Live 3D Racket Preview    │
│ • iOS/Android Perms   │ • 4-Way Footwork D-Pad   │ • Canvas 3D Racket Gizmo  │
│ • Q_ref Quaternion    │ • B-Trigger Toss/Swing   │ • Live Score & Shot Grade │
│ • Auto-Drift Filter   │ • Shot Type Lock Pads    │ • Haptic Vibrate Engine   │
└───────────┬───────────┴────────────┬─────────────┴─────────────▲─────────────┘
            │ POST /api/racket/swing │ POST /api/racket/telemetry│
            │ (Peak 3D Swing Packet) │ (Calibrated Pose + DPad)  │
            ▼                        ▼                           │
┌────────────────────────────────────────────────────────────────┴─────────────┐
│                     VITE / NODE REAL-TIME RELAY SERVER                       │
│ • Room Store (roomId, host/guest presence, P1 & P2 Racket State, Haptics)    │
│ • Dynamic Origin & QR Code Generator (/api/tunnel/status, /api/racket/*)     │
└───────────┬────────────────────────────────────────────────────▲─────────────┘
            │ Poll / Stream /api/match/state (P1 & P2 Rackets)   │
            ▼                                                    │
┌────────────────────────────────────────────────────────────────┴─────────────┐
│                       MAIN 3D STADIUM GAME ENGINE                            │
│        (ArgonTennisEngine + MotionController + RacketKinematics)             │
├───────────────────────┬──────────────────────────┬───────────────────────────┤
│ MotionController      │ RacketKinematics 3D      │ 1v1 Match & HUD Manager   │
│ • P1 & P2 Phone State │ • Calibrated Pitch/Roll  │ • PvCPU (Casual / Pro)    │
│ • 3D Calib Offsets    │   /Yaw -> Wrist Spring   │ • Couch 1v1 (2 Phones)    │
│ • D-Pad Move Vector   │ • Forehand/Backhand/     │ • Remote 1v1 (2 Screens)  │
│ • Webcam & Mouse      │   Overhead Whip Curves   │ • Pairing & 3D Calib Modal│
└───────────────────────┴──────────────────────────┴───────────────────────────┘
```

### Data Model & State

1. **Calibrated 3D Racket Telemetry Payload (`RacketTelemetry`)**:
   - `role`: `'p1' | 'p2'`
   - `connected`: `boolean`
   - `calibrated`: `boolean`
   - `orientation`: `{ pitch: number, roll: number, yaw: number, rawAlpha: number, rawBeta: number, rawGamma: number, accelMag: number, buttonB: boolean }` (all angles relative to the player's zeroed calibration reference)
   - `dpad`: `{ x: number, y: number, netRush: boolean }` (optional footwork override vector in `[-1, 1]`)
   - `selectedShotType`: `'topspin' | 'slice' | 'lob' | 'smash' | 'flat' | 'auto'`
2. **Discrete 3D Swing Event (`RacketSwingEvent`)**:
   - `seq`: monotonically increasing sequence ID
   - `role`: `'p1' | 'p2'`
   - `type`: `'swing' | 'toss'`
   - `side`: `'forehand' | 'backhand' | 'overhead'` (derived from calibrated horizontal gyro angular velocity + roll bevel)
   - `shotType`: `'topspin' | 'slice' | 'lob' | 'smash' | 'flat'` (derived from vertical swing path + pitch face angle or locked button)
   - `speed`: normalized power multiplier (`0.75` to `1.85`)
   - `dirX`, `dirY`: calibrated 3D aim direction vectors
   - `pitch`, `roll`, `yaw`: racket face orientation at contact for spin physics

### Interactive Component & State Mapping

- **Pairing & 3D Calibration Modal (`HudUI` + `index.html`)**:
  - Unhides `#btn-phone-racket` and `#btn-multiplayer-modal` in the HUD and adds a direct **Phone Controller & 3D Calibration** launcher on the Title screen.
  - Dynamically resolves the current app URL (`window.location.origin`) so QR codes and controller links work out-of-the-box in any environment without relying on hardcoded external domains.
  - Renders crisp client-side SVG/Canvas QR codes for **Player 1 Phone** and **Player 2 Phone**, alongside a live 3D calibration visualizer showing P1 and P2 racket tilt, calibration status, and a desktop **Recenter 3D** button.
- **Wii U Companion Controller (`/companion.html`)**:
  - Self-contained, zero-build-overhead mobile controller interface supporting role switching (`P1` / `P2`), room code entry, one-tap iOS/Android sensor permission unlock, **Calibrate 3D (Zero Point)** button, live 3D canvas racket preview, 4-way court movement D-pad, shot-type lock buttons, swipe/tap swing pad, and real-time score/haptic feedback banner.
- **3D Kinematics & Footwork Integration (`racket_kinematics.js` & `game_engine.js`)**:
  - Maps calibrated `pitch`, `roll`, and `yaw` directly into both Player 1 (`this.player`) and Player 2 (`this.opponent`) wrist spring targets so holding and twisting the phone visibly tilts the 3D racket in `SERVE_STANCE`, `RALLY`, and `TITLE` preview.
  - Blends optional `dpad` input into `_stepActorFootwork` so holding Up on the phone D-pad charges the Mii toward the net for crisp volleys while releasing returns to smooth Wii Sports auto-intercept positioning.
  - Adds **Couch 1v1 (2 Phones)** mode to the Title setup and in-game HUD, enabling P2 timing popups and dual-controller presence badges on a single shared screen.

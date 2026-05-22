import { initCanvas, clear, drawPlayer, drawCell, drawGlow, drawInfectionFlash, drawProtein, drawClone,
         drawMacrophage, drawTCell, drawAntibody, drawNeutrophil, drawLetterBond, drawBCell } from './src/render/canvas.js';
import { drawDebug } from './src/render/debug.js';
import { DEBUG, state } from './src/game/state.js';
import { startTransport, onBeat, getBPM, setTempo } from './src/audio/transport.js';
import { createPlayerVoice, createCellVoice, createCloneVoice, voiceCount,
         resolutionCadence, dissonantStab, playMutationSound,
         setMasterVolume, setChorusDepth, proteinAttachSound, proteinDetachSound, deathSequence,
         playMacrophageConsume, playMacrophageAttach, playAntibodyAttach, playNeutrophilTick, playNeutrophilExplode }
  from './src/audio/synthesis.js';
import { roughness, DEFAULT_TIMBRE } from './src/audio/consonance.js';
import { PLAYER_CHORD } from './src/audio/scale.js';
import { Player, Cell, Clone, Macrophage, TCell, Antibody, Neutrophil, BCell, angleDiff } from './src/game/entities.js';
import { checkContact, bouncePlayer, spawnCell, INFECTION_THRESHOLD,
         checkContactProtein, spawnProtein }
  from './src/game/contact.js';

const canvas = initCanvas();
const ctx    = canvas.getContext('2d');

// Keyboard input
const input = { up: false, down: false, left: false, right: false };
const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', e => { if (KEY_MAP[e.code]) { input[KEY_MAP[e.code]] = true;  e.preventDefault(); } });
window.addEventListener('keyup',   e => { if (KEY_MAP[e.code]) { input[KEY_MAP[e.code]] = false; } });

// Touch input
function handleTouch(e) {
  e.preventDefault();
  if (e.touches.length === 0) {
    input.up = input.down = input.left = input.right = false;
    return;
  }
  const t    = e.touches[0];
  const dx   = t.clientX - canvas.width  / 2;
  const dy   = t.clientY - canvas.height / 2;
  const dead = 20;
  input.right = dx >  dead;
  input.left  = dx < -dead;
  input.down  = dy >  dead;
  input.up    = dy < -dead;
}
canvas.addEventListener('touchstart',  handleTouch, { passive: false });
canvas.addEventListener('touchmove',   handleTouch, { passive: false });
canvas.addEventListener('touchend',    handleTouch, { passive: false });
canvas.addEventListener('touchcancel', handleTouch, { passive: false });

const MAX_CELLS        = 5;   // target active cell count
const PROTEIN_TARGET   = 8;   // target free-floating protein count
const PROTEIN_RANGE    = 800; // remove proteins that wander beyond this radius

// BPM = BASE_BPM + clones.length * BPM_PER_CLONE  (viral load drives tempo)
const BASE_BPM                 = 60;
const BPM_PER_CLONE            = 5;
const MAX_CLONES_PER_INFECTION = 3;
const STARTER_CLONES           = 8; // gives 100 BPM at game start

const MACROPHAGE_BASE = 2;
const MACROPHAGE_MAX  = 7;
// Tritone substitutions for player chord notes C4, E4, G4 (F#4, Bb4, C#5)
const ANTIBODY_FREQS = [369.99, 466.16, 554.37];

// Roughness threshold for chord mutation on infection (stricter than INFECTION_THRESHOLD)
const MUTATION_THRESHOLD = 0.1;
const TCELL_CAPTURE_THRESHOLD = 0.15; // stricter than INFECTION_THRESHOLD for T-cells

// Dissonance thresholds for escalating immune response
const ALERT_THRESHOLD_NEUTROPHIL   = 0.2;
const ALERT_THRESHOLD_MACROPHAGE   = 0.3;
const ALERT_THRESHOLD_ANTIBODY     = 0.45;
const ALERT_THRESHOLD_BCELL        = 0.6;
const ALERT_THRESHOLD_NPHIL_PLAYER = 0.7;
const ALERT_THRESHOLD_MACRO_PLAYER = 0.8;

let player, cells, committedCell, proteins, clones, playerVoice, cellVoice, cloneVoice;
let macrophages, tcells, antibodies, neutrophils, bcells;
let antibodySpawnTimer  = 15;
let tcellRespawnTimer   = 0;
let immuneAlertLevel = 0;
let infectionFlash = 0;
let letterBondFlash = { playerDot: { x: 0, y: 0 }, cellDot: { x: 0, y: 0 }, timer: 0 };
let dead = false;
let deathFade = 0;
let gameTime = 0;   // seconds of live play
let bpmAccum = 0;   // ∫ BPM dt — divide by gameTime for average
let maxViralLoad = 0;

// --- helpers ---

function cellDist(c) { return Math.hypot(c.x - player.x, c.y - player.y); }

function mutatePlayerChord(sourceMotif) {
  const sameChroma = (f1, f2) => {
    const oct = Math.log2(f1 > f2 ? f1 / f2 : f2 / f1);
    return Math.abs(oct - Math.round(oct)) < 0.02;
  };
  const candidates = sourceMotif.filter(n => !player.chord.some(p => sameChroma(p, n)));
  if (candidates.length > 0) {
    const inherited  = candidates[Math.floor(Math.random() * candidates.length)];
    const replaceIdx = Math.floor(Math.random() * 3);
    player.chord[replaceIdx]     = inherited;
    player.baseChord[replaceIdx] = inherited;
    playMutationSound();
  }
}

// Spawn position at the edge of the visible screen area
function randomEdgePos() {
  const angle = Math.random() * Math.PI * 2;
  const dist  = Math.hypot(canvas.width / 2, canvas.height / 2) + 100;
  return [player.x + Math.cos(angle) * dist, player.y + Math.sin(angle) * dist];
}

function cellEffectiveDist(c) {
  const d = cellDist(c);
  const speed = Math.hypot(player.vx, player.vy);
  if (speed < 30) return d;
  const travelAngle = Math.atan2(player.vy, player.vx);
  const toCell = Math.atan2(c.y - player.y, c.x - player.x);
  const alignment = Math.cos(angleDiff(travelAngle, toCell));
  const sf = Math.min(1, speed / 150);
  return d / (1 + sf * alignment * 0.6);
}

function nearestActiveCell() {
  return cells.reduce((best, c) => {
    if (!c.active) return best;
    return (!best || cellEffectiveDist(c) < cellEffectiveDist(best)) ? c : best;
  }, null);
}

function updateCommittedCell() {
  const nearest = nearestActiveCell();
  if (!nearest) return;
  if (!committedCell || !committedCell.active) { committedCell = nearest; return; }
  if (cellEffectiveDist(nearest) < cellEffectiveDist(committedCell) * 0.8) committedCell = nearest;
}

// ---

function init() {
  const cx = canvas.width  / 2;
  const cy = canvas.height / 2;

  player = new Player(cx, cy);

  // Start with two guaranteed type-0 (easy) cells close by, then fill with variety
  cells = [
    new Cell(cx + 220, cy - 60,  0),
    new Cell(cx - 180, cy + 100, 0),
    spawnCell(cx, cy, 260, 380, 1),
    spawnCell(cx, cy, 260, 380, 2),
    spawnCell(cx, cy, 280, 420),
  ];
  committedCell = cells[0];

  proteins = Array.from({ length: PROTEIN_TARGET }, () => spawnProtein(cx, cy));

  // Starter clones give 100 BPM from the first frame (8 × 5 + 60)
  clones = Array.from({ length: STARTER_CLONES }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 80 + Math.random() * 80;
    return new Clone(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, player.chord);
  });

  macrophages        = [];
  tcells             = [];
  antibodies         = [];
  neutrophils        = [];
  bcells             = [];
  antibodySpawnTimer = 15;
  tcellRespawnTimer  = 0;
  immuneAlertLevel   = 0;
  dead               = false;
  deathFade          = 0;
  gameTime           = 0;
  bpmAccum           = 0;
  maxViralLoad       = 0;
  state.dead         = false;
  letterBondFlash    = { playerDot: { x: 0, y: 0 }, cellDot: { x: 0, y: 0 }, timer: 0 };

  playerVoice = createPlayerVoice();
  cellVoice   = createCellVoice();
  cloneVoice  = createCloneVoice();

  onBeat(() => {
    updateCommittedCell();

    state.tempo          = getBPM();
    state.cellCount      = cells.filter(c => c.active).length;
    state.proteinCount   = proteins.length;
    state.cloneCount     = clones.length;
    state.macrophageCount = macrophages.length;
    state.tcellCount       = tcells.length;
    state.immuneAlert      = immuneAlertLevel;
    state.bcellFamiliarity = bcells.reduce((m, b) => Math.max(m, b.familiarity), 0);

    // Neutrophil fuse countdown — fires on each beat while attached to a clone or player
    for (const n of neutrophils.filter(n => (n.attached || n.attachedToPlayer) && !n.dead)) {
      if (n.attachedToPlayer) {
        n.playerFuseBeats++;
        playNeutrophilTick(n.playerFuseBeats);
        if (n.playerFuseBeats >= 3 && !dead) {
          n.dead = true;
          playNeutrophilExplode();
          triggerDeath();
        }
      } else {
        n.fuseBeats++;
        playNeutrophilTick(n.fuseBeats);
        if (n.fuseBeats >= 4) {
          const idx = clones.indexOf(n.target);
          if (idx !== -1) {
            clones.splice(idx, 1);
            setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);
          }
          n.dead = true;
          playNeutrophilExplode();
        }
      }
    }
    neutrophils = neutrophils.filter(n => !n.dead);

    if (!committedCell) return;

    const nearest = nearestActiveCell();
    const pNote   = player.getActiveNote(committedCell.x, committedCell.y);
    const cNote   = committedCell.getActiveNote(player.x, player.y);

    const dEff = cellEffectiveDist(committedCell);
    const cellVolDb = Math.max(-35, -8 - 20 * Math.log10(1 + dEff / 150));
    cellVoice.trigger(cNote, cellVolDb);
    playerVoice.setFreq(pNote);

    state.roughness         = roughness([pNote], [cNote], DEFAULT_TIMBRE);
    state.playerNote        = pNote;
    state.cellNote          = cNote;
    state.committedCellNote = cNote;
    state.nearestCellNote   = nearest ? nearest.getActiveNote(player.x, player.y) : cNote;
    state.voiceCount        = voiceCount();
    setMasterVolume(getBPM());
    setChorusDepth(Math.min(1, clones.length / 20)); // full chorus width at 20 clones

    // Trigger the 2 nearest clones as ambient pitched voices
    const nearClones = [...clones]
      .sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y)
                    - Math.hypot(b.x - player.x, b.y - player.y))
      .slice(0, 2);
    for (const c of nearClones) cloneVoice.trigger(c.activeNote());
  });
}

function triggerDeath() {
  dead = true;
  state.dead = true;
  deathSequence(() => { deathFade = 1; });
}

// Click/tap-to-start
document.getElementById('start').addEventListener('click', async () => {
  const startEl = document.getElementById('start');
  const span = startEl.querySelector('span');
  try {
    span.textContent = 'starting audio…';
    await Promise.race([
      Tone.start(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('audio timeout — tap again')), 4000)),
    ]);
    span.textContent = 'loading…';
    startTransport(BASE_BPM);
    init();
    startEl.remove();
    requestAnimationFrame(loop);
  } catch (err) {
    span.textContent = err.message;
    console.error('Start failed:', err);
  }
});

// Restart after death
window.addEventListener('pointerdown', () => {
  if (dead && deathFade >= 1) location.reload();
});

let last = 0;
function loop(ts) {
  const now = ts / 1000;
  const dt  = Math.min((ts - last) / 1000, 0.05);
  last = ts;

  if (dead) {
    deathFade = Math.min(1, deathFade + dt / 4);
    clear(ctx);
    ctx.save();
    ctx.globalAlpha = deathFade * 0.92;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    if (deathFade >= 0.95) {
      const avgBpm = Math.round(gameTime > 0 ? bpmAccum / gameTime : BASE_BPM);
      ctx.save();
      ctx.font = '20px monospace';
      ctx.fillStyle = '#aaa';
      ctx.textAlign = 'center';
      ctx.fillText('your infection has been contained', canvas.width / 2, canvas.height / 2 - 54);
      ctx.font = '26px monospace';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'center';
      ctx.fillText(`max viral load  ${maxViralLoad}`, canvas.width / 2, canvas.height / 2 - 28);
      ctx.font = '20px monospace';
      ctx.fillText(`(avg ${avgBpm} BPM)`, canvas.width / 2, canvas.height / 2 - 2);
      ctx.font = '15px monospace';
      ctx.fillStyle = '#444';
      ctx.fillText('click to restart', canvas.width / 2, canvas.height / 2 + 18);
      ctx.restore();
    }
    requestAnimationFrame(loop);
    return;
  }

  // Accumulate BPM for final score
  gameTime += dt;
  bpmAccum += getBPM() * dt;
  if (clones.length > maxViralLoad) maxViralLoad = clones.length;

  // Clone lifecycle — expired clones reduce viral load (and thus BPM)
  clones = clones.filter(c => c.alive);
  for (const c of clones) c.update(dt);
  setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);

  // Beat phase 0–1 for macrophage erratic movement (0 = just hit beat)
  const beatDuration = 60 / getBPM();
  const beatPhase = (now % beatDuration) / beatDuration;

  // Clone roughness relative to tonic chord — used for immune cell targeting
  for (const c of clones) c.roughness = roughness(c.chord, PLAYER_CHORD, DEFAULT_TIMBRE);

  // Update entities
  player.update(dt, input, now);
  for (const c of cells) c.update(dt);
  for (const p of proteins) p.update(dt, player);

  // Protein attachment
  for (const p of proteins) {
    if (!p.attached && checkContactProtein(player, p)) {
      p.attach(player);
      proteinAttachSound();
    }
  }

  // Shake detection — computed once, used for both proteins and antibodies
  const playerShook = player.detectShake(now);

  // Protein shake-off (only play sound when something actually detaches)
  if (playerShook) {
    let shookAny = false;
    for (const p of proteins) {
      if (p.attached) { p.detach(player); shookAny = true; }
    }
    if (shookAny) proteinDetachSound();
  }

  // Pool maintenance: replace proteins that have wandered too far
  proteins = proteins.filter(p => p.attached || Math.hypot(p.x - player.x, p.y - player.y) <= PROTEIN_RANGE);
  const freeCount = proteins.filter(p => !p.attached).length;
  for (let i = freeCount; i < PROTEIN_TARGET; i++) {
    proteins.push(spawnProtein(player.x, player.y));
  }

  // Cell contact
  for (const c of cells) {
    if (!c.active || !checkContact(player, c)) continue;
    const pNote = player.getActiveNote(c.x, c.y);
    const cNote = c.getActiveNote(player.x, player.y);
    const r     = roughness([pNote], [cNote], DEFAULT_TIMBRE);
    if (r < INFECTION_THRESHOLD) {
      c.active = false;
      c.flashTimer = 0.5;
      infectionFlash = 1;
      const pDots = player.getDots();
      const cDots = c.getDots();
      const pActiveDot = pDots.find(d => d.freq === pNote) ?? pDots[0];
      const cActiveDot = cDots.find(d => d.freq === cNote) ?? cDots[0];
      letterBondFlash = {
        playerDot: { x: pActiveDot.x, y: pActiveDot.y },
        cellDot:   { x: cActiveDot.x, y: cActiveDot.y },
        timer: 0.3,
      };
      resolutionCadence([pNote, cNote], player.chord);
      // Spawn clones: each of 3 slots succeeds with probability ∝ consonance
      const spawnProb = Math.max(0, 1 - r / INFECTION_THRESHOLD);
      for (let i = 0; i < MAX_CLONES_PER_INFECTION; i++) {
        if (Math.random() < spawnProb) {
          clones.push(new Clone(
            c.x + (Math.random() - 0.5) * 60,
            c.y + (Math.random() - 0.5) * 60,
            player.chord,
          ));
        }
      }
      setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);
      setMasterVolume(getBPM());
      setTimeout(() => {
        cells = cells.filter(x => x.active || x.flashTimer > 0);
        while (cells.filter(x => x.active).length < MAX_CELLS) {
          cells.push(spawnCell(player.x, player.y));
        }
        if (!committedCell || !committedCell.active) committedCell = nearestActiveCell();
      }, 650);
    } else {
      bouncePlayer(player, c, r);
      dissonantStab(pNote, cNote);
      immuneAlertLevel = Math.min(1.0, immuneAlertLevel + 0.3);
      setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);
      setMasterVolume(getBPM());
    }
  }

  // Death when viral load (clone count) hits zero
  if (getBPM() <= BASE_BPM && !dead) triggerDeath();

  // Immune system — immune alert decays over time
  immuneAlertLevel = Math.max(0, immuneAlertLevel - 0.08 * dt);

  // Player dissonance: how far the player's current chord has drifted from the base (due to proteins/antibodies)
  const playerDissonance = roughness(player.chord, PLAYER_CHORD, DEFAULT_TIMBRE);
  const attachedProteinCount = proteins.filter(p => p.attached).length;

  // T-cell: respawns after a delay (longer if last one was neutralised by player)
  tcellRespawnTimer = Math.max(0, tcellRespawnTimer - dt);
  if (tcells.length < 1 && tcellRespawnTimer <= 0) tcells.push(new TCell(...randomEdgePos()));
  tcells = tcells.filter(tc => Math.hypot(tc.x - player.x, tc.y - player.y) < 1500);
  for (const tc of tcells) {
    tc.update(dt, clones, player);
    for (const c of clones) {
      if ((c.roughness || 0) > 0.35
          && Math.hypot(tc.x - c.x, tc.y - c.y) < tc.radius + c.radius + 15
          && tc.escalationCooldown <= 0) {
        immuneAlertLevel = Math.min(1.0, immuneAlertLevel + 0.4);
        tc.escalationCooldown = 8;
        break;
      }
    }
    // T-cell always attackable; its chromatic motif makes it naturally hard to match
    // without first mutating the player chord toward its key
    if (Math.hypot(tc.x - player.x, tc.y - player.y) < tc.radius + player.radius) {
      const pNote = player.getActiveNote(tc.x, tc.y);
      const tNote = tc.getActiveNote(player.x, player.y);
      if (roughness([pNote], [tNote], DEFAULT_TIMBRE) < TCELL_CAPTURE_THRESHOLD) {
        tcells = tcells.filter(t => t !== tc);
        immuneAlertLevel = Math.max(0, immuneAlertLevel - 0.3);
        tcellRespawnTimer = 25; // 25 s delay before a new T-cell appears
        mutatePlayerChord(tc.motif);
        resolutionCadence();
        break;
      }
    }
  }

  // Macrophage management: remove exhausted macrophages first, then replenish based on alert
  macrophages = macrophages.filter(m => !m.dead);
  const targetMacroCount = Math.min(MACROPHAGE_MAX,
    (immuneAlertLevel >= ALERT_THRESHOLD_MACROPHAGE ? MACROPHAGE_BASE : 0)
    + proteins.filter(p => p.attached).length
    + Math.round(immuneAlertLevel * 5));
  while (macrophages.length < targetMacroCount) macrophages.push(new Macrophage(...randomEdgePos()));
  if (macrophages.length > MACROPHAGE_MAX) macrophages.length = MACROPHAGE_MAX;

  for (const m of macrophages) {
    // Only allow player-targeting at high alert
    const macroPlayerDissonance = immuneAlertLevel >= ALERT_THRESHOLD_MACRO_PLAYER ? playerDissonance : 0;
    m.update(dt, clones, beatPhase, player, macroPlayerDissonance);

    // Macrophage eats player: contact starts a 2s eat window; shake to escape
    if (m.targetingPlayer && !m.eatingPlayer
        && Math.hypot(m.x - player.x, m.y - player.y) < m.radius + player.radius) {
      m.eatingPlayer = true;
      m.eatTimer = 2.0;
      playMacrophageAttach();
    }
    if (m.eatingPlayer) {
      m.eatTimer -= dt;
      if (playerShook) {
        m.eatingPlayer = false;
        m.targetingPlayer = false;
      } else if (m.eatTimer <= 0 && !dead) {
        triggerDeath();
      }
    }

    // Macrophage ingests clones
    if (!m.eatingPlayer) {
      for (let i = clones.length - 1; i >= 0; i--) {
        if (Math.hypot(m.x - clones[i].x, m.y - clones[i].y) < m.radius + clones[i].radius) {
          m.ingest(clones[i]);
          clones.splice(i, 1);
          setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);
          playMacrophageConsume();
          break;
        }
      }
    }
  }

  // Neutrophil: gated at ALERT_THRESHOLD_NEUTROPHIL; at high alert also targets player
  neutrophils = neutrophils.filter(n => !n.dead);
  if (neutrophils.length < 1 && clones.length > 0 && immuneAlertLevel >= ALERT_THRESHOLD_NEUTROPHIL) {
    neutrophils.push(new Neutrophil(...randomEdgePos()));
  }
  for (const n of neutrophils) {
    // At high alert: switch to targeting player
    if (immuneAlertLevel >= ALERT_THRESHOLD_NPHIL_PLAYER && !n.attached && clones.length === 0) {
      n.targetingPlayer = true;
      n.playerTarget = player;
    } else {
      n.targetingPlayer = false;
      n.playerTarget    = null;
    }
    n.update(dt, clones);
    if (!n.attached && !n.targetingPlayer && n.target && clones.includes(n.target)
        && Math.hypot(n.x - n.target.x, n.y - n.target.y) < n.radius + n.target.radius) {
      n.attached = true;
    }
    // Neutrophil attacks player: contact starts a fuse; shake to escape
    if (n.targetingPlayer && !n.attachedToPlayer
        && Math.hypot(n.x - player.x, n.y - player.y) < n.radius + player.radius) {
      n.attachedToPlayer = true;
      n.playerFuseBeats  = 0;
    }
    if (n.attachedToPlayer) {
      if (playerShook) {
        n.attachedToPlayer = false;
        n.targetingPlayer  = false;
      }
    }
  }

  // B-cell management: persistent off-screen launchers gated at ALERT_THRESHOLD_BCELL
  if (bcells.filter(b => b.active).length < 1 && immuneAlertLevel >= ALERT_THRESHOLD_BCELL) {
    bcells.push(new BCell(...randomEdgePos()));
  }
  bcells = bcells.filter(b => b.active);
  for (const bc of bcells) {
    bc.update(dt, player, canvas.width / 2, canvas.height / 2);
    // Launch antibodies from this B-cell (replaces freestanding antibody timer)
    if (bc.launchTimer <= 0 && immuneAlertLevel >= ALERT_THRESHOLD_ANTIBODY
        && antibodies.filter(ab => !ab.attached).length < 2) {
      const noteIdx = Math.floor(Math.random() * 3);
      antibodies.push(new Antibody(bc.x, bc.y, noteIdx, ANTIBODY_FREQS[noteIdx]));
      bc.launchTimer = bc.getSpawnInterval() * (0.85 + Math.random() * 0.3);
    }
    // Player can neutralise B-cell by matching a corner note
    if (Math.hypot(bc.x - player.x, bc.y - player.y) < bc.radius + player.radius) {
      const pNote = player.getActiveNote(bc.x, bc.y);
      const bNote = bc.getActiveNote(player.x, player.y);
      if (roughness([pNote], [bNote], DEFAULT_TIMBRE) < INFECTION_THRESHOLD) {
        bc.active = false;
        bc.flashTimer = 0.5;
        mutatePlayerChord(bc.motif);
        resolutionCadence();
      }
    }
  }

  // Antibodies: launched by B-cells above; also keep legacy timer as fallback when no B-cell exists
  if (bcells.length === 0 && immuneAlertLevel >= ALERT_THRESHOLD_ANTIBODY) {
    antibodySpawnTimer -= dt;
    if (antibodySpawnTimer <= 0 && antibodies.filter(ab => !ab.attached).length < 2) {
      const noteIdx = Math.floor(Math.random() * 3);
      antibodies.push(new Antibody(...randomEdgePos(), noteIdx, ANTIBODY_FREQS[noteIdx]));
      antibodySpawnTimer = 12 + Math.random() * 6;
    }
  }

  // Harder antibody shake-off: requires a more forceful direction reversal
  const hardShake = playerShook && Math.hypot(player.vx, player.vy) > 160;
  for (let i = antibodies.length - 1; i >= 0; i--) {
    const ab = antibodies[i];
    ab.update(dt, player);
    if (!ab.attached && Math.hypot(ab.x - player.x, ab.y - player.y) < ab.radius + player.radius) {
      ab.attached = true;
      ab.attachAngle = Math.atan2(ab.y - player.y, ab.x - player.x);
      player.chord[ab.targetNoteIdx] = ANTIBODY_FREQS[ab.targetNoteIdx];
      playAntibodyAttach();
    }
    if (ab.attached && hardShake) {
      player.chord[ab.targetNoteIdx] = player.baseChord[ab.targetNoteIdx];
      antibodies.splice(i, 1);
      proteinDetachSound();
    } else if (!ab.attached && Math.hypot(ab.x - player.x, ab.y - player.y) > 1500) {
      antibodies.splice(i, 1); // strayed too far
    }
  }

  // Cell leash: replace active cells that have drifted beyond 600 px from player
  cells = cells.map(c => {
    if (!c.active || Math.hypot(c.x - player.x, c.y - player.y) <= 600) return c;
    return spawnCell(player.x, player.y); // fresh random-type cell near player
  });
  if (!committedCell || !committedCell.active) committedCell = nearestActiveCell();

  const activePlayerNote = committedCell
    ? player.getActiveNote(committedCell.x, committedCell.y)
    : player.getActiveNote(0, 0);

  infectionFlash = Math.max(0, infectionFlash - dt * 2.5);
  letterBondFlash.timer = Math.max(0, letterBondFlash.timer - dt);

  // Render
  clear(ctx);

  ctx.save();
  ctx.translate(canvas.width / 2 - player.x, canvas.height / 2 - player.y);

  for (const bc of bcells) drawBCell(ctx, bc, bc.active ? bc.getActiveNote(player.x, player.y) : null);
  for (const c of cells) {
    if (!c.active && c.flashTimer <= 0) continue;
    const cActiveFreq = c.active ? c.getActiveNote(player.x, player.y) : null;
    if (c.active) {
      const r = roughness(
        [player.getActiveNote(c.x, c.y)],
        [cActiveFreq],
        DEFAULT_TIMBRE,
      );
      drawGlow(ctx, player, c, r);
    }
    const dEff = cellEffectiveDist(c);
    const dActual = cellDist(c);
    const cellAlpha = Math.max(0.15, Math.min(0.9, 0.6 * (dActual / dEff)));
    drawCell(ctx, c, cActiveFreq, cellAlpha);
  }
  for (const c of clones) drawClone(ctx, c);
  for (const m of macrophages) drawMacrophage(ctx, m, now);
  for (const tc of tcells) {
    const pn = player.getActiveNote(tc.x, tc.y);
    const tn = tc.getActiveNote(player.x, player.y);
    drawTCell(ctx, tc, roughness([pn], [tn], DEFAULT_TIMBRE) < TCELL_CAPTURE_THRESHOLD);
  }
  for (const ab of antibodies) drawAntibody(ctx, ab);
  for (const n of neutrophils) if (!n.dead) drawNeutrophil(ctx, n);
  drawPlayer(ctx, player, activePlayerNote);
  for (const p of proteins) drawProtein(ctx, p, player);
  drawLetterBond(ctx, letterBondFlash);

  ctx.restore();

  drawInfectionFlash(ctx, infectionFlash);
  if (DEBUG) drawDebug(ctx, state);

  requestAnimationFrame(loop);
}

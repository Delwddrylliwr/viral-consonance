import { initCanvas, clear, drawPlayer, drawCell, drawGlow, drawInfectionFlash, drawProtein, drawClone,
         drawMacrophage, drawTCell, drawAntibody, drawNeutrophil, drawLetterBond, drawBCell,
         drawNeutrophilBlast, drawDangerBorder,
         drawBacterium, drawRivalVirus, drawRivalClone } from './src/render/canvas.js';
import { state } from './src/game/state.js';
import { startTransport, onBeat, getBPM, setTempo } from './src/audio/transport.js';
import { createPlayerVoice, createCellVoice, createCloneVoice, voiceCount,
         resolutionCadence, dissonantStab, playMutationSound,
         setMasterVolume, setChorusDepth, proteinAttachSound, proteinDetachSound, deathSequence,
         playMacrophageConsume, playMacrophageAttach, playAntibodyAttach, playNeutrophilTick, playNeutrophilExplode,
         scoreRevealSound }
  from './src/audio/synthesis.js';
import { roughness, DEFAULT_TIMBRE } from './src/audio/consonance.js';
import { PLAYER_CHORD } from './src/audio/scale.js';
import { Player, Cell, Clone, Macrophage, TCell, Antibody, Neutrophil, BCell, NeutrophilBlast, angleDiff,
         Bacterium, RivalVirus, RivalClone, RIVAL_DEFS } from './src/game/entities.js';
import { checkContact, bouncePlayer, spawnCell, INFECTION_THRESHOLD,
         checkContactProtein, spawnProtein, spawnBacterium }
  from './src/game/contact.js';

const canvas = initCanvas();
const ctx    = canvas.getContext('2d');

// Keyboard input
const input = { up: false, down: false, left: false, right: false };
const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', e => { if (KEY_MAP[e.code] && !showingNameInput) { input[KEY_MAP[e.code]] = true;  e.preventDefault(); } });
window.addEventListener('keyup',   e => { if (KEY_MAP[e.code] && !showingNameInput) { input[KEY_MAP[e.code]] = false; } });

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

const MAX_CELLS        = 10;  // target active cell count (2× original to match mid-distance spawn ring)
const PROTEIN_TARGET   = 8;   // target free-floating protein count
const PROTEIN_RANGE    = 800; // remove proteins that wander beyond this radius

// BPM = BASE_BPM + clones.length * BPM_PER_CLONE  (viral load drives tempo)
const BASE_BPM                 = 60;
const BPM_PER_CLONE            = 5;
const BPM_DANGER_MARGIN        = 5 * BPM_PER_CLONE; // border glow starts 5 clones above death
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

// Neutrophil blast wave: expands just below player terminal velocity (~200 px/s)
const BLAST_SPEED              = 185;  // px/s
const BLAST_RADIUS_BASE        = 80;   // min radius at low alert
const BLAST_RADIUS_SCALE       = 420;  // additional radius at alert 1.0
const BLAST_DISSONANCE_THRESH  = 0.05; // player roughness above which blast is lethal

let player, cells, committedCell, proteins, clones, playerVoice, cellVoice, cloneVoice;
let macrophages, tcells, antibodies, neutrophils, bcells, blasts;
let bacteria, bacteriaSpawnTimer;
let rivalStrains;     // Array of { def, viruses: RivalVirus[], clones: RivalClone[], respawnTimer }
let strainIntroTimer; // countdown to next strain introduction
let nextStrainIdx;    // which RIVAL_DEFS entry to introduce next
let antibodySpawnTimer  = 15;
let tcellRespawnTimer   = 0;
let immuneAlertLevel = 0;
let tcellAdaptation  = 0; // 0→1, grows ∝ BPM, resets on chord mutation
let bcellAdaptation  = 0; // grows with BPM/clone-load; caps n-phil max and gates a-body launches
let tcellAdaptKnownChord = null;
let bcellAdaptKnownChord = null;
let nphilSpawnTimer  = 0;
let infectionFlash = 0;
let letterBondFlash = { playerDot: { x: 0, y: 0 }, cellDot: { x: 0, y: 0 }, timer: 0 };
let dead = false;
let deathFade = 0;
let gameTime = 0;   // seconds of live play
let bpmAccum = 0;   // ∫ BPM dt — divide by gameTime for average
let maxViralLoad = 0;
let peakChord = null;
let peakBpm   = BASE_BPM;
let scoreRevealTriggered = false;
let mutationHintTimer = 0;
let celebrationChord  = null;
let celebrationBpm    = null;
let eraMaxClones      = 0;
let eraPeakBpm        = BASE_BPM;
let bounceTargetTimer = 0; // decays after dissonant cell bounces, adds to phage player-targeting
let cloneExpAccum     = 0; // ∫ R^clones dt, R=1.05 — exponential viral-spread score

let leaderboardChecked = false;
let showingNameInput = false;
let finalLeaderboard = null;
let newEntryIdx = -1;

// --- leaderboard ---

const LEADERBOARD_SIZE = 10;

async function fetchLeaderboard() {
  const res = await fetch('/api/scores'); // let network errors throw
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function calcScore() {
  return Math.round(cloneExpAccum);
}

function showNameInputOverlay() {
  showingNameInput = true;
  const overlay = document.getElementById('name-input-overlay');
  const input   = document.getElementById('name-input-field');
  const btn     = document.getElementById('name-submit-btn');
  overlay.style.display = 'flex';
  input.value = '';
  setTimeout(() => input.focus(), 50);

  async function submit() {
    btn.disabled    = true;
    btn.textContent = 'saving…';
    try {
      const res  = await fetch('/api/scores', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: input.value, score: calcScore() }),
      });
      const data = await res.json();
      finalLeaderboard = data.scores;
      newEntryIdx      = data.idx;
    } catch {
      finalLeaderboard = [];
    }
    overlay.style.display = 'none';
    showingNameInput = false;
  }

  btn.onclick     = submit;
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
}

// --- helpers ---

function cellDist(c) { return Math.hypot(c.x - player.x, c.y - player.y); }

function mutatePlayerChord(sourceMotif) {
  const sameChroma = (f1, f2) => {
    const oct = Math.log2(f1 > f2 ? f1 / f2 : f2 / f1);
    return Math.abs(oct - Math.round(oct)) < 0.02;
  };
  const candidates = sourceMotif.filter(n => !player.baseChord.some(p => sameChroma(p, n)));
  if (candidates.length > 0) {
    if (eraMaxClones > STARTER_CLONES) {
      celebrationChord = [...player.baseChord];
      celebrationBpm   = eraPeakBpm;
    }
    eraMaxClones      = 0;
    eraPeakBpm        = BASE_BPM;
    mutationHintTimer = 3.5;
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
  blasts             = [];
  bacteria           = [];
  bacteriaSpawnTimer = 30;
  rivalStrains       = [];
  strainIntroTimer   = 60;
  nextStrainIdx      = 0;
  antibodySpawnTimer   = 15;
  tcellRespawnTimer    = 0;
  immuneAlertLevel     = 0;
  tcellAdaptation      = 0;
  bcellAdaptation      = 0;
  tcellAdaptKnownChord = null;
  bcellAdaptKnownChord = null;
  nphilSpawnTimer      = 15; // 15s grace period before first neutrophil
  dead               = false;
  deathFade          = 0;
  gameTime           = 0;
  bpmAccum           = 0;
  maxViralLoad      = 0;
  peakChord         = null;
  peakBpm           = BASE_BPM;
  scoreRevealTriggered = false;
  mutationHintTimer = 0;
  celebrationChord  = null;
  celebrationBpm    = null;
  eraMaxClones      = 0;
  eraPeakBpm        = BASE_BPM;
  bounceTargetTimer = 0;
  cloneExpAccum     = 0;
  state.dead        = false;
  letterBondFlash    = { playerDot: { x: 0, y: 0 }, cellDot: { x: 0, y: 0 }, timer: 0 };

  playerVoice = createPlayerVoice();
  cellVoice   = createCellVoice();
  cloneVoice  = createCloneVoice();

  onBeat(() => {
    if (dead) return;

    updateCommittedCell();

    state.tempo          = getBPM();
    state.cellCount      = cells.filter(c => c.active).length;
    state.proteinCount   = proteins.length;
    state.cloneCount     = clones.length;
    state.macrophageCount = macrophages.length;
    state.tcellCount       = tcells.length;
    state.immuneAlert      = immuneAlertLevel;
    state.bcellFamiliarity = bcellAdaptation;
    state.tcellAdaptation  = tcellAdaptation;
    state.bcellAdaptation  = bcellAdaptation;

    // Neutrophil fuse countdown — fires on each beat while attached to a clone or player
    for (const n of neutrophils.filter(n => (n.attached || n.attachedToPlayer) && !n.dead)) {
      if (n.attachedToPlayer) {
        n.playerFuseBeats++;
        playNeutrophilTick(n.playerFuseBeats);
        if (n.playerFuseBeats >= 5) {
          n.dead = true;
          playNeutrophilExplode();
          const blastR = BLAST_RADIUS_BASE + BLAST_RADIUS_SCALE * immuneAlertLevel;
          blasts.push(new NeutrophilBlast(n.x, n.y, blastR, BLAST_SPEED));
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
          const blastR = BLAST_RADIUS_BASE + BLAST_RADIUS_SCALE * immuneAlertLevel;
          blasts.push(new NeutrophilBlast(n.x, n.y, blastR, BLAST_SPEED));
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
  if (eraMaxClones > STARTER_CLONES) {
    celebrationChord = [...player.baseChord];
    celebrationBpm   = eraPeakBpm;
  }
  dead = true;
  state.dead = true;
  playerVoice.stop();
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
  if (dead && deathFade >= 1 && !showingNameInput && finalLeaderboard !== null) location.reload();
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
      if (!scoreRevealTriggered) {
        scoreRevealTriggered = true;
        scoreRevealSound(
          celebrationChord ?? peakChord ?? [...PLAYER_CHORD],
          celebrationBpm   ?? peakBpm
        );
      }
      if (!leaderboardChecked) {
        leaderboardChecked = true;
        fetchLeaderboard().then(scores => {
          const score = calcScore();
          const qualifies = score > 0
            && (scores.length < LEADERBOARD_SIZE
                || score > (scores[scores.length - 1]?.score ?? -1));
          if (qualifies) {
            showNameInputOverlay();
          } else {
            finalLeaderboard = scores;
          }
        }).catch(() => {
          finalLeaderboard = []; // server unreachable — skip prompt, unblock restart
        });
      }
      const avgBpm = Math.round(gameTime > 0 ? bpmAccum / gameTime : BASE_BPM);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '20px monospace';
      ctx.fillStyle = '#aaa';
      ctx.fillText('your infection has been contained', cx, cy - 54);
      ctx.font = '26px monospace';
      ctx.fillStyle = '#888';
      ctx.fillText(`viral spread  ${calcScore()}`, cx, cy - 28);
      ctx.font = '20px monospace';
      ctx.fillText(`(peak ${maxViralLoad} virions · avg ${avgBpm} BPM)`, cx, cy - 2);

      if (finalLeaderboard !== null && finalLeaderboard.length > 0) {
        ctx.font = '12px monospace';
        ctx.fillStyle = '#555';
        ctx.fillText('top viral spreads', cx, cy + 22);
        for (let i = 0; i < finalLeaderboard.length; i++) {
          const e   = finalLeaderboard[i];
          const ey  = cy + 37 + i * 15;
          ctx.font      = '11px monospace';
          ctx.fillStyle = i === newEntryIdx ? '#5af' : '#4a4a4a';
          ctx.textAlign = 'right';
          ctx.fillText(`${i + 1}.`, cx - 74, ey);
          ctx.textAlign = 'left';
          ctx.fillText(e.name.substring(0, 14), cx - 64, ey);
          ctx.textAlign = 'right';
          ctx.fillText(String(e.score), cx + 90, ey);
        }
        ctx.textAlign = 'center';
        ctx.font      = '13px monospace';
        ctx.fillStyle = '#444';
        ctx.fillText('click to restart', cx, cy + 40 + finalLeaderboard.length * 15);
      } else if (finalLeaderboard !== null && !showingNameInput) {
        ctx.font      = '15px monospace';
        ctx.fillStyle = '#444';
        ctx.fillText('click to restart', cx, cy + 18);
      }

      ctx.restore();
    }
    requestAnimationFrame(loop);
    return;
  }

  // Accumulate BPM for final score
  gameTime += dt;
  bpmAccum += getBPM() * dt;
  if (clones.length > maxViralLoad) {
    maxViralLoad = clones.length;
    peakChord    = [...player.chord];
    peakBpm      = getBPM();
  }
  if (clones.length > eraMaxClones) eraMaxClones = clones.length;
  if (getBPM()       > eraPeakBpm)  eraPeakBpm   = getBPM();
  cloneExpAccum += Math.pow(1.05, clones.length) * dt;

  for (const c of clones) c.update(dt);
  setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);
  // Rotation speed scales with viral load: 1× at start (8 clones / 100 BPM), grows with BPM
  state.rpmMultiplier = (BASE_BPM + clones.length * BPM_PER_CLONE) / (BASE_BPM + STARTER_CLONES * BPM_PER_CLONE);

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

  // Shake detection — three tiers: complement (easy) < phage/nphil (medium) < antibody (hard)
  const playerShook  = player.detectShake(now);
  const mediumShake  = playerShook && Math.hypot(player.vx, player.vy) > 25;
  const hardShake    = playerShook && Math.hypot(player.vx, player.vy) > 100;

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
      // If rival was infecting this cell, cancel it — player takes over the replication site
      if (c.infectingRival) {
        c.infectingRival.infectingCell = null;
        c.infectingRival.infectTimer   = 4 + Math.random() * 4;
        c.infectingRival  = null;
        c.rivalProgress   = 0;
      }
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
          const e = Math.hypot(canvas.width / 2, canvas.height / 2) * 0.65;
          cells.push(spawnCell(player.x, player.y, e, e + 150));
        }
        if (!committedCell || !committedCell.active) committedCell = nearestActiveCell();
      }, 650);
    } else {
      bouncePlayer(player, c, r);
      dissonantStab(pNote, cNote);
      immuneAlertLevel  = Math.min(1.0, immuneAlertLevel + 0.3);
      bounceTargetTimer = Math.min(1, bounceTargetTimer + 0.5); // stacks up to 2 bounces
      setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);
      setMasterVolume(getBPM());
    }
  }

  // Death when viral load (clone count) hits zero
  if (getBPM() <= BASE_BPM && !dead) triggerDeath();

  // Immune system — immune alert decays over time
  immuneAlertLevel = Math.max(0, immuneAlertLevel - 0.08 * dt);

  // playerDissonance: drift from original tonic chord — used for blast lethality
  const playerDissonance  = roughness(player.chord, PLAYER_CHORD, DEFAULT_TIMBRE);
  // attachmentDissonance: 0→1 based on proteins/antibodies currently latched to player.
  // Using roughness(chord, baseChord) gives non-zero even with no attachments (self-interaction
  // of chord notes), so we count attachments explicitly instead.
  const attachedProteinCount  = proteins.filter(p => p.attached).length;
  const attachedAntibodyCount = antibodies.filter(ab => ab.attached).length;
  bounceTargetTimer = Math.max(0, bounceTargetTimer - dt / 3); // fades over ~3 s
  const attachmentDissonance  = Math.min(1,
    (attachedProteinCount + attachedAntibodyCount) / 3 + bounceTargetTimer * 0.5);

  // Flat array of all rival clones across strains — used for macrophage targeting and T-cell pause
  const allRivalClones = rivalStrains.flatMap(s => s.clones);

  // T-cell and B-cell adaptation: grow proportional to BPM, reset when player chord mutates;
  // evasion (player proximity) accelerates each cell type's own adaptation independently
  {
    const chordKey     = player.baseChord.join(',');
    const tcellEvading = tcells.some(tc => tc.isEvading);
    const bcellFleeing = bcells.some(bc => Math.hypot(bc.x - player.x, bc.y - player.y) < 300);
    const baseBpmRate  = dt * (getBPM() / BASE_BPM);
    // T-cell adaptation toward player pauses when rival clones outnumber player clones
    const tcellRivalPause = allRivalClones.length > clones.length;
    if (tcellAdaptKnownChord !== null && tcellAdaptKnownChord !== chordKey) tcellAdaptation = 0;
    tcellAdaptKnownChord = chordKey;
    tcellAdaptation = Math.min(1, tcellAdaptation + baseBpmRate / 120 * (tcellEvading ? 3 : 1) * (tcellRivalPause ? 0 : 1));
    if (bcellAdaptKnownChord !== null && bcellAdaptKnownChord !== chordKey) bcellAdaptation = 0;
    bcellAdaptKnownChord = chordKey;
    bcellAdaptation = Math.min(1, bcellAdaptation + baseBpmRate / 120 * (bcellFleeing ? 3 : 1));
  }

  // T-cell: respawns after a delay (longer if last one was neutralised by player)
  tcellRespawnTimer = Math.max(0, tcellRespawnTimer - dt);
  if (tcells.length < 1 && tcellRespawnTimer <= 0) tcells.push(new TCell(...randomEdgePos()));
  tcells = tcells.filter(tc => Math.hypot(tc.x - player.x, tc.y - player.y) < 1500);
  for (const tc of tcells) {
    tc.update(dt, clones, player);
    if (tc.isEvading && tc.burstCooldown <= 0) {
      for (const m of macrophages) m.burstTimer = 2.5;
      tc.burstCooldown = 5;
    }
    for (const c of clones) {
      if ((c.roughness || 0) > 0.35
          && Math.hypot(tc.x - c.x, tc.y - c.y) < tc.radius + c.radius + 15
          && tc.escalationCooldown <= 0) {
        immuneAlertLevel = Math.min(1.0, immuneAlertLevel + 0.4);
        tc.escalationCooldown = 8;
        // Rally nearby macrophages to converge on the T-cell's position
        for (const m of macrophages) {
          if (!m.eatingPlayer && !m.targetingPlayer) {
            m.rallyPoint = { x: tc.x, y: tc.y };
          }
        }
        break;
      }
    }
    // T-cell always attackable; its chromatic motif makes it naturally hard to match
    // without first mutating the player chord toward its key
    if (Math.hypot(tc.x - player.x, tc.y - player.y) < tc.radius + player.radius) {
      const pNote = player.getActiveNote(tc.x, tc.y);
      const tNote = tc.getActiveNote(player.x, player.y);
      if (roughness([pNote], [tNote], DEFAULT_TIMBRE) < TCELL_CAPTURE_THRESHOLD) {
        resolutionCadence([pNote, tNote], player.chord);
        tcells = tcells.filter(t => t !== tc);
        immuneAlertLevel = Math.max(0, immuneAlertLevel - 0.3);
        tcellRespawnTimer = 25; // 25 s delay before a new T-cell appears
        mutatePlayerChord(tc.motif);
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
    m.update(dt, clones, beatPhase, player, attachmentDissonance, tcellAdaptation,
             allRivalClones, bacteria.filter(b => b.active));

    // Macrophage eats player: contact starts a 2s eat window; shake to escape
    if (m.targetingPlayer && !m.eatingPlayer
        && Math.hypot(m.x - player.x, m.y - player.y) < m.radius + player.radius) {
      m.eatingPlayer = true;
      m.eatTimer = 2.0;
      playMacrophageAttach();
    }
    if (m.eatingPlayer) {
      m.eatTimer -= dt;
      if (mediumShake) {
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
      // Macrophage can consume rival clones across all strains
      outerRC: for (const strain of rivalStrains) {
        for (let i = strain.clones.length - 1; i >= 0; i--) {
          const rc = strain.clones[i];
          if (Math.hypot(m.x - rc.x, m.y - rc.y) < m.radius + rc.radius) {
            strain.clones.splice(i, 1);
            m.target = null; m.retargetTimer = 0;
            break outerRC;
          }
        }
      }
      // Macrophage can eat rival viruses across all strains
      outerRV: for (const strain of rivalStrains) {
        for (let i = strain.viruses.length - 1; i >= 0; i--) {
          const rv = strain.viruses[i];
          if (Math.hypot(m.x - rv.x, m.y - rv.y) < m.radius + rv.radius) {
            if (rv.infectingCell) {
              rv.infectingCell.infectingRival = null;
              rv.infectingCell.rivalProgress  = 0;
            }
            strain.viruses.splice(i, 1);
            strain.respawnTimer = 45;
            m.target = null; m.retargetTimer = 0;
            break outerRV;
          }
        }
      }
    }
  }

  // Neutrophils: spawn interval driven by immune alert spikes; adaptation sets the max-count ceiling
  neutrophils = neutrophils.filter(n => !n.dead);
  nphilSpawnTimer = Math.max(0, nphilSpawnTimer - dt);
  const nphilMaxCount      = Math.floor(tcellAdaptation * 4) + 1;          // 1 → 5 as T-cells adapt
  const nphilSpawnInterval = Math.max(3, 20 - bcellAdaptation * 17);      // 20s → 3s as B-cells adapt
  if (neutrophils.length < nphilMaxCount && clones.length > 0 && nphilSpawnTimer <= 0) {
    neutrophils.push(new Neutrophil(...randomEdgePos()));
    nphilSpawnTimer = nphilSpawnInterval;
  }
  for (const n of neutrophils) {
    n.playerLatchCooldown = Math.max(0, n.playerLatchCooldown - dt);
    // Targeting: player is a target if dissonant and close (lure tactic), or as fallback at extreme alert
    if (!n.attachedToPlayer && !n.attached) {
      const distToPlayer = Math.hypot(n.x - player.x, n.y - player.y);
      const shouldTargetPlayer =
        (n.playerLatchCooldown <= 0 && attachmentDissonance > 0.25 && distToPlayer < 150) ||
        (immuneAlertLevel >= ALERT_THRESHOLD_NPHIL_PLAYER && clones.length === 0);
      n.targetingPlayer = shouldTargetPlayer;
      n.playerTarget    = shouldTargetPlayer ? player : null;
    }
    n.update(dt, clones);
    if (!n.attached && !n.targetingPlayer && n.target && clones.includes(n.target)
        && Math.hypot(n.x - n.target.x, n.y - n.target.y) < n.radius + n.target.radius) {
      n.attached = true;
    }
    // Latch to player on contact; shake off like a complement protein
    if (n.targetingPlayer && !n.attachedToPlayer
        && Math.hypot(n.x - player.x, n.y - player.y) < n.radius + player.radius) {
      n.attachedToPlayer = true;
      n.playerFuseBeats  = 0;
    }
    if (n.attachedToPlayer && mediumShake) {
      n.attachedToPlayer    = false;
      n.targetingPlayer     = false;
      n.playerLatchCooldown = 3.0;
    }
  }

  // Blast wave update: expand ring, kill clones it sweeps through, kill dissonant player
  for (const b of blasts) {
    const prevRadius = b.radius;
    b.update(dt);
    // Ring sweeps through clones (iterate backwards to allow safe splice)
    for (let i = clones.length - 1; i >= 0; i--) {
      const d = Math.hypot(b.x - clones[i].x, b.y - clones[i].y);
      if (d > prevRadius && d <= b.radius) {
        clones.splice(i, 1);
        setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);
      }
    }
    // Ring sweeps through player — lethal only if dissonant
    if (!b.hitPlayer && !dead) {
      const dPlayer = Math.hypot(b.x - player.x, b.y - player.y);
      // Standard: ring swept past player this frame. Epicenter: player at/near blast origin (prevRadius==0).
      const ringSweep  = dPlayer <= b.radius && dPlayer > prevRadius;
      const atEpicenter = prevRadius === 0 && dPlayer < Math.max(6, b.radius);
      if (ringSweep || atEpicenter) {
        b.hitPlayer = true;
        if (playerDissonance > BLAST_DISSONANCE_THRESH) triggerDeath();
      }
    }
  }
  blasts = blasts.filter(b => !b.dead);

  // B-cell management: persistent off-screen launchers gated at ALERT_THRESHOLD_BCELL
  if (bcells.filter(b => b.active).length < 1 && immuneAlertLevel >= ALERT_THRESHOLD_BCELL) {
    bcells.push(new BCell(...randomEdgePos()));
  }
  bcells = bcells.filter(b => b.active);
  for (const bc of bcells) {
    bc.update(dt, player, canvas.width / 2, canvas.height / 2);
    // Launch antibodies from this B-cell (replaces freestanding antibody timer)
    const playerNearBCell = Math.hypot(bc.x - player.x, bc.y - player.y) < 300;
    if (bc.launchTimer <= 0 && (bcellAdaptation > 0 || playerNearBCell)
        && antibodies.filter(ab => !ab.attached).length < 2) {
      const noteIdx = Math.floor(Math.random() * 3);
      antibodies.push(new Antibody(bc.x, bc.y, noteIdx, ANTIBODY_FREQS[noteIdx]));
      bc.launchTimer = (18 - bcellAdaptation * 14) * (0.85 + Math.random() * 0.3);
    }
    // Player can neutralise B-cell by matching a corner note
    if (Math.hypot(bc.x - player.x, bc.y - player.y) < bc.radius + player.radius) {
      const pNote = player.getActiveNote(bc.x, bc.y);
      const bNote = bc.getActiveNote(player.x, player.y);
      if (roughness([pNote], [bNote], DEFAULT_TIMBRE) < INFECTION_THRESHOLD) {
        resolutionCadence([pNote, bNote], player.chord);
        bc.active = false;
        bc.flashTimer = 0.5;
        mutatePlayerChord(bc.motif);
      }
    }
  }


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

  // Bacteria: slow ecosystem drifters that distract macrophages and reward infection with 1 clone
  const MAX_BACTERIA = 2;
  bacteriaSpawnTimer = Math.max(0, bacteriaSpawnTimer - dt);
  if (bacteria.length < MAX_BACTERIA && bacteriaSpawnTimer <= 0 && gameTime >= 30) {
    bacteria.push(spawnBacterium(player.x, player.y));
    bacteriaSpawnTimer = 60;
  }
  for (const b of bacteria) b.update(dt);
  // Leash bacteria similarly to cells
  const bacteriaLeash = Math.hypot(canvas.width / 2, canvas.height / 2) * 2.2;
  bacteria = bacteria.filter(b => b.active && Math.hypot(b.x - player.x, b.y - player.y) <= bacteriaLeash);
  // Player infection of bacterium (lenient threshold): spawns exactly 1 clone
  for (const b of bacteria) {
    if (!b.active || !checkContact(player, b)) continue;
    const pNote = player.getActiveNote(b.x, b.y);
    const bNote = b.getActiveNote(player.x, player.y);
    const r     = roughness([pNote], [bNote], DEFAULT_TIMBRE);
    if (r < 0.35) {
      b.active = false;
      b.flashTimer = 0.5;
      infectionFlash = 0.5;
      resolutionCadence([pNote, bNote], player.chord);
      clones.push(new Clone(b.x + (Math.random() - 0.5) * 40, b.y + (Math.random() - 0.5) * 40, player.chord));
      setTempo(BASE_BPM + clones.length * BPM_PER_CLONE);
      setMasterVolume(getBPM());
    }
  }

  // Rival virus strains: new strain introduced every 60s while BPM is high enough
  strainIntroTimer = Math.max(0, strainIntroTimer - dt);
  if (strainIntroTimer <= 0 && nextStrainIdx < RIVAL_DEFS.length && gameTime >= 60 && getBPM() > 110) {
    const def = RIVAL_DEFS[nextStrainIdx++];
    rivalStrains.push({ def, viruses: [new RivalVirus(...randomEdgePos(), def)], clones: [], respawnTimer: 0 });
    strainIntroTimer = 60;
  }

  for (const strain of rivalStrains) {
    // Respawn virus if it was eaten but clones are still active
    strain.respawnTimer = Math.max(0, strain.respawnTimer - dt);
    if (strain.viruses.length === 0 && strain.clones.length > 0 && strain.respawnTimer <= 0) {
      strain.viruses.push(new RivalVirus(...randomEdgePos(), strain.def));
    }
    // Second virus spawns when immune is focused on player and strain already has clones
    if (strain.viruses.length === 1 && immuneAlertLevel >= 0.5 && strain.clones.length >= 2) {
      strain.viruses.push(new RivalVirus(...randomEdgePos(), strain.def));
    }

    // Update viruses; handle infection completions and BPM-driven removal
    if (getBPM() <= 80) {
      strain.viruses = [];
      strain.clones  = [];
    } else {
      for (const rv of strain.viruses) {
        rv.update(dt, cells, immuneAlertLevel, strain.clones.length);
        if (rv.infectionCompleted) {
          strain.clones.push(new RivalClone(rv._lastInfectedX, rv._lastInfectedY, strain.def.id, strain.def.color));
        }
      }
      // Age out rival clones
      for (const rc of strain.clones) rc.update(dt);
      strain.clones = strain.clones.filter(rc => rc.age < 35);
    }

    // Gentle bounce on player contact — no alert escalation (both viruses)
    for (const rv of strain.viruses) {
      if (Math.hypot(player.x - rv.x, player.y - rv.y) < player.radius + rv.radius) {
        const dx = player.x - rv.x, dy = player.y - rv.y;
        const d  = Math.hypot(dx, dy) || 1;
        player.vx += (dx / d) * 40;
        player.vy += (dy / d) * 40;
      }
    }
  }
  // Extinction: remove strains where all viruses and clones are gone and no respawn pending
  rivalStrains = rivalStrains.filter(s => s.viruses.length > 0 || s.clones.length > 0 || s.respawnTimer > 0);

  // Cell leash: replace active cells that are effectively too far away.
  // Uses directional effective distance so behind-cells are recycled sooner when moving.
  const leash = Math.hypot(canvas.width / 2, canvas.height / 2) * 2;
  cells = cells.map(c => {
    if (!c.active || cellEffectiveDist(c) <= leash) return c;
    if (c.infectingRival) { c.infectingRival.infectingCell = null; c.infectingRival.infectTimer = 5; }
    const e = Math.hypot(canvas.width / 2, canvas.height / 2) * 0.65;
    return spawnCell(player.x, player.y, e, e + 150);
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

  for (const bc of bcells) drawBCell(ctx, bc, bc.active ? bc.getActiveNote(player.x, player.y) : null, bcellAdaptation);
  for (const b of bacteria) if (b.active || b.flashTimer > 0) drawBacterium(ctx, b);
  for (const strain of rivalStrains) {
    for (const rv of strain.viruses) drawRivalVirus(ctx, rv);
    for (const rc of strain.clones) drawRivalClone(ctx, rc);
  }
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
  for (const b of blasts) drawNeutrophilBlast(ctx, b);
  for (const m of macrophages) drawMacrophage(ctx, m, now);
  for (const tc of tcells) {
    const pn = player.getActiveNote(tc.x, tc.y);
    const tn = tc.getActiveNote(player.x, player.y);
    drawTCell(ctx, tc, roughness([pn], [tn], DEFAULT_TIMBRE) < TCELL_CAPTURE_THRESHOLD, immuneAlertLevel, tcellAdaptation);
  }
  for (const ab of antibodies) drawAntibody(ctx, ab);
  for (const n of neutrophils) if (!n.dead) drawNeutrophil(ctx, n);
  drawPlayer(ctx, player, activePlayerNote);
  for (const p of proteins) drawProtein(ctx, p, player);
  drawLetterBond(ctx, letterBondFlash);

  ctx.restore();

  drawInfectionFlash(ctx, infectionFlash);

  // Screen-space danger border: deep red throb when BPM is critical, neutrophil is latched, or player is in blast radius
  const bpmDanger    = Math.max(0, Math.min(1, 1 - (getBPM() - BASE_BPM) / BPM_DANGER_MARGIN));
  const latchDanger  = neutrophils.some(n => n.attachedToPlayer) ? 1 : 0;
  const eatDanger  = macrophages.some(m => m.eatingPlayer) ? 1 : 0;
  const blastDanger  = blasts.some(b => !b.dead && Math.hypot(b.x - player.x, b.y - player.y) <= b.maxRadius) ? 1 : 0;
  const dangerIntensity = Math.max(bpmDanger, latchDanger, blastDanger, eatDanger);
  drawDangerBorder(ctx, dangerIntensity, now);

  if (mutationHintTimer > 0) {
    mutationHintTimer = Math.max(0, mutationHintTimer - dt);
    ctx.save();
    ctx.globalAlpha = Math.min(1, mutationHintTimer);
    ctx.fillStyle = '#8af';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('chord mutated — viral spread still accumulating', canvas.width / 2, 28);
    ctx.restore();
  }

  requestAnimationFrame(loop);
}

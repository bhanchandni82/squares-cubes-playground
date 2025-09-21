// ====== BUTTONS / AREA ======
const quizArea = document.getElementById("quiz-area");
const btnTestSquares = document.getElementById("test-squares");
const btnTestCubes   = document.getElementById("test-cubes");

// ====== SETTINGS ======
const QUIZ_LEN = 20;                 // cap on number of questions
const QUIZ_TIME_MS = 2 * 60 * 1000;  // 2 minutes
const RETRY_COOLDOWN = 3;            // try to wait this many Qs before retrying a wrong one
// NEW: control how fast we move on
const CORRECT_DELAY_MS = 900;
const WRONG_DELAY_MS   = 1600; // try 1600–2000 if you want longer
// ====== STATE ======
const state = {
  mode: null,          // 'squares' | 'cubes'
  current: 0,          // how many questions have been asked this round
  score: 0,
  wrong: [],           // [{label, picked, correct}]
  timeStart: 0,
  timeLeftMs: QUIZ_TIME_MS,
  timerId: null,
  baseQueue: [],       // unique numbers to test (shuffled, no repeats)
  retryQueue: [],      // [{n, availableAtIndex}]
  lastN: null          // to avoid immediate repeats
};

// ====== EVENTS ======
btnTestSquares.addEventListener("click", () => openReadyGate("squares"));
btnTestCubes.addEventListener("click",   () => openReadyGate("cubes"));

// ====== HELPERS ======
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(arr){ return arr.sort(() => Math.random() - 0.5); }
function formatTime(ms){
  const s = Math.max(0, Math.ceil(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2,"0");
  const ss = String(s % 60).padStart(2,"0");
  return `${mm}:${ss}`;
}
function clearTimer(){ if(state.timerId){ clearInterval(state.timerId); state.timerId = null; }}

// Build a new unique base queue for the chosen mode
function buildBaseQueue(mode){
  const maxN = mode === "squares" ? 20 : 12;
  return shuffle(Array.from({length: maxN}, (_,i)=>i+1));
}

// Choose the next number to ask:
// 1) Prefer from baseQueue (unique numbers), avoiding immediate repeat if possible
// 2) Else use an eligible wrong retry (availableAtIndex reached), avoiding immediate repeat if possible
// 3) Else, if nothing eligible but retries exist, take earliest even if cooldown not met (fallback)
function pickNextNumber(){
  const avoid = state.lastN;

  // Prefer from base queue
  if(state.baseQueue.length){
    // If the very next equals the one we just asked and we have alternatives, rotate
    if(state.baseQueue[0] === avoid && state.baseQueue.length > 1){
      state.baseQueue.push(state.baseQueue.shift());
    }
    return state.baseQueue.shift();
  }

  // From eligible retries (cooldown reached)
  const eligibleIdx = state.retryQueue.findIndex(item => item.availableAtIndex <= state.current && item.n !== avoid);
  if(eligibleIdx !== -1){
    const item = state.retryQueue.splice(eligibleIdx,1)[0];
    return item.n;
  }

  // If none eligible but retries exist, take the first (may ignore cooldown as a last resort)
  if(state.retryQueue.length){
    // Try to avoid immediate repeat here too
    const nonRepeatIdx = state.retryQueue.findIndex(item => item.n !== avoid);
    const idx = nonRepeatIdx !== -1 ? nonRepeatIdx : 0;
    const item = state.retryQueue.splice(idx,1)[0];
    return item.n;
  }

  // Nothing left to ask
  return null;
}

function openReadyGate(mode){
    // remove any existing overlay
    document.querySelectorAll(".gate-overlay").forEach(n => n.remove());
  
    const overlay = document.createElement("div");
    overlay.className = "gate-overlay";
    overlay.innerHTML = `
      <div class="gate-card" role="dialog" aria-modal="true" aria-label="Ready to start?">
        <h2>Are you ready? 😺</h2>
        <p>Earn a reward based on how many you get right!</p>
  
        <div class="tiers">
          <div class="tiers-row"><strong>&lt; 60%</strong><span> — No reward (try again!)</span></div>
          <div class="tiers-row"><strong>60–79%</strong><span> — 15 minutes</span></div>
          <div class="tiers-row"><strong>80–99%</strong><span> — 30 minutes</span></div>
          <div class="tiers-row"><strong>100%</strong><span> — 1 full hour 🎮</span></div>
        </div>
  
        <p style="margin:8px 0 14px;">Mode: <strong>${mode === "squares" ? "Squares (1–20)" : "Cubes (1–12)"}</strong></p>
  
        <div class="gate-actions">
          <button class="gate-btn" id="gate-start">I’m Ready!</button>
        </div>
  
        <div id="gate-countdown" style="margin-top:12px; min-height:80px;"></div>
      </div>
    `;
    document.body.appendChild(overlay);
  
    // Start button → run countdown
    overlay.querySelector("#gate-start").onclick = () => startCountdownThen(mode, overlay);
    // click outside to close (if they change mind)
    overlay.addEventListener("click", (e)=>{ if(e.target===overlay) overlay.remove(); });
  }
  
  function startCountdownThen(mode, overlay){
    const box = overlay.querySelector("#gate-countdown");
    const seq = ["3","2","1","LET’S GO!"];
    let i = 0;
  
    const tick = () => {
      box.innerHTML = "";
      const el = document.createElement("div");
      el.className = "countdown" + (i===seq.length-1 ? " go" : "");
      el.textContent = seq[i];
      box.appendChild(el);
  
      // tiny cat confetti on "GO!"
      if (i === seq.length - 1) {
        celebrateWithCats();
        setTimeout(() => {
          overlay.remove();
          // start the real quiz now
          startMode(mode);
        }, 600); // short pause to enjoy "GO!"
      } else {
        i++;
        setTimeout(tick, 700); // speed of countdown steps
      }
    };
    tick();
  }
  
  function computeRewardMinutes(score, total){
    const pct = score / total;
    if (pct < 0.60) return 0;
    if (pct < 0.80) return 15;
    if (pct < 1.00) return 30;
    return 60; // 100%
  }
  

// ====== START / TIMER / FRAME ======
function startMode(mode){
  clearTimer();
  state.mode = mode;
  state.current = 0;
  state.score = 0;
  state.wrong = [];
  state.timeLeftMs = QUIZ_TIME_MS;
  state.timeStart = Date.now();
  state.baseQueue = buildBaseQueue(mode);
  state.retryQueue = [];
  state.lastN = null;

  renderFrame();
  startTimer();
  updateProgressUI();   // ✅ add this
  nextQuestion();
}

function startTimer(){
  const timerEl = quizArea.querySelector(".timer");
  state.timerId = setInterval(() => {
    const elapsed = Date.now() - state.timeStart;
    state.timeLeftMs = QUIZ_TIME_MS - elapsed;
    if (state.timeLeftMs <= 0) {
      state.timeLeftMs = 0;
      timerEl.textContent = formatTime(0);
      endQuiz("time");
      return;
    }
    timerEl.textContent = formatTime(state.timeLeftMs);
  }, 250);
}

function renderFrame(){
  quizArea.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "quiz-box";

  const top = document.createElement("div");
  top.className = "quiz-topbar";

  const modeBadge = document.createElement("div");
  modeBadge.className = "badge";
  modeBadge.textContent = state.mode === "squares" ? "Squares (1–20)" : "Cubes (1–12)";

  const progress = document.createElement("div");
  progress.className = "progress";
  progress.textContent = `Q ${state.current + 1} / ${QUIZ_LEN}`;

  const timer = document.createElement("div");
  timer.className = "timer";
  timer.textContent = formatTime(state.timeLeftMs);

  top.append(modeBadge, progress, timer);

 
  // ✅ progress bar under the header
  const meter = document.createElement("div");
  meter.className = "meter";
  const fill = document.createElement("div");
  fill.className = "meter-fill";
  meter.appendChild(fill);

  const qWrap = document.createElement("div");
  qWrap.className = "qwrap";

  wrap.append(top, meter, qWrap);
  quizArea.appendChild(wrap);

  // initialize the header text + bar
  updateProgressUI();
}

// ====== ASK A QUESTION ======
function nextQuestion() {
    // Stop if we've hit the max
    if (state.current >= QUIZ_LEN) return endQuiz("done");
  
    const qwrap = quizArea.querySelector(".qwrap");
    qwrap.innerHTML = "";
  
    // Keep header/progress text in sync
    updateProgressUI();
  
    // Pick next number (respects no-immediate-repeat and retry spacing)
    const n = pickNextNumber();
    if (n === null) return endQuiz("done");
  
    const isSquare = state.mode === "squares";
    const correct  = isSquare ? n * n : n * n * n;
    const label    = isSquare ? `${n}² = ?` : `${n}³ = ?`;
  
    // Question
    const qEl = document.createElement("h3");
    qEl.textContent = `Q: ${label}`;
    qwrap.appendChild(qEl);
  
    // Build distractors from same domain
    const maxN = isSquare ? 20 : 12;
    const pool = [];
    for (let i = 1; i <= maxN; i++) {
      if (i === n) continue;
      pool.push(isSquare ? i * i : i * i * i);
    }
    const choiceSet = new Set([correct]);
    while (choiceSet.size < 4) {
      choiceSet.add(pool[Math.floor(Math.random() * pool.length)]);
    }
    const options = Array.from(choiceSet).sort(() => Math.random() - 0.5);
  
    // Answers row
    const row = document.createElement("div");
    row.className = "choices-row";
  
    options.forEach(val => {
      const btn = document.createElement("button");
      btn.className = "quiz-choice";
      btn.textContent = String(val);
  
      btn.onclick = () => {
        // lock answers
        [...row.querySelectorAll("button")].forEach(b => (b.disabled = true));
  
        const isCorrect = (val === correct);
        if (isCorrect) {
          btn.style.background = "#16a34a"; // green
          celebrateWithCats();
          state.score += 1;
        } else {
          btn.style.background = "#ef4444"; // red
          btn.classList.add("shake");
          setTimeout(() => btn.classList.remove("shake"), 400);
  
          // highlight correct
          [...row.querySelectorAll("button")].forEach(b => {
            if (Number(b.textContent) === correct) b.style.background = "#16a34a";
          });
  
          // queue retry after cooldown and log wrong
          state.retryQueue.push({ n, availableAtIndex: state.current + RETRY_COOLDOWN });
          state.wrong.push({ label: isSquare ? `${n}²` : `${n}³`, picked: val, correct });
        }
  
        // Update progress label/bar for the question just answered
        updateProgressUI();
  
        // Longer delay if wrong, shorter if correct
        const delay = isCorrect
          ? (typeof CORRECT_DELAY_MS !== "undefined" ? CORRECT_DELAY_MS : 900)
          : (typeof WRONG_DELAY_MS   !== "undefined" ? WRONG_DELAY_MS   : 1600);
  
        setTimeout(() => {
          state.lastN = n;
          state.current += 1;
          if (state.current >= QUIZ_LEN) endQuiz("done");
          else nextQuestion();
        }, delay);
      };
  
      row.appendChild(btn);
    });
  
    qwrap.appendChild(row);
  }
  

// ====== END QUIZ ======
function endQuiz(reason){
  clearTimer();
  const wrap = quizArea.querySelector(".qwrap");
  wrap.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = "Great job! 🎉";

  const finishedEarly = (reason === "done" && state.baseQueue.length === 0 && state.retryQueue.length === 0);
  const note = finishedEarly
    ? "You finished the set with no repeats needed."
    : (reason === "time" ? "Time’s up!" : "");

  const p = document.createElement("p");
  const used = QUIZ_TIME_MS - state.timeLeftMs;
  p.textContent = `Score: ${state.score} / ${Math.min(QUIZ_LEN, state.current)} • Time: ${formatTime(used)} ${note ? "• " + note : ""}`;

  wrap.append(title, p);

  const mins = computeRewardMinutes(state.score, QUIZ_LEN);
  function showRewardModalGeneric(mins){
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>Nice run! 🎉</h2>
        <p>You earned <strong>${mins} minutes</strong> — enjoy!</p>
        <button class="modal-close">Yay!</button>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector(".modal-close").onclick = close;
    overlay.addEventListener("click",(e)=>{ if(e.target===overlay) close(); });
  }

if (mins > 0) {
  // reuse your modal, or show a toast — here’s a quick modal:
  showRewardModalGeneric(mins);
}

  if (state.wrong.length){
    const sub = document.createElement("p");
    sub.textContent = "Review these:";
    const list = document.createElement("div");
    list.className = "wrong-list";
    state.wrong.forEach((w,i) => {
      const row = document.createElement("div");
      row.className = "wrong-row";
      row.textContent = `${i+1}. ${w.label} → You: ${w.picked} • Correct: ${w.correct}`;
      list.appendChild(row);
    });
    wrap.append(sub, list);
  } else {
    const yay = document.createElement("p");
    yay.textContent = "Perfect run — nothing to review! 😺";
    wrap.append(yay);
  }

  const actions = document.createElement("div");
  actions.style.marginTop = "12px";
  const again = document.createElement("button");
  again.className = "quiz-choice";
  again.textContent = state.mode === "squares" ? "Retake Squares" : "Retake Cubes";
  again.onclick = () => startMode(state.mode);

  const switchBtn = document.createElement("button");
  switchBtn.className = "quiz-choice";
  switchBtn.textContent = state.mode === "squares" ? "Switch to Cubes" : "Switch to Squares";
  switchBtn.onclick = () => startMode(state.mode === "squares" ? "cubes" : "squares");

  actions.append(again, switchBtn);
  wrap.append(actions);
}

// ====== CAT CONFETTI ======
function celebrateWithCats() {
  const emojis = ["😺","🐱","🐾","😻"];
  const COUNT = 24;
  for (let i = 0; i < COUNT; i++) {
    const span = document.createElement("span");
    span.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    span.className = "cat-particle";
    span.style.left   = (10 + Math.random() * 80) + "vw";
    span.style.bottom = (5 + Math.random() * 15) + "vh";
    span.style.fontSize = (22 + Math.random() * 22) + "px";
    span.style.setProperty("--drift", (Math.random() * 60 - 30) + "px");
    document.body.appendChild(span);
    setTimeout(() => span.remove(), 3200);
  }
}
function updateProgressUI() {
    const p = quizArea.querySelector(".progress");
    const fill = quizArea.querySelector(".meter-fill");
    if (p) p.textContent = `Q ${Math.min(state.current + 1, QUIZ_LEN)} / ${QUIZ_LEN}`;
    if (fill) {
      const pct = Math.min(state.current, QUIZ_LEN) / QUIZ_LEN * 100;
      fill.style.width = `${pct}%`;
    }
  }
  
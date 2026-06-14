const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const timeEl = document.querySelector("#time");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");
const controlButtons = document.querySelectorAll("[data-dir]");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const ROUND_SECONDS = 45;
const keys = new Set();

let player;
let snacks;
let hazards;
let score;
let best = Number(localStorage.getItem("boredBreakBest") || 0);
let timeLeft;
let lastTick;
let running = false;
let animationId;

bestEl.textContent = best;
drawIdleBoard();

function resetGame() {
  player = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    radius: 15,
    speed: 265,
    invincible: 0,
  };
  snacks = Array.from({ length: 7 }, () => makeSnack());
  hazards = Array.from({ length: 5 }, () => makeHazard());
  score = 0;
  timeLeft = ROUND_SECONDS;
  lastTick = performance.now();
  running = true;
  scoreEl.textContent = score;
  timeEl.textContent = timeLeft;
  overlay.classList.add("hidden");
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min((now - lastTick) / 1000, 0.04);
  lastTick = now;

  update(dt);
  draw();

  if (running) {
    animationId = requestAnimationFrame(loop);
  }
}

function update(dt) {
  timeLeft -= dt;
  timeEl.textContent = Math.max(0, Math.ceil(timeLeft));

  const move = getMoveVector();
  player.x += move.x * player.speed * dt;
  player.y += move.y * player.speed * dt;
  player.x = clamp(player.x, player.radius, WIDTH - player.radius);
  player.y = clamp(player.y, player.radius, HEIGHT - player.radius);
  player.invincible = Math.max(0, player.invincible - dt);

  for (const hazard of hazards) {
    hazard.x += hazard.vx * dt;
    hazard.y += hazard.vy * dt;

    if (hazard.x < hazard.radius || hazard.x > WIDTH - hazard.radius) hazard.vx *= -1;
    if (hazard.y < hazard.radius || hazard.y > HEIGHT - hazard.radius) hazard.vy *= -1;
  }

  snacks.forEach((snack, index) => {
    if (distance(player, snack) < player.radius + snack.radius) {
      score += snack.bonus ? 5 : 1;
      scoreEl.textContent = score;
      snacks[index] = makeSnack();

      if (score % 8 === 0 && hazards.length < 10) {
        hazards.push(makeHazard());
      }
    }
  });

  for (const hazard of hazards) {
    if (player.invincible <= 0 && distance(player, hazard) < player.radius + hazard.radius) {
      score = Math.max(0, score - 4);
      scoreEl.textContent = score;
      player.invincible = 1.1;
    }
  }

  if (timeLeft <= 0) {
    endGame();
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawGrid();

  for (const snack of snacks) {
    ctx.beginPath();
    ctx.fillStyle = snack.bonus ? "#facc15" : "#22c55e";
    ctx.shadowColor = snack.bonus ? "#facc15" : "#22c55e";
    ctx.shadowBlur = 18;
    ctx.arc(snack.x, snack.y, snack.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  for (const hazard of hazards) {
    ctx.beginPath();
    ctx.fillStyle = "#ef4444";
    ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.fillStyle = player.invincible > 0 ? "#93c5fd" : "#60a5fa";
  ctx.shadowColor = "#60a5fa";
  ctx.shadowBlur = 22;
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawGrid() {
  ctx.fillStyle = "#111827";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;

  for (let x = 0; x < WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }

  for (let y = 0; y < HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
}

function drawIdleBoard() {
  player = { x: WIDTH / 2, y: HEIGHT / 2, radius: 15, invincible: 0 };
  snacks = Array.from({ length: 7 }, () => makeSnack());
  hazards = Array.from({ length: 5 }, () => makeHazard());
  draw();
}

function endGame() {
  running = false;
  cancelAnimationFrame(animationId);
  if (score > best) {
    best = score;
    localStorage.setItem("boredBreakBest", best);
    bestEl.textContent = best;
  }

  overlay.querySelector("h1").textContent = "Time!";
  overlay.querySelector("p").textContent = `You scored ${score}. Best score: ${best}.`;
  startButton.textContent = "Play Again";
  overlay.classList.remove("hidden");
}

function makeSnack() {
  return {
    x: random(24, WIDTH - 24),
    y: random(24, HEIGHT - 24),
    radius: Math.random() < 0.18 ? 12 : 8,
    bonus: Math.random() < 0.18,
  };
}

function makeHazard() {
  const speed = random(85, 150);
  const angle = random(0, Math.PI * 2);
  return {
    x: random(35, WIDTH - 35),
    y: random(35, HEIGHT - 35),
    radius: random(12, 18),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
}

function getMoveVector() {
  let x = 0;
  let y = 0;

  if (keys.has("ArrowLeft") || keys.has("a")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) x += 1;
  if (keys.has("ArrowUp") || keys.has("w")) y -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) y += 1;

  if (x !== 0 && y !== 0) {
    x *= Math.SQRT1_2;
    y *= Math.SQRT1_2;
  }

  return { x, y };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pressDirection(direction, pressed) {
  const map = {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
  };
  if (pressed) {
    keys.add(map[direction]);
  } else {
    keys.delete(map[direction]);
  }
}

startButton.addEventListener("click", resetGame);

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(event.key)) {
    event.preventDefault();
    keys.add(event.key);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

controlButtons.forEach((button) => {
  const direction = button.dataset.dir;
  button.addEventListener("pointerdown", () => pressDirection(direction, true));
  button.addEventListener("pointerup", () => pressDirection(direction, false));
  button.addEventListener("pointerleave", () => pressDirection(direction, false));
  button.addEventListener("pointercancel", () => pressDirection(direction, false));
});

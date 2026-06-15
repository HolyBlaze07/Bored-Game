import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const gameEl = document.querySelector("#game");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const timeEl = document.querySelector("#time");
const overlay = document.querySelector("#overlay");
const loadingEl = document.querySelector("#loading");
const startButton = document.querySelector("#startButton");
const controlButtons = document.querySelectorAll("[data-dir]");

const ROUND_SECONDS = 45;
const ARENA_SIZE = 18;
const PLAYER_SPEED = 8.2;
const GHOST_CHASE_SPEED = 2.35;
const keys = new Set();

let scene;
let camera;
let renderer;
let player;
let ghostSource;
let ghostClips = [];
let hazards = [];
let snacks = [];
let score = 0;
let best = Number(localStorage.getItem("boredBreakBest3D") || 0);
let timeLeft = ROUND_SECONDS;
let lastTick = performance.now();
let running = false;
let animationId;
let invincible = 0;

bestEl.textContent = best;

initScene();
loadGhostModel();
resetIdleScene();
animationId = requestAnimationFrame(loop);

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);
  scene.fog = new THREE.Fog(0x111827, 16, 34);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 16, 18);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  gameEl.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1f2937, 2.5);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(8, 12, 6);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0x162238,
      roughness: 0.82,
      metalness: 0.05,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(ARENA_SIZE * 2, 18, 0x60a5fa, 0x243247);
  grid.position.y = 0.02;
  scene.add(grid);

  player = new THREE.Mesh(
    new THREE.SphereGeometry(0.52, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.22,
      roughness: 0.35,
    })
  );
  player.position.set(0, 0.55, 0);
  player.castShadow = true;
  scene.add(player);

  window.addEventListener("resize", resize);
  resize();
}

function loadGhostModel() {
  const loader = new FBXLoader();
  loader.setPath("assets/ghost/");
  loader.load(
    "Ghost_animation.fbx",
    (model) => {
      ghostSource = model;
      ghostClips = model.animations || [];
      ghostSource.rotation.y = Math.PI;
      ghostSource.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xf3d9ff,
            emissive: 0xa855f7,
            emissiveIntensity: 0.22,
            roughness: 0.55,
          });
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      normalizeModel(ghostSource, 3.1);
      loadingEl.classList.add("hidden");
      hazards.forEach((hazard) => swapGhostPlaceholder(hazard));
    },
    undefined,
    () => {
      loadingEl.textContent = "Ghost model unavailable; using 3D placeholders.";
      setTimeout(() => loadingEl.classList.add("hidden"), 2600);
    }
  );
}

function resetGame() {
  clearObjects(hazards);
  clearObjects(snacks);
  hazards = Array.from({ length: 5 }, () => makeHazard());
  snacks = Array.from({ length: 7 }, () => makeSnack());
  score = 0;
  timeLeft = ROUND_SECONDS;
  invincible = 0;
  running = true;
  lastTick = performance.now();
  player.position.set(0, 0.55, 0);
  scoreEl.textContent = score;
  timeEl.textContent = timeLeft;
  overlay.classList.add("hidden");
}

function resetIdleScene() {
  clearObjects(hazards);
  clearObjects(snacks);
  hazards = Array.from({ length: 5 }, () => makeHazard());
  snacks = Array.from({ length: 7 }, () => makeSnack());
  player.position.set(0, 0.55, 0);
}

function loop(now) {
  const dt = Math.min((now - lastTick) / 1000, 0.04);
  lastTick = now;
  update(dt);
  renderer.render(scene, camera);
  animationId = requestAnimationFrame(loop);
}

function update(dt) {
  animateObjects(dt);

  if (!running) {
    return;
  }

  timeLeft -= dt;
  timeEl.textContent = Math.max(0, Math.ceil(timeLeft));
  invincible = Math.max(0, invincible - dt);

  const move = getMoveVector();
  player.position.x = clamp(player.position.x + move.x * PLAYER_SPEED * dt, -ARENA_SIZE + 1, ARENA_SIZE - 1);
  player.position.z = clamp(player.position.z + move.z * PLAYER_SPEED * dt, -ARENA_SIZE + 1, ARENA_SIZE - 1);
  player.material.emissiveIntensity = invincible > 0 ? 0.85 : 0.22;

  for (const hazard of hazards) {
    const toPlayerX = player.position.x - hazard.group.position.x;
    const toPlayerZ = player.position.z - hazard.group.position.z;
    const chaseLength = Math.hypot(toPlayerX, toPlayerZ) || 1;
    const wobble = Math.sin(performance.now() * 0.0018 + hazard.phase) * 0.8;
    const chaseX = toPlayerX / chaseLength;
    const chaseZ = toPlayerZ / chaseLength;
    const sideX = -chaseZ * wobble;
    const sideZ = chaseX * wobble;

    hazard.vx = chaseX * GHOST_CHASE_SPEED + sideX;
    hazard.vz = chaseZ * GHOST_CHASE_SPEED + sideZ;
    hazard.group.position.x += hazard.vx * dt;
    hazard.group.position.z += hazard.vz * dt;

    hazard.group.position.x = clamp(hazard.group.position.x, -ARENA_SIZE + 1, ARENA_SIZE - 1);
    hazard.group.position.z = clamp(hazard.group.position.z, -ARENA_SIZE + 1, ARENA_SIZE - 1);

    hazard.group.lookAt(
      hazard.group.position.x + hazard.vx,
      hazard.group.position.y,
      hazard.group.position.z + hazard.vz
    );
  }

  snacks.forEach((snack, index) => {
    if (distance2D(player.position, snack.group.position) < 1.05) {
      score += snack.bonus ? 5 : 1;
      scoreEl.textContent = score;
      scene.remove(snack.group);
      snacks[index] = makeSnack();

      if (score % 8 === 0 && hazards.length < 10) {
        hazards.push(makeHazard());
      }
    }
  });

  for (const hazard of hazards) {
    if (invincible <= 0 && distance2D(player.position, hazard.group.position) < 1.45) {
      score = Math.max(0, score - 4);
      scoreEl.textContent = score;
      invincible = 1.1;
      resetHazardPosition(hazard);
    }
  }

  if (timeLeft <= 0) {
    endGame();
  }
}

function animateObjects(dt) {
  const t = performance.now() * 0.001;
  player.rotation.y += dt * 2.3;

  for (const snack of snacks) {
    snack.group.rotation.y += dt * 3;
    snack.group.position.y = snack.baseY + Math.sin(t * 3 + snack.phase) * 0.16;
  }

  for (const hazard of hazards) {
    if (hazard.mixer) {
      hazard.mixer.update(dt);
    }
    hazard.group.position.y = hazard.baseY + Math.sin(t * 2 + hazard.phase) * 0.2;
    hazard.group.rotation.z = Math.sin(t * 2.2 + hazard.phase) * 0.07;

    if (hazard.ghost) {
      const pulse = 1 + Math.sin(t * 5 + hazard.phase) * 0.055;
      hazard.ghost.scale.setScalar(hazard.ghostBaseScale * pulse);
      hazard.ghost.rotation.x = Math.sin(t * 4.2 + hazard.phase) * 0.08;
      hazard.ghost.rotation.y = Math.PI + Math.sin(t * 3.7 + hazard.phase) * 0.24;
    }
  }
}

function makeSnack() {
  const bonus = Math.random() < 0.18;
  const group = new THREE.Group();
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(bonus ? 0.34 : 0.24, bonus ? 0.34 : 0.24, 0.12, 28),
    new THREE.MeshStandardMaterial({
      color: bonus ? 0xfacc15 : 0x22c55e,
      emissive: bonus ? 0xf59e0b : 0x16a34a,
      emissiveIntensity: 0.7,
      roughness: 0.28,
      metalness: 0.25,
    })
  );
  coin.rotation.x = Math.PI / 2;
  coin.castShadow = true;
  group.add(coin);
  group.position.set(random(-ARENA_SIZE + 2, ARENA_SIZE - 2), 0.9, random(-ARENA_SIZE + 2, ARENA_SIZE - 2));
  scene.add(group);
  return { group, bonus, baseY: group.position.y, phase: random(0, Math.PI * 2) };
}

function makeHazard() {
  const group = new THREE.Group();
  group.position.set(random(-ARENA_SIZE + 2, ARENA_SIZE - 2), 0.9, random(-ARENA_SIZE + 2, ARENA_SIZE - 2));

  const speed = random(2.1, 3.4);
  const angle = random(0, Math.PI * 2);
  const hazard = {
    group,
    vx: Math.cos(angle) * speed,
    vz: Math.sin(angle) * speed,
    baseY: group.position.y,
    phase: random(0, Math.PI * 2),
    mixer: null,
    ghost: null,
    ghostBaseScale: 1,
  };

  if (ghostSource) {
    swapGhostPlaceholder(hazard);
  } else {
    const placeholder = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 18),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0x991b1b,
        emissiveIntensity: 0.4,
      })
    );
    placeholder.castShadow = true;
    group.add(placeholder);
  }

  scene.add(group);
  return hazard;
}

function swapGhostPlaceholder(hazard) {
  hazard.group.clear();
  const ghost = SkeletonUtils.clone(ghostSource);
  ghost.position.set(0, 0, 0);
  hazard.ghost = ghost;
  hazard.ghostBaseScale = ghost.scale.x || 1;
  hazard.group.add(ghost);
  startGhostAnimation(hazard);
}

function startGhostAnimation(hazard) {
  if (!hazard.ghost || ghostClips.length === 0) {
    return;
  }

  hazard.mixer = new THREE.AnimationMixer(hazard.ghost);
  const clip = ghostClips[0];
  const action = hazard.mixer.clipAction(clip);
  action.reset();
  action.play();
  action.time = random(0, Math.max(0.01, clip.duration));
}

function resetHazardPosition(hazard) {
  const side = Math.floor(random(0, 4));
  const offset = random(-ARENA_SIZE + 3, ARENA_SIZE - 3);

  if (side === 0) hazard.group.position.set(-ARENA_SIZE + 1.5, hazard.baseY, offset);
  if (side === 1) hazard.group.position.set(ARENA_SIZE - 1.5, hazard.baseY, offset);
  if (side === 2) hazard.group.position.set(offset, hazard.baseY, -ARENA_SIZE + 1.5);
  if (side === 3) hazard.group.position.set(offset, hazard.baseY, ARENA_SIZE - 1.5);
}

function normalizeModel(model, targetHeight) {
  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = rawBox.getSize(new THREE.Vector3());
  const scale = rawSize.y > 0 ? targetHeight / rawSize.y : 1;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.y -= box.min.y;
  model.position.z -= center.z;
}

function clearObjects(items) {
  for (const item of items) {
    scene.remove(item.group);
  }
}

function endGame() {
  running = false;
  if (score > best) {
    best = score;
    localStorage.setItem("boredBreakBest3D", best);
    bestEl.textContent = best;
  }

  overlay.querySelector("h1").textContent = "Time!";
  overlay.querySelector("p").textContent = `You scored ${score}. Best score: ${best}.`;
  startButton.textContent = "Play Again";
  overlay.classList.remove("hidden");
}

function getMoveVector() {
  let x = 0;
  let z = 0;

  if (keys.has("ArrowLeft") || keys.has("a")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("d")) x += 1;
  if (keys.has("ArrowUp") || keys.has("w")) z -= 1;
  if (keys.has("ArrowDown") || keys.has("s")) z += 1;

  if (x !== 0 && z !== 0) {
    x *= Math.SQRT1_2;
    z *= Math.SQRT1_2;
  }

  return { x, z };
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function resize() {
  const rect = gameEl.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
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

window.addEventListener("beforeunload", () => cancelAnimationFrame(animationId));

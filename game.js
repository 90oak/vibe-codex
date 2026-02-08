const square = document.getElementById("square");
const game = document.getElementById("game");
const gameMessage = document.getElementById("gameMessage");
const scoreValue = document.getElementById("scoreValue");
const retryButton = document.getElementById("retryButton");

const params = new URLSearchParams(window.location.search);
const debugCollision = params.get("debugCollision") === "true";
const replay = params.get("replay") === "true";
const levelParam = params.get("level");
const proofLevelName = "proof_top_land";
const activeLevel = levelParam ? levelParam.replace(".json", "") : null;
const useProofLevel = activeLevel === proofLevelName;

const state = {
  y: 0,
  velocity: 0,
  isJumping: false,
  isHolding: false,
  rotation: 0,
  rotationStart: 0,
  rotationTarget: 0,
  rotationFrames: 0,
  airFrame: 0,
  isGameOver: false,
  isGrounded: true,
  onPlatform: false,
  platform: null,
  fallingFrom: null,
  score: 0,
  elapsedMs: 0,
  deathReason: null,
  lastSquareRect: null,
  replay: {
    enabled: replay && useProofLevel,
    obstacle: null,
    jumped: false,
    topLanded: false,
    offTime: null,
    completed: false,
    failed: false,
  },
};

const gravity = -0.9;
const jumpVelocity = 16.05;
const totalAirFrames = Math.ceil((2 * jumpVelocity) / -gravity);
const obstacleIntervalMs = 3000;
const obstacleSpeed = 480;
const obstaclePadding = 24;
const obstacles = [];
const obstacleTypes = ["spike", "cube"];

let lastFrameTime = 0;
let obstacleTimer = 0;
let levelData = null;
let levelQueue = [];
let nextLevelIndex = 0;
let replayConfig = {
  jumpTime: 1.45,
  survivalMs: 2000,
};
let debugCanvas = null;
let debugContext = null;

const loadLevel = async () => {
  if (!useProofLevel) {
    return;
  }
  try {
    const response = await fetch(`levels/${proofLevelName}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load level: ${response.status}`);
    }
    levelData = await response.json();
    levelQueue = Array.isArray(levelData.obstacles) ? levelData.obstacles.slice() : [];
    nextLevelIndex = 0;
    if (levelData.replay) {
      replayConfig = {
        jumpTime: Number(levelData.replay.jumpTime ?? replayConfig.jumpTime),
        survivalMs: Number(levelData.replay.survivalSeconds ?? 2) * 1000,
      };
    }
  } catch (error) {
    console.warn("Level load failed, falling back to random spawn.", error);
  }
};

const ensureDebugCanvas = () => {
  if (!debugCollision || debugCanvas) {
    return;
  }
  debugCanvas = document.createElement("canvas");
  debugCanvas.style.position = "absolute";
  debugCanvas.style.inset = "0";
  debugCanvas.style.pointerEvents = "none";
  debugCanvas.style.zIndex = "4";
  game.appendChild(debugCanvas);
  debugContext = debugCanvas.getContext("2d");
};

const resizeDebugCanvas = () => {
  if (!debugCanvas || !debugContext) {
    return;
  }
  if (debugCanvas.width !== game.clientWidth || debugCanvas.height !== game.clientHeight) {
    debugCanvas.width = game.clientWidth;
    debugCanvas.height = game.clientHeight;
  }
};

const drawDebugHitboxes = (squareRect, cubeRects) => {
  if (!debugContext || !debugCanvas) {
    return;
  }
  resizeDebugCanvas();
  debugContext.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
  const gameRect = game.getBoundingClientRect();
  debugContext.strokeStyle = "rgba(110, 240, 255, 0.9)";
  debugContext.lineWidth = 2;
  debugContext.strokeRect(
    squareRect.left - gameRect.left,
    squareRect.top - gameRect.top,
    squareRect.width,
    squareRect.height
  );
  debugContext.strokeStyle = "rgba(255, 204, 110, 0.9)";
  cubeRects.forEach((rect) => {
    debugContext.strokeRect(
      rect.left - gameRect.left,
      rect.top - gameRect.top,
      rect.width,
      rect.height
    );
  });
};

const spawnObstacle = (forcedType) => {
  const obstacle = document.createElement("div");
  const type = forcedType || obstacleTypes[Math.floor(Math.random() * obstacleTypes.length)];
  obstacle.className = type;
  obstacle.dataset.type = type;
  const startX = game.clientWidth + obstaclePadding;
  obstacle.dataset.x = startX.toString();
  obstacle.style.transform = `translateX(${startX}px)`;
  game.appendChild(obstacle);
  obstacles.push(obstacle);
  if (state.replay.enabled && !state.replay.obstacle && type === "cube") {
    state.replay.obstacle = obstacle;
  }
};

const updateScore = () => {
  const digits = scoreValue.querySelector(".score-digits");
  if (digits) {
    digits.textContent = state.score.toString();
  }
  scoreValue.classList.add("is-updated");
  window.setTimeout(() => {
    scoreValue.classList.remove("is-updated");
  }, 350);
};

const resetGame = () => {
  state.y = 0;
  state.velocity = 0;
  state.isJumping = false;
  state.isHolding = false;
  state.rotation = 0;
  state.rotationStart = 0;
  state.rotationTarget = 0;
  state.rotationFrames = totalAirFrames;
  state.airFrame = 0;
  state.isGameOver = false;
  state.isGrounded = true;
  state.onPlatform = false;
  state.platform = null;
  state.fallingFrom = null;
  state.score = 0;
  state.elapsedMs = 0;
  state.deathReason = null;
  state.lastSquareRect = null;
  state.replay.jumped = false;
  state.replay.obstacle = null;
  state.replay.topLanded = false;
  state.replay.offTime = null;
  state.replay.completed = false;
  state.replay.failed = false;
  obstacleTimer = 0;
  nextLevelIndex = 0;
  obstacles.splice(0).forEach((obstacle) => obstacle.remove());
  gameMessage.classList.remove("is-visible");
  game.classList.remove("is-paused");
  updateScore();
};

const triggerGameOver = (reason) => {
  if (state.isGameOver) {
    return;
  }
  state.isGameOver = true;
  state.isJumping = false;
  state.isHolding = false;
  state.velocity = 0;
  state.rotationStart = state.rotation;
  state.rotationTarget = state.rotation;
  state.rotationFrames = totalAirFrames;
  state.deathReason = reason || state.deathReason;
  gameMessage.classList.add("is-visible");
  game.classList.add("is-paused");
  if (state.replay.enabled && !state.replay.completed && !state.replay.failed) {
    console.log(`REPLAY FAIL: ${state.deathReason || "unknown"}`);
    state.replay.failed = true;
    state.replay.completed = true;
  }
};

const checkCollision = (cubeRect, obstacleRect) => {
  const obstacleInset = Math.min(obstacleRect.width, obstacleRect.height) * 0.16;
  const cubeInset = Math.min(cubeRect.width, cubeRect.height) * 0.08;
  return !(
    cubeRect.right - cubeInset < obstacleRect.left + obstacleInset ||
    cubeRect.left + cubeInset > obstacleRect.right - obstacleInset ||
    cubeRect.bottom - cubeInset < obstacleRect.top + obstacleInset ||
    cubeRect.top + cubeInset > obstacleRect.bottom - obstacleInset
  );
};

const classifyCollision = (prevRect, currentRect, obstacleRect, movingDown, epsilon) => {
  if (movingDown && prevRect.bottom <= obstacleRect.top + epsilon) {
    return "TOP";
  }
  if (prevRect.top >= obstacleRect.bottom - epsilon) {
    return "BOTTOM";
  }
  return "SIDE";
};

const logCollision = (type, deathReason) => {
  if (!debugCollision) {
    return;
  }
  console.log("[Collision]", type, {
    isGrounded: state.isGrounded,
    vy: state.velocity,
    deathReason: deathReason || null,
  });
};

const calculateFallFrames = (height) => {
  const gravityMagnitude = Math.abs(gravity);
  if (height <= 0) {
    return 1;
  }
  const frames = Math.ceil((Math.sqrt(1 + (8 * height) / gravityMagnitude) - 1) / 2);
  return Math.max(frames, 1);
};

const applySquareTransform = () => {
  square.style.transform = `translateY(${-state.y}px) rotate(${state.rotation}deg)`;
};

const update = (time) => {
  if (!lastFrameTime) {
    lastFrameTime = time;
  }
  const delta = Math.min((time - lastFrameTime) / 1000, 0.05);
  lastFrameTime = time;

  if (!state.isGameOver) {
    state.elapsedMs += delta * 1000;
  }

  if (state.replay.enabled && !state.replay.jumped && state.elapsedMs >= replayConfig.jumpTime * 1000) {
    state.replay.jumped = true;
    jump();
  }

  if (state.isJumping) {
    state.velocity += gravity;
    state.y += state.velocity;
    state.airFrame += 1;
    state.isGrounded = false;
    const progress = Math.min(state.airFrame / state.rotationFrames, 1);
    state.rotation = state.rotationStart + (state.rotationTarget - state.rotationStart) * progress;

    if (state.y <= 0) {
      state.y = 0;
      state.velocity = 0;
      state.isJumping = false;
      state.isGrounded = true;
      state.rotation = state.rotationTarget % 360;
      state.airFrame = 0;
      state.rotationFrames = totalAirFrames;
      state.onPlatform = false;
      state.platform = null;
      state.fallingFrom = null;
      if (state.isHolding) {
        jump();
      }
    }
  }

  applySquareTransform();

  if (!state.isGameOver) {
    if (levelData && levelQueue.length) {
      while (nextLevelIndex < levelQueue.length && state.elapsedMs >= levelQueue[nextLevelIndex].time * 1000) {
        spawnObstacle(levelQueue[nextLevelIndex].type);
        nextLevelIndex += 1;
      }
    } else {
      obstacleTimer += delta * 1000;
      if (obstacleTimer >= obstacleIntervalMs) {
        obstacleTimer = 0;
        spawnObstacle();
      }
    }

    let squareRect = square.getBoundingClientRect();
    const prevSquareRect = state.lastSquareRect || squareRect;
    let platformStillUnder = false;
    const cubeRects = [];

    for (let i = obstacles.length - 1; i >= 0; i -= 1) {
      const obstacle = obstacles[i];
      const currentX = Number(obstacle.dataset.x || 0);
      const nextX = currentX - obstacleSpeed * delta;
      obstacle.dataset.x = nextX.toString();
      obstacle.style.transform = `translateX(${nextX}px)`;

      if (nextX < -obstaclePadding * 2) {
        obstacle.remove();
        obstacles.splice(i, 1);
        continue;
      }

      const obstacleRect = obstacle.getBoundingClientRect();
      if (obstacle.dataset.type === "cube") {
        cubeRects.push(obstacleRect);
      }

      if (!state.isGameOver && !obstacle.dataset.scored && obstacleRect.right < squareRect.left) {
        if (state.y > 0) {
          state.score += 1;
          updateScore();
        }
        obstacle.dataset.scored = "true";
      }

      if (obstacle.dataset.type === "cube") {
        if (state.fallingFrom === obstacle) {
          continue;
        }
        if (checkCollision(squareRect, obstacleRect)) {
          const movingDown = state.velocity < 0;
          const collisionType = classifyCollision(prevSquareRect, squareRect, obstacleRect, movingDown, 2);
          if (collisionType === "TOP" && movingDown) {
            if (!state.onPlatform || state.platform !== obstacle) {
              const landingEpsilon = 1;
              const adjust = squareRect.bottom - (obstacleRect.top + landingEpsilon);
              state.y += adjust;
              state.velocity = 0;
              state.isJumping = false;
              state.isGrounded = true;
              state.airFrame = 0;
              state.rotationTarget = state.rotation;
              state.rotationStart = state.rotation;
              state.rotationFrames = totalAirFrames;
              state.onPlatform = true;
              state.platform = obstacle;
              state.fallingFrom = null;
              state.replay.topLanded = true;
              logCollision("TOP");
              applySquareTransform();
              squareRect = square.getBoundingClientRect();
            }
          } else {
            const deathReason = collisionType === "BOTTOM" ? "cube-bottom" : "cube-side";
            logCollision(collisionType, deathReason);
            if (!state.onPlatform || state.platform !== obstacle) {
              triggerGameOver(deathReason);
            }
          }
        }
      } else if (checkCollision(squareRect, obstacleRect)) {
        triggerGameOver("spike");
      }

      if (state.onPlatform && state.platform === obstacle) {
        const overlap =
          Math.min(squareRect.right, obstacleRect.right) -
          Math.max(squareRect.left, obstacleRect.left);
        if (overlap > 1) {
          platformStillUnder = true;
          const adjust = squareRect.bottom - obstacleRect.top;
          if (Math.abs(adjust) > 0.1) {
            state.y += adjust;
            applySquareTransform();
            squareRect = square.getBoundingClientRect();
          }
          state.isGrounded = true;
        }
      }

      if (
        state.replay.enabled &&
        !state.replay.topLanded &&
        state.replay.obstacle === obstacle &&
        obstacleRect.right < squareRect.left &&
        !state.replay.failed
      ) {
        console.log("REPLAY FAIL: expected TOP landing");
        state.replay.failed = true;
        state.replay.completed = true;
      }
    }

    if (state.onPlatform && !platformStillUnder) {
      state.onPlatform = false;
      state.isGrounded = false;
      state.fallingFrom = state.platform;
      state.platform = null;
      state.isJumping = true;
      state.velocity = 0;
      state.airFrame = 0;
      state.rotationStart = state.rotation;
      state.rotationTarget = state.rotation + 90;
      state.rotationFrames = calculateFallFrames(state.y);
      if (state.replay.enabled && state.replay.topLanded && state.replay.offTime === null) {
        state.replay.offTime = state.elapsedMs;
      }
    }

    if (
      state.replay.enabled &&
      state.replay.offTime !== null &&
      !state.replay.completed &&
      !state.replay.failed &&
      state.elapsedMs - state.replay.offTime >= replayConfig.survivalMs
    ) {
      console.log("REPLAY PASS");
      state.replay.completed = true;
    }

    if (debugCollision) {
      ensureDebugCanvas();
      drawDebugHitboxes(squareRect, cubeRects);
    }

    state.lastSquareRect = squareRect;
  }

  requestAnimationFrame(update);
};

const jump = () => {
  if (!state.isJumping && !state.isGameOver) {
    state.isJumping = true;
    state.isGrounded = false;
    state.velocity = jumpVelocity;
    state.airFrame = 0;
    state.rotationStart = state.rotation;
    state.rotationTarget = state.rotation + 90;
    state.rotationFrames = totalAirFrames;
    state.onPlatform = false;
    state.platform = null;
    state.fallingFrom = null;
  }
};

game.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }
  if (state.isGameOver) {
    return;
  }
  event.preventDefault();
  state.isHolding = true;
  game.setPointerCapture(event.pointerId);
  jump();
});

const stopHolding = () => {
  state.isHolding = false;
};

game.addEventListener("pointerup", (event) => {
  if (event.button !== 0) {
    return;
  }
  if (game.hasPointerCapture(event.pointerId)) {
    game.releasePointerCapture(event.pointerId);
  }
  stopHolding();
});

game.addEventListener("pointercancel", stopHolding);
game.addEventListener("pointerleave", stopHolding);

const handleSpaceDown = (event) => {
  if (event.code !== "Space" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  if (state.isGameOver) {
    return;
  }
  if (state.isHolding) {
    return;
  }
  state.isHolding = true;
  jump();
};

const handleSpaceUp = (event) => {
  if (event.code !== "Space" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  stopHolding();
};

window.addEventListener("keydown", handleSpaceDown);
window.addEventListener("keyup", handleSpaceUp);
retryButton.addEventListener("click", () => {
  if (!state.isGameOver) {
    return;
  }
  resetGame();
});

ensureDebugCanvas();
loadLevel().finally(() => {
  requestAnimationFrame(update);
});

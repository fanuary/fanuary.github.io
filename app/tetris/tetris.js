'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;

// 7 种方块：初始形状（0=空, 1=有方块）+ Catppuccin Mocha 配色
const TETROMINOES = [
  { color: '#89dceb', shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] }, // I
  { color: '#f9e2af', shape: [[1,1],[1,1]] },                               // O
  { color: '#cba6f7', shape: [[0,1,0],[1,1,1],[0,0,0]] },                   // T
  { color: '#a6e3a1', shape: [[0,1,1],[1,1,0],[0,0,0]] },                   // S
  { color: '#f38ba8', shape: [[1,1,0],[0,1,1],[0,0,0]] },                   // Z
  { color: '#89b4fa', shape: [[1,0,0],[1,1,1],[0,0,0]] },                   // J
  { color: '#fab387', shape: [[0,0,1],[1,1,1],[0,0,0]] },                   // L
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// 顺时针旋转矩阵
function rotate(matrix) {
  const N = matrix.length;
  return matrix.map((row, i) => row.map((_, j) => matrix[N - 1 - j][i]));
}

// 创建空棋盘（ROWS×COLS 的二维数组，null 表示空格）
function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// 根据等级计算下落间隔（毫秒）
function dropInterval(level) {
  return Math.max(800 - (level - 1) * 50, 100);
}

// 随机取一个方块
function randomTetromino() {
  return TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
}

// ─── GameState ───────────────────────────────────────────────────────────────
let board;      // 二维数组 ROWS×COLS，null | color string
let piece;      // { shape, x, y, color }
let score;
let level;
let lines;
let gameState;  // 'idle' | 'playing' | 'paused' | 'gameover'
let rafId;      // requestAnimationFrame ID
let lastTime;   // 上一帧时间戳
let dropAccum;  // 下落时间累积（毫秒）

// 检查 piece 在棋盘中是否合法（无越界、无重叠）
function isValid(shape, x, y) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nr = r + y;
      const nc = c + x;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false;
      if (board[nr][nc]) return false;
    }
  }
  return true;
}

// 生成新方块（出现在顶部中央）；若无法放置则触发 Game Over
function spawnPiece() {
  const t = randomTetromino();
  piece = {
    shape: t.shape,
    color: t.color,
    x: Math.floor((COLS - t.shape[0].length) / 2),
    y: 0,
  };
  if (!isValid(piece.shape, piece.x, piece.y)) {
    setGameState('gameover');
  }
}

// ─── GameState Actions ───────────────────────────────────────────────────────

function moveLeft() {
  if (gameState !== 'playing') return;
  if (isValid(piece.shape, piece.x - 1, piece.y)) piece.x--;
  render();
}

function moveRight() {
  if (gameState !== 'playing') return;
  if (isValid(piece.shape, piece.x + 1, piece.y)) piece.x++;
  render();
}

// 向下移动一格；返回 true 表示移动成功，false 表示已触底（需要锁定）
function moveDown() {
  if (gameState !== 'playing') return false;
  if (isValid(piece.shape, piece.x, piece.y + 1)) {
    piece.y++;
    render();
    return true;
  }
  lockPiece();
  return false;
}

function rotatePiece() {
  if (gameState !== 'playing') return;
  const rotated = rotate(piece.shape);
  // Wall Kick：依次尝试水平偏移 [0, -1, +1, -2, +2]
  for (const offset of [0, -1, 1, -2, 2]) {
    if (isValid(rotated, piece.x + offset, piece.y)) {
      piece.shape = rotated;
      piece.x += offset;
      render();
      return;
    }
  }
  // 所有偏移均失败，取消旋转
}

// 将当前方块写入棋盘，然后消行、生成新方块
function lockPiece() {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const nr = r + piece.y;
      const nc = c + piece.x;
      if (nr >= 0) board[nr][nc] = piece.color;
    }
  }
  clearLines();
  spawnPiece();
  render();
}

// 消除满行，更新 score / level / lines
function clearLines() {
  const SCORES = [0, 100, 300, 500, 800];
  let cleared = 0;

  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(cell => cell !== null)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(null));
      cleared++;
      r++; // 重新检查当前行（上移后的内容）
    }
  }

  if (cleared > 0) {
    score += SCORES[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
  }
}

function setGameState(newState) {
  gameState = newState;
  if (newState === 'gameover') {
    stopLoop();
    renderOverlay('gameover');
  } else if (newState === 'paused') {
    stopLoop();
    renderOverlay('paused');
  } else if (newState === 'playing') {
    renderOverlay(null);
    startLoop();
  }
}

function togglePause() {
  if (gameState === 'playing') setGameState('paused');
  else if (gameState === 'paused') setGameState('playing');
}

function startGame() {
  board     = createBoard();
  score     = 0;
  level     = 1;
  lines     = 0;
  dropAccum = 0;
  lastTime  = null;
  gameState = 'idle'; // reset before spawning so gameover check in spawnPiece works correctly
  spawnPiece();
  if (gameState !== 'gameover') setGameState('playing');
}

function restart() {
  stopLoop();
  startGame();
}

// ─── Renderer ────────────────────────────────────────────────────────────────
let cells; // 长度 200 的扁平数组，对应 board[row][col] = cells[row*COLS+col]

// 在 #board 中创建 200 个 .cell div，保存引用到 cells[]
function buildGrid() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  cells = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const div = document.createElement('div');
      div.className = 'cell';
      boardEl.appendChild(div);
      cells.push(div);
    }
  }
}

// 将棋盘状态 + 当前方块渲染到 DOM
function render() {
  // 1. 先把棋盘数据映射到 cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = cells[r * COLS + c];
      const color = board[r][c];
      if (color) {
        cell.style.background = color;
        cell.classList.add('filled');
      } else {
        cell.style.background = '';
        cell.classList.remove('filled');
      }
    }
  }

  // 2. 叠加当前方块
  if (piece && gameState === 'playing') {
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue;
        const nr = r + piece.y;
        const nc = c + piece.x;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          const cell = cells[nr * COLS + nc];
          cell.style.background = piece.color;
          cell.classList.add('filled');
        }
      }
    }
  }

  renderStats();
}

function renderStats() {
  document.getElementById('score').textContent = score.toLocaleString();
  document.getElementById('level').textContent = level;
  document.getElementById('lines').textContent = lines;
}

// type: 'idle' | 'paused' | 'gameover' | null（隐藏）
function renderOverlay(type) {
  const overlay = document.getElementById('overlay');
  const titleEl = document.getElementById('overlay-title');
  const scoreEl = document.getElementById('overlay-score');
  const btnEl   = document.getElementById('overlay-btn');

  if (!type) {
    overlay.classList.add('hidden');
    return;
  }

  overlay.classList.remove('hidden');

  if (type === 'idle') {
    titleEl.textContent = 'TETRIS';
    scoreEl.classList.add('hidden');
    btnEl.textContent   = '开始游戏';
    btnEl.onclick       = startGame;
  } else if (type === 'paused') {
    titleEl.textContent = '⏸ 已暂停';
    scoreEl.classList.add('hidden');
    btnEl.textContent   = '继续';
    btnEl.onclick       = togglePause;
  } else if (type === 'gameover') {
    titleEl.textContent     = 'GAME OVER';
    scoreEl.textContent     = `最终得分：${score.toLocaleString()}`;
    scoreEl.classList.remove('hidden');
    btnEl.textContent       = '再来一局';
    btnEl.onclick           = restart;
  }
}

// ─── GameLoop ────────────────────────────────────────────────────────────────

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const delta = timestamp - lastTime;
  lastTime = timestamp;

  dropAccum += delta;
  if (dropAccum >= dropInterval(level)) {
    dropAccum = 0;
    moveDown();
  }

  rafId = requestAnimationFrame(gameLoop);
}

function startLoop() {
  lastTime  = null;
  dropAccum = 0;
  rafId = requestAnimationFrame(gameLoop);
}

function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

// ─── InputHandler ────────────────────────────────────────────────────────────

function setupInput() {
  // 键盘
  document.addEventListener('keydown', e => {
    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); moveLeft();    break;
      case 'ArrowRight': e.preventDefault(); moveRight();   break;
      case 'ArrowDown':  e.preventDefault(); moveDown();    break;
      case 'ArrowUp':
      case 'z':
      case 'Z':          e.preventDefault(); rotatePiece(); break;
      case 'p':
      case 'P':
      case 'Escape':     togglePause();                     break;
    }
    // idle 状态下，任意键开始游戏
    if (gameState === 'idle') startGame();
  });

  // 移动端按钮
  document.getElementById('btn-rotate').addEventListener('click', rotatePiece);
  document.getElementById('btn-left').addEventListener('click', moveLeft);
  document.getElementById('btn-down').addEventListener('click', moveDown);
  document.getElementById('btn-right').addEventListener('click', moveRight);
  document.getElementById('btn-pause').addEventListener('click', togglePause);
  document.getElementById('btn-restart').addEventListener('click', restart);

  // 触屏手势（在棋盘区域内）
  const boardWrap = document.getElementById('board-wrap');
  let touchStartX = 0;
  let touchStartY = 0;

  boardWrap.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  boardWrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const threshold = 20;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
      // 轻点 → 旋转
      rotatePiece();
    } else if (Math.abs(dx) > Math.abs(dy)) {
      // 左右滑
      if (dx < -threshold) moveLeft();
      else moveRight();
    } else {
      // 上下滑
      if (dy > threshold) moveDown();
    }

    // idle 状态下，点击棋盘开始游戏
    if (gameState === 'idle') startGame();
  }, { passive: true });
}

// ─── Init ────────────────────────────────────────────────────────────────────
buildGrid();
setupInput();
board     = createBoard();
score     = 0;
level     = 1;
lines     = 0;
gameState = 'idle';
renderStats();
render();
renderOverlay('idle');

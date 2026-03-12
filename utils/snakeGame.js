// src/utils/snakeGame.js

const GRID  = 12;
const EMPTY = '⬛';
const HEAD  = '🟢';
const BODY  = '🟩';
const FOOD  = '🍎';
const DEAD  = '💀';

export function createGame(userId) {
  const mid = Math.floor(GRID / 2);
  const snake = [
    { x: mid,     y: mid },
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
  ];
  return {
    userId,
    snake,
    dir:     { x: 1, y: 0 },   // currently moving right
    nextDir: { x: 1, y: 0 },   // queued direction from button press
    food: spawnFood(snake),
    score: 0,
    gameOver: false,
    intervalId: null,           // setInterval handle — stored here so we can clear it
  };
}

function spawnFood(snake) {
  let pos;
  do {
    pos = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  return pos;
}

// Called on button press — only updates the queued direction
export function queueDirection(game, input) {
  const dirMap = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y:  1 },
    left:  { x: -1, y:  0 },
    right: { x: 1,  y:  0 },
  };
  const wanted    = dirMap[input];
  const isReverse = wanted.x === -game.dir.x && wanted.y === -game.dir.y;
  if (!isReverse) game.nextDir = wanted;
}

// Called by the interval — advances the snake one step
export function step(game) {
  if (game.gameOver) return;

  // Apply queued direction
  game.dir = game.nextDir;

  const head    = game.snake[0];
  const newHead = { x: head.x + game.dir.x, y: head.y + game.dir.y };

  // Wall collision
  if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
    game.gameOver = true;
    return;
  }

  // Self collision
  if (game.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
    game.gameOver = true;
    return;
  }

  game.snake.unshift(newHead);

  if (newHead.x === game.food.x && newHead.y === game.food.y) {
    game.score++;
    game.food = spawnFood(game.snake);
  } else {
    game.snake.pop();
  }
}

export function renderBoard(game) {
  const grid = Array.from({ length: GRID }, () => Array(GRID).fill(EMPTY));
  grid[game.food.y][game.food.x] = FOOD;
  for (let i = game.snake.length - 1; i >= 0; i--) {
    const { x, y } = game.snake[i];
    grid[y][x] = i === 0 ? (game.gameOver ? DEAD : HEAD) : BODY;
  }
  return grid.map(row => row.join('')).join('\n');
}

export { GRID };

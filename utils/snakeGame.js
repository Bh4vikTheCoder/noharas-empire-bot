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
    dir: { x: 1, y: 0 },       // currently moving right
    inputQueue: [],            // queues multiple rapid button presses
    food: spawnFood(snake),
    score: 0,
    gameOver: false,
    timeoutId: null,           // Switched from interval to timeout
    isEditing: false,          // Prevents rate-limit pileups
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

// Queues the direction instead of overwriting it
export function queueDirection(game, input) {
  const dirMap = {
    up:    { x: 0,  y: -1 },
    down:  { x: 0,  y:  1 },
    left:  { x: -1, y:  0 },
    right: { x: 1,  y:  0 },
  };
  const wanted = dirMap[input];

  // Figure out the last committed direction (either the last queued move or current dir)
  const lastDir = game.inputQueue.length > 0 
    ? game.inputQueue[game.inputQueue.length - 1] 
    : game.dir;

  const isReverse = wanted.x === -lastDir.x && wanted.y === -lastDir.y;

  // Don't allow reversing, and don't allow duplicate consecutive inputs
  if (!isReverse && (wanted.x !== lastDir.x || wanted.y !== lastDir.y)) {
    // Limit queue to 3 to prevent someone spamming 50 clicks and breaking it
    if (game.inputQueue.length < 3) {
      game.inputQueue.push(wanted);
    }
  }
}

// Advances the snake one step
export function step(game) {
  if (game.gameOver) return;

  // Pull the oldest input from the queue
  if (game.inputQueue.length > 0) {
    game.dir = game.inputQueue.shift();
  }

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

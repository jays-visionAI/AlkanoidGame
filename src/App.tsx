import { useEffect, useRef, useState, useCallback } from 'react';

// Types
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isPlayerBall: boolean;
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  visible: boolean;
  points: number;
  maxHp: number;
  currentHp: number;
  spawnsBall: boolean;
}

type GamePhase = 'start' | 'playing' | 'roundComplete' | 'gameOver' | 'victory';

interface GameState {
  paddle: {
    x: number;
    width: number;
    speed: number;
    baseSpeed: number;
  };
  balls: Ball[];
  bricks: Brick[];
  hp: number;
  maxHp: number;
  score: number;
  lives: number;
  maxLives: number;
  gameOver: boolean;
  gameStarted: boolean;
  paddleColor: string;
  level: number;
  phase: GamePhase;
  roundStats: {
    blocksDestroyed: number;
    ballsAdded: number;
    scoreEarned: number;
  };
}

// Constants
const PADDLE_BASE_WIDTH = 100;
const PADDLE_MOBILE_WIDTH = 80; // 모바일에서 패들 크기 축소
const PADDLE_HEIGHT = 15;
const BALL_RADIUS = 8;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const BRICK_ROWS = 5;
const BRICK_COLS = 10;

// 블록 색상 정의
const BRICK_COLORS = [
  { color: '#ecf0f1', name: 'white', spawnsBall: false, points: 5, hp: 1 },
  { color: '#f39c12', name: 'orange', spawnsBall: true, points: 10, hp: 2 },
  { color: '#3498db', name: 'blue', spawnsBall: true, points: 8, hp: 2 },
  { color: '#e74c3c', name: 'red', spawnsBall: true, points: 15, hp: 3 },
  { color: '#f1c40f', name: 'yellow', spawnsBall: false, points: 12, hp: 2 },
];

// ========== Sound System ==========
class SoundManager {
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();
  private enabled: boolean = true;
  private initialized: boolean = false;

  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmPlaying: boolean = false;
  private bgmLoop: boolean = true;
  private bgmIntervalId: number | null = null;

  constructor() {}

  initOnUserInteraction() {
    if (this.initialized) return;
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  private ensureContext() {
    if (!this.initialized) this.initOnUserInteraction();
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  playWallBounce() {
    this.playTone(300, 0.1, 'sine', 0.3);
  }

  playPaddleHit() {
    this.playTone(400, 0.15, 'sine', 0.4);
  }

  playBrickDestroy() {
    this.playTone(500, 0.2, 'square', 0.3);
    setTimeout(() => this.playTone(700, 0.15, 'sine', 0.2), 50);
  }

  playBallLost() {
    this.playTone(150, 0.4, 'sawtooth', 0.4);
    setTimeout(() => this.playTone(100, 0.3, 'sine', 0.3), 200);
  }

  playRoundComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.3, 'sine', 0.4), i * 150);
    });
  }

  playGameOver() {
    const notes = [392, 349, 311, 261];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.4, 'sawtooth', 0.3), i * 200);
    });
  }

  playVictory() {
    const notes = [523, 659, 784, 880, 1047, 1319, 1568];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.25, 'sine', 0.5), i * 120);
    });
  }

  playGameStart() {
    this.playTone(440, 0.15, 'sine', 0.4);
    setTimeout(() => this.playTone(880, 0.2, 'sine', 0.4), 100);
  }

  playRoundStart() {
    this.playTone(660, 0.1, 'sine', 0.3);
    setTimeout(() => this.playTone(880, 0.1, 'sine', 0.3), 100);
    setTimeout(() => this.playTone(1100, 0.15, 'sine', 0.3), 200);
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.5) {
    if (!this.enabled || !this.audioContext) return;

    this.ensureContext();
    if (!this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      
      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (e) {}
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isEnabled() {
    return this.enabled;
  }

  startBGM() {
    if (!this.enabled || !this.audioContext) return;
    this.ensureContext();
    if (!this.audioContext) return;
    if (this.bgmPlaying) return;
    try {
      this.bgmGain = this.audioContext.createGain();
      this.bgmGain.connect(this.audioContext.destination);
      this.bgmGain.gain.setValueAtTime(0.12, this.audioContext.currentTime);
      
      this.playLoungeBGM();
      this.bgmPlaying = true;
    } catch (e) {
      console.warn('BGM playback failed:', e);
    }
  }

  private playLoungeBGM() {
    if (!this.audioContext || !this.bgmGain) return;
    
    const melodyNotes = [
      261.63, 293.66, 329.63, 349.23,
      293.66, 261.63, 220.00, 261.63,
    ];
    
    const droneFreqs = [130.81, 196.00];
    
    const playNote = (index: number) => {
      if (!this.bgmPlaying || !this.audioContext || !this.bgmGain) return;
      
      const osc = this.audioContext.createOscillator();
      const noteGain = this.audioContext.createGain();
      osc.connect(noteGain);
      noteGain.connect(this.bgmGain!);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(melodyNotes[index % melodyNotes.length], this.audioContext.currentTime);
      
      noteGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      noteGain.gain.linearRampToValueAtTime(0.25, this.audioContext.currentTime + 0.1);
      noteGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.7);
      
      osc.start(this.audioContext.currentTime);
      osc.stop(this.audioContext.currentTime + 0.8);
      
      setTimeout(() => {
        if (this.bgmPlaying) playNote(index + 1);
      }, 700);
    };
    
    const startDrone = () => {
      if (!this.bgmPlaying || !this.audioContext || !this.bgmGain) return;
      droneFreqs.forEach(freq => {
        const droneOsc = this.audioContext!.createOscillator();
        const droneGain = this.audioContext!.createGain();
        droneOsc.connect(droneGain);
        droneGain.connect(this.bgmGain!);
        droneOsc.type = 'sine';
        droneOsc.frequency.setValueAtTime(freq, this.audioContext!.currentTime);
        droneGain.gain.setValueAtTime(0.08, this.audioContext!.currentTime);
        droneOsc.start(this.audioContext!.currentTime);
      });
    };
    
    startDrone();
    playNote(0);
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmSource) {
      try {
        this.bgmSource.stop();
      } catch (e) {}
      this.bgmSource = null;
    }
    if (this.bgmGain) {
      try {
        this.bgmGain.disconnect();
      } catch (e) {}
      this.bgmGain = null;
    }
  }
}

const soundManager = new SoundManager();

// Utility functions
const createBricks = (level: number): Brick[] => {
  const bricks: Brick[] = [];
  const brickWidth = (GAME_WIDTH - 40) / BRICK_COLS;
  const brickHeight = 25;
  const padding = 5;
  
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      const colorIndex = row % BRICK_COLORS.length;
      const brickType = BRICK_COLORS[colorIndex];
      
      bricks.push({
        x: 20 + col * (brickWidth + padding),
        y: 60 + row * (brickHeight + padding),
        width: brickWidth,
        height: brickHeight,
        color: brickType.color,
        visible: true,
        points: brickType.points * level,
        maxHp: brickType.hp || 1,
        currentHp: brickType.hp || 1,
        spawnsBall: brickType.spawnsBall,
      });
    }
  }
  return bricks;
};

const createBall = (x: number, y: number, speedMultiplier: number = 1, isPlayerBall: boolean = true, currentLevel: number = 1): Ball => {
  const angle = (Math.random() * 60 + 60) * (Math.PI / 180);
  const speed = (4 + currentLevel * 0.3) * speedMultiplier;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
    vy: -Math.sin(angle) * speed,
    radius: BALL_RADIUS,
    color: isPlayerBall ? '#ffffff' : '#9b59b6',
    isPlayerBall,
  };
};

const createSpawnedBall = (x: number, y: number): Ball => {
  const angle = Math.random() * Math.PI * 2;
  const speed = 3 + Math.random() * 2;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: BALL_RADIUS * 0.8,
    color: '#9b59b6',
    isPlayerBall: false,
  };
};

const getLevelSpeedMultiplier = (level: number): number => {
  return 1 + (level - 1) * 0.15;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>({
    paddle: {
      x: GAME_WIDTH / 2 - PADDLE_BASE_WIDTH / 2,
      width: PADDLE_BASE_WIDTH,
      speed: 8,
      baseSpeed: 8,
    },
    balls: [],
    bricks: [],
    hp: 100,
    maxHp: 100,
    score: 0,
    lives: 3,
    maxLives: 3,
    gameOver: false,
    gameStarted: false,
    paddleColor: '#3498db',
    level: 1,
    phase: 'start',
    roundStats: {
      blocksDestroyed: 0,
      ballsAdded: 0,
      scoreEarned: 0,
    },
  });

  const keysPressed = useRef<Set<string>>(new Set());
  const gameLoopRef = useRef<number>();
  const level = gameState.level;

  // 반응형 canvas 크기
  const [canvasSize, setCanvasSize] = useState({ width: GAME_WIDTH, height: GAME_HEIGHT });
  const [isMobile, setIsMobile] = useState(false);

  // 모바일 패들 너비
  const getPaddleWidth = useCallback(() => {
    return isMobile ? PADDLE_MOBILE_WIDTH : PADDLE_BASE_WIDTH;
  }, [isMobile]);

  // 화면 크기 감지
  useEffect(() => {
    const updateSize = () => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      // 모바일 여부 확인
      const mobile = windowWidth <= 768 || 'ontouchstart' in window;
      setIsMobile(mobile);
      
      // 모바일과 데스크톱 다르게 화면 비율 설정
      let newWidth: number;
      let newHeight: number;
      
      if (mobile) {
        // 모바일: 더 긴 세로 비율 (9:16) - 게임 영역을 더 위아래로 길게
        newWidth = windowWidth * 0.95; // 좌우 여백
        newHeight = newWidth * (16 / 9); // 9:16 비율
        
        // 화면보다 높이가 크면windowHeight에 맞춤
        if (newHeight > windowHeight * 0.92) {
          newHeight = windowHeight * 0.92;
          newWidth = newHeight * (9 / 16);
        }
      } else {
        // 데스크톱: 4:3 비율 유지
        newWidth = windowWidth;
        newHeight = windowWidth * (GAME_HEIGHT / GAME_WIDTH);
        
        if (newHeight > windowHeight) {
          newHeight = windowHeight;
          newWidth = newHeight * (GAME_WIDTH / GAME_HEIGHT);
        }
      }
      
      setCanvasSize({ width: newWidth, height: newHeight });
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Start game
  const startGame = useCallback(() => {
    const level = 1;
    soundManager.playGameStart();
    soundManager.startBGM();
    setGameState(prev => ({
      ...prev,
      balls: [createBall(GAME_WIDTH / 2, GAME_HEIGHT - 100, 1, true, level)],
      bricks: createBricks(1),
      hp: 100,
      score: 0,
      lives: 3,
      gameOver: false,
      gameStarted: true,
      phase: 'playing',
      level: 1,
      paddle: {
        ...prev.paddle,
        width: isMobile ? PADDLE_MOBILE_WIDTH : PADDLE_BASE_WIDTH,
        speed: prev.paddle.baseSpeed,
      },
      roundStats: {
        blocksDestroyed: 0,
        ballsAdded: 0,
        scoreEarned: 0,
      },
    }));
  }, []);

  // Start next round
  const startNextRound = useCallback(() => {
    setGameState(prev => {
      const nextLevel = prev.level + 1;
      return {
        ...prev,
        balls: [createBall(GAME_WIDTH / 2, GAME_HEIGHT - 100, getLevelSpeedMultiplier(nextLevel), true, nextLevel)],
        bricks: createBricks(nextLevel),
        hp: Math.min(prev.maxHp, prev.hp + 30),
        gameStarted: true,
        phase: 'playing',
        paddle: {
          ...prev.paddle,
          width: isMobile ? PADDLE_MOBILE_WIDTH : PADDLE_BASE_WIDTH,
          speed: prev.paddle.baseSpeed,
        },
        roundStats: {
          blocksDestroyed: 0,
          ballsAdded: 0,
          scoreEarned: 0,
        },
      };
    });
  }, []);

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      soundManager.initOnUserInteraction();
      
      keysPressed.current.add(e.key);
      if (e.key === ' ' && gameState.phase === 'start') {
        startGame();
      }
      if (e.key === ' ' && gameState.phase === 'roundComplete') {
        startNextRound();
      }
      if (e.key === ' ' && (gameState.phase === 'gameOver' || gameState.phase === 'victory')) {
        soundManager.stopBGM();
        setGameState(prev => ({ ...prev, phase: 'start' }));
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState.phase, startGame, startNextRound]);

  // Handle touch input (모바일 터치 조작)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      soundManager.initOnUserInteraction();
      
      if (gameState.phase === 'start') {
        startGame();
      } else if (gameState.phase === 'roundComplete') {
        startNextRound();
      } else if (gameState.phase === 'gameOver' || gameState.phase === 'victory') {
        soundManager.stopBGM();
        setGameState(prev => ({ ...prev, phase: 'start' }));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (gameState.phase !== 'playing') return;
      
      const touch = e.touches[0];
      const canvasRect = canvas.getBoundingClientRect();
      const scaleX = GAME_WIDTH / canvasRect.width;
      const touchX = (touch.clientX - canvasRect.left) * scaleX;
      
      setGameState(prev => {
        let newPaddleX = touchX - prev.paddle.width / 2;
        newPaddleX = Math.max(0, Math.min(GAME_WIDTH - prev.paddle.width, newPaddleX));
        return { ...prev, paddle: { ...prev.paddle, x: newPaddleX } };
      });
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
    };
  }, [gameState.phase, startGame, startNextRound]);

  // Game loop
  useEffect(() => {
    if (gameState.phase !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const gameLoop = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 16.67;
      lastTime = currentTime;

      setGameState(prev => {
        if (prev.phase !== 'playing') return prev;
        
        let newState = { ...prev };

        // Handle paddle movement
        if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('a')) {
          newState.paddle = {
            ...newState.paddle,
            x: Math.max(0, newState.paddle.x - newState.paddle.speed * deltaTime),
          };
        }
        if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('d')) {
          newState.paddle = {
            ...newState.paddle,
            x: Math.min(GAME_WIDTH - newState.paddle.width, newState.paddle.x + newState.paddle.speed * deltaTime),
          };
        }

        const newBalls: Ball[] = [];
        let playerBallLost = false;
        let newBallsFromBricks: Ball[] = [];

        newState.balls.forEach(ball => {
          let newBall = { ...ball };
          newBall.x += newBall.vx * deltaTime;
          newBall.y += newBall.vy * deltaTime;

          let wallBounced = false;
          if (newBall.x - newBall.radius < 0) {
            newBall.vx = Math.abs(newBall.vx);
            newBall.x = newBall.radius;
            wallBounced = true;
          }
          if (newBall.x + newBall.radius > GAME_WIDTH) {
            newBall.vx = -Math.abs(newBall.vx);
            newBall.x = GAME_WIDTH - newBall.radius;
            wallBounced = true;
          }
          if (newBall.y - newBall.radius < 0) {
            newBall.vy = Math.abs(newBall.vy);
            newBall.y = newBall.radius;
            wallBounced = true;
          }
          if (wallBounced) {
            soundManager.playWallBounce();
          }

          // 모바일: 패들 위치를 아래로 이동 (터치 영역 확대)
          const paddleTop = isMobile ? GAME_HEIGHT - PADDLE_HEIGHT - 40 : GAME_HEIGHT - PADDLE_HEIGHT - 20;
          if (
            newBall.y + newBall.radius > paddleTop &&
            newBall.y - newBall.radius < paddleTop + PADDLE_HEIGHT &&
            newBall.x > newState.paddle.x &&
            newBall.x < newState.paddle.x + newState.paddle.width &&
            newBall.vy > 0
          ) {
            newBall.vy = -Math.abs(newBall.vy);
            newBall.y = paddleTop - newBall.radius;
            soundManager.playPaddleHit();
            
            const hitPos = (newBall.x - newState.paddle.x) / newState.paddle.width;
            const angle = (hitPos - 0.5) * Math.PI * 0.7;
            const speed = Math.sqrt(newBall.vx ** 2 + newBall.vy ** 2);
            newBall.vx = Math.sin(angle) * speed;
            newBall.vy = -Math.abs(Math.cos(angle) * speed);
          }

          let brickHit = false;
          newState.bricks.forEach(brick => {
            if (!brick.visible || brickHit) return;

            if (
              newBall.x + newBall.radius > brick.x &&
              newBall.x - newBall.radius < brick.x + brick.width &&
              newBall.y + newBall.radius > brick.y &&
              newBall.y - newBall.radius < brick.y + brick.height
            ) {
              brickHit = true;
              
              brick.currentHp -= 1;
              
              newState.score += brick.points;
              newState.roundStats.scoreEarned += brick.points;
              newState.roundStats.blocksDestroyed += 1;
              soundManager.playBrickDestroy();

              if (brick.currentHp <= 0) {
                brick.visible = false;
                if (brick.spawnsBall) {
                  const spawnedBall = createSpawnedBall(
                    brick.x + brick.width / 2,
                    brick.y + brick.height / 2
                  );
                  newBallsFromBricks.push(spawnedBall);
                  newState.roundStats.ballsAdded += 1;
                }
              }

              const overlapLeft = newBall.x + newBall.radius - brick.x;
              const overlapRight = brick.x + brick.width - (newBall.x - newBall.radius);
              const overlapTop = newBall.y + newBall.radius - brick.y;
              const overlapBottom = brick.y + brick.height - (newBall.y - newBall.radius);

              const minOverlapX = Math.min(overlapLeft, overlapRight);
              const minOverlapY = Math.min(overlapTop, overlapBottom);

              if (minOverlapX < minOverlapY) {
                newBall.vx *= -1;
              } else {
                newBall.vy *= -1;
              }
            }
          });

          if (newBall.y - newBall.radius > GAME_HEIGHT) {
            if (ball.isPlayerBall) {
              playerBallLost = true;
            }
          } else {
            newBalls.push(newBall);
          }
        });

        if (playerBallLost) {
          newState.lives -= 1;
          soundManager.playBallLost();
          if (newState.lives <= 0) {
            newState.phase = 'gameOver';
            soundManager.playGameOver();
            soundManager.stopBGM();
          } else {
            newBalls.push(createBall(GAME_WIDTH / 2, GAME_HEIGHT - 100, getLevelSpeedMultiplier(newState.level), true, newState.level));
          }
        }

        newBalls.push(...newBallsFromBricks);

        if (newState.bricks.every(brick => !brick.visible)) {
          if (newState.level >= 10) {
            newState.phase = 'victory';
            soundManager.playVictory();
            soundManager.stopBGM();
          } else {
            newState.phase = 'roundComplete';
            soundManager.playRoundComplete();
          }
        }

        newState.balls = newBalls;
        return newState;
      });

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState.phase, gameState.level]);

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    gameState.bricks.forEach(brick => {
      if (!brick.visible) return;
      ctx.fillStyle = brick.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = brick.color;
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      ctx.shadowBlur = 0;
      
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
    });

    gameState.balls.forEach(ball => {
      ctx.fillStyle = ball.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = ball.color;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      if (ball.isPlayerBall) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // 모바일: 패들을 더 아래로 이동 (터치 영역 확대)
    const paddleY = isMobile ? GAME_HEIGHT - PADDLE_HEIGHT - 40 : GAME_HEIGHT - PADDLE_HEIGHT - 20;
    ctx.fillStyle = gameState.paddleColor;
    ctx.shadowBlur = 15;
    ctx.shadowColor = gameState.paddleColor;
    ctx.beginPath();
    ctx.roundRect(gameState.paddle.x, paddleY, gameState.paddle.width, PADDLE_HEIGHT, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    const hpBarWidth = 200;
    const hpBarHeight = 20;
    const hpBarX = 10;
    const hpBarY = 10;
    
    ctx.fillStyle = '#333';
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    
    const hpPercent = gameState.hp / gameState.maxHp;
    let hpColor = '#2ecc71';
    if (hpPercent < 0.3) hpColor = '#e74c3c';
    else if (hpPercent < 0.6) hpColor = '#f39c12';
    
    ctx.fillStyle = hpColor;
    ctx.fillRect(hpBarX, hpBarY, hpBarWidth * hpPercent, hpBarHeight);
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText(`HP: ${gameState.hp}`, hpBarX + 5, hpBarY + 15);

    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${gameState.score}`, GAME_WIDTH - 10, 25);
    ctx.fillText(`LEVEL: ${gameState.level}`, GAME_WIDTH - 10, 45);
    ctx.fillText(`LIVES: ${gameState.lives}`, GAME_WIDTH - 10, 65);
    ctx.textAlign = 'left';

    // Draw game phase overlays
    ctx.textAlign = 'center';
    
    if (gameState.phase === 'start') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.font = 'bold 48px Arial';
      ctx.fillStyle = '#f1c40f';
      ctx.fillText('ALKANOID', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80);
      
      ctx.font = isMobile ? '20px Arial' : '24px Arial';
      ctx.fillStyle = isMobile ? '#ff6b6b' : '#fff';
      ctx.fillText(isMobile ? 'TAP TO START' : 'PRESS SPACE TO START', GAME_WIDTH / 2, GAME_HEIGHT / 2);
      
      ctx.font = '16px Arial';
      ctx.fillStyle = '#aaa';
      if (!isMobile) {
        ctx.fillText('← → or A/D to move', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
      } else {
        ctx.fillText('Touch to move paddle', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
      }
    }
    
    if (gameState.phase === 'roundComplete') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.font = 'bold 40px Arial';
      ctx.fillStyle = '#2ecc71';
      ctx.fillText('ROUND COMPLETE!', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);
      
      ctx.font = '20px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Score: ${gameState.roundStats.scoreEarned}`, GAME_WIDTH / 2, GAME_HEIGHT / 2);
      ctx.fillText(`Blocks: ${gameState.roundStats.blocksDestroyed}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30);
      ctx.fillText(`Extra Balls: ${gameState.roundStats.ballsAdded}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
      
      ctx.font = isMobile ? '18px Arial' : '20px Arial';
      ctx.fillStyle = isMobile ? '#ff6b6b' : '#f39c12';
      ctx.fillText(isMobile ? 'TAP TO NEXT LEVEL' : 'PRESS SPACE FOR NEXT LEVEL', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 110);
    }
    
    if (gameState.phase === 'gameOver') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.font = 'bold 48px Arial';
      ctx.fillStyle = '#e74c3c';
      ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
      
      ctx.font = '24px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Final Score: ${gameState.score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
      ctx.fillText(`Level Reached: ${gameState.level}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50);
      
      ctx.font = isMobile ? '18px Arial' : '20px Arial';
      ctx.fillStyle = isMobile ? '#ff6b6b' : '#f39c12';
      ctx.fillText(isMobile ? 'TAP TO RESTART' : 'PRESS SPACE TO RESTART', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 100);
    }
    
    if (gameState.phase === 'victory') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.font = 'bold 48px Arial';
      ctx.fillStyle = '#f1c40f';
      ctx.fillText('VICTORY!', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);
      
      ctx.font = '24px Arial';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Final Score: ${gameState.score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2);
      
      ctx.font = isMobile ? '18px Arial' : '20px Arial';
      ctx.fillStyle = isMobile ? '#ff6b6b' : '#f39c12';
      ctx.fillText(isMobile ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE TO PLAY AGAIN', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
    }
    
    ctx.textAlign = 'left';
  }, [gameState, isMobile]);

  return (
    <div 
      ref={containerRef}
      className="flex flex-col items-center justify-center min-h-screen bg-gray-900"
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        padding: 0,
        margin: 0,
      }}
    >
      <canvas
        ref={canvasRef}
        width={GAME_WIDTH}
        height={GAME_HEIGHT}
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          maxWidth: '100vw',
          maxHeight: '100vh',
          touchAction: 'none',
        }}
      />
    </div>
  );
}

export default App;
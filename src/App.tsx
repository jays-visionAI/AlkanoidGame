import { useEffect, useRef, useState, useCallback } from 'react';

// Types
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isPlayerBall: boolean; // 흰색 공만 플레이어 볼
}

interface Brick {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  visible: boolean;
  points: number;
  maxHp: number;    // 내구도 - 이 횟수만큼 맞으면 파괴
  currentHp: number; // 현재 내구도
  spawnsBall: boolean; // 주황, 파랑, 빨강은 추가 볼 생성
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
const PADDLE_HEIGHT = 15;
const BALL_RADIUS = 8;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const BRICK_ROWS = 5;
const BRICK_COLS = 10;

// 블록 색상 정의
const BRICK_COLORS = [
  { color: '#ecf0f1', name: 'white', spawnsBall: false, points: 5, hp: 1 },    // 흰색
  { color: '#f39c12', name: 'orange', spawnsBall: true, points: 10, hp: 2 },   // 주황색
  { color: '#3498db', name: 'blue', spawnsBall: true, points: 8, hp: 2 },       // 파란색
  { color: '#e74c3c', name: 'red', spawnsBall: true, points: 15, hp: 3 },       // 빨간색
  { color: '#f1c40f', name: 'yellow', spawnsBall: false, points: 12, hp: 2 },   // 노란색
];

// ========== Sound System ==========
class SoundManager {
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();
  private enabled: boolean = true;
  private initialized: boolean = false;

  // BGM 관련
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmPlaying: boolean = false;
  private bgmLoop: boolean = true;
  private bgmIntervalId: number | null = null;

  constructor() {
    // AudioContext는 사용자 상호작용 이후才有
  }

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

  // 볼이 벽에 부딪힐 때 (상단/좌우 벽)
  playWallBounce() {
    this.playTone(300, 0.1, 'sine', 0.3);
  }

  // 볼이 패들에 부딪힐 때
  playPaddleHit() {
    this.playTone(400, 0.15, 'sine', 0.4);
  }

  // 볼이 벽돌에 부딪혀 파괴될 때
  playBrickDestroy() {
    this.playTone(500, 0.2, 'square', 0.3);
    setTimeout(() => this.playTone(700, 0.15, 'sine', 0.2), 50);
  }

  // 볼을 잃었을 때
  playBallLost() {
    this.playTone(150, 0.4, 'sawtooth', 0.4);
    setTimeout(() => this.playTone(100, 0.3, 'sine', 0.3), 200);
  }

  // 라운드 완료
  playRoundComplete() {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.3, 'sine', 0.4), i * 150);
    });
  }

  // 게임 오버
  playGameOver() {
    const notes = [392, 349, 311, 261]; // G4, F4, Eb4, C4
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.4, 'sawtooth', 0.3), i * 200);
    });
  }

  // 승리
  playVictory() {
    const notes = [523, 659, 784, 880, 1047, 1319, 1568]; // C5~G6 ascending
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.25, 'sine', 0.5), i * 120);
    });
  }

  // 게임 시작
  playGameStart() {
    this.playTone(440, 0.15, 'sine', 0.4);
    setTimeout(() => this.playTone(880, 0.2, 'sine', 0.4), 100);
  }

  // 라운드 시작
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
      
      // Envelope for better sound
      gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (e) {
      // Silently fail
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  isEnabled() {
    return this.enabled;
  }

  // BGM 시작 (라운지 스타일)
  startBGM() {
    if (!this.enabled || !this.audioContext) return;
    this.ensureContext();
    if (!this.audioContext) return;
    // 이미 재생 중이면 중복 시작 방지
    if (this.bgmPlaying) return;
    try {
      this.bgmGain = this.audioContext.createGain();
      this.bgmGain.connect(this.audioContext.destination);
      this.bgmGain.gain.setValueAtTime(0.12, this.audioContext.currentTime);
      
      // 라운지 스타일 BGM 시작
      this.playLoungeBGM();
      this.bgmPlaying = true;
    } catch (e) {
      console.warn('BGM playback failed:', e);
    }
  }

  private playLoungeBGM() {
    if (!this.audioContext || !this.bgmGain) return;
    
    // 라운지 스타일: 반복되는 멜로디와 드론
    const melodyNotes = [
      261.63, 293.66, 329.63, 349.23, // C4, D4, E4, F4
      293.66, 261.63, 220.00, 261.63, // D4, C4, A3, C4
    ];
    
    const droneFreqs = [130.81, 196.00]; // C3, G3 (드론)
    
    const playNote = (index: number) => {
      if (!this.bgmPlaying || !this.audioContext || !this.bgmGain) return;
      
      // 멜로디 노트
      const osc = this.audioContext.createOscillator();
      const noteGain = this.audioContext.createGain();
      osc.connect(noteGain);
      noteGain.connect(this.bgmGain!);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(melodyNotes[index % melodyNotes.length], this.audioContext.currentTime);
      
      //velope (부드러운 음량 변화)
      noteGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      noteGain.gain.linearRampToValueAtTime(0.25, this.audioContext.currentTime + 0.1);
      noteGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.7);
      
      osc.start(this.audioContext.currentTime);
      osc.stop(this.audioContext.currentTime + 0.8);
      
      // 다음 노트 예약
      setTimeout(() => {
        if (this.bgmPlaying) playNote(index + 1);
      }, 700);
    };
    
    // 드론 시작 (지속低音)
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
        // 드론은 계속 재생
      });
    };
    
    startDrone();
    playNote(0);
  }

  // BGM 정지
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

// Create global sound manager
const soundManager = new SoundManager();

// Utility functions
const createBricks = (level: number): Brick[] => {
  const bricks: Brick[] = [];
  const brickWidth = (GAME_WIDTH - 40) / BRICK_COLS;
  const brickHeight = 25;
  const padding = 5;
  
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      // 레벨에 따라 각 행의 블록 배치를 다양하게
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
  const angle = (Math.random() * 60 + 60) * (Math.PI / 180); // 60-120 degrees
  const speed = (4 + currentLevel * 0.3) * speedMultiplier;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
    vy: -Math.sin(angle) * speed,
    radius: BALL_RADIUS,
    color: isPlayerBall ? '#ffffff' : '#9b59b6', // 흰색 = 플레이어 볼, 보라색 = 추가 볼
    isPlayerBall,
  };
};

const createSpawnedBall = (x: number, y: number): Ball => {
  const angle = Math.random() * Math.PI * 2; // 랜덤 방향
  const speed = 3 + Math.random() * 2;
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: BALL_RADIUS * 0.8, // 약간 작은 볼
    color: '#9b59b6',
    isPlayerBall: false,
  };
};

// 레벨에 따른 속도 계수
const getLevelSpeedMultiplier = (level: number): number => {
  return 1 + (level - 1) * 0.15;
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Start game
  const startGame = useCallback(() => {
    const level = 1;
    soundManager.playGameStart();
    soundManager.startBGM(); // BGM 시작
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
        width: PADDLE_BASE_WIDTH,
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
          width: PADDLE_BASE_WIDTH,
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
      // Initialize sound on first user interaction
      soundManager.initOnUserInteraction();
      
      keysPressed.current.add(e.key);
      if (e.key === ' ' && gameState.phase === 'start') {
        startGame();
      }
      if (e.key === ' ' && gameState.phase === 'roundComplete') {
        startNextRound();
      }
      if (e.key === ' ' && (gameState.phase === 'gameOver' || gameState.phase === 'victory')) {
        soundManager.stopBGM(); // BGM 정지
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
      
      // 게임 상태에 따라 다른 동작
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
      
      // 패들을 터치 위치로 이동 (좌우만)
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
      const deltaTime = (currentTime - lastTime) / 16.67; // Normalize to ~60fps
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

        // Update balls
        const newBalls: Ball[] = [];
        let playerBallLost = false;
        let newBallsFromBricks: Ball[] = [];

        newState.balls.forEach(ball => {
          let newBall = { ...ball };
          newBall.x += newBall.vx * deltaTime;
          newBall.y += newBall.vy * deltaTime;

          // Wall collision (모든 벽에 대해 반사)
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

          // Paddle collision
          const paddleTop = GAME_HEIGHT - PADDLE_HEIGHT - 20;
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
            
            // Angle based on where ball hits paddle
            const hitPos = (newBall.x - newState.paddle.x) / newState.paddle.width;
            const angle = (hitPos - 0.5) * Math.PI * 0.7;
            const speed = Math.sqrt(newBall.vx ** 2 + newBall.vy ** 2);
            newBall.vx = Math.sin(angle) * speed;
            newBall.vy = -Math.abs(Math.cos(angle) * speed);
          }

          // Brick collision - 튕겨나가며 내구도가 0이 되면 파괴
          let brickHit = false;
          newState.bricks.forEach(brick => {
            if (!brick.visible || brickHit) return; // 한 번에 하나만

            if (
              newBall.x + newBall.radius > brick.x &&
              newBall.x - newBall.radius < brick.x + brick.width &&
              newBall.y + newBall.radius > brick.y &&
              newBall.y - newBall.radius < brick.y + brick.height
            ) {
              brickHit = true; // 이번 프레임에서 벽돌 충돌 처리 완료
              
              // 벽돌 내구도 감소
              brick.currentHp -= 1;
              
              // 점수 획득
              newState.score += brick.points;
              newState.roundStats.scoreEarned += brick.points;
              newState.roundStats.blocksDestroyed += 1;
              soundManager.playBrickDestroy();

              // 내구도가 0이 되면 파괴
              if (brick.currentHp <= 0) {
                brick.visible = false;
                // 주황, 파랑, 빨강 블록은 추가 볼 생성
                if (brick.spawnsBall) {
                  const spawnedBall = createSpawnedBall(
                    brick.x + brick.width / 2,
                    brick.y + brick.height / 2
                  );
                  newBallsFromBricks.push(spawnedBall);
                  newState.roundStats.ballsAdded += 1;
                }
              }

              // Determine collision side for bounce
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

          // Ball out of bounds (bottom)
          if (newBall.y - newBall.radius > GAME_HEIGHT) {
            if (ball.isPlayerBall) {
              // 흰색 플레이어 볼이 바닥에 떨어지면
              playerBallLost = true;
            }
            // 추가 볼은 사라져도 영향 없음
          } else {
            newBalls.push(newBall);
          }
        });

        // 플레이어 볼을 잃었을 때
        if (playerBallLost) {
          newState.lives -= 1;
          soundManager.playBallLost();
          if (newState.lives <= 0) {
            newState.phase = 'gameOver';
            soundManager.playGameOver();
            soundManager.stopBGM(); // BGM 정지
          } else {
            // 새로운 흰색 볼 생성
            newBalls.push(createBall(GAME_WIDTH / 2, GAME_HEIGHT - 100, getLevelSpeedMultiplier(newState.level), true, newState.level));
          }
        }

        // 새로 생성된 볼 추가
        newBalls.push(...newBallsFromBricks);

        // Check level complete (모든 블록이 파괴되었는지)
        if (newState.bricks.every(brick => !brick.visible)) {
          if (newState.level >= 10) {
            // 10라운드 완료 - 승리
            newState.phase = 'victory';
            soundManager.playVictory();
            soundManager.stopBGM(); // BGM 정지
          } else {
            // 라운드 완료 - 중간집계 표시
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

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw bricks
    gameState.bricks.forEach(brick => {
      if (!brick.visible) return;
      ctx.fillStyle = brick.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = brick.color;
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
      ctx.shadowBlur = 0;
      
      // 블록 테두리
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
    });

    // Draw balls
    gameState.balls.forEach(ball => {
      ctx.fillStyle = ball.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = ball.color;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      
      // 플레이어 볼(흰색)에는 글로우 효과
      if (ball.isPlayerBall) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Draw paddle
    const paddleY = GAME_HEIGHT - PADDLE_HEIGHT - 20;
    ctx.fillStyle = gameState.paddleColor;
    ctx.shadowBlur = 15;
    ctx.shadowColor = gameState.paddleColor;
    ctx.beginPath();
    ctx.roundRect(gameState.paddle.x, paddleY, gameState.paddle.width, PADDLE_HEIGHT, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw HP bar
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
    ctx.fillText(`HP: ${gameState.hp}/${gameState.maxHp}`, hpBarX + hpBarWidth + 10, hpBarY + 15);

    // Draw lives
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`생명: `, hpBarX, hpBarY + 45);
    
    for (let i = 0; i < gameState.maxLives; i++) {
      ctx.fillStyle = i < gameState.lives ? '#e74c3c' : '#555';
      ctx.beginPath();
      ctx.arc(hpBarX + 70 + i * 25, hpBarY + 40, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`점수: ${gameState.score}`, GAME_WIDTH - 10, 25);
    ctx.textAlign = 'left';

    // Draw level
    ctx.fillText(`라운드: ${gameState.level}/10`, GAME_WIDTH - 150, 25);

    // Round complete screen
    if (gameState.phase === 'roundComplete') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`라운드 ${gameState.level} 완료!`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 80);
      
      ctx.fillStyle = '#fff';
      ctx.font = '22px Arial';
      ctx.fillText(`파괴한 블록: ${gameState.roundStats.blocksDestroyed}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
      ctx.fillText(`생성된 볼: ${gameState.roundStats.ballsAdded}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 15);
      ctx.fillText(`얻은 점수: ${gameState.roundStats.scoreEarned}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 50);
      
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 20px Arial';
      ctx.fillText(`현재 총 점수: ${gameState.score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 95);
      
      ctx.fillStyle = '#3498db';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(`다음 라운드: ${gameState.level + 1}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 135);
      
      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('SPACE 또는 터치로 다음 라운드 시작', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 175);
      ctx.textAlign = 'left';
    }

    // Game over screen
    if (gameState.phase === 'gameOver') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.fillStyle = '#e74c3c';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('게임 오버', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(`최종 라운드: ${gameState.level}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
      ctx.fillText(`최종 점수: ${gameState.score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 45);
      
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('SPACE 또는 터치로 처음부터 다시 시작', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 95);
      ctx.textAlign = 'left';
    }

    // Victory screen
    if (gameState.phase === 'victory') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('🏆 축하합니다! 🏆', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60);
      
      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 32px Arial';
      ctx.fillText('모든 라운드 완료!', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10);
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px Arial';
      ctx.fillText(`최종 점수: ${gameState.score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
      
      ctx.fillStyle = '#3498db';
      ctx.font = 'bold 18px Arial';
      ctx.fillText('SPACE 또는 터치로 처음부터 다시 시작', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 90);
      ctx.textAlign = 'left';
    }

    // Start screen
    if (gameState.phase === 'start') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      ctx.fillStyle = '#3498db';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('알카노이드', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 100);
      
      ctx.fillStyle = '#fff';
      ctx.font = '18px Arial';
      ctx.fillText('← → 또는 A D 키로 패들을 이동하세요', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40);
      ctx.fillText('공을 튕겨 벽돌을 파괴하세요!', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10);
      
      ctx.fillStyle = '#aaa';
      ctx.font = '14px Arial';
      ctx.fillText('총 10라운드까지 도전하세요!', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 20);
      
      // 블록 색상 설명
      ctx.font = '16px Arial';
      ctx.fillStyle = '#ecf0f1';
      ctx.fillText('⬜ 흰색: 플레이어 볼 (이게 떨어지면 생명-1)', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60);
      ctx.fillStyle = '#f39c12';
      ctx.fillText('🟧 주황색: 파괴 시 추가 볼 생성', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 85);
      ctx.fillStyle = '#3498db';
      ctx.fillText('🟦 파란색: 파괴 시 추가 볼 생성', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 110);
      ctx.fillStyle = '#e74c3c';
      ctx.fillText('🟥 빨간색: 파괴 시 추가 볼 생성', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 135);
      ctx.fillStyle = '#f1c40f';
      ctx.fillText('🟨 노란색: 일반 블록', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 160);
      
      ctx.fillStyle = '#2ecc71';
      ctx.font = 'bold 20px Arial';
      ctx.fillText('SPACE 또는 터치로 시작', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 205);
      ctx.textAlign = 'left';
    }
  }, [gameState]);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="border-4 border-gray-700 rounded-lg shadow-2xl touch-none"
        />
        
        {/* Game info panel */}
        <div className="mt-4 bg-gray-800 rounded-lg p-4 w-full max-w-[800px]">
          <h2 className="text-white text-lg font-bold mb-2">게임 규칙</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-white"></span>
              <span className="text-gray-300">흰색 공: 플레이어 볼 (생명 소멸)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-purple-500"></span>
              <span className="text-gray-300">보라색 공: 추가 생성된 볼</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-orange-500"></span>
              <span className="text-gray-300">주황색 블록: 파괴 시 추가 볼 생성</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-blue-500"></span>
              <span className="text-gray-300">파란색 블록: 파괴 시 추가 볼 생성</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-red-500"></span>
              <span className="text-gray-300">빨간색 블록: 파괴 시 추가 볼 생성</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-yellow-500"></span>
              <span className="text-gray-300">노란색 블록: 일반 블록</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-700">
            <p className="text-gray-400 text-sm">💡 라운드가 올라갈수록 볼 속도와 블록 HP가 증가합니다!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

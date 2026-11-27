export const TICK_MS = 1000 / 60;
export const pilots = {
  relay: { name: 'Relay', hp: 92, color: '#98f4d2', damage: 11, windup: 10, speed: 3 },
  coil: { name: 'Coil', hp: 118, color: '#ffc178', damage: 19, windup: 21, speed: 5 },
};

const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function createBattle(pilot, mode, count = 2) {
  const battle = {
    tick: 0, mode, count, wave: 1, cleared: 0, kills: 0,
    player: { ...pilots[pilot], x: 1, y: 1, side: 1, ready: 0, moveReady: 0, shot: null },
    enemies: [], projectiles: [], outcome: '', nextWave: null,
  };
  populate(battle);
  return battle;
}

function populate(battle) {
  const count = battle.mode === 'survival' ? Math.min(5, battle.wave) :
    battle.mode === 'duel' ? 1 : battle.count;
  battle.enemies = Array.from({ length: count }, (_, i) => ({
    ...(battle.mode === 'duel' ? pilots.coil : pilots.relay),
    name: battle.mode === 'duel' ? 'Coil' : 'Sentry',
    hp: battle.mode === 'duel' ? pilots.coil.hp : 22 + 7 * battle.wave,
    damage: battle.mode === 'duel' ? pilots.coil.damage : Math.min(22, 5 + battle.wave),
    x: 4 + i % 2, y: Math.floor(i / 2), side: -1,
    ready: battle.tick + 25 + i * 14, moveReady: battle.tick, shot: null,
  }));
}

function move(battle, actor, direction) {
  if (!directions[direction] || actor.shot || actor.moveReady > battle.tick) return;
  const [dx, dy] = directions[direction];
  const x = actor.x + dx;
  const y = actor.y + dy;
  if (y < 0 || y > 2 || x < 0 || x > 5 || (x < 3) !== (actor.side === 1)) return;
  if (battle.enemies.some(enemy => enemy.hp > 0 && enemy.x === x && enemy.y === y)) return;
  Object.assign(actor, { x, y, moveReady: battle.tick + 8 });
}

function fire(battle, actor, heavy = false) {
  if (actor.shot || actor.ready > battle.tick) return;
  const due = battle.tick + actor.windup + (heavy ? 18 : 0);
  actor.shot = { due, damage: actor.damage * (heavy ? 2 : 1) };
  actor.ready = due + (actor.side > 0 ? 14 : 35);
}

function release(battle, actor) {
  if (actor.hp <= 0 || actor.shot?.due !== battle.tick) return;
  const { side, x, y, speed } = actor;
  battle.projectiles.push({ side, x, y, speed, next: battle.tick, damage: actor.shot.damage });
  actor.shot = null;
}

export function step(battle, input = {}) {
  if (battle.outcome) return;
  battle.tick++;
  if (battle.nextWave !== null) {
    if (battle.tick === battle.nextWave) {
      battle.wave++;
      battle.player.hp = Math.min(battle.player.maxHp, battle.player.hp + 12);
      battle.nextWave = null;
      populate(battle);
    }
    return;
  }
  const player = battle.player;
  player.maxHp ??= player.hp;
  move(battle, player, input.direction);
  if (input.heavy || input.fire) fire(battle, player, input.heavy);
  for (const enemy of battle.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.y === player.y) fire(battle, enemy);
    else if (battle.tick % 17 === 0) move(battle, enemy, enemy.y > player.y ? 'up' : 'down');
  }
  for (const actor of [player, ...battle.enemies]) release(battle, actor);
  battle.projectiles = battle.projectiles.filter(shot => {
    if (battle.tick < shot.next) return true;
    shot.x += shot.side;
    shot.next += shot.speed;
    const targets = shot.side > 0 ? battle.enemies : [player];
    const target = targets.find(actor => actor.hp > 0 && actor.x === shot.x && actor.y === shot.y);
    if (target) {
      target.hp = Math.max(0, target.hp - shot.damage);
      if (target.hp === 0 && shot.side > 0) battle.kills++;
      return false;
    }
    return shot.x >= 0 && shot.x < 6;
  });
  if (player.hp === 0) battle.outcome = 'Defeat';
  else if (battle.enemies.every(enemy => enemy.hp === 0)) {
    battle.cleared++;
    if (battle.mode !== 'survival') battle.outcome = 'Victory';
    else {
      battle.projectiles = [];
      player.shot = null;
      battle.nextWave = battle.tick + 55;
    }
  }
}

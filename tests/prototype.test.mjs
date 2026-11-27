import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBattle, step } from '../prototype/shared/combat.mjs';

test('held movement stays within the field and owned territory', () => {
  const battle = createBattle('relay', 'duel');
  for (let i = 0; i < 40; i++) step(battle, { direction: 'right' });
  assert.equal(battle.player.x, 2);
  for (let i = 0; i < 20; i++) step(battle, { direction: 'up' });
  assert.equal(battle.player.y, 0);
});

test('attacks telegraph, strike and produce deterministic results', () => {
  const run = () => {
    const battle = createBattle('relay', 'duel');
    step(battle, { heavy: true });
    assert.ok(battle.player.shot);
    assert.equal(battle.projectiles.length, 0);
    for (let i = 0; i < 180; i++) step(battle, { fire: true });
    assert.ok(battle.enemies[0].hp < 118);
    return battle;
  };
  assert.deepEqual(run(), run());
});

test('survival generates another formation after clearing a wave', () => {
  const battle = createBattle('coil', 'survival');
  battle.enemies[0].hp = 0;
  step(battle);
  assert.equal(battle.cleared, 1);
  for (let i = 0; i < 55; i++) step(battle);
  assert.equal(battle.wave, 2);
  assert.equal(battle.enemies.length, 2);
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../data.js");
const E = require("../engine.js");
const A = require("../ai.js");

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}\n  ${error.message}`); process.exitCode = 1; }
}

function place(unit, q, r) {
  unit.zone = "board";
  unit.q = q;
  unit.r = r;
  return unit;
}

test("AI policy is deterministic and never performs its own random rolls", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "ai.js"), "utf8");
  assert.doesNotMatch(source, /Math\.random|rollAttack|rerollAttackDie/);
});

test("1 Player asks for a faction and assigns the opposite faction to AI", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const game = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  assert.match(html, /data-player-team="fed"/);
  assert.match(html, /data-player-team="zeon"/);
  assert.match(game, /aiTeam=mode==="ai"\?\(playerTeam==="fed"\?"zeon":"fed"\):null/);
  assert.match(game, /else if\(matchMode==="hotseat"\) showPassOverlay/);
});

test("AI evaluates only its own tactic hand and ignores Response cards during Command timing", () => {
  const state = E.setupGame(() => 0.5);
  const char = place(state.units.find(unit => unit.id === "chars-zaku"), 6, 5);
  place(state.units.find(unit => unit.id === "gundam"), 6, 6);
  state.hands.zeon = ["shattered-formation", "crimson-execution"];
  state.hands.fed = ["rookies-momentum"];
  const card = A.chooseCommandTactic(state, char, D, E);
  assert.equal(card?.id, "crimson-execution");
  assert.equal(card?.team, "zeon");
  assert.equal(card?.timing, "COMMAND");
});

test("AI attack choices are legal and value an enemy Garrison's VP", () => {
  const state = E.setupGame(() => 0.5);
  const char = place(state.units.find(unit => unit.id === "chars-zaku"), 6, 5);
  const gundam = place(state.units.find(unit => unit.id === "gundam"), 6, 7);
  state.garrisons = [{ id: "fed-test", team: "fed", q: 6, r: 6, hp: 1, maxHp: 1 }];
  const choice = A.chooseAttack(state, char, D, E);
  assert.ok(choice);
  assert.equal(choice.target.team, "fed");
  assert.ok(char.weapons.includes(choice.weapon));
  assert.equal(choice.target.id, "fed-test");
  assert.ok(E.distance(char, choice.target) <= choice.weapon.range);
  assert.equal(gundam.zone, "board");
});

test("AI cannot inspect a Mystery Upgrade before it is revealed", () => {
  const state = E.setupGame(() => 0.25);
  const unit = place(state.units.find(item => item.id === "gundam"), 7, 10);
  state.units.filter(item => item.id !== unit.id).forEach(item => { item.zone = "reserve"; item.q = null; item.r = null; });
  const candidates = state.upgrades.slice(0, 3).map(item => E.key(item.q, item.r));
  const first = A.chooseMove(state, unit, candidates, D, E);
  state.upgrades.forEach((item, index) => { item.type = ["strength", "shield", "speed"][index % 3]; });
  const second = A.chooseMove(state, unit, candidates, D, E);
  assert.deepEqual(second, first);
});

test("AI uses the same legal-action entry points as a player and hides its hand", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /E\.reachable\(state,unit,allowance/);
  assert.match(source, /beginAttack\(attack\.weapon\)/);
  assert.match(source, /rescueGarrison\(unit,1,true\)/);
  assert.match(source, /handleHexClick\(q,r\)/);
  assert.match(source, /class="ai-hand-hidden"/);
  assert.match(source, /if\(isAiTurn\(\)&&!aiPerforming\)return/);
});

test("AI response policy spends cards only when their trigger has value", () => {
  const shield = D.tactics.find(card => card.id === "federation-shield");
  const returnFire = D.tactics.find(card => card.id === "return-fire");
  assert.equal(A.shouldUseResponse(shield, { damage: 1 }), false);
  assert.equal(A.shouldUseResponse(shield, { damage: 2 }), true);
  assert.equal(A.shouldUseResponse(returnFire, { canAttack: false }), false);
  assert.equal(A.shouldUseResponse(returnFire, { canAttack: true }), true);
});

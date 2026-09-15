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

test("1 Player asks for the human team and then a different AI opponent", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const game = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  for(const faction of ["fed","zeon","ultimate"])assert.match(html,new RegExp(`data-faction="${faction}"`));
  assert.match(html,/id="secret-team-toggle"/);
  assert.match(html,/id="secret-team-drawer"[^>]*aria-hidden="true"/);
  assert.match(html,/<strong>SECRET TEAM<\/strong><span>CLASSIFIED<\/span>/);
  assert.match(html,/class="secret-team-question"[^>]*>\?<\/span>/);
  assert.doesNotMatch(html,/WING ZERO · VIDAR · BARBATOS/);
  assert.match(game,/setSecretRevealed\(false\)/);
  assert.match(game, /button\.disabled=step===2&&button\.dataset\.faction===firstFaction/);
  assert.match(game, /launch\(selectingMode,\{fed:firstFaction,zeon:faction\}\)/);
  assert.match(game, /humanTeam=nextMode==="ai"\?"fed":null/);
  assert.match(game, /aiTeam=nextMode==="ai"\?"zeon":null/);
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

test("AI uses the same legal-action entry points while 1 Player keeps only the human hand visible", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /E\.reachable\(state,unit,allowance/);
  assert.match(source, /beginAttack\(attack\.weapon,\{rotation:attack\.rotation\}\)/);
  assert.match(source, /rescueGarrison\(unit,1,true\)/);
  assert.match(source, /handleHexClick\(q,r\)/);
  assert.match(source, /const handTeam=matchMode==="ai"\?humanTeam:unit\.team/);
  assert.doesNotMatch(source, /state\.hands\[aiTeam\].*ai-hand-hidden/);
  assert.match(source, /const controllingUnit=modeUnit\(\)/);
  assert.match(source, /controllingUnit&&isAiTeam\(controllingUnit\.team\)&&!aiPerforming/);
  assert.match(source, /if\(unit&&isAiTeam\(unit\.team\)\)\{menu\.innerHTML="";return;\}/);
});

test("AI response policy spends cards only when their trigger has value", () => {
  const shield = D.tactics.find(card => card.id === "federation-shield");
  const returnFire = D.tactics.find(card => card.id === "return-fire");
  assert.equal(A.shouldUseResponse(shield, { damage: 1, hp: 2, activeShields: 0 }), false);
  assert.equal(A.shouldUseResponse(shield, { damage: 1, hp: 1, activeShields: 0 }), true, "lethal Damage 1 must be prevented");
  assert.equal(A.shouldUseResponse(shield, { damage: 2, hp: 4, activeShields: 0 }), true);
  assert.equal(A.shouldUseResponse(shield, { damage: 2, hp: 1, activeShields: 2 }), false, "do not spend the card when active Shields block all damage");
  assert.equal(A.shouldUseResponse(shield, { damage: 4, hp: 1, activeShields: 0, effectiveDamage: 0 }), false, "an explicit effective-damage calculation takes precedence");
  assert.equal(A.shouldUseResponse(returnFire, { canAttack: false }), false);
  assert.equal(A.shouldUseResponse(returnFire, { canAttack: true }), true);
});

test("Drive Them Back requires a reachable enemy Unit, not only a Garrison", () => {
  const state = E.setupGame(() => 0.5);
  const char = place(state.units.find(unit => unit.id === "chars-zaku"), 5, 5);
  state.units.filter(unit => unit.team === "fed").forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  state.garrisons = [{ id: "fed-garrison", team: "fed", q: 5, r: 6, hp: 1, maxHp: 1 }];
  const card = D.tactics.find(item => item.id === "drive-them-back");
  assert.equal(A.commandTacticScore(state, char, card, D, E), -Infinity);
  const gundam = place(state.units.find(unit => unit.id === "gundam"), 5, 6);
  state.garrisons = [];
  assert.ok(Number.isFinite(A.commandTacticScore(state, char, card, D, E)));
  assert.equal(gundam.zone, "board");
});

test("Sudden Pressure values visible enemy Units and Garrisons but rejects blocked LOS", () => {
  const state = E.setupGame(() => 0.5);
  const char = place(state.units.find(unit => unit.id === "chars-zaku"), 2, 2);
  state.units.filter(unit => unit.team === "fed").forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  const card = D.tactics.find(item => item.id === "sudden-pressure");
  state.garrisons = [{ id: "fed-visible", team: "fed", q: 2, r: 3, hp: 1, maxHp: 1 }];
  assert.equal(A.commandTacticScore(state, char, card, D, E), 30);
  state.garrisons = [{ id: "fed-blocked", team: "fed", q: 2, r: 4, hp: 1, maxHp: 1 }];
  state.board[E.key(2, 3)].elevation = 2;
  assert.equal(E.hasLineOfSight(state, char, state.garrisons[0]), false);
  assert.equal(A.commandTacticScore(state, char, card, D, E), -Infinity);
});

test("AI attack valuation counts only Shield upgrades that are still active", () => {
  const state = E.setupGame(() => 0.5);
  const char = place(state.units.find(unit => unit.id === "chars-zaku"), 4, 1);
  const inactiveTarget = place(state.units.find(unit => unit.id === "gundam"), 4, 2);
  const activeTarget = place(state.units.find(unit => unit.id === "guncannon"), 5, 1);
  state.units.filter(unit => unit.team === "fed" && ![inactiveTarget, activeTarget].includes(unit)).forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  state.garrisons = [];
  for (const target of [inactiveTarget, activeTarget]) {
    target.hp = 5;
    target.maxHp = 5;
    target.vp = 4;
    target.statuses = { slow: false, fracture: false, disarm: false };
  }
  inactiveTarget.upgrades = { shield: 2, speed: 0, strength: 0 };
  inactiveTarget.inactiveShields = 2;
  activeTarget.upgrades = { shield: 1, speed: 0, strength: 0 };
  activeTarget.inactiveShields = 0;
  const attacks = A.attacksFrom(state, char, D, E).filter(choice => choice.weapon.id === "char-machine-gun");
  const inactiveScore = attacks.find(choice => choice.target === inactiveTarget).score;
  const activeScore = attacks.find(choice => choice.target === activeTarget).score;
  assert.ok(inactiveScore > activeScore, "face-down Shields must not reduce the estimated kill chance");
});


test("AI commits an allowed stay instead of clicking an invalid current hex", () => {
  const game = fs.readFileSync(path.join(__dirname, "..", "game.js"), "utf8");
  const resolver = game.match(/function scheduleAiResolveMode[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(resolver, /mode\.type==="move"&&mode\.allowStay&&choice\.q===unit\.q&&choice\.r===unit\.r/);
  assert.match(resolver, /completeMove\(unit\.q,unit\.r\)/);
  assert.match(game, /const AI_WATCHDOG_ATTEMPTS = 12/);
  assert.match(game, /attempt>AI_WATCHDOG_ATTEMPTS/);
});

test("AI uses the cheapest Timeline weapon once it has at least a coin-flip finishing chance", () => {
  const state = E.setupGame(() => 0.5);
  const guncannon = place(state.units.find(unit => unit.id === "guncannon"), 2, 2);
  const target = place(state.units.find(unit => unit.id === "chars-zaku"), 2, 3);
  state.units.filter(unit => ![guncannon, target].includes(unit)).forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  state.garrisons = [];
  state.objectives = [];
  target.hp = 2;
  target.maxHp = 8;
  // Elevation advantage puts the TL2 rifle comfortably above a 50/50 kill chance,
  // while the TL3 cannon is much safer. The policy should deliberately take the risk.
  state.board[E.key(2, 2)].elevation = 1;
  state.board[E.key(2, 3)].elevation = 0;
  const attacks = A.attacksFrom(state, guncannon, D, E).filter(choice => choice.target === target);
  const rifle = attacks.find(choice => choice.weapon.id === "gc-rifle");
  const cannon = attacks.find(choice => choice.weapon.id === "low-recoil-240");
  assert.ok(rifle.killChance >= 0.5);
  assert.ok(cannon.killChance > rifle.killChance);
  assert.ok(rifle.score > cannon.score, "AI should accept the cheaper 50%+ finishing line instead of buying certainty");
  assert.equal(A.chooseAttack(state, guncannon, D, E)?.weapon.id, "gc-rifle");
});

test("AI does not spend extra Timeline to overkill a 1 HP Garrison", () => {
  const state = E.setupGame(() => 0.5);
  const guncannon = place(state.units.find(unit => unit.id === "guncannon"), 2, 2);
  state.units.filter(unit => unit.id !== guncannon.id).forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  state.garrisons = [{ id: "zeon-test", team: "zeon", q: 2, r: 3, hp: 1, maxHp: 1 }];
  state.objectives = [];
  const choice = A.chooseAttack(state, guncannon, D, E);
  assert.equal(choice?.target.id, "zeon-test");
  assert.equal(choice?.weapon.id, "gc-rifle");
  assert.equal(choice?.weapon.timeline, 2);
});

test("AI values scarce Energy and Mystery pickups more than stockpiled resources", () => {
  const state = E.setupGame(() => 0.5);
  const gundam = place(state.units.find(unit => unit.id === "gundam"), 5, 5);
  state.units.filter(unit => unit.id !== gundam.id).forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  state.garrisons = [];
  state.objectives = [];
  state.upgrades = [];
  state.energy = [{ id: "energy-test", q: 5, r: 6 }];
  gundam.energy = 0;
  const scarceEnergy = A.positionScore(state, gundam, 5, 6, D, E);
  gundam.energy = 4;
  const stockpiledEnergy = A.positionScore(state, gundam, 5, 6, D, E);
  assert.ok(scarceEnergy > stockpiledEnergy);

  state.energy = [];
  state.upgrades = [{ id: "upgrade-test", q: 5, r: 6, type: "strength", revealed: false }];
  gundam.upgrades = { shield: 0, speed: 0, strength: 0 };
  const scarceUpgrade = A.positionScore(state, gundam, 5, 6, D, E);
  gundam.upgrades = { shield: 1, speed: 1, strength: 1 };
  const stockedUpgrade = A.positionScore(state, gundam, 5, 6, D, E);
  assert.ok(scarceUpgrade > stockedUpgrade);
});

test("AI takes a reachable item when it is close to the best positional choice", () => {
  const state = E.setupGame(() => 0.5);
  const gundam = place(state.units.find(unit => unit.id === "gundam"), 5, 5);
  state.units.filter(unit => unit.id !== gundam.id).forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  state.objectives = [];
  state.energy = [{ id: "energy-test", q: 1, r: 1 }];
  state.upgrades = [];
  state.garrisons = [{ id: "fed-test", team: "fed", q: 10, r: 11, hp: 1, maxHp: 1 }];
  gundam.energy = 0;
  const choice = A.chooseMove(state, gundam, [E.key(1, 1), E.key(10, 10)], D, E, false);
  assert.deepEqual([choice.q, choice.r], [1, 1], "a near-best free pickup should beat a small positional edge");
});


test("AI scores Twin Buster one rotation at a time and preserves the chosen rotation", () => {
  const state=E.setupGame(()=>0.5,{fed:"ultimate",zeon:"fed"});
  const wing=place(state.units.find(unit=>unit.id==="wing-zero-ew"),7,6);
  const enemyA=place(state.units.find(unit=>unit.id==="gundam"),7,4);
  const enemyB=place(state.units.find(unit=>unit.id==="guncannon"),9,7);
  state.units.filter(unit=>![wing,enemyA,enemyB].includes(unit)).forEach(unit=>{unit.zone="reserve";unit.q=null;unit.r=null;});
  state.garrisons=[];
  const twinChoices=A.attacksFrom(state,wing,D,E).filter(choice=>choice.weapon.id==="twin-buster-rifle");
  assert.ok(twinChoices.length>=2,"different legal firing rotations should be separate AI choices");
  assert.ok(twinChoices.every(choice=>Number.isInteger(choice.rotation)&&Array.isArray(choice.aoeTargets)));
  assert.ok(twinChoices.every(choice=>choice.aoeTargets.length<=2));
  const best=A.chooseAttack(state,wing,D,E);
  if(best?.weapon.id==="twin-buster-rifle")assert.ok(Number.isInteger(best.rotation));
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(game,/const preferred=legalChoices\.find\(choice=>choice\.rotation===options\.rotation\)/);
});

test("AI Forward Artillery scoring follows the Guncannon side rather than hard-coded fed", () => {
  const state=E.setupGame(()=>0.5,{fed:"zeon",zeon:"fed"});
  const guncannon=state.units.find(unit=>unit.id==="guncannon");
  state.rescuedGarrisons={fed:4,zeon:1};
  const card=D.tactics.find(item=>item.id==="forward-artillery");
  assert.equal(guncannon.team,"zeon");
  assert.equal(A.commandTacticScore(state,guncannon,card,D,E),39);
});

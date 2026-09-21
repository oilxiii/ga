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
  for(const faction of ["fed","zeon","white-devil","rival","secret","gqx"])assert.match(html,new RegExp(`data-faction="${faction}"`));
  assert.match(html,/id="secret-team-toggle"/);
  assert.match(html,/id="secret-team-drawer"[^>]*aria-hidden="true"/);
  assert.match(html,/<strong>WHITE DEVIL<\/strong>/);
  assert.match(html,/<strong>THE RIVAL<\/strong>/);
  assert.match(html,/<strong>SECRET TEAM<\/strong><span>UNKNOWN SIGNAL<\/span><em>DATA LOCK \/\/ ENCRYPTED<\/em>/);
  assert.match(html,/<strong>GQX<\/strong><span>GQUUUUUUX TEAM<\/span>/);
  assert.match(game,/setSecretRevealed\(false\)/);
  assert.match(game, /button\.disabled=step===2&&button\.dataset\.faction===firstFaction/);
  assert.match(game, /showScenarioStep\(selectingMode,\{fed:firstFaction,zeon:faction\}\)/);
  assert.match(html,/data-scenario="sleeping-leviathan"/);
  assert.match(html,/data-scenario="azure-fang"/);
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
  assert.match(source, /beginAttack\(attack\.weapon,\{rotation:attack\.rotation,onDeclare:/);
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
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"fed"});
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

test("AI can evaluate and choose God Drill from Secret's Tactic hand",()=>{
  const state=E.setupGame(()=>.5,{fed:"secret",zeon:"fed"});
  const mech=place(state.units.find(unit=>unit.id==="mechazawa"),5,5);
  place(state.units.find(unit=>unit.id==="gundam"),5,4);
  state.hands.fed=["god-drill"];
  const choices=A.tacticAttacksFrom(state,mech,D,E);
  assert.ok(choices.some(choice=>choice.tactic.id==="god-drill"&&choice.aoeTargets.includes("gundam")));
});

test("AI can evaluate War Edge with the compact special AoE pattern",()=>{
  const state=E.setupGame(()=>.5,{fed:"rival",zeon:"fed"});
  const epyon=place(state.units.find(unit=>unit.id==="gundam-epyon"),5,5);
  place(state.units.find(unit=>unit.id==="gundam"),5,4);
  state.hands.fed=["war-edge"];
  const choices=A.tacticAttacksFrom(state,epyon,D,E);
  assert.ok(choices.some(choice=>choice.tactic.id==="war-edge"&&choice.aoeTargets.includes("gundam")));
});

test("AI evaluates Breast Fire's six-hex cone and its per-target adjacent bonus",()=>{
  const makeState=(q,r)=>{
    const state=E.setupGame(()=>.5,{fed:"secret",zeon:"fed"});
    state.garrisons=[];
    for(const unit of state.units)unit.zone="reserve";
    const mazinger=place(state.units.find(unit=>unit.id==="mazinger-z"),7,7);
    place(state.units.find(unit=>unit.id==="gundam"),q,r);
    return {state,mazinger};
  };
  const adjacent=makeState(7,6);
  const distant=makeState(7,5);
  const adjacentChoice=A.attacksFrom(adjacent.state,adjacent.mazinger,D,E).find(choice=>choice.weapon.id==="breast-fire"&&choice.rotation===0);
  const distantChoice=A.attacksFrom(distant.state,distant.mazinger,D,E).find(choice=>choice.weapon.id==="breast-fire"&&choice.rotation===0);
  assert.ok(adjacentChoice?.aoeTargets.includes("gundam"));
  assert.ok(distantChoice?.aoeTargets.includes("gundam"));
  assert.ok(Math.abs(adjacentChoice.expectedDamage-distantChoice.expectedDamage-2)<1e-9);
});


test("v80 AI values Vulcan extra dice and special Critical utility",()=>{
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"secret"});
  const hero=place(state.units.find(unit=>unit.id==="hero-gundam"),5,5);
  const eva=place(state.units.find(unit=>unit.id==="eva-01"),5,4);
  const vulcan=hero.weapons.find(weapon=>weapon.id==="hero-vulcan");
  const base={...vulcan,critical:null};
  const withExtra=A.attacksFrom(state,{...hero,weapons:[vulcan]},D,E)[0];
  const withoutExtra=A.attacksFrom(state,{...hero,weapons:[base]},D,E)[0];
  assert.ok(withExtra.expectedDamage>withoutExtra.expectedDamage,"conditional +2 dice should increase expected damage");

  const rival=E.setupGame(()=>0.5,{fed:"rival",zeon:"secret"});
  const epyon=place(rival.units.find(unit=>unit.id==="gundam-epyon"),5,5);
  const mazinger=place(rival.units.find(unit=>unit.id==="mazinger-z"),5,4);
  const rod=epyon.weapons.find(weapon=>weapon.id==="epyon-heat-rod");
  const plain={...rod,critical:null};
  assert.ok(A.attacksFrom(rival,{...epyon,weapons:[rod]},D,E)[0].score>A.attacksFrom(rival,{...epyon,weapons:[plain]},D,E)[0].score,"Disarm should add tactical value");
});

test("v80 AI War Edge evaluation uses one shared Exploit Weakness state per direction",()=>{
  const state=E.setupGame(()=>0.5,{fed:"rival",zeon:"fed"});
  const epyon=place(state.units.find(unit=>unit.id==="gundam-epyon"),5,5);
  const enemyA=place(state.units.find(unit=>unit.id==="gundam"),5,4);
  const enemyB=place(state.units.find(unit=>unit.id==="guncannon"),6,4);
  enemyB.statuses.slow=true;
  state.hands.fed=["war-edge"];
  state.activation={advanced:false,actionUsed:false,commandUsed:{},tacticUsed:{fed:false,zeon:false},timelineSpent:0};
  const attacks=A.tacticAttacksFrom(state,epyon,D,E).filter(choice=>choice.weapon.aoe==="warEdge");
  assert.ok(attacks.length>0);
  assert.equal(epyon.aoeExploitWeakness,undefined,"temporary shared-roll flag must not leak after evaluation");
});

test("v87 AI treats Motorcycle as an independent move before or after Advance",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const preMove=source.match(/function aiUsePreMoveAbility[\s\S]*?function aiAdvance/)?.[0]||"";
  const abilityScore=source.match(/function aiAbilityChoice[\s\S]*?function aiUseAbility/)?.[0]||"";
  const run=source.match(/function runAiTurn[\s\S]*?function showCard/)?.[0]||"";
  assert.match(preMove,/unit\?\.id!=="mechazawa"/);
  assert.match(preMove,/function aiMotorcycleChoice/);
  assert.match(preMove,/E\.reachable\(state,unit,2\)/);
  assert.match(preMove,/useUnitAbility\(unit,1\)/);
  assert.match(abilityScore,/unit\.id==="mechazawa".*aiMotorcycleChoice\(unit\)\?\{slot:1,score:40\}:null/);
  assert.ok(run.indexOf("aiUsePreMoveAbility")<run.indexOf("aiAdvance"));
  assert.ok(run.indexOf("aiAdvance")<run.indexOf("aiUseAbility"));
});


test("v91 AI command checks are per ability and allow Barbatos Annihilate after Exertion",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const choice=source.match(/function aiAbilityChoice[\s\S]*?function aiAbilityScore/)?.[0]||"";
  assert.match(choice,/const can1=canUseCommandAbility\(unit,command1\)/);
  assert.match(choice,/const can2=canUseCommandAbility\(unit,command2\)/);
  const follow=source.match(/function aiUseAnnihilateFollowUp[\s\S]*?function aiFinishTurn/)?.[0]||"";
  assert.match(follow,/canUseCommandAbility\(unit,unit\.command\)/);
  assert.doesNotMatch(follow,/state\.activation\.commandUsed/);
});

test("Beta01 AI resolves Fracture before Shield prevention",()=>{
  const state=E.setupGame(()=>0.5);
  state.garrisons=[];
  state.units.forEach(unit=>{unit.zone="reserve";unit.q=null;unit.r=null;});
  const attacker=place(state.units.find(unit=>unit.id==="guncannon"),5,5);
  const target=place(state.units.find(unit=>unit.id==="chars-zaku"),5,4);
  attacker.tempAccuracy=100;
  attacker.upgrades.strength=0;
  target.hp=target.maxHp=20;
  target.statuses.fracture=true;
  target.upgrades.shield=1;
  target.inactiveShields=0;
  const weapon={id:"fracture-order-test",name:"Fracture Order",range:1,strength:1,timeline:0,effect:"adjacentDamage2"};
  attacker.weapons=[weapon];
  const choice=A.attacksFrom(state,attacker,D,E)[0];
  assert.ok(choice);
  // Natural 1: incoming 2 -> Shield blocks 1 -> 1. Other 9 faces: incoming 3,
  // Fracture raises it to 6, then Shield blocks 1 -> 5. EV = 4.6.
  assert.ok(Math.abs(choice.usefulDamage-4.6)<1e-9,`expected 4.6 useful Damage, got ${choice.usefulDamage}`);
});

test("Beta01 AI applies Shield Break before Combat Damage",()=>{
  const state=E.setupGame(()=>0.5);
  state.garrisons=[];
  state.units.forEach(unit=>{unit.zone="reserve";unit.q=null;unit.r=null;});
  const attacker=place(state.units.find(unit=>unit.id==="guncannon"),5,5);
  const target=place(state.units.find(unit=>unit.id==="chars-zaku"),5,4);
  attacker.tempAccuracy=100;
  attacker.upgrades.strength=0;
  target.hp=target.maxHp=20;
  target.upgrades.shield=1;
  target.inactiveShields=0;
  const weapon={id:"shield-break-order-test",name:"Shield Break Order",range:1,strength:1,timeline:0,effect:"shieldBreak"};
  attacker.weapons=[weapon];
  const choice=A.attacksFrom(state,attacker,D,E)[0];
  assert.ok(choice);
  assert.ok(Math.abs(choice.usefulDamage-0.9)<1e-9,`Shield Break should expose the target before Damage; got ${choice.usefulDamage}`);
});

test("Beta01 AI models Disarm Hit rerolls and disables Critical effects",()=>{
  const state=E.setupGame(()=>0.5);
  state.garrisons=[];
  state.units.forEach(unit=>{unit.zone="reserve";unit.q=null;unit.r=null;});
  const attacker=place(state.units.find(unit=>unit.id==="guncannon"),5,5);
  const target=place(state.units.find(unit=>unit.id==="chars-zaku"),5,4);
  attacker.tempAccuracy=100;
  attacker.upgrades.strength=0;
  attacker.statuses.disarm=true;
  target.hp=target.maxHp=20;
  target.upgrades.shield=0;
  const weapon={id:"disarm-eval-test",name:"Disarm Eval",range:1,strength:1,timeline:0,critical:"damage2"};
  attacker.weapons=[weapon];
  const choice=A.attacksFrom(state,attacker,D,E)[0];
  assert.ok(choice);
  // Initial: Miss .1 / Hit .7 / Crit .2. Disarm rerolls the .7 Hit; its reroll
  // succeeds .9 of the time, while original Criticals stay. EV = .7*.9 + .2 = .83.
  assert.ok(Math.abs(choice.expectedDamage-0.83)<1e-9,`expected 0.83 post-Disarm Damage, got ${choice.expectedDamage}`);
  assert.equal(attacker.statuses.disarm,true,"AI evaluation must not consume the real Disarm status");
});

test("Beta01 AI includes Gundam Newtype Instincts reroll",()=>{
  const state=E.setupGame(()=>0.5);
  state.garrisons=[];
  state.units.forEach(unit=>{unit.zone="reserve";unit.q=null;unit.r=null;});
  const attacker=place(state.units.find(unit=>unit.id==="gundam"),5,5);
  const target=place(state.units.find(unit=>unit.id==="chars-zaku"),5,4);
  attacker.tempAccuracy=100;
  attacker.upgrades.strength=0;
  target.hp=target.maxHp=20;
  target.upgrades.shield=0;
  const weapon={id:"newtype-eval-test",name:"Newtype Eval",range:1,strength:1,timeline:0};
  attacker.weapons=[weapon];
  const choice=A.attacksFrom(state,attacker,D,E)[0];
  assert.ok(choice);
  // One die succeeds on 9/10 faces. Newtype rerolls its only Miss, so success = .99.
  assert.ok(Math.abs(choice.expectedDamage-0.99)<1e-9,`expected 0.99 Damage with Newtype reroll, got ${choice.expectedDamage}`);
});


test("Beta09 AI can evaluate GQX attacks and its shared Tactics",()=>{
  const state=E.setupGame(()=>0.5,{fed:"gqx",zeon:"fed"});
  const gfred=place(state.units.find(unit=>unit.id==="gfred"),5,5);
  const enemy=place(state.units.find(unit=>unit.id==="gundam"),5,8);
  state.hands.fed=["kira-kira","gundam-go","another-timeline"];
  const attack=A.chooseAttack(state,gfred,D,E);
  assert.ok(attack,"GFreD should find a legal ranged attack");
  assert.equal(attack.target.team,'zeon');
  assert.ok(E.legalWeaponTargets(state,gfred,attack.weapon).some(target=>target.id===attack.target.id));
  const card=A.chooseCommandTactic(state,gfred,D,E);
  assert.ok(["kira-kira","gundam-go"].includes(card?.id));
  const another=D.tactics.find(card=>card.id==="another-timeline");
  assert.equal(A.shouldUseResponse(another,{diceCount:5,attackRollDamage:0}),true);
  assert.equal(A.shouldUseResponse(another,{diceCount:5,attackRollDamage:5}),false);
});


test("HARD AI treats a reachable Objective capture as a strategic movement target", () => {
  const state = E.setupGame(() => 0.5);
  state.aiMode = "hard";
  state.round = 9;
  const char = place(state.units.find(unit => unit.id === "chars-zaku"), 5, 8);
  state.units.filter(unit => unit.id !== char.id).forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  state.garrisons = [];
  state.energy = [];
  state.upgrades = [];
  state.objectives = [{ id:"obj-test", q:5, r:5, owner:null }];
  const choice = A.chooseObjectiveMove(state, char, [E.key(5,7),E.key(5,6)], D, E);
  assert.ok(choice);
  assert.equal(choice.q,5);
  assert.equal(choice.r,6);
  assert.equal(choice.action,"capture");
  assert.ok(choice.objectiveScore > 100);
  state.aiMode = "normal";
  assert.equal(A.chooseObjectiveMove(state, char, [E.key(5,7),E.key(5,6)], D, E), null, "NORMAL must keep the old policy");
});

test("HARD AI conserves premium ATTACK tactics and high-TL weapons against a 1 HP Garrison", () => {
  const state = E.setupGame(() => 0.5, { fed:"white-devil", zeon:"zeon" });
  state.aiMode = "hard";
  state.activation = { actionUsed:false, tacticUsed:{fed:false,zeon:false} };
  const hero = place(state.units.find(unit => unit.id === "hero-gundam"), 5, 5);
  state.units.filter(unit => unit.id !== hero.id).forEach(unit => { unit.zone = "reserve"; unit.q = null; unit.r = null; });
  state.garrisons = [{ id:"zeon-test-garrison", team:"zeon", q:5, r:6, hp:1, maxHp:1 }];
  state.objectives = [];
  state.energy = [];
  state.upgrades = [];
  state.hands.fed = ["epic-shot"];
  const normal = A.attacksFrom(state, hero, D, E);
  const cheap = normal.find(choice => choice.weapon.id === "hero-vulcan");
  const expensive = normal.find(choice => choice.weapon.id === "hero-beam-saber");
  assert.ok(cheap?.garrisonEfficient, "the reliable TL2 option should be marked economical");
  assert.ok(expensive?.garrisonEfficiencySuppressed, "the higher-TL finisher should be suppressed");
  assert.ok(cheap.score > expensive.score);
  const tactic = A.tacticAttacksFrom(state, hero, D, E)[0];
  assert.equal(tactic?.tactic?.id, "epic-shot");
  assert.ok(tactic.score < cheap.score - 40, "Epic Shot should be strongly conserved when the normal attack is already reliable");
});

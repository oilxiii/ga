const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../data.js");
const E = require("../engine.js");

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}\n  ${error.message}`); process.exitCode = 1; }
}

test("data pack contains 6 units and 18 unique tactics", () => {
  assert.equal(D.units.length, 6);
  assert.equal(D.tactics.length, 18);
  assert.equal(new Set(D.tactics.map(x => x.id)).size, 18);
});

test("all 24 real card images are present", () => {
  for (const item of [...D.units, ...D.tactics]) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", item.card)), item.card);
  }
});

test("all 18 tactics use the newly supplied high-resolution PNG cards", () => {
  assert.ok(D.tactics.every(card=>card.card.startsWith("assets/cards/tactic-")&&card.card.endsWith(".png")));
  assert.ok(D.tactics.every(card=>fs.statSync(path.join(__dirname,"..",card.card)).size>500000));
});

test("all six units use separate crops from the supplied icon sheet", () => {
  assert.equal(new Set(D.units.map(unit => unit.icon)).size, 6);
  for (const unit of D.units) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", unit.icon)), unit.icon);
    assert.ok(unit.icon.startsWith("assets/icons/"), unit.icon);
  }
});

test("all supplied token types have separate transparent game assets", () => {
  const tokens = ["base-red","base-blue","garrison-red","garrison-blue","energy","mystery","shield","speed","strength","fracture","slow","disarm"];
  for (const token of tokens) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "tokens", `${token}.png`)), token);
  }
});

test("core movement and rescue costs match the rulebook", () => {
  assert.deepEqual(D.rules.advance, {distance:3,timeline:0});
  assert.deepEqual(D.rules.dash, {distance:2,timeline:2});
  assert.deepEqual(D.rules.rescue, {timeline:2,vp:2});
});


test("Advance is Timeline-free in both normal movement and Slow-clearing flow", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.equal(D.rules.advance.timeline,0);
  assert.match(source,/startMove\(D\.rules\.advance\.distance\+unit\.upgrades\.speed,D\.rules\.advance\.timeline,"Advance"/);
  assert.match(source,/unit\.statuses\.slow=false; state\.activation\.advanced=true; payTimeline\(unit,D\.rules\.advance\.timeline\)/);
});

test("Sleeping Leviathan has the confirmed feature counts", () => {
  const s = E.setupGame(() => 0.3125);
  assert.equal(s.garrisons.length, 14);
  assert.ok(s.garrisons.every(garrison=>garrison.hp===1&&garrison.maxHp===1));
  assert.equal(s.objectives.length, 4);
  assert.equal(s.energy.length, 2);
  assert.equal(s.upgrades.length, 9);
  assert.ok(s.units.every(unit => unit.zone === "reserve" && unit.q === null && unit.r === null));
});

test("Sleeping Leviathan terrain matches the unobstructed symmetric reference", () => {
  assert.equal(D.map.elevation1.length, 36);
  assert.equal(D.map.elevation2.length, 7);

  const terrain = new Set([...D.map.elevation1, ...D.map.elevation2].map(([q,r])=>`${q},${r}`));
  const oddqToCube = (q,r) => ({x:q,z:r-(q-(q&1))/2});
  const cubeToOddq = (x,z) => [x,z+(x-(x&1))/2];
  const center = oddqToCube(7,6);
  for (const [q,r] of [...D.map.elevation1, ...D.map.elevation2]) {
    const cube=oddqToCube(q,r);
    const [rq,rr]=cubeToOddq(2*center.x-cube.x,2*center.z-cube.z);
    assert.ok(terrain.has(`${rq},${rr}`), `missing rotated terrain partner for ${q},${r}`);
  }

  const e1 = new Set(D.map.elevation1.map(([q,r])=>`${q},${r}`));
  for (const [q,r] of D.map.elevation1) {
    const cube=oddqToCube(q,r);
    const [rq,rr]=cubeToOddq(2*center.x-cube.x,2*center.z-cube.z);
    assert.ok(e1.has(`${rq},${rr}`), `level 1 mismatch at rotated partner of ${q},${r}`);
  }
});

test("each player may use at most one tactic per activation", () => {
  const s=E.setupGame(()=>0.5);
  assert.deepEqual(s.activation.tacticUsed,{fed:false,zeon:false});
});

test("each faction keeps unused Tactics and draws three more for Phase 2", () => {
  const s = E.setupGame(() => 0.2718);
  const phaseOne = {};
  for (const team of ["fed","zeon"]) {
    assert.equal(s.hands[team].length, 3);
    assert.equal(new Set(s.hands[team]).size, 3);
    assert.equal(s.tacticDecks[team].length, 6);
    assert.ok(s.hands[team].every(id => D.tactics.some(card => card.id === id && card.team === team)));
    phaseOne[team]=s.hands[team].slice();
  }
  s.phase=2;
  E.dealTacticHands(s, () => 0.618);
  assert.equal(s.hands.fed.length, 6);
  assert.equal(s.hands.zeon.length, 6);
  assert.equal(new Set(s.hands.fed).size, 6);
  assert.equal(new Set(s.hands.zeon).size, 6);
  assert.equal(s.tacticDecks.fed.length, 3);
  assert.equal(s.tacticDecks.zeon.length, 3);
  assert.ok(phaseOne.fed.every(id=>s.hands.fed.includes(id)));
  assert.ok(phaseOne.zeon.every(id=>s.hands.zeon.includes(id)));
});

test("used Tactics leave the hand, so Phase 2 hand size reflects cards actually spent", () => {
  const s=E.setupGame(()=>0.2718);
  const fedSpent=s.hands.fed[0];
  const zeonSpent=s.hands.zeon.slice(0,2);
  assert.equal(E.retireTacticCard(s,"fed",fedSpent),true);
  zeonSpent.forEach(id=>assert.equal(E.retireTacticCard(s,"zeon",id),true));
  assert.equal(s.hands.fed.length,2);
  assert.equal(s.hands.zeon.length,1);
  assert.ok(s.retiredTactics.fed.includes(fedSpent));
  assert.ok(zeonSpent.every(id=>s.retiredTactics.zeon.includes(id)));
  E.dealTacticHands(s,()=>0.618);
  assert.equal(s.hands.fed.length,5);
  assert.equal(s.hands.zeon.length,4);
  assert.equal(s.tacticDecks.fed.length,3);
  assert.equal(s.tacticDecks.zeon.length,3);
});

test("each team draws its three extra Tactics independently after all three units pass TL 10", () => {
  const s=E.setupGame(()=>0.2718);
  const firstFed=s.hands.fed.slice();
  const firstZeon=s.hands.zeon.slice();
  s.units.filter(unit=>unit.team==="fed").forEach(unit=>unit.nextAt=11);
  s.units.filter(unit=>unit.team==="zeon").forEach(unit=>unit.nextAt=10);
  assert.equal(E.teamPassedTimeline(s,"fed",10),true);
  assert.equal(E.teamPassedTimeline(s,"zeon",10),false);
  E.dealTacticHand(s,"fed",()=>0.618);
  assert.equal(s.hands.fed.length,6);
  assert.ok(firstFed.every(id=>s.hands.fed.includes(id)));
  assert.deepEqual(s.hands.zeon,firstZeon);
  assert.equal(s.tacticDecks.fed.length,3);
  assert.equal(s.tacticDecks.zeon.length,6);
});

test("Phase 2 draws three Tactics for both factions together only after Phase 1 scoring", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function dealPhaseTwoTacticsTogether\(\)/);
  assert.match(source,/for\(const team of teams\)\{[\s\S]{0,180}E\.dealTacticHand\(state,team\)/);
  assert.doesNotMatch(source,/refreshPassedTeamTactics\(\)/);
  const transition=source.match(/async function runPhaseTransition\(finalPhase=false\) \{[\s\S]*?\n  \}/)?.[0]||"";
  const scorePos=transition.indexOf("await scoreClaimedObjectives(claimed,epoch)");
  const drawPos=transition.indexOf("dealPhaseTwoTacticsTogether()");
  const phasePos=transition.indexOf("state.phase=2");
  assert.ok(scorePos>=0 && phasePos>scorePos && drawPos>phasePos,"Phase 1 scores first, then Phase 2 starts and both hands draw together");
  assert.match(transition,/PHASE 2 READY/);
});

test("destruction can still push a Zeon unit beyond TL 10 without triggering an early Tactic draw", () => {
  const state=E.setupGame(()=>0.37);
  const zeon=state.units.filter(unit=>unit.team==="zeon");
  zeon[0].nextAt=11;zeon[1].nextAt=12;zeon[2].nextAt=9;zeon[2].hp=0;
  E.defeatUnit(state,zeon[2],"fed");
  assert.equal(zeon[2].nextAt,11,"destruction can push the last Zeon unit over TL 10");
  assert.equal(E.teamPassedTimeline(state,"zeon",10),true);
  assert.equal(state.hands.zeon.length,3,"hand remains unchanged until the shared Phase 2 draw");
});

test("a reserve unit deploys on its own Base, never around it", () => {
  const s = E.setupGame(() => 0.5);
  const char = s.units.find(unit => unit.id === "chars-zaku");
  assert.equal(E.beginDeploy(s,char), true);
  assert.deepEqual([char.q,char.r],[7,0]);
  assert.equal(char.zone,"deploying");
  assert.equal(E.unitAt(s,7,0),null);
  const line = s.units.find(unit => unit.id === "zaku-line");
  assert.equal(E.beginDeploy(s,line), true);
  assert.deepEqual([line.q,line.r],[7,0]);
  assert.equal(line.zone,"deploying");
});

test("timeline chooses only units on the current 1-10 slot", () => {
  const s=E.setupGame(()=>0.5);
  assert.equal(s.currentTick,1);
  assert.equal(E.chooseNextUnit(s).id,"chars-zaku");
  s.currentTick=2;
  const slotTwo=[];
  let unit;
  while((unit=E.chooseNextUnit(s))){slotTwo.push(unit.id);s.resolvedThisTick.add(unit.id);}
  assert.deepEqual(slotTwo,["gundam","guncannon","zaku-line","zaku-enforcer"]);
  s.resolvedThisTick.clear();s.currentTick=3;
  assert.equal(E.chooseNextUnit(s).id,"guntank");
  assert.deepEqual([1,10,11,20].map(E.timelineSlot),[1,10,1,10]);
});

test("mystery upgrades draw 9 without exceeding five of a type", () => {
  for (let seed = 1; seed <= 80; seed++) {
    let n = seed;
    const rng = () => ((n = (n * 48271) % 2147483647) / 2147483647);
    const s = E.setupGame(rng);
    const counts = s.upgrades.reduce((acc,x) => (acc[x.type]=(acc[x.type]||0)+1, acc), {});
    assert.equal(s.upgrades.length, 9);
    assert.ok(Object.values(counts).every(count => count <= 5));
  }
});

test("hex distance and neighbours are consistent", () => {
  assert.equal(E.neighbors(7, 6).length, 6);
  assert.equal(E.distance({q:7,r:6},{q:7,r:6}), 0);
  assert.equal(E.distance({q:7,r:6},{q:8,r:6}), 1);
  assert.equal(E.distance({q:0,r:0},{q:4,r:4}), E.distance({q:4,r:4},{q:0,r:0}));
});

test("movement charges one extra point per elevation climbed", () => {
  const s = E.setupGame(() => 0.5);
  const unit = s.units.find(x => x.id === "gundam");
  unit.zone="board"; unit.q = 5; unit.r = 5;
  Object.values(s.board).forEach(hex => { hex.elevation=0; });
  s.board[E.key(6,5)].elevation = 1;
  assert.equal(E.reachable(s,unit,1).has(E.key(6,5)),false);
  assert.equal(E.reachable(s,unit,2).has(E.key(6,5)),true);
  s.board[E.key(6,5)].elevation = 2;
  assert.equal(E.reachable(s,unit,2).has(E.key(6,5)),false);
  assert.equal(E.reachable(s,unit,3).has(E.key(6,5)),true);
});

test("downhill is free and jumping keeps the starting elevation baseline", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam");
  unit.zone="board";unit.q=5;unit.r=5;
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  s.board[E.key(5,5)].elevation=1;
  s.board[E.key(7,4)].elevation=1;
  assert.equal(E.reachable(s,unit,1).has(E.key(6,5)),true);
  assert.equal(E.reachable(s,unit,2).has(E.key(7,4)),true);
});

test("movement still excludes occupied hexes", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam");
  const blocker=s.units.find(x=>x.id==="guncannon");
  unit.zone="board";unit.q=5;unit.r=5;
  blocker.zone="board";blocker.q=6;blocker.r=5;
  assert.equal(E.reachable(s,unit,3).has(E.key(6,5)),false);
});

test("garrisons block movement until they are removed", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam");
  unit.zone="board";unit.q=5;unit.r=5;
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  s.garrisons=[{id:"test-garrison",team:"fed",q:6,r:5,hp:1,maxHp:1}];
  assert.ok(E.garrisonAt(s,6,5));
  assert.equal(E.reachable(s,unit,3).has(E.key(6,5)),false);
  s.garrisons=[];
  assert.equal(E.reachable(s,unit,1).has(E.key(6,5)),true);
});

test("a unit may move through an allied Garrison but never end its movement there", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam"); // fed
  unit.zone="board";unit.q=5;unit.r=5;
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  s.garrisons=[{id:"ally-garrison",team:"fed",q:6,r:5,hp:1,maxHp:1}];
  const reach=E.reachable(s,unit,3);
  assert.equal(reach.has(E.key(6,5)),false, "cannot end on top of an allied Garrison");
  assert.equal(reach.has(E.key(7,5)),true, "must still be able to pass through it to reach hexes beyond");
});

test("a jumping unit may move over an enemy Garrison at a lower elevation", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam"); // fed
  unit.zone="board";unit.q=5;unit.r=5;
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  s.board[E.key(5,5)].elevation=1; // unit starts elevated, so it Jumps
  s.garrisons=[{id:"enemy-garrison",team:"zeon",q:6,r:5,hp:1,maxHp:1}]; // ground level, lower than the unit
  const reach=E.reachable(s,unit,3);
  assert.equal(reach.has(E.key(6,5)),false, "still cannot end on top of the enemy Garrison");
  assert.equal(reach.has(E.key(7,5)),true, "Jumping lets it bypass an enemy Garrison at a lower elevation");
});

test("a unit may move through an allied unit but never end its movement there", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam"); // fed
  const ally=s.units.find(x=>x.id==="guncannon"); // fed
  unit.zone="board";unit.q=5;unit.r=5;
  ally.zone="board";ally.q=6;ally.r=5;
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  const reach=E.reachable(s,unit,3);
  assert.equal(reach.has(E.key(6,5)),false, "cannot end on top of an ally");
  assert.equal(reach.has(E.key(7,5)),true, "must still be able to pass through the ally");
});

test("allied units and allied Garrisons never block Line of Sight", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(x=>x.id==="gundam"); // fed
  const allyBetween=s.units.find(x=>x.id==="guncannon"); // fed
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  attacker.q=2;attacker.r=2;
  const target={q:4,r:3,team:"zeon"};
  const middle=E.line(attacker,target)[1];
  allyBetween.zone="board";allyBetween.q=middle.q;allyBetween.r=middle.r;
  assert.equal(E.hasLineOfSight(s,attacker,target),true);

  s.garrisons=[{id:"ally-los-garrison",team:"fed",q:middle.q,r:middle.r,hp:1,maxHp:1}];
  allyBetween.zone="reserve";
  assert.equal(E.hasLineOfSight(s,attacker,target),true);
});

test("enemy units and enemy Garrisons block Line of Sight at the shared elevation", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(x=>x.id==="gundam"); // fed
  const enemyBetween=s.units.find(x=>x.id==="guncannon");
  enemyBetween.team="zeon";
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  attacker.q=2;attacker.r=2;
  const target={q:4,r:3,team:"zeon"};
  const middle=E.line(attacker,target)[1];
  enemyBetween.zone="board";enemyBetween.q=middle.q;enemyBetween.r=middle.r;
  assert.equal(E.hasLineOfSight(s,attacker,target),false);

  enemyBetween.zone="reserve";
  s.garrisons=[{id:"enemy-los-garrison",team:"zeon",q:middle.q,r:middle.r,hp:1,maxHp:1}];
  assert.equal(E.hasLineOfSight(s,attacker,target),false);
});

test("all tactic summaries preserve their decisive card conditions", () => {
  const byId=id=>D.tactics.find(card=>card.id===id).text;
  assert.match(byId("built-to-last"),/ต่อ Upgrade Token ทุก 1 อัน/);
  assert.match(byId("entrenched-position"),/Guntank/);
  assert.match(byId("forward-artillery"),/ต่อ Garrison ทุก 1 อัน/);
  assert.match(byId("last-shot-counts"),/Timeline -1/);
  assert.match(byId("return-fire"),/โจมตีกลับทันที/);
  assert.match(byId("rookies-momentum"),/7 และ 8/);
  assert.match(byId("lock-down"),/Range 3/);
  assert.match(byId("shield-recovery"),/Shield Upgrade 1/);
  assert.match(byId("federation-shield"),/ลง 2/);
  assert.match(byId("rescued-extraction"),/Timeline 0/);
  assert.match(byId("logistics-relay"),/Speed Upgrade 1/);
  assert.match(byId("iron-grip"),/Damage 3/);
  assert.match(byId("sudden-pressure"),/Garrison/);
  assert.match(byId("exploited-chaos"),/ฝ่ายโจมตี/);
  assert.match(byId("shattered-formation"),/Damage 2/);
  assert.match(byId("drive-them-back"),/เคลื่อนที่เพิ่ม 2 ช่อง/);
  assert.match(byId("breaking-line"),/Range 3/);
  assert.match(byId("crimson-execution"),/Dash เพิ่ม 1 ครั้ง/);
});

test("UI requires confirmation and Char Kick only follows Dash", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/id="confirm-tactic"/);
  assert.match(source,/id="cancel-mode"/);
  assert.match(source,/movementType==="dash"/);
  assert.match(source,/type:"char-kick"/);
  assert.match(source,/D\.rules\.advance\.distance\+unit\.upgrades\.speed/);
  assert.match(source,/D\.rules\.dash\.distance\+\(unit\.id==="chars-zaku"\?1:0\)/);
  assert.match(source,/"Crimson Dash"/);
  assert.match(source,/D\.rules\.dash\.distance\+1,0,"Crimson Dash"/);
  assert.match(source,/ไม่ทำลาย Upgrade/);
  assert.match(source,/Return Fire ที่ยืนยันแล้ว/);
});

test("Char Kick selection has an urgent red target treatment", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/char-kick-target/);
  assert.match(source,/char-kick-victim/);
  assert.match(source,/char-kick-menu/);
  assert.match(source,/เลือกเป้าหมายสีแดง/);
  assert.match(source,/DAMAGE 1/);
  assert.match(css,/\.hex\.char-kick-target polygon/);
  assert.match(css,/\.unit-node\.char-kick-victim \.unit-base/);
  assert.match(css,/\.unit-command-menu\.char-kick-menu/);
  assert.match(css,/@keyframes char-kick-hex-pulse/);
});

test("battlefield UI uses the compact online title, switchable command placement, and collapsible log", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(html,/GUNDAM ASSEMBLE \/\/ ONLINE/);
  assert.doesNotMatch(html,/GUNDAM ASSEMBLE \/\/ HOT-SEAT/);
  assert.doesNotMatch(html,/<h1>SLEEPING LEVIATHAN<\/h1>/);
  assert.doesNotMatch(html,/id="map-hint"/);
  assert.doesNotMatch(css,/\.map-hint/);
  assert.match(html,/id="log-toggle"[^>]+aria-expanded="false"/);
  assert.match(html,/id="combat-feed" class="combat-feed board-feed"/);
  assert.doesNotMatch(html,/TACTICAL MAP/);
  assert.doesNotMatch(html,/id="rules-btn"/);
  assert.doesNotMatch(html,/class="legend"/);
  assert.ok(html.indexOf('id="active-hud"') < html.indexOf('id="board-wrap"'));
  assert.match(css,/\.hud-stack \{[\s\S]*position: static;/);
  assert.match(css,/\.board-feed \{[\s\S]*display: none;/);
  assert.match(css,/\.board-feed\.open \{ display: block; \}/);
  assert.match(source,/let menuPlacement = "right"/);
  assert.match(source,/menuPlacement=menuPlacement==="right"\?"left":"right"/);
  assert.match(source,/unitCenter<boardBounds\.left\+boardBounds\.width\/2\?"right":"left"/);
  assert.match(source,/menuPlacement==="right"\?screen\.x\+30:screen\.x-menuWidth-30/);
  assert.match(source,/document\.addEventListener\("pointerdown"/);
});

test("map shows compact status, upgrade, and temporary buff badges on units", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/function unitMapEffects/);
  assert.match(source,/renderUnitEffectBadges\(unit,cx,cy\)/);
  for (const type of ["shield","speed","strength","fracture","slow","disarm"]) assert.match(source,new RegExp(`"${type}"`));
  assert.match(source,/unit\.tempStrength/);
  assert.match(source,/unit\.critBoost/);
  assert.match(source,/unit\.nextAttackDiscount/);
  assert.match(css,/\.map-effect-badge\.status\.fracture/);
  assert.match(css,/#7136a8/);
});

test("every combat dice roll uses the centered animated d10 reveal", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/function showDiceRoll/);
  assert.match(source,/showDiceRoll\(result,weapon\.name/);
  assert.match(source,/showDiceRoll\(result,`RETURN FIRE/);
  assert.match(source,/showDiceRoll\(lastDice,"SATURATED FIRE"/);
  assert.match(css,/\.dice-roll-overlay/);
  assert.match(css,/\.rolling-d10\.revealed\.critical/);
  assert.match(css,/@keyframes critical-pulse/);
});

test("line of sight is blocked by higher terrain", () => {
  const s = E.setupGame(() => 0.5);
  const a = {q:2,r:2};
  const b = {q:4,r:3};
  const middle = E.line(a,b)[1];
  s.board[E.key(a.q,a.r)].elevation = 0;
  s.board[E.key(b.q,b.r)].elevation = 0;
  s.board[E.key(middle.q,middle.r)].elevation = 2;
  assert.equal(E.hasLineOfSight(s,a,b), false);
});

test("attack roll classifies hit and critical dice", () => {
  const s = E.setupGame(() => 0.5);
  const a = s.units.find(x => x.id === "gundam");
  const b = s.units.find(x => x.id === "chars-zaku");
  a.upgrades = {shield:0,speed:0,strength:0};
  const values = [0.09,0.39,0.79,0.89,0.99];
  let i = 0;
  const result = E.rollAttack(s,a,b,a.weapons[1],() => values[i++]);
  assert.deepEqual(result.dice,[1,4,8,9,10]);
  assert.equal(result.hits,2);
  assert.equal(result.criticals,2);
  assert.equal(result.damage,6);
});

test("all twelve weapons preserve the Unit Card critical effects", () => {
  const expected={
    "beam-saber":"gainStrength","beam-rifle":"damage2",
    "gc-rifle":"slow","low-recoil-240":"dashRescueTimeline0",
    "bop-missile":"fracture","low-recoil-120":"slow",
    "char-heat-hawk":"fracture","char-machine-gun":"dashTimeline0",
    "cracker-grenade":"splashDamage1","bazooka":"rescuedGarrisonDamage",
    "shoulder-bash":"push2","enforcer-heat-hawk":"slow"
  };
  const weapons=D.units.flatMap(unit=>unit.weapons);
  assert.equal(weapons.length,12);
  for(const weapon of weapons)assert.equal(weapon.critical,expected[weapon.id],weapon.id);
});

test("Beam Saber Critical grants Gundam Strength against units and Garrisons", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function applyAttackerCritical\(attacker,weapon,result\)/);
  assert.match(source,/result\.criticals<1\|\|weapon\.critical!=="gainStrength"/);
  assert.match(source,/grantUpgrade\(attacker,"strength",1\)/);
  assert.match(source,/Beam Saber Critical:.*Strength Upgrade 1/);
  assert.ok((source.match(/applyAttackerCritical\(attacker,weapon,result\)/g)||[]).length>=3);
});

test("critical bonus damage applies only to the card's intended target", () => {
  const s=E.setupGame(()=>0.5);
  const target=s.units.find(unit=>unit.id==="guntank");
  target.zone="board";target.q=10;target.r=10;
  const cases=[
    ["gundam","beam-rifle",3],
    ["zaku-line","bazooka",1],
    ["zaku-line","cracker-grenade",1]
  ];
  for(const [unitId,weaponId,damage] of cases){
    const attacker=s.units.find(unit=>unit.id===unitId);attacker.zone="board";attacker.q=2;attacker.r=2;
    const weapon=attacker.weapons.find(item=>item.id===weaponId);
    let roll=0;const result=E.rollAttack(s,attacker,target,weapon,()=>roll++===0?0.89:0);
    assert.equal(result.criticals,1,weaponId);
    assert.equal(result.damage,damage,weaponId);
  }
});

test("Bazooka Critical gains +1 damage per Garrison rescued by the Zeon faction", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(unit=>unit.id==="zaku-line");
  const target=s.units.find(unit=>unit.id==="guntank");
  const char=s.units.find(unit=>unit.id==="chars-zaku");
  attacker.zone="board";attacker.q=2;attacker.r=2;
  target.zone="board";target.q=4;target.r=2;
  const weapon=attacker.weapons.find(item=>item.id==="bazooka");
  for(const rescued of [0,1,2,3]){
    s.rescuedGarrisons.zeon=0;
    attacker.rescuedGarrisons=0;char.rescuedGarrisons=0;
    for(let i=0;i<rescued;i++) E.recordGarrisonRescue(s,i%2?attacker:char);
    let roll=0;
    const result=E.rollAttack(s,attacker,target,weapon,()=>roll++===0?0.89:0);
    assert.equal(result.criticals,1);
    assert.equal(result.criticalBonusDamage,rescued);
    assert.equal(result.damage,1+rescued);
  }
});

test("Bazooka Critical has a repeated shell effect for each rescued Garrison", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function playBazookaCriticalVolley/);
  assert.match(source,/for\(let i=0;i<bonus;i\+\+\)/);
  assert.match(source,/\+1 DAMAGE/);
  assert.match(source,/criticalBonusDamage/);
});

test("accuracy bonuses never turn a natural hit into a miss", () => {
  const s=E.setupGame(()=>0.5);
  const guntank=s.units.find(unit=>unit.id==="guntank");
  const target=s.units.find(unit=>unit.id==="chars-zaku");
  guntank.zone="board";guntank.q=2;guntank.r=2;guntank.upgrades.shield=1;guntank.upgrades.speed=1;
  target.zone="board";target.q=3;target.r=2;
  let roll=0;const result=E.rollAttack(s,guntank,target,guntank.weapons[0],()=>roll++===0?0.79:0);
  assert.equal(result.accuracy,1);
  assert.equal(result.results[0],"hit");
});

test("Unit Card ongoing attack modifiers are active", () => {
  const s=E.setupGame(()=>0.5);
  const target=s.units.find(unit=>unit.id==="gundam");target.zone="board";target.q=5;target.r=5;
  const guncannon=s.units.find(unit=>unit.id==="guncannon");guncannon.zone="board";guncannon.q=4;guncannon.r=5;guncannon.upgrades.shield=1;guncannon.upgrades.speed=1;
  const courage=E.rollAttack(s,guncannon,target,guncannon.weapons[0],()=>0.69);
  assert.ok(courage.results.every(result=>result==="critical"));
  const enforcer=s.units.find(unit=>unit.id==="zaku-enforcer");enforcer.zone="board";enforcer.q=6;enforcer.r=5;target.statuses.slow=true;
  const suppressing=E.rollAttack(s,enforcer,target,enforcer.weapons[0],()=>0);
  assert.equal(suppressing.dice.length,enforcer.weapons[0].strength+1);
});

test("Guntank objective bonus adds one damage around an Objective", () => {
  const s=E.setupGame(()=>0.5);
  const guntank=s.units.find(unit=>unit.id==="guntank");const target=s.units.find(unit=>unit.id==="chars-zaku");
  guntank.zone="board";guntank.q=2;guntank.r=2;target.zone="board";target.q=s.objectives[0].q;target.r=s.objectives[0].r;
  let roll=0;const result=E.rollAttack(s,guntank,target,guntank.weapons[0],()=>roll++===0?0.49:0);
  assert.equal(result.hits,1);assert.equal(result.damage,2);
});

test("Newtype Instincts rerolls exactly one missed Gundam die and never a Hit/Critical", () => {
  const s=E.setupGame(()=>0.5);
  const gundam=s.units.find(unit=>unit.id==="gundam");
  const char=s.units.find(unit=>unit.id==="chars-zaku");
  gundam.zone="board";gundam.q=2;gundam.r=2;
  char.zone="board";char.q=3;char.r=2;
  const values=[0,0.39];let i=0;
  const result=E.rollAttack(s,gundam,char,gundam.weapons[0],()=>values[i++]);
  assert.deepEqual(result.results,["miss","hit"]);
  assert.equal(result.rerollEligible,true);
  assert.equal(E.rerollAttackDie(s,gundam,char,gundam.weapons[0],result,1,()=>0.89),false,"a Hit cannot be rerolled");
  assert.equal(result.rerollEligible,true,"an illegal choice must not consume Newtype Instincts");
  assert.equal(E.rerollAttackDie(s,gundam,char,gundam.weapons[0],result,0,()=>0.89),true);
  assert.deepEqual(result.dice,[9,4]);
  assert.deepEqual(result.results,["critical","hit"]);
  assert.equal(result.rerollEligible,false);
});

test("Newtype Instincts UI offers only missed dice and uses a separate reroll animation", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const body=source.match(/function offerNewtypeReroll[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(body,/result\.results\.map\(\(outcome,index\)=>outcome==="miss"\?index:-1\)\.filter\(index=>index>=0\)/);
  assert.match(body,/data-reroll-index/);
  assert.match(body,/id="skip-newtype"/);
  assert.match(source,/showDiceRoll\(rerollView,"NEWTYPE INSTINCTS"/);
});

test("Rescue the Mechanics opens an optional response and repairs a damaged ally", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function offerRescueMechanics/);
  assert.match(source,/function selectAlly/);
  assert.match(source,/id="confirm-rescue-mechanics"/);
  assert.match(source,/id="skip-rescue-mechanics"/);
  assert.match(source,/Rescue the Mechanics: เลือก Unit ฝ่ายเรา 1 ตัว/);
  assert.match(source,/ally\.hp\+=repaired/);
  assert.match(source,/target=>target\.hp<target\.maxHp/);
  const zaku=D.units.find(unit=>unit.id==="zaku-line");
  assert.match(zaku.response.text,/ซ่อมแซม Damage 2/);
});

test("Char Machine Gun Critical offers a Timeline 0 Dash before Char Kick", () => {
  const char=D.units.find(unit=>unit.id==="chars-zaku");
  const machineGun=char.weapons.find(weapon=>weapon.id==="char-machine-gun");
  assert.equal(machineGun.critical,"dashTimeline0");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function offerWeaponCriticalFollowUp/);
  assert.match(source,/startMoveFor\(attacker,D\.rules\.dash\.distance\+1,0,"Machine Gun Critical Dash",\(\)=>afterUnitMove\(attacker,"dash",onComplete\)/);
  assert.match(source,/openPostCombatResponses\([\s\S]*offerWeaponCriticalFollowUp\(attacker,weapon,result\)/);
});

test("Guncannon Cannon Critical performs a Timeline 0 Dash then optional Rescue", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/startMoveFor\(attacker,D\.rules\.dash\.distance,0,"240mm Critical Dash"/);
  assert.match(source,/function offerGuncannonCriticalRescue/);
  assert.match(source,/rescueGarrison\(unit,1,false,null,onComplete\)/);
  assert.match(source,/id="confirm-critical-rescue"/);
});

test("Cracker Grenade uses one center target and splash is 0 normally / 1 on Critical", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function resolveSplashDamage/);
  assert.match(source,/const amount=weapon\.critical==="splashDamage1"&&result\.criticals>0\?1:0/);
  assert.match(source,/adjacentUnits=E\.livingEnemies\(state,attacker\)\.filter/);
  assert.match(source,/adjacentGarrisons=state\.garrisons\.filter/);
  assert.match(source,/Cracker Grenade AOE/);
  assert.match(source,/Damage 0 \(Critical = 1\)/);
});

test("post-combat Responses remain available after a zero-damage attack", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const body=source.match(/function availablePostCombat\([\s\S]*?\n  \}/)?.[0]||"";
  assert.doesNotMatch(body,/damage<=0/);
});

test("White Base Unity chooses an Upgrade and Zeon Zealotry requires a damaged enemy", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function chooseWhiteBaseUpgrade/);
  assert.match(source,/totalUpgrades\(x\)<=1/);
  assert.match(source,/data-white-base-upgrade/);
  assert.match(source,/damagedEnemies=E\.livingEnemies\(state,unit\)\.filter\(enemy=>enemy\.hp<enemy\.maxHp\)/);
  assert.match(source,/destinationFilter:hex=>damagedEnemies\.some/);
});

test("shield flips face down after absorbing damage and reactivates next activation", () => {
  const target = {hp:10,upgrades:{shield:1},inactiveShields:0,statuses:{fracture:true}};
  const result = E.applyDamage(target,4);
  assert.equal(result.blocked,1);
  assert.equal(result.taken,6);
  assert.equal(target.hp,4);
  assert.equal(target.upgrades.shield,1,"the Shield Upgrade remains owned");
  assert.equal(target.inactiveShields,1,"the used Shield is face down/inactive");
  assert.equal(target.statuses.fracture,false);
  const second = E.applyDamage(target,1);
  assert.equal(second.blocked,0,"a face-down Shield cannot absorb again before reactivation");
  assert.equal(E.reactivateShields(target),1);
  assert.equal(target.inactiveShields,0);
  const third = E.applyDamage(target,1);
  assert.equal(third.blocked,1,"the Shield is active again after reactivation");
  assert.equal(target.upgrades.shield,1);
});

test("objectives score only at phase scoring", () => {
  const s = E.setupGame(() => 0.5);
  s.objectives[0].owner="fed";
  s.objectives[1].owner="zeon";
  s.objectives[2].owner="zeon";
  E.scoreObjectives(s);
  assert.deepEqual(s.vp,{fed:1,zeon:2});
});

test("objective control is resolved by majority contest at the end of activation", () => {
  const s=E.setupGame(()=>0.5);
  const objective=s.objectives[0];
  const fed=s.units.find(unit=>unit.id==="gundam");
  assert.equal(objective.owner,null);
  fed.zone="board";fed.q=objective.q;fed.r=objective.r;
  E.pickupAt(s,fed);
  assert.equal(objective.owner,null);
  let result=E.contestObjectives(s,fed)[0];
  assert.equal(result.action,"captured");
  assert.equal(objective.owner,"fed");
  const zeon=s.units.find(unit=>unit.id==="chars-zaku");
  fed.q=0;fed.r=0;
  zeon.zone="board";zeon.q=objective.q;zeon.r=objective.r;
  result=E.contestObjectives(s,zeon)[0];
  assert.equal(result.action,"neutralized");
  assert.equal(objective.owner,null);
  result=E.contestObjectives(s,zeon)[0];
  assert.equal(result.action,"captured");
  assert.equal(objective.owner,"zeon");
});

test("an objective contest fails on equal nearby unit counts", () => {
  const s=E.setupGame(()=>0.5);
  const objective=s.objectives[0];
  const fed=s.units.find(unit=>unit.id==="gundam");
  const zeon=s.units.find(unit=>unit.id==="chars-zaku");
  fed.zone="board";fed.q=objective.q;fed.r=objective.r;
  zeon.zone="board";zeon.q=objective.q+1;zeon.r=objective.r;
  const result=E.contestObjectives(s,fed)[0];
  assert.equal(result.action,"blocked");
  assert.equal(objective.owner,null);
});

test("objectives render as faction flags instead of numbered circles", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/class="objective-flag \$\{f\.team\}"/);
  assert.doesNotMatch(source,/class="feature-ring/);
  assert.match(source,/E\.contestObjectives\(state,unit\)/);
});

test("phase transition scores visible Objectives, resets control for Phase 2, and reveals the final winner", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/showPhaseTransition\(\{eyebrow:"PHASE 1 COMPLETE",title:"PHASE 2"/);
  assert.match(source,/state\.objectives\.forEach\(objective=>\{objective\.owner=null;\}\)/);
  assert.match(source,/state\.currentTick=11;/);
  assert.match(source,/showPhaseTransition\(\{eyebrow:"FINAL OBJECTIVE SCORE",title:"GAME END"/);
  assert.match(source,/state\.winner=state\.vp\.fed===state\.vp\.zeon\?"draw"/);
  assert.match(source,/spawnObjectiveScoreFx\(objective,entry\.team\)/);
});

test("Engagement reduces movement by 1 only for adjacent enemy units or Garrisons at the same elevation", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam");
  const enemy=s.units.find(x=>x.id==="chars-zaku");
  unit.zone="board";unit.q=5;unit.r=5;
  enemy.zone="board";enemy.q=6;enemy.r=5;
  s.garrisons=[];
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  assert.equal(E.engagedTargets(s,unit).length,1);
  assert.equal(E.reachable(s,unit,3).has(E.key(5,2)),false,"Advance 3 becomes 2 while Engaged");
  assert.equal(E.reachable(s,unit,4).has(E.key(5,2)),true,"a nominal allowance of 4 becomes 3, not less");

  s.board[E.key(enemy.q,enemy.r)].elevation=1;
  assert.equal(E.engagedTargets(s,unit).length,0,"adjacent enemies at a different elevation do not Engage");
  assert.equal(E.reachable(s,unit,3).has(E.key(5,2)),true,"no Engagement penalty at different elevation");

  enemy.q=10;enemy.r=10;
  s.garrisons=[{id:"enemy-g",team:"zeon",q:6,r:5,hp:1,maxHp:1}];
  s.board[E.key(6,5)].elevation=0;
  assert.equal(E.engagedGarrisons(s,unit).length,1,"an adjacent enemy Garrison at the same elevation Engages");
  assert.equal(E.reachable(s,unit,3).has(E.key(5,2)),false,"enemy Garrison Engagement also applies -1 movement");
});

test("Engagement target priority only uses same-elevation adjacent threats", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(x=>x.id==="gundam");
  const engaged=s.units.find(x=>x.id==="chars-zaku");
  const distant=s.units.find(x=>x.id==="zaku-line");
  attacker.zone="board";attacker.q=5;attacker.r=5;
  engaged.zone="board";engaged.q=6;engaged.r=5;
  distant.zone="board";distant.q=5;distant.r=3;
  s.garrisons=[];
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  const weapon=attacker.weapons.find(x=>x.id==="beam-rifle");
  assert.deepEqual(E.legalWeaponTargets(s,attacker,weapon).map(x=>x.id),["chars-zaku"]);

  s.board[E.key(engaged.q,engaged.r)].elevation=1;
  const ids=E.legalWeaponTargets(s,attacker,weapon).map(x=>x.id);
  assert.ok(ids.includes("zaku-line"),"a different-elevation adjacent enemy does not force target priority");

  engaged.q=10;engaged.r=10;
  s.garrisons=[{id:"enemy-g",team:"zeon",q:6,r:5,hp:1,maxHp:1}];
  s.board[E.key(6,5)].elevation=0;
  assert.equal(E.engagedTargets(s,attacker).map(x=>x.id).includes("enemy-g"),true);
  assert.deepEqual(E.legalWeaponTargets(s,attacker,weapon),[],"when Engaged only with a Garrison, distant units are not legal targets");
});

test("the attack UI prioritizes same-elevation Engaged units and Garrisons", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/const engaged=E\.engagedTargets\(state,unit\)/);
  assert.match(source,/engagedKeys\.has\(E\.key\(g\.q,g\.r\)\)/);
  assert.match(source,/ENGAGED — ต้องโจมตี Unit หรือ Garrison ศัตรูที่ติดกันและอยู่ระดับเดียวกันก่อน/);
});


test("a Response that destroys the active unit ends its Activation and advances safely", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function finishDefeatedActiveActivation\(unit,source="Response"\)/);
  assert.match(source,/state\.resolvedThisTick\.add\(unit\.id\)/);
  assert.match(source,/state\.activeUnitId=null/);
  assert.match(source,/scheduleStartActivation\(360\)/);
  assert.match(source,/defeated&&finishDefeatedActiveActivation\(unit,"Iron Grip"\)/);
  assert.match(source,/finishDefeatedActiveActivation\(attacker,"Combat Response"\)/);
});

test("Return Fire applies attacker-side Critical effects such as Beam Saber Strength", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const body=source.match(/function resolvePostCombat\([\s\S]*?\n  \}/)?.[0]||"";
  assert.match(body,/applyAttackerCritical\(defender,weapon,result\)/);
  assert.match(body,/if\(result\.criticals>0\)applyCritical\(defender,attacker,weapon,result\)/);
});

test("Lock Down and Breaking the Line require Line of Sight", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/card\.id==="lock-down"[\s\S]{0,180}E\.hasLineOfSight\(state,unit,target\)/);
  assert.match(source,/card\.id==="breaking-line"[\s\S]{0,180}E\.hasLineOfSight\(state,unit,target\)/);
  const block=source.match(/else if \(card\.id==="lock-down"\|\|card\.id==="breaking-line"\) \{[\s\S]*?\n    \}/)?.[0]||"";
  assert.doesNotMatch(block,/ignoreLos\s*:\s*true/);
  assert.match(block,/เลือก Unit ศัตรูใน Line of Sight/);
});



test("Saturated Fire uses Range 4 plus Line of Sight", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/E\.livingEnemies\(state,unit\)\.filter\(x=>E\.distance\(unit,x\)<=4&&E\.hasLineOfSight\(state,unit,x\)\)/);
});

test("Enforcer Heat Hawk can destroy Shield, Speed, or Strength after the Attack Roll", () => {
  const heatHawk=D.units.find(unit=>unit.id==="zaku-enforcer").weapons.find(weapon=>weapon.id==="enforcer-heat-hawk");
  assert.equal(heatHawk.effect,"destroyUpgrade");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const body=source.match(/function offerWeaponAfterRollEffect[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(body,/\["shield","speed","strength"\]/);
  assert.match(body,/data-weapon-upgrade/);
});

test("LOS follows elevation direction, enemy blockers, and attacker choice between two hex lines", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(unit=>unit.id==="gundam");
  const enemy=s.units.find(unit=>unit.id==="chars-zaku");
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  attacker.zone="board";attacker.q=0;attacker.r=0;
  enemy.zone="board";enemy.q=1;enemy.r=3;
  // Low attacker: any intervening terrain higher than the attacker blocks.
  const lowPath=E.line(attacker,enemy).slice(1,-1);
  s.board[E.key(lowPath[0].q,lowPath[0].r)].elevation=1;
  assert.equal(E.hasLineOfSight(s,attacker,enemy),false);
  // High attacker shooting down: lower terrain is clear, terrain equal to attacker blocks.
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  s.board[E.key(attacker.q,attacker.r)].elevation=2;
  s.board[E.key(lowPath[0].q,lowPath[0].r)].elevation=1;
  assert.equal(E.hasLineOfSight(s,attacker,enemy),true);
  s.board[E.key(lowPath[0].q,lowPath[0].r)].elevation=2;
  assert.equal(E.hasLineOfSight(s,attacker,enemy),false);

  // Exact-between case: if one of the two legal hex paths is clear, attacker may use it.
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  attacker.q=0;attacker.r=0;enemy.q=1;enemy.r=1;
  const variants=E.lineVariants(attacker,enemy);
  assert.equal(variants.length,2);
  const a=variants[0][1],b=variants[1][1];
  s.board[E.key(a.q,a.r)].elevation=1;
  assert.equal(E.hasLineOfSight(s,attacker,enemy),true);
  s.board[E.key(b.q,b.r)].elevation=1;
  assert.equal(E.hasLineOfSight(s,attacker,enemy),false);
});

test("Push collision does not route around blockers and identifies Unit/Garrison collisions", () => {
  const s=E.setupGame(()=>0.5);
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  const source=s.units.find(unit=>unit.id==="gundam");
  const target=s.units.find(unit=>unit.id==="chars-zaku");
  source.zone="board";source.q=5;source.r=5;
  target.zone="board";target.q=6;target.r=5;
  let step=E.forcedPushStep(s,source,target);
  assert.equal(step.type,"move");
  const destination={q:step.q,r:step.r};

  const blocker=s.units.find(unit=>unit.id==="zaku-enforcer");
  blocker.zone="board";blocker.q=destination.q;blocker.r=destination.r;
  // Block any alternate equally-direct hex too so collision is mandatory.
  const direct=E.neighbors(target.q,target.r).map(([q,r])=>({q,r,d:E.distance(source,{q,r})}));
  const farthest=Math.max(...direct.map(x=>x.d));
  const others=direct.filter(x=>x.d===farthest&&(x.q!==destination.q||x.r!==destination.r));
  for(const other of others)s.board[E.key(other.q,other.r)].elevation=1;
  step=E.forcedPushStep(s,source,target);
  assert.equal(step.type,"collision");
  assert.equal(step.unit?.id,blocker.id);

  blocker.zone="reserve";
  s.garrisons=[{id:"push-garrison",team:"zeon",q:destination.q,r:destination.r,hp:1,maxHp:1}];
  step=E.forcedPushStep(s,source,target);
  assert.equal(step.type,"collision");
  assert.equal(step.garrison?.id,"push-garrison");
});

test("forced Push never invokes pickupAt and collision damage is handled for both objects", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const body=source.match(/function pushAway[\s\S]*?\n  \}/)?.[0]||"";
  assert.doesNotMatch(body,/pickupAt/);
  assert.match(body,/E\.applyDamage\(target,1\)/);
  assert.match(body,/E\.applyDamage\(collidedUnit,1\)/);
  assert.match(body,/damageGarrison\(source,collidedGarrison,1,"Push Collision"\)/);
});

test("Garrison defeat and rescue both award 2 VP", () => {
  assert.equal(D.rules.rescue.vp,2);
  assert.equal(D.rules.garrison.defeatVp,2);
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/D\.rules\.garrison\?\.defeatVp \?\? D\.rules\.rescue\.vp/);
});

test("Range-tagged Tactics use LOS and Forward Artillery counts team-wide rescues", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/rescued-extraction[\s\S]{0,260}hasOwnGarrisonInRange\(unit,3,true\)/);
  assert.match(source,/rescueGarrison\(unit,3,false,[\s\S]{0,180}\{requireLos:true\}\)/);
  assert.match(source,/sudden-pressure[\s\S]{0,400}E\.hasLineOfSight\(state,unit,target\)/);
  assert.match(source,/state\.rescuedGarrisons\?\.fed\|\|0/);
});

test("Restart invalidates delayed gameplay callbacks and cache versions stay aligned", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const reset=source.match(/function resetGame\(\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(reset,/gameEpoch\+=1/);
  assert.match(reset,/clearTimeout\(activationResumeTimer\)/);
  assert.match(reset,/clearTimeout\(diceAnimationTimer\)/);
  assert.match(reset,/clearInterval\(diceRollInterval\)/);
  assert.match(source,/function scheduleStartActivation/);
  assert.match(source,/if\(epoch!==gameEpoch\|\|state\?\.status!=="playing"\|\|state\.activeUnitId\)return/);
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  const versions=[...html.matchAll(/(?:data|engine|game)\.js\?v=(\d+)/g)].map(match=>match[1]);
  assert.equal(versions.length,3);
  assert.equal(new Set(versions).size,1,"data.js, engine.js and game.js should share one cache-busting version");
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const D = require("../data.js");
const E = require("../engine.js");

function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { console.error(`✗ ${name}\n  ${error.message}`); process.exitCode = 1; }
}

test("data pack contains 18 units and 28 unique tactics", () => {
  assert.equal(D.units.length, 18);
  assert.equal(D.tactics.length, 28);
  assert.equal(new Set(D.tactics.map(x => x.id)).size, 28);
});

test("all 29 real card images are present", () => {
  for (const item of [...D.units, ...D.tactics]) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", item.card)), item.card);
  }
});

test("all tactics use supplied high-resolution card images", () => {
  assert.ok(D.tactics.every(card=>card.card.startsWith("assets/cards/tactic-")&&/\.(png|jpg)$/i.test(card.card)));
  assert.ok(D.tactics.every(card=>fs.statSync(path.join(__dirname,"..",card.card)).size>100000));
});

test("all eighteen units use separate map icons", () => {
  assert.equal(new Set(D.units.map(unit => unit.icon)).size, 18);
  for (const unit of D.units) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", unit.icon)), unit.icon);
    assert.ok(unit.icon.startsWith("assets/icons/"), unit.icon);
  }
});

test("v90 production images are right-sized without losing referenced cards", () => {
  const items=[...D.units,...D.tactics];
  const cards=[...new Set(items.map(item=>item.card))];
  assert.equal(cards.length,46);
  assert.ok(cards.every(file=>file.endsWith(".jpg")&&fs.existsSync(path.join(__dirname,"..",file))));
  const cardBytes=cards.reduce((total,file)=>total+fs.statSync(path.join(__dirname,"..",file)).size,0);
  assert.ok(cardBytes<13*1024*1024,`referenced card payload is ${cardBytes} bytes`);
  assert.equal(fs.readdirSync(path.join(__dirname,"..","assets","cards")).filter(file=>file.endsWith(".png")).length,0);
  const pngDimensions=file=>{const bytes=fs.readFileSync(file);return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};};
  for(const file of fs.readdirSync(path.join(__dirname,"..","assets","icons")).filter(file=>file.endsWith(".png"))){
    const dimensions=pngDimensions(path.join(__dirname,"..","assets","icons",file));
    assert.ok(Math.max(dimensions.width,dimensions.height)<=384,`${file} exceeds 384px`);
  }
  const title=pngDimensions(path.join(__dirname,"..","assets","title","title-screen.png"));
  assert.ok(Math.max(title.width,title.height)<=1400);
});

test("Ultimate Team can occupy either match side and receives exactly three fixed Tactics", () => {
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"fed"});
  assert.deepEqual(state.units.filter(unit=>unit.team==="fed").map(unit=>unit.id).sort(),["barbatos-lupus-rex","hero-gundam","wing-zero-ew"]);
  assert.deepEqual(state.units.filter(unit=>unit.team==="zeon").map(unit=>unit.id).sort(),["guncannon","gundam","guntank"]);
  assert.ok(state.units.filter(unit=>unit.team==="fed").every(unit=>unit.originalTeam==="white-devil"));
  assert.deepEqual(D.tacticDecks["white-devil"],["epic-shot","renewed-power","sacrificial-overload"]);
  assert.deepEqual(new Set([...state.hands.fed,...state.tacticDecks.fed]),new Set(D.tacticDecks["white-devil"]));
  assert.equal(state.hands.fed.length,3);
  state.phase=2;
  E.dealTacticHand(state,"fed",()=>0.1);
  assert.equal(state.hands.fed.length,3,"Ultimate Team never draws additional Phase 2 Tactics");
  state.hands={fed:["renewed-power"],zeon:["renewed-power"]};
  E.retireTacticCard(state,"fed","renewed-power");
  assert.ok(state.usedTactics.has("fed:renewed-power"));
  assert.ok(!state.usedTactics.has("zeon:renewed-power"),"shared Tactics are consumed only for their owning side");
});

test("Ultimate Team core combat rules match Zero System and Fight to the End", () => {
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"fed"});
  const wing=state.units.find(unit=>unit.id==="wing-zero-ew");
  const barbatos=state.units.find(unit=>unit.id==="barbatos-lupus-rex");
  const target=state.units.find(unit=>unit.id==="gundam");
  for(const [unit,q,r] of [[wing,4,4],[barbatos,5,5],[target,4,5]]){unit.zone="board";unit.q=q;unit.r=r;}
  const twin=wing.weapons.find(weapon=>weapon.id==="twin-buster-rifle");
  const aoe=E.attackResultFromDice(state,wing,target,twin,[4,5,7,8,9,10]);
  assert.equal(aoe.criticals,4);
  assert.equal(aoe.damage,10,"one shared roll gives every AoE target +1 per Critical, capped at +4");
  const rex=barbatos.weapons.find(weapon=>weapon.id==="rex-claws");
  barbatos.hp=11;
  assert.equal(E.rollAttack(state,barbatos,target,rex,()=>0.5).dice.length,4);
  barbatos.hp=5;
  assert.equal(E.rollAttack(state,barbatos,target,rex,()=>0.5).dice.length,5);
});

test("Twin Buster ignores normal piece LOS and never targets a Base", () => {
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"fed"});
  const wing=state.units.find(unit=>unit.id==="wing-zero-ew");
  const target=state.units.find(unit=>unit.id==="gundam");
  const blocker=state.units.find(unit=>unit.id==="guncannon");
  for(const [unit,q,r] of [[wing,0,0],[blocker,0,1],[target,0,2]]){unit.zone="board";unit.q=q;unit.r=r;}
  assert.equal(E.hasLineOfSight(state,wing,target),false);
  assert.equal(E.hasLineOfSight(state,wing,target,{ignorePieces:true}),true);
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const preview=source.match(/function twinBusterPreview[\s\S]*?\n  \}/)?.[0]||"";
  const targets=source.match(/function twinBusterTargets[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(targets,/\.\.\.state\.garrisons\.filter/);
  assert.doesNotMatch(targets,/state\.bases|featureCoordinates\.bases/);
  assert.match(preview,/hasTwinBusterLine/);
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
  assert.match(source,/startMove\(D\.rules\.advance\.distance\+unit\.upgrades\.speed\+\(unit\.movementBonus\|\|0\),D\.rules\.advance\.timeline,"Advance"/);
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

test("the game draws both factions' Phase 2 Tactics together after scoring Phase 1", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.doesNotMatch(source,/function refreshPassedTeamTactics/);
  const ending=source.match(/function endActivation\(\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.doesNotMatch(ending,/dealTacticHand|refreshPassedTeamTactics/);
  const transition=source.match(/async function runPhaseTransition\(finalPhase=false\) \{[\s\S]*?\n  \}/)?.[0]||"";
  const scorePos=transition.indexOf("await scoreClaimedObjectives(claimed,epoch)");
  const phasePos=transition.indexOf("state.phase=2");
  const drawPos=transition.indexOf("dealPendingPhaseTwoTactics()");
  assert.ok(scorePos>=0 && phasePos>scorePos && drawPos>phasePos,"Phase 1 scores first, then both factions draw during the shared Phase 2 transition");
  assert.match(transition,/PHASE 2 READY/);
});

test("destruction can still push a Zeon unit beyond TL 10 without triggering an early Tactic draw", () => {
  const state=E.setupGame(()=>0.37);
  const zeon=state.units.filter(unit=>unit.team==="zeon");
  zeon[0].nextAt=11;zeon[1].nextAt=12;zeon[2].nextAt=9;zeon[2].hp=0;
  E.defeatUnit(state,zeon[2],"fed");
  assert.equal(zeon[2].nextAt,11,"destruction can push the last Zeon unit over TL 10");
  assert.equal(state.hands.zeon.length,3,"destruction alone does not draw; both players draw only during the Phase transition");
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

test("Jumping uses the starting elevation as the movement reference height", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam");
  unit.zone="board";unit.q=5;unit.r=5;
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  s.board[E.key(5,5)].elevation=1;
  s.board[E.key(7,5)].elevation=1;
  assert.equal(E.reachable(s,unit,1).has(E.key(6,5)),true,"moving downhill costs only the hex entered");
  assert.equal(E.reachable(s,unit,2).has(E.key(7,5)),true,"Jump returns to the starting elevation without an extra climb cost");

  s.board[E.key(7,5)].elevation=2;
  assert.equal(E.reachable(s,unit,2).has(E.key(7,5)),false,"moving above the starting elevation still costs +1 elevation movement");
  assert.equal(E.reachable(s,unit,3).has(E.key(7,5)),true,"the extra cost is paid only above the starting elevation");
});

test("Hover ignores elevation cost only for Wing Zero, not Barbatos", () => {
  const s=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"fed"});
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  const wing=s.units.find(unit=>unit.id==="wing-zero-ew");
  const barbatos=s.units.find(unit=>unit.id==="barbatos-lupus-rex");
  wing.zone="board";wing.q=5;wing.r=5;
  barbatos.zone="board";barbatos.q=5;barbatos.r=6;
  s.board[E.key(6,5)].elevation=2;
  s.board[E.key(6,6)].elevation=2;
  assert.equal(E.reachable(s,wing,1).has(E.key(6,5)),true,"Wing Hover ignores the climb cost");
  assert.equal(E.reachable(s,barbatos,1).has(E.key(6,6)),false,"Barbatos must still pay elevation cost");
  assert.equal(E.reachable(s,barbatos,3).has(E.key(6,6)),true);
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

test("terrain-ignoring movement preserves Jump over lower enemies", () => {
  const s=E.setupGame(()=>0.5);
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  const mover=s.units.find(unit=>unit.id==="zaku-line");
  const blocker=s.units.find(unit=>unit.id==="gundam");
  mover.zone="board";mover.q=5;mover.r=5;s.board[E.key(5,5)].elevation=1;
  blocker.zone="board";blocker.q=6;blocker.r=5;
  const reachable=E.reachable(s,mover,2,{ignoreElevation:true});
  assert.ok([...reachable.keys()].some(value=>{const [q,r]=E.fromKey(value);return E.distance({q,r},blocker)===1&&q!==mover.q;}));
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

test("Bases are never legal movement endpoints and enemy Bases remain impassable", () => {
  const s=E.setupGame(()=>0.5);
  const unit=s.units.find(x=>x.id==="gundam");
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  unit.zone="board";unit.q=7;unit.r=11;
  let reach=E.reachable(s,unit,3);
  assert.equal(reach.has(E.key(7,12)),false,"the allied Base cannot be an ending hex");
  unit.team="zeon";
  reach=E.reachable(s,unit,3);
  assert.equal(reach.has(E.key(7,12)),false);
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

test("a higher attacker can see over enemy pieces below the higher endpoint elevation", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(x=>x.id==="gundam");
  const blocker=s.units.find(x=>x.id==="chars-zaku");
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  attacker.zone="board";attacker.q=2;attacker.r=2;
  const target={q:4,r:3,team:"zeon"};
  const middle=E.line(attacker,target)[1];
  s.board[E.key(attacker.q,attacker.r)].elevation=2;
  s.board[E.key(middle.q,middle.r)].elevation=0;
  blocker.zone="board";blocker.q=middle.q;blocker.r=middle.r;
  assert.equal(E.hasLineOfSight(s,attacker,target),true);
});

test("uphill LOS is blocked only by terrain at the higher endpoint elevation or above", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(x=>x.id==="gundam");
  s.units.forEach(unit=>{unit.zone="reserve";});
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  attacker.zone="board";attacker.q=2;attacker.r=2;
  const target={q:4,r:3,team:"zeon"};
  const middle=E.line(attacker,target)[1];
  s.board[E.key(target.q,target.r)].elevation=2;
  s.board[E.key(middle.q,middle.r)].elevation=1;
  assert.equal(E.hasLineOfSight(s,attacker,target),true);
  s.board[E.key(middle.q,middle.r)].elevation=2;
  assert.equal(E.hasLineOfSight(s,attacker,target),false);
});

test("Objective control markers never block Line of Sight", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(unit=>unit.id==="gundam");
  const target=s.units.find(unit=>unit.id==="chars-zaku");
  s.units.forEach(unit=>{unit.zone="reserve";});
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  attacker.zone="board";attacker.q=2;attacker.r=2;
  target.zone="board";target.q=4;target.r=3;
  const middle=E.line(attacker,target)[1];
  s.objectives=[{id:"los-objective",q:middle.q,r:middle.r,owner:"zeon"}];
  assert.equal(E.hasLineOfSight(s,attacker,target),true);
});

test("Line of Sight inspection reports both edge-path choices and their blockers", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(x=>x.id==="gundam");
  const target=s.units.find(x=>x.id==="chars-zaku");
  s.units.forEach(unit=>{unit.zone="reserve";});
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  attacker.zone="board";attacker.q=0;attacker.r=0;
  target.zone="board";target.q=1;target.r=1;
  const variants=E.lineVariants(attacker,target);
  s.board[E.key(variants[0][1].q,variants[0][1].r)].elevation=1;
  const details=E.lineOfSightDetails(s,attacker,target);
  assert.equal(details.paths.length,2);
  assert.equal(details.clear,true);
  assert.equal(details.paths.filter(path=>path.clear).length,1);
  assert.equal(details.paths.find(path=>!path.clear).blocker.type,"terrain");
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
  assert.match(source,/\["chars-zaku","red-comet-zaku"\]\.includes\(unit\.id\)/);
  assert.match(source,/"Crimson Dash"/);
  assert.match(source,/D\.rules\.dash\.distance\+1,0,"Crimson Dash"/);
  assert.match(source,/ไม่ทำลาย Upgrade/);
  assert.match(source,/Return Fire ที่ยืนยันแล้ว/);
});

test("Char Kick uses a damage-or-back decision before committing the Dash", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/function offerCharKickDraft\(unit\)/);
  assert.match(source,/function resolveCharKickTarget\(unit,target(?:,continuation=null)?\)/);
  assert.match(source,/ทำ Damage เพื่อยืนยัน Dash/);
  assert.match(source,/Back เพื่อเปลี่ยนจุด Dash/);
  assert.match(source,/data-char-kick-unit/);
  assert.match(source,/data-char-kick-garrison/);
  assert.match(source,/ทำ Damage 1/);
  assert.match(source,/commitMovementDraft\(finishKick,\{skipCharKick:true,beforeMovementResponses:/);
  assert.match(source,/payTimeline\(unit,draft\.cost\)/);
  assert.match(source,/char-kick-target/);
  assert.match(source,/char-kick-victim/);
  assert.match(source,/function adjacentCharKickTargets\(unit\)/);
  assert.match(source,/state\.garrisons\.filter\(target=>target\.team!==unit\.team&&E\.distance\(unit,target\)===1\)/);
  assert.match(source,/function resolveCharKickGarrisonTarget\(unit,garrison(?:,continuation=null)?\)/);
  assert.match(source,/damageGarrison\(unit,garrison,1,"Char Kick"\)/);
  assert.match(css,/\.hex\.char-kick-target polygon/);
  assert.match(css,/\.unit-node\.char-kick-victim \.unit-base/);
  assert.match(css,/\.unit-command-menu\.char-kick-menu/);
  assert.match(css,/\.char-kick-damage/);
});



test("base and Garrison use only red/blue with ZEON and E.F.S.F. color priority", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function sidePalette\(team\) \{ return E\.matchSidePalette\(state\?\.factions\|\|matchFactions,team\); \}/);
  assert.match(source,/const palette=sidePalette\(base\.team\)/);
  assert.match(source,/const palette=sidePalette\(garrison\.team\)/);
  assert.doesNotMatch(source,/base\.team==="fed"\?"blue":"red"/);
  assert.doesNotMatch(source,/garrison\.team==="fed"\?"blue":"red"/);
  assert.doesNotMatch(source,/garrison-green/);
});

test("all six faction-side assignments obey the two-color priority matrix", () => {
  const matchups=[
    [{fed:"zeon",zeon:"fed"},"red","blue"],
    [{fed:"fed",zeon:"zeon"},"blue","red"],
    [{fed:"white-devil",zeon:"zeon"},"blue","red"],
    [{fed:"zeon",zeon:"white-devil"},"red","blue"],
    [{fed:"white-devil",zeon:"fed"},"red","blue"],
    [{fed:"fed",zeon:"white-devil"},"blue","red"]
  ];
  for(const [factions,fedColor,zeonColor] of matchups){
    assert.equal(E.matchSidePalette(factions,"fed"),fedColor);
    assert.equal(E.matchSidePalette(factions,"zeon"),zeonColor);
  }
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
  assert.match(html,/id="sound-btn"[^>]+aria-label="เลือกเพลงและเสียง"[^>]+aria-pressed="false"/);
  assert.match(html,/<span class="build-version"[^>]*>Beta12<\/span>/);
  assert.match(css,/\.build-version \{/);
  assert.doesNotMatch(html,/id="rules-btn"/);
  assert.doesNotMatch(html,/class="legend"/);
  assert.ok(html.indexOf('id="active-hud"') < html.indexOf('id="board-wrap"'));
  assert.match(css,/\.hud-stack \{[\s\S]*position: static;/);
  assert.match(css,/\.board-feed \{[\s\S]*display: none;/);
  assert.match(css,/\.board-feed\.open \{ display: block; \}/);
  assert.match(css,/\.modal-close \{[\s\S]*z-index: 12;[\s\S]*border: 2px solid #fff;[\s\S]*background: #c51632;/);
  assert.match(source,/let menuPlacement = "right"/);
  assert.doesNotMatch(source,/menuPlacement=menuPlacement==="right"\?"left":"right"/);
  assert.match(source,/unitCenter<boardBounds\.left\+boardBounds\.width\/2\?"right":"left"/);
  assert.match(source,/menuPlacement==="right"\?screen\.x\+30:screen\.x-menuWidth-30/);
  assert.match(source,/document\.addEventListener\("pointerdown"/);
});

test("persistent LOS inspection stays independent from Command and movement preview", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(html,/id="los-btn"/);
  assert.ok(html.indexOf('id="los-btn"')>html.indexOf('id="combat-feed"'),"LOS control belongs below the Battle Log");
  assert.ok(html.indexOf('id="los-btn"')<html.indexOf('id="board-wrap"'),"LOS control remains independent from the contextual Command menu");
  assert.match(source,/let losInspection = \{ enabled:false \}/);
  assert.match(source,/function renderLosInspection/);
  assert.match(source,/E\.lineOfSightDetails\(state,source,target/);
  assert.match(source,/const maximumRange=Math\.max\(0,\.\.\.inspectionWeapons\.map\(weaponRange\)\)/);
  assert.match(source,/\.\.\.E\.livingEnemies\(state,source\),[\s\S]{0,100}\.\.\.state\.garrisons\.filter\(garrison=>garrison\.team!==source\.team\)/);
  assert.match(source,/E\.distance\(source,target\)<=maximumRange/);
  assert.match(source,/details\.paths\.find\(candidate=>candidate\.clear\)\|\|details\.paths\[0\]/);
  assert.doesNotMatch(source,/losInspection\.target/);
  assert.doesNotMatch(source,/losInspection\.enabled[\s\S]{0,100}movementDraft=null/);
  assert.match(css,/\.los-path\.clear/);
  assert.match(css,/\.los-path\.blocked/);
  assert.match(css,/\.hud-los-btn/);
  assert.match(css,/\.los-eye/);
  assert.match(css,/\.los-btn\[aria-pressed="true"\]/);
  assert.match(source,/LINE OF SIGHT\$\{available\?` · R\$\{maximumRange\}`:""\}/);
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
  assert.match(source,/showAttackDiceRoll\(result,weapon,weapon\.name/);
  assert.match(source,/showAttackDiceRoll\(result,weapon,`RETURN FIRE/);
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

test("all thirty-six unit weapons preserve the established and new card critical effects", () => {
  const expected={
    "beam-saber":"gainStrength","beam-rifle":"damage2",
    "gc-rifle":"slow","low-recoil-240":"dashRescueTimeline0",
    "bop-missile":"fracture","low-recoil-120":"slow",
    "char-heat-hawk":"fracture","char-machine-gun":"dashTimeline0",
    "cracker-grenade":"splashDamage1","bazooka":"rescuedGarrisonDamage",
    "shoulder-bash":"push2","enforcer-heat-hawk":"slow",
    "wing-beam-saber":"move2IgnoreEngagement","twin-buster-rifle":"criticalDamageUpTo4",
    "vidar-handgun":"repeatAtTimeline0","buret-saber":"damage2",
    "rex-claws":"slow","tail-blade":"damage1",
    "gqx-heat-hawk":"damage1","gqx-vulcan":"slow",
    "gfred-luna":"slow","gfred-artemis":"damage2",
    "red-gundam-beam-saber":"damage2","red-gundam-bits":"disarm"
  };
  const weapons=D.units.flatMap(unit=>unit.weapons);
  assert.equal(weapons.length,36);
  for(const [id,critical] of Object.entries(expected))assert.equal(weapons.find(weapon=>weapon.id===id)?.critical,critical,id);
});

test("Beam Saber Critical grants Gundam Strength after Combat Damage against units and Garrisons", () => {
  const beamSaber=D.units.find(unit=>unit.id==="gundam").weapons.find(weapon=>weapon.id==="beam-saber");
  assert.equal(beamSaber.critical,"gainStrength");
  assert.equal(beamSaber.criticalTiming,"afterCombatDamage");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function resolveAfterCombatCritical/);
  assert.match(source,/weapon\.critical==="gainStrength"\)\{applyAttackerCritical/);
  assert.match(source,/resolveAfterCombatCritical\(attacker,garrison,weapon,result/);
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
  const enforcer=s.units.find(unit=>unit.id==="zaku-enforcer");enforcer.zone="board";enforcer.q=6;enforcer.r=5;
  target.statuses.slow=true;
  let suppressing=E.rollAttack(s,enforcer,target,enforcer.weapons[0],()=>0);
  assert.equal(suppressing.dice.length,enforcer.weapons[0].strength,"a Status alone is not Damage");
  target.hp=target.maxHp-1;
  suppressing=E.rollAttack(s,enforcer,target,enforcer.weapons[0],()=>0);
  assert.equal(suppressing.dice.length,enforcer.weapons[0].strength+1,"Suppressing Presence keys off existing Damage");
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

test("After-Combat-Damage Critical follow-ups resolve before post-combat Responses", () => {
  const char=D.units.find(unit=>unit.id==="chars-zaku").weapons.find(weapon=>weapon.id==="char-machine-gun");
  const cannon=D.units.find(unit=>unit.id==="guncannon").weapons.find(weapon=>weapon.id==="low-recoil-240");
  assert.equal(char.criticalTiming,"afterCombatDamage");
  assert.equal(cannon.criticalTiming,"afterCombatDamage");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const finish=source.match(/function finishAttack\([\s\S]*?\n  \}/)?.[0]||"";
  assert.ok(finish.indexOf("resolveAfterCombatCritical")<finish.indexOf("openPostCombatResponses"));
  assert.match(source,/const criticalLabel=`\$\{weapon\.name\} Critical`/);
  assert.match(source,/beginAdjustableCharDash\(attacker,0,`\$\{criticalLabel\} Dash`/);
});

test("Guncannon Cannon Critical performs a Timeline 0 Dash then optional Rescue", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/startMoveFor\(attacker,D\.rules\.dash\.distance,0,"240mm Critical Dash"/);
  assert.match(source,/function offerGuncannonCriticalRescue/);
  assert.match(source,/rescueGarrison\(unit,1,false,null,onComplete\)/);
  assert.match(source,/id="confirm-critical-rescue"/);
});

test("Cracker Grenade uses one center target and splash is 0 normally / 1 on active Critical", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/const amount=weapon\.critical==="splashDamage1"&&criticalEffectsActive\(result\)\?1:0/);
  assert.match(source,/adjacentUnits=splashUnitTargets\(attacker,target,weapon\)/);
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
  const result = E.applyDamage(target,4,{sourceType:"attack"});
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

test("Fracture adds Damage 3 before Shield prevention on an attack dealing at least three Combat Damage", () => {
  const target = {hp:10,upgrades:{shield:0},inactiveShields:0,statuses:{fracture:true}};
  const result = E.applyDamage(target,3,{sourceType:"attack"});
  assert.deepEqual(result,{incoming:3,blocked:0,taken:6,fractured:true});
  assert.equal(target.hp,4);
  assert.equal(target.statuses.fracture,false);
});

test("Fracture triggers from incoming Combat Damage before Shield prevention", () => {
  const target = {hp:10,upgrades:{shield:1},inactiveShields:0,statuses:{fracture:true}};
  const result = E.applyDamage(target,3,{sourceType:"attack"});
  assert.deepEqual(result,{incoming:3,blocked:1,taken:5,fractured:true});
  assert.equal(target.hp,5,"3 Combat Damage + Fracture 3 is resolved before Shield prevents 1");
  assert.equal(target.inactiveShields,1,"the Shield is flipped after preventing the modified Damage");
  assert.equal(target.statuses.fracture,false,"Fracture is consumed by the qualifying attack");
});

test("direct, Tactic, and collision Damage do not trigger or consume Fracture", () => {
  for (const options of [undefined,{sourceType:"direct"},{sourceType:"tactic"},{sourceType:"collision"},{attack:false}]) {
    const target = {hp:10,upgrades:{shield:0},inactiveShields:0,statuses:{fracture:true}};
    const result = options === undefined ? E.applyDamage(target,3) : E.applyDamage(target,3,options);
    assert.deepEqual(result,{incoming:3,blocked:0,taken:3,fractured:false});
    assert.equal(target.hp,7);
    assert.equal(target.statuses.fracture,true);
  }
});

test("applyDamage accepts the attack boolean shorthand without changing legacy two-argument calls", () => {
  const attacked = {hp:10,upgrades:{shield:0},inactiveShields:0,statuses:{fracture:true}};
  const direct = {hp:10,upgrades:{shield:0},inactiveShields:0,statuses:{fracture:true}};
  assert.equal(E.applyDamage(attacked,3,true).fractured,true);
  assert.equal(E.applyDamage(direct,3).fractured,false);
  assert.equal(direct.hp,7);
});

test("objectives score only at phase scoring", () => {
  const s = E.setupGame(() => 0.5);
  s.objectives[0].owner="fed";
  s.objectives[1].owner="zeon";
  s.objectives[2].owner="zeon";
  E.scoreObjectives(s);
  assert.equal(D.rules.objective.phaseVp,5);
  assert.deepEqual(s.vp,{fed:5,zeon:10});
});

test("Objective score UI and phase transition use the shared 5 VP rule", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const scoreFx=source.match(/function spawnObjectiveScoreFx[\s\S]*?\n  \}/)?.[0]||"";
  const phaseScore=source.match(/async function scoreClaimedObjectives[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(scoreFx,/D\.rules\.objective\?\.phaseVp \?\? 5/);
  assert.match(scoreFx,/\+\$\{points\} VP/);
  assert.match(phaseScore,/state\.vp\[entry\.team\]\+=points/);
  assert.match(phaseScore,/ควบคุม Objective — \+\$\{points\} VP/);
  assert.match(source,/Objective · \$\{D\.rules\.objective\?\.phaseVp \?\? 5\} VP เมื่อจบ Phase/);
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
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/class="objective-flag \$\{f\.team\}"/);
  assert.doesNotMatch(source,/class="feature-ring/);
  assert.match(source,/E\.contestObjectives\(state,unit\)/);
  assert.match(css,/\.objective-flag\.neutral \.objective-cloth \{[\s\S]*fill: #e6b91d;/);
});

test("phase transition scores Objectives and uses the last player to act as the tie-break winner", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/showPhaseTransition\(\{eyebrow:"PHASE 1 COMPLETE",title:"PHASE 2"/);
  assert.match(source,/state\.objectives\.forEach\(objective=>\{objective\.owner=null;\}\)/);
  assert.match(source,/state\.currentTick=11;/);
  assert.match(source,/showPhaseTransition\(\{eyebrow:"FINAL OBJECTIVE SCORE",title:"GAME END"/);
  assert.match(source,/state\.winner=state\.vp\.fed===state\.vp\.zeon\?\(state\.lastActivatedTeam\|\|"zeon"\)/);
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

test("Engagement attack priority is limited to same-elevation Engaging targets", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(x=>x.id==="gundam");
  const engaged=s.units.find(x=>x.id==="chars-zaku");
  const higherAdjacent=s.units.find(x=>x.id==="zaku-line");
  attacker.zone="board";attacker.q=5;attacker.r=5;
  engaged.zone="board";engaged.q=6;engaged.r=5;
  higherAdjacent.zone="board";higherAdjacent.q=5;higherAdjacent.r=4;
  s.garrisons=[];
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  s.board[E.key(higherAdjacent.q,higherAdjacent.r)].elevation=1;
  const weapon=attacker.weapons.find(x=>x.id==="beam-rifle");
  assert.deepEqual(
    E.legalWeaponTargets(s,attacker,weapon).map(x=>x.id),
    ["chars-zaku"],
    "while Engaged, a single-target attack must target an enemy that actually Engages the attacker"
  );

  s.board[E.key(engaged.q,engaged.r)].elevation=1;
  assert.equal(E.engagedTargets(s,attacker).length,0,"different-elevation adjacent enemies alone do not trigger Engagement");

  engaged.q=10;engaged.r=10;
  higherAdjacent.q=10;higherAdjacent.r=9;
  s.garrisons=[{id:"enemy-g",team:"zeon",q:6,r:5,hp:1,maxHp:1}];
  s.board[E.key(6,5)].elevation=0;
  assert.equal(E.engagedTargets(s,attacker).map(x=>x.id).includes("enemy-g"),true);
  assert.deepEqual(E.legalWeaponTargets(s,attacker,weapon).map(x=>x.id),["enemy-g"]);
});

test("Rival Char may use either Bazooka or Heat Hawk on the actual Engaging target", () => {
  const s=E.setupGame(()=>0.5,{fed:"rival",zeon:"fed"});
  const char=s.units.find(unit=>unit.id==="red-comet-zaku");
  const gundam=s.units.find(unit=>unit.id==="gundam");
  const guncannon=s.units.find(unit=>unit.id==="guncannon");
  char.zone="board";char.q=5;char.r=5;
  gundam.zone="board";gundam.q=6;gundam.r=5;
  guncannon.zone="board";guncannon.q=5;guncannon.r=4;
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  s.board[E.key(guncannon.q,guncannon.r)].elevation=1;
  s.garrisons=[];
  assert.deepEqual(E.engagedTargets(s,char).map(target=>target.id),["gundam"]);
  const bazooka=char.weapons.find(weapon=>weapon.id==="red-comet-bazooka");
  const axe=char.weapons.find(weapon=>weapon.id==="red-comet-heat-hawk");
  assert.deepEqual(E.legalWeaponTargets(s,char,bazooka).map(target=>target.id),["gundam"],"ranged weapons remain legal while Engaged");
  assert.deepEqual(E.legalWeaponTargets(s,char,axe).map(target=>target.id),["gundam"],"melee weapons use the same Engagement target rule");
});

test("the attack UI uses engine Engagement targets without restricting weapon type", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/const targets=E\.legalWeaponTargets\(state,unit,weapon\)/);
  assert.doesNotMatch(source,/const garrisonTargets=state\.garrisons\.filter/);
  assert.match(source,/ENGAGED — ต้องเลือก Unit หรือ Garrison ที่กำลัง Engage ยูนิตนี้เป็นเป้าหมาย/);
});

test("AI attack generation consumes engine legal Garrison targets without a duplicate overlay", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","ai.js"),"utf8");
  assert.match(source,/for \(const target of engine\.legalWeaponTargets\(state, unit, weapon\)\)/);
  assert.doesNotMatch(source,/const engagedKeys = new Set/);
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

test("Return Fire uses the same pre/post Critical timing as a normal attack", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const body=source.match(/function resolvePostCombat\([\s\S]*?\n  \}/)?.[0]||"";
  assert.match(body,/resolveAfterCombatCritical\(returningUnit,attacker,weapon,result/);
  assert.match(body,/criticalEffectsActive\(result\)&&weapon\.criticalTiming!=="afterCombatDamage"/);
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

test("Push direction is chosen from hexes farther from the source and collision identifies Unit/Garrison blockers", () => {
  const s=E.setupGame(()=>0.5);
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  const source=s.units.find(unit=>unit.id==="gundam");
  const target=s.units.find(unit=>unit.id==="chars-zaku");
  source.zone="board";source.q=5;source.r=5;
  target.zone="board";target.q=6;target.r=5;
  const options=E.pushDirectionOptions(s,source,target);
  assert.ok(options.length>=2,"adjacent target should offer multiple away directions on an open board");
  assert.ok(options.every(option=>E.distance(source,option)>E.distance(source,target)));

  const chosen=options[0];
  let step=E.forcedPushStep(s,target,chosen.direction);
  assert.equal(step.type,"move");
  const destination={q:step.q,r:step.r};

  const blocker=s.units.find(unit=>unit.id==="zaku-enforcer");
  blocker.zone="board";blocker.q=destination.q;blocker.r=destination.r;
  step=E.forcedPushStep(s,target,chosen.direction);
  assert.equal(step.type,"collision");
  assert.equal(step.unit?.id,blocker.id);

  blocker.zone="reserve";
  s.garrisons=[{id:"push-garrison",team:"zeon",q:destination.q,r:destination.r,hp:1,maxHp:1}];
  step=E.forcedPushStep(s,target,chosen.direction);
  assert.equal(step.type,"collision");
  assert.equal(step.garrison?.id,"push-garrison");

  s.garrisons=[];
  const base=D.map.featureCoordinates.bases[0];
  target.q=base.q;target.r=base.r+1;
  const baseOption=E.pushDirectionOptions(s,{q:target.q,r:target.r+1},target).find(option=>option.q===base.q&&option.r===base.r);
  if(baseOption){
    step=E.forcedPushStep(s,target,baseOption.direction);
    assert.equal(step.type,"collision");
    assert.equal(step.base?.team,base.team);
  }
});

test("each Push step can continue outward and uphill terrain causes a collision", () => {
  const s=E.setupGame(()=>0.5);
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  const source=s.units.find(unit=>unit.id==="gundam");
  const target=s.units.find(unit=>unit.id==="chars-zaku");
  source.zone="board";source.q=5;source.r=5;
  target.zone="board";target.q=6;target.r=5;
  const chosen=E.pushDirectionOptions(s,source,target)[0];
  let step=E.forcedPushStep(s,target,chosen.direction);
  assert.equal(step.type,"move");
  target.q=step.q;target.r=step.r;
  step=E.forcedPushStep(s,target,chosen.direction);
  assert.equal(step.type,"move");
  s.board[E.key(step.q,step.r)].elevation=1;
  step=E.forcedPushStep(s,target,chosen.direction);
  assert.equal(step.type,"collision");
  assert.equal(step.reason,"terrain");
});

test("forced Push never invokes pickupAt and collision damage is 2 for both objects", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const body=source.match(/function beginPushDirection[\s\S]*?\n  \}/)?.[0]||"";
  assert.doesNotMatch(body,/pickupAt/);
  assert.match(body,/E\.applyDamage\(target,2,\{sourceType:"collision"\}\)/);
  assert.match(body,/E\.applyDamage\(collidedUnit,2,\{sourceType:"collision"\}\)/);
  assert.match(body,/damageGarrison\(source,step\.garrison,2,"Push Collision"\)/);
});

test("player Push is selected one farther hex at a time, can stop early, and Drive Them Back uses the same flow", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/type:"push-direction"/);
  assert.match(source,/canStop:true/);
  assert.match(source,/stopCallback:finish/);
  assert.match(source,/E\.pushDirectionOptions\(state,source,target\)/);
  assert.match(source,/beginPushDirection\(attacker,defender,2,onComplete,"Shoulder Bash Critical"\)/);
  assert.match(source,/beginPushDirection\(unit,enemy,1,[\s\S]{0,900}"Drive Them Back"\)/);
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
  assert.match(source,/state\.rescuedGarrisons\?\.\[unit\.team\]\|\|0/);
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
  const versions=[...html.matchAll(/(?:styles\.css|data\.js|engine\.js|ai\.js|game\.js)\?v=([A-Za-z0-9_-]+)/g)].map(match=>match[1]);
  assert.equal(versions.length,5);
  assert.equal(new Set(versions).size,1,"CSS and all four JavaScript resources should share one cache-busting version");
});

test("out-of-turn selections keep their owning Unit and AI controller", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const assignments=[...source.matchAll(/mode=\{type:"[^"]+"[^\n]*/g)].map(match=>match[0]);
  assert.ok(assignments.length>=7);
  assert.ok(assignments.every(assignment=>assignment.includes("unitId:")),"every selection mode must identify its acting Unit");
  assert.match(source,/function modeUnit\(\)/);
  const resolver=source.match(/function scheduleAiResolveMode[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(resolver,/const unit=modeUnit\(\)/);
  assert.match(source,/started&&isAiTeam\(attacker\.team\)\)scheduleAiResolveMode\(\)/);
});

test("Escape cannot abandon a resolution and canceling a human mode runs its continuation", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const handler=source.match(/document\.addEventListener\("keydown",event=>\{[\s\S]*?\n  \}\);/)?.[0]||"";
  assert.match(handler,/game-modal/);
  assert.match(handler,/classList\.contains\("show"\)\)return/);
  assert.match(handler,/actor&&isAiTeam\(actor\.team\)\)return/);
  assert.match(handler,/if\(currentMode\.onCancel\)currentMode\.onCancel\(\)/);
});

test("an AI Unit destroyed by a Response releases the AI turn lock", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const finish=source.match(/function finishDefeatedActiveActivation[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(finish,/aiBusy=false/);
  assert.match(finish,/aiPreferredTargetKey=null/);
  assert.match(finish,/scheduleStartActivation\(360\)/);
});

test("attack Damage opts into Fracture while direct effects remain direct", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/E\.applyDamage\(defender,reducedAttackDamage\(attacker,defender,damage\),\{sourceType:"attack"\}\)/);
  assert.match(source,/E\.applyDamage\(attacker,reducedAttackDamage\(returningUnit,attacker,result\.damage\),\{sourceType:"attack"\}\)/);
  const movementResponse=source.match(/function resolveMovementResponses\([\s\S]*?\n  \}/)?.[0]||"";
  assert.match(movementResponse,/damageUnit\(enforcer,unit,3,"Iron Grip"\)/);
  assert.doesNotMatch(movementResponse,/E\.applyDamage\(unit,3,\{sourceType:"attack"\}\)/);
});

test("Burst Attack validates a target before spending Energy and Iron Grip requires displacement", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/beginAttack\(unit\.weapons\[0\],\{free:true,onDeclare:spend\}\)/);
  assert.match(source,/const moved=unit\.q!==q\|\|unit\.r!==r/);
  assert.match(source,/if\(!unit\|\|!movementOccurred\)/);
  assert.match(source,/enforcer&&unit\.team!==enforcer\.team/);
});

test("v88 AI keeps declined Responses private but reveals committed Responses before resolving", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.doesNotMatch(source,/พิจารณา Response: \$\{aiCard\.name\}/);
  assert.doesNotMatch(source,/AI · กำลังพิจารณา Response/);
  assert.match(source,/if\(A\.shouldUseResponse\(aiCard,context\)\)showAiTacticCard\(aiCard,\(\)=>onPlay\(aiCard\)\);[\s\S]{0,40}else onSkip\(\)/);
  assert.match(source,/attempt\+\(aiOwned\?1:0\)/);
  assert.match(source,/modal\?\.classList\.contains\("show"\)[\s\S]{0,160}AI_PACE\.poll/);
});

test("v88 every AI Tactic type pauses on a centered card until the player closes it", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const reveal=source.match(/function showAiTacticCard[\s\S]*?function ensureModal/)?.[0]||"";
  const command=source.match(/function aiUseTactic[\s\S]*?function aiAbilityScore/)?.[0]||"";
  const primary=source.match(/function aiTakePrimary[\s\S]*?function aiUseAnnihilateFollowUp/)?.[0]||"";
  assert.match(reveal,/class="modal-card tactic-confirm-modal ai-tactic-reveal"/);
  assert.match(reveal,/class="modal-card-image" src="\$\{card\.card\}"/);
  assert.match(reveal,/id="continue-ai-tactic"/);
  assert.match(reveal,/id="close-ai-tactic"/);
  assert.match(reveal,/lockResolutionModal\(modal,"#continue-ai-tactic,#close-ai-tactic"\)/);
  assert.ok(reveal.indexOf("closeModal();renderAll();onContinue();")>reveal.indexOf("const proceed"));
  assert.ok(command.indexOf("showAiTacticCard(card")<command.indexOf("useCommandTactic(card)"));
  assert.match(primary,/const beginChosenAttack=\(\)=>\{[\s\S]*?beginAttack\(attack\.weapon/);
  assert.match(primary,/showAiTacticCard\(attack\.tactic,beginChosenAttack\)/);
});

test("AI pacing, active-unit focus, and Encounter overlays remain enabled", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/const AI_PACE = Object\.freeze\(\{ firstTurn: 1450, turnStart: 1200/);
  assert.match(source,/function focusCameraOnUnit\(unit\)/);
  assert.match(source,/focusCameraOnUnit\(unit\);[\s\S]{0,80}scheduleAiTurn/);
  assert.match(source,/E\.engagedTargets\(state,active\)/);
  assert.match(source,/encounterMarker\(activeCx,activeCy,"MOVE -1","penalty"\)/);
  assert.match(source,/encounterMarker\(targetCx,targetCy,"ENCOUNTER","target"\)/);
  assert.match(css,/\.encounter-marker\.target rect/);
  assert.match(css,/\.unit-node\.turn-camera-focus \.unit-base/);
  assert.match(source,/else if\(matchMode==="hotseat"\) showPassOverlay/);
  assert.match(source,/ready\.addEventListener\("click", \(\) => \{[\s\S]{0,180}focusCameraOnUnit\(unit\)/);
  assert.match(source,/else \{[\s\S]{0,100}pass-overlay[\s\S]{0,100}focusCameraOnUnit\(unit\)/);
  assert.match(source,/\$\("#board"\)\.innerHTML=`<defs>\$\{defs\}<\/defs>\$\{cells\}\$\{units\}<g class="los-overlay-layer">\$\{losLayer\}<\/g><g class="encounter-overlay-layer">/);
});

test("clicking another allied or enemy map Unit opens its full Unit Card", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const clickHandler=source.match(/function handleHexClick\(q,r,event=null\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(clickHandler,/classList\?\.contains\("unit-node"\)\)event\.stopPropagation\(\)/);
  assert.match(clickHandler,/else if\(clicked\)\{[\s\S]{0,180}showUnitCard\(clicked\)/);
  assert.match(source,/function showUnitCard\(unit,\{inspection=false\}=\{\}\)[\s\S]{0,700}unit\.card/);
});

test("human movement keeps a draft, while Char Dash commits through Char Kick or an explicit no-target confirmation", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function beginAdjustableAdvance\(unit\)/);
  assert.match(source,/function beginAdjustableDash\(unit\)/);
  assert.match(source,/function beginAdjustableCharDash\(unit,cost,label,onComplete=null,options=\{\}\)/);
  assert.match(source,/function beginAdjustableMovement\(unit,allowance,cost,label,movementType,primaryAction\)/);
  assert.match(source,/function openMovementDraft\(unit\)/);
  assert.match(source,/function commitMovementDraft\(onComplete=\(\)=>\{\},options=\{\}\)/);
  assert.match(source,/adjustableMovement:true/);
  assert.match(source,/ยังไม่คิด Timeline จนกว่าจะยืนยัน/);
  assert.match(source,/if\(movementDraft\?\.charDash&&offerCharKickDraft\(unit\)\)/);
  assert.match(source,/DASH PREVIEW/);
  assert.match(source,/พร้อมยืนยันตำแหน่ง Dash/);
  assert.match(source,/หลังยืนยันจะตรวจ Char Kick/);
  assert.match(source,/หลังยืนยันจะตรวจ Shuji Kick/);
  assert.match(source,/confirm-dash/);
  assert.match(source,/adjust-dash/);
  assert.match(source,/cancel-dash/);
  assert.match(source,/function cancelMovementDraft\(\)/);
  const commit=source.match(/function commitMovementDraft[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(commit,/E\.pickupAt\(state,unit\)/);
  assert.match(commit,/payTimeline\(unit,draft\.cost\)/);
  assert.match(commit,/skipCharKick/);
  assert.match(source,/if\(\["chars-zaku","red-comet-zaku"\]\.includes\(unit\.id\)\)beginAdjustableCharDash\(unit,D\.rules\.dash\.timeline,"Dash",null,\{primaryAction:true\}\)/);
  const adjustable=source.match(/function beginAdjustableMovement\(unit,allowance,cost,label,movementType,primaryAction\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.doesNotMatch(adjustable,/reachable\.set\(E\.key\(unit\.q,unit\.r\),0\)/,"a Move or Dash cannot legally finish in its starting hex");
});

test("temporary Last Shot modifiers expire when the active Unit's Activation ends", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const clear=source.match(/function clearActivationTemporaryEffects[\s\S]*?\n  \}/)?.[0]||"";
  const defeated=source.match(/function finishDefeatedActiveActivation[\s\S]*?\n  \}/)?.[0]||"";
  const ended=source.match(/function endActivation\(\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(clear,/unit\.nextAttackDiscount=0/);
  assert.match(defeated,/clearActivationTemporaryEffects\(unit\)/);
  assert.match(ended,/clearActivationTemporaryEffects\(unit\)/);
});

test("ordinary Move and Dash cannot stay in place, while optional Critical Dashes may be declined", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const movement=source.match(/function startMoveFor\(unit,allowance,cost,label,afterMove,options=\{\}\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(movement,/const allowStay=options\.allowStay\?\?false/);
  assert.match(source,/`\$\{criticalLabel\} Dash`[\s\S]{0,320}\{allowStay:true,returnMenu:"main"/);
  assert.match(source,/"240mm Critical Dash"[\s\S]{0,240}\{allowStay:true,returnMenu:"main"/);
});

test("the sound button opens Song 1 / Song 2 / Off audio choices", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function showSoundMenu\(\)/);
  assert.match(source,/data-sound-choice="song1"/);
  assert.match(source,/data-sound-choice="song2"/);
  assert.match(source,/data-sound-choice="off"/);
  assert.match(source,/song1: "assets\/audio\/battle-bgm\.mp3"/);
  assert.match(source,/song2: "assets\/audio\/title-bgm\.mp3"/);
  assert.match(source,/SFX\.setMuted\(true\)/);
  assert.match(source,/BGM\.select\("off"\)/);
  assert.match(source,/\$\("#sound-btn"\)\?\.addEventListener\("click",showSoundMenu\)/);
});

test("completed-activation exits never draw Phase 2 Tactics early", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.doesNotMatch(source,/refreshPassedTeamTactics/);
  const defeated=source.match(/function finishDefeatedActiveActivation[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(defeated,/state\.lastActivatedTeam=unit\.team/);
  const movement=source.match(/function startMoveFor[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(movement,/zone==="deploying"[\s\S]{0,180}resolveBlockedDeployment\(unit\)/);
  const blockedDeploy=source.match(/function resolveBlockedDeployment\(unit\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(blockedDeploy,/state\.lastActivatedTeam=unit\.team/);
  assert.doesNotMatch(blockedDeploy,/drawTactics|refreshPassedTeamTactics/);
});

test("Return Fire obeys Engagement and revalidates nested Response windows", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const queue=source.match(/function openPostCombatResponses[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(queue,/E\.legalWeaponTargets\(state,respondingUnit,weapon\)/);
  assert.match(queue,/!state\.activation\.tacticUsed\[tacticOwner\(card\)\]/);
  assert.match(queue,/card\.id!=="return-fire"\|\|canAttack/);
  const response=source.match(/function resolvePostCombat[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(response,/E\.legalWeaponTargets\(state,unit,weapon\)/);
  assert.match(response,/returnDefenderResponses/);
  assert.match(response,/openPostCombatResponses/);
});

test("zero-target Sudden Pressure is rejected before the card is spent", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const issue=source.match(/function commandTacticIssue[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(issue,/card\.id==="sudden-pressure"/);
  assert.match(issue,/hasUnit/);
  assert.match(issue,/hasGarrison/);
});

test("AI movement evaluation removes the unit's old-position LOS blocker", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","ai.js"),"utf8");
  const score=source.match(/function positionScore[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(score,/simulatedState/);
  assert.match(score,/candidate\.id === unit\.id \? probe : candidate/);
  assert.match(score,/hasLineOfSight\(simulatedState, enemy, probe(?:,|\))/);
});

test("Title music hands off to the selected in-game BGM controller", () => {
  const titleTrack=path.join(__dirname,"..","assets","audio","title-bgm.mp3");
  const battleTrack=path.join(__dirname,"..","assets","audio","battle-bgm.mp3");
  assert.ok(fs.existsSync(titleTrack)&&fs.statSync(titleTrack).size>100_000);
  assert.ok(fs.existsSync(battleTrack)&&fs.statSync(battleTrack).size>100_000);
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const titleBgm=source.match(/const TitleBGM = \(\(\) => \{[\s\S]*?\n  \}\)\(\);/)?.[0]||"";
  assert.match(titleBgm,/new Audio\("assets\/audio\/title-bgm\.mp3"\)/);
  assert.match(titleBgm,/audio\.loop = true/);
  assert.match(titleBgm,/function stop\(\)[\s\S]*?audio\.pause\(\)[\s\S]*?audio\.currentTime=0/);
  const launch=source.match(/const launch=\(nextMode,factions\)=>\{[\s\S]*?\n    \};/)?.[0]||"";
  assert.ok(launch.indexOf("TitleBGM.stop()")>=0);
  assert.ok(launch.indexOf("BGM.start()")>launch.indexOf("TitleBGM.stop()"));
  assert.match(source,/document\.addEventListener\("pointerdown",resumeTitleMusic,true\)/);
});

test("Crimson Execution continues from Char Kick into the free Heat Hawk attack", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/Crimson Execution: Heat Hawk Attack · Timeline 0/);
  const continuation=source.match(/function continueCrimsonExecution\(card,unit\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(continuation,/weapon=>weapon\.id==="char-heat-hawk"/);
  assert.match(continuation,/beginAttack\(heatHawk,\{free:true,required:true,attackAgainPrompt:true\}\)/);
  assert.match(continuation,/if\(!isUsed\(card\.id,tacticOwner\(card\)\)\)markCommand\(card\)/);
  assert.match(source,/resolveCharKickTarget\(unit,target,continuation\)/);
  assert.match(source,/resolveCharKickGarrisonTarget\(unit,(?:garrison|target),continuation\)/);
  assert.match(source,/const continuation=mode\?\.callback\|\|null;[\s\S]{0,160}resolveCharKickTarget\(unit,target,continuation\)/);
  assert.match(source,/const afterEffects=draft\?\.afterEffects\|\|continuation;/);
  assert.match(source,/const attackAfterDash=\(\)=>continueCrimsonExecution\(card,unit\)/);
  assert.match(source,/beginAdjustableCharDash\(unit,0,"Crimson Dash",attackAfterDash/);
  assert.match(source,/const afterEffects=movementDraft\?\.afterEffects;const skipCharKick=!!movementDraft\?\.charDash;/);
});

test("active player resolves post-combat Response before the defender", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const finish=source.match(/function finishAttack\([\s\S]*?\n  \}/)?.[0]||"";
  assert.ok(finish.indexOf("{cards:attackerResponses")<finish.indexOf("{cards:defenderResponses"));
});

test("Return Fire also resolves its own counter-attacker's Response before the defender's", () => {
  // Once Return Fire connects, `returningUnit` is the attacker of that counter-attack and
  // the original `attacker` is the defender — the p.25 attacker-first ordering still applies.
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const resolvePostCombat=source.match(/function resolvePostCombat\([\s\S]*?\n  \}/)?.[0]||"";
  assert.ok(resolvePostCombat.indexOf("{cards:returnAttackerResponses")<resolvePostCombat.indexOf("{cards:returnDefenderResponses"));
});

test("finishAttack separates pre-damage and After Combat Damage Critical effects", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const finish=source.match(/function finishAttack\([\s\S]*?\n  \}/)?.[0]||"";
  assert.match(finish,/weapon\.criticalTiming!=="afterCombatDamage"\) applyCritical/);
  assert.match(finish,/E\.applyDamage\(defender,reducedAttackDamage\(attacker,defender,damage\),\{sourceType:"attack"\}\)/);
  assert.match(finish,/resolveAfterCombatCritical\(attacker,defender,weapon,result/);
  assert.ok(finish.indexOf('E.applyDamage(defender,reducedAttackDamage(attacker,defender,damage),{sourceType:"attack"})')<finish.indexOf('resolveAfterCombatCritical(attacker,defender,weapon,result'));
});

test("Return Fire separates pre-damage and After Combat Damage Critical effects", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const body=source.match(/function resolvePostCombat\([\s\S]*?\n  \}/)?.[0]||"";
  assert.match(body,/criticalEffectsActive\(result\)&&weapon\.criticalTiming!=="afterCombatDamage"\)applyCritical/);
  assert.match(body,/resolveAfterCombatCritical\(returningUnit,attacker,weapon,result/);
});

test("Earth Federation Shield protects only the defending Unit, not Cracker Grenade's direct splash", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const shield=source.match(/function offerFederationShield[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(shield,/target\?\.weapons/);
  assert.doesNotMatch(shield,/splashUnitTargets|splashDamage/);
  const finish=source.match(/function finishAttack\([\s\S]*?\n  \}/)?.[0]||"";
  assert.match(finish,/const defenderResponders=defeated\?\[\]:\[defender\]/);
  assert.doesNotMatch(finish,/defenderResponders=.*splash\.units/);
});

test("forced Push creates movement triggers such as Iron Grip", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const push=source.match(/function beginPushDirection[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(push,/movedAny=true/);
  assert.match(push,/afterUnitMove\(target,"push",onComplete,true\)/);
});


test("Disarm waits until attacker After Attack Roll abilities, then rerolls Hits and disables Critical effects", () => {
  const s=E.setupGame(()=>0.5);
  const attacker=s.units.find(unit=>unit.id==="gundam");
  const defender=s.units.find(unit=>unit.id==="chars-zaku");
  attacker.zone="board";attacker.q=2;attacker.r=2;attacker.statuses.disarm=true;
  defender.zone="board";defender.q=3;defender.r=2;
  const weapon=attacker.weapons.find(item=>item.id==="beam-rifle");
  const values=[0.0,0.39,0.89,0.0,0.0]; let i=0;
  const result=E.rollAttack(s,attacker,defender,weapon,()=>values[i++]??0);
  assert.equal(result.disarmedPending,true);
  assert.equal(result.disarmed,false);
  assert.equal(attacker.statuses.disarm,true,"rolling alone must not consume Disarm before attacker abilities");
  assert.equal(E.rerollAttackDie(s,attacker,defender,weapon,result,0,()=>0.89),true,"Newtype resolves before Disarm");
  E.resolveDisarmAttack(s,attacker,defender,weapon,result,()=>0);
  assert.equal(result.disarmed,true);
  assert.equal(result.criticalEffectsDisabled,true);
  assert.equal(attacker.statuses.disarm,false);
  assert.deepEqual(result.disarmRerolled,[1],"only the ordinary Hit is rerolled; Criticals remain");
  assert.equal(result.damage,result.hits+result.criticals,"Beam Rifle Critical Damage +2 is suppressed by Disarm");
});

test("timeline ties alternate factions and preserve same-faction stack arrival order", () => {
  const s=E.setupGame(()=>0.5);
  s.currentTick=5;s.resolvedThisTick.clear();
  const gundam=s.units.find(u=>u.id==="gundam");
  const guncannon=s.units.find(u=>u.id==="guncannon");
  const char=s.units.find(u=>u.id==="chars-zaku");
  [gundam,guncannon,char].forEach(u=>u.nextAt=5);
  gundam.timelineSeq=10;guncannon.timelineSeq=12;char.timelineSeq=11;
  s.lastActivatedTeam="zeon";
  assert.equal(E.chooseNextUnit(s).id,"gundam","after Zeon, Federation gets priority in a cross-faction tie");
  s.resolvedThisTick.add(gundam.id);s.lastActivatedTeam="fed";
  assert.equal(E.chooseNextUnit(s).id,"chars-zaku","priority alternates to the faction that did not activate last");
  s.resolvedThisTick.add(char.id);s.lastActivatedTeam="zeon";
  assert.equal(E.chooseNextUnit(s).id,"guncannon","remaining same-faction stack keeps arrival order");
});

test("a Response uses that player's one Tactic for the current activation only", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.doesNotMatch(source,/responseTacticLock|carriedResponseLock/);
  const start=source.match(/function startActivation[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(start,/tacticUsed: \{ fed: false, zeon: false \}/);
  const response=source.match(/function useResponse\(card\)[^\n]*/)?.[0]||"";
  assert.match(response,/const team=tacticOwner\(card\)/);
  assert.match(response,/state\.activation\.tacticUsed\[team\]=true/);
});

test("White Base Unity requires Range 3 and Line of Sight", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const ability=source.match(/function useUnitAbility[\s\S]*?else if \(unit\.id==="guncannon"\)/)?.[0]||"";
  assert.match(ability,/E\.distance\(unit,x\)<=3&&E\.hasLineOfSight\(state,unit,x\)&&totalUpgrades\(x\)<=1/);
});

test("Push collision defeats the pushed Unit immediately when Damage 2 is lethal", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const choose=source.match(/function beginPushDirection[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(choose,/const pushedDefeated=E\.defeatUnit\(state,target,source\.team\)/);
});

test("all attack paths pay Timeline before rolling and keep card-specific after-damage Critical timing", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const normal=source.match(/function resolveAttack\([\s\S]*?\n  \}/)?.[0]||"";
  const garrison=source.match(/function resolveGarrisonAttack\([\s\S]*?\n  \}/)?.[0]||"";
  const response=source.match(/function resolvePostCombat\([\s\S]*?\n  \}/)?.[0]||"";
  assert.ok(normal.indexOf("payTimeline(attacker")>=0&&normal.indexOf("payTimeline(attacker")<normal.indexOf("E.rollAttack"));
  assert.ok(garrison.indexOf("payTimeline(attacker")>=0&&garrison.indexOf("payTimeline(attacker")<garrison.indexOf("E.rollAttack"));
  assert.ok(response.indexOf("E.advanceUnitTimeline(state,returningUnit")>=0&&response.indexOf("E.advanceUnitTimeline(state,returningUnit")<response.indexOf("E.rollAttack"));
  for(const id of ["beam-saber","low-recoil-240","bop-missile","char-heat-hawk"]){
    const weapon=D.units.flatMap(unit=>unit.weapons).find(item=>item.id===id);
    assert.equal(weapon.criticalTiming,"afterCombatDamage",`${id} follows the timing printed on its Unit Card`);
  }
});

test("original Unit Card weapon ranges and Timeline costs remain unchanged", () => {
  const actual=Object.fromEntries(D.units.flatMap(unit=>unit.weapons.map(weapon=>[weapon.id,[weapon.timeline,weapon.range,weapon.strength]])));
  const expected={
    "beam-saber":[2,1,2],"beam-rifle":[4,4,5],
    "gc-rifle":[2,3,2],"low-recoil-240":[3,3,4],
    "bop-missile":[2,3,2],"low-recoil-120":[4,4,4],
    "char-heat-hawk":[2,1,3],"char-machine-gun":[3,2,5],
    "cracker-grenade":[2,3,2],"bazooka":[3,3,4],
    "shoulder-bash":[2,1,3],"enforcer-heat-hawk":[4,1,5],
    "wing-beam-saber":[2,1,4],"twin-buster-rifle":[4,"SP",6],
    "vidar-handgun":[3,2,3],"buret-saber":[4,1,8],
    "rex-claws":[2,1,3],"tail-blade":[4,2,7]
  };
  for(const [id,stats] of Object.entries(expected))assert.deepEqual(actual[id],stats,id);
});

test("Ultimate Team commands and follow-up attacks preserve their printed conditions", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/Full Power: Wing Gundam Zero ได้ Strength \+3/);
  assert.match(source,/controlled<2[\s\S]{0,180}Alaya-Vijnana Type E System/);
  assert.match(source,/Hunter’s Edge: ไม่มี Unit ศัตรูที่อยู่ติดกัน/);
  assert.match(source,/beginPushDirection\(unit,target,2/);
  assert.match(source,/damageUnit\(unit,target,1,"Hunter’s Edge"\)/);
  assert.match(source,/damageUnit\(unit,unit,3,"Alaya-Vijnana Exertion"/);
  assert.match(source,/!unit\.attackedWithRexClaws/);
  assert.match(source,/beginAttack\(rex,\{free:true,required:true,attackAgainPrompt:true\}\)/);
  assert.match(source,/weapon\.critical==="repeatAtTimeline0"&&!attacker\.handgunRepeatUsed/);
  assert.match(source,/weapon\.preAttack==="pull1"/);
});

test("Sacrificial Overload damages Wing and every surviving Unit or Garrison target", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const response=source.match(/else if\(card\.id==="sacrificial-overload"\)[\s\S]*?\n    \}/)?.[0]||"";
  assert.match(response,/damageUnit\(attacker,attacker,2/);
  assert.match(response,/if\(target\.weapons&&target\.zone==="board"\)damageUnit/);
  assert.match(response,/state\.garrisons\.find/);
  assert.match(response,/damageGarrison\(attacker,garrison,2/);
});

test("direct-damage abilities use the shared Shield-aware defeat path", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/damageUnit\(unit,target,1,"Char Kick"\)/);
  assert.match(source,/damageUnit\(enforcer,unit,3,"Iron Grip"\)/);
  assert.match(source,/damageUnit\(responseUnit,attacker,2,"Shattered Formation"\)/);
  assert.match(source,/damageUnit\(unit,enemy,1,"Drive Them Back","tactic"\)/);
  assert.match(source,/enemyUnits\.forEach\(target=>damageUnit\(unit,target,2,"Sudden Pressure"\)\)/);
  assert.match(source,/damageUnit\(attacker,unit,reducedAmount,"Cracker Grenade AOE"\)/);
});

test("capture effects offer every adjacent Objective and AI prefers one it does not own", () => {
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const ai=fs.readFileSync(path.join(__dirname,"..","ai.js"),"utf8");
  assert.match(game,/function adjacentObjectives\(unit\)/);
  assert.match(game,/selectObjective\(unit,"Domination"/);
  assert.match(game,/selectObjective\(unit,"Entrenched Position"/);
  assert.equal((game.match(/mode\.type==="select-objective"/g)||[]).length,1,"the Objective click branch must not be duplicated");
  assert.match(ai,/objective\.owner === unit\.team \? 12 : objective\.owner \? 125 : 105/);
});

test("rules copy describes the normal Phase 2 draw and all special-team exceptions", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(html,/ทีมพิเศษมี 3 ใบตลอดเกม/);
  assert.match(source,/White Devil, The Rival, Secret และ GQX มี 3 ใบตลอดเกม/);
  assert.doesNotMatch(html,/ทันทีเมื่อ Unit ทั้ง 3 ของฝ่ายผ่าน TL10/);
  assert.match(source,/ผู้เล่นแต่ละฝ่ายใช้ Tactic ได้สูงสุด 1 ใบต่อ Activation/);
});

test("neutral Objectives are yellow and match visuals use only the red/blue side palette", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(css,/\.objective-flag\.neutral \.objective-cloth \{[\s\S]*fill: #e6b91d;/);
  assert.match(source,/const SIDE_COLORS = Object\.freeze\(\{ blue:"#36b7ff", red:"#ff405a" \}\)/);
  assert.match(source,/function sideColor\(team\) \{ return SIDE_COLORS\[sidePalette\(team\)\]; \}/);
  assert.match(source,/document\.documentElement\.style\.setProperty\("--fed",fedColor\)/);
  assert.match(source,/document\.documentElement\.style\.setProperty\("--zeon",zeonColor\)/);
  assert.doesNotMatch(source,/ultimate-token-green|garrison-green|#35D56F/i);
  assert.doesNotMatch(css,/ultimate-token-green|#35D56F|53,213,111/i);
  assert.equal(fs.existsSync(path.join(__dirname,"..","assets","tokens","garrison-green.png")),false);
});

test("Tactic hand capacity follows the selected faction deck size", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/const deckSize=\(D\.tacticDecks\?\.\[factionForSide\(handTeam\)\]\|\|\[\]\)\.length/);
  assert.match(source,/HAND \$\{state\.hands\[handTeam\]\.length\} \/ \$\{deckSize\}/);
});

test("Drive Them Back target selection is mandatory after the Tactic is committed", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/Drive Them Back: เลือกยูนิตศัตรูที่ติดกัน[\s\S]{0,420}\{required:true\}/);
  assert.match(source,/function selectEnemy[\s\S]{0,650}required:!!options\.required/);
});

test("Escape cannot cancel a mandatory Critical, capture, or Crimson resolution", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const keyboard=source.match(/document\.addEventListener\("keydown",event=>\{[\s\S]*?\n  \}\);/)?.[0]||"";
  assert.match(keyboard,/if\(currentMode\.required\)return/);
  assert.match(source,/type:"push-direction"[\s\S]{0,180}required:true/);
  assert.match(source,/beginAttack\(heatHawk,\{free:true,required:true,attackAgainPrompt:true\}\)/);
  assert.match(source,/selectObjective\(unit,"Entrenched Position",[\s\S]{0,180},true\)/);
});

test("a blocked AI deployment takes the official Energize fallback without deadlocking the next turn", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const fallback=source.match(/function resolveBlockedDeployment\(unit\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(fallback,/unit\.energy\+=1/);
  assert.match(fallback,/payTimeline\(unit,2\)/);
  assert.match(fallback,/unit\.zone="reserve"/);
  assert.match(fallback,/aiBusy=false/);
  assert.match(fallback,/scheduleStartActivation\(\)/);
  const aiAdvance=source.match(/function aiAdvance\(unit,onComplete\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(aiAdvance,/if\(!choice&&mustMove\)\{resolveBlockedDeployment\(unit\);return;\}/);
});


test("required Drive Them Back resolves safely when no legal target remains", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const drive=source.match(/else if \(card\.id==="drive-them-back"\) \{[\s\S]*?\n    \}/)?.[0]||"";
  assert.match(drive,/const started=selectEnemy\([\s\S]*?\{required:true\}\)/);
  assert.match(drive,/if\(!started\)[\s\S]*?ไม่มี Unit ศัตรูที่ถูกกติกาให้ผลัก/);
  assert.match(drive,/mode=null;menuOpen=true;menuView="main"/);
});

test("committed Crimson Execution skips its required Attack safely when there is no legal Heat Hawk target", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const continuation=source.match(/function continueCrimsonExecution\(card,unit\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(continuation,/beginAttack\(heatHawk,\{free:true,required:true,attackAgainPrompt:true\}\)/);
  assert.match(continuation,/if\(!started\)[\s\S]*?ข้ามส่วน Attack และจบเอฟเฟกต์/);
  assert.match(continuation,/mode=null;menuOpen=true;menuView="main"/);
});


test("1 Player keeps the human Tactic hand visible during AI movement and Iron Grip uses the shared movement-response hook", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/const handTeam=matchMode==="ai"\?humanTeam:unit\.team/);
  assert.match(source,/function resolveMovementResponses\(/);
  assert.match(source,/openResponse\(\[getTactic\("iron-grip",enforcer\.team\)\]/);
  const movementBody=source.match(/function afterUnitMove\([\s\S]*?\n  function consumeCriticalOverdrive/)?.[0]||"";
  assert.match(movementBody,/resolveMovementResponses\(unit,movementType,afterEffects,movementOccurred\)/);
});


test("Hover ignores elevation cost in the engine for both human and AI movement", () => {
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"fed"});
  const wing=state.units.find(unit=>unit.id==="wing-zero-ew");
  wing.zone="board"; wing.q=0; wing.r=0;
  // Artificially make one adjacent hex two levels higher. Hover should still pay only 1 movement point.
  const [q,r]=E.neighbors(0,0)[0];
  state.board[E.key(q,r)].elevation=2;
  const reachable=E.reachable(state,wing,1);
  assert.equal(reachable.get(E.key(q,r)),1);
});

test("Alaya-Vijnana Exertion commits its own Command usage before self-damage", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const block=source.match(/else if\(unit\.id==="barbatos-lupus-rex"&&slot===2\)[\s\S]*?\n    \}/)?.[0]||"";
  assert.ok(block.indexOf("spend();")>=0 && block.indexOf("spend();") < block.indexOf('damageUnit(unit,unit,3,"Alaya-Vijnana Exertion"'));
  assert.match(block,/const legalMove=E\.reachable\(state,unit,2\)/);
});

test("Twin Buster Rifle may fire while Engaged only when the AoE includes an Engaged target", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const block=source.match(/function beginTwinBusterAttack[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(block,/const engaged=E\.engagedTargets\(state,attacker\)/);
  assert.match(block,/targets\.some\(target=>engagedIds\.has\(target\.id\)\)/);
  assert.doesNotMatch(block,/if\(E\.engagedTargets\(state,attacker\)\.length\).*return false/);
});

test("reopening an adjustable movement draft restores the unit to the original hex before reselection", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const block=source.match(/function openMovementDraft\(unit\)[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(block,/unit\.q=draft\.origin\.q; unit\.r=draft\.origin\.r; unit\.zone=draft\.origin\.zone/);
});

test("Secret Team takes the remaining red or blue token color in every matchup", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const engine=fs.readFileSync(path.join(__dirname,"..","engine.js"),"utf8");
  assert.match(engine,/const opposingSide=team==="fed"\?"zeon":"fed"/);
  assert.match(engine,/if\(opposingFaction==="zeon"\)return "blue"/);
  assert.match(engine,/if\(opposingFaction==="fed"\)return "red"/);
  assert.ok(fs.existsSync(path.join(__dirname,"..","assets","tokens","garrison-blue.png")));
  assert.ok(fs.existsSync(path.join(__dirname,"..","assets","tokens","garrison-red.png")));
  assert.equal(fs.existsSync(path.join(__dirname,"..","assets","tokens","garrison-green.png")),false);
});




test("Twin Buster confirmation previews blocked terrain in gray and can go Back to direction select", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/function twinBusterPreview/);
  assert.match(source,/previewTargets:new Set\(preview\.visible/);
  assert.match(source,/blockedTargets:new Set\(preview\.blocked/);
  assert.match(source,/mode\?\.type === "aoe-confirm" && mode\.previewTargets\?\.has/);
  assert.match(source,/mode\?\.type === "aoe-confirm" && mode\.blockedTargets\?\.has/);
  assert.match(source,/aoeConfirm\?"‹ Back · เปลี่ยนทิศ"/);
  assert.match(source,/onCancel:\(\)=>\{mode=directionMode;menuOpen=true;\}/);
  assert.match(source,/required:false,returnMenu:directionMode\.returnMenu\|\|"weapons"/);
  assert.match(css,/\.hex\.aoe-visible polygon/);
  assert.match(css,/\.hex\.aoe-blocked polygon/);
});

test("Twin Buster human aiming exposes all six directions even when every enemy is terrain-blocked", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const begin=source.match(/function beginTwinBusterAttack[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(begin,/const legalChoices=choices\.filter\(choice=>choice\.legal\)/);
  assert.match(begin,/directionChoices:choices/);
  assert.match(begin,/const uniqueAnchors=choices\.filter/);
  assert.match(begin,/targets:new Set\(uniqueAnchors\.map\(choice=>E\.key\(choice\.q,choice\.r\)\)\)/);
  assert.match(source,/data-aoe-rotation/);
  assert.match(begin,/if\(!legalChoices\.length\)return false/); // AI still refuses an illegal shot.

  // Reproduce the board position from the reported screenshot: Wing at the L2 crown,
  // Guncannon two hexes north on L1, with L2 terrain at (7,5) in between.
  const state=E.setupGame(()=>0.5,{fed:"fed",zeon:"white-devil"});
  state.units.forEach(unit=>{unit.zone="reserve";});
  const wing=state.units.find(unit=>unit.id==="wing-zero-ew");
  const guncannon=state.units.find(unit=>unit.id==="guncannon");
  wing.zone="board"; wing.q=7; wing.r=6;
  guncannon.zone="board"; guncannon.q=7; guncannon.r=4;
  assert.equal(E.elevationAt(state,7,6),2);
  assert.equal(E.elevationAt(state,7,5),2);
  assert.equal(E.elevationAt(state,7,4),1);
  assert.equal(E.hasLineOfSight(state,wing,guncannon,{ignorePieces:true}),false);
  assert.equal(E.hasTwinBusterLine(state,wing,guncannon),true,"Twin Buster fires through terrain at Wing's own elevation");
  const details=E.lineOfSightDetails(state,wing,guncannon,{ignorePieces:true});
  assert.equal(details.paths[0].blocker.type,"terrain");
  assert.deepEqual([details.paths[0].blocker.q,details.paths[0].blocker.r],[7,5]);
});

test("Twin Buster is blocked only by terrain higher than Wing and still hits a target standing on that high terrain", () => {
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"zeon"});
  const wing=state.units.find(unit=>unit.id==="wing-zero-ew");
  const target=state.units.find(unit=>unit.id==="chars-zaku");
  state.units.forEach(unit=>{unit.zone="reserve";});
  for(const hex of Object.values(state.board))hex.elevation=0;

  // Wing L0 -> target L0 behind an intervening L1 ridge: blocked.
  wing.zone="board"; wing.q=4; wing.r=4; state.board[E.key(4,4)].elevation=0;
  target.zone="board"; target.q=4; target.r=6; state.board[E.key(4,6)].elevation=0;
  state.board[E.key(4,5)].elevation=1;
  assert.equal(E.hasTwinBusterLine(state,wing,target),false);

  // Put the target ON the high L1 hex: endpoint terrain itself does not block.
  target.q=4; target.r=5;
  assert.equal(E.hasTwinBusterLine(state,wing,target),true);

  // Wing L2 can fire across L2 terrain downhill; only terrain strictly above L2 blocks.
  wing.q=4; wing.r=4; state.board[E.key(4,4)].elevation=2;
  target.q=4; target.r=6; state.board[E.key(4,6)].elevation=0;
  state.board[E.key(4,5)].elevation=2;
  assert.equal(E.hasTwinBusterLine(state,wing,target),true);
  state.board[E.key(4,5)].elevation=3;
  assert.equal(E.hasTwinBusterLine(state,wing,target),false);
});

test("Twin Buster keeps all six fixed rotations at map edges and resolves elevation accuracy per target", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const begin=source.match(/function beginTwinBusterAttack[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(begin,/Array\.from\(\{length:6\}/,"Twin Buster directions must not come from filtered map neighbors");
  assert.doesNotMatch(begin,/E\.neighbors\(attacker\.q,attacker\.r\)\.map/);

  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"zeon"});
  const wing=state.units.find(unit=>unit.id==="wing-zero-ew");
  const a=state.units.find(unit=>unit.id==="chars-zaku");
  const b=state.units.find(unit=>unit.id==="zaku-line");
  const c=state.units.find(unit=>unit.id==="zaku-enforcer");
  state.units.forEach(unit=>{unit.zone="reserve";});
  for(const hex of Object.values(state.board))hex.elevation=0;
  wing.zone="board";wing.q=5;wing.r=5;state.board[E.key(5,5)].elevation=1;
  // Accuracy is evaluated independently from the same dice values against each elevation.
  for(const [target,q,r,elev] of [[a,6,5,0],[b,6,6,1],[c,5,6,2]]){
    target.zone="board";target.q=q;target.r=r;state.board[E.key(q,r)].elevation=elev;
  }
  const weapon=wing.weapons.find(w=>w.id==="twin-buster-rifle");
  const dice=[3,4,5,6,7,8];
  const down=E.attackResultFromDice(state,wing,a,weapon,dice);
  const level=E.attackResultFromDice(state,wing,b,weapon,dice);
  const up=E.attackResultFromDice(state,wing,c,weapon,dice);
  assert.equal(down.accuracy,1);
  assert.equal(level.accuracy,0);
  assert.equal(up.accuracy,-1);
  assert.ok(down.hits+down.criticals >= level.hits+level.criticals);
  assert.ok(level.hits+level.criticals >= up.hits+up.criticals);
});


test("team select uses hologram styling and switches to opponent-red state on step two", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/factionSelect\.classList\.toggle\("opponent-step",step===2\)/);
  assert.match(css,/\.faction-select \{[\s\S]*--select-accent: #69d3ff;/);
  assert.match(css,/\.faction-select\.opponent-step \{[\s\S]*--select-accent: #ff5067;/);
  assert.match(css,/\.faction-select-panel::before/);
  assert.match(css,/@keyframes faction-holo-sweep/);
  assert.match(css,/\.secret-team-toggle \{[\s\S]*var\(--select-accent-rgb\)/);
  assert.doesNotMatch(css,/\.secret-team-toggle \{[\s\S]{0,380}53,213,111/);
});


test("v74 targeting FX has a wall-clock failsafe and the AI watchdog fully clears it", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const fx=source.match(/function clearAttackTargetingFx[\s\S]*?function spawnShotFx/)?.[0]||"";
  const wait=source.match(/function aiWaitForSettled[\s\S]*?function aiAdvance/)?.[0]||"";
  assert.match(fx,/targetingFxFailsafeTimer/);
  assert.match(fx,/cancelAnimationFrame\(targetingFxFrame\)/);
  assert.match(fx,/attackTargetingBusy=false;aiEffectPending=false/);
  assert.match(fx,/setTimeout\(\(\)=>clearAttackTargetingFx\(\{complete:true\}\),travelTime\+lockTime\+900\)/);
  assert.match(wait,/clearAttackTargetingFx\(\);mode=null;pendingAttack=null/);
});

test("Response and mid-resolution windows trap focus and inert the underlying game UI", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const response=source.match(/function openResponse[\s\S]*?function scheduleAiCallback/)?.[0]||"";
  assert.match(response,/lockResponseModal\(modal\)/);
  assert.match(source,/function lockResolutionModal/);
  assert.match(source,/shell\.inert=true/);
  assert.match(source,/dataset\.modalLock/);
  assert.match(source,/game-modal\.show\[data-modal-lock='true'\]/);
  assert.match(source,/offerNewtypeReroll[\s\S]*?lockResolutionModal\(modal\)/);
  assert.match(source,/offerGuncannonCriticalRescue[\s\S]*?lockResolutionModal\(modal\)/);
  assert.match(source,/Return Fire[\s\S]*?lockResolutionModal\(modal\)/);
  assert.match(source,/event\.key==="Tab"/);
  assert.match(source,/event\.key==="Escape"\)\{event\.preventDefault\(\);return;/);
});

test("Vidar Handgun repeat preserves the first attack continuation", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const critical=source.match(/function resolveAfterCombatCritical[\s\S]*?function applyCritical/)?.[0]||"";
  const finish=source.match(/function finishAttack[\s\S]*?function criticalEffectsActive/)?.[0]||"";
  assert.match(critical,/beginAttack\(weapon,\{free:true,required:true,attackAgainPrompt:true,onComplete\}\)/);
  assert.match(source,/pendingAttack=\{attacker,defender,weapon,result,reductions:\{\},continuation:options\.onComplete\|\|null\}/);
  assert.match(finish,/if\(continuation\)continuation\(\)/);
});

test("canceling Beam Saber Critical Move resumes post-combat resolution", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const critical=source.match(/function resolveAfterCombatCritical[\s\S]*?function applyCritical/)?.[0]||"";
  assert.match(critical,/Beam Saber Critical Move[\s\S]*onCancel:onComplete/);
});

test("Shattered Formation cannot damage an attacker that already returned to Reserve", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const post=source.match(/function openPostCombatResponses[\s\S]*?function useUnitAbility/)?.[0]||"";
  assert.match(post,/card\.id!=="shattered-formation"\|\|opposingUnit\?\.zone==="board"/);
  assert.match(post,/attackerAlive:attacker\.zone==="board"/);
  assert.match(post,/if\(attacker\.zone==="board"\)damageUnit\(responseUnit,attacker,2,"Shattered Formation"\)/);
});

test("Twin Buster edge aiming exposes six explicit direction controls instead of ambiguous shared Hexes", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const begin=source.match(/function beginTwinBusterAttack[\s\S]*?function resolveTwinBusterAttack/)?.[0]||"";
  assert.match(begin,/anchorCounts/);
  assert.match(begin,/uniqueAnchors/);
  assert.match(source,/data-aoe-rotation="\$\{choice\.rotation\}"/);
  assert.match(source,/previewTwinBusterDirection\(Number\(button\.dataset\.aoeRotation\)\)/);
  assert.match(source,/if\(matching\.length===1\)previewTwinBusterDirection/);
});

test("Wing LOS inspector uses the special AoE footprint and never shows RNaN", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const helper=source.match(/function specialAoeCanAffectInspectionTarget[\s\S]*?function inspectionWeaponGeometryAllowsTarget/)?.[0]||"";
  const los=source.match(/function renderLosInspection[\s\S]*?function blockedForEveryInRangeWeapon/)?.[0]||"";
  const button=source.match(/function renderLosButton[\s\S]*?function toggleLosInspection/)?.[0]||"";
  assert.match(helper,/twinBusterTargets\(source,rotation,weapon\)/);
  assert.match(los,/specialAoeCanAffectInspectionTarget/);
  assert.match(button,/map\(weaponRange\)/);
  assert.doesNotMatch(button,/weapon=>weapon\.range\|\|0/);
});

test("Forward Artillery counts rescues from Guncannon's actual match side", () => {
  const state=E.setupGame(()=>0.5,{fed:"zeon",zeon:"fed"});
  const guncannon=state.units.find(unit=>unit.id==="guncannon");
  assert.equal(guncannon.team,"zeon");
  state.rescuedGarrisons={fed:0,zeon:2};
  const A=require("../ai.js");
  const card=D.tactics.find(item=>item.id==="forward-artillery");
  assert.equal(A.commandTacticScore(state,guncannon,card,D,E),53);
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/const rescued=state\.rescuedGarrisons\?\.\[unit\.team\]\|\|0/);
});

test("normal adjustable Advance and Dash cannot confirm the original Hex", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const begin=source.match(/function beginAdjustableMovement[\s\S]*?function cancelMovementDraft/)?.[0]||"";
  const commit=source.match(/function commitMovementDraft[\s\S]*?function startMoveFor/)?.[0]||"";
  assert.match(begin,/placed:false/);
  assert.match(begin,/allowStay:false/);
  assert.match(commit,/if\(!moved&&draft\.origin\.zone!=="deploying"\)/);
});

test("dice and sound animations do not consume gameplay Math.random", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const dice=source.match(/function showDiceRoll[\s\S]*?function offerNewtypeReroll/)?.[0]||"";
  const sfx=source.match(/const SFX = \(\(\) => \{[\s\S]*?\}\)\(\);/)?.[0]||"";
  assert.match(dice,/visualRandom\(\)/);
  assert.doesNotMatch(dice,/Math\.random/);
  assert.doesNotMatch(sfx,/Math\.random/);
});

test("Beta10 registers six complete factions with three distinct units each",()=>{
  assert.deepEqual(D.factionOrder,["fed","zeon","white-devil","rival","secret","gqx"]);
  for(const faction of D.factionOrder)assert.equal(D.units.filter(unit=>unit.team===faction).length,3,faction);
  assert.deepEqual(D.units.filter(unit=>unit.team==="white-devil").map(unit=>unit.id).sort(),["barbatos-lupus-rex","hero-gundam","wing-zero-ew"]);
  assert.deepEqual(D.units.filter(unit=>unit.team==="rival").map(unit=>unit.id).sort(),["gundam-epyon","gundam-vidar","red-comet-zaku"]);
  assert.deepEqual(D.units.filter(unit=>unit.team==="secret").map(unit=>unit.id).sort(),["eva-01","mazinger-z","mechazawa"]);
  assert.deepEqual(D.units.filter(unit=>unit.team==="gqx").map(unit=>unit.id).sort(),["gfred","gquuuuuux","red-gundam"]);
});

test("the four special factions start with exactly three fixed Tactics and never draw again",()=>{
  for(const faction of ["white-devil","rival","secret","gqx"]){
    assert.equal(D.tacticDecks[faction].length,3);
    const state=E.setupGame(()=>.5,{fed:faction,zeon:"fed"});
    assert.equal(state.hands.fed.length,3);
    state.phase=2;E.dealTacticHand(state,"fed",()=>.5);
    assert.equal(state.hands.fed.length,3,faction);
  }
});

test("unit-locked Attack Tactics belong to their printed pilots",()=>{
  assert.equal(D.tactics.find(card=>card.id==="epic-shot").unitOnly,"hero-gundam");
  assert.equal(D.tactics.find(card=>card.id==="war-edge").unitOnly,"gundam-epyon");
  assert.equal(D.tactics.find(card=>card.id==="god-drill").unitOnly,"mechazawa");
});

test("all printed SP attacks share special AoE targeting and preserve their footprints",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  for(const id of ["war-edge","god-drill"]){
    const weapon=D.tactics.find(card=>card.id===id).weapon;
    assert.ok(weapon.aoe);
    assert.equal(weapon.range,"SP");
  }
  const breast=D.units.find(unit=>unit.id==="mazinger-z").weapons.find(weapon=>weapon.id==="breast-fire");
  assert.equal(breast.range,"SP");
  assert.equal(breast.aoe,"breastFire");
  assert.match(source,/\["twinBuster","warEdge","godDrill","breastFire"\]\.includes/);
  assert.match(source,/fullPattern\[0\],fullPattern\[1\],fullPattern\[2\],fullPattern\[4\],fullPattern\[5\],fullPattern\[7\]/);
  assert.match(source,/E\.hasTwinBusterLine\(state,attacker,hex\)/);
  assert.match(source,/criticalEffectsActive\(result\)&&weapon\.critical==="fracture"\)applyDebuff\(target,"fracture"\)/);
  assert.doesNotMatch(source,/twinBusterTargets[\s\S]{0,500}featureCoordinates\.bases/);
});

test("Hero Gundam Vulcan Critical adds two dice to the same attack result",()=>{
  const state=E.setupGame(()=>.5,{fed:"white-devil",zeon:"fed"});
  const hero=state.units.find(unit=>unit.id==="hero-gundam"),target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(hero,{zone:"board",q:5,r:5});Object.assign(target,{zone:"board",q:5,r:4});
  const weapon=hero.weapons.find(item=>item.id==="hero-vulcan");
  const result=E.attackResultFromDice(state,hero,target,weapon,[9,1,1]);
  E.addAttackDice(state,hero,target,weapon,result,2,()=>.9);
  assert.equal(result.dice.length,5);assert.equal(result.criticals,3);

  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/const previousDiceCount=lastDice\.dice\.length;/);
  assert.match(source,/appendDiceRoll\(lastDice,previousDiceCount,/);
  assert.match(source,/const newNodes=\[\.\.\.grid\.querySelectorAll\("\.rolling-d10"\)\]\.slice\(startIndex\);/);
  assert.match(source,/diceRollInterval=setInterval\(\(\)=>newNodes\.forEach/);
  assert.match(source,/keepVulcanDiceOpen\(weapon,result\)/);
});

test("Epyon gains Strength against abnormal targets and ignores elevation movement cost",()=>{
  const state=E.setupGame(()=>.5,{fed:"rival",zeon:"fed"});
  const epyon=state.units.find(unit=>unit.id==="gundam-epyon"),target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(epyon,{zone:"board",q:5,r:5});Object.assign(target,{zone:"board",q:5,r:4});
  const weapon=epyon.weapons[1];
  const normal=E.rollAttack(state,epyon,target,weapon,()=>.5).dice.length;
  target.statuses.slow=true;
  assert.equal(E.rollAttack(state,epyon,target,weapon,()=>.5).dice.length,normal+2);
  const reachable=E.reachable(state,epyon,1);assert.ok(reachable instanceof Map);
});

test("EVA-01 ignores Encounter and Berserk upgrades are removed on defeat",()=>{
  const state=E.setupGame(()=>.5,{fed:"secret",zeon:"fed"});
  const eva=state.units.find(unit=>unit.id==="eva-01"),enemy=state.units.find(unit=>unit.id==="gundam");
  Object.assign(eva,{zone:"board",q:5,r:5,hp:0,berserkActive:true,upgrades:{shield:3,speed:3,strength:3}});Object.assign(enemy,{zone:"board",q:5,r:4});
  assert.deepEqual(E.engagedTargets(state,eva),[]);
  E.defeatUnit(state,eva,enemy.team);
  assert.deepEqual(eva.upgrades,{shield:0,speed:0,strength:0});
});

test("Mazin Power, Breast Fire, Rocket Punch and Super Alloy Z are wired",()=>{
  const state=E.setupGame(()=>.5,{fed:"secret",zeon:"fed"});
  const mazinger=state.units.find(unit=>unit.id==="mazinger-z"),target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(mazinger,{zone:"board",q:5,r:5,critFloorOverride:6});Object.assign(target,{zone:"board",q:5,r:4});
  const breast=mazinger.weapons.find(weapon=>weapon.id==="breast-fire");
  assert.equal(breast.range,"SP");assert.equal(breast.aoe,"breastFire");
  const result=E.attackResultFromDice(state,mazinger,target,breast,[6]);
  assert.equal(result.criticals,1);assert.equal(result.damage,3);
  const rocket=mazinger.weapons.find(weapon=>weapon.id==="rocket-punch");
  assert.equal(rocket.ignoreLos,true);assert.equal(rocket.range,3);
  const eva=state.units.find(unit=>unit.id==="eva-01");
  assert.equal(eva.weapons.find(weapon=>weapon.id==="positron-rifle").timeline,4);
  const mechazawa=state.units.find(unit=>unit.id==="mechazawa");
  assert.equal(mechazawa.maxHp,10);assert.equal(mechazawa.vp,4);
  assert.equal(mazinger.upgrades.shield,0);
  E.beginDeploy(state,mazinger);assert.equal(mazinger.upgrades.shield,1);
  mazinger.zone="reserve";E.beginDeploy(state,mazinger);assert.equal(mazinger.upgrades.shield,2,"every deployment grants another Shield");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const ai=fs.readFileSync(path.join(__dirname,"..","ai.js"),"utf8");
  assert.match(source,/Super Alloy Z: Mazinger Z ได้รับ Shield Upgrade 1 จากการ Deploy/);
  assert.doesNotMatch(source,/Super Alloy Z: ลด Damage/);
  assert.doesNotMatch(ai,/target\.id==="mazinger-z"&&sumUpgrades/);
});

test("Rocket Punch ignores blocked Line of Sight for Units and Garrisons",()=>{
  const state=E.setupGame(()=>.5,{fed:"secret",zeon:"fed"});
  Object.values(state.board).forEach(hex=>{hex.elevation=0;});
  const mazinger=state.units.find(unit=>unit.id==="mazinger-z");
  const target=state.units.find(unit=>unit.id==="gundam");
  const blocker=state.units.find(unit=>unit.id==="guncannon");
  Object.assign(mazinger,{zone:"board",q:2,r:2});
  Object.assign(target,{zone:"board",q:4,r:3});
  const middle=E.line(mazinger,target)[1];
  Object.assign(blocker,{zone:"board",team:"zeon",q:middle.q,r:middle.r});
  state.board[E.key(middle.q,middle.r)].elevation=2;
  const blockedGarrison={id:"blocked-garrison",team:"zeon",q:4,r:2,hp:1,maxHp:1};
  state.garrisons=[blockedGarrison];
  const garrisonMiddle=E.line(mazinger,blockedGarrison)[1];
  state.board[E.key(garrisonMiddle.q,garrisonMiddle.r)].elevation=2;
  const rocket=mazinger.weapons.find(weapon=>weapon.id==="rocket-punch");
  assert.equal(E.hasLineOfSight(state,mazinger,target),false);
  assert.equal(E.hasLineOfSight(state,mazinger,blockedGarrison),false);
  const legalIds=E.legalWeaponTargets(state,mazinger,rocket).map(item=>item.id);
  assert.ok(legalIds.includes(target.id));
  assert.ok(legalIds.includes(blockedGarrison.id));
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/weapon\.ignoreLos\?" · IGNORE LOS"/);
  assert.match(source,/IGNORE LINE OF SIGHT — เลือก Unit หรือ Garrison ศัตรู/);
});

test("Beta10 team select keeps GQX beside Secret in the hidden drawer",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  for(const faction of D.factionOrder)assert.match(html,new RegExp(`data-faction="${faction}"`));
  for(const icon of ["team-white-devil.png","team-rival.png"])assert.match(html,new RegExp(icon));
  assert.match(html,/id="team-group-classic"[^>]*>[\s\S]*?CLASSIC/);
  assert.match(html,/id="team-group-starter01"[^>]*>[\s\S]*?STARTER 01/);
  const drawer=html.match(/<div id="secret-team-drawer"[\s\S]*?<\/div>/)?.[0]||"";
  assert.match(drawer,/data-faction="secret"/);
  assert.match(drawer,/data-faction="gqx"/);
  assert.match(drawer,/assets\/icons\/icon-gquuuuuux\.png/);
  assert.doesNotMatch(drawer,/data-faction="white-devil"|data-faction="rival"/);
  assert.match(drawer,/class="secret-team-question"[^>]*>\?<\/span>/);
  assert.doesNotMatch(drawer,/team-secret\.png/);
});


test("v79 unit HUD exposes compact effect icons and per-side Garrison record", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(source,/class="active-unit-pane"/);
  assert.match(source,/class="garrison-hud-pane"/);
  assert.match(source,/destroyedGarrisons\?\.\[unit\.team\]/);
  assert.match(source,/rescuedGarrisons\?\.\[unit\.team\]/);
  assert.match(source,/E\.engagedTargets\(state,unit\)\.length/);
  assert.match(source,/type:"encounter"/);
  assert.match(css,/\.hud-effect\.effect-encounter/);
  assert.match(css,/\.active-hud-inner \{ display:grid; grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\);/);
  assert.match(css,/\.garrison-record-grid/);
  assert.match(css,/\.hud-effect/);
});

test("v79 tracks destroyed Garrisons separately from rescued Garrisons", () => {
  const state=E.setupGame(()=>0.5);
  assert.deepEqual(state.destroyedGarrisons,{fed:0,zeon:0});
  assert.deepEqual(state.rescuedGarrisons,{fed:0,zeon:0});
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/state\.destroyedGarrisons\[scoringTeam\]=\(state\.destroyedGarrisons\[scoringTeam\]\|\|0\)\+1/);
});


test("v87 Hacking System queues only when Mechazawa destroys or rescues a Garrison", () => {
  const engine=fs.readFileSync(path.join(__dirname,"..","engine.js"),"utf8");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(engine,/hackingPending: 0/);
  assert.match(source,/function hackingUnitForTeam\(team\)/);
  assert.match(source,/candidate\.id==="mechazawa"&&candidate\.team===team&&candidate\.zone==="board"/);
  assert.match(source,/function queueHackingSystem\(team\)/);
  assert.match(source,/source\?\.id==="mechazawa"&&garrison\.team!==source\.team\)queueHackingSystem\(source\.team\)/);
  assert.match(source,/E\.recordGarrisonRescue\(state,unit\);\s*if\(unit\.id==="mechazawa"\)queueHackingSystem\(unit\.team\)/);
  assert.match(source,/const pending=Math\.max\(0,Number\(unit\?\.hackingPending\)\|\|0\)/);
  assert.match(source,/const consumeTrigger=\(\)=>\{unit\.hackingPending=Math\.max\(0,\(unit\.hackingPending\|\|0\)-1\);\}/);
  assert.match(source,/const continuePending=\(\)=>offerHackingSystem\(triggerUnit,onComplete\)/);
  const finish=source.match(/function finishAttack[\s\S]*?function criticalEffectsActive/)?.[0]||"";
  assert.match(finish,/offerHackingSystem\(attacker/);
});

test("v87 Motorcycle is a separate two-hex move that remains usable after Move or Dash", () => {
  const data=fs.readFileSync(path.join(__dirname,"..","data.js"),"utf8");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const ability=source.match(/else if\(unit\.id==="mechazawa"\)\{[\s\S]*?\n    \}/)?.[0]||"";
  assert.match(data,/name: "Motorcycle", energy: 1, text: "เคลื่อนที่ได้อีกสูงสุด 2 ช่อง แม้จะ Move หรือ Dash ไปแล้ว"/);
  assert.match(ability,/startMoveFor\(unit,2,0,"Motorcycle"/);
  assert.match(ability,/afterUnitMove\(unit,"motorcycle"/);
  assert.doesNotMatch(ability,/movementBonus\s*\+=\s*2/);
  assert.doesNotMatch(ability,/activation\.(advanced|actionUsed)/);
});

test("v80 Progressive Knife repeats once but every Critical still applies Fracture", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const critical=source.match(/function resolveAfterCombatCritical[\s\S]*?function applyCritical/)?.[0]||"";
  assert.match(critical,/weapon\.critical==="fractureRepeatTimeline0"/);
  assert.match(critical,/applyDebuff\(defender,"fracture"\)/);
  assert.match(critical,/if\(!attacker\.progressiveRepeatUsed\)/);
  assert.match(critical,/การโจมตีซ้ำไม่สร้างการโจมตีครั้งที่ 3/);
});

test("v80 No Escape obeys normal Line of Sight", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const ability=source.match(/else if\(unit\.id==="gundam-epyon"\)[\s\S]*?else if\(unit\.id==="eva-01"\)/)?.[0]||"";
  assert.match(ability,/No Escape: เลือก Unit ศัตรูภายใน Range 2 และ Line of Sight/);
  assert.doesNotMatch(ability,/ignoreLos:true/);
});

test("v80 Checkmate lets a human choose which surviving Upgrade is destroyed", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const checkmate=source.match(/function offerCheckmateUpgrade[\s\S]*?function finishAttack/)?.[0]||"";
  assert.match(checkmate,/data-checkmate-upgrade/);
  assert.match(checkmate,/A\.chooseUpgrade\(defender,false\)/);
  assert.match(checkmate,/lockResolutionModal\(modal\)/);
  assert.match(source,/if\(!defeated\)offerCheckmateUpgrade\(attacker,defender,continueAfterCheckmate\)/);
});

test("v80 War Edge applies Exploit Weakness to the shared roll when any Unit in its AoE is abnormal", () => {
  const state=E.setupGame(()=>0.5,{fed:"rival",zeon:"fed"});
  const epyon=state.units.find(unit=>unit.id==="gundam-epyon");
  const target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(epyon,{zone:"board",q:5,r:5,aoeExploitWeakness:true});
  Object.assign(target,{zone:"board",q:5,r:4});
  const weapon=D.tactics.find(card=>card.id==="war-edge").weapon;
  const result=E.attackResultFromDice(state,epyon,target,weapon,[4,4,4,4,4,4,4,4,4,4]);
  assert.equal(result.dice.length,10);
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/weapon\.aoe==="warEdge"&&targets\.some/);
});

test("v80 weapon-specific pull and Critical Dash logs use the real weapon name", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function beginPullToward\(attacker,defender,onComplete=\(\)=>\{\},label="Tail Blade"\)/);
  assert.match(source,/const criticalLabel=`\$\{weapon\.name\} Critical`/);
  assert.doesNotMatch(source,/addLog\("Machine Gun Critical:/);
});

test("v90 Pull moves only closer, collides with higher terrain or occupied hexes, and applies Collision Damage", () => {
  const s=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"rival"});
  const source=s.units.find(unit=>unit.id==="barbatos-lupus-rex");
  const target=s.units.find(unit=>unit.id==="gundam-epyon");
  source.zone="board";source.q=5;source.r=5;
  target.zone="board";target.q=5;target.r=3;
  Object.values(s.board).forEach(hex=>{hex.elevation=0;});
  const options=E.pullDirectionOptions(s,source,target);
  assert.ok(options.length>0);
  for(const option of options)assert.ok(E.distance(source,option)<E.distance(source,target),"every Pull choice is closer to the source");
  const option=options[0];
  s.board[E.key(option.q,option.r)].elevation=1;
  assert.equal(E.forcedPushStep(s,target,option.direction).reason,"terrain","Pull cannot climb into higher terrain");
  s.board[E.key(option.q,option.r)].elevation=0;
  const blocker=s.units.find(unit=>unit.id==="hero-gundam");
  blocker.zone="board";blocker.q=option.q;blocker.r=option.r;
  const collision=E.forcedPushStep(s,target,option.direction);
  assert.equal(collision.type,"collision");
  assert.equal(collision.unit?.id,blocker.id);
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const pull=game.match(/function beginPullToward[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(pull,/E\.applyDamage\(defender,2,\{sourceType:"collision"\}\)/);
  assert.match(pull,/damageGarrison\(attacker,step\.garrison,2,"Pull Collision"\)/);
  assert.match(pull,/E\.defeatUnit\(state,defender,attacker\.team\)/);
});

test("v90 LOS Inspector uses Attack Tactics for both range and blocked-target styling", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function losInspectionAssessment[\s\S]*?inspectionWeaponsFor\(source\)/);
  assert.match(source,/function blockedForEveryInRangeWeapon[\s\S]*?losInspectionAssessment\(source,target\)/);
  assert.match(source,/const losMaximumRange=active\?Math\.max\(0,\.\.\.inspectionWeaponsFor\(active\)\.map\(weaponRange\)\):0/);
  assert.match(source,/const inspectionWeapons=inspectionWeaponsFor\(source\)/);
});

test("v90 Tactic card confirmation is a real focus-locked modal", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const block=source.match(/function showCard\(card,note="",onConfirm=null\)[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(block,/lockResolutionModal\(modal,"#confirm-tactic,#close-tactic,\.modal-close"\)/);
});

test("v90 release removes unused legacy card/reference assets while keeping runtime assets", () => {
  for(let i=6;i<=41;i++)assert.equal(fs.existsSync(path.join(__dirname,"..","assets","cards",`card-${String(i).padStart(3,"0")}.jpg`)),false,`legacy card-${String(i).padStart(3,"0")}.jpg removed`);
  for(const old of ["assets/icons/team-secret.png","assets/icons/unit-icons.png","assets/reference/sleeping-leviathan.png"]){
    assert.equal(fs.existsSync(path.join(__dirname,"..",old)),false,`${old} removed`);
  }
  for(const live of ["assets/cards/unit-mazinger-z.jpg","assets/cards/tactic-god-drill.jpg","assets/tokens/garrison-blue.png","assets/icons/icon-eva-01.png"]){
    assert.equal(fs.existsSync(path.join(__dirname,"..",live)),true,`${live} retained`);
  }
});

test("Beta04 build sync expectations follow the current build", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  assert.match(html,/>Beta12<\/span>/);
  for(const asset of ["styles.css","data.js","engine.js","ai.js","game.js"])assert.match(html,new RegExp(`${asset.replace(".","\\.")}\\?v=beta12`));
  assert.match(fs.readFileSync(path.join(__dirname,"..","README.txt"),"utf8"),/Six Teams Beta12/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","LAUNCH-AUDIT-TH.txt"),"utf8"),/BUILD AUDIT Beta12/);
});


test("v81 Hacking System offers USE or SKIP without consuming the trigger before choice", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const hacking=source.match(/function offerHackingSystem[\s\S]*?function offerEscapeFromSide7/)?.[0]||"";
  assert.match(hacking,/id="use-hacking"/);
  assert.match(hacking,/id="skip-hacking"/);
  assert.match(hacking,/const consumeTrigger=/);
  assert.match(hacking,/onCancel:\(\)=>offerHackingSystem\(unit,onComplete\)/);
  assert.match(hacking,/RESPONSE \/\/ GARRISON EVENT/);
});

test("v81 Annihilate is unavailable and costs nothing when Rex Claws has no legal target", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/const annihilateUnavailable=.*legalWeaponTargets/);
  const ability=source.match(/else if\(unit\.id==="barbatos-lupus-rex"\)\{[\s\S]*?\n    \}/)?.[0]||"";
  assert.match(ability,/const legalTargets=rex\?E\.legalWeaponTargets/);
  assert.match(ability,/ไม่มีเป้าหมาย Rex Claws ที่โจมตีได้ — ไม่เสีย Energy หรือ Command/);
  assert.ok(ability.indexOf('if(!rex||!legalTargets.length)') < ability.indexOf('spend();beginAttack'));
});

test("v81 active HUD exposes Checkmate, Mazin Power, and Frenzied Charge temporary states", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const effects=source.match(/function unitMapEffects[\s\S]*?function renderUnitEffectBadges/)?.[0]||"";
  assert.match(effects,/tempAccuracy > 0/);
  assert.match(effects,/destroyUpgradeAfterAttack/);
  assert.match(effects,/critFloorOverride/);
  assert.match(effects,/heroBeamSaberBonus > 0/);
});

test("v91 cancelling Alaya-Vijnana Exertion rolls back only its transactional command snapshot", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const ability=source.match(/else if\(unit\.id==="barbatos-lupus-rex"&&slot===2\)[\s\S]*?else if\(unit\.id==="barbatos-lupus-rex"\)/)?.[0]||"";
  assert.match(ability,/const before=\{hp:unit\.hp,inactiveShields:unit\.inactiveShields\|\|0,energy:unit\.energy,commandUsed:\{\.\.\.commandUsageMap\(\)\}\}/);
  assert.match(ability,/unit\.hp=before\.hp/);
  assert.match(ability,/unit\.inactiveShields=before\.inactiveShields/);
  assert.match(ability,/state\.activation\.commandUsed=\{\.\.\.before\.commandUsed\}/);
  assert.match(ability,/onCancel:rollback/);
});

test("v91 Command usage is tracked per ability id rather than once per unit activation", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const engine=fs.readFileSync(path.join(__dirname,"..","engine.js"),"utf8");
  assert.match(source,/commandUsed:\s*\{\}/);
  assert.match(engine,/commandUsed:\s*\{\}/);
  assert.match(source,/function commandAbilityUsed\(ability\)/);
  assert.match(source,/commandUsageMap\(\)\[ability\.id\]/);
  assert.match(source,/function markCommandAbilityUsed\(ability\)/);
  assert.match(source,/commandUsageMap\(\)\[ability\.id\]=true/);
  assert.match(source,/commandAbilityUsed\(unit\.command\)/);
  assert.match(source,/commandAbilityUsed\(unit\.command2\)/);
  assert.doesNotMatch(source,/state\.activation\.commandUsed\s*===?\s*true/);
  assert.doesNotMatch(source,/state\.activation\.commandUsed\s*=\s*true/);
});

test("v91 Vidar and Barbatos may use both distinct Commands in one activation but not repeat the same Command", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const useAbility=source.match(/function useUnitAbility\(unit,slot=1\)[\s\S]*?function selectEnemy/)?.[0]||"";
  assert.match(useAbility,/const ability=slot===2\?unit\.command2:unit\.command/);
  assert.match(useAbility,/if \(!canUseCommandAbility\(unit,ability\)\) return/);
  assert.match(useAbility,/markCommandAbilityUsed\(ability\)/);
  const aiFollow=source.match(/function aiUseAnnihilateFollowUp[\s\S]*?function aiFinishTurn/)?.[0]||"";
  assert.match(aiFollow,/canUseCommandAbility\(unit,unit\.command\)/);
  const aiChoice=source.match(/function aiAbilityChoice[\s\S]*?function aiAbilityScore/)?.[0]||"";
  assert.match(aiChoice,/const can1=canUseCommandAbility\(unit,command1\)/);
  assert.match(aiChoice,/const can2=canUseCommandAbility\(unit,command2\)/);
});

test("Beta04 browser cache tags and docs are synchronized to the build", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  assert.match(html,/>Beta12<\/span>/);
  for(const asset of ["styles.css","data.js","engine.js","ai.js","game.js"])assert.match(html,new RegExp(`${asset.replace(".","\\.")}\\?v=beta12`));
  assert.match(fs.readFileSync(path.join(__dirname,"..","README.txt"),"utf8"),/Six Teams Beta12/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","LAUNCH-AUDIT-TH.txt"),"utf8"),/BUILD AUDIT Beta12/);
});


test("v98 team select uses the viewport and orderly responsive card regions", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  const selectCss=css.split("/* v98 Team Select rebuild")[1]||"";
  assert.equal((html.match(/class="faction-option-copy"/g)||[]).length,6);
  assert.equal((html.match(/class="faction-option-action"/g)||[]).length,6);
  assert.equal((html.match(/<em>[^<]+<\/em>/g)||[]).length,6);
  assert.equal((html.match(/<small>[^<]+<\/small>/g)||[]).length>=2,true);
  assert.match(selectCss,/\.faction-select \{[\s\S]*?position: fixed;[\s\S]*?inset: 0;/);
  assert.match(selectCss,/width: min\(920px, calc\(100vw - 40px\)\)/);
  assert.match(selectCss,/grid-template-columns: 78px minmax\(0, 1fr\) auto/);
  assert.match(selectCss,/\.faction-option-action \{[\s\S]*?position: static;/);
  assert.match(selectCss,/@media \(max-width: 780px\)/);
  assert.match(selectCss,/@media \(max-width: 560px\)/);
  assert.match(selectCss,/@media \(max-width: 360px\)/);
});


test("v96 Mechazawa Hacking System repairs exactly 1 Damage per Garrison trigger", () => {
  const data=fs.readFileSync(path.join(__dirname,"..","data.js"),"utf8");
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const hacking=source.match(/function offerHackingSystem[\s\S]*?function offerEscapeFromSide7/)?.[0]||"";
  assert.match(data,/Hacking System[^\n]*ซ่อม Damage 1/);
  assert.match(hacking,/Math\.min\(1,target\.maxHp-target\.hp\)/);
  assert.match(hacking,/ซ่อม Damage 1 ให้ Unit ฝ่ายเรา 1 ตัว/);
  assert.match(hacking,/เลือก Unit ฝ่ายเราเพื่อซ่อม Damage 1/);
  assert.doesNotMatch(hacking,/ซ่อม Damage 2/);
});

test("v83 classified Secret Team icon has animated noise treatment", () => {
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(css,/\.secret-team-question::before/);
  assert.match(css,/@keyframes secret-noise-shift/);
  assert.match(css,/@keyframes secret-noise-scan/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});


test("v84 timeline icons inspect either side without changing the active unit", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const timeline=source.match(/function renderTimeline\(\)[\s\S]*?function hexPoints/)?.[0]||"";
  assert.match(timeline,/data-timeline-unit-id/);
  assert.match(timeline,/state\.units\.find\(candidate=>candidate\.id===button\.dataset\.timelineUnitId\)/);
  assert.match(timeline,/showUnitCard\(unit,\{inspection:true\}\)/);
  assert.doesNotMatch(timeline,/activeUnitId\s*=/);
});

test("v84 unit inspection reuses the live HUD status renderer and focus lock", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(source,/function unitHudHtml\(unit,\{showAi=false\}=\{\}\)/);
  const inspect=source.match(/function showUnitCard\(unit,\{inspection=false\}=\{\}\)[\s\S]*?function showRules/)?.[0]||"";
  assert.match(inspect,/unitHudHtml\(unit\)/);
  assert.match(inspect,/lockResolutionModal\(modal,"\.modal-close"\)/);
  assert.match(inspect,/TIMELINE \/\/ UNIT DATA/);
});

test("v92 game-over restart returns to Title instead of replaying the same teams", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const result=source.match(/function showResult\(\)[\s\S]*?function renderSoundButton/)?.[0]||"";
  const back=source.match(/function returnToTitle\(\)[\s\S]*?function resetGame/)?.[0]||"";
  assert.match(result,/id="play-again">กลับหน้า Title<\/button>/);
  assert.match(result,/addEventListener\("click",returnToTitle\)/);
  assert.doesNotMatch(result,/play-again[\s\S]{0,160}resetGame\(\)/);
  assert.match(back,/state=null/);
  assert.match(back,/matchFactions=\{ fed:"fed", zeon:"zeon" \}/);
  assert.match(back,/gameShell\.inert=true/);
  assert.match(back,/document\.body\.classList\.add\("title-active"\)/);
  assert.match(back,/screen\?\.classList\.add\("show"\)/);
  assert.match(back,/TitleBGM\.start\(\)/);
});


test("v99 Escape rolls back adjustable movement drafts instead of leaking previews", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const handler=source.match(/document\.addEventListener\("keydown",event=>\{[\s\S]*?\n  \}\);/)?.[0]||"";
  assert.match(handler,/if\(movementDraft&&\(!mode\|\|mode\.adjustableMovement\)\)/);
  assert.match(handler,/cancelMovementDraft\(\)/);
  assert.ok(handler.indexOf('if(movementDraft&&(!mode||mode.adjustableMovement))') < handler.indexOf('if(mode){'),"movement draft rollback must run before generic mode cancellation");
  const cancel=source.match(/function cancelMovementDraft\(\)[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(cancel,/unit\.q=draft\.origin\.q;unit\.r=draft\.origin\.r;unit\.zone=draft\.origin\.zone/);
  assert.match(cancel,/draft\.movementType==="dash"&&draft\.primaryAction\)state\.activation\.actionUsed=false/);
  assert.match(cancel,/draft\.movementType==="advance"\)state\.activation\.advanced=false/);
});

test("v99 battle log treats log entries as text instead of HTML", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const render=source.match(/function renderLog\(\)[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(render,/document\.createElement\("li"\)/);
  assert.match(render,/li\.textContent=String\(item\)/);
  assert.match(render,/replaceChildren/);
  assert.doesNotMatch(render,/battle-log"\)\.innerHTML/);
});

test("Beta04 Mechazawa card uses the restored cache-safe asset", () => {
  const data=fs.readFileSync(path.join(__dirname,"..","data.js"),"utf8");
  assert.match(data,/card:\s*"assets\/cards\/unit-mechazawa-beta04\.jpg"/);
  assert.ok(fs.existsSync(path.join(__dirname,"..","assets","cards","unit-mechazawa-beta04.jpg")));
  assert.equal(fs.existsSync(path.join(__dirname,"..","assets","cards","unit-mechazawa-v97.jpg")),false,"previous cached filename should not remain in the release");
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const hacking=game.match(/function offerHackingSystem[\s\S]*?function offerEscapeFromSide7/)?.[0]||"";
  assert.match(hacking,/src="\$\{unit\.card\}"/);
});

test("v97 restart clears transient combat and movement state", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const reset=source.match(/function resetGame\(\) \{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(reset,/pendingAttack\s*=\s*null/);
  assert.match(reset,/movementDraft\s*=\s*null/);
  assert.match(reset,/menuView\s*=\s*"main"/);
});

test("v97 utility and result modals use the shared focus lock", () => {
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const rules=source.match(/function showRules\(\)[\s\S]*?function showResult/)?.[0]||"";
  const result=source.match(/function showResult\(\)[\s\S]*?function renderSoundButton/)?.[0]||"";
  const sound=source.match(/function showSoundMenu\(\)[\s\S]*?function renderLosButton/)?.[0]||"";
  assert.match(rules,/lockResolutionModal\(modal/);
  assert.match(result,/lockResolutionModal\(modal,"#play-again"\)/);
  assert.match(sound,/lockResolutionModal\(modal,"\[data-sound-choice\],\.modal-close"\)/);
});


test("Beta04 Secret Team stat update matches latest unit cards",()=>{
  const eva=D.units.find(unit=>unit.id==="eva-01");
  const mazinger=D.units.find(unit=>unit.id==="mazinger-z");
  assert.equal(eva.hp,12);
  assert.equal(eva.vp,9);
  assert.equal(mazinger.hp,17);
  assert.equal(mazinger.vp,10);
  assert.ok(fs.existsSync(path.join(__dirname,"..",eva.card)));
  assert.ok(fs.existsSync(path.join(__dirname,"..",mazinger.card)));
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  assert.match(html,/Beta12/);
  for(const file of ["styles.css","data.js","engine.js","ai.js","game.js"])assert.match(html,new RegExp(file.replace(".","\\.")+"\\?v=beta12"));
});

test("Beta02 Pull attacks commit Action and Timeline before the Pre-Attack Pull",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const block=source.match(/function resolveAttack\(attacker,defender,weapon,options=\{\}\)[\s\S]*?\n  function offerCheckmateUpgrade/)?.[0]||"";
  assert.match(block,/attackCommitted/);
  const spendIndex=block.indexOf("state.activation.actionUsed=true");
  const pullIndex=block.indexOf('weapon.preAttack==="pull1"');
  assert.ok(spendIndex>=0&&pullIndex>spendIndex,"attack cost must be committed before Pull resolves");
  assert.match(block,/payTimeline\(attacker,Math\.max\(0,weapon\.timeline-attacker\.nextAttackDiscount\)\)/);
  assert.match(block,/attacker\.zone==="reserve"&&finishDefeatedActiveActivation\(attacker,`\$\{weapon\.name\} Pull Collision`\)/,"a Pull collision that defeats the active attacker must end the Activation safely");
  assert.match(block,/if\(committedOptions\.onComplete\)committedOptions\.onComplete\(\)/,"a lethal Pre-Attack effect must resume the caller instead of hanging the turn");
});

test("Beta02 delayed combat FX are invalidated by Restart or Return to Title",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const combat=source.match(/function playDamageFeedback[\s\S]*?function playResolvedAttackFeedback/)?.[0]||"";
  assert.match(combat,/const epoch=gameEpoch/);
  assert.match(combat,/if\(epoch!==gameEpoch\)return/);
  assert.match(combat,/if\(epoch===gameEpoch\)playDamageFeedback/);
  const bazooka=combat.match(/function playBazookaCriticalVolley[\s\S]*?\n  \}/)?.[0]||"";
  assert.ok((bazooka.match(/if\(epoch!==gameEpoch\)return/g)||[]).length>=2,"every delayed Bazooka stage should reject an old game epoch");
  const reset=source.match(/function resetGame\(\)[\s\S]*?\n  \}/)?.[0]||"";
  const title=source.match(/function returnToTitle\(\)[\s\S]*?\n  \}/)?.[0]||"";
  for(const block of [reset,title]){
    assert.match(block,/\.combat-impact-fx/);
    assert.match(block,/\.combat-explosion-fx/);
    assert.match(block,/\.bazooka-bonus-fx/);
  }
});


test("Beta02 Secret Team theme is listed and auto-selected only at match launch",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  assert.match(game,/secret:\s*"assets\/audio\/secret-mazinger-z-bgm\.mp3"/);
  assert.ok(fs.existsSync(path.join(__dirname,"..","assets","audio","secret-mazinger-z-bgm.mp3")));
  assert.match(game,/data-sound-choice="secret"/);
  assert.match(game,/Mazinger Z \(SRW Z\)/);
  const launch=game.match(/const launch=\(nextMode,factions\)=>\{[\s\S]*?\n    \};/)?.[0]||"";
  assert.match(launch,/Object\.values\(matchFactions\)\.includes\("secret"\)\)BGM\.select\("secret"\)/);
  assert.equal((game.match(/BGM\.select\("secret"\)/g)||[]).length,1,"automatic Secret selection must happen only at launch");
  assert.match(html,/Beta12/);
  for(const file of ["styles.css","data.js","engine.js","ai.js","game.js"])assert.match(html,new RegExp(file.replace(".","\\.")+"\\?v=beta12"));
});


test("Beta07 mobile Unit Card modal stays closable and blocks pull-to-refresh",()=>{
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(css,/body\.modal-open\s*\{[^}]*overflow:\s*hidden;[^}]*overscroll-behavior:\s*none;/s);
  assert.match(css,/#game-modal\.overlay\s*\{[^}]*place-items:\s*start center;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/s);
  assert.match(css,/#game-modal \.unit-card-modal \.modal-close\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s);
  assert.match(css,/#game-modal \.modal-card\s*\{[^}]*max-height:\s*calc\(100dvh/s);
  const lock=game.match(/function lockResolutionModal[\s\S]*?function lockResponseModal/)?.[0]||"";
  const release=game.match(/function releaseResolutionModalLock[\s\S]*?function closeModal/)?.[0]||"";
  assert.match(lock,/document\.body\.classList\.add\("modal-open"\)/);
  assert.match(release,/document\.body\.classList\.remove\("modal-open"\)/);
});


test("Beta07 blocks Tactics while an attack is still resolving",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(game,/function attackResolutionBusy\(\)[\s\S]*attackTargetingBusy[\s\S]*pendingAttack[\s\S]*diceAnimationTimer/);
  const handler=game.match(/function handleTactic\(id\)[\s\S]*?function commandTacticIssue/)?.[0]||"";
  assert.match(handler,/const busyAttack=attackResolutionBusy\(\)/);
  assert.match(handler,/!busyAttack/);
});

test("Beta07 mandatory Lock Down and Breaking the Line status cannot be skipped with X",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const choose=game.match(/function chooseUpgradeToDestroy[\s\S]*?function openResponse/)?.[0]||"";
  assert.match(choose,/\.modal-close"\)\.addEventListener\("click",\(\)=>apply\(null\)\)/);
});

test("Beta07 Crimson Execution is retired before movement Responses can defeat Char",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const commit=game.match(/function commitMovementDraft[\s\S]*?function startMoveFor/)?.[0]||"";
  assert.match(commit,/if\(draft\.onCommit\)draft\.onCommit\(\);[\s\S]*afterUnitMove/);
  const use=game.match(/else if \(card\.id==="crimson-execution"\)[\s\S]*?\n    }\n    renderAll/)?.[0]||"";
  assert.match(use,/const commitCard=.*markCommand\(card\)/);
  assert.match(use,/onCommit:commitCard/);
  assert.match(use,/moved=>\{commitCard\(\);afterUnitMove/);
});

test("Beta11 AoE dice display labels each target without hiding Criticals",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(game,/master\.sharedThreshold=true/);
  assert.match(game,/master\.aoeDisplay=sharedAoeDiceDisplay/);
  assert.match(game,/SHARED ATTACK ROLL/);
  assert.match(game,/CRIT \$\{groups\.critical\.join/);
  assert.match(game,/HIT \$\{groups\.hit\.join/);
  assert.match(game,/MISS \$\{groups\.miss\.join/);
  assert.match(game,/dice-target-legend/);
  assert.match(css,/\.rolling-d10\.revealed\.split/);
  assert.match(css,/critical-sparkle-a/);
});

test("Beta11 shared AoE Disarm rerolls a Hit for any target and is target-order independent",()=>{
  const setup=()=>{
    const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"zeon"});
    const wing=state.units.find(unit=>unit.id==="wing-zero-ew");
    const low=state.units.find(unit=>unit.id==="chars-zaku");
    const high=state.units.find(unit=>unit.id==="zaku-line");
    state.units.forEach(unit=>{unit.zone="reserve";});
    for(const hex of Object.values(state.board))hex.elevation=0;
    Object.assign(wing,{zone:"board",q:5,r:5});state.board[E.key(5,5)].elevation=1;
    Object.assign(low,{zone:"board",q:6,r:5});state.board[E.key(6,5)].elevation=0;
    Object.assign(high,{zone:"board",q:5,r:6});state.board[E.key(5,6)].elevation=2;
    wing.statuses.disarm=true;
    const weapon=wing.weapons.find(item=>item.id==="twin-buster-rifle");
    const result=E.attackResultFromDice(state,wing,high,weapon,[3]);
    result.disarmedPending=true;result.sharedThreshold=true;
    return {state,wing,low,high,weapon,result};
  };
  for(const order of ["high-first","low-first"]){
    const {state,wing,low,high,weapon,result}=setup();
    const targets=order==="high-first"?[high,low]:[low,high];
    E.resolveSharedDisarmAttack(state,wing,targets,weapon,result,()=>0.9);
    assert.deepEqual(result.disarmRerolled,[0],`${order} should reroll die 3 because it Hits the lower target`);
    assert.equal(result.dice[0],10);
    assert.equal(result.criticals,1);
    assert.equal(result.criticalEffectsDisabled,true);
  }
});

test("Beta07 defeated active units clear all activation-only HUD effects",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const clear=game.match(/function clearActivationTemporaryEffects[\s\S]*?function finishDefeatedActiveActivation/)?.[0]||"";
  for(const field of ["tempStrength","tempAccuracy","movementBonus","critFloorOverride","heroBeamSaberBonus","destroyUpgradeAfterAttack","critBoost","nextAttackDiscount","lastShotBonus"])assert.match(clear,new RegExp(field));
  const defeated=game.match(/function finishDefeatedActiveActivation[\s\S]*?function ensurePhaseTransitionOverlay/)?.[0]||"";
  assert.match(defeated,/clearActivationTemporaryEffects\(unit\)/);
});

test("Beta07 Jump can bypass lower enemies but never an enemy Base",()=>{
  const state=E.setupGame(()=>0.25,{fed:"white-devil",zeon:"zeon"});
  const jumper=state.units.find(u=>u.team==="fed");
  Object.assign(jumper,{zone:"board",q:1,r:2});
  // Force an elevated start so Jump is active; the real board elevation lookup determines the route.
  const reachable=E.reachable(state,jumper,7);
  const enemyBase=D.map.featureCoordinates.bases.find(base=>base.team==="zeon");
  assert.ok(enemyBase);
  assert.equal(reachable.has(E.key(enemyBase.q,enemyBase.r)),false,"enemy Base itself must never be a legal destination");
  if(enemyBase.q===7&&enemyBase.r===0)assert.equal(reachable.has(E.key(8,0)),false,"Jump must not route through the enemy Base to hex 8,0");
  const engine=fs.readFileSync(path.join(__dirname,"..","engine.js"),"utf8");
  assert.match(engine,/if \(isEnemyBase\) continue;/);
  assert.match(engine,/\(isEnemyUnit \|\| isEnemyGarrison\) && !jumpsOverEnemy/);
});

test("Beta07 AoE damage FX preserves the victim hex before defeat clears coordinates",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const aoe=game.match(/function resolveTwinBusterAttack[\s\S]*?function resolveGarrisonAttack/)?.[0]||"";
  assert.match(aoe,/const impact=\{q:target\.q,r:target\.r\};[\s\S]*E\.defeatUnit\(state,target,attacker\.team\)[\s\S]*playDamageFeedback\(\{to:impact/);
});

test("Beta07 hot-seat PASS CONTROL makes the game shell inert and traps keyboard focus",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const pass=game.match(/function setPassControlLock[\s\S]*?function advanceTimeline/)?.[0]||"";
  assert.match(pass,/shell\.inert=!!locked/);
  assert.match(pass,/setPassControlLock\(true\)/);
  assert.match(pass,/setPassControlLock\(false\)/);
  const keys=game.match(/document\.addEventListener\("keydown"[\s\S]*?initTitle/)?.[0]||"";
  assert.match(keys,/pass-overlay\.show/);
  assert.match(keys,/event\.key==="Tab"/);
});


test("Beta07 Pull is up to 1: players and AI may choose 0 without cancelling the attack",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const ai=fs.readFileSync(path.join(__dirname,"..","ai.js"),"utf8");
  assert.match(game,/id="stop-pull"/);
  assert.match(game,/Pull 0/);
  assert.match(game,/canStop:true,stopCallback:/);
  assert.match(game,/A\.choosePullDirection\?\./);
  assert.match(ai,/function choosePullDirection/);
  assert.match(ai,/scored\.push\(\{score:0,stop:true\}\)/);
});

test("Beta07 adjacent Pull never treats the puller's own hex as a Collision",()=>{
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"rival"});
  const source=state.units.find(unit=>unit.id==="barbatos-lupus-rex");
  const target=state.units.find(unit=>unit.id==="gundam-epyon");
  Object.values(state.board).forEach(hex=>{hex.elevation=0;});
  Object.assign(source,{zone:"board",q:5,r:5});
  Object.assign(target,{zone:"board",q:5,r:4});
  assert.equal(E.distance(source,target),1);
  assert.deepEqual(E.pullDirectionOptions(state,source,target),[],"distance-1 target cannot be Pulled into the puller's occupied hex");
});

test("Beta07 forced movement accepts Garrisons and Pull/Push direction helpers move them",()=>{
  const state=E.setupGame(()=>0.5,{fed:"white-devil",zeon:"rival"});
  const source=state.units.find(unit=>unit.id==="barbatos-lupus-rex");
  Object.assign(source,{zone:"board",q:5,r:5});
  const garrison={id:"beta07-garrison",team:"zeon",q:5,r:3,hp:3,maxHp:3};
  state.garrisons=[garrison];
  Object.values(state.board).forEach(hex=>{hex.elevation=0;});
  const pulls=E.pullDirectionOptions(state,source,garrison);
  const pushes=E.pushDirectionOptions(state,source,garrison);
  assert.ok(pulls.length>0,"Garrison should expose Pull choices");
  assert.ok(pushes.length>0,"Garrison should expose Push choices");
  assert.ok(["move","collision","blocked"].includes(E.forcedPushStep(state,garrison,pulls[0].direction).type));
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const garrisonAttack=game.match(/function resolveGarrisonAttack[\s\S]*?\n  function damageGarrison/)?.[0]||"";
  assert.match(garrisonAttack,/weapon\.preAttack==="pull1"/);
  assert.match(garrisonAttack,/beginPullToward\(attacker,garrison/);
  assert.match(garrisonAttack,/applyCritical\(attacker,garrison,weapon,result,dealDamageAndFinish\)/);
  const push=game.match(/function beginPushDirection[\s\S]*?\n  function availablePostCombat/)?.[0]||"";
  assert.match(push,/targetIsGarrison/);
  assert.match(push,/damageGarrison\(source,target,2,"Push Collision"\)/);
});

test("Beta07 board edge stops Push/Pull without Collision Damage",()=>{
  const state=E.setupGame(()=>0.5);
  const target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(target,{zone:"board",q:0,r:0});
  // Cube direction (-1,+1,0) from odd-q (0,0) exits the board.
  const step=E.forcedPushStep(state,target,{x:-1,y:1,z:0});
  assert.equal(step.type,"blocked");
  assert.equal(step.reason,"edge");
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.doesNotMatch(game,/ชนขอบสนาม — รับ Damage/);
});


test("Beta10 GQX data matches the approved three-unit roster",()=>{
  const gqx=D.units.find(unit=>unit.id==="gquuuuuux");
  const gfred=D.units.find(unit=>unit.id==="gfred");
  const red=D.units.find(unit=>unit.id==="red-gundam");
  assert.deepEqual([gqx.hp,gqx.vp,gqx.tl],[13,8,2]);
  assert.deepEqual([gfred.hp,gfred.vp,gfred.tl],[12,8,3]);
  assert.deepEqual([red.hp,red.vp,red.tl],[13,8,1]);
  assert.deepEqual(gqx.weapons.map(w=>[w.id,w.timeline,w.range,w.strength,w.critical]),[
    ["gqx-heat-hawk",2,1,5,"damage1"],["gqx-vulcan",2,2,3,"slow"]
  ]);
  assert.deepEqual(gfred.weapons.map(w=>[w.id,w.timeline,w.range,w.strength,w.ignoreLos,w.critical]),[
    ["gfred-luna",2,4,4,true,"slow"],["gfred-artemis",3,5,5,true,"damage2"]
  ]);
  assert.deepEqual(red.weapons.map(w=>[w.id,w.timeline,w.range,w.strength,w.ignoreLos||false,w.critical]),[
    ["red-gundam-beam-saber",2,1,3,false,"damage2"],["red-gundam-bits",3,4,5,false,"disarm"]
  ]);
  assert.equal(gqx.ignoreForcedCollisionDamage,true);
  assert.equal(gfred.ignoreForcedCollisionDamage,true);
  assert.equal(red.dashBonus,1);
});

test("Beta10 High Mobility Frame ignores only Push/Pull Collision Damage",()=>{
  const state=E.setupGame(()=>0.5,{fed:"gqx",zeon:"fed"});
  const gqx=state.units.find(unit=>unit.id==="gquuuuuux");
  const gfred=state.units.find(unit=>unit.id==="gfred");
  const red=state.units.find(unit=>unit.id==="red-gundam");
  for(const unit of [gqx,gfred,red])unit.hp=unit.maxHp;
  assert.equal(E.applyDamage(gqx,2,{sourceType:"collision"}).taken,0);
  assert.equal(E.applyDamage(gfred,2,{sourceType:"collision"}).taken,0);
  assert.equal(E.applyDamage(red,2,{sourceType:"collision"}).taken,2);
  assert.equal(E.applyDamage(gqx,2,{sourceType:"attack"}).taken,2,"normal Combat Damage is not prevented");
});

test("Beta10 Nyaan Focus makes 8 Critical and adds Accuracy without changing Artemis base Strength",()=>{
  const state=E.setupGame(()=>0.5,{fed:"gqx",zeon:"fed"});
  const gfred=state.units.find(unit=>unit.id==="gfred");
  const target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(gfred,{zone:"board",q:4,r:4,tempAccuracy:1,critFloorOverride:8});
  Object.assign(target,{zone:"board",q:4,r:5});
  const artemis=gfred.weapons.find(w=>w.id==="gfred-artemis");
  const result=E.attackResultFromDice(state,gfred,target,artemis,[8,7,4,3,1]);
  assert.equal(result.criticals,1);
  assert.equal(result.accuracy,1);
  assert.equal(artemis.strength,5);
});

test("Beta10 KIRA KIRA adds one Damage per active Critical with no cap",()=>{
  const state=E.setupGame(()=>0.5,{fed:"gqx",zeon:"fed"});
  const red=state.units.find(unit=>unit.id==="red-gundam");
  const target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(red,{zone:"board",q:4,r:4});Object.assign(target,{zone:"board",q:4,r:5});
  const weapon={id:"test-overdrive",timeline:2,range:1,strength:4,criticalOverdrivePerCrit:1};
  const result=E.attackResultFromDice(state,red,target,weapon,[9,10,9,4]);
  assert.equal(result.criticals,3);
  assert.equal(result.damage,7,"4 base Hit/Critical Damage +3 from KIRA KIRA");
  result.criticalEffectsDisabled=true;
});

test("Beta10 Disarm suppresses weapon Critical Hit Effect but preserves Critical results and KIRA KIRA damage",()=>{
  const state=E.setupGame(()=>0.5,{fed:"gqx",zeon:"fed"});
  const red=state.units.find(unit=>unit.id==="red-gundam");
  const target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(red,{zone:"board",q:4,r:4});Object.assign(target,{zone:"board",q:4,r:5});
  red.statuses.disarm=true;
  const weapon={id:"disarmed-kira",timeline:2,range:1,strength:3,critical:"damage2",criticalOverdrivePerCrit:1};
  // Initial 9=Critical, 4=Hit, 1=Miss; Disarm rerolls only the Hit to 5=Hit.
  const rolls=[.89,.39,0,.49]; let i=0;
  const result=E.rollAttack(state,red,target,weapon,()=>rolls[i++]);
  assert.equal(result.criticals,1);
  E.resolveDisarmAttack(state,red,target,weapon,result,()=>rolls[i++]);
  assert.equal(result.criticalEffectsDisabled,true);
  assert.equal(result.criticals,1,"Disarm does not erase rolled Critical results");
  assert.equal(result.damage,3,"2 base damage +1 KIRA KIRA; printed Critical Damage +2 is suppressed");
});

test("Beta10 GQX Disarm/UI wiring keeps Omega and KIRA KIRA separate from Critical Hit Effects",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  assert.match(game,/Omega Psycommu Active keys off the presence of a Critical result/);
  assert.match(game,/if\(!allowance\|\|attacker\?\.zone!=="board"\|\|!\(result\?\.criticals>0\)\)/);
  assert.match(game,/unit\.id==="gfred"\?"Nyaan Focus"/);
  assert.doesNotMatch(game,/ตำแหน่งนี้ไม่มีเป้าหมาย Char Kick/);
  assert.match(game,/หลังยืนยันจะตรวจ Shuji Kick/);
  assert.match(game,/D\.rules\.dash\.distance\+dashBonus\(unit\)\+\(unit\.movementBonus\|\|0\)/);
});

test("Beta10 Another Timeline rerolls the whole attack pool and keeps its size",()=>{
  const state=E.setupGame(()=>0.5,{fed:"gqx",zeon:"fed"});
  const red=state.units.find(unit=>unit.id==="red-gundam");
  const target=state.units.find(unit=>unit.id==="gundam");
  Object.assign(red,{zone:"board",q:4,r:4});Object.assign(target,{zone:"board",q:4,r:5});
  const bits=red.weapons.find(w=>w.id==="red-gundam-bits");
  const original=E.attackResultFromDice(state,red,target,bits,[1,2,3,4,5]);
  const seq=[.89,.79,.69,.59,.49];let i=0;
  const rerolled=E.rerollAttackPool(state,red,target,bits,original,()=>seq[i++]);
  assert.deepEqual(rerolled.dice,[9,8,7,6,5]);
  assert.equal(rerolled.dice.length,original.dice.length);
  assert.equal(rerolled.poolRerolled,true);
});

test("Beta10 GQX interaction hooks are wired without new token or status types",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const engine=fs.readFileSync(path.join(__dirname,"..","engine.js"),"utf8");
  assert.match(game,/Omega Psycommu Active/);
  assert.match(game,/startMoveFor\(attacker,allowance,0,"Omega Psycommu Active"/);
  assert.match(game,/unit\.id==="red-gundam"&&movementType==="dash"/);
  assert.match(game,/Shuji Kick:[\s\S]*Push up to 1/);
  assert.match(game,/target=>E\.distance\(unit,target\)===1/);
  assert.doesNotMatch(game,/Shuji Kick[\s\S]{0,500}garrisons\.filter/);
  assert.match(game,/function resolveGundamGo/);
  assert.match(game,/startMoveFor\(ally,1,0,"GUNDAM GO!"/);
  assert.match(game,/E\.rerollAttackPool\(state,attacker,defender,weapon,result\)/);
  assert.match(engine,/target\?\.ignoreForcedCollisionDamage/);
});



test("Beta10 mandatory bonus attacks show a small Attack again prompt over the acting unit",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(game,/function renderAttackAgainPrompt\(cx,cy\)/);
  assert.match(game,/Attack again/);
  assert.match(game,/Select a target/);
  assert.match(game,/mode\?\.type==="attack"&&mode\.attackAgainPrompt&&mode\.unitId===unit\.id&&!isAiTeam\(unit\.team\)/);
  const flagged=(game.match(/beginAttack\([^\n]+attackAgainPrompt:true/g)||[]);
  assert.equal(flagged.length,4,"exactly Vidar, EVA, Annihilate, and Crimson Execution request the repeat-attack bubble");
  assert.match(game,/Handgun Critical:[\s\S]{0,260}attackAgainPrompt:true/);
  assert.match(game,/Progressive Knife Critical:[\s\S]{0,300}attackAgainPrompt:true/);
  assert.match(game,/Annihilate:[\s\S]{0,600}attackAgainPrompt:true/);
  assert.match(game,/Crimson Execution:[\s\S]{0,420}attackAgainPrompt:true/);
  assert.match(css,/\.attack-again-prompt\{pointer-events:none/);
});

test("Beta11 dice results wait for human close and expose per-die labels",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(game,/class="dice-roll-close"/);
  assert.match(game,/class="dice-outcome"/);
  assert.match(game,/if\(manualClose&&!options\.keepOpen\)/);
  assert.match(game,/manualClose:!isAiTeam\(attacker\.team\)/);
  assert.match(css,/\.dice-roll-close/);
  assert.match(css,/\.dice-outcome/);
});

test("Beta12 LOS Inspector distinguishes clear LOS blocked only by Engagement",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  const assess=game.match(/function losInspectionAssessment[\s\S]*?function renderLosInspection/)?.[0]||"";
  assert.match(assess,/inspectionWeaponCanAttackTarget/);
  assert.match(assess,/E\.engagedTargets\(state,source\)\.length>0/);
  assert.match(assess,/status:canAttack\?"clear":engagementBlocked\?"engaged":"blocked"/);
  assert.match(game,/CLEAR LOS · Cannot target — ENGAGED/);
  assert.match(game,/type:"garrison", id:garrison\.id, team:garrison\.team, faction, q:garrison\.q, r:garrison\.r/);
  assert.match(css,/\.los-path\.engaged/);
  assert.match(css,/\.los-engagement-target/);
});

test("Beta12 dice results fit short screens and trap focus until dismissed",()=>{
  const game=fs.readFileSync(path.join(__dirname,"..","game.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
  assert.match(game,/lockResolutionModal\(overlay,"\.dice-roll-close:not\(:disabled\)"\)/);
  assert.match(game,/#dice-roll-overlay\.show\[data-modal-lock='true'\]/);
  assert.match(game,/releaseResolutionModalLock\(overlay\)/);
  assert.match(css,/\.dice-roll-overlay \{[^}]*overflow-y:auto/);
  assert.match(css,/\.dice-roll-card \{[^}]*max-height:calc\(100% - 4px\)[^}]*overflow-y:auto/);
  assert.match(css,/@media \(max-height: 520px\)/);
});

test("Beta12 build and cache tags are synchronized",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
  assert.match(html,/>Beta12<\/span>/);
  for(const file of ["styles.css","data.js","engine.js","ai.js","game.js"])assert.match(html,new RegExp(`${file.replace('.','\\.')}\\?v=beta12`));
});

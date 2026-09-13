(function (root) {
  "use strict";

  const DATA = root.GA_DATA || (typeof require !== "undefined" ? require("./data.js") : null);
  const DIR_EVEN = [[1,-1],[1,0],[0,1],[-1,0],[-1,-1],[0,-1]];
  const DIR_ODD  = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[0,-1]];
  const key = (q, r) => `${q},${r}`;
  const fromKey = value => value.split(",").map(Number);
  const timelineSlot = value => ((value - 1) % 10) + 1;
  const inBounds = (q, r) => q >= 0 && q < DATA.map.cols && r >= 0 && r < DATA.map.rows;

  function neighbors(q, r) {
    const dirs = q & 1 ? DIR_ODD : DIR_EVEN;
    return dirs.map(([dq, dr]) => [q + dq, r + dr]).filter(([nq, nr]) => inBounds(nq, nr));
  }

  function oddqToCube(q, r) {
    const x = q;
    const z = r - (q - (q & 1)) / 2;
    return { x, y: -x - z, z };
  }

  function cubeToOddq(cube) {
    return [cube.x, cube.z + (cube.x - (cube.x & 1)) / 2];
  }

  function distance(a, b) {
    const ac = oddqToCube(a.q, a.r);
    const bc = oddqToCube(b.q, b.r);
    return Math.max(Math.abs(ac.x - bc.x), Math.abs(ac.y - bc.y), Math.abs(ac.z - bc.z));
  }

  function cubeRound(c) {
    let rx = Math.round(c.x), ry = Math.round(c.y), rz = Math.round(c.z);
    const dx = Math.abs(rx - c.x), dy = Math.abs(ry - c.y), dz = Math.abs(rz - c.z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    return { x: rx, y: ry, z: rz };
  }

  function lineNudged(a, b, sign = 1) {
    const n = distance(a, b);
    const a0 = oddqToCube(a.q, a.r), b0 = oddqToCube(b.q, b.r);
    // A microscopic cube-coordinate nudge resolves the exact "between two hexes" case.
    // Trying both signs gives the two legal sight-lines; the attacker may use either clear one.
    const eps = 1e-6 * sign;
    const ac = { x:a0.x+eps, y:a0.y+eps, z:a0.z-2*eps };
    const bc = { x:b0.x+eps, y:b0.y+eps, z:b0.z-2*eps };
    const result = [];
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const cube = cubeRound({
        x: ac.x + (bc.x - ac.x) * t,
        y: ac.y + (bc.y - ac.y) * t,
        z: ac.z + (bc.z - ac.z) * t
      });
      const [q, r] = cubeToOddq(cube);
      result.push({ q, r });
    }
    return result;
  }

  function line(a, b) { return lineNudged(a,b,1); }

  function lineVariants(a,b) {
    const first=lineNudged(a,b,1), second=lineNudged(a,b,-1);
    const signature=path=>path.map(hex=>key(hex.q,hex.r)).join("|");
    return signature(first)===signature(second)?[first]:[first,second];
  }

  function elevationAt(state, q, r) {
    return state.board[key(q, r)]?.elevation ?? 0;
  }

  function unitAt(state, q, r) {
    return state.units.find(unit => unit.zone === "board" && unit.q === q && unit.r === r) || null;
  }

  function garrisonAt(state, q, r) {
    return state.garrisons?.find(garrison => garrison.q === q && garrison.r === r) || null;
  }

  function baseAt(q, r) {
    return DATA.map.featureCoordinates.bases.find(base => base.q === q && base.r === r) || null;
  }

  function lineOfSightDetails(state, attacker, target) {
    // Adjacent targets never have an intervening hex, so LOS is automatically clear.
    if (distance(attacker,target) <= 1) return {clear:true,paths:[{clear:true,path:line(attacker,target),blocker:null}]};
    const aElev = elevationAt(state, attacker.q, attacker.r);
    const tElev = elevationAt(state, target.q, target.r);
    const highElev = Math.max(aElev,tElev);
    const sameElevation = aElev === tElev;
    const inspectPath = path => {
      for (const hex of path.slice(1,-1)) {
        const hexElevation=elevationAt(state,hex.q,hex.r);
        // p.20: terrain above both endpoints always blocks. If the endpoints are at
        // different elevations, terrain level with the higher endpoint also blocks.
        const terrainBlocks = hexElevation > highElev || (!sameElevation && hexElevation === highElev);
        if (terrainBlocks) {
          return {clear:false,path,blocker:{...hex,type:"terrain",elevation:hexElevation}};
        }

        // Allied pieces never block LOS. Enemy Units, Garrisons, and structures only
        // block at the shared elevation, or at the higher endpoint's elevation when
        // the acting unit and target are on different levels. Objectives are not structures.
        const blockingUnit=unitAt(state,hex.q,hex.r);
        if (blockingUnit && blockingUnit.team !== attacker.team && hexElevation === highElev) {
          return {clear:false,path,blocker:{...hex,type:"unit",elevation:hexElevation,id:blockingUnit.id}};
        }
        const blockingGarrison=garrisonAt(state,hex.q,hex.r);
        if (blockingGarrison && blockingGarrison.team !== attacker.team && hexElevation === highElev) {
          return {clear:false,path,blocker:{...hex,type:"garrison",elevation:hexElevation,id:blockingGarrison.id}};
        }

        const blockingBase=baseAt(hex.q,hex.r);
        if (blockingBase && blockingBase.team !== attacker.team && hexElevation === highElev) {
          return {clear:false,path,blocker:{...hex,type:"base",elevation:hexElevation}};
        }
      }
      return {clear:true,path,blocker:null};
    };
    // When the center-to-center line lies exactly between two hexes, the attacker chooses
    // which of the two hex paths to use. LOS therefore succeeds if either path is clear.
    const paths=lineVariants(attacker,target).map(inspectPath);
    return {clear:paths.some(result=>result.clear),paths};
  }

  function hasLineOfSight(state, attacker, target) {
    return lineOfSightDetails(state,attacker,target).clear;
  }

  function engagedEnemies(state, unit) {
    if (!unit || unit.zone !== "board") return [];
    const elevation = elevationAt(state, unit.q, unit.r);
    return livingEnemies(state, unit).filter(enemy =>
      distance(unit, enemy) === 1 && elevationAt(state, enemy.q, enemy.r) === elevation
    );
  }

  function engagedGarrisons(state, unit) {
    if (!unit || unit.zone !== "board") return [];
    const elevation = elevationAt(state, unit.q, unit.r);
    return (state.garrisons || []).filter(garrison =>
      garrison.team !== unit.team &&
      distance(unit, garrison) === 1 &&
      elevationAt(state, garrison.q, garrison.r) === elevation
    );
  }

  function engagedTargets(state, unit) {
    return [...engagedEnemies(state, unit), ...engagedGarrisons(state, unit)];
  }

  function reachable(state, unit, allowance, options = {}) {
    const engagementPenalty = !options.ignoreEngagement && engagedTargets(state, unit).length ? 1 : 0;
    const effectiveAllowance = Math.max(0, allowance - engagementPenalty);
    const start = key(unit.q, unit.r);
    const startElevation = elevationAt(state, unit.q, unit.r);
    // Ignoring terrain costs does not switch off the unit's normal Jump state.
    // A movement ability such as Zeon Zealotry can ignore elevation costs while a
    // unit that started elevated still bypasses enemies below its starting level.
    const jumping = startElevation > 0;
    const queue = [[unit.q, unit.r, 0]];
    const visited = new Map([[start, 0]]);
    const costs = new Map();
    while (queue.length) {
      const [q, r, cost] = queue.shift();
      if (cost >= effectiveAllowance) continue;
      for (const [nq, nr] of neighbors(q, r)) {
        const nk = key(nq, nr);
        if (options.forbidden?.has(nk)) continue;

        const occupant = unitAt(state, nq, nr);
        const isEnemyUnit = !!occupant && occupant.team !== unit.team;
        const garrison = garrisonAt(state, nq, nr);
        const isEnemyGarrison = !!garrison && garrison.team !== unit.team;
        const base = baseAt(nq,nr);
        const isEnemyBase = !!base && base.team !== unit.team;

        const nextElevation = elevationAt(state, nq, nr);
        // Rule (p.17, Jumping): a unit jumping from elevated terrain may bypass enemy units
        // or enemy Garrisons at a lower elevation than its own starting elevation.
        const jumpsOverEnemy = jumping && nextElevation < startElevation;
        // Enemy pieces and structures are otherwise fully impassable (p.14).
        if ((isEnemyUnit || isEnemyGarrison || isEnemyBase) && !jumpsOverEnemy) continue;

        const currentElevation = elevationAt(state, q, r);
        const elevationBaseline = jumping ? Math.max(startElevation, currentElevation) : currentElevation;
        const climbCost = options.ignoreElevation ? 0 : Math.max(0, nextElevation - elevationBaseline);
        const next = cost + 1 + climbCost;
        if (next > effectiveAllowance) continue;
        if (visited.has(nk) && visited.get(nk) <= next) continue;
        visited.set(nk, next);
        queue.push([nq, nr, next]);

        // A unit may pass through allied Units, Garrisons, and structures, but it may
        // never end movement in any occupied hex or on a Base.
        const blocksEnding = !!occupant || !!garrison || !!base;
        if (blocksEnding) costs.delete(nk);
        else costs.set(nk, next);
      }
    }
    return costs;
  }


  function pushDirectionOptions(state, source, target) {
    if (!state || !source || !target || target.zone !== "board") return [];
    const currentDistance=distance(source,target);
    const targetCube=oddqToCube(target.q,target.r);
    return neighbors(target.q,target.r)
      .map(([q,r])=>({q,r,d:distance(source,{q,r})}))
      .filter(candidate=>candidate.d>currentDistance)
      .map(candidate=>{
        const cube=oddqToCube(candidate.q,candidate.r);
        return {
          q:candidate.q,r:candidate.r,
          direction:{x:cube.x-targetCube.x,y:cube.y-targetCube.y,z:cube.z-targetCube.z}
        };
      });
  }

  function forcedPushStep(state, target, direction) {
    if (!state || !target || target.zone !== "board" || !direction) return { type:"blocked", reason:"invalid" };
    const currentCube=oddqToCube(target.q,target.r);
    const destinationCube={
      x:currentCube.x+direction.x,
      y:currentCube.y+direction.y,
      z:currentCube.z+direction.z
    };
    const [q,r]=cubeToOddq(destinationCube);
    if(!inBounds(q,r))return {type:"collision",reason:"edge",q:target.q,r:target.r};
    const currentElevation=elevationAt(state,target.q,target.r);
    const destinationElevation=elevationAt(state,q,r);
    if(destinationElevation>currentElevation)return {type:"collision",reason:"terrain",q,r};
    const occupiedUnit=unitAt(state,q,r);
    const occupiedGarrison=garrisonAt(state,q,r);
    const occupiedBase=baseAt(q,r);
    if(occupiedUnit||occupiedGarrison||occupiedBase){
      return {type:"collision",reason:"occupied",q,r,unit:occupiedUnit,garrison:occupiedGarrison,base:occupiedBase};
    }
    return {type:"move",q,r};
  }

  function shuffle(values, rng = Math.random) {
    const out = values.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function boardData() {
    const e1 = new Set(DATA.map.elevation1.map(([q,r]) => key(q,r)));
    const e2 = new Set(DATA.map.elevation2.map(([q,r]) => key(q,r)));
    const board = {};
    for (let q = 0; q < DATA.map.cols; q++) {
      for (let r = 0; r < DATA.map.rows; r++) {
        board[key(q,r)] = { q, r, elevation: e2.has(key(q,r)) ? 2 : e1.has(key(q,r)) ? 1 : 0 };
      }
    }
    return board;
  }

  function setupGame(rng = Math.random) {
    const selected = shuffle(DATA.mysteryPool, rng).slice(0, 9);
    const units = DATA.units.map((unit, index) => ({
      ...unit,
      maxHp: unit.hp,
      zone: "reserve",
      q: null,
      r: null,
      energy: 0,
      upgrades: { shield: 0, speed: 0, strength: 0 },
      inactiveShields: 0,
      statuses: { slow: false, fracture: false, disarm: false },
      nextAt: unit.tl,
      timelineSeq: index + 1,
      tempStrength: 0,
      critBoost: false,
      nextAttackDiscount: 0,
      lastShotBonus: false,
      rescuedGarrisons: 0,
      hasDeployed: false
    }));
    const garrisons = [];
    for (const team of ["fed","zeon"]) {
      DATA.map.featureCoordinates.garrisons[team].forEach(([q,r], index) => garrisons.push({ id: `${team}-g${index+1}`, team, q, r, hp: 1, maxHp: 1 }));
    }
    const upgrades = DATA.map.featureCoordinates.upgrades.map(([q,r], index) => ({ id: `up-${index+1}`, q, r, type: selected[index], revealed: false }));
    const energy = DATA.map.featureCoordinates.energy.map(([q,r], index) => ({ id: `energy-${index+1}`, q, r }));
    const objectives = DATA.map.featureCoordinates.objectives.map(([q,r], index) => ({ id: `obj-${index+1}`, q, r, owner: null }));
    const state = {
      phase: 1, round: 1, status: "playing", board: boardData(), units, garrisons, upgrades, energy, objectives,
      vp: { fed: 0, zeon: 0 }, rescuedGarrisons: { fed: 0, zeon: 0 }, usedTactics: new Set(), hands: { fed: [], zeon: [] }, tacticDecks: { fed: [], zeon: [] }, retiredTactics: { fed: [], zeon: [] }, tacticCycles: { fed: 1, zeon: 1 },
      currentTick: 1, resolvedThisTick: new Set(), log: [], activeUnitId: null,
      timelineSeqCounter: units.length, lastActivatedTeam: null,
      activation: { advanced: false, actionUsed: false, commandUsed: false, tacticUsed: { fed: false, zeon: false }, timelineSpent: 0 }, winner: null
    };
    dealTacticHands(state, rng);
    return state;
  }

  function dealTacticHands(state, rng = Math.random) {
    for (const team of ["fed", "zeon"]) dealTacticHand(state, team, rng);
    return state.hands;
  }

  function dealTacticHand(state, team, rng = Math.random) {
    if (!state.tacticDecks[team].length && !state.hands[team].length && !state.retiredTactics[team].length) {
      state.tacticDecks[team] = shuffle(DATA.tactics.filter(card => card.team === team).map(card => card.id), rng);
    }
    const drawn = state.tacticDecks[team].splice(0, 3);
    state.hands[team].push(...drawn);
    const teamCards=new Set(DATA.tactics.filter(card=>card.team===team).map(card=>card.id));
    state.usedTactics=new Set([...state.usedTactics].filter(id=>!teamCards.has(id)));
    return state.hands[team];
  }

  function retireTacticCard(state, team, id) {
    const index=state.hands[team].indexOf(id);
    if(index<0) return false;
    state.hands[team].splice(index,1);
    if(!state.retiredTactics[team].includes(id)) state.retiredTactics[team].push(id);
    state.usedTactics.add(id);
    return true;
  }

  function advanceUnitTimeline(state, unit, amount) {
    const cost=Math.max(0,Number(amount)||0);
    if(!unit||cost===0)return unit?.nextAt;
    unit.nextAt += cost;
    state.timelineSeqCounter=(state.timelineSeqCounter||0)+1;
    unit.timelineSeq=state.timelineSeqCounter;
    return unit.nextAt;
  }

  function chooseNextUnit(state) {
    const candidates = state.units.filter(unit => unit.nextAt === state.currentTick && !state.resolvedThisTick.has(unit.id));
    if (!candidates.length) return null;
    const preferredTeam=state.lastActivatedTeam==="fed"?"zeon":state.lastActivatedTeam==="zeon"?"fed":null;
    const dataIndex=unit=>DATA.units.findIndex(x=>x.id===unit.id);
    return candidates.sort((a,b)=>{
      if(a.team!==b.team&&preferredTeam){
        if(a.team===preferredTeam)return -1;
        if(b.team===preferredTeam)return 1;
      }
      const seqA=Number.isFinite(a.timelineSeq)?a.timelineSeq:dataIndex(a)+1;
      const seqB=Number.isFinite(b.timelineSeq)?b.timelineSeq:dataIndex(b)+1;
      if(seqA!==seqB)return seqA-seqB;
      return dataIndex(a)-dataIndex(b);
    })[0];
  }

  function livingEnemies(state, unit) {
    return state.units.filter(other => other.zone === "board" && other.team !== unit.team);
  }

  function legalWeaponTargets(state, unit, weapon) {
    const enemyUnits = livingEnemies(state, unit);
    const enemyGarrisons = (state.garrisons || []).filter(garrison => garrison.team !== unit.team);
    const engaged = engagedTargets(state, unit);
    // Engagement applies to both enemy Units and enemy Garrisons. Keep the rule in
    // one engine-level source of truth so UI, AI, Responses, and future systems all
    // receive the same legal target set.
    const targetPool = engaged.length ? engaged : [...enemyUnits, ...enemyGarrisons];
    return targetPool.filter(target => {
      if (distance(unit, target) > weapon.range) return false;
      return weapon.ignoreLos || hasLineOfSight(state, unit, target);
    });
  }

  function classifyAttackDie(die, accuracy, critFloor) {
    if (die === 1) return "miss";
    if (die >= 9 || (die >= critFloor && die <= 8)) return "critical";
    const modified = die + accuracy;
    return modified >= 4 ? "hit" : "miss";
  }

  function summarizeAttackResult(state, attacker, defender, weapon, result) {
    result.hits = result.results.filter(value => value === "hit").length;
    result.criticals = result.results.filter(value => value === "critical").length;
    result.damage = result.hits + result.criticals;
    const criticalEffectsActive=result.criticals>0&&!result.criticalEffectsDisabled;
    if (weapon.critical === "damage2" && criticalEffectsActive) result.damage += 2;
    result.criticalBonusDamage = 0;
    if (weapon.critical === "rescuedGarrisonDamage" && criticalEffectsActive) {
      result.criticalBonusDamage = Math.max(0, Number(state?.rescuedGarrisons?.[attacker?.team]) || 0);
      result.damage += result.criticalBonusDamage;
    }
    if (weapon.effect === "objectiveBonus" && state.objectives.some(o => distance(defender, o) <= 1)) result.damage += 1;
    return result;
  }

  function rollAttack(state, attacker, defender, weapon, rng = Math.random) {
    const defenderIsDamaged=Number.isFinite(defender?.hp)&&Number.isFinite(defender?.maxHp)&&defender.hp<defender.maxHp;
    const strengthBonus = attacker.upgrades.strength + attacker.tempStrength +
      (attacker.id === "zaku-enforcer" && defenderIsDamaged ? 1 : 0);
    const count = Math.max(1, weapon.strength + strengthBonus);
    const elevationMod = Math.sign(elevationAt(state, attacker.q, attacker.r) - elevationAt(state, defender.q, defender.r));
    const targeted = attacker.id === "guntank" && Object.values(attacker.upgrades).reduce((a,b)=>a+b,0) >= 2 ? 1 : 0;
    const accuracy = elevationMod + targeted;
    const dice = Array.from({ length: count }, () => Math.floor(rng() * 10) + 1);
    const critFloor = attacker.critBoost || (attacker.id === "guncannon" && Object.values(attacker.upgrades).reduce((a,b)=>a+b,0) >= 2) ? 7 : 9;
    const results = dice.map(die=>classifyAttackDie(die,accuracy,critFloor));
    const disarmedPending=!!attacker.statuses.disarm;
    return summarizeAttackResult(state,attacker,defender,weapon,{
      dice, results, accuracy, critFloor,
      rerollEligible:attacker.id==="gundam",
      disarmed:false, disarmedPending, disarmRerolled:[], criticalEffectsDisabled:false
    });
  }

  function resolveDisarmAttack(state, attacker, defender, weapon, result, rng = Math.random) {
    if(!result?.disarmedPending||!attacker?.statuses?.disarm)return result;
    const rerolled=[];
    result.results.forEach((classification,index)=>{
      if(classification!=="hit")return;
      rerolled.push({index,from:result.dice[index]});
      result.dice[index]=Math.floor(rng()*10)+1;
      result.results[index]=classifyAttackDie(result.dice[index],result.accuracy,result.critFloor);
    });
    attacker.statuses.disarm=false;
    result.disarmedPending=false;
    result.disarmed=true;
    result.disarmRerolled=rerolled.map(entry=>entry.index);
    result.disarmRerollDetails=rerolled;
    result.criticalEffectsDisabled=true;
    return summarizeAttackResult(state,attacker,defender,weapon,result);
  }

  function rerollAttackDie(state, attacker, defender, weapon, result, index, rng = Math.random) {
    if (!result.rerollEligible || !Number.isInteger(index) || index<0 || index>=result.dice.length || result.results[index]!=="miss") return false;
    result.rerollEligible=false;
    result.rerolledIndex=index;
    result.rerollFrom=result.dice[index];
    result.dice[index]=Math.floor(rng()*10)+1;
    result.results[index]=classifyAttackDie(result.dice[index],result.accuracy,result.critFloor);
    summarizeAttackResult(state,attacker,defender,weapon,result);
    return true;
  }

  function reactivateShields(unit) {
    if (!unit) return 0;
    const totalShields = Math.max(0, unit.upgrades?.shield || 0);
    const reactivated = Math.min(totalShields, Math.max(0, unit.inactiveShields || 0));
    unit.inactiveShields = 0;
    return reactivated;
  }

  function applyDamage(target, amount, options = {}) {
    // Damage is direct by default. Attack resolution must opt in so status effects such
    // as Fracture cannot be triggered by Tactics, abilities, Push collisions, or hazards.
    // `true` remains available as a concise compatibility shorthand for attack callers.
    const isAttack = options === true || options?.attack === true || options?.sourceType === "attack";
    const incoming = Math.max(0, amount);
    const totalShields = Math.max(0, target.upgrades?.shield || 0);
    const inactiveShields = Math.min(totalShields, Math.max(0, target.inactiveShields || 0));
    const activeShields = Math.max(0, totalShields - inactiveShields);
    const blocked = Math.min(activeShields, incoming);
    if (blocked) target.inactiveShields = inactiveShields + blocked;
    const taken = incoming - blocked;
    target.hp = Math.max(0, target.hp - taken);
    if (target.statuses?.fracture && isAttack && taken >= 3) {
      target.hp = Math.max(0, target.hp - 3);
      target.statuses.fracture = false;
      return { incoming, blocked, taken: taken + 3, fractured: true };
    }
    return { incoming, blocked, taken, fractured: false };
  }

  function pickupAt(state, unit) {
    const events = [];
    const energyIndex = state.energy.findIndex(item => item.q === unit.q && item.r === unit.r);
    if (energyIndex >= 0) {
      state.energy.splice(energyIndex, 1);
      unit.energy += 1;
      events.push({ type: "energy", amount: 1 });
      state.log.unshift(`${unit.name} เก็บ Energy +1`);
    }
    const upgradeIndex = state.upgrades.findIndex(item => item.q === unit.q && item.r === unit.r);
    if (upgradeIndex >= 0) {
      const item = state.upgrades.splice(upgradeIndex, 1)[0];
      unit.upgrades[item.type] += 1;
      events.push({ type: "upgrade", upgrade: item.type, amount: 1 });
      state.log.unshift(`${unit.name} เปิด Mystery Upgrade: ${item.type.toUpperCase()}`);
    }
    return events;
  }


  function recordGarrisonRescue(state, unit) {
    if (!state || !unit?.team) return 0;
    if (!state.rescuedGarrisons) state.rescuedGarrisons = { fed: 0, zeon: 0 };
    state.rescuedGarrisons[unit.team] = (state.rescuedGarrisons[unit.team] || 0) + 1;
    unit.rescuedGarrisons = (unit.rescuedGarrisons || 0) + 1;
    return state.rescuedGarrisons[unit.team];
  }

  function contestObjectives(state, unit) {
    if (!unit || unit.zone !== "board") return [];
    return state.objectives.filter(objective=>distance(unit,objective)<=1).map(objective=>{
      const nearby=state.units.filter(candidate=>candidate.zone==="board"&&distance(candidate,objective)<=1);
      const friendly=nearby.filter(candidate=>candidate.team===unit.team).length;
      const enemy=nearby.filter(candidate=>candidate.team!==unit.team).length;
      if (friendly<=enemy) return {objective,success:false,action:"blocked",friendly,enemy};
      if (objective.owner===unit.team) return {objective,success:true,action:"held",friendly,enemy};
      if (objective.owner && objective.owner!==unit.team) {
        objective.owner=null;
        return {objective,success:true,action:"neutralized",friendly,enemy};
      }
      objective.owner=unit.team;
      return {objective,success:true,action:"captured",friendly,enemy};
    });
  }

  function defeatUnit(state, unit, byTeam) {
    if (unit.hp > 0) return false;
    state.vp[byTeam] += unit.vp;
    state.log.unshift(`${unit.name} ถูกทำลาย — ${DATA.teams[byTeam].short} +${unit.vp} VP`);
    unit.zone = "reserve";
    unit.q = null; unit.r = null;
    unit.hp = unit.maxHp;
    unit.statuses = { slow: false, fracture: false, disarm: false };
    advanceUnitTimeline(state,unit,2);
    return true;
  }

  function beginDeploy(state, unit) {
    const base = DATA.map.featureCoordinates.bases.find(item => item.team === unit.team);
    unit.zone = "deploying";
    unit.q = base.q;
    unit.r = base.r;
    unit.hasDeployed = true;
    return true;
  }

  function redeploy(state, unit) { return beginDeploy(state, unit); }

  function scoreObjectives(state) {
    const points=DATA.rules.objective?.phaseVp ?? 5;
    for (const objective of state.objectives) if (objective.owner) state.vp[objective.owner] += points;
  }

  const api = { key, fromKey, timelineSlot, inBounds, neighbors, distance, line, lineVariants, elevationAt, unitAt, garrisonAt, baseAt, lineOfSightDetails, hasLineOfSight, engagedEnemies, engagedGarrisons, engagedTargets, reachable, pushDirectionOptions, forcedPushStep, shuffle, setupGame, dealTacticHand, dealTacticHands, retireTacticCard, advanceUnitTimeline, chooseNextUnit, livingEnemies, legalWeaponTargets, rollAttack, resolveDisarmAttack, rerollAttackDie, reactivateShields, applyDamage, pickupAt, recordGarrisonRescue, contestObjectives, defeatUnit, beginDeploy, redeploy, scoreObjectives };
  root.GA_ENGINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

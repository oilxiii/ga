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

  function line(a, b) {
    const n = distance(a, b);
    const ac = oddqToCube(a.q, a.r), bc = oddqToCube(b.q, b.r);
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

  function elevationAt(state, q, r) {
    return state.board[key(q, r)]?.elevation ?? 0;
  }

  function unitAt(state, q, r) {
    return state.units.find(unit => unit.zone === "board" && unit.q === q && unit.r === r) || null;
  }

  function hasLineOfSight(state, attacker, target) {
    const path = line(attacker, target);
    const aElev = elevationAt(state, attacker.q, attacker.r);
    const tElev = elevationAt(state, target.q, target.r);
    const ceiling = Math.max(aElev, tElev);
    for (const hex of path.slice(1, -1)) {
      if (elevationAt(state, hex.q, hex.r) > ceiling) return false;
      const blocker = unitAt(state, hex.q, hex.r);
      if (blocker && elevationAt(state, hex.q, hex.r) >= Math.min(aElev, tElev)) return false;
    }
    return true;
  }

  function reachable(state, unit, allowance, options = {}) {
    const start = key(unit.q, unit.r);
    const startElevation = elevationAt(state, unit.q, unit.r);
    const jumping = !options.ignoreElevation && startElevation > 0;
    const queue = [[unit.q, unit.r, 0]];
    const costs = new Map([[start, 0]]);
    while (queue.length) {
      const [q, r, cost] = queue.shift();
      if (cost >= allowance) continue;
      for (const [nq, nr] of neighbors(q, r)) {
        const nk = key(nq, nr);
        if (options.forbidden?.has(nk)) continue;
        const occupied = unitAt(state, nq, nr);
        if (occupied && occupied.id !== unit.id) continue;
        const currentElevation = elevationAt(state, q, r);
        const nextElevation = elevationAt(state, nq, nr);
        const elevationBaseline = jumping ? Math.max(startElevation, currentElevation) : currentElevation;
        const climbCost = options.ignoreElevation ? 0 : Math.max(0, nextElevation - elevationBaseline);
        const next = cost + 1 + climbCost;
        if (next <= allowance && (!costs.has(nk) || next < costs.get(nk))) {
          costs.set(nk, next);
          queue.push([nq, nr, next]);
        }
      }
    }
    costs.delete(start);
    return costs;
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
    const units = DATA.units.map(unit => ({
      ...unit,
      maxHp: unit.hp,
      zone: "reserve",
      q: null,
      r: null,
      energy: 0,
      upgrades: { shield: 0, speed: 0, strength: 0 },
      statuses: { slow: false, fracture: false, disarm: false },
      nextAt: unit.tl,
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
      vp: { fed: 0, zeon: 0 }, usedTactics: new Set(), hands: { fed: [], zeon: [] }, tacticDecks: { fed: [], zeon: [] }, retiredTactics: { fed: [], zeon: [] }, tacticCycles: { fed: 1, zeon: 1 },
      currentTick: 1, resolvedThisTick: new Set(), log: [], activeUnitId: null,
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
    state.retiredTactics[team].push(...state.hands[team]);
    state.hands[team] = state.tacticDecks[team].splice(0, 3);
    const teamCards=new Set(DATA.tactics.filter(card=>card.team===team).map(card=>card.id));
    state.usedTactics=new Set([...state.usedTactics].filter(id=>!teamCards.has(id)));
    return state.hands[team];
  }

  function teamPassedTimeline(state, team, limit = 10) {
    const units=state.units.filter(unit=>unit.team===team);
    return units.length===3&&units.every(unit=>unit.nextAt>limit);
  }

  function chooseNextUnit(state) {
    const candidates = state.units.filter(unit => unit.nextAt === state.currentTick && !state.resolvedThisTick.has(unit.id));
    if (!candidates.length) return null;
    return candidates.sort((a,b) => DATA.units.findIndex(x=>x.id===a.id)-DATA.units.findIndex(x=>x.id===b.id))[0];
  }

  function livingEnemies(state, unit) {
    return state.units.filter(other => other.zone === "board" && other.team !== unit.team);
  }

  function legalWeaponTargets(state, unit, weapon) {
    return livingEnemies(state, unit).filter(target => {
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

  function summarizeAttackResult(state, defender, weapon, result) {
    result.hits = result.results.filter(value => value === "hit").length;
    result.criticals = result.results.filter(value => value === "critical").length;
    result.damage = result.hits + result.criticals;
    if (weapon.critical === "damage2" && result.criticals) result.damage += 2;
    if (weapon.critical === "damage1" && result.criticals) result.damage += 1;
    if (weapon.effect === "objectiveBonus" && state.objectives.some(o => distance(defender, o) <= 1)) result.damage += 1;
    return result;
  }

  function rollAttack(state, attacker, defender, weapon, rng = Math.random) {
    const strengthBonus = attacker.upgrades.strength + attacker.tempStrength +
      (attacker.id === "zaku-enforcer" && Object.values(defender.statuses).some(Boolean) ? 1 : 0);
    const count = Math.max(1, weapon.strength + strengthBonus);
    const elevationMod = Math.sign(elevationAt(state, attacker.q, attacker.r) - elevationAt(state, defender.q, defender.r));
    const targeted = attacker.id === "guntank" && Object.values(attacker.upgrades).reduce((a,b)=>a+b,0) >= 2 ? 1 : 0;
    const accuracy = elevationMod + targeted;
    let dice = Array.from({ length: count }, () => Math.floor(rng() * 10) + 1);
    const critFloor = attacker.critBoost || (attacker.id === "guncannon" && Object.values(attacker.upgrades).reduce((a,b)=>a+b,0) >= 2) ? 7 : 9;
    let results = dice.map(die=>classifyAttackDie(die,accuracy,critFloor));
    const wasDisarmed=attacker.statuses.disarm;
    if (wasDisarmed) {
      results = results.map(() => "miss");
      attacker.statuses.disarm = false;
    }
    return summarizeAttackResult(state,defender,weapon,{ dice, results, accuracy, critFloor, rerollEligible:attacker.id==="gundam"&&!wasDisarmed });
  }

  function rerollAttackDie(state, attacker, defender, weapon, result, index, rng = Math.random) {
    if (!result.rerollEligible || !Number.isInteger(index) || index<0 || index>=result.dice.length) return false;
    result.rerollEligible=false;
    result.rerolledIndex=index;
    result.rerollFrom=result.dice[index];
    result.dice[index]=Math.floor(rng()*10)+1;
    result.results[index]=classifyAttackDie(result.dice[index],result.accuracy,result.critFloor);
    summarizeAttackResult(state,defender,weapon,result);
    return true;
  }

  function applyDamage(target, amount) {
    const incoming = Math.max(0, amount);
    const blocked = Math.min(target.upgrades?.shield || 0, incoming);
    if (target.upgrades) target.upgrades.shield -= blocked;
    const taken = incoming - blocked;
    target.hp = Math.max(0, target.hp - taken);
    if (target.statuses?.fracture && taken >= 3) {
      target.hp = Math.max(0, target.hp - 3);
      target.statuses.fracture = false;
      return { incoming, blocked, taken: taken + 3, fractured: true };
    }
    return { incoming, blocked, taken, fractured: false };
  }

  function pickupAt(state, unit) {
    const energyIndex = state.energy.findIndex(item => item.q === unit.q && item.r === unit.r);
    if (energyIndex >= 0) {
      state.energy.splice(energyIndex, 1);
      unit.energy += 1;
      state.log.unshift(`${unit.name} เก็บ Energy +1`);
    }
    const upgradeIndex = state.upgrades.findIndex(item => item.q === unit.q && item.r === unit.r);
    if (upgradeIndex >= 0) {
      const item = state.upgrades.splice(upgradeIndex, 1)[0];
      unit.upgrades[item.type] += 1;
      state.log.unshift(`${unit.name} เปิด Mystery Upgrade: ${item.type.toUpperCase()}`);
    }
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
    unit.nextAt += 2;
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
    for (const objective of state.objectives) if (objective.owner) state.vp[objective.owner] += 1;
  }

  const api = { key, fromKey, timelineSlot, inBounds, neighbors, distance, line, elevationAt, unitAt, hasLineOfSight, reachable, shuffle, setupGame, dealTacticHand, dealTacticHands, teamPassedTimeline, chooseNextUnit, livingEnemies, legalWeaponTargets, rollAttack, rerollAttackDie, applyDamage, pickupAt, contestObjectives, defeatUnit, beginDeploy, redeploy, scoreObjectives };
  root.GA_ENGINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

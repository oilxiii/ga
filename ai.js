(function (root) {
  "use strict";

  const keyOf = (engine, item) => engine.key(item.q, item.r);
  const sumUpgrades = unit => Object.values(unit.upgrades || {}).reduce((sum, value) => sum + value, 0);

  function attackDice(unit, target, weapon) {
    return Math.max(1,
      weapon.strength +
      (unit.upgrades?.strength || 0) +
      (unit.tempStrength || 0) +
      (unit.id === "zaku-enforcer" && Number.isFinite(target?.hp) && Number.isFinite(target?.maxHp) && target.hp < target.maxHp ? 1 : 0)
    );
  }

  function expectedAttackDamage(state, unit, target, weapon, engine) {
    const elevation = Math.sign(engine.elevationAt(state, unit.q, unit.r) - engine.elevationAt(state, target.q, target.r));
    const targeted = unit.id === "guntank" && sumUpgrades(unit) >= 2 ? 1 : 0;
    const accuracy = elevation + targeted;
    const critFloor = (unit.critBoost || (unit.id === "guncannon" && sumUpgrades(unit) >= 2)) ? 7 : 9;
    let successFaces = 0;
    let criticalFaces = 0;
    for (let die = 1; die <= 10; die += 1) {
      if (die >= 9 || (die >= critFloor && die <= 8)) {
        successFaces += 1;
        criticalFaces += 1;
      } else if (die !== 1 && die + accuracy >= 4) successFaces += 1;
    }
    const dice = attackDice(unit, target, weapon);
    let expected = dice * successFaces / 10;
    const criticalChance = 1 - Math.pow(1 - criticalFaces / 10, dice);
    if (weapon.critical === "damage2") expected += criticalChance * 2;
    if (weapon.critical === "rescuedGarrisonDamage") expected += criticalChance * (state.rescuedGarrisons?.[unit.team] || 0);
    if (weapon.effect === "objectiveBonus" && state.objectives.some(objective => engine.distance(target, objective) <= 1)) expected += 1;
    return expected;
  }

  function attackScore(state, unit, target, weapon, engine, isGarrison = false) {
    const expected = expectedAttackDamage(state, unit, target, weapon, engine);
    const hp = Math.max(1, target.hp || 1);
    const totalShields = Math.max(0, target.upgrades?.shield || 0);
    const inactiveShields = Math.min(totalShields, Math.max(0, target.inactiveShields || 0));
    const activeShields = totalShields - inactiveShields;
    const killChance = Math.min(1, expected / (hp + activeShields));
    const vp = isGarrison ? 2 : (target.vp || 0);
    let score = expected * 8 + killChance * vp * 22 - weapon.timeline * 2.5;
    if (isGarrison) score += 24;
    if (target.statuses?.fracture && expected >= 3) score += 18;
    if (weapon.effect === "destroyUpgrade" && sumUpgrades(target)) score += 10 + sumUpgrades(target) * 2;
    if (weapon.effect === "shieldBreak" && target.upgrades?.shield) score += 8;
    if (["slow", "fracture", "push2"].includes(weapon.critical)) score += 5;
    return score;
  }

  function attacksFrom(state, unit, data, engine) {
    const choices = [];
    for (const weapon of unit.weapons) {
      for (const target of engine.legalWeaponTargets(state, unit, weapon)) {
        const isGarrison = (state.garrisons || []).some(garrison => garrison === target || garrison.id === target.id);
        choices.push({ weapon, target, isGarrison, score: attackScore(state, unit, target, weapon, engine, isGarrison) });
      }
    }
    return choices.sort((a, b) => b.score - a.score);
  }

  function chooseAttack(state, unit, data, engine) {
    return attacksFrom(state, unit, data, engine)[0] || null;
  }

  function positionScore(state, unit, q, r, data, engine) {
    const probe = { ...unit, q, r, zone: "board" };
    // Evaluate the hypothetical board, not a board that still contains this Unit at
    // its old hex. Otherwise the old position can falsely block an enemy sight-line.
    const simulatedState = {
      ...state,
      units: state.units.map(candidate => candidate.id === unit.id ? probe : candidate)
    };
    let score = 0;
    for (const objective of state.objectives) {
      const distance = engine.distance(probe, objective);
      if (distance <= 1) score += objective.owner === unit.team ? 25 : 72;
      score -= Math.min(distance, 8) * (objective.owner === unit.team ? 0.4 : 1.8);
    }
    for (const garrison of state.garrisons) {
      const distance = engine.distance(probe, garrison);
      if (garrison.team === unit.team && distance <= 1) score += 44;
      if (garrison.team !== unit.team && distance <= 2) score += 12;
    }
    if (state.energy.some(item => item.q === q && item.r === r)) score += 22;
    // Mystery tokens are deliberately scored identically: the AI never reads their hidden type.
    if (state.upgrades.some(item => item.q === q && item.r === r)) score += 24;
    const attack = chooseAttack(simulatedState, probe, data, engine);
    if (attack) score += Math.min(85, attack.score * 0.72);
    const threats = simulatedState.units.filter(enemy => enemy.team !== unit.team && enemy.zone === "board").filter(enemy =>
      enemy.weapons.some(weapon => engine.distance(enemy, probe) <= weapon.range && (weapon.ignoreLos || engine.hasLineOfSight(simulatedState, enemy, probe)))
    );
    score -= threats.length * (unit.hp <= unit.maxHp * 0.4 ? 9 : 3);
    return score;
  }

  function chooseMove(state, unit, candidateKeys, data, engine, allowStay = false) {
    const candidates = [...candidateKeys].map(value => {
      const [q, r] = engine.fromKey(value);
      return { q, r, score: positionScore(state, unit, q, r, data, engine) };
    });
    if (allowStay) candidates.push({ q: unit.q, r: unit.r, score: positionScore(state, unit, unit.q, unit.r, data, engine) + 1 });
    return candidates.sort((a, b) => b.score - a.score || a.q - b.q || a.r - b.r)[0] || null;
  }

  function canReachEnemy(state, unit, distance, data, engine, includeGarrisons = true) {
    const reachable = engine.reachable(state, unit, distance);
    reachable.set(engine.key(unit.q, unit.r), 0);
    const enemies = state.units.filter(target => target.team !== unit.team && target.zone === "board");
    if (includeGarrisons) enemies.push(...state.garrisons.filter(target => target.team !== unit.team));
    return [...reachable.keys()].some(value => {
      const [q, r] = engine.fromKey(value);
      return enemies.some(target => engine.distance({ q, r }, target) === 1);
    });
  }

  function commandTacticScore(state, unit, card, data, engine) {
    if (!card || card.team !== unit.team || card.timing !== "COMMAND") return -Infinity;
    const attacks = attacksFrom(state, unit, data, engine);
    const damaged = unit.maxHp - unit.hp;
    const adjacentObjective = state.objectives.find(objective => engine.distance(unit, objective) <= 1 && objective.owner !== unit.team);
    const visibleEnemyUnits = state.units.filter(enemy => enemy.team !== unit.team && enemy.zone === "board" && engine.distance(unit, enemy) <= 3 && engine.hasLineOfSight(state, unit, enemy));
    const visibleEnemyGarrisons = state.garrisons.filter(enemy => enemy.team !== unit.team && engine.distance(unit, enemy) <= 3 && engine.hasLineOfSight(state, unit, enemy));
    const suddenPressureTargets = visibleEnemyUnits.length + visibleEnemyGarrisons.length;
    const ownGarrisons = state.garrisons.filter(garrison => garrison.team === unit.team && engine.distance(unit, garrison) <= 3 && engine.hasLineOfSight(state, unit, garrison));
    const scores = {
      "built-to-last": damaged > 0 ? Math.min(damaged, sumUpgrades(unit)) * 18 : -Infinity,
      "entrenched-position": unit.id === "guntank" ? (adjacentObjective ? 105 : 24) : -Infinity,
      "forward-artillery": unit.id === "guncannon" ? 25 + (state.rescuedGarrisons?.fed || 0) * 14 : -Infinity,
      "last-shot-counts": unit.id === "gundam" && attacks.length ? 72 : -Infinity,
      "rookies-momentum": attacks.length ? 58 : -Infinity,
      "lock-down": visibleEnemyUnits.length ? 42 + Math.max(...visibleEnemyUnits.map(sumUpgrades)) * 4 : -Infinity,
      "rescued-extraction": unit.id === "zaku-line" && ownGarrisons.length ? 96 : -Infinity,
      "drive-them-back": canReachEnemy(state, unit, 2, data, engine, false) ? 46 : -Infinity,
      "sudden-pressure": suddenPressureTargets ? suddenPressureTargets * 30 : -Infinity,
      "breaking-line": visibleEnemyUnits.length ? 44 + Math.max(...visibleEnemyUnits.map(sumUpgrades)) * 4 : -Infinity,
      "crimson-execution": unit.id === "chars-zaku" && canReachEnemy(state, unit, data.rules.dash.distance + 1, data, engine) ? 76 : -Infinity
    };
    return scores[card.id] ?? -Infinity;
  }

  function chooseCommandTactic(state, unit, data, engine) {
    return (state.hands?.[unit.team] || [])
      .map(id => data.tactics.find(card => card.id === id))
      .filter(Boolean)
      .map(card => ({ card, score: commandTacticScore(state, unit, card, data, engine) }))
      .filter(choice => choice.score >= 32)
      .sort((a, b) => b.score - a.score)[0]?.card || null;
  }

  function chooseModeTarget(state, unit, mode, data, engine) {
    const targets = [...(mode.targets || [])].map(value => {
      const [q, r] = engine.fromKey(value);
      const targetUnit = state.units.find(candidate => candidate.zone !== "reserve" && candidate.q === q && candidate.r === r);
      const garrison = state.garrisons.find(candidate => candidate.q === q && candidate.r === r);
      const objective = state.objectives.find(candidate => candidate.q === q && candidate.r === r);
      let score = positionScore(state, unit, q, r, data, engine);
      if (targetUnit) {
        if (targetUnit.team === unit.team) score = (targetUnit.maxHp - targetUnit.hp) * 18 + (targetUnit.vp || 0);
        else score = (targetUnit.vp || 0) * 18 + (targetUnit.maxHp - targetUnit.hp) * 5 + sumUpgrades(targetUnit) * 4;
      }
      if (garrison) score = garrison.team === unit.team ? 80 : 70;
      if (objective) score = objective.owner === unit.team ? 12 : objective.owner ? 125 : 105;
      return { q, r, score };
    });
    return targets.sort((a, b) => b.score - a.score)[0] || null;
  }


  function choosePushDirection(state, source, target, options, steps, engine) {
    const scored=(options||[]).map(option=>{
      const cloneTarget={...target};
      let score=0;
      for(let i=0;i<Math.max(1,steps||1);i+=1){
        const step=engine.forcedPushStep(state,cloneTarget,option.direction);
        if(step.type==="move"){cloneTarget.q=step.q;cloneTarget.r=step.r;score+=4;continue;}
        score+=22;
        if(step.unit)score+=step.unit.team===source.team?-70:90+(step.unit.vp||0)*8;
        else if(step.garrison)score+=step.garrison.team===source.team?-60:80;
        else if(step.base||step.reason==="terrain")score+=28;
        break;
      }
      return {...option,score};
    });
    return scored.sort((a,b)=>b.score-a.score||a.q-b.q||a.r-b.r)[0]||null;
  }

  function chooseUpgrade(target, defensive = false) {
    if (defensive) {
      if (target.hp <= target.maxHp * 0.5) return "shield";
      if ((target.upgrades?.speed || 0) === 0) return "speed";
      return "strength";
    }
    return ["strength", "shield", "speed"].sort((a, b) => (target.upgrades?.[b] || 0) - (target.upgrades?.[a] || 0))[0];
  }

  function shouldUseResponse(card, context = {}) {
    if (!card) return false;
    if (card.id === "federation-shield") {
      const damage = Math.max(0, context.damage || 0);
      const activeShields = Math.max(0, context.activeShields || 0);
      const effectiveDamage = Math.max(0, context.effectiveDamage ?? (damage - activeShields));
      const hp = Number.isFinite(context.hp) ? Math.max(0, context.hp) : Infinity;
      if (effectiveDamage === 0) return false;
      return effectiveDamage >= 2 || effectiveDamage >= hp;
    }
    if (card.id === "return-fire") return context.canAttack !== false;
    if (card.id === "shattered-formation") return context.attackerAlive !== false;
    if (["iron-grip", "shield-recovery", "logistics-relay", "exploited-chaos"].includes(card.id)) return true;
    return false;
  }

  const api = { attacksFrom, chooseAttack, positionScore, chooseMove, commandTacticScore, chooseCommandTactic, chooseModeTarget, choosePushDirection, chooseUpgrade, shouldUseResponse };
  root.GA_AI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

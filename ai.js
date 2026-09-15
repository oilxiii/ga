(function (root) {
  "use strict";

  const keyOf = (engine, item) => engine.key(item.q, item.r);
  const sumUpgrades = unit => Object.values(unit.upgrades || {}).reduce((sum, value) => sum + value, 0);

  function attackDice(unit, target, weapon) {
    const damageTaken=Math.max(0,(unit.maxHp||unit.hp)-unit.hp);
    const fightToEnd=unit.id==="barbatos-lupus-rex"?(damageTaken>=12?2:damageTaken>=6?1:0):0;
    const exploitWeakness=unit.id==="gundam-epyon"&&(unit.aoeExploitWeakness||(target?.statuses&&Object.values(target.statuses).some(Boolean)))?2:0;
    const heroSaber=weapon.id==="hero-beam-saber"?(unit.heroBeamSaberBonus||0):0;
    return Math.max(1,
      weapon.strength +
      (unit.upgrades?.strength || 0) +
      (unit.tempStrength || 0) +
      fightToEnd +
      exploitWeakness+heroSaber+
      (unit.id === "zaku-enforcer" && Number.isFinite(target?.hp) && Number.isFinite(target?.maxHp) && target.hp < target.maxHp ? 1 : 0)
    );
  }

  function attackOutcomeStats(state, unit, target, weapon, engine) {
    const elevation = Math.sign(engine.elevationAt(state, unit.q, unit.r) - engine.elevationAt(state, target.q, target.r));
    const targeted = unit.id === "guntank" && sumUpgrades(unit) >= 2 ? 1 : 0;
    const accuracy = elevation + targeted+(unit.tempAccuracy||0);
    const critFloor = Number.isFinite(unit.critFloorOverride)?unit.critFloorOverride:(unit.critBoost || unit.id === "wing-zero-ew" || (unit.id === "guncannon" && sumUpgrades(unit) >= 2)) ? 7 : 9;
    let hitFaces = 0;
    let criticalFaces = 0;
    for (let die = 1; die <= 10; die += 1) {
      if (die >= 9 || (die >= critFloor && die <= 8)) criticalFaces += 1;
      else if (die !== 1 && die + accuracy >= 4) hitFaces += 1;
    }
    const missFaces = Math.max(0, 10 - hitFaces - criticalFaces);
    const probabilities = {
      miss: missFaces / 10,
      hit: hitFaces / 10,
      critical: criticalFaces / 10
    };
    const heroAllies=weapon.effect==="heroAlliesStrength"?state.units.filter(ally=>ally.id!==unit.id&&ally.team===unit.team&&ally.zone==="board"&&engine.distance(unit,ally)<=3).length*2:0;
    const dice = attackDice(unit, target, weapon)+heroAllies;
    const rollDistribution = count => {
      let dist = new Map([["0,0", 1]]);
      for (let index = 0; index < count; index += 1) {
        const next = new Map();
        for (const [key, probability] of dist) {
          const [hits, criticals] = key.split(",").map(Number);
          const add = (h, c, p) => {
            if (p <= 0) return;
            const nextKey = `${h},${c}`;
            next.set(nextKey, (next.get(nextKey) || 0) + probability * p);
          };
          add(hits, criticals, probabilities.miss);
          add(hits + 1, criticals, probabilities.hit);
          add(hits, criticals + 1, probabilities.critical);
        }
        dist = next;
      }
      return dist;
    };
    let distribution = rollDistribution(dice);
    // Vulcan Cannons adds exactly two dice if the initial roll contains a Critical.
    // Model that conditional roll instead of valuing the weapon as a plain S3 attack.
    if (weapon.critical === "extraDice2") {
      const extra = rollDistribution(2);
      const combined = new Map();
      const addCombined=(h,c,p)=>{const key=`${h},${c}`;combined.set(key,(combined.get(key)||0)+p);};
      for (const [key, probability] of distribution) {
        const [hits, criticals] = key.split(",").map(Number);
        if (criticals <= 0) { addCombined(hits,criticals,probability); continue; }
        for (const [extraKey, extraProbability] of extra) {
          const [extraHits, extraCriticals]=extraKey.split(",").map(Number);
          addCombined(hits+extraHits,criticals+extraCriticals,probability*extraProbability);
        }
      }
      distribution=combined;
    }

    const hp = Math.max(1, Number(target.hp) || 1);
    const totalShields = Math.max(0, target.upgrades?.shield || 0);
    const inactiveShields = Math.min(totalShields, Math.max(0, target.inactiveShields || 0));
    const activeShields = totalShields - inactiveShields;
    const objectiveBonus = weapon.effect === "objectiveBonus" && state.objectives.some(objective => engine.distance(target, objective) <= 1) ? 1 : 0;
    const adjacentBonus=weapon.effect==="adjacentDamage2"&&engine.distance(unit,target)===1?2:0;
    const rescuedBonus = Math.max(0, state.rescuedGarrisons?.[unit.team] || 0);
    let expectedIncoming = 0;
    let expectedTaken = 0;
    let usefulDamage = 0;
    let killChance = 0;
    let criticalChance = 0;

    for (const [key, probability] of distribution) {
      const [hits, criticals] = key.split(",").map(Number);
      let incoming = hits + criticals + objectiveBonus+adjacentBonus;
      if (criticals > 0) {
        if (weapon.critical === "damage2") incoming += 2;
        if (weapon.critical === "damage1") incoming += 1;
        if (weapon.critical === "criticalDamageUpTo4") incoming += Math.min(4, criticals);
        if (weapon.critical === "rescuedGarrisonDamage") incoming += rescuedBonus;
      }
      let taken = Math.max(0, incoming - activeShields);
      if (target.statuses?.fracture && taken >= 3) taken += 3;
      expectedIncoming += probability * incoming;
      expectedTaken += probability * taken;
      usefulDamage += probability * Math.min(hp, taken);
      if (taken >= hp) killChance += probability;
      if (criticals > 0) criticalChance += probability;
    }

    return { dice, accuracy, critFloor, expectedIncoming, expectedTaken, usefulDamage, killChance, criticalChance, activeShields };
  }

  function expectedAttackDamage(state, unit, target, weapon, engine) {
    return attackOutcomeStats(state, unit, target, weapon, engine).expectedIncoming;
  }

  function attackScore(state, unit, target, weapon, engine, isGarrison = false) {
    const stats = attackOutcomeStats(state, unit, target, weapon, engine);
    const vp = isGarrison ? 2 : (target.vp || 0);
    // Only reward damage that can actually matter.  Six damage into a 1 HP Garrison
    // is not six times as valuable as one damage, which prevents expensive weapons
    // from winning the heuristic purely through overkill.
    let score = stats.usefulDamage * 10 + stats.killChance * vp * 24 - weapon.timeline * 6;
    if (isGarrison) score += 24;
    if (stats.killChance >= 0.5) score += 8;
    if (target.statuses?.fracture && stats.expectedTaken >= 3) score += 18;
    if (weapon.effect === "destroyUpgrade" && sumUpgrades(target)) score += 10 + sumUpgrades(target) * 2;
    if (weapon.effect === "shieldBreak" && target.upgrades?.shield) score += 8;
    if (weapon.effect === "disableAllShields" && target.upgrades?.shield) score += 7 + target.upgrades.shield * 7;
    if (["slow", "fracture", "push2", "push1Slow"].includes(weapon.critical)) score += 5 + stats.criticalChance * 5;
    if (weapon.critical === "disarm") {
      const threat=Math.max(0,...(target.weapons||[]).map(enemyWeapon=>enemyWeapon.strength||0));
      score += stats.criticalChance * (8 + threat * 1.4);
    }
    if (weapon.critical === "repeatAtTimeline0") score += stats.criticalChance * (12 + stats.usefulDamage * 5);
    if (weapon.critical === "fractureRepeatTimeline0") score += stats.criticalChance * (18 + stats.usefulDamage * 5);
    if (weapon.critical === "extraDice2") score += 4; // damage expectation already includes the conditional dice
    return { score, ...stats };
  }

  function applyTimelineEfficiency(choices) {
    const RISKY_FINISH_THRESHOLD = 0.50;
    const groups = new Map();
    for (const choice of choices) {
      // AOE weapons can create value across several targets, so do not force them
      // into the single-target economy rule.
      if (choice.weapon?.aoe) continue;
      const key = choice.target?.id;
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(choice);
    }
    for (const group of groups.values()) {
      const riskyFinishes = group.filter(choice => choice.killChance >= RISKY_FINISH_THRESHOLD);
      if (!riskyFinishes.length) continue;
      const minTimeline = Math.min(...riskyFinishes.map(choice => choice.weapon.timeline));
      const economical = riskyFinishes
        .filter(choice => choice.weapon.timeline === minTimeline)
        .sort((a, b) => b.score - a.score)[0];
      if (!economical) continue;
      economical.score += 10;
      economical.timelineEfficient = true;
      for (const choice of riskyFinishes) {
        if (choice.weapon.timeline <= minTimeline) continue;
        // Once a cheaper attack already has at least a coin-flip chance to finish
        // this exact target, the AI deliberately accepts that risk instead of
        // buying certainty with more Timeline.
        choice.score = Math.min(choice.score, economical.score - 1 - (choice.weapon.timeline - minTimeline) * 0.1);
        choice.timelineEfficiencySuppressed = true;
      }
    }
  }

  function twinBusterPattern(unit, rotation, engine, weapon=null) {
    const source={x:unit.q,z:unit.r-(unit.q-(unit.q&1))/2};source.y=-source.x-source.z;
    const full=[
      {x:0,y:1,z:-1},{x:0,y:2,z:-2},{x:0,y:3,z:-3},
      {x:1,y:0,z:-1},{x:1,y:1,z:-2},{x:1,y:2,z:-3},
      {x:2,y:0,z:-2},{x:2,y:1,z:-3},{x:3,y:0,z:-3}
    ];
    const base=weapon?.aoe==="warEdge"
      ?[full[0],full[1],full[3],full[4],full[6]]
      :weapon?.aoe==="breastFire"
        ?[full[0],full[1],full[2],full[4],full[5],full[7]]
        :full;
    const rotate=offset=>{let value={...offset};for(let i=0;i<rotation;i++)value={x:-value.z,y:-value.x,z:-value.y};return value;};
    return base.map(offset=>{const value=rotate(offset);const x=source.x+value.x,z=source.z+value.z;return {q:x,r:z+(x-(x&1))/2};}).filter(hex=>engine.inBounds(hex.q,hex.r));
  }

  function attacksFrom(state, unit, data, engine) {
    const choices = [];
    for (const weapon of unit.weapons) {
      if(weapon.aoe){
        const engagedIds=new Set((engine.engagedTargets?.(state,unit)||[]).map(target=>target.id));
        for(let rotation=0;rotation<6;rotation+=1){
          const cells=new Set(twinBusterPattern(unit,rotation,engine,weapon).map(hex=>engine.key(hex.q,hex.r)));
          const targets=[...state.units.filter(target=>target.zone==="board"&&target.team!==unit.team),...(state.garrisons||[]).filter(target=>target.team!==unit.team)]
            .filter(target=>cells.has(engine.key(target.q,target.r))&&engine.hasTwinBusterLine(state,unit,target));
          if(!targets.length||(engagedIds.size&&!targets.some(target=>engagedIds.has(target.id))))continue;
          const priorAoeExploit=unit.aoeExploitWeakness;
          unit.aoeExploitWeakness=unit.id==="gundam-epyon"&&weapon.aoe==="warEdge"&&targets.some(target=>target.weapons&&Object.values(target.statuses||{}).some(Boolean));
          const evaluations=targets.map(target=>({target,isGarrison:!target.weapons,...attackScore(state,unit,target,weapon,engine,!target.weapons)}));
          unit.aoeExploitWeakness=priorAoeExploit;
          const target=evaluations.slice().sort((a,b)=>b.score-a.score)[0]?.target;
          // attackScore includes the Timeline cost. For one AoE roll the cost is paid
          // once, not once per target, so add back the duplicated penalties.
          const score=evaluations.reduce((sum,item)=>sum+item.score,0)+Math.max(0,evaluations.length-1)*weapon.timeline*6;
          choices.push({weapon,target,isGarrison:!target?.weapons,rotation,aoeTargets:targets.map(item=>item.id),score,killChance:Math.max(...evaluations.map(item=>item.killChance)),expectedDamage:evaluations.reduce((sum,item)=>sum+item.expectedIncoming,0),usefulDamage:evaluations.reduce((sum,item)=>sum+item.usefulDamage,0)});
        }
        continue;
      }
      for (const target of engine.legalWeaponTargets(state, unit, weapon)) {
        const isGarrison = (state.garrisons || []).some(garrison => garrison === target || garrison.id === target.id);
        const evaluation=attackScore(state, unit, target, weapon, engine, isGarrison);
        choices.push({ weapon, target, isGarrison, score: evaluation.score, killChance:evaluation.killChance, expectedDamage:evaluation.expectedIncoming, usefulDamage:evaluation.usefulDamage });
      }
    }
    applyTimelineEfficiency(choices);
    return choices.sort((a, b) => b.score - a.score);
  }

  function chooseAttack(state, unit, data, engine) {
    return attacksFrom(state, unit, data, engine)[0] || null;
  }

  function tacticAttacksFrom(state,unit,data,engine){
    if(state.activation?.tacticUsed?.[unit.team]||state.activation?.actionUsed)return [];
    const cards=(state.hands?.[unit.team]||[]).map(id=>data.tactics.find(card=>card.id===id)).filter(card=>card?.timing==="ATTACK"&&(!card.unitOnly||card.unitOnly===unit.id));
    const original=unit.weapons;
    const choices=[];
    for(const card of cards){
      unit.weapons=[card.weapon];
      attacksFrom(state,unit,data,engine).forEach(choice=>choices.push({...choice,tactic:card,score:choice.score+6}));
    }
    unit.weapons=original;
    return choices.sort((a,b)=>b.score-a.score);
  }

  function pickupValue(state, unit, q, r) {
    let value = 0;
    const energyHere = state.energy.some(item => item.q === q && item.r === r);
    const upgradeHere = state.upgrades.some(item => item.q === q && item.r === r);
    if (energyHere) {
      const energy = Math.max(0, unit.energy || 0);
      const energyCommands = [unit.command, unit.command2].filter(command => (command?.energy || 0) > 0);
      const canSpendEnergy = energyCommands.length > 0;
      value += !canSpendEnergy ? 20 : energy === 0 ? 42 : energy === 1 ? 34 : energy === 2 ? 27 : 18;
    }
    if (upgradeHere) {
      // Mystery tokens stay hidden from the AI; only scarcity changes their value.
      const upgrades = sumUpgrades(unit);
      value += upgrades === 0 ? 42 : upgrades === 1 ? 36 : upgrades === 2 ? 30 : 22;
    }
    return { value, hasItem: energyHere || upgradeHere };
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
    const pickup=pickupValue(state,unit,q,r);
    score += pickup.value;
    const attack = chooseAttack(simulatedState, probe, data, engine);
    if (attack) {
      score += Math.min(85, attack.score * 0.72);
      // Ending Advance on an item while still retaining a good attack is especially
      // efficient because the pickup costs no extra Timeline or action.
      if(pickup.hasItem)score += 9;
    }
    const threats = simulatedState.units.filter(enemy => enemy.team !== unit.team && enemy.zone === "board").filter(enemy =>
      enemy.weapons.some(weapon => {
        const range=Number.isFinite(weapon.range)?weapon.range:weapon.aoe?3:0;
        return engine.distance(enemy, probe) <= range && (weapon.aoe ? engine.hasTwinBusterLine(simulatedState,enemy,probe) : (weapon.ignoreLos || engine.hasLineOfSight(simulatedState, enemy, probe)));
      })
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
    const ranked=candidates.sort((a, b) => b.score - a.score || a.q - b.q || a.r - b.r);
    const best=ranked[0]||null;
    if(!best)return null;
    const pickupCandidates=ranked.filter(candidate=>
      state.energy.some(item=>item.q===candidate.q&&item.r===candidate.r)||
      state.upgrades.some(item=>item.q===candidate.q&&item.r===candidate.r)
    );
    const pickup=pickupCandidates[0];
    // If collecting an item is nearly as good as the absolute best destination,
    // take the free resource now. A clearly superior attack/objective position can
    // still override this bias, so the AI does not chase loot blindly.
    if(pickup&&pickup.score>=best.score-18)return pickup;
    return best;
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
    if (!card || card.timing !== "COMMAND") return -Infinity;
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
      "forward-artillery": unit.id === "guncannon" ? 25 + (state.rescuedGarrisons?.[unit.team] || 0) * 14 : -Infinity,
      "last-shot-counts": unit.id === "gundam" && attacks.length ? 72 : -Infinity,
      "rookies-momentum": attacks.length ? 58 : -Infinity,
      "lock-down": visibleEnemyUnits.length ? 42 + Math.max(...visibleEnemyUnits.map(sumUpgrades)) * 4 : -Infinity,
      "rescued-extraction": unit.id === "zaku-line" && ownGarrisons.length ? 96 : -Infinity,
      "drive-them-back": canReachEnemy(state, unit, 2, data, engine, false) ? 46 : -Infinity,
      "sudden-pressure": suddenPressureTargets ? suddenPressureTargets * 30 : -Infinity,
      "breaking-line": visibleEnemyUnits.length ? 44 + Math.max(...visibleEnemyUnits.map(sumUpgrades)) * 4 : -Infinity,
      "crimson-execution": ["chars-zaku","red-comet-zaku"].includes(unit.id) && canReachEnemy(state, unit, data.rules.dash.distance + 1, data, engine) ? 76 : -Infinity,
      "berserk": unit.id==="eva-01"&&unit.hp>1&&unit.hp<=5?88:-Infinity,
      "jet-scrander": unit.id==="mazinger-z"&&state.units.some(enemy=>enemy.team!==unit.team&&enemy.zone==="board")?48:-Infinity
      ,"renewed-power": attacks.length ? 54 : 20
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
    if(card.id==="sacrificial-overload"){
      const selfDefeated=(context.attackerHp||0)<=2;
      return (context.sacrificialTargets||0)>0&&(!selfDefeated||(context.sacrificialKillVp||0)>(context.attackerVp||0));
    }
    if (["iron-grip", "shield-recovery", "logistics-relay", "exploited-chaos"].includes(card.id)) return true;
    return false;
  }

  const api = { attacksFrom, tacticAttacksFrom, chooseAttack, positionScore, chooseMove, commandTacticScore, chooseCommandTactic, chooseModeTarget, choosePushDirection, chooseUpgrade, shouldUseResponse };
  root.GA_AI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

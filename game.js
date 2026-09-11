(function () {
  "use strict";
  const D = window.GA_DATA;
  const E = window.GA_ENGINE;
  const $ = selector => document.querySelector(selector);
  let state;
  let mode = null;
  let pendingAttack = null;
  let lastDice = null;
  let menuOpen = false;
  let menuView = "main";
  let menuPlacement = "right";
  let diceAnimationTimer = null;

  function activeUnit() { return state.units.find(unit => unit.id === state.activeUnitId); }
  function teamName(team) { return D.teams[team].name; }
  function addLog(message) { state.log.unshift(message); state.log = state.log.slice(0, 14); }
  function totalUpgrades(unit) { return Object.values(unit.upgrades).reduce((a,b) => a+b, 0); }
  function getTactic(id) { return D.tactics.find(card => card.id === id); }
  function isUsed(id) { return state.usedTactics.has(id); }
  function inHand(team,id) { return state.hands?.[team]?.includes(id); }
  function assetPath(path) { return window.GA_ASSETS?.[path] || path; }

  function resetGame() {
    state = E.setupGame();
    state.responseUsed = { fed: false, zeon: false };
    lastDice = null;
    mode = null;
    menuOpen = false;
    addLog("เริ่มภารกิจ Sleeping Leviathan — Mystery Upgrade ถูกสุ่ม 9 จาก 15 ชิ้นแล้ว");
    startActivation(true);
  }

  function startActivation(first = false) {
    if (state.status !== "playing") return;
    const unit = E.chooseNextUnit(state);
    if (!unit) return advanceTimeline();
    let deployed = false;
    if (unit.zone === "reserve") {
      E.beginDeploy(state, unit);
      deployed = true;
    }
    state.activeUnitId = unit.id;
    state.activation = { advanced: false, actionUsed: false, commandUsed: false, tacticUsed: { fed: false, zeon: false }, timelineSpent: 0 };
    state.responseUsed = { fed: false, zeon: false };
    unit.tempStrength = 0;
    unit.critBoost = false;
    unit.nextAttackDiscount = 0;
    unit.lastShotBonus = false;
    mode = null;
    menuOpen = false;
    menuView = "main";
    state.justDeployedUnitId = deployed ? unit.id : null;
    addLog(`${teamName(unit.team)} — ${unit.name} ${deployed ? "Deploy บน Base" : "เริ่ม Activation"}`);
    renderAll();
    showPassOverlay(unit, first);
  }

  function showPassOverlay(unit, first) {
    const overlay = $("#pass-overlay");
    overlay.innerHTML = `<div class="pass-card" style="--team:${D.teams[unit.team].color}">
      <span class="eyebrow">${first ? "MISSION START" : "HOT-SEAT // PASS CONTROL"}</span>
      <h2>${teamName(unit.team)}</h2>
      <p>ส่งเครื่องให้ผู้เล่นฝั่งนี้ แล้วกดพร้อมเมื่อผู้เล่นอีกฝ่ายมองไม่เห็นมือการ์ด</p>
      <button class="primary-btn" id="ready-btn">พร้อม — ใช้งาน ${unit.name}</button>
    </div>`;
    overlay.classList.add("show");
    $("#ready-btn").addEventListener("click", () => overlay.classList.remove("show"));
  }

  function advanceTimeline() {
    state.resolvedThisTick.clear();
    if (state.currentTick === 10 || state.currentTick === 20) {
      E.scoreObjectives(state);
      addLog(`จบ Phase ${state.phase}: คิดคะแนน Objective ที่ควบคุม จุดละ 1 VP`);
    }
    if (state.currentTick === 20) {
      state.status = "finished";
      state.winner = state.vp.fed === state.vp.zeon ? "draw" : state.vp.fed > state.vp.zeon ? "fed" : "zeon";
      renderAll();
      showResult();
      return;
    }
    state.currentTick += 1;
    state.round = ((state.currentTick - 1) % 10) + 1;
    if (state.currentTick === 11) {
      state.phase = 2;
      addLog("เข้าสู่ Phase 2");
    } else addLog(`Timeline ไปช่อง ${state.round}`);
    startActivation();
  }

  function endActivation() {
    if (!state.activeUnitId || state.status !== "playing") return;
    const unit = activeUnit();
    if (unit.zone === "deploying") { addLog("ต้อง Advance ออกจาก Base ก่อนจบ Activation"); renderAll(); return; }
    if (!state.activation.actionUsed) { addLog("ต้องเลือก Primary Action ก่อนจบ Activation"); renderAll(); return; }
    E.contestObjectives(state,unit).forEach(result=>{
      if(result.action==="captured")addLog(`${unit.name} ชนะ Contest ${result.friendly}-${result.enemy}: ยึด Objective ให้ ${D.teams[unit.team].short}`);
      else if(result.action==="neutralized")addLog(`${unit.name} ชนะ Contest ${result.friendly}-${result.enemy}: ล้าง Objective ของศัตรูให้เป็นกลาง`);
      else if(result.action==="blocked")addLog(`${unit.name} Contest Objective ไม่สำเร็จ (${result.friendly}-${result.enemy})`);
    });
    unit.tempStrength = 0;
    unit.critBoost = false;
    unit.lastShotBonus = false;
    state.resolvedThisTick.add(unit.id);
    state.activeUnitId = null;
    mode = null;
    menuOpen = false;
    refreshTeamTacticsAfterTurn(unit.team);
    startActivation();
  }

  function refreshTeamTacticsAfterTurn(team) {
    if (state.tacticCycles[team]!==1||!E.teamPassedTimeline(state,team,10)) return false;
    E.dealTacticHand(state,team);
    state.tacticCycles[team]=2;
    addLog(`${teamName(team)}: Unit ทั้ง 3 ตัวผ่าน TL 10 — จั่ว Tactic ใหม่ 3 ใบ`);
    return true;
  }

  function payTimeline(unit, amount) {
    const cost=Math.max(0,amount);
    unit.nextAt += cost;
    state.activation.timelineSpent += cost;
  }

  function renderAll() {
    renderHeader();
    renderTimeline();
    renderBoard();
    renderUnitCard();
    renderActions();
    renderHand();
    renderLog();
  }

  function renderHeader() {
    $("#fed-vp").textContent = state.vp.fed;
    $("#zeon-vp").textContent = state.vp.zeon;
    $("#phase-label").textContent = `PHASE ${state.phase}`;
    $("#round-label").textContent = `ROUND ${state.round} / 10`;
    $("#timeline-phase").textContent = `PHASE ${state.phase}`;
  }

  function renderTimeline() {
    const timelineIcon = unit => `<i class="timeline-icon ${unit.id===state.activeUnitId?"active":""} ${state.resolvedThisTick.has(unit.id)?"acted":""} ${unit.zone==="reserve"?"reserve":""}" style="--team:${D.teams[unit.team].color}" title="${unit.name}${unit.weaponBadge?` ${unit.weaponBadge}`:""}" aria-label="${unit.name}${unit.weaponBadge?` ${unit.weaponBadge}`:""}"><img src="${unit.icon}" alt=""></i>`;
    $("#timeline").innerHTML = Array.from({length:10},(_,index)=>{
      const slot=index+1;
      const units=state.units.filter(unit=>E.timelineSlot(unit.nextAt)===slot);
      const fedUnits=units.filter(unit=>unit.team==="fed");
      const zeonUnits=units.filter(unit=>unit.team==="zeon");
      return `<div class="timeline-slot ${slot===state.round?"current":""}"><div class="slot-number">${slot}</div><div class="timeline-stack"><div class="timeline-team-row fed">${fedUnits.map(timelineIcon).join("")}</div><div class="timeline-team-row zeon">${zeonUnits.map(timelineIcon).join("")}</div></div></div>`;
    }).join("");
  }

  function hexPoints(cx, cy, size) {
    return Array.from({length:6}, (_,i) => {
      const angle = Math.PI / 180 * (60*i);
      return `${(cx + size*Math.cos(angle)).toFixed(1)},${(cy + size*Math.sin(angle)).toFixed(1)}`;
    }).join(" ");
  }

  function featureAt(q, r) {
    const base = D.map.featureCoordinates.bases.find(x => x.q===q && x.r===r);
    if (base) return { type:"base", team:base.team, icon:assetPath(`assets/tokens/base-${base.team==="fed"?"blue":"red"}.png`) };
    const garrison = state.garrisons.find(x => x.q===q && x.r===r);
    if (garrison) return { type:"garrison", team:garrison.team, hp:garrison.hp, icon:assetPath(`assets/tokens/garrison-${garrison.team==="fed"?"blue":"red"}.png`) };
    const objective = state.objectives.find(x => x.q===q && x.r===r);
    if (objective) return { type:"objective", team:objective.owner || "neutral" };
    if (state.energy.some(x => x.q===q && x.r===r)) return { type:"energy", team:"neutral", icon:assetPath("assets/tokens/energy.png") };
    if (state.upgrades.some(x => x.q===q && x.r===r)) return { type:"upgrade", team:"neutral", icon:assetPath("assets/tokens/mystery.png") };
    return null;
  }

  function isTargetable(q, r) {
    return mode && mode.targets && mode.targets.has(E.key(q,r));
  }

  function unitMapEffects(unit) {
    const effects = [];
    const upgradeLabels = { shield:"Shield", speed:"Speed", strength:"Strength" };
    const statusLabels = { fracture:"Fracture", slow:"Slow", disarm:"Disarm" };
    for (const type of ["shield","speed","strength"]) {
      const count = unit.upgrades?.[type] || 0;
      if (count) effects.push({ type, kind:"buff", icon:assetPath(`assets/tokens/${type}.png`), count, title:`${upgradeLabels[type]} Upgrade ×${count}` });
    }
    for (const type of ["fracture","slow","disarm"]) {
      if (unit.statuses?.[type]) effects.push({ type, kind:"status", icon:assetPath(`assets/tokens/${type}.png`), title:statusLabels[type] });
    }
    if (unit.tempStrength > 0) effects.push({ type:"temp-strength", kind:"temporary", icon:assetPath("assets/tokens/strength.png"), count:`+${unit.tempStrength}`, title:`Strength ชั่วคราว +${unit.tempStrength}` });
    if (unit.critBoost) effects.push({ type:"critical", kind:"temporary", text:"C7", title:"ผลทอย 7–8 เป็น Critical" });
    if (unit.nextAttackDiscount > 0) effects.push({ type:"timeline", kind:"temporary", text:"TL−1", title:"การโจมตีครั้งถัดไปใช้ Timeline ลดลง 1" });
    return effects;
  }

  function renderUnitEffectBadges(unit, cx, cy) {
    const effects = unitMapEffects(unit);
    if (!effects.length) return "";
    const badgeSize = 16, gap = 2, perRow = 4;
    const topEdge = cy - 47 - (Math.ceil(effects.length/perRow)-1)*(badgeSize+gap);
    const placeRight = topEdge < 3;
    return `<g class="map-effect-strip">${effects.map((effect,index)=>{
      const row=Math.floor(index/perRow), col=index%perRow;
      const rowCount=Math.min(perRow,effects.length-row*perRow);
      const x=placeRight ? cx+23+col*(badgeSize+gap) : cx-(rowCount*badgeSize+(rowCount-1)*gap)/2+col*(badgeSize+gap);
      const y=placeRight ? cy-18+row*(badgeSize+gap) : cy-47-row*(badgeSize+gap);
      const content=effect.icon
        ? `<image class="effect-icon" href="${effect.icon}" x="${x+1}" y="${y+1}" width="14" height="14" preserveAspectRatio="xMidYMid meet"></image>`
        : `<text class="effect-text" x="${x+badgeSize/2}" y="${y+badgeSize/2}">${effect.text}</text>`;
      const counter=effect.count!==undefined
        ? `<circle class="effect-count-bg" cx="${x+badgeSize-1}" cy="${y+badgeSize-1}" r="5"></circle><text class="effect-count" x="${x+badgeSize-1}" y="${y+badgeSize-1}">${effect.count}</text>`
        : "";
      return `<g class="map-effect-badge ${effect.kind} ${effect.type}" aria-label="${effect.title}"><title>${effect.title}</title><rect class="effect-back" x="${x}" y="${y}" width="${badgeSize}" height="${badgeSize}" rx="3"></rect>${content}${counter}</g>`;
    }).join("")}</g>`;
  }

  function renderBoard() {
    const size = 27, x0 = 72, y0 = 32, dx = size*1.5, dy = Math.sqrt(3)*size;
    const active = activeUnit();
    let defs = "";
    let cells = "";
    for (let q=0;q<D.map.cols;q++) for (let r=0;r<D.map.rows;r++) {
      const cx=x0+q*dx, cy=y0+(r+(q&1)*.5)*dy;
      const hex=state.board[E.key(q,r)];
      const cls=["hex",`elevation-${hex.elevation}`];
      if (mode?.type === "move" && mode.targets.has(E.key(q,r))) cls.push("reachable");
      if (isTargetable(q,r)) cls.push("targetable");
      if (mode?.type === "char-kick" && isTargetable(q,r)) cls.push("char-kick-target");
      if (active?.q===q && active?.r===r) cls.push("selected");
      const f=featureAt(q,r);
      cells += `<g class="${cls.join(" ")}" data-q="${q}" data-r="${r}">
        <polygon points="${hexPoints(cx,cy,size-1)}"></polygon>
        <text class="elevation-label" x="${cx-18}" y="${cy-14}">L${hex.elevation}</text>
        ${f ? f.icon
          ? `<image class="feature-token ${f.type} ${mode?.type === "char-kick" && isTargetable(q,r) ? "char-kick-victim" : ""}" href="${f.icon}" x="${cx-14}" y="${cy-14}" width="28" height="28" preserveAspectRatio="xMidYMid meet"></image>${f.hp!==undefined?`<circle class="token-counter-bg ${f.team}" cx="${cx+11}" cy="${cy+10}" r="7"></circle><text class="token-counter" x="${cx+11}" y="${cy+10}">${f.hp}</text>`:""}`
          : `<g class="objective-flag ${f.team}" aria-label="Objective ${f.team === "neutral" ? "ยังไม่มีผู้ครอบครอง" : `ครอบครองโดย ${teamName(f.team)}`}"><title>Objective · 1 VP เมื่อจบ Phase</title><path class="objective-pole" d="M ${cx-7} ${cy+13} V ${cy-12}"></path><path class="objective-cloth" d="M ${cx-6} ${cy-11} L ${cx+11} ${cy-6} L ${cx-6} ${cy+1} Z"></path><path class="objective-base" d="M ${cx-13} ${cy+13} H ${cx-1}"></path></g>` : ""}
      </g>`;
    }
    let units = "";
    for (const unit of state.units.filter(u=>u.zone==="board"||u.zone==="deploying")) {
      const cx=x0+unit.q*dx, cy=y0+(unit.r+(unit.q&1)*.5)*dy;
      const clip=`clip-${unit.id}`;
      defs += `<clipPath id="${clip}"><circle cx="${cx}" cy="${cy-2}" r="17"></circle></clipPath>`;
      const teamClass=unit.team;
      units += `<g class="unit-node ${unit.id===state.activeUnitId?"active":""} ${unit.id===state.justDeployedUnitId?"deploying":""} ${mode?.type === "char-kick" && isTargetable(unit.q,unit.r) ? "char-kick-victim" : ""}" data-q="${unit.q}" data-r="${unit.r}">
        <circle class="unit-base ${teamClass}" cx="${cx}" cy="${cy}" r="20"></circle>
        <image class="unit-portrait" href="${unit.icon}" x="${cx-18}" y="${cy-20}" width="36" height="36" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"></image>
        ${unit.weaponBadge ? `<rect class="weapon-badge" x="${cx+8}" y="${cy-21}" width="23" height="11" rx="2"></rect><text class="weapon-badge-text" x="${cx+19.5}" y="${cy-15.5}">${unit.weaponBadge}</text>` : ""}
        ${renderUnitEffectBadges(unit,cx,cy)}
        <rect class="unit-hp-bg" x="${cx-20}" y="${cy+20}" width="40" height="5" rx="2"></rect>
        <rect class="unit-hp" x="${cx-19}" y="${cy+21}" width="${38*unit.hp/unit.maxHp}" height="3" rx="1"></rect>
        <text class="unit-name" x="${cx}" y="${cy+34}">${unit.name === "Zaku II" ? unit.role : unit.name}</text>
      </g>`;
    }
    $("#board").innerHTML=`<defs>${defs}</defs>${cells}${units}`;
    $("#board").querySelectorAll("[data-q]").forEach(node => node.addEventListener("click", event => handleHexClick(Number(node.dataset.q),Number(node.dataset.r),event)));
  }

  function renderUnitCard() {
    const unit=activeUnit();
    if (!unit) { $("#active-hud").innerHTML=""; return; }
    const team=D.teams[unit.team];
    const chips=[];
    for (const [type,count] of Object.entries(unit.upgrades)) if (count) chips.push(`<span class="chip good token-chip"><img src="${assetPath(`assets/tokens/${type}.png`)}" alt="">${type.toUpperCase()} ×${count}</span>`);
    for (const [type,on] of Object.entries(unit.statuses)) if (on) chips.push(`<span class="chip bad token-chip"><img src="${assetPath(`assets/tokens/${type}.png`)}" alt="">${type.toUpperCase()}</span>`);
    $("#active-hud").innerHTML=`<div class="active-hud-inner" style="--team:${team.color}"><div class="active-hud-portrait"><img src="${unit.icon}" alt=""></div><div><span class="eyebrow">${unit.model}</span><h2>${unit.name}</h2><p>${unit.zone==="reserve"?"RESERVE":unit.role}</p><div class="hp-line"><span>HP</span><div class="bar"><i style="width:${unit.hp/unit.maxHp*100}%"></i></div><b>${unit.hp}/${unit.maxHp}</b></div></div><div class="active-hud-stats"><span class="chip">⚡ ${unit.energy}</span>${chips.join("")}</div></div>`;
  }

  function hasOwnGarrisonInRange(unit, range=1) { return state.garrisons.some(g=>g.team===unit.team && E.distance(unit,g)<=range); }
  function adjacentObjective(unit) { return state.objectives.find(o=>E.distance(unit,o)<=1); }

  function renderActions() {
    const unit=mode?.unitId?state.units.find(candidate=>candidate.id===mode.unitId):activeUnit(); const menu=$("#command-menu");
    menu.classList.toggle("char-kick-menu",mode?.type==="char-kick");
    if (!unit||!menuOpen) { menu.innerHTML=""; return; }
    if (mode) {
      const charKickAlert=mode.type==="char-kick"?`<div class="char-kick-alert"><strong>เลือกเป้าหมายสีแดง</strong><span>DAMAGE 1</span><small>UNIT หรือ GARRISON ที่ติดกัน</small></div>`:"";
      menu.innerHTML=`<div class="command-caption"><span>${mode.type.toUpperCase()}</span><span>SELECTING</span></div>${charKickAlert}<div class="command-list">${mode.type==="move"&&mode.allowStay?`<button class="command-item" id="stay-in-place"><span>อยู่ช่องเดิม</span><small>0 HEX</small></button>`:""}<button class="command-item" id="cancel-mode"><span>‹ Back</span><small>CANCEL</small></button></div>`;
      menu.querySelector("#stay-in-place")?.addEventListener("click",()=>completeMove(unit.q,unit.r));
      menu.querySelector("#cancel-mode").addEventListener("click",()=>{const back=mode.returnMenu||"main";const onCancel=mode.onCancel;mode=null;menuOpen=true;menuView=back;if(onCancel)onCancel();renderAll();});
      positionCommandMenu(unit);
      return;
    }
    const a=state.activation;
    const deploying=unit.zone==="deploying";
    const moveDistance=D.rules.advance.distance+unit.upgrades.speed;
    const dashDistance=D.rules.dash.distance+(unit.id==="chars-zaku"?1:0);
    const item=(label,sub,action,disabled=false,cls="")=>`<button class="command-item ${cls}" data-menu-action="${action}" ${disabled?"disabled":""}><span>${label}</span><small>${sub}</small></button>`;
    const main=(deploying?[
      item("Deploy Move",unit.statuses.slow?"CLEAR SLOW":`${moveDistance} HEX`,"advance",false),
      item("Unit Card","INFO","info"),
      item("Wait","LEAVE BASE FIRST","end",true,"danger")
    ]:[
      item("Move",unit.statuses.slow?"CLEAR SLOW":`${moveDistance} HEX`,"advance",a.advanced),
      item("Attack","WEAPON","attack-menu",a.actionUsed),
      item("Dash",`${dashDistance} HEX · TL${D.rules.dash.timeline}`,"dash",a.actionUsed),
      item("Energize","+1 ENERGY · TL2","energize",a.actionUsed),
      item("Rescue","GARRISON · TL2","rescue",a.actionUsed||!hasOwnGarrisonInRange(unit)),
      item(unit.command.name,`⚡${unit.command.energy}`,"ability",a.commandUsed||unit.energy<unit.command.energy),
      item("Tactic",`${state.hands[unit.team].filter(id=>!isUsed(id)).length} CARDS`,"tactics"),
      item("Unit Card","INFO","info"),
      item("Wait",a.actionUsed?"END":"PRIMARY ACTION REQUIRED","end",!a.actionUsed,"danger")
    ]).join("");
    const weapons=unit.weapons.map((weapon,index)=>item(weapon.name,`R${weapon.range} · S${weapon.strength} · TL${weapon.timeline}`,`weapon-${index}`,a.actionUsed)).join("")+item("‹ Back","COMMAND","back");
    menu.innerHTML=`<div class="command-caption"><span>${menuView==="weapons"?"WEAPON":"COMMAND"}</span><span>${unit.weaponBadge||unit.model}</span></div><div class="command-list">${menuView==="weapons"?weapons:main}</div>`;
    menu.querySelectorAll("[data-menu-action]").forEach(btn=>btn.addEventListener("click",()=>{
      const action=btn.dataset.menuAction;
      if(action==="attack-menu"){menuView="weapons";renderActions();return;}
      if(action==="back"){menuView="main";renderActions();return;}
      if(action.startsWith("weapon-")){menuOpen=false;beginAttack(unit.weapons[Number(action.split("-")[1])]);return;}
      if(action==="info"){showUnitCard(unit);return;}
      if(action==="tactics"){menuOpen=false;renderActions();$("#tactics-panel")?.scrollIntoView({behavior:"smooth",block:"nearest"});return;}
      if(action==="end"){endActivation();return;}
      menuOpen=false;menuView="main";handleAction(action);
    }));
    positionCommandMenu(unit);
  }

  function positionCommandMenu(unit) {
    requestAnimationFrame(()=>{
      const svg=$("#board"), menu=$("#command-menu"); if(!svg||!menu.innerHTML)return;
      const size=27,x0=72,y0=32,dx=size*1.5,dy=Math.sqrt(3)*size;
      const p=svg.createSVGPoint();p.x=x0+unit.q*dx;p.y=y0+(unit.r+(unit.q&1)*.5)*dy;
      const screen=p.matrixTransform(svg.getScreenCTM());
      const menuWidth=menu.offsetWidth||190;
      const preferred=menuPlacement==="right"?screen.x+30:screen.x-menuWidth-30;
      const left=Math.min(window.innerWidth-menuWidth-8,Math.max(8,preferred));
      const top=Math.min(window.innerHeight-menu.offsetHeight-8,Math.max(8,screen.y));
      menu.style.left=`${left}px`;menu.style.top=`${top}px`;
    });
  }

  function renderHand() {
    const unit=activeUnit(); if (!unit) return;
    $("#hand-title").textContent=`${teamName(unit.team)} · HAND 3 / 9`;
    const hand=state.hands[unit.team].map(getTactic);
    $("#tactic-hand").innerHTML=hand.map(card=>{
      const used=isUsed(card.id);
      const legal=!used && card.timing==="COMMAND" && !state.activation.tacticUsed[card.team] && !mode;
      return `<button class="tactic-card ${used?"used":legal?"legal":""}" data-card="${card.id}" aria-label="${card.name}"><img src="${card.card}" alt="การ์ดจริง ${card.name}"><span class="card-state">${used?"USED · VIEW":legal?"VIEW · CONFIRM":"VIEW · "+card.timing}</span></button>`;
    }).join("");
    $("#tactic-hand").querySelectorAll("[data-card]").forEach(card=>card.addEventListener("click",()=>handleTactic(card.dataset.card)));
  }

  function renderLog() {
    $("#battle-log").innerHTML=state.log.map(item=>`<li>${item}</li>`).join("");
    $("#dice-tray").innerHTML=lastDice?lastDice.dice.map((die,i)=>`<span class="die ${lastDice.results[i]}">${die}</span>`).join(""):"<span class=\"chip\">ยังไม่มี Attack Roll</span>";
  }

  function showDiceRoll(result, label, onComplete=()=>{}) {
    let overlay=$("#dice-roll-overlay");
    if(!overlay){
      overlay=document.createElement("div");
      overlay.id="dice-roll-overlay";
      overlay.className="dice-roll-overlay";
      overlay.setAttribute("role","dialog");
      overlay.setAttribute("aria-modal","true");
      overlay.setAttribute("aria-label","ผลการทอยลูกเต๋า");
      document.body.appendChild(overlay);
    }
    if(diceAnimationTimer)clearTimeout(diceAnimationTimer);
    const dice=result.dice.map((die,index)=>`<div class="rolling-d10" data-index="${index}" data-final="${die}"><span>?</span></div>`).join("");
    overlay.innerHTML=`<div class="dice-roll-card"><span class="eyebrow">D10 // ${label}</span><h2 class="dice-roll-title">กำลังทอยลูกเต๋า…</h2><div class="animated-dice-grid">${dice}</div><div class="dice-roll-summary" aria-live="polite">ROLLING</div></div>`;
    overlay.classList.add("show");
    const nodes=[...overlay.querySelectorAll(".rolling-d10")];
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const rollTime=reduced?80:850;
    const holdTime=reduced?350:700;
    const interval=setInterval(()=>nodes.forEach(node=>{node.querySelector("span").textContent=String(Math.floor(Math.random()*10)+1);}),reduced?80:65);
    diceAnimationTimer=setTimeout(()=>{
      clearInterval(interval);
      nodes.forEach((node,index)=>{
        node.querySelector("span").textContent=String(result.dice[index]);
        node.classList.add("revealed",result.results[index]);
        node.setAttribute("aria-label",`ลูกที่ ${index+1}: ${result.dice[index]} ${result.results[index]}`);
      });
      overlay.querySelector(".dice-roll-title").textContent=result.criticals?"CRITICAL!":"ATTACK ROLL";
      overlay.querySelector(".dice-roll-summary").textContent=`${result.hits} HIT · ${result.criticals} CRITICAL`;
      diceAnimationTimer=setTimeout(()=>{
        overlay.classList.remove("show");
        diceAnimationTimer=null;
        onComplete();
      },holdTime);
    },rollTime);
  }

  function offerNewtypeReroll(attacker, defender, weapon, result, onComplete) {
    const choices=result.rerollEligible ? result.dice.map((value,index)=>index) : [];
    if(!choices.length){onComplete();return;}
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card newtype-modal"><span class="eyebrow">ONGOING // AFTER ATTACK ROLL</span><h2>Newtype Instincts</h2><p>เลือกผล 1 ลูกเพื่อทอยใหม่ รวมถึงลูกที่ Hit แล้วหากต้องการเสี่ยงหา Critical หรือเก็บผลเดิมไว้</p><div class="reroll-picker">${choices.map(index=>`<button data-reroll-index="${index}" aria-label="ทอยลูกที่ ${index+1} ผล ${result.dice[index]} ใหม่"><span class="die ${result.results[index]}">${result.dice[index]}</span><small>ลูกที่ ${index+1} · REROLL</small></button>`).join("")}</div><div class="modal-actions"><button class="action-btn" id="skip-newtype">ไม่ทอยใหม่ <span>KEEP ROLL</span></button></div></div>`;
    modal.classList.add("show");
    modal.querySelectorAll("[data-reroll-index]").forEach(button=>button.addEventListener("click",()=>{
      const index=Number(button.dataset.rerollIndex);const previous=result.dice[index];
      E.rerollAttackDie(state,attacker,defender,weapon,result,index);
      const rerollView={dice:[result.dice[index]],results:[result.results[index]],hits:result.results[index]==="hit"?1:0,criticals:result.results[index]==="critical"?1:0};
      lastDice=result;addLog(`Newtype Instincts: Gundam ทอยลูกที่ ${index+1} ใหม่ ${previous} → ${result.dice[index]}`);closeModal();renderAll();
      showDiceRoll(rerollView,"NEWTYPE INSTINCTS",onComplete);
    }));
    modal.querySelector("#skip-newtype").addEventListener("click",()=>{result.rerollEligible=false;closeModal();onComplete();});
  }

  function handleAction(action) {
    const unit=activeUnit(); if (!unit || mode) return;
    if (action==="advance") {
      if (unit.statuses.slow) {
        unit.statuses.slow=false; state.activation.advanced=true; payTimeline(unit,1);
        addLog(`${unit.name} ใช้ Advance เพื่อลบ Slow และไม่เคลื่อนที่`); renderAll(); return;
      }
      startMove(D.rules.advance.distance+unit.upgrades.speed,D.rules.advance.timeline,"Advance",()=>afterUnitMove(unit,"advance"));
    } else if (action==="dash") {
      startMove(D.rules.dash.distance+(unit.id==="chars-zaku"?1:0),D.rules.dash.timeline,"Dash",()=>afterUnitMove(unit,"dash"),{primaryAction:true});
    } else if (action==="energize") {
      unit.energy+=1; state.activation.actionUsed=true; payTimeline(unit,2);
      addLog(`${unit.name} Energize: Energy +1`); renderAll();
    } else if (action==="rescue") rescueGarrison(unit,1,true);
    else if (action==="ability") useUnitAbility(unit);
  }

  function startMove(allowance, cost, label, afterMove, options={}) {
    const unit=activeUnit();
    return startMoveFor(unit,allowance,cost,label,afterMove,options);
  }

  function startMoveFor(unit,allowance,cost,label,afterMove,options={}) {
    if(!unit||unit.zone==="reserve")return false;
    const forbidden=new Set(D.map.featureCoordinates.bases.map(base=>E.key(base.q,base.r)));
    const reachable=E.reachable(state,unit,allowance,{ignoreElevation:!!options.ignoreElevation,forbidden});
    if(options.destinationFilter){for(const target of [...reachable.keys()]){const [q,r]=E.fromKey(target);if(!options.destinationFilter({q,r}))reachable.delete(target);}}
    if(!reachable.size&&unit.zone==="deploying"){
      unit.zone="reserve";unit.q=null;unit.r=null;unit.energy+=1;payTimeline(unit,2);state.resolvedThisTick.add(unit.id);state.activeUnitId=null;
      addLog(`${unit.name} ไม่มีช่อง Deploy ที่ถูกกติกา: Energize +1, Timeline +2 และกลับ Reserve`);renderAll();startActivation();return;
    }
    const allowStay=options.allowStay??unit.zone!=="deploying";
    if(!reachable.size&&!allowStay){addLog(`${label}: ไม่มีช่องปลายทางที่ถูกกติกา`);renderAll();return false;}
    mode={type:"move",unitId:unit.id,targets:new Set(reachable.keys()),cost,label,afterMove,primaryAction:!!options.primaryAction,allowStay,returnMenu:options.returnMenu||"main",onCancel:options.onCancel,hint:`${label}: เลือกช่องสีฟ้า (งบการเคลื่อนที่ ${allowance}; การขึ้นที่สูงใช้เพิ่ม 1 ต่อระดับ)`};
    menuOpen=true;
    renderAll();
    return true;
  }

  function handleHexClick(q,r,event=null) {
    if (!mode) {
      const clicked=state.units.find(x=>x.zone!=="reserve"&&x.q===q&&x.r===r);
      if(clicked?.id===state.activeUnitId){
        if(menuOpen){
          menuPlacement=menuPlacement==="right"?"left":"right";
        }else{
          const boardBounds=$("#board")?.getBoundingClientRect?.();
          const unitBounds=event?.currentTarget?.getBoundingClientRect?.();
          const unitCenter=unitBounds?.width?unitBounds.left+unitBounds.width/2:event?.clientX;
          if(boardBounds?.width&&Number.isFinite(unitCenter))menuPlacement=unitCenter<boardBounds.left+boardBounds.width/2?"right":"left";
          menuOpen=true;
          menuView="main";
        }
        renderActions();
      }
      else if(menuOpen){menuOpen=false;menuView="main";renderActions();}
      return;
    }
    const k=E.key(q,r); if (!mode.targets?.has(k)) return;
    const unit=mode?.unitId?state.units.find(candidate=>candidate.id===mode.unitId):activeUnit();
    if (mode.type==="move") {
      completeMove(q,r);
    } else if (mode.type==="attack") {
      const target=E.unitAt(state,q,r);
      const garrison=state.garrisons.find(g=>g.q===q&&g.r===r&&g.team!==unit.team);
      const weapon=mode.weapon; const free=mode.free; mode=null;
      if (target) resolveAttack(unit,target,weapon,{free});
      else if (garrison) resolveGarrisonAttack(unit,garrison,weapon,{free});
    } else if (mode.type==="select-unit") {
      const target=E.unitAt(state,q,r); const callback=mode.callback; mode=null;
      if (target) callback(target);
      renderAll();
    } else if (mode.type==="select-garrison") {
      const target=state.garrisons.find(g=>g.q===q&&g.r===r);const callback=mode.callback;mode=null;
      if(target)callback(target);
      renderAll();
    } else if (mode.type==="char-kick") {
      const target=E.unitAt(state,q,r);
      const garrison=state.garrisons.find(g=>g.q===q&&g.r===r&&g.team!==unit.team);
      const callback=mode.callback;
      mode=null;
      if(target){E.applyDamage(target,1);addLog(`Char Kick: ${target.name} รับ Damage 1`);E.defeatUnit(state,target,unit.team);}
      else if(garrison) damageGarrison(unit,garrison,1,"Char Kick");
      if(callback)callback();
      renderAll();
    }
  }

  function completeMove(q,r) {
    const unit=state.units.find(candidate=>candidate.id===mode?.unitId);if(!unit||mode?.type!=="move")return;
    const primaryAction=mode.primaryAction;const wasDeploying=unit.zone==="deploying";const callback=mode.afterMove;const label=mode.label;const cost=mode.cost;
    unit.q=q;unit.r=r;unit.zone="board";E.pickupAt(state,unit);payTimeline(unit,cost);
    if(primaryAction)state.activation.actionUsed=true;
    if(label==="Advance")state.activation.advanced=true;
    if(wasDeploying)state.justDeployedUnitId=null;
    mode=null;addLog(`${unit.name} ใช้ ${label} ที่ Hex ${q},${r}`);if(callback)callback();renderAll();
  }

  function afterUnitMove(unit, movementType, afterEffects=null) {
    if (unit.id==="chars-zaku" && movementType==="dash") {
      const enemyUnits=E.livingEnemies(state,unit).filter(target=>E.distance(unit,target)===1);
      const enemyGarrisons=state.garrisons.filter(target=>target.team!==unit.team&&E.distance(unit,target)===1);
      const targets=[...enemyUnits,...enemyGarrisons];
      if (targets.length) {
        mode={type:"char-kick",unitId:unit.id,targets:new Set(targets.map(target=>E.key(target.q,target.r))),returnMenu:"main",hint:"Char Kick: เลือก Unit หรือ Garrison ศัตรูที่ติดกันเพื่อสร้าง Damage 1",callback:afterEffects,onCancel:afterEffects};
        menuOpen=true;
        return;
      }
    }
    const enforcer=state.units.find(x=>x.id==="zaku-enforcer"&&x.zone==="board");
    if (unit.team==="fed"&&enforcer&&E.distance(unit,enforcer)===1&&inHand("zeon","iron-grip")&&!isUsed("iron-grip")&&!state.activation.tacticUsed.zeon) {
      openResponse([getTactic("iron-grip")], card=>{
        useResponse(card); E.applyDamage(unit,3); addLog(`Iron Grip: ${unit.name} รับ Damage 3`); E.defeatUnit(state,unit,"zeon"); renderAll();if(afterEffects)afterEffects();
      },()=>{if(afterEffects)afterEffects();});
      return;
    }
    if(afterEffects)afterEffects();
  }

  function beginAttack(weapon, options={}) {
    const unit=activeUnit();
    const targets=E.legalWeaponTargets(state,unit,weapon);
    const garrisonTargets=state.garrisons.filter(g=>g.team!==unit.team&&E.distance(unit,g)<=weapon.range&&(weapon.ignoreLos||E.hasLineOfSight(state,unit,g)));
    if (!targets.length&&!garrisonTargets.length) { addLog(`${weapon.name}: ไม่มีเป้าหมายที่อยู่ใน Range และ Line of Sight`); renderAll(); return; }
    mode={type:"attack",weapon,free:!!options.free,targets:new Set([...targets,...garrisonTargets].map(t=>E.key(t.q,t.r))),returnMenu:"weapons",hint:`${weapon.name}: เลือกยูนิตหรือ Garrison สีแดง`};
    menuOpen=true;
    renderAll();
  }

  function resolveGarrisonAttack(attacker,garrison,weapon,options={}) {
    const surrogate={...garrison,upgrades:{shield:0,speed:0,strength:0},statuses:{slow:false,fracture:false,disarm:false}};
    const result=E.rollAttack(state,attacker,surrogate,weapon);
    lastDice=result;
    if(!options.free){state.activation.actionUsed=true;payTimeline(attacker,Math.max(0,weapon.timeline-attacker.nextAttackDiscount));}
    attacker.nextAttackDiscount=0;attacker.lastShotBonus=false;
    renderAll();
    showDiceRoll(result,weapon.name,()=>offerNewtypeReroll(attacker,surrogate,weapon,result,()=>{
      damageGarrison(attacker,garrison,result.damage,`${attacker.name} ใช้ ${weapon.name}`);
      applyAttackerCritical(attacker,weapon,result);
      resolveSplashDamage(attacker,garrison,weapon,result);
      const attackerResponses=availablePostCombat(attacker,"attacker");
      renderAll();
      openPostCombatResponses([{cards:attackerResponses,role:"attacker"}],attacker,surrogate,0,()=>offerWeaponCriticalFollowUp(attacker,weapon,result));
    }));
  }

  function damageGarrison(source,garrison,amount,label) {
    const damage=Math.max(0,amount);
    garrison.hp=Math.max(0,garrison.hp-damage);
    addLog(`${label}: Garrison ศัตรูรับ Damage ${damage}`);
    if(garrison.hp===0){state.garrisons=state.garrisons.filter(g=>g.id!==garrison.id);state.vp[source.team]+=1;addLog(`Garrison ถูกทำลาย — ${D.teams[source.team].short} +1 VP`);}
  }

  function resolveAttack(attacker,defender,weapon,options={}) {
    const result=E.rollAttack(state,attacker,defender,weapon);
    lastDice=result;
    if (!options.free) {
      state.activation.actionUsed=true;
      payTimeline(attacker,Math.max(0,weapon.timeline-attacker.nextAttackDiscount));
    }
    attacker.nextAttackDiscount=0;
    if (weapon.effect==="shieldBreak"&&defender.upgrades.shield>0) { defender.upgrades.shield-=1; addLog(`${weapon.name} ทำลาย Shield Upgrade 1 ชิ้น`); }
    pendingAttack={attacker,defender,weapon,result,reduction:0};
    addLog(`${attacker.name} ใช้ ${weapon.name}: ${result.hits} Hit · ${result.criticals} Critical`);
    renderAll();
    showDiceRoll(result,weapon.name,()=>offerNewtypeReroll(attacker,defender,weapon,result,()=>{
      if (defender.team==="fed"&&result.damage>0&&inHand("fed","federation-shield")&&!isUsed("federation-shield")&&!state.activation.tacticUsed.fed) {
        openResponse([getTactic("federation-shield")], card=>{ useResponse(card); pendingAttack.reduction=2; finishAttack(); }, finishAttack);
      } else finishAttack();
    }));
  }

  function finishAttack() {
    closeModal();
    if (!pendingAttack) return;
    const {attacker,defender,weapon,result,reduction}=pendingAttack;
    const damage=Math.max(0,result.damage-reduction);
    const applied=E.applyDamage(defender,damage);
    if (applied.blocked) addLog(`Shield ป้องกัน Damage ${applied.blocked}`);
    addLog(`${defender.name} รับ Damage ${applied.taken}${applied.fractured?" (Fracture +3)":""}`);
    applyAttackerCritical(attacker,weapon,result);
    if (result.criticals>0) applyCritical(attacker,defender,weapon,result);
    resolveSplashDamage(attacker,defender,weapon,result);
    const defeated=E.defeatUnit(state,defender,attacker.team);
    if (attacker.lastShotBonus) {
      if (defeated) {
        attacker.upgrades.strength+=1;
        addLog(`Last Shot Counts: ${attacker.name} รับ Strength Upgrade เพิ่มอีก 1`);
      }
      attacker.lastShotBonus=false;
    }
    const defenderResponses=defeated?[]:availablePostCombat(defender,"defender");
    const attackerResponses=availablePostCombat(attacker,"attacker");
    pendingAttack=null;
    renderAll();
    openPostCombatResponses([
      {cards:defenderResponses,role:"defender"},
      {cards:attackerResponses,role:"attacker"}
    ],attacker,defender,0,()=>offerWeaponCriticalFollowUp(attacker,weapon,result));
  }

  function applyCritical(attacker,defender,weapon,result) {
    if (weapon.critical==="slow") defender.statuses.slow=true;
    if (weapon.critical==="fracture") defender.statuses.fracture=true;
    if (weapon.critical==="push2") pushAway(attacker,defender,2);
  }

  function applyAttackerCritical(attacker,weapon,result) {
    if (result.criticals<1||weapon.critical!=="gainStrength") return;
    attacker.upgrades.strength+=1;
    addLog(`Beam Saber Critical: ${attacker.name} รับ Strength Upgrade 1`);
  }

  function resolveSplashDamage(attacker,target,weapon,result) {
    if(weapon.effect!=="splash")return;
    const amount=1+(weapon.critical==="splashDamage1"&&result.criticals>0?1:0);
    const adjacent=E.livingEnemies(state,attacker).filter(unit=>unit.id!==target.id&&E.distance(unit,target)===1);
    adjacent.forEach(unit=>{const applied=E.applyDamage(unit,amount);addLog(`Cracker Grenade: ${unit.name} รับ Damage ${applied.taken}`);E.defeatUnit(state,unit,attacker.team);});
  }

  function offerWeaponCriticalFollowUp(attacker,weapon,result,onComplete=()=>{}) {
    if(result.criticals<1||attacker.zone!=="board"){onComplete();return;}
    if(attacker.id==="chars-zaku"&&weapon.critical==="dashTimeline0"){
      addLog("Machine Gun Critical: Char’s Zaku II สามารถ Dash โดยใช้ Timeline 0");
      startMoveFor(attacker,D.rules.dash.distance+1,0,"Machine Gun Critical Dash",()=>afterUnitMove(attacker,"dash",onComplete),{returnMenu:"main",onCancel:onComplete});
      return;
    }
    if(attacker.id==="guncannon"&&weapon.critical==="dashRescueTimeline0"){
      addLog("240mm Critical: Guncannon สามารถ Dash โดยใช้ Timeline 0 แล้ว Rescue ใน Range 1");
      startMoveFor(attacker,D.rules.dash.distance,0,"240mm Critical Dash",()=>afterUnitMove(attacker,"dash",()=>offerGuncannonCriticalRescue(attacker,onComplete)),{returnMenu:"main",onCancel:onComplete});
      return;
    }
    onComplete();
  }

  function offerGuncannonCriticalRescue(unit,onComplete=()=>{}) {
    if(unit.zone!=="board"||!hasOwnGarrisonInRange(unit,1)){onComplete();return;}
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><div class="tactic-confirm-layout"><img class="modal-card-image" src="${unit.card}" alt="Unit Card ${unit.name}"><div><span class="eyebrow">CRITICAL // AFTER DASH</span><h2>240mm Low-Recoil Cannon</h2><p>ช่วยเหลือ Garrison ฝ่ายเดียวกันใน Range 1 โดยใช้ Timeline 0 หรือข้ามเอฟเฟกต์นี้</p><div class="modal-actions"><button class="primary-btn" id="confirm-critical-rescue">Rescue</button><button class="action-btn" id="skip-critical-rescue">ข้าม</button></div></div></div></div>`;
    modal.classList.add("show");
    modal.querySelector("#confirm-critical-rescue").addEventListener("click",()=>{closeModal();rescueGarrison(unit,1,false,null,onComplete);});
    modal.querySelector("#skip-critical-rescue").addEventListener("click",()=>{closeModal();renderAll();onComplete();});
  }

  function pushAway(source,target,steps) {
    for (let i=0;i<steps;i++) {
      const candidates=E.neighbors(target.q,target.r).map(([q,r])=>({q,r,d:E.distance(source,{q,r})})).sort((a,b)=>b.d-a.d);
      const next=candidates.find(x=>!E.unitAt(state,x.q,x.r)&&E.elevationAt(state,x.q,x.r)<=E.elevationAt(state,target.q,target.r));
      if (!next) { E.applyDamage(target,1); addLog(`${target.name} ชนสิ่งกีดขวางและรับ Damage 1`); break; }
      target.q=next.q;target.r=next.r;E.pickupAt(state,target);
    }
  }

  function availablePostCombat(unit,role) {
    if (unit.zone!=="board"||state.activation.tacticUsed[unit.team]) return [];
    const ids=role==="attacker"?(unit.team==="zeon"?["exploited-chaos"]:[]):(unit.team==="fed"?["return-fire"]:["shattered-formation"]);
    return ids.map(getTactic).filter(card=>inHand(unit.team,card.id)&&!isUsed(card.id));
  }

  function openPostCombatResponses(windows,attacker,defender,index=0,onComplete=()=>{}) {
    const next=windows.slice(index).findIndex(responseWindow=>responseWindow.cards.length);
    if(next<0){onComplete();return;}
    const actualIndex=index+next; const responseWindow=windows[actualIndex];
    const continueQueue=()=>openPostCombatResponses(windows,attacker,defender,actualIndex+1,onComplete);
    const respondingUnit=responseWindow.role==="defender"?defender:attacker;
    if(respondingUnit.zone!=="board")return continueQueue();
    openResponse(responseWindow.cards,card=>resolvePostCombat(card,attacker,defender,responseWindow.role,continueQueue),continueQueue);
  }

  function resolvePostCombat(card,attacker,defender,role,done=()=>{}) {
    useResponse(card);
    if (card.id==="return-fire") {
      const weapons=defender.weapons.filter(w=>E.distance(defender,attacker)<=w.range&&(w.ignoreLos||E.hasLineOfSight(state,defender,attacker)));
      if (!weapons.length) {
        addLog("Return Fire: ไม่มีอาวุธที่โจมตีผู้โจมตีได้");closeModal();renderAll();done();return;
      }
      const modal=ensureModal();
      modal.innerHTML=`<div class="modal-card"><span class="eyebrow">RETURN FIRE // CHOOSE WEAPON</span><h2>${defender.name}</h2><p>เลือกอาวุธสำหรับการโจมตีกลับ ผู้โจมตีคือ ${attacker.name}</p><div class="modal-actions">${weapons.map(weapon=>`<button class="primary-btn" data-return-weapon="${weapon.id}">${weapon.name} · Range ${weapon.range} · TL ${Math.max(0,weapon.timeline-1)}</button>`).join("")}</div></div>`;
      modal.classList.add("show");
      modal.querySelectorAll("[data-return-weapon]").forEach(button=>button.addEventListener("click",()=>{
        const weapon=weapons.find(item=>item.id===button.dataset.returnWeapon);
        const result=E.rollAttack(state,defender,attacker,weapon);
        lastDice=result;closeModal();renderAll();
        showDiceRoll(result,`RETURN FIRE · ${weapon.name}`,()=>offerNewtypeReroll(defender,attacker,weapon,result,()=>{
          if(weapon.effect==="shieldBreak"&&attacker.upgrades.shield>0)attacker.upgrades.shield-=1;
          const applied=E.applyDamage(attacker,result.damage);
          if(result.criticals>0)applyCritical(defender,attacker,weapon,result);
          resolveSplashDamage(defender,attacker,weapon,result);
          defender.nextAt+=Math.max(0,weapon.timeline-1);
          addLog(`Return Fire ที่ยืนยันแล้ว: ${defender.name} ยิงกลับด้วย ${weapon.name} และทำ Damage ${applied.taken}`);
          E.defeatUnit(state,attacker,defender.team);
          renderAll();offerWeaponCriticalFollowUp(defender,weapon,result,done);
        }));
      }));
      return;
    } else if (card.id==="exploited-chaos") { attacker.energy+=1;attacker.upgrades.strength+=1;addLog(`${attacker.name} รับ Energy 1 และ Strength Upgrade 1`); }
    else if (card.id==="shattered-formation") { E.applyDamage(attacker,2);addLog(`Shattered Formation: ${attacker.name} รับ Damage 2`);E.defeatUnit(state,attacker,defender.team); }
    closeModal();renderAll();done();
  }

  function useUnitAbility(unit) {
    if (unit.energy<1||state.activation.commandUsed) return;
    const spend=()=>{unit.energy-=1;state.activation.commandUsed=true;};
    if (unit.id==="gundam") {
      const allies=state.units.filter(x=>x.team===unit.team&&x.zone==="board"&&E.distance(unit,x)<=3&&totalUpgrades(x)<=1);
      if (!allies.length) return addLog("White Base Unity: ไม่มีพันธมิตรในระยะ 3");
      mode={type:"select-unit",targets:new Set(allies.map(x=>E.key(x.q,x.r))),hint:"White Base Unity: เลือกพันธมิตรที่มี Upgrade ไม่เกิน 1 ชิ้น",callback:target=>chooseWhiteBaseUpgrade(target,spend)};
    } else if (unit.id==="guncannon") {
      selectEnemy(unit,3,"Critical Shot: เลือกศัตรู",target=>{spend();target.statuses.fracture=true;addLog(`${target.name} ติด Fracture`);});
    } else if (unit.id==="guntank") {
      spend(); const dice=Array.from({length:5},()=>Math.floor(Math.random()*10)+1); const crit=dice.filter(x=>x>=9).length; lastDice={dice,results:dice.map(x=>x>=9?"critical":"miss"),hits:0,criticals:crit,damage:crit,accuracy:0};
      renderAll();showDiceRoll(lastDice,"SATURATED FIRE",()=>{E.livingEnemies(state,unit).filter(x=>E.distance(unit,x)<=4).forEach(x=>{E.applyDamage(x,crit);E.defeatUnit(state,x,unit.team);});addLog(`Saturated Fire: ${crit} Critical — ศัตรูในระยะ 4 รับ Damage ${crit}`);renderAll();});return;
    } else if (unit.id==="chars-zaku") { spend(); beginAttack(unit.weapons[0],{free:true}); }
    else if (unit.id==="zaku-line") {
      const damagedEnemies=E.livingEnemies(state,unit).filter(enemy=>enemy.hp<enemy.maxHp);
      if(!damagedEnemies.length)return addLog("Zeon Zealotry: ไม่มี Unit ศัตรูที่มี Damage");
      startMove(5,0,"Zeon Zealotry",()=>{spend();afterUnitMove(unit,"ability");},{ignoreElevation:true,allowStay:false,destinationFilter:hex=>damagedEnemies.some(enemy=>E.distance(hex,enemy)<E.distance(unit,enemy))});
    }
    else if (unit.id==="zaku-enforcer") {
      const objective=adjacentObjective(unit); if (!objective) return addLog("Domination: ไม่มี Objective ในช่องติดกัน"); spend();objective.owner=unit.team;addLog("Domination: Zeon ยึด Objective");
    }
    renderAll();
  }

  function selectEnemy(unit,range,hint,callback,filter=()=>true,options={}) {
    const targets=E.livingEnemies(state,unit).filter(x=>E.distance(unit,x)<=range&&(options.ignoreLos||E.hasLineOfSight(state,unit,x))&&filter(x));
    if (!targets.length) { addLog(`${hint}: ไม่มีเป้าหมายถูกกติกา`); renderAll(); return false; }
    mode={type:"select-unit",targets:new Set(targets.map(x=>E.key(x.q,x.r))),returnMenu:"main",hint,callback,onCancel:options.onCancel};menuOpen=true;renderAll();return true;
  }

  function chooseWhiteBaseUpgrade(target,onChoose) {
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><span class="eyebrow">WHITE BASE UNITY</span><h2>เลือก Upgrade ให้ ${target.name}</h2><div class="modal-actions">${["shield","speed","strength"].map(type=>`<button class="primary-btn" data-white-base-upgrade="${type}">${type.toUpperCase()}</button>`).join("")}<button class="action-btn" id="cancel-white-base">ยกเลิก</button></div></div>`;
    modal.classList.add("show");
    modal.querySelectorAll("[data-white-base-upgrade]").forEach(button=>button.addEventListener("click",()=>{onChoose();target.upgrades[button.dataset.whiteBaseUpgrade]+=1;addLog(`White Base Unity: ${target.name} ได้รับ ${button.dataset.whiteBaseUpgrade.toUpperCase()} Upgrade 1`);closeModal();renderAll();}));
    modal.querySelector("#cancel-white-base").addEventListener("click",closeModal);
  }

  function selectAlly(unit,range,hint,callback,filter=()=>true,options={}) {
    const targets=state.units.filter(target=>target.team===unit.team&&target.zone==="board"&&E.distance(unit,target)<=range&&filter(target));
    if(!targets.length){addLog(`${hint}: ไม่มีเป้าหมายถูกกติกา`);renderAll();return false;}
    mode={type:"select-unit",targets:new Set(targets.map(target=>E.key(target.q,target.r))),returnMenu:"main",hint,callback,onCancel:options.onCancel};menuOpen=true;renderAll();return true;
  }

  function offerRescueMechanics(unit,onComplete=()=>{}) {
    const damagedAllies=state.units.filter(target=>target.team===unit.team&&target.zone==="board"&&target.hp<target.maxHp);
    if(unit.id!=="zaku-line"||!damagedAllies.length){onComplete();return;}
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><div class="tactic-confirm-layout"><img class="modal-card-image" src="${unit.card}" alt="Unit Card ${unit.name}"><div><span class="eyebrow">UNIT RESPONSE // AFTER RESCUE</span><h2>Rescue the Mechanics</h2><p>${unit.response.text}</p><div class="modal-actions"><button class="primary-btn" id="confirm-rescue-mechanics">ใช้ Response</button><button class="action-btn" id="skip-rescue-mechanics">ไม่ใช้ Response <span>SKIP</span></button></div></div></div></div>`;
    modal.classList.add("show");
    modal.querySelector("#confirm-rescue-mechanics").addEventListener("click",()=>{
      closeModal();
      selectAlly(unit,Infinity,"Rescue the Mechanics: เลือก Unit ฝ่ายเรา 1 ตัว",ally=>{
        const repaired=Math.min(2,ally.maxHp-ally.hp);
        ally.hp+=repaired;
        addLog(`Rescue the Mechanics: ${ally.name} ซ่อมแซม Damage ${repaired}`);
        renderAll();
        onComplete();
      },target=>target.hp<target.maxHp,{onCancel:()=>offerRescueMechanics(unit,onComplete)});
    });
    modal.querySelector("#skip-rescue-mechanics").addEventListener("click",()=>{closeModal();renderAll();onComplete();});
  }

  function rescueGarrison(unit,range,useAction,onSuccess=null,onComplete=()=>{}) {
    const targets=state.garrisons.filter(g=>g.team===unit.team&&E.distance(unit,g)<=range).sort((a,b)=>E.distance(unit,a)-E.distance(unit,b));
    if (!targets.length) { addLog("ไม่มีกองรักษาการณ์ฝ่ายเดียวกันในระยะ Rescue");renderAll();return false; }
    const commit=target=>{
      state.garrisons=state.garrisons.filter(g=>g.id!==target.id);state.vp[unit.team]+=D.rules.rescue.vp;unit.rescuedGarrisons=(unit.rescuedGarrisons||0)+1;
      if(useAction){state.activation.actionUsed=true;payTimeline(unit,D.rules.rescue.timeline);}
      if(onSuccess)onSuccess();
      addLog(`${unit.name} Rescue Garrison สำเร็จ — +${D.rules.rescue.vp} VP`);
      const responseId=unit.team==="fed"?"shield-recovery":"logistics-relay";
      const continueResponses=()=>offerRescueMechanics(unit,onComplete);
      if(inHand(unit.team,responseId)&&!isUsed(responseId)&&!state.activation.tacticUsed[unit.team])openResponse([getTactic(responseId)],card=>{useResponse(card);if(card.id==="shield-recovery")unit.upgrades.shield+=1;else unit.upgrades.speed+=1;closeModal();renderAll();continueResponses();},continueResponses);
      else continueResponses();
      renderAll();
    };
    if(targets.length===1){commit(targets[0]);return true;}
    mode={type:"select-garrison",targets:new Set(targets.map(target=>E.key(target.q,target.r))),returnMenu:"main",hint:`Rescue: เลือก Garrison ฝ่ายเดียวกันภายใน Range ${range}`,callback:commit,onCancel:onComplete};menuOpen=true;renderAll();return true;
  }

  function handleTactic(id) {
    const card=getTactic(id); if (!card) return;
    if(!inHand(card.team,id)) return;
    const unit=activeUnit();
    const legal=!isUsed(id)&&card.timing==="COMMAND"&&!state.activation.tacticUsed[card.team]&&!mode;
    const issue=isUsed(id)?"การ์ดใบนี้ถูกใช้แล้ว":card.timing!=="COMMAND"?"Response ใช้ได้เฉพาะเมื่อ Trigger เกิดขึ้น":state.activation.tacticUsed[card.team]?"ฝ่ายนี้ใช้ Tactic ใน Activation นี้แล้ว":mode?"ยกเลิกการเลือกเป้าหมายปัจจุบันก่อน":commandTacticIssue(card,unit);
    showCard(card,issue||"ตรวจความสามารถแล้วกด Confirm เพื่อใช้การ์ด",legal&&!issue?()=>useCommandTactic(card):null);
  }

  function commandTacticIssue(card,unit) {
    if(!unit||unit.team!==card.team)return "ใช้ได้เฉพาะ Activation ของฝ่ายเจ้าของการ์ด";
    if(card.id==="entrenched-position"&&unit.id!=="guntank")return "ใช้ได้เมื่อ Guntank กำลังทำงาน";
    if(card.id==="forward-artillery"&&unit.id!=="guncannon")return "ใช้ได้เมื่อ Guncannon กำลังทำงาน";
    if(card.id==="last-shot-counts"&&unit.id!=="gundam")return "ใช้ได้เมื่อ Gundam กำลังทำงาน";
    if(card.id==="rescued-extraction"&&unit.id!=="zaku-line")return "ใช้ได้เมื่อ Zaku II: Line Breaker กำลังทำงาน";
    if(card.id==="rescued-extraction"&&!hasOwnGarrisonInRange(unit,3))return "ไม่มี Garrison ฝ่ายเดียวกันใน Range 3";
    if(card.id==="crimson-execution"&&unit.id!=="chars-zaku")return "ใช้ได้เมื่อ Char’s Zaku II กำลังทำงาน";
    if(card.id==="lock-down"&&!E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3))return "ไม่มี Unit ศัตรูใน Range 3";
    if(card.id==="breaking-line"&&!E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3))return "ไม่มี Unit ศัตรูใน Range 3";
    return "";
  }

  function markCommand(card) { state.usedTactics.add(card.id);state.activation.tacticUsed[card.team]=true;addLog(`ใช้ Tactic: ${card.name}`); }
  function useResponse(card) { state.usedTactics.add(card.id);state.activation.tacticUsed[card.team]=true;state.responseUsed[card.team]=true;addLog(`Response: ${card.name}`); }

  function useCommandTactic(card) {
    const unit=activeUnit();
    if (card.id==="built-to-last") { markCommand(card);const repair=totalUpgrades(unit);unit.hp=Math.min(unit.maxHp,unit.hp+repair);addLog(`${unit.name} ซ่อม HP ${repair}`); }
    else if (card.id==="entrenched-position") { if(unit.id!=="guntank")return showCard(card,"ใช้ได้เมื่อ Guntank กำลังทำงาน");markCommand(card);unit.upgrades.shield+=1;const o=adjacentObjective(unit);if(o){o.owner=unit.team;addLog("Entrenched Position: Federation ยึด Objective");} }
    else if (card.id==="forward-artillery") { if(unit.id!=="guncannon")return showCard(card,"ใช้ได้เมื่อ Guncannon กำลังทำงาน");markCommand(card);unit.energy+=1;unit.tempStrength+=unit.rescuedGarrisons||0;addLog(`Forward Artillery: Strength ชั่วคราว +${unit.rescuedGarrisons||0}`); }
    else if (card.id==="last-shot-counts") { if(unit.id!=="gundam")return showCard(card,"ใช้ได้เมื่อ Gundam กำลังทำงาน");markCommand(card);unit.upgrades.strength+=1;unit.nextAttackDiscount=1;unit.lastShotBonus=true; }
    else if (card.id==="rookies-momentum") { markCommand(card);unit.tempStrength+=2;unit.critBoost=true; }
    else if (card.id==="lock-down"||card.id==="breaking-line") {
      const valid=selectEnemy(unit,3,`${card.name}: เลือก Unit ศัตรู`,target=>chooseUpgradeToDestroy(card,target),()=>true,{ignoreLos:true});
      if(!valid)return;
    }
    else if (card.id==="rescued-extraction") { if(unit.id!=="zaku-line"||!hasOwnGarrisonInRange(unit,3))return showCard(card,"ต้องใช้โดย Zaku II: Line Breaker ที่มี Garrison ใน Range 3");rescueGarrison(unit,3,false,()=>{markCommand(card);unit.energy+=1;}); }
    else if (card.id==="drive-them-back") { startMove(2,0,"Drive Them Back",()=>{markCommand(card);selectEnemy(unit,1,"Drive Them Back: เลือกยูนิตศัตรูที่ติดกัน",enemy=>{pushAway(unit,enemy,1);E.applyDamage(enemy,1);E.defeatUnit(state,enemy,unit.team);addLog(`${enemy.name} ถูกผลักและรับ Damage 1`);});}); }
    else if (card.id==="sudden-pressure") {
      markCommand(card);
      const enemyUnits=E.livingEnemies(state,unit).filter(target=>E.distance(unit,target)<=3);
      const enemyGarrisons=state.garrisons.filter(target=>target.team!==unit.team&&E.distance(unit,target)<=3);
      enemyUnits.forEach(target=>{E.applyDamage(target,2);E.defeatUnit(state,target,unit.team);});
      enemyGarrisons.forEach(target=>{target.hp=Math.max(0,target.hp-2);if(target.hp===0){state.garrisons=state.garrisons.filter(item=>item.id!==target.id);state.vp[unit.team]+=1;}});
      addLog(`Sudden Pressure: ยูนิต ${enemyUnits.length} และ Garrison ${enemyGarrisons.length} เป้าหมายรับ Damage 2`);
    }
    else if (card.id==="crimson-execution") { if(unit.id!=="chars-zaku")return showCard(card,"ใช้ได้เมื่อ Char’s Zaku II กำลังทำงาน");startMove(D.rules.dash.distance+1,0,"Crimson Dash",()=>{markCommand(card);afterUnitMove(unit,"dash",()=>beginAttack(unit.weapons[0],{free:true}));}); }
    renderAll();
  }

  function chooseUpgradeToDestroy(card,target) {
    const choices=["shield","speed","strength"].filter(type=>target.upgrades[type]>0);
    const apply=type=>{markCommand(card);if(type)target.upgrades[type]-=1;const status=card.id==="lock-down"?"slow":"fracture";target.statuses[status]=true;addLog(`${target.name}${type?` เสีย ${type} Upgrade 1 และ`:""} ติด ${status==="slow"?"Slow":"Fracture"}`);closeModal();renderAll();};
    if(!choices.length){apply(null);return;}
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><button class="modal-close" aria-label="ปิด">×</button><span class="eyebrow">${card.name.toUpperCase()}</span><h2>เลือก Upgrade ที่จะทำลาย</h2><p>${target.name} — การทำลาย Upgrade เป็นตัวเลือก แต่ Status จะเกิดขึ้นเสมอ</p><div class="modal-actions">${choices.map(type=>`<button class="primary-btn" data-upgrade-choice="${type}">${type.toUpperCase()} · ${target.upgrades[type]}</button>`).join("")}<button class="action-btn" id="skip-upgrade-destroy">ไม่ทำลาย Upgrade</button></div></div>`;
    modal.classList.add("show");modal.querySelector(".modal-close").addEventListener("click",closeModal);modal.querySelectorAll("[data-upgrade-choice]").forEach(button=>button.addEventListener("click",()=>apply(button.dataset.upgradeChoice)));modal.querySelector("#skip-upgrade-destroy").addEventListener("click",()=>apply(null));
  }

  function openResponse(cards,onPlay,onSkip=closeModal) {
    const modal=ensureModal();
    let selected=cards[0];
    const render=()=>{
      modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><span class="eyebrow">RESPONSE WINDOW // ${teamName(selected.team)}</span><h2>ตรวจการ์ดก่อนยืนยัน</h2>${cards.length>1?`<div class="response-picker">${cards.map(card=>`<button class="${card.id===selected.id?"selected":""}" data-response-preview="${card.id}">${card.name}</button>`).join("")}</div>`:""}<div class="tactic-confirm-layout"><img class="modal-card-image" src="${selected.card}" alt="${selected.name}"><div><h3>${selected.name}</h3><p>${selected.text}</p><div class="modal-actions"><button class="primary-btn" id="confirm-response">Confirm ใช้ Response</button><button class="action-btn" id="skip-response">ไม่ใช้ Response <span>SKIP</span></button></div></div></div></div>`;
      modal.classList.add("show");
      modal.querySelectorAll("[data-response-preview]").forEach(btn=>btn.addEventListener("click",()=>{selected=getTactic(btn.dataset.responsePreview);render();}));
      modal.querySelector("#confirm-response").addEventListener("click",()=>onPlay(selected));
      modal.querySelector("#skip-response").addEventListener("click",()=>{closeModal();onSkip();});
    };
    render();
  }

  function ensureModal() {
    let modal=$("#game-modal"); if(!modal){modal=document.createElement("div");modal.id="game-modal";modal.className="overlay";document.body.appendChild(modal);}return modal;
  }
  function closeModal(){const m=$("#game-modal");if(m)m.classList.remove("show");}

  function showCard(card,note="",onConfirm=null) {
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><button class="modal-close" aria-label="ปิด">×</button><div class="tactic-confirm-layout"><img class="modal-card-image" src="${card.card}" alt="${card.name}"><div><span class="eyebrow">${card.timing}${card.trigger?` // ${card.trigger}`:""}</span><h2>${card.name}</h2><p>${card.text}</p>${note?`<p class="chip ${onConfirm?"good":"bad"}">${note}</p>`:""}<div class="modal-actions">${onConfirm?`<button class="primary-btn" id="confirm-tactic">Confirm ใช้การ์ด</button>`:""}<button class="action-btn" id="close-tactic">กลับ</button></div></div></div></div>`;
    modal.classList.add("show");modal.querySelector(".modal-close").addEventListener("click",closeModal);modal.querySelector("#close-tactic").addEventListener("click",closeModal);
    if(onConfirm)modal.querySelector("#confirm-tactic").addEventListener("click",()=>{closeModal();onConfirm();});
  }

  function showUnitCard(unit) {
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card unit-card-modal"><button class="modal-close" aria-label="ปิด">×</button><img class="modal-card-image unit-sheet" src="${unit.card}" alt="Unit Card ${unit.name}"><div class="unit-card-summary"><span class="eyebrow">${unit.model} // ${unit.role}</span><h2>${unit.name}${unit.weaponBadge?` · ${unit.weaponBadge}`:""}</h2><p>${unit.command.name}: ${unit.command.text}</p>${unit.ongoing?`<p>${unit.ongoing.name}: ${unit.ongoing.text}</p>`:""}${unit.response?`<p>${unit.response.name}: ${unit.response.text}</p>`:""}</div></div>`;
    modal.classList.add("show");modal.querySelector(".modal-close").addEventListener("click",closeModal);
  }

  function showRules() {
    const modal=ensureModal();modal.innerHTML=`<div class="modal-card"><button class="modal-close" aria-label="ปิด">×</button><span class="eyebrow">CORE FLOW // V1</span><h2>กติกาย่อ</h2><ul class="rules-list"><li>ทุก Unit เริ่มใน Reserve; เมื่อ Timeline มาถึงจึง Deploy บน Base และต้อง Advance ออกจาก Base</li><li>Advance เดินได้สูงสุด 3 ช่องและเสีย Timeline 1; Dash เดินได้สูงสุด 2 ช่องและเสีย Timeline 2 — เฉพาะ Char’s Zaku II Dash ได้เพิ่ม 1 ช่องจาก Three Times Faster</li><li>Speed เพิ่มระยะเฉพาะ Advance; การขึ้นที่สูงใช้ระยะเพิ่ม 1 ต่อระดับ ส่วนการลงที่ต่ำไม่เพิ่มค่าใช้จ่าย</li><li>คลิกหัว Unit ที่กำลังทำงานเพื่อเปิด Command จากนั้นใช้ Advance ได้ 1 ครั้งและ Primary Action 1 ครั้ง</li><li>Timeline มีช่อง 1–10 ต่อ Phase และค่า Timeline ของ Action จะเลื่อนไอคอนไปยังช่องที่จะ Activate ครั้งถัดไป</li><li>แต่ละฝ่ายสุ่ม Tactic 3 จากสำรับ 9 ใบใน Phase 1 และจั่วอีก 3 ใบจากสำรับเดิมใน Phase 2; ผู้เล่นแต่ละฝ่ายใช้ Tactic ได้สูงสุด 1 ใบต่อ Activation</li><li>กด Tactic เพื่อดูการ์ดและข้อความก่อน แล้วจึงกด Confirm; ไม่มีการโจมตีสวนกลับอัตโนมัติ ยกเว้นยืนยันใช้ Return Fire</li><li>ช่องสีฟ้าคือช่องเดินที่ตรวจระยะและความสูงแล้ว; ช่องสีแดงคือเป้าหมายที่อยู่ใน Range และ Line of Sight</li><li>d10: 4–8 = Hit, 9–10 = Critical; ยิงจากที่สูงได้ Accuracy +1 และยิงขึ้นที่สูงได้ -1</li><li>Shield ป้องกัน Damage ชิ้นละ 1, Strength เพิ่มลูกเต๋า, Speed เพิ่มระยะ Advance</li><li>เมื่อจบ Activation บนหรือติดกับ Objective จะ Contest: ฝ่ายเราต้องมี Unit ในระยะ 1 มากกว่า; จุดกลางจะถูกยึด ส่วนจุดศัตรูจะกลับเป็นกลางก่อนและต้อง Contest ชนะอีกครั้งจึงยึดได้</li><li>Garrison มี HP 1; Objective ที่ครอบครองให้ 1 VP เมื่อจบแต่ละ Phase; ทำลาย Unit ได้ VP ตามการ์ด และ Rescue Garrison ได้ 2 VP</li></ul><p>พิกัด Feature และชั้นความสูงอ้างอิงภาพ Sleeping Leviathan ที่อัปโหลด; การ์ดทั้ง 24 ใบใช้ภาพจริงจาก PDF</p></div>`;modal.classList.add("show");modal.querySelector(".modal-close").addEventListener("click",closeModal);
  }

  function showResult() {
    const modal=ensureModal();const title=state.winner==="draw"?"DRAW":`${teamName(state.winner)} WINS`;
    modal.innerHTML=`<div class="modal-card"><span class="eyebrow">MISSION COMPLETE</span><h2>${title}</h2><div class="result-grid"><div>E.F.S.F.<b>${state.vp.fed}</b>VP</div><div>ZEON<b>${state.vp.zeon}</b>VP</div></div><button class="primary-btn" id="play-again">เล่นใหม่</button></div>`;modal.classList.add("show");modal.querySelector("#play-again").addEventListener("click",()=>{closeModal();resetGame();});
  }

  $("#restart-btn").addEventListener("click",()=>{if(confirm("เริ่มเกมใหม่และล้างสถานะปัจจุบัน?"))resetGame();});
  $("#rules-btn")?.addEventListener("click",showRules);
  $("#log-toggle").addEventListener("click",()=>{
    const feed=$("#combat-feed");
    const button=$("#log-toggle");
    const open=!feed.classList.contains("open");
    feed.classList.toggle("open",open);
    button.setAttribute("aria-expanded",String(open));
  });
  document.addEventListener("pointerdown",event=>{
    if(!menuOpen||mode)return;
    const menu=$("#command-menu");
    if(menu?.contains(event.target)||event.target.closest?.(".unit-node.active"))return;
    menuOpen=false;
    menuView="main";
    renderActions();
  });
  document.addEventListener("keydown",event=>{
    if(event.key!=="Escape")return;
    closeModal();mode=null;menuOpen=false;menuView="main";renderAll();
  });
  resetGame();
})();

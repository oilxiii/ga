(function () {
  "use strict";
  const D = window.GA_DATA;
  const E = window.GA_ENGINE;
  const A = window.GA_AI;
  const $ = selector => document.querySelector(selector);
  let state;
  let mode = null;
  let pendingAttack = null;
  let lastDice = null;
  let menuOpen = false;
  let menuView = "main";
  let menuPlacement = "right";
  let diceAnimationTimer = null;
  let diceRollInterval = null;
  let activationResumeTimer = null;
  let transitionBusy = false;
  let gameEpoch = 0;
  let matchMode = "hotseat";
  let humanTeam = null;
  let aiTeam = null;
  let matchFactions = { fed:"fed", zeon:"zeon" };
  let selectedScenarioId = D.map?.id || "sleeping-leviathan";
  let aiThinkingTimer = null;
  let aiBusy = false;
  let aiPerforming = false;
  let aiPreferredTargetKey = null;
  let aiResponsePending = false;
  let aiEffectPending = false;
  let attackTargetingBusy = false;
  let targetingFxTimer = null;
  let targetingFxFrame = null;
  let targetingFxFailsafeTimer = null;
  let targetingFxGroup = null;
  let targetingFxCompletion = null;
  let movementDraft = null;
  let responseModalRestoreFocus = null;
  let soundMuted = false;
  let losInspection = { enabled:false };
  const AI_PACE = Object.freeze({ firstTurn: 1450, turnStart: 1200, target: 650, poll: 900, between: 620, finish: 820 });
  const AI_WATCHDOG_ATTEMPTS = 12;

  function activeUnit() { return state.units.find(unit => unit.id === state.activeUnitId); }
  function commandUsageMap() {
    const activation=state?.activation;
    if(!activation)return {};
    if(!activation.commandUsed||typeof activation.commandUsed!=="object"||Array.isArray(activation.commandUsed))activation.commandUsed={};
    return activation.commandUsed;
  }
  function commandAbilityUsed(ability) { return !!(ability?.id&&commandUsageMap()[ability.id]); }
  function hasPendingAttackOpportunity(unit) {
    if(!state?.activation?.actionUsed)return true;
    // Checkmate can still matter after the Primary Action if Red Comet can still
    // make Crimson Execution's free Heat Hawk attack in this activation.
    if(unit?.id==="red-comet-zaku"){
      const owner=unit.team;
      const crimsonReady=state.hands?.[owner]?.includes("crimson-execution")&&!state.usedTactics?.has(`${owner}:crimson-execution`)&&!state.activation.tacticUsed?.[owner];
      if(crimsonReady)return true;
    }
    return false;
  }
  function attackPrepCommandExpired(unit,ability) {
    return ["full-power","checkmate","mazin-power","machu-kira-kira","nyaan-focus"].includes(ability?.id)&&!hasPendingAttackOpportunity(unit);
  }
  function canUseCommandAbility(unit,ability) { return !!ability&&!commandAbilityUsed(ability)&&unit.energy>=Math.max(0,ability.energy||0)&&!attackPrepCommandExpired(unit,ability); }
  function markCommandAbilityUsed(ability) { if(ability?.id)commandUsageMap()[ability.id]=true; }
  function factionForSide(team) { return state?.factions?.[team] || matchFactions[team] || team; }
  function teamMeta(team) { return D.teams[factionForSide(team)] || D.teams[team]; }
  function teamName(team) { return teamMeta(team).name; }
  const SIDE_COLORS = Object.freeze({ blue:"#36b7ff", red:"#ff405a" });
  function sidePalette(team) { return E.matchSidePalette(state?.factions||matchFactions,team); }
  function sideColor(team) { return SIDE_COLORS[sidePalette(team)]; }
  function addLog(message) { state.log.unshift(message); state.log = state.log.slice(0, 14); }
  function totalUpgrades(unit) { return Object.values(unit.upgrades).reduce((a,b) => a+b, 0); }
  function getTactic(id,ownerTeam=null) {
    const card=D.tactics.find(item => item.id === id);
    return card&&ownerTeam?{...card,ownerTeam}:card;
  }
  function tacticOwner(card,fallback=null) { return card?.ownerTeam||fallback||activeUnit()?.team; }
  function factionHasTactic(side,id) { return (D.tacticDecks?.[factionForSide(side)]||[]).includes(id); }
  function isUsed(id,team=null) { return team ? state.usedTactics.has(`${team}:${id}`) : ["fed","zeon"].some(side=>state.usedTactics.has(`${side}:${id}`)); }
  function inHand(team,id) { return state.hands?.[team]?.includes(id); }
  function assetPath(path) { return window.GA_ASSETS?.[path] || path; }
  function isAiTeam(team) { return matchMode === "ai" && team === aiTeam; }
  function isAiTurn() { return !!state?.activeUnitId && isAiTeam(activeUnit()?.team); }
  function modeUnit() { return mode?.unitId ? state?.units?.find(unit=>unit.id===mode.unitId) : activeUnit(); }
  function weaponRange(weapon) { return Number.isFinite(weapon?.range)?weapon.range:weapon?.aoe?3:0; }
  function dashBonus(unit) { return Math.max(0, Number(unit?.dashBonus)||(["chars-zaku","red-comet-zaku"].includes(unit?.id)?1:0)); }
  function usesSpecialAoeLine(weapon){return ["twinBuster","warEdge","godDrill","breastFire"].includes(weapon?.aoe);}
  function inspectionWeaponsFor(unit){
    const tacticWeapons=(state?.hands?.[unit?.team]||[]).map(id=>getTactic(id,unit.team)).filter(card=>card?.timing==="ATTACK"&&(!card.unitOnly||card.unitOnly===unit.id)).map(card=>card.weapon);
    return [...(unit?.weapons||[]),...tacticWeapons];
  }
  function visualRandom() {
    if(globalThis.crypto?.getRandomValues){const value=new Uint32Array(1);globalThis.crypto.getRandomValues(value);return value[0]/4294967296;}
    visualRandom.seed=(Math.imul(1664525,visualRandom.seed||0x51f15e5d)+1013904223)>>>0;
    return visualRandom.seed/4294967296;
  }


  const SFX = (() => {
    let ctx = null;
    let master = null;

    function ensure() {
      if (ctx) return ctx;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = soundMuted ? 0 : 0.28;
      master.connect(ctx.destination);
      return ctx;
    }

    function unlock() {
      const audio = ensure();
      if (audio?.state === "suspended") audio.resume().catch(()=>{});
      return audio;
    }

    function tone({type="sine",from=440,to=220,duration=.12,gain=.12,delay=0}) {
      const audio=unlock(); if(!audio||!master)return;
      const start=audio.currentTime+delay;
      const osc=audio.createOscillator();
      const amp=audio.createGain();
      osc.type=type;
      osc.frequency.setValueAtTime(Math.max(20,from),start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),start+duration);
      amp.gain.setValueAtTime(.0001,start);
      amp.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),start+.008);
      amp.gain.exponentialRampToValueAtTime(.0001,start+duration);
      osc.connect(amp);amp.connect(master);
      osc.start(start);osc.stop(start+duration+.02);
    }

    function noise({duration=.14,gain=.12,cutoff=1400,delay=0}) {
      const audio=unlock(); if(!audio||!master)return;
      const sampleRate=audio.sampleRate;
      const buffer=audio.createBuffer(1,Math.max(1,Math.floor(sampleRate*duration)),sampleRate);
      const data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++) data[i]=(visualRandom()*2-1)*(1-i/data.length);
      const source=audio.createBufferSource();source.buffer=buffer;
      const filter=audio.createBiquadFilter();filter.type="lowpass";filter.frequency.value=cutoff;
      const amp=audio.createGain();const start=audio.currentTime+delay;
      amp.gain.setValueAtTime(gain,start);amp.gain.exponentialRampToValueAtTime(.0001,start+duration);
      source.connect(filter);filter.connect(amp);amp.connect(master);
      source.start(start);source.stop(start+duration+.02);
    }

    function shot() {
      tone({type:"sawtooth",from:920,to:170,duration:.11,gain:.075});
      noise({duration:.07,gain:.045,cutoff:3200});
    }
    function hit() {
      noise({duration:.12,gain:.14,cutoff:1100});
      tone({type:"triangle",from:150,to:68,duration:.13,gain:.10});
    }
    function explosion() {
      noise({duration:.52,gain:.24,cutoff:760});
      noise({duration:.22,gain:.12,cutoff:2200,delay:.025});
      tone({type:"sine",from:105,to:35,duration:.48,gain:.18});
    }
    function capture() {
      tone({type:"sine",from:330,to:660,duration:.18,gain:.09});
      tone({type:"sine",from:440,to:880,duration:.22,gain:.08,delay:.11});
      tone({type:"triangle",from:660,to:990,duration:.28,gain:.065,delay:.22});
      noise({duration:.18,gain:.025,cutoff:4200,delay:.08});
    }
    function upgrade() {
      tone({type:"triangle",from:420,to:700,duration:.12,gain:.075});
      tone({type:"sine",from:620,to:980,duration:.16,gain:.07,delay:.09});
      tone({type:"sine",from:880,to:1320,duration:.18,gain:.05,delay:.17});
    }
    function debuff() {
      tone({type:"sawtooth",from:360,to:120,duration:.2,gain:.07});
      tone({type:"square",from:190,to:72,duration:.18,gain:.035,delay:.05});
      noise({duration:.16,gain:.045,cutoff:900,delay:.02});
    }
    function dash() {
      // Short thruster burst: airy ignition + rising engine whine.
      noise({duration:.22,gain:.095,cutoff:2400});
      tone({type:"sawtooth",from:95,to:310,duration:.2,gain:.06});
      tone({type:"triangle",from:210,to:520,duration:.14,gain:.035,delay:.055});
    }
    function objectiveScore() {
      tone({type:"sine",from:520,to:780,duration:.16,gain:.075});
      tone({type:"triangle",from:780,to:1040,duration:.2,gain:.06,delay:.10});
      noise({duration:.10,gain:.018,cutoff:3600,delay:.03});
    }
    function phaseShift() {
      tone({type:"triangle",from:220,to:440,duration:.22,gain:.055});
      tone({type:"sine",from:440,to:880,duration:.32,gain:.06,delay:.14});
    }
    function menuConfirm() {
      tone({type:"square",from:520,to:760,duration:.075,gain:.045});
      tone({type:"triangle",from:760,to:1120,duration:.11,gain:.05,delay:.055});
    }
    function menuDenied() {
      tone({type:"square",from:220,to:150,duration:.09,gain:.035});
      tone({type:"square",from:170,to:120,duration:.11,gain:.028,delay:.07});
    }
    function setMuted(muted) {
      soundMuted=!!muted;
      if(master)master.gain.value=soundMuted?0:0.28;
    }
    return { unlock, setMuted, shot, hit, explosion, capture, upgrade, debuff, dash, objectiveScore, phaseShift, menuConfirm, menuDenied };
  })();

  const BGM = (() => {
    const sources = {
      song1: "assets/audio/battle-bgm.mp3",
      song2: "assets/audio/title-bgm.mp3",
      getter: "assets/audio/getter-robo-bgm.mp3",
      beyond: "assets/audio/beyond-the-time-bgm.mp3",
      secret: "assets/audio/secret-mazinger-z-bgm.mp3"
    };
    const tracks = new Map();
    let selection = "song1";

    function ensure(key=selection) {
      if (!sources[key]) return null;
      if (tracks.has(key)) return tracks.get(key);
      const audio = new Audio(sources[key]);
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.05;
      audio.muted = soundMuted;
      audio.setAttribute("playsinline", "");
      tracks.set(key,audio);
      return audio;
    }
    function pauseOthers(except=null) {
      tracks.forEach((track,key)=>{
        if(key===except)return;
        track.pause();
      });
    }
    function start() {
      if(selection==="off" || soundMuted)return;
      const track=ensure(selection);
      if(!track)return;
      pauseOthers(selection);
      const promise=track.play();
      if(promise?.catch)promise.catch(()=>{});
    }
    function stop() {
      tracks.forEach(track=>{
        track.pause();
        track.currentTime=0;
      });
    }
    function select(next) {
      selection=sources[next]?next:"off";
      pauseOthers(selection);
      if(selection==="off")return;
      const track=ensure(selection);
      if(track)track.muted=soundMuted;
      start();
    }
    function setMuted(muted) {
      tracks.forEach(track=>{track.muted=!!muted;});
      if(!muted)start();
    }
    function getSelection(){ return selection; }
    return { start, stop, select, setMuted, getSelection };
  })();

  const TitleBGM = (() => {
    let audio = null;
    function ensure() {
      if (audio) return audio;
      audio = new Audio("assets/audio/title-bgm.mp3");
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.12;
      audio.muted = soundMuted;
      audio.setAttribute("playsinline", "");
      return audio;
    }
    function start() {
      const track=ensure();
      if(!track.paused)return;
      const promise=track.play();
      if(promise?.catch)promise.catch(()=>{});
    }
    function stop() {
      if(!audio)return;
      audio.pause();
      audio.currentTime=0;
    }
    function setMuted(muted) { ensure().muted=!!muted; }
    return { start, stop, setMuted };
  })();

  function buildTitleStars() {
    const field=$("#title-stars");
    if(!field||field.childElementCount)return;
    const stars=[
      [8,7,.9,.1],[20,13,.65,.7],[34,5,.75,1.2],[52,11,1,.3],[71,7,.7,1.6],[88,14,.85,.9],
      [13,23,.7,1.4],[29,26,.95,.2],[61,22,.7,1.1],[82,27,1,.5],[94,34,.65,1.8],
      [7,41,.75,.9],[21,48,1,.15],[76,44,.8,1.35],[91,52,.7,.45],
      [12,58,.7,1.7],[86,61,.95,.25],[6,73,.75,.6],[18,80,.9,1.25],[78,77,.7,.1],[94,84,.85,1.5]
    ];
    stars.forEach(([x,y,scale,delay],index)=>{
      const star=document.createElement("i");
      star.className=`title-star ${index%5===0?"cross":""}`;
      star.style.setProperty("--x",`${x}%`);
      star.style.setProperty("--y",`${y}%`);
      star.style.setProperty("--scale",scale);
      star.style.setProperty("--delay",`${delay}s`);
      field.appendChild(star);
    });
  }

  function initTitle() {
    const screen=$("#title-screen");
    if(!screen){resetGame();return;}
    buildTitleStars();
    const notice=$("#title-notice");
    const one=$("#title-one-player");
    const two=$("#title-two-player");
    const factionSelect=$("#faction-select");
    const scenarioSelect=$("#scenario-select");
    const scenarioButtons=[...document.querySelectorAll("[data-scenario]")];
    const gameShell=$(".game-shell");
    const clearNotice=()=>{notice?.classList.remove("show","warning");};
    const resumeTitleMusic=()=>{
      if(screen.classList.contains("show")&&!screen.classList.contains("leaving"))TitleBGM.start();
    };
    document.addEventListener("pointerdown",resumeTitleMusic,true);
    document.addEventListener("keydown",resumeTitleMusic,true);
    TitleBGM.start();
    let selectingMode=null;
    let firstFaction=null;
    let pendingFactions=null;
    const selectTitle=$("#faction-select-title");
    const selectDescription=$("#faction-select-description");
    const selectEyebrow=$("#faction-select-eyebrow");
    const factionButtons=[...factionSelect.querySelectorAll("[data-faction]")];
    const secretToggle=$("#secret-team-toggle");
    const secretDrawer=$("#secret-team-drawer");
    const secretButtons=[...factionSelect.querySelectorAll("#secret-team-drawer [data-faction]")];
    const setSecretRevealed=(revealed,{focus=false}={})=>{
      factionSelect.classList.toggle("secret-revealed",revealed);
      secretToggle?.setAttribute("aria-expanded",revealed?"true":"false");
      secretToggle?.setAttribute("aria-label",revealed?"ซ่อน Secret / GQX":"เปิด Secret / GQX");
      if(secretToggle)secretToggle.textContent=revealed?"‹":"›";
      secretDrawer?.setAttribute("aria-hidden",revealed?"false":"true");
      secretButtons.forEach(button=>button.tabIndex=revealed?0:-1);
      if(focus&&revealed)secretButtons.find(button=>!button.disabled)?.focus();
    };
    secretToggle?.addEventListener("click",()=>{
      SFX.menuConfirm();
      const revealed=!factionSelect.classList.contains("secret-revealed");
      setSecretRevealed(revealed,{focus:revealed});
    });
    const showFactionStep=(nextMode,step=1)=>{
      selectingMode=nextMode;
      setSecretRevealed(false);
      factionSelect.classList.toggle("opponent-step",step===2);
      factionButtons.forEach(button=>{button.disabled=step===2&&button.dataset.faction===firstFaction;});
      selectEyebrow.textContent=nextMode==="ai"?(step===1?"1 PLAYER // YOUR TEAM":"1 PLAYER // AI OPPONENT"):(step===1?"2 PLAYER // PLAYER 1":"2 PLAYER // PLAYER 2");
      selectTitle.textContent=step===1?"เลือกทีมของคุณ":nextMode==="ai"?"เลือกทีมคู่ต่อสู้":"ผู้เล่น 2 เลือกทีม";
      selectDescription.textContent=nextMode==="ai"&&step===2?"AI จะใช้ทีมที่คุณเลือกและเล่นตามข้อมูลที่เปิดเผยเท่านั้น":nextMode==="ai"?"จากนั้นคุณจะเลือกทีมที่ต้องการต่อสู้ด้วย":"ผู้เล่นแต่ละฝ่ายเลือกทีมไม่ซ้ำกัน";
      factionSelect.classList.add("show");
      factionSelect.setAttribute("aria-hidden","false");
      factionButtons.find(button=>!button.disabled)?.focus();
    };
    const showScenarioStep=(nextMode,factions)=>{
      selectingMode=nextMode;
      pendingFactions={...factions};
      factionSelect?.classList.remove("show","opponent-step","secret-revealed");
      factionSelect?.setAttribute("aria-hidden","true");
      scenarioSelect?.classList.add("show");
      scenarioSelect?.setAttribute("aria-hidden","false");
      scenarioButtons[0]?.focus();
    };
    const launch=(nextMode,factions)=>{
      if(screen.classList.contains("leaving"))return;
      matchMode=nextMode;
      matchFactions={...factions};
      humanTeam=nextMode==="ai"?"fed":null;
      aiTeam=nextMode==="ai"?"zeon":null;
      factionSelect?.classList.remove("show","opponent-step","secret-revealed");
      factionSelect?.setAttribute("aria-hidden","true");
      one.inert=false;
      two.inert=false;
      document.removeEventListener("pointerdown",resumeTitleMusic,true);
      document.removeEventListener("keydown",resumeTitleMusic,true);
      TitleBGM.stop();
      SFX.unlock();
      SFX.menuConfirm();
      // Secret Team receives its dedicated theme only once when the match launches.
      // After this point the player's manual music/off choice is never overridden.
      if(Object.values(matchFactions).includes("secret"))BGM.select("secret");
      else BGM.start();
      screen.classList.add("leaving");
      document.body.classList.remove("title-active");
      setTimeout(()=>{
        screen.classList.remove("show","leaving");
        gameShell?.removeAttribute("inert");
        gameShell?.setAttribute("aria-hidden","false");
        resetGame();
        if(nextMode==="ai")gameShell?.focus();
      },460);
    };
    one?.addEventListener("click",()=>{
      SFX.unlock();
      SFX.menuConfirm();
      clearNotice();
      one.inert=true;
      two.inert=true;
      firstFaction=null;
      showFactionStep("ai",1);
    });
    factionButtons.forEach(button=>button.addEventListener("click",()=>{
      SFX.menuConfirm();
      const faction=button.dataset.faction;
      if(!firstFaction){firstFaction=faction;showFactionStep(selectingMode,2);return;}
      showScenarioStep(selectingMode,{fed:firstFaction,zeon:faction});
    }));
    scenarioButtons.forEach(button=>button.addEventListener("click",()=>{
      if(!pendingFactions)return;
      SFX.menuConfirm();
      selectedScenarioId=D.maps?.[button.dataset.scenario]?button.dataset.scenario:"sleeping-leviathan";
      D.map=D.maps?.[selectedScenarioId]||D.map;
      scenarioSelect?.classList.remove("show");
      scenarioSelect?.setAttribute("aria-hidden","true");
      launch(selectingMode,pendingFactions);
    }));
    $("#scenario-select-back")?.addEventListener("click",()=>{
      SFX.menuConfirm();
      scenarioSelect?.classList.remove("show");
      scenarioSelect?.setAttribute("aria-hidden","true");
      pendingFactions=null;
      showFactionStep(selectingMode,2);
    });
    $("#faction-select-back")?.addEventListener("click",()=>{
      SFX.menuConfirm();
      if(firstFaction){firstFaction=null;showFactionStep(selectingMode,1);return;}
      factionSelect?.classList.remove("show","opponent-step","secret-revealed");factionSelect?.setAttribute("aria-hidden","true");one.inert=false;two.inert=false;one?.focus();
    });
    two?.addEventListener("click",()=>{
      SFX.unlock();SFX.menuConfirm();clearNotice();one.inert=true;two.inert=true;firstFaction=null;showFactionStep("hotseat",1);
    });
  }

  function boardPoint(q,r) {
    const size=27,x0=72,y0=32,dx=size*1.5,dy=Math.sqrt(3)*size;
    return {x:x0+q*dx,y:y0+(r+(q&1)*.5)*dy};
  }

  function clearAttackTargetingFx({complete=false}={}) {
    if(targetingFxTimer){clearTimeout(targetingFxTimer);targetingFxTimer=null;}
    if(targetingFxFailsafeTimer){clearTimeout(targetingFxFailsafeTimer);targetingFxFailsafeTimer=null;}
    if(targetingFxFrame){cancelAnimationFrame(targetingFxFrame);targetingFxFrame=null;}
    targetingFxGroup?.remove();targetingFxGroup=null;
    const callback=complete?targetingFxCompletion:null;
    targetingFxCompletion=null;attackTargetingBusy=false;aiEffectPending=false;
    if(callback)callback();
  }

  function playAttackTargetingFx({from,to,team="fed",garrison=false,onComplete=()=>{}}) {
    const svg=$("#board");
    if(!svg||from?.q==null||to?.q==null){onComplete();return;}
    clearAttackTargetingFx();
    const a=boardPoint(from.q,from.r),b=boardPoint(to.q,to.r);
    const ns="http://www.w3.org/2000/svg";
    const group=document.createElementNS(ns,"g");
    group.classList.add("attack-targeting-fx");
    group.classList.add(team==="zeon"?"team-zeon":"team-fed");
    if(garrison)group.classList.add("garrison-target");
    group.innerHTML=`<line class="targeting-guide" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line><g class="targeting-reticle" transform="translate(${a.x} ${a.y})"><circle class="targeting-ring outer" r="19"></circle><circle class="targeting-ring inner" r="9"></circle><path class="targeting-cross" d="M-25 0H-12 M12 0H25 M0-25V-12 M0 12V25"></path><path class="targeting-corners" d="M-20-12V-20H-12 M12-20H20V-12 M20 12V20H12 M-12 20H-20V12"></path></g><g class="target-lock-mark" transform="translate(${b.x} ${b.y})"><circle r="22"></circle><path d="M-28 0H-18 M18 0H28 M0-28V-18 M0 18V28"></path></g>`;
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const travelTime=reduced?70:470;
    const lockTime=reduced?70:190;
    const epoch=gameEpoch;
    attackTargetingBusy=true;
    if(isAiTurn())aiEffectPending=true;
    menuOpen=false;menuView="main";renderAll();
    svg.appendChild(group);targetingFxGroup=group;targetingFxCompletion=()=>{if(epoch===gameEpoch)onComplete();};
    const reticle=group.querySelector(".targeting-reticle");
    const lock=group.querySelector(".target-lock-mark");
    const started=performance.now();
    const ease=t=>1-Math.pow(1-t,3);
    const step=now=>{
      if(epoch!==gameEpoch){clearAttackTargetingFx();return;}
      const t=Math.min(1,(now-started)/travelTime);
      const e=ease(t);
      const x=a.x+(b.x-a.x)*e,y=a.y+(b.y-a.y)*e;
      reticle.setAttribute("transform",`translate(${x} ${y})`);
      if(t<1){targetingFxFrame=requestAnimationFrame(step);return;}
      targetingFxFrame=null;reticle.classList.add("locked");lock.classList.add("show");
      targetingFxTimer=setTimeout(()=>clearAttackTargetingFx({complete:true}),lockTime);
    };
    // requestAnimationFrame may stop entirely in a background tab. This wall-clock
    // fallback resolves the visual step independently, and the AI watchdog can also
    // cancel the same state safely if browser timer throttling delays this callback.
    targetingFxFailsafeTimer=setTimeout(()=>clearAttackTargetingFx({complete:true}),travelTime+lockTime+900);
    targetingFxFrame=requestAnimationFrame(step);
  }

  function spawnShotFx(from,to) {
    const svg=$("#board"); if(!svg||from?.q==null||to?.q==null)return;
    const a=boardPoint(from.q,from.r),b=boardPoint(to.q,to.r);
    const ns="http://www.w3.org/2000/svg";
    const group=document.createElementNS(ns,"g");group.classList.add("combat-shot-fx");
    group.innerHTML=`<line class="combat-shot-glow" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line><line class="combat-shot-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"></line>`;
    svg.appendChild(group);setTimeout(()=>group.remove(),420);
  }

  function spawnImpactFx(q,r,destroyed=false,garrison=false) {
    const svg=$("#board"); if(!svg||q==null||r==null)return;
    const {x,y}=boardPoint(q,r);const ns="http://www.w3.org/2000/svg";
    const group=document.createElementNS(ns,"g");
    group.setAttribute("transform",`translate(${x} ${y})`);
    group.classList.add(destroyed?"combat-explosion-fx":"combat-impact-fx");
    if(garrison)group.classList.add("garrison-fx");
    if(destroyed){
      const explosionSrc=assetPath("assets/fx/explosion.gif");
      const spriteSize=garrison?124:96;
      const spriteOffset=-spriteSize/2;
      group.innerHTML=`<circle class="explosion-backflash" r="12"></circle><image class="explosion-sprite" href="${explosionSrc}" x="${spriteOffset}" y="${spriteOffset}" width="${spriteSize}" height="${spriteSize}" preserveAspectRatio="xMidYMid meet"></image><circle class="explosion-shockwave" r="18"></circle><g class="explosion-embers">${Array.from({length:12},(_,i)=>`<line transform="rotate(${i*30})" x1="0" y1="-18" x2="0" y2="-${30+(i%3)*6}"></line>`).join("")}</g>`;
    }else{
      group.innerHTML=`<circle class="impact-flash" r="8"></circle><circle class="impact-ring" r="9"></circle><path class="impact-spark" d="M-17 0 H17 M0 -17 V17 M-12 -12 L12 12 M12 -12 L-12 12"></path>`;
    }
    svg.appendChild(group);setTimeout(()=>group.remove(),destroyed?900:440);
  }

  function shakeDamageTarget({targetUnitId,q,r,garrison=false}) {
    const node=targetUnitId
      ? document.querySelector(`.unit-node[data-unit-id="${targetUnitId}"]`)
      : garrison?document.querySelector(`.hex[data-q="${q}"][data-r="${r}"] .feature-token.garrison`):null;
    if(!node)return;
    node.classList.remove("combat-hit");
    void node.getBoundingClientRect?.();
    node.classList.add("combat-hit");
    setTimeout(()=>node.classList.remove("combat-hit"),420);
  }

  function playDamageFeedback({to,targetUnitId=null,garrison=false,destroyed=false},epoch=gameEpoch) {
    if(!to||to.q==null)return;
    requestAnimationFrame(()=>{
      if(epoch!==gameEpoch)return;
      spawnImpactFx(to.q,to.r,destroyed,garrison);
      if(destroyed)SFX.explosion();
      else { shakeDamageTarget({targetUnitId,q:to.q,r:to.r,garrison});SFX.hit(); }
    });
  }

  function playCombatFeedback({from,to,targetUnitId=null,garrison=false,destroyed=false}) {
    if(!to||to.q==null)return;
    const epoch=gameEpoch;
    requestAnimationFrame(()=>{
      if(epoch!==gameEpoch)return;
      spawnShotFx(from,to);SFX.shot();
      setTimeout(()=>{if(epoch===gameEpoch)playDamageFeedback({to,targetUnitId,garrison,destroyed},epoch);},115);
    });
  }

  function spawnBazookaBonusFx(q,r,index,total) {
    const svg=$("#board"); if(!svg||q==null||r==null)return;
    const {x,y}=boardPoint(q,r);const ns="http://www.w3.org/2000/svg";
    const group=document.createElementNS(ns,"g");
    group.setAttribute("transform",`translate(${x} ${y})`);
    group.classList.add("bazooka-bonus-fx");
    group.innerHTML=`<circle class="bazooka-bonus-flash" r="10"></circle><circle class="bazooka-bonus-ring" r="12"></circle><g class="bazooka-bonus-popup"><rect x="-38" y="-55" width="76" height="20" rx="5"></rect><text x="0" y="-41">+1 DAMAGE</text><text class="bazooka-bonus-count" x="0" y="-65">BONUS ${index}/${total}</text></g>`;
    svg.appendChild(group);
    setTimeout(()=>group.remove(),650);
  }

  function playBazookaCriticalVolley({from,to,targetUnitId=null,garrison=false,destroyed=false,count=0}) {
    const bonus=Math.max(0,Number(count)||0);
    if(!bonus){playCombatFeedback({from,to,targetUnitId,garrison,destroyed});return;}
    const epoch=gameEpoch;
    // Let the normal attack land first, then visibly fire one extra shell per rescued Garrison.
    playCombatFeedback({from,to,targetUnitId,garrison,destroyed:false});
    const step=310;
    for(let i=0;i<bonus;i++){
      setTimeout(()=>{
        if(epoch!==gameEpoch)return;
        spawnShotFx(from,to);SFX.shot();
        setTimeout(()=>{
          if(epoch!==gameEpoch)return;
          spawnImpactFx(to.q,to.r,false,garrison);
          spawnBazookaBonusFx(to.q,to.r,i+1,bonus);
          SFX.hit();
        },105);
      },step*(i+1));
    }
    if(destroyed){
      setTimeout(()=>{
        if(epoch!==gameEpoch)return;
        spawnImpactFx(to.q,to.r,true,garrison);SFX.explosion();
      },step*(bonus+1)+80);
    }
  }

  function playResolvedAttackFeedback({attacker,weapon,result,from,to,targetUnitId=null,garrison=false,destroyed=false}) {
    const bonus=weapon?.critical==="rescuedGarrisonDamage"&&result?.criticals>0?Math.max(0,Number(result.criticalBonusDamage)||0):0;
    if(bonus>0){
      addLog(`Bazooka Critical: Rescue ไว้ ${bonus} Garrison — Bonus Damage +${bonus}`);
      playBazookaCriticalVolley({from,to,targetUnitId,garrison,destroyed,count:bonus});
    }else{
      playCombatFeedback({from,to,targetUnitId,garrison,destroyed});
    }
  }

  function escapeFxText(text) {
    return String(text ?? "").replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  }

  function spawnUnitStateFx(unit,kind,label) {
    const svg=$("#board");
    if(!svg||!unit||unit.q==null||unit.r==null)return;
    const {x,y}=boardPoint(unit.q,unit.r);
    const ns="http://www.w3.org/2000/svg";
    const group=document.createElementNS(ns,"g");
    group.setAttribute("transform",`translate(${x} ${y})`);
    group.classList.add("unit-state-fx",kind);
    group.innerHTML=`<circle class="state-fx-aura" r="20"></circle><circle class="state-fx-ring" r="24"></circle><path class="state-fx-rays" d="M0-30V-42 M0 30V42 M-30 0H-42 M30 0H42 M-22-22L-31-31 M22-22L31-31 M-22 22L-31 31 M22 22L31 31"></path><g class="state-fx-popup"><rect x="-39" y="-58" width="78" height="20" rx="5"></rect><text x="0" y="-44">${escapeFxText(label)}</text></g>`;
    svg.appendChild(group);
    if(kind==="upgrade")SFX.upgrade();else SFX.debuff();
    setTimeout(()=>group.remove(),1050);
  }

  function queueUnitStateFx(unit,kind,label,delay=35) {
    const unitId=unit?.id;
    const epoch=gameEpoch;
    setTimeout(()=>{
      if(epoch!==gameEpoch)return;
      const latest=unitId?state?.units?.find(candidate=>candidate.id===unitId):unit;
      spawnUnitStateFx(latest||unit,kind,label);
    },delay);
  }

  function spawnObjectiveCaptureFx(objective,team) {
    const svg=$("#board");
    if(!svg||!objective||objective.q==null||objective.r==null)return;
    const {x,y}=boardPoint(objective.q,objective.r);
    const ns="http://www.w3.org/2000/svg";
    const group=document.createElementNS(ns,"g");
    group.setAttribute("transform",`translate(${x} ${y})`);
    group.classList.add("objective-capture-fx",team);
    group.innerHTML=`<circle class="capture-flash" r="13"></circle><circle class="capture-ring ring-a" r="20"></circle><circle class="capture-ring ring-b" r="29"></circle><path class="capture-beam" d="M0 42V-62"></path><g class="capture-popup"><rect x="-58" y="-72" width="116" height="22" rx="5"></rect><text x="0" y="-57">OBJECTIVE CAPTURED</text></g>`;
    svg.appendChild(group);
    const flag=document.querySelector(`.hex[data-q="${objective.q}"][data-r="${objective.r}"] .objective-flag`);
    if(flag){flag.classList.add("capture-pulse");setTimeout(()=>flag.classList.remove("capture-pulse"),900);}
    SFX.capture();
    setTimeout(()=>group.remove(),1250);
  }

  function queueObjectiveCaptureFx(objective,team,delay=40) {
    const epoch=gameEpoch;
    setTimeout(()=>{if(epoch===gameEpoch)spawnObjectiveCaptureFx(objective,team);},delay);
  }

  function spawnObjectiveScoreFx(objective,team) {
    const svg=$("#board");
    if(!svg||!objective||objective.q==null||objective.r==null)return;
    const {x,y}=boardPoint(objective.q,objective.r);
    const ns="http://www.w3.org/2000/svg";
    const group=document.createElementNS(ns,"g");
    group.setAttribute("transform",`translate(${x} ${y})`);
    group.classList.add("objective-score-fx",team);
    const points=D.rules.objective?.phaseVp ?? 5;
    group.innerHTML=`<circle class="score-flash" r="13"></circle><circle class="score-ring ring-a" r="20"></circle><circle class="score-ring ring-b" r="30"></circle><path class="score-beam" d="M0 46V-68"></path><g class="score-popup"><rect x="-32" y="-74" width="64" height="23" rx="6"></rect><text x="0" y="-58">+${points} VP</text></g>`;
    svg.appendChild(group);
    const flag=document.querySelector(`.hex[data-q="${objective.q}"][data-r="${objective.r}"] .objective-flag`);
    if(flag){flag.classList.add("score-pulse");setTimeout(()=>flag.classList.remove("score-pulse"),900);}
    SFX.objectiveScore();
    setTimeout(()=>group.remove(),1200);
  }

  function wait(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }

  function scheduleStartActivation(delay=0) {
    if(activationResumeTimer)clearTimeout(activationResumeTimer);
    const epoch=gameEpoch;
    activationResumeTimer=setTimeout(()=>{
      activationResumeTimer=null;
      if(epoch!==gameEpoch||state?.status!=="playing"||state.activeUnitId)return;
      startActivation();
    },Math.max(0,delay));
  }

  function clearActivationTemporaryEffects(unit) {
    if(!unit)return;
    unit.tempStrength=0;
    unit.tempAccuracy=0;
    unit.movementBonus=0;
    unit.critFloorOverride=null;
    unit.heroBeamSaberBonus=0;
    unit.destroyUpgradeAfterAttack=false;
    unit.critBoost=false;
    unit.nextAttackDiscount=0;
    unit.lastShotBonus=false;
    unit.nextAttackCriticalOverdrive=false;
  }

  function finishDefeatedActiveActivation(unit,source="Response") {
    if(!unit||unit.id!==state.activeUnitId||unit.zone!=="reserve")return false;
    state.resolvedThisTick.add(unit.id);
    state.lastActivatedTeam=unit.team;
    state.activeUnitId=null;
    clearActivationTemporaryEffects(unit);
    mode=null;
    movementDraft=null;
    menuOpen=false;
    menuView="main";
    pendingAttack=null;
    aiBusy=false;
    aiPreferredTargetKey=null;
    aiResponsePending=false;
    aiEffectPending=false;
    state.justDeployedUnitId=null;
    closeModal();
    addLog(`${unit.name} ถูกทำลายระหว่าง Activation (${source}) — ยุติ Activation ทันที`);
    renderAll();
    scheduleStartActivation(360);
    return true;
  }

  function ensurePhaseTransitionOverlay() {
    let overlay=$("#phase-transition-overlay");
    if(!overlay){
      overlay=document.createElement("div");
      overlay.id="phase-transition-overlay";
      overlay.className="phase-transition-overlay";
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function showPhaseTransition({eyebrow,title,subtitle="",winner=null}) {
    const overlay=ensurePhaseTransitionOverlay();
    overlay.innerHTML=`<div class="phase-transition-card ${winner?`winner ${winner}`:""}"><span class="phase-transition-eyebrow">${escapeFxText(eyebrow)}</span><h2>${escapeFxText(title)}</h2>${subtitle?`<p>${escapeFxText(subtitle)}</p>`:""}</div>`;
    overlay.classList.add("show");
    SFX.phaseShift();
    return overlay;
  }

  function updatePhaseTransition({eyebrow,title,subtitle="",winner=null}) {
    const overlay=ensurePhaseTransitionOverlay();
    overlay.innerHTML=`<div class="phase-transition-card winner-reveal ${winner||""}"><span class="phase-transition-eyebrow">${escapeFxText(eyebrow)}</span><h2>${escapeFxText(title)}</h2>${subtitle?`<p>${escapeFxText(subtitle)}</p>`:""}</div>`;
    overlay.classList.add("show");
  }

  function hidePhaseTransition() {
    const overlay=$("#phase-transition-overlay");
    if(overlay)overlay.classList.remove("show");
  }

  async function scoreClaimedObjectives(claimed,epoch=gameEpoch) {
    if(!claimed.length){
      await wait(720);
      return epoch===gameEpoch;
    }
    await wait(420);
    if(epoch!==gameEpoch)return false;
    const points=D.rules.objective?.phaseVp ?? 5;
    for(const entry of claimed){
      if(epoch!==gameEpoch)return false;
      const objective=state.objectives.find(item=>item.id===entry.id);
      if(!objective)continue;
      state.vp[entry.team]+=points;
      renderHeader();
      addLog(`${teamName(entry.team)} ควบคุม Objective — +${points} VP`);
      spawnObjectiveScoreFx(objective,entry.team);
      await wait(680);
    }
    await wait(360);
    return epoch===gameEpoch;
  }

  async function runPhaseTransition(finalPhase=false) {
    if(transitionBusy)return;
    const epoch=gameEpoch;
    transitionBusy=true;
    state.activeUnitId=null;
    mode=null;
    movementDraft=null;
    menuOpen=false;
    menuView="main";
    const scoredPhase=state.phase;
    const claimed=state.objectives.filter(objective=>objective.owner).map(objective=>({id:objective.id,team:objective.owner}));
    renderAll();

    if(finalPhase){
      showPhaseTransition({eyebrow:"FINAL OBJECTIVE SCORE",title:"GAME END",subtitle:"กำลังรวมคะแนน Objective จาก Phase 2"});
      if(!await scoreClaimedObjectives(claimed,epoch))return;
      state.status="finished";
      state.winner=state.vp.fed===state.vp.zeon?(state.lastActivatedTeam||"zeon"):state.vp.fed>state.vp.zeon?"fed":"zeon";
      addLog(`จบ Phase ${scoredPhase}: คิดคะแนน Objective ครบแล้ว`);
      const winnerTitle=`${teamName(state.winner)} WINS`;
      updatePhaseTransition({eyebrow:"MISSION COMPLETE",title:winnerTitle,subtitle:`${teamMeta("fed").short} ${state.vp.fed} VP  •  ${teamMeta("zeon").short} ${state.vp.zeon} VP`,winner:state.winner});
      renderHeader();
      await wait(1500);
      if(epoch!==gameEpoch)return;
      hidePhaseTransition();
      transitionBusy=false;
      renderAll();
      showResult();
      return;
    }

    showPhaseTransition({eyebrow:"PHASE 1 COMPLETE",title:"PHASE 2",subtitle:"กำลังรวมคะแนน Objective ก่อนรีเซ็ตพื้นที่"});
    if(!await scoreClaimedObjectives(claimed,epoch))return;
    addLog(`จบ Phase ${scoredPhase}: คิดคะแนน Objective ครบแล้ว`);
    state.objectives.forEach(objective=>{objective.owner=null;});
    state.phase=2;
    state.currentTick=11;
    state.round=1;
    const phaseTwoDraw=dealPendingPhaseTwoTactics();
    updatePhaseTransition({
      eyebrow:"PHASE 2 READY",
      title:"PHASE 2",
      subtitle:`Objective กลับเป็นกลาง • เติม Tactic ที่ยังไม่ได้จั่ว +${phaseTwoDraw.fed} / +${phaseTwoDraw.zeon}`
    });
    addLog("เข้าสู่ Phase 2 — Objective ทั้งหมดกลับเป็นกลาง");
    renderAll();
    await wait(820);
    if(epoch!==gameEpoch)return;
    hidePhaseTransition();
    transitionBusy=false;
    scheduleStartActivation();
  }

  function grantUpgrade(unit,type,amount=1) {
    if(!unit?.upgrades||!type||amount<=0)return;
    unit.upgrades[type]=(unit.upgrades[type]||0)+amount;
    queueUnitStateFx(unit,"upgrade",`+${type.toUpperCase()}`);
  }

  function applyDebuff(unit,type) {
    if(!unit?.statuses||!type)return;
    unit.statuses[type]=true;
    queueUnitStateFx(unit,"debuff",type.toUpperCase());
  }

  function playPickupFeedback(unit,pickups=[]) {
    pickups.filter(event=>event.type==="upgrade").forEach((event,index)=>queueUnitStateFx(unit,"upgrade",`+${event.upgrade.toUpperCase()}`,45+index*140));
  }

  function returnToTitle() {
    gameEpoch+=1;
    if(aiThinkingTimer){clearTimeout(aiThinkingTimer);aiThinkingTimer=null;}
    aiBusy=false;
    aiPerforming=false;
    aiPreferredTargetKey=null;
    aiResponsePending=false;
    aiEffectPending=false;
    if(activationResumeTimer){clearTimeout(activationResumeTimer);activationResumeTimer=null;}
    if(diceAnimationTimer){clearTimeout(diceAnimationTimer);diceAnimationTimer=null;}
    if(diceRollInterval){clearInterval(diceRollInterval);diceRollInterval=null;}
    clearAttackTargetingFx();
    document.querySelectorAll(".attack-targeting-fx,.combat-shot-fx,.combat-impact-fx,.combat-explosion-fx,.bazooka-bonus-fx,.unit-state-fx").forEach(node=>node.remove());
    {const diceOverlay=$("#dice-roll-overlay");if(diceOverlay){releaseResolutionModalLock(diceOverlay);diceOverlay.classList.remove("show");}}
    $("#pass-overlay")?.classList.remove("show");
    closeModal();
    hidePhaseTransition();
    state=null;
    lastDice=null;
    mode=null;
    pendingAttack=null;
    movementDraft=null;
    losInspection={ enabled:false };
    menuOpen=false;
    menuView="main";
    transitionBusy=false;
    matchMode="hotseat";
    humanTeam=null;
    aiTeam=null;
    matchFactions={ fed:"fed", zeon:"zeon" };
    BGM.stop();
    const screen=$("#title-screen");
    const factionSelect=$("#faction-select");
    const scenarioSelect=$("#scenario-select");
    const gameShell=$(".game-shell");
    factionSelect?.classList.remove("show","opponent-step","secret-revealed");
    factionSelect?.setAttribute("aria-hidden","true");
    scenarioSelect?.classList.remove("show");
    scenarioSelect?.setAttribute("aria-hidden","true");
    $("#secret-team-toggle")?.setAttribute("aria-expanded","false");
    $("#secret-team-drawer")?.setAttribute("aria-hidden","true");
    document.querySelectorAll("#secret-team-drawer [data-faction]").forEach(button=>button.tabIndex=-1);
    $("#title-one-player")?.removeAttribute("inert");
    $("#title-two-player")?.removeAttribute("inert");
    if(gameShell){gameShell.inert=true;gameShell.setAttribute("aria-hidden","true");}
    document.body.classList.add("title-active");
    screen?.classList.remove("leaving");
    screen?.classList.add("show");
    TitleBGM.start();
    $("#title-one-player")?.focus();
  }

  function resetGame() {
    gameEpoch+=1;
    if(aiThinkingTimer){clearTimeout(aiThinkingTimer);aiThinkingTimer=null;}
    aiBusy=false;
    aiPerforming=false;
    aiPreferredTargetKey=null;
    aiResponsePending=false;
    aiEffectPending=false;
    if(activationResumeTimer){clearTimeout(activationResumeTimer);activationResumeTimer=null;}
    if(diceAnimationTimer){clearTimeout(diceAnimationTimer);diceAnimationTimer=null;}
    if(diceRollInterval){clearInterval(diceRollInterval);diceRollInterval=null;}
    clearAttackTargetingFx();
    document.querySelectorAll(".attack-targeting-fx,.combat-shot-fx,.combat-impact-fx,.combat-explosion-fx,.bazooka-bonus-fx,.unit-state-fx").forEach(node=>node.remove());
    {const diceOverlay=$("#dice-roll-overlay");if(diceOverlay){releaseResolutionModalLock(diceOverlay);diceOverlay.classList.remove("show");}}
    closeModal();
    state = E.setupGame(Math.random,matchFactions);
    lastDice = null;
    mode = null;
    pendingAttack = null;
    movementDraft = null;
    losInspection = { enabled:false };
    menuOpen = false;
    menuView = "main";
    transitionBusy = false;
    hidePhaseTransition();
    const boardEl=$("#board");
    boardEl?.setAttribute("aria-label",`กระดาน Hex ${D.map.name}`);
    addLog(`เริ่มภารกิจ ${D.map.name} — Mystery Upgrade ถูกสุ่ม 9 จาก 15 ชิ้นแล้ว`);
    startActivation(true);
  }

  function startActivation(first = false) {
    if (state.status !== "playing") return;
    const unit = E.chooseNextUnit(state);
    if (!unit) return advanceTimeline();
    let deployed = false;
    if (unit.zone === "reserve") {
      const shieldsBefore=unit.upgrades?.shield||0;
      E.beginDeploy(state, unit);
      deployed = true;
      if(unit.id==="mazinger-z"&&(unit.upgrades?.shield||0)>shieldsBefore){
        addLog("Super Alloy Z: Mazinger Z ได้รับ Shield Upgrade 1 จากการ Deploy");
        queueUnitStateFx(unit,"upgrade","+SHIELD");
      }
    }
    state.activeUnitId = unit.id;
    state.activation = { advanced: false, actionUsed: false, commandUsed: {}, tacticUsed: { fed: false, zeon: false }, timelineSpent: 0 };
    const reactivatedShields = E.reactivateShields(unit);
    if (reactivatedShields > 0) addLog(`${unit.name}: Shield Upgrade ${reactivatedShields} ชิ้นกลับมา Active`);
    clearActivationTemporaryEffects(unit);
    unit.progressiveRepeatUsed = false;
    unit.attackedWithRexClaws = false;
    unit.handgunRepeatUsed = false;
    mode = null;
    movementDraft = null;
    menuOpen = false;
    menuView = "main";
    state.justDeployedUnitId = deployed ? unit.id : null;
    addLog(`${teamName(unit.team)} — ${unit.name} ${deployed ? "Deploy บน Base" : "เริ่ม Activation"}`);
    renderAll();
    if(isAiTeam(unit.team)) {
      $("#pass-overlay")?.classList.remove("show");setPassControlLock(false);
      addLog(`AI ${teamMeta(unit.team).short} กำลังประเมินสนามรบ`);
      renderAll();
      focusCameraOnUnit(unit);
      scheduleAiTurn(unit,first?AI_PACE.firstTurn:AI_PACE.turnStart);
    } else if(matchMode==="hotseat") showPassOverlay(unit, first);
    else {
      $("#pass-overlay")?.classList.remove("show");setPassControlLock(false);
      focusCameraOnUnit(unit);
    }
  }

  function setPassControlLock(locked) {
    const shell=$(".game-shell");
    if(shell)shell.inert=!!locked;
  }

  function showPassOverlay(unit, first) {
    const overlay = $("#pass-overlay");
    overlay.innerHTML = `<div class="pass-card" style="--team:${sideColor(unit.team)}">
      <span class="eyebrow">${first ? "MISSION START" : "HOT-SEAT // PASS CONTROL"}</span>
      <h2 id="pass-team-title">${teamName(unit.team)}</h2>
      <p>ส่งเครื่องให้ผู้เล่นฝั่งนี้ แล้วกดพร้อมเมื่อผู้เล่นอีกฝ่ายมองไม่เห็นมือการ์ด</p>
      <button class="primary-btn" id="ready-btn">พร้อม — ใช้งาน ${unit.name}</button>
    </div>`;
    overlay.setAttribute("aria-labelledby","pass-team-title");
    overlay.classList.add("show");
    setPassControlLock(true);
    const ready=$("#ready-btn");
    ready.addEventListener("click", () => {
      overlay.classList.remove("show");
      setPassControlLock(false);
      $(".game-shell")?.focus();
      focusCameraOnUnit(unit);
    });
    ready.focus();
  }

  function advanceTimeline() {
    if(transitionBusy)return;
    state.resolvedThisTick.clear();
    if(state.currentTick===10){
      runPhaseTransition(false);
      return;
    }
    if(state.currentTick===20){
      runPhaseTransition(true);
      return;
    }
    state.currentTick += 1;
    state.round = ((state.currentTick - 1) % 10) + 1;
    addLog(`Timeline ไปช่อง ${state.round}`);
    startActivation();
  }

  function endActivation() {
    if (!state.activeUnitId || state.status !== "playing") return;
    if(movementDraft){commitMovementDraft(()=>endActivation());return;}
    const unit = activeUnit();
    if (unit.zone === "deploying") { addLog("ต้อง Advance ออกจาก Base ก่อนจบ Activation"); renderAll(); return; }
    if (!state.activation.actionUsed) { addLog("ต้องเลือก Primary Action ก่อนจบ Activation"); renderAll(); return; }
    const objectiveResults=E.contestObjectives(state,unit);
    const capturedObjectives=[];
    objectiveResults.forEach(result=>{
      if(result.action==="captured"){
        addLog(`${unit.name} ชนะ Contest ${result.friendly}-${result.enemy}: ยึด Objective ให้ ${teamMeta(unit.team).short}`);
        capturedObjectives.push(result.objective);
      }
      else if(result.action==="neutralized")addLog(`${unit.name} ชนะ Contest ${result.friendly}-${result.enemy}: ล้าง Objective ของศัตรูให้เป็นกลาง`);
      else if(result.action==="blocked")addLog(`${unit.name} Contest Objective ไม่สำเร็จ (${result.friendly}-${result.enemy})`);
    });
    clearActivationTemporaryEffects(unit);
    state.resolvedThisTick.add(unit.id);
    state.lastActivatedTeam=unit.team;
    state.activeUnitId = null;
    mode = null;
    movementDraft = null;
    menuOpen = false;
    if(capturedObjectives.length){
      renderAll();
      capturedObjectives.forEach((objective,index)=>queueObjectiveCaptureFx(objective,unit.team,40+index*180));
      scheduleStartActivation(880);
    }else scheduleStartActivation();
  }

  function dealPendingPhaseTwoTactics() {
    const teams=["fed","zeon"];
    const before={fed:state.hands.fed.length,zeon:state.hands.zeon.length};
    for(const team of teams){
      if(state.tacticCycles[team]!==1) continue;
      E.dealTacticHand(state,team);
      state.tacticCycles[team]=2;
    }
    const fedDrawn=state.hands.fed.length-before.fed;
    const zeonDrawn=state.hands.zeon.length-before.zeon;
    if(fedDrawn||zeonDrawn)addLog(`เข้าสู่ Phase 2 — เติม Tactic ที่ยังไม่ได้จั่ว: ${teamMeta("fed").short} +${fedDrawn}, ${teamMeta("zeon").short} +${zeonDrawn}`);
    return {fed:fedDrawn,zeon:zeonDrawn};
  }

  function payTimeline(unit, amount) {
    const cost=Math.max(0,amount);
    E.advanceUnitTimeline(state,unit,cost);
    state.activation.timelineSpent += cost;
  }

  function renderAll() {
    renderHeader();
    renderLosButton();
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
    const fedMeta=teamMeta("fed"),zeonMeta=teamMeta("zeon");
    $("#fed-team-name").textContent=fedMeta.short;
    $("#zeon-team-name").textContent=zeonMeta.short;
    const fedColor=sideColor("fed"),zeonColor=sideColor("zeon");
    $("#fed-team-name").style.color=fedColor;
    $("#zeon-team-name").style.color=zeonColor;
    document.documentElement.style.setProperty("--fed",fedColor);
    document.documentElement.style.setProperty("--zeon",zeonColor);
    $("#fed-score").style.borderColor=fedColor;
    $("#zeon-score").style.borderColor=zeonColor;
    const fedController=$("#fed-controller"),zeonController=$("#zeon-controller");
    if(fedController)fedController.textContent=matchMode==="ai"?(humanTeam==="fed"?"YOU":"AI"):"";
    if(zeonController)zeonController.textContent=matchMode==="ai"?(humanTeam==="zeon"?"YOU":"AI"):"";
  }

  function renderTimeline() {
    const timelineIcon = unit => `<button type="button" class="timeline-icon ${unit.id===state.activeUnitId?"active":""} ${state.resolvedThisTick.has(unit.id)?"acted":""} ${unit.zone==="reserve"?"reserve":""}" style="--team:${sideColor(unit.team)}" data-timeline-unit-id="${unit.id}" title="ดูการ์ดและสถานะ · ${unit.name}${unit.weaponBadge?` ${unit.weaponBadge}`:""}" aria-label="ดูการ์ดและสถานะ ${unit.name}${unit.weaponBadge?` ${unit.weaponBadge}`:""}"><img src="${unit.icon}" alt=""></button>`;
    const timeline=$("#timeline");
    timeline.innerHTML = Array.from({length:10},(_,index)=>{
      const slot=index+1;
      const units=state.units.filter(unit=>E.timelineSlot(unit.nextAt)===slot);
      const stackOrder=(a,b)=>(a.timelineSeq??0)-(b.timelineSeq??0);
      const fedUnits=units.filter(unit=>unit.team==="fed").sort(stackOrder);
      const zeonUnits=units.filter(unit=>unit.team==="zeon").sort(stackOrder);
      return `<div class="timeline-slot ${slot===state.round?"current":""}"><div class="slot-number">${slot}</div><div class="timeline-stack"><div class="timeline-team-row fed">${fedUnits.map(timelineIcon).join("")}</div><div class="timeline-team-row zeon">${zeonUnits.map(timelineIcon).join("")}</div></div></div>`;
    }).join("");
    timeline.querySelectorAll("[data-timeline-unit-id]").forEach(button=>button.addEventListener("click",()=>{
      if($("#game-modal")?.classList.contains("show"))return;
      const unit=state.units.find(candidate=>candidate.id===button.dataset.timelineUnitId);
      if(unit)showUnitCard(unit,{inspection:true});
    }));
  }

  function hexPoints(cx, cy, size) {
    return Array.from({length:6}, (_,i) => {
      const angle = Math.PI / 180 * (60*i);
      return `${(cx + size*Math.cos(angle)).toFixed(1)},${(cy + size*Math.sin(angle)).toFixed(1)}`;
    }).join(" ");
  }

  function featureAt(q, r) {
    const base = D.map.featureCoordinates.bases.find(x => x.q===q && x.r===r);
    if (base) {
      const faction=factionForSide(base.team);
      const palette=sidePalette(base.team);
      return { type:"base", team:base.team, faction, icon:assetPath(`assets/tokens/base-${palette}.png`) };
    }
    const garrison = state.garrisons.find(x => x.q===q && x.r===r);
    if (garrison) {
      const faction=factionForSide(garrison.team);
      const palette=sidePalette(garrison.team);
      return { type:"garrison", id:garrison.id, team:garrison.team, faction, q:garrison.q, r:garrison.r, hp:garrison.hp, icon:assetPath(`assets/tokens/garrison-${palette}.png`) };
    }
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
      if (!count) continue;
      if (type === "shield") {
        const inactive=Math.min(count,unit.inactiveShields||0);
        const active=count-inactive;
        if(active) effects.push({ type, kind:"buff", icon:assetPath(`assets/tokens/${type}.png`), count:active, title:`Shield Upgrade Active ×${active}` });
        if(inactive) effects.push({ type:"shield-inactive", kind:"temporary", icon:assetPath(`assets/tokens/${type}.png`), count:inactive, title:`Shield Upgrade Face Down ×${inactive} — กลับมา Active ต้น Activation ถัดไป` });
      } else effects.push({ type, kind:"buff", icon:assetPath(`assets/tokens/${type}.png`), count, title:`${upgradeLabels[type]} Upgrade ×${count}` });
    }
    for (const type of ["fracture","slow","disarm"]) {
      if (unit.statuses?.[type]) effects.push({ type, kind:"status", icon:assetPath(`assets/tokens/${type}.png`), title:statusLabels[type] });
    }
    if (unit.tempStrength > 0) effects.push({ type:"temp-strength", kind:"temporary", icon:assetPath("assets/tokens/strength.png"), count:`+${unit.tempStrength}`, title:`Strength ชั่วคราว +${unit.tempStrength}` });
    if (unit.tempAccuracy > 0) effects.push({ type:"temp-accuracy", kind:"temporary", text:`ACC+${unit.tempAccuracy}`, title:`Accuracy ชั่วคราว +${unit.tempAccuracy}` });
    if (unit.destroyUpgradeAfterAttack) effects.push({ type:"checkmate", kind:"temporary", text:"UPG−1", title:"Checkmate — หลังโจมตีทำลาย Upgrade 1 ชิ้นบนเป้าหมาย" });
    if (Number.isFinite(unit.critFloorOverride)) {
      const critFloorSource=unit.id==="gfred"?"Nyaan Focus":unit.id==="mazinger-z"?"Mazin Power":"Critical Threshold";
      effects.push({ type:"crit-floor", kind:"temporary", text:`C${unit.critFloorOverride}+`, title:`${critFloorSource} — ผลทอย ${unit.critFloorOverride} ขึ้นไปเป็น Critical ใน Activation นี้` });
    }
    if (unit.heroBeamSaberBonus > 0) effects.push({ type:"hero-saber", kind:"temporary", text:`SAB+${unit.heroBeamSaberBonus}`, title:`Frenzied Charge — Beam Saber Strength +${unit.heroBeamSaberBonus} ใน Activation นี้` });
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

  function engagedMarker(cx,cy,text,kind) {
    const width=text==="ENGAGED"?82:64;
    const height=22;
    const y=Math.max(4,Math.min(624,cy-67));
    return `<g class="engaged-marker ${kind}" transform="translate(${cx-width/2} ${y})" aria-label="${text}"><rect width="${width}" height="${height}" rx="5"></rect><text x="${width/2}" y="${height/2}" dominant-baseline="central" text-anchor="middle">${text}</text></g>`;
  }

  function sameInspectionTarget(a,b) {
    if(!a||!b)return false;
    if(a===b)return true;
    if(a.id&&b.id)return a.id===b.id;
    return a.q===b.q&&a.r===b.r&&a.team===b.team;
  }

  function specialAoeCanAffectInspectionTarget(source,target,weapon,{ignoreEngagement=false}={}) {
    const engaged=ignoreEngagement?[]:E.engagedTargets(state,source);
    const engagedIds=new Set(engaged.map(item=>item.id));
    for(let rotation=0;rotation<6;rotation+=1){
      const targets=twinBusterTargets(source,rotation,weapon);
      if(!targets.some(candidate=>sameInspectionTarget(candidate,target)))continue;
      if(!engaged.length||targets.some(candidate=>engagedIds.has(candidate.id)))return true;
    }
    return false;
  }

  function inspectionWeaponGeometryAllowsTarget(source,target,weapon) {
    if(E.distance(source,target)>weaponRange(weapon))return false;
    if(usesSpecialAoeLine(weapon))return specialAoeCanAffectInspectionTarget(source,target,weapon,{ignoreEngagement:true});
    return weapon.ignoreLos||E.hasLineOfSight(state,source,target);
  }

  function inspectionWeaponCanAttackTarget(source,target,weapon) {
    if(E.distance(source,target)>weaponRange(weapon))return false;
    if(usesSpecialAoeLine(weapon))return specialAoeCanAffectInspectionTarget(source,target,weapon);
    return E.legalWeaponTargets(state,source,weapon).some(candidate=>sameInspectionTarget(candidate,target));
  }

  function losInspectionAssessment(source,target) {
    const distance=E.distance(source,target);
    const inRangeWeapons=inspectionWeaponsFor(source).filter(weapon=>distance<=weaponRange(weapon));
    const canAttack=inRangeWeapons.some(weapon=>inspectionWeaponCanAttackTarget(source,target,weapon));
    const geometricClear=inRangeWeapons.some(weapon=>inspectionWeaponGeometryAllowsTarget(source,target,weapon));
    const engagementBlocked=!canAttack&&geometricClear&&E.engagedTargets(state,source).length>0;
    return {distance,inRangeWeapons,canAttack,geometricClear,engagementBlocked,status:canAttack?"clear":engagementBlocked?"engaged":"blocked"};
  }

  function renderLosInspection(source,x0,y0,dx,dy) {
    if(!losInspection.enabled||!source||source.zone==="reserve")return "";
    const inspectionWeapons=inspectionWeaponsFor(source);
    const maximumRange=Math.max(0,...inspectionWeapons.map(weaponRange));
    const point=hex=>`${x0+hex.q*dx},${y0+(hex.r+(hex.q&1)*.5)*dy}`;
    const targets=[
      ...E.livingEnemies(state,source),
      ...state.garrisons.filter(garrison=>garrison.team!==source.team)
    ];
    return targets
      .filter(target=>E.distance(source,target)<=maximumRange)
      .map(target=>{
        const assessment=losInspectionAssessment(source,target);
        const {distance,inRangeWeapons,canAttack,engagementBlocked,status}=assessment;
        const details=E.lineOfSightDetails(state,source,target);
        const specialAoeClear=inRangeWeapons.some(weapon=>usesSpecialAoeLine(weapon)&&specialAoeCanAffectInspectionTarget(source,target,weapon,{ignoreEngagement:true}));
        const ignoresLos=!details.clear&&inRangeWeapons.some(weapon=>weapon.ignoreLos);
        // Green now means the target is actually legal under both LOS and Engagement.
        // Orange means geometry/LOS is clear but Engagement forces the attack elsewhere.
        const route=details.paths.find(candidate=>candidate.clear)||details.paths[0];
        const targetX=x0+target.q*dx,targetY=y0+(target.r+(target.q&1)*.5)*dy;
        const aria=engagementBlocked?"Clear LOS. Cannot target while Engaged.":canAttack?"Legal attack target":"Line of Sight blocked";
        const title=engagementBlocked?"CLEAR LOS · Cannot target — ENGAGED":specialAoeClear&&!details.clear?"Special AoE line reaches this target even though normal LOS is blocked":ignoresLos?"Legal target with an Ignore Line of Sight weapon":canAttack?"Legal target with at least one weapon":"No in-range weapon can legally target this enemy";
        return `<g aria-label="${aria}"><title>${title}</title><polyline class="los-path ${status}" points="${route.path.map(point).join(" ")}"></polyline><circle class="los-endpoint ${status}" cx="${targetX}" cy="${targetY}" r="25"></circle><g class="los-range-badge ${status}" transform="translate(${targetX+20} ${targetY-21})"><circle r="8"></circle><text y=".5">${distance}</text></g></g>`;
      }).join("");
  }

  function blockedForEveryInRangeWeapon(source,target) {
    return losInspectionAssessment(source,target).status==="blocked";
  }

  function engagementBlockedForLosInspection(source,target) {
    return losInspectionAssessment(source,target).status==="engaged";
  }

  function focusCameraOnUnit(unit) {
    if(!unit)return;
    requestAnimationFrame(()=>{
      const node=document.querySelector(`.unit-node[data-unit-id="${unit.id}"]`);
      const wrap=$("#board-wrap");
      if(!node||!wrap)return;
      const nodeBox=node.getBoundingClientRect();
      const wrapBox=wrap.getBoundingClientRect();
      wrap.scrollTo({
        left:Math.max(0,wrap.scrollLeft+nodeBox.left+nodeBox.width/2-wrapBox.left-wrapBox.width/2),
        top:Math.max(0,wrap.scrollTop+nodeBox.top+nodeBox.height/2-wrapBox.top-wrapBox.height/2),
        behavior:"smooth"
      });
      node.scrollIntoView?.({behavior:"smooth",block:"center",inline:"center"});
      node.classList.add("turn-camera-focus");
      setTimeout(()=>node.classList.remove("turn-camera-focus"),1500);
    });
  }

  function renderAttackAgainPrompt(cx,cy) {
    const width=104,height=34;
    const x=Math.max(4,Math.min(780-width-4,cx-width/2));
    const y=Math.max(4,cy-84);
    const anchorX=Math.max(x+16,Math.min(x+width-16,cx));
    return `<g class="attack-again-prompt" aria-label="Attack again. Select a target.">
      <path class="attack-again-pointer" d="M ${anchorX-6} ${y+height-1} L ${cx} ${Math.max(y+height+5,cy-25)} L ${anchorX+6} ${y+height-1} Z"></path>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7"></rect>
      <text class="attack-again-title" x="${x+width/2}" y="${y+13}">Attack again</text>
      <text class="attack-again-subtitle" x="${x+width/2}" y="${y+26}">Select a target</text>
    </g>`;
  }

  function renderBoard() {
    const size = 27, x0 = 72, y0 = 32, dx = size*1.5, dy = Math.sqrt(3)*size;
    $("#board")?.setAttribute("viewBox",`0 0 780 ${D.map.rows>13?680:650}`);
    const active = activeUnit();
    const losMaximumRange=active?Math.max(0,...inspectionWeaponsFor(active).map(weaponRange)):0;
    const engagedTargets=active?E.engagedTargets(state,active):[];
    const hasEngagement=engagedTargets.length>0;
    let defs = "";
    let cells = "";
    for (let q=0;q<D.map.cols;q++) for (let r=0;r<D.map.rows;r++) {
      if(!E.inBounds(q,r))continue;
      const cx=x0+q*dx, cy=y0+(r+(q&1)*.5)*dy;
      const hex=state.board[E.key(q,r)];
      const cls=["hex",`elevation-${hex.elevation}`,`map-${D.map.id}`];
      if(hex.terrain==="water")cls.push("terrain-water");
      if (mode?.type === "move" && mode.targets.has(E.key(q,r))) cls.push("reachable");
      if (mode?.type === "aoe-confirm" && mode.blockedTargets?.has(E.key(q,r))) cls.push("aoe-blocked");
      if (mode?.type === "aoe-confirm" && mode.previewTargets?.has(E.key(q,r))) cls.push("aoe-visible");
      if (isTargetable(q,r)) cls.push("targetable");
      if (mode?.type === "char-kick" && isTargetable(q,r)) cls.push("char-kick-target");
      if (active?.q===q && active?.r===r) cls.push("selected");
      const f=featureAt(q,r);
      const losGarrison=losInspection.enabled&&active&&f?.type==="garrison"&&f.team!==active.team&&E.distance(active,{q,r})<=losMaximumRange;
      const losGarrisonBlocked=losGarrison&&blockedForEveryInRangeWeapon(active,f);
      const losGarrisonEngaged=losGarrison&&engagementBlockedForLosInspection(active,f);
      cells += `<g class="${cls.join(" ")}" data-q="${q}" data-r="${r}">
        <polygon points="${hexPoints(cx,cy,size-1)}"></polygon>
        <text class="elevation-label" x="${cx-18}" y="${cy-14}">L${hex.elevation}</text>
        ${hex.terrain==="water"?`<text class="water-mark" x="${cx}" y="${cy+4}" text-anchor="middle">≈</text>`:""}
        ${f ? f.icon
          ? `<image class="feature-token ${f.type} ${mode?.type === "char-kick" && isTargetable(q,r) ? "char-kick-victim" : ""} ${losGarrison?"los-inspectable":""} ${losGarrisonBlocked?"los-blocked-target":""} ${losGarrisonEngaged?"los-engagement-target":""}" href="${f.icon}" x="${cx-14}" y="${cy-14}" width="28" height="28" preserveAspectRatio="xMidYMid meet"></image>${f.hp!==undefined?`<circle class="token-counter-bg ${f.team}" cx="${cx+11}" cy="${cy+10}" r="7"></circle><text class="token-counter" x="${cx+11}" y="${cy+10}">${f.hp}</text>`:""}`
          : `<g class="objective-flag ${f.team}" aria-label="Objective ${f.team === "neutral" ? "ยังไม่มีผู้ครอบครอง" : `ครอบครองโดย ${teamName(f.team)}`}"><title>Objective · ${D.rules.objective?.phaseVp ?? 5} VP เมื่อจบ Phase</title><path class="objective-pole" d="M ${cx-7} ${cy+13} V ${cy-12}"></path><path class="objective-cloth" d="M ${cx-6} ${cy-11} L ${cx+11} ${cy-6} L ${cx-6} ${cy+1} Z"></path><path class="objective-base" d="M ${cx-13} ${cy+13} H ${cx-1}"></path></g>` : ""}
      </g>`;
    }
    let units = "";
    for (const unit of state.units.filter(u=>u.zone==="board"||u.zone==="deploying")) {
      const cx=x0+unit.q*dx, cy=y0+(unit.r+(unit.q&1)*.5)*dy;
      const clip=`clip-${unit.id}`;
      defs += `<clipPath id="${clip}"><circle cx="${cx}" cy="${cy-2}" r="17"></circle></clipPath>`;
      const teamClass=unit.team;
      const engagedTargets=E.engagedTargets(state,unit);
      const isEngaged=engagedTargets.length>0;
      const losInspectable=losInspection.enabled&&active&&unit.team!==active.team&&E.distance(active,unit)<=losMaximumRange;
      const losBlocked=losInspectable&&blockedForEveryInRangeWeapon(active,unit);
      const losEngagementBlocked=losInspectable&&engagementBlockedForLosInspection(active,unit);
      units += `<g class="unit-node ${unit.id===state.activeUnitId?"active":""} ${unit.id===state.justDeployedUnitId?"deploying":""} ${isEngaged?"engaged":""} ${mode?.type === "char-kick" && isTargetable(unit.q,unit.r) ? "char-kick-victim" : ""} ${losInspectable?"los-inspectable":""} ${losBlocked?"los-blocked-target":""} ${losEngagementBlocked?"los-engagement-target":""}" data-unit-id="${unit.id}" data-q="${unit.q}" data-r="${unit.r}">
        <circle class="unit-base ${teamClass}" cx="${cx}" cy="${cy}" r="20"></circle>
        ${isEngaged?`<circle class="engaged-outline" cx="${cx}" cy="${cy}" r="22.25"></circle>`:""}
        <image class="unit-portrait" href="${unit.icon}" x="${cx-18}" y="${cy-20}" width="36" height="36" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"></image>
        ${isEngaged?`<g class="engaged-persistent-badge" aria-label="ENGAGED · Move -1"><rect x="${cx-21}" y="${cy-29}" width="42" height="11" rx="4"></rect><text x="${cx}" y="${cy-23.4}">ENGAGED</text></g>`:""}
        ${unit.id===state.activeUnitId ? `<g class="active-turn-marker" aria-hidden="true">
          <path class="active-turn-triangle" d="M ${cx-7} ${cy-31} L ${cx+7} ${cy-31} L ${cx} ${cy-22} Z"></path>
        </g>` : ""}
        ${mode?.type==="attack"&&mode.attackAgainPrompt&&mode.unitId===unit.id&&!isAiTeam(unit.team) ? renderAttackAgainPrompt(cx,cy) : ""}
        ${unit.weaponBadge ? `<rect class="weapon-badge" x="${cx+8}" y="${cy-21}" width="23" height="11" rx="2"></rect><text class="weapon-badge-text" x="${cx+19.5}" y="${cy-15.5}">${unit.weaponBadge}</text>` : ""}
        ${renderUnitEffectBadges(unit,cx,cy)}
        <rect class="unit-hp-bg" x="${cx-20}" y="${cy+20}" width="40" height="5" rx="2"></rect>
        <rect class="unit-hp" x="${cx-19}" y="${cy+21}" width="${38*unit.hp/unit.maxHp}" height="3" rx="1"></rect>
        <text class="unit-name" x="${cx}" y="${cy+34}">${unit.name === "Zaku II" ? unit.role : unit.name}</text>
      </g>`;
    }
    let engagedLayer="";
    if(active&&hasEngagement){
      const activeCx=x0+active.q*dx,activeCy=y0+(active.r+(active.q&1)*.5)*dy;
      engagedLayer+=engagedMarker(activeCx,activeCy,"MOVE -1","penalty");
      engagedTargets.forEach(target=>{
        const targetCx=x0+target.q*dx,targetCy=y0+(target.r+(target.q&1)*.5)*dy;
        engagedLayer+=engagedMarker(targetCx,targetCy,"ENGAGED","target");
      });
    }
    const losLayer=renderLosInspection(active,x0,y0,dx,dy);
    $("#board").innerHTML=`<defs>${defs}</defs>${cells}${units}<g class="los-overlay-layer">${losLayer}</g><g class="engaged-overlay-layer">${engagedLayer}</g>`;
    $("#board").querySelectorAll("[data-q]").forEach(node => node.addEventListener("click", event => handleHexClick(Number(node.dataset.q),Number(node.dataset.r),event)));
  }

  function unitHudHtml(unit,{showAi=false}={}) {
    const effects=[...unitMapEffects(unit)];
    if(unit.zone!=="reserve"&&E.engagedTargets(state,unit).length)effects.push({type:"engaged",kind:"status",text:"E",title:"Engagement — Move -1 และการโจมตีต้องมีเป้าหมายที่กำลัง Engage อย่างน้อย 1 ตัว"});
    if(unit.zone!=="reserve"&&E.terrainAt(state,unit.q,unit.r)==="water")effects.push({type:"water",kind:"status",text:"≈",title:"Water — เริ่มการเคลื่อนที่ Move -1 · Attack ที่เกี่ยวข้อง Accuracy -1"});
    if(unit.berserkActive)effects.push({type:"berserk",kind:"temporary",text:"BZK",title:"Berserk Active"});
    if(unit.movementBonus>0)effects.push({type:"move-bonus",kind:"temporary",text:`M+${unit.movementBonus}`,title:`Move Bonus +${unit.movementBonus} ใน Activation นี้`});
    const effectHtml=effects.map(effect=>{
      const count=effect.count!==undefined&&effect.count!==null?`<b>${effect.count}</b>`:"";
      const content=effect.icon?`<img src="${effect.icon}" alt="">${count}`:`<strong>${effect.text||"•"}</strong>${count}`;
      return `<span class="hud-effect ${effect.kind||""} effect-${effect.type}" title="${effect.title||effect.type}" aria-label="${effect.title||effect.type}">${content}</span>`;
    }).join("");
    const destroyed=state.destroyedGarrisons?.[unit.team]||0;
    const rescued=state.rescuedGarrisons?.[unit.team]||0;
    const enemyTeam=unit.team==="fed"?"zeon":"fed";
    const destroyedIcon=assetPath(`assets/tokens/garrison-${sidePalette(enemyTeam)}.png`);
    const rescuedIcon=assetPath(`assets/tokens/garrison-${sidePalette(unit.team)}.png`);
    return `<div class="active-hud-inner" style="--team:${sideColor(unit.team)}">
      <div class="active-unit-pane">
        <div class="active-unit-main">
          <div class="active-hud-portrait"><img src="${unit.icon}" alt=""></div>
          <div class="active-unit-copy"><span class="eyebrow">${unit.model}</span><h2>${unit.name}</h2><p>${unit.zone==="reserve"?"RESERVE":unit.role}</p><div class="hp-line"><span>HP</span><div class="bar"><i style="width:${unit.hp/unit.maxHp*100}%"></i></div><b>${unit.hp}/${unit.maxHp}</b></div></div>
        </div>
        <div class="active-hud-stats">${showAi&&isAiTeam(unit.team)?`<span class="hud-effect ai-thinking-chip" title="AI THINKING"><strong>AI</strong></span>`:""}<span class="hud-effect energy-effect" title="Energy ${unit.energy}" aria-label="Energy ${unit.energy}"><span class="energy-glyph">⚡</span><b>${unit.energy}</b></span>${effectHtml||'<span class="hud-effect empty-effect" title="No status"><strong>—</strong></span>'}</div>
      </div>
      <aside class="garrison-hud-pane" aria-label="Garrison record">
        <span class="garrison-hud-title">GARRISON DATA</span>
        <div class="garrison-record-grid">
          <div class="garrison-record destroyed" title="Enemy Garrisons destroyed by this side"><img src="${destroyedIcon}" alt=""><span><small>DESTROYED</small><b>${destroyed}</b></span></div>
          <div class="garrison-record rescued" title="Friendly Garrisons rescued by this side"><img src="${rescuedIcon}" alt=""><span><small>RESCUED</small><b>${rescued}</b></span></div>
        </div>
      </aside>
    </div>`;
  }

  function renderUnitCard() {
    const unit=activeUnit();
    if (!unit) { $("#active-hud").innerHTML=""; return; }
    $("#active-hud").innerHTML=unitHudHtml(unit,{showAi:true});
  }

  function hasOwnGarrisonInRange(unit, range=1, requireLos=false) { return state.garrisons.some(g=>g.team===unit.team && E.distance(unit,g)<=range && (!requireLos||E.hasLineOfSight(state,unit,g))); }
  function adjacentObjectives(unit) { return state.objectives.filter(o=>E.distance(unit,o)<=1); }

  function captureObjective(unit,objective,label) {
    if(!unit||!objective)return false;
    objective.owner=unit.team;
    addLog(`${label}: ${teamMeta(unit.team).short} ยึด Objective`);
    queueObjectiveCaptureFx(objective,unit.team);
    renderAll();return true;
  }

  function selectObjective(unit,label,onChoose,onCancel=()=>{},required=false) {
    const targets=adjacentObjectives(unit);
    if(!targets.length){onCancel();return false;}
    if(targets.length===1){onChoose(targets[0]);return true;}
    mode={type:"select-objective",unitId:unit.id,targets:new Set(targets.map(target=>E.key(target.q,target.r))),returnMenu:"main",required,hint:`${label}: เลือก Objective ที่อยู่บนช่องเดียวกันหรือช่องติดกัน`,callback:onChoose,onCancel};
    menuOpen=true;renderAll();return true;
  }

  function renderActions() {
    const unit=modeUnit(); const menu=$("#command-menu");
    menu.classList.toggle("char-kick-menu",mode?.type==="char-kick");
    if(unit&&isAiTeam(unit.team)){menu.innerHTML="";return;}
    if (!unit||!menuOpen) { menu.innerHTML=""; return; }
    if (mode) {
      const draftKick=mode.type==="char-kick"&&mode.fromDashDraft;
      const kickUnitTargets=mode.type==="char-kick"?[...state.units].filter(target=>target.zone==="board"&&target.team!==unit.team&&mode.targets?.has(E.key(target.q,target.r))):[];
      const kickGarrisonTargets=mode.type==="char-kick"?state.garrisons.filter(target=>target.team!==unit.team&&mode.targets?.has(E.key(target.q,target.r))):[];
      const charKickAlert=mode.type==="char-kick"?`<div class="char-kick-alert"><strong>CHAR KICK</strong><span>DAMAGE 1</span><small>${draftKick?`ทำ Damage เพื่อยืนยัน Dash · TL${movementDraft?.cost??0}`:"เลือก UNIT หรือ GARRISON ศัตรูที่ติดกัน"}</small></div>`:"";
      const kickButtons=mode.type==="char-kick"?[
        ...kickUnitTargets.map(target=>`<button class="command-item char-kick-damage" data-char-kick-unit="${target.id}"><span>ทำ Damage 1</span><small>${target.name}</small></button>`),
        ...kickGarrisonTargets.map(target=>`<button class="command-item char-kick-damage" data-char-kick-garrison="${target.id}"><span>ทำ Damage 1</span><small>${teamMeta(target.team).short} Garrison</small></button>`)
      ].join(""):"";
      const pushAlert=mode.type==="push-direction"?`<div class="char-kick-alert push-direction-alert"><strong>PUSH</strong><span>UP TO ${mode.remaining} HEX</span><small>เลือก Hex สีแดงที่ไกลจากต้นทางขึ้นทีละช่อง · หรือหยุดได้ทันที</small></div>`:"";
      const pullAlert=mode.type==="pull-target"?`<div class="char-kick-alert push-direction-alert"><strong>PULL</strong><span>UP TO 1 HEX</span><small>เลือก Hex สีแดงที่ใกล้ผู้ดึงขึ้น · หรือเลือก Pull 0 เพื่อไม่เคลื่อนที่</small></div>`:"";
      const aoeConfirm=mode.type==="aoe-confirm";
      const backText=draftKick?"‹ Back · เปลี่ยนจุด Dash":aoeConfirm?"‹ Back · เปลี่ยนทิศ":"‹ Back";
      const backSub=draftKick?"SELECT DASH HEX AGAIN":aoeConfirm?"SELECT DIRECTION AGAIN":"CANCEL";
      const cancelButton=mode.required?"":`<button class="command-item" id="cancel-mode"><span>${backText}</span><small>${backSub}</small></button>`;
      const stopPushButton=mode.type==="push-direction"&&mode.canStop?`<button class="command-item" id="stop-push"><span>หยุด Push</span><small>ยืนยันระยะปัจจุบัน</small></button>`:"";
      const stopPullButton=mode.type==="pull-target"&&mode.canStop?`<button class="command-item" id="stop-pull"><span>Pull 0</span><small>ไม่เคลื่อนที่ · การโจมตียังดำเนินต่อ</small></button>`:"";
      const twinDirectionButtons=mode.type==="aoe-direction"?(mode.directionChoices||[]).map(choice=>`<button class="command-item" data-aoe-rotation="${choice.rotation}"><span>แนวยิง ${choice.rotation+1}</span><small>${choice.legal?`${choice.targets.length} TARGET${choice.targets.length===1?"":"S"}`:"PREVIEW"}</small></button>`).join(""):"";
      menu.innerHTML=`<div class="command-caption"><span>${mode.type.toUpperCase()}</span><span>${draftKick?"DASH DECISION":"SELECTING"}</span></div>${charKickAlert}${pushAlert}${pullAlert}<div class="command-list">${kickButtons}${twinDirectionButtons}${mode.type==="move"&&mode.allowStay?`<button class="command-item" id="stay-in-place"><span>อยู่ช่องเดิม</span><small>0 HEX</small></button>`:""}${stopPushButton}${stopPullButton}${cancelButton}</div>`;
      menu.querySelectorAll("[data-char-kick-unit]").forEach(button=>button.addEventListener("click",()=>{
        const target=state.units.find(candidate=>candidate.id===button.dataset.charKickUnit);
        const continuation=mode?.callback||null;
        if(target)resolveCharKickTarget(unit,target,continuation);
      }));
      menu.querySelectorAll("[data-char-kick-garrison]").forEach(button=>button.addEventListener("click",()=>{
        const target=state.garrisons.find(candidate=>candidate.id===button.dataset.charKickGarrison);
        const continuation=mode?.callback||null;
        if(target)resolveCharKickGarrisonTarget(unit,target,continuation);
      }));
      menu.querySelectorAll("[data-aoe-rotation]").forEach(button=>button.addEventListener("click",()=>previewTwinBusterDirection(Number(button.dataset.aoeRotation))));
      menu.querySelector("#stay-in-place")?.addEventListener("click",()=>completeMove(unit.q,unit.r));
      menu.querySelector("#stop-push")?.addEventListener("click",()=>mode?.stopCallback?.());
      menu.querySelector("#stop-pull")?.addEventListener("click",()=>mode?.stopCallback?.());
      menu.querySelector("#cancel-mode")?.addEventListener("click",()=>{const back=mode.returnMenu||"main";const onCancel=mode.onCancel;mode=null;menuOpen=true;menuView=back;if(onCancel)onCancel();renderAll();});
      positionCommandMenu(unit);
      return;
    }
    const a=state.activation;
    const deploying=unit.zone==="deploying";
    const annihilateUnavailable=unit.id==="barbatos-lupus-rex"&&unit.command?.id==="annihilate"&&(!unit.attackedWithRexClaws||!unit.weapons?.some(weapon=>weapon.id==="rex-claws"&&E.legalWeaponTargets(state,unit,weapon).length));
    const moveDistance=D.rules.advance.distance+unit.upgrades.speed+(unit.movementBonus||0);
    const dashDistance=D.rules.dash.distance+dashBonus(unit)+(unit.movementBonus||0);
    const item=(label,sub,action,disabled=false,cls="")=>`<button class="command-item ${cls}" data-menu-action="${action}" ${disabled?"disabled":""}><span>${label}</span><small>${sub}</small></button>`;
    const adjustingMove=movementDraft?.unitId===unit.id&&movementDraft.movementType==="advance";
    const adjustingDash=movementDraft?.unitId===unit.id&&movementDraft.movementType==="dash";
    if(adjustingDash&&movementDraft?.placed){
      const freeNote=movementDraft.cost===0?" · FREE TL0":"";
      const dashFollowUp=unit.id==="red-gundam"?"หลังยืนยันจะตรวจ Shuji Kick":(["chars-zaku","red-comet-zaku"].includes(unit.id)?"หลังยืนยันจะตรวจ Char Kick":"ความสามารถหลัง Dash จะ Resolve ตามปกติ");
      menu.innerHTML=`<div class="command-caption"><span>DASH PREVIEW</span><span>${unit.weaponBadge||unit.model}</span></div><div class="dash-preview-note"><strong>พร้อมยืนยันตำแหน่ง Dash</strong><small>ยืนยันเพื่อจบ Dash${freeNote} หรือเปลี่ยนตำแหน่งเพื่อหาเป้าหมายใหม่ · ${dashFollowUp}</small></div><div class="command-list">${item("ยืนยัน Dash",`TL${movementDraft.cost}${freeNote}`,"confirm-dash",false,"confirm-move")} ${item("เปลี่ยนตำแหน่ง","SELECT HEX AGAIN","adjust-dash")} ${item("ยกเลิก Dash","RETURN TO START","cancel-dash",false,"danger")}</div>`;
      menu.querySelectorAll("[data-menu-action]").forEach(btn=>btn.addEventListener("click",()=>{
        const action=btn.dataset.menuAction;
        if(action==="confirm-dash"){
          const afterEffects=movementDraft?.afterEffects;const skipCharKick=!!movementDraft?.charDash;
          menuOpen=false;commitMovementDraft(()=>{if(afterEffects)afterEffects();else menuOpen=true;renderAll();},{skipCharKick});return;
        }
        if(action==="adjust-dash"){openMovementDraft(unit);return;}
        if(action==="cancel-dash"){cancelMovementDraft();return;}
      }));
      positionCommandMenu(unit);
      return;
    }
    const main=(deploying?[
      item("Deploy Move",unit.statuses.slow?"CLEAR SLOW":`${moveDistance} HEX`,"advance",false),
      item("Unit Card","INFO","info"),
      item("Wait","LEAVE BASE FIRST","end",true,"danger")
    ]:[
      item(adjustingMove?"ปรับตำแหน่ง Move":"Move",adjustingMove?"เลือกใหม่ในพื้นที่เดิม":unit.statuses.slow?"CLEAR SLOW":`${moveDistance} HEX`,"advance",a.advanced&&!adjustingMove),
      item("Attack","WEAPON","attack-menu",a.actionUsed),
      item(adjustingDash?"ปรับตำแหน่ง Dash":"Dash",adjustingDash?"เลือกใหม่ในพื้นที่เดิม":`${dashDistance} HEX · TL${D.rules.dash.timeline}`,"dash",a.actionUsed&&!adjustingDash),
      item("Energize","+1 ENERGY · TL2","energize",a.actionUsed),
      item("Rescue","GARRISON · TL2","rescue",a.actionUsed||!hasOwnGarrisonInRange(unit)),
      unit.command?item(unit.command.name,attackPrepCommandExpired(unit,unit.command)?"NO ATTACK LEFT":unit.command.energy?`⚡${unit.command.energy}`:"COMMAND","ability",!canUseCommandAbility(unit,unit.command)||annihilateUnavailable):"",
      unit.command2?item(unit.command2.name,attackPrepCommandExpired(unit,unit.command2)?"NO ATTACK LEFT":unit.command2.energy?`⚡${unit.command2.energy}`:"COMMAND","ability2",!canUseCommandAbility(unit,unit.command2)):"",
      item("Tactic",`${state.hands[unit.team].filter(id=>!isUsed(id,unit.team)).length} CARDS`,"tactics"),
      item("Unit Card","INFO","info"),
      item("Wait",a.actionUsed?"END":"PRIMARY ACTION REQUIRED","end",!a.actionUsed,"danger")
    ]).join("");
    const weapons=unit.weapons.map((weapon,index)=>item(weapon.name,`R${weapon.range}${weapon.ignoreLos?" · IGNORE LOS":""} · S${weapon.strength} · TL${weapon.timeline}`,`weapon-${index}`,a.actionUsed)).join("")+item("‹ Back","COMMAND","back");
    const energizeMenu=item("Confirm Energize","+1 ENERGY · TL2","confirm-energize")+item("‹ Back","COMMAND","back");
    const menuLabel=menuView==="weapons"?"WEAPON":menuView==="energize"?"ENERGIZE":"COMMAND";
    const menuItems=menuView==="weapons"?weapons:menuView==="energize"?energizeMenu:main;
    menu.innerHTML=`<div class="command-caption"><span>${menuLabel}</span><span>${unit.weaponBadge||unit.model}</span></div><div class="command-list">${menuItems}</div>`;
    menu.querySelectorAll("[data-menu-action]").forEach(btn=>btn.addEventListener("click",()=>{
      if(isAiTeam(unit.team))return;
      const action=btn.dataset.menuAction;
      if(action==="attack-menu"){menuView="weapons";renderActions();return;}
      if(action==="energize"){menuView="energize";renderActions();return;}
      if(action==="confirm-energize"){menuOpen=false;menuView="main";handleAction("energize");return;}
      if(action==="back"){menuView="main";renderActions();return;}
      if(action.startsWith("weapon-")){
        const weapon=unit.weapons[Number(action.split("-")[1])];
        menuOpen=false;
        if(movementDraft)commitMovementDraft(()=>beginAttack(weapon));else beginAttack(weapon);
        return;
      }
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

  function attackResolutionBusy() {
    return !!(attackTargetingBusy || pendingAttack || diceAnimationTimer || diceRollInterval || $("#dice-roll-overlay")?.classList.contains("show"));
  }

  function renderHand() {
    const unit=activeUnit(); if (!unit) return;
    const handTeam=matchMode==="ai"?humanTeam:unit.team;
    if(!handTeam)return;
    const deckSize=(D.tacticDecks?.[factionForSide(handTeam)]||[]).length;
    $("#hand-title").textContent=`${teamName(handTeam)} · ${matchMode==="ai"?"YOUR ":""}HAND ${state.hands[handTeam].length} / ${deckSize}`;
    const hand=state.hands[handTeam].map(id=>getTactic(id,handTeam));
    $("#tactic-hand").innerHTML=hand.map(card=>{
      const used=isUsed(card.id,handTeam);
      const humanCommandTurn=unit.team===handTeam&&!isAiTeam(unit.team);
      const legal=!used && humanCommandTurn && ["COMMAND","ATTACK"].includes(card.timing) && !state.activation.tacticUsed[handTeam] && !mode && !attackResolutionBusy() && !(card.timing==="ATTACK"&&state.activation.actionUsed);
      const stateLabel=used?"USED · VIEW":legal?"VIEW · CONFIRM":card.timing==="RESPONSE"?"VIEW · RESPONSE":"VIEW · "+card.timing;
      return `<button class="tactic-card ${used?"used":legal?"legal":""}" data-card="${card.id}" aria-label="${card.name}"><img src="${card.card}" alt="การ์ดจริง ${card.name}"><span class="card-state">${stateLabel}</span></button>`;
    }).join("");
    $("#tactic-hand").querySelectorAll("[data-card]").forEach(card=>card.addEventListener("click",()=>handleTactic(card.dataset.card)));
  }

  function renderLog() {
    const log=$("#battle-log");
    log.replaceChildren(...state.log.map(item=>{const li=document.createElement("li");li.textContent=String(item);return li;}));
    $("#dice-tray").innerHTML=lastDice?lastDice.dice.map((die,i)=>{
      const sharedClass=lastDice.aoeDisplay?.dice?.[i]?.visualClass||(lastDice.results?.[i]==="critical"?"critical":"");
      const outcomeClass=lastDice.sharedThreshold?sharedClass:lastDice.results[i];
      return `<span class="die ${outcomeClass||""}">${die}</span>`;
    }).join(""):"<span class=\"chip\">ยังไม่มี Attack Roll</span>";
  }

  function sharedAoeDiceDisplay(attacker,weapon,dice,targets) {
    const entries=(targets||[]).filter(Boolean).map((target,index)=>{
      const surrogate=target.weapons?target:{...target,upgrades:{shield:0,speed:0,strength:0},statuses:{slow:false,fracture:false,disarm:false}};
      const result=E.attackResultFromDice(state,attacker,surrogate,weapon,dice,{criticalEffectsDisabled:false});
      return {index:index+1,target,result,name:target.name||`Garrison ${index+1}`};
    });
    const diceMeta=dice.map((die,dieIndex)=>{
      const groups={critical:[],hit:[],miss:[]};
      entries.forEach(entry=>groups[entry.result.results[dieIndex]]?.push(entry.index));
      const parts=[];
      if(groups.critical.length)parts.push(`CRIT ${groups.critical.join(",")}`);
      if(groups.hit.length)parts.push(`HIT ${groups.hit.join(",")}`);
      if(groups.miss.length)parts.push(`MISS ${groups.miss.join(",")}`);
      const visualClass=groups.critical.length?"critical":groups.hit.length&&groups.miss.length?"split":groups.hit.length?"hit":"miss";
      return {die,visualClass,label:parts.join(" · ")||"—",groups};
    });
    return {targets:entries.map(entry=>({index:entry.index,name:entry.name,hits:entry.result.hits,criticals:entry.result.criticals})),dice:diceMeta};
  }

  function diceTargetLegendHtml(display) {
    if(!display?.targets?.length)return "";
    return `<div class="dice-target-legend" aria-label="AoE target numbers">${display.targets.map(target=>`<span><b>${target.index}</b>${escapeFxText(target.name)}</span>`).join("")}</div>`;
  }

  function diceItemHtml(die,index) {
    return `<div class="dice-result-item" data-dice-item="${index}"><div class="rolling-d10" data-index="${index}" data-final="${die}"><span class="dice-face">?</span></div><small class="dice-outcome">ROLL</small></div>`;
  }

  function revealDiceNode(node,result,index,sharedThreshold,display) {
    const item=node.closest(".dice-result-item");
    const outcome=item?.querySelector(".dice-outcome");
    node.querySelector(".dice-face").textContent=String(result.dice[index]);
    const meta=display?.dice?.[index];
    if(sharedThreshold&&meta){
      node.classList.add("revealed",meta.visualClass);
      item?.classList.add(meta.visualClass);
      if(outcome)outcome.textContent=meta.label;
      node.setAttribute("aria-label",`Die ${index+1}: ${result.dice[index]} — ${meta.label}`);
      return;
    }
    const classification=result.results[index];
    node.classList.add("revealed",classification);
    item?.classList.add(classification);
    if(outcome)outcome.textContent=classification==="critical"?"CRIT":classification.toUpperCase();
    node.setAttribute("aria-label",`Die ${index+1}: ${result.dice[index]} ${classification}`);
  }

  function showDiceRoll(result, label, onComplete=()=>{}, options={}) {
    const sharedThreshold=!!(options.sharedThreshold||result?.sharedThreshold);
    const display=options.aoeDisplay||result?.aoeDisplay||null;
    const manualClose=!!options.manualClose;
    let overlay=$("#dice-roll-overlay");
    if(!overlay){
      overlay=document.createElement("div");
      overlay.id="dice-roll-overlay";
      overlay.className="dice-roll-overlay";
      overlay.setAttribute("role","dialog");
      overlay.setAttribute("aria-modal","true");
      overlay.setAttribute("aria-label","Attack dice results");
      document.body.appendChild(overlay);
    }
    if(diceAnimationTimer)clearTimeout(diceAnimationTimer);
    if(diceRollInterval)clearInterval(diceRollInterval);
    const dice=result.dice.map((die,index)=>diceItemHtml(die,index)).join("");
    overlay.innerHTML=`<div class="dice-roll-card"><button type="button" class="dice-roll-close" aria-label="Close dice results" title="Close" disabled>×</button><span class="eyebrow">D10 // ${escapeFxText(label)}</span><h2 class="dice-roll-title">ROLLING…</h2><div class="animated-dice-grid">${dice}</div>${diceTargetLegendHtml(display)}<div class="dice-roll-summary" aria-live="polite">ROLLING</div><div class="dice-roll-actions"><button type="button" class="primary-btn dice-roll-ok" ${manualClose?"":"hidden"} disabled>OK</button></div></div>`;
    overlay.classList.add("show");
    overlay.tabIndex=-1;
    lockResolutionModal(overlay,".dice-roll-close:not(:disabled),.dice-roll-ok:not(:disabled)");
    overlay.focus({preventScroll:true});
    const nodes=[...overlay.querySelectorAll(".rolling-d10")];
    const closeButton=overlay.querySelector(".dice-roll-close");
    const okButton=overlay.querySelector(".dice-roll-ok");
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const rollTime=reduced?80:850;
    const holdTime=(reduced?220:700)+(options.aiRoll?1000:0);
    const epoch=gameEpoch;
    let completed=false;
    const finish=()=>{
      if(completed)return;
      completed=true;
      if(diceAnimationTimer){clearTimeout(diceAnimationTimer);diceAnimationTimer=null;}
      if(diceRollInterval){clearInterval(diceRollInterval);diceRollInterval=null;}
      releaseResolutionModalLock(overlay);
      overlay.classList.remove("show");
      onComplete();
    };
    closeButton?.addEventListener("click",finish);
    okButton?.addEventListener("click",finish);
    diceRollInterval=setInterval(()=>nodes.forEach(node=>{node.querySelector(".dice-face").textContent=String(Math.floor(visualRandom()*10)+1);}),reduced?80:65);
    diceAnimationTimer=setTimeout(()=>{
      if(epoch!==gameEpoch){if(diceRollInterval)clearInterval(diceRollInterval);diceRollInterval=null;return;}
      clearInterval(diceRollInterval);
      diceRollInterval=null;
      nodes.forEach((node,index)=>revealDiceNode(node,result,index,sharedThreshold,display));
      closeButton.disabled=false;
      if(manualClose&&okButton){okButton.hidden=false;okButton.disabled=false;}
      overlay.querySelector(".dice-roll-title").textContent=sharedThreshold?"SHARED ATTACK ROLL":result.criticals?"CRITICAL!":"ATTACK ROLL";
      overlay.querySelector(".dice-roll-summary").textContent=sharedThreshold?`${result.criticals} CRITICAL · RESULTS BY TARGET`:`${result.hits} HIT · ${result.criticals} CRITICAL`;
      if(manualClose&&!options.keepOpen){
        diceAnimationTimer=null;
        (okButton||closeButton).focus({preventScroll:true});
        return;
      }
      diceAnimationTimer=setTimeout(()=>{
        if(epoch!==gameEpoch||completed)return;
        completed=true;
        if(!options.keepOpen){releaseResolutionModalLock(overlay);overlay.classList.remove("show");}
        diceAnimationTimer=null;
        onComplete();
      },holdTime);
    },rollTime);
  }

  function appendDiceRoll(result,startIndex,label,onComplete=()=>{},options={}) {
    const overlay=$("#dice-roll-overlay");
    const grid=overlay?.querySelector(".animated-dice-grid");
    const existing=grid?[...grid.querySelectorAll(".rolling-d10")]:[];
    if(!overlay?.classList.contains("show")||!grid||existing.length!==startIndex){
      showDiceRoll(result,label,onComplete,{manualClose:!!options.manualClose,aiRoll:!!options.aiRoll});
      return;
    }
    if(diceAnimationTimer)clearTimeout(diceAnimationTimer);
    if(diceRollInterval)clearInterval(diceRollInterval);
    const extra=result.dice.slice(startIndex);
    if(!extra.length){releaseResolutionModalLock(overlay);overlay.classList.remove("show");onComplete();return;}
    extra.forEach((die,offset)=>{
      const index=startIndex+offset;
      grid.insertAdjacentHTML("beforeend",diceItemHtml(die,index));
    });
    const newNodes=[...grid.querySelectorAll(".rolling-d10")].slice(startIndex);
    const priorResults=result.results.slice(0,startIndex);
    const priorHits=priorResults.filter(outcome=>outcome==="hit").length;
    const priorCriticals=priorResults.filter(outcome=>outcome==="critical").length;
    overlay.querySelector(".eyebrow").textContent=`D10 // ${label}`;
    overlay.querySelector(".dice-roll-title").textContent=`CRITICAL · +${extra.length} DICE`;
    overlay.querySelector(".dice-roll-summary").textContent=`${priorHits} HIT · ${priorCriticals} CRITICAL · +${extra.length} DICE`;
    const oldClose=overlay.querySelector(".dice-roll-close");
    const oldOk=overlay.querySelector(".dice-roll-ok");
    if(oldClose)oldClose.disabled=true;
    if(oldOk){oldOk.disabled=true;if(options.manualClose)oldOk.hidden=false;}
    const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const rollTime=reduced?80:850;
    const holdTime=(reduced?220:700)+(options.aiRoll?1000:0);
    const epoch=gameEpoch;
    let completed=false;
    const finish=()=>{
      if(completed)return;
      completed=true;
      if(diceAnimationTimer){clearTimeout(diceAnimationTimer);diceAnimationTimer=null;}
      if(diceRollInterval){clearInterval(diceRollInterval);diceRollInterval=null;}
      releaseResolutionModalLock(overlay);
      overlay.classList.remove("show");
      onComplete();
    };
    const replacement=oldClose?.cloneNode(true);
    if(oldClose&&replacement){oldClose.replaceWith(replacement);replacement.addEventListener("click",finish);}
    const okReplacement=oldOk?.cloneNode(true);
    if(oldOk&&okReplacement){oldOk.replaceWith(okReplacement);okReplacement.addEventListener("click",finish);}
    diceRollInterval=setInterval(()=>newNodes.forEach(node=>{node.querySelector(".dice-face").textContent=String(Math.floor(visualRandom()*10)+1);}),reduced?80:65);
    diceAnimationTimer=setTimeout(()=>{
      if(epoch!==gameEpoch){if(diceRollInterval)clearInterval(diceRollInterval);diceRollInterval=null;return;}
      clearInterval(diceRollInterval);
      diceRollInterval=null;
      newNodes.forEach(node=>{const index=Number(node.dataset.index);revealDiceNode(node,result,index,false,null);});
      const closeButton=overlay.querySelector(".dice-roll-close");
      const okButton=overlay.querySelector(".dice-roll-ok");
      if(closeButton)closeButton.disabled=false;
      if(options.manualClose&&okButton){okButton.hidden=false;okButton.disabled=false;}
      overlay.querySelector(".dice-roll-title").textContent=result.criticals?"CRITICAL! · EXTRA DICE":"ATTACK ROLL · EXTRA DICE";
      overlay.querySelector(".dice-roll-summary").textContent=`${result.hits} HIT · ${result.criticals} CRITICAL`;
      if(options.manualClose){
        diceAnimationTimer=null;
        (okButton||closeButton)?.focus({preventScroll:true});
        return;
      }
      diceAnimationTimer=setTimeout(()=>{
        if(epoch!==gameEpoch||completed)return;
        completed=true;releaseResolutionModalLock(overlay);overlay.classList.remove("show");diceAnimationTimer=null;onComplete();
      },holdTime);
    },rollTime);
  }

  function keepVulcanDiceOpen(weapon,result){
    return weapon?.id==="hero-vulcan"&&weapon.critical==="extraDice2"&&!result?.disarmedPending&&criticalEffectsActive(result)&&!result.extraDiceResolved;
  }

  function showAttackDiceRoll(result,weapon,label,onComplete=()=>{},attacker=null){
    const keepOpen=keepVulcanDiceOpen(weapon,result);
    const ownerTeam=attacker?.team||result?.displayOwnerTeam||activeUnit()?.team||null;
    showDiceRoll(result,label,onComplete,{keepOpen,manualClose:!!ownerTeam&&!isAiTeam(ownerTeam)&&!keepOpen,aiRoll:!!ownerTeam&&isAiTeam(ownerTeam)});
  }

  function offerAnotherTimeline(attacker,defender,weapon,result,onComplete=()=>{}) {
    const owner=attacker?.team;
    if(!owner||!factionHasTactic(owner,"another-timeline")||!inHand(owner,"another-timeline")||isUsed("another-timeline",owner)||state.activation.tacticUsed[owner]){onComplete();return;}
    const card=getTactic("another-timeline",owner);
    const reroll=()=>{
      useResponse(card);closeModal();
      const fresh=E.rerollAttackPool(state,attacker,defender,weapon,result);
      Object.keys(result).forEach(key=>delete result[key]);
      Object.assign(result,fresh);
      lastDice=result;
      if(pendingAttack)pendingAttack.result=result;
      addLog(`Another Timeline: ${attacker.name} ทอย Attack Dice ใหม่ทั้งชุดและใช้ผลใหม่`);
      renderAll();showAttackDiceRoll(result,weapon,"ANOTHER TIMELINE",onComplete,attacker);
    };
    openResponse([card],()=>reroll(),onComplete,{attackRollDamage:result.damage,criticals:result.criticals,hits:result.hits,diceCount:result.dice.length});
  }

  function offerNewtypeReroll(attacker, defender, weapon, result, onComplete) {
    const choices=result.rerollEligible ? result.results.map((outcome,index)=>outcome==="miss"?index:-1).filter(index=>index>=0) : [];
    if(!choices.length){onComplete();return;}
    if(isAiTeam(attacker.team)){
      const index=choices.sort((a,b)=>result.dice[a]-result.dice[b])[0];
      const previous=result.dice[index];
      E.rerollAttackDie(state,attacker,defender,weapon,result,index);
      const rerollView={dice:[result.dice[index]],results:[result.results[index]],hits:result.results[index]==="hit"?1:0,criticals:result.results[index]==="critical"?1:0};
      lastDice=result;addLog(`AI · Newtype Instincts: ทอยลูกที่ ${index+1} ใหม่ ${previous} → ${result.dice[index]}`);renderAll();
      showDiceRoll(rerollView,"NEWTYPE INSTINCTS",onComplete,{manualClose:!isAiTeam(attacker.team),aiRoll:isAiTeam(attacker.team)});
      return;
    }
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card newtype-modal"><span class="eyebrow">ONGOING // AFTER ATTACK ROLL</span><h2>Newtype Instincts</h2><p>เลือกทอยใหม่ได้ 1 ลูกเฉพาะลูกที่พลาด (Miss) หรือเก็บผลเดิมไว้</p><div class="reroll-picker">${choices.map(index=>`<button data-reroll-index="${index}" aria-label="ทอยลูกที่ ${index+1} ผล ${result.dice[index]} ใหม่"><span class="die ${result.results[index]}">${result.dice[index]}</span><small>ลูกที่ ${index+1} · REROLL</small></button>`).join("")}</div><div class="modal-actions"><button class="action-btn" id="skip-newtype">ไม่ทอยใหม่ <span>KEEP ROLL</span></button></div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);
    modal.querySelectorAll("[data-reroll-index]").forEach(button=>button.addEventListener("click",()=>{
      const index=Number(button.dataset.rerollIndex);const previous=result.dice[index];
      E.rerollAttackDie(state,attacker,defender,weapon,result,index);
      const rerollView={dice:[result.dice[index]],results:[result.results[index]],hits:result.results[index]==="hit"?1:0,criticals:result.results[index]==="critical"?1:0};
      lastDice=result;addLog(`Newtype Instincts: Gundam ทอยลูกที่ ${index+1} ใหม่ ${previous} → ${result.dice[index]}`);closeModal();renderAll();
      showDiceRoll(rerollView,"NEWTYPE INSTINCTS",onComplete,{manualClose:!isAiTeam(attacker.team),aiRoll:isAiTeam(attacker.team)});
    }));
    modal.querySelector("#skip-newtype").addEventListener("click",()=>{result.rerollEligible=false;closeModal();onComplete();});
  }

  function resolveDisarmReroll(attacker,defender,weapon,result,onComplete=()=>{}) {
    if(!result?.disarmedPending){onComplete();return;}
    const before=result.dice.slice();
    const sharedTargets=result.sharedThreshold?(attacker.lastAoeTargets||[]):[];
    if(sharedTargets.length)E.resolveSharedDisarmAttack(state,attacker,sharedTargets,weapon,result);
    else E.resolveDisarmAttack(state,attacker,defender,weapon,result);
    if(sharedTargets.length)result.aoeDisplay=sharedAoeDiceDisplay(attacker,weapon,result.dice,sharedTargets);
    lastDice=result;
    const changes=(result.disarmRerolled||[]).map(index=>`${before[index]}→${result.dice[index]}`);
    addLog(`${attacker.name}: Disarm ${changes.length?`ทอย Hit ใหม่ ${changes.join(", ")}`:"ไม่มีผล Hit ให้ทอยใหม่"} และปิด Critical Effect ของการโจมตีนี้`);
    renderAll();
    if(changes.length)showDiceRoll(result,"DISARM",onComplete,{sharedThreshold:!!result.sharedThreshold,aoeDisplay:result.aoeDisplay,manualClose:!isAiTeam(attacker.team),aiRoll:isAiTeam(attacker.team)});
    else onComplete();
  }

  function handleAction(action) {
    if(attackTargetingBusy)return;
    const unit=activeUnit(); if (!unit || mode) return;
    if(movementDraft){
      if(action===movementDraft.movementType){openMovementDraft(unit);return;}
      commitMovementDraft(()=>handleAction(action));return;
    }
    if (action==="advance") {
      if (unit.statuses.slow) {
        unit.statuses.slow=false; state.activation.advanced=true; payTimeline(unit,D.rules.advance.timeline);
        addLog(`${unit.name} ใช้ Advance เพื่อลบ Slow และไม่เคลื่อนที่ (TL 0)`); renderAll(); return;
      }
      if(!isAiTeam(unit.team)){beginAdjustableAdvance(unit);return;}
      startMove(D.rules.advance.distance+unit.upgrades.speed+(unit.movementBonus||0),D.rules.advance.timeline,"Advance",moved=>afterUnitMove(unit,"advance",null,moved));
    } else if (action==="dash") {
      if(!isAiTeam(unit.team)){
        if(["chars-zaku","red-comet-zaku"].includes(unit.id))beginAdjustableCharDash(unit,D.rules.dash.timeline,"Dash",null,{primaryAction:true});
        else beginAdjustableDash(unit);
        return;
      }
      startMove(D.rules.dash.distance+dashBonus(unit)+(unit.movementBonus||0),D.rules.dash.timeline,"Dash",moved=>afterUnitMove(unit,"dash",null,moved),{primaryAction:true});
    } else if (action==="energize") {
      state.activation.actionUsed=true; payTimeline(unit,2); unit.energy+=1;
      addLog(`${unit.name} Energize: Energy +1`); renderAll();
    } else if (action==="rescue") rescueGarrison(unit,1,true);
    else if (action==="ability") useUnitAbility(unit,1);
    else if (action==="ability2") useUnitAbility(unit,2);
  }

  function startMove(allowance, cost, label, afterMove, options={}) {
    const unit=activeUnit();
    return startMoveFor(unit,allowance,cost,label,afterMove,options);
  }

  function beginAdjustableAdvance(unit) {
    const allowance=D.rules.advance.distance+(unit.upgrades.speed||0)+(unit.movementBonus||0);
    return beginAdjustableMovement(unit,allowance,D.rules.advance.timeline,"Advance","advance",false);
  }

  function beginAdjustableDash(unit) {
    const allowance=D.rules.dash.distance+dashBonus(unit)+(unit.movementBonus||0);
    return beginAdjustableMovement(unit,allowance,D.rules.dash.timeline,"Dash","dash",true);
  }

  function beginAdjustableCharDash(unit,cost,label,onComplete=null,options={}) {
    const started=beginAdjustableMovement(unit,D.rules.dash.distance+1,cost,label,"dash",!!options.primaryAction);
    if(started&&movementDraft?.unitId===unit.id){
      movementDraft.charDash=true;
      movementDraft.afterEffects=onComplete;
      movementDraft.onCommit=options.onCommit||null;
      movementDraft.onCancel=options.onCancel||onComplete||null;
    }
    return started;
  }

  function resolveBlockedDeployment(unit) {
    if(!unit||unit.zone!=="deploying")return false;
    unit.zone="reserve";unit.q=null;unit.r=null;
    unit.energy+=1;
    payTimeline(unit,2);
    state.resolvedThisTick.add(unit.id);
    state.lastActivatedTeam=unit.team;
    state.activeUnitId=null;
    state.justDeployedUnitId=null;
    mode=null;movementDraft=null;menuOpen=false;menuView="main";
    aiBusy=false;
    addLog(`${unit.name} ไม่มีช่อง Deploy ที่ถูกกติกา: Energize +1, Timeline +2 และกลับ Reserve`);
    renderAll();scheduleStartActivation();
    return true;
  }

  function beginAdjustableMovement(unit,allowance,cost,label,movementType,primaryAction) {
    if(!unit||unit.zone==="reserve")return false;
    if(movementDraft?.unitId===unit.id&&movementDraft.movementType===movementType)return openMovementDraft(unit);
    const engaged=E.engagedTargets(state,unit);
    const hasHover=unit.id==="wing-zero-ew"||unit.id==="gundam-epyon";
    const waterPenalty=!hasHover&&E.terrainAt(state,unit.q,unit.r)==="water"?1:0;
    const reachable=E.reachable(state,unit,allowance);
    const wasDeploying=unit.zone==="deploying";
    if(!reachable.size&&wasDeploying){
      resolveBlockedDeployment(unit);return false;
    }
    movementDraft={
      unitId:unit.id,
      origin:{q:unit.q,r:unit.r,zone:unit.zone},
      targets:new Set(reachable.keys()),
      allowance,
      effectiveAllowance:Math.max(0,allowance-(engaged.length?1:0)-waterPenalty),
      engaged:engaged.length>0, waterPenalty:waterPenalty>0,
      placed:false,
      cost,label,movementType,primaryAction
    };
    return openMovementDraft(unit);
  }

  function openMovementDraft(unit) {
    const draft=movementDraft;
    if(!draft||draft.unitId!==unit?.id)return false;
    // Adjustable movement targets are always calculated from the original hex.
    // If the unit was already previewed elsewhere, restore it to the origin while
    // selecting again so the highlighted range cannot look like extra movement.
    if(draft.placed&&(unit.q!==draft.origin.q||unit.r!==draft.origin.r)){
      unit.q=draft.origin.q; unit.r=draft.origin.r; unit.zone=draft.origin.zone;
      draft.placed=false;
      if(draft.primaryAction)state.activation.actionUsed=false;
      if(draft.movementType==="advance")state.activation.advanced=false;
    }
    // Rebuild the legal area from the saved origin every time the preview is reopened.
    // This prevents a previewed position from ever becoming a new movement origin
    // (most noticeable on Barbatos when several movement-capable actions are available).
    const refreshedTargets=E.reachable(state,unit,draft.allowance);
    draft.targets=new Set(refreshedTargets.keys());
    mode={
      type:"move",unitId:unit.id,targets:new Set(draft.targets),cost:0,label:draft.label,afterMove:null,
      primaryAction:draft.primaryAction,allowStay:false,adjustableMovement:true,returnMenu:"main",
      origin:{q:draft.origin.q,r:draft.origin.r},allowance:draft.allowance,reachOptions:{},onCancel:()=>cancelMovementDraft(),
      hint:`${draft.label}: เลือกตำแหน่งใหม่ภายในพื้นที่เดิม (งบ ${draft.effectiveAllowance}${draft.engaged||draft.waterPenalty?` จาก ${draft.allowance}${draft.engaged?" · ENGAGED -1":""}${draft.waterPenalty?" · WATER -1":""}`:""}) — ยืนยันเมื่อเลือก Action อื่น`
    };
    menuOpen=true;renderAll();return true;
  }

  function cancelMovementDraft() {
    const draft=movementDraft;
    if(!draft)return false;
    const unit=state.units.find(candidate=>candidate.id===draft.unitId);
    movementDraft=null;
    if(!unit){if(draft.onCancel)draft.onCancel();return false;}
    unit.q=draft.origin.q;unit.r=draft.origin.r;unit.zone=draft.origin.zone;
    if(draft.movementType==="dash"&&draft.primaryAction)state.activation.actionUsed=false;
    if(draft.movementType==="advance")state.activation.advanced=false;
    mode=null;menuOpen=true;menuView="main";
    addLog(`${unit.name} ยกเลิก ${draft.label} และกลับตำแหน่งเดิม`);
    renderAll();
    if(draft.onCancel)draft.onCancel();
    return true;
  }

  function commitMovementDraft(onComplete=()=>{},options={}) {
    const draft=movementDraft;
    if(!draft){onComplete();return;}
    const unit=state.units.find(candidate=>candidate.id===draft.unitId);
    movementDraft=null;
    if(!unit){onComplete();return;}
    const moved=unit.q!==draft.origin.q||unit.r!==draft.origin.r||draft.origin.zone==="deploying";
    if(!moved&&draft.origin.zone!=="deploying"){
      unit.q=draft.origin.q;unit.r=draft.origin.r;unit.zone=draft.origin.zone;
      if(draft.primaryAction)state.activation.actionUsed=false;
      if(draft.movementType==="advance")state.activation.advanced=false;
      addLog(`${unit.name}: ${draft.label} ต้องจบต่างจากช่องเริ่มต้น`);renderAll();onComplete();return;
    }
    payTimeline(unit,draft.cost);
    const pickups=E.pickupAt(state,unit);
    playPickupFeedback(unit,pickups);
    if(draft.movementType==="dash")SFX.dash();
    if(draft.primaryAction)state.activation.actionUsed=true;
    if(draft.movementType==="advance")state.activation.advanced=true;
    state.justDeployedUnitId=null;
    if(draft.onCommit)draft.onCommit();
    addLog(`${unit.name} ยืนยัน ${draft.label} ที่ Hex ${unit.q},${unit.r}`);
    const finish=()=>{renderAll();onComplete();};
    const resolveResponses=()=>afterUnitMove(unit,draft.movementType,finish,moved,{skipCharKick:!!options.skipCharKick});
    // The active player's committed Char Kick resolves before the opponent's
    // movement Responses, but all costs and pickups must already be committed.
    if(options.beforeMovementResponses)options.beforeMovementResponses(resolveResponses);
    else resolveResponses();
    renderAll();
  }

  function startMoveFor(unit,allowance,cost,label,afterMove,options={}) {
    if(!unit||unit.zone==="reserve")return false;
    const engaged=options.ignoreEngagement?[]:E.engagedTargets(state,unit);
    const hasHover=unit.id==="wing-zero-ew"||unit.id==="gundam-epyon";
    const waterPenalty=!options.ignoreWater&&!hasHover&&E.terrainAt(state,unit.q,unit.r)==="water"?1:0;
    const effectiveAllowance=Math.max(0,allowance-(engaged.length?1:0)-waterPenalty);
    const reachable=E.reachable(state,unit,allowance,{ignoreElevation:!!options.ignoreElevation||unit.id==="wing-zero-ew"||unit.id==="gundam-epyon",ignoreEngagement:!!options.ignoreEngagement});
    if(options.destinationFilter){for(const target of [...reachable.keys()]){const [q,r]=E.fromKey(target);if(!options.destinationFilter({q,r}))reachable.delete(target);}}
    if(!reachable.size&&unit.zone==="deploying"){
      resolveBlockedDeployment(unit);return false;
    }
    // Once a Move/Dash is chosen it must end in another hex (p.14). Optional
    // Critical follow-ups opt into staying explicitly so declining them remains legal.
    const allowStay=options.allowStay??false;
    if(!reachable.size&&!allowStay){addLog(`${label}: ไม่มีช่องปลายทางที่ถูกกติกา`);renderAll();return false;}
    mode={type:"move",unitId:unit.id,targets:new Set(reachable.keys()),cost,label,afterMove,primaryAction:!!options.primaryAction,allowStay,returnMenu:options.returnMenu||"main",onCancel:options.onCancel,origin:{q:unit.q,r:unit.r},allowance,reachOptions:{ignoreElevation:!!options.ignoreElevation||unit.id==="wing-zero-ew"||unit.id==="gundam-epyon",ignoreEngagement:!!options.ignoreEngagement},hint:`${label}: เลือกช่องสีฟ้า (งบการเคลื่อนที่ ${effectiveAllowance}${engaged.length||waterPenalty?` จาก ${allowance}${engaged.length?" · ENGAGED -1":""}${waterPenalty?" · WATER -1":""}`:""}${hasHover?"; HOVER: ไม่สนผลภูมิประเทศระหว่างเคลื่อนที่":"; การขึ้นที่สูงใช้เพิ่ม 1 ต่อระดับ"})`};
    menuOpen=true;
    renderAll();
    return true;
  }

  function previewTwinBusterDirection(rotation) {
    const unit=modeUnit();
    if(!unit||mode?.type!=="aoe-direction")return false;
    const choice=mode.directionChoices?.find(entry=>entry.rotation===rotation);
    const callback=mode.callback;
    if(!choice||!callback)return false;
    const directionMode=mode;
    const preview=twinBusterPreview(unit,choice.rotation,mode.weapon);
    const weaponName=mode.weapon?.name||"AoE Attack";
    const canFire=!!choice.legal;
    mode={
      type:"aoe-confirm",unitId:unit.id,
      previewTargets:new Set(preview.visible.map(hex=>E.key(hex.q,hex.r))),
      targets:canFire?new Set(preview.visible.map(hex=>E.key(hex.q,hex.r))):new Set(),
      blockedTargets:new Set(preview.blocked.map(hex=>E.key(hex.q,hex.r))),
      hint:canFire
        ?`${weaponName}: แดง = ยิงถึง · เทา = อยู่หลังพื้นที่สูงที่บัง · เป้าหมาย ${choice.targets.length} จุด — คลิกช่องสีแดงเพื่อยืนยัน`
        :`${weaponName}: แดง = แนวยิง · เทา = อยู่หลังพื้นที่สูงที่บัง · ทิศนี้ไม่มีเป้าหมายที่ยิงได้ — Back เพื่อเปลี่ยนทิศ`,
      callback:canFire?()=>callback(choice.rotation):null,required:false,returnMenu:directionMode.returnMenu||"weapons",
      onCancel:()=>{mode=directionMode;menuOpen=true;}
    };
    menuOpen=true;renderAll();return true;
  }

  function handleHexClick(q,r,event=null) {
    if(event?.currentTarget?.classList?.contains("unit-node"))event.stopPropagation();
    if(attackTargetingBusy)return;
    const controllingUnit=modeUnit();
    if(controllingUnit&&isAiTeam(controllingUnit.team)&&!aiPerforming)return;
    if (!mode) {
      const clicked=state.units.find(x=>x.zone!=="reserve"&&x.q===q&&x.r===r);
      if(clicked?.id===state.activeUnitId){
        const boardBounds=$("#board")?.getBoundingClientRect?.();
        const unitBounds=event?.currentTarget?.getBoundingClientRect?.();
        const unitCenter=unitBounds?.width?unitBounds.left+unitBounds.width/2:event?.clientX;
        if(boardBounds?.width&&Number.isFinite(unitCenter))menuPlacement=unitCenter<boardBounds.left+boardBounds.width/2?"right":"left";
        menuOpen=true;
        menuView="main";
        renderActions();
      }
      else if(clicked){
        menuOpen=false;
        menuView="main";
        renderActions();
        showUnitCard(clicked);
      }
      else if(menuOpen){menuOpen=false;menuView="main";renderActions();}
      return;
    }
    const k=E.key(q,r); if (!mode.targets?.has(k)) return;
    const unit=modeUnit();
    if (mode.type==="move") {
      completeMove(q,r);
    } else if (mode.type==="attack") {
      SFX.unlock();
      const target=E.unitAt(state,q,r);
      const garrison=state.garrisons.find(g=>g.q===q&&g.r===r&&g.team!==unit.team);
      const weapon=mode.weapon; const free=mode.free; const onDeclare=mode.onDeclare; const onComplete=mode.onComplete; mode=null;
      if (target) {if(onDeclare)onDeclare();resolveAttack(unit,target,weapon,{free,onComplete});}
      else if (garrison) {if(onDeclare)onDeclare();resolveGarrisonAttack(unit,garrison,weapon,{free,onComplete});}
    } else if (mode.type==="select-unit") {
      const target=E.unitAt(state,q,r); const callback=mode.callback; mode=null;
      if (target) callback(target);
      renderAll();
    } else if (mode.type==="select-garrison") {
      const target=state.garrisons.find(g=>g.q===q&&g.r===r);const callback=mode.callback;mode=null;
      if(target)callback(target);
      renderAll();
    } else if (mode.type==="select-objective") {
      const target=state.objectives.find(objective=>objective.q===q&&objective.r===r);const callback=mode.callback;mode=null;
      if(target)callback(target);
      renderAll();
    } else if (mode.type==="char-kick") {
      const target=E.unitAt(state,q,r);
      const garrison=state.garrisons.find(item=>item.q===q&&item.r===r&&item.team!==unit.team);
      const callback=mode.callback;
      if(target&&target.team!==unit.team){
        if(resolveCharKickTarget(unit,target,callback))return;
      }
      if(garrison){
        if(resolveCharKickGarrisonTarget(unit,garrison,callback))return;
      }
      mode=null;if(callback)callback();renderAll();
    } else if (mode.type==="push-direction") {
      const option=mode.pushOptions?.find(candidate=>candidate.q===q&&candidate.r===r);
      const callback=mode.callback;
      if(!option||!callback)return;
      callback(option);
    } else if(mode.type==="pull-target"){
      const callback=mode.callback;mode=null;
      callback({q,r});
    } else if(mode.type==="aoe-direction"){
      const matching=mode.directionChoices?.filter(entry=>entry.q===q&&entry.r===r)||[];
      // Ambiguous map anchors are intentionally not clickable. At map edges two
      // rotations can project onto the same in-bounds Hex; the direction buttons in
      // the command panel remain the canonical six-way selector.
      if(matching.length===1)previewTwinBusterDirection(matching[0].rotation);
    } else if(mode.type==="aoe-confirm"){
      const callback=mode.callback;mode=null;if(callback)callback();
    }
  }

  function completeMove(q,r) {
    const unit=state.units.find(candidate=>candidate.id===mode?.unitId);if(!unit||mode?.type!=="move")return;
    const adjustableMovement=!!mode.adjustableMovement;const primaryAction=mode.primaryAction;const wasDeploying=unit.zone==="deploying";const callback=mode.afterMove;const label=mode.label;const cost=mode.cost;
    const moved=unit.q!==q||unit.r!==r;
    const staying=!moved;
    // Never trust a stale highlighted target: validate the destination again against
    // the movement budget immediately before committing the move. This hard guard
    // keeps every individual Barbatos Move/Exertion (and every other unit move)
    // inside its own printed allowance even after preview/reselection UI changes.
    if(!staying&&Number.isFinite(mode.allowance)){
      const legalNow=E.reachable(state,unit,mode.allowance,mode.reachOptions||{});
      if(!legalNow.has(E.key(q,r))){
        addLog(`${unit.name}: ตำแหน่ง ${label} เกินงบการเคลื่อนที่ — กรุณาเลือกใหม่`);
        if(adjustableMovement&&movementDraft){openMovementDraft(unit);}else renderAll();
        return;
      }
    }
    if(staying&&!mode.allowStay)return;
    if(adjustableMovement){
      unit.q=q;unit.r=r;unit.zone="board";
      if(movementDraft?.movementType==="advance")state.activation.advanced=true;
      if(movementDraft?.primaryAction)state.activation.actionUsed=true;
      if(movementDraft)movementDraft.placed=true;
      mode=null;menuOpen=true;menuView="main";
      addLog(`${unit.name} วางตำแหน่ง ${label} ที่ Hex ${q},${r} — ยังไม่คิด Timeline จนกว่าจะยืนยัน`);
      if(movementDraft?.charDash&&offerCharKickDraft(unit)){renderAll();return;}
      renderAll();return;
    }
    payTimeline(unit,cost);unit.q=q;unit.r=r;unit.zone="board";const pickups=E.pickupAt(state,unit);playPickupFeedback(unit,pickups);
    if(/dash/i.test(label)) SFX.dash();
    if(primaryAction)state.activation.actionUsed=true;
    if(label==="Advance")state.activation.advanced=true;
    if(wasDeploying)state.justDeployedUnitId=null;
    mode=null;addLog(`${unit.name} ใช้ ${label} ที่ Hex ${q},${r}`);if(callback)callback(moved);renderAll();
    // Keep the camera attached to the active AI after every committed movement.
    // The turn-start focus alone is not enough for long Advance/Dash/Command moves,
    // because the unit can otherwise leave the current board viewport.
    if(isAiTeam(unit.team)&&unit.zone==="board")focusCameraOnUnit(unit);
  }

  function adjacentCharKickTargets(unit) {
    const units=E.livingEnemies(state,unit).filter(target=>E.distance(unit,target)===1);
    const garrisons=state.garrisons.filter(target=>target.team!==unit.team&&E.distance(unit,target)===1);
    return {units,garrisons,all:[...units,...garrisons]};
  }

  function offerCharKickDraft(unit) {
    const draft=movementDraft;
    if(!draft?.charDash||draft.unitId!==unit.id)return false;
    const targets=adjacentCharKickTargets(unit);
    if(!targets.all.length)return false;
    addLog(`Char Kick: เลือก Unit หรือ Garrison ศัตรูที่ติดกันเพื่อทำ Damage 1 หรือ Back เพื่อเปลี่ยนจุด Dash`);
    mode={
      type:"char-kick",unitId:unit.id,targets:new Set(targets.all.map(target=>E.key(target.q,target.r))),
      returnMenu:"main",fromDashDraft:true,
      hint:`Char Kick: ทำ Damage 1 เพื่อยืนยัน ${draft.label} (TL${draft.cost}) หรือ Back เพื่อเปลี่ยนจุด Dash`,
      onCancel:()=>openMovementDraft(unit)
    };
    menuOpen=true;menuView="main";
    return true;
  }

  function resolveCharKickTarget(unit,target,continuation=null) {
    if(!unit||!target||target.team===unit.team)return false;
    const draft=movementDraft?.charDash&&movementDraft.unitId===unit.id?movementDraft:null;
    const dealKick=()=>{if(target.zone==="board")damageUnit(unit,target,1,"Char Kick");};
    const finishKick=()=>{
      const afterEffects=draft?.afterEffects||continuation;
      if(afterEffects)afterEffects();
      else {menuOpen=true;menuView="main";}
      renderAll();
    };
    mode=null;
    if(draft){
      addLog(`${unit.name} ยืนยัน ${draft.label}${draft.cost===0?" ฟรี":""} ด้วย Char Kick — Timeline +${draft.cost}`);
      commitMovementDraft(finishKick,{skipCharKick:true,beforeMovementResponses:next=>{dealKick();next();}});
    }else {dealKick();finishKick();}
    return true;
  }

  function resolveCharKickGarrisonTarget(unit,garrison,continuation=null) {
    if(!unit||!garrison||garrison.team===unit.team)return false;
    const draft=movementDraft?.charDash&&movementDraft.unitId===unit.id?movementDraft:null;
    const dealKick=()=>{
      if(!state.garrisons.some(target=>target.id===garrison.id))return;
      const info=damageGarrison(unit,garrison,1,"Char Kick");
      playDamageFeedback({to:{q:info.q,r:info.r},garrison:true,destroyed:info.destroyed});
    };
    const finishKick=()=>{
      const afterEffects=draft?.afterEffects||continuation;
      if(afterEffects)afterEffects();
      else {menuOpen=true;menuView="main";}
      renderAll();
    };
    mode=null;
    if(draft){
      addLog(`${unit.name} ยืนยัน ${draft.label}${draft.cost===0?" ฟรี":""} ด้วย Char Kick — Timeline +${draft.cost}`);
      commitMovementDraft(finishKick,{skipCharKick:true,beforeMovementResponses:next=>{dealKick();next();}});
    }else {dealKick();finishKick();}
    return true;
  }

  function adjacentShujiKickTargets(unit) {
    return E.livingEnemies(state,unit).filter(target=>E.distance(unit,target)===1);
  }

  function offerShujiKick(unit,afterEffects=null,movementOccurred=true) {
    const continueDash=()=>resolveMovementResponses(unit,"dash",afterEffects,movementOccurred);
    if(!unit||unit.id!=="red-gundam"||!movementOccurred){continueDash();return false;}
    const targets=adjacentShujiKickTargets(unit);
    if(!targets.length){continueDash();return false;}
    const resolveTarget=target=>{
      addLog(`Shuji Kick: ${target.name} ถูก Push up to 1`);
      beginPushDirection(unit,target,1,continueDash,"Shuji Kick");
    };
    if(isAiTeam(unit.team)){
      const target=targets.slice().sort((a,b)=>(b.vp||0)-(a.vp||0)||(a.hp||0)-(b.hp||0))[0];
      resolveTarget(target);
      return true;
    }
    mode={
      type:"select-unit",unitId:unit.id,targets:new Set(targets.map(target=>E.key(target.q,target.r))),
      hint:"Shuji Kick: เลือก Unit ศัตรูที่อยู่ติดกันเพื่อ Push up to 1 หรือยกเลิก Response",
      callback:resolveTarget,onCancel:continueDash,returnMenu:"main"
    };
    menuOpen=true;menuView="main";renderAll();return true;
  }

  function resolveMovementResponses(unit, movementType, afterEffects=null, movementOccurred=true) {
    const continueMovement=()=>{if(afterEffects)afterEffects();};
    if(!unit||!movementOccurred){continueMovement();return;}
    const enforcer=state.units.find(x=>x.id==="zaku-enforcer"&&x.zone==="board");
    if (enforcer&&unit.team!==enforcer.team&&E.distance(unit,enforcer)===1&&inHand(enforcer.team,"iron-grip")&&!isUsed("iron-grip",enforcer.team)&&!state.activation.tacticUsed[enforcer.team]) {
      openResponse([getTactic("iron-grip",enforcer.team)], card=>{
        useResponse(card);
        const {defeated}=damageUnit(enforcer,unit,3,"Iron Grip");
        closeModal();
        renderAll();
        if(defeated&&finishDefeatedActiveActivation(unit,"Iron Grip"))return;
        continueMovement();
      },continueMovement,{movementType});
      return;
    }
    continueMovement();
  }

  function afterUnitMove(unit, movementType, afterEffects=null, movementOccurred=true, options={}) {
    if(movementOccurred&&unit.zone==="board"&&["push","pull"].includes(movementType)){
      playPickupFeedback(unit,E.pickupAt(state,unit));
    }
    if(unit.id==="red-gundam"&&movementType==="dash"&&!options.skipShujiKick){
      if(offerShujiKick(unit,afterEffects,movementOccurred))return;
      return;
    }
    if (!options.skipCharKick && ["chars-zaku","red-comet-zaku"].includes(unit.id) && movementType==="dash") {
      const targets=adjacentCharKickTargets(unit);
      if (targets.all.length) {
        addLog(`Char Kick พร้อมใช้งานหลัง Dash — เลือก Unit หรือ Garrison ศัตรูที่ติดกันเพื่อสร้าง Damage 1`);
        mode={type:"char-kick",unitId:unit.id,targets:new Set(targets.all.map(target=>E.key(target.q,target.r))),returnMenu:"main",hint:"Char Kick: เลือก Unit หรือ Garrison ศัตรูที่ติดกันเพื่อสร้าง Damage 1",callback:()=>resolveMovementResponses(unit,movementType,afterEffects,movementOccurred),onCancel:()=>resolveMovementResponses(unit,movementType,afterEffects,movementOccurred)};
        menuOpen=true;
        return;
      }
    }
    resolveMovementResponses(unit,movementType,afterEffects,movementOccurred);
  }

  function consumeCriticalOverdrive(unit,weapon) {
    if(!unit?.nextAttackCriticalOverdrive)return weapon;
    unit.nextAttackCriticalOverdrive=false;
    addLog(`KIRA KIRA!: ${unit.name} ได้ Damage +1 ต่อ Critical ทุกลูกในการโจมตีนี้`);
    return {...weapon,criticalOverdrivePerCrit:1};
  }

  function beginAttack(weapon, options={}) {
    const unit=activeUnit();
    if(usesSpecialAoeLine(weapon))return beginTwinBusterAttack(unit,weapon,options);
    const engaged=E.engagedTargets(state,unit);
    const targets=E.legalWeaponTargets(state,unit,weapon);
    if (!targets.length) {
      addLog(weapon.ignoreLos
        ?`${weapon.name}: ไม่มีเป้าหมายศัตรูภายใน Range ${weapon.range} — อาวุธนี้ไม่ตรวจ Line of Sight`
        :`${weapon.name}: ไม่มีเป้าหมายที่อยู่ใน Range และ Line of Sight`);
      renderAll();return false;
    }
    const normalHint=weapon.ignoreLos
      ?`${weapon.name}: IGNORE LINE OF SIGHT — เลือก Unit หรือ Garrison ศัตรูภายใน Range ${weapon.range}`
      :weapon.effect==="splash"
      ? `${weapon.name}: เลือกเป้าหมายหลัก — หลัง Combat Damage ศัตรูทุกตัวที่ติดกับเป้าหมายจะรับ Damage 0 (Critical = 1)`
      : `${weapon.name}: เลือกยูนิตหรือ Garrison สีแดง`;
    mode={type:"attack",unitId:unit.id,weapon,free:!!options.free,onDeclare:options.onDeclare,onComplete:options.onComplete,required:!!options.required,attackAgainPrompt:!!options.attackAgainPrompt,targets:new Set(targets.map(t=>E.key(t.q,t.r))),returnMenu:"weapons",hint:engaged.length?`${weapon.name}: ENGAGED — ต้องเลือก Unit หรือ Garrison ที่กำลัง Engage ยูนิตนี้เป็นเป้าหมาย`:normalHint};
    menuOpen=true;
    renderAll();
    return true;
  }

  function twinBusterRawPattern(unit,rotation=0,weapon=null) {
    const source={x:unit.q,z:unit.r-(unit.q-(unit.q&1))/2};source.y=-source.x-source.z;
    const fullPattern=[
      {x:0,y:1,z:-1},{x:0,y:2,z:-2},{x:0,y:3,z:-3},
      {x:1,y:0,z:-1},{x:1,y:1,z:-2},{x:1,y:2,z:-3},
      {x:2,y:0,z:-2},{x:2,y:1,z:-3},{x:3,y:0,z:-3}
    ];
    // Each SP attack preserves the footprint printed on its card. Breast Fire is
    // the six-hex 1/2/3 cone; War Edge is the compact five-hex pattern; Twin
    // Buster and God Drill use the complete triangular nine-hex diagram.
    const base=weapon?.aoe==="warEdge"
      ?[fullPattern[0],fullPattern[1],fullPattern[3],fullPattern[4],fullPattern[6]]
      :weapon?.aoe==="breastFire"
        ?[fullPattern[0],fullPattern[1],fullPattern[2],fullPattern[4],fullPattern[5],fullPattern[7]]
        :fullPattern;
    const rotate=offset=>{let value={...offset};for(let i=0;i<rotation;i++)value={x:-value.z,y:-value.x,z:-value.y};return value;};
    return base.map(offset=>{
      const value=rotate(offset);const x=source.x+value.x,z=source.z+value.z;
      return {q:x,r:z+(x-(x&1))/2};
    });
  }

  function twinBusterPattern(unit,rotation=0,weapon=null) {
    return twinBusterRawPattern(unit,rotation,weapon).filter(hex=>E.inBounds(hex.q,hex.r));
  }

  function twinBusterDirectionAnchor(unit,rotation,weapon=null) {
    const raw=twinBusterRawPattern(unit,rotation,weapon);
    // Keep the six rotations stable even at the edge of the map.  Using E.neighbors()
    // here used to delete out-of-bounds directions first, shifting the remaining
    // rotation indexes and making the visible AoE disagree with the chosen direction.
    const adjacent=raw[0];
    if(adjacent&&E.inBounds(adjacent.q,adjacent.r))return adjacent;
    return raw.find(hex=>E.inBounds(hex.q,hex.r))||null;
  }

  function twinBusterPreview(attacker,rotation,weapon=null) {
    const visible=[],blocked=[];
    twinBusterPattern(attacker,rotation,weapon).forEach(hex=>{
      (E.hasTwinBusterLine(state,attacker,hex)?visible:blocked).push(hex);
    });
    return {visible,blocked};
  }

  function twinBusterTargets(attacker,rotation,weapon=null) {
    const visibleCells=new Set(twinBusterPreview(attacker,rotation,weapon).visible.map(hex=>E.key(hex.q,hex.r)));
    return [
      ...state.units.filter(target=>target.zone==="board"&&target.team!==attacker.team&&visibleCells.has(E.key(target.q,target.r))),
      ...state.garrisons.filter(target=>target.team!==attacker.team&&visibleCells.has(E.key(target.q,target.r)))
    ];
  }

  function beginTwinBusterAttack(attacker,weapon,options={}) {
    const engaged=E.engagedTargets(state,attacker);
    const engagedIds=new Set(engaged.map(target=>target.id));
    const choices=Array.from({length:6},(_,rotation)=>{
      const anchor=twinBusterDirectionAnchor(attacker,rotation,weapon);
      if(!anchor)return null;
      const targets=twinBusterTargets(attacker,rotation,weapon);
      const legal=!!targets.length&&(!engaged.length||targets.some(target=>engagedIds.has(target.id)));
      return {q:anchor.q,r:anchor.r,rotation,targets,legal};
    }).filter(Boolean);
    const legalChoices=choices.filter(choice=>choice.legal);
    const fire=rotation=>resolveTwinBusterAttack(attacker,weapon,rotation,options);
    if(isAiTeam(attacker.team)){
      if(!legalChoices.length)return false;
      const preferred=legalChoices.find(choice=>choice.rotation===options.rotation);
      const best=preferred||legalChoices.slice().sort((a,b)=>b.targets.reduce((sum,target)=>sum+(target.vp||D.rules.garrison?.defeatVp||2),0)-a.targets.reduce((sum,target)=>sum+(target.vp||D.rules.garrison?.defeatVp||2),0))[0];
      fire(best.rotation);return true;
    }
    // Human players can inspect all six fixed directions even when every current
    // target is blocked. This makes the red/gray Twin Buster footprint an aiming
    // aid instead of hiding the weapon entirely when LOS is unavailable.
    if(!choices.length){renderAll();return false;}
    const hint=legalChoices.length
      ?`${weapon.name}: เลือกทิศทางจาก Hex สีแดงรอบยูนิต`
      :engaged.length
        ?`${weapon.name}: ยังไม่มีแนวที่โจมตีเป้าหมาย Engaged ได้ — เลือกทิศเพื่อดูแนวยิง/สิ่งกีดขวาง`
        :`${weapon.name}: ยังไม่มีเป้าหมายที่ยิงถึง — เลือกทิศเพื่อดูแนวยิงและพื้นที่สูงที่บัง`;
    const anchorCounts=choices.reduce((counts,choice)=>{const key=E.key(choice.q,choice.r);counts.set(key,(counts.get(key)||0)+1);return counts;},new Map());
    const uniqueAnchors=choices.filter(choice=>anchorCounts.get(E.key(choice.q,choice.r))===1);
    mode={type:"aoe-direction",unitId:attacker.id,weapon,required:!!options.required,directionChoices:choices,targets:new Set(uniqueAnchors.map(choice=>E.key(choice.q,choice.r))),hint:`${hint} · หรือเลือกแนวยิง 1–6 จากเมนู`,callback:fire};
    menuOpen=true;renderAll();return true;
  }

  function resolveTwinBusterAttack(attacker,weapon,rotation,options={}) {
    weapon=consumeCriticalOverdrive(attacker,weapon);
    const targets=twinBusterTargets(attacker,rotation,weapon);
    if(!targets.length){addLog(`${weapon.name}: ทิศทางนี้ไม่มีเป้าหมายที่โจมตีได้`);beginTwinBusterAttack(attacker,weapon,options);return;}
    if(options.onDeclare)options.onDeclare();
    if(!options.free){state.activation.actionUsed=true;payTimeline(attacker,Math.max(0,weapon.timeline-attacker.nextAttackDiscount));}
    attacker.nextAttackDiscount=0;
    const first=targets[0];
    const surrogate=first.weapons?first:{...first,upgrades:{shield:0,speed:0,strength:0},statuses:{slow:false,fracture:false,disarm:false}};
    const priorAoeExploit=attacker.aoeExploitWeakness;
    attacker.aoeExploitWeakness=attacker.id==="gundam-epyon"&&weapon.aoe==="warEdge"&&targets.some(target=>target.weapons&&Object.values(target.statuses||{}).some(Boolean));
    const master=E.rollAttack(state,attacker,surrogate,weapon);
    master.sharedThreshold=true;
    attacker.aoeExploitWeakness=priorAoeExploit;
    attacker.lastAoeTargets=targets;
    master.aoeDisplay=sharedAoeDiceDisplay(attacker,weapon,master.dice,targets);
    lastDice=master;
    addLog(`${attacker.name} ใช้ ${weapon.name} ใส่เป้าหมาย ${targets.length} จุดด้วย Attack Roll ชุดเดียว`);
    renderAll();
    showDiceRoll(master,weapon.name.toUpperCase(),()=>resolveDisarmReroll(attacker,surrogate,weapon,master,()=>{
      const results=targets.map(target=>{
        const targetSurrogate=target.weapons?target:{...target,upgrades:{shield:0,speed:0,strength:0},statuses:{slow:false,fracture:false,disarm:false}};
        // Keep normal weapon bonuses while suppressing only printed Critical effects.
        const result=E.attackResultFromDice(state,attacker,targetSurrogate,weapon,master.dice,{criticalEffectsDisabled:!!master.criticalEffectsDisabled});
        return {target,result,reduction:0};
      });
      const offerShieldAt=index=>{
        if(index>=results.length)return applyAll();
        const entry=results[index];
        const reductions={[entry.target.id]:0};
        offerFederationShield(attacker,entry.target,weapon,entry.result,reductions,()=>{entry.reduction=reductions[entry.target.id]||0;offerShieldAt(index+1);});
      };
      const applyAll=()=>{
        const survivingDefenders=[];
        results.forEach(({target,result})=>{
          if(target.weapons){
            // AoE uses one shared roll, but each Unit resolves the printed Critical
            // effect independently before its own attack Damage is applied.
            if(criticalEffectsActive(result)&&weapon.critical==="fracture")applyDebuff(target,"fracture");
            const entry=results.find(candidate=>candidate.target===target);
            const amount=reducedAttackDamage(attacker,target,Math.max(0,result.damage-(entry?.reduction||0)));
            const impact={q:target.q,r:target.r};
            const applied=E.applyDamage(target,amount,{sourceType:"attack"});
            addLog(`${weapon.name}: ${target.name} รับ Damage ${applied.taken}${applied.fractured?" (Fracture +3)":""}`);
            const defeated=E.defeatUnit(state,target,attacker.team);
            if(!defeated)survivingDefenders.push(target);
            if(result.damage>0)playDamageFeedback({to:impact,targetUnitId:target.id,destroyed:defeated});
          }else{
            const impact=damageGarrison(attacker,target,result.damage,weapon.name);
            if(result.damage>0)playDamageFeedback({to:{q:impact.q,r:impact.r},garrison:true,destroyed:impact.destroyed});
          }
        });
        renderAll();
        const attackerResponses=availablePostCombat(attacker,"attacker");
        const defenderResponses=survivingDefenders.length?availablePostCombat(survivingDefenders[0],"defender"):[];
        openPostCombatResponses([
          {cards:attackerResponses,role:"attacker",responders:[attacker]},
          {cards:defenderResponses,role:"defender",responders:survivingDefenders}
        ],attacker,survivingDefenders[0]||surrogate,0,()=>{
          attacker.lastAoeTargets=null;
          renderAll();
          offerOmegaPsycommuMove(attacker,master,()=>offerHackingSystem(attacker,()=>finishDefeatedActiveActivation(attacker,"Sacrificial Overload")));
        });
      };
      offerShieldAt(0);
    }),{sharedThreshold:true,aoeDisplay:master.aoeDisplay,manualClose:!isAiTeam(attacker.team),aiRoll:isAiTeam(attacker.team)});
  }

  function resolveGarrisonAttack(attacker,garrison,weapon,options={}) {
    // Garrison attacks follow the same declaration/pre-attack timing as Unit attacks.
    // This matters for Tail Blade / Heat Rod: Pull is optional (up to 1), but if the
    // player chooses to Pull, it resolves before the attack roll and after costs commit.
    if(!options.attackCommitted)weapon=consumeCriticalOverdrive(attacker,weapon);
    const committedOptions=options.attackCommitted?options:{...options,attackCommitted:true};
    if(!options.attackCommitted){
      if(!options.free){state.activation.actionUsed=true;payTimeline(attacker,Math.max(0,weapon.timeline-attacker.nextAttackDiscount));}
      attacker.nextAttackDiscount=0;attacker.lastShotBonus=false;
      if(weapon.id==="rex-claws")attacker.attackedWithRexClaws=true;
    }
    const garrisonPresent=()=>state.garrisons.some(item=>item.id===garrison.id);
    if(weapon.preAttack==="pull1"&&!committedOptions.pullResolved){
      return beginPullToward(attacker,garrison,()=>resolveGarrisonAttack(attacker,garrison,weapon,{...committedOptions,pullResolved:true}),weapon.name);
    }
    if(state?.status!=="playing"||attacker.zone!=="board"||!garrisonPresent()){
      if(committedOptions.onComplete)committedOptions.onComplete();
      return false;
    }
    const from={q:attacker.q,r:attacker.r};
    const to={q:garrison.q,r:garrison.r};
    playAttackTargetingFx({from,to,team:attacker.team,garrison:true,onComplete:()=>{
      if(state?.status!=="playing"||attacker.zone!=="board"||!garrisonPresent()){
        if(committedOptions.onComplete)committedOptions.onComplete();
        return;
      }
      const surrogate={...garrison,upgrades:{shield:0,speed:0,strength:0},statuses:{slow:false,fracture:false,disarm:false}};
      const result=E.rollAttack(state,attacker,surrogate,weapon);
      lastDice=result;
      renderAll();
      showAttackDiceRoll(result,weapon,weapon.name,()=>{
        offerAnotherTimeline(attacker,surrogate,weapon,result,()=>{
          offerNewtypeReroll(attacker,surrogate,weapon,result,()=>{
            offerWeaponAfterRollEffect(attacker,surrogate,weapon,()=>{
              resolveDisarmReroll(attacker,surrogate,weapon,result,()=>{
                const reductions={};
                offerFederationShield(attacker,garrison,weapon,result,reductions,()=>{
                  const dealDamageAndFinish=()=>{
                    if(!garrisonPresent()){
                      renderAll();
                      resolveAfterCombatCritical(attacker,garrison,weapon,result,()=>offerOmegaPsycommuMove(attacker,result,()=>offerHackingSystem(attacker,()=>{if(committedOptions.onComplete)committedOptions.onComplete();})));
                      return;
                    }
                    const impact=damageGarrison(attacker,garrison,result.damage,`${attacker.name} ใช้ ${weapon.name}`);
                    resolveSplashDamage(attacker,garrison,weapon,result,reductions);
                    renderAll();
                    if(result.damage>0)playResolvedAttackFeedback({attacker,weapon,result,from,to:{q:impact.q,r:impact.r},garrison:true,destroyed:impact.destroyed});
                    resolveAfterCombatCritical(attacker,garrison,weapon,result,()=>{
                      const attackerResponses=availablePostCombat(attacker,"attacker");
                      openPostCombatResponses([
                        {cards:attackerResponses,role:"attacker",responders:[attacker]}
                      ],attacker,garrison,0,()=>offerOmegaPsycommuMove(attacker,result,()=>offerHackingSystem(attacker,()=>{finishDefeatedActiveActivation(attacker,"Sacrificial Overload");if(committedOptions.onComplete)committedOptions.onComplete();})));
                    });
                  };
                  if(criticalEffectsActive(result)&&weapon.criticalTiming!=="afterCombatDamage")applyCritical(attacker,garrison,weapon,result,dealDamageAndFinish);
                  else dealDamageAndFinish();
                });
              });
            });
          });
        });
      });
    }});
    return true;
  }

  function damageGarrison(source,garrison,amount,label) {
    const q=garrison.q,r=garrison.r;
    const damage=Math.max(0,amount);
    garrison.hp=Math.max(0,garrison.hp-damage);
    addLog(`${label}: ${garrison.team===source.team?"Garrison ฝ่ายเดียวกัน":"Garrison ศัตรู"} รับ Damage ${damage}`);
    const destroyed=garrison.hp===0;
    if(destroyed){
      const vp=D.rules.garrison?.defeatVp ?? D.rules.rescue.vp;
      state.garrisons=state.garrisons.filter(g=>g.id!==garrison.id);
      // A defeated Garrison always awards its VP to the opposing player, including
      // collision damage caused during the owner's own Push.
      const scoringTeam=garrison.team==="fed"?"zeon":"fed";
      state.vp[scoringTeam]+=vp;
      if(!state.destroyedGarrisons)state.destroyedGarrisons={fed:0,zeon:0};
      state.destroyedGarrisons[scoringTeam]=(state.destroyedGarrisons[scoringTeam]||0)+1;
      addLog(`Garrison ถูกทำลาย — ${teamMeta(scoringTeam).short} +${vp} VP`);
      if(source?.id==="mechazawa"&&garrison.team!==source.team)queueHackingSystem(source.team);
    }
    return {damage,destroyed,q,r};
  }

  function damageUnit(source,target,amount,label,sourceType="direct") {
    const to={q:target.q,r:target.r};
    const applied=E.applyDamage(target,amount,{sourceType});
    if(applied.blocked)addLog(`${label}: Shield ของ ${target.name} ป้องกัน Damage ${applied.blocked}`);
    addLog(`${label}: ${target.name} รับ Damage ${applied.taken}${applied.fractured?" (Fracture +3)":""}`);
    const scoringTeam=source?.team&&source.team!==target.team?source.team:(target.team==="fed"?"zeon":"fed");
    const defeated=E.defeatUnit(state,target,scoringTeam);
    if(applied.taken>0)playDamageFeedback({to,targetUnitId:target.id,destroyed:defeated});
    return {...applied,defeated,to};
  }

  function reducedAttackDamage(attacker,defender,amount){
    return Math.max(0,amount);
  }

  function destroyUpgradeToken(target,type,label) {
    if(!type||!target?.upgrades||target.upgrades[type]<=0)return false;
    target.upgrades[type]-=1;
    if(type==="shield")target.inactiveShields=Math.min(target.inactiveShields||0,target.upgrades.shield);
    addLog(`${label}: ${target.name} สูญเสีย ${type.toUpperCase()} Upgrade 1`);
    return true;
  }

  function offerWeaponAfterRollEffect(attacker,defender,weapon,onComplete=()=>{}) {
    if(weapon.critical==="extraDice2"&&!lastDice?.disarmedPending&&criticalEffectsActive(lastDice)&&!lastDice.extraDiceResolved){
      const previousDiceCount=lastDice.dice.length;
      lastDice.extraDiceResolved=true;
      E.addAttackDice(state,attacker,defender,weapon,lastDice,2);
      addLog(`${weapon.name} Critical: ทอยลูกเต๋าเพิ่ม 2 ลูก`);
      renderAll();appendDiceRoll(lastDice,previousDiceCount,`${weapon.name.toUpperCase()} · EXTRA DICE`,onComplete,{manualClose:!isAiTeam(attacker.team),aiRoll:isAiTeam(attacker.team)});return;
    }
    if(weapon.effect==="shieldBreak"){
      if(defender.upgrades?.shield>0)destroyUpgradeToken(defender,"shield",weapon.name);
      onComplete();return;
    }
    if(weapon.effect!=="destroyUpgrade"){onComplete();return;}
    const choices=["shield","speed","strength"].filter(type=>defender.upgrades?.[type]>0);
    if(!choices.length){addLog(`${weapon.name}: เป้าหมายไม่มี Upgrade Token ให้ทำลาย`);onComplete();return;}
    if(choices.length===1){destroyUpgradeToken(defender,choices[0],weapon.name);renderAll();onComplete();return;}
    if(isAiTeam(attacker.team)){
      const selected=A.chooseUpgrade(defender,false);
      destroyUpgradeToken(defender,choices.includes(selected)?selected:choices[0],weapon.name);renderAll();onComplete();return;
    }
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><span class="eyebrow">${weapon.name.toUpperCase()} // AFTER ATTACK ROLL</span><h2>เลือก Upgrade Token ที่จะทำลาย</h2><p>${defender.name} มี Upgrade หลายชนิด — Heat Hawk ทำลายได้ 1 ชิ้น</p><div class="modal-actions">${choices.map(type=>`<button class="primary-btn" data-weapon-upgrade="${type}">${type.toUpperCase()} · ${defender.upgrades[type]}</button>`).join("")}</div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);
    modal.querySelectorAll("[data-weapon-upgrade]").forEach(button=>button.addEventListener("click",()=>{
      destroyUpgradeToken(defender,button.dataset.weaponUpgrade,weapon.name);closeModal();renderAll();onComplete();
    }));
  }

  function beginPullToward(attacker,defender,onComplete=()=>{},label="Tail Blade") {
    const isGarrison=()=>state.garrisons.some(garrison=>garrison.id===defender.id);
    const isUnit=()=>defender.zone==="board";
    const targetPresent=()=>isUnit()||isGarrison();
    const targetName=()=>defender.name||`${teamMeta(defender.team).short} Garrison`;
    const options=E.pullDirectionOptions(state,attacker,defender);
    const finish=()=>{mode=null;menuOpen=false;renderAll();onComplete();};
    if(!options.length){addLog(`${label}: ไม่มี Hex ที่ใกล้ผู้ดึงขึ้น — Pull 0 และโจมตีต่อ`);finish();return true;}
    const damagePulledTarget=()=>{
      if(isGarrison())return {garrison:true,...damageGarrison(attacker,defender,2,"Pull Collision")};
      const applied=E.applyDamage(defender,2,{sourceType:"collision"});
      const defeated=E.defeatUnit(state,defender,attacker.team);
      return {...applied,defeated,q:defender.q,r:defender.r};
    };
    const collide=step=>{
      const targetPos={q:defender.q,r:defender.r};
      const movingWasGarrison=isGarrison();
      const pulledDamage=damagePulledTarget();
      if(step.unit){
        const collidedUnit=step.unit;
        const to={q:collidedUnit.q,r:collidedUnit.r};
        const collisionDamage=E.applyDamage(collidedUnit,2,{sourceType:"collision"});
        const scoringTeam=collidedUnit.team===attacker.team?defender.team:attacker.team;
        const defeated=E.defeatUnit(state,collidedUnit,scoringTeam);
        addLog(`${label}: ${targetName()} ชน ${collidedUnit.name} — ${targetName()} รับ Damage ${pulledDamage.taken??pulledDamage.damage}, ${collidedUnit.name} รับ Damage ${collisionDamage.taken}`);
        playDamageFeedback({to,targetUnitId:collidedUnit.id,destroyed:defeated});
      }else if(step.garrison){
        const info=damageGarrison(attacker,step.garrison,2,"Pull Collision");
        addLog(`${label}: ${targetName()} ชน Garrison — ${targetName()} รับ Damage ${pulledDamage.taken??pulledDamage.damage}, Garrison รับ Damage ${info.damage}`);
        playDamageFeedback({to:{q:info.q,r:info.r},garrison:true,destroyed:info.destroyed});
      }else if(step.base){
        addLog(`${label}: ${targetName()} ชน Base ฝ่าย ${teamMeta(step.base.team).short} — รับ Damage ${pulledDamage.taken??pulledDamage.damage}`);
      }else{
        addLog(`${label}: ${targetName()} ชนพื้นที่สูง — รับ Damage ${pulledDamage.taken??pulledDamage.damage}`);
      }
      if(movingWasGarrison)playDamageFeedback({to:targetPos,garrison:true,destroyed:!state.garrisons.some(garrison=>garrison.id===defender.id)});
      else playDamageFeedback({to:targetPos,targetUnitId:defender.id,destroyed:defender.zone==="reserve"});
      finish();
    };
    const choose=hex=>{
      const option=options.find(candidate=>candidate.q===hex.q&&candidate.r===hex.r);
      if(!option){finish();return;}
      const step=E.forcedPushStep(state,defender,option.direction);
      if(step.type==="collision"){collide(step);return;}
      // Board edge and other blocked steps simply stop forced movement with no Damage.
      if(step.type!=="move"){finish();return;}
      defender.q=step.q;defender.r=step.r;
      addLog(`${label}: ดึง ${targetName()} เข้ามา 1 ช่อง`);
      mode=null;menuOpen=false;renderAll();
      if(isUnit())afterUnitMove(defender,"pull",onComplete,true);else onComplete();
    };
    if(isAiTeam(attacker.team)){
      const choice=A.choosePullDirection?.(state,attacker,defender,options,E)||null;
      if(!choice||choice.score<=0){addLog(`AI · ${attacker.name} เลือก Pull 0`);finish();return true;}
      choose(choice);return true;
    }
    mode={type:"pull-target",unitId:attacker.id,targets:new Set(options.map(hex=>E.key(hex.q,hex.r))),hint:`${label}: เลือก Hex ที่ใกล้ผู้ดึงขึ้น 1 ช่อง หรือ Pull 0 · Collision เกิดเฉพาะพื้นที่สูง/Unit/Garrison/Base`,callback:choose,required:true,canStop:true,stopCallback:()=>{addLog(`${label}: เลือก Pull 0 — เป้าหมายไม่เคลื่อนที่`);finish();}};
    menuOpen=true;renderAll();return true;
  }

  function resolveAttack(attacker,defender,weapon,options={}) {
    // Commit the declared attack before any Pre-Attack movement/effect resolves. This
    // prevents a lethal Pull collision from turning the declared attack into a free kill.
    if(!options.attackCommitted)weapon=consumeCriticalOverdrive(attacker,weapon);
    const committedOptions=options.attackCommitted?options:{...options,attackCommitted:true};
    if(!options.attackCommitted){
      if(!options.free){
        state.activation.actionUsed=true;
        payTimeline(attacker,Math.max(0,weapon.timeline-attacker.nextAttackDiscount));
      }
      attacker.nextAttackDiscount=0;
      if(weapon.id==="rex-claws")attacker.attackedWithRexClaws=true;
    }
    if(weapon.preAttack==="pull1"&&!committedOptions.pullResolved){
      return beginPullToward(attacker,defender,()=>resolveAttack(attacker,defender,weapon,{...committedOptions,pullResolved:true}),weapon.name);
    }
    // Pre-Attack effects may defeat either unit. The cost stays committed, but there is
    // no attack roll to resolve; resume the caller so AI/free-attack chains cannot hang.
    if(state?.status!=="playing"||attacker.zone!=="board"||defender.zone!=="board"){
      if(attacker.zone==="reserve"&&finishDefeatedActiveActivation(attacker,`${weapon.name} Pull Collision`))return false;
      if(committedOptions.onComplete)committedOptions.onComplete();
      return false;
    }
    const from={q:attacker.q,r:attacker.r};
    const to={q:defender.q,r:defender.r};
    playAttackTargetingFx({from,to,team:attacker.team,onComplete:()=>{
      if(state?.status!=="playing"||attacker.zone!=="board"||defender.zone!=="board"){
        if(committedOptions.onComplete)committedOptions.onComplete();
        return;
      }
      const result=E.rollAttack(state,attacker,defender,weapon);
      lastDice=result;
      pendingAttack={attacker,defender,weapon,result,reductions:{},continuation:options.onComplete||null};
      addLog(`${attacker.name} ใช้ ${weapon.name}: ${result.hits} Hit · ${result.criticals} Critical`);
      renderAll();
      showAttackDiceRoll(result,weapon,weapon.name,()=>offerAnotherTimeline(attacker,defender,weapon,result,()=>offerNewtypeReroll(attacker,defender,weapon,result,()=>offerWeaponAfterRollEffect(attacker,defender,weapon,()=>resolveDisarmReroll(attacker,defender,weapon,result,()=>{
        offerFederationShield(attacker,defender,weapon,result,pendingAttack.reductions,finishAttack);
      })))));
    }});
  }

  function offerCheckmateUpgrade(attacker,defender,onComplete=()=>{}) {
    if(!attacker?.destroyUpgradeAfterAttack||defender?.zone!=="board"){onComplete();return;}
    const choices=["shield","speed","strength"].filter(type=>defender.upgrades?.[type]>0);
    if(!choices.length){addLog("Checkmate: เป้าหมายไม่มี Upgrade ให้ทำลาย");onComplete();return;}
    const apply=type=>{destroyUpgradeToken(defender,type,"Checkmate");closeModal();renderAll();onComplete();};
    if(choices.length===1){apply(choices[0]);return;}
    if(isAiTeam(attacker.team)){
      const selected=A.chooseUpgrade(defender,false);
      apply(choices.includes(selected)?selected:choices[0]);return;
    }
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><span class="eyebrow">CHECKMATE // AFTER ATTACK</span><h2>เลือก Upgrade ที่จะทำลาย</h2><p>${defender.name} — Checkmate ทำลาย Upgrade 1 ชิ้นบนเป้าหมาย</p><div class="modal-actions">${choices.map(type=>`<button class="primary-btn" data-checkmate-upgrade="${type}">${type.toUpperCase()} · ${defender.upgrades[type]}</button>`).join("")}</div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);
    modal.querySelectorAll("[data-checkmate-upgrade]").forEach(button=>button.addEventListener("click",()=>apply(button.dataset.checkmateUpgrade)));
  }

  function finishAttack() {
    closeModal();
    if (!pendingAttack) return;
    const {attacker,defender,weapon,result,reductions={},continuation=null}=pendingAttack;
    const from={q:attacker.q,r:attacker.r};
    const to={q:defender.q,r:defender.r};
    const dealDamageAndFinish=()=>{
      let applied={incoming:0,blocked:0,taken:0,fractured:false};
      let splash={units:[],garrisons:[]};
      if(defender.zone==="board"){
        const damage=Math.max(0,result.damage-(reductions[defender.id]||0));
        applied=E.applyDamage(defender,reducedAttackDamage(attacker,defender,damage),{sourceType:"attack"});
        if (applied.blocked) addLog(`Shield ป้องกัน Damage ${applied.blocked}`);
        addLog(`${defender.name} รับ Damage ${applied.taken}${applied.fractured?" (Fracture +3)":""}`);
        splash=resolveSplashDamage(attacker,defender,weapon,result,reductions);
      }
      if(defender.zone==="board"&&weapon.effect==="disableAllShields"&&defender.upgrades.shield>0){
        defender.inactiveShields=defender.upgrades.shield;
        addLog(`${weapon.name}: Shield Upgrade ทั้งหมดของ ${defender.name} ถูกปิดใช้งาน`);
      }
      const defeated=defender.zone==="reserve"||E.defeatUnit(state,defender,attacker.team);
      if (attacker.lastShotBonus) {
        if (defeated) {
          grantUpgrade(attacker,"strength",1);
          addLog(`Last Shot Counts: ${attacker.name} รับ Strength Upgrade เพิ่มอีก 1`);
        }
        attacker.lastShotBonus=false;
      }
      const continueAfterCheckmate=()=>{
        pendingAttack=null;
        renderAll();
        if(result.damage>0)playResolvedAttackFeedback({attacker,weapon,result,from,to,targetUnitId:defender.id,destroyed:defeated});
        resolveAfterCombatCritical(attacker,defender,weapon,result,()=>{
          // Splash victims are secondary damage recipients, not the defending Unit of this attack.
          const defenderResponders=defeated?[]:[defender].filter(unit=>unit.zone==="board");
          const defenderResponses=defenderResponders.length?availablePostCombat(defenderResponders[0],"defender"):[];
          const attackerResponses=availablePostCombat(attacker,"attacker");
          openPostCombatResponses([
            {cards:attackerResponses,role:"attacker",responders:[attacker]},
            {cards:defenderResponses,role:"defender",responders:defenderResponders}
          ],attacker,defender,0,()=>{
            offerOmegaPsycommuMove(attacker,result,()=>offerHackingSystem(attacker,()=>{
              finishDefeatedActiveActivation(attacker,"Combat Response");
              if(continuation)continuation();
            }));
          });
        });
      };
      // Checkmate resolves after the attack only if the target survived and still has
      // an Upgrade. Human players choose the token; AI uses its normal upgrade policy.
      if(!defeated)offerCheckmateUpgrade(attacker,defender,continueAfterCheckmate);
      else continueAfterCheckmate();
    };
    if (criticalEffectsActive(result) && weapon.criticalTiming!=="afterCombatDamage") applyCritical(attacker,defender,weapon,result,dealDamageAndFinish);
    else dealDamageAndFinish();
  }

  function criticalEffectsActive(result) {
    return !!result && result.criticals>0 && !result.criticalEffectsDisabled;
  }

  function offerOmegaPsycommuMove(attacker,result,onComplete=()=>{}) {
    const allowance=Math.max(0,Number(attacker?.omegaPsycommuMove)||0);
    // Omega Psycommu Active keys off the presence of a Critical result, not the
    // weapon's Critical Hit Effect. A Disarmed attack can therefore still trigger it.
    if(!allowance||attacker?.zone!=="board"||!(result?.criticals>0)){onComplete();return false;}
    addLog(`Omega Psycommu Active: ${attacker.name} สามารถ Move up to ${allowance}`);
    const started=startMoveFor(attacker,allowance,0,"Omega Psycommu Active",moved=>afterUnitMove(attacker,"omega-psycommu",onComplete,moved),{allowStay:true,returnMenu:"main",onCancel:onComplete});
    if(!started){onComplete();return false;}
    if(isAiTeam(attacker.team))scheduleAiResolveMode();
    return true;
  }

  function resolveAfterCombatCritical(attacker,defender,weapon,result,onComplete=()=>{}) {
    if(!criticalEffectsActive(result)||weapon.criticalTiming!=="afterCombatDamage"){onComplete();return;}
    if(weapon.critical==="gainStrength"){applyAttackerCritical(attacker,weapon,result);onComplete();return;}
    if(weapon.critical==="fracture"){
      if(defender?.zone==="board")applyDebuff(defender,"fracture");
      onComplete();return;
    }
    if(weapon.critical==="dashTimeline0"||weapon.critical==="dashRescueTimeline0"){
      offerWeaponCriticalFollowUp(attacker,weapon,result,onComplete);return;
    }
    if(weapon.critical==="move2IgnoreEngagement"){
      addLog("Beam Saber Critical: เคลื่อนที่ได้ 2 ช่องโดยไม่สนใจ Engagement");
      const started=startMoveFor(attacker,2,0,"Beam Saber Critical Move",moved=>afterUnitMove(attacker,"critical",onComplete,moved),{allowStay:true,ignoreEngagement:true,onCancel:onComplete});
      if(started&&isAiTeam(attacker.team))scheduleAiResolveMode();
      if(!started)onComplete();
      return;
    }
    if(weapon.critical==="repeatAtTimeline0"&&!attacker.handgunRepeatUsed){
      attacker.handgunRepeatUsed=true;
      addLog("Handgun Critical: โจมตีด้วย Handgun เพิ่มอีก 1 ครั้งที่ Timeline 0");
      const started=beginAttack(weapon,{free:true,required:true,attackAgainPrompt:true,onComplete});
      if(!started)onComplete();
      else if(isAiTeam(attacker.team))scheduleAiResolveMode();
      return;
    }
    if(weapon.critical==="fractureRepeatTimeline0"){
      // Every Progressive Knife Critical applies Fracture. Only the first Critical in
      // this Activation grants the free repeat, preventing an infinite repeat chain.
      if(defender?.zone==="board")applyDebuff(defender,"fracture");
      if(!attacker.progressiveRepeatUsed){
        attacker.progressiveRepeatUsed=true;
        addLog("Progressive Knife Critical: เป้าหมายติด Fracture และโจมตีเพิ่มอีก 1 ครั้งที่ Timeline 0");
        const started=beginAttack(weapon,{free:true,required:true,attackAgainPrompt:true,onComplete});
        if(!started)onComplete();else if(isAiTeam(attacker.team))scheduleAiResolveMode();
        return;
      }
      addLog("Progressive Knife Critical: เป้าหมายติด Fracture (การโจมตีซ้ำไม่สร้างการโจมตีครั้งที่ 3)");
      onComplete();return;
    }
    onComplete();
  }

  function applyCritical(attacker,defender,weapon,result,onComplete=()=>{}) {
    if(!criticalEffectsActive(result)){onComplete();return;}
    if (weapon.critical==="slow") applyDebuff(defender,"slow");
    if (weapon.critical==="fracture") applyDebuff(defender,"fracture");
    if (weapon.critical==="disarm") applyDebuff(defender,"disarm");
    if (weapon.critical==="push2") { beginPushDirection(attacker,defender,2,onComplete,"Shoulder Bash Critical"); return; }
    if (weapon.critical==="push1Slow") { applyDebuff(defender,"slow");beginPushDirection(attacker,defender,1,onComplete,`${weapon.name} Critical`);return; }
    onComplete();
  }

  function applyAttackerCritical(attacker,weapon,result) {
    if (!criticalEffectsActive(result)||weapon.critical!=="gainStrength") return;
    grantUpgrade(attacker,"strength",1);
    addLog(`Beam Saber Critical: ${attacker.name} รับ Strength Upgrade 1`);
  }

  function splashUnitTargets(attacker,target,weapon) {
    if(weapon.effect!=="splash")return [];
    return E.livingEnemies(state,attacker).filter(unit=>unit.id!==target.id&&E.distance(unit,target)===1);
  }

  function offerFederationShield(attacker,target,weapon,result,reductions,onComplete=()=>{}) {
    // The card protects the defending Unit from this attack. Cracker Grenade's
    // adjacent After Combat Damage is a separate direct-damage effect, not another
    // defending Unit for Earth Federation Shield.
    const owner=target?.team;
    if(!target?.weapons||result.damage<=0||!factionHasTactic(owner,"federation-shield")||!inHand(owner,"federation-shield")||isUsed("federation-shield",owner)||state.activation.tacticUsed[owner]){onComplete();return;}
    const card=getTactic("federation-shield",owner);
    const totalShields=Math.max(0,target.upgrades?.shield||0);
    const inactiveShields=Math.min(totalShields,Math.max(0,target.inactiveShields||0));
    const activeShields=Math.max(0,totalShields-inactiveShields);
    openResponse([card],()=>{useResponse(card);reductions[target.id]=2;closeModal();renderAll();onComplete();},onComplete,{damage:result.damage,effectiveDamage:Math.max(0,result.damage-activeShields),activeShields,hp:target.hp});
  }

  function resolveSplashDamage(attacker,target,weapon,result,reductions={}) {
    if(weapon.effect!=="splash")return {units:[],garrisons:[]};
    const amount=weapon.critical==="splashDamage1"&&criticalEffectsActive(result)?1:0;
    const adjacentUnits=splashUnitTargets(attacker,target,weapon);
    const adjacentGarrisons=state.garrisons.filter(garrison=>garrison.team!==attacker.team&&garrison.id!==target.id&&E.distance(garrison,target)===1);
    adjacentUnits.forEach(unit=>{
      const reducedAmount=Math.max(0,amount-(reductions[unit.id]||0));
      damageUnit(attacker,unit,reducedAmount,"Cracker Grenade AOE");
    });
    adjacentGarrisons.forEach(garrison=>{
      const info=damageGarrison(attacker,garrison,amount,"Cracker Grenade AOE");
      if(amount>0)playDamageFeedback({to:{q:info.q,r:info.r},garrison:true,destroyed:info.destroyed});
    });
    if(adjacentUnits.length||adjacentGarrisons.length)addLog(`Cracker Grenade: กระจาย Damage ${amount} ใส่ศัตรูรอบเป้าหมาย ${adjacentUnits.length+adjacentGarrisons.length} จุด`);
    return {units:adjacentUnits,garrisons:adjacentGarrisons};
  }

  function offerWeaponCriticalFollowUp(attacker,weapon,result,onComplete=()=>{}) {
    if(!criticalEffectsActive(result)||attacker.zone!=="board"){onComplete();return;}
    if(["chars-zaku","red-comet-zaku"].includes(attacker.id)&&weapon.critical==="dashTimeline0"){
      const criticalLabel=`${weapon.name} Critical`;
      addLog(`${criticalLabel}: Char’s Zaku II สามารถ Dash โดยใช้ Timeline 0`);
      if(!isAiTeam(attacker.team)){
        const started=beginAdjustableCharDash(attacker,0,`${criticalLabel} Dash`,onComplete,{primaryAction:false,onCancel:onComplete});
        if(!started)onComplete();
        return;
      }
      const started=startMoveFor(attacker,D.rules.dash.distance+1,0,`${criticalLabel} Dash`,moved=>afterUnitMove(attacker,"dash",onComplete,moved),{allowStay:true,returnMenu:"main",onCancel:onComplete});
      if(started)scheduleAiResolveMode();
      if(!started)onComplete();
      return;
    }
    if(attacker.id==="guncannon"&&weapon.critical==="dashRescueTimeline0"){
      addLog("240mm Critical: Guncannon สามารถ Dash โดยใช้ Timeline 0 แล้ว Rescue ใน Range 1");
      const started=startMoveFor(attacker,D.rules.dash.distance,0,"240mm Critical Dash",moved=>afterUnitMove(attacker,"dash",()=>offerGuncannonCriticalRescue(attacker,onComplete),moved),{allowStay:true,returnMenu:"main",onCancel:onComplete});
      if(started&&isAiTeam(attacker.team))scheduleAiResolveMode();
      if(!started)onComplete();
      return;
    }
    onComplete();
  }

  function offerGuncannonCriticalRescue(unit,onComplete=()=>{}) {
    if(unit.zone!=="board"||!hasOwnGarrisonInRange(unit,1)){onComplete();return;}
    if(isAiTeam(unit.team)){
      addLog("AI · 240mm Critical: ช่วยเหลือ Garrison ใน Range 1");
      rescueGarrison(unit,1,false,null,onComplete);
      if(mode?.type==="select-garrison")scheduleAiResolveMode();
      return;
    }
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><div class="tactic-confirm-layout"><img class="modal-card-image" src="${unit.card}" alt="Unit Card ${unit.name}"><div><span class="eyebrow">CRITICAL // AFTER DASH</span><h2>240mm Low-Recoil Cannon</h2><p>ช่วยเหลือ Garrison ฝ่ายเดียวกันใน Range 1 โดยใช้ Timeline 0 หรือข้ามเอฟเฟกต์นี้</p><div class="modal-actions"><button class="primary-btn" id="confirm-critical-rescue">Rescue</button><button class="action-btn" id="skip-critical-rescue">ข้าม</button></div></div></div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);
    modal.querySelector("#confirm-critical-rescue").addEventListener("click",()=>{closeModal();rescueGarrison(unit,1,false,null,onComplete);});
    modal.querySelector("#skip-critical-rescue").addEventListener("click",()=>{closeModal();renderAll();onComplete();});
  }

  function beginPushDirection(source,target,steps,onComplete=()=>{},label="PUSH") {
    const targetIsGarrison=()=>state.garrisons.some(garrison=>garrison.id===target.id);
    const targetIsUnit=()=>target.zone==="board";
    const targetPresent=()=>targetIsUnit()||targetIsGarrison();
    const targetName=()=>target.name||`${teamMeta(target.team).short} Garrison`;
    if(!source||!target||!targetPresent()||target.hp<=0){onComplete();return false;}
    let remaining=Math.max(0,steps);
    let movedAny=false;
    let finished=false;
    const finish=()=>{
      if(finished)return;
      finished=true;mode=null;menuOpen=false;renderAll();
      if(movedAny&&targetIsUnit())afterUnitMove(target,"push",onComplete,true);
      else onComplete();
    };
    const collide=step=>{
      const targetPos={q:target.q,r:target.r};
      const movingWasGarrison=targetIsGarrison();
      const pushedDamage=movingWasGarrison
        ? {garrison:true,...damageGarrison(source,target,2,"Push Collision")}
        : E.applyDamage(target,2,{sourceType:"collision"});
      if(step.unit){
        const collidedUnit=step.unit;
        const to={q:collidedUnit.q,r:collidedUnit.r};
        const collisionDamage=E.applyDamage(collidedUnit,2,{sourceType:"collision"});
        const scoringTeam=collidedUnit.team===source.team?target.team:source.team;
        const defeated=E.defeatUnit(state,collidedUnit,scoringTeam);
        addLog(`${targetName()} ชน ${collidedUnit.name} — ${targetName()} รับ Damage ${pushedDamage.taken??pushedDamage.damage}, ${collidedUnit.name} รับ Damage ${collisionDamage.taken}`);
        playDamageFeedback({to,targetUnitId:collidedUnit.id,destroyed:defeated});
      }else if(step.garrison){
        const info=damageGarrison(source,step.garrison,2,"Push Collision");
        addLog(`${targetName()} ชน Garrison — ${targetName()} รับ Damage ${pushedDamage.taken??pushedDamage.damage}, Garrison รับ Damage ${info.damage}`);
        playDamageFeedback({to:{q:info.q,r:info.r},garrison:true,destroyed:info.destroyed});
      }else if(step.base){
        addLog(`${targetName()} ชน Base ฝ่าย ${teamMeta(step.base.team).short} — รับ Damage ${pushedDamage.taken??pushedDamage.damage}`);
      }else{
        addLog(`${targetName()} ชนพื้นที่สูง — รับ Damage ${pushedDamage.taken??pushedDamage.damage}`);
      }
      if(movingWasGarrison){
        playDamageFeedback({to:targetPos,garrison:true,destroyed:!state.garrisons.some(garrison=>garrison.id===target.id)});
      }else{
        const pushedDefeated=E.defeatUnit(state,target,source.team);
        playDamageFeedback({to:targetPos,targetUnitId:target.id,destroyed:pushedDefeated});
      }
      finish();
    };
    const offerStep=()=>{
      if(remaining<=0||!targetPresent()||target.hp<=0){finish();return;}
      const options=E.pushDirectionOptions(state,source,target);
      if(!options.length){addLog(`${label}: ไม่มี Hex ที่ไกลจากต้นทางเพิ่มขึ้น — หยุด Push`);finish();return;}
      const choose=option=>{
        if(!option)return finish();
        mode=null;menuOpen=false;
        const step=E.forcedPushStep(state,target,option.direction);
        if(step.type==="collision"){collide(step);return;}
        if(step.type!=="move"){finish();return;}
        target.q=step.q;target.r=step.r;movedAny=true;remaining-=1;
        addLog(`${label}: ${targetName()} ถูกผลักไป Hex ${target.q},${target.r} (${remaining} ช่องคงเหลือ)`);
        renderAll();offerStep();
      };
      if(isAiTeam(source.team)){
        const choice=A.choosePushDirection?.(state,source,target,options,remaining,E)||options[0];
        if(!choice||choice.score<=0){addLog(`AI · ${source.name} เลือกหยุด Push`);finish();return;}
        addLog(`AI · ${source.name} เลือก Hex ถัดไปของ Push`);choose(choice);return;
      }
      mode={
        type:"push-direction",unitId:source.id,pushTargetId:target.id,remaining,label,required:true,canStop:true,
        targets:new Set(options.map(option=>E.key(option.q,option.r))),pushOptions:options,
        hint:`${label}: เลือก Hex สีแดงที่ไกลจากต้นทางขึ้น หรือหยุด Push (${remaining} ช่องคงเหลือ)`,
        callback:choose,stopCallback:finish
      };
      menuOpen=true;menuView="main";renderAll();
    };
    offerStep();return true;
  }

  function availablePostCombat(unit,role) {
    if (unit.zone!=="board"||state.activation.tacticUsed[unit.team]) return [];
    const ids=role==="attacker"?["exploited-chaos","sacrificial-overload"]:["return-fire","shattered-formation"];
    return ids.filter(id=>factionHasTactic(unit.team,id))
      .filter(id=>id!=="sacrificial-overload"||unit.id==="wing-zero-ew")
      .map(id=>getTactic(id,unit.team))
      .filter(card=>inHand(unit.team,card.id)&&!isUsed(card.id,unit.team));
  }

  function openPostCombatResponses(windows,attacker,defender,index=0,onComplete=()=>{}) {
    const next=windows.slice(index).findIndex(responseWindow=>responseWindow.cards.length);
    if(next<0){onComplete();return;}
    const actualIndex=index+next; const responseWindow=windows[actualIndex];
    const continueQueue=()=>openPostCombatResponses(windows,attacker,defender,actualIndex+1,onComplete);
    const responders=(responseWindow.responders||[responseWindow.role==="defender"?defender:attacker]).filter(unit=>unit?.zone==="board");
    if(!responders.length)return continueQueue();
    const opposingUnit=responseWindow.role==="defender"?attacker:defender;
    const canAttack=responders.some(respondingUnit=>respondingUnit.weapons.some(weapon=>E.legalWeaponTargets(state,respondingUnit,weapon).some(target=>target.id===opposingUnit.id)));
    const legalCards=responseWindow.cards.filter(card=>
      inHand(tacticOwner(card),card.id)&&
      !isUsed(card.id,tacticOwner(card))&&
      !state.activation.tacticUsed[tacticOwner(card)]&&
      (card.id!=="return-fire"||canAttack)&&
      (card.id!=="shattered-formation"||opposingUnit?.zone==="board")
    );
    if(!legalCards.length)return continueQueue();
    const sacrificialTargets=[...new Map((attacker.lastAoeTargets||[defender]).filter(target=>target&&(
      target.weapons?target.zone==="board":state.garrisons.some(garrison=>garrison.id===target.id)
    )).map(target=>[target.id,target])).values()];
    const sacrificialKillVp=sacrificialTargets.reduce((total,target)=>{
      const activeShields=target.weapons?Math.max(0,(target.upgrades?.shield||0)-(target.inactiveShields||0)):0;
      const remainingHp=(target.hp||0)+activeShields;
      return total+(remainingHp<=2?(target.vp||D.rules.garrison?.defeatVp||2):0);
    },0);
    openResponse(legalCards,card=>resolvePostCombat(card,attacker,defender,responseWindow.role,continueQueue,responders),continueQueue,{
      canAttack,attackerAlive:attacker.zone==="board",attackerHp:attacker.hp,attackerVp:attacker.vp||0,
      sacrificialTargets:sacrificialTargets.length,sacrificialKillVp
    });
  }

  function resolvePostCombat(card,attacker,defender,role,done=()=>{},responders=[]) {
    useResponse(card);
    if (card.id==="return-fire") {
      const returnOptions=(responders.length?responders:[defender]).flatMap(unit=>unit.weapons
        .filter(weapon=>E.legalWeaponTargets(state,unit,weapon).some(target=>target.id===attacker.id))
        .map(weapon=>({unit,weapon})));
      if (!returnOptions.length) {
        addLog("Return Fire: ไม่มีอาวุธที่โจมตีผู้โจมตีได้");closeModal();renderAll();done();return;
      }
      const fireReturnWeapon=(returningUnit,weapon)=>{
        E.advanceUnitTimeline(state,returningUnit,Math.max(0,weapon.timeline-1));
        const result=E.rollAttack(state,returningUnit,attacker,weapon);
        result.displayOwnerTeam=returningUnit.team;
        lastDice=result;closeModal();renderAll();
        showAttackDiceRoll(result,weapon,`RETURN FIRE · ${weapon.name}`,()=>offerNewtypeReroll(returningUnit,attacker,weapon,result,()=>offerWeaponAfterRollEffect(returningUnit,attacker,weapon,()=>resolveDisarmReroll(returningUnit,attacker,weapon,result,()=>{
          const from={q:returningUnit.q,r:returningUnit.r};
          const to={q:attacker.q,r:attacker.r};
          const finishReturnFire=()=>{
            let applied={incoming:0,blocked:0,taken:0,fractured:false};
            if(attacker.zone==="board"){
              applied=E.applyDamage(attacker,reducedAttackDamage(returningUnit,attacker,result.damage),{sourceType:"attack"});
              if(applied.blocked)addLog(`Return Fire: Shield ป้องกัน Damage ${applied.blocked}`);
              resolveSplashDamage(returningUnit,attacker,weapon,result);
            }
            addLog(`Return Fire ที่ยืนยันแล้ว: ${returningUnit.name} ยิงกลับด้วย ${weapon.name} และทำ Damage ${applied.taken}${applied.fractured?" (Fracture +3)":""}`);
            const defeated=attacker.zone==="reserve"||E.defeatUnit(state,attacker,returningUnit.team);
            renderAll();
            if(result.damage>0)playCombatFeedback({from,to,targetUnitId:attacker.id,destroyed:defeated});
            resolveAfterCombatCritical(returningUnit,attacker,weapon,result,()=>{
              // Only the actual defending Unit receives defender Response windows; splash
              // recipients are secondary targets and cannot Return Fire/Shattered Formation.
              const returnDefenderResponders=defeated?[]:[attacker].filter(unit=>unit.zone==="board");
              const returnDefenderResponses=returnDefenderResponders.length?availablePostCombat(returnDefenderResponders[0],"defender"):[];
              const returnAttackerResponses=availablePostCombat(returningUnit,"attacker");
              openPostCombatResponses([
                {cards:returnAttackerResponses,role:"attacker",responders:[returningUnit]},
                {cards:returnDefenderResponses,role:"defender",responders:returnDefenderResponders}
              ],returningUnit,attacker,0,done);
            });
          };
          if(criticalEffectsActive(result)&&weapon.criticalTiming!=="afterCombatDamage")applyCritical(returningUnit,attacker,weapon,result,finishReturnFire);
          else finishReturnFire();
        }))));
      };
      if(isAiTeam(tacticOwner(card))){
        const choice=returnOptions.slice().sort((a,b)=>(b.weapon.strength-b.weapon.timeline*.35)-(a.weapon.strength-a.weapon.timeline*.35))[0];
        addLog(`AI · Return Fire เลือก ${choice.unit.name} · ${choice.weapon.name}`);renderAll();fireReturnWeapon(choice.unit,choice.weapon);return;
      }
      const modal=ensureModal();
      modal.innerHTML=`<div class="modal-card"><span class="eyebrow">RETURN FIRE // CHOOSE UNIT & WEAPON</span><h2>เลือกผู้ยิงกลับ</h2><p>เลือกยูนิตที่ได้รับ Combat Damage trigger และอาวุธที่โจมตี ${attacker.name} ได้</p><div class="modal-actions">${returnOptions.map((choice,index)=>`<button class="primary-btn" data-return-option="${index}">${choice.unit.name} · ${choice.weapon.name} · TL ${Math.max(0,choice.weapon.timeline-1)}</button>`).join("")}</div></div>`;
      modal.classList.add("show");lockResolutionModal(modal);
      modal.querySelectorAll("[data-return-option]").forEach(button=>button.addEventListener("click",()=>{
        const choice=returnOptions[Number(button.dataset.returnOption)];
        fireReturnWeapon(choice.unit,choice.weapon);
      }));
      return;
    } else if (card.id==="exploited-chaos") { attacker.energy+=1;grantUpgrade(attacker,"strength",1);addLog(`${attacker.name} รับ Energy 1 และ Strength Upgrade 1`); }
    else if(card.id==="sacrificial-overload"){
      const targets=[...new Map((attacker.lastAoeTargets||[defender]).filter(Boolean).map(target=>[target.id,target])).values()];
      if(attacker.zone==="board")damageUnit(attacker,attacker,2,"Sacrificial Overload","tactic");
      targets.forEach(target=>{
        if(target.weapons&&target.zone==="board")damageUnit(attacker,target,2,"Sacrificial Overload","tactic");
        else {
          const garrison=state.garrisons.find(item=>item.id===target.id);
          if(garrison)damageGarrison(attacker,garrison,2,"Sacrificial Overload");
        }
      });
      addLog(`Sacrificial Overload: Wing Gundam Zero และเป้าหมาย ${targets.length} ตัวรับ Damage 2`);
    }
    else if (card.id==="shattered-formation") { const responseUnit=responders[0]||defender;if(attacker.zone==="board")damageUnit(responseUnit,attacker,2,"Shattered Formation");else addLog("Shattered Formation: ผู้โจมตีถูกทำลายไปแล้ว — ไม่มีเป้าหมาย"); }
    closeModal();renderAll();done();
  }

  function useUnitAbility(unit,slot=1) {
    const ability=slot===2?unit.command2:unit.command;
    const energyCost=Math.max(0,ability?.energy||0);
    if (!canUseCommandAbility(unit,ability)) {
      if(typeof attackPrepCommandExpired==="function"&&attackPrepCommandExpired(unit,ability)){addLog(`${ability.name}: ไม่มีการโจมตีเหลือใน Activation นี้ — ไม่เสีย Energy`);menuOpen=true;renderAll();}
      return;
    }
    const spend=()=>{unit.energy-=energyCost;markCommandAbilityUsed(ability);};
    if (unit.id==="gundam") {
      const allies=state.units.filter(x=>x.team===unit.team&&x.zone==="board"&&E.distance(unit,x)<=3&&E.hasLineOfSight(state,unit,x)&&totalUpgrades(x)<=1);
      if (!allies.length) { addLog("White Base Unity: ไม่มีพันธมิตรใน Range 3 และ Line of Sight");menuOpen=true;renderAll();return; }
      mode={type:"select-unit",unitId:unit.id,targets:new Set(allies.map(x=>E.key(x.q,x.r))),hint:"White Base Unity: เลือกพันธมิตรใน LOS ที่มี Upgrade ไม่เกิน 1 ชิ้น",callback:target=>chooseWhiteBaseUpgrade(target,spend)};
    } else if (unit.id==="guncannon") {
      selectEnemy(unit,3,"Critical Shot: เลือกศัตรู",target=>{spend();applyDebuff(target,"fracture");addLog(`${target.name} ติด Fracture`);});
    } else if (unit.id==="guntank") {
      spend(); const dice=Array.from({length:5},()=>Math.floor(Math.random()*10)+1); const crit=dice.filter(x=>x>=9).length; lastDice={dice,results:dice.map(x=>x>=9?"critical":"miss"),hits:0,criticals:crit,damage:crit,accuracy:0};
      renderAll();showDiceRoll(lastDice,"SATURATED FIRE",()=>{const targets=E.livingEnemies(state,unit).filter(x=>E.distance(unit,x)<=4&&E.hasLineOfSight(state,unit,x));targets.forEach(x=>damageUnit(unit,x,crit,"Saturated Fire"));addLog(`Saturated Fire: ${crit} Critical — สร้าง Damage ${crit} แก่ศัตรู ${targets.length} ตัวใน Range 4 และ Line of Sight`);renderAll();},{manualClose:!isAiTeam(unit.team),aiRoll:isAiTeam(unit.team)});return;
    } else if (unit.id==="chars-zaku") {
      beginAttack(unit.weapons[0],{free:true,onDeclare:spend});
    }
    else if(unit.id==="hero-gundam"){
      const started=startMoveFor(unit,2,0,"Frenzied Charge",moved=>{spend();unit.heroBeamSaberBonus=state.rescuedGarrisons?.[unit.team]||0;afterUnitMove(unit,"ability",()=>{addLog(`Frenzied Charge: Beam Saber ได้ Strength +${unit.heroBeamSaberBonus}`);renderAll();},moved);});
      if(!started){menuOpen=true;renderAll();return;}
    }
    else if(unit.id==="red-comet-zaku"){
      spend();unit.tempAccuracy=2;unit.destroyUpgradeAfterAttack=true;addLog("Checkmate: Accuracy +2 และจะทำลาย Upgrade หลังการโจมตี");
    }
    else if(unit.id==="gundam-epyon"){
      const started=selectEnemy(unit,2,"No Escape: เลือก Unit ศัตรูภายใน Range 2 และ Line of Sight",target=>{spend();applyDebuff(target,"slow");addLog(`${target.name} ติด Slow`);renderAll();},()=>true,{required:true});
      if(!started){menuOpen=true;renderAll();return;}
    }
    else if(unit.id==="eva-01"){
      if(unit.upgrades.shield>0){addLog("AT Field: EVA-01 มี Shield Upgrade อยู่แล้ว");menuOpen=true;renderAll();return;}
      spend();grantUpgrade(unit,"shield",1);addLog("AT Field: EVA-01 ได้รับ Shield Upgrade 1");
    }
    else if(unit.id==="mazinger-z"){
      spend();unit.critFloorOverride=6;addLog("Mazin Power: ผลทอย 6–8 เป็น Critical จนจบ Activation");
    }
    else if(unit.id==="gquuuuuux"){
      spend();unit.tempStrength+=2;addLog("Machu Kira Kira: GQuuuuuuX ได้ Strength +2 จนจบ Activation");
    }
    else if(unit.id==="gfred"){
      spend();unit.tempAccuracy+=1;unit.critFloorOverride=8;addLog("Nyaan Focus: Accuracy +1 และผล 8 เป็น Critical จนจบ Activation");
    }
    else if(unit.id==="mechazawa"){
      const before={energy:unit.energy,commandUsed:{...commandUsageMap()}};
      const rollback=()=>{
        unit.energy=before.energy;state.activation.commandUsed={...before.commandUsed};
        addLog("Motorcycle: ยกเลิกการเคลื่อนที่ — คืน Energy และ Command");
        menuOpen=true;menuView="main";renderAll();
      };
      const started=startMoveFor(unit,2,0,"Motorcycle",moved=>{
        addLog("Motorcycle: Mechazawa เคลื่อนที่เพิ่มโดยไม่ใช้ Primary Action");
        afterUnitMove(unit,"motorcycle",()=>{menuOpen=true;menuView="main";renderAll();},moved);
      },{allowStay:false,onCancel:rollback});
      if(!started){menuOpen=true;renderAll();return;}
      spend();
    }
    else if (unit.id==="zaku-line") {
      const damagedEnemies=E.livingEnemies(state,unit).filter(enemy=>enemy.hp<enemy.maxHp);
      if(!damagedEnemies.length){addLog("Zeon Zealotry: ไม่มี Unit ศัตรูที่มี Damage");menuOpen=true;renderAll();return;}
      startMove(5,0,"Zeon Zealotry",moved=>{spend();afterUnitMove(unit,"ability",null,moved);},{ignoreElevation:true,allowStay:false,destinationFilter:hex=>damagedEnemies.some(enemy=>E.distance(hex,enemy)<E.distance(unit,enemy))});
    }
    else if (unit.id==="zaku-enforcer") {
      if(!adjacentObjectives(unit).length){addLog("Domination: ไม่มี Objective ในช่องเดียวกันหรือช่องติดกัน");menuOpen=true;renderAll();return;}
      selectObjective(unit,"Domination",objective=>{spend();captureObjective(unit,objective,"Domination");},()=>{menuOpen=true;renderAll();});
    }
    else if(unit.id==="wing-zero-ew"){
      spend();unit.tempStrength+=3;addLog("Full Power: Wing Gundam Zero ได้ Strength +3 จนจบ Activation");
    }
    else if(unit.id==="gundam-vidar"&&slot===2){
      const controlled=state.objectives.filter(objective=>objective.owner===unit.team).length;
      if(controlled<2){addLog("Alaya-Vijnana Type E System: ต้องควบคุม Objective อย่างน้อย 2 จุด");menuOpen=true;renderAll();return;}
      startMoveFor(unit,2,0,"Alaya-Vijnana Type E",moved=>{spend();unit.tempStrength+=1;afterUnitMove(unit,"ability",()=>{addLog("Alaya-Vijnana Type E: Strength +1 จนจบ Activation");renderAll();},moved);},{allowStay:true});
    }
    else if(unit.id==="gundam-vidar"){
      const adjacent=E.livingEnemies(state,unit).filter(enemy=>E.distance(unit,enemy)===1);
      if(!adjacent.length){addLog("Hunter’s Edge: ไม่มี Unit ศัตรูที่อยู่ติดกัน");menuOpen=true;renderAll();return;}
      selectEnemy(unit,1,"Hunter’s Edge: เลือก Unit ศัตรูที่อยู่ติดกัน",target=>{
        spend();
        beginPushDirection(unit,target,2,()=>{
          if(target.zone==="board")damageUnit(unit,target,1,"Hunter’s Edge");
          renderAll();
        },"Hunter’s Edge");
      },enemy=>adjacent.includes(enemy),{required:true});
    }
    else if(unit.id==="barbatos-lupus-rex"&&slot===2){
      const legalMove=E.reachable(state,unit,2);
      if(!legalMove.size){addLog("Alaya-Vijnana Exertion: ไม่มีช่องเคลื่อนที่ที่ถูกกติกา");menuOpen=true;renderAll();return;}
      const before={hp:unit.hp,inactiveShields:unit.inactiveShields||0,energy:unit.energy,commandUsed:{...commandUsageMap()}};
      const rollback=()=>{
        unit.hp=before.hp;
        unit.inactiveShields=before.inactiveShields;
        unit.energy=before.energy;
        state.activation.commandUsed={...before.commandUsed};
        menuOpen=true;menuView="main";
        addLog("Alaya-Vijnana Exertion: ยกเลิกการเคลื่อนที่ — คืน Damage/Shield และ Command");
        renderAll();
      };
      spend();
      const damage=damageUnit(unit,unit,3,"Alaya-Vijnana Exertion","ability");
      if(damage.defeated){finishDefeatedActiveActivation(unit,"Alaya-Vijnana Exertion");return;}
      const started=startMoveFor(unit,2,0,"Alaya-Vijnana Exertion",moved=>afterUnitMove(unit,"ability",null,moved),{allowStay:false,onCancel:rollback});
      if(!started)rollback();
    }
    else if(unit.id==="barbatos-lupus-rex"){
      if(!unit.attackedWithRexClaws){addLog("Annihilate: ต้องโจมตีด้วย Rex Claws ใน Activation นี้ก่อน");menuOpen=true;renderAll();return;}
      const rex=unit.weapons.find(weapon=>weapon.id==="rex-claws");
      const legalTargets=rex?E.legalWeaponTargets(state,unit,rex):[];
      if(!rex||!legalTargets.length){addLog("Annihilate: ไม่มีเป้าหมาย Rex Claws ที่โจมตีได้ — ไม่เสีย Energy หรือ Command");menuOpen=true;renderAll();return;}
      spend();beginAttack(rex,{free:true,required:true,attackAgainPrompt:true});
    }
    renderAll();
  }

  function selectEnemy(unit,range,hint,callback,filter=()=>true,options={}) {
    const targets=E.livingEnemies(state,unit).filter(x=>E.distance(unit,x)<=range&&(options.ignoreLos||E.hasLineOfSight(state,unit,x))&&filter(x));
    if (!targets.length) { addLog(`${hint}: ไม่มีเป้าหมายถูกกติกา`); renderAll(); return false; }
    mode={type:"select-unit",unitId:unit.id,targets:new Set(targets.map(x=>E.key(x.q,x.r))),returnMenu:"main",hint,callback,onCancel:options.onCancel,required:!!options.required};menuOpen=true;renderAll();return true;
  }

  function chooseWhiteBaseUpgrade(target,onChoose) {
    if(isAiTeam(activeUnit()?.team)){
      const type=A.chooseUpgrade(target,true);
      onChoose();grantUpgrade(target,type,1);addLog(`AI · White Base Unity: ${target.name} ได้รับ ${type.toUpperCase()} Upgrade 1`);renderAll();return;
    }
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><span class="eyebrow">WHITE BASE UNITY</span><h2>เลือก Upgrade ให้ ${target.name}</h2><div class="modal-actions">${["shield","speed","strength"].map(type=>`<button class="primary-btn" data-white-base-upgrade="${type}">${type.toUpperCase()}</button>`).join("")}<button class="action-btn" id="cancel-white-base">ยกเลิก</button></div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);
    modal.querySelectorAll("[data-white-base-upgrade]").forEach(button=>button.addEventListener("click",()=>{onChoose();grantUpgrade(target,button.dataset.whiteBaseUpgrade,1);addLog(`White Base Unity: ${target.name} ได้รับ ${button.dataset.whiteBaseUpgrade.toUpperCase()} Upgrade 1`);closeModal();renderAll();}));
    modal.querySelector("#cancel-white-base").addEventListener("click",closeModal);
  }

  function selectAlly(unit,range,hint,callback,filter=()=>true,options={}) {
    const targets=state.units.filter(target=>target.team===unit.team&&target.zone==="board"&&E.distance(unit,target)<=range&&filter(target));
    if(!targets.length){addLog(`${hint}: ไม่มีเป้าหมายถูกกติกา`);renderAll();return false;}
    mode={type:"select-unit",unitId:unit.id,targets:new Set(targets.map(target=>E.key(target.q,target.r))),returnMenu:"main",hint,callback,onCancel:options.onCancel};menuOpen=true;renderAll();return true;
  }

  function offerRescueMechanics(unit,onComplete=()=>{}) {
    const damagedAllies=state.units.filter(target=>target.team===unit.team&&target.zone==="board"&&target.hp<target.maxHp);
    if(unit.id!=="zaku-line"||!damagedAllies.length){onComplete();return;}
    if(isAiTeam(unit.team)){
      const ally=damagedAllies.sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp))[0];
      const repaired=Math.min(2,ally.maxHp-ally.hp);ally.hp+=repaired;
      addLog(`AI · Rescue the Mechanics: ${ally.name} ซ่อมแซม Damage ${repaired}`);renderAll();onComplete();return;
    }
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><div class="tactic-confirm-layout"><img class="modal-card-image" src="${unit.card}" alt="Unit Card ${unit.name}"><div><span class="eyebrow">UNIT RESPONSE // AFTER RESCUE</span><h2>Rescue the Mechanics</h2><p>${unit.response.text}${englishCardText(unit.response)}</p><div class="modal-actions"><button class="primary-btn" id="confirm-rescue-mechanics">ใช้ Response</button><button class="action-btn" id="skip-rescue-mechanics">ไม่ใช้ Response <span>SKIP</span></button></div></div></div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);
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

  function hackingUnitForTeam(team){
    return state.units.find(candidate=>candidate.id==="mechazawa"&&candidate.team===team&&candidate.zone==="board")||null;
  }

  function queueHackingSystem(team){
    const mechazawa=hackingUnitForTeam(team);
    if(!mechazawa)return false;
    mechazawa.hackingPending=(mechazawa.hackingPending||0)+1;
    return true;
  }

  function offerHackingSystem(triggerUnit,onComplete=()=>{}){
    const unit=hackingUnitForTeam(triggerUnit?.team);
    const pending=Math.max(0,Number(unit?.hackingPending)||0);
    if(!unit||pending<=0){onComplete();return;}
    const continuePending=()=>offerHackingSystem(triggerUnit,onComplete);
    const damaged=state.units.filter(target=>target.team===unit.team&&target.zone==="board"&&target.hp<target.maxHp);
    const consumeTrigger=()=>{unit.hackingPending=Math.max(0,(unit.hackingPending||0)-1);};
    if(!damaged.length){consumeTrigger();addLog("Hacking System: ไม่มี Unit ฝ่ายเราที่มี Damage — ข้าม Response");continuePending();return;}
    const repair=target=>{consumeTrigger();const amount=Math.min(1,target.maxHp-target.hp);target.hp+=amount;addLog(`Hacking System: ${target.name} ซ่อม Damage ${amount}`);renderAll();continuePending();};
    if(isAiTeam(unit.team)){repair(damaged.sort((a,b)=>(b.maxHp-b.hp)-(a.maxHp-a.hp))[0]);return;}
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><div class="tactic-confirm-layout"><img class="modal-card-image" src="${unit.card}" alt="${unit.name}"><div><span class="eyebrow">RESPONSE // GARRISON EVENT</span><h2>Hacking System</h2><p>Trigger ${pending}: ซ่อม Damage 1 ให้ Unit ฝ่ายเรา 1 ตัว หรือข้าม Response นี้</p><div class="modal-actions"><button class="primary-btn" id="use-hacking">USE</button><button class="action-btn" id="skip-hacking">SKIP</button></div></div></div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);
    modal.querySelector("#use-hacking").addEventListener("click",()=>{
      closeModal();
      selectAlly(unit,Infinity,`Hacking System (${pending}): เลือก Unit ฝ่ายเราเพื่อซ่อม Damage 1`,repair,target=>target.hp<target.maxHp,{onCancel:()=>offerHackingSystem(unit,onComplete)});
    });
    modal.querySelector("#skip-hacking").addEventListener("click",()=>{consumeTrigger();addLog("Hacking System: SKIP");closeModal();renderAll();continuePending();});
  }

  function offerEscapeFromSide7(unit,onComplete=()=>{}){
    if(unit.id!=="hero-gundam"){onComplete();return;}
    if(isAiTeam(unit.team)){unit.energy+=1;addLog("AI · Escape from Side 7: Energy +1");renderAll();onComplete();return;}
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><div class="tactic-confirm-layout"><img class="modal-card-image" src="${unit.card}" alt="${unit.name}"><div><span class="eyebrow">UNIT RESPONSE // AFTER RESCUE</span><h2>Escape from Side 7</h2><p>รับ Energy 1 หรือข้าม Response นี้</p><div class="modal-actions"><button class="primary-btn" id="use-escape">ใช้ Response</button><button class="action-btn" id="skip-escape">ข้าม</button></div></div></div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);
    modal.querySelector("#use-escape").addEventListener("click",()=>{unit.energy+=1;addLog("Escape from Side 7: Energy +1");closeModal();renderAll();onComplete();});
    modal.querySelector("#skip-escape").addEventListener("click",()=>{closeModal();onComplete();});
  }

  function rescueGarrison(unit,range,useAction,onSuccess=null,onComplete=()=>{},options={}) {
    const targets=state.garrisons.filter(g=>g.team===unit.team&&E.distance(unit,g)<=range&&(!options.requireLos||E.hasLineOfSight(state,unit,g))).sort((a,b)=>E.distance(unit,a)-E.distance(unit,b));
    if (!targets.length) { addLog("ไม่มีกองรักษาการณ์ฝ่ายเดียวกันในระยะ Rescue");renderAll();return false; }
    const commit=target=>{
      if(useAction){state.activation.actionUsed=true;payTimeline(unit,D.rules.rescue.timeline);}
      state.garrisons=state.garrisons.filter(g=>g.id!==target.id);state.vp[unit.team]+=D.rules.rescue.vp;E.recordGarrisonRescue(state,unit);
      if(unit.id==="mechazawa")queueHackingSystem(unit.team);
      if(onSuccess)onSuccess();
      addLog(`${unit.name} Rescue Garrison สำเร็จ — +${D.rules.rescue.vp} VP`);
      const continueResponses=()=>offerEscapeFromSide7(unit,()=>offerRescueMechanics(unit,()=>offerHackingSystem(unit,onComplete)));
      const rescueCards=["shield-recovery","logistics-relay"].filter(id=>factionHasTactic(unit.team,id)&&inHand(unit.team,id)&&!isUsed(id,unit.team)).map(id=>getTactic(id,unit.team));
      if(rescueCards.length&&!state.activation.tacticUsed[unit.team])openResponse(rescueCards,card=>{useResponse(card);if(card.id==="shield-recovery")grantUpgrade(unit,"shield",1);else grantUpgrade(unit,"speed",1);closeModal();renderAll();continueResponses();},continueResponses);
      else continueResponses();
      renderAll();
    };
    if(targets.length===1){commit(targets[0]);return true;}
    mode={type:"select-garrison",unitId:unit.id,targets:new Set(targets.map(target=>E.key(target.q,target.r))),returnMenu:"main",hint:`Rescue: เลือก Garrison ฝ่ายเดียวกันภายใน Range ${range}`,callback:commit,onCancel:onComplete};menuOpen=true;renderAll();return true;
  }

  function handleTactic(id) {
    const unit=activeUnit();
    const owner=matchMode==="ai"?humanTeam:unit?.team;
    const card=getTactic(id,owner); if (!card||!inHand(owner,id)) return;
    const playable=["COMMAND","ATTACK"].includes(card.timing);
    const busyAttack=attackResolutionBusy();
    const legal=!isUsed(id,owner)&&playable&&!state.activation.tacticUsed[owner]&&!mode&&!busyAttack&&!(card.timing==="ATTACK"&&state.activation.actionUsed);
    const issue=isUsed(id,owner)?"การ์ดใบนี้ถูกใช้แล้ว":!playable?"Response ใช้ได้เฉพาะเมื่อ Trigger เกิดขึ้น":state.activation.tacticUsed[owner]?"ฝ่ายนี้ใช้ Tactic ใน Activation นี้แล้ว":busyAttack?"รอให้การโจมตีปัจจุบัน Resolve ให้เสร็จก่อน":mode?"ยกเลิกการเลือกเป้าหมายปัจจุบันก่อน":card.timing==="ATTACK"&&state.activation.actionUsed?"ใช้ Primary Action ไปแล้ว":commandTacticIssue(card,unit);
    showCard(card,issue||"ตรวจความสามารถแล้วกด Confirm เพื่อใช้การ์ด",legal&&!issue?()=>{
      const use=()=>card.timing==="ATTACK"?useAttackTactic(card):useCommandTactic(card);
      if(movementDraft)commitMovementDraft(use);else use();
    }:null);
  }

  function commandTacticIssue(card,unit) {
    if(!unit||unit.team!==tacticOwner(card))return "ใช้ได้เฉพาะ Activation ของฝ่ายเจ้าของการ์ด";
    if(card.unitOnly&&unit.id!==card.unitOnly)return `ใช้ได้เฉพาะ ${D.units.find(candidate=>candidate.id===card.unitOnly)?.name||"ยูนิตที่กำหนด"}`;
    if(card.id==="entrenched-position"&&unit.id!=="guntank")return "ใช้ได้เมื่อ Guntank กำลังทำงาน";
    if(card.id==="forward-artillery"&&unit.id!=="guncannon")return "ใช้ได้เมื่อ Guncannon กำลังทำงาน";
    if(card.id==="last-shot-counts"&&unit.id!=="gundam")return "ใช้ได้เมื่อ Gundam กำลังทำงาน";
    if(card.id==="rescued-extraction"&&unit.id!=="zaku-line")return "ใช้ได้เมื่อ Zaku II: Line Breaker กำลังทำงาน";
    if(card.id==="rescued-extraction"&&!hasOwnGarrisonInRange(unit,3,true))return "ไม่มี Garrison ฝ่ายเดียวกันใน Range 3 และ Line of Sight";
    if(card.id==="crimson-execution"&&!['chars-zaku','red-comet-zaku'].includes(unit.id))return "ใช้ได้เมื่อ Char’s Zaku II กำลังทำงาน";
    if(card.id==="berserk"&&unit.hp<=1)return "EVA-01 ต้องมี HP มากกว่า 1";
    if(card.id==="kira-kira"&&state.activation.actionUsed)return "KIRA KIRA! ต้องใช้ก่อนประกาศการโจมตี และ Primary Action ยังต้องว่าง";
    if(card.id==="lock-down"&&!E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target)))return "ไม่มี Unit ศัตรูใน Range 3 และ Line of Sight";
    if(card.id==="breaking-line"&&!E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target)))return "ไม่มี Unit ศัตรูใน Range 3 และ Line of Sight";
    if(card.id==="sudden-pressure"){
      const hasUnit=E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target));
      const hasGarrison=state.garrisons.some(target=>target.team!==unit.team&&E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target));
      if(!hasUnit&&!hasGarrison)return "ไม่มี Unit หรือ Garrison ศัตรูใน Range 3 และ Line of Sight";
    }
    return "";
  }

  function markCommand(card) { const team=tacticOwner(card);E.retireTacticCard(state,team,card.id);state.activation.tacticUsed[team]=true;addLog(`ใช้ Tactic: ${card.name}`); }
  function useResponse(card) { const team=tacticOwner(card);E.retireTacticCard(state,team,card.id);state.activation.tacticUsed[team]=true;addLog(`Response: ${card.name}`); }

  function continueCrimsonExecution(card,unit) {
    if(!unit||unit.id!==state.activeUnitId||unit.zone!=="board")return false;
    if(!isUsed(card.id,tacticOwner(card)))markCommand(card);
    const heatHawk=unit.weapons.find(weapon=>weapon.id==="char-heat-hawk"||weapon.id==="red-comet-heat-hawk");
    if(!heatHawk){addLog("Crimson Execution: ไม่พบข้อมูล Heat Hawk");renderAll();return false;}
    addLog("Crimson Execution: Heat Hawk Attack · Timeline 0");
    const started=beginAttack(heatHawk,{free:true,required:true,attackAgainPrompt:true});
    if(!started){
      // The Attack is mandatory only when a legal target exists. If the Dash ends
      // with no legal Heat Hawk target, the committed Tactic resolves safely here.
      addLog("Crimson Execution: ไม่มีเป้าหมาย Heat Hawk ที่ถูกกติกาหลัง Dash — ข้ามส่วน Attack และจบเอฟเฟกต์");
      mode=null;menuOpen=true;menuView="main";renderAll();
      return true;
    }
    return true;
  }

  function useAttackTactic(card){
    const unit=activeUnit();
    if(commandTacticIssue(card,unit)||!card.weapon)return false;
    const started=beginAttack({...card.weapon},{onDeclare:()=>markCommand(card)});
    if(!started)addLog(`${card.name}: ไม่มีแนวหรือเป้าหมายที่โจมตีได้`);
    return started;
  }

  function resolveGundamGo(card) {
    const unit=activeUnit();
    const owner=tacticOwner(card);
    const allies=state.units.filter(candidate=>candidate.team===owner&&candidate.zone==="board");
    markCommand(card);
    if(!allies.length){addLog("GUNDAM GO!: ไม่มี Unit บนสนามให้เคลื่อนที่");renderAll();return;}
    const remaining=new Set(allies.map(candidate=>candidate.id));
    const finish=()=>{mode=null;menuOpen=true;menuView="main";renderAll();};
    const moveOne=(ally,onDone)=>{
      if(!ally||ally.zone!=="board"){onDone();return;}
      const started=startMoveFor(ally,1,0,"GUNDAM GO!",moved=>afterUnitMove(ally,"tactic",onDone,moved),{allowStay:true,returnMenu:"main",onCancel:onDone});
      if(!started){onDone();return;}
      if(isAiTeam(owner)){
        const reachable=E.reachable(state,ally,1);
        const choice=A.chooseMove(state,ally,reachable.keys(),D,E,true);
        if(choice)aiPreferredTargetKey=E.key(choice.q,choice.r);
        scheduleAiResolveMode();
      }
    };
    if(isAiTeam(owner)){
      const queue=[...allies];
      const next=()=>{const ally=queue.shift();if(!ally){finish();return;}remaining.delete(ally.id);moveOne(ally,next);};
      next();return;
    }
    const chooseNext=()=>{
      const choices=[...remaining].map(id=>state.units.find(candidate=>candidate.id===id)).filter(candidate=>candidate?.zone==="board");
      if(!choices.length){finish();return;}
      const modal=ensureModal();
      modal.innerHTML=`<div class="modal-card"><span class="eyebrow">GUNDAM GO! // TEAM MOVE</span><h2>เลือก Unit ที่จะ Move up to 1</h2><p>แต่ละ Unit ใช้สิทธิ์ได้ครั้งเดียว เป็น Movement ปกติทั้งหมด</p><div class="modal-actions">${choices.map(ally=>`<button class="primary-btn" data-gundam-go-unit="${ally.id}">${ally.name}</button>`).join("")}<button class="action-btn" id="finish-gundam-go">จบเอฟเฟกต์</button></div></div>`;
      modal.classList.add("show");lockResolutionModal(modal);
      modal.querySelectorAll("[data-gundam-go-unit]").forEach(button=>button.addEventListener("click",()=>{
        const ally=state.units.find(candidate=>candidate.id===button.dataset.gundamGoUnit);
        if(!ally)return;
        remaining.delete(ally.id);closeModal();moveOne(ally,chooseNext);
      }));
      modal.querySelector("#finish-gundam-go").addEventListener("click",()=>{closeModal();finish();});
    };
    chooseNext();
  }

  function useCommandTactic(card) {
    const unit=activeUnit();
    if(card.id==="gundam-go"){resolveGundamGo(card);return;}
    if(card.id==="kira-kira"){markCommand(card);unit.nextAttackCriticalOverdrive=true;addLog(`KIRA KIRA!: ${unit.name} เตรียมการโจมตี — Damage +1 ต่อ Critical ทุกลูก`);}
    else if (card.id==="built-to-last") { markCommand(card);const repair=totalUpgrades(unit);unit.hp=Math.min(unit.maxHp,unit.hp+repair);addLog(`${unit.name} ซ่อม HP ${repair}`); }
    else if(card.id==="renewed-power"){markCommand(card);grantUpgrade(unit,"strength",1);addLog(`Renewed Power: ${unit.name} ได้รับ Strength Upgrade 1`);}
    else if(card.id==="berserk"){
      if(unit.id!=="eva-01"||unit.hp<=1)return showCard(card,"EVA-01 ต้องมี HP มากกว่า 1");
      markCommand(card);unit.hp=1;grantUpgrade(unit,"speed",3);grantUpgrade(unit,"strength",3);grantUpgrade(unit,"shield",3);unit.berserkActive=true;
      addLog("Berserk: EVA-01 เหลือ HP 1 และได้รับ Speed/Strength/Shield +3");
    }
    else if(card.id==="jet-scrander"){
      if(unit.id!=="mazinger-z")return showCard(card,"ใช้ได้เฉพาะ Mazinger Z");
      const enemies=E.livingEnemies(state,unit);
      const closer=hex=>enemies.some(enemy=>E.distance(hex,enemy)<E.distance(unit,enemy));
      const started=startMoveFor(unit,5,0,"Jet Scrander",moved=>{markCommand(card);afterUnitMove(unit,"tactic",null,moved);},{ignoreElevation:true,destinationFilter:closer});
      if(!started)addLog("Jet Scrander: ไม่มีช่องที่เคลื่อนเข้าใกล้ศัตรูได้");
    }
    else if (card.id==="entrenched-position") {
      if(unit.id!=="guntank")return showCard(card,"ใช้ได้เมื่อ Guntank กำลังทำงาน");
      markCommand(card);grantUpgrade(unit,"shield",1);
      if(adjacentObjectives(unit).length)selectObjective(unit,"Entrenched Position",objective=>captureObjective(unit,objective,"Entrenched Position"),()=>{},true);
    }
    else if (card.id==="forward-artillery") { if(unit.id!=="guncannon")return showCard(card,"ใช้ได้เมื่อ Guncannon กำลังทำงาน");markCommand(card);unit.energy+=1;const rescued=state.rescuedGarrisons?.[unit.team]||0;unit.tempStrength+=rescued;addLog(`Forward Artillery: Strength ชั่วคราว +${rescued} (Garrison ที่ E.F.S.F. ช่วยไว้)`); }
    else if (card.id==="last-shot-counts") { if(unit.id!=="gundam")return showCard(card,"ใช้ได้เมื่อ Gundam กำลังทำงาน");markCommand(card);grantUpgrade(unit,"strength",1);unit.nextAttackDiscount=1;unit.lastShotBonus=true; }
    else if (card.id==="rookies-momentum") { markCommand(card);unit.tempStrength+=2;unit.critBoost=true; }
    else if (card.id==="lock-down"||card.id==="breaking-line") {
      const valid=selectEnemy(unit,3,`${card.name}: เลือก Unit ศัตรูใน Line of Sight`,target=>chooseUpgradeToDestroy(card,target));
      if(!valid)return;
    }
    else if (card.id==="rescued-extraction") { if(unit.id!=="zaku-line"||!hasOwnGarrisonInRange(unit,3,true))return showCard(card,"ต้องใช้โดย Zaku II: Line Breaker ที่มี Garrison ใน Range 3 และ Line of Sight");rescueGarrison(unit,3,false,()=>{markCommand(card);unit.energy+=1;},()=>{},{requireLos:true}); }
    else if (card.id==="drive-them-back") {
      const canPushFrom=hex=>E.livingEnemies(state,unit).some(enemy=>E.distance(hex,enemy)===1);
      startMove(2,0,"Drive Them Back",moved=>{
        markCommand(card);
        afterUnitMove(unit,"tactic",()=>{
          const started=selectEnemy(unit,1,"Drive Them Back: เลือกยูนิตศัตรูที่ติดกัน",enemy=>{
            beginPushDirection(unit,enemy,1,()=>{
              if(enemy.zone==="board")damageUnit(unit,enemy,1,"Drive Them Back","tactic");
              renderAll();
            },"Drive Them Back");
          },()=>true,{required:true});
          // Required resolution applies only when a legal target exists. A target can
          // disappear during an intervening Response, so never leave an empty required mode.
          if(!started){
            addLog("Drive Them Back: ไม่มี Unit ศัตรูที่ถูกกติกาให้ผลัก — ข้ามส่วน Push/Damage และจบเอฟเฟกต์");
            mode=null;menuOpen=true;menuView="main";renderAll();
          }
        },moved);
      },{allowStay:canPushFrom(unit),destinationFilter:canPushFrom});
    }
    else if (card.id==="sudden-pressure") {
      markCommand(card);
      const enemyUnits=E.livingEnemies(state,unit).filter(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target));
      const enemyGarrisons=state.garrisons.filter(target=>target.team!==unit.team&&E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target));
      enemyUnits.forEach(target=>damageUnit(unit,target,2,"Sudden Pressure"));
      enemyGarrisons.slice().forEach(target=>damageGarrison(unit,target,2,"Sudden Pressure"));
      addLog(`Sudden Pressure: เป้าหมายใน Range 3 และ Line of Sight — Unit ${enemyUnits.length}, Garrison ${enemyGarrisons.length} รับ Damage 2`);
    }
    else if (card.id==="crimson-execution") {
      if(!["chars-zaku","red-comet-zaku"].includes(unit.id))return showCard(card,"ใช้ได้เมื่อ Char’s Zaku II กำลังทำงาน");
      const commitCard=()=>{if(!isUsed(card.id,tacticOwner(card)))markCommand(card);};
      const attackAfterDash=()=>continueCrimsonExecution(card,unit);
      if(isAiTeam(unit.team)){
        startMove(D.rules.dash.distance+1,0,"Crimson Dash",moved=>{commitCard();afterUnitMove(unit,"dash",attackAfterDash,moved);});
      }else{
        const started=beginAdjustableCharDash(unit,0,"Crimson Dash",attackAfterDash,{primaryAction:false,onCommit:commitCard,onCancel:()=>{menuOpen=true;menuView="main";renderAll();}});
        if(!started){menuOpen=true;menuView="main";renderAll();}
      }
    }
    renderAll();
  }

  function chooseUpgradeToDestroy(card,target) {
    const choices=["shield","speed","strength"].filter(type=>target.upgrades[type]>0);
    const apply=type=>{markCommand(card);if(type){target.upgrades[type]-=1;if(type==="shield")target.inactiveShields=Math.min(target.inactiveShields||0,target.upgrades.shield);}const status=card.id==="lock-down"?"slow":"fracture";applyDebuff(target,status);addLog(`${target.name}${type?` เสีย ${type} Upgrade 1 และ`:""} ติด ${status==="slow"?"Slow":"Fracture"}`);closeModal();renderAll();};
    if(!choices.length){apply(null);return;}
    if(isAiTeam(tacticOwner(card))){const selected=A.chooseUpgrade(target,false);apply(choices.includes(selected)?selected:choices[0]);return;}
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><button class="modal-close" aria-label="ปิด">×</button><span class="eyebrow">${card.name.toUpperCase()}</span><h2>เลือก Upgrade ที่จะทำลาย</h2><p>${target.name} — การทำลาย Upgrade เป็นตัวเลือก แต่ Status จะเกิดขึ้นเสมอ</p><div class="modal-actions">${choices.map(type=>`<button class="primary-btn" data-upgrade-choice="${type}">${type.toUpperCase()} · ${target.upgrades[type]}</button>`).join("")}<button class="action-btn" id="skip-upgrade-destroy">ไม่ทำลาย Upgrade</button></div></div>`;
    modal.classList.add("show");lockResolutionModal(modal);modal.querySelector(".modal-close").addEventListener("click",()=>apply(null));modal.querySelectorAll("[data-upgrade-choice]").forEach(button=>button.addEventListener("click",()=>apply(button.dataset.upgradeChoice)));modal.querySelector("#skip-upgrade-destroy").addEventListener("click",()=>apply(null));
  }

  function openResponse(cards,onPlay,onSkip=closeModal,decisionContext={}) {
    const aiCard=cards.find(card=>isAiTeam(tacticOwner(card)));
    if(aiCard){
      const responseTarget=pendingAttack?.defender;
      const damage=Math.max(0,pendingAttack?.result?.damage||0);
      const totalShields=Math.max(0,responseTarget?.upgrades?.shield||0);
      const inactiveShields=Math.min(totalShields,Math.max(0,responseTarget?.inactiveShields||0));
      const activeShields=Math.max(0,totalShields-inactiveShields);
      const context={damage,effectiveDamage:Math.max(0,damage-activeShields),activeShields,hp:responseTarget?.hp,attackerAlive:decisionContext.attackerAlive??(pendingAttack?.attacker?.zone==="board"),canAttack:true,...decisionContext};
      // Once the AI commits to a Response, reveal the played card and pause the
      // resolution until the human closes it. Declined cards remain private.
      if(A.shouldUseResponse(aiCard,context))showAiTacticCard(aiCard,()=>onPlay(aiCard));
      else onSkip();
      return;
    }
    const modal=ensureModal();
    let selected=cards[0];
    const render=()=>{
      modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><span class="eyebrow">RESPONSE WINDOW // ${teamName(tacticOwner(selected))}</span><h2>ตรวจการ์ดก่อนยืนยัน</h2>${cards.length>1?`<div class="response-picker">${cards.map(card=>`<button class="${card.id===selected.id?"selected":""}" data-response-preview="${card.id}">${card.name}</button>`).join("")}</div>`:""}<div class="tactic-confirm-layout"><img class="modal-card-image" src="${selected.card}" alt="${selected.name}"><div><h3>${selected.name}</h3><p>${selected.text}${englishCardText(selected)}</p><div class="modal-actions"><button class="primary-btn" id="confirm-response">Confirm ใช้ Response</button><button class="action-btn" id="skip-response">ไม่ใช้ Response <span>SKIP</span></button></div></div></div></div>`;
      modal.classList.add("show");lockResponseModal(modal);
      modal.querySelectorAll("[data-response-preview]").forEach(btn=>btn.addEventListener("click",()=>{selected=getTactic(btn.dataset.responsePreview,tacticOwner(selected));render();}));
      modal.querySelector("#confirm-response").addEventListener("click",()=>onPlay(selected));
      modal.querySelector("#skip-response").addEventListener("click",()=>{closeModal();onSkip();});
    };
    render();
  }

  function showAiTacticCard(card,onContinue=()=>{}) {
    const modal=ensureModal();
    let continued=false;
    const proceed=()=>{
      if(continued)return;
      continued=true;
      closeModal();renderAll();onContinue();
    };
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal ai-tactic-reveal"><button class="modal-close" id="close-ai-tactic" aria-label="ปิดและดำเนินการต่อ">×</button><span class="eyebrow">AI ${card.timing} // TACTIC REVEAL</span><h2>AI ใช้ ${card.name}</h2><div class="tactic-confirm-layout"><img class="modal-card-image" src="${card.card}" alt="Tactic Card ${card.name}"><div><h3>${card.name}</h3><p>${card.text}${englishCardText(card)}</p><p class="chip">เกมจะหยุดรอจนกว่าผู้เล่นจะปิดการ์ดใบนี้</p><div class="modal-actions"><button class="primary-btn" id="continue-ai-tactic">ปิดและดำเนินการต่อ</button></div></div></div></div>`;
    modal.classList.add("show");
    lockResolutionModal(modal,"#continue-ai-tactic,#close-ai-tactic");
    modal.querySelector("#continue-ai-tactic").addEventListener("click",proceed);
    modal.querySelector("#close-ai-tactic").addEventListener("click",proceed);
  }

  function ensureModal() {
    let modal=$("#game-modal"); if(!modal){modal=document.createElement("div");modal.id="game-modal";modal.className="overlay";document.body.appendChild(modal);}return modal;
  }
  function lockResolutionModal(modal,preferredSelector="button,[href],[tabindex]:not([tabindex='-1'])") {
    if(!modal)return;
    if(modal.dataset.modalLock!=="true")responseModalRestoreFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    modal.dataset.modalLock="true";modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");document.body.classList.add("modal-open");
    const shell=$(".game-shell");if(shell)shell.inert=true;
    requestAnimationFrame(()=>{const focusable=modal.querySelector(preferredSelector)||modal.querySelector("button:not([disabled]),[href],[tabindex]:not([tabindex='-1'])");if(focusable&&!focusable.disabled)focusable.focus?.({preventScroll:true});else{if(!modal.hasAttribute("tabindex"))modal.tabIndex=-1;modal.focus?.({preventScroll:true});}});
  }
  function lockResponseModal(modal) {
    if(!modal)return;
    modal.dataset.responseLock="true";
    lockResolutionModal(modal,"#confirm-response,[data-response-preview],#skip-response,button,[href],[tabindex]:not([tabindex='-1'])");
  }
  function releaseResolutionModalLock(modal) {
    if(!modal||modal.dataset.modalLock!=="true")return;
    delete modal.dataset.modalLock;delete modal.dataset.responseLock;document.body.classList.remove("modal-open");
    const shell=$(".game-shell");if(shell&&!document.body.classList.contains("title-active"))shell.inert=false;
    const restore=responseModalRestoreFocus;responseModalRestoreFocus=null;
    if(restore?.isConnected&&!restore.closest?.("[inert]"))restore.focus?.({preventScroll:true});
  }
  function closeModal(){const m=$("#game-modal");if(m){releaseResolutionModalLock(m);m.classList.remove("show");}}

  function scheduleAiCallback(callback,delay=AI_PACE.between) {
    const epoch=gameEpoch;
    const timer=setTimeout(()=>{
      if(epoch!==gameEpoch||state?.status!=="playing")return;
      if(aiThinkingTimer===timer)aiThinkingTimer=null;
      callback();
    },delay);
    aiThinkingTimer=timer;
    return timer;
  }

  function scheduleAiTurn(unit,delay=AI_PACE.turnStart) {
    const unitId=unit?.id;
    scheduleAiCallback(()=>{
      const current=activeUnit();
      if(!current||current.id!==unitId||!isAiTeam(current.team))return;
      runAiTurn(current);
    },delay);
  }

  function aiClickHex(q,r) {
    aiPerforming=true;
    try{handleHexClick(q,r);}finally{aiPerforming=false;}
  }

  function scheduleAiResolveMode(delay=AI_PACE.target) {
    scheduleAiCallback(()=>{
      const unit=modeUnit();
      if(!unit||!isAiTeam(unit.team)||!mode)return;
      const preferred=aiPreferredTargetKey&&mode.targets?.has(aiPreferredTargetKey)?aiPreferredTargetKey:null;
      let choice=null;
      if(preferred){const [q,r]=E.fromKey(preferred);choice={q,r};}
      else if(mode.type==="move"){
        const aggressive=/Drive Them Back|Crimson Dash/.test(mode.label||"");
        const enemyPieces=aggressive?[
          ...state.units.filter(target=>target.team!==unit.team&&target.zone==="board"),
          ...state.garrisons.filter(target=>target.team!==unit.team)
        ]:[];
        const attackKeys=aggressive?[...mode.targets].filter(value=>{const [q,r]=E.fromKey(value);return enemyPieces.some(target=>E.distance({q,r},target)===1);}):[];
        choice=A.chooseMove(state,unit,attackKeys.length?attackKeys:mode.targets,D,E,!!mode.allowStay);
      }
      else choice=A.chooseModeTarget(state,unit,mode,D,E);
      aiPreferredTargetKey=null;
      if(choice){
        // A.chooseMove may legitimately decide that staying put is best when the
        // movement mode allows zero displacement (notably Guncannon/Char Critical
        // Dash follow-ups). The current hex is intentionally not in mode.targets,
        // so routing that decision through handleHexClick used to leave the AI
        // stuck in MOVE mode indefinitely. Commit the stay directly instead.
        if(mode.type==="move"&&mode.allowStay&&choice.q===unit.q&&choice.r===unit.r){
          addLog(`AI · ${unit.name} เลือกคงตำแหน่งสำหรับ ${mode.label||"Move"}`);
          aiPerforming=true;try{completeMove(unit.q,unit.r);}finally{aiPerforming=false;}return;
        }
        aiClickHex(choice.q,choice.r);return;
      }
      if(mode.type==="move"&&mode.allowStay){aiPerforming=true;try{completeMove(unit.q,unit.r);}finally{aiPerforming=false;}return;}
      const onCancel=mode.onCancel;mode=null;menuOpen=false;if(onCancel)onCancel();renderAll();
    },delay);
  }

  function aiWaitForSettled(unit,next,attempt=0) {
    if(!unit||unit.id!==state.activeUnitId||!isAiTeam(unit.team)){aiBusy=false;return;}
    if(mode){
      const actor=modeUnit();
      const aiOwned=!!actor&&isAiTeam(actor.team);
      if(aiOwned&&attempt>AI_WATCHDOG_ATTEMPTS){
        const onCancel=mode.onCancel;mode=null;menuOpen=false;
        addLog("AI ยกเลิกการเลือกเป้าหมายที่ใช้เวลานานผิดปกติ");
        renderAll();
        if(onCancel)onCancel();else next();
        return;
      }
      if(aiOwned)scheduleAiResolveMode(AI_PACE.target);
      scheduleAiCallback(()=>aiWaitForSettled(unit,next,attempt+(aiOwned?1:0)),AI_PACE.poll);
      return;
    }
    const modal=$("#game-modal");
    if(modal?.classList.contains("show")){
      scheduleAiCallback(()=>aiWaitForSettled(unit,next,attempt),AI_PACE.poll);return;
    }
    if(diceAnimationTimer||pendingAttack||transitionBusy||aiResponsePending||aiEffectPending||attackTargetingBusy){
      if(attempt>AI_WATCHDOG_ATTEMPTS){
        addLog("AI ยุติขั้นตอนภายในที่ใช้เวลานานผิดปกติ");
        clearAttackTargetingFx();mode=null;pendingAttack=null;aiResponsePending=false;aiEffectPending=false;closeModal();renderAll();aiFinishTurn(unit);return;
      }
      scheduleAiCallback(()=>aiWaitForSettled(unit,next,attempt+1),AI_PACE.poll);return;
    }
    scheduleAiCallback(next,AI_PACE.between);
  }

  function aiUsePreMoveAbility(unit,onComplete) {
    if(unit?.id!=="mechazawa"||!canUseCommandAbility(unit,unit.command)){onComplete();return;}
    const choice=aiMotorcycleChoice(unit);
    if(!choice){onComplete();return;}
    aiPreferredTargetKey=E.key(choice.q,choice.r);
    addLog(`AI · ใช้ Command ${unit.command.name} เพื่อเคลื่อนที่แยกก่อน Advance`);renderAll();
    useUnitAbility(unit,1);
    aiWaitForSettled(unit,onComplete);
  }

  function aiMotorcycleChoice(unit){
    if(unit?.id!=="mechazawa"||unit.zone!=="board")return null;
    const reachable=E.reachable(state,unit,2);
    const choice=A.chooseMove(state,unit,reachable.keys(),D,E,false);
    const currentScore=A.positionScore(state,unit,unit.q,unit.r,D,E);
    return choice&&choice.score>=currentScore+6?choice:null;
  }

  function aiAdvance(unit,onComplete) {
    if(unit.statuses.slow){handleAction("advance");scheduleAiCallback(onComplete,AI_PACE.between);return;}
    const allowance=D.rules.advance.distance+(unit.upgrades.speed||0)+(unit.movementBonus||0);
    const reachable=E.reachable(state,unit,allowance);
    const choice=A.chooseMove(state,unit,reachable.keys(),D,E,unit.zone!=="deploying");
    const currentScore=unit.zone==="board"?A.positionScore(state,unit,unit.q,unit.r,D,E):-Infinity;
    const mustMove=unit.zone==="deploying";
    if(!choice&&mustMove){resolveBlockedDeployment(unit);return;}
    if(!choice||(!mustMove&&choice.q===unit.q&&choice.r===unit.r)||(!mustMove&&choice.score<currentScore+4)){
      onComplete();return;
    }
    const started=startMove(allowance,D.rules.advance.timeline,"Advance",moved=>afterUnitMove(unit,"advance",onComplete,moved));
    if(!started){onComplete();return;}
    aiPreferredTargetKey=E.key(choice.q,choice.r);
    scheduleAiResolveMode();
  }

  function aiUseTactic(unit,onComplete) {
    if(state.activation.tacticUsed[unit.team]){onComplete();return;}
    const card=A.chooseCommandTactic(state,unit,D,E);
    if(!card||commandTacticIssue(card,unit)){onComplete();return;}
    addLog(`AI · เลือกใช้ Tactic ${card.name} — รอผู้เล่นปิดการ์ด`);renderAll();
    showAiTacticCard(card,()=>{
      addLog(`AI · ใช้ Tactic ${card.name}`);renderAll();
      useCommandTactic(card);
      aiWaitForSettled(unit,onComplete);
    });
  }

  function aiAbilityChoice(unit) {
    const command1=unit.command;
    const command2=unit.command2;
    const can1=canUseCommandAbility(unit,command1);
    const can2=canUseCommandAbility(unit,command2);
    if(unit.id==="gundam-vidar"){
      if(can2&&state.objectives.filter(objective=>objective.owner===unit.team).length>=2)return {slot:2,score:55};
      if(can1&&E.livingEnemies(state,unit).some(target=>E.distance(unit,target)===1))return {slot:1,score:52};
      return null;
    }
    if(unit.id==="barbatos-lupus-rex"){
      const rexReady=A.attacksFrom(state,unit,D,E).some(choice=>choice.weapon.id==="rex-claws");
      return can2&&!rexReady&&unit.hp>3&&E.livingEnemies(state,unit).length?{slot:2,score:40}:null;
    }
    if(!can1)return null;
    if(unit.id==="gundam")return state.units.some(target=>target.team===unit.team&&target.zone==="board"&&E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target)&&totalUpgrades(target)<=1)?{slot:1,score:42}:null;
    if(unit.id==="guncannon")return E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target))?{slot:1,score:48}:null;
    if(unit.id==="guntank"){const score=E.livingEnemies(state,unit).filter(target=>E.distance(unit,target)<=4&&E.hasLineOfSight(state,unit,target)).length*24;return score?{slot:1,score}:null;}
    if(unit.id==="chars-zaku")return A.attacksFrom(state,unit,D,E).some(choice=>choice.weapon.id===unit.weapons[0].id)?{slot:1,score:58}:null;
    if(unit.id==="zaku-line"){
      const damaged=E.livingEnemies(state,unit).filter(target=>target.hp<target.maxHp);
      const reachable=E.reachable(state,unit,5,{ignoreElevation:true});
      return [...reachable.keys()].some(value=>{const [q,r]=E.fromKey(value);return damaged.some(target=>E.distance({q,r},target)<E.distance(unit,target));})?{slot:1,score:38}:null;
    }
    if(unit.id==="zaku-enforcer")return adjacentObjectives(unit).some(objective=>objective.owner!==unit.team)?{slot:1,score:95}:null;
    if(unit.id==="wing-zero-ew")return A.attacksFrom(state,unit,D,E).length?{slot:1,score:62}:null;
    if(unit.id==="hero-gundam")return E.livingEnemies(state,unit).length?{slot:1,score:44}:null;
    if(unit.id==="red-comet-zaku")return A.attacksFrom(state,unit,D,E).length?{slot:1,score:56}:null;
    if(unit.id==="gundam-epyon")return E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=2&&E.hasLineOfSight(state,unit,target)&&!Object.values(target.statuses||{}).some(Boolean))?{slot:1,score:48}:null;
    if(unit.id==="eva-01")return unit.upgrades.shield===0?{slot:1,score:46}:null;
    if(unit.id==="mazinger-z")return A.attacksFrom(state,unit,D,E).length?{slot:1,score:55}:null;
    if(unit.id==="gquuuuuux")return A.attacksFrom(state,unit,D,E).length?{slot:1,score:58}:null;
    if(unit.id==="gfred")return A.attacksFrom(state,unit,D,E).length?{slot:1,score:57}:null;
    if(unit.id==="mechazawa")return aiMotorcycleChoice(unit)?{slot:1,score:40}:null;
    return null;
  }

  function aiAbilityScore(unit) { return aiAbilityChoice(unit)?.score??-Infinity; }

  function aiUseAbility(unit,onComplete,chainDepth=0) {
    const choice=aiAbilityChoice(unit);
    if(!choice||choice.score<38){onComplete();return;}
    const slot=choice.slot;
    const ability=slot===2?unit.command2:unit.command;
    if(unit.id==="mechazawa"){
      const choice=aiMotorcycleChoice(unit);
      if(!choice){onComplete();return;}
      aiPreferredTargetKey=E.key(choice.q,choice.r);
    }
    addLog(`AI · ใช้ Command ${ability.name}`);renderAll();
    useUnitAbility(unit,slot);
    aiWaitForSettled(unit,()=>{
      if(unit.id==="gundam-vidar"&&chainDepth<1&&aiAbilityChoice(unit)?.score>=38){aiUseAbility(unit,onComplete,chainDepth+1);return;}
      onComplete();
    });
  }

  function aiTakePrimary(unit) {
    if(!unit||unit.id!==state.activeUnitId||unit.zone!=="board"){aiBusy=false;return;}
    if(state.activation.actionUsed){aiFinishTurn(unit);return;}
    const normalAttack=A.chooseAttack(state,unit,D,E);
    const tacticAttack=A.tacticAttacksFrom?.(state,unit,D,E)?.[0]||null;
    const attack=tacticAttack&&(!normalAttack||tacticAttack.score>normalAttack.score)?tacticAttack:normalAttack;
    const rescue=state.garrisons.filter(garrison=>garrison.team===unit.team&&E.distance(unit,garrison)<=1).sort((a,b)=>E.distance(unit,a)-E.distance(unit,b))[0];
    if(rescue&&(!attack||attack.score<68)){
      addLog(`AI · ${unit.name} เลือก Rescue เพื่อทำคะแนน`);renderAll();
      rescueGarrison(unit,1,true);
      if(mode)scheduleAiResolveMode();
      aiWaitForSettled(unit,()=>aiFinishTurn(unit));
      return;
    }
    if(attack){
      const beginChosenAttack=()=>{
        addLog(`AI · ${unit.name} เลือก ${attack.weapon.name}`);renderAll();
        aiPreferredTargetKey=E.key(attack.target.q,attack.target.r);
        beginAttack(attack.weapon,{rotation:attack.rotation,onDeclare:attack.tactic?()=>markCommand({...attack.tactic,ownerTeam:unit.team}):null});
        scheduleAiResolveMode();
        aiWaitForSettled(unit,()=>aiUseAnnihilateFollowUp(unit));
      };
      if(attack.tactic){
        addLog(`AI · เลือกใช้ Tactic ${attack.tactic.name} — รอผู้เล่นปิดการ์ด`);renderAll();
        showAiTacticCard(attack.tactic,beginChosenAttack);
      }else beginChosenAttack();
      return;
    }
    const dashAllowance=D.rules.dash.distance+dashBonus(unit)+(unit.movementBonus||0);
    const dashReachable=E.reachable(state,unit,dashAllowance);
    const dashChoice=A.chooseMove(state,unit,dashReachable.keys(),D,E,false);
    const currentScore=A.positionScore(state,unit,unit.q,unit.r,D,E);
    // Dash costs real Timeline, so the AI only spends it when the destination is
    // materially better than staying put. Item pickups and objective pressure are
    // already reflected in positionScore and can justify the spend.
    if(dashChoice&&dashChoice.score>=currentScore+14){
      const started=startMove(dashAllowance,D.rules.dash.timeline,"Dash",moved=>afterUnitMove(unit,"dash",null,moved),{primaryAction:true});
      if(started){
        aiPreferredTargetKey=E.key(dashChoice.q,dashChoice.r);
        scheduleAiResolveMode();
        aiWaitForSettled(unit,()=>aiFinishTurn(unit));return;
      }
    }
    handleAction("energize");
    scheduleAiCallback(()=>aiFinishTurn(unit),AI_PACE.between);
  }

  function aiUseAnnihilateFollowUp(unit) {
    if(unit?.id!=="barbatos-lupus-rex"||!unit.attackedWithRexClaws||!canUseCommandAbility(unit,unit.command)){aiFinishTurn(unit);return;}
    const rex=unit.weapons.find(weapon=>weapon.id==="rex-claws");
    if(!rex||!E.legalWeaponTargets(state,unit,rex).length){aiFinishTurn(unit);return;}
    addLog(`AI · ใช้ Command ${unit.command.name} โจมตี Rex Claws เพิ่มที่ Timeline 0`);renderAll();
    useUnitAbility(unit,1);
    aiWaitForSettled(unit,()=>aiFinishTurn(unit));
  }

  function aiFinishTurn(unit) {
    if(!unit||unit.id!==state.activeUnitId){aiBusy=false;return;}
    if(!state.activation.actionUsed){handleAction("energize");}
    aiBusy=false;
    addLog(`AI · ${unit.name} จบ Activation`);renderAll();
    scheduleAiCallback(()=>{if(state.activeUnitId===unit.id)endActivation();},AI_PACE.finish);
  }

  function runAiTurn(unit) {
    if(aiBusy||!unit||unit.id!==state.activeUnitId||!isAiTeam(unit.team))return;
    aiBusy=true;
    menuOpen=false;mode=null;renderAll();
    aiUsePreMoveAbility(unit,()=>aiWaitForSettled(unit,()=>aiAdvance(unit,()=>aiWaitForSettled(unit,()=>aiUseTactic(unit,()=>aiWaitForSettled(unit,()=>aiUseAbility(unit,()=>aiWaitForSettled(unit,()=>aiTakePrimary(unit)))))))));
  }

  function englishCardText(item) {
    return item?.textEn ? `<small class="card-translation" lang="en">${item.textEn}</small>` : "";
  }

  function showCard(card,note="",onConfirm=null) {
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card tactic-confirm-modal"><button class="modal-close" aria-label="ปิด">×</button><div class="tactic-confirm-layout"><img class="modal-card-image" src="${card.card}" alt="${card.name}"><div><span class="eyebrow">${card.timing}${card.trigger?` // ${card.trigger}`:""}</span><h2>${card.name}</h2><p>${card.text}${englishCardText(card)}</p>${note?`<p class="chip ${onConfirm?"good":"bad"}">${note}</p>`:""}<div class="modal-actions">${onConfirm?`<button class="primary-btn" id="confirm-tactic">Confirm ใช้การ์ด</button>`:""}<button class="action-btn" id="close-tactic">กลับ</button></div></div></div></div>`;
    modal.classList.add("show");
    lockResolutionModal(modal,"#confirm-tactic,#close-tactic,.modal-close");
    modal.querySelector(".modal-close").addEventListener("click",closeModal);modal.querySelector("#close-tactic").addEventListener("click",closeModal);
    if(onConfirm)modal.querySelector("#confirm-tactic").addEventListener("click",()=>{closeModal();onConfirm();});
  }

  function showUnitCard(unit,{inspection=false}={}) {
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card unit-card-modal ${inspection?"timeline-inspection-modal":""}"><button class="modal-close" aria-label="ปิด">×</button>${inspection?'<span class="eyebrow timeline-inspection-label">TIMELINE // UNIT DATA</span>':""}<img class="modal-card-image unit-sheet" src="${unit.card}" alt="Unit Card ${unit.name}"><div class="unit-inspection-hud" aria-label="สถานะปัจจุบันของ ${unit.name}">${unitHudHtml(unit)}</div><div class="unit-card-summary"><span class="eyebrow">${unit.model} // ${unit.role}</span><h2>${unit.name}${unit.weaponBadge?` · ${unit.weaponBadge}`:""}</h2>${unit.command?`<p>${unit.command.name}: ${unit.command.text}${englishCardText(unit.command)}</p>`:""}${unit.command2?`<p>${unit.command2.name}: ${unit.command2.text}${englishCardText(unit.command2)}</p>`:""}${unit.ongoing?`<p>${unit.ongoing.name}: ${unit.ongoing.text}${englishCardText(unit.ongoing)}</p>`:""}${unit.ongoing2?`<p>${unit.ongoing2.name}: ${unit.ongoing2.text}${englishCardText(unit.ongoing2)}</p>`:""}${unit.response?`<p>${unit.response.name}: ${unit.response.text}${englishCardText(unit.response)}</p>`:""}</div></div>`;
    modal.classList.add("show");
    lockResolutionModal(modal,".modal-close");
    modal.querySelector(".modal-close").addEventListener("click",closeModal);
  }

  function showRules() {
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><button class="modal-close" aria-label="ปิด">×</button><span class="eyebrow">CORE FLOW // V1</span><h2>กติกาย่อ</h2><ul class="rules-list"><li>ทุก Unit เริ่มใน Reserve; เมื่อ Timeline มาถึงจึง Deploy บน Base และต้อง Advance ออกจาก Base</li><li>Advance เดินได้สูงสุด 3 ช่องและไม่เสีย Timeline; Dash เดินได้สูงสุด 2 ช่องและเสีย Timeline 2 — Char’s Zaku II ทั้งสองแบบและ Red Gundam (Three Times Faster) Dash ได้เพิ่ม 1 ช่อง</li><li>Speed เพิ่มระยะ Advance; การขึ้นที่สูงใช้ระยะเพิ่ม 1 ต่อระดับ ส่วน Hover ไม่สนผลภูมิประเทศ</li><li>คลิกหัว Unit ที่กำลังทำงานเพื่อเปิด Command จากนั้นใช้ Advance ได้ 1 ครั้งและ Primary Action 1 ครั้ง</li><li>Timeline มีช่อง 1–10 ต่อ Phase และค่า Timeline ของ Action จะเลื่อนไอคอนไปยังช่องที่จะ Activate ครั้งถัดไป</li><li>ทุกฝ่ายเริ่มด้วย Tactic 3 ใบ; E.F.S.F. และ ZEON จั่วเพิ่ม 3 ใบหลัง Phase 1 ส่วน White Devil, The Rival, Secret และ GQX มี 3 ใบตลอดเกม</li><li>ผู้เล่นแต่ละฝ่ายใช้ Tactic ได้สูงสุด 1 ใบต่อ Activation; การ์ด ATTACK ใช้ Primary Action ด้วย</li><li>War Edge, God Drill, Twin Buster Rifle และ Breast Fire เป็น AoE แบบ SP: ทอยครั้งเดียว ไม่โจมตีฝ่ายเดียวกันหรือ Base และใช้แนวเล็งพิเศษที่ Unit/Garrison ไม่บัง</li><li>d10: 4–8 = Hit, 9–10 = Critical; ยิงจากที่สูงได้ Accuracy +1 และยิงขึ้นที่สูงได้ -1</li><li>Azure Fang: Unit ที่เริ่มการเคลื่อนที่ใน Water ลดระยะ 1 Hex; Attack ที่เกี่ยวข้องกับ Unit ใน Water ได้ Accuracy -1</li><li>Shield ที่ Active ป้องกัน Damage ชิ้นละ 1 แล้วคว่ำจนถึงต้น Activation ถัดไป, Strength เพิ่มลูกเต๋า, Speed เพิ่มระยะ Advance</li><li>เมื่อจบ Activation บนหรือติดกับ Objective จะ Contest; จุดของศัตรูต้องถูกล้างเป็นกลางก่อนยึด</li><li>Garrison มี HP 1; Objective ที่ครอบครองให้ ${D.rules.objective?.phaseVp ?? 5} VP ต่อจุดเมื่อจบแต่ละ Phase; ทำลาย Unit ได้ VP ตามการ์ด และทำลาย/Rescue Garrison ได้ 2 VP</li></ul></div>`;
    modal.classList.add("show");
    lockResolutionModal(modal,".modal-close");
    modal.querySelector(".modal-close").addEventListener("click",closeModal);
  }

  function showResult() {
    const modal=ensureModal();const title=`${teamName(state.winner)} WINS`;
    modal.innerHTML=`<div class="modal-card"><span class="eyebrow">MISSION COMPLETE</span><h2>${title}</h2><div class="result-grid"><div>${teamMeta("fed").short}<b>${state.vp.fed}</b>VP</div><div>${teamMeta("zeon").short}<b>${state.vp.zeon}</b>VP</div></div><button class="primary-btn" id="play-again">กลับหน้า Title</button></div>`;modal.classList.add("show");lockResolutionModal(modal,"#play-again");modal.querySelector("#play-again").addEventListener("click",returnToTitle);
  }

  function renderSoundButton() {
    const button=$("#sound-btn");if(!button)return;
    const off=soundMuted||BGM.getSelection()==="off";
    button.textContent=off?"🔇":"🔊";
    button.setAttribute("aria-pressed",String(off));
    button.setAttribute("aria-label","เลือกเพลงและเสียง");
    button.title="เลือกเพลงและเสียง";
  }

  function showSoundMenu() {
    const modal=ensureModal();
    const current=soundMuted?"off":BGM.getSelection();
    modal.innerHTML=`<div class="modal-card sound-menu-modal"><button class="modal-close" aria-label="ปิด">×</button><span class="eyebrow">AUDIO</span><h2>เพลงในเกม</h2><p>เลือกเพลงที่จะเล่นระหว่างการต่อสู้ หรือปิดเสียงทั้งหมด</p><div class="sound-choice-list"><button class="action-btn sound-choice ${current==="song1"?"selected":""}" data-sound-choice="song1"><strong>เพลง 1</strong><small>Battle BGM</small></button><button class="action-btn sound-choice ${current==="song2"?"selected":""}" data-sound-choice="song2"><strong>เพลง 2</strong><small>Alternate BGM</small></button><button class="action-btn sound-choice ${current==="getter"?"selected":""}" data-sound-choice="getter"><strong>Getter Robo!</strong><small>Getter Robo! BGM</small></button><button class="action-btn sound-choice ${current==="beyond"?"selected":""}" data-sound-choice="beyond"><strong>BEYOND THE TIME</strong><small>BEYOND THE TIME BGM</small></button><button class="action-btn sound-choice ${current==="secret"?"selected":""}" data-sound-choice="secret"><strong>เพลง Secret</strong><small>Mazinger Z (SRW Z)</small></button><button class="action-btn sound-choice danger ${current==="off"?"selected":""}" data-sound-choice="off"><strong>ปิดเสียง</strong><small>ปิดทั้ง BGM และ Sound Effects</small></button></div></div>`;
    modal.classList.add("show");
    lockResolutionModal(modal,"[data-sound-choice],.modal-close");
    modal.querySelector(".modal-close").addEventListener("click",closeModal);
    modal.querySelectorAll("[data-sound-choice]").forEach(button=>button.addEventListener("click",()=>{
      const choice=button.dataset.soundChoice;
      if(choice==="off"){
        soundMuted=true;
        SFX.setMuted(true);
        BGM.select("off");
        BGM.setMuted(true);
        TitleBGM.setMuted(true);
      }else{
        soundMuted=false;
        SFX.setMuted(false);
        TitleBGM.setMuted(false);
        if(document.body.classList.contains("title-active")){
          BGM.select(choice);
          TitleBGM.start();
        }else{
          TitleBGM.stop();
          BGM.select(choice);
        }
      }
      renderSoundButton();
      closeModal();
    }));
  }

  function renderLosButton() {
    const button=$("#los-btn");if(!button)return;
    const unit=activeUnit();
    const available=state?.status==="playing"&&unit&&(unit.zone==="board"||unit.zone==="deploying");
    document.body.classList.toggle("los-inspection-active",!!available&&losInspection.enabled);
    button.disabled=!available;
    button.setAttribute("aria-pressed",String(!!available&&losInspection.enabled));
    const maximumRange=unit?Math.max(0,...inspectionWeaponsFor(unit).map(weaponRange)):0;
    button.innerHTML=`<span class="los-eye" aria-hidden="true"><i></i></span><span>LINE OF SIGHT${available?` · R${maximumRange}`:""}</span>`;
    button.setAttribute("aria-label",available&&losInspection.enabled?"ปิดการตรวจสอบ Line of Sight":`เปิดการตรวจสอบ Line of Sight ระยะ ${maximumRange}`);
    button.title=available&&losInspection.enabled?`กำลังแสดง Unit และ Garrison ศัตรูภายในระยะอาวุธสูงสุด ${maximumRange} · กดอีกครั้งเพื่อปิด`:`แสดง Line of Sight ตามระยะอาวุธไกลที่สุด (${maximumRange})`;
  }

  function toggleLosInspection() {
    if($("#los-btn")?.disabled)return;
    losInspection.enabled=!losInspection.enabled;
    renderAll();
  }

  $("#restart-btn").addEventListener("click",()=>{if(confirm("เริ่มเกมใหม่และล้างสถานะปัจจุบัน?"))resetGame();});
  $("#sound-btn")?.addEventListener("click",showSoundMenu);
  $("#los-btn")?.addEventListener("click",toggleLosInspection);
  renderSoundButton();
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
    const passOverlay=$("#pass-overlay.show");
    if(passOverlay){
      const ready=passOverlay.querySelector("#ready-btn");
      if(event.key==="Tab"){event.preventDefault();ready?.focus();return;}
      if(event.key==="Escape"){event.preventDefault();return;}
    }
    const lockedModal=$("#game-modal.show[data-modal-lock='true'],#dice-roll-overlay.show[data-modal-lock='true']");
    if(lockedModal){
      if(event.key==="Tab"){
        const focusable=[...lockedModal.querySelectorAll("button:not([disabled]),[href],[tabindex]:not([tabindex='-1'])")].filter(node=>!node.inert&&node.offsetParent!==null);
        if(focusable.length){const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
        return;
      }
      if(event.key==="Escape"){event.preventDefault();return;}
    }
    if(event.key!=="Escape"||!state)return;
    // Resolution dialogs have explicit Confirm/Skip controls. Closing one without running
    // its continuation would strand pending combat, so Escape deliberately leaves it open.
    if($("#game-modal")?.classList.contains("show"))return;
    // Adjustable Advance/Dash keeps a movement draft alive after previewing a destination.
    // Escape must roll that draft back through the canonical cancel path, otherwise the
    // previewed hex can be silently committed by the next Action.
    if(movementDraft&&(!mode||mode.adjustableMovement)){
      const actor=state.units.find(candidate=>candidate.id===movementDraft.unitId);
      if(actor&&isAiTeam(actor.team))return;
      event.preventDefault();
      cancelMovementDraft();
      return;
    }
    if(mode){
      const actor=modeUnit();
      if(actor&&isAiTeam(actor.team))return;
      const currentMode=mode;
      if(currentMode.required)return;
      const back=currentMode.returnMenu||"main";
      mode=null;menuOpen=true;menuView=back;
      if(currentMode.onCancel)currentMode.onCancel();
      renderAll();
      return;
    }
    menuOpen=false;menuView="main";renderAll();
  });
  initTitle();
})();

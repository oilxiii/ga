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
  let aiThinkingTimer = null;
  let aiBusy = false;
  let aiPerforming = false;
  let aiPreferredTargetKey = null;
  let aiResponsePending = false;
  let aiEffectPending = false;
  let attackTargetingBusy = false;
  let targetingFxTimer = null;
  let targetingFxFrame = null;
  let movementDraft = null;
  let soundMuted = false;
  let losInspection = { enabled:false };
  const AI_PACE = Object.freeze({ firstTurn: 1450, turnStart: 1200, target: 650, poll: 900, between: 620, finish: 820 });
  const AI_WATCHDOG_ATTEMPTS = 12;

  function activeUnit() { return state.units.find(unit => unit.id === state.activeUnitId); }
  function teamName(team) { return D.teams[team].name; }
  function addLog(message) { state.log.unshift(message); state.log = state.log.slice(0, 14); }
  function totalUpgrades(unit) { return Object.values(unit.upgrades).reduce((a,b) => a+b, 0); }
  function getTactic(id) { return D.tactics.find(card => card.id === id); }
  function isUsed(id) { return state.usedTactics.has(id); }
  function inHand(team,id) { return state.hands?.[team]?.includes(id); }
  function assetPath(path) { return window.GA_ASSETS?.[path] || path; }
  function isAiTeam(team) { return matchMode === "ai" && team === aiTeam; }
  function isAiTurn() { return !!state?.activeUnitId && isAiTeam(activeUnit()?.team); }
  function modeUnit() { return mode?.unitId ? state?.units?.find(unit=>unit.id===mode.unitId) : activeUnit(); }


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
      for(let i=0;i<data.length;i++) data[i]=(Math.random()*2-1)*(1-i/data.length);
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
    let audio = null;
    let started = false;
    function ensure() {
      if (audio) return audio;
      audio = new Audio("assets/audio/battle-bgm.mp3");
      audio.loop = true;
      audio.preload = "auto";
      audio.volume = 0.05;
      audio.muted = soundMuted;
      audio.setAttribute("playsinline", "");
      return audio;
    }
    function start() {
      const track = ensure();
      if (started && !track.paused) return;
      const promise = track.play();
      if (promise?.then) promise.then(() => { started = true; }).catch(() => {});
    }
    function setMuted(muted) { ensure().muted=!!muted; }
    return { start, setMuted };
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
    const gameShell=$(".game-shell");
    const clearNotice=()=>{notice?.classList.remove("show","warning");};
    const resumeTitleMusic=()=>{
      if(screen.classList.contains("show")&&!screen.classList.contains("leaving"))TitleBGM.start();
    };
    document.addEventListener("pointerdown",resumeTitleMusic,true);
    document.addEventListener("keydown",resumeTitleMusic,true);
    TitleBGM.start();
    const launch=(mode,playerTeam=null)=>{
      if(screen.classList.contains("leaving"))return;
      matchMode=mode;
      humanTeam=mode==="ai"?playerTeam:null;
      aiTeam=mode==="ai"?(playerTeam==="fed"?"zeon":"fed"):null;
      factionSelect?.classList.remove("show");
      factionSelect?.setAttribute("aria-hidden","true");
      one.inert=false;
      two.inert=false;
      document.removeEventListener("pointerdown",resumeTitleMusic,true);
      document.removeEventListener("keydown",resumeTitleMusic,true);
      TitleBGM.stop();
      SFX.unlock();
      SFX.menuConfirm();
      BGM.start();
      screen.classList.add("leaving");
      document.body.classList.remove("title-active");
      setTimeout(()=>{
        screen.classList.remove("show","leaving");
        gameShell?.removeAttribute("inert");
        gameShell?.setAttribute("aria-hidden","false");
        resetGame();
        if(mode==="ai")gameShell?.focus();
      },460);
    };
    one?.addEventListener("click",()=>{
      SFX.unlock();
      SFX.menuConfirm();
      clearNotice();
      one.inert=true;
      two.inert=true;
      factionSelect?.classList.add("show");
      factionSelect?.setAttribute("aria-hidden","false");
      factionSelect?.querySelector("[data-player-team]")?.focus();
    });
    factionSelect?.querySelectorAll("[data-player-team]").forEach(button=>button.addEventListener("click",()=>launch("ai",button.dataset.playerTeam)));
    $("#faction-select-back")?.addEventListener("click",()=>{SFX.menuConfirm();factionSelect?.classList.remove("show");factionSelect?.setAttribute("aria-hidden","true");one.inert=false;two.inert=false;one?.focus();});
    two?.addEventListener("click",()=>launch("hotseat"));
  }

  function boardPoint(q,r) {
    const size=27,x0=72,y0=32,dx=size*1.5,dy=Math.sqrt(3)*size;
    return {x:x0+q*dx,y:y0+(r+(q&1)*.5)*dy};
  }

  function playAttackTargetingFx({from,to,team="fed",garrison=false,onComplete=()=>{}}) {
    const svg=$("#board");
    if(!svg||from?.q==null||to?.q==null){onComplete();return;}
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
    svg.appendChild(group);
    const reticle=group.querySelector(".targeting-reticle");
    const lock=group.querySelector(".target-lock-mark");
    const started=performance.now();
    const ease=t=>1-Math.pow(1-t,3);
    const step=now=>{
      if(epoch!==gameEpoch){group.remove();attackTargetingBusy=false;aiEffectPending=false;targetingFxFrame=null;return;}
      const t=Math.min(1,(now-started)/travelTime);
      const e=ease(t);
      const x=a.x+(b.x-a.x)*e,y=a.y+(b.y-a.y)*e;
      reticle.setAttribute("transform",`translate(${x} ${y})`);
      if(t<1){targetingFxFrame=requestAnimationFrame(step);return;}
      targetingFxFrame=null;
      reticle.classList.add("locked");
      lock.classList.add("show");
      targetingFxTimer=setTimeout(()=>{
        targetingFxTimer=null;
        group.remove();
        if(epoch!==gameEpoch){attackTargetingBusy=false;aiEffectPending=false;return;}
        attackTargetingBusy=false;aiEffectPending=false;
        onComplete();
      },lockTime);
    };
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

  function playDamageFeedback({to,targetUnitId=null,garrison=false,destroyed=false}) {
    if(!to||to.q==null)return;
    requestAnimationFrame(()=>{
      spawnImpactFx(to.q,to.r,destroyed,garrison);
      if(destroyed)SFX.explosion();
      else { shakeDamageTarget({targetUnitId,q:to.q,r:to.r,garrison});SFX.hit(); }
    });
  }

  function playCombatFeedback({from,to,targetUnitId=null,garrison=false,destroyed=false}) {
    if(!to||to.q==null)return;
    requestAnimationFrame(()=>{
      spawnShotFx(from,to);SFX.shot();
      setTimeout(()=>playDamageFeedback({to,targetUnitId,garrison,destroyed}),115);
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
    // Let the normal attack land first, then visibly fire one extra shell per rescued Garrison.
    playCombatFeedback({from,to,targetUnitId,garrison,destroyed:false});
    const step=310;
    for(let i=0;i<bonus;i++){
      setTimeout(()=>{
        spawnShotFx(from,to);SFX.shot();
        setTimeout(()=>{
          spawnImpactFx(to.q,to.r,false,garrison);
          spawnBazookaBonusFx(to.q,to.r,i+1,bonus);
          SFX.hit();
        },105);
      },step*(i+1));
    }
    if(destroyed){
      setTimeout(()=>{spawnImpactFx(to.q,to.r,true,garrison);SFX.explosion();},step*(bonus+1)+80);
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
    group.innerHTML=`<circle class="score-flash" r="13"></circle><circle class="score-ring ring-a" r="20"></circle><circle class="score-ring ring-b" r="30"></circle><path class="score-beam" d="M0 46V-68"></path><g class="score-popup"><rect x="-32" y="-74" width="64" height="23" rx="6"></rect><text x="0" y="-58">+1 VP</text></g>`;
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

  function finishDefeatedActiveActivation(unit,source="Response") {
    if(!unit||unit.id!==state.activeUnitId||unit.zone!=="reserve")return false;
    state.resolvedThisTick.add(unit.id);
    refreshPassedTeamTactics(unit.team);
    state.activeUnitId=null;
    unit.tempStrength=0;
    unit.critBoost=false;
    unit.lastShotBonus=false;
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
    for(const entry of claimed){
      if(epoch!==gameEpoch)return false;
      const objective=state.objectives.find(item=>item.id===entry.id);
      if(!objective)continue;
      state.vp[entry.team]+=1;
      renderHeader();
      addLog(`${teamName(entry.team)} ควบคุม Objective — +1 VP`);
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
      state.winner=state.vp.fed===state.vp.zeon?"draw":state.vp.fed>state.vp.zeon?"fed":"zeon";
      addLog(`จบ Phase ${scoredPhase}: คิดคะแนน Objective ครบแล้ว`);
      const winnerTitle=state.winner==="draw"?"DRAW":`${teamName(state.winner)} WINS`;
      updatePhaseTransition({eyebrow:"MISSION COMPLETE",title:winnerTitle,subtitle:`E.F.S.F. ${state.vp.fed} VP  •  ZEON ${state.vp.zeon} VP`,winner:state.winner});
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
    if(targetingFxTimer){clearTimeout(targetingFxTimer);targetingFxTimer=null;}
    if(targetingFxFrame){cancelAnimationFrame(targetingFxFrame);targetingFxFrame=null;}
    attackTargetingBusy=false;
    document.querySelectorAll(".attack-targeting-fx").forEach(node=>node.remove());
    $("#dice-roll-overlay")?.classList.remove("show");
    closeModal();
    state = E.setupGame();
    state.responseUsed = { fed: false, zeon: false };
    lastDice = null;
    mode = null;
    losInspection = { enabled:false };
    menuOpen = false;
    transitionBusy = false;
    hidePhaseTransition();
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
    const reactivatedShields = E.reactivateShields(unit);
    if (reactivatedShields > 0) addLog(`${unit.name}: Shield Upgrade ${reactivatedShields} ชิ้นกลับมา Active`);
    unit.tempStrength = 0;
    unit.critBoost = false;
    unit.nextAttackDiscount = 0;
    unit.lastShotBonus = false;
    mode = null;
    movementDraft = null;
    menuOpen = false;
    menuView = "main";
    state.justDeployedUnitId = deployed ? unit.id : null;
    addLog(`${teamName(unit.team)} — ${unit.name} ${deployed ? "Deploy บน Base" : "เริ่ม Activation"}`);
    renderAll();
    if(isAiTeam(unit.team)) {
      $("#pass-overlay")?.classList.remove("show");
      addLog(`AI ${D.teams[unit.team].short} กำลังประเมินสนามรบ`);
      renderAll();
      focusCameraOnUnit(unit);
      scheduleAiTurn(unit,first?AI_PACE.firstTurn:AI_PACE.turnStart);
    } else if(matchMode==="hotseat") showPassOverlay(unit, first);
    else {
      $("#pass-overlay")?.classList.remove("show");
      focusCameraOnUnit(unit);
    }
  }

  function showPassOverlay(unit, first) {
    const overlay = $("#pass-overlay");
    overlay.innerHTML = `<div class="pass-card" style="--team:${D.teams[unit.team].color}">
      <span class="eyebrow">${first ? "MISSION START" : "HOT-SEAT // PASS CONTROL"}</span>
      <h2 id="pass-team-title">${teamName(unit.team)}</h2>
      <p>ส่งเครื่องให้ผู้เล่นฝั่งนี้ แล้วกดพร้อมเมื่อผู้เล่นอีกฝ่ายมองไม่เห็นมือการ์ด</p>
      <button class="primary-btn" id="ready-btn">พร้อม — ใช้งาน ${unit.name}</button>
    </div>`;
    overlay.setAttribute("aria-labelledby","pass-team-title");
    overlay.classList.add("show");
    const ready=$("#ready-btn");
    ready.addEventListener("click", () => {
      overlay.classList.remove("show");
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
        addLog(`${unit.name} ชนะ Contest ${result.friendly}-${result.enemy}: ยึด Objective ให้ ${D.teams[unit.team].short}`);
        capturedObjectives.push(result.objective);
      }
      else if(result.action==="neutralized")addLog(`${unit.name} ชนะ Contest ${result.friendly}-${result.enemy}: ล้าง Objective ของศัตรูให้เป็นกลาง`);
      else if(result.action==="blocked")addLog(`${unit.name} Contest Objective ไม่สำเร็จ (${result.friendly}-${result.enemy})`);
    });
    unit.tempStrength = 0;
    unit.critBoost = false;
    unit.lastShotBonus = false;
    state.resolvedThisTick.add(unit.id);
    refreshPassedTeamTactics(unit.team);
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

  function refreshPassedTeamTactics(team) {
    if(state.phase!==1||state.tacticCycles[team]!==1||!E.teamPassedTimeline(state,team,10))return 0;
    const before=state.hands[team].length;
    E.dealTacticHand(state,team);
    state.tacticCycles[team]=2;
    const drawn=state.hands[team].length-before;
    addLog(`${D.teams[team].short}: Unit ทั้ง 3 ผ่าน TL10 และจบ Activation แล้ว — จั่ว Tactic +${drawn}`);
    return drawn;
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
    if(fedDrawn||zeonDrawn)addLog(`เข้าสู่ Phase 2 — เติม Tactic ที่ยังไม่ได้จั่ว: E.F.S.F. +${fedDrawn}, ZEON +${zeonDrawn}`);
    return {fed:fedDrawn,zeon:zeonDrawn};
  }

  function payTimeline(unit, amount) {
    const cost=Math.max(0,amount);
    unit.nextAt += cost;
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
    const fedController=$("#fed-controller"),zeonController=$("#zeon-controller");
    if(fedController)fedController.textContent=matchMode==="ai"?(humanTeam==="fed"?"YOU":"AI"):"";
    if(zeonController)zeonController.textContent=matchMode==="ai"?(humanTeam==="zeon"?"YOU":"AI"):"";
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

  function encounterMarker(cx,cy,text,kind) {
    const width=text==="ENCOUNTER"?82:64;
    const height=22;
    const y=Math.max(4,Math.min(624,cy-67));
    return `<g class="encounter-marker ${kind}" transform="translate(${cx-width/2} ${y})" aria-label="${text}"><rect width="${width}" height="${height}" rx="5"></rect><text x="${width/2}" y="${height/2}" dominant-baseline="central" text-anchor="middle">${text}</text></g>`;
  }

  function renderLosInspection(source,x0,y0,dx,dy) {
    if(!losInspection.enabled||!source||source.zone==="reserve")return "";
    const maximumRange=Math.max(0,...(source.weapons||[]).map(weapon=>weapon.range||0));
    const point=hex=>`${x0+hex.q*dx},${y0+(hex.r+(hex.q&1)*.5)*dy}`;
    const targets=[
      ...E.livingEnemies(state,source),
      ...state.garrisons.filter(garrison=>garrison.team!==source.team)
    ];
    return targets
      .filter(target=>E.distance(source,target)<=maximumRange)
      .map(target=>{
        const distance=E.distance(source,target);
        const details=E.lineOfSightDetails(state,source,target);
        // A line exactly on a hex border gives the acting player a choice. Display the
        // clear route whenever one exists; otherwise show one blocked route in red.
        const route=details.paths.find(candidate=>candidate.clear)||details.paths[0];
        const status=details.clear?"clear":"blocked";
        const targetX=x0+target.q*dx,targetY=y0+(target.r+(target.q&1)*.5)*dy;
        return `<polyline class="los-path ${status}" points="${route.path.map(point).join(" ")}"></polyline><circle class="los-endpoint ${status}" cx="${targetX}" cy="${targetY}" r="25"></circle><g class="los-range-badge ${status}" transform="translate(${targetX+20} ${targetY-21})"><circle r="8"></circle><text y=".5">${distance}</text></g>`;
      }).join("");
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

  function renderBoard() {
    const size = 27, x0 = 72, y0 = 32, dx = size*1.5, dy = Math.sqrt(3)*size;
    const active = activeUnit();
    const losMaximumRange=active?Math.max(0,...(active.weapons||[]).map(weapon=>weapon.range||0)):0;
    const encounterTargets=active?E.engagedTargets(state,active):[];
    const hasEncounter=encounterTargets.length>0;
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
      const losGarrison=losInspection.enabled&&active&&f?.type==="garrison"&&f.team!==active.team&&E.distance(active,{q,r})<=losMaximumRange;
      const losGarrisonBlocked=losGarrison&&!E.hasLineOfSight(state,active,{q,r,team:f.team});
      cells += `<g class="${cls.join(" ")}" data-q="${q}" data-r="${r}">
        <polygon points="${hexPoints(cx,cy,size-1)}"></polygon>
        <text class="elevation-label" x="${cx-18}" y="${cy-14}">L${hex.elevation}</text>
        ${f ? f.icon
          ? `<image class="feature-token ${f.type} ${mode?.type === "char-kick" && isTargetable(q,r) ? "char-kick-victim" : ""} ${losGarrison?"los-inspectable":""} ${losGarrisonBlocked?"los-blocked-target":""}" href="${f.icon}" x="${cx-14}" y="${cy-14}" width="28" height="28" preserveAspectRatio="xMidYMid meet"></image>${f.hp!==undefined?`<circle class="token-counter-bg ${f.team}" cx="${cx+11}" cy="${cy+10}" r="7"></circle><text class="token-counter" x="${cx+11}" y="${cy+10}">${f.hp}</text>`:""}`
          : `<g class="objective-flag ${f.team}" aria-label="Objective ${f.team === "neutral" ? "ยังไม่มีผู้ครอบครอง" : `ครอบครองโดย ${teamName(f.team)}`}"><title>Objective · 1 VP เมื่อจบ Phase</title><path class="objective-pole" d="M ${cx-7} ${cy+13} V ${cy-12}"></path><path class="objective-cloth" d="M ${cx-6} ${cy-11} L ${cx+11} ${cy-6} L ${cx-6} ${cy+1} Z"></path><path class="objective-base" d="M ${cx-13} ${cy+13} H ${cx-1}"></path></g>` : ""}
      </g>`;
    }
    let units = "";
    for (const unit of state.units.filter(u=>u.zone==="board"||u.zone==="deploying")) {
      const cx=x0+unit.q*dx, cy=y0+(unit.r+(unit.q&1)*.5)*dy;
      const clip=`clip-${unit.id}`;
      defs += `<clipPath id="${clip}"><circle cx="${cx}" cy="${cy-2}" r="17"></circle></clipPath>`;
      const teamClass=unit.team;
      const losInspectable=losInspection.enabled&&active&&unit.team!==active.team&&E.distance(active,unit)<=losMaximumRange;
      const losBlocked=losInspectable&&!E.hasLineOfSight(state,active,unit);
      units += `<g class="unit-node ${unit.id===state.activeUnitId?"active":""} ${unit.id===state.justDeployedUnitId?"deploying":""} ${mode?.type === "char-kick" && isTargetable(unit.q,unit.r) ? "char-kick-victim" : ""} ${losInspectable?"los-inspectable":""} ${losBlocked?"los-blocked-target":""}" data-unit-id="${unit.id}" data-q="${unit.q}" data-r="${unit.r}">
        <circle class="unit-base ${teamClass}" cx="${cx}" cy="${cy}" r="20"></circle>
        <image class="unit-portrait" href="${unit.icon}" x="${cx-18}" y="${cy-20}" width="36" height="36" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})"></image>
        ${unit.weaponBadge ? `<rect class="weapon-badge" x="${cx+8}" y="${cy-21}" width="23" height="11" rx="2"></rect><text class="weapon-badge-text" x="${cx+19.5}" y="${cy-15.5}">${unit.weaponBadge}</text>` : ""}
        ${renderUnitEffectBadges(unit,cx,cy)}
        <rect class="unit-hp-bg" x="${cx-20}" y="${cy+20}" width="40" height="5" rx="2"></rect>
        <rect class="unit-hp" x="${cx-19}" y="${cy+21}" width="${38*unit.hp/unit.maxHp}" height="3" rx="1"></rect>
        <text class="unit-name" x="${cx}" y="${cy+34}">${unit.name === "Zaku II" ? unit.role : unit.name}</text>
      </g>`;
    }
    let encounterLayer="";
    if(active&&hasEncounter){
      const activeCx=x0+active.q*dx,activeCy=y0+(active.r+(active.q&1)*.5)*dy;
      encounterLayer+=encounterMarker(activeCx,activeCy,"MOVE -1","penalty");
      encounterTargets.forEach(target=>{
        const targetCx=x0+target.q*dx,targetCy=y0+(target.r+(target.q&1)*.5)*dy;
        encounterLayer+=encounterMarker(targetCx,targetCy,"ENCOUNTER","target");
      });
    }
    const losLayer=renderLosInspection(active,x0,y0,dx,dy);
    $("#board").innerHTML=`<defs>${defs}</defs>${cells}${units}<g class="los-overlay-layer">${losLayer}</g><g class="encounter-overlay-layer">${encounterLayer}</g>`;
    $("#board").querySelectorAll("[data-q]").forEach(node => node.addEventListener("click", event => handleHexClick(Number(node.dataset.q),Number(node.dataset.r),event)));
  }

  function renderUnitCard() {
    const unit=activeUnit();
    if (!unit) { $("#active-hud").innerHTML=""; return; }
    const team=D.teams[unit.team];
    const chips=[];
    for (const [type,count] of Object.entries(unit.upgrades)) if (count) {
      if(type==="shield"&&(unit.inactiveShields||0)>0){
        const inactive=Math.min(count,unit.inactiveShields||0),active=count-inactive;
        chips.push(`<span class="chip good token-chip"><img src="${assetPath(`assets/tokens/${type}.png`)}" alt="">SHIELD ${active} ACTIVE / ${inactive} DOWN</span>`);
      }else chips.push(`<span class="chip good token-chip"><img src="${assetPath(`assets/tokens/${type}.png`)}" alt="">${type.toUpperCase()} ×${count}</span>`);
    }
    for (const [type,on] of Object.entries(unit.statuses)) if (on) chips.push(`<span class="chip bad token-chip"><img src="${assetPath(`assets/tokens/${type}.png`)}" alt="">${type.toUpperCase()}</span>`);
    $("#active-hud").innerHTML=`<div class="active-hud-inner" style="--team:${team.color}"><div class="active-hud-portrait"><img src="${unit.icon}" alt=""></div><div><span class="eyebrow">${unit.model}</span><h2>${unit.name}</h2><p>${unit.zone==="reserve"?"RESERVE":unit.role}</p><div class="hp-line"><span>HP</span><div class="bar"><i style="width:${unit.hp/unit.maxHp*100}%"></i></div><b>${unit.hp}/${unit.maxHp}</b></div></div><div class="active-hud-stats">${isAiTeam(unit.team)?`<span class="chip ai-thinking-chip">AI THINKING</span>`:""}<span class="chip">⚡ ${unit.energy}</span>${chips.join("")}</div></div>`;
  }

  function hasOwnGarrisonInRange(unit, range=1, requireLos=false) { return state.garrisons.some(g=>g.team===unit.team && E.distance(unit,g)<=range && (!requireLos||E.hasLineOfSight(state,unit,g))); }
  function adjacentObjective(unit) { return state.objectives.find(o=>E.distance(unit,o)<=1); }

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
        ...kickGarrisonTargets.map(target=>`<button class="command-item char-kick-damage" data-char-kick-garrison="${target.id}"><span>ทำ Damage 1</span><small>${D.teams[target.team].short} Garrison</small></button>`)
      ].join(""):"";
      const pushAlert=mode.type==="push-direction"?`<div class="char-kick-alert push-direction-alert"><strong>PUSH DIRECTION</strong><span>${mode.steps} HEX</span><small>เลือก Hex สีแดงด้านหลังเป้าหมายเพื่อกำหนดทิศทาง · ถ้าชนจะเกิด Damage 2</small></div>`:"";
      const backText=draftKick?"‹ Back · เปลี่ยนจุด Dash":"‹ Back";
      const backSub=draftKick?"SELECT DASH HEX AGAIN":"CANCEL";
      const cancelButton=mode.type==="push-direction"?"":`<button class="command-item" id="cancel-mode"><span>${backText}</span><small>${backSub}</small></button>`;
      menu.innerHTML=`<div class="command-caption"><span>${mode.type.toUpperCase()}</span><span>${draftKick?"DASH DECISION":"SELECTING"}</span></div>${charKickAlert}${pushAlert}<div class="command-list">${kickButtons}${mode.type==="move"&&mode.allowStay?`<button class="command-item" id="stay-in-place"><span>อยู่ช่องเดิม</span><small>0 HEX</small></button>`:""}${cancelButton}</div>`;
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
      menu.querySelector("#stay-in-place")?.addEventListener("click",()=>completeMove(unit.q,unit.r));
      menu.querySelector("#cancel-mode")?.addEventListener("click",()=>{const back=mode.returnMenu||"main";const onCancel=mode.onCancel;mode=null;menuOpen=true;menuView=back;if(onCancel)onCancel();renderAll();});
      positionCommandMenu(unit);
      return;
    }
    const a=state.activation;
    const deploying=unit.zone==="deploying";
    const moveDistance=D.rules.advance.distance+unit.upgrades.speed;
    const dashDistance=D.rules.dash.distance+(unit.id==="chars-zaku"?1:0);
    const item=(label,sub,action,disabled=false,cls="")=>`<button class="command-item ${cls}" data-menu-action="${action}" ${disabled?"disabled":""}><span>${label}</span><small>${sub}</small></button>`;
    const adjustingMove=movementDraft?.unitId===unit.id&&movementDraft.movementType==="advance";
    const adjustingDash=movementDraft?.unitId===unit.id&&movementDraft.movementType==="dash";
    if(adjustingDash&&movementDraft?.placed){
      const freeNote=movementDraft.cost===0?" · FREE TL0":"";
      menu.innerHTML=`<div class="command-caption"><span>DASH PREVIEW</span><span>${unit.weaponBadge||unit.model}</span></div><div class="dash-preview-note"><strong>ตำแหน่งนี้ไม่มีเป้าหมาย Char Kick</strong><small>ยืนยันเพื่อจบ Dash${freeNote} หรือเปลี่ยนตำแหน่งเพื่อหาเป้าหมายใหม่</small></div><div class="command-list">${item("ยืนยัน Dash",`TL${movementDraft.cost}${freeNote}`,"confirm-dash",false,"confirm-move")} ${item("เปลี่ยนตำแหน่ง","SELECT HEX AGAIN","adjust-dash")} ${item("ยกเลิก Dash","RETURN TO START","cancel-dash",false,"danger")}</div>`;
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
      item(unit.command.name,`⚡${unit.command.energy}`,"ability",a.commandUsed||unit.energy<unit.command.energy),
      item("Tactic",`${state.hands[unit.team].filter(id=>!isUsed(id)).length} CARDS`,"tactics"),
      item("Unit Card","INFO","info"),
      item("Wait",a.actionUsed?"END":"PRIMARY ACTION REQUIRED","end",!a.actionUsed,"danger")
    ]).join("");
    const weapons=unit.weapons.map((weapon,index)=>item(weapon.name,`R${weapon.range} · S${weapon.strength} · TL${weapon.timeline}`,`weapon-${index}`,a.actionUsed)).join("")+item("‹ Back","COMMAND","back");
    menu.innerHTML=`<div class="command-caption"><span>${menuView==="weapons"?"WEAPON":"COMMAND"}</span><span>${unit.weaponBadge||unit.model}</span></div><div class="command-list">${menuView==="weapons"?weapons:main}</div>`;
    menu.querySelectorAll("[data-menu-action]").forEach(btn=>btn.addEventListener("click",()=>{
      if(isAiTeam(unit.team))return;
      const action=btn.dataset.menuAction;
      if(action==="attack-menu"){menuView="weapons";renderActions();return;}
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

  function renderHand() {
    const unit=activeUnit(); if (!unit) return;
    if(isAiTeam(unit.team)){
      $("#hand-title").textContent=`${teamName(unit.team)} · AI HAND ${state.hands[unit.team].length} / 9`;
      $("#tactic-hand").innerHTML=`<div class="ai-hand-hidden" aria-label="มือการ์ดของ AI ถูกซ่อน">${state.hands[unit.team].map(()=>`<span class="ai-card-back">TACTIC</span>`).join("")}</div>`;
      return;
    }
    $("#hand-title").textContent=`${teamName(unit.team)} · HAND ${state.hands[unit.team].length} / 9`;
    const hand=state.hands[unit.team].map(getTactic);
    $("#tactic-hand").innerHTML=hand.map(card=>{
      const used=isUsed(card.id);
      const legal=!used && card.timing==="COMMAND" && !state.activation.tacticUsed[card.team] && !mode && !attackTargetingBusy;
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
    if(diceRollInterval)clearInterval(diceRollInterval);
    const epoch=gameEpoch;
    diceRollInterval=setInterval(()=>nodes.forEach(node=>{node.querySelector("span").textContent=String(Math.floor(Math.random()*10)+1);}),reduced?80:65);
    diceAnimationTimer=setTimeout(()=>{
      if(epoch!==gameEpoch){if(diceRollInterval)clearInterval(diceRollInterval);diceRollInterval=null;return;}
      clearInterval(diceRollInterval);
      diceRollInterval=null;
      nodes.forEach((node,index)=>{
        node.querySelector("span").textContent=String(result.dice[index]);
        node.classList.add("revealed",result.results[index]);
        node.setAttribute("aria-label",`ลูกที่ ${index+1}: ${result.dice[index]} ${result.results[index]}`);
      });
      overlay.querySelector(".dice-roll-title").textContent=result.criticals?"CRITICAL!":"ATTACK ROLL";
      overlay.querySelector(".dice-roll-summary").textContent=`${result.hits} HIT · ${result.criticals} CRITICAL`;
      diceAnimationTimer=setTimeout(()=>{
        if(epoch!==gameEpoch)return;
        overlay.classList.remove("show");
        diceAnimationTimer=null;
        onComplete();
      },holdTime);
    },rollTime);
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
      showDiceRoll(rerollView,"NEWTYPE INSTINCTS",onComplete);
      return;
    }
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card newtype-modal"><span class="eyebrow">ONGOING // AFTER ATTACK ROLL</span><h2>Newtype Instincts</h2><p>เลือกทอยใหม่ได้ 1 ลูกเฉพาะลูกที่พลาด (Miss) หรือเก็บผลเดิมไว้</p><div class="reroll-picker">${choices.map(index=>`<button data-reroll-index="${index}" aria-label="ทอยลูกที่ ${index+1} ผล ${result.dice[index]} ใหม่"><span class="die ${result.results[index]}">${result.dice[index]}</span><small>ลูกที่ ${index+1} · REROLL</small></button>`).join("")}</div><div class="modal-actions"><button class="action-btn" id="skip-newtype">ไม่ทอยใหม่ <span>KEEP ROLL</span></button></div></div>`;
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
      startMove(D.rules.advance.distance+unit.upgrades.speed,D.rules.advance.timeline,"Advance",moved=>afterUnitMove(unit,"advance",null,moved));
    } else if (action==="dash") {
      if(!isAiTeam(unit.team)){
        if(unit.id==="chars-zaku")beginAdjustableCharDash(unit,D.rules.dash.timeline,"Dash",null,{primaryAction:true});
        else beginAdjustableDash(unit);
        return;
      }
      startMove(D.rules.dash.distance+(unit.id==="chars-zaku"?1:0),D.rules.dash.timeline,"Dash",moved=>afterUnitMove(unit,"dash",null,moved),{primaryAction:true});
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

  function beginAdjustableAdvance(unit) {
    const allowance=D.rules.advance.distance+(unit.upgrades.speed||0);
    return beginAdjustableMovement(unit,allowance,D.rules.advance.timeline,"Advance","advance",false);
  }

  function beginAdjustableDash(unit) {
    const allowance=D.rules.dash.distance+(unit.id==="chars-zaku"?1:0);
    return beginAdjustableMovement(unit,allowance,D.rules.dash.timeline,"Dash","dash",true);
  }

  function beginAdjustableCharDash(unit,cost,label,onComplete=null,options={}) {
    const started=beginAdjustableMovement(unit,D.rules.dash.distance+1,cost,label,"dash",!!options.primaryAction);
    if(started&&movementDraft?.unitId===unit.id){
      movementDraft.charDash=true;
      movementDraft.afterEffects=onComplete;
      movementDraft.onCancel=options.onCancel||onComplete||null;
    }
    return started;
  }

  function beginAdjustableMovement(unit,allowance,cost,label,movementType,primaryAction) {
    if(!unit||unit.zone==="reserve")return false;
    if(movementDraft?.unitId===unit.id&&movementDraft.movementType===movementType)return openMovementDraft(unit);
    const forbidden=new Set(D.map.featureCoordinates.bases.map(base=>E.key(base.q,base.r)));
    const engaged=E.engagedTargets(state,unit);
    const reachable=E.reachable(state,unit,allowance,{forbidden});
    const wasDeploying=unit.zone==="deploying";
    if(!wasDeploying)reachable.set(E.key(unit.q,unit.r),0);
    if(!reachable.size&&wasDeploying){
      unit.zone="reserve";unit.q=null;unit.r=null;unit.energy+=1;payTimeline(unit,2);state.resolvedThisTick.add(unit.id);state.activeUnitId=null;
      refreshPassedTeamTactics(unit.team);
      addLog(`${unit.name} ไม่มีช่อง Deploy ที่ถูกกติกา: Energize +1, Timeline +2 และกลับ Reserve`);renderAll();startActivation();return false;
    }
    movementDraft={
      unitId:unit.id,
      origin:{q:unit.q,r:unit.r,zone:unit.zone},
      targets:new Set(reachable.keys()),
      allowance,
      effectiveAllowance:Math.max(0,allowance-(engaged.length?1:0)),
      engaged:engaged.length>0,
      placed:!wasDeploying,
      cost,label,movementType,primaryAction
    };
    return openMovementDraft(unit);
  }

  function openMovementDraft(unit) {
    const draft=movementDraft;
    if(!draft||draft.unitId!==unit?.id)return false;
    mode={
      type:"move",unitId:unit.id,targets:new Set(draft.targets),cost:0,label:draft.label,afterMove:null,
      primaryAction:draft.primaryAction,allowStay:draft.placed,adjustableMovement:true,returnMenu:"main",
      hint:`${draft.label}: เลือกตำแหน่งใหม่ภายในพื้นที่เดิม (งบ ${draft.effectiveAllowance}${draft.engaged?` จาก ${draft.allowance} เพราะ ENCOUNTER -1`:""}) — ยืนยันเมื่อเลือก Action อื่น`
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
    const pickups=E.pickupAt(state,unit);
    playPickupFeedback(unit,pickups);
    payTimeline(unit,draft.cost);
    if(draft.movementType==="dash")SFX.dash();
    if(draft.primaryAction)state.activation.actionUsed=true;
    if(draft.movementType==="advance")state.activation.advanced=true;
    state.justDeployedUnitId=null;
    addLog(`${unit.name} ยืนยัน ${draft.label} ที่ Hex ${unit.q},${unit.r}`);
    const finish=()=>{renderAll();onComplete();};
    afterUnitMove(unit,draft.movementType,finish,moved,{skipCharKick:!!options.skipCharKick});
    renderAll();
  }

  function startMoveFor(unit,allowance,cost,label,afterMove,options={}) {
    if(!unit||unit.zone==="reserve")return false;
    const forbidden=new Set(D.map.featureCoordinates.bases.map(base=>E.key(base.q,base.r)));
    const engaged=E.engagedTargets(state,unit);
    const effectiveAllowance=Math.max(0,allowance-(engaged.length?1:0));
    const reachable=E.reachable(state,unit,allowance,{ignoreElevation:!!options.ignoreElevation,forbidden});
    if(options.destinationFilter){for(const target of [...reachable.keys()]){const [q,r]=E.fromKey(target);if(!options.destinationFilter({q,r}))reachable.delete(target);}}
    if(!reachable.size&&unit.zone==="deploying"){
      unit.zone="reserve";unit.q=null;unit.r=null;unit.energy+=1;payTimeline(unit,2);state.resolvedThisTick.add(unit.id);state.activeUnitId=null;
      refreshPassedTeamTactics(unit.team);
      addLog(`${unit.name} ไม่มีช่อง Deploy ที่ถูกกติกา: Energize +1, Timeline +2 และกลับ Reserve`);renderAll();startActivation();return;
    }
    const allowStay=options.allowStay??unit.zone!=="deploying";
    if(!reachable.size&&!allowStay){addLog(`${label}: ไม่มีช่องปลายทางที่ถูกกติกา`);renderAll();return false;}
    mode={type:"move",unitId:unit.id,targets:new Set(reachable.keys()),cost,label,afterMove,primaryAction:!!options.primaryAction,allowStay,returnMenu:options.returnMenu||"main",onCancel:options.onCancel,hint:`${label}: เลือกช่องสีฟ้า (งบการเคลื่อนที่ ${effectiveAllowance}${engaged.length?` จาก ${allowance} เพราะ ENGAGED -1`:""}; การขึ้นที่สูงใช้เพิ่ม 1 ต่อระดับ)`};
    menuOpen=true;
    renderAll();
    return true;
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
    }
  }

  function completeMove(q,r) {
    const unit=state.units.find(candidate=>candidate.id===mode?.unitId);if(!unit||mode?.type!=="move")return;
    const adjustableMovement=!!mode.adjustableMovement;const primaryAction=mode.primaryAction;const wasDeploying=unit.zone==="deploying";const callback=mode.afterMove;const label=mode.label;const cost=mode.cost;
    const moved=unit.q!==q||unit.r!==r;
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
    unit.q=q;unit.r=r;unit.zone="board";const pickups=E.pickupAt(state,unit);playPickupFeedback(unit,pickups);payTimeline(unit,cost);
    if(/dash/i.test(label)) SFX.dash();
    if(primaryAction)state.activation.actionUsed=true;
    if(label==="Advance")state.activation.advanced=true;
    if(wasDeploying)state.justDeployedUnitId=null;
    mode=null;addLog(`${unit.name} ใช้ ${label} ที่ Hex ${q},${r}`);if(callback)callback(moved);renderAll();
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
    const finishKick=()=>{
      const to={q:target.q,r:target.r};
      E.applyDamage(target,1);addLog(`Char Kick: ${target.name} รับ Damage 1`);
      const defeated=E.defeatUnit(state,target,unit.team);
      playDamageFeedback({to,targetUnitId:target.id,destroyed:defeated});
      const afterEffects=draft?.afterEffects||continuation;
      if(afterEffects)afterEffects();
      else {menuOpen=true;menuView="main";}
      renderAll();
    };
    mode=null;
    if(draft){
      addLog(`${unit.name} ยืนยัน ${draft.label}${draft.cost===0?" ฟรี":""} ด้วย Char Kick — Timeline +${draft.cost}`);
      commitMovementDraft(finishKick,{skipCharKick:true});
    }else finishKick();
    return true;
  }

  function resolveCharKickGarrisonTarget(unit,garrison,continuation=null) {
    if(!unit||!garrison||garrison.team===unit.team)return false;
    const draft=movementDraft?.charDash&&movementDraft.unitId===unit.id?movementDraft:null;
    const finishKick=()=>{
      const info=damageGarrison(unit,garrison,1,"Char Kick");
      playDamageFeedback({to:{q:info.q,r:info.r},garrison:true,destroyed:info.destroyed});
      const afterEffects=draft?.afterEffects||continuation;
      if(afterEffects)afterEffects();
      else {menuOpen=true;menuView="main";}
      renderAll();
    };
    mode=null;
    if(draft){
      addLog(`${unit.name} ยืนยัน ${draft.label}${draft.cost===0?" ฟรี":""} ด้วย Char Kick — Timeline +${draft.cost}`);
      commitMovementDraft(finishKick,{skipCharKick:true});
    }else finishKick();
    return true;
  }

  function afterUnitMove(unit, movementType, afterEffects=null, movementOccurred=true, options={}) {
    if (!options.skipCharKick && unit.id==="chars-zaku" && movementType==="dash") {
      const targets=adjacentCharKickTargets(unit);
      if (targets.all.length) {
        addLog(`Char Kick พร้อมใช้งานหลัง Dash — เลือก Unit หรือ Garrison ศัตรูที่ติดกันเพื่อสร้าง Damage 1`);
        mode={type:"char-kick",unitId:unit.id,targets:new Set(targets.all.map(target=>E.key(target.q,target.r))),returnMenu:"main",hint:"Char Kick: เลือก Unit หรือ Garrison ศัตรูที่ติดกันเพื่อสร้าง Damage 1",callback:afterEffects,onCancel:afterEffects};
        menuOpen=true;
        return;
      }
    }
    const enforcer=state.units.find(x=>x.id==="zaku-enforcer"&&x.zone==="board");
    if (movementOccurred&&unit.team==="fed"&&enforcer&&E.distance(unit,enforcer)===1&&inHand("zeon","iron-grip")&&!isUsed("iron-grip")&&!state.activation.tacticUsed.zeon) {
      openResponse([getTactic("iron-grip")], card=>{
        useResponse(card);
        E.applyDamage(unit,3);
        addLog(`Iron Grip: ${unit.name} รับ Damage 3`);
        const defeated=E.defeatUnit(state,unit,"zeon");
        closeModal();
        renderAll();
        if(defeated&&finishDefeatedActiveActivation(unit,"Iron Grip"))return;
        if(afterEffects)afterEffects();
      },()=>{if(afterEffects)afterEffects();});
      return;
    }
    if(afterEffects)afterEffects();
  }

  function beginAttack(weapon, options={}) {
    const unit=activeUnit();
    const engaged=E.engagedTargets(state,unit);
    const targets=E.legalWeaponTargets(state,unit,weapon);
    if (!targets.length) { addLog(`${weapon.name}: ไม่มีเป้าหมายที่อยู่ใน Range และ Line of Sight`); renderAll(); return false; }
    const normalHint=weapon.effect==="splash"
      ? `${weapon.name}: เลือกเป้าหมายหลัก — หลัง Combat Damage ศัตรูทุกตัวที่ติดกับเป้าหมายจะรับ Damage 0 (Critical = 1)`
      : `${weapon.name}: เลือกยูนิตหรือ Garrison สีแดง`;
    mode={type:"attack",unitId:unit.id,weapon,free:!!options.free,targets:new Set(targets.map(t=>E.key(t.q,t.r))),returnMenu:"weapons",hint:engaged.length?`${weapon.name}: ENGAGED — ต้องโจมตี Unit หรือ Garrison ศัตรูที่ติดกันและอยู่ระดับเดียวกันก่อน`:normalHint};
    menuOpen=true;
    renderAll();
    return true;
  }

  function resolveGarrisonAttack(attacker,garrison,weapon,options={}) {
    const from={q:attacker.q,r:attacker.r};
    const to={q:garrison.q,r:garrison.r};
    playAttackTargetingFx({from,to,team:attacker.team,garrison:true,onComplete:()=>{
      if(state?.status!=="playing"||attacker.zone!=="board"||!state.garrisons.some(item=>item.id===garrison.id))return;
      const surrogate={...garrison,upgrades:{shield:0,speed:0,strength:0},statuses:{slow:false,fracture:false,disarm:false}};
      const result=E.rollAttack(state,attacker,surrogate,weapon);
      lastDice=result;
      if(!options.free){state.activation.actionUsed=true;payTimeline(attacker,Math.max(0,weapon.timeline-attacker.nextAttackDiscount));}
      attacker.nextAttackDiscount=0;attacker.lastShotBonus=false;
      renderAll();
      showDiceRoll(result,weapon.name,()=>offerNewtypeReroll(attacker,surrogate,weapon,result,()=>{
        const reductions={};
        offerFederationShield(attacker,garrison,weapon,result,reductions,()=>{
          const impact=damageGarrison(attacker,garrison,result.damage,`${attacker.name} ใช้ ${weapon.name}`);
          applyAttackerCritical(attacker,weapon,result);
          const splash=resolveSplashDamage(attacker,garrison,weapon,result,reductions);
          const attackerResponses=availablePostCombat(attacker,"attacker");
          const defenderResponders=splash.units.filter(unit=>unit.zone==="board");
          const defenderResponses=defenderResponders.length?availablePostCombat(defenderResponders[0],"defender"):[];
          renderAll();
          if(result.damage>0)playResolvedAttackFeedback({attacker,weapon,result,from,to:{q:impact.q,r:impact.r},garrison:true,destroyed:impact.destroyed});
          openPostCombatResponses([
            {cards:attackerResponses,role:"attacker",responders:[attacker]},
            {cards:defenderResponses,role:"defender",responders:defenderResponders}
          ],attacker,surrogate,0,()=>offerWeaponCriticalFollowUp(attacker,weapon,result));
        });
      }));
    }});
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
      // Defeating an enemy Garrison awards VP. A forced collision must never let a player
      // score by destroying their own Garrison.
      if(garrison.team!==source.team){
        state.vp[source.team]+=vp;
        addLog(`Garrison ถูกทำลาย — ${D.teams[source.team].short} +${vp} VP`);
      }else addLog(`Garrison ฝ่าย ${D.teams[source.team].short} ถูกทำลายจากการชน — ไม่ได้รับ VP`);
    }
    return {damage,destroyed,q,r};
  }

  function destroyUpgradeToken(target,type,label) {
    if(!type||!target?.upgrades||target.upgrades[type]<=0)return false;
    target.upgrades[type]-=1;
    if(type==="shield")target.inactiveShields=Math.min(target.inactiveShields||0,target.upgrades.shield);
    addLog(`${label}: ${target.name} สูญเสีย ${type.toUpperCase()} Upgrade 1`);
    return true;
  }

  function offerWeaponAfterRollEffect(attacker,defender,weapon,onComplete=()=>{}) {
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
    modal.classList.add("show");
    modal.querySelectorAll("[data-weapon-upgrade]").forEach(button=>button.addEventListener("click",()=>{
      destroyUpgradeToken(defender,button.dataset.weaponUpgrade,weapon.name);closeModal();renderAll();onComplete();
    }));
  }

  function resolveAttack(attacker,defender,weapon,options={}) {
    const from={q:attacker.q,r:attacker.r};
    const to={q:defender.q,r:defender.r};
    playAttackTargetingFx({from,to,team:attacker.team,onComplete:()=>{
      if(state?.status!=="playing"||attacker.zone!=="board"||defender.zone!=="board")return;
      const result=E.rollAttack(state,attacker,defender,weapon);
      lastDice=result;
      if (!options.free) {
        state.activation.actionUsed=true;
        payTimeline(attacker,Math.max(0,weapon.timeline-attacker.nextAttackDiscount));
      }
      attacker.nextAttackDiscount=0;
      pendingAttack={attacker,defender,weapon,result,reductions:{}};
      addLog(`${attacker.name} ใช้ ${weapon.name}: ${result.hits} Hit · ${result.criticals} Critical`);
      renderAll();
      showDiceRoll(result,weapon.name,()=>offerNewtypeReroll(attacker,defender,weapon,result,()=>offerWeaponAfterRollEffect(attacker,defender,weapon,()=>{
        offerFederationShield(attacker,defender,weapon,result,pendingAttack.reductions,finishAttack);
      })));
    }});
  }

  function finishAttack() {
    closeModal();
    if (!pendingAttack) return;
    const {attacker,defender,weapon,result,reductions={}}=pendingAttack;
    const from={q:attacker.q,r:attacker.r};
    const to={q:defender.q,r:defender.r};
    applyAttackerCritical(attacker,weapon,result);
    // Rule (p.25): step 7 resolves Critical Hit Effects (Slow/Fracture/Push2) BEFORE step 8
    // deals Damage. Resolving Push2 first lets it land on a still-healthy target (so a
    // lethal Push collision reaches its collided bystander) and lets a freshly-applied
    // Fracture status be eligible to trigger on this very attack's own damage.
    const dealDamageAndFinish=()=>{
      const damage=Math.max(0,result.damage-(reductions[defender.id]||0));
      const applied=E.applyDamage(defender,damage,{sourceType:"attack"});
      if (applied.blocked) addLog(`Shield ป้องกัน Damage ${applied.blocked}`);
      addLog(`${defender.name} รับ Damage ${applied.taken}${applied.fractured?" (Fracture +3)":""}`);
      const splash=resolveSplashDamage(attacker,defender,weapon,result,reductions);
      const defeated=defender.zone==="reserve"||E.defeatUnit(state,defender,attacker.team);
      if (attacker.lastShotBonus) {
        if (defeated) {
          grantUpgrade(attacker,"strength",1);
          addLog(`Last Shot Counts: ${attacker.name} รับ Strength Upgrade เพิ่มอีก 1`);
        }
        attacker.lastShotBonus=false;
      }
      const defenderResponders=[...(defeated?[]:[defender]),...splash.units]
        .filter((unit,index,list)=>unit.zone==="board"&&list.findIndex(candidate=>candidate.id===unit.id)===index);
      const defenderResponses=defenderResponders.length?availablePostCombat(defenderResponders[0],"defender"):[];
      const attackerResponses=availablePostCombat(attacker,"attacker");
      pendingAttack=null;
      renderAll();
      if(result.damage>0)playResolvedAttackFeedback({attacker,weapon,result,from,to,targetUnitId:defender.id,destroyed:defeated});
      openPostCombatResponses([
        {cards:attackerResponses,role:"attacker",responders:[attacker]},
        {cards:defenderResponses,role:"defender",responders:defenderResponders}
      ],attacker,defender,0,()=>offerWeaponCriticalFollowUp(attacker,weapon,result,()=>{
        finishDefeatedActiveActivation(attacker,"Combat Response");
      }));
    };
    if (result.criticals>0) applyCritical(attacker,defender,weapon,result,dealDamageAndFinish);
    else dealDamageAndFinish();
  }

  function applyCritical(attacker,defender,weapon,result,onComplete=()=>{}) {
    if (weapon.critical==="slow") applyDebuff(defender,"slow");
    if (weapon.critical==="fracture") applyDebuff(defender,"fracture");
    if (weapon.critical==="push2") { beginPushDirection(attacker,defender,2,onComplete,"Shoulder Bash Critical"); return; }
    onComplete();
  }

  function applyAttackerCritical(attacker,weapon,result) {
    if (result.criticals<1||weapon.critical!=="gainStrength") return;
    grantUpgrade(attacker,"strength",1);
    addLog(`Beam Saber Critical: ${attacker.name} รับ Strength Upgrade 1`);
  }

  function splashUnitTargets(attacker,target,weapon) {
    if(weapon.effect!=="splash")return [];
    return E.livingEnemies(state,attacker).filter(unit=>unit.id!==target.id&&E.distance(unit,target)===1);
  }

  function offerFederationShield(attacker,target,weapon,result,reductions,onComplete=()=>{}) {
    const candidates=[];
    if(target?.weapons&&target.team==="fed"&&result.damage>0)candidates.push({unit:target,damage:result.damage});
    const splashDamage=weapon.effect==="splash"&&weapon.critical==="splashDamage1"&&result.criticals>0?1:0;
    if(splashDamage>0)splashUnitTargets(attacker,target,weapon).filter(unit=>unit.team==="fed").forEach(unit=>candidates.push({unit,damage:splashDamage}));
    if(!candidates.length||!inHand("fed","federation-shield")||isUsed("federation-shield")||state.activation.tacticUsed.fed){onComplete();return;}
    const card=getTactic("federation-shield");
    const priority=candidates.slice().sort((a,b)=>((b.damage>=b.unit.hp)*100+b.damage)-((a.damage>=a.unit.hp)*100+a.damage))[0];
    const totalShields=Math.max(0,priority.unit.upgrades?.shield||0);
    const inactiveShields=Math.min(totalShields,Math.max(0,priority.unit.inactiveShields||0));
    const activeShields=Math.max(0,totalShields-inactiveShields);
    const applyTo=unit=>{useResponse(card);reductions[unit.id]=2;closeModal();renderAll();onComplete();};
    openResponse([card],()=>{
      if(candidates.length===1){applyTo(candidates[0].unit);return;}
      if(isAiTeam("fed")){
        applyTo(priority.unit);return;
      }
      const modal=ensureModal();
      modal.innerHTML=`<div class="modal-card"><span class="eyebrow">EARTH FEDERATION SHIELD // TARGET</span><h2>เลือกยูนิตที่จะลด Damage 2</h2><p>การโจมตีแบบ AOE สร้างผลโจมตีแยกกับยูนิตทุกตัว เลือกป้องกันได้ 1 ตัว</p><div class="modal-actions">${candidates.map(({unit,damage})=>`<button class="primary-btn" data-shield-target="${unit.id}">${unit.name} · Damage ${damage}</button>`).join("")}</div></div>`;
      modal.classList.add("show");
      modal.querySelectorAll("[data-shield-target]").forEach(button=>button.addEventListener("click",()=>applyTo(candidates.find(item=>item.unit.id===button.dataset.shieldTarget).unit)));
    },onComplete,{damage:priority.damage,effectiveDamage:Math.max(0,priority.damage-activeShields),activeShields,hp:priority.unit.hp});
  }

  function resolveSplashDamage(attacker,target,weapon,result,reductions={}) {
    if(weapon.effect!=="splash")return {units:[],garrisons:[]};
    const amount=weapon.critical==="splashDamage1"&&result.criticals>0?1:0;
    const adjacentUnits=splashUnitTargets(attacker,target,weapon);
    const adjacentGarrisons=state.garrisons.filter(garrison=>garrison.team!==attacker.team&&garrison.id!==target.id&&E.distance(garrison,target)===1);
    adjacentUnits.forEach(unit=>{
      const to={q:unit.q,r:unit.r};
      const reducedAmount=Math.max(0,amount-(reductions[unit.id]||0));
      const applied=E.applyDamage(unit,reducedAmount);addLog(`Cracker Grenade AOE: ${unit.name} รับ Damage ${applied.taken}`);
      const defeated=E.defeatUnit(state,unit,attacker.team);
      if(applied.taken>0)playDamageFeedback({to,targetUnitId:unit.id,destroyed:defeated});
    });
    adjacentGarrisons.forEach(garrison=>{
      const info=damageGarrison(attacker,garrison,amount,"Cracker Grenade AOE");
      if(amount>0)playDamageFeedback({to:{q:info.q,r:info.r},garrison:true,destroyed:info.destroyed});
    });
    if(adjacentUnits.length||adjacentGarrisons.length)addLog(`Cracker Grenade: กระจาย Damage ${amount} ใส่ศัตรูรอบเป้าหมาย ${adjacentUnits.length+adjacentGarrisons.length} จุด`);
    return {units:adjacentUnits,garrisons:adjacentGarrisons};
  }

  function offerWeaponCriticalFollowUp(attacker,weapon,result,onComplete=()=>{}) {
    if(result.criticals<1||attacker.zone!=="board"){onComplete();return;}
    if(attacker.id==="chars-zaku"&&weapon.critical==="dashTimeline0"){
      addLog("Machine Gun Critical: Char’s Zaku II สามารถ Dash โดยใช้ Timeline 0");
      if(!isAiTeam(attacker.team)){
        const started=beginAdjustableCharDash(attacker,0,"Machine Gun Critical Dash",onComplete,{primaryAction:false,onCancel:onComplete});
        if(!started)onComplete();
        return;
      }
      const started=startMoveFor(attacker,D.rules.dash.distance+1,0,"Machine Gun Critical Dash",moved=>afterUnitMove(attacker,"dash",onComplete,moved),{returnMenu:"main",onCancel:onComplete});
      if(started)scheduleAiResolveMode();
      if(!started)onComplete();
      return;
    }
    if(attacker.id==="guncannon"&&weapon.critical==="dashRescueTimeline0"){
      addLog("240mm Critical: Guncannon สามารถ Dash โดยใช้ Timeline 0 แล้ว Rescue ใน Range 1");
      const started=startMoveFor(attacker,D.rules.dash.distance,0,"240mm Critical Dash",moved=>afterUnitMove(attacker,"dash",()=>offerGuncannonCriticalRescue(attacker,onComplete),moved),{returnMenu:"main",onCancel:onComplete});
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
    modal.classList.add("show");
    modal.querySelector("#confirm-critical-rescue").addEventListener("click",()=>{closeModal();rescueGarrison(unit,1,false,null,onComplete);});
    modal.querySelector("#skip-critical-rescue").addEventListener("click",()=>{closeModal();renderAll();onComplete();});
  }

  function pushAway(source,target,steps,direction,onComplete=()=>{}) {
    // Forced movement is not a Move/Dash, so it never collects Energy/Mystery Upgrades.
    // A Push follows the direction chosen by the attacker in a straight line. If it collides
    // with terrain, the board edge, a Unit, or a Garrison, the pushed Unit takes Damage 2.
    // A collided Unit/Garrison also takes Damage 2.
    let movedAny=false;
    for (let i=0;i<steps;i++) {
      if(target.zone!=="board"||target.hp<=0)break;
      const step=E.forcedPushStep(state,target,direction);
      if(step.type==="move") {
        target.q=step.q;target.r=step.r;
        movedAny=true;
        addLog(`Push: ${target.name} ถูกผลักไป Hex ${target.q},${target.r}`);
        continue;
      }

      const targetPos={q:target.q,r:target.r};
      const pushedDamage=E.applyDamage(target,2,{sourceType:"collision"});
      if(step.unit){
        const collidedUnit=step.unit;
        const to={q:collidedUnit.q,r:collidedUnit.r};
        const collisionDamage=E.applyDamage(collidedUnit,2,{sourceType:"collision"});
        // VP belongs to the opposing faction of the defeated Unit, never to its own side.
        const scoringTeam=collidedUnit.team===source.team?target.team:source.team;
        const defeated=E.defeatUnit(state,collidedUnit,scoringTeam);
        addLog(`${target.name} ชน ${collidedUnit.name} — ${target.name} รับ Damage ${pushedDamage.taken}, ${collidedUnit.name} รับ Damage ${collisionDamage.taken}`);
        playDamageFeedback({to,targetUnitId:collidedUnit.id,destroyed:defeated});
      }else if(step.garrison){
        const collidedGarrison=step.garrison;
        const info=damageGarrison(source,collidedGarrison,2,"Push Collision");
        addLog(`${target.name} ชน Garrison — ${target.name} รับ Damage ${pushedDamage.taken}, Garrison รับ Damage ${info.damage}`);
        playDamageFeedback({to:{q:info.q,r:info.r},garrison:true,destroyed:info.destroyed});
      }else addLog(`${target.name} ชน${step.reason==="edge"?"ขอบสนาม":"พื้นที่สูง/สิ่งกีดขวาง"} — รับ Damage ${pushedDamage.taken}`);
      playDamageFeedback({to:targetPos,targetUnitId:target.id,destroyed:target.hp<=0});
      break;
    }
    renderAll();
    if(movedAny&&target.zone==="board")afterUnitMove(target,"push",onComplete,true);
    else onComplete();
  }

  function beginPushDirection(source,target,steps,onComplete=()=>{},label="PUSH") {
    if(!source||!target||target.zone!=="board"||target.hp<=0){onComplete();return false;}
    const options=E.pushDirectionOptions(state,source,target);
    if(!options.length){
      const targetPos={q:target.q,r:target.r};
      const damage=E.applyDamage(target,2,{sourceType:"collision"});
      addLog(`${label}: ${target.name} ไม่มีช่องให้ผลักออก — ชนขอบสนามและรับ Damage ${damage.taken}`);
      playDamageFeedback({to:targetPos,targetUnitId:target.id,destroyed:target.hp<=0});
      renderAll();onComplete();return true;
    }
    const choose=option=>{
      mode=null;menuOpen=false;
      addLog(`${label}: เลือกทิศผลักผ่าน Hex ${option.q},${option.r}`);
      pushAway(source,target,steps,option.direction,onComplete);
    };
    if(isAiTeam(source.team)){
      const choice=A.choosePushDirection?.(state,source,target,options,steps,E)||options[0];
      addLog(`AI · ${source.name} เลือกทิศทาง Push`);
      choose(choice);return true;
    }
    mode={
      type:"push-direction",unitId:source.id,pushTargetId:target.id,steps,label,required:true,
      targets:new Set(options.map(option=>E.key(option.q,option.r))),pushOptions:options,
      hint:`${label}: เลือก Hex สีแดงเพื่อกำหนดทิศทางผลัก ${steps} ช่อง`,
      callback:choose
    };
    menuOpen=true;menuView="main";renderAll();return true;
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
    const responders=(responseWindow.responders||[responseWindow.role==="defender"?defender:attacker]).filter(unit=>unit?.zone==="board");
    if(!responders.length)return continueQueue();
    const opposingUnit=responseWindow.role==="defender"?attacker:defender;
    const canAttack=responders.some(respondingUnit=>respondingUnit.weapons.some(weapon=>E.legalWeaponTargets(state,respondingUnit,weapon).some(target=>target.id===opposingUnit.id)));
    const legalCards=responseWindow.cards.filter(card=>
      inHand(card.team,card.id)&&
      !isUsed(card.id)&&
      !state.activation.tacticUsed[card.team]&&
      (card.id!=="return-fire"||canAttack)
    );
    if(!legalCards.length)return continueQueue();
    openResponse(legalCards,card=>resolvePostCombat(card,attacker,defender,responseWindow.role,continueQueue,responders),continueQueue,{canAttack});
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
        const result=E.rollAttack(state,returningUnit,attacker,weapon);
        lastDice=result;closeModal();renderAll();
        showDiceRoll(result,`RETURN FIRE · ${weapon.name}`,()=>offerNewtypeReroll(returningUnit,attacker,weapon,result,()=>offerWeaponAfterRollEffect(returningUnit,attacker,weapon,()=>{
          const from={q:returningUnit.q,r:returningUnit.r};
          const to={q:attacker.q,r:attacker.r};
          applyAttackerCritical(returningUnit,weapon,result);
          // Rule (p.25): Critical Hit Effects (step 7) resolve before Damage (step 8) here too.
          const finishReturnFire=()=>{
            const applied=E.applyDamage(attacker,result.damage,{sourceType:"attack"});
            if(applied.blocked)addLog(`Return Fire: Shield ป้องกัน Damage ${applied.blocked}`);
            const splash=resolveSplashDamage(returningUnit,attacker,weapon,result);
            returningUnit.nextAt+=Math.max(0,weapon.timeline-1);
            addLog(`Return Fire ที่ยืนยันแล้ว: ${returningUnit.name} ยิงกลับด้วย ${weapon.name} และทำ Damage ${applied.taken}${applied.fractured?" (Fracture +3)":""}`);
            const defeated=attacker.zone==="reserve"||E.defeatUnit(state,attacker,returningUnit.team);
            renderAll();
            if(result.damage>0)playCombatFeedback({from,to,targetUnitId:attacker.id,destroyed:defeated});
            const returnDefenderResponders=[...(defeated?[]:[attacker]),...splash.units].filter(unit=>unit.zone==="board");
            const returnDefenderResponses=returnDefenderResponders.length?availablePostCombat(returnDefenderResponders[0],"defender"):[];
            const returnAttackerResponses=availablePostCombat(returningUnit,"attacker");
            // Rule (p.25): when both sides could Respond at the same time, the attacking
            // player's abilities resolve first. `returningUnit` is the attacker of this
            // Return Fire counter-attack, so its Response window must be queued first.
            openPostCombatResponses([
              {cards:returnAttackerResponses,role:"attacker",responders:[returningUnit]},
              {cards:returnDefenderResponses,role:"defender",responders:returnDefenderResponders}
            ],returningUnit,attacker,0,()=>offerWeaponCriticalFollowUp(returningUnit,weapon,result,done));
          };
          if(result.criticals>0)applyCritical(returningUnit,attacker,weapon,result,finishReturnFire);
          else finishReturnFire();
        })));
      };
      if(isAiTeam(card.team)){
        const choice=returnOptions.slice().sort((a,b)=>(b.weapon.strength-b.weapon.timeline*.35)-(a.weapon.strength-a.weapon.timeline*.35))[0];
        addLog(`AI · Return Fire เลือก ${choice.unit.name} · ${choice.weapon.name}`);renderAll();fireReturnWeapon(choice.unit,choice.weapon);return;
      }
      const modal=ensureModal();
      modal.innerHTML=`<div class="modal-card"><span class="eyebrow">RETURN FIRE // CHOOSE UNIT & WEAPON</span><h2>เลือกผู้ยิงกลับ</h2><p>เลือกยูนิตที่ได้รับ Combat Damage trigger และอาวุธที่โจมตี ${attacker.name} ได้</p><div class="modal-actions">${returnOptions.map((choice,index)=>`<button class="primary-btn" data-return-option="${index}">${choice.unit.name} · ${choice.weapon.name} · TL ${Math.max(0,choice.weapon.timeline-1)}</button>`).join("")}</div></div>`;
      modal.classList.add("show");
      modal.querySelectorAll("[data-return-option]").forEach(button=>button.addEventListener("click",()=>{
        const choice=returnOptions[Number(button.dataset.returnOption)];
        fireReturnWeapon(choice.unit,choice.weapon);
      }));
      return;
    } else if (card.id==="exploited-chaos") { attacker.energy+=1;grantUpgrade(attacker,"strength",1);addLog(`${attacker.name} รับ Energy 1 และ Strength Upgrade 1`); }
    else if (card.id==="shattered-formation") { const responseUnit=responders[0]||defender;E.applyDamage(attacker,2);addLog(`Shattered Formation: ${attacker.name} รับ Damage 2`);E.defeatUnit(state,attacker,responseUnit.team); }
    closeModal();renderAll();done();
  }

  function useUnitAbility(unit) {
    if (unit.energy<1||state.activation.commandUsed) return;
    const spend=()=>{unit.energy-=1;state.activation.commandUsed=true;};
    if (unit.id==="gundam") {
      const allies=state.units.filter(x=>x.team===unit.team&&x.zone==="board"&&E.distance(unit,x)<=3&&totalUpgrades(x)<=1);
      if (!allies.length) { addLog("White Base Unity: ไม่มีพันธมิตรในระยะ 3");menuOpen=true;renderAll();return; }
      mode={type:"select-unit",unitId:unit.id,targets:new Set(allies.map(x=>E.key(x.q,x.r))),hint:"White Base Unity: เลือกพันธมิตรที่มี Upgrade ไม่เกิน 1 ชิ้น",callback:target=>chooseWhiteBaseUpgrade(target,spend)};
    } else if (unit.id==="guncannon") {
      selectEnemy(unit,3,"Critical Shot: เลือกศัตรู",target=>{spend();applyDebuff(target,"fracture");addLog(`${target.name} ติด Fracture`);});
    } else if (unit.id==="guntank") {
      spend(); const dice=Array.from({length:5},()=>Math.floor(Math.random()*10)+1); const crit=dice.filter(x=>x>=9).length; lastDice={dice,results:dice.map(x=>x>=9?"critical":"miss"),hits:0,criticals:crit,damage:crit,accuracy:0};
      renderAll();showDiceRoll(lastDice,"SATURATED FIRE",()=>{E.livingEnemies(state,unit).filter(x=>E.distance(unit,x)<=4&&E.hasLineOfSight(state,unit,x)).forEach(x=>{E.applyDamage(x,crit);E.defeatUnit(state,x,unit.team);});addLog(`Saturated Fire: ${crit} Critical — ศัตรูใน Range 4 และ Line of Sight รับ Damage ${crit}`);renderAll();});return;
    } else if (unit.id==="chars-zaku") {
      if(beginAttack(unit.weapons[0],{free:true}))spend();
    }
    else if (unit.id==="zaku-line") {
      const damagedEnemies=E.livingEnemies(state,unit).filter(enemy=>enemy.hp<enemy.maxHp);
      if(!damagedEnemies.length){addLog("Zeon Zealotry: ไม่มี Unit ศัตรูที่มี Damage");menuOpen=true;renderAll();return;}
      startMove(5,0,"Zeon Zealotry",moved=>{spend();afterUnitMove(unit,"ability",null,moved);},{ignoreElevation:true,allowStay:false,destinationFilter:hex=>damagedEnemies.some(enemy=>E.distance(hex,enemy)<E.distance(unit,enemy))});
    }
    else if (unit.id==="zaku-enforcer") {
      const objective=adjacentObjective(unit); if (!objective) {addLog("Domination: ไม่มี Objective ในช่องติดกัน");menuOpen=true;renderAll();return;} spend();objective.owner=unit.team;addLog("Domination: Zeon ยึด Objective");queueObjectiveCaptureFx(objective,unit.team);
    }
    renderAll();
  }

  function selectEnemy(unit,range,hint,callback,filter=()=>true,options={}) {
    const targets=E.livingEnemies(state,unit).filter(x=>E.distance(unit,x)<=range&&(options.ignoreLos||E.hasLineOfSight(state,unit,x))&&filter(x));
    if (!targets.length) { addLog(`${hint}: ไม่มีเป้าหมายถูกกติกา`); renderAll(); return false; }
    mode={type:"select-unit",unitId:unit.id,targets:new Set(targets.map(x=>E.key(x.q,x.r))),returnMenu:"main",hint,callback,onCancel:options.onCancel};menuOpen=true;renderAll();return true;
  }

  function chooseWhiteBaseUpgrade(target,onChoose) {
    if(isAiTeam(activeUnit()?.team)){
      const type=A.chooseUpgrade(target,true);
      onChoose();grantUpgrade(target,type,1);addLog(`AI · White Base Unity: ${target.name} ได้รับ ${type.toUpperCase()} Upgrade 1`);renderAll();return;
    }
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><span class="eyebrow">WHITE BASE UNITY</span><h2>เลือก Upgrade ให้ ${target.name}</h2><div class="modal-actions">${["shield","speed","strength"].map(type=>`<button class="primary-btn" data-white-base-upgrade="${type}">${type.toUpperCase()}</button>`).join("")}<button class="action-btn" id="cancel-white-base">ยกเลิก</button></div></div>`;
    modal.classList.add("show");
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

  function rescueGarrison(unit,range,useAction,onSuccess=null,onComplete=()=>{},options={}) {
    const targets=state.garrisons.filter(g=>g.team===unit.team&&E.distance(unit,g)<=range&&(!options.requireLos||E.hasLineOfSight(state,unit,g))).sort((a,b)=>E.distance(unit,a)-E.distance(unit,b));
    if (!targets.length) { addLog("ไม่มีกองรักษาการณ์ฝ่ายเดียวกันในระยะ Rescue");renderAll();return false; }
    const commit=target=>{
      state.garrisons=state.garrisons.filter(g=>g.id!==target.id);state.vp[unit.team]+=D.rules.rescue.vp;E.recordGarrisonRescue(state,unit);
      if(useAction){state.activation.actionUsed=true;payTimeline(unit,D.rules.rescue.timeline);}
      if(onSuccess)onSuccess();
      addLog(`${unit.name} Rescue Garrison สำเร็จ — +${D.rules.rescue.vp} VP`);
      const responseId=unit.team==="fed"?"shield-recovery":"logistics-relay";
      const continueResponses=()=>offerRescueMechanics(unit,onComplete);
      if(inHand(unit.team,responseId)&&!isUsed(responseId)&&!state.activation.tacticUsed[unit.team])openResponse([getTactic(responseId)],card=>{useResponse(card);if(card.id==="shield-recovery")grantUpgrade(unit,"shield",1);else grantUpgrade(unit,"speed",1);closeModal();renderAll();continueResponses();},continueResponses);
      else continueResponses();
      renderAll();
    };
    if(targets.length===1){commit(targets[0]);return true;}
    mode={type:"select-garrison",unitId:unit.id,targets:new Set(targets.map(target=>E.key(target.q,target.r))),returnMenu:"main",hint:`Rescue: เลือก Garrison ฝ่ายเดียวกันภายใน Range ${range}`,callback:commit,onCancel:onComplete};menuOpen=true;renderAll();return true;
  }

  function handleTactic(id) {
    const card=getTactic(id); if (!card) return;
    if(!inHand(card.team,id)) return;
    const unit=activeUnit();
    const legal=!isUsed(id)&&card.timing==="COMMAND"&&!state.activation.tacticUsed[card.team]&&!mode;
    const issue=isUsed(id)?"การ์ดใบนี้ถูกใช้แล้ว":card.timing!=="COMMAND"?"Response ใช้ได้เฉพาะเมื่อ Trigger เกิดขึ้น":state.activation.tacticUsed[card.team]?"ฝ่ายนี้ใช้ Tactic ใน Activation นี้แล้ว":mode?"ยกเลิกการเลือกเป้าหมายปัจจุบันก่อน":commandTacticIssue(card,unit);
    showCard(card,issue||"ตรวจความสามารถแล้วกด Confirm เพื่อใช้การ์ด",legal&&!issue?()=>{
      if(movementDraft)commitMovementDraft(()=>useCommandTactic(card));else useCommandTactic(card);
    }:null);
  }

  function commandTacticIssue(card,unit) {
    if(!unit||unit.team!==card.team)return "ใช้ได้เฉพาะ Activation ของฝ่ายเจ้าของการ์ด";
    if(card.id==="entrenched-position"&&unit.id!=="guntank")return "ใช้ได้เมื่อ Guntank กำลังทำงาน";
    if(card.id==="forward-artillery"&&unit.id!=="guncannon")return "ใช้ได้เมื่อ Guncannon กำลังทำงาน";
    if(card.id==="last-shot-counts"&&unit.id!=="gundam")return "ใช้ได้เมื่อ Gundam กำลังทำงาน";
    if(card.id==="rescued-extraction"&&unit.id!=="zaku-line")return "ใช้ได้เมื่อ Zaku II: Line Breaker กำลังทำงาน";
    if(card.id==="rescued-extraction"&&!hasOwnGarrisonInRange(unit,3,true))return "ไม่มี Garrison ฝ่ายเดียวกันใน Range 3 และ Line of Sight";
    if(card.id==="crimson-execution"&&unit.id!=="chars-zaku")return "ใช้ได้เมื่อ Char’s Zaku II กำลังทำงาน";
    if(card.id==="lock-down"&&!E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target)))return "ไม่มี Unit ศัตรูใน Range 3 และ Line of Sight";
    if(card.id==="breaking-line"&&!E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target)))return "ไม่มี Unit ศัตรูใน Range 3 และ Line of Sight";
    if(card.id==="sudden-pressure"){
      const hasUnit=E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target));
      const hasGarrison=state.garrisons.some(target=>target.team!==unit.team&&E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target));
      if(!hasUnit&&!hasGarrison)return "ไม่มี Unit หรือ Garrison ศัตรูใน Range 3 และ Line of Sight";
    }
    return "";
  }

  function markCommand(card) { E.retireTacticCard(state,card.team,card.id);state.activation.tacticUsed[card.team]=true;addLog(`ใช้ Tactic: ${card.name}`); }
  function useResponse(card) { E.retireTacticCard(state,card.team,card.id);state.activation.tacticUsed[card.team]=true;state.responseUsed[card.team]=true;addLog(`Response: ${card.name}`); }

  function continueCrimsonExecution(card,unit) {
    if(!unit||unit.id!==state.activeUnitId||unit.zone!=="board")return false;
    if(!isUsed(card.id))markCommand(card);
    const heatHawk=unit.weapons.find(weapon=>weapon.id==="char-heat-hawk");
    if(!heatHawk){addLog("Crimson Execution: ไม่พบข้อมูล Heat Hawk");renderAll();return false;}
    addLog("Crimson Execution: Heat Hawk Attack · Timeline 0");
    const started=beginAttack(heatHawk,{free:true});
    if(!started){addLog("Crimson Execution: ไม่มีเป้าหมาย Heat Hawk ที่ถูกกติกาหลัง Dash");menuOpen=true;menuView="main";renderAll();}
    return started;
  }

  function useCommandTactic(card) {
    const unit=activeUnit();
    if (card.id==="built-to-last") { markCommand(card);const repair=totalUpgrades(unit);unit.hp=Math.min(unit.maxHp,unit.hp+repair);addLog(`${unit.name} ซ่อม HP ${repair}`); }
    else if (card.id==="entrenched-position") { if(unit.id!=="guntank")return showCard(card,"ใช้ได้เมื่อ Guntank กำลังทำงาน");markCommand(card);grantUpgrade(unit,"shield",1);const o=adjacentObjective(unit);if(o){o.owner=unit.team;addLog("Entrenched Position: Federation ยึด Objective");queueObjectiveCaptureFx(o,unit.team);} }
    else if (card.id==="forward-artillery") { if(unit.id!=="guncannon")return showCard(card,"ใช้ได้เมื่อ Guncannon กำลังทำงาน");markCommand(card);unit.energy+=1;const rescued=state.rescuedGarrisons?.fed||0;unit.tempStrength+=rescued;addLog(`Forward Artillery: Strength ชั่วคราว +${rescued} (Garrison ที่ E.F.S.F. ช่วยไว้)`); }
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
        afterUnitMove(unit,"tactic",()=>selectEnemy(unit,1,"Drive Them Back: เลือกยูนิตศัตรูที่ติดกัน",enemy=>{
          beginPushDirection(unit,enemy,1,()=>{
            const to={q:enemy.q,r:enemy.r};
            const applied=E.applyDamage(enemy,1,{sourceType:"tactic"});
            const defeated=E.defeatUnit(state,enemy,unit.team);
            addLog(`${enemy.name} รับ Damage ${applied.taken} จาก Drive Them Back หลังการผลัก`);
            if(applied.taken>0)playDamageFeedback({to,targetUnitId:enemy.id,destroyed:defeated});
            renderAll();
          },"Drive Them Back");
        }),moved);
      },{allowStay:canPushFrom(unit),destinationFilter:canPushFrom});
    }
    else if (card.id==="sudden-pressure") {
      markCommand(card);
      const enemyUnits=E.livingEnemies(state,unit).filter(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target));
      const enemyGarrisons=state.garrisons.filter(target=>target.team!==unit.team&&E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target));
      enemyUnits.forEach(target=>{E.applyDamage(target,2);E.defeatUnit(state,target,unit.team);});
      enemyGarrisons.slice().forEach(target=>damageGarrison(unit,target,2,"Sudden Pressure"));
      addLog(`Sudden Pressure: เป้าหมายใน Range 3 และ Line of Sight — Unit ${enemyUnits.length}, Garrison ${enemyGarrisons.length} รับ Damage 2`);
    }
    else if (card.id==="crimson-execution") {
      if(unit.id!=="chars-zaku")return showCard(card,"ใช้ได้เมื่อ Char’s Zaku II กำลังทำงาน");
      const attackAfterDash=()=>continueCrimsonExecution(card,unit);
      if(isAiTeam(unit.team)){
        startMove(D.rules.dash.distance+1,0,"Crimson Dash",moved=>afterUnitMove(unit,"dash",attackAfterDash,moved));
      }else{
        const started=beginAdjustableCharDash(unit,0,"Crimson Dash",attackAfterDash,{primaryAction:false,onCancel:()=>{menuOpen=true;menuView="main";renderAll();}});
        if(!started){menuOpen=true;menuView="main";renderAll();}
      }
    }
    renderAll();
  }

  function chooseUpgradeToDestroy(card,target) {
    const choices=["shield","speed","strength"].filter(type=>target.upgrades[type]>0);
    const apply=type=>{markCommand(card);if(type){target.upgrades[type]-=1;if(type==="shield")target.inactiveShields=Math.min(target.inactiveShields||0,target.upgrades.shield);}const status=card.id==="lock-down"?"slow":"fracture";applyDebuff(target,status);addLog(`${target.name}${type?` เสีย ${type} Upgrade 1 และ`:""} ติด ${status==="slow"?"Slow":"Fracture"}`);closeModal();renderAll();};
    if(!choices.length){apply(null);return;}
    if(isAiTeam(card.team)){const selected=A.chooseUpgrade(target,false);apply(choices.includes(selected)?selected:choices[0]);return;}
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><button class="modal-close" aria-label="ปิด">×</button><span class="eyebrow">${card.name.toUpperCase()}</span><h2>เลือก Upgrade ที่จะทำลาย</h2><p>${target.name} — การทำลาย Upgrade เป็นตัวเลือก แต่ Status จะเกิดขึ้นเสมอ</p><div class="modal-actions">${choices.map(type=>`<button class="primary-btn" data-upgrade-choice="${type}">${type.toUpperCase()} · ${target.upgrades[type]}</button>`).join("")}<button class="action-btn" id="skip-upgrade-destroy">ไม่ทำลาย Upgrade</button></div></div>`;
    modal.classList.add("show");modal.querySelector(".modal-close").addEventListener("click",closeModal);modal.querySelectorAll("[data-upgrade-choice]").forEach(button=>button.addEventListener("click",()=>apply(button.dataset.upgradeChoice)));modal.querySelector("#skip-upgrade-destroy").addEventListener("click",()=>apply(null));
  }

  function openResponse(cards,onPlay,onSkip=closeModal,decisionContext={}) {
    const aiCard=cards.find(card=>isAiTeam(card.team));
    if(aiCard){
      const responseTarget=pendingAttack?.defender;
      const damage=Math.max(0,pendingAttack?.result?.damage||0);
      const totalShields=Math.max(0,responseTarget?.upgrades?.shield||0);
      const inactiveShields=Math.min(totalShields,Math.max(0,responseTarget?.inactiveShields||0));
      const activeShields=Math.max(0,totalShields-inactiveShields);
      const context={damage,effectiveDamage:Math.max(0,damage-activeShields),activeShields,hp:responseTarget?.hp,attackerAlive:pendingAttack?.attacker?.zone!=="reserve",canAttack:true,...decisionContext};
      // Resolve this hidden decision immediately. Delaying only when the AI owns a
      // matching card leaks hand information and lets a callback cross Activations.
      if(A.shouldUseResponse(aiCard,context))onPlay(aiCard);
      else onSkip();
      return;
    }
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
        mode=null;pendingAttack=null;aiResponsePending=false;aiEffectPending=false;closeModal();renderAll();aiFinishTurn(unit);return;
      }
      scheduleAiCallback(()=>aiWaitForSettled(unit,next,attempt+1),AI_PACE.poll);return;
    }
    scheduleAiCallback(next,AI_PACE.between);
  }

  function aiAdvance(unit,onComplete) {
    if(unit.statuses.slow){handleAction("advance");scheduleAiCallback(onComplete,AI_PACE.between);return;}
    const forbidden=new Set(D.map.featureCoordinates.bases.map(base=>E.key(base.q,base.r)));
    const allowance=D.rules.advance.distance+(unit.upgrades.speed||0);
    const reachable=E.reachable(state,unit,allowance,{forbidden});
    const choice=A.chooseMove(state,unit,reachable.keys(),D,E,unit.zone!=="deploying");
    const currentScore=unit.zone==="board"?A.positionScore(state,unit,unit.q,unit.r,D,E):-Infinity;
    const mustMove=unit.zone==="deploying";
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
    addLog(`AI · ใช้ Tactic ${card.name}`);renderAll();
    useCommandTactic(card);
    aiWaitForSettled(unit,onComplete);
  }

  function aiAbilityScore(unit) {
    if(state.activation.commandUsed||unit.energy<unit.command.energy)return -Infinity;
    if(unit.id==="gundam")return state.units.some(target=>target.team===unit.team&&target.zone==="board"&&E.distance(unit,target)<=3&&totalUpgrades(target)<=1)?42:-Infinity;
    if(unit.id==="guncannon")return E.livingEnemies(state,unit).some(target=>E.distance(unit,target)<=3&&E.hasLineOfSight(state,unit,target))?48:-Infinity;
    if(unit.id==="guntank")return E.livingEnemies(state,unit).filter(target=>E.distance(unit,target)<=4&&E.hasLineOfSight(state,unit,target)).length*24;
    if(unit.id==="chars-zaku")return A.attacksFrom(state,unit,D,E).some(choice=>choice.weapon.id===unit.weapons[0].id)?58:-Infinity;
    if(unit.id==="zaku-line"){
      const damaged=E.livingEnemies(state,unit).filter(target=>target.hp<target.maxHp);
      const forbidden=new Set(D.map.featureCoordinates.bases.map(base=>E.key(base.q,base.r)));
      const reachable=E.reachable(state,unit,5,{ignoreElevation:true,forbidden});
      return [...reachable.keys()].some(value=>{const [q,r]=E.fromKey(value);return damaged.some(target=>E.distance({q,r},target)<E.distance(unit,target));})?38:-Infinity;
    }
    if(unit.id==="zaku-enforcer"){const objective=adjacentObjective(unit);return objective&&objective.owner!==unit.team?95:-Infinity;}
    return -Infinity;
  }

  function aiUseAbility(unit,onComplete) {
    if(aiAbilityScore(unit)<38){onComplete();return;}
    addLog(`AI · ใช้ Command ${unit.command.name}`);renderAll();
    useUnitAbility(unit);
    aiWaitForSettled(unit,onComplete);
  }

  function aiTakePrimary(unit) {
    if(!unit||unit.id!==state.activeUnitId||unit.zone!=="board"){aiBusy=false;return;}
    if(state.activation.actionUsed){aiFinishTurn(unit);return;}
    const attack=A.chooseAttack(state,unit,D,E);
    const rescue=state.garrisons.filter(garrison=>garrison.team===unit.team&&E.distance(unit,garrison)<=1).sort((a,b)=>E.distance(unit,a)-E.distance(unit,b))[0];
    if(rescue&&(!attack||attack.score<68)){
      addLog(`AI · ${unit.name} เลือก Rescue เพื่อทำคะแนน`);renderAll();
      rescueGarrison(unit,1,true);
      if(mode)scheduleAiResolveMode();
      aiWaitForSettled(unit,()=>aiFinishTurn(unit));
      return;
    }
    if(attack){
      addLog(`AI · ${unit.name} เลือก ${attack.weapon.name}`);renderAll();
      aiPreferredTargetKey=E.key(attack.target.q,attack.target.r);
      beginAttack(attack.weapon);
      scheduleAiResolveMode();
      aiWaitForSettled(unit,()=>aiFinishTurn(unit));
      return;
    }
    const dashAllowance=D.rules.dash.distance+(unit.id==="chars-zaku"?1:0);
    const started=startMove(dashAllowance,D.rules.dash.timeline,"Dash",moved=>afterUnitMove(unit,"dash",null,moved),{primaryAction:true});
    if(started){aiWaitForSettled(unit,()=>aiFinishTurn(unit));return;}
    handleAction("energize");
    scheduleAiCallback(()=>aiFinishTurn(unit),AI_PACE.between);
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
    aiAdvance(unit,()=>aiWaitForSettled(unit,()=>aiUseTactic(unit,()=>aiWaitForSettled(unit,()=>aiUseAbility(unit,()=>aiWaitForSettled(unit,()=>aiTakePrimary(unit)))))));
  }

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
    const modal=ensureModal();
    modal.innerHTML=`<div class="modal-card"><button class="modal-close" aria-label="ปิด">×</button><span class="eyebrow">CORE FLOW // V1</span><h2>กติกาย่อ</h2><ul class="rules-list"><li>ทุก Unit เริ่มใน Reserve; เมื่อ Timeline มาถึงจึง Deploy บน Base และต้อง Advance ออกจาก Base</li><li>Advance เดินได้สูงสุด 3 ช่องและไม่เสีย Timeline; Dash เดินได้สูงสุด 2 ช่องและเสีย Timeline 2 — เฉพาะ Char’s Zaku II Dash ได้เพิ่ม 1 ช่องจาก Three Times Faster</li><li>Speed เพิ่มระยะเฉพาะ Advance; การขึ้นที่สูงใช้ระยะเพิ่ม 1 ต่อระดับ ส่วนการลงที่ต่ำไม่เพิ่มค่าใช้จ่าย</li><li>คลิกหัว Unit ที่กำลังทำงานเพื่อเปิด Command จากนั้นใช้ Advance ได้ 1 ครั้งและ Primary Action 1 ครั้ง</li><li>Timeline มีช่อง 1–10 ต่อ Phase และค่า Timeline ของ Action จะเลื่อนไอคอนไปยังช่องที่จะ Activate ครั้งถัดไป</li><li>แต่ละฝ่ายเริ่ม Phase 1 ด้วย Tactic สุ่ม 3 จากสำรับ 9 ใบ; เมื่อ Unit ทั้ง 3 ของฝ่ายนั้นผ่าน TL10 และจบ Activation แล้ว ฝ่ายนั้นจั่วเพิ่ม 3 ใบทันทีโดยไม่ต้องรออีกฝ่าย</li><li>ผู้เล่นแต่ละฝ่ายใช้ Tactic ได้สูงสุด 1 ใบต่อ Activation; กดการ์ดเพื่ออ่านก่อน แล้วจึงกด Confirm</li><li>ไม่มีการโจมตีสวนกลับอัตโนมัติ ยกเว้นยืนยันใช้ Return Fire</li><li>ช่องสีฟ้าคือช่องเดินที่ตรวจระยะและความสูงแล้ว; ช่องสีแดงคือเป้าหมายที่อยู่ใน Range และ Line of Sight</li><li>d10: 4–8 = Hit, 9–10 = Critical; ยิงจากที่สูงได้ Accuracy +1 และยิงขึ้นที่สูงได้ -1</li><li>Shield ที่ Active ป้องกัน Damage ชิ้นละ 1 แล้วคว่ำจนถึงต้น Activation ถัดไป, Strength เพิ่มลูกเต๋า, Speed เพิ่มระยะ Advance</li><li>เมื่อจบ Activation บนหรือติดกับ Objective จะ Contest: ฝ่ายเราต้องมี Unit ในระยะ 1 มากกว่า; จุดกลางจะถูกยึด ส่วนจุดศัตรูจะกลับเป็นกลางก่อนและต้อง Contest ชนะอีกครั้งจึงยึดได้</li><li>Garrison มี HP 1; Objective ที่ครอบครองให้ 1 VP เมื่อจบแต่ละ Phase; ทำลาย Unit ได้ VP ตามการ์ด และการทำลาย Garrison ศัตรูหรือ Rescue Garrison ฝ่ายเดียวกันได้ 2 VP</li></ul><p>พิกัด Feature และชั้นความสูงอ้างอิงภาพ Sleeping Leviathan ที่อัปโหลด; การ์ดทั้ง 24 ใบใช้ภาพจริงจาก PDF</p></div>`;
    modal.classList.add("show");
    modal.querySelector(".modal-close").addEventListener("click",closeModal);
  }

  function showResult() {
    const modal=ensureModal();const title=state.winner==="draw"?"DRAW":`${teamName(state.winner)} WINS`;
    modal.innerHTML=`<div class="modal-card"><span class="eyebrow">MISSION COMPLETE</span><h2>${title}</h2><div class="result-grid"><div>E.F.S.F.<b>${state.vp.fed}</b>VP</div><div>ZEON<b>${state.vp.zeon}</b>VP</div></div><button class="primary-btn" id="play-again">เล่นใหม่</button></div>`;modal.classList.add("show");modal.querySelector("#play-again").addEventListener("click",()=>{closeModal();resetGame();});
  }

  function renderSoundButton() {
    const button=$("#sound-btn");if(!button)return;
    button.textContent=soundMuted?"🔇":"🔊";
    button.setAttribute("aria-pressed",String(soundMuted));
    button.setAttribute("aria-label",soundMuted?"เปิดเสียง":"ปิดเสียง");
    button.title=soundMuted?"เปิดเสียง":"ปิดเสียง";
  }

  function renderLosButton() {
    const button=$("#los-btn");if(!button)return;
    const unit=activeUnit();
    const available=state?.status==="playing"&&unit&&(unit.zone==="board"||unit.zone==="deploying");
    document.body.classList.toggle("los-inspection-active",!!available&&losInspection.enabled);
    button.disabled=!available;
    button.setAttribute("aria-pressed",String(!!available&&losInspection.enabled));
    const maximumRange=unit?Math.max(0,...(unit.weapons||[]).map(weapon=>weapon.range||0)):0;
    button.innerHTML=`<span class="los-eye" aria-hidden="true"><i></i></span><span>LINE OF SIGHT${available?` · R${maximumRange}`:""}</span>`;
    button.setAttribute("aria-label",available&&losInspection.enabled?"ปิดการตรวจสอบ Line of Sight":`เปิดการตรวจสอบ Line of Sight ระยะ ${maximumRange}`);
    button.title=available&&losInspection.enabled?`กำลังแสดง Unit และ Garrison ศัตรูภายในระยะอาวุธสูงสุด ${maximumRange} · กดอีกครั้งเพื่อปิด`:`แสดง Line of Sight ตามระยะอาวุธไกลที่สุด (${maximumRange})`;
  }

  function toggleLosInspection() {
    if($("#los-btn")?.disabled)return;
    losInspection.enabled=!losInspection.enabled;
    renderAll();
  }

  function toggleSound() {
    soundMuted=!soundMuted;
    SFX.setMuted(soundMuted);
    BGM.setMuted(soundMuted);
    TitleBGM.setMuted(soundMuted);
    if(!soundMuted&&document.body.classList.contains("title-active"))TitleBGM.start();
    renderSoundButton();
  }

  $("#restart-btn").addEventListener("click",()=>{if(confirm("เริ่มเกมใหม่และล้างสถานะปัจจุบัน?"))resetGame();});
  $("#sound-btn")?.addEventListener("click",toggleSound);
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
    if(event.key!=="Escape"||!state)return;
    // Resolution dialogs have explicit Confirm/Skip controls. Closing one without running
    // its continuation would strand pending combat, so Escape deliberately leaves it open.
    if($("#game-modal")?.classList.contains("show"))return;
    if(mode){
      const actor=modeUnit();
      if(actor&&isAiTeam(actor.team))return;
      const currentMode=mode;
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

const fs=require('fs'),vm=require('vm'),assert=require('assert');
const base=require('path').resolve(__dirname,'..')+'/';
const D=require(base+'data.js'),E=require(base+'engine.js'),src=fs.readFileSync(base+'game.js','utf8');
// Expose internal AI statistics only in this test VM, not in the shipped API.
const aiContext={module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(base+'ai.js','utf8').replace('const api = {','const api = { attackOutcomeStats,'),aiContext);
const AI=aiContext.module.exports;
function harness(factions={fed:'white-devil',zeon:'zeon'}){
 const state=E.setupGame(()=>.5,factions);state.board.forEach?.(()=>{});
 for(const h of Object.values(state.board))if(h&&typeof h==='object')h.elevation=0;
 state.garrisons=[];state.energy=[];state.upgrades=[];
 const c={D,E,state,mode:null,movementDraft:null,pendingAttack:null,lastDice:null,menuOpen:false,menuView:'main',
  Math:Object.create(Math),console,renderAll(){},addLog(){},playDamageFeedback(){},playPickupFeedback(){},playResolvedAttackFeedback(){},
  playCombatFeedback(){},closeModal(){},scheduleAiResolveMode(){},SFX:{dash(){}},isAiTeam:()=>false,
  teamMeta:()=>({short:'TEST'}),teamName:()=>'',queueHackingSystem(){},offerHackingSystem:(u,cb)=>cb?.(),
  openPostCombatResponses:(a,b,d,i,cb)=>cb?.(),offerOmegaPsycommuMove:(u,r,cb)=>cb?.(),
  finishDefeatedActiveActivation:()=>false,appendDiceRoll:(r,i,l,cb)=>cb(),showDiceRoll:(r,l,cb)=>cb(),
  activeUnit:()=>state.units.find(u=>u.id===state.activeUnitId),
  payTimeline:(u,n)=>{E.advanceUnitTimeline(state,u,n);state.activation.timelineSpent+=n;},
  useResponse(){},inHand:()=>false,isUsed:()=>false,getTactic:()=>({id:'iron-grip'}),
  canUseCommandAbility:()=>true,markCommandAbilityUsed(){},markCommand(){},
  grantUpgrade:(u,k,n)=>u.upgrades[k]+=n,
  showCard(){},offerNewtypeReroll:(a,b,w,r,cb)=>cb(),offerAnotherTimeline:(a,b,w,r,cb)=>cb(),
  resolveDisarmReroll:(a,b,w,r,cb)=>{E.resolveDisarmAttack(state,a,b,w,r,()=>.9);cb();},
  showAttackDiceRoll:(r,w,l,cb)=>cb(),offerFederationShield:(a,b,w,r,d,cb)=>cb(),
  resolveSplashDamage:()=>({units:[],garrisons:[]}),availablePostCombat:()=>[],
  applyDebuff:(u,k)=>{if(u.weapons)u.statuses[k]=true;},
 };
 vm.createContext(c);
 c.load=(...names)=>{for(const name of names){const start=src.indexOf('  function '+name+'(');assert(start>=0,name);let end=src.indexOf('\n  function ',start+1);const asyncEnd=src.indexOf('\n  async function ',start+1);if(asyncEnd>=0&&asyncEnd<end)end=asyncEnd;vm.runInContext(src.slice(start,end),c);}};
 c.unit=(id,q,r,hp)=>{const u=state.units.find(u=>u.id===id);assert(u,id);Object.assign(u,{q,r,zone:'board',hp:hp??u.maxHp});return u;};return c;
}
function found(name,run){try{run();console.log('✓ '+name);}catch(e){console.error('✗ '+name+'\n'+e.stack);process.exitCode=1;}}
found('Disarmed Hero Vulcan grants no bonus dice and does not keep the dice overlay open',()=>{
 const c=harness();c.load('criticalEffectsActive','offerWeaponAfterRollEffect','keepVulcanDiceOpen');const a=c.unit('hero-gundam',0,0),d=c.unit('zaku-enforcer',0,1);a.statuses.disarm=true;const w=a.weapons[0];c.lastDice=E.rollAttack(c.state,a,d,w,()=>.9);const before=c.lastDice.dice.length;assert(!c.keepVulcanDiceOpen(w,c.lastDice));c.offerWeaponAfterRollEffect(a,d,w,()=>{});E.resolveDisarmAttack(c.state,a,d,w,c.lastDice,()=>.9);assert.equal(c.lastDice.dice.length,before);assert(c.lastDice.criticalEffectsDisabled);
});
found('Tail Blade vs Garrison enables Annihilate; Rex Claws alone does not',()=>{
 const c=harness();c.load('resolveGarrisonAttack','consumeCriticalOverdrive');const a=c.unit('barbatos-lupus-rex',0,0);c.state.activeUnitId=a.id;const g1={id:'g1',team:'zeon',q:0,r:1,hp:1};c.state.garrisons=[g1];c.playAttackTargetingFx=()=>{};c.resolveGarrisonAttack(a,g1,a.weapons[0]);assert(c.state.activation.actionUsed);assert.equal(!!a.attackedWithTailBlade,false);
 c.state.activation.actionUsed=false;const g2={id:'g2',team:'zeon',q:1,r:0,hp:1};c.state.garrisons=[g2];c.beginPullToward=(attacker,defender,cb)=>cb();c.resolveGarrisonAttack(a,g2,a.weapons[1]);assert.equal(a.attackedWithTailBlade,true);
});

found('Tail Blade vs Unit enables Annihilate as soon as the attack is committed',()=>{
 const c=harness();c.load('resolveAttack','consumeCriticalOverdrive');const a=c.unit('barbatos-lupus-rex',0,0),d=c.unit('zaku-enforcer',0,2);c.state.activeUnitId=a.id;c.beginPullToward=()=>true;c.resolveAttack(a,d,a.weapons[1]);assert.equal(a.attackedWithTailBlade,true);assert.equal(c.state.activation.actionUsed,true);
});
found('Push collects Energy at its destination',()=>{
 const c=harness();c.load('beginPushDirection','afterUnitMove','resolveMovementResponses');const a=c.unit('hero-gundam',0,0),d=c.unit('zaku-line',0,1);const option=E.pushDirectionOptions(c.state,a,d).find(o=>E.forcedPushStep(c.state,d,o.direction).type==='move');assert(option);c.state.energy=[{q:option.q,r:option.r}];c.beginPushDirection(a,d,1);c.mode.callback(option);assert.equal(d.energy,1);assert.equal(c.state.energy.length,0);assert.equal(d.q,option.q);assert.equal(d.r,option.r);
});
found('Drive Them Back stops damage after Collision defeats the target',()=>{
 const c=harness({fed:'zeon',zeon:'fed'});c.load('useCommandTactic','beginPushDirection','damageUnit');const a=c.unit('zaku-enforcer',0,0),d=c.unit('gundam',0,1,2);c.state.activeUnitId=a.id;const option=E.pushDirectionOptions(c.state,a,d)[0];c.unit('guncannon',option.q,option.r);c.startMove=(n,t,l,cb)=>cb(true);c.afterUnitMove=(u,t,cb)=>cb?.();c.selectEnemy=(u,r,l,cb)=>{cb(d);return true;};c.useCommandTactic({id:'drive-them-back'});c.mode.callback(option);assert.equal(d.zone,'reserve');assert.equal(d.hp,d.maxHp);assert.equal(c.state.vp.fed,d.vp);
});
found('Human Char Kick defeats Enforcer before Iron Grip while paying Dash TL',()=>{
 const c=harness({fed:'rival',zeon:'zeon'});c.load('commitMovementDraft','resolveCharKickTarget','afterUnitMove','resolveMovementResponses','damageUnit');const a=c.unit('red-comet-zaku',0,1,3),d=c.unit('zaku-enforcer',0,2,1);const before=a.nextAt;c.state.activeUnitId=a.id;c.movementDraft={unitId:a.id,origin:{q:0,r:0,zone:'board'},cost:2,label:'Dash',movementType:'dash',primaryAction:true,charDash:true};c.inHand=()=>true;c.openResponse=(cards,cb)=>cb(cards[0]);c.finishDefeatedActiveActivation=u=>u.zone==='reserve';c.resolveCharKickTarget(a,d);assert.equal(a.zone,'board');assert.equal(a.hp,3);assert.equal(d.zone,'reserve');assert.equal(a.nextAt,before+2);
});
found('Epic Shot excludes blocked allies and includes visible allies in engine and AI',()=>{
 const c=harness();const a=c.unit('hero-gundam',0,0),ally=c.unit('wing-zero-ew',0,2),d=c.unit('zaku-enforcer',1,0);c.state.board[E.key(0,1)].elevation=2;assert(!E.hasLineOfSight(c.state,a,ally));const w=D.tactics.find(x=>x.id==='epic-shot').weapon;assert.equal(E.rollAttack(c.state,a,d,w,()=>.5).dice.length,7);assert.equal(AI.attackOutcomeStats(c.state,a,d,w,E).dice,7);c.state.board[E.key(0,1)].elevation=0;assert.equal(E.rollAttack(c.state,a,d,w,()=>.5).dice.length,9);assert.equal(AI.attackOutcomeStats(c.state,a,d,w,E).dice,9);
});
found('Disarmed Breast Fire retains adjacent Damage +2 but cannot inflict Fracture',()=>{
 const c=harness({fed:'secret',zeon:'fed'});c.load('sharedAoeDiceDisplay','resolveTwinBusterAttack','consumeCriticalOverdrive','criticalEffectsActive','reducedAttackDamage');const a=c.unit('mazinger-z',0,0),d=c.unit('gundam',0,1);c.state.activeUnitId=a.id;a.statuses.disarm=true;c.twinBusterTargets=()=>[d];c.E={...E,rollAttack:(s,a,d,w)=>E.rollAttack(s,a,d,w,()=>.9)};c.resolveTwinBusterAttack(a,a.weapons[1],0);assert.equal(d.hp,d.maxHp-8);assert.equal(d.statuses.fracture,false);
});
found('Reopening Dash preview then Back restores the action; a real action advances Timeline normally',()=>{
 const c=harness();c.load('beginAdjustableMovement','openMovementDraft','completeMove','commitMovementDraft','endActivation','clearActivationTemporaryEffects','cancelMovementDraft','handleAction');const a=c.unit('hero-gundam',0,0);c.state.activeUnitId=a.id;c.state.currentTick=2;a.nextAt=2;c.dashBonus=()=>0;c.resolveBlockedDeployment=()=>{};c.scheduleStartActivation=()=>{};c.attackTargetingBusy=false;
 c.beginAdjustableMovement(a,2,2,'Dash','dash',true);c.completeMove(0,1);assert(c.state.activation.actionUsed);c.openMovementDraft(a);
 // Run the Back button's cancellation callback rather than bypassing it.
 const onCancel=c.mode.onCancel;c.mode=null;if(onCancel)onCancel();assert.equal(c.movementDraft,null);assert.equal(c.state.activation.actionUsed,false);c.endActivation();assert.equal(c.state.activeUnitId,a.id);assert.equal(a.nextAt,2);c.handleAction('energize');c.endActivation();assert.equal(c.state.activeUnitId,null);assert.equal(a.nextAt,4);c.state.currentTick=4;c.state.resolvedThisTick.clear();assert.equal(E.chooseNextUnit(c.state).id,a.id);
});

found('Ordinary Vulcan still adds exactly 2 dice once; Disarm AI no longer budgets bonus dice',()=>{
 const c=harness();c.load('criticalEffectsActive','offerWeaponAfterRollEffect','keepVulcanDiceOpen');const a=c.unit('hero-gundam',0,0),d=c.unit('zaku-enforcer',0,1),w=a.weapons[0];c.lastDice=E.rollAttack(c.state,a,d,w,()=>.9);assert(c.keepVulcanDiceOpen(w,c.lastDice));c.offerWeaponAfterRollEffect(a,d,w,()=>{});assert.equal(c.lastDice.dice.length,5);c.offerWeaponAfterRollEffect(a,d,w,()=>{});assert.equal(c.lastDice.dice.length,5);
 a.statuses.disarm=true;const regular=AI.attackOutcomeStats(c.state,a,d,{...w,critical:null},E),vulcan=AI.attackOutcomeStats(c.state,a,d,w,E);assert(Math.abs(regular.expectedIncoming-vulcan.expectedIncoming)<1e-9);
});

found('Disarm reroll creating a Critical still cannot add Vulcan dice',()=>{
 const c=harness();c.load('criticalEffectsActive','offerWeaponAfterRollEffect');const a=c.unit('hero-gundam',0,0),d=c.unit('zaku-enforcer',0,1),w=a.weapons[0];a.statuses.disarm=true;c.lastDice=E.rollAttack(c.state,a,d,w,()=>.4);c.offerWeaponAfterRollEffect(a,d,w,()=>{});E.resolveDisarmAttack(c.state,a,d,w,c.lastDice,()=>.9);c.offerWeaponAfterRollEffect(a,d,w,()=>{});assert.equal(c.lastDice.dice.length,3);assert.equal(c.lastDice.criticals,3);
});

found('Surviving shielded Enforcer may use Iron Grip after Char Kick',()=>{
 const c=harness({fed:'rival',zeon:'zeon'});c.load('commitMovementDraft','resolveCharKickTarget','afterUnitMove','resolveMovementResponses','damageUnit');const a=c.unit('red-comet-zaku',0,1,3),d=c.unit('zaku-enforcer',0,2,1);d.upgrades.shield=1;c.state.activeUnitId=a.id;c.movementDraft={unitId:a.id,origin:{q:0,r:0,zone:'board'},cost:2,label:'Dash',movementType:'dash',primaryAction:true,charDash:true};let responses=0;c.inHand=()=>true;c.openResponse=(cards,cb)=>{responses++;assert.equal(d.inactiveShields,1);cb(cards[0]);};c.finishDefeatedActiveActivation=u=>u.zone==='reserve';c.resolveCharKickTarget(a,d);assert.equal(responses,1);assert.equal(a.zone,'reserve');assert.equal(d.zone,'board');assert.equal(d.hp,1);
});

found('Char Kick against a Garrison precedes movement Responses and runs its follow-up once',()=>{
 const c=harness({fed:'rival',zeon:'zeon'});c.load('commitMovementDraft','resolveCharKickGarrisonTarget','afterUnitMove','damageGarrison');const a=c.unit('red-comet-zaku',0,1);c.state.activeUnitId=a.id;const g={id:'enemy-garrison',team:'zeon',q:0,r:2,hp:1};c.state.garrisons=[g];let continued=0;const events=[];c.movementDraft={unitId:a.id,origin:{q:0,r:0,zone:'board'},cost:0,label:'Critical Dash',movementType:'dash',primaryAction:false,charDash:true,afterEffects:()=>{continued++;events.push('follow-up');}};const before=a.nextAt;c.resolveMovementResponses=(u,t,cb)=>{assert.equal(c.state.garrisons.length,0);events.push('response');cb();};c.resolveCharKickGarrisonTarget(a,g);assert.equal(c.state.vp.fed,2);assert.equal(a.nextAt,before);assert.equal(c.state.activation.actionUsed,false);assert.equal(continued,1);assert.deepEqual(events,['response','follow-up']);
});

found('Pull collects a Shield Upgrade before its movement Response',()=>{
 const c=harness();c.load('beginPullToward','afterUnitMove','resolveMovementResponses');const a=c.unit('hero-gundam',0,0),d=c.unit('zaku-line',0,2);const o=E.pullDirectionOptions(c.state,a,d)[0];assert(o);c.state.upgrades=[{q:o.q,r:o.r,type:'shield'}];let count=0;c.resolveMovementResponses=(u,t,cb)=>{assert.equal(u.upgrades.shield,1);count++;cb?.();};c.beginPullToward(a,d,()=>{});c.mode.callback(o);assert.equal(d.upgrades.shield,1);assert.equal(c.state.upgrades.length,0);assert.equal(count,1);
});

found('Push 0 and Pull 0 do not collect items or trigger movement Responses',()=>{
 for(const kind of ['push','pull']){const c=harness();c.load('beginPushDirection','beginPullToward','afterUnitMove');const a=c.unit('hero-gundam',0,0),d=c.unit('zaku-line',0,2);c.state.energy=[{q:d.q,r:d.r}];c.resolveMovementResponses=()=>{throw Error('zero movement triggered Response');};if(kind==='push')c.beginPushDirection(a,d,2);else c.beginPullToward(a,d);c.mode.stopCallback();assert.equal(d.energy,0);assert.equal(c.state.energy.length,1);}
});

found('Push collects only at the final hex, not a hex passed through',()=>{
 const c=harness();c.load('beginPushDirection','afterUnitMove','resolveMovementResponses');const a=c.unit('hero-gundam',0,0),d=c.unit('zaku-line',0,1);c.state.energy=[{q:0,r:2}];c.state.upgrades=[{q:0,r:3,type:'strength'}];c.beginPushDirection(a,d,2);c.mode.callback(c.mode.pushOptions.find(o=>o.q===0&&o.r===2));assert.equal(d.energy,0);c.mode.callback(c.mode.pushOptions.find(o=>o.q===0&&o.r===3));assert.equal(d.energy,0);assert.equal(c.state.energy.length,1);assert.equal(d.upgrades.strength,1);
});

found('Drive Them Back still deals its extra damage if Collision is survived',()=>{
 const c=harness({fed:'zeon',zeon:'fed'});c.load('useCommandTactic','beginPushDirection','damageUnit');const a=c.unit('zaku-enforcer',0,0),d=c.unit('gundam',0,1,4);c.state.activeUnitId=a.id;const option=E.pushDirectionOptions(c.state,a,d)[0];c.unit('guncannon',option.q,option.r);c.startMove=(n,t,l,cb)=>cb(true);c.afterUnitMove=(u,t,cb)=>cb?.();c.selectEnemy=(u,r,l,cb)=>{cb(d);return true;};c.useCommandTactic({id:'drive-them-back'});c.mode.callback(option);assert.equal(d.zone,'board');assert.equal(d.hp,1);
});

found('Tail Blade Garrison attack permits a legal Annihilate follow-up with its Energy cost',()=>{
 const c=harness();c.load('resolveGarrisonAttack','consumeCriticalOverdrive','useUnitAbility');const a=c.unit('barbatos-lupus-rex',0,0);c.unit('zaku-enforcer',0,1);c.state.activeUnitId=a.id;a.energy=1;const g={id:'g',team:'zeon',q:1,r:0,hp:1};c.state.garrisons=[g];c.playAttackTargetingFx=()=>{};c.beginPullToward=(attacker,defender,cb)=>cb();c.resolveGarrisonAttack(a,g,a.weapons[1]);let followups=0;c.beginAttack=(w,o)=>{assert.equal(w.id,'rex-claws');assert(o.free);assert(o.required);followups++;};c.useUnitAbility(a);assert.equal(a.energy,0);assert.equal(followups,1);
});

found('Shared Disarm calculation preserves ordinary bonuses and suppresses only weapon Criticals',()=>{
 const c=harness({fed:'secret',zeon:'fed'});const a=c.unit('mazinger-z',0,0),d=c.unit('gundam',0,1);const w={...a.weapons[1],critical:'damage2',criticalOverdrivePerCrit:1};const r=E.attackResultFromDice(c.state,a,d,w,[10,10,1],{criticalEffectsDisabled:true});assert.equal(r.damage,6);assert.equal(r.criticals,2);const enabled=E.attackResultFromDice(c.state,a,d,w,[10,10,1]);assert.equal(enabled.damage,8);
});


found('Attack-prep Commands do not spend Energy after no attack remains',()=>{
 const c=harness();
 c.load('commandUsageMap','commandAbilityUsed','hasPendingAttackOpportunity','attackPrepCommandExpired','canUseCommandAbility','useUnitAbility');
 c.state.activation.actionUsed=true;
 const prep=[
  {id:'wing-zero-ew',team:'fed',energy:1,command:{id:'full-power',energy:1,name:'Full Power'}},
  {id:'red-comet-zaku',team:'fed',energy:1,command:{id:'checkmate',energy:1,name:'Checkmate'}},
  {id:'mazinger-z',team:'fed',energy:1,command:{id:'mazin-power',energy:1,name:'Mazin Power'}},
  {id:'gquuuuuux',team:'fed',energy:1,command:{id:'machu-kira-kira',energy:1,name:'Machu Kira Kira'}},
  {id:'gfred',team:'fed',energy:1,command:{id:'nyaan-focus',energy:1,name:'Nyaan Focus'}}
 ];
 for(const unit of prep)assert.equal(c.canUseCommandAbility(unit,unit.command),false,unit.command.id);
 const wing=c.unit('wing-zero-ew',0,0);wing.energy=1;c.state.activeUnitId=wing.id;
 const before=wing.energy;c.useUnitAbility(wing);assert.equal(wing.energy,before);assert.equal(c.state.activation.commandUsed['full-power'],undefined);
 c.state.activation.actionUsed=false;assert.equal(c.canUseCommandAbility(wing,wing.command),true);
});

found('Checkmate stays available when Crimson Execution still provides a free attack',()=>{
 const c=harness({fed:'rival',zeon:'zeon'});
 c.load('commandUsageMap','commandAbilityUsed','hasPendingAttackOpportunity','attackPrepCommandExpired','canUseCommandAbility');
 const red=c.unit('red-comet-zaku',0,0);red.energy=1;c.state.activeUnitId=red.id;c.state.activation.actionUsed=true;
 c.state.hands.fed=['crimson-execution'];c.state.activation.tacticUsed.fed=false;c.state.usedTactics.delete('fed:crimson-execution');
 assert.equal(c.canUseCommandAbility(red,red.command),true);
 c.state.activation.tacticUsed.fed=true;assert.equal(c.canUseCommandAbility(red,red.command),false);
});

(function (root) {
  "use strict";

  const units = [
    {
      id: "gundam", team: "fed", name: "Gundam", model: "RX-78-2", role: "The Battle Begins",
      hp: 11, vp: 5, tl: 2, card: "assets/cards/card-001.jpg", portrait: "right",
      icon: "assets/icons/gundam.png",
      weapons: [
        { id: "beam-saber", name: "Beam Saber", timeline: 2, range: 1, strength: 2, effect: "shieldBreak", critical: "gainStrength", criticalTiming: "afterCombatDamage" },
        { id: "beam-rifle", name: "Beam Rifle", timeline: 4, range: 4, strength: 5, critical: "damage2" }
      ],
      command: { id: "white-base-unity", name: "White Base Unity", energy: 1, text: "เลือก Unit ฝ่ายเดียวกันใน Range 3 ที่มี Upgrade ไม่เกิน 1 ชิ้น แล้วเลือกมอบ Upgrade 1 ชิ้น" },
      ongoing: { name: "Newtype Instincts", text: "หลัง Attack Roll เมื่อ Gundam เป็นฝ่ายโจมตี อาจเลือกทอยลูกเต๋าที่พลาดใหม่ได้ 1 ลูก" }
    },
    {
      id: "guncannon", team: "fed", name: "Guncannon", model: "RX-77-2", role: "Rookie Artillery",
      hp: 10, vp: 4, tl: 2, card: "assets/cards/card-000.jpg", portrait: "right",
      icon: "assets/icons/guncannon.png",
      weapons: [
        { id: "gc-rifle", name: "Beam Rifle", timeline: 2, range: 3, strength: 2, critical: "slow" },
        { id: "low-recoil-240", name: "240mm Low-Recoil Cannon", timeline: 3, range: 3, strength: 4, critical: "dashRescueTimeline0", criticalTiming: "afterCombatDamage" }
      ],
      command: { id: "critical-shot", name: "Critical Shot", energy: 1, text: "ให้ศัตรูในระยะ 3 ติด Fracture" },
      ongoing: { name: "Federation Courage", text: "เมื่อมีอัปเกรด 2 ชิ้นขึ้นไป ผล 7–8 เป็น Critical" }
    },
    {
      id: "guntank", team: "fed", name: "Guntank", model: "RX-75", role: "Tanks Deploy",
      hp: 9, vp: 3, tl: 3, card: "assets/cards/card-002.jpg", portrait: "right",
      icon: "assets/icons/guntank.png",
      weapons: [
        { id: "bop-missile", name: "Quadruple Bop Missile", timeline: 2, range: 3, strength: 2, effect: "objectiveBonus", critical: "fracture", criticalTiming: "afterCombatDamage" },
        { id: "low-recoil-120", name: "120mm Low-Recoil Cannon", timeline: 4, range: 4, strength: 4, ignoreLos: true, critical: "slow" }
      ],
      command: { id: "saturated-fire", name: "Saturated Fire", energy: 1, text: "ทอย 5 ลูก; ทุก Critical สร้าง Damage 1 แก่ศัตรูทุกตัวในระยะ 4" },
      ongoing: { name: "Targeted Shot", text: "เมื่อมีอัปเกรด 2 ชิ้นขึ้นไป ได้ Accuracy +1" }
    },
    {
      id: "chars-zaku", team: "zeon", name: "Char’s Zaku II", model: "MS-06S", role: "The Red Rival",
      hp: 8, vp: 5, tl: 1, card: "assets/cards/card-003.jpg", portrait: "right", weaponBadge: "AXE",
      icon: "assets/icons/chars-zaku.png",
      weapons: [
        { id: "char-heat-hawk", name: "Heat Hawk", timeline: 2, range: 1, strength: 3, critical: "fracture", criticalTiming: "afterCombatDamage" },
        { id: "char-machine-gun", name: "Machine Gun", timeline: 3, range: 2, strength: 5, critical: "dashTimeline0", criticalTiming: "afterCombatDamage" }
      ],
      command: { id: "burst-attack", name: "Burst Attack", energy: 1, text: "โจมตีด้วย Heat Hawk โดยใช้ Timeline 0" },
      ongoing: { name: "Three Times Faster", text: "เมื่อ Dash สามารถเคลื่อนที่เพิ่มได้อีก 1 ช่อง" },
      response: { name: "Char Kick", text: "หลัง Dash สร้าง Damage 1 แก่ Unit ศัตรูหรือ Garrison ศัตรูที่อยู่ติดกัน" }
    },
    {
      id: "zaku-line", team: "zeon", name: "Zaku II", model: "MS-06", role: "Line Breaker",
      hp: 9, vp: 4, tl: 2, card: "assets/cards/card-004.jpg", portrait: "right", weaponBadge: "BZK",
      icon: "assets/icons/zaku-bazooka.png",
      weapons: [
        { id: "cracker-grenade", name: "Cracker Grenade", timeline: 2, range: 3, strength: 2, effect: "splash", critical: "splashDamage1" },
        { id: "bazooka", name: "Bazooka", timeline: 3, range: 3, strength: 4, critical: "rescuedGarrisonDamage" }
      ],
      command: { id: "zeon-zealotry", name: "Zeon Zealotry", energy: 1, text: "เคลื่อนที่สูงสุด 5 ช่องเข้าหา Unit ศัตรูที่มี Damage โดยไม่สนใจผลของภูมิประเทศ" },
      response: { name: "Rescue the Mechanics", text: "หลัง Zaku II ช่วยเหลือ Garrison สำเร็จ อาจซ่อมแซม Damage 2 ให้ Unit ฝ่ายเรา 1 ตัว" }
    },
    {
      id: "zaku-enforcer", team: "zeon", name: "Zaku II", model: "MS-06", role: "Enforcer",
      hp: 11, vp: 4, tl: 2, card: "assets/cards/card-005.jpg", portrait: "right", weaponBadge: "AXE",
      icon: "assets/icons/zaku-heat-hawk.png",
      weapons: [
        { id: "shoulder-bash", name: "Shoulder Bash", timeline: 2, range: 1, strength: 3, critical: "push2" },
        { id: "enforcer-heat-hawk", name: "Heat Hawk", timeline: 4, range: 1, strength: 5, effect: "destroyUpgrade", critical: "slow" }
      ],
      command: { id: "domination", name: "Domination", energy: 1, text: "ยึด Objective ที่อยู่บนช่องเดียวกันหรือช่องติดกัน" },
      ongoing: { name: "Suppressing Presence", text: "ได้ Strength +1 เมื่อโจมตี Unit ศัตรูที่มี Damage อยู่แล้ว" }
    },
    {
      id: "wing-zero-ew", team: "white-devil", name: "Wing Gundam Zero [EW]", model: "XXXG-00W0", role: "Wing of Destruction",
      hp: 12, vp: 9, tl: 3, card: "assets/cards/unit-wing-gundam-zero.jpg", portrait: "right",
      icon: "assets/icons/icon-wing-gundam-zero.png",
      weapons: [
        { id: "wing-beam-saber", name: "Beam Saber", timeline: 2, range: 1, strength: 4, critical: "move2IgnoreEngagement", criticalTiming: "afterCombatDamage" },
        { id: "twin-buster-rifle", name: "Twin Buster Rifle", timeline: 4, range: "SP", strength: 6, aoe: "twinBuster", critical: "criticalDamageUpTo4" }
      ],
      command: { id: "full-power", name: "Full Power", energy: 1, text: "ได้รับ Strength +3 จนจบ Activation นี้" },
      ongoing: { name: "Zero System", text: "ผลทอย 7 และ 8 เป็น Critical" },
      ongoing2: { name: "Hover", text: "ไม่สนใจผลของภูมิประเทศระหว่างการเคลื่อนที่" }
    },
    {
      id: "gundam-vidar", team: "rival", name: "Gundam Vidar", model: "ASW-G-XX", role: "Hunter of the Guilty",
      hp: 13, vp: 7, tl: 1, card: "assets/cards/unit-gundam-vidar.jpg", portrait: "right",
      icon: "assets/icons/icon-gundam-vidar.png",
      weapons: [
        { id: "vidar-handgun", name: "Handgun", timeline: 3, range: 2, strength: 3, critical: "repeatAtTimeline0", criticalTiming: "afterCombatDamage" },
        { id: "buret-saber", name: "Buret Saber", timeline: 4, range: 1, strength: 8, critical: "damage2" }
      ],
      command: { id: "hunters-edge", name: "Hunter’s Edge", energy: 1, text: "ผลัก Unit ศัตรูที่อยู่ติดกันได้สูงสุด 2 ช่อง แล้วสร้าง Damage 1 ให้ Unit นั้น" },
      command2: { id: "alaya-type-e", name: "Alaya-Vijnana Type E System", energy: 0, text: "หากควบคุม Objective อย่างน้อย 2 จุด ได้ Move +2 และ Strength +1 ใน Activation นี้" }
    },
    {
      id: "barbatos-lupus-rex", team: "white-devil", name: "Gundam Barbatos Lupus Rex", model: "ASW-G-08", role: "Final Stand",
      hp: 17, vp: 10, tl: 2, card: "assets/cards/unit-gundam-barbatos-lupus-rex.jpg", portrait: "right",
      icon: "assets/icons/icon-gundam-barbatos-lupus-rex.png",
      weapons: [
        { id: "rex-claws", name: "Rex Claws", timeline: 2, range: 1, strength: 3, critical: "slow" },
        { id: "tail-blade", name: "Tail Blade", timeline: 4, range: 2, strength: 7, preAttack: "pull1", critical: "damage1" }
      ],
      command: { id: "annihilate", name: "Annihilate", energy: 1, text: "หากโจมตีด้วย Rex Claws ใน Activation นี้ โจมตีด้วย Rex Claws เพิ่มอีก 1 ครั้งที่ Timeline 0" },
      command2: { id: "alaya-exertion", name: "Alaya-Vijnana Exertion", energy: 0, text: "สร้าง Damage 3 ให้ยูนิตนี้เพื่อเคลื่อนที่ 2 ช่อง" },
      ongoing: { name: "Fight to the End", text: "เมื่อมี Damage 6 ขึ้นไป ได้ Strength +1 และเมื่อมี Damage 12 ขึ้นไป ได้ Strength เพิ่มอีก +1" }
    },
    {
      id: "hero-gundam", team: "white-devil", name: "Gundam [Hero of Side 7]", model: "RX-78-2", role: "Legendary Hero",
      hp: 15, vp: 8, tl: 2, card: "assets/cards/unit-hero-gundam.jpg", portrait: "right",
      icon: "assets/icons/icon-hero-gundam.png",
      weapons: [
        { id: "hero-vulcan", name: "Vulcan Cannons", timeline: 2, range: 2, strength: 3, critical: "extraDice2" },
        { id: "hero-beam-saber", name: "Beam Saber", timeline: 3, range: 1, strength: 6, effect: "disableAllShields", critical: "damage2" }
      ],
      command: { id: "frenzied-charge", name: "Frenzied Charge", energy: 1, text: "เคลื่อนที่ 2 ช่อง; Beam Saber ได้ Strength +1 ใน Activation นี้ ต่อ Garrison ทุก 1 อันที่ฝ่ายเราช่วยเหลือไว้" },
      response: { name: "Escape from Side 7", text: "หลังช่วยเหลือ Garrison สำเร็จ ได้รับ Energy 1" }
    },
    {
      id: "red-comet-zaku", team: "rival", name: "Char’s Zaku II [Red Comet]", model: "MS-06S", role: "The Red Comet",
      hp: 12, vp: 7, tl: 2, card: "assets/cards/unit-red-comet-zaku.jpg", portrait: "right", weaponBadge: "AXE",
      icon: "assets/icons/icon-red-comet-zaku.png",
      weapons: [
        { id: "red-comet-heat-hawk", name: "Heat Hawk", timeline: 2, range: 1, strength: 4, critical: "fracture", criticalTiming: "afterCombatDamage" },
        { id: "red-comet-bazooka", name: "Bazooka", timeline: 4, range: 4, strength: 7, critical: "dashTimeline0", criticalTiming: "afterCombatDamage" }
      ],
      command: { id: "checkmate", name: "Checkmate", energy: 1, text: "ได้รับ Accuracy +2 ใน Activation นี้; หลังโจมตีทำลาย Upgrade 1 ชิ้นบนเป้าหมาย" },
      ongoing: { name: "Three Times Faster", text: "เมื่อ Dash สามารถเคลื่อนที่เพิ่มได้อีก 1 ช่อง" },
      response: { name: "Char Kick", text: "หลัง Dash สร้าง Damage 1 แก่ Unit ศัตรูหรือ Garrison ศัตรูที่อยู่ติดกัน" }
    },
    {
      id: "gundam-epyon", team: "rival", name: "Gundam Epyon", model: "OZ-13MS", role: "Crimson Cataclysm",
      hp: 15, vp: 9, tl: 3, card: "assets/cards/unit-gundam-epyon.jpg", portrait: "right",
      icon: "assets/icons/icon-gundam-epyon.png",
      weapons: [
        { id: "epyon-heat-rod", name: "Heat Rod", timeline: 2, range: 2, strength: 3, preAttack: "pull1", critical: "disarm" },
        { id: "epyon-beam-sword", name: "Beam Sword", timeline: 3, range: 1, strength: 7, critical: "damage2" }
      ],
      command: { id: "no-escape", name: "No Escape", energy: 1, text: "เลือก Unit ศัตรูภายใน Range 2 ให้ติด Slow" },
      ongoing: { name: "Exploit Weakness", text: "ได้ Strength +2 เมื่อโจมตี Unit ศัตรูที่มีสถานะผิดปกติ" },
      ongoing2: { name: "Hover", text: "ไม่สนใจผลของภูมิประเทศระหว่างการเคลื่อนที่" }
    },
    {
      id: "eva-01", team: "secret", name: "EVA-01", model: "EVA-01", role: "Berserk Test Type",
      hp: 12, vp: 9, tl: 3, card: "assets/cards/unit-eva-01.jpg", portrait: "right",
      icon: "assets/icons/icon-eva-01.png",
      weapons: [
        { id: "progressive-knife", name: "Progressive Knife", timeline: 3, range: 1, strength: 3, critical: "fractureRepeatTimeline0", criticalTiming: "afterCombatDamage" },
        { id: "positron-rifle", name: "Positron Rifle", timeline: 4, range: 5, strength: 8, critical: "slow" }
      ],
      command: { id: "at-field", name: "AT Field", energy: 1, text: "หากไม่มี Shield Upgrade ได้รับ Shield Upgrade 1" },
      ongoing: { name: "Don’t Run Away", text: "ยูนิตนี้จะไม่ถูก Engaged" }
    },
    {
      id: "mazinger-z", team: "secret", name: "Mazinger Z", model: "MAZINGER Z", role: "Invincible Super Robot",
      hp: 17, vp: 10, tl: 4, card: "assets/cards/unit-mazinger-z.jpg", portrait: "right",
      icon: "assets/icons/icon-mazinger-z.png",
      weapons: [
        { id: "rocket-punch", name: "Rocket Punch", timeline: 2, range: 3, strength: 3, ignoreLos: true, critical: "damage2" },
        { id: "breast-fire", name: "Breast Fire", timeline: 4, range: "SP", strength: 6, aoe: "breastFire", effect: "adjacentDamage2", critical: "fracture" }
      ],
      command: { id: "mazin-power", name: "Mazin Power", energy: 1, text: "ผลทอย 6–8 เป็น Critical ใน Activation นี้" },
      ongoing: { name: "Super Alloy Z", text: "เมื่อ Deploy จาก Base ได้รับ Shield Upgrade 1 ทุกครั้ง" }
    },
    {
      id: "mechazawa", team: "secret", name: "Mechazawa", model: "MECHAZAWA", role: "Steel Delinquent",
      hp: 10, vp: 4, tl: 1, card: "assets/cards/unit-mechazawa-beta04.jpg", portrait: "right",
      icon: "assets/icons/icon-mechazawa.png",
      weapons: [
        { id: "mechazawa-drill", name: "Drill", timeline: 2, range: 1, strength: 3, critical: "push1Slow" },
        { id: "laser-eyes", name: "Laser Eyes", timeline: 3, range: 3, strength: 4, critical: "push1Slow" }
      ],
      command: { id: "motorcycle", name: "Motorcycle", energy: 1, text: "เคลื่อนที่ได้อีกสูงสุด 2 ช่อง แม้จะ Move หรือ Dash ไปแล้ว" },
      response: { name: "Hacking System", text: "เมื่อ Mechazawa ทำลาย Garrison ศัตรูหรือช่วยเหลือ Garrison ฝ่ายเรา ซ่อม Damage 1 ให้ Unit ฝ่ายเรา 1 ตัวต่อ Garrison" }
    },
    {
      id: "gquuuuuux", team: "gqx", name: "GQuuuuuuX", model: "gMS-Ω", role: "Machu's Kira-Kira",
      hp: 13, vp: 8, tl: 2, card: "assets/cards/unit-gquuuuuux.jpg", portrait: "right",
      icon: "assets/icons/icon-gquuuuuux.png",
      ignoreForcedCollisionDamage: true, omegaPsycommuMove: 2,
      weapons: [
        { id: "gqx-heat-hawk", name: "Tomenosuke Heat Hawk", timeline: 2, range: 1, strength: 5, critical: "damage1" },
        { id: "gqx-vulcan", name: "Vulcan Guns", timeline: 2, range: 2, strength: 3, critical: "slow" }
      ],
      command: { id: "machu-kira-kira", name: "Machu Kira Kira", energy: 1, text: "ได้รับ Strength +2 จนจบ Activation" },
      ongoing: { name: "High Mobility Frame", text: "ไม่รับ Collision Damage ที่เกิดจาก Push หรือ Pull แต่ยังถูก Push/Pull และเคลื่อนตำแหน่งตามปกติ" },
      ongoing2: { name: "Omega Psycommu Active", text: "หลัง Resolve การโจมตี หากมี Critical อย่างน้อย 1 ลูก Move ได้สูงสุด 2 ช่อง" }
    },
    {
      id: "gfred", team: "gqx", name: "GFreD", model: "gMS-κ", role: "Nyaan's Psycommu",
      hp: 12, vp: 8, tl: 3, card: "assets/cards/unit-gfred.jpg", portrait: "right",
      icon: "assets/icons/icon-gfred.png",
      ignoreForcedCollisionDamage: true, omegaPsycommuMove: 1,
      weapons: [
        { id: "gfred-luna", name: "ES Bits — Luna", timeline: 2, range: 4, strength: 4, ignoreLos: true, critical: "slow" },
        { id: "gfred-artemis", name: "ES Bits — Artemis", timeline: 3, range: 5, strength: 5, ignoreLos: true, critical: "damage2" }
      ],
      command: { id: "nyaan-focus", name: "Nyaan Focus", energy: 1, text: "ได้รับ Accuracy +1 และผล 8 ถือเป็น Critical จนจบ Activation" },
      ongoing: { name: "High Mobility Frame", text: "ไม่รับ Collision Damage ที่เกิดจาก Push หรือ Pull แต่ยังถูก Push/Pull ตามปกติ" },
      ongoing2: { name: "Omega Psycommu Active", text: "หลัง Resolve การโจมตี หากมี Critical อย่างน้อย 1 ลูก Move ได้สูงสุด 1 ช่อง" }
    },
    {
      id: "red-gundam", team: "gqx", name: "Red Gundam", model: "RX-78-02", role: "Shuji's Red Gundam",
      hp: 13, vp: 8, tl: 1, card: "assets/cards/unit-red-gundam.jpg", portrait: "right",
      icon: "assets/icons/icon-red-gundam.png", dashBonus: 1,
      weapons: [
        { id: "red-gundam-beam-saber", name: "Beam Saber", timeline: 2, range: 1, strength: 3, critical: "damage2" },
        { id: "red-gundam-bits", name: "Bits", timeline: 3, range: 4, strength: 5, critical: "disarm" }
      ],
      ongoing: { name: "Three Times Faster", text: "เมื่อใช้ Dash สามารถเคลื่อนที่เพิ่มได้อีก 1 ช่อง" },
      response: { name: "Shuji Kick", text: "หลัง Dash เลือก Unit ศัตรูที่อยู่ติดกัน 1 ตัว (ใช้กับ Garrison ไม่ได้) แล้ว Push up to 1" }
    }
  ];

  const tactics = [
    { id: "built-to-last", team: "fed", name: "Built to Last", timing: "COMMAND", card: "assets/cards/tactic-built-to-last.jpg", text: "ซ่อมแซม Unit ที่กำลังใช้งาน Damage 1 ต่อ Upgrade Token ทุก 1 อันที่ติดอยู่บน Unit นั้น" },
    { id: "entrenched-position", team: "fed", name: "Entrenched Position", timing: "COMMAND", card: "assets/cards/tactic-entrenched-position.jpg", text: "Guntank ได้รับ Shield Upgrade 1 จากนั้นยึด Objective ที่ตัวเองยืนอยู่หรือ Objective ที่อยู่ในช่องติดกันได้ทันที" },
    { id: "forward-artillery", team: "fed", name: "Forward Artillery Position", timing: "COMMAND", card: "assets/cards/tactic-forward-artillery.jpg", text: "Guncannon ได้รับ Energy 1 จากนั้นได้รับ Strength 1 ต่อ Garrison ทุก 1 อันที่ช่วยเหลือไว้; Strength นี้หมดเมื่อจบ Turn ของ Guncannon" },
    { id: "last-shot-counts", team: "fed", name: "Last Shot Counts", timing: "COMMAND", card: "assets/cards/tactic-last-shot-counts.jpg", text: "Gundam ได้รับ Strength Upgrade 1; การโจมตีของ Gundam ในครั้งนี้ใช้ Timeline -1 และถ้าทำลาย Unit ศัตรูได้ จะได้รับ Strength Upgrade เพิ่มอีก 1" },
    { id: "return-fire", team: "fed", name: "Return Fire", timing: "RESPONSE", trigger: "After Combat Damage", card: "assets/cards/tactic-return-fire.jpg", text: "หลังคำนวณ Damage และ Unit ฝ่ายป้องกันรอดจากการโจมตี Unit นั้นโจมตีกลับทันที โดยการโจมตีครั้งนี้ใช้ Timeline -1" },
    { id: "rookies-momentum", team: "fed", name: "Rookie’s Momentum", timing: "COMMAND", card: "assets/cards/tactic-rookies-momentum.jpg", text: "Unit ที่กำลังใช้งานได้รับ Strength 2 และการโจมตีของ Unit นั้นนับผลทอย 7 และ 8 เป็น Critical; เอฟเฟกต์ทั้งหมดหมดเมื่อจบ Turn ของ Unit นี้" },
    { id: "lock-down", team: "fed", name: "Lock Down the Perimeter", timing: "COMMAND", card: "assets/cards/tactic-lock-down.jpg", text: "Unit ที่กำลังใช้งานอาจทำลาย Upgrade Token 1 อันบน Unit ศัตรูภายใน Range 3 จากนั้นทำให้ Unit นั้นติด Slow" },
    { id: "shield-recovery", team: "fed", name: "Shield the Recovery", timing: "RESPONSE", trigger: "After Rescue", card: "assets/cards/tactic-shield-recovery.jpg", text: "หลัง Unit ฝ่ายเราช่วยเหลือ Garrison สำเร็จ Unit นั้นได้รับ Shield Upgrade 1" },
    { id: "federation-shield", team: "fed", name: "Earth Federation Shield", timing: "RESPONSE", trigger: "After Attack Roll", card: "assets/cards/tactic-federation-shield.jpg", text: "หลังฝ่ายตรงข้ามทอยลูกเต๋าโจมตีแล้ว ลด Damage ที่ Unit ฝ่ายเราจะได้รับจากการโจมตีครั้งนี้ลง 2" },
    { id: "rescued-extraction", team: "zeon", name: "Rescued Extraction", timing: "COMMAND", card: "assets/cards/tactic-rescued-extraction.jpg", text: "Zaku II: Line Breaker ช่วยเหลือ Garrison ฝ่ายเดียวกันภายใน Range 3 โดยใช้ Timeline 0 จากนั้น Zaku II ได้รับ Energy 1" },
    { id: "logistics-relay", team: "zeon", name: "Logistics Relay", timing: "RESPONSE", trigger: "After Rescue", card: "assets/cards/tactic-logistics-relay.jpg", text: "หลัง Unit ฝ่ายเราช่วยเหลือ Garrison สำเร็จ Unit นั้นได้รับ Speed Upgrade 1" },
    { id: "exploited-chaos", team: "zeon", name: "Exploited Chaos", timing: "RESPONSE", trigger: "After Combat Damage", card: "assets/cards/tactic-exploited-chaos.jpg", text: "เมื่อการโจมตีของ Unit ฝ่ายเราจบลง Unit ฝ่ายเราที่เป็นฝ่ายโจมตีได้รับ Energy 1 และ Strength Upgrade 1" },
    { id: "shattered-formation", team: "zeon", name: "Shattered Formation", timing: "RESPONSE", trigger: "After Combat Damage", card: "assets/cards/tactic-shattered-formation.jpg", text: "หลังรับ Combat Damage หาก Unit ฝ่ายเราที่เป็นฝ่ายป้องกันรอดจากการโจมตี จะสร้าง Damage 2 ให้กับผู้โจมตี" },
    { id: "drive-them-back", team: "zeon", name: "Drive Them Back", timing: "COMMAND", card: "assets/cards/tactic-drive-them-back.jpg", text: "Unit ที่กำลังใช้งานเคลื่อนที่เพิ่ม 2 ช่อง จากนั้นผลัก Unit ศัตรูที่อยู่ติดกัน 1 ช่องและสร้าง Damage 1 ให้ Unit นั้น" },
    { id: "iron-grip", team: "zeon", name: "Iron Grip", timing: "RESPONSE", trigger: "After Enemy Movement", card: "assets/cards/tactic-iron-grip.jpg", text: "เมื่อ Unit ศัตรูเคลื่อนที่มาหยุดอยู่ติดกับ Zaku II: Enforcer สร้าง Damage 3 แก่ศัตรูตัวนั้น" },
    { id: "sudden-pressure", team: "zeon", name: "Sudden Pressure", timing: "COMMAND", card: "assets/cards/tactic-sudden-pressure.jpg", text: "Unit ที่กำลังใช้งานสร้าง Damage 2 แก่ Unit ศัตรูทุกตัวและ Garrison ศัตรูทุกอันภายใน Range 3" },
    { id: "breaking-line", team: "zeon", name: "Breaking the Line", timing: "COMMAND", card: "assets/cards/tactic-breaking-line.jpg", text: "Unit ที่กำลังใช้งานอาจทำลาย Upgrade Token 1 อันบน Unit ศัตรูภายใน Range 3 จากนั้นทำให้ Unit นั้นติด Fracture" },
    { id: "crimson-execution", team: "zeon", sharedWith:["rival"], name: "Crimson Execution", timing: "COMMAND", card: "assets/cards/tactic-crimson-execution.jpg", text: "Char’s Zaku II ทำ Dash เพิ่ม 1 ครั้งโดยใช้ Timeline 0 จากนั้นโจมตีด้วย Heat Hawk เพิ่ม 1 ครั้งโดยใช้ Timeline 0" },
    { id: "renewed-power", team: "white-devil", sharedWith:["rival"], name: "Renewed Power", timing: "COMMAND", card: "assets/cards/tactic-renewed-power.jpg", text: "Unit ที่กำลัง Active ได้รับ Strength Upgrade 1" },
    { id: "sacrificial-overload", team: "white-devil", name: "Sacrificial Overload", timing: "RESPONSE", trigger: "After Combat Damage", card: "assets/cards/tactic-sacrificial-overload.jpg", text: "หลัง Wing Gundam Zero เป็นฝ่ายโจมตี สร้าง Damage 2 ให้ Wing Gundam Zero และเป้าหมายแต่ละตัว" },
    { id: "epic-shot", team: "white-devil", name: "Epic Shot", timing: "ATTACK", unitOnly: "hero-gundam", card: "assets/cards/tactic-epic-shot.jpg", text: "Gundam [Hero of Side 7] โจมตีด้วย Beam Rifle; Strength +2 ต่อ Unit ฝ่ายเดียวกันตัวอื่นใน Range 3 และ Critical Damage +2", weapon:{id:"epic-shot-beam-rifle",name:"Epic Shot · Beam Rifle",timeline:3,range:5,strength:7,effect:"heroAlliesStrength",critical:"damage2",tacticAttack:true} },
    { id: "war-edge", team: "rival", name: "War Edge", timing: "ATTACK", unitOnly: "gundam-epyon", card: "assets/cards/tactic-war-edge.jpg", text: "Gundam Epyon โจมตีด้วย Beam Sword แบบพื้นที่ SP; Critical Damage +1", weapon:{id:"war-edge-beam-sword",name:"War Edge · Beam Sword",timeline:3,range:"SP",strength:8,aoe:"warEdge",critical:"damage1",tacticAttack:true} },
    { id: "berserk", team: "secret", name: "Berserk", timing: "COMMAND", unitOnly: "eva-01", card: "assets/cards/tactic-berserk.jpg", text: "EVA-01 ที่มี HP มากกว่า 1 ลด HP เหลือ 1 แล้วได้รับ Speed +3, Strength +3 และ Shield +3; เมื่อถูกทำลายให้นำ Upgrade ทั้งหมดออก" },
    { id: "god-drill", team: "secret", name: "God Drill", timing: "ATTACK", unitOnly: "mechazawa", card: "assets/cards/tactic-god-drill.jpg", text: "Mechazawa โจมตีแบบพื้นที่ SP; Critical Damage +1 ต่อ Critical สูงสุด +4", weapon:{id:"god-drill-attack",name:"God Drill",timeline:4,range:"SP",strength:6,aoe:"godDrill",critical:"criticalDamageUpTo4",tacticAttack:true} },
    { id: "jet-scrander", team: "secret", name: "Jet Scrander", timing: "COMMAND", unitOnly: "mazinger-z", card: "assets/cards/tactic-jet-scrander.jpg", text: "Mazinger Z เคลื่อนที่ได้สูงสุด 5 ช่องเข้าหา Unit ศัตรู โดยไม่สนใจผลของภูมิประเทศ" },
    { id: "gundam-go", team: "gqx", name: "GUNDAM GO!", timing: "COMMAND", card: "assets/cards/tactic-gundam-go.jpg", text: "ยูนิตฝ่ายเดียวกันทุกตัวสามารถ Move up to 1" },
    { id: "kira-kira", team: "gqx", name: "KIRA KIRA!", timing: "COMMAND", card: "assets/cards/tactic-kira-kira.jpg", text: "ใช้ก่อนประกาศการโจมตี; สำหรับการโจมตีครั้งนี้ Damage +1 ต่อ Critical ทุก 1 ลูกที่ทอยได้ โดยไม่มีเพดาน" },
    { id: "another-timeline", team: "gqx", name: "Another Timeline", timing: "RESPONSE", trigger: "After Attack Roll", card: "assets/cards/tactic-another-timeline.jpg", text: "หลังทอย Attack Dice แต่ก่อน Resolve สามารถทอย Attack Dice ทั้งหมดใหม่ 1 ครั้ง และต้องใช้ผลจากการทอยครั้งใหม่ทั้งหมด" }
  ];

  // English reading aids only; these fields do not participate in game rules.
  const abilityEnglish = {
    "gundam": ["Choose an allied unit within Range 3 with no more than 1 Upgrade. Give it 1 Upgrade of your choice.", "After your Attack Roll, you may re-roll 1 die that missed."],
    "guncannon": ["Apply Fracture to an enemy within Range 3.", "While this unit has at least 2 Upgrades, rolls of 7 and 8 also count as Critical Hits."],
    "guntank": ["Roll 5 dice. For each Critical rolled, deal 1 damage to every enemy within Range 4.", "While this unit has at least 2 Upgrades, gain Accuracy +1."],
    "chars-zaku": ["Make an additional Heat Hawk attack at TL 0.", "When Dashing, you may move 1 additional hex.", "After Dashing, deal 1 damage to an adjacent enemy unit or enemy Garrison."],
    "zaku-line": ["Move up to 5 hexes toward a damaged enemy unit, ignoring terrain penalties.", "After this unit Rescues a Garrison, you may repair 2 damage on 1 allied unit."],
    "zaku-enforcer": ["Immediately capture an Objective on or adjacent to this unit's hex.", "Gain Strength +1 when attacking a damaged enemy unit."],
    "wing-zero-ew": ["Gain Strength +3 until the end of this activation.", "Rolls of 7 and 8 also count as Critical Hits.", "Ignore terrain and elevation penalties while moving."],
    "gundam-vidar": ["Push an adjacent enemy unit up to 2 hexes, then deal 1 damage to that unit.", "If you control at least 2 Objectives, gain Move +2 and Strength +1 for this activation."],
    "barbatos-lupus-rex": ["If this unit has attacked with Rex Claws during this activation, make 1 additional Rex Claws attack at TL 0.", "Deal 3 damage to this unit to move 2 hexes.", "While this unit has taken at least 6 damage, gain Strength +1. At 12 or more damage, gain another Strength +1."],
    "hero-gundam": ["Move 2 hexes. For this activation, Beam Saber gains Strength +1 for each Garrison your side has Rescued.", "After this unit Rescues a Garrison, gain 1 Energy."],
    "red-comet-zaku": ["Gain Accuracy +2 for this activation. After attacking, destroy 1 Upgrade on the target.", "When Dashing, you may move 1 additional hex.", "After Dashing, deal 1 damage to an adjacent enemy unit or enemy Garrison."],
    "gundam-epyon": ["Apply Slow to an enemy unit within Range 2.", "Gain Strength +2 when attacking an enemy unit with a status effect.", "Ignore terrain and elevation penalties while moving."],
    "eva-01": ["If this unit has no Shield Upgrades, gain 1 Shield Upgrade.", "This unit ignores Engagement."],
    "mazinger-z": ["Rolls of 6, 7 and 8 also count as Critical Hits for this activation.", "Each time this unit deploys from a Base, gain 1 Shield Upgrade."],
    "mechazawa": ["Move up to 2 additional hexes, even if this unit has already moved or Dashed.", "Whenever this unit destroys an enemy Garrison or Rescues an allied Garrison, repair 1 damage on 1 allied unit per Garrison."],
    "gquuuuuux": ["Gain Strength +2 until the end of this activation.", "Take no collision damage from Push or Pull. This unit can still be Pushed or Pulled normally.", "After resolving an attack with at least 1 Critical rolled, you may Move up to 2 hexes."],
    "gfred": ["Gain Accuracy +1 for this activation. Rolls of 8 also count as Critical Hits.", "Take no collision damage from Push or Pull. This unit can still be Pushed or Pulled normally.", "After resolving an attack with at least 1 Critical rolled, you may Move up to 1 hex."],
    "red-gundam": ["When Dashing, you may move 1 additional hex.", "After Dashing, choose 1 adjacent enemy unit and Push it up to 1 hex. Cannot target Garrisons."]
  };
  for (const unit of units) {
    const abilities = [unit.command, unit.command2, unit.ongoing, unit.ongoing2, unit.response].filter(Boolean);
    abilities.forEach((ability, index) => { ability.textEn = abilityEnglish[unit.id][index]; });
  }
  const tacticEnglish = {
    "built-to-last": "Repair 1 damage on the active unit for each Upgrade token it has.",
    "entrenched-position": "Guntank gains 1 Shield Upgrade, then immediately captures an Objective on or adjacent to its hex.",
    "forward-artillery": "Guncannon gains 1 Energy, then gains Strength +1 for each Garrison your side has Rescued, until the end of its activation.",
    "last-shot-counts": "Gundam gains 1 Strength Upgrade. Its next attack costs TL -1. If that attack defeats an enemy unit, gain 1 additional Strength Upgrade.",
    "return-fire": "After Combat Damage, if the defending allied unit survives, it immediately makes a counterattack at TL -1.",
    "rookies-momentum": "The active unit gains Strength +2, and rolls of 7 and 8 also count as Critical Hits, until the end of its activation.",
    "lock-down": "You may destroy 1 Upgrade on an enemy unit within Range 3 of the active unit, then apply Slow to that enemy unit.",
    "shield-recovery": "After an allied unit Rescues a Garrison, that unit gains 1 Shield Upgrade.",
    "federation-shield": "After the opponent's Attack Roll, reduce the damage an allied unit would take from that attack by 2.",
    "rescued-extraction": "Zaku II: Line Breaker Rescues an allied Garrison within Range 3 at TL 0, then gains 1 Energy.",
    "logistics-relay": "After an allied unit Rescues a Garrison, that unit gains 1 Speed Upgrade.",
    "exploited-chaos": "After an allied unit's attack resolves, the attacking unit gains 1 Energy and 1 Strength Upgrade.",
    "shattered-formation": "After Combat Damage, if the defending allied unit survives, it deals 2 damage to the attacker.",
    "drive-them-back": "The active unit moves 2 additional hexes, then Pushes an adjacent enemy unit up to 1 hex and deals 1 damage to that unit.",
    "iron-grip": "When an enemy unit ends a movement adjacent to Zaku II: Enforcer, deal 3 damage to that enemy unit.",
    "sudden-pressure": "The active unit deals 2 damage to every enemy unit and enemy Garrison within Range 3.",
    "breaking-line": "You may destroy 1 Upgrade on an enemy unit within Range 3 of the active unit, then apply Fracture to that enemy unit.",
    "crimson-execution": "Char's Zaku II makes 1 additional Dash at TL 0, then 1 additional Heat Hawk attack at TL 0.",
    "renewed-power": "The active unit gains 1 Strength Upgrade.",
    "sacrificial-overload": "After Wing Gundam Zero attacks, deal 2 damage to Wing Gundam Zero and each target.",
    "epic-shot": "Gundam [Hero of Side 7] makes a Beam Rifle attack: TL 3, Range 5, Strength 7. Gain Strength +2 per other allied unit within Range 3. Critical: Damage +2.",
    "war-edge": "Gundam Epyon makes a Beam Sword area attack using the SP pattern: TL 3, Strength 8. Critical: Damage +1.",
    "berserk": "If EVA-01 has more than 1 HP, reduce it to 1 HP, then gain 3 Speed, 3 Strength and 3 Shield Upgrades. When EVA-01 is defeated, remove all its Upgrades.",
    "god-drill": "Mechazawa makes an area attack using the SP pattern: TL 4, Strength 6. Critical: Damage +1 per Critical rolled, up to +4.",
    "jet-scrander": "Mazinger Z moves up to 5 hexes toward an enemy unit, ignoring terrain penalties.",
    "gundam-go": "Each allied unit may Move up to 1 hex.",
    "kira-kira": "Play before declaring an attack. For this attack, Damage +1 for each Critical rolled, with no maximum.",
    "another-timeline": "After your Attack Roll, before resolving it, you may re-roll the entire attack dice pool once. You must keep all of the new results."
  };
  tactics.forEach(card => { card.textEn = tacticEnglish[card.id]; });

  const featureCoordinates = {
    bases: [{ q: 7, r: 0, team: "zeon" }, { q: 7, r: 12, team: "fed" }],
    garrisons: {
      zeon: [[0,3],[13,3],[8,5],[3,6],[2,9],[11,9],[8,10]],
      fed: [[3,3],[6,3],[12,4],[11,6],[6,8],[1,10],[14,10]]
    },
    objectives: [[6,5],[1,6],[13,6],[8,8]],
    energy: [[12,5],[2,8]],
    upgrades: [[1,2],[11,2],[4,4],[7,6],[0,7],[14,6],[10,9],[3,10],[13,10]]
  };

  // Registered against the unobstructed Sleeping Leviathan terrain reference.
  // The terrain is rotationally symmetric around the center hex (7,6): dark crown = level 2, light mesas/ring = level 1.
  const elevation2 = [[7,5],[6,6],[7,6],[8,6],[6,7],[7,7],[8,7]];
  const elevation1 = [
    [1,2],[11,2],
    [1,3],[3,3],[4,3],[6,3],[10,3],
    [7,4],[12,4],
    [5,5],[6,5],[8,5],[9,5],[12,5],
    [3,6],[4,6],[5,6],[9,6],[10,6],[11,6],
    [4,7],[5,7],[9,7],[10,7],
    [2,8],[6,8],[7,8],[8,8],
    [2,9],[11,9],[13,9],
    [3,10],[4,10],[8,10],[10,10],[13,10]
  ];

  // Scenario data is intentionally separated from the renderer so new maps can be
  // added without duplicating combat logic. Sleeping Leviathan remains the default.
  const sleepingLeviathan = {
    id: "sleeping-leviathan", name: "Sleeping Leviathan", cols: 15, rows: 13,
    featureCoordinates, elevation1, elevation2, water: []
  };

  // Azure Fang reconstructed against the official board reference supplied for Beta14.
  // The printed board has 14 cells in even columns and 13 in odd columns; the seven
  // bottom odd-column coordinates are outside the physical board. Water is level 0
  // terrain, while every pink-marked/dark-green hill hex in the reference is level 1.
  const azureFangFeatures = {
    bases: [{ q: 14, r: 0, team: "zeon" }, { q: 0, r: 13, team: "fed" }],
    garrisons: {
      zeon: [[7,0],[0,5],[2,6],[7,5],[12,5],[3,10],[12,10],[9,12]],
      fed: [[5,0],[2,3],[11,2],[2,8],[7,7],[12,7],[14,8],[7,12]]
    },
    objectives: [[4,4],[8,5],[6,8],[10,9]],
    energy: [[2,7],[12,6]],
    upgrades: [[2,1],[7,2],[14,4],[5,5],[7,6],[9,7],[0,9],[7,10],[12,12]]
  };
  const azureFangWater = [
    [3,5],[3,6],[3,7],[3,8],
    [4,6],[4,7],[4,8],[4,9],
    [5,6],[5,7],[5,8],[5,9],
    [6,3],[6,4],[6,5],[6,6],[6,7],[6,8],[6,9],[6,10],
    [7,3],[7,4],[7,8],[7,9],
    [8,3],[8,4],[8,5],[8,6],[8,7],[8,8],[8,9],[8,10],
    [9,3],[9,4],[9,5],[9,6],
    [10,4],[10,5],[10,6],[10,7],
    [11,4],[11,5],[11,6],[11,7]
  ];
  const azureFangElevation1 = [
    [0,5],[0,6],[0,8],[0,9],[0,13],
    [2,1],[2,6],[2,7],[2,10],
    [3,4],[3,9],[3,10],
    [4,4],[4,10],
    [5,0],[5,3],
    [6,0],[6,1],
    [7,0],[7,2],[7,10],[7,12],
    [8,12],[8,13],
    [9,9],[9,12],
    [10,3],[10,9],
    [11,2],[11,3],[11,8],
    [12,3],[12,6],[12,7],[12,12],
    [14,0],[14,4],[14,5],[14,7],[14,8]
  ];
  const azureFangInvalidCells = [[1,13],[3,13],[5,13],[7,13],[9,13],[11,13],[13,13]];
  const azureFang = {
    id: "azure-fang", name: "Azure Fang", cols: 15, rows: 14, invalidCells: azureFangInvalidCells,
    featureCoordinates: azureFangFeatures, elevation1: azureFangElevation1, elevation2: [], water: azureFangWater
  };

  const maps = {
    "sleeping-leviathan": sleepingLeviathan,
    "azure-fang": azureFang
  };

  const data = {
    teams: {
      fed: { name: "Earth Federation", short: "E.F.S.F.", color: "#36b7ff", phaseTwoTacticDraw: 3 },
      zeon: { name: "Principality of Zeon", short: "ZEON", color: "#ff405a", phaseTwoTacticDraw: 3 },
      "white-devil": { name: "White Devil", short: "WHITE DEVIL", color: "#36b7ff", phaseTwoTacticDraw: 0 },
      rival: { name: "The Rival", short: "THE RIVAL", color: "#ff405a", phaseTwoTacticDraw: 0 },
      secret: { name: "Secret", short: "SECRET", color: "#36b7ff", phaseTwoTacticDraw: 0 },
      gqx: { name: "GQX", short: "GQX", color: "#bdf7ff", phaseTwoTacticDraw: 0 }
    },
    factionOrder: ["fed", "zeon", "white-devil", "rival", "secret", "gqx"],
    tacticDecks: {
      fed: ["built-to-last","entrenched-position","forward-artillery","last-shot-counts","return-fire","rookies-momentum","lock-down","shield-recovery","federation-shield"],
      zeon: ["rescued-extraction","logistics-relay","exploited-chaos","shattered-formation","drive-them-back","iron-grip","sudden-pressure","breaking-line","crimson-execution"],
      "white-devil": ["epic-shot","renewed-power","sacrificial-overload"],
      rival: ["war-edge","crimson-execution","renewed-power"],
      secret: ["berserk","god-drill","jet-scrander"],
      gqx: ["gundam-go","kira-kira","another-timeline"]
    },
    rules: {
      advance: { distance: 3, timeline: 0 },
      dash: { distance: 2, timeline: 2 },
      rescue: { timeline: 2, vp: 2 },
      movement: { garrisonsBlock: true },
      garrison: { defeatVp: 2 },
      objective: { phaseVp: 5 }
    },
    units,
    tactics,
    maps,
    map: sleepingLeviathan,
    mysteryPool: ["shield","shield","shield","shield","shield","speed","speed","speed","speed","speed","strength","strength","strength","strength","strength"]
  };

  root.GA_DATA = data;
  if (typeof module !== "undefined" && module.exports) module.exports = data;
})(typeof window !== "undefined" ? window : globalThis);

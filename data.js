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
    }
  ];

  const tactics = [
    { id: "built-to-last", team: "fed", name: "Built to Last", timing: "COMMAND", card: "assets/cards/tactic-built-to-last.png", text: "ซ่อมแซม Unit ที่กำลังใช้งาน Damage 1 ต่อ Upgrade Token ทุก 1 อันที่ติดอยู่บน Unit นั้น" },
    { id: "entrenched-position", team: "fed", name: "Entrenched Position", timing: "COMMAND", card: "assets/cards/tactic-entrenched-position.png", text: "Guntank ได้รับ Shield Upgrade 1 จากนั้นยึด Objective ที่ตัวเองยืนอยู่หรือ Objective ที่อยู่ในช่องติดกันได้ทันที" },
    { id: "forward-artillery", team: "fed", name: "Forward Artillery Position", timing: "COMMAND", card: "assets/cards/tactic-forward-artillery.png", text: "Guncannon ได้รับ Energy 1 จากนั้นได้รับ Strength 1 ต่อ Garrison ทุก 1 อันที่ช่วยเหลือไว้; Strength นี้หมดเมื่อจบ Turn ของ Guncannon" },
    { id: "last-shot-counts", team: "fed", name: "Last Shot Counts", timing: "COMMAND", card: "assets/cards/tactic-last-shot-counts.png", text: "Gundam ได้รับ Strength Upgrade 1; การโจมตีของ Gundam ในครั้งนี้ใช้ Timeline -1 และถ้าทำลาย Unit ศัตรูได้ จะได้รับ Strength Upgrade เพิ่มอีก 1" },
    { id: "return-fire", team: "fed", name: "Return Fire", timing: "RESPONSE", trigger: "After Combat Damage", card: "assets/cards/tactic-return-fire.png", text: "หลังคำนวณ Damage และ Unit ฝ่ายป้องกันรอดจากการโจมตี Unit นั้นโจมตีกลับทันที โดยการโจมตีครั้งนี้ใช้ Timeline -1" },
    { id: "rookies-momentum", team: "fed", name: "Rookie’s Momentum", timing: "COMMAND", card: "assets/cards/tactic-rookies-momentum.png", text: "Unit ที่กำลังใช้งานได้รับ Strength 2 และการโจมตีของ Unit นั้นนับผลทอย 7 และ 8 เป็น Critical; เอฟเฟกต์ทั้งหมดหมดเมื่อจบ Turn ของ Unit นี้" },
    { id: "lock-down", team: "fed", name: "Lock Down the Perimeter", timing: "COMMAND", card: "assets/cards/tactic-lock-down.png", text: "Unit ที่กำลังใช้งานอาจทำลาย Upgrade Token 1 อันบน Unit ศัตรูภายใน Range 3 จากนั้นทำให้ Unit นั้นติด Slow" },
    { id: "shield-recovery", team: "fed", name: "Shield the Recovery", timing: "RESPONSE", trigger: "After Rescue", card: "assets/cards/tactic-shield-recovery.png", text: "หลัง Unit ฝ่ายเราช่วยเหลือ Garrison สำเร็จ Unit นั้นได้รับ Shield Upgrade 1" },
    { id: "federation-shield", team: "fed", name: "Earth Federation Shield", timing: "RESPONSE", trigger: "After Attack Roll", card: "assets/cards/tactic-federation-shield.png", text: "หลังฝ่ายตรงข้ามทอยลูกเต๋าโจมตีแล้ว ลด Damage ที่ Unit ฝ่ายเราจะได้รับจากการโจมตีครั้งนี้ลง 2" },
    { id: "rescued-extraction", team: "zeon", name: "Rescued Extraction", timing: "COMMAND", card: "assets/cards/tactic-rescued-extraction.png", text: "Zaku II: Line Breaker ช่วยเหลือ Garrison ฝ่ายเดียวกันภายใน Range 3 โดยใช้ Timeline 0 จากนั้น Zaku II ได้รับ Energy 1" },
    { id: "logistics-relay", team: "zeon", name: "Logistics Relay", timing: "RESPONSE", trigger: "After Rescue", card: "assets/cards/tactic-logistics-relay.png", text: "หลัง Unit ฝ่ายเราช่วยเหลือ Garrison สำเร็จ Unit นั้นได้รับ Speed Upgrade 1" },
    { id: "exploited-chaos", team: "zeon", name: "Exploited Chaos", timing: "RESPONSE", trigger: "After Combat Damage", card: "assets/cards/tactic-exploited-chaos.png", text: "เมื่อการโจมตีของ Unit ฝ่ายเราจบลง Unit ฝ่ายเราที่เป็นฝ่ายโจมตีได้รับ Energy 1 และ Strength Upgrade 1" },
    { id: "shattered-formation", team: "zeon", name: "Shattered Formation", timing: "RESPONSE", trigger: "After Combat Damage", card: "assets/cards/tactic-shattered-formation.png", text: "หลังรับ Combat Damage หาก Unit ฝ่ายเราที่เป็นฝ่ายป้องกันรอดจากการโจมตี จะสร้าง Damage 2 ให้กับผู้โจมตี" },
    { id: "drive-them-back", team: "zeon", name: "Drive Them Back", timing: "COMMAND", card: "assets/cards/tactic-drive-them-back.png", text: "Unit ที่กำลังใช้งานเคลื่อนที่เพิ่ม 2 ช่อง จากนั้นผลัก Unit ศัตรูที่อยู่ติดกัน 1 ช่องและสร้าง Damage 1 ให้ Unit นั้น" },
    { id: "iron-grip", team: "zeon", name: "Iron Grip", timing: "RESPONSE", trigger: "After Enemy Movement", card: "assets/cards/tactic-iron-grip.png", text: "เมื่อ Unit ศัตรูเคลื่อนที่มาหยุดอยู่ติดกับ Zaku II: Enforcer สร้าง Damage 3 แก่ศัตรูตัวนั้น" },
    { id: "sudden-pressure", team: "zeon", name: "Sudden Pressure", timing: "COMMAND", card: "assets/cards/tactic-sudden-pressure.png", text: "Unit ที่กำลังใช้งานสร้าง Damage 2 แก่ Unit ศัตรูทุกตัวและ Garrison ศัตรูทุกอันภายใน Range 3" },
    { id: "breaking-line", team: "zeon", name: "Breaking the Line", timing: "COMMAND", card: "assets/cards/tactic-breaking-line.png", text: "Unit ที่กำลังใช้งานอาจทำลาย Upgrade Token 1 อันบน Unit ศัตรูภายใน Range 3 จากนั้นทำให้ Unit นั้นติด Fracture" },
    { id: "crimson-execution", team: "zeon", name: "Crimson Execution", timing: "COMMAND", card: "assets/cards/tactic-crimson-execution.png", text: "Char’s Zaku II ทำ Dash เพิ่ม 1 ครั้งโดยใช้ Timeline 0 จากนั้นโจมตีด้วย Heat Hawk เพิ่ม 1 ครั้งโดยใช้ Timeline 0" }
  ];

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

  const data = {
    teams: {
      fed: { name: "Earth Federation", short: "E.F.S.F.", color: "#36b7ff" },
      zeon: { name: "Principality of Zeon", short: "ZEON", color: "#ff405a" }
    },
    rules: {
      advance: { distance: 3, timeline: 0 },
      dash: { distance: 2, timeline: 2 },
      rescue: { timeline: 2, vp: 2 },
      movement: { garrisonsBlock: true },
      garrison: { defeatVp: 2 }
    },
    units,
    tactics,
    map: { id: "sleeping-leviathan", name: "Sleeping Leviathan", cols: 15, rows: 13, featureCoordinates, elevation1, elevation2 },
    mysteryPool: ["shield","shield","shield","shield","shield","speed","speed","speed","speed","speed","strength","strength","strength","strength","strength"]
  };

  root.GA_DATA = data;
  if (typeof module !== "undefined" && module.exports) module.exports = data;
})(typeof window !== "undefined" ? window : globalThis);

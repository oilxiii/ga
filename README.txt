GUNDAM ASSEMBLE // ONLINE — Five Teams v98

- v98 Team Select UI Rebuild: ย้ายหน้าต่างเลือกทีมออกจากข้อจำกัดกรอบ Title แนวตั้งให้ใช้ viewport จริง, จัด CLASSIC / STARTER 01 เป็นสองคอลัมน์บนคอมและเรียงอ่านง่ายบนแท็บเล็ต/มือถือ, แยกไอคอน ชื่อทีม รายชื่อยูนิต และปุ่ม SELECT/TARGET เป็นคนละพื้นที่ พร้อม drawer ของ Secret Team ที่ไม่ดันหรือซ้อนข้อความ; ไม่เปลี่ยนกติกา ทีม หรือ AI.

- v97 Stability / Card Cache Fix: Mechazawa Unit Card ใช้ asset ชื่อใหม่เพื่อบังคับ browser/GitHub Pages โหลดภาพ Hacking System ที่แก้เป็น Damage 1 แทน cache เก่า; Restart เคลียร์ pending attack/movement draft จากแมตช์เดิม; Sound/Result/Rules modal ใช้ focus lock/inert ให้สม่ำเสมอ.
- v96 Mechazawa Balance Update: Hacking System ซ่อม Damage 1 ให้ Unit ฝ่ายเรา 1 ตัวต่อ Garrison trigger (ลดจาก Damage 2); เงื่อนไข trigger, USE/SKIP, target selection และ queue behavior เดิมไม่เปลี่ยน พร้อมอัปเดตภาพ Unit Card Mechazawa ให้ตรงค่าความสามารถใหม่.
- v95 Team Select UI: ปรับ responsive card structure ใหม่เพื่อแก้ชื่อทีม/UNIT DATA/SELECT ซ้อนกันในหน้าจอแคบ; แยก artwork, team copy, unit-data และ action badge เป็นคนละ layout region พร้อม breakpoint แบบ single-column บน tablet/mobile.
- v94 Team Select UI: ปรับหน้าเลือกทีมเป็น Mobile Suit tactical roster / deployment HUD โดยคง CLASSIC, STARTER 01 และ Secret drawer (SECRET CHANNEL) พร้อมธีมฟ้า/แดงตามขั้นเลือกทีม.
- v92 Game Over Flow: ปุ่มหลังจบแมตช์กลับไปหน้า Title และเคลียร์ match state เดิม แทนการเริ่มเกมใหม่ด้วยทีมเดิมทันที.
- v91 Command Rules Fix: เปลี่ยนการใช้ Command จากโควตา boolean ร่วมทั้งยูนิต เป็นการติดตามแยกตาม Command ability id ตาม Core Rulebook; ยูนิตที่มี Command 2 ความสามารถจึงใช้แต่ละความสามารถได้อย่างละ 1 ครั้งใน Activation เดียวกัน และ rollback ของ Alaya-Vijnana Exertion จะคืนเฉพาะ snapshot ก่อน Exertion โดยไม่ล้าง Command อื่นที่ใช้ไปแล้ว.
- v90 Rules/UI Cleanup: แก้ Pull ของ Tail Blade / Heat Rod ให้ใช้ทิศที่เข้าใกล้ผู้ดึงจริงและ resolve Collision Damage 2 เมื่อชนพื้นที่สูง, Unit, Garrison หรือ Base; คืนกฎ Engagement ให้ตรง Core Rulebook (เป้าหมายที่ Engage ต้องติดกันและ Elevation เดียวกัน, ไม่จำกัดชนิดอาวุธ, AoE ต้องครอบอย่างน้อย 1 Engaging target); LOS Inspector ใช้ Attack Tactic ในมือสำหรับทั้งระยะและสถานะ blocked; หน้าดู/ยืนยัน Tactic ใช้ focus lock/inert แบบ modal เต็ม; ลบ legacy card/reference assets ที่ไม่มี runtime reference.

- v89 Asset Optimization: ลดขนาดโฟลเดอร์เกมจากประมาณ 71 MB เหลือประมาณ 24 MB (ลดลงราว 66%) โดยแปลงภาพการ์ด PNG ที่ไม่มีความโปร่งใสเป็น JPEG คุณภาพสูง, จำกัดภาพ Unit Card ขนาดใหญ่มากไว้ที่สูงสุด 1,800 px, จำกัดไอคอนบนกระดานไว้ที่ 384 px และลด Title Art เหลือสูงสุด 1,400 px; ไม่แก้กฎเกม, AI, เสียง หรือเอฟเฟกต์.

- v88 AI Tactic Reveal: เมื่อ AI ตัดสินใจใช้ Tactic แบบ Command, Attack หรือ Response เกมจะแสดงภาพการ์ดกลางหน้าจอและหยุดลำดับการเล่นไว้จนผู้เล่นกด X หรือ “ปิดและดำเนินการต่อ” แล้วจึงเริ่ม Action/เอฟเฟกต์ของการ์ด; Response ที่ AI ไม่ใช้ยังคงเป็นข้อมูลลับ.

- v87 Secret Team ability update: Hacking System เกิดเฉพาะเมื่อ Mechazawa เป็นผู้ทำลาย Garrison ศัตรูหรือเป็นผู้ Rescue Garrison ฝ่ายเราเอง; Motorcycle เปลี่ยนเป็นการเคลื่อนที่แยกสูงสุด 2 ช่อง ใช้ได้ทั้งก่อนหรือหลัง Move/Dash โดยไม่เพิ่มระยะให้คำสั่งเดิม ไม่เสีย Primary Action และ AI ใช้กฎเดียวกัน. Super Alloy Z เปลี่ยนเป็นให้ Mazinger Z ได้ Shield Upgrade 1 ทุกครั้งที่ Deploy จาก Base พร้อมอัปเดตภาพการ์ด Mechazawa/Mazinger Z.

- v86 Rocket Punch LOS clarity: ยืนยันด้วยกฎและ regression test ว่า Rocket Punch โจมตี Unit/Garrison ภายใน Range 3 ได้แม้ Terrain หรือ Unit บัง Line of Sight; เมนูอาวุธและข้อความเลือกเป้าหมายแสดง IGNORE LOS โดยตรง และข้อความไม่มีเป้าหมายไม่กล่าวว่าอาวุธถูก LOS บล็อก.

- v85 Secret Team rebalance: อัปเดต Unit Card ทั้ง 3 ใบ; Positron Rifle ใช้ Timeline 4, Rocket Punch เป็น Range 3, Breast Fire เป็น AoE ระยะ SP รูปกรวย 6 ช่อง และ Mechazawa เป็น HP 10 / VP 4. Breast Fire ใช้กฎ AoE พิเศษร่วมกับอาวุธ SP อื่น ทอยครั้งเดียว ไม่โดนฝ่ายเดียวกันหรือ Base และโบนัส Damage +2 คิดเฉพาะเป้าหมายที่อยู่ติด Mazinger Z.

- v84 Timeline inspection: คลิก/แตะไอคอน Unit บน Timeline ของทั้งสองฝ่ายเพื่อดู Unit Card พร้อม HUD สถานะ/Upgrade/HP/Energy และ Garrison Data แบบสถานะปัจจุบัน โดยไม่เปลี่ยน Active Unit หรือ state ของเกม.

- v83 Team Select layout: CLASSIC และ STARTER 01 เรียงเป็นสองแถวเต็มความกว้าง; Secret Team อยู่ drawer แถวล่างเพื่อไม่ให้การ์ดถูกบีบ.
- v82 Team Select UI: CLASSIC (E.F.S.F./ZEON) และ STARTER 01 (White Devil/The Rival) แสดงทันที; Secret Team ซ่อนใน drawer และไอคอน ? มี classified noise animation.
- v81 Stability / HUD Fix: Hacking System มี USE/SKIP, Annihilate ใช้ไม่ได้หากไม่มี Rex Claws target, HUD แสดง Checkmate/Mazin Power/Frenzied Charge ชั่วคราว, และ Alaya-Vijnana Exertion กด Back แล้วคืน HP/Shield/Command.
- v80 Stability / Ability Audit Fix: แก้ Hacking System ให้ Resolve ครบทุก Garrison และไม่ค้าง state, Progressive Knife ให้ Fracture ทำงานในการโจมตีซ้ำโดยไม่ chain ครั้งที่ 3, No Escape ตรวจ LOS, Checkmate ให้ผู้เล่นเลือก Upgrade, War Edge ใช้ Exploit Weakness แบบ shared roll อย่างคงที่, ล็อก focus ของ resolution modal ทุกชนิด, ปรับ AI ให้เข้าใจ effect สำคัญ/ใช้ Motorcycle ก่อน Advance เมื่อคุ้ม, แก้ชื่อ Heat Rod/Bazooka ใน log และ sync cache/docs.
- v79 Unit HUD + Garrison Record: แถบ Unit Data แบ่งครึ่งเป็นสถานะ/อัปเกรดของยูนิตและสถิติ Garrison DESTROYED/RESCUED ของฝ่ายที่กำลัง Active.
- v78 Vulcan Dice UX: เมื่อ Vulcan Cannons ของ Gundam [Hero of Side 7] ติด Critical ลูกเต๋า 3 ลูกแรกจะค้างผลเดิมบนหน้าต่างเดิม แล้วเพิ่ม/หมุนเฉพาะลูกเต๋าใหม่ 2 ลูกข้างกัน ก่อนสรุปผลรวม 5 ลูก โดยไม่ทอยหรือ Animate ลูกเดิมซ้ำ.
- v77 Encounter Fix: Encounter ยังถูก Trigger เฉพาะศัตรูติดกันระดับเดียวกัน แต่เมื่อถูก Encounter แล้วสามารถโจมตีศัตรูทุกตัวที่อยู่ติดกันได้ รวมถึงต่างระดับ และอาวุธยิงอย่าง Bazooka ไม่ถูกปิดโดย Encounter.
- v76 Five Teams: เพิ่ม White Devil, The Rival และ Secret จนครบ 5 ทีม ทีมละ 3 Unit; เพิ่ม Epic Shot, War Edge, Berserk, God Drill และ Jet Scrander พร้อมข้อจำกัดยูนิต; War Edge/God Drill ใช้ระบบ AoE SP และแนวเล็งพิเศษเดียวกับ Twin Buster; ทีมใหม่มี Tactic 3 ใบตั้งแต่ต้นและไม่จั่วเพิ่มหลัง Phase 1; AI เลือกทีม/ยูนิต/การ์ดใหม่ได้ตามข้อมูลเปิดเผย.
- v75 Two-Color Team Palette: สีทีมบนสนามเหลือเพียงแดงและน้ำเงิน; ZEON ได้สีแดงและ E.F.S.F. ได้สีน้ำเงินเป็นลำดับแรก ส่วน Secret Team ใช้สีที่เหลือตามคู่แข่งในแมตช์เดียวกัน ทั้ง Unit, Timeline, HUD, Objective ที่ยึดแล้ว, Base และ Garrison; ตัดสี/Token เขียวออก และคงธง Objective กลางเป็นสีเหลือง.
- v74 Deadend / Rules Audit Fix: แก้ AI deadlock เมื่อแท็บถูกพักระหว่างเอฟเฟกต์เล็ง, ล็อก Focus ของ Response modal, รักษา Response chain ของ Vidar Handgun และ Beam Saber Critical Move, กัน Shattered Formation ทำ Damage ใส่ Unit ที่กลับ Reserve, แก้ Twin Buster 6 ทิศบริเวณขอบแผนที่/LOS Inspector/RNaN, แก้ Forward Artillery ให้ยึดฝั่งจริง, ให้ AI ประเมิน Twin Buster แยกทีละทิศ, ห้าม Move/Dash ปกติยืนยันช่องเดิม และแยก RNG ของ Animation ออกจาก RNG ผลเกม.
- v73 Twin Buster Terrain Rule: Twin Buster ไม่ใช้ LOS ปกติ; Unit/Garrison/Base และ Terrain ที่สูงไม่เกินระดับของ Wing Zero ไม่บังลำแสง; เป้าหมายที่ยืนบนพื้นที่สูงยังโดน แต่เป้าหมายที่อยู่หลัง Terrain ซึ่งสูงกว่าระดับยิงของ Wing จะถูกบังและแสดง Preview สีเทา.
- v72 Hologram Team Select: เพิ่ม scanline/sweep/glow ให้หน้าต่างเลือกทีมดูเป็นโฮโลแกรมมากขึ้น; ลูกศร Secret Team ใช้ accent เดียวกับหน้าต่าง (ฟ้าในขั้นเลือกทีมตัวเอง และแดงในขั้นเลือกคู่แข่ง) โดยไม่ใช้สีเขียว; หลังเลือกทีมตัวเอง ขั้นเลือกคู่แข่งเปลี่ยนกรอบ/แสง/ข้อความ accent เป็นสีแดงทั้งใน 1 Player และ 2 Player.
- v71 Faction Visual Fix: Base และ Garrison เลือกสีจาก faction ที่ผู้เล่นเลือกจริง ไม่อิง logical board side; ZEON เป็นสีแดงแม้ถูกกำหนดเป็นฝั่ง fed/Player 1, E.F.S.F. เป็นสีน้ำเงินแม้อยู่ฝั่ง zeon/Player 2, Secret Team คง Garrison สีเขียวและ Base แบบเดิม.
- v70 Secret Team Reveal: เปลี่ยนชื่อที่ผู้เล่นเห็นจาก Ultimate Team เป็น Secret Team; หน้าเลือกทีมของทั้ง 1 Player และ 2 Player ซ่อนทีมนี้ไว้ใน drawer ที่เปิดด้วยลูกศรเล็ก ๆ และการ์ดทีมลับแสดงเฉพาะ ? / SECRET TEAM / CLASSIFIED โดยไม่เปิดเผยชื่อ Unit; internal faction id ยังคงเป็น ultimate เพื่อรักษาความเข้ากันได้ของกฎและ AI.
- v69 AI Resource Efficiency: AI now caps overkill value, prefers the lowest-Timeline weapon once it has at least a 50% finishing chance on the same target, values scarce Energy/Mystery pickups more strongly, takes a near-best free pickup when it does not meaningfully sacrifice position, and only spends TL2 on Dash when the destination is materially better than staying.
- v68 Twin Buster Aim Preview: Human players can always inspect all six Twin Buster directions, even when terrain blocks every target. A chosen direction shows the full pattern (red = clear line, gray = terrain-blocked), while firing remains disabled until that direction contains a legal enemy target. Back returns to direction selection without spending Action/Timeline.
- v67 Twin Buster Preview UX: after choosing a firing direction, the full 9-Hex pattern is shown; cells with terrain-blocked LOS are gray while valid firing cells remain red. The confirmation step now has Back to reselect a direction without spending Action or Timeline.
- v66 Movement guard + Ultimate Garrison: movement previews are rebuilt from the saved origin and every move is revalidated against its own allowance immediately before commit, preventing stale/reselected ranges from extending Barbatos or any other unit beyond the legal budget. Ultimate Garrison uses green only on the outer border; the inner field is the same gray treatment as the red Garrison.
- v65 Twin Buster Rifle: fixed six-direction rotation indexing near map edges so elevation differences never remove a valid AoE direction by themselves; one shared roll is still resolved per target with +1/0/-1 elevation Accuracy and normal terrain LOS.
- v64 Movement preview + Ultimate Garrison: when re-adjusting a previewed Move/Dash the unit is shown back at the original movement hex so the highlighted legal area cannot look like extra movement; Barbatos still pays normal elevation climb costs and has no Hover. Ultimate Garrison now uses a dedicated green-border/gray-center token instead of tinting the whole image green.
- v63 Team palette update: Objective ที่ยังไม่มีผู้ครอบครองกลับมาใช้ธงสีเหลือง และ Ultimate Team เปลี่ยนสีประจำทีมพร้อม Base และ Garrison เป็นสีเขียว

วิธีเปิดเกม
1. เก็บไฟล์และโฟลเดอร์ทั้งหมดไว้ด้วยกัน
2. เปิด index.html ด้วย Chrome, Edge หรือ Safari รุ่นปัจจุบัน
3. เลือก 1 PLAYER แล้วเลือกทีมของผู้เล่นและทีมคู่ต่อสู้ของ AI
   หรือเลือก 2 PLAYER สำหรับ Hot-seat แล้วให้ผู้เล่นทั้งสองเลือกทีม
4. ในหนึ่งแมตช์ ทีมของทั้งสองฝั่งต้องไม่ซ้ำกัน โดยเลือกได้จาก E.F.S.F., ZEON, White Devil, The Rival และ Secret

โครงสร้างสำคัญ
- index.html       หน้าเริ่มเกม
- styles.css       หน้าตาและเอฟเฟกต์
- data.js          ทีม, Unit, Tactic และแผนที่ Sleeping Leviathan
- engine.js        กติกาหลัก
- ai.js            การตัดสินใจของ AI
- game.js          ลำดับเกมและ UI
- LAUNCH-AUDIT-TH.txt รายงานตรวจบั๊กและผลทดสอบก่อน Launch
- assets/          ภาพการ์ด, ไอคอน, Token, เอฟเฟกต์ และเสียง
- tests/           ชุดตรวจสอบกติกาและ AI

หมายเหตุ
- ห้ามย้าย index.html ออกจากโฟลเดอร์นี้เพียงไฟล์เดียว เพราะเกมเรียกใช้ assets ภายในโฟลเดอร์
- AI ใช้ข้อมูลและกติกาเดียวกับผู้เล่น ไม่อ่านชนิด Mystery Upgrade ก่อนเปิด และไม่เห็นมือ Tactic ของผู้เล่น
- Newtype Instincts ทอยใหม่ได้เฉพาะลูกที่เป็น Miss ตามข้อความบน Unit Card
- หน้า Title ใช้เพลง Title ตามเดิม; เมื่อเริ่มเกมจะใช้เพลงที่เลือกจากปุ่มลำโพง (เพลง 1 = Battle BGM, เพลง 2 = Alternate/Title BGM)
- ปุ่มลำโพงมุมขวาบนเปิดเมนูเลือก เพลง 1 / เพลง 2 / ปิดเสียง; ตัวเลือกปิดเสียงจะปิดทั้ง BGM และ Sound Effects
- AI เว้นจังหวะก่อนเลือกคำสั่งและกล้องจะติดตาม Unit ของ AI เมื่อเริ่ม Activation
- ENCOUNTER จะแสดงเหนือเป้าหมายที่ต้องโจมตีก่อน และ MOVE -1 จะแสดงเหนือ Unit ที่ถูกลดระยะเดิน
- กล้องติดตาม Unit ที่กำลังเล่นทุกฝ่าย; ใน Hot-seat จะเลื่อนหลังผู้เล่นกดพร้อม
- ป้าย ENCOUNTER และ MOVE -1 ถูกวาดบนชั้นหน้าสุดของกระดานเพื่อไม่ให้ Hex หรือ Token บัง
- Move ของผู้เล่นสามารถเลือกตำแหน่งใหม่ภายในพื้นที่เดิมได้จนกว่าจะเลือก Action อื่น จึงค่อยยืนยันการเดินและเก็บ Token
- คลิก Unit ตัวอื่นบนแผนที่ได้ทั้งฝ่ายเดียวกันและศัตรูเพื่อเปิดดู Unit Card แบบเต็มแผ่น; Unit ที่กำลังทำงานยังเปิด Command Menu ตามเดิม
- Dash ของผู้เล่นปรับตำแหน่งซ้ำได้ภายในพื้นที่เดิมเหมือน Move; หัก Timeline, เก็บ Token และตรวจ Char Kick เมื่อยืนยัน Action อื่นเท่านั้น
- แสดงหมายเลข Build ขนาดเล็กที่มุมขวาบนของหน้าการเล่น
- กติกาการออกเวอร์ชัน: ทุกครั้งที่เปลี่ยนเลข Build/Version ต้องอัปเดตข้อความเวอร์ชันที่แสดงในเกม (มุมขวาบนใน index.html) ให้ตรงกับเวอร์ชันไฟล์และ cache tag เสมอ
- Objective ที่ครอบครองอยู่ให้ 5 VP ต่อจุดเมื่อจบแต่ละ Phase ตามอัปเดต Scenario ล่าสุด
- ทีมพิเศษปัจจุบันคือ White Devil, The Rival และ Secret; ทุกทีมใช้สีแดงหรือน้ำเงินตามฝั่งของแมตช์ ไม่มี Token สีเขียว และ Objective กลางเป็นสีเหลือง
- Twin Buster Rifle, War Edge, God Drill และ Breast Fire ใช้ AoE ตาม pattern ของการ์ด, ทอยเพียงชุดเดียว, ตรวจผลแยกต่อเป้าหมาย, มองทะลุ Unit/Garrison/Base และ Terrain ปกติ; จะถูกบังเฉพาะเป้าหมายที่อยู่หลัง Terrain ซึ่งสูงกว่าระดับผู้ยิง และไม่โจมตี Base หรือพวกเดียวกัน
- White Devil, The Rival และ Secret มี Tactic ทีมละ 3 ใบตลอดเกมโดยไม่จั่วเพิ่มหลัง Phase 1

การตรวจสอบสำหรับผู้พัฒนา (ต้องมี Node.js)
  node tests/ai.test.js
  node tests/core.test.js

- v51 objective scoring update: Objective ที่ครอบครองอยู่ให้ 5 VP ต่อจุดเมื่อจบแต่ละ Phase พร้อมอัปเดตเอฟเฟกต์, Battle Log, tooltip, กติกาย่อ และชุดทดสอบ
- v50 launch audit: แก้ Line of Sight ตามระดับของปลายทั้งสองฝั่งและเส้นตามขอบ Hex, จ่าย Timeline ก่อนทอย/Resolve, จัดลำดับ After Attack Roll → Disarm → Critical → Damage → Response, ให้ Critical Push เลือกได้ทีละช่องและหยุดก่อนครบระยะได้, แก้การชน Unit/Garrison/Base, แก้ Objective capture/contest และ tie-break, ให้ Response ใช้สิทธิ์ Tactic เฉพาะ Activation ปัจจุบัน, และตรวจความสามารถ Unit/Tactic ครบทุกใบจากภาพการ์ดจริง

- v54 audio selector: ปุ่มลำโพงเปิดตัวเลือก เพลง 1 / เพลง 2 / ปิดเสียง และซิงก์เลข Build ในเกมกับ cache tag เป็น v54

- v56 active-turn marker: คงสามเหลี่ยมสีทองเหนือ Unit ที่กำลัง Active แต่ตัดเอฟเฟกต์วิ้ง/ประกายออกทั้งหมด เหลือเพียงการลอยขึ้นลงเบา ๆ และอัปเดตข้อความ Build/cache tag ในเกมเป็น v56

- v57 Iron Grip/1P response UX: รวมการตรวจ Iron Grip ไว้ใน movement-response hook กลางก่อน continuation เพื่อให้ AI movement/forced movement เปิด Response ได้สม่ำเสมอ และในโหมด 1 Player แถบ Tactics แสดงมือของผู้เล่นตลอดแม้เป็นตา AI เพื่อให้เห็น Response ที่ถืออยู่

- v58 Ultimate Team: เพิ่มทีมที่สามสำหรับ 1 Player และ 2 Player, เพิ่ม Unit 3 ตัว/อาวุธ 6 แบบ/Tactic ใหม่ 2 ใบ, เพิ่มการเลือกคู่ต่อสู้ AI, รองรับ Tactic ที่ใช้ร่วมกันแบบแยกเจ้าของ, เพิ่ม Twin Buster Rifle AoE ตาม diagram และเพิ่ม AI ที่ใช้กติกาเดียวกับผู้เล่น

- v59 Ultimate balance: จำกัดสำรับ Ultimate Team เป็น Renewed Power, Sacrificial Overload และ Built to Last รวม 3 ใบตลอดเกมโดยไม่มี Phase 2 draw พร้อมเพิ่มสีเหลืองทองให้ Base/Garrison ของ Ultimate Team

- v60 Objective clarity: เปลี่ยนธง Objective ที่ยังเป็นกลางจากสีเหลืองเป็นสีเทาอ่อน เพื่อแยกจาก Objective ที่ Ultimate Team ยึดแล้วอย่างชัดเจน

- v63 Ultimate ability fix: Alaya-Vijnana Exertion commit เป็น Command ทันทีหลังยืนยันใช้และใช้ได้เพียงครั้งเดียวต่อ Activation, Hover ถูกย้ายเข้า engine.reachable() เพื่อให้ Player/AI ละเว้นค่าใช้จ่ายจากความสูงเหมือนกัน, และ Twin Buster Rifle ระหว่าง Engagement ใช้ได้เฉพาะแนว AoE ที่ครอบอย่างน้อยหนึ่งเป้าหมายที่ Engaged อยู่

- v63 Movement elevation fix: Jump no longer makes later climbs back toward the starting elevation free; only Wing Zero Hover ignores terrain elevation costs. Barbatos/other units pay climb costs normally. Fight to the End remains active at 6/12 accumulated Damage.

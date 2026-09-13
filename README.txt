GUNDAM ASSEMBLE // ONLINE — Launch Candidate v54

วิธีเปิดเกม
1. เก็บไฟล์และโฟลเดอร์ทั้งหมดไว้ด้วยกัน
2. เปิด index.html ด้วย Chrome, Edge หรือ Safari รุ่นปัจจุบัน
3. เลือก 1 PLAYER เพื่อเล่นกับ AI แล้วเลือกฝ่าย E.F.S.F. หรือ ZEON
   หรือเลือก 2 PLAYER สำหรับ Hot-seat

โครงสร้างสำคัญ
- index.html       หน้าเริ่มเกม
- styles.css       หน้าตาและเอฟเฟกต์
- data.js          Unit, Tactic และแผนที่ Sleeping Leviathan
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

การตรวจสอบสำหรับผู้พัฒนา (ต้องมี Node.js)
  node tests/ai.test.js
  node tests/core.test.js

- v51 objective scoring update: Objective ที่ครอบครองอยู่ให้ 5 VP ต่อจุดเมื่อจบแต่ละ Phase พร้อมอัปเดตเอฟเฟกต์, Battle Log, tooltip, กติกาย่อ และชุดทดสอบ
- v50 launch audit: แก้ Line of Sight ตามระดับของปลายทั้งสองฝั่งและเส้นตามขอบ Hex, จ่าย Timeline ก่อนทอย/Resolve, จัดลำดับ After Attack Roll → Disarm → Critical → Damage → Response, ให้ Critical Push เลือกได้ทีละช่องและหยุดก่อนครบระยะได้, แก้การชน Unit/Garrison/Base, แก้ Objective capture/contest และ tie-break, ให้ Response ใช้สิทธิ์ Tactic เฉพาะ Activation ปัจจุบัน, และตรวจความสามารถ Unit/Tactic ครบทุกใบจากภาพการ์ดจริง

- v54 audio selector: ปุ่มลำโพงเปิดตัวเลือก เพลง 1 / เพลง 2 / ปิดเสียง และซิงก์เลข Build ในเกมกับ cache tag เป็น v54

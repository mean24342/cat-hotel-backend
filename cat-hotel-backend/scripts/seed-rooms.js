// One-off seed for the 8 physical rooms. Safe to re-run (ON CONFLICT
// DO NOTHING keyed on the unique room_number), unlike the numbered
// migrations in /sql which are not re-run-safe - that's why this is a
// separate script rather than another 00N_*.sql file.
const { pool } = require('../src/config/db');

const ROOMS = [
  { room_number: 'R1', room_type: 'ห้องมาตรฐาน',        capacity_pets: 1, base_price_per_night: 450,  description: 'ห้องกะทัดรัด อบอุ่น เหมาะกับแมวที่ชอบพื้นที่ส่วนตัวเงียบสงบ' },
  { room_number: 'R2', room_type: 'ห้องมาตรฐาน',        capacity_pets: 1, base_price_per_night: 450,  description: 'ห้องกะทัดรัด อบอุ่น เหมาะกับแมวที่ชอบพื้นที่ส่วนตัวเงียบสงบ' },
  { room_number: 'R3', room_type: 'ห้องมาตรฐานวิวสวน',   capacity_pets: 1, base_price_per_night: 500,  description: 'ห้องมาตรฐานพร้อมหน้าต่างวิวสวน แสงธรรมชาติส่องถึงตลอดวัน' },
  { room_number: 'R4', room_type: 'ห้องดีลักซ์',         capacity_pets: 2, base_price_per_night: 750,  description: 'ห้องกว้างขึ้น มีคอนโดปีนป่ายในตัว เหมาะกับแมว 2 ตัวจากบ้านเดียวกัน' },
  { room_number: 'R5', room_type: 'ห้องดีลักซ์',         capacity_pets: 2, base_price_per_night: 750,  description: 'ห้องกว้างขึ้น มีคอนโดปีนป่ายในตัว เหมาะกับแมว 2 ตัวจากบ้านเดียวกัน' },
  { room_number: 'R6', room_type: 'ห้องดีลักซ์วิวสวน',    capacity_pets: 2, base_price_per_night: 800,  description: 'ห้องดีลักซ์วิวสวน มีระเบียงกรงตาข่ายให้อาบแดดได้อย่างปลอดภัย' },
  { room_number: 'R7', room_type: 'สวีทครอบครัว',        capacity_pets: 3, base_price_per_night: 1100, description: 'ห้องสวีทขนาดใหญ่สำหรับครอบครัวแมวหลายตัว พร้อมมุมเล่นแยกสัดส่วน' },
  { room_number: 'R8', room_type: 'สวีทพรีเมียม',        capacity_pets: 2, base_price_per_night: 1400, description: 'ห้องสวีทหรูสุดพิเศษ ตกแต่งละเอียด พร้อมกล้องดูแมวถ่ายทอดสดให้เจ้าของ' },
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const room of ROOMS) {
      await client.query(
        `INSERT INTO rooms (room_number, room_type, capacity_pets, base_price_per_night, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (room_number) DO NOTHING`,
        [room.room_number, room.room_type, room.capacity_pets, room.base_price_per_night, room.description]
      );
    }
    await client.query('COMMIT');
    console.log(`Seeded ${ROOMS.length} rooms (existing room_numbers were skipped).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Room seed failed, rolled back:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();

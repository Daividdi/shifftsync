const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const db = new Database('/opt/shiftsync/backend/data/shiftsync.db');
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const SAT_EPOCH = new Date('2023-12-30T12:00:00Z');
function globalSatIdx(sat) {
  return Math.round((sat.getTime() - SAT_EPOCH.getTime()) / (7 * 86400000));
}
function getSaturdays(year, month) {
  const sats = [];
  const d = new Date(year, month, 1);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  while (d.getMonth() === month) { sats.push(new Date(d)); d.setDate(d.getDate() + 7); }
  return sats;
}
function toDateStr(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

const today = new Date(); today.setHours(0,0,0,0);
const months = [[2026,4],[2026,5],[2026,6],[2026,7],[2026,8],[2026,9],[2026,10],[2026,11]];

const allGroups = db.prepare('SELECT * FROM groups').all();
const insertOrReplace = db.prepare('INSERT OR REPLACE INTO schedules (id, group_id, date, user_id, status) VALUES (?,?,?,?,?)');
const deleteDate = db.prepare('DELETE FROM schedules WHERE group_id=? AND date=?');

const tx = db.transaction(() => {
  for (const [year, month] of months) {
    const allSats = getSaturdays(year, month);
    const futureSats = allSats.filter(s => s >= today);
    const targetSats = futureSats.length > 0 ? futureSats : allSats;

    for (const group of allGroups) {
      const members = db.prepare('SELECT user_id FROM group_members WHERE group_id=?').all(group.id).map(r => r.user_id);
      if (!members.length) continue;

      for (const sat of targetSats) {
        const dateStr = toDateStr(sat);
        const satIndex = globalSatIdx(sat);
        deleteDate.run(group.id, dateStr);

        let working = [], off = [];
        if (group.team === 'A') {
          working = satIndex % 2 === 0 ? members : [];
          off     = satIndex % 2 === 0 ? [] : members;
        } else if (group.team === 'B') {
          working = satIndex % 2 !== 0 ? members : [];
          off     = satIndex % 2 !== 0 ? [] : members;
        } else {
          const half = Math.ceil(members.length / 2);
          working = satIndex % 2 === 0 ? members.slice(0, half) : members.slice(half);
          off     = satIndex % 2 === 0 ? members.slice(half)   : members.slice(0, half);
        }
        for (const uid of working) insertOrReplace.run(uuidv4(), group.id, dateStr, uid, 'working');
        for (const uid of off)     insertOrReplace.run(uuidv4(), group.id, dateStr, uid, 'off');
      }
    }
    console.log(year+'/'+(month+1)+': '+targetSats.length+' sabados regenerados');
  }
});
tx();

// Verify
console.log('\n--- Verificacao cruzamento de meses ---');
const pairs = [
  ['2026-05-30','2026-06-06'],
  ['2026-06-27','2026-07-04'],
  ['2026-07-25','2026-08-01'],
  ['2026-08-29','2026-09-05'],
  ['2026-10-31','2026-11-07'],
];
const qA = db.prepare("SELECT s.status FROM schedules s JOIN groups g ON g.id=s.group_id WHERE g.name='ADM - Turma A' AND s.date=?");
pairs.forEach(function(p) {
  const last = p[0], first = p[1];
  const r1 = qA.get(last);
  const r2 = qA.get(first);
  const lastWorked = (r1 && r1.status === 'working') ? 'A' : 'B';
  const nextWorks  = (r2 && r2.status === 'working') ? 'A' : 'B';
  const ok = lastWorked !== nextWorks ? 'OK' : 'BUG';
  console.log(ok, last,'=',lastWorked,'trabalhou |', first,'=',nextWorks,'trabalha');
});
db.close();

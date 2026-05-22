const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('data/timekeeping.db');

const team = [
  { name: 'Herman Karsten', designation: 'Manager', reports_to: null },
  { name: 'Eliaser Hambuda', designation: 'Engineering Foreman', reports_to: 'Herman Karsten' },
  { name: 'Elbie Engelbrecht', designation: 'Marine Outfitting Senior Foreman', reports_to: 'Herman Karsten' },
  { name: 'Shaun Strauss', designation: 'Health & Safety Officer', reports_to: 'Herman Karsten' },
  { name: 'Aukus Shigweda', designation: 'Engineering Foreman', reports_to: 'Herman Karsten' },
  { name: 'Trevor Langenhoven', designation: 'Marine Outfitting Foreman', reports_to: 'Herman Karsten' },
  { name: 'Wayne Maasdorp', designation: 'Marine Outfitting Foreman', reports_to: 'Herman Karsten' },
  { name: 'Lukas Nishiifela', designation: 'Engineering Artisan', reports_to: 'Aukus Shigweda' },
  { name: 'Mattheus Nambahu', designation: 'Engineering Artisan', reports_to: 'Aukus Shigweda' },
  { name: 'Kalapushe Ngonekesho', designation: 'Marine Outfitting Team Leader', reports_to: 'Elbie Engelbrecht' },
  { name: 'Fillipus Muya', designation: 'Engineering Artisan', reports_to: 'Eliaser Hambuda' },
  { name: 'Andapo Muelutha', designation: 'Marine Outfitting Team Leader', reports_to: 'Trevor Langenhoven' },
  { name: 'Ethan Benz', designation: 'Marine Outfitting Team Leader', reports_to: 'Wayne Maasdorp' },
  { name: 'Romano Gaseb', designation: 'Marine Outfitting Artisan', reports_to: 'Elbie Engelbrecht' },
  { name: 'Sydicko Solomons', designation: 'Marine Outfitting Artisan', reports_to: 'Elbie Engelbrecht' },
  { name: 'Andreas Nekandi', designation: 'Marine Outfitting Artisan', reports_to: 'Andapo Muelutha' },
  { name: 'Conrad Gamathan', designation: 'Marine Outfitting Artisan', reports_to: 'Andapo Muelutha' },
  { name: 'Masku Uriba', designation: 'Marine Outfitting Artisan', reports_to: 'Andapo Muelutha' },
  { name: 'Immanuel Ulle', designation: 'Marine Outfitting Artisan', reports_to: 'Andapo Muelutha' },
  { name: 'Levi Sheepo', designation: 'Marine Outfitting Artisan', reports_to: 'Andapo Muelutha' },
  { name: 'Ismael Abraham', designation: 'Marine Outfitting Artisan', reports_to: 'Ethan Benz' },
  { name: 'Paavo Hauholo', designation: 'Marine Outfitting Artisan', reports_to: 'Ethan Benz' },
  { name: 'Immanuel Nekando', designation: 'Marine Outfitting Artisan', reports_to: 'Ethan Benz' },
  { name: 'Tim-Jan Both', designation: 'Marine Outfitting Artisan', reports_to: 'Ethan Benz' },
  { name: 'Clifford Cowley', designation: 'Marine Outfitting Artisan', reports_to: 'Ethan Benz' }
];

db.serialize(() => {
  db.run("ALTER TABLE employees ADD COLUMN reports_to TEXT", (err) => {
    if (err) console.log("Column exist:", err.message);
  });
  
  const stmt = db.prepare("INSERT INTO employees (id, name, role, color, avatar, reports_to) VALUES (?, ?, ?, ?, ?, ?)");
  let i = 100;
  for (const p of team) {
    const id = 'emp_' + (i++);
    const color = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    const avatar = p.name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    stmt.run(id, p.name, p.designation, color, avatar, p.reports_to);
  }
  stmt.finalize();
});
db.close();
console.log('Seeded successfully!');

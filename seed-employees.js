const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let serviceAccount;
const saPath = path.join(__dirname, 'firebase-service-account.json');

if (fs.existsSync(saPath)) {
  serviceAccount = require(saPath);
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
}

if (!serviceAccount) {
  console.error('No service account found.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://omwandi-timekeeping-default-rtdb.firebaseio.com"
});

const db = admin.database();

const employees = [
  { emp_no: "4745", name: "Andapo", designation: "Team Leader Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Trevor Langenhoven", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772174684745-Andapo.png?alt=media&token=38c29cc6-7422-47b3-a7bb-029303a01bc1" },
  { emp_no: "6595", name: "Andreas", designation: "Team Leader Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Andries van Rooyen", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772174706595-Andreas.png?alt=media&token=3abf4fe1-05cf-4628-ac39-a979bab1b090" },
  { emp_no: "5442", name: "Andries van Rooyen", designation: "Team Leader Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Trevor Langenhoven", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772174166375442-Andries.png?alt=media&token=35d41ec8-b688-4d76-af66-2e1b7ae2a4c7" },
  { emp_no: "8040", name: "Aukus Shigwedha", designation: "Foreman - Engineering", department: "Projects", sub_department: "Engineering", reports_to: "Herman Karsten", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772174778040-Aukus.png?alt=media&token=9db10679-68e6-4a25-beac-dffee4e6781a" },
  { emp_no: "7880", name: "Shipmate", designation: "Shipmate Foreman", department: "Projects", sub_department: "Shipmate", reports_to: "(Top Level)", avatar_url: "" },
  { emp_no: "1234", name: "Estimator", designation: "Estimator", department: "Sales", sub_department: "", reports_to: "Ashwin Nash", avatar_url: "" },
  { emp_no: "5319", name: "Cliffie", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Ethan Benz", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187025319-Cliffie.png?alt=media&token=9d4b8d6b-031c-459c-92ac-f667e15eb0c0" },
  { emp_no: "0528", name: "Conrad", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Andries van Rooyen", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187120528-Conrad.png?alt=media&token=00212187-cb9b-42e2-99a0-e31321b45d0" },
  { emp_no: "7226", name: "Elbie", designation: "Senior Foreman Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Herman Karsten", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F17721848727226-Elbie.png?alt=media&token=cdde414d-e220-4ad7-ad6a-a3d61231b32e" },
  { emp_no: "2617", name: "Eliaser Hambuda", designation: "Foreman - Engineering", department: "Projects", sub_department: "Engineering", reports_to: "Herman Karsten", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772174822617-Eliaser.png?alt=media&token=9d0c1fcc-ae76-4afe-80fd-c89d2ed84e11" },
  { emp_no: "6932", name: "Ethan Benz", designation: "Team Leader Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Wayne Maasdorp", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187065932-Ethan.png?alt=media&token=0f1cf687-c560-4f87-b858-5060f41cd093" },
  { emp_no: "9101", name: "Filippus Nelomba", designation: "Trainee", department: "Projects", sub_department: "Engineering", reports_to: "Aukus Shigwedha", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772517909101-NIMT%20FILIPPUS%20NELOMBA.png?alt=media&token=c597722b-2ad3-46db-bfbc-de1960c2c9c7" },
  { emp_no: "2997", name: "Phillipus", designation: "Welder", department: "Projects", sub_department: "Engineering", reports_to: "Eliaser Hambuda", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187092997-Phillipus.png?alt=media&token=4daccfcd-3048-44b6-a01c-3a0224781c96" },
  { emp_no: "0962", name: "Herman Karsten", designation: "Project Manager", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Wiana Groenewald", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772807120962-Herman.png?alt=media&token=eca2307e-6a82-4abc-a18e-31505703243b" },
  { emp_no: "8531", name: "Immanuel Nkando", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Ethan Benz", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772184848531-immanuel%20Nkando.png?alt=media&token=f5dd88c1-b4ba-4b9d-a090-12da10dfe4aa" },
  { emp_no: "1437", name: "Manu", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Andries van Rooyen", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772184871437-Manu.png?alt=media&token=9ec4e9b9-2226-4d65-a642-999c3b791197" },
  { emp_no: "1000", name: "Ismael", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Andries van Rooyen", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1773741531000-ismael.png?alt=media&token=7678b0ac-54d4-4f2b-8dde-c4767e095758" },
  { emp_no: "1639", name: "Kalu", designation: "Team Leader Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Elbern Engelbrecht", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187216239-Kalu.png?alt=media&token=ddcc7ff1-46e7-853e-46a0a40f2a59" },
  { emp_no: "7150", name: "Levi", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Ethan Benz", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187247150-Levi.png?alt=media&token=76bf4fec-1926-4cec-853e-c8022d6c27b9" },
  { emp_no: "9690", name: "Lucky", designation: "Welder", department: "Projects", sub_department: "Engineering", reports_to: "Aukus Shigwedha", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772184956960-Lucky.png?alt=media&token=a788e369-7ed3-4cdc-90af-a2876f2a5bb8" },
  { emp_no: "9387", name: "Timjan", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Andries van Rooyen", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F177217459387-Timjan.png?alt=media&token=c2deafa8-b927-4847-9639-0ffc7b7eef74" },
  { emp_no: "8969", name: "Mathew", designation: "Fitter", department: "Projects", sub_department: "Engineering", reports_to: "Aukus Shigwedha", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187278969-Mathew.png?alt=media&token=8ab42a07-6337-42c1-9758-150fa5823752" },
  { emp_no: "0621", name: "Melissa", designation: "Cleaner", department: "Finance & Admin", sub_department: "", reports_to: "Verenique Ward", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772174906221-Melissa.png?alt=media&token=113c97fa-5862-4d1e-ad61-8e7441c4fff6" },
  { emp_no: "8898", name: "Pavo", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Ethan Benz", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772174928898-Pavo.png?alt=media&token=c871ebf4-b130-4f76-9520-d3e7f7113ffb" },
  { emp_no: "1744", name: "Filippus Nelomba", designation: "Trainee", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Immanuel Uule", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1773741291744-NIMT%20FILIPPUS%20NELOMBA.png?alt=media&token=d77087da-eff0-444a-aa9e-da8e61ddb3c0" },
  { emp_no: "1807", name: "Ravinia Kavela", designation: "Trainee", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Romano Gaseb", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772517831807-NIMT%20RAVINIA%20KAVELA.png?alt=media&token=dea6c55c-a683-410a-85da-9f9b68ecf235" },
  { emp_no: "7680", name: "Rewaldo", designation: "Driver", department: "Procurement", sub_department: "", reports_to: "Ashwin Nash", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772519277680-Rewaldo.png?alt=media&token=8da0ff80-4a90-41fe-bd3a-eb4b97d1a11d" },
  { emp_no: "0315", name: "Romano Gaseb", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Kalapushe Ngonekesho", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772518740315-ROMANO%20GASEB.png?alt=media&token=f50e0721-05e0-4a1c-a51b-35f6fc2d4146" },
  { emp_no: "4714", name: "Sacky", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Ethan Benz", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1773741444714-Sacky.png?alt=media&token=ad3ea974-1714-4bce-9b6b-0ae723ab150a" },
  { emp_no: "4844", name: "Shaun", designation: "Safety Officer", department: "HSE", sub_department: "Safety", reports_to: "Herman Karsten", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772517948448-Shaun.png?alt=media&token=17d2a473-cdc3-46db-ae77-0b99e0603505" },
  { emp_no: "9227", name: "Sydicko", designation: "Team Member Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Kalapushe Ngonekesho", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187429227-Sydicko.png?alt=media&token=2a30d921-5b08-4255-8ea4-311578c79e60" },
  { emp_no: "4767", name: "Trevor Langenhoven", designation: "Foreman Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Herman Karsten", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187476758-TREVOR%20LANGENHOVEN.png?alt=media&token=5944a840-f039-4097-bb4e-4955aabc7e2c" },
  { emp_no: "3094", name: "Verenique Ward", designation: "HR Officer", department: "Finance & Admin", sub_department: "HR", reports_to: "Wiana Groenewald", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772188630945-VERENIQUE%20WARD.png?alt=media&token=3fce3538-feb9-4742-b1f0-026fdde254a8" },
  { emp_no: "7779", name: "Wayne Maasdorp", designation: "Foreman Marine Outfitting", department: "Projects", sub_department: "Marine Outfitting", reports_to: "Herman Karsten", avatar_url: "https://firebasestorage.googleapis.com/v0/b/studio-9450480546-a2cc7.firebasestorage.app/o/avatars%2FDOHGWC3045VwqDVTIipfwEqjDT32%2F1772187677794-WAYNE%20MAASDORP.png?alt=media&token=037cf86b-3bbd-43ae-b609-43354797deb5" }
];

async function seed() {
  console.log(`Seeding ${employees.length} employees with full names...`);
  const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#3b82f6', '#ef4444', '#14b8a6'];
  
  for (const emp of employees) {
    const id = 'emp_' + emp.emp_no;
    // Generate initials for the avatar
    const initials = emp.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const finalEmp = {
        ...emp,
        id,
        avatar: initials,
        color: color,
        role: emp.designation
    };
    
    await db.ref('employees/' + id).set(finalEmp);
    console.log(`Updated [${emp.emp_no}]: ${emp.name}`);
  }
  console.log('Bulk seeding complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});

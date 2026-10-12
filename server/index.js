import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const PORT = 4000
const JWT_SECRET = 'careconnect_v2_academic_secret'
const serverDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(serverDir, 'data')
fs.mkdirSync(dataDir, { recursive: true })
const db = new Database(path.join(dataDir, 'careconnect.db'))
db.pragma('foreign_keys = ON')
db.pragma('journal_mode = WAL')
app.use(cors())
app.use(express.json())

const pad = n => String(n).padStart(2, '0')
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
const nowMinutes = () => { const d = new Date(); return d.getHours()*60 + d.getMinutes() }
const toMinutes = t => { const [h,m] = t.split(':').map(Number); return h*60+m }
const formatTime = mins => `${pad(Math.floor(mins/60))}:${pad(mins%60)}`
const dateTime = (date,time) => new Date(`${date}T${time}:00`)

/* ================= DATABASE ================= */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('patient','doctor','admin')),
 phone TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS patient_profiles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER UNIQUE NOT NULL,
 blood_group TEXT DEFAULT '',
 allergies TEXT DEFAULT '',
 conditions TEXT DEFAULT '',
 emergency_contact TEXT DEFAULT '',
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS doctors (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER UNIQUE NOT NULL,
 specialty TEXT NOT NULL,
 license TEXT DEFAULT '',
 bio TEXT DEFAULT '',
 experience INTEGER DEFAULT 0,
 consultation_fee INTEGER DEFAULT 0,
 slot_duration INTEGER DEFAULT 30,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS doctor_schedule (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 doctor_id INTEGER NOT NULL,
 weekday INTEGER NOT NULL,
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 FOREIGN KEY(doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
 UNIQUE(doctor_id, weekday, start_time, end_time)
);
CREATE TABLE IF NOT EXISTS appointments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 patient_id INTEGER NOT NULL,
 doctor_id INTEGER NOT NULL,
 appointment_date TEXT NOT NULL,
 appointment_time TEXT NOT NULL,
 mode TEXT DEFAULT 'video' CHECK(mode IN ('video','clinic')),
 reason TEXT DEFAULT '',
 status TEXT DEFAULT 'pending' CHECK(status IN ('pending','confirmed','completed','cancelled')),
 notes TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS medical_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 patient_id INTEGER NOT NULL,
 appointment_id INTEGER,
 condition TEXT NOT NULL,
 description TEXT DEFAULT '',
 diagnosed_date TEXT DEFAULT '',
 FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS prescriptions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 patient_id INTEGER NOT NULL,
 doctor_id INTEGER NOT NULL,
 appointment_id INTEGER,
 medicine TEXT NOT NULL,
 dosage TEXT DEFAULT '',
 instructions TEXT DEFAULT '',
 duration TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(patient_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
 FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 appointment_id INTEGER NOT NULL,
 sender_id INTEGER NOT NULL,
 message TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
 FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
);
`)

/* ================= SEED ================= */
function seed(){
 const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c
 if(userCount>0) return
 const pw = bcrypt.hashSync('password123', 10)
 const addUser = db.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?)')
 const addDoctor = db.prepare('INSERT INTO doctors(user_id,specialty,license,bio,experience,consultation_fee,slot_duration) VALUES(?,?,?,?,?,?,?)')
 const addSchedule = db.prepare('INSERT INTO doctor_schedule(doctor_id,weekday,start_time,end_time) VALUES(?,?,?,?)')
 const patient = addUser.run('Demo Patient','patient@demo.com',pw,'patient').lastInsertRowid
 addUser.run('Admin User','admin@demo.com',pw,'admin')
 db.prepare('INSERT INTO patient_profiles(user_id) VALUES(?)').run(patient)
 const doctors = [
  {name:'Dr. Ananya Rao',email:'ananya.rao@careconnect.demo',specialty:'Cardiology',exp:12,fee:800,license:'CC-CARD-1001',bio:'Cardiology consultations with a focus on preventive heart care.',days:[1,3,5],hours:['09:00','13:00']},
  {name:'Dr. Vikram Menon',email:'vikram.menon@careconnect.demo',specialty:'Dermatology',exp:9,fee:650,license:'CC-DERM-1002',bio:'Dermatology and skin health consultations.',days:[2,4],hours:['10:00','17:00']},
  {name:'Dr. Meera Iyer',email:'meera.iyer@careconnect.demo',specialty:'General Medicine',exp:15,fee:500,license:'CC-GEN-1003',bio:'General medicine and routine follow-up care.',days:[1,2,3,4,5],hours:['09:00','15:00']},
  {name:'Dr. Rahul Shah',email:'rahul.shah@careconnect.demo',specialty:'Neurology',exp:11,fee:900,license:'CC-NEU-1004',bio:'Neurology consultations and follow-up management.',days:[2,5],hours:['10:00','16:00']}
 ]
 for(const d of doctors){
  const uid = addUser.run(d.name,d.email,pw,'doctor').lastInsertRowid
  const did = addDoctor.run(uid,d.specialty,d.license,d.bio,d.exp,d.fee,30).lastInsertRowid
  for(const weekday of d.days) addSchedule.run(did,weekday,d.hours[0],d.hours[1])
 }
 console.log('Fresh CareConnect database seeded.')
 console.log('Patient: patient@demo.com / password123')
 console.log('Doctor accounts:')
 doctors.forEach(d=>console.log(`  ${d.email} / password123`))
 console.log('Admin: admin@demo.com / password123')
}
seed()

/* ================= HELPERS ================= */
function publicUser(id){
 const u=db.prepare('SELECT id,name,email,role,phone,created_at FROM users WHERE id=?').get(id)
 if(!u) return null
 if(u.role==='doctor'){
  const doctor=db.prepare('SELECT * FROM doctors WHERE user_id=?').get(id)
  return {...u,doctor}
 }
 return u
}
function auth(req,res,next){
 const h=req.headers.authorization
 if(!h) return res.status(401).json({error:'Authentication required'})
 try{ req.user=jwt.verify(h.replace('Bearer ',''),JWT_SECRET); next() }
 catch{ return res.status(401).json({error:'Invalid or expired token'}) }
}
function role(...roles){ return (req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Access denied'}) }
function doctorForUser(userId){ return db.prepare('SELECT * FROM doctors WHERE user_id=?').get(userId) }
function scheduleForDoctor(doctorId, date){
 const weekday = new Date(`${date}T12:00:00`).getDay()
 return db.prepare('SELECT * FROM doctor_schedule WHERE doctor_id=? AND weekday=? ORDER BY start_time').all(doctorId,weekday)
}
function appointmentAllowedTime(appointment){
 const target=dateTime(appointment.appointment_date,appointment.appointment_time)
 const end=new Date(target.getTime()+30*60000)
 const now=new Date()
 return now>=target && now<=end
}
function slotList(doctor,date){
 const schedules=scheduleForDoctor(doctor.id,date)
 const booked=db.prepare(`SELECT appointment_time FROM appointments WHERE doctor_id=? AND appointment_date=? AND status IN ('pending','confirmed')`).all(doctor.id,date).map(x=>x.appointment_time)
 const result=[]
 for(const s of schedules){
  for(let m=toMinutes(s.start_time);m+doctor.slot_duration<=toMinutes(s.end_time);m+=doctor.slot_duration){
   const time=formatTime(m)
   const bookedHere=booked.includes(time)
   result.push({time,available:!bookedHere})
  }
 }
 return result
}
function appointmentView(a){
 return {...a,
  patientName:a.patient_name||undefined,
  doctorName:a.doctor_name||undefined,
  specialty:a.specialty||undefined,
  doctorEmail:a.doctor_email||undefined,
  patientEmail:a.patient_email||undefined
 }
}

/* ================= AUTH ================= */
app.get('/',(req,res)=>res.json({message:'CareConnect API is running',status:'success'}))
app.post('/api/auth/register',async(req,res)=>{
 try{
  const {name,email,password,role='patient',phone='',specialty='General Medicine',license='',bio='',experience=0,consultation_fee=0}=req.body
  if(!name||!email||!password) return res.status(400).json({error:'Name, email and password are required'})
  if(!['patient','doctor'].includes(role)) return res.status(400).json({error:'Invalid role'})
  if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) return res.status(409).json({error:'Email already registered'})
  const hash=await bcrypt.hash(password,10)
  const uid=db.prepare('INSERT INTO users(name,email,password,role,phone) VALUES(?,?,?,?,?)').run(name,email,hash,role,phone).lastInsertRowid
  if(role==='patient') db.prepare('INSERT INTO patient_profiles(user_id) VALUES(?)').run(uid)
  if(role==='doctor'){
   const did=db.prepare('INSERT INTO doctors(user_id,specialty,license,bio,experience,consultation_fee,slot_duration) VALUES(?,?,?,?,?,?,?)').run(uid,specialty,license,bio,Number(experience)||0,Number(consultation_fee)||0,30).lastInsertRowid
   // Default fixed schedule: Mon-Fri 09:00-17:00. Doctor can change it later.
   for(const weekday of [1,2,3,4,5]) db.prepare('INSERT INTO doctor_schedule(doctor_id,weekday,start_time,end_time) VALUES(?,?,?,?)').run(did,weekday,'09:00','17:00')
  }
  const token=jwt.sign({id:uid,name,email,role},JWT_SECRET,{expiresIn:'7d'})
  res.status(201).json({token,user:publicUser(uid)})
 }catch(e){console.error(e);res.status(500).json({error:'Registration failed'})}
})
app.post('/api/auth/login',async(req,res)=>{
 try{
  const {email,password}=req.body
  const u=db.prepare('SELECT * FROM users WHERE email=?').get(email)
  if(!u||!(await bcrypt.compare(password,u.password))) return res.status(401).json({error:'Invalid email or password'})
  const token=jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},JWT_SECRET,{expiresIn:'7d'})
  res.json({token,user:publicUser(u.id)})
 }catch(e){console.error(e);res.status(500).json({error:'Login failed'})}
})
app.get('/api/auth/me',auth,(req,res)=>{const u=publicUser(req.user.id);u?res.json({user:u}):res.status(404).json({error:'User not found'})})

/* ================= DOCTORS + SCHEDULE ================= */
app.get('/api/doctors',auth,(req,res)=>{
 const doctors=db.prepare(`SELECT d.*,u.name,u.email,u.phone FROM doctors d JOIN users u ON u.id=d.user_id ORDER BY u.name`).all()
 res.json({doctors:doctors.map(d=>({...d,schedule:db.prepare('SELECT weekday,start_time,end_time FROM doctor_schedule WHERE doctor_id=? ORDER BY weekday,start_time').all(d.id)}))})
})
app.get('/api/doctors/:id',auth,(req,res)=>{
 const d=db.prepare(`SELECT d.*,u.name,u.email,u.phone FROM doctors d JOIN users u ON u.id=d.user_id WHERE d.id=?`).get(req.params.id)
 if(!d)return res.status(404).json({error:'Doctor not found'})
 res.json({...d,schedule:db.prepare('SELECT weekday,start_time,end_time FROM doctor_schedule WHERE doctor_id=? ORDER BY weekday,start_time').all(d.id)})
})
app.get('/api/doctors/:id/slots',auth,(req,res)=>{
 const date=req.query.date
 if(!date)return res.status(400).json({error:'Date is required'})
 const d=db.prepare('SELECT * FROM doctors WHERE id=?').get(req.params.id)
 if(!d)return res.status(404).json({error:'Doctor not found'})
 res.json({date,slots:slotList(d,date),schedule:scheduleForDoctor(d.id,date)})
})
app.get('/api/doctors/:id/schedule',auth,(req,res)=>{
 const d=db.prepare('SELECT id FROM doctors WHERE id=?').get(req.params.id)
 if(!d)return res.status(404).json({error:'Doctor not found'})
 res.json({schedule:db.prepare('SELECT * FROM doctor_schedule WHERE doctor_id=? ORDER BY weekday,start_time').all(d.id)})
})

/* ================= PATIENT PROFILE / HISTORY ================= */
app.get('/api/profile',auth,(req,res)=>{
 const u=publicUser(req.user.id)
 if(!u)return res.status(404).json({error:'User not found'})
 if(req.user.role==='patient') u.health=db.prepare('SELECT * FROM patient_profiles WHERE user_id=?').get(req.user.id)
 res.json(u)
})
app.patch('/api/profile',auth,(req,res)=>{
 const {name,phone,blood_group,allergies,conditions,emergency_contact}=req.body
 db.prepare('UPDATE users SET name=COALESCE(?,name),phone=COALESCE(?,phone) WHERE id=?').run(name||null,phone||null,req.user.id)
 if(req.user.role==='patient') db.prepare(`UPDATE patient_profiles SET blood_group=COALESCE(?,blood_group),allergies=COALESCE(?,allergies),conditions=COALESCE(?,conditions),emergency_contact=COALESCE(?,emergency_contact) WHERE user_id=?`).run(blood_group??null,allergies??null,conditions??null,emergency_contact??null,req.user.id)
 res.json(publicUser(req.user.id))
})
app.get('/api/medical-history',auth,role('patient'),(req,res)=>{
 const history=db.prepare(`SELECT mh.*,a.appointment_date,a.appointment_time,d.id doctor_id,du.name doctor_name,d.specialty FROM medical_history mh LEFT JOIN appointments a ON a.id=mh.appointment_id LEFT JOIN doctors d ON d.id=a.doctor_id LEFT JOIN users du ON du.id=d.user_id WHERE mh.patient_id=? ORDER BY COALESCE(mh.diagnosed_date,a.appointment_date) DESC`).all(req.user.id)
 const health=db.prepare('SELECT * FROM patient_profiles WHERE user_id=?').get(req.user.id)
 res.json({history,health})
})
app.get('/api/medical-history/:id',auth,role('patient','doctor','admin'),(req,res)=>{
 const h=db.prepare(`SELECT mh.*,a.appointment_date,a.appointment_time,a.reason,a.notes,d.specialty,du.name doctor_name,p.name patient_name FROM medical_history mh LEFT JOIN appointments a ON a.id=mh.appointment_id LEFT JOIN doctors d ON d.id=a.doctor_id LEFT JOIN users du ON du.id=d.user_id LEFT JOIN users p ON p.id=mh.patient_id WHERE mh.id=?`).get(req.params.id)
 if(!h)return res.status(404).json({error:'Record not found'})
 if(req.user.role==='patient' && h.patient_id!==req.user.id)return res.status(403).json({error:'Access denied'})
 res.json(h)
})

/* ================= APPOINTMENTS ================= */
app.get('/api/appointments',auth,(req,res)=>{
 let rows
 if(req.user.role==='patient') rows=db.prepare(`SELECT a.*,d.id doctor_id,d.specialty,du.name doctor_name,du.email doctor_email FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id WHERE a.patient_id=? ORDER BY a.appointment_date,a.appointment_time`).all(req.user.id)
 else if(req.user.role==='doctor'){
  const d=doctorForUser(req.user.id)
  rows=d?db.prepare(`SELECT a.*,p.name patient_name,p.email patient_email,d.specialty,du.name doctor_name,du.email doctor_email FROM appointments a JOIN users p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id WHERE a.doctor_id=? ORDER BY a.appointment_date,a.appointment_time`).all(d.id):[]
 } else rows=db.prepare(`SELECT a.*,p.name patient_name,p.email patient_email,d.specialty,du.name doctor_name,du.email doctor_email FROM appointments a JOIN users p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id ORDER BY a.appointment_date,a.appointment_time`).all()
 res.json({appointments:rows.map(appointmentView)})
})
app.post('/api/appointments',auth,role('patient'),(req,res)=>{
 try{
  const {doctor_id,appointment_date,appointment_time,mode='video',reason=''}=req.body
  if(!doctor_id||!appointment_date||!appointment_time)return res.status(400).json({error:'Doctor, date and time are required'})
  if(appointment_date<todayISO())return res.status(400).json({error:'Appointment date must be today or later'})
  const doctor=db.prepare('SELECT * FROM doctors WHERE id=?').get(doctor_id)
  if(!doctor)return res.status(404).json({error:'Doctor not found'})
  const slot=slotList(doctor,appointment_date).find(s=>s.time===appointment_time)
  if(!slot)return res.status(400).json({error:'That time is outside this doctor’s schedule'})
  if(!slot.available)return res.status(409).json({error:'That slot is already booked'})
  const result=db.prepare(`INSERT INTO appointments(patient_id,doctor_id,appointment_date,appointment_time,mode,reason,status) VALUES(?,?,?,?,?,?,'pending')`).run(req.user.id,doctor_id,appointment_date,appointment_time,mode,reason)
  res.status(201).json({appointment:db.prepare('SELECT * FROM appointments WHERE id=?').get(result.lastInsertRowid),message:'Appointment request sent to the doctor'})
 }catch(e){console.error(e);res.status(500).json({error:'Could not create appointment'})}
})
app.patch('/api/appointments/:id',auth,(req,res)=>{
 const a=db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id)
 if(!a)return res.status(404).json({error:'Appointment not found'})
 const d=doctorForUser(req.user.id)
 const allowedPatient=req.user.role==='patient'&&a.patient_id===req.user.id
 const allowedDoctor=req.user.role==='doctor'&&d&&a.doctor_id===d.id
 if(!allowedPatient&&!allowedDoctor&&req.user.role!=='admin')return res.status(403).json({error:'Access denied'})
 const {status,notes}=req.body
 if(!['pending','confirmed','completed','cancelled'].includes(status))return res.status(400).json({error:'Invalid status'})
 if(req.user.role==='patient' && !['cancelled'].includes(status))return res.status(403).json({error:'Patients can only cancel an appointment'})
 if(req.user.role==='doctor' && status==='confirmed'){
  const conflict=db.prepare(`SELECT id,appointment_time FROM appointments WHERE doctor_id=? AND appointment_date=? AND id<>? AND status IN ('pending','confirmed')`).get(a.doctor_id,a.appointment_date,a.id)
  // Exact slot conflicts are already blocked at booking; this extra check keeps the acceptance flow safe.
  if(conflict&&conflict.appointment_time===a.appointment_time)return res.status(409).json({error:`This slot conflicts with another appointment at ${conflict.appointment_time}.`})
 }
 db.prepare('UPDATE appointments SET status=?,notes=COALESCE(?,notes) WHERE id=?').run(status,notes??null,a.id)
 res.json({appointment:db.prepare('SELECT * FROM appointments WHERE id=?').get(a.id)})
})
app.post('/api/appointments/:id/complete',auth,role('doctor'),(req,res)=>{
 const a=db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id), d=doctorForUser(req.user.id)
 if(!a||!d||a.doctor_id!==d.id)return res.status(404).json({error:'Appointment not found'})
 if(a.status!=='confirmed')return res.status(400).json({error:'Only confirmed appointments can be completed'})
 db.prepare('UPDATE appointments SET status=\'completed\',notes=? WHERE id=?').run(req.body.notes||a.notes,a.id)
 if(req.body.condition){db.prepare('INSERT INTO medical_history(patient_id,appointment_id,condition,description,diagnosed_date) VALUES(?,?,?,?,?)').run(a.patient_id,a.id,req.body.condition,req.body.description||'',a.appointment_date)}
 res.json({appointment:db.prepare('SELECT * FROM appointments WHERE id=?').get(a.id)})
})

/* ================= DASHBOARD STATS ================= */
app.get('/api/dashboard',auth,(req,res)=>{
 const today=todayISO(), month=today.slice(0,7)
 if(req.user.role==='patient'){
  const upcoming=db.prepare(`SELECT COUNT(*) c FROM appointments WHERE patient_id=? AND appointment_date>=? AND status IN ('pending','confirmed')`).get(req.user.id,today).c
  const tele=db.prepare(`SELECT COUNT(*) c FROM appointments WHERE patient_id=? AND mode='video'`).get(req.user.id).c
  const prescriptions=db.prepare('SELECT COUNT(*) c FROM prescriptions WHERE patient_id=?').get(req.user.id).c
  const completed=db.prepare(`SELECT COUNT(*) c FROM appointments WHERE patient_id=? AND status='completed' AND appointment_date=?`).get(req.user.id,today).c
  res.json({upcoming,teleconsultations:tele,prescriptions,todayVisits:completed})
 } else if(req.user.role==='doctor'){
  const d=doctorForUser(req.user.id)
  const todayVisits=db.prepare(`SELECT COUNT(*) c FROM appointments WHERE doctor_id=? AND appointment_date=? AND status='completed'`).get(d.id,today).c
  const patients=db.prepare(`SELECT COUNT(DISTINCT patient_id) c FROM appointments WHERE doctor_id=?`).get(d.id).c
  const pending=db.prepare(`SELECT COUNT(*) c FROM appointments WHERE doctor_id=? AND status='pending'`).get(d.id).c
  const prescriptions=db.prepare(`SELECT COUNT(*) c FROM prescriptions WHERE doctor_id=? AND substr(created_at,1,7)=?`).get(d.id,month).c
  res.json({todayVisits,patients,pending,prescriptions})
 } else {
  res.json({users:db.prepare('SELECT COUNT(*) c FROM users').get().c,patients:db.prepare("SELECT COUNT(*) c FROM users WHERE role='patient'").get().c,doctors:db.prepare("SELECT COUNT(*) c FROM users WHERE role='doctor'").get().c,appointments:db.prepare('SELECT COUNT(*) c FROM appointments').get().c,completed:db.prepare("SELECT COUNT(*) c FROM appointments WHERE status='completed'").get().c,prescriptions:db.prepare('SELECT COUNT(*) c FROM prescriptions').get().c})
 }
})

/* ================= PATIENTS ================= */
app.get('/api/patients',auth,role('doctor','admin'),(req,res)=>{
 const d=doctorForUser(req.user.id)
 let patients
 if(req.user.role==='doctor') patients=db.prepare(`SELECT DISTINCT u.id,u.name,u.email,u.phone FROM users u JOIN appointments a ON a.patient_id=u.id WHERE u.role='patient' AND a.doctor_id=? ORDER BY u.name`).all(d.id)
 else patients=db.prepare("SELECT id,name,email,phone FROM users WHERE role='patient' ORDER BY name").all()
 res.json({patients})
})
app.get('/api/patients/:id/records',auth,role('doctor','admin','patient'),(req,res)=>{
 const pid=Number(req.params.id)
 if(req.user.role==='patient'&&req.user.id!==pid)return res.status(403).json({error:'Access denied'})
 const patient=db.prepare("SELECT id,name,email,phone FROM users WHERE id=? AND role='patient'").get(pid)
 if(!patient)return res.status(404).json({error:'Patient not found'})
 const history=db.prepare(`SELECT mh.*,a.appointment_date,a.appointment_time,d.specialty,du.name doctor_name FROM medical_history mh LEFT JOIN appointments a ON a.id=mh.appointment_id LEFT JOIN doctors d ON d.id=a.doctor_id LEFT JOIN users du ON du.id=d.user_id WHERE mh.patient_id=? ORDER BY COALESCE(mh.diagnosed_date,a.appointment_date) DESC`).all(pid)
 const appointments=db.prepare(`SELECT a.*,d.specialty,du.name doctor_name FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id WHERE a.patient_id=? ORDER BY a.appointment_date DESC,a.appointment_time DESC`).all(pid)
 const prescriptions=db.prepare(`SELECT p.*,d.specialty,du.name doctor_name FROM prescriptions p JOIN doctors d ON d.id=p.doctor_id JOIN users du ON du.id=d.user_id WHERE p.patient_id=? ORDER BY p.created_at DESC`).all(pid)
 res.json({patient,history,appointments,prescriptions})
})

/* ================= PRESCRIPTIONS ================= */
app.get('/api/prescriptions',auth,(req,res)=>{
 let rows
 if(req.user.role==='patient') rows=db.prepare(`SELECT p.*,d.specialty,du.name doctor_name,du.email doctor_email FROM prescriptions p JOIN doctors d ON d.id=p.doctor_id JOIN users du ON du.id=d.user_id WHERE p.patient_id=? ORDER BY p.created_at DESC`).all(req.user.id)
 else if(req.user.role==='doctor'){const d=doctorForUser(req.user.id);rows=db.prepare(`SELECT p.*,d.specialty,pu.name patient_name,pu.email patient_email,du.name doctor_name FROM prescriptions p JOIN doctors d ON d.id=p.doctor_id JOIN users pu ON pu.id=p.patient_id JOIN users du ON du.id=d.user_id WHERE p.doctor_id=? ORDER BY p.created_at DESC`).all(d.id)}
 else rows=db.prepare(`SELECT p.*,pu.name patient_name,du.name doctor_name,d.specialty FROM prescriptions p JOIN users pu ON pu.id=p.patient_id JOIN doctors d ON d.id=p.doctor_id JOIN users du ON du.id=d.user_id ORDER BY p.created_at DESC`).all()
 res.json({prescriptions:rows})
})
app.post('/api/prescriptions',auth,role('doctor'),(req,res)=>{
 const d=doctorForUser(req.user.id)
 const {patient_id,appointment_id=null,medicine,dosage='',instructions='',duration=''}=req.body
 if(!patient_id||!medicine)return res.status(400).json({error:'Patient and medicine are required'})
 if(appointment_id){const a=db.prepare('SELECT * FROM appointments WHERE id=?').get(appointment_id);if(!a||a.doctor_id!==d.id||a.patient_id!==Number(patient_id))return res.status(400).json({error:'Appointment does not belong to this doctor and patient'})}
 const id=db.prepare(`INSERT INTO prescriptions(patient_id,doctor_id,appointment_id,medicine,dosage,instructions,duration) VALUES(?,?,?,?,?,?,?)`).run(patient_id,d.id,appointment_id,medicine,dosage,instructions,duration).lastInsertRowid
 res.status(201).json({prescription:db.prepare('SELECT * FROM prescriptions WHERE id=?').get(id)})
})
app.get('/api/prescriptions/:id',auth,(req,res)=>{
 const p=db.prepare(`SELECT p.*,pu.name patient_name,pu.email patient_email,du.name doctor_name,du.email doctor_email,d.specialty,d.license FROM prescriptions p JOIN users pu ON pu.id=p.patient_id JOIN doctors d ON d.id=p.doctor_id JOIN users du ON du.id=d.user_id WHERE p.id=?`).get(req.params.id)
 if(!p)return res.status(404).json({error:'Prescription not found'})
 if(req.user.role==='patient'&&p.patient_id!==req.user.id)return res.status(403).json({error:'Access denied'})
 if(req.user.role==='doctor'){const d=doctorForUser(req.user.id);if(!d||p.doctor_id!==d.id)return res.status(403).json({error:'Access denied'})}
 res.json(p)
})

/* ================= TELEMEDICINE / CHAT ================= */
app.get('/api/consultations',auth,(req,res)=>{
 let rows
 if(req.user.role==='patient') rows=db.prepare(`SELECT a.*,d.specialty,du.name doctor_name FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id WHERE a.patient_id=? AND a.mode='video' ORDER BY a.appointment_date DESC,a.appointment_time DESC`).all(req.user.id)
 else if(req.user.role==='doctor'){const d=doctorForUser(req.user.id);rows=db.prepare(`SELECT a.*,p.name patient_name,d.specialty FROM appointments a JOIN users p ON p.id=a.patient_id JOIN doctors d ON d.id=a.doctor_id WHERE a.doctor_id=? AND a.mode='video' ORDER BY a.appointment_date DESC,a.appointment_time DESC`).all(d.id)}
 else rows=[]
 res.json({consultations:rows})
})
app.get('/api/consultations/:id/access',auth,(req,res)=>{
 const a=db.prepare(`SELECT a.*,d.specialty,du.name doctor_name,du.email doctor_email,p.name patient_name FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id JOIN users p ON p.id=a.patient_id WHERE a.id=?`).get(req.params.id)
 if(!a)return res.status(404).json({error:'Consultation not found'})
 const d=doctorForUser(req.user.id)
 const allowed=req.user.role==='admin'||(req.user.role==='patient'&&a.patient_id===req.user.id)||(req.user.role==='doctor'&&d&&a.doctor_id===d.id)
 if(!allowed)return res.status(403).json({error:'Access denied'})
 const start=dateTime(a.appointment_date,a.appointment_time)
 const end=new Date(start.getTime()+30*60000)
 const now=new Date()
 const canJoin=a.status==='confirmed'&&now>=start&&now<=end
 let reason=''
 if(a.status!=='confirmed')reason='The doctor must accept this appointment before the consultation room opens.'
 else if(now<start)reason=`The room opens at ${a.appointment_time} on ${a.appointment_date}.`
 else if(now>end)reason='This consultation window has ended.'
 res.json({appointment:a,canJoin,reason,start:start.toISOString(),end:end.toISOString()})
})
app.get('/api/consultations/:id/messages',auth,(req,res)=>{
 const a=db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id),d=doctorForUser(req.user.id)
 if(!a)return res.status(404).json({error:'Appointment not found'})
 const allowed=req.user.role==='patient'&&a.patient_id===req.user.id||req.user.role==='doctor'&&d&&a.doctor_id===d.id||req.user.role==='admin'
 if(!allowed)return res.status(403).json({error:'Access denied'})
 res.json({messages:db.prepare(`SELECT m.*,u.name sender_name,u.role sender_role FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.appointment_id=? ORDER BY m.created_at`).all(a.id)})
})
app.post('/api/consultations/:id/messages',auth,(req,res)=>{
 const a=db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id),d=doctorForUser(req.user.id)
 if(!a)return res.status(404).json({error:'Appointment not found'})
 const allowed=req.user.role==='patient'&&a.patient_id===req.user.id||req.user.role==='doctor'&&d&&a.doctor_id===d.id
 if(!allowed)return res.status(403).json({error:'Access denied'})
 if(!req.body.message?.trim())return res.status(400).json({error:'Message cannot be empty'})
 const id=db.prepare('INSERT INTO messages(appointment_id,sender_id,message) VALUES(?,?,?)').run(a.id,req.user.id,req.body.message.trim()).lastInsertRowid
 res.status(201).json({message:db.prepare('SELECT m.*,u.name sender_name,u.role sender_role FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?').get(id)})
})

/* ================= ADMIN ================= */
app.get('/api/admin/stats',auth,role('admin'),(req,res)=>{
 res.json({users:db.prepare('SELECT COUNT(*) c FROM users').get().c,patients:db.prepare("SELECT COUNT(*) c FROM users WHERE role='patient'").get().c,doctors:db.prepare("SELECT COUNT(*) c FROM users WHERE role='doctor'").get().c,appointments:db.prepare('SELECT COUNT(*) c FROM appointments').get().c,completed:db.prepare("SELECT COUNT(*) c FROM appointments WHERE status='completed'").get().c,prescriptions:db.prepare('SELECT COUNT(*) c FROM prescriptions').get().c})
})
app.get('/api/admin/users',auth,role('admin'),(req,res)=>res.json({users:db.prepare('SELECT id,name,email,role,phone,created_at FROM users ORDER BY created_at DESC').all()}))

app.use((err,req,res,next)=>{console.error('SERVER ERROR:',err);res.status(500).json({error:'Internal server error'})})
app.listen(PORT,()=>console.log(`CareConnect API running on http://localhost:${PORT}`))

# CareConnect — Healthcare Appointment & Telemedicine System

Professional React + Express + SQLite academic prototype for healthcare appointments, telemedicine, patient records and doctor prescriptions.

## What is functional in this version

### Patient
- Own dashboard only: upcoming, teleconsultations, prescriptions and completed-today counts are calculated from the database.
- Find real doctor accounts and see each doctor's fixed weekly schedule.
- Book only available 30-minute slots.
- Appointment requests start as `pending` and require doctor approval.
- Cancel own pending/confirmed appointments.
- Consultation room is locked until the exact confirmed appointment window.
- Patient-specific medical history and editable health summary.
- View individual clinical records.
- View and download patient-specific prescriptions.

### Doctor
- Separate account for every doctor with a unique email address.
- Dashboard statistics are calculated from actual appointments/prescriptions.
- Fixed recurring schedule for every doctor.
- Accept or decline appointment requests.
- Exact slot collisions are blocked.
- Same-day earlier appointments are shown as a reminder before accepting.
- Mark confirmed appointments completed and add clinical notes/conditions.
- Patient list is built from actual appointments.
- Longitudinal patient record shows appointments, history and prescriptions.
- Create prescriptions for a specific patient and optionally link them to a specific appointment.
- Download prescription records.
- Telemedicine room is available only during the booked 30-minute window.

### Admin
- Live user, doctor, patient, appointment, completion and prescription totals.

## Demo accounts

Patient:
- `patient@demo.com` / `password123`

Doctors:
- `ananya.rao@careconnect.demo` / `password123`
- `vikram.menon@careconnect.demo` / `password123`
- `meera.iyer@careconnect.demo` / `password123`
- `rahul.shah@careconnect.demo` / `password123`

Admin:
- `admin@demo.com` / `password123`

Each doctor is a separate account. The login email must exactly match that doctor's registered email.

## Run

Use Node.js 24 with the included `better-sqlite3` 13.x dependency.

```bash
npm run install:all
npm run dev
```

Frontend: http://localhost:5173
API: http://localhost:4000

### Important when upgrading from the earlier build

This version uses a new database at:

`server/data/careconnect.db`

You do not need to preserve the old demo database. The new database is seeded with users/doctors only, so the dashboard starts with zero appointments, zero prescriptions and zero completed visits instead of fake statistics.

## Doctor fixed schedules used by the demo

- Dr. Ananya Rao — Mon/Wed/Fri, 09:00–13:00
- Dr. Vikram Menon — Tue/Thu, 10:00–17:00
- Dr. Meera Iyer — Mon–Fri, 09:00–15:00
- Dr. Rahul Shah — Tue/Fri, 10:00–16:00

Slots are 30 minutes.

## Academic prototype note

The telemedicine screen demonstrates appointment-time access control and chat. A real clinical deployment would require an approved secure video provider, proper privacy/security controls, audit logging, consent, and applicable healthcare compliance.

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const app = express();
const PORT = 3000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serves your index.html
app.use('/uploads', express.static('uploads')); // Serves the files

// --- DATABASE ---
const db = new sqlite3.Database('./projecthub.db', (err) => {
    if (err) console.error("DB Error:", err.message);
    else console.log('Connected to SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        course TEXT,
        description TEXT,
        file_path TEXT,
        status TEXT DEFAULT 'Under Review',
        date TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

// --- UPLOADS ---
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage: storage });

// --- ROUTES ---

// 1. Auth
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 8);
    db.run(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`, [name, email, hashedPassword], function(err) {
        if (err) return res.status(400).json({ error: "Email exists" });
        res.json({ id: this.lastID, name, email });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: "Invalid credentials" });
        res.json({ id: user.id, name: user.name, email: user.email });
    });
});

// 2. Student Actions
app.post('/api/submit', upload.single('projectFile'), (req, res) => {
    const { userId, title, course, description } = req.body;
    if (!req.file) return res.status(400).json({ error: "No file" });
    
    db.run(`INSERT INTO projects (user_id, title, course, description, file_path, date) VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, title, course, description, req.file.path, new Date().toISOString().split('T')[0]],
        (err) => err ? res.status(500).json({ error: err.message }) : res.json({ message: "Success" })
    );
});

app.get('/api/submissions/:userId', (req, res) => {
    db.all(`SELECT * FROM projects WHERE user_id = ? ORDER BY id DESC`, [req.params.userId], (err, rows) => {
        res.json(rows || []);
    });
});

// 3. Teacher Actions (Fixes "Error loading data")
app.get('/api/admin/submissions', (req, res) => {
    db.all(`SELECT projects.*, users.name as student_name, users.email FROM projects JOIN users ON projects.user_id = users.id ORDER BY projects.id DESC`, [], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/admin/update-status', (req, res) => {
    db.run(`UPDATE projects SET status = ? WHERE id = ?`, [req.body.status, req.body.projectId], (err) => {
        res.json({ success: true });
    });
});

// Start Server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
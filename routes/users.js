const formidable = require("formidable");
const bcrypt = require("bcrypt");
const db = require("../db");
const {generateId} = require('../utils/idUserGenerator')

function loginUser(req, res) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        const email = fields.email;
        const password = fields.password;

        // Required fields check
        if (!email || !password) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ error: "Email နှင့် Password ကို ထည့်သွင်းပေးပါ" })
            );
        }

        // Check email exists
        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, rows) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Database error" }));
            }

            if (rows.length === 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Email မမှန်ကန်ပါ" }));
            }

            const user = rows[0];

            // Compare hashed password
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Password မမှန်ကန်ပါ" }));
            }

            // Login Success
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(
                JSON.stringify({
                    message: "Login အောင်မြင်ပါသည်",
                    userId: user.id,
                    name: user.name,
                    email: user.email,
                })
            );
        });
    });
}

function createUsers(req, res) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err)
        return res.status(400).json({ error: "Form parse error" });

        const name = fields.name;
        const email = fields.email;
        const phone = fields.phone;
        const password = fields.password;

        if (!name || !email || !phone || !password) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
            JSON.stringify({ error: "ထည့်သွင်းပေးရမည့် အချက်အလက်များ မပြည့်စုံပါ" })
        );
        }

        // 🔍 CHECK DUPLICATE EMAIL
        db.query("SELECT email FROM users WHERE email = ?", [email], async (err, rows) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        if (rows.length > 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်" }));
        }

        try {
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Generate auto ID
            generateId(db, (err, newId) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "ID generation failed" }));
            }

            const sql = `
                INSERT INTO users (id, name, email, phone, password)
                VALUES (?, ?, ?, ?, ?)
            `;

            db.query(
                sql,
                [newId, name, email, phone, hashedPassword],
                (err, result) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                    res.end(JSON.stringify({ message: "အသုံးပြုသူ ဖန်တီးပြီးပါပြီ" }));
                }
            );
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
        });
    });
}

function getUsers(req, res) {
  const sql = "SELECT id, name, email, phone, photo, location, status, created_at FROM users";

  db.query(sql, (err, results) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Database error", details: err }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(results));
  });
}

module.exports = {
    loginUser,
    createUsers,
    getUsers
};
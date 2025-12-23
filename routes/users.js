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
                    userId: user.id
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
  const sql = "SELECT id, name, email, phone, photo, location, status, created_at FROM users ORDER BY created_at DESC";

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

function getUsersById(req, res, id) {
    const sql = `
        SELECT id AS userId, users.*
        FROM users
        WHERE id = ?
        LIMIT 1
    `;

    db.query(sql, [id], (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        if (results.length === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "User ရှာမတွေ့ပါ" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    });
}

function changeStatus(req, res, id) {
    const userId = id;

    if (!userId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing user id" }));
    }

    // 1. Get current status
    db.query("SELECT status FROM users WHERE id = ?", [userId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "User not found" }));
        }

        const currentStatus = result[0].status;

        // 2. Toggle status
        const newStatus = currentStatus === "active" ? "warning" : "active";

        // 3. Update status
        db.query("UPDATE users SET status = ? WHERE id = ?", [newStatus, userId], (updateErr) => {
            if (updateErr) {
                return res.writeHead(500, { "Content-Type": "application/json" })
                .end(JSON.stringify({ error: "Update failed" }));
            }

            return res.writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({
                message: `Status ကို ${newStatus} အဖြစ် သတ်မှတ်လိုက်ပါပြီ`,
            }));
        });
    });
}

function deleteUser(req, res, id) {
    const userId = id;

    if (!userId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing user id" }));
    }

    // Check if user exists
    db.query("SELECT id FROM users WHERE id = ?", [userId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "User not found" }));
        }

        // If exists → delete
        db.query("DELETE FROM users WHERE id = ?", [userId], (deleteErr) => {
            if (deleteErr) {
                return res.writeHead(500, { "Content-Type": "application/json" })
                .end(JSON.stringify({ error: "Delete failed" }));
            }

            return res.writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({
                message: "User အကောင့်ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ",
                deletedId: userId
            }));
        });
    });
}

module.exports = {
    loginUser,
    createUsers,
    getUsers,
    changeStatus,
    deleteUser,
    getUsersById
};
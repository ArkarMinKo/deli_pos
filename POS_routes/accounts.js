const formidable = require("formidable");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const db = require("../dbForPOS")

const { generateId } = require("../POS_utils/idAccountsGenerator");
const { generatePhotoName } = require("../POS_utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../account_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function loginAccount(req, res) {
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
                JSON.stringify({ success: false, error: "Email နှင့် Password ကို ထည့်သွင်းပေးပါ" })
            );
        }

        // Check email exists
        db.query("SELECT * FROM accounts WHERE email = ?", [email], async (err, rows) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: false, error: "Database error" }));
            }

            if (rows.length === 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: false, error: "Email မမှန်ကန်ပါ" }));
            }

            const account = rows[0];

            // Compare hashed password
            const isMatch = await bcrypt.compare(password, account.password);

            if (!isMatch) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: false, error: "Password မမှန်ကန်ပါ" }));
            }

            // Login Success
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(
                JSON.stringify({
                    success: true,
                    message: "Login အောင်မြင်ပါသည်",
                    accountId: account.id,
                    accountRole: account.role
                })
            );
        });
    });
}

function createAccounts(req, res) {
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        const username = String(fields.username || "");
        const email = String(fields.email || "");
        const password = String(fields.password || "");
        const phone = String(fields.phone || "");

        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;

        if (!username || !email || !password || !phone) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "လိုအပ်သော အချက်အလက်များ မပြည့်စုံပါ" }));
        }

        // 🔍 1️⃣ Check duplicate email
        const checkEmailSQL = "SELECT email FROM accounts WHERE email = ?";
        db.query(checkEmailSQL, [email], (err, results) => {
            if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error", detail: err }));
            }

            if (results.length > 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်" }));
            }

            // 2️⃣ Generate new account ID
            generateId(db, async (err, newId) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "ID generation failed" }));
            }

            try {
                // 3️⃣ Hash password
                const hashedPassword = await bcrypt.hash(password, 10);

                let photoName = null;
                    if (photoFile?.originalFilename) {
                        photoName = generatePhotoName(newId, photoFile.originalFilename);
                        fs.renameSync(photoFile.filepath, path.join(UPLOAD_DIR, photoName));
                    }

                // 5️⃣ Insert into DB
                const sql = `
                    INSERT INTO accounts
                    (id, username, email, password, photos, phone)
                    VALUES (?, ?, ?, ?, ?, ?)
                `;

                const values = [
                    newId,
                    username,
                    email,
                    hashedPassword,
                    photoName,
                    phone
                ];

                db.query(sql, values, (err, result) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Database insert failed", detail: err }));
                }

                res.writeHead(201, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Account created successfully", id: newId }));
                });

            } catch (error) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Internal server error", detail: error.message }));
            }
            });
        });
    });
}

function getAccountsById(req, res, id) {
    const accountId = id;

    const sql = `
        SELECT id, username, email, phone, photos, role, created_at
        FROM accounts
        WHERE id = ?
        LIMIT 1
    `;

    db.query(sql, [accountId], (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Database error", details: err });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "Account not found" });
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    });
}

module.exports = {
    loginAccount,
    createAccounts,
    getAccountsById
};

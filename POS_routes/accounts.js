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
                    accountRole: account.role,
                    accountName: account.username
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

function getAllAccounts(req, res) {
    const sql = `
        SELECT id, username, email, phone, photos, role, created_at
        FROM accounts
    `;

    db.query(sql, (err, results) => {
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

function putAccount(req, res, id) {
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        const username = fields.username ? String(fields.username) : null;
        const email = fields.email ? String(fields.email) : null;
        const phone = fields.phone ? String(fields.phone) : null;

        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;

        // 1️⃣ Check account exists
        const findSQL = "SELECT * FROM accounts WHERE id = ?";
        db.query(findSQL, [id], (err, results) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Database error", detail: err }));
            }
            if (results.length === 0) {
                res.writeHead(404, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Account not found" }));
            }

            const oldData = results[0];

            // 2️⃣ Check duplicate email (but ignore current account)
            if (email) {
                const checkEmailSQL = "SELECT id FROM accounts WHERE email = ? AND id != ?";
                db.query(checkEmailSQL, [email, id], (err, resultEmail) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Email check error", detail: err }));
                    }
                    if (resultEmail.length > 0) {
                        res.writeHead(400, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်သည်" }));
                    }

                    // Proceed to update photo + fields
                    updateAccountData();
                });
            } else {
                updateAccountData();
            }

            // 3️⃣ Update function
            const updateAccountData = () => {
                let newPhotoName = oldData.photos;

                if (photoFile?.originalFilename) {
                    newPhotoName = generatePhotoName(id, photoFile.originalFilename);
                    fs.renameSync(photoFile.filepath, path.join(UPLOAD_DIR, newPhotoName));
                }

                const updateSQL = `
                    UPDATE accounts
                    SET username = ?, email = ?, phone = ?, photos = ?
                    WHERE id = ?
                `;

                const values = [
                    username || oldData.username,
                    email || oldData.email,
                    phone || oldData.phone,
                    newPhotoName,
                    id
                ];

                db.query(updateSQL, values, (err, result) => {
                    if (err) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        return res.end(JSON.stringify({ error: "Database update failed", detail: err }));
                    }

                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ message: "Account updated successfully" }));
                });
            };
        });
    });
}

function deleteAccount(req, res, id) {
    // ❗ 1️⃣ Block deleting A001
    if (id === "A001") {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "A001 ကို ဖျက်ခွင့်မရှိပါ" }));
    }

    // 2️⃣ Check if account exists
    const checkSQL = "SELECT photos FROM accounts WHERE id = ?";
    db.query(checkSQL, [id], (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error", detail: err }));
        }

        if (results.length === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Account not found" }));
        }

        const photoName = results[0].photos;

        // 3️⃣ Delete account
        const deleteSQL = "DELETE FROM accounts WHERE id = ?";
        db.query(deleteSQL, [id], (err, result) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Delete failed", detail: err }));
            }

            // 4️⃣ Delete photo file if exists
            if (photoName) {
                const photoPath = path.join(UPLOAD_DIR, photoName);
                if (fs.existsSync(photoPath)) {
                    fs.unlinkSync(photoPath); // delete file
                }
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Account deleted successfully" }));
        });
    });
}

module.exports = {
    loginAccount,
    createAccounts,
    getAccountsById,
    getAllAccounts,
    putAccount,
    deleteAccount
};

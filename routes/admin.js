const formidable = require("formidable");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { generateAdminId } = require("../utils/idAdminGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../admin_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
// --- LOGIN ADMIN ---
function loginAdmin(req, res) {
  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: err.message }));
    }

    const { email, password } = fields;
    const emailStr = Array.isArray(email) ? email[0] : email;
    const passwordStr = Array.isArray(password) ? password[0] : password;

    if (!emailStr || !passwordStr) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Email နဲ့ Password တို့ထည့်ပါ" }));
    }

    const sql = "SELECT id, role, password FROM admin WHERE email = ?";
    db.query(sql, [emailStr], (err, rows) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: err.message }));
      }

      if (rows.length === 0) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "ဒီ Email နဲ့အကောင့် မတွေ့ပါ" }));
      }

      const user = rows[0];

      bcrypt.compare(passwordStr, user.password, (err, isMatch) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: err.message }));
        }

        if (!isMatch) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Password မှားနေပါသည်။ ထပ်စမ်းကြည့်ပါ" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "ဝင်ရောက်မှုအောင်မြင်ပါသည်။ ကြိုဆိုပါသည်",
            id: user.id,
            role: user.role
          })
        );
      });
    });
  });
}

// --- GET ADMIN ---
function getAdmins(req, res) {
    const sql = `
        SELECT id, name, photo, email, phone, gender, role
        FROM admin
        ORDER BY id DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: results }));
    });
}

// GET ADMIN BY ID
function getAdminsById(req, res, id) {
    const sql = `
        SELECT id, name, photo, email, phone, gender, role
        FROM admin where id = ?
        ORDER BY id DESC
    `;

    db.query(sql, id, (err, results) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true, data: results }));
    });
}

// --- CREATE ADMIN ---
function createAdmin(req, res) {
    const form = new formidable.IncomingForm({ multiples: false, uploadDir: UPLOAD_DIR, keepExtensions: true });

    generateAdminId(db, (idErr, newId) => {
        if (idErr) return res.end(JSON.stringify({ error: idErr.message }));

        form.parse(req, async (err, fields, files) => {
            if (err) return res.end(JSON.stringify({ error: err.message }));

            const { name, password, passcode, email, phone, gender, role } = fields;
            const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;
            const nameStr = (Array.isArray(name) ? name[0] : name)?.trim();
            const passwordStr = (Array.isArray(password) ? password[0] : password)?.trim();
            const passcodeStr = (Array.isArray(passcode) ? passcode[0] : passcode)?.trim();
            const emailStr = (Array.isArray(email) ? email[0] : email)?.trim();
            const phoneStr = (Array.isArray(phone) ? phone[0] : phone)?.trim();
            const genderStr = (Array.isArray(gender) ? gender[0] : gender)?.trim();
            const roleStr = (Array.isArray(role) ? role[0] : role)?.trim() || "admin";

            if (roleStr === "owner") {
                return res.end(JSON.stringify({ message: "Owner account ဖန်တီးခွင့်မရှိပါ" }));
            }

            if (!nameStr || !passwordStr || !emailStr || !genderStr) {
                return res.end(JSON.stringify({ message: "လိုအပ်တဲ့အချက်အလက်များ မပြည့်စုံပါ" }));
            }

            // ✅ Email unique check
            const checkEmailSql = "SELECT 1 FROM admin WHERE email = ? LIMIT 1";
            db.query(checkEmailSql, [emailStr], async (err, results) => {
                if (err) return res.end(JSON.stringify({ error: "Database error ဖြစ်နေပါသည်" }));
                if (results.length > 0) {
                    return res.end(JSON.stringify({ message: "ဒီ Email နဲ့ အကောင့်ရှိပြီးသား ဖြစ်နေပါသည်" }));
                }

                // ✅ Passcode unique check (only if passcode exists)
                if (passcodeStr) {
                    const checkPasscodeSql = "SELECT passcode FROM admin WHERE passcode IS NOT NULL";
                    db.query(checkPasscodeSql, async (err, rows) => {
                        if (err) return res.end(JSON.stringify({ error: "Database error ဖြစ်နေပါသည်" }));

                        for (const row of rows) {
                            const isPasscodeMatch = await bcrypt.compare(passcodeStr, row.passcode);
                            if (isPasscodeMatch) {
                                return res.end(JSON.stringify({ message: "ဒီ Passcode နဲ့ အကောင့်ရှိပြီးသား ဖြစ်နေပါသည်" }));
                            }
                        }

                        insertAdmin();
                    });
                } else {
                    insertAdmin();
                }

                async function insertAdmin() {
                    try {
                        const hashedPassword = await bcrypt.hash(passwordStr, 10);
                        const hashedPasscode = passcodeStr ? await bcrypt.hash(passcodeStr, 10) : null;

                        let photoName = null;
                        if (photoFile?.originalFilename) {
                            photoName = generatePhotoName(newId, photoFile.originalFilename);
                            fs.renameSync(photoFile.filepath, path.join(UPLOAD_DIR, photoName));
                        }

                        const insertSql = `
                            INSERT INTO admin (id, name, photo, password, passcode, email, phone, gender, role)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `;

                        db.query(
                            insertSql,
                            [newId, nameStr, photoName, hashedPassword, hashedPasscode, emailStr, phoneStr || null, genderStr, roleStr],
                            (err) => {
                                if (err) return res.end(JSON.stringify({ message: "အကောင့်ဖန်တီးရာတွင် ပြဿနာရှိနေပါသည်" }));
                                res.end(JSON.stringify({
                                    success: true,
                                    message: "Admin အကောင့်အသစ် ဖန်တီးပြီးပါပြီ",
                                    id: newId
                                }));
                            }
                        );
                    } catch (error) {
                        res.end(JSON.stringify({ message: "အကောင့်ဖန်တီးမှု မအောင်မြင်ပါ" }));
                    }
                }
            });
        });
    });
}

// --- DELETE ADMIN (with photo delete) ---
function deleteAdmin(req, res, id) {
    if (!id) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "Missing admin ID" }));
    }

    if (id === "A001") {
        res.statusCode = 403;
        return res.end(JSON.stringify({ message: "Owner account ကိုဖျက်ခွင့်မရှိပါ" }));
    }

    // STEP 1: Find admin first to get the photo name
    const findSql = "SELECT photo FROM admin WHERE id = ? LIMIT 1";

    db.query(findSql, [id], (err, rows) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        if (rows.length === 0) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ message: "Admin ကို မတွေ့ပါ" }));
        }

        const photoName = rows[0].photo;

        // STEP 2: Delete admin record
        const deleteSql = "DELETE FROM admin WHERE id = ? AND TRIM(id) != 'A001'";

        db.query(deleteSql, [id], (err, result) => {
            if (err) {
                res.statusCode = 500;
                return res.end(JSON.stringify({ error: err.message }));
            }

            if (result.affectedRows === 0) {
                res.statusCode = 404;
                return res.end(JSON.stringify({ message: "Admin ကို မတွေ့ပါ" }));
            }

            // STEP 3: Delete photo file
            if (photoName) {
                const photoPath = path.join(UPLOAD_DIR, photoName);
                fs.unlink(photoPath, (err) => {

                });
            }

            res.statusCode = 200;
            res.end(JSON.stringify({ success: true, message: "Admin ကို ဖျက်ပြီးပါပြီ" }));
        });
    });
}


// --- UPDATE ADMIN INFO (EXCEPT PASSWORD, PASSCODE, EMAIL) ---
function updateAdminInfo(req, res) {
    const form = new formidable.IncomingForm({ multiples: false, uploadDir: UPLOAD_DIR, keepExtensions: true });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const { strid, name, phone, gender } = fields;
        if (!strid || !name || !phone || !gender) {
            return res.end(JSON.stringify({ message: "လိုအပ်တဲ့အချက်အလက်များ မပြည့်စုံပါ" }));
        }
        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;
        const id = Array.isArray(strid) ? strid[0] : strid;
        const nameStr = Array.isArray(name) ? name[0] : name;
        const phoneStr = Array.isArray(phone) ? phone[0] : phone;
        const genderStr = Array.isArray(gender) ? gender[0] : gender;

        try {
            // Check if admin exists
            const checkSql = "SELECT * FROM admin WHERE id = ?";
            db.query(checkSql, [id], async (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (results.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: "Admin ကို မတွေ့ပါ" }));
                }

                let updatedPhoto = results[0].photo;

                if (photoFile && photoFile.size > 0) { // file ရှိလားစစ်
                    // Delete old photo
                    if (updatedPhoto) {
                        const oldPath = path.join(UPLOAD_DIR, updatedPhoto);
                        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                    }

                    // Save new photo
                    const originalName = photoFile.originalFilename || photoFile.newFilename || "unknown.jpg";
                    const newPhotoName = generatePhotoName(id, originalName);
                    const newPath = path.join(UPLOAD_DIR, newPhotoName);

                    // Rename temp file to final
                    fs.renameSync(photoFile.filepath, newPath);

                    updatedPhoto = newPhotoName;
                }

                const updateSql = `
                    UPDATE admin
                    SET name = ?, phone = ?, gender = ?, photo = ?
                    WHERE id = ?
                `;

                db.query(
                    updateSql,
                    [nameStr, phoneStr, genderStr, updatedPhoto, id],
                    (err) => {
                        if (err) {
                            res.statusCode = 500;
                            return res.end(JSON.stringify({ error: err.message }));
                        }

                        res.statusCode = 200;
                        res.end(
                            JSON.stringify({
                                success: true,
                                message: "Admin အချက်အလက် ပြင်ပြီးပါပြီ"
                            })
                        );
                    }
                );
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// --- UPDATE ADMIN PASSWORD ---
function updateAdminPassword(req, res) {
    const form = new formidable.IncomingForm({ multiples: false });

    form.parse(req, async (err, fields) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const { email, password, passcode } = fields;

        if (!email || !password || !passcode) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ message: "လိုအပ်တဲ့အချက်အလက်များ မပြည့်စုံပါ" }));
        }

        try {
            // Get owner passcode
            const getPasscodeSql = "SELECT passcode FROM admin WHERE id = 'A001'";
            db.query(getPasscodeSql, async (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (results.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ message: "Admin ကို မတွေ့ပါ" }));
                }

                const owner = results[0];

                // Check if passcode matches
                if (!owner.passcode) {
                    res.statusCode = 403;
                    return res.end(JSON.stringify({ message: "Passcode not set for owner" }));
                }

                const isMatch = await bcrypt.compare(passcode.toString(), owner.passcode);
                if (!isMatch) {
                    res.statusCode = 403;
                    return res.end(JSON.stringify({ error: "Passcode မှားနေပါသည်" }));
                }

                // Hash new password
                const hashedPassword = await bcrypt.hash(password, 10);

                // Update password
                const updateSql = "UPDATE admin SET password = ? WHERE email = ?";
                db.query(updateSql, [hashedPassword, email], (err) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    res.statusCode = 200;
                    res.end(JSON.stringify({ success: true, message: "Password updated successfully" }));
                });
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// --- UPDATE admin passcode ---
function updateAdminPasscode(req, res) {
    const form = new formidable.IncomingForm({ multiples: false });

    form.parse(req, async (err, fields) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const { email, newpasscode, passcode } = fields;

        if (!email || !newpasscode || !passcode) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ message: "လိုအပ်တဲ့အချက်အလက်များ မပြည့်စုံပါ" }));
        }

        try {
            const checkRoleSql = "SELECT role FROM admin WHERE email = ?";
            db.query(checkRoleSql, [email], async (err, roleResults) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (roleResults.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ message: "Account not found" }));
                }

                if (roleResults[0].role === "seller") {
                    res.statusCode = 403;
                    return res.end(JSON.stringify({ message: "Seller ၏ Passcode ကို ပြင်ခွင့်မရှိပါ" }));
                }

                const getPasscodeSql = "SELECT passcode FROM admin WHERE id = 'A001'";
                db.query(getPasscodeSql, async (err, results) => {
                    if (err) {
                        res.statusCode = 500;
                        return res.end(JSON.stringify({ error: err.message }));
                    }

                    if (results.length === 0) {
                        res.statusCode = 404;
                        return res.end(JSON.stringify({ message: "Admin ကို မတွေ့ပါ" }));
                    }

                    const owner = results[0];

                    if (!owner.passcode) {
                        res.statusCode = 403;
                        return res.end(JSON.stringify({ message: "Owner ၏ Passcode မသတ်မှတ်ရသေးပါ" }));
                    }

                    const isMatch = await bcrypt.compare(passcode.toString(), owner.passcode);
                    if (!isMatch) {
                        res.statusCode = 403;
                        return res.end(JSON.stringify({ error: "Owner Passcode မှားနေပါသည်" }));
                    }

                    // ✅ Passcode unique check
                    const checkPasscodeSql = "SELECT passcode FROM admin WHERE passcode IS NOT NULL";
                    db.query(checkPasscodeSql, async (err, rows) => {
                        if (err) {
                            res.statusCode = 500;
                            return res.end(JSON.stringify({ error: err.message }));
                        }

                        for (const row of rows) {
                            const isPasscodeMatch = await bcrypt.compare(newpasscode.toString(), row.passcode);
                            if (isPasscodeMatch) {
                                return res.end(JSON.stringify({ message: "ဒီ Passcode နဲ့ အကောင့်ရှိပြီးသား ဖြစ်နေပါသည် (သို့) မူရင်း passcode ဖြစ်နေပါသည်" }));
                            }
                        }

                        const hashedPasscode = await bcrypt.hash(newpasscode, 10);

                        const updateSql = "UPDATE admin SET passcode = ? WHERE email = ?";
                        db.query(updateSql, [hashedPasscode, email], (err) => {
                            if (err) {
                                res.statusCode = 500;
                                return res.end(JSON.stringify({ error: err.message }));
                            }

                            res.statusCode = 200;
                            res.end(JSON.stringify({ success: true, message: "Passcode ပြင်ပြီးပါပြီ" }));
                        });
                    });
                });
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// --- VERIFY ADMIN PASSCODE ---
function verifyAdminPasscode(req, res) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const passcodeField = fields.passcode;
        const passcode = Array.isArray(passcodeField) ? passcodeField[0].toString() : passcodeField.toString();

        if (!passcode) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ message: "Passcode ထည့်ရန် လိုအပ်ပါသည်" }));
        }

        try {
            const sql = "SELECT passcode FROM admin WHERE role = 'owner' OR role = 'manager'";
            db.query(sql, async (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (results.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: "Admin Passcode မရှိပါ" }));
                }

                let matched = false;

                for (const row of results) {
                    const match = await bcrypt.compare(passcode, row.passcode);
                    if (match) {
                        matched = true;
                        break;
                    }
                }

                if (matched) {
                    res.statusCode = 200;
                    res.end(JSON.stringify({
                        success: true,
                        message: "Passcode စစ်ဆေးမှု အောင်မြင်ပါသည်"
                    }));
                } else {
                    res.statusCode = 403;
                    res.end(JSON.stringify({
                        success: false,
                        message: "Passcode မမှန်ပါ"
                    }));
                }
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// --- VERIFY OWNER PASSCODE ---
function verifyOwnerPasscode(req, res) {
    const form = new formidable.IncomingForm();

    form.parse(req, async (err, fields) => {
        if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
        }

        const passcodeField = fields.passcode;
        const passcode = Array.isArray(passcodeField) ? passcodeField[0].toString() : passcodeField.toString();

        if (!passcode) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ message: "Passcode ထည့်ရန် လိုအပ်ပါသည်" }));
        }

        try {
            const sql = "SELECT passcode FROM admin WHERE id = 'A001'";
            db.query(sql, async (err, results) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: err.message }));
                }

                if (results.length === 0) {
                    res.statusCode = 404;
                    return res.end(JSON.stringify({ error: "Owner ၏ Passcode မရှိပါ" }));
                }

                let matched = false;

                for (const row of results) {
                    const match = await bcrypt.compare(passcode, row.passcode);
                    if (match) {
                        matched = true;
                        break;
                    }
                }

                if (matched) {
                    res.statusCode = 200;
                    res.end(JSON.stringify({
                        success: true,
                        message: "Passcode စစ်ဆေးမှု အောင်မြင်ပါသည်"
                    }));
                } else {
                    res.statusCode = 403;
                    res.end(JSON.stringify({
                        success: false,
                        message: "Owner Passcode မမှန်ပါ"
                    }));
                }
            });
        } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

// --- CREATE Agent ---
function createAgent(req, res) {
  const form = new formidable.IncomingForm({
    multiples: false,
    encoding: "utf-8",
  });

  form.parse(req, (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "Form parse error: " + err.message }));
    }

    const { id, name } = fields;

    // --- Validate required fields ---
    if (!id || !name) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "id နှင့် name သည် လိုအပ်ပါသည်" }));
    }

    // --- Insert into 'agent' table ---
    const sql = `INSERT INTO agent (id, name) VALUES (?, ?)`;

    db.query(sql, [id.trim(), name.trim()], (err, result) => {
      if (err) {
        console.error("Agent insert error:", err);

        // Duplicate entry check
        if (err.code === "ER_DUP_ENTRY") {
          const msg = err.message.includes("id")
            ? "ဤ ID သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်"
            : "ဤအမည် သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်";
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: msg }));
        }

        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      // --- Success response ---
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ message: "Agent အသစ် ဖန်တီးပြီးပါပြီ" }));
    });
  });
}

function getAgents(req, res) {
  const sql = `SELECT * FROM agent ORDER BY created_at DESC;`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Get agents error:", err);
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: "Database error: " + err.message }));
    }

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ success: true, data: results }));
  });
}

function deleteAgent(req, res, id) {
  if (!id) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "Agent ID မရှိပါ" }));
  }

  // --- Step 1: Find agent by ID ---
  db.query("SELECT name FROM agent WHERE id=?", [id], (err, rows) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    if (rows.length === 0) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: "Agent မတွေ့ပါ" }));
    }

    const agentName = rows[0].name;

    // --- Step 2: Update users table (set agent = NULL where agent=agentName) ---
    const updateUsersSql = "UPDATE users SET agent=NULL WHERE agent=?";
    db.query(updateUsersSql, [agentName], (err) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: "Users update error: " + err.message }));
      }

      // --- Step 3: Delete agent from agent table ---
      const deleteSql = "DELETE FROM agent WHERE id=?";
      db.query(deleteSql, [id], (err2) => {
        if (err2) {
          res.statusCode = 500;
          return res.end(JSON.stringify({ error: "Agent delete error: " + err2.message }));
        }

        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(
          JSON.stringify({
            message: "Agent ကို ဖျက်ပြီးပါပြီ။ တူညီတဲ့ Agent အမည်ရှိသော user များကို Normal User သို့ ပြင်ပြီးပါပြီ",
          })
        );
      });
    });
  });
}


module.exports = { 
    getAdmins,
    createAdmin,
    updateAdminInfo,
    deleteAdmin,
    updateAdminPassword,
    updateAdminPasscode,
    getAdminsById,
    loginAdmin,
    verifyAdminPasscode,
    verifyOwnerPasscode,
    createAgent,
    getAgents,
    deleteAgent
};
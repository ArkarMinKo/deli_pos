const formidable = require("formidable");
const bcrypt = require("bcrypt");
const db = require("../db");
const {generateId} = require('../utils/idUserGenerator')
const { verifyCode } = require("../utils/codeStore");

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
  const sql = "SELECT id, name, email, phone, photo, location, status, special, created_at FROM users ORDER BY created_at DESC";

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

function toMakeSpecial(req, res, id) {
    const sql = "UPDATE users SET special = 1 WHERE id = ?";

    db.query(sql, [id], function(err, result) {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                success: false,
                message: "Database error",
                error: err
            }));
            return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            success: true,
            message: "User marked as special",
            affectedRows: result.affectedRows
        }));
    });
}

function toMakeNonSpecial(req, res, id) {
    const sql = "UPDATE users SET special = 0 WHERE id = ?";

    db.query(sql, [id], function(err, result) {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                success: false,
                message: "Database error",
                error: err
            }));
            return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            success: true,
            message: "User marked as non-special",
            affectedRows: result.affectedRows
        }));
    });
}

function getSpecialUsers(req, res) {
  const sql = "SELECT id, name, email, phone, photo, location, status, special, created_at FROM users WHERE special = 1 ORDER BY created_at DESC";

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

function userInfoForOrders(req, res, userId) {

  const id = userId || req.url.split("/")[2];

  const sql = `
    SELECT 
      name,
      phone,
      location,
      payment_method,
      payment_phone,
      payment_name
    FROM users
    WHERE id = ?
  `;

  db.query(sql, [id], (err, rows) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Database error",
        error: err.message
      }));
    }

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "User not found"
      }));
    }

    const user = rows[0];

    // Parse location JSON if needed
    if (user.location && typeof user.location === "string") {
      try {
        user.location = JSON.parse(user.location);
      } catch (e) {
        user.location = null;
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      data: user
    }));

  });

}

function userLocation(req, res, userId) {
  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const data = JSON.parse(body);

      let location = data.location;

      // if no location or empty array => NULL
      if (
        !location ||
        !Array.isArray(location) ||
        location.length === 0
      ) {
        location = null;
      } else {
        location = JSON.stringify(location);
      }

      db.query(
        "UPDATE users SET location=? WHERE id=?",
        [location, userId],
        (err, result) => {
          if (err) {
            return res.end(
              JSON.stringify({
                success: false,
                message: "Database error",
                error: err.message
              })
            );
          }

          if (result.affectedRows === 0) {
            return res.end(
              JSON.stringify({
                success: false,
                message: "User not found"
              })
            );
          }

          return res.end(
            JSON.stringify({
              success: true,
              message: "Location updated successfully"
            })
          );
        }
      );
    } catch (error) {
      return res.end(
        JSON.stringify({
          success: false,
          message: "Invalid JSON body",
          error: error.message
        })
      );
    }
  });
}

async function changePasswordByUsers(req, res, userId) {
  if (!userId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "User ID is required"
    }));
  }

  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      const { current_pw, new_pw } = JSON.parse(body);

      if (!current_pw || !new_pw) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "Current password and new password are required"
        }));
      }

      // Get current user password
      const [users] = await db.promise().query(
        "SELECT password FROM users WHERE id = ?",
        [userId]
      );

      if (users.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "User not found"
        }));
      }

      const user = users[0];

      // Verify current password
      const isMatch = await bcrypt.compare(
        current_pw,
        user.password
      );

      if (!isMatch) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "Current password is incorrect"
        }));
      }

      // Prevent using same password
      const isSamePassword = await bcrypt.compare(
        new_pw,
        user.password
      );

      if (isSamePassword) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "New password must be different from current password"
        }));
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(new_pw, 10);

      // Update password
      await db.promise().query(
        "UPDATE users SET password = ? WHERE id = ?",
        [hashedPassword, userId]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        message: "Password changed successfully"
      }));

    } catch (error) {
      console.error("Change password error:", error);

      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Internal server error"
      }));
    }
  });
}

// --- PATCH USER PASSWORD WITH OTP (using email, hashed) ---
function patchUserPasswordWithOTP(req, res) {
  const form = new formidable.IncomingForm();
  form.multiples = false;

  form.parse(req, async (err, fields) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    const { email, password, code } = fields;

    if (!email || !password || !code) {
      res.statusCode = 400;
      return res.end(
        JSON.stringify({
          error: "Email, password, OTP ၃ခုလုံး ထည့်ပါ",
        })
      );
    }

    const result = verifyCode(email, code);
    if (!result.success) {
      res.statusCode = 400;
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: result.message }));
    }

    // --- Check if user exists ---
    db.query("SELECT id FROM users WHERE email=?", [email], async (err, rows) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      if (rows.length === 0) {
        res.statusCode = 404;
        res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ error: "သင့် email နှင့် အကောင့် မရှိပါ" }));
      }

      try {
        // 🔒 Hash the new password
        const hashedPassword = await bcrypt.hash(password, 10);

        const sql = `UPDATE users SET password=? WHERE email=?`;
        db.query(sql, [hashedPassword, email], (err) => {
          if (err) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: err.message }));
          }

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({ message: "စကားဝှက် ပြောင်းလဲပြီးပါပြီ" })
          );
        });
      } catch (hashErr) {
        console.error("Password hash error:", hashErr);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Password hashing failed" }));
      }
    });
  });
}

module.exports = {
    loginUser,
    createUsers,
    getUsers,
    changeStatus,
    deleteUser,
    getUsersById,
    toMakeSpecial,
    getSpecialUsers,
    toMakeNonSpecial,
    userInfoForOrders,
    userLocation,
    patchUserPasswordWithOTP,
    changePasswordByUsers
};
const formidable = require("formidable");
const bcrypt = require("bcrypt");
const db = require("../db");
const fs = require("fs");
const path = require("path");
const {generateId} = require('../utils/idShopGenerator')
const sendMail = require("../utils/mailer");

const UPLOAD_DIR = path.join(__dirname, "../shop_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function loginShop(req, res, body) {
  try {
    const { email, password } = JSON.parse(body);

    if (!email || !password) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          message: "Email နဲ့ Password နှစ်ခုပေါင်းဖြည့်ပေးပါအုံး",
        })
      );
    }

    db.query(
      "SELECT id, shopkeeper_name, shop_name, email, password, permission FROM shops WHERE email=?",
      [email],
      async (err, rows) => {
        if (err) {
          console.error("DB error:", err);
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Server error" }));
        }

        if (rows.length === 0) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({ message: "ဒီ Email နဲ့အကောင့် မတွေ့ပါ" })
          );
        }

        const shop = rows[0];

        const isMatch = await bcrypt.compare(password, shop.password);
        if (!isMatch) {
          res.writeHead(401, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              message: "Password မှားနေပါသည် ထပ်စမ်းကြည့်ပါ",
            })
          );
        }

        // --- Permission check ---
        if (shop.permission !== "approved") {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              message: "သင့်ဆိုင်အကောင့်ကို မခွင့်ပြုပေးသေးပါ စောင့်ပါဦး",
            })
          );
        }

        // Login success
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "ဝင်ရောက်မှုအောင်မြင်ပါပြီ ကြိုဆိုပါသည်",
            id: shop.id
          })
        );
      }
    );
  } catch (e) {
    console.error("Login parse error:", e);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Invalid request format" }));
  }
}

function createShops(req, res) {
  const form = new formidable.IncomingForm({
    multiples: false,
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    encoding: "utf-8",
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: err.message }));
    }

    generateId(db, async (err, id) => {
      if (err) {
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: err.message }));
      }

      let photoFile = null;

      // --- Base64 decode photo ---
      try {
        if (fields.photo && fields.photo.startsWith("data:image")) {
          const base64Data = fields.photo.replace(/^data:image\/\w+;base64,/, "");
          const ext = fields.photo.substring("data:image/".length, fields.photo.indexOf(";base64"));
          const photoName = `${id}.${ext}`;
          fs.writeFileSync(path.join(UPLOAD_DIR, photoName), Buffer.from(base64Data, "base64"));
          photoFile = photoName;
        }
      } catch (e) {
        console.error("Photo decode error:", e);
      }

      try {
        // --- Hash password ---
        const hashedPassword = await bcrypt.hash(fields.password, 10);

        // --- Insert shop ---
        db.query(
          `INSERT INTO shops
          (id, shopkeeper_name, shop_name, email, phone, password, photo, items, location, address)
          VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            fields.shopkeeper_name,
            fields.shop_name,
            fields.email,
            fields.phone,
            hashedPassword,
            photoFile || null,
            parseInt(fields.items),
            fields.location,
            fields.address
          ],
          (err) => {
            if (err) {
              console.error("Insert error:", err);

              if (err.code === "ER_DUP_ENTRY") {
                const msg = err.message.includes("email")
                  ? "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်"
                  : "ဝင်ရောက်လာသော အချက်အလက်များ ထပ်နေပါသည်";
                res.statusCode = 400;
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: msg }));
              }

              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }
            sendMail(fields.email, fields.shopkeeper_name, "pending");
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ message: "ဆိုင်အကောင့် ဖန်တီးပြီးပါပြီ" }));
          }
        );
      } catch (hashErr) {
        console.error("Hashing error:", hashErr);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Password hashing failed" }));
      }
    });
  });
}

function getShopsPending(req, res) {
  const sql = `
    SELECT 
      id, 
      shopkeeper_name, 
      shop_name, 
      email, 
      phone, 
      photo, 
      items, 
      address, 
      location, 
      status, 
      permission, 
      created_at
    FROM shops
    WHERE permission = 'pending'
    ORDER BY created_at DESC
  `;

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

function getShopsApprove(req, res) {
  const sql = `
    SELECT 
      id, 
      shopkeeper_name, 
      shop_name, 
      email, 
      phone, 
      photo, 
      items, 
      address, 
      location, 
      status, 
      permission, 
      created_at
    FROM shops
    WHERE permission = 'approved'
    ORDER BY created_at DESC
  `;

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

function getShops(req, res) {
  const sql = `
    SELECT 
      id, 
      shopkeeper_name, 
      shop_name, 
      email, 
      phone, 
      photo, 
      items, 
      address, 
      location, 
      status, 
      permission, 
      created_at
    FROM shops
    WHERE permission != 'pending'
    ORDER BY created_at DESC
  `;

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

function getShopsById(req, res, id) {
    const sql = `
        SELECT 
        id, 
        shopkeeper_name, 
        shop_name, 
        email, 
        phone, 
        photo, 
        items, 
        address, 
        location, 
        status, 
        permission, 
        created_at
        FROM shops
        WHERE id = ?
        LIMIT 1
    `

    db.query(sql, [id], (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        if (results.length === 0) {
            return res.status(404).json({ error: "Account not found" });
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    })
}

function approveShop(req, res, idParam) {
  const id = idParam || req.url.split("/")[3];
  db.query("SELECT shopkeeper_name, email FROM shops WHERE id=?", [id], (err, rows) => {
    if (err || rows.length === 0)
      return res.end(JSON.stringify({ error: err ? err.message : "Shop not found" }));

    const { shopkeeper_name, email } = rows[0];

    db.query("UPDATE shops SET permission='approved' WHERE id=?", [id], (err) => {
      if (err) return res.end(JSON.stringify({ error: err.message }));

      sendMail(
        email,
        shopkeeper_name,
        "approved"
      );

      res.end(JSON.stringify({ message: "ဆိုင် ကို အောင်မြင်စွာ approve လိုက်ပါပြီ" }));
    });
  });
}

function rejectShop(req, res, idParam) {
  const id = idParam || req.url.split("/")[3];
  db.query("SELECT shopkeeper_name, email FROM shops WHERE id=?", [id], (err, rows) => {
    if (err || rows.length === 0)
      return res.end(JSON.stringify({ error: err ? err.message : "Shop not found" }));

    const { shopkeeper_name, email } = rows[0];

    db.query("UPDATE shops SET permission='rejected' WHERE id=?", [id], (err) => {
      if (err) return res.end(JSON.stringify({ error: err.message }));

      sendMail(
        email,
        shopkeeper_name,
        "rejected"
      );

      res.end(JSON.stringify({ message: "ဆိုင် ကို အောင်မြင်စွာ rejected လိုက်ပါပြီ" }));
    });
  });
}

function changeStatus(req, res, id) {
    const shopId = id;

    if (!shopId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing shop id" }));
    }

    // 1. Get current status
    db.query("SELECT status FROM shops WHERE id = ?", [shopId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Shop not found" }));
        }

        const currentStatus = result[0].status;

        // 2. Toggle status
        const newStatus = currentStatus === "active" ? "warning" : "active";

        // 3. Update status
        db.query("UPDATE shops SET status = ? WHERE id = ?", [newStatus, shopId], (updateErr) => {
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

function deleteShop(req, res, id) {
    const shopId = id;

    if (!shopId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing shop id" }));
    }

    // Check if shop exists
    db.query("SELECT id FROM shops WHERE id = ?", [shopId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Shop not found" }));
        }

        // If exists → delete
        db.query("DELETE FROM shops WHERE id = ?", [shopId], (deleteErr) => {
            if (deleteErr) {
                return res.writeHead(500, { "Content-Type": "application/json" })
                .end(JSON.stringify({ error: "Delete failed" }));
            }

            return res.writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({
                message: "ဆိုင် အကောင့်ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ",
                deletedId: shopId
            }));
        });
    });
}

module.exports = {
    loginShop,
    createShops,
    getShops,
    getShopsPending,
    approveShop,
    rejectShop,
    changeStatus,
    deleteShop,
    getShopsById,
    getShopsApprove
};
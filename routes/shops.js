const formidable = require("formidable");
const bcrypt = require("bcrypt");
const db = require("../db");
const fs = require("fs");
const path = require("path");
const {generateId} = require('../utils/idShopGenerator')
const sendMail = require("../utils/mailer");
const { verifyCode } = require("../utils/codeStore");

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
      "SELECT id, shopkeeper_name, shop_name, email, password, permission, have_deliverymen FROM shops WHERE email=?",
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
            id: shop.id,
            have_deliverymen: shop.have_deliverymen
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
          const ext = fields.photo.substring(
            "data:image/".length,
            fields.photo.indexOf(";base64")
          );
          const photoName = `${id}.${ext}`;
          fs.writeFileSync(
            path.join(UPLOAD_DIR, photoName),
            Buffer.from(base64Data, "base64")
          );
          photoFile = photoName;
        }
      } catch (e) {
        console.error("Photo decode error:", e);
      }

      try {
        // --- Hash password ---
        const hashedPassword = await bcrypt.hash(fields.password, 10);

        let categories = [];

        try {
          categories = Array.isArray(fields.category)
            ? fields.category
            : JSON.parse(fields.category || "[]");
        } catch {
          categories = [];
        }

        let payments = [];

        try {
          payments =
            typeof fields.payments === "string"
              ? JSON.parse(fields.payments)
              : fields.payments || [];
        } catch {
          payments = [];
        }

        payments = JSON.stringify(fields.payments)
        categories = JSON.stringify(categories);

        // --- Insert shop ---
        db.query(
          `INSERT INTO shops
          (id, shopkeeper_name, shop_name, email, phone, password, photo, items, categories, location, address,
           payments, have_deliverymen, deli_fees_method)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            fields.shopkeeper_name,
            fields.shop_name,
            fields.email,
            fields.phone,
            hashedPassword,
            photoFile || null,
            parseInt(fields.items) || 0,
            categories,
            fields.location || null,
            fields.address || null,
            payments,
            fields.have_deliverymen || 0,
            fields.deli_fees_method || 'km'
          ],
          (err) => {
            if (err) {
              console.error("Insert error:", err);

              if (err.code === "ER_DUP_ENTRY") {
                const msg = err.message.includes("email")
                  ? "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်"
                  : "ဝင်ရောက်လာသော အချက်အလက်များ ထပ်နေပါသည်";

                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: msg }));
              }

              res.statusCode = 500;
              return res.end(JSON.stringify({ error: err.message }));
            }

            sendMail(fields.email, fields.shopkeeper_name, "pending");

            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
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

function updateShop(req, res, id) {
    const form = new formidable.IncomingForm({
        multiples: false,
        encoding: "utf-8",
    });

    form.parse(req, (err, fields) => {
        if (err) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "Form parse error", details: err }));
        }

        const { shopkeeper_name, shop_name, phone, address, photo, logo } = fields;

        if (!id) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "Shop ID required" }));
        }

        if (!shop_name || !shopkeeper_name || !address || !phone) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ message: "လိုအပ်ချက်များ မပြည့်စုံပါ" })
            );
        }

        // 1. Get existing shop (for old photo/logo)
        db.query("SELECT photo, logo FROM shops WHERE id = ?", [id], (err, result) => {
            if (err || result.length === 0) {
                res.statusCode = 404;
                return res.end(JSON.stringify({ error: "Shop not found" }));
            }

            let oldPhoto = result[0].photo;
            let newPhotoFile = oldPhoto;

            let oldLogo = result[0].logo;
            let newLogoFile = oldLogo;

            // 2. Handle photo/logo update
            try {
                // Photo
                if (photo && photo.startsWith("data:image")) {
                    const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
                    const ext = photo.substring("data:image/".length, photo.indexOf(";base64"));
                    const photoName = `${id}.${ext}`;

                    fs.writeFileSync(
                        path.join(UPLOAD_DIR, photoName),
                        Buffer.from(base64Data, "base64")
                    );

                    newPhotoFile = photoName;

                    // Delete old photo
                    if (
                        oldPhoto &&
                        oldPhoto !== photoName &&
                        fs.existsSync(path.join(UPLOAD_DIR, oldPhoto))
                    ) {
                        fs.unlinkSync(path.join(UPLOAD_DIR, oldPhoto));
                    }
                }

                // Logo
                if (logo && logo.startsWith("data:image")) {
                    const base64Data = logo.replace(/^data:image\/\w+;base64,/, "");
                    const ext = logo.substring("data:image/".length, logo.indexOf(";base64"));
                    const logoName = `${id}_logo.${ext}`;

                    fs.writeFileSync(
                        path.join(UPLOAD_DIR, logoName),
                        Buffer.from(base64Data, "base64")
                    );

                    newLogoFile = logoName;

                    // Delete old logo
                    if (
                        oldLogo &&
                        oldLogo !== logoName &&
                        fs.existsSync(path.join(UPLOAD_DIR, oldLogo))
                    ) {
                        fs.unlinkSync(path.join(UPLOAD_DIR, oldLogo));
                    }
                }
            } catch (e) {
                res.statusCode = 400;
                return res.end(JSON.stringify({ error: "Invalid photo/logo format", details: e }));
            }

            // 3. Update DB
            const sql = `
                UPDATE shops SET
                    shopkeeper_name = ?, shop_name = ?, phone = ?, address = ?, photo = ?, logo = ?
                WHERE id = ?
            `;

            const values = [
                shopkeeper_name,
                shop_name,
                phone,
                address,
                newPhotoFile,
                newLogoFile,
                id
            ];

            db.query(sql, values, (err2) => {
                if (err2) {
                    res.statusCode = 500;
                    return res.end(JSON.stringify({ error: "DB update failed", details: err2 }));
                }

                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                return res.end(JSON.stringify({ message: "Shop ကို အောင်မြင်စွာ ပြင်ဆင်ပြီးပါပြီ" }));
            });
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
      logo,
      photo, 
      items, 
      address, 
      location, 
      status,
      categories,
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
      logo,
      items, 
      address, 
      location, 
      status,
      categories,
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
      logo,
      items, 
      address, 
      location, 
      status,
      categories,
      payments,
      have_deliverymen,
      deli_fees_method,
      open_shop,
      open_shop_deli,
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
        IFNULL(logo, NULL) AS logo,
        items, 
        address, 
        location, 
        status,
        categories,
        payments,
        have_deliverymen,
        deli_fees_method,
        open_shop,
        open_shop_deli,
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
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Account Not Found" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    })
}

function getShopDeliOpen(req, res, id) {
    const sql = `
        SELECT 
        open_shop_deli  
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
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Account Not Found" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    })
}

function getShopOpen(req, res, id) {
    const sql = `
        SELECT 
        open_shop
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
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Account Not Found" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    })
}

function getSidebar(req, res, id) {
    const sql = `
        SELECT 
        sidebar
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
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Account Not Found" }));
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

  db.query(
    "SELECT shopkeeper_name, email FROM shops WHERE id=?",
    [id],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.end(
          JSON.stringify({
            error: err ? err.message : "Shop not found",
          })
        );
      }

      const { shopkeeper_name, email } = rows[0];

      // Delete shop instead of updating permission
      db.query("DELETE FROM shops WHERE id=?", [id], (err) => {
        if (err) {
          return res.end(JSON.stringify({ error: err.message }));
        }

        sendMail(email, shopkeeper_name, "rejected");

        res.end(
          JSON.stringify({
            message: "ဆိုင် ကို အောင်မြင်စွာ rejected လုပ်လိုက်ပါပြီ",
          })
        );
      });
    }
  );
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

function openShop(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Shop ID is required" }));
  }

  const query = `
    UPDATE shops
    SET open_shop = 1
    WHERE id = ?
  `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Database error" }));
    }

    if (result.affectedRows === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Shop not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      message: "ဆိုင်ဖွင့်လှစ်လိုက်ပါပြီ",
      deliveryman_id: id
    }));
  });
}

function offShop(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Shop ID is required" }));
  }

  const query = `
    UPDATE shops
    SET open_shop = 0
    WHERE id = ?
  `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Database error" }));
    }

    if (result.affectedRows === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Shop not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      message: "ဆိုင်ပိတ်လိုက်ပါပြီ",
      deliveryman_id: id
    }));
  });
}

function openShopDeli(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Shop ID is required" }));
  }

  const checkQuery = `
    SELECT id 
    FROM deliverymen
    WHERE work_type = ?
    LIMIT 1
  `;

  db.query(checkQuery, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Database error" }));
    }

    if (result.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        error: "ဒီ shop အတွက် deliveryman မရှိပါသဖြင့် ဖွင့်ခွင့်မရှိပါ"
      }));
    }

    const updateQuery = `
      UPDATE shops
      SET open_shop_deli = 1
      WHERE id = ?
    `;

    db.query(updateQuery, [id], (err, updateResult) => {
      if (err) {
        console.error("Database error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Database error" }));
      }

      if (updateResult.affectedRows === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Shop not found" }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: "Delivery Service ဖွင့်လိုက်ပါပြီ",
        shop_id: id
      }));
    });
  });
}

function offShopDeli(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Shop ID is required" }));
  }

  const query = `
    UPDATE shops
    SET open_shop_deli = 0
    WHERE id = ?
  `;

  db.query(query, [id], (err, result) => {
    if (err) {
      console.error("Database error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Database error" }));
    }

    if (result.affectedRows === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Shop not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      message: "Delivery Service ပိတ်လိုက်ပါပြီ",
      deliveryman_id: id
    }));
  });
}

function updateShopsCategories(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();

    // protect large request
    if (body.length > 1e6) {
      req.connection.destroy();
    }
  });

  req.on("end", () => {

    let parsedBody;

    try {
      parsedBody = JSON.parse(body);
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Invalid JSON body"
      }));
    }

    const { categories } = parsedBody;

    // validation
    if (!Array.isArray(categories)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "categories must be an array"
      }));
    }

    // only allow numbers
    const invalid = categories.some(item => typeof item !== "number");

    if (invalid) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "categories must contain only numbers"
      }));
    }

    // replace old categories completely
    const query = `
      UPDATE shops
      SET categories = ?
      WHERE id = ?
    `;

    db.query(
      query,
      [JSON.stringify(categories), shopId],
      (err, result) => {

        if (err) {
          console.error(err);

          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: "Database error"
          }));
        }

        if (result.affectedRows === 0) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: "Shop not found"
          }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: true,
          message: "Shop categories updated successfully",
          data: {
            shop_id: shopId,
            categories: categories
          }
        }));
      }
    );
  });
}

function changeSidebar(req, res, shopId) {
  const id = shopId || req.url.split("/")[3];

  // Check current sidebar value
  db.query(
    "SELECT sidebar FROM shops WHERE id = ?",
    [id],
    (err, rows) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }

      if (rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Shop not found" }));
      }

      // Toggle value
      const currentSidebar = rows[0].sidebar;
      const newSidebar = currentSidebar == 1 ? 0 : 1;

      // Update sidebar
      db.query(
        "UPDATE shops SET sidebar = ? WHERE id = ?",
        [newSidebar, id],
        (updateErr) => {
          if (updateErr) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: updateErr.message }));
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              success: true,
              shopId: id,
              sidebar: newSidebar,
            })
          );
        }
      );
    }
  );
}

function updatePaymentsByShops(req, res, shopId) {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk.toString();

    // Prevent large payload attacks
    if (body.length > 1e6) {
      req.connection.destroy();
    }
  });

  req.on("end", () => {
    try {
      const data = JSON.parse(body);

      // Validate payments
      if (!Array.isArray(data.payments)) {
        res.writeHead(400, {
          "Content-Type": "application/json",
        });

        return res.end(
          JSON.stringify({
            success: false,
            message: "payments must be an array",
          })
        );
      }

      // Clean payments data
      const payments = data.payments.map((item) => ({
        method: item.method || "",
        phone: item.phone || "",
        name: item.name || "",
      }));

      // Update DB
      db.query(
        `UPDATE shops SET payments = ? WHERE id = ?`,
        [JSON.stringify(payments), shopId],
        (err, result) => {
          if (err) {
            console.error("Update payments error:", err);

            res.writeHead(500, {
              "Content-Type": "application/json",
            });

            return res.end(
              JSON.stringify({
                success: false,
                message: "Database error",
                error: err.message,
              })
            );
          }

          if (result.affectedRows === 0) {
            res.writeHead(404, {
              "Content-Type": "application/json",
            });

            return res.end(
              JSON.stringify({
                success: false,
                message: "Shop not found",
              })
            );
          }

          res.writeHead(200, {
            "Content-Type": "application/json",
          });

          res.end(
            JSON.stringify({
              success: true,
              message: "Payments updated successfully",
              payments,
            })
          );
        }
      );
    } catch (e) {
      console.error("JSON parse error:", e);

      res.writeHead(400, {
        "Content-Type": "application/json",
      });

      res.end(
        JSON.stringify({
          success: false,
          message: "Invalid JSON body",
        })
      );
    }
  });
}

function changeLocation(req, res, id) {
  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Shop id is required"
    }));
  }

  let body = "";

  // Collect request data
  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {
    let data;

    try {
      data = JSON.parse(body);
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Invalid JSON"
      }));
    }

    const { location, address } = data;

    if (!location) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "location and address are required"
      }));
    }

    const query = `
      UPDATE shops
      SET location = ?, address = ?
      WHERE id = ?
    `;

    db.query(query, [location, address, id], (err, result) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: err.message
        }));
      }

      if (result.affectedRows === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "Shop not found"
        }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        message: "Location and address updated successfully"
      }));
    });
  });
}

function getLocationByShop(req, res, shopId) {
  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Shop id is required"
    }));
  }

  const query = `
    SELECT location, address
    FROM shops
    WHERE id = ?
    LIMIT 1
  `;

  db.query(query, [shopId], (err, results) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.message
      }));
    }

    if (results.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Shop not found"
      }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      location: results[0].location,
      address: results[0].address
    }));
  });
}

async function changePasswordByShops(req, res, shopId) {
  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Shop ID is required"
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

      // Get current shop password
      const [shops] = await db.promise().query(
        "SELECT password FROM shops WHERE id = ?",
        [shopId]
      );

      if (shops.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "Shop not found"
        }));
      }

      const shop = shops[0];

      // Verify current password
      const isMatch = await bcrypt.compare(
        current_pw,
        shop.password
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
        shop.password
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
        "UPDATE shops SET password = ? WHERE id = ?",
        [hashedPassword, shopId]
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
function patchShopPasswordWithOTP(req, res) {
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
    db.query("SELECT id FROM shops WHERE email=?", [email], async (err, rows) => {
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

        const sql = `UPDATE shops SET password=? WHERE email=?`;
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
    loginShop,
    createShops,
    getShops,
    getShopsPending,
    approveShop,
    rejectShop,
    changeStatus,
    deleteShop,
    getShopsById,
    getShopsApprove,
    updateShop,
    openShop,
    offShop,
    openShopDeli,
    offShopDeli,
    getShopDeliOpen,
    getShopOpen,
    getSidebar,
    updateShopsCategories,
    changeSidebar,
    updatePaymentsByShops,
    changeLocation,
    getLocationByShop,
    changePasswordByShops,
    patchShopPasswordWithOTP
};
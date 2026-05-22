const formidable = require("formidable");
const { generateId } = require("../utils/idDeliverymenGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const bcrypt = require("bcrypt");
const { off } = require("process");
const { clear } = require("console");

const UPLOAD_DIR = path.join(__dirname, "../deliverymen_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function loginDeliverymen(req, res) {
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
        db.query("SELECT * FROM deliverymen WHERE email = ?", [email], async (err, rows) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Database error" }));
            }

            if (rows.length === 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Email မမှန်ကန်ပါ" }));
            }

            const deliverymen = rows[0];

            // Compare hashed password
            const isMatch = await bcrypt.compare(password, deliverymen.password);

            if (!isMatch) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Password မမှန်ကန်ပါ" }));
            }

            // Login Success
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(
                JSON.stringify({
                    message: "Login အောင်မြင်ပါသည်",
                    deliverymenId: deliverymen.id
                })
            );
        });
    });
}

function createDeliverymen(req, res) {
    const form = new formidable.IncomingForm({
        multiples: false,
        uploadDir: UPLOAD_DIR,
        keepExtensions: true,
        encoding: "utf-8",
    });
    form.keepExtensions = true;

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        const name = fields.name;
        const email = fields.email;
        const phone = fields.phone;
        const password = String(fields.password || "");
        const work_type = fields.work_type;

        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;

        if (!name || !email || !phone || !password) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ error: "ထည့်သွင်းပေးရမည့် အချက်အလက်များ မပြည့်စုံပါ" })
            );
        }

        db.query(
            "SELECT email FROM deliverymen WHERE email = ?",
            [email],
            async (err, rows) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Database error" }));
                }

                if (rows.length > 0) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(
                        JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်" })
                    );
                }

                try {
                    generateId(db, async (err, newId) => { // Mark async to use await
                        if (err) {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            return res.end(JSON.stringify({ error: "ID creation failed" }));
                        }

                        let photoName = null;
                        if (photoFile?.originalFilename) {
                            photoName = generatePhotoName(newId, photoFile.originalFilename);
                            fs.renameSync(photoFile.filepath, path.join(UPLOAD_DIR, photoName));
                        }

                        // HASH PASSWORD
                        const hashedPassword = await bcrypt.hash(password, 10);

                        const sql = `
                            INSERT INTO deliverymen
                            (id, name, email, phone, password, photo, work_type)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `;

                        db.query(
                            sql,
                            [
                                newId,
                                name,
                                email,
                                phone,
                                hashedPassword, // use hashed password
                                photoName,
                                work_type
                            ],
                            (err, result) => {
                                if (err) {
                                    res.statusCode = 500;
                                    return res.end(JSON.stringify({ error: err.message }));
                                }

                                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                                res.end(JSON.stringify({ message: "Deliveryman အသစ် ဖြည့်သွင်းပြီးပါပြီ" }));
                            }
                        );
                    });
                } catch (error) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: "Internal Server Error" }));
                }
            }
        );
    });
}

function createDeliverymenForShop(req, res, id) {
    const form = new formidable.IncomingForm({
        multiples: false,
        uploadDir: UPLOAD_DIR,
        keepExtensions: true,
        encoding: "utf-8",
    });
    form.keepExtensions = true;

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }

        const name = fields.name;
        const email = fields.email;
        const phone = fields.phone;
        const password = String(fields.password || "");

        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;

        if (!name || !email || !phone || !password) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ error: "ထည့်သွင်းပေးရမည့် အချက်အလက်များ မပြည့်စုံပါ" })
            );
        }

        db.query(
            "SELECT email FROM deliverymen WHERE email = ?",
            [email],
            async (err, rows) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Database error" }));
                }

                if (rows.length > 0) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(
                        JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်" })
                    );
                }

                try {
                    generateId(db, async (err, newId) => { // Mark async to use await
                        if (err) {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            return res.end(JSON.stringify({ error: "ID creation failed" }));
                        }

                        let photoName = null;
                        if (photoFile?.originalFilename) {
                            photoName = generatePhotoName(newId, photoFile.originalFilename);
                            fs.renameSync(photoFile.filepath, path.join(UPLOAD_DIR, photoName));
                        }

                        // HASH PASSWORD
                        const hashedPassword = await bcrypt.hash(password, 10);

                        const sql = `
                            INSERT INTO deliverymen
                            (id, name, email, phone, password, photo, work_type)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        `;

                        db.query(
                            sql,
                            [
                                newId,
                                name,
                                email,
                                phone,
                                hashedPassword, // use hashed password
                                photoName,
                                id
                            ],
                            (err, result) => {
                                if (err) {
                                    res.statusCode = 500;
                                    return res.end(JSON.stringify({ error: err.message }));
                                }

                                res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                                res.end(JSON.stringify({ message: "Deliveryman အသစ် ဖြည့်သွင်းပြီးပါပြီ" }));
                            }
                        );
                    });
                } catch (error) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: "Internal Server Error" }));
                }
            }
        );
    });
}

function putDeliverymen(req, res, id) {
    const form = new formidable.IncomingForm({
        multiples: false,
        uploadDir: path.join(__dirname, "../deliverymen_uploads"),
        keepExtensions: true,
        encoding: "utf-8",
    });

    form.parse(req, async (err, fields, files) => {
        if (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Form parse error" }));
        }
        
        const name = fields.name;
        const email = fields.email;
        const phone = fields.phone;
        const password = fields.password ? String(fields.password) : null;
        const work_type = fields.work_type;

        const photoFile = Array.isArray(files.photo) ? files.photo[0] : files.photo;

        if (!id || !name || !email || !phone) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "လိုအပ်ချက်များ မပြည့်စုံပါ" }));
        }

        db.query(
            "SELECT id FROM deliverymen WHERE email = ? AND id != ?",
            [email, id],
            async (err, rows) => {
                if (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Database error" }));
                }

                if (rows.length > 0) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "ဤ email သည် အသုံးပြုပြီးသား ဖြစ်ပါသည်" }));
                }

                try {
                    let photoName = null;

                    if (photoFile?.originalFilename) {
                        photoName = generatePhotoName(id, photoFile.originalFilename);
                        fs.renameSync(
                            photoFile.filepath,
                            path.join(__dirname, "../deliverymen_uploads", photoName)
                        );
                    }

                    let hashedPassword = null;
                    if (password) {
                        hashedPassword = await bcrypt.hash(password, 10);
                    }

                    const fieldsToUpdate = [];
                    const values = [];

                    if (name) { fieldsToUpdate.push("name = ?"); values.push(name); }
                    if (email) { fieldsToUpdate.push("email = ?"); values.push(email); }
                    if (phone) { fieldsToUpdate.push("phone = ?"); values.push(phone); }
                    if (hashedPassword) { fieldsToUpdate.push("password = ?"); values.push(hashedPassword); }
                    if (photoName) { fieldsToUpdate.push("photo = ?"); values.push(photoName); }
                    if (work_type) { fieldsToUpdate.push("work_type = ?"); values.push(work_type); }

                    values.push(id);

                    const sql = `UPDATE deliverymen SET ${fieldsToUpdate.join(", ")} WHERE id = ?`;

                    db.query(sql, values, (err, result) => {
                        if (err) {
                            res.statusCode = 500;
                            return res.end(JSON.stringify({ error: err.message }));
                        }

                        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
                        res.end(JSON.stringify({ message: "Deliveryman ကို အောင်မြင်စွာ Updated ပြီးပါပြီ" }));
                    });
                } catch (error) {
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: "Internal Server Error" }));
                }
            }
        );
    });
}

function getAllDeliverymen(req, res) {
    const sql = `
        SELECT 
            d.id, 
            d.name, 
            d.email, 
            d.phone, 
            d.photo, 
            d.location, 
            d.status,
            CASE 
                WHEN d.work_type IS NULL THEN NULL
                ELSE s.shop_name
            END AS work_type,
            d.rating, 
            d.finished_order_count, 
            d.assign_order,
            d.is_online,
            d.created_at
        FROM deliverymen d
        LEFT JOIN shops s ON d.work_type = s.id
        ORDER BY d.created_at DESC
    `;

    db.query(sql, (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    });
}

function getShopDeliverymen(req, res, id) {
    const sql = `
        SELECT 
        id, name, email, phone, photo, location, status,
        work_type, rating, finished_order_count, assign_order, created_at
        FROM deliverymen WHERE work_type = ?
        ORDER BY created_at DESC
    `;

    db.query(sql, [id], (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    });
}

function getDeliverymenById(req, res, id) {
    const sql = `
        SELECT 
        id, name, email, phone, photo, location, status,
        work_type, rating, finished_order_count, assign_order, created_at
        FROM deliverymen
        WHERE id = ?
        LIMIT 1
    `

    db.query(sql, [id], (err, results) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Database error" }));
        }

        if (results.length === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Account Not Found" }));
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(results));
    })
}

function changeStatus(req, res, id) {
    const deliverymenId = id;

    if (!deliverymenId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing deliverymen id" }));
    }

    // 1. Get current status
    db.query("SELECT status FROM deliverymen WHERE id = ?", [deliverymenId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Deliverymen not found" }));
        }

        const currentStatus = result[0].status;

        // 2. Toggle status
        const newStatus = currentStatus === "active" ? "warning" : "active";

        // 3. Update status
        db.query("UPDATE deliverymen SET status = ? WHERE id = ?", [newStatus, deliverymenId], (updateErr) => {
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

function deleteDeliverymen(req, res, id) {
    const deliverymenId = id;

    if (!deliverymenId) {
        return res.writeHead(400, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: "Missing deliverymen id" }));
    }

    // Check if deliverymen exists
    db.query("SELECT id FROM deliverymen WHERE id = ?", [deliverymenId], (err, result) => {
        if (err) {
            return res.writeHead(500, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "DB error" }));
        }

        if (result.length === 0) {
            return res.writeHead(404, { "Content-Type": "application/json" })
            .end(JSON.stringify({ error: "Deliverymen not found" }));
        }

        // If exists → delete
        db.query("DELETE FROM deliverymen WHERE id = ?", [deliverymenId], (deleteErr) => {
            if (deleteErr) {
                return res.writeHead(500, { "Content-Type": "application/json" })
                .end(JSON.stringify({ error: "Delete failed" }));
            }

            return res.writeHead(200, { "Content-Type": "application/json" })
            .end(JSON.stringify({
                message: "Deliverymen အကောင့်ကို အောင်မြင်စွာ ဖျက်ပြီးပါပြီ",
                deletedId: deliverymenId
            }));
        });
    });
}

function getOnlineDeliverymen(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Method Not Allowed" }));
  }

  const query = `
    SELECT 
      id,
      name,
      email,
      phone,
      photo,
      work_type,
      location,
      status,
      rating,
      finished_order_count,
      assign_order,
      is_online,
      current_orders,
      created_at
    FROM deliverymen
    WHERE is_online = 1
    ORDER BY created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Database error" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        success: true,
        count: results.length,
        data: results,
      })
    );
  });
}

function onlineDeliverymen(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Deliveryman ID is required" }));
  }

  const query = `
    UPDATE deliverymen
    SET is_online = 1
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
      return res.end(JSON.stringify({ error: "Deliveryman not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      message: "Deliveryman is now online",
      deliveryman_id: id
    }));
  });
}

function offlineDeliverymen(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Deliveryman ID is required" }));
  }

  const query = `
    UPDATE deliverymen
    SET is_online = 0
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
      return res.end(JSON.stringify({ error: "Deliveryman not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      message: "Deliveryman is now offline",
      deliveryman_id: id
    }));
  });
}

function addOrdersToDeliverymen(req, res, id) {
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    const connection = await db.promise().getConnection();

    try {
      const { orderId } = JSON.parse(body);

      if (!orderId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "orderId is required" }));
      }

      await connection.beginTransaction();

      // try to claim order
      const [orderUpdate] = await connection.query(
        `UPDATE orders 
         SET connected_deliveryman = 1, deliverymenId = ?
         WHERE id = ? AND connected_deliveryman = 0`,
        [id ,orderId]
      );

      // already taken
      if (orderUpdate.affectedRows === 0) {
        await connection.rollback();
        res.writeHead(409, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          error: "Order already taken by another deliveryman"
        }));
      }

      // lock deliveryman row
      const [rows] = await connection.query(
        "SELECT current_orders FROM deliverymen WHERE id = ? FOR UPDATE",
        [id]
      );

      if (rows.length === 0) {
        await connection.rollback();
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Deliveryman not found" }));
      }

      let currentOrders = [];
      const dbValue = rows[0].current_orders;

      if (dbValue) {
        if (Array.isArray(dbValue)) {
          currentOrders = dbValue;
        } else if (typeof dbValue === "string") {
          try {
            const parsed = JSON.parse(dbValue);
            currentOrders = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            currentOrders = [dbValue];
          }
        }
      }

      // 🚫 prevent duplicate
      if (!currentOrders.includes(orderId)) {
        currentOrders.push(orderId);
      }

      await connection.query(
        `UPDATE deliverymen 
         SET current_orders = ?, 
             assign_order = assign_order + 1
         WHERE id = ?`,
        [JSON.stringify(currentOrders), id]
      );

      await connection.commit();

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        message: "Order ကို လက်ခံလိုက်ပါပြီ",
        current_orders: currentOrders
      }));

    } catch (error) {

      await connection.rollback();

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: error.message }));

    } finally {
      connection.release();
    }
  });
}

async function connectedOrders(req, res, id) {
  try {

    // 1️⃣ Get deliveryman
    const [rows] = await db.promise().query(
      "SELECT * FROM deliverymen WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Deliveryman not found" }));
    }

    const dm = rows[0];
    let orderIds = [];

    // 2️⃣ Safe JSON parse
    if (dm.current_orders) {
      if (Array.isArray(dm.current_orders)) {
        orderIds = dm.current_orders;
      } else if (typeof dm.current_orders === "string") {
        orderIds = JSON.parse(dm.current_orders);
      }
    }

    // 3️⃣ Reverse orderIds
    orderIds = orderIds.reverse();

    let ordersData = [];

    if (orderIds.length > 0) {

      const placeholders = orderIds.map(() => "?").join(",");

      const [orders] = await db.promise().query(
        `SELECT * FROM orders WHERE id IN (${placeholders}) AND orders_done = 0
        ORDER BY FIELD(o.id, ${placeholders})
        `,
        [...orderIds, ...orderIds],
        orderIds
      );

      ordersData = orders;
    }

    // 4️⃣ Response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      data: {
        id: dm.id,
        name: dm.name,
        phone: dm.phone,
        is_online: dm.is_online,
        assign_order: dm.assign_order,
        current_orders: orderIds,
        orders: ordersData
      }
    }));

  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function connectedOrdersBySpecialUsers(req, res, id) {
  try {

    // 1️⃣ Get deliveryman
    const [rows] = await db.promise().query(
      "SELECT * FROM deliverymen WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Deliveryman not found" }));
    }

    const dm = rows[0];
    let orderIds = [];

    // 2️⃣ Safe JSON parse
    if (dm.current_orders) {
      if (Array.isArray(dm.current_orders)) {
        orderIds = dm.current_orders;
      } else if (typeof dm.current_orders === "string") {
        orderIds = JSON.parse(dm.current_orders);
      }
    }

    // 3️⃣ Reverse orderIds
    orderIds = orderIds.reverse();

    let ordersData = [];

    if (orderIds.length > 0) {

      const placeholders = orderIds.map(() => "?").join(",");

      const [orders] = await db.promise().query(
        `
        SELECT o.*
        FROM orders o
        JOIN users u ON o.userId = u.id
        WHERE o.id IN (${placeholders})
        AND o.orders_done = 0
        AND u.special = 1
        ORDER BY FIELD(o.id, ${placeholders})
        `,
        [...orderIds, ...orderIds]
      );

      ordersData = orders;
    }

    // 4️⃣ Response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      data: {
        id: dm.id,
        name: dm.name,
        phone: dm.phone,
        is_online: dm.is_online,
        assign_order: dm.assign_order,
        current_orders: orderIds,
        orders: ordersData
      }
    }));

  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function connectedOrdersByNonSpecialUsers(req, res, id) {
  try {

    // 1️⃣ Get deliveryman
    const [rows] = await db.promise().query(
      "SELECT * FROM deliverymen WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Deliveryman not found" }));
    }

    const dm = rows[0];
    let orderIds = [];

    // 2️⃣ Safe JSON parse
    if (dm.current_orders) {
      if (Array.isArray(dm.current_orders)) {
        orderIds = dm.current_orders;
      } else if (typeof dm.current_orders === "string") {
        orderIds = JSON.parse(dm.current_orders);
      }
    }

    // 3️⃣ Reverse orderIds
    orderIds = orderIds.reverse();

    let ordersData = [];

    if (orderIds.length > 0) {

      const placeholders = orderIds.map(() => "?").join(",");

      const [orders] = await db.promise().query(
        `
        SELECT o.*
        FROM orders o
        JOIN users u ON o.userId = u.id
        WHERE o.id IN (${placeholders})
        AND o.orders_done = 0
        AND u.special = 0
        ORDER BY FIELD(o.id, ${placeholders})
        `,
        [...orderIds, ...orderIds]
      );

      ordersData = orders;
    }

    // 4️⃣ Response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      data: {
        id: dm.id,
        name: dm.name,
        phone: dm.phone,
        is_online: dm.is_online,
        assign_order: dm.assign_order,
        current_orders: orderIds,
        orders: ordersData
      }
    }));

  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

async function ordersHistoryByDeliveryman(req, res, id) {
  try {

    // 1️⃣ Get deliveryman
    const [rows] = await db.promise().query(
      "SELECT * FROM deliverymen WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Deliveryman not found" }));
    }

    const dm = rows[0];
    let orderIds = [];

    // 2️⃣ Safe JSON parse
    if (dm.finished_orders) {
      if (Array.isArray(dm.finished_orders)) {
        orderIds = dm.finished_orders;
      } else if (typeof dm.finished_orders === "string") {
        orderIds = JSON.parse(dm.finished_orders);
      }
    }

    let ordersData = [];

    // 3️⃣ Get orders (special users only)
    if (orderIds.length > 0) {

      const placeholders = orderIds.map(() => "?").join(",");

      const [orders] = await db.promise().query(
        `
        SELECT * FROM orders WHERE id IN (${placeholders}) AND orders_done = 1
        `,
        orderIds
      );

      ordersData = orders;
    }

    // 4️⃣ Response
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      data: {
        id: dm.id,
        name: dm.name,
        phone: dm.phone,
        is_online: dm.is_online,
        finished_orders_count: dm.finished_orders_count,
        assign_order: dm.assign_order,
        finished_orders: orderIds,
        orders: ordersData
      }
    }));

  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

function changeLocation(req, res, id) {
  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Deliveryman id is required"
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

    const { location } = data;

    if (!location) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "location is required"
      }));
    }

    const query = `
      UPDATE deliverymen
      SET location = ?
      WHERE id = ?
    `;

    db.query(query, [location, id], (err, result) => {
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
          message: "Deliveryman not found"
        }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        message: "Location updated successfully"
      }));
    });
  });
}

function getReportShopDeliveymenByShop(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  // Get shop info
  const shopQuery = `
    SELECT id, shop_name
    FROM shops
    WHERE id = ?
    LIMIT 1
  `;

  db.query(shopQuery, [shopId], (shopErr, shopResults) => {

    if (shopErr) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: shopErr.message
      }));
    }

    if (shopResults.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Shop not found"
      }));
    }

    const shop = shopResults[0];

    // Get deliverymen by shop
    const deliverymenQuery = `
      SELECT
        id,
        name,
        email,
        phone,
        photo,
        status,
        work_type,
        finished_orders,
        cleared_orders
      FROM deliverymen
      WHERE work_type = ?
      ORDER BY id DESC
    `;

    db.query(deliverymenQuery, [shopId], async (err, deliverymenResults) => {

      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: err.message
        }));
      }

      try {

        const getOrders = (orderIds) => {

          return new Promise((resolve, reject) => {

            if (!Array.isArray(orderIds) || orderIds.length === 0) {
              return resolve([]);
            }

            const placeholders = orderIds.map(() => "?").join(",");

            const orderQuery = `
              SELECT
                id,
                total_order,
                delivery_fees,
                kilo
              FROM orders
              WHERE id IN (${placeholders})
            `;

            db.query(orderQuery, orderIds, (orderErr, orderResults) => {

              if (orderErr) return reject(orderErr);

              resolve(orderResults);

            });

          });

        };

        const data = [];

        for (const deliveryman of deliverymenResults) {

          let finishedOrders = [];
          let clearedOrders = [];

          // Parse finished_orders
          try {

            if (deliveryman.finished_orders) {

              if (typeof deliveryman.finished_orders === "string") {

                finishedOrders = JSON.parse(deliveryman.finished_orders);

              } else if (Array.isArray(deliveryman.finished_orders)) {

                finishedOrders = deliveryman.finished_orders;

              }

              if (!Array.isArray(finishedOrders)) {
                finishedOrders = [];
              }

            }

          } catch {
            finishedOrders = [];
          }

          // Parse cleared_orders
          try {

            if (deliveryman.cleared_orders) {

              if (typeof deliveryman.cleared_orders === "string") {

                clearedOrders = JSON.parse(deliveryman.cleared_orders);

              } else if (Array.isArray(deliveryman.cleared_orders)) {

                clearedOrders = deliveryman.cleared_orders;

              }

              if (!Array.isArray(clearedOrders)) {
                clearedOrders = [];
              }

            }

          } catch {
            clearedOrders = [];
          }

          // Get orders data
          const finishedOrderData = await getOrders(finishedOrders);
          const clearedOrderData = await getOrders(clearedOrders);

          // Finished summary
          const finishedWays = finishedOrderData.map(order => ({
            orderId: order.id,
            menu: order.total_order,
            delivey_fees: Number(order.delivery_fees || 0),
            kilo: Number(order.kilo || 0)
          }));

          const finishedTotalDeliveryFees = finishedOrderData.reduce((sum, order) => {
            return sum + Number(order.delivery_fees || 0);
          }, 0);

          const finishedTotalKilo = finishedOrderData.reduce((sum, order) => {
            return sum + Number(order.kilo || 0);
          }, 0);

          // Cleared summary
          const clearedWays = clearedOrderData.map(order => ({
            orderId: order.id,
            menu: order.total_order,
            delivey_fees: Number(order.delivery_fees || 0),
            kilo: Number(order.kilo || 0)
          }));

          const clearedTotalDeliveryFees = clearedOrderData.reduce((sum, order) => {
            return sum + Number(order.delivery_fees || 0);
          }, 0);

          const clearedTotalKilo = clearedOrderData.reduce((sum, order) => {
            return sum + Number(order.kilo || 0);
          }, 0);

          data.push({
            id: deliveryman.id,
            name: deliveryman.name,
            email: deliveryman.email,
            phone: deliveryman.phone,
            photo: deliveryman.photo,
            status: deliveryman.status,

            // shop name
            work_type: shop.shop_name,

            not_cleared_orders: {
              total_way: finishedOrderData.length,
              total_delivy_fees: finishedTotalDeliveryFees,
              total_kilo: finishedTotalKilo,
              ways: finishedWays
            },

            cleared_orders: {
              total_way: clearedOrderData.length,
              total_delivy_fees: clearedTotalDeliveryFees,
              total_kilo: clearedTotalKilo,
              ways: clearedWays
            }

          });

        }

        res.writeHead(200, { "Content-Type": "application/json" });

        return res.end(JSON.stringify({
          success: true,
          data
        }));

      } catch (error) {

        res.writeHead(500, { "Content-Type": "application/json" });

        return res.end(JSON.stringify({
          success: false,
          message: error.message
        }));

      }

    });

  });

}

function getReportSystemDeliveymenByShop(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  // Get system deliverymen only
  const deliverymenQuery = `
    SELECT
      id,
      name,
      email,
      phone,
      photo,
      status,
      work_type,
      finished_orders,
      cleared_orders
    FROM deliverymen
    WHERE work_type IS NULL
    ORDER BY id DESC
  `;

  db.query(deliverymenQuery, async (err, deliverymenResults) => {

    if (err) {

      res.writeHead(500, { "Content-Type": "application/json" });

      return res.end(JSON.stringify({
        success: false,
        message: err.message
      }));

    }

    try {

      // Get orders helper
      const getOrdersByIdsAndShop = (orderIds, shopId) => {

        return new Promise((resolve, reject) => {

          if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return resolve([]);
          }

          const placeholders = orderIds.map(() => "?").join(",");

          const query = `
            SELECT
              id,
              shopId,
              total_order,
              delivery_fees,
              kilo
            FROM orders
            WHERE id IN (${placeholders})
            AND shopId = ?
          `;

          db.query(query, [...orderIds, shopId], (orderErr, orderResults) => {

            if (orderErr) return reject(orderErr);

            resolve(orderResults);

          });

        });

      };

      const data = [];

      for (const deliveryman of deliverymenResults) {

        let finishedOrders = [];
        let clearedOrders = [];

        // Parse finished_orders
        try {

          if (deliveryman.finished_orders) {

            if (typeof deliveryman.finished_orders === "string") {

              finishedOrders = JSON.parse(deliveryman.finished_orders);

            } else if (Array.isArray(deliveryman.finished_orders)) {

              finishedOrders = deliveryman.finished_orders;

            }

            if (!Array.isArray(finishedOrders)) {
              finishedOrders = [];
            }

          }

        } catch {
          finishedOrders = [];
        }

        // Parse cleared_orders
        try {

          if (deliveryman.cleared_orders) {

            if (typeof deliveryman.cleared_orders === "string") {

              clearedOrders = JSON.parse(deliveryman.cleared_orders);

            } else if (Array.isArray(deliveryman.cleared_orders)) {

              clearedOrders = deliveryman.cleared_orders;

            }

            if (!Array.isArray(clearedOrders)) {
              clearedOrders = [];
            }

          }

        } catch {
          clearedOrders = [];
        }

        // Get only this shop orders
        const finishedOrderData = await getOrdersByIdsAndShop(finishedOrders, shopId);

        const clearedOrderData = await getOrdersByIdsAndShop(clearedOrders, shopId);

        // Skip deliveryman if no orders for this shop
        if (
          finishedOrderData.length === 0 &&
          clearedOrderData.length === 0
        ) {
          continue;
        }

        // NOT CLEARED
        const finishedWays = finishedOrderData.map(order => ({
          orderId: order.id,
          menu: order.total_order,
          delivey_fees: Number(order.delivery_fees || 0),
          kilo: Number(order.kilo || 0)
        }));

        const finishedTotalDeliveryFees = finishedOrderData.reduce((sum, order) => {
          return sum + Number(order.delivery_fees || 0);
        }, 0);

        const finishedTotalKilo = finishedOrderData.reduce((sum, order) => {
          return sum + Number(order.kilo || 0);
        }, 0);

        // CLEARED
        const clearedWays = clearedOrderData.map(order => ({
          orderId: order.id,
          menu: order.total_order,
          delivey_fees: Number(order.delivery_fees || 0),
          kilo: Number(order.kilo || 0)
        }));

        const clearedTotalDeliveryFees = clearedOrderData.reduce((sum, order) => {
          return sum + Number(order.delivery_fees || 0);
        }, 0);

        const clearedTotalKilo = clearedOrderData.reduce((sum, order) => {
          return sum + Number(order.kilo || 0);
        }, 0);

        data.push({
          id: deliveryman.id,
          name: deliveryman.name,
          email: deliveryman.email,
          phone: deliveryman.phone,
          photo: deliveryman.photo,
          status: deliveryman.status,

          // system deliverymen
          work_type: null,

          not_cleared_orders: {
            total_way: finishedOrderData.length,
            total_delivy_fees: finishedTotalDeliveryFees,
            total_kilo: finishedTotalKilo,
            ways: finishedWays
          },

          cleared_orders: {
            total_way: clearedOrderData.length,
            total_delivy_fees: clearedTotalDeliveryFees,
            total_kilo: clearedTotalKilo,
            ways: clearedWays
          }

        });

      }

      res.writeHead(200, { "Content-Type": "application/json" });

      return res.end(JSON.stringify({
        success: true,
        data
      }));

    } catch (error) {

      res.writeHead(500, { "Content-Type": "application/json" });

      return res.end(JSON.stringify({
        success: false,
        message: error.message
      }));

    }

  });

}

function clearedOrders(req, res, deliverymenId) {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const data = JSON.parse(body);
      const { shopId } = data;

      if (!shopId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            success: false,
            message: "shopId is required",
          })
        );
      }

      db.query(
        `SELECT 
            id,
            work_type,
            finished_orders,
            cleared_orders,
            finished_order_count,
            cleared_order_count
         FROM deliverymen
         WHERE id = ?`,
        [deliverymenId],
        (err, rows) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(
              JSON.stringify({
                success: false,
                message: "Database error",
                error: err.message,
              })
            );
          }

          if (rows.length === 0) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(
              JSON.stringify({
                success: false,
                message: "Deliveryman not found",
              })
            );
          }

          const deliveryman = rows[0];

          // MySQL JSON may already be parsed
          let finishedOrders = deliveryman.finished_orders;
          let clearedOrders = deliveryman.cleared_orders;

          if (typeof finishedOrders === "string") {
            finishedOrders = JSON.parse(finishedOrders);
          }

          if (typeof clearedOrders === "string") {
            clearedOrders = JSON.parse(clearedOrders);
          }

          finishedOrders = Array.isArray(finishedOrders)
            ? finishedOrders
            : [];

          clearedOrders = Array.isArray(clearedOrders)
            ? clearedOrders
            : [];

          // =====================================================
          // CASE 1 => work_type exists
          // =====================================================
          if (deliveryman.work_type) {
            const movedOrders = [...finishedOrders];

            clearedOrders.push(...movedOrders);

            const newFinishedOrders = null;

            const movedCount = movedOrders.length;

            const newFinishedCount = 0;

            const newClearedCount =
              Number(deliveryman.cleared_order_count || 0) + movedCount;

            db.query(
              `UPDATE deliverymen
               SET 
                 finished_orders = ?,
                 cleared_orders = ?,
                 finished_order_count = ?,
                 cleared_order_count = ?
               WHERE id = ?`,
              [
                newFinishedOrders,
                JSON.stringify(clearedOrders),
                newFinishedCount,
                newClearedCount,
                deliverymenId,
              ],
              (updateErr) => {
                if (updateErr) {
                  res.writeHead(500, {
                    "Content-Type": "application/json",
                  });

                  return res.end(
                    JSON.stringify({
                      success: false,
                      message: "Update failed",
                      error: updateErr.message,
                    })
                  );
                }

                res.writeHead(200, {
                  "Content-Type": "application/json",
                });

                return res.end(
                  JSON.stringify({
                    success: true,
                    message: "Orders cleared successfully",
                    moved_orders: movedOrders,
                    finished_orders: null,
                    cleared_orders: clearedOrders,
                  })
                );
              }
            );
          }

          // =====================================================
          // CASE 2 => work_type is NULL
          // =====================================================
          else {
            if (finishedOrders.length === 0) {
              res.writeHead(400, {
                "Content-Type": "application/json",
              });

              return res.end(
                JSON.stringify({
                  success: false,
                  message: "No finished orders",
                })
              );
            }

            // Get orders that belong to shopId
            db.query(
              `SELECT id
               FROM orders
               WHERE shopId = ?
               AND id IN (?)`,
              [shopId, finishedOrders],
              (orderErr, orderRows) => {
                if (orderErr) {
                  res.writeHead(500, {
                    "Content-Type": "application/json",
                  });

                  return res.end(
                    JSON.stringify({
                      success: false,
                      message: "Database error",
                      error: orderErr.message,
                    })
                  );
                }

                const moveOrderIds = orderRows.map((o) => o.id);

                if (moveOrderIds.length === 0) {
                  res.writeHead(400, {
                    "Content-Type": "application/json",
                  });

                  return res.end(
                    JSON.stringify({
                      success: false,
                      message: "No matching orders for this shop",
                    })
                  );
                }

                // push to cleared_orders
                clearedOrders.push(...moveOrderIds);

                // remove from finished_orders
                const remainFinishedOrders = finishedOrders.filter(
                  (id) => !moveOrderIds.includes(id)
                );

                const finalFinishedOrders =
                  remainFinishedOrders.length > 0
                    ? remainFinishedOrders
                    : null;

                const movedCount = moveOrderIds.length;

                const newFinishedCount =
                  Number(deliveryman.finished_order_count || 0) - movedCount;

                const newClearedCount =
                  Number(deliveryman.cleared_order_count || 0) + movedCount;

                db.query(
                  `UPDATE deliverymen
                   SET
                     finished_orders = ?,
                     cleared_orders = ?,
                     finished_order_count = ?,
                     cleared_order_count = ?
                   WHERE id = ?`,
                  [
                    finalFinishedOrders
                      ? JSON.stringify(finalFinishedOrders)
                      : null,
                    JSON.stringify(clearedOrders),
                    newFinishedCount,
                    newClearedCount,
                    deliverymenId,
                  ],
                  (updateErr) => {
                    if (updateErr) {
                      res.writeHead(500, {
                        "Content-Type": "application/json",
                      });

                      return res.end(
                        JSON.stringify({
                          success: false,
                          message: "Update failed",
                          error: updateErr.message,
                        })
                      );
                    }

                    res.writeHead(200, {
                      "Content-Type": "application/json",
                    });

                    return res.end(
                      JSON.stringify({
                        success: true,
                        message: "Orders cleared successfully",
                        moved_orders: moveOrderIds,
                        finished_orders: finalFinishedOrders,
                        cleared_orders: clearedOrders,
                      })
                    );
                  }
                );
              }
            );
          }
        }
      );
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });

      return res.end(
        JSON.stringify({
          success: false,
          message: "Invalid JSON",
          error: e.message,
        })
      );
    }
  });
}

module.exports = { 
    loginDeliverymen,
    createDeliverymen,
    createDeliverymenForShop,
    getAllDeliverymen,
    getShopDeliverymen,
    changeStatus,
    deleteDeliverymen,
    putDeliverymen,
    getDeliverymenById,
    getOnlineDeliverymen,
    onlineDeliverymen,
    offlineDeliverymen,
    addOrdersToDeliverymen,
    connectedOrders,
    connectedOrdersBySpecialUsers,
    connectedOrdersByNonSpecialUsers,
    ordersHistoryByDeliveryman,
    changeLocation,
    getReportShopDeliveymenByShop,
    getReportSystemDeliveymenByShop,
    clearedOrders
};
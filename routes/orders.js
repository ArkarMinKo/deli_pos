const path = require("path");
const fs = require("fs");
const db = require("../db");
const { generateOrderId } = require("../utils/idOrderGenerator");

const UPLOAD_DIR = path.join(__dirname, "../orders_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function postOrder(req, res) {
  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const data = JSON.parse(body);

      const {
        userId,
        shopId,
        name,
        address,
        location,
        phone,
        type,
        timer,
        remark,
        orders,
        total_order,
        discount,
        tax,
        extra,
        delivery_fees,
        grand_total,
        payment_method,
        payment_phone,
        payment_name,
        payment_photo,
        kilo
      } = data;

      if (!userId || !orders || !grand_total || !payment_photo) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "Missing required fields"
        }));
      }

      const ordersArray = orders; // Already array from Flutter

      // ==========================
      // Generate Order ID
      // ==========================
      generateOrderId(db, (err, newOrderId) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: "ID generation error"
          }));
        }

        // ==========================
        // Base64 → Image Save
        // ==========================
        let base64Data = payment_photo;
        let extension = "png";

        const matches = base64Data.match(/^data:image\/(\w+);base64,/);
        if (matches) {
          extension = matches[1];
          base64Data = base64Data.replace(/^data:image\/\w+;base64,/, "");
        }

        const fileName = `${newOrderId}_${Date.now()}.${extension}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        const buffer = Buffer.from(base64Data, "base64");
        fs.writeFileSync(filePath, buffer);

        const relativePath = `orders-uploads/${fileName}`;

        // ==========================
        // Insert to Database
        // ==========================
        const insertSql = `
          INSERT INTO orders (
            id,
            userId,
            shopId,
            name,
            address,
            location,
            phone,
            type,
            timer,
            remark,
            orders,
            total_order,
            discount,
            tax,
            extra,
            delivery_fees,
            grand_total,
            payment_method,
            payment_phone,
            payment_name,
            payment_photo,
            kilo
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
          newOrderId,
          userId,
          shopId,
          name,
          address,
          location,
          phone,
          type || "Normal",
          timer || null,
          remark || null,
          JSON.stringify(ordersArray),
          total_order || 0,
          discount || 0,
          tax || 0,
          extra || 0,
          delivery_fees || 0,
          grand_total,
          payment_method,
          payment_phone,
          payment_name,
          relativePath,
          kilo
        ];

        db.query(insertSql, values, (err) => {
          if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
              success: false,
              message: "Database error",
              error: err
            }));
          }

          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            message: "သင့် Order အောင်မြင်စွာ မှာယူပြီးပါပြီ ကျေးဇူးပြု၍ ဆိုင်ဘက်မှ reply ကို စောင့်ပေးပါ",
            orderId: newOrderId,
            photo: relativePath
          }));
        });
      });

    } catch (error) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        message: "Invalid JSON format"
      }));
    }
  });
}

function getOrdersByShopId(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  const query = `
    SELECT DISTINCT
      o.*
    FROM orders o,
    JSON_TABLE(
      o.orders,
      '$[*]' COLUMNS (
        shop_id VARCHAR(50) PATH '$.shop_id'
      )
    ) jt
    WHERE jt.shop_id = ? AND o.orders_done = 0 ORDER BY o.id DESC
  `;

  db.query(query, [shopId], (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.sqlMessage || "Database error"
      }));
    }

    const finalResult = results.map(row => {

      let items = [];

      try {
        if (typeof row.orders === "string") {
          items = JSON.parse(row.orders);
        } else if (Array.isArray(row.orders)) {
          items = row.orders;
        } else {
          items = [];
        }
      } catch (e) {
        items = [];
      }

      const matchedItems = items.filter(item =>
        String(item.shop_id).trim() === String(shopId).trim()
      );

      return {
        ...row,
        orders: matchedItems
      };

    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      data: finalResult
    }));

  });

}

function getOrdersByUserId(req, res, userId) {

  if (!userId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "userId is required"
    }));
  }

  const query = `
    SELECT * FROM orders WHERE userId = ? ORDER BY id DESC
  `;

  db.query(query, [userId], (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.sqlMessage || "Database error"
      }));
    }

    if (results.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Orders များ မရှိသေးပါ"
      }));
    }

    try {

      // 1. collect shop_ids
      let shopIds = new Set();

      results.forEach(order => {
        if (order.orders) {
          order.orders.forEach(item => {
            shopIds.add(item.shop_id);
          });
        }
      });

      shopIds = Array.from(shopIds);

      // 2. get shops
      const shopQuery = `
        SELECT id, shop_name, phone, location, address 
        FROM shops 
        WHERE id IN (?)
      `;

      db.query(shopQuery, [shopIds], (err2, shops) => {

        if (err2) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: err2.sqlMessage || "Shop query error"
          }));
        }

        // 3. shop map
        const shopMap = {};

        shops.forEach(shop => {
          shopMap[shop.id] = {
            shop_name: shop.shop_name,
            phone: shop.phone,
            location: shop.location,
            address: shop.address
          };
        });

        // 4. inject shop data
        results.forEach(order => {

          if (order.orders) {

            order.orders.forEach(item => {
              item.shop_name = shopMap[item.shop_id]?.shop_name || null;
              item.shop_phone = shopMap[item.shop_id]?.phone || null;
              item.shop_location = shopMap[item.shop_id]?.location || null;
              item.shop_address = shopMap[item.shop_id]?.address || null;
            });

          }

        });

        // 5. collect deliverymen ids
        let deliveryIds = new Set();

        results.forEach(order => {
          if (order.deliverymenId) {
            deliveryIds.add(order.deliverymenId);
          }
        });

        deliveryIds = Array.from(deliveryIds);

        // no deliverymen assigned
        if (deliveryIds.length === 0) {

          results.forEach(order => {

            if (order.orders) {

              order.orders.forEach(item => {
                item.deliveryman_name = null;
                item.deliveryman_phone = null;
              });

            }

          });

          res.writeHead(200, { "Content-Type": "application/json" });

          return res.end(JSON.stringify({
            success: true,
            data: results
          }));

        }

        // 6. get deliverymen
        const deliveryQuery = `
          SELECT id, name, phone
          FROM deliverymen
          WHERE id IN (?)
        `;

        db.query(deliveryQuery, [deliveryIds], (err3, deliverymen) => {

          if (err3) {
            res.writeHead(500, { "Content-Type": "application/json" });

            return res.end(JSON.stringify({
              success: false,
              message: err3.sqlMessage || "Deliveryman query error"
            }));
          }

          // 7. deliveryman map
          const deliveryMap = {};

          deliverymen.forEach(dm => {
            deliveryMap[dm.id] = {
              name: dm.name,
              phone: dm.phone
            };
          });

          // 8. inject deliveryman
          results.forEach(order => {

            const delivery = deliveryMap[order.deliverymenId];

            if (order.orders) {

              order.orders.forEach(item => {
                item.deliveryman_name = delivery?.name || null;
                item.deliveryman_phone = delivery?.phone || null;
              });

            }

          });

          // 9. response
          res.writeHead(200, { "Content-Type": "application/json" });

          res.end(JSON.stringify({
            success: true,
            data: results
          }));

        });

      });

    } catch (e) {

      res.writeHead(500, { "Content-Type": "application/json" });

      res.end(JSON.stringify({
        success: false,
        message: e.message
      }));

    }

  });

}

function getOrderByOrderId(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "order id is required"
    }));
  }

  const query = `
    SELECT * FROM orders WHERE id = ? LIMIT 1
  `;

  db.query(query, [id], (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.sqlMessage || "Database error"
      }));
    }

    if (results.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Order မတွေ့ပါ"
      }));
    }

    try {

      let order = results[0];

      // 🔥 IMPORTANT: parse orders JSON if needed
      if (order.orders && typeof order.orders === "string") {
        order.orders = JSON.parse(order.orders);
      }

      // 1. collect shop_ids
      let shopIds = new Set();

      if (order.orders) {
        order.orders.forEach(item => {
          shopIds.add(item.shop_id);
        });
      }

      shopIds = Array.from(shopIds);

      // 2. get shops
      const shopQuery = `
        SELECT id, shop_name, phone, location, address 
        FROM shops 
        WHERE id IN (?)
      `;

      db.query(shopQuery, [shopIds], (err2, shops) => {

        if (err2) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: err2.sqlMessage || "Shop query error"
          }));
        }

        // 3. shop map
        const shopMap = {};
        shops.forEach(shop => {
          shopMap[shop.id] = {
            shop_name: shop.shop_name,
            phone: shop.phone,
            location: shop.location,
            address: shop.address
          };
        });

        // 4. inject shop data
        if (order.orders) {
          order.orders.forEach(item => {
            item.shop_name = shopMap[item.shop_id]?.shop_name || null;
            item.shop_phone = shopMap[item.shop_id]?.phone || null;
            item.shop_location = shopMap[item.shop_id]?.location || null;
            item.shop_address = shopMap[item.shop_id]?.address || null;
          });
        }

        // 5. get deliverymen
        const deliveryQuery = `
          SELECT name, phone, current_orders, finished_orders 
          FROM deliverymen
        `;

        db.query(deliveryQuery, (err3, deliverymen) => {

          if (err3) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
              success: false,
              message: err3.sqlMessage || "Deliveryman query error"
            }));
          }

          // 6. build map
          const deliveryMap = {};

          deliverymen.forEach(dm => {
            let current = [];
            let finished = [];

            try {
              if (dm.current_orders) {
                current = typeof dm.current_orders === "string"
                  ? JSON.parse(dm.current_orders)
                  : dm.current_orders;
              }

              if (dm.finished_orders) {
                finished = typeof dm.finished_orders === "string"
                  ? JSON.parse(dm.finished_orders)
                  : dm.finished_orders;
              }

            } catch (e) {
              console.log("JSON parse error:", dm);
            }

            [...current, ...finished].forEach(orderId => {
              if (orderId) {
                deliveryMap[String(orderId).trim()] = {
                  name: dm.name,
                  phone: dm.phone
                };
              }
            });
          });

          // 7. inject deliveryman
          const delivery = deliveryMap[order.id];

          if (order.orders) {
            order.orders.forEach(item => {
              item.deliveryman_name = delivery?.name || null;
              item.deliveryman_phone = delivery?.phone || null;
            });
          }

          // 8. response (same format as yours)
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: true,
            data: order
          }));

        });

      });

    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: false,
        message: e.message
      }));
    }

  });

}

async function approvedOrder(req, res) {
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    try {

      const parsedBody = JSON.parse(body);
      const { orderId, menu_id } = parsedBody;

      if (!orderId || !menu_id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "orderId and menu_id required" }));
      }

      const [rows] = await db.promise().query(
        "SELECT orders FROM orders WHERE id = ?",
        [orderId]
      );

      if (rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Order not found" }));
      }

      let orderItems = rows[0].orders;

      // 🛡 FIX HERE
      if (typeof orderItems === "string") {
        orderItems = JSON.parse(orderItems);
      }

      let found = false;

      orderItems = orderItems.map(item => {
        if (item.menu_id === menu_id) {
          item.status = 1;
          found = true;
        }
        return item;
      });

      if (!found) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Menu item not found in order" }));
      }

      await db.promise().query(
        "UPDATE orders SET orders = ? WHERE id = ?",
        [JSON.stringify(orderItems), orderId]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Order item approved successfully" }));

    } catch (err) {
      console.error("ERROR:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Server error" }));
    }
  });
}

async function rejectedOrder(req, res) {
  let body = "";

  req.on("data", chunk => {
    body += chunk;
  });

  req.on("end", async () => {
    try {

      const parsedBody = JSON.parse(body);
      const { orderId, menu_id } = parsedBody;

      if (!orderId || !menu_id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "orderId and menu_id required" }));
      }

      const [rows] = await db.promise().query(
        "SELECT orders FROM orders WHERE id = ?",
        [orderId]
      );

      if (rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Order not found" }));
      }

      let orderItems = rows[0].orders;

      // If MySQL returns string
      if (typeof orderItems === "string") {
        orderItems = JSON.parse(orderItems);
      }

      let found = false;

      orderItems = orderItems.map(item => {
        if (item.menu_id === menu_id) {
          item.status = 2; // 🔴 Rejected
          found = true;
        }
        return item;
      });

      if (!found) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Menu item not found in order" }));
      }

      await db.promise().query(
        "UPDATE orders SET orders = ? WHERE id = ?",
        [JSON.stringify(orderItems), orderId]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Order item rejected successfully" }));

    } catch (err) {
      console.error("ERROR:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Server error" }));
    }
  });
}

async function approveAllOrderItems(req, res, orderId) {
  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      // safe JSON parse
      let data = {};
      if (body && body.trim() !== "") {
        try {
          data = JSON.parse(body);
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Invalid JSON format" }));
        }
      }

      const { shopId } = data;

      if (!orderId || !shopId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({ message: "orderId and shopId required" })
        );
      }

      const [rows] = await db.promise().query(
        "SELECT orders FROM orders WHERE id = ?",
        [orderId]
      );

      if (rows.length === 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Order not found" }));
      }

      let orderItems = rows[0].orders;

      if (typeof orderItems === "string") {
        orderItems = JSON.parse(orderItems || "[]");
      }

      orderItems = (orderItems || []).map(item => {
        if (item.shop_id === shopId) {
          return { ...item, status: 1 };
        }
        return item;
      });

      await db.promise().query(
        "UPDATE orders SET orders = ? WHERE id = ?",
        [JSON.stringify(orderItems), orderId]
      );

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: "Shop order items approved successfully"
        })
      );

    } catch (err) {
      console.error("Server Error:", err);

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          message: "Internal Server Error"
        })
      );
    }
  });
}

async function rejectAllOrderItems(req, res, orderId) {
  try {

    if (!orderId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "orderId required" }));
    }

    const [rows] = await db.promise().query(
      "SELECT orders FROM orders WHERE id = ?",
      [orderId]
    );

    if (rows.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Order not found" }));
    }

    let orderItems = rows[0].orders;

    if (typeof orderItems === "string") {
      orderItems = JSON.parse(orderItems);
    }

    // 🔴 All → Rejected
    orderItems = orderItems.map(item => ({
      ...item,
      status: 2
    }));

    await db.promise().query(
      "UPDATE orders SET orders = ? WHERE id = ?",
      [JSON.stringify(orderItems), orderId]
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "All order items rejected successfully" }));

  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Server error" }));
  }
}

function getAllSpecialOrders(req, res) {

  const query = `
    SELECT 
      o.*
    FROM orders o
    JOIN users u ON o.userId = u.id
    JOIN JSON_TABLE(
      o.orders,
      '$[*]' COLUMNS (
        status INT PATH '$.status'
      )
    ) jt
    WHERE 
      o.orders_done = 0
      AND o.connected_deliveryman = 0
      AND u.special = 1
    GROUP BY o.id
    HAVING COUNT(*) = SUM(CASE WHEN jt.status = 1 THEN 1 ELSE 0 END)
    ORDER BY o.id DESC
  `;

  db.query(query, (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Database error",
        error: err.message
      }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      count: results.length,
      data: results
    }));

  });

}

function getAllOrders(req, res, id) {

  const deliverySql = `SELECT work_type FROM deliverymen WHERE id = ?`;

  db.query(deliverySql, [id], (err, deliveryResults) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: false, message: "Database error", error: err.message }));
    }

    if (deliveryResults.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: false, message: "Deliveryman not found" }));
    }

    const workType = deliveryResults[0].work_type;

    let extraCondition = "";

    if (!workType) {
      extraCondition = `AND s.open_shop_deli = 0`;
    }
    else {
      extraCondition = `AND jt.shop_id = ? AND s.open_shop_deli = 1`;
    }

    const query = `
      SELECT 
        o.*
      FROM orders o
      JOIN users u ON o.userId = u.id
      JOIN JSON_TABLE(
        o.orders,
        '$[*]' COLUMNS (
          status INT PATH '$.status',
          shop_id VARCHAR(50) PATH '$.shop_id'
        )
      ) jt
      JOIN shops s 
        ON jt.shop_id COLLATE utf8mb4_unicode_ci = s.id
      WHERE 
        o.orders_done = 0
        AND o.connected_deliveryman = 0
        AND u.special = 0
        ${extraCondition}
      GROUP BY o.id
      HAVING COUNT(*) = SUM(CASE WHEN jt.status = 1 THEN 1 ELSE 0 END)
      ORDER BY o.id DESC
    `;

    const params = workType ? [workType] : [];

    db.query(query, params, (err, results) => {

      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "Database error",
          error: err.message
        }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        count: results.length,
        data: results
      }));

    });

  });
}

async function connectedDeliverymen(req, res) {
  try {
    const [deliverymen] = await db.promise().query(
      "SELECT * FROM deliverymen WHERE current_orders IS NOT NULL"
    );

    const result = [];

    for (let dm of deliverymen) {

      let orderIds = [];

      // 🔹 Important Fix Here
      if (dm.current_orders) {
        if (Array.isArray(dm.current_orders)) {
          orderIds = dm.current_orders; // already parsed
        } else if (typeof dm.current_orders === "string") {
          orderIds = JSON.parse(dm.current_orders);
        }
      }

      let ordersData = [];

      if (orderIds.length > 0) {
        const placeholders = orderIds.map(() => "?").join(",");

        const [orders] = await db.promise().query(
          `SELECT * FROM orders WHERE id IN (${placeholders})`,
          orderIds
        );

        ordersData = orders;
      }

      result.push({
        id: dm.id,
        name: dm.name,
        email: dm.email,
        phone: dm.phone,
        work_type: dm.work_type,
        location: dm.location,
        status: dm.status,
        rating: dm.rating,
        finished_order_count: dm.finished_order_count,
        is_online: dm.is_online,
        assign_order: dm.assign_order,
        current_orders: orderIds,
        orders: ordersData
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      count: result.length,
      data: result
    }));

  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error.message }));
  }
}

function finishOrder(req, res, orderId) {
  const { esign, deliverymanId } = req.body || {};

  // Validate
  if (!esign || !deliverymanId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        success: false,
        message: "esign and deliverymanId are required",
      })
    );
  }

  // Base64 image validation
  const matches = esign.match(/^data:image\/(\w+);base64,(.+)$/);

  if (!matches) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        success: false,
        message: "Invalid base64 image format",
      })
    );
  }

  const ext = matches[1];
  const base64Data = matches[2];

  // Create uploads folder if not exists
  const uploadDir = path.join(__dirname, "../orders_uploads");

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // File name
  const fileName = `esign_${Date.now()}.${ext}`;
  const filePath = path.join(uploadDir, fileName);

  // Save image
  fs.writeFile(filePath, base64Data, "base64", (err) => {
    if (err) {
      console.log(err);

      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          success: false,
          message: "Failed to save esign image",
        })
      );
    }

    const imagePath = `/orders-uploads/${fileName}`;

    // Update order
    const orderSql = `
      UPDATE orders 
      SET 
        orders_done = 1,
        orders_pickup = 1,
        esign = ?
      WHERE id = ?
    `;

    db.query(orderSql, [imagePath, orderId], (orderErr, orderResult) => {
      if (orderErr) {
        console.log(orderErr);

        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            success: false,
            message: "Failed to update order",
          })
        );
      }

      // Get deliveryman data
      const deliverySql = `
        SELECT current_orders, finished_orders, finished_order_count, assign_order
        FROM deliverymen
        WHERE id = ?
      `;

      db.query(deliverySql, [deliverymanId], (deliveryErr, deliveryResult) => {
        if (deliveryErr) {
          console.log(deliveryErr);

          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              message: "Failed to get deliveryman",
            })
          );
        }

        if (deliveryResult.length === 0) {
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              message: "Deliveryman not found",
            })
          );
        }

        const deliveryman = deliveryResult[0];

        let currentOrders = [];
        let finishedOrders = [];

        try {
          currentOrders = JSON.parse(deliveryman.current_orders || "[]");
          finishedOrders = JSON.parse(deliveryman.finished_orders || "[]");
        } catch (e) {
          console.log(e);
        }

        // Remove order from current_orders
        currentOrders = currentOrders.filter(
          (id) => id !== orderId
        );

        // Add to finished_orders if not exists
        if (!finishedOrders.includes(orderId)) {
          finishedOrders.push(orderId);
        }

        const finishedOrderCount =
          (deliveryman.finished_order_count || 0) + 1;

        let assignOrder = (deliveryman.assign_order || 0) - 1;

        // Not less than 0
        if (assignOrder < 0) {
          assignOrder = 0;
        }

        // Update deliveryman
        const updateDeliverySql = `
          UPDATE deliverymen
          SET
            current_orders = ?,
            finished_orders = ?,
            finished_order_count = ?,
            assign_order = ?
          WHERE id = ?
        `;

        db.query(
          updateDeliverySql,
          [
            JSON.stringify(currentOrders),
            JSON.stringify(finishedOrders),
            finishedOrderCount,
            assignOrder,
            deliverymanId,
          ],
          (updateErr) => {
            if (updateErr) {
              console.log(updateErr);

              res.writeHead(500, {
                "Content-Type": "application/json",
              });

              return res.end(
                JSON.stringify({
                  success: false,
                  message: "Failed to update deliveryman",
                })
              );
            }

            res.writeHead(200, {
              "Content-Type": "application/json",
            });

            return res.end(
              JSON.stringify({
                success: true,
                message: "Order finished successfully",
                data: {
                  orderId,
                  esign: imagePath,
                },
              })
            );
          }
        );
      });
    });
  });
}

function pickupOrder(req, res, id) {

  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Order ID is required" }));
  }

  const query = `
    UPDATE orders
    SET orders_pickup = 1
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
      return res.end(JSON.stringify({ error: "Order not found" }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      message: "Order ကို Delivery သမားဆီ ထည့်ပေးလိုက်ပါပြီ",
      deliveryman_id: id
    }));
  });
}

async function getReport(req, res) {
  try {

    // orders_done = 1 orders
    const [orders] = await db.promise().query(
      "SELECT * FROM orders WHERE orders_done = 1 ORDER BY id DESC"
    );

    const [deliverymen] = await db.promise().query(`
      SELECT 
            d.id, 
            d.name, 
            d.phone, 
            d.status,
            d.finished_orders,
            CASE 
                WHEN d.work_type IS NULL THEN NULL
                ELSE s.shop_name
            END AS work_type
        FROM deliverymen d
        LEFT JOIN shops s ON d.work_type = s.id
    `);

    const clean = (v) => String(v || "").trim().toUpperCase();

    const deliveryMap = {};

    for (let dm of deliverymen) {
      if (!dm.finished_orders) continue;

      let finishedOrders = [];

      if (Array.isArray(dm.finished_orders)) {
        finishedOrders = dm.finished_orders;
      } else {
        try {
          finishedOrders = JSON.parse(dm.finished_orders);
        } catch {
          finishedOrders = [];
        }
      }

      for (let oid of finishedOrders) {
        deliveryMap[clean(oid)] = dm;
      }
    }

    const report = [];

    for (let order of orders) {
      const deliverymanInfo = deliveryMap[clean(order.id)] || null;

      report.push({
        order: order,
        deliveryman: deliverymanInfo
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      total: report.length,
      data: report
    }));

  } catch (err) {

    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: false,
      error: err.message
    }));

  }
}

async function getReportByShop(req, res, id) {
  try {
    const [orders] = await db.promise().query(
        `
          SELECT DISTINCT
        o.*
        FROM orders o,
        JSON_TABLE(
          o.orders,
          '$[*]' COLUMNS (
            shop_id VARCHAR(50) PATH '$.shop_id'
          )
        ) jt
        WHERE jt.shop_id = ? AND o.orders_done = 1 ORDER BY o.id DESC
      `, [id]
    )

    const [deliverymen] = await db.promise().query(`
      SELECT 
            d.id, 
            d.name, 
            d.phone, 
            d.status,
            d.finished_orders,
            CASE 
                WHEN d.work_type IS NULL THEN NULL
                ELSE s.shop_name
            END AS work_type
        FROM deliverymen d
        LEFT JOIN shops s ON d.work_type = s.id
    `);

    const clean = (v) => String(v || "").trim().toUpperCase();

    const deliveryMap = {};

    for (let dm of deliverymen) {
      if (!dm.finished_orders) continue;

      let finishedOrders = [];

      if (Array.isArray(dm.finished_orders)) {
        finishedOrders = dm.finished_orders;
      } else {
        try {
          finishedOrders = JSON.parse(dm.finished_orders);
        } catch {
          finishedOrders = [];
        }
      }

      for (let oid of finishedOrders) {
        deliveryMap[clean(oid)] = dm;
      }
    }

    const report = [];

    for (let order of orders) {
      const deliverymanInfo = deliveryMap[clean(order.id)] || null;

      report.push({
        order: order,
        deliveryman: deliverymanInfo
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      total: report.length,
      data: report
    }));

  } catch (err) {

    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: false,
      error: err.message
    }));

  }
}

function orderConfirm(req, res) {

  let body = "";

  req.on("data", chunk => {
    body += chunk.toString();
  });

  req.on("end", () => {

    try {

      const data = JSON.parse(body);
      const menu = data.menu;

      // Validate menu
      if (!Array.isArray(menu) || menu.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: "menu is required"
        }));
      }

      // Get Shop IDs and Menu IDs
      const shopIds = [];
      const menuIds = [];

      menu.forEach(item => {

        const parts = item.split("_");

        if (parts.length !== 2) return;

        const shopId = parts[0];
        const menuId = parts[1];

        if (!shopIds.includes(shopId)) {
          shopIds.push(shopId);
        }

        if (!menuIds.includes(menuId)) {
          menuIds.push(menuId);
        }

      });

      // =========================
      // 1. Check Server Status
      // =========================

      const serverQuery = `
        SELECT server
        FROM server
        WHERE id = 1
        LIMIT 1
      `;

      db.query(serverQuery, (serverErr, serverResults) => {

        if (serverErr) {

          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: "Database error",
            error: serverErr
          }));

        }

        if (
          serverResults.length === 0 ||
          serverResults[0].server === 0
        ) {

          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: "Delivery Server ပိတ်ထားပါသဖြင့် Order များကို မှာယူလို့မရသေးပါ"
          }));

        }

        // =========================
        // 2. Check Shop Open Status
        // =========================

        const shopQuery = `
          SELECT id, shop_name, open_shop
          FROM shops
          WHERE id IN (?)
        `;

        db.query(shopQuery, [shopIds], (shopErr, shopResults) => {

          if (shopErr) {

            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
              success: false,
              message: "Database error",
              error: shopErr
            }));

          }

          // Find closed shop
          const closedShop = shopResults.find(
            shop => shop.open_shop === 0
          );

          if (closedShop) {

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
              success: false,
              message: `ယခုမှာယူသော ${closedShop.shop_name} ဆိုင်သည် order လက်ခံခြင်းကို ပိတ်လိုက်ပြီ ဖြစ်ပါသဖြင့် order များကို တစ်ခြားဆိုင်မှ ပြောင်း၍ မှာယူပေးပါ။`
            }));

          }

          // =========================
          // 3. Check Menu Open Status
          // =========================

          const menuQuery = `
            SELECT id, name, open_menu
            FROM menu
            WHERE id IN (?)
          `;

          db.query(menuQuery, [menuIds], (menuErr, menuResults) => {

            if (menuErr) {

              res.writeHead(500, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({
                success: false,
                message: "Database error",
                error: menuErr
              }));

            }

            // Closed menus
            const unavailableMenus = menuResults.filter(
              item => item.open_menu !== 1
            );

            if (unavailableMenus.length > 0) {

              const menuNames = unavailableMenus.map(
                item => `'${item.name}'`
              );

              let message = "";

              if (menuNames.length === 1) {

                message =
                  `ယခု မှာယူများထဲမှာ ${menuNames[0]} သည် မရရှိနိုင်တော့ပါသဖြင့် ` +
                  `တစ်ခြား orders များ ပြောင်း၍ မှာပေးပါ။`;

              } else {

                message =
                  `ယခု မှာယူများထဲမှာ ${menuNames.join(", ")} များသည် ` +
                  `မရရှိနိုင်တော့ပါသဖြင့် တစ်ခြား orders များ ပြောင်း၍ မှာပေးပါ။`;

              }

              res.writeHead(200, { "Content-Type": "application/json" });
              return res.end(JSON.stringify({
                success: false,
                message
              }));

            }

            // =========================
            // SUCCESS
            // =========================

            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
              success: true,
              message: "Orders များ အားလုံး ရရှိနိုင်ပါသည်"
            }));

          });

        });

      });

    } catch (error) {

      res.writeHead(400, { "Content-Type": "application/json" });

      return res.end(JSON.stringify({
        success: false,
        message: "Invalid JSON body"
      }));

    }

  });

}

function getReportByShopSummaries(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  // totay date (YYYY-MM-DD)
  const today = new Date().toLocaleDateString("en-CA");

  // 1. Today's total orders + amount
  const orderQuery = `
    SELECT 
      COUNT(*) AS total_orders,
      COALESCE(SUM(grand_total), 0) AS total_amount
    FROM orders
    WHERE shopId = ?
      AND DATE(created_at) = ?
  `;

  db.query(orderQuery, [shopId, today], (err, orderResults) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.message
      }));
    }

    const total_orders = orderResults[0].total_orders || 0;
    const total_amount = Number(orderResults[0].total_amount || 0);

    // 2. Get all deliverymen
    const deliverymenQuery = `
      SELECT id, finished_orders, work_type
      FROM deliverymen
    `;

    db.query(deliverymenQuery, (err2, deliverymenResults) => {

      if (err2) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
          success: false,
          message: err2.message
        }));
      }

      let total_way_shopDeliverymen = 0;
      let total_way_systemDeliverymen = 0;

      // collect all order ids from this shop
      const shopOrderIdsQuery = `
        SELECT id
        FROM orders
        WHERE shopId = ?
      `;

      db.query(shopOrderIdsQuery, [shopId], (err3, shopOrders) => {

        if (err3) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({
            success: false,
            message: err3.message
          }));
        }

        const shopOrderIds = shopOrders.map(order => order.id);

        deliverymenResults.forEach(deliveryman => {

          let finishedOrders = [];

          try {
            finishedOrders = JSON.parse(deliveryman.finished_orders || "[]");
          } catch (e) {
            finishedOrders = [];
          }

          // Shop own deliverymen
          if (deliveryman.work_type === shopId) {
            total_way_shopDeliverymen += finishedOrders.length;
          }

          // System deliverymen
          if (
            deliveryman.work_type === null ||
            deliveryman.work_type === ""
          ) {

            finishedOrders.forEach(orderId => {

              if (shopOrderIds.includes(orderId)) {
                total_way_systemDeliverymen++;
              }

            });
          }

        });

        res.writeHead(200, { "Content-Type": "application/json" });

        return res.end(JSON.stringify({
          success: true,
          data: {
            total_orders,
            total_amount,
            total_way_shopDeliverymen,
            total_way_systemDeliverymen
          }
        }));

      });

    });

  });

}

module.exports = {
  postOrder,
  getOrdersByShopId,
  getOrdersByUserId,
  getOrderByOrderId,
  approvedOrder,
  rejectedOrder,
  approveAllOrderItems,
  rejectAllOrderItems,
  getAllSpecialOrders,
  getAllOrders,
  connectedDeliverymen,
  finishOrder,
  getReport,
  pickupOrder,
  getReportByShop,
  orderConfirm,
  getReportByShopSummaries
};
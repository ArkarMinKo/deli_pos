const db = require("../db");

function formatDateLabel(dateString) {
  const now = new Date();
  const date = new Date(dateString);

  // convert both to local (remove timezone diff)
  const localNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const localDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const diffTime = localNow - localDate;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return localDate.toISOString().split("T")[0];
}

function getOrderDetailById(id) {
  return new Promise((resolve, reject) => {

    if (!id) return reject(new Error("order id is required"));

    const query = `SELECT * FROM orders WHERE id = ? LIMIT 1`;

    db.query(query, [id], (err, results) => {
      if (err) return reject(err);
      if (results.length === 0) return reject(new Error("Order not found"));

      let order = results[0];

      try {
        if (order.orders && typeof order.orders === "string") {
          order.orders = JSON.parse(order.orders);
        }

        // collect shop ids
        let shopIds = new Set();
        if (order.orders) {
          order.orders.forEach(item => shopIds.add(item.shop_id));
        }

        shopIds = Array.from(shopIds);

        const shopQuery = `
          SELECT id, shop_name, phone, location, address 
          FROM shops 
          WHERE id IN (?)
        `;

        db.query(shopQuery, [shopIds], (err2, shops) => {
          if (err2) return reject(err2);

          const shopMap = {};
          shops.forEach(shop => {
            shopMap[shop.id] = shop;
          });

          if (order.orders) {
            order.orders.forEach(item => {
              const s = shopMap[item.shop_id] || {};
              item.shop_name = s.shop_name || null;
              item.shop_phone = s.phone || null;
              item.shop_location = s.location || null;
              item.shop_address = s.address || null;
            });
          }

          const deliveryQuery = `
            SELECT name, phone, current_orders, finished_orders 
            FROM deliverymen
          `;

          db.query(deliveryQuery, (err3, deliverymen) => {
            if (err3) return reject(err3);

            const deliveryMap = {};

            deliverymen.forEach(dm => {
              let current = [];
              let finished = [];

              try {
                current = dm.current_orders ? JSON.parse(dm.current_orders) : [];
                finished = dm.finished_orders ? JSON.parse(dm.finished_orders) : [];
              } catch {}

              [...current, ...finished].forEach(orderId => {
                if (orderId) {
                  deliveryMap[String(orderId).trim()] = {
                    name: dm.name,
                    phone: dm.phone
                  };
                }
              });
            });

            const delivery = deliveryMap[order.id];

            if (order.orders) {
              order.orders.forEach(item => {
                item.deliveryman_name = delivery?.name || null;
                item.deliveryman_phone = delivery?.phone || null;
              });
            }

            resolve(order); // ✅ return final data
          });
        });

      } catch (e) {
        reject(e);
      }
    });
  });
}

async function getNotiUser(req, res, userId) {

  if (!userId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "userId is required"
    }));
  }

  const query = `
    SELECT id, connected_deliveryman, connected_deliveryman_seen,
           orders_pickup, orders_pickup_seen,
           orders_done, orders_done_seen, created_at
    FROM orders
    WHERE userId = ?
    ORDER BY created_at DESC
  `;

  db.query(query, [userId], async (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }

    let data = [];
    let unseenCount = 0;
    let notiId = 1;

    for (const order of results) {

      let fullOrder = null;

      try {
        fullOrder = await getOrderDetailById(order.id); // 🔥 reuse here
      } catch (e) {
        fullOrder = null;
      }

      if (order.connected_deliveryman == 1) {
        if (order.connected_deliveryman_seen == 0) unseenCount++;

        data.push({
          id: "N" + String(notiId++).padStart(3, "0"),
          orderId: order.id,
          title: "Delivery Confirmed",
          Des: `သင့်အော်ဒါ #${order.id} ကို ဆိုင်မှ လက်ခံလိုက်ပါပြီ။`,
          seen: order.connected_deliveryman_seen,
          seen_type: 'connected_deliveryman_seen',
          date: formatDateLabel(order.created_at),
          data: fullOrder // ✅ injected
        });
      }

      if (order.orders_pickup == 1) {
        if (order.orders_pickup_seen == 0) unseenCount++;

        data.push({
          id: "N" + String(notiId++).padStart(3, "0"),
          orderId: order.id,
          title: "Order pickup",
          Des: `သင့်အော်ဒါ #${order.id} ကို Delivery သမားက ဆိုင်မှ ယူဆောင်သွားပါပြီ။`,
          seen: order.orders_pickup_seen,
          seen_type: 'orders_pickup_seen',
          date: formatDateLabel(order.created_at),
          data: fullOrder
        });
      }

      if (order.orders_done == 1) {
        if (order.orders_done_seen == 0) unseenCount++;

        data.push({
          id: "N" + String(notiId++).padStart(3, "0"),
          orderId: order.id,
          title: "Order Done",
          Des: `သင့်အော်ဒါ #${order.id} ကို အောင်မြင်စွာ ပို့ဆောင်ပြီးပါပြီ။`,
          seen: order.orders_done_seen,
          seen_type: 'orders_done_seen',
          date: formatDateLabel(order.created_at),
          data: fullOrder
        });
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      unseenNofi: unseenCount.toString(),
      data: {
        orders: data,
        system: []
      }
    }));
  });
}

function mobileNotiSeen(req, res, id) {
  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Order id is required"
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

    const { seen_type } = data;

    if (!seen_type) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "seen_type is required"
      }));
    }

    if (seen_type !== 'connected_deliveryman_seen' && seen_type !== 'orders_pickup_seen' && seen_type !== 'orders_done_seen') {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "seen_type must be connected_deliveryman_seen or orders_pickup_seen or orders_done_seen."
      }));
    }

    const query = `
      UPDATE orders
      SET ${seen_type} = 1
      WHERE id = ?
    `;

    db.query(query, [id], (err, result) => {
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
          message: "Order not found"
        }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: true,
        message: "Notification seen successfully"
      }));
    });
  });
}

module.exports = { 
    getNotiUser,
    mobileNotiSeen
};
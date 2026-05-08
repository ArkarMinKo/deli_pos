const db = require("../db");

function getDashboardSummariesByShop(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  // Myanmar local date
  const today = new Date().toLocaleDateString("en-CA");

  const query = `
    SELECT 
      id,
      orders,
      grand_total,
      userId,
      delivery_fees,
      created_at
    FROM orders
    WHERE DATE(CONVERT_TZ(created_at, '+00:00', '+06:30')) = ?
  `;

  db.query(query, [today], (err, results) => {

    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: err.message
      }));
    }

    let uniqueMenus = new Set();
    let uniqueUsers = new Set();

    let today_amount = 0;
    let today_delivery_fees = 0;

    results.forEach(order => {

      // unique users
      if (order.userId) {
        uniqueUsers.add(order.userId);
      }

      // totals
      today_amount += Number(order.grand_total || 0);
      today_delivery_fees += Number(order.delivery_fees || 0);

      // parse orders json
      let orderItems = [];

      try {
        orderItems = JSON.parse(order.orders || "[]");
      } catch (e) {
        orderItems = [];
      }

      orderItems.forEach(item => {

        // only this shop menus
        if (item.shop_id === shopId) {

          if (item.menu_id) {
            uniqueMenus.add(item.menu_id);
          }

        }

      });

    });

    const data = {
      today_menu_count: uniqueMenus.size,
      today_users_count: uniqueUsers.size,
      today_amount,
      today_delivery_fees,
      today_profits: today_amount - today_delivery_fees
    };

    res.writeHead(200, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: true,
      data
    }));

  });

}

module.exports = { 
    getDashboardSummariesByShop
};
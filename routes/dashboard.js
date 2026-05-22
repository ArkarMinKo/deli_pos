const db = require("../db");

function getDashboardSummariesByShop(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  const today = new Date().toLocaleDateString("en-CA");

  const query = `
    SELECT 
      id,
      orders,
      grand_total,
      userId,
      delivery_fees,
      shopId,
      created_at
    FROM orders
    WHERE shopId = ?
    AND DATE(created_at) = ?
  `;

  db.query(query, [shopId, today], (err, results) => {

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

      // users
      if (order.userId) {
        uniqueUsers.add(order.userId);
      }

      // totals
      today_amount += Number(order.grand_total || 0);
      today_delivery_fees += Number(order.delivery_fees || 0);

      // orders json
      let orderItems = [];

      try {

        if (typeof order.orders === "string") {
          orderItems = JSON.parse(order.orders);
        } else if (Array.isArray(order.orders)) {
          orderItems = order.orders;
        }

      } catch (e) {
        orderItems = [];
      }

      // menus
      orderItems.forEach(item => {

        if (item.menu_id) {
          uniqueMenus.add(item.menu_id);
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

function getReportRvenueByShopId(req, res, shopId) {

  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: false,
      message: "shopId is required"
    }));
  }

  const query = `
    SELECT id, shopId, grand_total, delivery_fees, created_at
    FROM orders
    WHERE shopId = ?
  `;

  db.query(query, [shopId], (err, results) => {

    if (err) {

      res.writeHead(500, { "Content-Type": "application/json" });

      return res.end(JSON.stringify({
        success: false,
        message: "Database error",
        error: err.message
      }));
    }

    // =========================
    // HOURLY REPORT
    // =========================

    const hourMap = {};

    for (let hour = 6; hour <= 20; hour++) {

      let label = "";

      if (hour === 12) {
        label = "12 PM";
      } else if (hour > 12) {
        label = `${hour - 12} PM`;
      } else {
        label = `${hour} AM`;
      }

      hourMap[hour] = {
        time: label,
        value: 0
      };
    }

    // =========================
    // WEEKLY REPORT
    // =========================

    const weeklyNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const weeklyMap = {
      Mon: { time: "Mon", value: 0 },
      Tue: { time: "Tue", value: 0 },
      Wed: { time: "Wed", value: 0 },
      Thu: { time: "Thu", value: 0 },
      Fri: { time: "Fri", value: 0 },
      Sat: { time: "Sat", value: 0 },
      Sun: { time: "Sun", value: 0 }
    };

    // =========================
    // YEARLY REPORT
    // Jan -> Dec
    // =========================

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const yearlyMap = {};

    for (let i = 0; i < 12; i++) {

      yearlyMap[i] = {
        time: monthNames[i],
        value: 0
      };
    }

    // =========================
    // TODAY
    // =========================

    const today = new Date();

    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    const currentYear = today.getFullYear();

    // =========================
    // LOOP ORDERS
    // =========================

    results.forEach(order => {

      const created = new Date(order.created_at);

      const revenue =
        Number(order.grand_total || 0) -
        Number(order.delivery_fees || 0);

      // =====================
      // HOURLY
      // =====================

      if (
        created.getFullYear() === todayYear &&
        created.getMonth() === todayMonth &&
        created.getDate() === todayDate
      ) {

        const hour = created.getHours();

        if (hourMap[hour]) {
          hourMap[hour].value += revenue;
        }
      }

      // =====================
      // WEEKLY
      // =====================

      const dayName = weeklyNames[created.getDay()];

      if (weeklyMap[dayName]) {
        weeklyMap[dayName].value += revenue;
      }

      // =====================
      // YEARLY
      // =====================

      if (created.getFullYear() === currentYear) {

        const monthIndex = created.getMonth();

        yearlyMap[monthIndex].value += revenue;
      }

    });

    // =========================
    // RESPONSE
    // =========================

    const response = {
      success: true,
      data: {
        hour: Object.values(hourMap),

        weekly: [
          weeklyMap.Mon,
          weeklyMap.Tue,
          weeklyMap.Wed,
          weeklyMap.Thu,
          weeklyMap.Fri,
          weeklyMap.Sat,
          weeklyMap.Sun
        ],

        yearly: Object.values(yearlyMap)
      }
    };

    res.writeHead(200, { "Content-Type": "application/json" });

    return res.end(JSON.stringify(response));

  });

}

function getReportCategoriesChartByShopId(req, res, shopId) {
  if (!shopId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        success: false,
        message: "shopId is required",
      })
    );
  }

  // 1. Get all orders for this shop
  const ordersSql = `
    SELECT id, orders
    FROM orders
    WHERE shopId = ?
  `;

  db.query(ordersSql, [shopId], (err, orderResults) => {
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

    // 2. Get all menu categories
    const menuSql = `
      SELECT id, category
      FROM menu
    `;

    db.query(menuSql, (menuErr, menuResults) => {
      if (menuErr) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            success: false,
            message: "Database error",
            error: menuErr.message,
          })
        );
      }

      // 3. Get category names
      const categoriesSql = `
        SELECT id, name
        FROM categories
      `;

      db.query(categoriesSql, (catErr, categoryResults) => {
        if (catErr) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              success: false,
              message: "Database error",
              error: catErr.message,
            })
          );
        }

        // =========================
        // Create menu -> category map
        // =========================
        const menuCategoryMap = {};

        menuResults.forEach((menu) => {
          menuCategoryMap[menu.id] = menu.category;
        });

        // =========================
        // Create categoryId -> name map
        // =========================
        const categoryNameMap = {};

        categoryResults.forEach((cat) => {
          categoryNameMap[cat.id] = cat.name;
        });

        // =========================
        // Final category totals
        // =========================
        const categoryChart = {};

        orderResults.forEach((orderRow) => {
          let orderItems = [];

          try {
            orderItems =
              typeof orderRow.orders === "string"
                ? JSON.parse(orderRow.orders)
                : orderRow.orders;
          } catch (e) {
            orderItems = [];
          }

          if (!Array.isArray(orderItems)) return;

          orderItems.forEach((item) => {
            const menuId = item.menu_id;
            const quantity = Number(item.quantity || 0);

            // Get category id from menu table
            const categoryId = menuCategoryMap[menuId];

            if (!categoryId) return;

            // Get category name
            const categoryName = categoryNameMap[categoryId];

            if (!categoryName) return;

            // Add quantity count
            if (!categoryChart[categoryName]) {
              categoryChart[categoryName] = 0;
            }

            categoryChart[categoryName] += quantity;
          });
        });

        // =========================
        // Response
        // =========================
        res.writeHead(200, { "Content-Type": "application/json" });

        return res.end(
          JSON.stringify({
            success: true,
            data: categoryChart,
          })
        );
      });
    });
  });
}

const top5MenuByShopId = async (req, res, shopId) => {
    try {
        // Get all orders for this shop
        const [ordersRows] = await db.promise().execute(
            `SELECT orders FROM orders WHERE shopId = ?`,
            [shopId]
        );

        // Get menu + category info
        const [menuRows] = await db.promise().execute(`
            SELECT 
                m.id,
                m.name,
                c.name AS category
            FROM menu m
            LEFT JOIN categories c 
                ON m.category = c.id
            WHERE m.shop_id = ?
        `, [shopId]);

        // Create menu map
        const menuMap = {};

        for (const menu of menuRows) {
            menuMap[menu.id] = {
                name: menu.name,
                category: menu.category || "Unknown",
                orders: 0
            };
        }

        // Count menu quantities from orders JSON
        for (const row of ordersRows) {
            let orderItems = [];

            try {
                orderItems =
                    typeof row.orders === "string"
                        ? JSON.parse(row.orders)
                        : row.orders;
            } catch (err) {
                continue;
            }

            if (!Array.isArray(orderItems)) continue;

            for (const item of orderItems) {
                const menuId = item.menu_id;
                const quantity = Number(item.quantity || 0);

                if (menuMap[menuId]) {
                    menuMap[menuId].orders += quantity;
                }
            }
        }

        // Convert object to array
        const result = Object.values(menuMap)
            .sort((a, b) => b.orders - a.orders)
            .slice(0, 5);

        return res.end(JSON.stringify({
            success: true,
            data: result
        }));

    } catch (error) {
        console.error(error);

        return res.end(JSON.stringify({
            success: false,
            message: "Database error",
            error: error.message
        }));
    }
};

module.exports = { 
    getDashboardSummariesByShop,
    getReportRvenueByShopId,
    getReportCategoriesChartByShopId,
    top5MenuByShopId
};
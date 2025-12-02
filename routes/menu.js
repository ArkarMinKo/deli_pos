const formidable = require("formidable");
const fs = require("fs");
const path = require("path");
const db = require("../db");

const { generateMenuId } = require("../utils/idMenuGenerator");
const { generatePhotoName } = require("../utils/photoNameGenerator");

const UPLOAD_DIR = path.join(__dirname, "../menu_uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function createMenu(req, res) {
    const form = new formidable.IncomingForm({
        multiples: false,
    });

    form.parse(req, (err, fields, files) => {
        if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Form parsing failed", err }));
        }

        const {
            shop_id,
            name,
            prices,
            category,
            size,
            description,
            relate_menu,
            relate_ingredients,
            get_months,
            photo, // base64 string
        } = fields;

        // Required fields validation
        if (!shop_id || !name || !prices || !category || !photo) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(
            JSON.stringify({ message: "လိုအပ်ချက်များ မပြည့်စုံပါ" })
        );
        }

        generateMenuId(db, shop_id, (err, newId) => {
        if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "ID generation failed" }));
        }

        // === Convert Base64 Photo ===
        let photoBuffer;
        try {
            const base64Data = photo.replace(/^data:image\/\w+;base64,/, "");
            photoBuffer = Buffer.from(base64Data, "base64");
        } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ message: "Invalid base64 photo" }));
        }

        const photoName = generatePhotoName(newId, ".jpg");
        const photoPath = path.join(UPLOAD_DIR, photoName);

        fs.writeFile(photoPath, photoBuffer, (err) => {
            if (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(
                JSON.stringify({ message: "Photo saving failed", err })
            );
            }

            // === Prepare JSON fields ===
            const relateMenuJson = Array.isArray(relate_menu)
                ? JSON.stringify(relate_menu)
                : null;

            const relateIngredientsJson = Array.isArray(relate_ingredients)
                ? JSON.stringify(relate_ingredients)
                : null;

            const monthJson = Array.isArray(get_months)
                ? JSON.stringify(get_months)
                : JSON.stringify(["All months"]);

            // === Insert menu into DB ===
            const sql = `
            INSERT INTO menu (
                id, shop_id, name, prices, category, photo,
                size, description, relate_menu, relate_ingredients, get_months
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                newId,
                shop_id,
                name,
                prices,
                category,
                photoName,
                size || null,
                description || null,
                relateMenuJson,
                relateIngredientsJson,
                monthJson,
            ];

            db.query(sql, values, (err, result) => {
            if (err) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "DB error", err }));
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({
                message: "Menu ကို အောင်မြင်စွာ အသစ်ထည့်သွင်း ပြီးပါပြီ",
                id: newId,
                })
            );
            });
        });
        });
    });
}

function getMenuByShopId(req, res, shopId) {
  // 1. Get shop information
  const shopSql = `
    SELECT shop_name, phone, address, location 
    FROM shops 
    WHERE id = ?
  `;

  db.query(shopSql, [shopId], (err, shopResult) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Shop fetch error" }));
    }

    if (!shopResult || shopResult.length === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ message: "Shop မရှိသေးပါ" }));
    }

    const shopInfo = shopResult[0];

    // 2. Get all categories (for mapping category name)
    const categoriesSql = `SELECT id, name FROM categories`;

    db.query(categoriesSql, (err, categories) => {
      if (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Category fetch error" }));
      }

      const categoryMap = {};
      categories.forEach((c) => (categoryMap[c.id] = c.name));

      // 3. Get all menu from this shop
      const menuSql = `SELECT * FROM menu WHERE shop_id = ?`;

      db.query(menuSql, [shopId], async (err, menus) => {
        if (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ message: "Menu fetch error" }));
        }

        // Convert each menu item with relations
        let processedMenus = [];

        let pending = menus.length;
        if (pending === 0) {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              shop: shopInfo,
              menus: [],
            })
          );
        }

        menus.forEach((menu) => {
          // Parse relations
          let relateMenuIds = [];
          let relateIngredientsIds = [];

          try {
            relateMenuIds = menu.relate_menu
              ? JSON.parse(menu.relate_menu)
              : [];
          } catch {}

          try {
            relateIngredientsIds = menu.relate_ingredients
              ? JSON.parse(menu.relate_ingredients)
              : [];
          } catch {}

          // 4. Fetch related menus
          const relatedMenuSql = `
            SELECT id, name, prices, size, category, photo 
            FROM menu 
            WHERE id IN (?)
          `;

          const fetchRelateMenu = new Promise((resolve) => {
            if (relateMenuIds.length === 0) return resolve([]);

            db.query(
              relatedMenuSql,
              [relateMenuIds],
              (err, relateMenuResult) => {
                if (err) return resolve([]);

                const formatted = relateMenuResult.map((m) => ({
                  id: m.id,
                  name: m.name,
                  prices: m.prices,
                  size: m.size,
                  category: categoryMap[m.category] || m.category,
                  photo: m.photo,
                }));

                resolve(formatted);
              }
            );
          });

          // 5. Fetch related ingredients
          const ingredientSql = `
            SELECT id, name, photo, prices 
            FROM ingredients 
            WHERE id IN (?)
          `;

          const fetchRelateIngredients = new Promise((resolve) => {
            if (relateIngredientsIds.length === 0) return resolve([]);

            db.query(
              ingredientSql,
              [relateIngredientsIds],
              (err, ingrResult) => {
                if (err) return resolve([]);

                const formatted = ingrResult.map((i) => ({
                  id: i.id,
                  name: i.name,
                  photo: i.photo,
                  prices: i.prices,
                }));

                resolve(formatted);
              }
            );
          });

          // 6. Combine all
          Promise.all([fetchRelateMenu, fetchRelateIngredients]).then(
            ([relatedMenus, relatedIngredients]) => {
              processedMenus.push({
                id: menu.id,
                shop_id: menu.shop_id,
                name: menu.name,
                prices: menu.prices,
                category: categoryMap[menu.category] || menu.category,
                photo: menu.photo,
                size: menu.size,
                description: menu.description,
                complete_order: menu.complete_order,
                rating: menu.rating,
                rating_count: menu.rating_count,
                get_months: menu.get_months
                  ? JSON.parse(menu.get_months)
                  : ["All months"],
                relate_menu: relatedMenus,
                relate_ingredients: relatedIngredients,
              });

              pending--;
              if (pending === 0) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    shop: shopInfo,
                    menus: processedMenus,
                  })
                );
              }
            }
          );
        });
      });
    });
  });
}

module.exports = { 
    createMenu,
    getMenuByShopId
};
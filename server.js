const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const db = require("./db");

// Routes
const users = require("./routes/users");
const emails = require("./routes/emials");
const shops = require("./routes/shops");
const deliverymen = require("./routes/deliverymen");
const categories = require("./routes/categories");
const ingredients = require("./routes/ingredients");
const menu = require("./routes/menu");

// Upload folders
const INGREDIENTS_UPLOAD_DIR = path.join(__dirname, "ingredients_uploads");
const MENU_UPLOAD_DIR = path.join(__dirname, "menu_uploads");
const SHOP_UPLOAD_DIR = path.join(__dirname, "shop_uploads");
const DELIVERYMEN_UPLOAD_DIR = path.join(__dirname, "deliverymen_uploads");

// Create upload folders
fs.mkdirSync(INGREDIENTS_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(MENU_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(SHOP_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(DELIVERYMEN_UPLOAD_DIR, { recursive: true });

/* ------------------------------------
      UNIVERSAL STATIC SERVE FUNCTION
--------------------------------------*/
function serveStaticFolder(reqPath, res, urlPrefix, folderPath) {
  if (!reqPath.startsWith(urlPrefix)) return false;

  const fileName = reqPath.replace(urlPrefix, "");
  const safePath = path.join(folderPath, fileName);

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("File not found");
    }

    const ext = path.extname(safePath).toLowerCase();
    const mimeTypes = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
    };

    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });
    res.end(data);
  });

  return true;
}

// CORS helper
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathName = parsedUrl.pathname;
    const method = req.method;

    // CALL IMAGE
    if (serveStaticFolder(pathName, res, "/ingredients-uploads/", INGREDIENTS_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/menu-uploads/", MENU_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/shop-uploads/", SHOP_UPLOAD_DIR)) return;
    if (serveStaticFolder(pathName, res, "/deliverymen-uploads/", DELIVERYMEN_UPLOAD_DIR)) return;

    // Users CRUD
    if (pathName === "/login-user" && method === "POST") users.loginUser(req, res);
    else if (pathName === "/users" && method === "POST") users.createUsers(req, res);
    else if (pathName === "/users" && method === "GET") users.getUsers(req, res);

    else if (pathName.startsWith("/get-users-by-id/") && method === "GET") {
        const id = pathName.split("/")[2];
        users.getUsersById(req, res, id);
    }

    else if (pathName.startsWith("/users/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        users.deleteUser(req, res, id);
    }

    else if (pathName.startsWith("/users/status/") && method === "PATCH") {
        const id = pathName.split("/")[3];
        users.changeStatus(req, res, id);
    }

    // -- email confrimation ---

    else if(pathName === "/request-email-confirmation" && method === "POST"){
        emails.requestEmailConfirmation(req, res);
    }

    else if(pathName === "/verify-email-code" && method === "POST"){
        emails.verifyEmailCodeBeforeCreate(req, res);
    }

    // Shops CRUD
    else if (pathName === "/login-shop" && method === "POST") {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => shops.loginShop(req, res, body));
        return;
    }
    else if (pathName === "/shops" && method === "POST") shops.createShops(req, res);
    else if (pathName === "/shops" && method === "GET") shops.getShops(req, res);
    else if (pathName === "/shops-pending" && method === "GET") shops.getShopsPending(req, res);
    else if (pathName === "/shops-approve" && method === "GET") shops.getShopsApprove(req, res);

    else if (pathName.startsWith("/shops/") && method === "GET") {
        const id = pathName.split("/")[2];
        shops.getShopsById(req, res, id);
    }

    else if (pathName.startsWith("/shops/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        shops.deleteShop(req, res, id);
    }

    else if (pathName.startsWith("/shops/approve/") && method === "PATCH") {
        const id = pathName.split("/")[3];
        shops.approveShop(req, res, id);
    }
    else if (pathName.startsWith("/shops/reject/") && method === "PATCH") {
        const id = pathName.split("/")[3];
        shops.rejectShop(req, res, id);
    }
    else if (pathName.startsWith("/shops/status/") && method === "PATCH") {
        const id = pathName.split("/")[3];
        shops.changeStatus(req, res, id);
    }

    // deliveryMen CRUD
    else if (pathName === "/login-deliverymen" && method === "POST") deliverymen.loginDeliverymen(req, res);
    else if (pathName === "/deliverymen" && method === "POST") deliverymen.createDeliverymen(req, res);
    else if (pathName === "/deliverymen" && method === "GET") deliverymen.getAllDeliverymen(req, res);

    else if (pathName.startsWith("/deliverymen/") && method === "PUT") {
        const id = pathName.split("/")[2];
        deliverymen.putDeliverymen(req, res, id);
    }

    else if (pathName.startsWith("/deliverymen/") && method === "GET") {
        const id = pathName.split("/")[2];
        deliverymen.getDeliverymenById(req, res, id);
    }

    else if (pathName.startsWith("/deliverymen/") && method === "DELETE") {
        const id = pathName.split("/")[2];
        deliverymen.deleteDeliverymen(req, res, id);
    }

    else if (pathName.startsWith("/deliverymen/status/") && method === "PATCH") {
        const id = pathName.split("/")[3];
        deliverymen.changeStatus(req, res, id);
    }

    // categories CRUD
    else if (pathName === "/categories" && method === "POST") categories.createCategories(req, res);

    else if (pathName.startsWith("/categories/") && method === "GET") {
        const id = pathName.split("/")[2];
        categories.getCategoriesByShopId(req, res, id);
    }

    // Ingredients CRUD
    else if (pathName === "/ingredients" && method === "POST") ingredients.createIngredients(req, res);

    else if (pathName.startsWith("/ingredients/") && method === "GET") {
        const id = pathName.split("/")[2];
        ingredients.getIngredientsByShopId(req, res, id);
    }

    // menu CRUD
    else if (pathName === "/menu" && method === "POST") menu.createMenu(req, res);

    else if (pathName.startsWith("/menu/") && method === "GET") {
        const id = pathName.split("/")[2];
        menu.getMenuByShopId(req, res, id);
    }

    // --- 404 fallback ---
    else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Route not found" }));
    }
})

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
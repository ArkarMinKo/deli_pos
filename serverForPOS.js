const http = require("http");
const url = require("url");
const fs = require("fs");
const path = require("path");
const db = require("./db");

// Routes
const accounts = require("./POS_routes/accounts")

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

    // Accounts CRUD
    if (pathName === "/accounts" && method === "POST") accounts.createAccounts(req, res);
    
    else if (pathName.startsWith("/‌accounts/") && method === "GET") {
        const id = pathName.split("/")[2];
        accounts.getAccountsById(req, res, id);
    }

    // --- 404 fallback ---
    else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Route not found" }));
    }
})

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
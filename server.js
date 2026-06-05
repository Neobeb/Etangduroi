const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.PORT || 10000);
const publicDir = path.resolve(__dirname, "simulateur_v5");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendFile(req, res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      console.error(`[404] ${req.url} -> ${filePath} (${error.code})`);
      res.writeHead(error.code === "ENOENT" ? 404 : 500);
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const normalizedPath = path.normalize(requestPath).replace(/^[/\\]+/, "");
  const relativePath = normalizedPath === "." || normalizedPath === "" ? "index.html" : normalizedPath;
  const filePath = path.resolve(publicDir, relativePath);

  if (filePath !== publicDir && !filePath.startsWith(`${publicDir}${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      sendFile(req, res, path.join(filePath, "index.html"));
      return;
    }

    if (error || !stats.isFile()) {
      sendFile(req, res, path.join(publicDir, "index.html"));
      return;
    }

    sendFile(req, res, filePath);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving ${publicDir} on port ${port}`);
  console.log(`Current directory: ${process.cwd()}`);
  console.log(`Static directory exists: ${fs.existsSync(publicDir)}`);
  if (fs.existsSync(publicDir)) {
    console.log(`Static files: ${fs.readdirSync(publicDir).join(", ")}`);
  }
});

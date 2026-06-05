const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.PORT || 10000);
const publicDir = path.join(__dirname, "simulateur_v5");

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

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
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
  const publicRoot = path.resolve(publicDir);

  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  sendFile(res, filePath);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving ${publicDir} on port ${port}`);
});

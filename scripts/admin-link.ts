import { readAdminToken } from "./admin-api";

const url = new URL(process.argv[2] || "http://127.0.0.1:4173");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.protocol !== "http:" || url.username || url.password) {
  throw new Error("Use the HTTP localhost address of your running development or preview server.");
}
const themed = /^\/(dots|groks)\/?$/.test(url.pathname);
url.pathname = themed ? `/${url.pathname.split("/")[1]}/` : "/";
url.search = themed ? "?shadowGui=1" : "?admin=1";
url.hash = new URLSearchParams({ "admin-token": readAdminToken(process.cwd()) }).toString();
process.stdout.write(`Private local configurator (keep this link private):\n${url.href}\n`);

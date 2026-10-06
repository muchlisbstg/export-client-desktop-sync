import "dotenv/config";
import { app, BrowserWindow, clipboard, ipcMain, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiClient } from "../src/shared/api-client";
import type { CreateInquiryInput } from "../src/shared/api-types";
import { startLocalApi, parsePeers } from "./local-api";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} wajib diisi.`);
  }
  return value.trim();
}

function validateInquiryInput(value: unknown): CreateInquiryInput {
  if (value === null || typeof value !== "object") {
    throw new Error("Data permintaan tidak valid.");
  }

  const input = value as Record<string, unknown>;
  const customerName = requireString(input.customerName, "Nama");
  const customerEmail = requireString(input.customerEmail, "Email");
  const destinationCountry = requireString(input.destinationCountry, "Negara tujuan");
  const productId = requireString(input.productId, "Produk");
  const quantity = Number(input.quantity);

  if (customerName.length > 120 || customerEmail.length > 254 || destinationCountry.length > 80) {
    throw new Error("Salah satu kolom melebihi batas panjang.");
  }
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new Error("Jumlah harus lebih dari 0 dan paling banyak 1.000.000.");
  }

  return { customerName, customerEmail, destinationCountry, productId, quantity };
}

function registerIpcHandlers() {
  ipcMain.handle("api:health", (_event, baseUrl: unknown) =>
    createApiClient(requireString(baseUrl, "Alamat API")).getHealth()
  );
  ipcMain.handle("api:products", (_event, baseUrl: unknown) =>
    createApiClient(requireString(baseUrl, "Alamat API")).getProducts()
  );
  ipcMain.handle("api:create-inquiry", (_event, baseUrl: unknown, input: unknown) =>
    createApiClient(requireString(baseUrl, "Alamat API")).createInquiry(validateInquiryInput(input))
  );
  ipcMain.handle("api:track-inquiry", (_event, baseUrl: unknown, code: unknown) =>
    createApiClient(requireString(baseUrl, "Alamat API")).trackInquiry(requireString(code, "Kode pelacakan"))
  );
  ipcMain.handle("app:copy-text", (_event, value: unknown) => {
    if (typeof value !== "string" || value.length > 128) return false;
    clipboard.writeText(value);
    return true;
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: "#f5f6f2",
    title: "Export Client Desktop",
    webPreferences: {
      preload: path.join(currentDir, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const allowedHost = /^https:\/\/github\.com\/muchlisbstg\/(export-client-web-sync|export-client-mobile-sync)(\/|$)/.test(url);
    if (allowedHost) void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(path.join(currentDir, "../renderer/index.html"));
  }
}

let localApi: Awaited<ReturnType<typeof startLocalApi>> | undefined;

app.whenReady().then(() => {
  registerIpcHandlers();
  const nodeId = process.env.SYNC_NODE_ID?.trim() || "desktop-local";
  let peers = [] as ReturnType<typeof parsePeers>;
  let sharedSecret = process.env.SYNC_SHARED_SECRET || "";
  try {
    peers = parsePeers(process.env.SYNC_PEERS || "", nodeId);
  } catch (error) {
    console.error("Invalid peer sync configuration; synchronization is disabled.", error);
    sharedSecret = "";
  }
  void startLocalApi({
    dbPath: path.join(app.getPath("userData"), "inquiries.sqlite"),
    port: Number(process.env.API_PORT || 4002),
    host: process.env.API_HOST || "127.0.0.1",
    nodeId,
    sharedSecret,
    peers,
  }).then((server) => { localApi = server; createWindow(); }).catch((error) => { console.error("Local API failed to start", error); createWindow(); });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => { void localApi?.close(); });

import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../src/shared/desktop-api";

const desktopApi: DesktopApi = {
  getHealth: (baseUrl) => ipcRenderer.invoke("api:health", baseUrl),
  getProducts: (baseUrl) => ipcRenderer.invoke("api:products", baseUrl),
  createInquiry: (baseUrl, input) => ipcRenderer.invoke("api:create-inquiry", baseUrl, input),
  trackInquiry: (baseUrl, code) => ipcRenderer.invoke("api:track-inquiry", baseUrl, code),
  copyText: (value) => ipcRenderer.invoke("app:copy-text", value),
  saveComparisonCsv: (value) => ipcRenderer.invoke("app:save-comparison-csv", value),
};

contextBridge.exposeInMainWorld("desktopApi", desktopApi);

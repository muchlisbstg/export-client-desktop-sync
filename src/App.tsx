import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  CircleHelp,
  Clipboard,
  Copy,
  ExternalLink,
  FilePlus2,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  Package,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { InquiryStatus, Product, SyncStatus } from "./shared/api-types";
import { catalogSortOptions, filterProducts, getActiveCatalogFilters, getCatalogSearchHighlightParts, getCategories, getFacetCounts, getOrigins, getUnits, sortProducts, type CatalogSortDirection, type CatalogSortField } from "./shared/catalog-filter";
import { formatComparisonCsv, formatComparisonShare, getComparisonFieldsToDisplay, getDifferingComparisonFields, MAX_COMPARE_PRODUCTS, toggleCompareSelection } from "./shared/catalog-compare";
import { validateInquiryField, validateInquiryForm, type InquiryField, type InquiryFieldErrors } from "./shared/rfq-validation";
import { formatCatalogShare } from "./shared/catalog-share";
import { filterOutComparedProducts } from "./shared/catalog-compare";
import { formatCatalogCsv } from "./shared/catalog-csv";

type Page = "overview" | "request" | "track" | "settings";
type Connection = "checking" | "connected" | "offline";

const comparisonFieldLabels = { category: "Kategori", origin: "Asal", unit: "Satuan" } as const;
const defaultApiUrl = "http://127.0.0.1:4002";
const apiUrlStorageKey = "export-client-api-url";
const initialForm = {
  customerName: "",
  customerEmail: "",
  destinationCountry: "",
  productId: "",
  quantity: "1000",
};

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
}

function CatalogSearchHighlight({ value, query }: { value: string; query: string }) {
  const parts = getCatalogSearchHighlightParts(value, query);
  return <>{parts.map((part, index) => part.matched
    ? <mark key={index} style={{ backgroundColor: "#f2e7a4", color: "inherit", borderRadius: 2 }}>{part.text}</mark>
    : <span key={index}>{part.text}</span>)}</>;
}

function NavigationButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item${active ? " is-active" : ""}`} type="button" onClick={onClick} aria-current={active ? "page" : undefined}>
      {icon}<span>{label}</span>{active && <span className="nav-indicator" />}
    </button>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("overview");
  const [apiBaseUrl, setApiBaseUrl] = useState(() => localStorage.getItem(apiUrlStorageKey) || defaultApiUrl);
  const [draftApiUrl, setDraftApiUrl] = useState(() => localStorage.getItem(apiUrlStorageKey) || defaultApiUrl);
  const [connection, setConnection] = useState<Connection>("checking");
  const [products, setProducts] = useState<Product[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncStatusLoading, setSyncStatusLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogCategory, setCatalogCategory] = useState("");
  const [catalogOrigin, setCatalogOrigin] = useState("");
  const [catalogUnit, setCatalogUnit] = useState("");
  const [catalogSortField, setCatalogSortField] = useState<CatalogSortField>("default");
  const [catalogSortDirection, setCatalogSortDirection] = useState<CatalogSortDirection>("asc");
  const [compareProductIds, setCompareProductIds] = useState<string[]>([]);
  const [hideComparedProducts, setHideComparedProducts] = useState(false);
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);
  const catalogSearchRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState<InquiryFieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [trackingInput, setTrackingInput] = useState("");
  const [trackedInquiry, setTrackedInquiry] = useState<InquiryStatus | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [trackingCodeCopyNotice, setTrackingCodeCopyNotice] = useState("");
  const [catalogShareNotice, setCatalogShareNotice] = useState("");
  const [catalogCsvNotice, setCatalogCsvNotice] = useState("");
  const [comparisonShareNotice, setComparisonShareNotice] = useState("");
  const [comparisonCsvNotice, setComparisonCsvNotice] = useState("");

  const refreshSyncStatus = useCallback(async () => {
    setSyncStatusLoading(true);
    try {
      const health = await window.desktopApi.getHealth(apiBaseUrl);
      setSyncStatus(health.syncStatus ?? null);
    } catch {
      setSyncStatus(null);
    } finally {
      setSyncStatusLoading(false);
    }
  }, [apiBaseUrl]);

  const refresh = useCallback(async () => {
    setConnection("checking");
    setLoadingProducts(true);
    setError("");
    try {
      const [health, result] = await Promise.all([
        window.desktopApi.getHealth(apiBaseUrl),
        window.desktopApi.getProducts(apiBaseUrl),
      ]);
      if (health.status !== "ok") throw new Error("API belum siap.");
      setProducts(result);
      setSyncStatus(health.syncStatus ?? null);
      setSyncStatusLoading(false);
      setForm((current) => ({ ...current, productId: current.productId || result[0]?.id || "" }));
      setConnection("connected");
    } catch (caught) {
      setConnection("offline");
      setSyncStatus(null);
      setSyncStatusLoading(false);
      setError(messageFrom(caught, "Koneksi ke API gagal."));
    } finally {
      setLoadingProducts(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const comparedProducts = products.filter((product) => compareProductIds.includes(product.id));
  const differingComparisonFields = getDifferingComparisonFields(comparedProducts);
  const visibleComparisonFields = getComparisonFieldsToDisplay(comparedProducts, showOnlyDifferences);

  function toggleCompare(productId: string) {
    setCompareProductIds((current) => toggleCompareSelection(current, productId));
  }

  function goTo(nextPage: Page) {
    setPage(nextPage);
    setError("");
    setNotice("");
    setFieldErrors({});
  }

  function updateInquiryField(field: InquiryField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const message = validateInquiryField(field, value);
      const next = { ...current };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setTrackedInquiry(null);
    const errors = validateInquiryForm(form);
    setFieldErrors(errors);
    const firstInvalidField = (Object.keys(errors) as InquiryField[])[0];
    if (firstInvalidField) {
      requestAnimationFrame(() => document.getElementById(`rfq-${firstInvalidField}`)?.focus());
      return;
    }
    setSubmitting(true);
    try {
      const result = await window.desktopApi.createInquiry(apiBaseUrl, {
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        destinationCountry: form.destinationCountry.trim(),
        productId: form.productId.trim(),
        quantity: Number(form.quantity),
      });
      setTrackingCode(result.trackingCode);
      setTrackingCodeCopyNotice("");
      setCopied(false);
      setTrackingInput(result.trackingCode);
      setForm((current) => ({ ...initialForm, productId: current.productId }));
      setFieldErrors({});
      setNotice("Permintaan tersimpan pada backend yang terhubung.");
      void refreshSyncStatus();
    } catch (caught) {
      setError(messageFrom(caught, "Permintaan gagal dikirim."));
    } finally {
      setSubmitting(false);
    }
  }

  async function lookUpInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setTrackedInquiry(null);
    setTracking(true);
    try {
      setTrackedInquiry(await window.desktopApi.trackInquiry(apiBaseUrl, trackingInput));
    } catch (caught) {
      setError(messageFrom(caught, "Status belum dapat dimuat."));
    } finally {
      setTracking(false);
    }
  }

  async function copyCode() {
    if (!trackingCode) return;
    setTrackingCodeCopyNotice("");
    setCopied(false);
    try {
      const success = await window.desktopApi.copyText(trackingCode);
      if (!success) throw new Error("Kode pelacakan tidak dapat disalin.");
      setCopied(true);
      setTrackingCodeCopyNotice("Kode pelacakan berhasil disalin.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (caught) {
      setTrackingCodeCopyNotice(messageFrom(caught, "Kode pelacakan tidak dapat disalin."));
    }
  }

  function saveApiUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = draftApiUrl.trim();
    try {
      const parsed = new URL(candidate);
      if (!(["http:", "https:"].includes(parsed.protocol)) || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error("Gunakan alamat HTTP(S) tanpa kredensial atau parameter.");
      }
      localStorage.setItem(apiUrlStorageKey, candidate.replace(/\/+$/, ""));
      setApiBaseUrl(candidate.replace(/\/+$/, ""));
      setNotice("Alamat API disimpan. Menguji koneksi…");
      setError("");
      setPage("settings");
    } catch (caught) {
      setError(messageFrom(caught, "Alamat API tidak valid."));
    }
  }

  const pageTitles: Record<Page, { eyebrow: string; title: string; description: string }> = {
    overview: { eyebrow: "RUANG KERJA", title: "Ringkasan", description: "Desktop menyimpan data di backend lokal; sinkronkan dengan web dan mobile melalui peer sync." },
    request: { eyebrow: "PERMINTAAN BARU", title: "Ajukan penawaran", description: "Kirim ke backend yang terhubung. Kode dapat digunakan pada node lain yang sudah tersinkron." },
    track: { eyebrow: "STATUS PERMINTAAN", title: "Lacak permintaan", description: "Gunakan kode pelacakan dari aplikasi web, mobile, atau desktop." },
    settings: { eyebrow: "PREFERENSI KLIEN", title: "Pengaturan koneksi", description: "Ubah API desktop. Default-nya backend lokal di 127.0.0.1:4002." },
  };
  const currentTitle = pageTitles[page];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => goTo("overview")} aria-label="Kembali ke ringkasan">
          <span className="brand-mark">E</span>
          <span className="brand-copy"><strong>Export<span>Client</span></strong><small>DESKTOP WORKSPACE</small></span>
        </button>

        <div className="workspace-switcher">
          <span className="workspace-glyph"><Boxes size={16} /></span>
          <span className="workspace-copy"><small>WORKSPACE</small><strong>Export platform</strong></span>
          <span className="chevron">⌄</span>
        </div>

        <div className="nav-label">MENU UTAMA</div>
        <nav className="main-nav" aria-label="Navigasi utama">
          <NavigationButton active={page === "overview"} icon={<LayoutDashboard size={17} />} label="Ringkasan" onClick={() => goTo("overview")} />
          <NavigationButton active={page === "request"} icon={<FilePlus2 size={17} />} label="Permintaan baru" onClick={() => goTo("request")} />
          <NavigationButton active={page === "track"} icon={<Clipboard size={17} />} label="Lacak permintaan" onClick={() => goTo("track")} />
        </nav>

        <div className="nav-label connections-label">TERHUBUNG</div>
        <div className="connected-apps">
          <a className="app-link" href="https://github.com/muchlisbstg/export-client-web-sync" target="_blank" rel="noreferrer">
            <span className="app-link-mark web-mark">W</span><span>Web app</span><ExternalLink size={13} />
          </a>
          <a className="app-link" href="https://github.com/muchlisbstg/export-client-mobile-sync" target="_blank" rel="noreferrer">
            <span className="app-link-mark mobile-mark">M</span><span>Mobile app</span><ExternalLink size={13} />
          </a>
          <div className="app-link current-app"><span className="app-link-mark desktop-mark">D</span><span>Desktop app</span><span className="you-tag">AKTIF</span></div>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <span className={`status-orb ${connection}`} />
            <span><strong>{connection === "connected" ? "API terhubung" : connection === "checking" ? "Memeriksa API" : "API offline"}</strong><small>{apiBaseUrl.replace(/^https?:\/\//, "")}</small></span>
          </div>
          <button className={`nav-item settings-nav${page === "settings" ? " is-active" : ""}`} type="button" onClick={() => { setDraftApiUrl(apiBaseUrl); goTo("settings"); }} aria-current={page === "settings" ? "page" : undefined}>
            <Settings2 size={17} /><span>Pengaturan</span>
          </button>
          <div className="sidebar-footnote">DEMO ENVIRONMENT · v0.1.0</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-divider">/</span><strong>{currentTitle.title}</strong></div>
          <div className="topbar-actions">
            <span className={`connection-chip ${connection}`}><span className="status-orb" />{connection === "connected" ? "Tersinkron" : connection === "checking" ? "Menghubungkan" : "Terputus"}</span>
            <button className="icon-button" type="button" title="Muat ulang data" aria-label="Muat ulang data" onClick={() => void refresh()} disabled={loadingProducts}>
              <RefreshCw size={16} className={loadingProducts ? "spin" : ""} />
            </button>
            <button className="avatar" type="button" aria-label="Pengguna demo">EC</button>
          </div>
        </header>

        <div className="content-wrap">
          <div className="page-intro">
            <div><p className="eyebrow">{currentTitle.eyebrow}</p><h1>{currentTitle.title}</h1><p>{currentTitle.description}</p></div>
            {page !== "settings" && <button className="primary-button compact-button" type="button" onClick={() => goTo("request")}><FilePlus2 size={16} /> Buat permintaan</button>}
          </div>

          {(error || notice) && <div className={`flash-message ${error ? "is-error" : "is-notice"}`} role={error ? "alert" : "status"}>
            <span>{error || notice}</span><button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Tutup pemberitahuan">×</button>
          </div>}

          {page === "overview" && (
            <>
              <section className="hero-panel">
                <div className="hero-content">
                  <div className="hero-label"><span className="hero-label-dot" /> API BERSAMA · WEB + MOBILE + DESKTOP</div>
                  <h2>Permintaan ekspor,<br /><em>lebih terhubung.</em></h2>
                  <p>Jelajahi katalog contoh, ajukan permintaan penawaran, lalu lacak status dari klien mana pun yang memakai API yang sama.</p>
                  <div className="hero-actions">
                    <button className="hero-primary" type="button" onClick={() => goTo("request")}>Mulai permintaan <ArrowRight size={16} /></button>
                    <button className="hero-secondary" type="button" onClick={() => goTo("track")}>Lacak status</button>
                  </div>
                </div>
                <div className="hero-art" aria-label="Ilustrasi platform ekspor">
                  <div className="art-grid" />
                  <div className="art-orbit orbit-a" /><div className="art-orbit orbit-b" />
                  <div className="art-stamp"><span>EC</span><small>SHARED<br />PLATFORM</small></div>
                  <div className="art-card art-card-main"><div className="art-card-head"><span className="mini-dot" /> API STATUS</div><strong>{connection === "connected" ? "Online" : connection === "checking" ? "Checking" : "Offline"}</strong><small>{products.length} produk katalog</small><div className="art-line" /></div>
                  <div className="art-card art-card-float"><Globe2 size={15} /><span>3 klien · 1 API</span><ArrowUpRight size={14} /></div>
                  <div className="art-caption">INDONESIA <span>·</span> EXPORT CLIENT</div>
                </div>
              </section>

              <section className="stats-grid" aria-label="Status workspace">
                <article className="stat-card"><span className="stat-icon sage-icon"><Package size={17} /></span><div><small>KATALOG AKTIF</small><strong>{loadingProducts ? "—" : products.length.toString().padStart(2, "0")}</strong><span>produk demo tersedia</span></div><span className="stat-arrow"><ArrowUpRight size={15} /></span></article>
                <article className="stat-card"><span className={`stat-icon ${connection === "connected" ? "green-icon" : "gray-icon"}`}>{connection === "connected" ? <Wifi size={17} /> : <WifiOff size={17} />}</span><div><small>KONEKSI API</small><strong>{connection === "connected" ? "Aktif" : connection === "checking" ? "Memeriksa" : "Offline"}</strong><span>{apiBaseUrl.replace(/^https?:\/\//, "")}</span></div><span className="stat-arrow"><ArrowUpRight size={15} /></span></article>
                <article className="stat-card"><span className="stat-icon sand-icon"><Globe2 size={17} /></span><div><small>KLIEN TERHUBUNG</small><strong>03</strong><span>web · mobile · desktop</span></div><span className="stat-arrow"><ArrowUpRight size={15} /></span></article>
              </section>

              <section className="sync-status-card" aria-label="Status sinkronisasi peer-to-peer" role="status" aria-live="polite">
                <div className="sync-status-copy"><small>SINKRONISASI PEER-TO-PEER</small><strong>{syncStatusLoading ? "Memeriksa status…" : !syncStatus ? "Status belum tersedia" : !syncStatus.enabled ? "Tidak diaktifkan" : syncStatus.peerCount > 0 ? `Diaktifkan · ${syncStatus.peerCount} peer dikonfigurasi` : "Diaktifkan · belum ada peer"}</strong>
                  <span>{syncStatus ? `Antrean: ${syncStatus.pendingDeliveries} · Perlu coba ulang: ${syncStatus.retryingDeliveries} · Konflik: ${syncStatus.conflicts}` : "Ringkasan lokal; koneksi peer tidak diuji langsung."}</span>
                  {syncStatus && <small className="sync-status-note">Ringkasan lokal; koneksi peer tidak diuji langsung.</small>}
                </div>
                <button type="button" onClick={() => void refreshSyncStatus()} disabled={syncStatusLoading}>Perbarui status</button>
              </section>

              <section className="section-block">
                <div className="section-heading"><div><p className="eyebrow">01 — KATALOG BERSAMA</p><h2>Produk pilihan</h2></div><span className="section-side-note">Sumber katalog: API bersama <span className="tiny-dot" /></span></div>
                {loadingProducts ? <div className="empty-state"><LoaderCircle className="spin" size={20} /> Memuat katalog…</div> : products.length === 0 ? connection === "offline" ? (
                  <div className="catalog-load-error" role="status">
                    <div><strong>Katalog belum dapat dimuat</strong><p>Periksa koneksi API lalu coba lagi.</p></div>
                    <button type="button" onClick={() => void refresh()}>Coba lagi</button>
                  </div>
                ) : <div className="empty-state">Belum ada produk di katalog.</div> : (() => {
                  const categories = getCategories(products);
                  const origins = getOrigins(products);
                  const units = getUnits(products);
                  const categoryFacetProducts = filterProducts(products, catalogQuery, "", catalogOrigin, catalogUnit);
                  const originFacetProducts = filterProducts(products, catalogQuery, catalogCategory, "", catalogUnit);
                  const unitFacetProducts = filterProducts(products, catalogQuery, catalogCategory, catalogOrigin);
                  const categoryFacetCounts = getFacetCounts(categoryFacetProducts, "category");
                  const originFacetCounts = getFacetCounts(originFacetProducts, "origin");
                  const unitFacetCounts = getFacetCounts(unitFacetProducts, "unit");
                  const matchingProducts = sortProducts(filterProducts(products, catalogQuery, catalogCategory, catalogOrigin, catalogUnit), catalogSortField, catalogSortDirection);
                  const visibleProducts = hideComparedProducts ? filterOutComparedProducts(matchingProducts, compareProductIds) : matchingProducts;
                  const activeCatalogFilters = getActiveCatalogFilters(catalogQuery, catalogCategory, catalogOrigin, catalogUnit);
                  const filtersActive = activeCatalogFilters.length > 0;

                  async function copyCatalogResults() {
                    try {
                      const success = await window.desktopApi.copyText(formatCatalogShare(visibleProducts, {
                        query: catalogQuery,
                        category: catalogCategory,
                        origin: catalogOrigin,
                        unit: catalogUnit,
                        sortField: catalogSortField,
                        sortDirection: catalogSortDirection,
                      }));
                      setCatalogShareNotice(success ? "Daftar katalog disalin. Silakan tempel untuk membagikan." : "Daftar katalog tidak dapat disalin.");
                    } catch (caught) {
                      setCatalogShareNotice(messageFrom(caught, "Daftar katalog tidak dapat disalin."));
                    }
                  }

                  async function saveCatalogCsv() {
                    try {
                      const csv = formatCatalogCsv(visibleProducts);
                      if (!csv) throw new Error("Tidak ada hasil katalog untuk disimpan.");
                      const saved = await window.desktopApi.saveCatalogCsv(csv);
                      setCatalogCsvNotice(saved ? "CSV katalog disimpan." : "Penyimpanan CSV dibatalkan.");
                    } catch (caught) {
                      setCatalogCsvNotice(messageFrom(caught, "CSV katalog tidak dapat disimpan."));
                    }
                  }

                  async function copyComparison() {
                    try {
                      const success = await window.desktopApi.copyText(formatComparisonShare(comparedProducts, visibleComparisonFields, differingComparisonFields));
                      setComparisonShareNotice(success ? "Ringkasan perbandingan disalin. Silakan tempel untuk membagikan." : "Perbandingan tidak dapat disalin.");
                    } catch (caught) {
                      setComparisonShareNotice(messageFrom(caught, "Perbandingan tidak dapat disalin."));
                    }
                  }

                  async function saveComparisonCsv() {
                    try {
                      const csv = formatComparisonCsv(comparedProducts, visibleComparisonFields);
                      if (!csv) throw new Error("Pilih setidaknya dua produk untuk menyimpan CSV perbandingan.");
                      const saved = await window.desktopApi.saveComparisonCsv(csv);
                      setComparisonCsvNotice(saved ? "CSV perbandingan disimpan." : "Penyimpanan CSV dibatalkan.");
                    } catch (caught) {
                      setComparisonCsvNotice(messageFrom(caught, "CSV perbandingan tidak dapat disimpan."));
                    }
                  }

                  return (
                    <>
                      <div className="catalog-controls" aria-label="Filter katalog">
                        <div className="catalog-search-wrap">
                          <label htmlFor="catalog-search">Cari nama, kategori, asal, atau satuan</label>
                          <div className="catalog-search-row">
                            <input ref={catalogSearchRef} id="catalog-search" type="search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Contoh: kopi, Indonesia, atau kg" />
                            {catalogQuery && <button className="catalog-clear" type="button" onClick={() => { setCatalogQuery(""); catalogSearchRef.current?.focus(); }} aria-label="Bersihkan pencarian">×</button>}
                          </div>
                        </div>
                        <div className="catalog-filter-group" aria-label="Kategori produk">
                          <span className="catalog-filter-label">Kategori</span>
                          <div className="catalog-chips">
                          <button className={`catalog-chip${catalogCategory === "" ? " is-selected" : ""}`} type="button" aria-pressed={catalogCategory === ""} onClick={() => setCatalogCategory("")}>Semua ({categoryFacetProducts.length})</button>
                            {categories.map((category) => <button className={`catalog-chip${catalogCategory === category ? " is-selected" : ""}`} key={category} type="button" aria-pressed={catalogCategory === category} onClick={() => setCatalogCategory(category)}>{category} ({categoryFacetCounts.get(category) ?? 0})</button>)}
                          </div>
                        </div>
                        <div className="catalog-filter-group" aria-label="Asal produk">
                          <span className="catalog-filter-label">Asal</span>
                          <div className="catalog-chips">
                            <button className={`catalog-chip${catalogOrigin === "" ? " is-selected" : ""}`} type="button" aria-pressed={catalogOrigin === ""} onClick={() => setCatalogOrigin("")}>Semua asal ({originFacetProducts.length})</button>
                            {origins.map((origin) => <button className={`catalog-chip${catalogOrigin === origin ? " is-selected" : ""}`} key={origin} type="button" aria-pressed={catalogOrigin === origin} onClick={() => setCatalogOrigin(origin)}>{origin} ({originFacetCounts.get(origin) ?? 0})</button>)}
                          </div>
                        </div>
                        <div className="catalog-filter-group" aria-label="Satuan produk">
                          <span className="catalog-filter-label">Satuan</span>
                          <div className="catalog-chips">
                            <button className={`catalog-chip${catalogUnit === "" ? " is-selected" : ""}`} type="button" aria-pressed={catalogUnit === ""} onClick={() => setCatalogUnit("")}>Semua satuan ({unitFacetProducts.length})</button>
                            {units.map((unit) => <button className={`catalog-chip${catalogUnit === unit ? " is-selected" : ""}`} key={unit} type="button" aria-pressed={catalogUnit === unit} onClick={() => setCatalogUnit(unit)}>{unit} ({unitFacetCounts.get(unit) ?? 0})</button>)}
                          </div>
                        </div>
                        <div className="catalog-filter-group catalog-sort-group" aria-label="Urutkan katalog">
                          <span className="catalog-filter-label">Urutkan</span>
                          <div className="catalog-chips">
                            {catalogSortOptions.map(({ field, label }) => <button className={`catalog-chip${catalogSortField === field ? " is-selected" : ""}`} key={field} type="button" aria-pressed={catalogSortField === field} onClick={() => { setCatalogSortField(field); setCatalogSortDirection("asc"); }}>{label}</button>)}
                            {catalogSortField !== "default" && <button className={`catalog-chip${catalogSortDirection === "desc" ? " is-selected" : ""}`} type="button" aria-pressed={catalogSortDirection === "desc"} aria-label={`Urutan ${catalogSortDirection === "asc" ? "A sampai Z" : "Z sampai A"}; ubah ke ${catalogSortDirection === "asc" ? "Z sampai A" : "A sampai Z"}`} onClick={() => setCatalogSortDirection((direction) => direction === "asc" ? "desc" : "asc")}>{catalogSortDirection === "asc" ? "A–Z" : "Z–A"}</button>}
                          </div>
                        </div>
                        {filtersActive && <button className="catalog-reset" type="button" onClick={() => { setCatalogQuery(""); setCatalogCategory(""); setCatalogOrigin(""); setCatalogUnit(""); catalogSearchRef.current?.focus(); }}>Reset filter</button>}
                      </div>
                      {activeCatalogFilters.length > 0 && <div className="catalog-active-filters" role="group" aria-label="Filter aktif">
                        <span className="catalog-active-label">Filter aktif</span>
                        {activeCatalogFilters.map((filter) => {
                          const label = filter.key === "search" ? "Pencarian" : filter.key === "category" ? "Kategori" : filter.key === "origin" ? "Asal" : "Satuan";
                          return <span className="catalog-active-chip" key={filter.key}><span>{label}: {filter.value}</span><button type="button" aria-label={`Hapus filter ${label.toLowerCase()}: ${filter.value}`} onClick={() => { if (filter.key === "search") setCatalogQuery(""); else if (filter.key === "category") setCatalogCategory(""); else if (filter.key === "origin") setCatalogOrigin(""); else setCatalogUnit(""); }}>×</button></span>;
                        })}
                      </div>}
                      <div className="catalog-result-toolbar">
                        <div className="catalog-result-meta"><div className="catalog-result-status" role="status" aria-live="polite">{visibleProducts.length} dari {hideComparedProducts ? matchingProducts.length : products.length} {hideComparedProducts ? "hasil" : "produk"}</div><span className="catalog-compare-count" role="status" aria-live="polite">Pembanding: {comparedProducts.length}/{MAX_COMPARE_PRODUCTS}</span><button className={`catalog-hide-compared${hideComparedProducts ? " is-active" : ""}`} type="button" aria-pressed={hideComparedProducts} disabled={comparedProducts.length === 0 && !hideComparedProducts} onClick={() => setHideComparedProducts((current) => !current)}>{hideComparedProducts ? "Tampilkan yang dibandingkan" : "Sembunyikan yang dibandingkan"}</button></div>
                        <div className="catalog-share-actions">
                          <button className="catalog-share-button" type="button" onClick={() => void copyCatalogResults()} disabled={visibleProducts.length === 0} aria-label="Salin hasil katalog yang sedang ditampilkan"><Copy size={13} />Salin hasil</button>
                          <button className="catalog-share-button" type="button" onClick={() => void saveCatalogCsv()} disabled={visibleProducts.length === 0} aria-label="Simpan hasil katalog yang sedang ditampilkan sebagai CSV"><FilePlus2 size={13} />Simpan CSV</button>
                          {catalogShareNotice && <span className="catalog-share-notice" role="status" aria-live="polite">{catalogShareNotice}</span>}
                          {catalogCsvNotice && <span className="catalog-share-notice" role="status" aria-live="polite">{catalogCsvNotice}</span>}
                        </div>
                      </div>
                      {visibleProducts.length === 0 ? <div className="empty-state filter-empty"><span>{hideComparedProducts && matchingProducts.length > 0 ? "Semua hasil sudah dibandingkan" : "Tidak ada produk yang cocok"}</span><button className="text-button" type="button" onClick={() => hideComparedProducts && matchingProducts.length > 0 ? setHideComparedProducts(false) : (() => { setCatalogQuery(""); setCatalogCategory(""); setCatalogOrigin(""); setCatalogUnit(""); catalogSearchRef.current?.focus(); })()}>{hideComparedProducts && matchingProducts.length > 0 ? "Tampilkan semua hasil" : "Hapus filter"}</button></div> : (
                        <div className="product-grid">
                          {visibleProducts.map((product, index) => {
                            const isCompared = compareProductIds.includes(product.id);
                            return <article className="product-card" key={product.id}>
                              <button className="product-card-main" type="button" onClick={() => { setForm((current) => ({ ...current, productId: product.id })); goTo("request"); }}>
                                <span className={`product-art product-art-${index % 3}`}><span className="product-index">{String(index + 1).padStart(2, "0")}</span><span className="product-origin"><CatalogSearchHighlight value={product.origin} query={catalogQuery} /></span><span className="product-orbit" /></span>
                                <span className="product-info"><small><CatalogSearchHighlight value={product.category} query={catalogQuery} /></small><strong><CatalogSearchHighlight value={product.name} query={catalogQuery} /></strong><span>Asal <CatalogSearchHighlight value={product.origin} query={catalogQuery} /><i>·</i> per <CatalogSearchHighlight value={product.unit} query={catalogQuery} /></span></span>
                                <span className="product-arrow"><ArrowUpRight size={15} /></span>
                              </button>
                              <button className={`compare-toggle${isCompared ? " is-selected" : ""}`} type="button" aria-pressed={isCompared} disabled={!isCompared && compareProductIds.length >= MAX_COMPARE_PRODUCTS} onClick={() => toggleCompare(product.id)}>{isCompared ? "✓ Ditambahkan" : "Bandingkan"}</button>
                            </article>;
                          })}
                        </div>
                      )}
                      {compareProductIds.length > 0 && <section className="catalog-compare-panel" aria-label="Perbandingan produk">
                        <div className="catalog-compare-heading"><div><h3>Perbandingan produk</h3><p role="status" aria-live="polite">{comparedProducts.length} dari {MAX_COMPARE_PRODUCTS} dipilih · atribut dari katalog API</p></div><button type="button" onClick={() => setCompareProductIds([])}>Hapus semua</button></div>
                        {comparedProducts.length < 2 ? <p className="catalog-compare-hint">Pilih setidaknya satu produk lagi untuk membandingkan detail.</p> : <>
                <div className="catalog-compare-actions">
                  <div className="catalog-share-actions">
                    <button className="catalog-compare-filter" type="button" aria-pressed={showOnlyDifferences} onClick={() => setShowOnlyDifferences((current) => !current)}>{showOnlyDifferences ? "Tampilkan semua atribut" : "Hanya tampilkan perbedaan"}</button>
                    <button className="catalog-share-button" type="button" onClick={() => void copyComparison()} aria-label="Salin perbandingan produk"><Copy size={13} />Salin perbandingan</button>
                    <button className="catalog-share-button" type="button" onClick={() => void saveComparisonCsv()} aria-label="Simpan perbandingan produk sebagai CSV"><FilePlus2 size={13} />Simpan CSV</button>
                  </div>
                </div>
                {comparisonShareNotice && <p className="catalog-share-notice" role="status" aria-live="polite">{comparisonShareNotice}</p>}
                {comparisonCsvNotice && <p className="catalog-share-notice" role="status" aria-live="polite">{comparisonCsvNotice}</p>}
                {showOnlyDifferences && visibleComparisonFields.length === 0 ? <p className="catalog-compare-empty" role="status">Tidak ada atribut yang berbeda pada pilihan ini.</p> : <div className="catalog-compare-table-wrap"><table className="catalog-compare-table"><thead><tr><th scope="col">Detail</th>{comparedProducts.map((product) => <th scope="col" key={product.id}><span>{product.name}</span><button type="button" aria-label={`Hapus ${product.name} dari perbandingan`} onClick={() => toggleCompare(product.id)}>×</button></th>)}</tr></thead><tbody>
                  {visibleComparisonFields.map((field) => <tr key={field}><th scope="row">{comparisonFieldLabels[field]}</th>{comparedProducts.map((product) => <td key={product.id} className={differingComparisonFields.includes(field) ? "is-different" : undefined}>{differingComparisonFields.includes(field) && <span className="catalog-compare-difference">Berbeda</span>}{product[field]}</td>)}</tr>)}
                </tbody></table></div>}
              </>}
                      </section>}
                    </>
                  );
                })()}
              </section>

              <section className="integration-strip">
                <div className="integration-copy"><span className="integration-icon"><ShieldCheck size={17} /></span><span><strong>Satu sumber data, tiga klien</strong><small>Permintaan yang dibuat di sini dapat dilacak di web atau mobile dengan kode yang sama.</small></span></div>
                <button className="text-button" type="button" onClick={() => goTo("settings")}>Konfigurasi API <ArrowRight size={14} /></button>
              </section>
              <footer className="page-footer"><span>ExportClient Desktop · MVP</span><span>Data demo · bukan untuk transaksi nyata</span></footer>
            </>
          )}

          {page === "request" && (
            <section className="workflow-layout">
              <div className="workflow-card form-card">
                <div className="card-heading"><span className="step-number">02</span><div><p className="eyebrow">RFQ · PERMINTAAN PENAWARAN</p><h2>Detail kebutuhan</h2></div></div>
                <p className="card-lead">Isi informasi permintaan. Kode pelacakan yang diterbitkan dapat dipakai di web dan mobile.</p>
                <form className="form-grid" onSubmit={submitInquiry} noValidate>
                  <label htmlFor="rfq-customerName">Nama lengkap<input id="rfq-customerName" required autoComplete="name" value={form.customerName} onChange={(event) => updateInquiryField("customerName", event.target.value)} aria-invalid={Boolean(fieldErrors.customerName)} aria-describedby={fieldErrors.customerName ? "rfq-customerName-error" : undefined} placeholder="Nama Anda" />{fieldErrors.customerName && <span className="field-error" id="rfq-customerName-error" aria-live="polite">{fieldErrors.customerName}</span>}</label>
                  <label htmlFor="rfq-customerEmail">Email kerja<input id="rfq-customerEmail" required type="email" autoComplete="email" value={form.customerEmail} onChange={(event) => updateInquiryField("customerEmail", event.target.value)} aria-invalid={Boolean(fieldErrors.customerEmail)} aria-describedby={fieldErrors.customerEmail ? "rfq-customerEmail-error" : undefined} placeholder="nama@perusahaan.com" />{fieldErrors.customerEmail && <span className="field-error" id="rfq-customerEmail-error" aria-live="polite">{fieldErrors.customerEmail}</span>}</label>
                  <label htmlFor="rfq-destinationCountry">Negara tujuan<input id="rfq-destinationCountry" required autoComplete="country-name" value={form.destinationCountry} onChange={(event) => updateInquiryField("destinationCountry", event.target.value)} aria-invalid={Boolean(fieldErrors.destinationCountry)} aria-describedby={fieldErrors.destinationCountry ? "rfq-destinationCountry-error" : undefined} placeholder="Contoh: Jepang" />{fieldErrors.destinationCountry && <span className="field-error" id="rfq-destinationCountry-error" aria-live="polite">{fieldErrors.destinationCountry}</span>}</label>
                  <label htmlFor="rfq-productId">Produk<select id="rfq-productId" required value={form.productId} onChange={(event) => updateInquiryField("productId", event.target.value)} aria-invalid={Boolean(fieldErrors.productId)} aria-describedby={fieldErrors.productId ? "rfq-productId-error" : undefined} disabled={loadingProducts || products.length === 0}><option value="" disabled>Pilih produk</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.origin}</option>)}</select>{fieldErrors.productId && <span className="field-error" id="rfq-productId-error" aria-live="polite">{fieldErrors.productId}</span>}</label>
                  <label className="full-span" htmlFor="rfq-quantity">Jumlah (kg)<input id="rfq-quantity" required type="number" min="0" max="1000000" step="any" value={form.quantity} onChange={(event) => updateInquiryField("quantity", event.target.value)} aria-invalid={Boolean(fieldErrors.quantity)} aria-describedby={fieldErrors.quantity ? "rfq-quantity-error" : undefined} />{fieldErrors.quantity && <span className="field-error" id="rfq-quantity-error" aria-live="polite">{fieldErrors.quantity}</span>}</label>
                  <div className="full-span submit-row"><button className="primary-button" type="submit" disabled={submitting || loadingProducts || products.length === 0}>{submitting ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />}{submitting ? "Mengirim permintaan…" : "Kirim permintaan"}<ArrowUpRight size={16} /></button><span>Data contoh untuk MVP</span></div>
                </form>
                {trackingCode && <div className="success-box" role="status"><span className="success-mark"><Check size={16} /></span><div className="success-content"><strong>Permintaan tersimpan</strong><span>Simpan kode rahasia ini untuk melacak dari perangkat lain.</span><code>{trackingCode}</code><span className="copy-feedback" id="tracking-code-copy-notice" aria-live="polite">{trackingCodeCopyNotice}</span></div><button className="copy-button" type="button" onClick={() => void copyCode()} aria-label="Salin kode pelacakan" aria-describedby="tracking-code-copy-notice">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Tersalin" : "Salin"}</button></div>}
              </div>
              <aside className="workflow-aside">
                <div className="aside-panel"><span className="aside-icon"><LockKeyhole size={17} /></span><p className="eyebrow">PRIVASI KODE</p><h3>Kode pelacakan bersifat privat.</h3><p>Siapa pun yang memiliki kode dapat melihat status dan nama produk. Kode tidak menampilkan nama atau email pemohon.</p></div>
                <div className="aside-panel muted-panel"><p className="eyebrow">ALUR SINKRONISASI</p><div className="sync-step"><span>01</span><p><strong>Kirim permintaan</strong><small>Data tersimpan di server API bersama.</small></p></div><div className="sync-step"><span>02</span><p><strong>Simpan kode</strong><small>Kode 24 karakter menjadi kunci pelacakan.</small></p></div><div className="sync-step"><span>03</span><p><strong>Lanjutkan di perangkat lain</strong><small>Masukkan kode yang sama di web atau mobile.</small></p></div></div>
              </aside>
            </section>
          )}

          {page === "track" && (
            <section className="track-layout">
              <div className="workflow-card track-card-panel">
                <div className="card-heading"><span className="step-number">03</span><div><p className="eyebrow">STATUS · API BERSAMA</p><h2>Periksa status permintaan</h2></div></div>
                <p className="card-lead">Masukkan kode pelacakan 24 karakter yang diterima saat membuat permintaan di salah satu aplikasi.</p>
                <form className="track-form" onSubmit={lookUpInquiry}>
                  <label htmlFor="tracking-code">Kode pelacakan</label>
                  <div className="tracking-row"><input id="tracking-code" required minLength={24} maxLength={24} pattern="[A-Fa-f0-9]{24}" autoCapitalize="characters" autoComplete="off" value={trackingInput} onChange={(event) => setTrackingInput(event.target.value.toUpperCase())} placeholder="Contoh: A1B2C3D4E5F60718293A4B5C" /><button className="primary-button" type="submit" disabled={tracking}>{tracking ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{tracking ? "Memeriksa" : "Lacak status"}</button></div>
                </form>
                {trackedInquiry ? <div className="tracking-result" role="status"><div className="result-header"><span className="result-status-dot" /><span><small>STATUS PERMINTAAN</small><strong>{trackedInquiry.status === "received" ? "Diterima" : trackedInquiry.status}</strong></span><span className="received-badge">Tersimpan</span></div><div className="result-details"><div><small>PRODUK</small><strong>{trackedInquiry.productName}</strong></div><div><small>WAKTU DIBUAT</small><strong>{formatDate(trackedInquiry.createdAt)}</strong></div></div><div className="result-privacy"><LockKeyhole size={14} /> Detail kontak tidak ditampilkan melalui endpoint pelacakan.</div></div> : <div className="track-placeholder"><span className="placeholder-icon"><Clipboard size={19} /></span><strong>Hasil pelacakan akan muncul di sini</strong><span>Status dibaca langsung dari API bersama.</span></div>}
              </div>
              <aside className="workflow-aside"><div className="aside-panel"><span className="aside-icon"><CircleHelp size={17} /></span><p className="eyebrow">BELUM PUNYA KODE?</p><h3>Buat permintaan baru dahulu.</h3><p>Kode pelacakan hanya ditampilkan setelah server berhasil menyimpan permintaan.</p><button className="text-button" type="button" onClick={() => goTo("request")}>Ajukan permintaan <ArrowRight size={14} /></button></div><div className="privacy-callout"><LockKeyhole size={15} /><span>Jangan bagikan kode pelacakan ke pihak yang tidak berwenang.</span></div></aside>
            </section>
          )}

          {page === "settings" && (
            <section className="settings-layout">
              <div className="workflow-card settings-card">
                <div className="card-heading"><span className="step-number"><Settings2 size={17} /></span><div><p className="eyebrow">KONEKSI BACKEND</p><h2>Alamat API bersama</h2></div></div>
                <p className="card-lead">Arahkan aplikasi desktop ke server yang sama dengan klien web dan mobile. Untuk integrasi lintas perangkat, alamat server harus dapat dijangkau semuanya.</p>
                <form className="settings-form" onSubmit={saveApiUrl}>
                  <label htmlFor="api-url">URL dasar API</label>
                  <div className="api-input-row"><span><Globe2 size={16} /></span><input id="api-url" required type="url" value={draftApiUrl} onChange={(event) => setDraftApiUrl(event.target.value)} placeholder="https://api.example.com" /></div>
                  <small>Gunakan URL dasar saja (contoh: http://localhost:4000), tanpa path endpoint, query, atau token rahasia.</small>
                  <div className="settings-actions"><button className="primary-button" type="submit"><Check size={16} /> Simpan & uji koneksi</button><button className="secondary-button" type="button" onClick={() => { setDraftApiUrl(apiBaseUrl); void refresh(); }}>Uji alamat tersimpan</button></div>
                </form>
                <div className={`connection-detail ${connection}`}><span className="status-orb" /><div><strong>{connection === "connected" ? "API terhubung" : connection === "checking" ? "Memeriksa koneksi" : "Belum terhubung"}</strong><small>{apiBaseUrl}</small></div><span className="connection-detail-label">{connection.toUpperCase()}</span></div>
              </div>
              <div className="settings-side">
                <div className="aside-panel"><span className="aside-icon"><ShieldCheck size={17} /></span><p className="eyebrow">CARA BERBAGI API</p><h3>Satu alamat backend untuk semua.</h3><p>Web, mobile, dan desktop harus memakai API deployment yang sama agar katalog, permintaan, dan pelacakan tersinkron.</p><ul className="settings-list"><li><Check size={14} /> Desktop menyimpan alamat secara lokal.</li><li><Check size={14} /> Koneksi HTTP(S) dipanggil dari proses utama.</li><li><Check size={14} /> Tidak ada token yang disimpan di aplikasi.</li></ul></div>
                <div className="demo-warning"><span>!</span><p><strong>MVP data demo</strong><small>Belum ada autentikasi/admin atau kebijakan retensi. Jangan gunakan untuk data klien nyata.</small></p></div>
              </div>
            </section>
          )}

          {page === "overview" && <div className="bottom-links"><span><ShieldCheck size={14} /> API bersama dikelola di repo web.</span><a href="https://github.com/muchlisbstg/export-client-web-sync/blob/main/docs/openapi.yaml" target="_blank" rel="noreferrer">Lihat kontrak OpenAPI <ExternalLink size={13} /></a></div>}
        </div>
      </main>
    </div>
  );
}

import { useEffect, useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "react-toastify"
import * as XLSX from "xlsx"
import {
  RotateCcw, Search, Moon, Bell, Plus, Check, Clock,
  ArrowLeft, CreditCard, AlertTriangle, Package, RefreshCw
} from "lucide-react"

import { supabase } from "../../context/SupabaseConfig"
import { returnsService } from "../../services/returns"
import RightDrawer from "../../components/Common/RightDrawer"
import RequestDetail from "../../features/returns/admin/RequestDetail"
import { FINAL_STATUSES, requestTypeLabel } from "../../features/returns/requestModel"

/* ============================== DESIGN TOKENS ============================== */
const FONT = "'Plus Jakarta Sans', sans-serif"
const TEAL = "#104945"
const TEAL_HOVER = "#0c3734"
const BORDER = "#E5DFD5"
const CANVAS = "#EDE8E1"

const AVATAR_PALETTES = [
  { bg: "#CCE0D6", text: "#1F543C" },
  { bg: "#DBE8CE", text: "#30531D" },
  { bg: "#FCE5D2", text: "#8C4610" },
  { bg: "#F5E8CD", text: "#785412" },
  { bg: "#EFE1EA", text: "#6E2A5A" },
  { bg: "#D4E2F4", text: "#244A7F" },
]

const getAvatarColor = (name) => {
  let hash = 0
  const s = String(name || "Customer")
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length]
}

const getInitials = (name) => {
  if (!name) return "CU"
  return String(name)
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

const formatINR = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const DEMO_RETURNS = [
  {
    id: "ret-1",
    requestNo: "RET-10643",
    orderId: "PG-10643",
    type: "return",
    status: "approved",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    customerName: "Kofi Varga",
    customerEmail: "kofi.varga@example.com",
    reason: "Glaze colour not as pictured",
    refundAmount: 134,
    itemsText: "Mossgrown planter, small, Tasting cup set of 4, Side plate",
    colorGradient: "from-lime-600 to-amber-700",
  },
  {
    id: "ret-2",
    requestNo: "RET-10632",
    orderId: "PG-10632",
    type: "return",
    status: "approved",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    customerName: "Yuki Haddad",
    customerEmail: "yuki.haddad@example.com",
    reason: "⚠️ Crack along the base",
    isDamaged: true,
    refundAmount: 77.40,
    itemsText: "Tideline serving platter",
    swatchColor: "#1C4E4B",
  },
  {
    id: "ret-3",
    requestNo: "RET-10576",
    orderId: "PG-10576",
    type: "return",
    status: "refunded",
    createdAt: new Date(Date.now() - 691200000).toISOString(),
    customerName: "Samir Okafor",
    customerEmail: "samir.okafor@example.com",
    reason: "Glaze colour not as pictured",
    refundAmount: 70.00,
    itemsText: "Harbour mug, Fog latte bowl",
    swatchColor: "#204945",
  },
  {
    id: "ret-4",
    requestNo: "RET-10508",
    orderId: "PG-10508",
    type: "exchange",
    status: "refunded",
    createdAt: new Date(Date.now() - 777600000).toISOString(),
    customerName: "Kwame Byrne",
    customerEmail: "kwame.byrne@example.com",
    reason: "Ordered the wrong size",
    refundAmount: 30.00,
    itemsText: "Ember tumbler",
    swatchColor: "#5A2C17",
  },
  {
    id: "ret-5",
    requestNo: "RET-10558",
    orderId: "PG-10558",
    type: "return",
    status: "refunded",
    createdAt: new Date(Date.now() - 864000000).toISOString(),
    customerName: "Ingrid Petrova",
    customerEmail: "ingrid.petrova@example.com",
    reason: "⚠️ Crack along the base",
    isDamaged: true,
    refundAmount: 28.00,
    itemsText: "Low-tide cup",
    swatchColor: "#677771",
  },
]

const NEEDS_ACTION = [
  "pending_review",
  "approved",
  "return_received",
  "inspection_pending",
  "inspection_passed",
  "refund_pending",
  "replacement_pending",
  "replacement_delivered",
]

const ReturnsOrdersPage = ({
  onSwitchTab,
  showHeader = true,
  onMetricsChange,
  actionsRef,
  searchQuery: propSearchQuery,
}) => {
  const navigate = useNavigate()

  const [typeFilter, setTypeFilter] = useState("all") // all | return | exchange
  const [statusFilter, setStatusFilter] = useState("action") // action | open | done | all
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    if (propSearchQuery !== undefined) {
      setSearchQuery(propSearchQuery)
    }
  }, [propSearchQuery])

  const [selectedId, setSelectedId] = useState("")

  const [state, setState] = useState({ loading: true, requests: [], error: "" })
  const [metrics, setMetrics] = useState({
    ordersMonth: 481,
    revMonth: 46023,
    aovMonth: 96,
    awaitingPack: 297,
    returnsToRefund: 2,
    todayCount: 290,
    todayRev: 19000,
    toPackCount: 305,
    allOrdersCount: 929,
  })

  /* ============================== LOAD REAL DATA ============================== */
  const load = useCallback(async () => {
    try {
      const requests = await returnsService.adminList({ limit: 500 })
      setState({ loading: false, requests: requests || [], error: "" })
    } catch (err) {
      console.error("Could not load return requests:", err)
      setState({ loading: false, requests: [], error: err.message })
    }

    // Load orders counts for top bar and KPI cards
    try {
      const { data: ordRows } = await supabase.from("orders").select("id, total, status, created_at")
      if (ordRows && ordRows.length) {
        const now = new Date()
        const currentMonth = now.getMonth()
        const currentYear = now.getFullYear()
        const monthOrders = ordRows.filter((o) => {
          const d = new Date(o.created_at)
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear
        })
        const rev = monthOrders.reduce((sum, o) => sum + Number(o.total || 0), 0)
        const awaiting = ordRows.filter((o) => ["placed", "confirmed"].includes(o.status)).length

        setMetrics((prev) => ({
          ...prev,
          ordersMonth: monthOrders.length || 481,
          revMonth: rev || 46023,
          aovMonth: monthOrders.length ? Math.round(rev / monthOrders.length) : 96,
          awaitingPack: awaiting || 297,
          allOrdersCount: ordRows.length || 929,
          toPackCount: awaiting || 305,
        }))
      }
    } catch (err) {
      console.error("Order stats error:", err)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel("admin-returns-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "return_requests" }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load])

  /* ============================== MERGED REQUESTS LIST ============================== */
  const displayRequests = useMemo(() => {
    // If database has requests, use real requests mapped to UI shape; otherwise show demonstration templates
    if (state.requests && state.requests.length > 0) {
      return state.requests.map((r) => ({
        id: r.id,
        raw: r,
        requestNo: r.requestNo || `RET-${r.id?.slice(0, 5)}`,
        orderId: r.orderId || `PG-${r.id?.slice(0, 5)}`,
        type: r.type || "return",
        status: r.status,
        createdAt: r.createdAt || r.created_at,
        customerName: r.order?.customerName || r.customerName || "Customer",
        customerEmail: r.order?.customerEmail || r.customerEmail || "",
        reason: r.reason || "Customer return",
        isDamaged: String(r.reason || "").toLowerCase().includes("crack") || String(r.reason || "").toLowerCase().includes("damaged"),
        refundAmount: r.refundAmount || r.total || 100,
        itemsText: (r.items || []).map((i) => i.title || "Product item").join(", ") || "Order items",
        swatchColor: "#1C4E4B",
      }))
    }
    return DEMO_RETURNS
  }, [state.requests])

  /* ============================== FILTERED LIST ============================== */
  const filteredRequests = useMemo(() => {
    return displayRequests.filter((r) => {
      // Type filter
      if (typeFilter !== "all" && r.type !== typeFilter) return false

      // Status filter
      if (statusFilter === "action" && !NEEDS_ACTION.includes(r.status)) return false
      if (statusFilter === "open" && FINAL_STATUSES.includes(r.status)) return false
      if (statusFilter === "finished" && !FINAL_STATUSES.includes(r.status)) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchNo = String(r.requestNo || "").toLowerCase().includes(q)
        const matchOrder = String(r.orderId || "").toLowerCase().includes(q)
        const matchCust = String(r.customerName || "").toLowerCase().includes(q)
        const matchReason = String(r.reason || "").toLowerCase().includes(q)
        if (!matchNo && !matchOrder && !matchCust && !matchReason) return false
      }

      return true
    })
  }, [displayRequests, typeFilter, statusFilter, searchQuery])

  const selectedRequest = useMemo(() => {
    if (!selectedId) return null
    const found = state.requests.find((r) => r.id === selectedId)
    return found || null
  }, [selectedId, state.requests])

  const handleRefundClick = (req, e) => {
    e.stopPropagation()
    if (req.raw) {
      setSelectedId(req.id)
    } else {
      toast.success(`Refund of ${formatINR(req.refundAmount)} processed successfully.`)
    }
  }

  const exportToExcel = () => {
    const rows = displayRequests.map((r) => ({
      "Request #": r.requestNo,
      "Order ID": r.orderId,
      Customer: r.customerName,
      Email: r.customerEmail,
      Type: r.type,
      Status: r.status,
      Reason: r.reason,
      "Refund Amount": r.refundAmount,
      Items: r.itemsText,
      Date: r.createdAt,
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, "Returns_Orders")
    XLSX.writeFile(wb, `Returns_Orders_${new Date().toISOString().slice(0, 10)}.xlsx`)
    toast.success("Exported return requests to Excel.")
  }

  useEffect(() => {
    if (onMetricsChange) onMetricsChange({ ...metrics, returnsCount: displayRequests.length })
  }, [metrics, displayRequests.length, onMetricsChange])

  useEffect(() => {
    if (actionsRef) {
      actionsRef.current = {
        exportToExcel,
      }
    }
  }, [actionsRef, displayRequests])

  return (
    <div style={{ fontFamily: FONT }} className="flex-1 w-full flex flex-col space-y-6 text-slate-800 pb-12">
      {showHeader && (
        <>
          {/* Top Bar: Title & Status Actions */}
      <section className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 select-none" data-purpose="page-header">
        <div>
          <p className="text-[12px] font-medium text-[#717A76] mb-0.5">Online shop, studio shop and wholesale</p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Orders</h1>
        </div>
        {/* Top Right Control Badges */}
        <div className="flex items-center gap-2">
          {/* Live Orders Pill */}
          <div className="flex items-center gap-2 bg-[#FAF8F5] border border-[#DFDACF] px-3.5 py-1.5 rounded-full text-[11.5px] font-semibold text-slate-700 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#104945] animate-pulse"></span>
            <span>{metrics.todayCount} today</span>
            <span className="text-slate-300 font-normal">|</span>
            <span className="text-slate-500 font-normal">{formatINR(metrics.todayRev)}</span>
          </div>

          {/* Night Mode Button */}
          <button
            type="button"
            className="w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#DFDACF] flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer"
            title="Toggle dark mode"
          >
            <Moon size={15} />
          </button>

          {/* Notification Bell with Dot */}
          <button
            type="button"
            className="relative w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#DFDACF] flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer"
          >
            <Bell size={15} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#D13B3B] rounded-full"></span>
          </button>

          {/* + New Action Button */}
          <button
            onClick={() => navigate("/admin/createOrders")}
            type="button"
            className="bg-[#104945] hover:bg-[#0c3734] text-white text-[12px] font-semibold px-3.5 py-1.5 rounded-full flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
          >
            <span>+</span>
            <span>New</span>
          </button>
        </div>
      </section>

      {/* BEGIN: KpiMetricRow */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5" data-purpose="metric-cards">
        {/* KPI 1: Orders in October */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5DFD5] shadow-xs flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11.5px] font-medium">
            <Package size={14} className="text-emerald-700" />
            <span>Orders in October</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{metrics.ordersMonth}</span>
            <span className="bg-[#DFF5E6] text-[#0A7347] text-[10.5px] font-bold px-2 py-0.5 rounded-full">
              +96% on September
            </span>
          </div>
        </div>

        {/* KPI 2: Revenue in October */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5DFD5] shadow-xs flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11.5px] font-medium">
            <CreditCard size={14} className="text-emerald-700" />
            <span>Revenue in October</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{formatINR(metrics.revMonth)}</div>
            <p className="text-[10px] text-slate-500 font-medium mt-0.5">₹{metrics.aovMonth} an order</p>
          </div>
        </div>

        {/* KPI 3: Paid, waiting to pack */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5DFD5] shadow-xs flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11.5px] font-medium">
            <Clock size={14} className="text-emerald-700" />
            <span>Paid, waiting to pack</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{metrics.awaitingPack}</span>
            <span className="bg-[#F8EED7] text-[#916212] text-[10.5px] font-bold px-2 py-0.5 rounded-full">
              oldest 1 d ago
            </span>
          </div>
        </div>

        {/* KPI 4: Returns to refund */}
        <div className="bg-white rounded-2xl p-4 border border-[#E5DFD5] shadow-xs flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11.5px] font-medium">
            <RotateCcw size={14} className="text-emerald-700" />
            <span>Returns to refund</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold text-slate-900 tracking-tight">{displayRequests.length}</span>
            <span className="bg-[#F8EED7] text-[#916212] text-[10.5px] font-bold px-2 py-0.5 rounded-full">
              ₹211 due
            </span>
          </div>
        </div>
      </section>
      {/* END: KpiMetricRow */}

      {/* BEGIN: SubNavigationTabs */}
      <div className="flex items-center gap-7 border-b border-[#D8D2C7] pt-1 px-1" data-purpose="sub-navigation">
        <button
          onClick={() => onSwitchTab?.("pack")}
          type="button"
          className="pb-2.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          To pack &amp; ship <span className="text-slate-400 font-normal">{metrics.toPackCount}</span>
        </button>
        <button
          onClick={() => onSwitchTab?.("all")}
          type="button"
          className="pb-2.5 text-[12.5px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          All orders <span className="text-slate-400 font-normal">{metrics.allOrdersCount}</span>
        </button>
        <button
          onClick={() => onSwitchTab?.("returns")}
          type="button"
          className="pb-2.5 text-[12.5px] font-bold text-[#104945] border-b-2 border-[#104945] flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span>Returns</span>
          <span className="bg-[#D7EFE6] text-[#0A7347] text-[10px] font-extrabold px-1.5 py-0.2 rounded-full">
            {displayRequests.length}
          </span>
        </button>
      </div>
      {/* END: SubNavigationTabs */}
        </>
      )}

      {/* BEGIN: DualColumnContentArea */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start" data-purpose="content-grid">
        {/* Left Big Card: Returns Order List (8 Columns) */}
        <section className="xl:col-span-8 bg-white rounded-[26px] border border-[#E5DFD5] p-5 shadow-xs" data-purpose="returns-table-card">
          {/* Card Header & Top Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSwitchTab?.("all")}
                type="button"
                className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 cursor-pointer"
                title="Back to all orders"
              >
                <ArrowLeft size={14} className="stroke-[2.5]" />
              </button>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">Returns</h2>
            </div>
            {/* Segmented Filter Pills: All / Returns / Exchange */}
            <div className="bg-[#ECE7DF] p-0.5 rounded-full flex text-[11px] font-semibold text-slate-600">
              <button
                onClick={() => setTypeFilter("all")}
                type="button"
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  typeFilter === "all" ? "bg-white text-slate-900 shadow-xs font-bold" : "hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTypeFilter("return")}
                type="button"
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  typeFilter === "return" ? "bg-white text-slate-900 shadow-xs font-bold" : "hover:text-slate-900"
                }`}
              >
                Returns
              </button>
              <button
                onClick={() => setTypeFilter("exchange")}
                type="button"
                className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                  typeFilter === "exchange" ? "bg-white text-slate-900 shadow-xs font-bold" : "hover:text-slate-900"
                }`}
              >
                Exchange
              </button>
            </div>
          </div>

          {/* Search Input & Secondary Filters */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-5">
            {/* Search Bar */}
            <div className="relative w-full sm:w-[320px]">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search size={14} className="stroke-[2]" />
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-[11.5px] rounded-full border border-[#DCD6CA] bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#104945]"
                placeholder="Search orders, products, customers..."
                type="text"
              />
            </div>
            {/* Need Action / In Progress / Finished / All Segment */}
            <div className="bg-[#ECE7DF] p-0.5 rounded-full flex text-[10.5px] font-semibold text-slate-600 self-end sm:self-auto">
              {[
                { key: "action", label: "Need Action" },
                { key: "open", label: "In Progress" },
                { key: "finished", label: "Finished" },
                { key: "all", label: "All" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  type="button"
                  className={`px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                    statusFilter === f.key ? "bg-white text-slate-900 shadow-xs font-bold" : "hover:text-slate-900"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table Header Labels */}
          <div className="grid grid-cols-12 text-[10px] font-bold text-[#868F8A] uppercase tracking-wider pb-2 border-b border-slate-100 px-1 select-none">
            <div className="col-span-4 sm:col-span-3">ORDER</div>
            <div className="col-span-8 sm:col-span-9">REASON AND ITEMS</div>
          </div>

          {/* Order Rows Container */}
          <div className="divide-y divide-slate-100 text-[12px]">
            {filteredRequests.length === 0 ? (
              <div className="py-12 text-center text-slate-400">No return or exchange requests matching filters.</div>
            ) : (
              filteredRequests.map((req) => {
                const avStyle = getAvatarColor(req.customerName)
                const isRefunded = req.status === "refunded" || FINAL_STATUSES.includes(req.status)

                return (
                  <div
                    key={req.id}
                    onClick={() => {
                      if (req.raw) setSelectedId(req.id)
                      else toast.info(`Viewing ${req.requestNo}: ${req.customerName}`)
                    }}
                    className="py-3.5 grid grid-cols-12 items-center gap-2 hover:bg-[#FAF8F5] transition-colors cursor-pointer px-1 rounded-lg"
                  >
                    {/* Left: Customer & Order */}
                    <div className="col-span-4 sm:col-span-3 flex items-center gap-2.5">
                      <div
                        style={{ backgroundColor: avStyle.bg, color: avStyle.text }}
                        className="w-7 h-7 rounded-full font-bold text-[10px] flex items-center justify-center shrink-0"
                      >
                        {getInitials(req.customerName)}
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-slate-900 text-[12px]">{req.orderId}</div>
                        <div className="text-[10px] text-slate-500 font-medium truncate">
                          {req.customerName} · 1 day ago
                        </div>
                      </div>
                    </div>

                    {/* Right: Reason, Items & Action Button */}
                    <div className="col-span-8 sm:col-span-9 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="space-y-1">
                        <div>
                          {req.isDamaged ? (
                            <span className="inline-flex items-center gap-1 bg-[#FDECE9] text-[#B83B54] text-[10.5px] font-semibold px-2 py-0.5 rounded-full">
                              {req.reason}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-[#ECEAE5] text-[#36423E] text-[10.5px] font-medium px-2 py-0.5 rounded-full">
                              <RotateCcw size={11} className="text-slate-500" />
                              {req.reason}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
                          {req.colorGradient ? (
                            <span className="w-3.5 h-3.5 rounded bg-gradient-to-br from-lime-600 to-amber-700 inline-block shrink-0"></span>
                          ) : (
                            <span
                              style={{ backgroundColor: req.swatchColor || "#1C4E4B" }}
                              className="w-3.5 h-3.5 rounded inline-block shrink-0"
                            ></span>
                          )}
                          <span className="truncate max-w-[280px]">{req.itemsText}</span>
                        </div>
                      </div>

                      {/* Refund Action / Refunded Pill */}
                      {isRefunded ? (
                        <div className="bg-[#E4F5EB] text-[#0A7347] font-semibold text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1 self-start sm:self-auto shrink-0 select-none">
                          <Check size={12} className="stroke-[2.5]" />
                          <span>Refunded {formatINR(req.refundAmount)}</span>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => handleRefundClick(req, e)}
                          type="button"
                          className="bg-[#104945] hover:bg-[#0c3935] text-white px-3 py-1.5 rounded-lg font-semibold text-[11px] flex items-center gap-1.5 self-start sm:self-auto shrink-0 shadow-2xs transition-colors cursor-pointer"
                        >
                          <CreditCard size={12} />
                          <span>Refund {formatINR(req.refundAmount)}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* Right Side Card: Return rate Breakdown (4 Columns) */}
        <section className="xl:col-span-4 bg-white rounded-[26px] border border-[#E5DFD5] p-5 shadow-xs space-y-5" data-purpose="return-rate-card">
          {/* Card Header */}
          <div className="flex items-center justify-between text-slate-800">
            <div className="flex items-center gap-2 font-bold text-[13px]">
              <div className="w-6 h-6 rounded-md bg-[#EDF7F2] text-[#0A7347] flex items-center justify-center">
                <RefreshCw size={14} className="stroke-[2.5]" />
              </div>
              <span>Return rate</span>
            </div>
            <span className="text-xs text-slate-500 font-medium">October</span>
          </div>

          {/* Big Stat & Note */}
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">4.0%</span>
              <span className="bg-[#DFF5E6] text-[#0A7347] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                ↓ 4.0% in September
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-2 leading-relaxed">
              8 of 201 online orders delivered this month came back.<br />
              ₹372 refunded so far.
            </p>
          </div>

          <hr className="border-slate-100" />

          {/* Section: Why items come back */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-1.5 text-[11.5px]">
              <span className="font-bold text-slate-800">Why items come back</span>
              <span className="text-slate-400 font-normal">since Sep 1</span>
            </div>

            {/* Bar 1: Crack along the base */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-slate-700">
                <span>Crack along the base</span>
                <span className="font-bold text-slate-900">5</span>
              </div>
              <div className="h-1.5 w-full bg-[#F4EFEA] rounded-full overflow-hidden">
                <div className="h-full bg-[#B83B54] rounded-full" style={{ width: "100%" }}></div>
              </div>
            </div>

            {/* Bar 2: Glaze colour not as pictured */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-slate-700">
                <span>Glaze colour not as pictured</span>
                <span className="font-bold text-slate-900">4</span>
              </div>
              <div className="h-1.5 w-full bg-[#F4EFEA] rounded-full overflow-hidden">
                <div className="h-full bg-[#475B5A] rounded-full" style={{ width: "80%" }}></div>
              </div>
            </div>

            {/* Bar 3: Arrived chipped */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-slate-700">
                <span>Arrived chipped</span>
                <span className="font-bold text-slate-900">4</span>
              </div>
              <div className="h-1.5 w-full bg-[#F4EFEA] rounded-full overflow-hidden">
                <div className="h-full bg-[#B83B54] rounded-full" style={{ width: "80%" }}></div>
              </div>
            </div>

            {/* Bar 4: Changed my mind */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-slate-700">
                <span>Changed my mind</span>
                <span className="font-bold text-slate-900">3</span>
              </div>
              <div className="h-1.5 w-full bg-[#F4EFEA] rounded-full overflow-hidden">
                <div className="h-full bg-[#475B5A] rounded-full" style={{ width: "60%" }}></div>
              </div>
            </div>

            {/* Bar 5: Ordered the wrong size */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-medium text-slate-700">
                <span>Ordered the wrong size</span>
                <span className="font-bold text-slate-900">2</span>
              </div>
              <div className="h-1.5 w-full bg-[#F4EFEA] rounded-full overflow-hidden">
                <div className="h-full bg-[#475B5A] rounded-full" style={{ width: "40%" }}></div>
              </div>
            </div>
          </div>
        </section>
      </div>
      {/* END: DualColumnContentArea */}

      {/* Request Detail Drawer */}
      <RightDrawer
        open={Boolean(selectedRequest)}
        onClose={() => setSelectedId("")}
        title={selectedRequest ? `${requestTypeLabel(selectedRequest.type)} #${selectedRequest.requestNo}` : ""}
      >
        {selectedRequest ? <RequestDetail request={selectedRequest} onChanged={load} /> : null}
      </RightDrawer>
    </div>
  )
}

export default ReturnsOrdersPage

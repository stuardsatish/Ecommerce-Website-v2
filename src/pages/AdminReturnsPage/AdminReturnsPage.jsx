import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { RotateCcw, Search } from "lucide-react"
import { supabase } from "../../context/SupabaseConfig"
import { returnsService } from "../../services/returns"
import RightDrawer from "../../components/Common/RightDrawer"
import RequestDetail from "../../features/returns/admin/RequestDetail"
import { RequestStatusChip } from "../../features/returns/RequestBits"
import { FINAL_STATUSES, requestTypeLabel } from "../../features/returns/requestModel"
import { fmtDate } from "../../features/orders/shipping/shipmentUi"

const INTER = "'Inter', sans-serif"
const MONO = "'JetBrains Mono', monospace"
const TABS = [{ key: "return", title: "Return Requests" }, { key: "exchange", title: "Exchange Requests" }]
// statuses where the NEXT move is the admin's (not the customer's or the courier's)
// (an exchange that is delivered but not closed is waiting for its price difference to be settled)
const NEEDS_ACTION = ["pending_review", "approved", "return_received", "inspection_pending", "inspection_passed", "refund_pending", "replacement_pending", "replacement_delivered"]
const FILTERS = [
  { key: "action", label: "Needs action", test: (r) => NEEDS_ACTION.includes(r.status) },
  { key: "open", label: "In progress", test: (r) => !FINAL_STATUSES.includes(r.status) },
  { key: "done", label: "Finished", test: (r) => FINAL_STATUSES.includes(r.status) },
  { key: "all", label: "All", test: () => true },
]
const ageText = (iso) => {
  const d = iso ? Date.now() - new Date(iso).getTime() : NaN
  if (!Number.isFinite(d) || d < 0) return ""
  const h = Math.floor(d / 3600000)
  return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

/**
 * Admin: Return Requests and Exchange Requests (spec 7). Same patterns as the Orders page: tabs with counts, a list, a right-hand drawer.
 * Every decision, move and note goes through the RPCs of the database state machine (the screen only offers the steps that are legal).
 */
const AdminReturnsPage = () => {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "return"
  const filterKey = FILTERS.some((f) => f.key === params.get("status")) ? params.get("status") : "action"
  const selectedId = params.get("open") || ""
  const [search, setSearch] = useState("")
  const [state, setState] = useState({ loading: true, requests: [], error: "" })

  const update = useCallback((patch) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    for (const [k, v] of Object.entries(patch)) { if (!v) next.delete(k); else next.set(k, v) }
    return next
  }, { replace: true }), [setParams])

  const load = useCallback(async () => {
    try {
      const requests = await returnsService.adminList({ limit: 500 })
      setState({ loading: false, requests, error: "" })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || "Could not load the requests" }))
    }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    // its own channel: if the returns tables are missing only this subscription fails
    const channel = supabase.channel("admin-returns-realtime").on("postgres_changes", { event: "*", schema: "public", table: "return_requests" }, load).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  const counts = useMemo(() => {
    const out = { return: { action: 0 }, exchange: { action: 0 } }
    for (const r of state.requests) if (out[r.type] && NEEDS_ACTION.includes(r.status)) out[r.type].action += 1
    return out
  }, [state.requests])

  const filter = FILTERS.find((f) => f.key === filterKey)
  const q = search.trim().toLowerCase()
  const shown = useMemo(() => state.requests.filter((r) => r.type === tab && filter.test(r) && (!q
    || r.requestNo.toLowerCase().includes(q) || r.orderId.toLowerCase().includes(q) || (r.order?.customerName || "").toLowerCase().includes(q) || (r.order?.customerEmail || "").toLowerCase().includes(q))),
  [state.requests, tab, filter, q])
  const selected = state.requests.find((r) => r.id === selectedId) || null

  return (
    <div style={{ background: "var(--color-background)", minHeight: "100vh", fontFamily: INTER, color: "var(--color-ink)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 24px 80px" }}>
        <h1 className="flex items-center" style={{ gap: "10px", fontWeight: 800, fontSize: "30px", letterSpacing: "-0.6px" }}><RotateCcw size={26} style={{ color: "var(--color-primary)" }} /> Returns &amp; Exchanges</h1>
        <p style={{ fontSize: "14px", color: "var(--color-body)", marginTop: "4px" }}>Review, decide, arrange the return, inspect. Nothing is refunded or restocked from this list directly.</p>

        <div className="flex flex-wrap items-center" style={{ gap: "8px", margin: "22px 0 12px" }} role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => update({ tab: t.key, open: "" })}
              style={{ padding: "10px 18px", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: "pointer", background: tab === t.key ? "var(--color-primary)" : "var(--color-surface)", color: tab === t.key ? "var(--color-inverse)" : "var(--color-body)", border: "1px solid var(--color-border)" }}>
              {t.title}
              {counts[t.key].action > 0 ? <span style={{ marginLeft: "8px", background: tab === t.key ? "var(--color-inverse)" : "var(--color-primary)", color: tab === t.key ? "var(--color-primary)" : "var(--color-inverse)", borderRadius: "9999px", padding: "1px 8px", fontSize: "12px" }}>{counts[t.key].action}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between" style={{ gap: "10px", marginBottom: "16px" }}>
          <div className="flex flex-wrap" style={{ gap: "6px" }}>
            {FILTERS.map((f) => (
              <button key={f.key} aria-pressed={filterKey === f.key} onClick={() => update({ status: f.key === "action" ? "" : f.key, open: "" })}
                style={{ padding: "6px 14px", borderRadius: "9999px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: filterKey === f.key ? "var(--color-ink)" : "var(--color-surface-muted)", color: filterKey === f.key ? "var(--color-inverse)" : "var(--color-body)" }}>{f.label}</button>
            ))}
          </div>
          <label className="flex items-center" style={{ gap: "8px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "0 12px", height: "40px" }}>
            <Search size={15} style={{ color: "var(--color-muted)" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Request no, order id, customer" aria-label="Search requests" style={{ border: "none", outline: "none", background: "transparent", fontSize: "14px", width: "240px" }} />
          </label>
        </div>

        {state.loading ? (
          <div className="animate-pulse flex flex-col" style={{ gap: "10px" }}>{[0, 1, 2].map((i) => <div key={i} style={{ height: "76px", borderRadius: "14px", background: "var(--color-border)" }} />)}</div>
        ) : state.error ? (
          <p style={{ color: "var(--color-error)", fontSize: "14px" }}>{state.error}</p>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center text-center" style={{ border: "2px dashed var(--color-border)", borderRadius: "24px", padding: "56px 20px", gap: "6px" }}>
            <RotateCcw size={40} style={{ color: "var(--color-border-strong)" }} />
            <p style={{ fontWeight: 800, fontSize: "20px" }}>No {tab} requests here</p>
            <p style={{ fontSize: "14px", color: "var(--color-body)" }}>{filterKey === "action" ? "Nothing needs your action right now." : "Nothing matches this filter."}</p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: "10px" }}>
            {shown.map((r) => (
              <button key={r.id} onClick={() => update({ open: r.id })} className="flex items-center justify-between flex-wrap" style={{ gap: "10px", textAlign: "left", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "14px", padding: "14px 18px", cursor: "pointer", width: "100%" }}>
                <span className="flex flex-col" style={{ minWidth: 0, gap: "2px" }}>
                  <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: "14px" }}>{r.requestNo}</span>
                  <span style={{ fontSize: "13px", color: "var(--color-body)" }}>{r.order?.customerName || "Guest"} · order {String(r.orderId).slice(-10)} · {r.items.length} item{r.items.length === 1 ? "" : "s"}: {r.items.map((i) => `${i.title}${i.variantName ? ` (${i.variantName})` : ""} x${i.quantity}`).join(", ")}</span>
                  <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>{requestTypeLabel(r.type)} · {r.reasonCode.replace(/_/g, " ")} · {fmtDate(r.createdAt)} ({ageText(r.createdAt)})</span>
                </span>
                <RequestStatusChip status={r.status} staff />
              </button>
            ))}
          </div>
        )}
      </div>

      <RightDrawer open={!!selected} onClose={() => update({ open: "" })} title={selected ? `${requestTypeLabel(selected.type)} ${selected.requestNo}` : ""} widthPx={680}>
        {selected ? <RequestDetail key={selected.id} request={selected} onChanged={load} /> : null}
      </RightDrawer>
    </div>
  )
}

export default AdminReturnsPage
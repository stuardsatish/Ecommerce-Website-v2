import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "react-toastify"
import { Boxes } from "lucide-react"
import { inventoryService } from "../../services/inventory"
import TextPromptModal from "../../features/returns/admin/TextPromptModal"
import { CopyButton } from "../../features/orders/shipping/ShipmentBits"
import { BUCKETS, MOVEMENT_TYPES, bucketLabel, driftText, gapText, movementMeta, paymentExceptionMeta, signed } from "../../features/inventory/inventoryModel"
import { formatMoney } from "../../features/returns/refundModel"
import { GHOST_BTN, INPUT_STYLE, LABEL_STYLE, PRIMARY_BTN, fmtDateTime, toneColors } from "../../features/orders/shipping/shipmentUi"

const INTER = "'Inter', sans-serif"
const MONO = "'JetBrains Mono', monospace"
const TABS = [
  { key: "ledger", title: "Stock ledger" },
  { key: "reconcile", title: "Reconciliation" },
  { key: "unsellable", title: "Not resellable" },
  { key: "payments", title: "Paid, no order" },
]
const Card = ({ children }) => <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "14px", padding: "14px 16px" }}>{children}</div>
const Empty = ({ children }) => <p style={{ fontSize: "14px", color: "var(--color-body)", padding: "28px 0", textAlign: "center" }}>{children}</p>
const Pill = ({ tone, children }) => { const c = toneColors(tone); return <span style={{ background: c.bg, color: c.fg, borderRadius: "9999px", padding: "2px 9px", fontWeight: 700, fontSize: "11px", whiteSpace: "nowrap" }}>{children}</span> }
const Table = ({ head, children }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
      <thead><tr>{head.map((h) => <th key={h} style={{ textAlign: "left", fontWeight: 700, fontSize: "11px", letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--color-body)", padding: "6px 8px", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
)
const Td = ({ children, mono, right, nowrap = true }) => <td style={{ padding: "8px", borderTop: "1px solid var(--color-info-subtle)", verticalAlign: "top", fontFamily: mono ? MONO : INTER, textAlign: right ? "right" : "left", whiteSpace: nowrap ? "nowrap" : "normal" }}>{children}</td>

/** the ledger: every stock movement, newest first, with filters; `before` pages back through it */
function LedgerTab() {
  const [filters, setFilters] = useState({ type: "", bucket: "", orderId: "", productId: "", from: "", to: "" })
  const [applied, setApplied] = useState({})
  const [state, setState] = useState({ loading: true, rows: [], next: null, ordered: true, error: "" })
  const [more, setMore] = useState(false)
  const run = useCallback(async (f, before = null, append = false) => {
    try {
      const r = await inventoryService.ledger({ filters: f, before })
      setState((s) => ({ loading: false, rows: append ? [...s.rows, ...r.rows] : r.rows, next: r.nextBefore, ordered: r.ordered, error: "" }))
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || "Could not load the ledger" }))
    } finally {
      setMore(false)
    }
  }, [])
  useEffect(() => { run(applied) }, [run, applied])
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))
  const apply = (e) => { e.preventDefault(); setState((s) => ({ ...s, loading: true })); setApplied({ ...filters }) }

  return (
    <div className="flex flex-col" style={{ gap: "12px" }}>
      <form onSubmit={apply} className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", alignItems: "end" }}>
        <div><label style={LABEL_STYLE} htmlFor="lf-type">Movement</label>
          <select id="lf-type" value={filters.type} onChange={set("type")} style={INPUT_STYLE}><option value="">All</option>{MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{movementMeta(t).label}</option>)}</select></div>
        <div><label style={LABEL_STYLE} htmlFor="lf-bucket">Stock</label>
          <select id="lf-bucket" value={filters.bucket} onChange={set("bucket")} style={INPUT_STYLE}><option value="">All</option>{BUCKETS.map((b) => <option key={b} value={b}>{bucketLabel(b)}</option>)}</select></div>
        <div><label style={LABEL_STYLE} htmlFor="lf-order">Order id</label><input id="lf-order" value={filters.orderId} onChange={set("orderId")} style={INPUT_STYLE} placeholder="exact id" /></div>
        <div><label style={LABEL_STYLE} htmlFor="lf-product">Product id</label><input id="lf-product" value={filters.productId} onChange={set("productId")} style={INPUT_STYLE} placeholder="exact id" /></div>
        <div><label style={LABEL_STYLE} htmlFor="lf-from">From</label><input id="lf-from" type="date" value={filters.from} onChange={set("from")} style={INPUT_STYLE} /></div>
        <div><label style={LABEL_STYLE} htmlFor="lf-to">To</label><input id="lf-to" type="date" value={filters.to} onChange={set("to")} style={INPUT_STYLE} /></div>
        <div><button type="submit" style={PRIMARY_BTN}>Apply</button></div>
      </form>
      {state.error ? <p style={{ color: "var(--color-error)", fontSize: "14px" }}>{state.error}</p> : null}
      {!state.ordered ? <p style={{ fontSize: "12px", color: "var(--color-muted)" }}>The database update for the stock ledger order is not applied yet: rows are sorted by time and only the latest page is shown.</p> : null}
      {state.loading ? <div className="animate-pulse" style={{ height: "160px", borderRadius: "14px", background: "var(--color-border)" }} /> : state.rows.length === 0 ? <Empty>No stock movement matches.</Empty> : (
        <Card>
          <Table head={["When", "Item", "Movement", "Change", "Stock after", "For", "Note"]}>
            {state.rows.map((r) => (
              <tr key={r.id}>
                <Td>{fmtDateTime(r.createdAt)}</Td>
                <Td nowrap={false}>{r.option}</Td>
                <Td><Pill tone={r.movement.tone}>{r.movement.label}</Pill>{r.bucket === "unsellable" ? <span style={{ marginLeft: "6px", color: "var(--color-error)", fontWeight: 700, fontSize: "11px" }}>not resellable</span> : null}</Td>
                <Td right mono><b style={{ color: r.change > 0 ? "var(--color-success)" : "var(--color-ink)" }}>{signed(r.change)}</b></Td>
                <Td right mono>{r.bucket === "unsellable" ? "-" : r.stockAfter ?? "-"}</Td>
                <Td mono>{r.orderId ? `#${String(r.orderId).slice(-8).toUpperCase()}` : r.refId ? String(r.refId).slice(0, 8) : ""}</Td>
                <Td nowrap={false}><span style={{ color: "var(--color-body)", fontSize: "12px" }}>{r.reason}{r.actorKind ? ` · ${r.actorKind}` : ""}</span></Td>
              </tr>
            ))}
          </Table>
          {state.next != null ? (
            <div style={{ marginTop: "10px" }}><button type="button" disabled={more} style={GHOST_BTN} onClick={() => { setMore(true); run(applied, state.next, true) }}>{more ? "Loading..." : "Older movements"}</button></div>
          ) : null}
        </Card>
      )}
    </div>
  )
}

/** the sellable counters against what the ledger says, and every place where the ledger itself has a gap */
function ReconcileTab() {
  const [onlyDrift, setOnlyDrift] = useState(true)
  const [state, setState] = useState({ loading: true, rows: [], gaps: [], error: "" })
  const load = useCallback(async () => {
    try {
      const [rows, gaps] = await Promise.all([inventoryService.reconcile(onlyDrift), inventoryService.gaps(100)])
      setState({ loading: false, rows, gaps, error: "" })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || "Could not load the reconciliation" }))
    }
  }, [onlyDrift])
  useEffect(() => { load() }, [load])
  return (
    <div className="flex flex-col" style={{ gap: "12px" }}>
      <p style={{ fontSize: "13px", color: "var(--color-body)" }}>Every sale, cancellation, return and exchange writes a row in the ledger with the stock it left behind. If a counter differs from its last ledger row, stock was changed without the ledger (a direct edit in the database, an old record). Correct it with the stock field of the product form: that is recorded as an adjustment.</p>
      <label className="flex items-center" style={{ gap: "8px", fontSize: "13px" }}><input type="checkbox" checked={onlyDrift} onChange={(e) => setOnlyDrift(e.target.checked)} /> Only show items whose stock differs from the ledger</label>
      {state.error ? <p style={{ color: "var(--color-error)", fontSize: "14px" }}>{state.error}</p> : null}
      {state.loading ? <div className="animate-pulse" style={{ height: "120px", borderRadius: "14px", background: "var(--color-border)" }} /> : (
        <>
          <Card>
            {state.rows.length === 0 ? <Empty>{onlyDrift ? "Every counter matches its ledger." : "No ledger rows yet."}</Empty> : (
              <Table head={["Item", "In stock", "Ledger says", "Difference", "Movements", "Last movement"]}>
                {state.rows.map((r) => (
                  <tr key={`${r.productId}|${r.variantId}`}>
                    <Td nowrap={false}>{r.option}</Td>
                    <Td right mono>{r.actualStock}</Td>
                    <Td right mono>{r.ledgerStock}</Td>
                    <Td><b style={{ color: r.drift === 0 ? "var(--color-success)" : "var(--color-error)" }}>{driftText(r.drift)}</b></Td>
                    <Td right mono>{r.movements}</Td>
                    <Td>{fmtDateTime(r.lastMovementAt)}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card>
            <p style={{ fontWeight: 700, fontSize: "14px", marginBottom: "6px" }}>Gaps in the ledger</p>
            {state.gaps.length === 0 ? <Empty>No gaps: every movement follows the one before it.</Empty> : (
              <Table head={["When", "Item", "Movement", "Gap"]}>
                {state.gaps.map((g) => (
                  <tr key={`${g.productId}|${g.variantId}|${g.seq}`}>
                    <Td>{fmtDateTime(g.createdAt)}</Td>
                    <Td mono nowrap={false}>{g.productId}{g.variantId ? ` / ${g.variantId}` : ""}</Td>
                    <Td><Pill tone={g.movement.tone}>{g.movement.label}</Pill> <span style={{ fontFamily: MONO }}>{signed(g.change)}</span></Td>
                    <Td nowrap={false}><span style={{ color: "var(--color-error)", fontWeight: 600 }}>{gapText(g)}</span></Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

/** units kept but NOT resellable (a damaged / defective return, a rejected parcel we hold) - they never feed the sellable counter */
function UnsellableTab() {
  const [state, setState] = useState({ loading: true, rows: [], error: "" })
  useEffect(() => {
    let alive = true
    inventoryService.unsellable().then((rows) => { if (alive) setState({ loading: false, rows, error: "" }) }).catch((err) => { if (alive) setState({ loading: false, rows: [], error: err.message || "Could not load the list" }) })
    return () => { alive = false }
  }, [])
  return (
    <div className="flex flex-col" style={{ gap: "12px" }}>
      <p style={{ fontSize: "13px", color: "var(--color-body)" }}>Returned units that were accepted or kept but cannot be sold again. They are counted here, never in the stock customers can buy.</p>
      {state.error ? <p style={{ color: "var(--color-error)", fontSize: "14px" }}>{state.error}</p> : null}
      {state.loading ? <div className="animate-pulse" style={{ height: "100px", borderRadius: "14px", background: "var(--color-border)" }} /> : state.rows.length === 0 ? <Empty>Nothing is kept as not resellable.</Empty> : (
        <Card>
          <Table head={["Item", "Units kept", "Movements", "Last movement"]}>
            {state.rows.map((r) => (
              <tr key={`${r.productId}|${r.variantId}`}><Td nowrap={false}>{r.option}</Td><Td right mono><b>{r.units}</b></Td><Td right mono>{r.movements}</Td><Td>{fmtDateTime(r.lastMovementAt)}</Td></tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  )
}

/** payments Razorpay captured whose order could not be created (the last unit sold out meanwhile): refund them in the Razorpay dashboard and record it here */
function PaymentsTab() {
  const [statusFilter, setStatusFilter] = useState("open")
  const [state, setState] = useState({ loading: true, rows: [], error: "" })
  const [prompt, setPrompt] = useState(null)             // { kind: 'refunded' | 'resolved', row }
  const load = useCallback(async () => {
    try {
      setState({ loading: false, rows: await inventoryService.paymentExceptions({ status: statusFilter || null }), error: "" })
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || "Could not load the payments" }))
    }
  }, [statusFilter])
  useEffect(() => { load() }, [load])
  return (
    <div className="flex flex-col" style={{ gap: "12px" }}>
      <p style={{ fontSize: "13px", color: "var(--color-body)" }}>When a customer pays and the last unit sells out before the order is created, the money is captured but no order exists. Refund each one in the <b>Razorpay dashboard</b> (Payments, then Refund), paste the refund id here, and the line is closed. The customer was already told a refund is coming.</p>
      <div className="flex flex-wrap" style={{ gap: "6px" }}>
        {[["open", "Needs a refund"], ["", "All"]].map(([k, label]) => (
          <button key={k || "all"} aria-pressed={statusFilter === k} onClick={() => setStatusFilter(k)} style={{ padding: "6px 14px", borderRadius: "9999px", fontSize: "13px", fontWeight: 600, cursor: "pointer", background: statusFilter === k ? "var(--color-ink)" : "var(--color-surface-muted)", color: statusFilter === k ? "var(--color-inverse)" : "var(--color-body)" }}>{label}</button>
        ))}
      </div>
      {state.error ? <p style={{ color: "var(--color-error)", fontSize: "14px" }}>{state.error}</p> : null}
      {state.loading ? <div className="animate-pulse" style={{ height: "100px", borderRadius: "14px", background: "var(--color-border)" }} /> : state.rows.length === 0 ? <Empty>{statusFilter === "open" ? "No paid order is waiting for a refund." : "No records yet."}</Empty> : (
        <div className="flex flex-col" style={{ gap: "10px" }}>
          {state.rows.map((r) => {
            const meta = paymentExceptionMeta(r.status)
            return (
              <Card key={r.id}>
                <div className="flex items-center justify-between flex-wrap" style={{ gap: "8px" }}>
                  <span style={{ fontWeight: 800, fontSize: "18px" }}>{formatMoney(r.amount)}</span>
                  <Pill tone={meta.tone}>{meta.label}</Pill>
                </div>
                <p style={{ fontSize: "12px", color: "var(--color-body)", marginTop: "4px" }}>Paid {fmtDateTime(r.createdAt)} · payment <span style={{ fontFamily: MONO }}>{r.razorpayPaymentId}</span> <CopyButton text={r.razorpayPaymentId} /> · Razorpay order <span style={{ fontFamily: MONO }}>{r.razorpayOrderId}</span></p>
                <p style={{ fontSize: "12px", color: "var(--color-body)" }}>Why: {r.reason}</p>
                {r.items.length ? <p style={{ fontSize: "12px", color: "var(--color-body)" }}>Wanted: {r.items.map((i) => `${i.title || i.productId}${i.variantId ? ` (${i.variantId})` : ""} x${i.quantity}`).join(", ")}</p> : null}
                {r.status !== "open" ? <p style={{ fontSize: "12px", color: "var(--color-ink)" }}>{r.status === "refunded" ? `Refunded: ${r.refundReference}` : `Handled: ${r.resolutionNote}`} · {fmtDateTime(r.resolvedAt)}</p> : (
                  <div className="flex flex-wrap" style={{ gap: "8px", marginTop: "10px" }}>
                    <button type="button" style={PRIMARY_BTN} onClick={() => setPrompt({ kind: "refunded", row: r })}>I refunded it in Razorpay</button>
                    <button type="button" style={GHOST_BTN} onClick={() => setPrompt({ kind: "resolved", row: r })}>Handled another way</button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
      {prompt?.kind === "refunded" ? (
        <TextPromptModal title="Record the refund" subtitle={`${formatMoney(prompt.row.amount)} · ${prompt.row.razorpayPaymentId}`} label="Razorpay refund id (rfnd_...) or the bank reference" maxLength={200} confirmLabel="Close as refunded" onClose={() => setPrompt(null)}
          onSubmit={(text) => inventoryService.resolvePaymentException(prompt.row.id, { status: "refunded", reference: text }).then(() => { toast.success("Closed as refunded"); load() })} />
      ) : null}
      {prompt?.kind === "resolved" ? (
        <TextPromptModal title="How was it handled?" subtitle={`${formatMoney(prompt.row.amount)} · ${prompt.row.razorpayPaymentId}`} label="What did you do? (e.g. created the order by hand)" maxLength={1000} confirmLabel="Close" onClose={() => setPrompt(null)}
          onSubmit={(text) => inventoryService.resolvePaymentException(prompt.row.id, { status: "resolved", note: text }).then(() => { toast.success("Closed"); load() })} />
      ) : null}
    </div>
  )
}

/**
 * Admin: stock ledger, reconciliation against it, the units kept as not resellable, and the payments that could not become an order (Phases 11-12).
 * Read-only except for closing a "paid, no order" line: stock itself only ever changes through sales, cancellations, returns, exchanges and the product form.
 */
const AdminInventoryPage = () => {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab") : "ledger"
  const [openPayments, setOpenPayments] = useState(0)
  useEffect(() => {
    let alive = true
    inventoryService.paymentExceptions({ status: "open" }).then((rows) => { if (alive) setOpenPayments(rows.length) }).catch(() => {})
    return () => { alive = false }
  }, [tab])
  const switchTab = useMemo(() => (key) => setParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", key); return next }, { replace: true }), [setParams])

  return (
    <div style={{ background: "var(--color-background)", minHeight: "100vh", fontFamily: INTER, color: "var(--color-ink)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "96px 24px 80px" }}>
        <h1 className="flex items-center" style={{ gap: "10px", fontWeight: 800, fontSize: "30px", letterSpacing: "-0.6px" }}><Boxes size={26} style={{ color: "var(--color-primary)" }} /> Inventory</h1>
        <p style={{ fontSize: "14px", color: "var(--color-body)", marginTop: "4px" }}>Every change of stock, in order. Stock only moves when an order is placed or cancelled, a return is inspected, a replacement is reserved or released, or you edit it in the product form.</p>
        <div className="flex flex-wrap items-center" style={{ gap: "8px", margin: "22px 0 16px" }} role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => switchTab(t.key)}
              style={{ padding: "10px 18px", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: "pointer", background: tab === t.key ? "var(--color-primary)" : "var(--color-surface)", color: tab === t.key ? "var(--color-inverse)" : "var(--color-ink)", border: "1px solid var(--color-border)" }}>
              {t.title}
              {t.key === "payments" && openPayments > 0 ? <span style={{ marginLeft: "8px", background: "var(--color-error)", color: "var(--color-inverse)", borderRadius: "9999px", padding: "1px 8px", fontSize: "12px" }}>{openPayments}</span> : null}
            </button>
          ))}
        </div>
        {tab === "ledger" ? <LedgerTab /> : tab === "reconcile" ? <ReconcileTab /> : tab === "unsellable" ? <UnsellableTab /> : <PaymentsTab />}
      </div>
    </div>
  )
}

export default AdminInventoryPage
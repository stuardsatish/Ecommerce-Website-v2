import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "react-toastify"
import { X } from "lucide-react"

import { supabase } from "../../context/SupabaseConfig"
import { queryOrdersWithShipments } from "../../services/shipping"
import { mapOrderRows } from "../../utils/supabaseOrders"
import CustomerHubHeader from "./CustomerHubHeader"
import CustomerEveryonePage from "./CustomerEveryonePage"
import CustomerAnalyticsPage from "./CustomerAnalyticsPage"

/* ── Pelago design tokens ── */
const FONT = "'Plus Jakarta Sans', sans-serif"


const CustomersHubPage = () => {
  const [params, setParams] = useSearchParams()
  const activeTab = params.get("view") === "analytics" ? "analytics" : "everyone"

  // Active date range filter
  const [activeDateRange, setActiveDateRange] = useState("Today")

  // Starred customers
  const [starredIds, setStarredIds] = useState(() => {
    try {
      const saved = localStorage.getItem("pelago_starred_customers")
      return saved ? JSON.parse(saved) : ["cust-demo-1", "cust-demo-2", "cust-demo-4"]
    } catch {
      return ["cust-demo-1", "cust-demo-2", "cust-demo-4"]
    }
  })

  // Data state
  const [profiles, setProfiles] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // Export handlers
  const everyoneExportRef = useRef(null)
  const analyticsExportRef = useRef(null)

  // New Customer Modal
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false)
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    subtitle: "",
    email: "",
    phone: "",
    city: "",
    channel: "Retail",
    role: "user",
  })
  const [submittingCustomer, setSubmittingCustomer] = useState(false)

  /* ── Tab Switch Handler (updates query param seamlessly) ── */
  const switchTab = useCallback((key) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      next.set("view", key)
      return next
    }, { replace: true })
  }, [setParams])

  /* ── Starred customer toggle ── */
  const toggleStar = useCallback((id, e) => {
    if (e) e.stopPropagation()
    setStarredIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      try {
        localStorage.setItem("pelago_starred_customers", JSON.stringify(next))
      } catch (err) {
        console.error("Storage error:", err)
      }
      return next
    })
  }, [])

  /* ── Fetch Real Data Once at Hub Level ── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [{ data: profilesData }, { data: rawOrdersData, error: ordersError }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        queryOrdersWithShipments(
          (select) => supabase.from("orders").select(select).order("created_at", { ascending: false }),
          { admin: true }
        ),
      ])

      if (profilesData) setProfiles(profilesData)

      if (rawOrdersData) {
        const rawOrders = mapOrderRows(rawOrdersData)
        const productIds = [...new Set(rawOrders.flatMap((o) => (o.products || []).map((p) => p.productId)).filter(Boolean))]
        let productById = {}
        if (productIds.length) {
          const { data: pRows } = await supabase.from("products").select("id, thumbnail, image, price, final_price, sale_price, mrp, variants").in("id", productIds)
          ;(pRows || []).forEach((p) => { productById[p.id] = p })
        }
        const enrichedOrders = rawOrders.map((order) => {
          const products = (order.products || []).map((item) => {
            const pd = productById[item.productId]
            const price = item.finalPrice || item.price || item.unitPrice || Number(pd?.final_price ?? pd?.sale_price ?? pd?.price ?? 0)
            const qty = Number(item.quantity) || 1
            const lineTotal = item.lineTotal || (price * qty)
            return {
              ...item,
              price,
              finalPrice: price,
              unitPrice: price,
              lineTotal,
            }
          })
          const itemsSum = products.reduce((sum, it) => sum + (it.lineTotal || 0), 0)
          const total = (order.total && order.total > 0) ? order.total : itemsSum
          return {
            ...order,
            products,
            total,
            totalAmount: total,
          }
        })
        setOrders(enrichedOrders)
      }
    } catch (err) {
      console.error("Error fetching customers/orders:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()

    // Realtime subscriptions
    const profilesChannel = supabase
      .channel("hub-customers-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchData)
      .subscribe()

    const ordersChannel = supabase
      .channel("hub-customers-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetchData)
      .subscribe()

    return () => {
      supabase.removeChannel(profilesChannel)
      supabase.removeChannel(ordersChannel)
    }
  }, [fetchData])

  /* ── Merge Database Profiles with Order Analytics ── */
  const allCustomers = useMemo(() => {
    const customersMap = {}

    // 1. Index profiles
    for (const p of profiles) {
      const email = p.email ? p.email.toLowerCase().trim() : ""
      const name = p.name || p.full_name || (email ? email.split("@")[0] : "Customer")
      const addr = p.address
      const city =
        p.city ||
        (typeof addr === "object" ? addr?.city || addr?.town : "") ||
        (typeof addr === "string" ? addr.split(",")[1]?.trim() : "") ||
        ""

      const custObj = {
        id: p.id,
        name,
        subtitle: p.subtitle || p.company || p.email || "",
        email: p.email || "",
        phone: p.phone || "",
        city,
        joinDate: p.created_at || new Date().toISOString(),
        channel: p.channel || "Retail",
        role: p.role || "user",
        status: p.status || "active",
        isStarred: starredIds.includes(p.id),
        rawProfile: p,
        orders: [],
      }

      customersMap[p.id] = custObj
      if (email) {
        customersMap[email] = custObj
      }
    }

    // 2. Attach orders and discover unprofiled customers
    for (const o of orders) {
      const uid = o.userId || o.user_id
      const email = (o.userEmail || o.customer_email || o.customerEmail || "").toLowerCase().trim()
      const name = o.userName || o.customer_name || o.customerName || (email ? email.split("@")[0] : "Customer")
      const phone = o.userPhone || o.customer_phone || o.customerPhone || ""
      const addr = o.address || o.shippingAddress || o.shipping_address || o.userAddress
      const city =
        (typeof addr === "object" ? addr?.city || addr?.town : "") ||
        (typeof addr === "string" ? addr.split(",")[1]?.trim() : "") ||
        ""

      let customer = null
      if (uid && customersMap[uid]) {
        customer = customersMap[uid]
      } else if (email && customersMap[email]) {
        customer = customersMap[email]
      }

      if (!customer) {
        const fallbackId = uid || (email ? `cust-${email}` : `cust-${o.id}`)
        customer = {
          id: fallbackId,
          name,
          subtitle: email || "Guest Customer",
          email: email || "",
          phone,
          city: city || "",
          joinDate: o.createdAt || o.created_at || new Date().toISOString(),
          channel: "Retail",
          role: "user",
          status: "active",
          isStarred: starredIds.includes(fallbackId),
          rawProfile: null,
          orders: [],
        }
        customersMap[fallbackId] = customer
        if (uid) customersMap[uid] = customer
        if (email) customersMap[email] = customer
      }

      if (!customer.phone && phone) customer.phone = phone
      if (!customer.city && city) customer.city = city
      if ((!customer.name || customer.name === "Customer") && name && name !== "Customer") customer.name = name

      if (!customer.orders.some((existing) => existing.id === o.id)) {
        customer.orders.push(o)
      }
    }

    // 3. Deduplicate and compute individual metrics
    const uniqueCustomers = Array.from(new Set(Object.values(customersMap)))

    return uniqueCustomers.map((c) => {
      const sortedOrders = [...c.orders].sort((a, b) => {
        const da = new Date(a.createdAt || a.created_at || 0).getTime()
        const db = new Date(b.createdAt || b.created_at || 0).getTime()
        return db - da
      })
      const ordersCount = sortedOrders.length
      const totalSpent = sortedOrders.reduce(
        (sum, ord) => sum + (Number(ord.total || ord.totalAmount) || 0),
        0
      )
      const lastOrder = sortedOrders[0]
        ? sortedOrders[0].createdAt || sortedOrders[0].created_at
        : null
      const aov = ordersCount > 0 ? Math.round(totalSpent / ordersCount) : 0
      const channel = c.rawProfile?.channel || (totalSpent > 25000 ? "Wholesale" : "Retail")

      return {
        ...c,
        orders: sortedOrders,
        ordersCount,
        totalSpent,
        lastOrder,
        aov,
        channel,
        isStarred: starredIds.includes(c.id),
      }
    })
  }, [profiles, orders, starredIds])

  /* ── 6 KPI Metrics + Segment Calculation ── */
  const metrics = useMemo(() => {
    const totalUsers = allCustomers.length
    const totalOrders = allCustomers.reduce((acc, c) => acc + (c.ordersCount || 0), 0)
    const totalRevenue = allCustomers.reduce((acc, c) => acc + (c.totalSpent || 0), 0)
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

    // Top spender
    const sortedBySpend = [...allCustomers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))
    const topSpender = sortedBySpend[0] || { name: "No customers yet", totalSpent: 0 }

    // Retention (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const activeUsersCount = allCustomers.filter((c) => {
      if (!c.lastOrder) return false
      return new Date(c.lastOrder).getTime() >= thirtyDaysAgo
    }).length
    const retentionPct = totalUsers > 0 ? Math.min(100, Math.round((activeUsersCount / totalUsers) * 100)) : 100

    // Segments counts & share
    const collectors = allCustomers.filter((c) => c.totalSpent >= 15000)
    const collectorsRev = collectors.reduce((acc, c) => acc + c.totalSpent, 0)
    const collectorsShare = totalRevenue > 0 ? Math.round((collectorsRev / totalRevenue) * 100) : 0

    const regulars = allCustomers.filter((c) => c.ordersCount >= 3)
    const regularsRev = regulars.reduce((acc, c) => acc + c.totalSpent, 0)
    const regularsShare = totalRevenue > 0 ? Math.round((regularsRev / totalRevenue) * 100) : 0

    const newThisMonth = allCustomers.filter((c) => {
      const d = new Date(c.joinDate).getTime()
      return d >= thirtyDaysAgo
    })

    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000
    const driftingAway = allCustomers.filter((c) => {
      if (!c.lastOrder) return false
      return new Date(c.lastOrder).getTime() < sixtyDaysAgo
    })

    const wholesale = allCustomers.filter((c) => String(c.channel || "").toLowerCase() === "wholesale")
    const wholesaleRev = wholesale.reduce((acc, c) => acc + c.totalSpent, 0)
    const wholesaleShare = totalRevenue > 0 ? Math.round((wholesaleRev / totalRevenue) * 100) : 0

    const retail = allCustomers.filter((c) => String(c.channel || "").toLowerCase() !== "wholesale")
    const retailRev = retail.reduce((acc, c) => acc + c.totalSpent, 0)
    const retailShare = totalRevenue > 0 ? Math.round((retailRev / totalRevenue) * 100) : 0

    // Today's counter
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayOrders = orders.filter((o) => new Date(o.createdAt || o.created_at || 0) >= todayStart)
    const todayCount = todayOrders.length
    const todayRev = Math.round(todayOrders.reduce((acc, o) => acc + (Number(o.total || o.totalAmount) || 0), 0) / 1000)

    return {
      totalUsers,
      totalOrders,
      totalRevenue,
      aov,
      topSpender,
      activeUsersCount,
      retentionPct,
      todayCount,
      todayRev,
      collectorsCount: collectors.length,
      collectorsShare,
      regularsCount: regulars.length,
      regularsShare,
      newMonthCount: newThisMonth.length,
      driftingCount: driftingAway.length,
      wholesaleCount: wholesale.length,
      wholesaleShare,
      wholesaleRev,
      retailCount: retail.length,
      retailShare,
      retailRev,
      maxSpend: Math.max(...allCustomers.map((c) => c.totalSpent || 0), 10000),
    }
  }, [allCustomers, orders])

  /* ── Trigger Export for Active Tab ── */
  const handleExport = useCallback(() => {
    if (activeTab === "analytics" && analyticsExportRef.current) {
      analyticsExportRef.current()
    } else if (everyoneExportRef.current) {
      everyoneExportRef.current()
    } else {
      toast.info("Preparing customer data export...")
    }
  }, [activeTab])

  /* ── Create New Customer Submit ── */
  const handleCreateCustomerSubmit = async (e) => {
    e.preventDefault()
    if (!newCustomerForm.name.trim() || !newCustomerForm.email.trim()) {
      toast.error("Name and Email are required.")
      return
    }

    setSubmittingCustomer(true)
    try {
      const newRecord = {
        name: newCustomerForm.name.trim(),
        email: newCustomerForm.email.trim(),
        phone: newCustomerForm.phone.trim(),
        city: newCustomerForm.city.trim() || "Seattle",
        channel: newCustomerForm.channel,
        role: newCustomerForm.role || "user",
        status: "active",
        created_at: new Date().toISOString(),
      }

      const { error } = await supabase.from("profiles").insert([newRecord]).select()
      if (error) throw error

      toast.success(`Customer "${newRecord.name}" created!`)
      setShowNewCustomerModal(false)
      setNewCustomerForm({
        name: "",
        subtitle: "",
        email: "",
        phone: "",
        city: "",
        channel: "Retail",
        role: "user",
      })
      fetchData()
    } catch (err) {
      console.error("Create customer error:", err)
      toast.error(`Could not create customer: ${err.message}`)
    } finally {
      setSubmittingCustomer(false)
    }
  }

  // Shared payload for child tab components
  const sharedData = useMemo(() => ({
    allCustomers,
    metrics,
    profiles,
    orders,
    starredIds,
    toggleStar,
    activeDateRange,
    refetchData: fetchData,
  }), [allCustomers, metrics, profiles, orders, starredIds, toggleStar, activeDateRange, fetchData])

  return (
    <div
      className="flex-1 w-full min-h-screen px-4 sm:px-6 md:px-8 py-5 max-w-[1440px] mx-auto text-[#1C1917]"
      style={{ fontFamily: FONT }}
    >
      {/* ── COMMON PERSISTENT HEADER: NEVER UNMOUNTS WHEN SWITCHING TABS ── */}
      <CustomerHubHeader
        activeTab={activeTab}
        onSwitchTab={switchTab}
        metrics={metrics}
        activeDateRange={activeDateRange}
        setActiveDateRange={setActiveDateRange}
        onExport={handleExport}
        onNewCustomer={() => setShowNewCustomerModal(true)}
      />

      {/* ── TAB CONTENT: ONLY TABS ALONE SWITCH (ZERO FLICKER, ZERO JUMP) ── */}
      <div className="w-full mt-6" data-purpose="customer-hub-tab-body">
        {/* Everyone Tab View */}
        <div style={{ display: activeTab === "everyone" ? "block" : "none" }}>
          <CustomerEveryonePage
            onSwitchTab={switchTab}
            showHeader={false}
            sharedData={sharedData}
            exportRef={everyoneExportRef}
            onOpenNewCustomer={() => setShowNewCustomerModal(true)}
          />
        </div>

        {/* Analytics Tab View */}
        <div style={{ display: activeTab === "analytics" ? "block" : "none" }}>
          <CustomerAnalyticsPage
            onSwitchTab={switchTab}
            showHeader={false}
            sharedData={sharedData}
            exportRef={analyticsExportRef}
            onOpenNewCustomer={() => setShowNewCustomerModal(true)}
          />
        </div>
      </div>

      {/* ── CREATE NEW CUSTOMER MODAL ── */}
      {showNewCustomerModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#D8D2C9] relative">
            <button
              onClick={() => setShowNewCustomerModal(false)}
              className="absolute top-4 right-4 text-[#78716C] hover:text-[#171412] p-1.5 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-[#171412] mb-1">Add New Customer</h3>
            <p className="text-[12.5px] text-[#78716C] mb-5">
              Create a customer record in your studio database.
            </p>

            <form onSubmit={handleCreateCustomerSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#171412] mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marcus Lindgren or Juniper Home"
                  value={newCustomerForm.name}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#D8D2C9] text-[13px] text-[#171412] focus:outline-hidden focus:border-[#0F4C4C]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#171412] mb-1">Subtitle / Company (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Buyer / Interior Stylist"
                  value={newCustomerForm.subtitle}
                  onChange={(e) => setNewCustomerForm({ ...newCustomerForm, subtitle: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#D8D2C9] text-[13px] text-[#171412] focus:outline-hidden focus:border-[#0F4C4C]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#171412] mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="marcus@example.com"
                    value={newCustomerForm.email}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C9] text-[13px] text-[#171412] focus:outline-hidden focus:border-[#0F4C4C]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#171412] mb-1">Phone</label>
                  <input
                    type="tel"
                    placeholder="+1 (206) 555-0192"
                    value={newCustomerForm.phone}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C9] text-[13px] text-[#171412] focus:outline-hidden focus:border-[#0F4C4C]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-semibold text-[#171412] mb-1">City / Region</label>
                  <input
                    type="text"
                    placeholder="Seattle"
                    value={newCustomerForm.city}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, city: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C9] text-[13px] text-[#171412] focus:outline-hidden focus:border-[#0F4C4C]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#171412] mb-1">Channel</label>
                  <select
                    value={newCustomerForm.channel}
                    onChange={(e) => setNewCustomerForm({ ...newCustomerForm, channel: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#D8D2C9] text-[13px] text-[#171412] bg-white focus:outline-hidden focus:border-[#0F4C4C]"
                  >
                    <option value="Retail">Retail</option>
                    <option value="Wholesale">Wholesale</option>
                  </select>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-[#EFECE6]">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#D8D2C9] bg-white text-[#171412] font-semibold text-[13px] hover:bg-stone-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCustomer}
                  className="px-5 py-2 rounded-xl bg-[#0F4C4C] hover:bg-[#0B3A3A] text-white font-semibold text-[13px] shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingCustomer ? "Creating..." : "Create Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default CustomersHubPage

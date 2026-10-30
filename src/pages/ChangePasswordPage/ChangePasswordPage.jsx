import { useState } from "react"
import { supabase } from "../../context/SupabaseConfig"
import { toast } from "react-toastify"
import { Eye, EyeOff, Lock, KeyRound, ShieldCheck } from "lucide-react"

/* ── Brand colour tokens ─────────────────────────────────────────── */
const TEAL      = "#104945"
const TEAL_BG   = "#E8F3F1"
const INK       = "#1C1917"
const MUTED     = "#78716C"
const BORDER    = "#E2DBD0"
const WHITE     = "#FFFFFF"
const FONT      = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

/* ── Small helpers ───────────────────────────────────────────────── */
const Card = ({ children, style = {} }) => (
  <div style={{
    background: WHITE,
    borderRadius: "20px",
    border: `1px solid ${BORDER}`,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    padding: "28px 32px",
    ...style,
  }}>
    {children}
  </div>
)

const Label = ({ children }) => (
  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: INK, marginBottom: "6px", letterSpacing: "0.01em" }}>
    {children}
  </label>
)

const PasswordInput = ({ value, onChange, placeholder, show, onToggle, disabled }) => (
  <div style={{ position: "relative" }}>
    <input
      type={show ? "text" : "password"}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: "100%", boxSizing: "border-box",
        padding: "10px 40px 10px 14px",
        borderRadius: "10px",
        border: `1px solid ${BORDER}`,
        fontSize: "14px", color: INK,
        background: disabled ? "#F9F7F4" : WHITE,
        fontFamily: FONT,
        outline: "none",
        transition: "border-color 0.15s",
      }}
      onFocus={e => { e.target.style.borderColor = TEAL }}
      onBlur={e => { e.target.style.borderColor = BORDER }}
    />
    <button
      type="button"
      onClick={onToggle}
      tabIndex={-1}
      style={{
        position: "absolute", right: "12px", top: "50%",
        transform: "translateY(-50%)",
        background: "none", border: "none", cursor: "pointer",
        color: MUTED, display: "flex", alignItems: "center",
        padding: 0,
      }}
    >
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  </div>
)

/* ── Strength meter ──────────────────────────────────────────────── */
const getStrength = (pw) => {
  if (!pw) return { score: 0, label: "", color: "transparent" }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: "Weak",   color: "#EF4444" }
  if (score <= 2) return { score, label: "Fair",   color: "#F59E0B" }
  if (score <= 3) return { score, label: "Good",   color: "#3B82F6" }
  return               { score, label: "Strong", color: "#10B981" }
}

const StrengthBar = ({ password }) => {
  const { score, label, color } = getStrength(password)
  if (!password) return null
  const bars = 4
  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {Array.from({ length: bars }).map((_, i) => (
          <div key={i} style={{
            flex: 1, height: "4px", borderRadius: "99px",
            background: i < Math.ceil(score / bars * bars)
              ? (score <= 1 ? "#EF4444" : score <= 2 ? "#F59E0B" : score <= 3 ? "#3B82F6" : "#10B981")
              : "#E7E5E4",
            transition: "background 0.2s",
          }} />
        ))}
      </div>
      <div style={{ fontSize: "11px", color: color, fontWeight: 600, marginTop: "4px" }}>{label}</div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════ */
const ChangePasswordPage = () => {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword,     setNewPassword]     = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [saving, setSaving] = useState(false)
  const [done,   setDone]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!currentPassword) {
      toast.error("Please enter your current password.")
      return
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.")
      return
    }
    if (newPassword === currentPassword) {
      toast.error("New password must be different from the current password.")
      return
    }

    setSaving(true)
    try {
      // 1. Re-authenticate with current password to confirm identity
      const { data: sessionData } = await supabase.auth.getSession()
      const email = sessionData?.session?.user?.email
      if (!email) throw new Error("No active session found. Please log in again.")

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (signInError) {
        toast.error("Current password is incorrect.")
        setSaving(false)
        return
      }

      // 2. Update to the new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (updateError) throw updateError

      toast.success("Password changed successfully!")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setDone(true)
    } catch (err) {
      console.error("Change password error:", err)
      toast.error(err?.message || "Failed to change password. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setDone(false)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
  }

  return (
    <div style={{ padding: "28px 24px", fontFamily: FONT, maxWidth: "520px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "10px",
            background: TEAL_BG, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Lock size={18} color={TEAL} />
          </div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: INK, margin: 0, letterSpacing: "-0.5px" }}>
            Change Password
          </h1>
        </div>
        <p style={{ fontSize: "13px", color: MUTED, margin: "0 0 0 46px" }}>
          Update your admin account password
        </p>
      </div>

      {/* Success state */}
      {done ? (
        <Card>
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{
              width: "56px", height: "56px", borderRadius: "50%",
              background: "#D1FAE5", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 16px",
            }}>
              <ShieldCheck size={28} color="#059669" />
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: INK, marginBottom: "6px" }}>
              Password Updated!
            </div>
            <div style={{ fontSize: "13px", color: MUTED, marginBottom: "24px" }}>
              Your password has been changed successfully.
            </div>
            <button
              onClick={handleReset}
              style={{
                padding: "9px 24px", borderRadius: "10px",
                background: TEAL, color: WHITE, border: "none",
                fontSize: "13px", fontWeight: 700, cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Change Again
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Current password */}
            <div>
              <Label>Current Password</Label>
              <PasswordInput
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                show={showCurrent}
                onToggle={() => setShowCurrent(v => !v)}
                disabled={saving}
              />
            </div>

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${BORDER}`, margin: "0 -8px" }} />

            {/* New password */}
            <div>
              <Label>New Password</Label>
              <PasswordInput
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                show={showNew}
                onToggle={() => setShowNew(v => !v)}
                disabled={saving}
              />
              <StrengthBar password={newPassword} />
            </div>

            {/* Confirm password */}
            <div>
              <Label>Confirm New Password</Label>
              <PasswordInput
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                show={showConfirm}
                onToggle={() => setShowConfirm(v => !v)}
                disabled={saving}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <div style={{ fontSize: "11px", color: "#EF4444", marginTop: "5px", fontWeight: 600 }}>
                  Passwords do not match
                </div>
              )}
              {confirmPassword && newPassword === confirmPassword && newPassword.length >= 8 && (
                <div style={{ fontSize: "11px", color: "#10B981", marginTop: "5px", fontWeight: 600 }}>
                  ✓ Passwords match
                </div>
              )}
            </div>

            {/* Tips */}
            <div style={{
              background: "#F9F7F4", borderRadius: "10px",
              padding: "12px 14px", fontSize: "12px", color: MUTED, lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, color: INK, marginBottom: "4px" }}>💡 Password tips</div>
              <ul style={{ margin: 0, paddingLeft: "16px" }}>
                <li>At least 8 characters</li>
                <li>Mix uppercase &amp; lowercase letters</li>
                <li>Include numbers and symbols</li>
                <li>Don't reuse recent passwords</li>
              </ul>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={saving || !currentPassword || !newPassword || !confirmPassword}
              style={{
                padding: "11px 20px", borderRadius: "12px",
                background: saving || !currentPassword || !newPassword || !confirmPassword
                  ? "#D1C9C0" : TEAL,
                color: WHITE, border: "none",
                fontSize: "14px", fontWeight: 700, cursor: saving ? "wait" : "pointer",
                fontFamily: FONT,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                transition: "background 0.15s",
              }}
            >
              <KeyRound size={16} />
              {saving ? "Updating Password…" : "Update Password"}
            </button>
          </form>
        </Card>
      )}
    </div>
  )
}

export default ChangePasswordPage

